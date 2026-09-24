"""Season-to-date advanced stats from nflverse, for every fantasy-relevant player.

Writes site/data/advanced.js: one row per player keyed by Sleeper id, plus one
row per team, plus a column dictionary the UI renders from. Everything here is
public and key-free (github.com/nflverse/nflverse-data releases).

What it joins, and on what:
  pbp            play_by_play_{season}   gsis ids on every play
  stats_player   stats_player_week       gsis (player_id)
  snap_counts    snap_counts             pfr_player_id  -> roster.pfr_id
  pfr_advstats   advstats_week_*         pfr_player_id  -> roster.pfr_id
  nextgen_stats  ngs_*                   player_gsis_id
  espn qbr       qbr_week_level          espn player_id -> roster.espn_id
  injuries       injuries                gsis_id
  depth_charts   depth_charts            gsis_id
  rosters        roster_{season}         carries sleeper_id, the key the site uses

Two numbers are ESTIMATES and are labelled that way everywhere they surface:

  * Routes run. nflverse participation (the only public per-play route data)
    ends with 2025, so routes = offensive snaps x the team's dropback share of
    plays that game. It over-counts players who block on passing downs, mostly
    TEs and pass-protecting backs, which is why TPRR / YPRR carry "(est)".
  * Expected fantasy points. For every target and carry, the league-average
    PPR points of plays like it (air-yard band x field-position band for
    targets, field-position band x down for carries), from 2025 plus the
    current season. FPOE = actual PPR minus that. It is a transparent baseline,
    not a vendor model.

    python projections/build_nflverse_suite.py
    python projections/build_nflverse_suite.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "projections" / "nflverse-cache"
OUT = ROOT / "site" / "data" / "advanced.js"
OUT_WRITTEN = OUT
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
MAX_AGE_H = 6.0
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def fetch(tag: str, name: str, max_age_h: float = MAX_AGE_H) -> pathlib.Path:
    """Cached download. A failed refresh keeps the copy on disk and says so."""
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    fresh = p.exists() and (time.time() - p.stat().st_mtime) / 3600 < max_age_h
    if not fresh:
        try:
            req = urllib.request.Request(f"{BASE}/{tag}/{name}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                tmp = p.with_suffix(".part")
                tmp.write_bytes(r.read())
                tmp.replace(p)
        except Exception as e:
            if not p.exists():
                raise SystemExit(f"{name}: download failed and no cached copy ({e})")
            age = (time.time() - p.stat().st_mtime) / 3600
            print(f"  {name}: refresh failed ({e}); using the {age:.0f}h-old copy")
    return p


FINISHED_SEASON_AGE_H = 24 * 365


def read(tag: str, name: str) -> pd.DataFrame:
    past = any(str(y) in name for y in range(1999, season_now()))
    return pd.read_parquet(fetch(tag, name, FINISHED_SEASON_AGE_H if past else MAX_AGE_H))


def optional(label: str, fn):
    """A join that is nice to have. nflverse changed the depth-chart and
    injury schemas between seasons, so a past season must not fail the whole
    build over a status column; it gets skipped and named instead."""
    try:
        return fn()
    except Exception as e:
        print(f"  {label}: skipped ({type(e).__name__}: {e})")
        return pd.DataFrame()


def num(x):
    """JSON-safe number: NaN/inf become None, floats rounded for payload size."""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return int(f) if f.is_integer() and abs(f) < 1e9 else round(f, 4)


def safe_div(a, b):
    return np.where(np.asarray(b, dtype=float) > 0, np.asarray(a, dtype=float) / np.where(np.asarray(b, dtype=float) > 0, b, 1), np.nan)


# --------------------------------------------------------------------------
# Expected fantasy points
# --------------------------------------------------------------------------
AIR_BINS = [-100, 0, 5, 10, 15, 20, 30, 100]
YL_BINS = [0, 5, 10, 20, 40, 60, 80, 100]


def ppr_points(df: pd.DataFrame) -> pd.Series:
    """PPR points a play produced for its ball-carrier or target."""
    rec = df["complete_pass"].fillna(0) * (1 + df["receiving_yards"].fillna(0) * 0.1
                                            + df["pass_touchdown"].fillna(0) * 6)
    rush = df["rushing_yards"].fillna(0) * 0.1 + df["rush_touchdown"].fillna(0) * 6
    fum = -2 * df["fumble_lost"].fillna(0)
    is_t = df["receiver_player_id"].notna() & (df["pass_attempt"] == 1)
    is_r = df["rusher_player_id"].notna() & (df["rush_attempt"] == 1)
    return np.where(is_t, rec, 0) + np.where(is_r, rush, 0) + np.where(is_t | is_r, fum, 0)


def xfp_tables(pbp: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    d = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"])].copy()
    d["pts"] = ppr_points(d)
    d["yl"] = pd.cut(d["yardline_100"], YL_BINS, labels=False, include_lowest=True)
    t = d[d["receiver_player_id"].notna() & (d["pass_attempt"] == 1)].copy()
    t["ab"] = pd.cut(t["air_yards"].fillna(0), AIR_BINS, labels=False, include_lowest=True)
    r = d[d["rusher_player_id"].notna() & (d["rush_attempt"] == 1)].copy()
    return (t.groupby(["ab", "yl"])["pts"].mean(),
            r.groupby(["yl", "down"])["pts"].mean())


def apply_xfp(plays: pd.DataFrame, tgt_tab: pd.Series, rush_tab: pd.Series) -> pd.DataFrame:
    p = plays.copy()
    p["yl"] = pd.cut(p["yardline_100"], YL_BINS, labels=False, include_lowest=True)
    p["ab"] = pd.cut(p["air_yards"].fillna(0), AIR_BINS, labels=False, include_lowest=True)
    is_t = p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)
    is_r = p["rusher_player_id"].notna() & (p["rush_attempt"] == 1)
    tx = pd.Series(list(zip(p["ab"], p["yl"]))).map(tgt_tab.to_dict()).to_numpy()
    rx = pd.Series(list(zip(p["yl"], p["down"]))).map(rush_tab.to_dict()).to_numpy()
    p["xfp"] = np.where(is_t, tx, np.where(is_r, rx, np.nan))
    p["pts"] = ppr_points(p)
    return p


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------
def neutral(p: pd.DataFrame) -> pd.Series:
    """Win probability 20-80% and outside the last two minutes of each half."""
    return p["wp"].between(0.2, 0.8) & (p["half_seconds_remaining"] > 120)


def team_table(pbp: pd.DataFrame) -> pd.DataFrame:
    p = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"]) & pbp["posteam"].notna()]
    g = p.groupby("posteam")
    games = g["game_id"].nunique()
    n = p[neutral(p)]
    gn = n.groupby("posteam")
    # Seconds of game clock per snap, neutral only: the usual pace measure,
    # because trailing teams hurry and leading teams bleed clock.
    n_sorted = n.sort_values(["game_id", "posteam", "game_seconds_remaining"], ascending=[True, True, False])
    n_sorted = n_sorted.assign(gap=n_sorted.groupby(["game_id", "posteam"])["game_seconds_remaining"].diff(-1))
    pace = n_sorted[(n_sorted["gap"] > 0) & (n_sorted["gap"] < 60)].groupby("posteam")["gap"].mean()
    rz = p[p["yardline_100"] <= 20]
    out = pd.DataFrame({
        "games": games,
        "plays_pg": g.size() / games,
        "pass_rate": g["pass_attempt"].mean(),
        "neutral_pass_rate": gn["pass_attempt"].mean(),
        "proe": gn["pass_oe"].mean() / 100.0,
        "sec_per_play_neutral": pace,
        "epa_play": g["epa"].mean(),
        "epa_pass": p[p["pass_attempt"] == 1].groupby("posteam")["epa"].mean(),
        "epa_rush": p[p["rush_attempt"] == 1].groupby("posteam")["epa"].mean(),
        "success_rate": g["success"].mean(),
        "rz_plays_pg": rz.groupby("posteam").size() / games,
        "rz_td_rate": rz.groupby("posteam")["touchdown"].mean(),
        "dropbacks": p[p["qb_dropback"] == 1].groupby("posteam").size(),
        "pass_targets": p[p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)].groupby("posteam").size(),
        "carries": p[p["rush_attempt"] == 1].groupby("posteam").size(),
    })
    d = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"]) & pbp["defteam"].notna()]
    out["def_epa_play"] = d.groupby("defteam")["epa"].mean()
    out["def_success_rate"] = d.groupby("defteam")["success"].mean()
    return out


def player_table(season: int) -> tuple[pd.DataFrame, dict, pd.DataFrame]:
    roster = read("rosters", f"roster_{season}.parquet")
    roster = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    roster = roster[roster["position"].isin(SKILL) & roster["gsis_id"].notna()]

    pbp_now = read("pbp", f"play_by_play_{season}.parquet")
    pbp_prev = read("pbp", f"play_by_play_{season - 1}.parquet")
    tgt_tab, rush_tab = xfp_tables(pd.concat([pbp_prev, pbp_now], ignore_index=True))

    p = pbp_now[(pbp_now["season_type"] == "REG") & pbp_now["play_type"].isin(["pass", "run"])].copy()
    p = apply_xfp(p, tgt_tab, rush_tab)
    through = int(p["week"].max()) if len(p) else 0
    teams = team_table(pbp_now)

    # ---- FTN charting: the scheme metrics analysts cite most ----
    # Play action, motion, under center and first-read targets are what the
    # Beyond the Box Score shows lean on hardest, and FTN is the only public
    # source for them. Joined per play onto pbp, so they share its filters.
    ftn = optional("FTN charting", lambda: read("ftn_charting", f"ftn_charting_{season}.parquet"))
    if ftn.empty:
        ftn = pd.DataFrame(columns=["nflverse_game_id", "nflverse_play_id", "is_play_action", "is_motion",
                                    "is_no_huddle", "is_screen_pass", "is_rpo", "qb_location", "read_thrown",
                                    "is_catchable_ball", "is_contested_ball", "is_qb_out_of_pocket",
                                    "n_defense_box"])
    ftn = ftn.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
    ftn["play_id"] = ftn["play_id"].astype(float)
    fcols = ["is_play_action", "is_motion", "is_no_huddle", "is_screen_pass", "is_rpo",
             "qb_location", "read_thrown", "is_catchable_ball", "is_contested_ball",
             "is_qb_out_of_pocket", "n_defense_box"]
    p = p.merge(ftn[["game_id", "play_id"] + fcols], on=["game_id", "play_id"], how="left")
    for c in ("is_play_action", "is_motion", "is_no_huddle", "is_screen_pass", "is_rpo",
              "is_catchable_ball", "is_contested_ball", "is_qb_out_of_pocket"):
        p[c] = p[c].astype("float")
    charted = p["qb_location"].isin(["S", "U", "P"])
    p["under_center"] = np.where(charted, (p["qb_location"] == "U").astype(float), np.nan)
    has_read = p["read_thrown"].isin(["1", "2", "CHK", "SD", "DES"])
    p["first_read"] = np.where(has_read, (p["read_thrown"] == "1").astype(float), np.nan)

    db = p[p["qb_dropback"] == 1]
    att = p[p["pass_attempt"] == 1]
    teams["play_action_rate"] = db.groupby("posteam")["is_play_action"].mean()
    teams["pa_epa"] = db[db["is_play_action"] == 1].groupby("posteam")["epa"].mean()
    teams["motion_rate"] = p.groupby("posteam")["is_motion"].mean()
    teams["under_center_rate"] = p.groupby("posteam")["under_center"].mean()
    teams["no_huddle_rate"] = p.groupby("posteam")["is_no_huddle"].mean()
    teams["screen_rate"] = att.groupby("posteam")["is_screen_pass"].mean()
    teams["rpo_rate"] = p.groupby("posteam")["is_rpo"].mean()
    ed = p[p["down"].isin([1, 2])]
    teams["early_down_success"] = ed.groupby("posteam")["success"].mean()
    teams["early_down_pass_rate"] = ed[neutral(ed)].groupby("posteam")["pass_attempt"].mean()

    # ---- receiving ----
    t = p[p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)]
    rz = t["yardline_100"] <= 20
    ez = t["air_yards"].fillna(-99) >= t["yardline_100"]
    rec = t.groupby("receiver_player_id").agg(
        targets=("play_id", "size"),
        rec=("complete_pass", "sum"),
        rec_yds=("receiving_yards", "sum"),
        rec_td=("pass_touchdown", "sum"),
        air_yds=("air_yards", "sum"),
        rec_epa=("epa", "sum"),
        rec_first=("first_down", "sum"),
        rec_team=("posteam", "last"),
        xfp_rec=("xfp", "sum"),
        pts_rec=("pts", "sum"),
        rec_yac=("yards_after_catch", "sum"),
    )
    rec["rz_targets"] = t[rz].groupby("receiver_player_id").size()
    rec["ez_targets"] = t[ez].groupby("receiver_player_id").size()
    rec["deep_targets"] = t[t["air_yards"] >= 20].groupby("receiver_player_id").size()
    team_tgts = t.groupby("posteam").size()
    team_air = t.groupby("posteam")["air_yards"].sum()
    team_rz_t = t[rz].groupby("posteam").size()
    rec["target_share"] = rec["targets"] / rec["rec_team"].map(team_tgts)
    rec["air_share"] = rec["air_yds"] / rec["rec_team"].map(team_air)
    rec["rz_target_share"] = rec["rz_targets"].fillna(0) / rec["rec_team"].map(team_rz_t)
    rec["adot"] = rec["air_yds"] / rec["targets"]
    rec["wopr"] = 1.5 * rec["target_share"] + 0.7 * rec["air_share"]
    rec["racr"] = rec["rec_yds"] / rec["air_yds"].where(rec["air_yds"] > 0)
    rec["catch_rate"] = rec["rec"] / rec["targets"]
    rec["epa_per_target"] = rec["rec_epa"] / rec["targets"]
    rec["yds_per_target"] = rec["rec_yds"] / rec["targets"]
    rec["yac_per_rec"] = rec["rec_yac"] / rec["rec"].where(rec["rec"] > 0)
    rec["first_down_share"] = rec["rec_first"] / rec["rec_team"].map(t.groupby("posteam")["first_down"].sum())
    fr = t[t["first_read"] == 1]
    rec["first_read_targets"] = fr.groupby("receiver_player_id").size()
    rec["first_read_share"] = rec["first_read_targets"] / rec["rec_team"].map(fr.groupby("posteam").size())
    rec["first_read_rate"] = t.groupby("receiver_player_id")["first_read"].mean()
    rec["contested_rate"] = t.groupby("receiver_player_id")["is_contested_ball"].mean()
    rec["catchable_rate"] = t.groupby("receiver_player_id")["is_catchable_ball"].mean()

    # ---- rushing ----
    r = p[p["rusher_player_id"].notna() & (p["rush_attempt"] == 1)]
    rush = r.groupby("rusher_player_id").agg(
        carries=("play_id", "size"),
        rush_yds=("rushing_yards", "sum"),
        rush_td=("rush_touchdown", "sum"),
        rush_epa=("epa", "sum"),
        rush_success=("success", "mean"),
        rush_team=("posteam", "last"),
        xfp_rush=("xfp", "sum"),
        pts_rush=("pts", "sum"),
        explosive_runs=("rushing_yards", lambda s: int((s >= 10).sum())),
    )
    rush["rz_carries"] = r[r["yardline_100"] <= 20].groupby("rusher_player_id").size()
    rush["gl_carries"] = r[r["yardline_100"] <= 5].groupby("rusher_player_id").size()
    rush["inside10_carries"] = r[r["yardline_100"] <= 10].groupby("rusher_player_id").size()
    team_car = r.groupby("posteam").size()
    team_gl = r[r["yardline_100"] <= 5].groupby("posteam").size()
    rush["rush_share"] = rush["carries"] / rush["rush_team"].map(team_car)
    rush["gl_share"] = rush["gl_carries"].fillna(0) / rush["rush_team"].map(team_gl)
    rush["ypc"] = rush["rush_yds"] / rush["carries"]
    rush["epa_per_rush"] = rush["rush_epa"] / rush["carries"]

    # ---- passing ----
    q = p[p["passer_player_id"].notna() & (p["qb_dropback"] == 1)]
    pas = q.groupby("passer_player_id").agg(
        dropbacks=("play_id", "size"),
        pass_att=("pass_attempt", "sum"),
        cmp=("complete_pass", "sum"),
        pass_yds=("passing_yards", "sum"),
        pass_td=("pass_touchdown", "sum"),
        ints=("interception", "sum"),
        sacks=("sack", "sum"),
        scrambles=("qb_scramble", "sum"),
        db_epa=("epa", "mean"),
        cpoe=("cpoe", "mean"),
        pass_success=("success", "mean"),
        pass_air=("air_yards", "sum"),
    )
    pas["sack_rate"] = pas["sacks"] / pas["dropbacks"]
    pas["scramble_rate"] = pas["scrambles"] / pas["dropbacks"]
    pas["pass_adot"] = pas["pass_air"] / pas["pass_att"]
    pas["ypa"] = pas["pass_yds"] / pas["pass_att"]
    designed = r[r["qb_scramble"] != 1].groupby("rusher_player_id").size()
    pas["designed_runs"] = designed
    qa = q[q["pass_attempt"] == 1]
    pas["qb_play_action_rate"] = q.groupby("passer_player_id")["is_play_action"].mean()
    pas["qb_under_center_rate"] = q.groupby("passer_player_id")["under_center"].mean()
    pas["qb_first_read_rate"] = qa.groupby("passer_player_id")["first_read"].mean()
    pas["out_of_pocket_rate"] = q.groupby("passer_player_id")["is_qb_out_of_pocket"].mean()
    pas["catchable_throw_rate"] = qa.groupby("passer_player_id")["is_catchable_ball"].mean()

    # ---- snaps and estimated routes ----
    snaps = read("snap_counts", f"snap_counts_{season}.parquet")
    snaps = snaps[snaps["game_type"] == "REG"]
    pfr_to_gsis = roster.dropna(subset=["pfr_id"]).set_index("pfr_id")["gsis_id"].to_dict()
    snaps["gsis_id"] = snaps["pfr_player_id"].map(pfr_to_gsis)
    game_db = p[p["qb_dropback"] == 1].groupby(["game_id", "posteam"]).size()
    game_plays = p.groupby(["game_id", "posteam"]).size()
    db_share = (game_db / game_plays).rename("db_share").reset_index()
    pfr_game = pbp_now[["game_id", "old_game_id"]].drop_duplicates() if "old_game_id" in pbp_now.columns else None
    snaps = snaps.merge(db_share.rename(columns={"posteam": "team"}), on=["game_id", "team"], how="left")
    snaps["routes_est"] = snaps["offense_snaps"] * snaps["db_share"]
    sn = snaps.dropna(subset=["gsis_id"]).groupby("gsis_id").agg(
        games=("game_id", "nunique"),
        off_snaps=("offense_snaps", "sum"),
        snap_pct=("offense_pct", "mean"),
        routes_est=("routes_est", "sum"),
    )

    # ---- NGS (season rows are week 0) ----
    def ngs(name, cols):
        d = read("nextgen_stats", name)
        d = d[(d["season"] == season) & (d["season_type"] == "REG") & (d["week"] == 0)]
        return d.set_index("player_gsis_id")[cols]
    ngs_rec = ngs("ngs_receiving.parquet", ["avg_separation", "avg_cushion", "avg_yac_above_expectation",
                                            "percent_share_of_intended_air_yards"])
    ngs_rush = ngs("ngs_rushing.parquet", ["rush_yards_over_expected", "rush_yards_over_expected_per_att",
                                           "rush_pct_over_expected", "percent_attempts_gte_eight_defenders",
                                           "efficiency", "avg_time_to_los"])
    ngs_pass = ngs("ngs_passing.parquet", ["avg_time_to_throw", "aggressiveness", "avg_intended_air_yards",
                                           "completion_percentage_above_expectation", "avg_air_yards_to_sticks"])

    # ---- PFR advanced ----
    def pfr(name, agg):
        d = read("pfr_advstats", name)
        d = d[d["game_type"] == "REG"].copy()
        d["gsis_id"] = d["pfr_player_id"].map(pfr_to_gsis)
        return d.dropna(subset=["gsis_id"]).groupby("gsis_id").agg(**agg)
    pfr_rec = pfr(f"advstats_week_rec_{season}.parquet", dict(
        drops=("receiving_drop", "sum"), rec_broken_tackles=("receiving_broken_tackles", "sum")))
    pfr_rush = pfr(f"advstats_week_rush_{season}.parquet", dict(
        ybc=("rushing_yards_before_contact", "sum"), yac_rush=("rushing_yards_after_contact", "sum"),
        rush_broken_tackles=("rushing_broken_tackles", "sum"), pfr_carries=("carries", "sum")))
    pfr_pass = pfr(f"advstats_week_pass_{season}.parquet", dict(
        pressured=("times_pressured", "sum"), blitzed=("times_blitzed", "sum"),
        bad_throws=("passing_bad_throws", "sum"), pass_drops=("passing_drops", "sum")))

    # ---- QBR ----
    def _qbr():
        q = read("espn_data", "qbr_week_level.parquet")
        q = q[(q["season"] == season) & (q["season_type"] == "Regular")].copy()
        espn_to_gsis = roster.dropna(subset=["espn_id"]).assign(espn_id=lambda d: d["espn_id"].astype(str)) \
            .set_index("espn_id")["gsis_id"].to_dict()
        q["gsis_id"] = q["player_id"].astype(str).map(espn_to_gsis)
        return q.dropna(subset=["gsis_id"]).groupby("gsis_id").apply(
            lambda d: np.average(d["qbr_total"], weights=d["qb_plays"].clip(lower=1)), include_groups=False
        ).rename("qbr").to_frame()
    qbr_s = optional("ESPN QBR", _qbr)

    # ---- injuries and depth ----
    def _inj():
        d = read("injuries", f"injuries_{season}.parquet")
        d = d[d["season_type"] == "REG"].sort_values("week").drop_duplicates("gsis_id", keep="last")
        return d.set_index("gsis_id")[["week", "report_status", "report_primary_injury", "practice_status"]] \
            .rename(columns={"week": "inj_week"})

    def _depth():
        d = read("depth_charts", f"depth_charts_{season}.parquet")
        d = d[d["pos_abb"].isin(SKILL)]
        last_dt = d.groupby("team")["dt"].transform("max")
        d = d[d["dt"] == last_dt].sort_values("pos_rank").drop_duplicates("gsis_id")
        return d.set_index("gsis_id")[["pos_rank"]].rename(columns={"pos_rank": "depth"})

    inj = optional("injuries", _inj)
    depth = optional("depth charts", _depth)

    # ---- assemble ----
    df = roster.set_index("gsis_id")[["sleeper_id", "full_name", "position", "team", "years_exp"]]
    for part in (sn, rec, rush, pas, ngs_rec, ngs_rush, ngs_pass, pfr_rec, pfr_rush, pfr_pass,
                 qbr_s, inj, depth):
        df = df.join(part, how="left")
    df = df.copy()  # dozens of joins leave pandas fragmented

    # A count that never happened is 0, not unknown. Without this a receiver
    # with no red-zone targets shows a blank, which reads as missing data.
    has_t, has_r = df["targets"].fillna(0) > 0, df["carries"].fillna(0) > 0
    for k in ("rz_targets", "ez_targets", "deep_targets", "drops", "rec_broken_tackles", "first_read_targets"):
        df.loc[has_t, k] = df.loc[has_t, k].fillna(0)
    for k in ("rz_carries", "gl_carries", "inside10_carries", "explosive_runs", "rush_broken_tackles"):
        df.loc[has_r, k] = df.loc[has_r, k].fillna(0)
    df.loc[has_t, "rz_target_share"] = df.loc[has_t, "rz_target_share"].fillna(0)
    df.loc[has_t, "first_read_share"] = df.loc[has_t, "first_read_share"].fillna(0)
    df.loc[has_r, "gl_share"] = df.loc[has_r, "gl_share"].fillna(0)

    df["xfp"] = df[["xfp_rec", "xfp_rush"]].sum(axis=1, min_count=1)
    df["ppr_pts_opp"] = df[["pts_rec", "pts_rush"]].sum(axis=1, min_count=1)
    df["fpoe"] = df["ppr_pts_opp"] - df["xfp"]
    g = df["games"]
    df["xfp_pg"] = df["xfp"] / g
    df["fpoe_pg"] = df["fpoe"] / g
    # Calibrated against 2025, the last season with public participation data:
    # on-field dropbacks divided by this estimate, median by position and snap
    # share. WRs need nothing (1.01x, r=0.99). TEs and RBs are overcounted
    # because the estimate cannot tell a route from a block, worst for
    # part-time tight ends. These are upper bounds, so the true correction for
    # blocking-heavy players is a little larger still.
    snap = df["snap_pct"].fillna(0)
    te_mult = np.where(snap >= 0.75, 0.98, np.where(snap >= 0.5, 0.89, 0.81))
    mult = np.where(df["position"] == "TE", te_mult, np.where(df["position"] == "RB", 0.94, 1.0))
    df["routes_est"] = df["routes_est"] * mult
    df["route_rate_est"] = df["routes_est"] / df["team"].map(teams["dropbacks"])
    df["tprr_est"] = df["targets"] / df["routes_est"].where(df["routes_est"] >= 5)
    df["yprr_est"] = df["rec_yds"] / df["routes_est"].where(df["routes_est"] >= 5)
    df["fprr_est"] = df["pts_rec"] / df["routes_est"].where(df["routes_est"] >= 5)
    df["explosive_run_rate"] = df["explosive_runs"] / df["carries"].where(df["carries"] >= 5)
    df["drop_rate"] = df["drops"] / df["targets"]
    df["ybc_per_att"] = df["ybc"] / df["pfr_carries"]
    df["yac_per_att"] = df["yac_rush"] / df["pfr_carries"]
    df["hv_touches"] = df["targets"].fillna(0) + df["inside10_carries"].fillna(0)
    df["opportunities"] = df["targets"].fillna(0) + df["carries"].fillna(0)
    rz_opp = (p["yardline_100"] <= 20) & (((p["receiver_player_id"].notna()) & (p["pass_attempt"] == 1))
                                           | ((p["rusher_player_id"].notna()) & (p["rush_attempt"] == 1)))
    team_rz_opps = p[rz_opp].groupby("posteam").size()
    team_opps = (teams["pass_targets"].fillna(0) + teams["carries"].fillna(0))
    df["rz_opps"] = df["rz_targets"].fillna(0) + df["rz_carries"].fillna(0)
    df["rz_opp_share"] = df["rz_opps"] / df["team"].map(team_rz_opps)
    df["touch_share"] = df["opportunities"] / df["team"].map(team_opps)
    touches = df["rec"].fillna(0) + df["carries"].fillna(0)
    df["bt_per_touch"] = (df["rush_broken_tackles"].fillna(0) + df["rec_broken_tackles"].fillna(0)) / touches.where(touches >= 5)
    df["pressure_rate"] = df["pressured"] / df["dropbacks"]
    df["bad_throw_rate"] = df["bad_throws"] / df["pass_att"]

    df = df.copy()
    # ---- weekly game log, for the player card ----
    wk = read("stats_player", f"stats_player_week_{season}.parquet")
    wk = wk[wk["season_type"] == "REG"]
    snap_wk = snaps.dropna(subset=["gsis_id"]).set_index(["gsis_id", "week"])["offense_pct"]
    logs = {}
    for r in wk.itertuples(index=False):
        sp = snap_wk.get((r.player_id, r.week))
        logs.setdefault(r.player_id, []).append([
            int(r.week), TEAM_FIX.get(r.opponent_team, r.opponent_team),
            num(sp), num(r.targets), num(r.receptions), num(r.receiving_yards), num(r.receiving_tds),
            num(r.carries), num(r.rushing_yards), num(r.rushing_tds),
            num(r.attempts), num(r.passing_yards), num(r.passing_tds), num(r.passing_interceptions),
            num(r.fantasy_points_ppr)])
    df["_log"] = df.index.map(lambda g: sorted(logs.get(g, [])))

    keep = df[(df["opportunities"] > 0) | (df["dropbacks"].fillna(0) > 0) | (df["off_snaps"].fillna(0) > 0)]
    keep = keep[keep["sleeper_id"].notna()]
    return keep, {"through_week": through}, teams


# --------------------------------------------------------------------------
# Column dictionary: the UI renders from this, so labels live in one place.
# --------------------------------------------------------------------------
C = lambda key, label, group, pos, fmt, desc, lower_better=False: dict(
    key=key, label=label, group=group, pos=pos, fmt=fmt, desc=desc, lowerBetter=lower_better)
REC = ["WR", "TE", "RB"]
RUSH = ["RB", "QB"]
COLUMNS = [
    C("games", "G", "Usage", SKILL, "int", "Games with an offensive snap."),
    C("snap_pct", "Snap%", "Usage", SKILL, "pct", "Average share of offensive snaps. Beyond the Box Score benchmark: 80%+ is a bell-cow back."),
    C("route_rate_est", "Route% (est)", "Usage", REC, "pct", "Estimated routes over team dropbacks. Snaps x the team's dropback share of plays each game, because public route data ends in 2025, then calibrated on 2025 participation (TEs 0.81-0.98x by snap share, RBs 0.94x, WRs unchanged). Benchmark cited on the show: 65-70%+ is an every-down receiver."),
    C("targets", "Tgt", "Usage", REC, "int", "Targets."),
    C("target_share", "Tgt%", "Usage", REC, "pct", "Share of the team's targets. Benchmark cited on the show: 28%+ is elite."),
    C("touch_share", "Touch%", "Usage", ["RB"], "pct", "Targets plus carries over the team's targets plus carries."),
    C("air_share", "Air%", "Usage", REC, "pct", "Share of the team's air yards."),
    C("first_down_share", "1D%", "Usage", REC, "pct", "Share of the team's receiving first downs: the chain-mover role."),
    C("wopr", "WOPR", "Usage", REC, "dec2", "Weighted opportunity: 1.5 x target share + 0.7 x air share."),
    C("carries", "Car", "Usage", RUSH, "int", "Carries."),
    C("rush_share", "Rush%", "Usage", RUSH, "pct", "Share of the team's carries."),
    C("opportunities", "Opps", "Usage", ["RB"], "int", "Targets plus carries."),
    C("hv_touches", "HV touches", "Usage", ["RB"], "int", "High-value touches: targets plus carries inside the 10."),
    C("tprr_est", "TPRR (est)", "Efficiency", REC, "dec2", "Targets per estimated route run. Benchmark cited on the show: 0.26-0.28+ is elite."),
    C("yprr_est", "YPRR (est)", "Efficiency", REC, "dec2", "Receiving yards per estimated route run."),
    C("fprr_est", "FP/RR (est)", "Efficiency", REC, "dec2", "PPR points from receiving per estimated route run."),
    C("yds_per_target", "Y/Tgt", "Efficiency", REC, "dec1", "Receiving yards per target."),
    C("catch_rate", "Catch%", "Efficiency", REC, "pct", "Receptions over targets."),
    C("epa_per_target", "EPA/Tgt", "Efficiency", REC, "dec2", "Expected points added per target."),
    C("racr", "RACR", "Efficiency", REC, "dec2", "Receiving yards per air yard."),
    C("drop_rate", "Drop%", "Efficiency", REC, "pct", "PFR-charted drops per target.", True),
    C("catchable_rate", "Catchable%", "Efficiency", REC, "pct", "Share of his targets FTN charted as catchable. Low means the quarterback is costing him. Cited on the show: high 80s is elite, under 60% is a concern."),
    C("yac_per_rec", "YAC/rec", "Efficiency", REC, "dec1", "Yards after the catch per reception."),
    C("contested_rate", "Contested%", "Efficiency", REC, "pct", "Share of his targets FTN charted as contested."),
    C("ypc", "YPC", "Efficiency", RUSH, "dec1", "Yards per carry."),
    C("epa_per_rush", "EPA/Rush", "Efficiency", RUSH, "dec2", "Expected points added per carry."),
    C("rush_success", "Success%", "Efficiency", RUSH, "pct", "Share of carries with positive EPA."),
    C("bt_per_touch", "BT/touch", "Efficiency", ["RB", "WR", "TE"], "pct", "PFR broken tackles per touch, the public stand-in for missed tackles forced."),
    C("explosive_runs", "10+ runs", "Efficiency", ["RB"], "int", "Carries of 10 yards or more."),
    C("explosive_run_rate", "10+ run%", "Efficiency", ["RB"], "pct", "Share of carries that went 10 yards or more."),
    C("first_read_share", "1st-read%", "Usage", REC, "pct", "Share of the team's first-read targets (FTN charting). The single best early read on who the offense is built around; the show held up a 51% week from JSN as the benchmark."),
    C("first_read_rate", "1st-read tgt%", "Usage", REC, "pct", "Share of his own targets that came as the quarterback's first read."),
    C("adot", "aDOT", "Air", REC, "dec1", "Average depth of target."),
    C("air_yds", "Air yds", "Air", REC, "int", "Total air yards on targets."),
    C("deep_targets", "20+ tgt", "Air", REC, "int", "Targets 20+ yards downfield."),
    C("rz_targets", "RZ tgt", "Red zone", REC, "int", "Targets inside the 20."),
    C("rz_target_share", "RZ tgt%", "Red zone", REC, "pct", "Share of the team's red-zone targets."),
    C("ez_targets", "EZ tgt", "Red zone", REC, "int", "Targets thrown into the end zone."),
    C("rz_opp_share", "RZ opp%", "Red zone", SKILL, "pct", "Share of the team's red-zone targets plus carries. The most-cited stat on the show; 60%+ reads as a locked-in role."),
    C("rz_carries", "RZ car", "Red zone", RUSH, "int", "Carries inside the 20."),
    C("gl_carries", "GL car", "Red zone", RUSH, "int", "Carries inside the 5."),
    C("gl_share", "GL%", "Red zone", ["RB"], "pct", "Share of the team's carries inside the 5."),
    C("xfp_pg", "xFP/G", "Expected", ["RB", "WR", "TE"], "dec1", "Expected PPR points per game from the targets and carries he got, priced at league average for plays like them."),
    C("fpoe_pg", "FPOE/G", "Expected", ["RB", "WR", "TE"], "dec1", "PPR points over expected per game. Positive means he did more with his opportunity than an average player would."),
    C("avg_separation", "Sep", "NGS", REC, "dec1", "Next Gen Stats average separation at the catch point, yards."),
    C("avg_cushion", "Cushion", "NGS", REC, "dec1", "Next Gen Stats average cushion at the snap, yards."),
    C("avg_yac_above_expectation", "YACOE", "NGS", REC, "dec1", "Next Gen Stats yards after catch over expected, per reception."),
    C("rush_yards_over_expected_per_att", "RYOE/att", "NGS", RUSH, "dec2", "Next Gen Stats rush yards over expected, per carry."),
    C("percent_attempts_gte_eight_defenders", "8+ box%", "NGS", ["RB"], "pct100", "Share of carries into eight or more defenders in the box.", True),
    C("ybc_per_att", "YBC/att", "PFR", ["RB"], "dec1", "Yards before contact per carry (blocking)."),
    C("yac_per_att", "YAC/att", "PFR", ["RB"], "dec1", "Yards after contact per carry (the back)."),
    C("rush_broken_tackles", "BT rush", "PFR", ["RB"], "int", "Broken tackles on carries."),
    C("rec_broken_tackles", "BT rec", "PFR", REC, "int", "Broken tackles after the catch."),
    C("dropbacks", "DB", "Passing", ["QB"], "int", "Dropbacks."),
    C("db_epa", "EPA/DB", "Passing", ["QB"], "dec2", "Expected points added per dropback."),
    C("cpoe", "CPOE", "Passing", ["QB"], "dec1", "Completion % over expected."),
    C("pass_adot", "aDOT", "Passing", ["QB"], "dec1", "Average depth of throw."),
    C("ypa", "Y/A", "Passing", ["QB"], "dec1", "Yards per attempt."),
    C("pass_success", "Success%", "Passing", ["QB"], "pct", "Share of dropbacks with positive EPA."),
    C("sack_rate", "Sack%", "Passing", ["QB"], "pct", "Sacks per dropback.", True),
    C("pressure_rate", "Pressure%", "Passing", ["QB"], "pct", "PFR pressures per dropback.", True),
    C("bad_throw_rate", "Bad throw%", "Passing", ["QB"], "pct", "PFR bad throws per attempt.", True),
    C("scramble_rate", "Scramble%", "Passing", ["QB"], "pct", "Scrambles per dropback."),
    C("designed_runs", "Designed runs", "Passing", ["QB"], "int", "Carries that were not scrambles."),
    C("avg_time_to_throw", "TTT", "Passing", ["QB"], "dec2", "Next Gen Stats average time to throw, seconds."),
    C("aggressiveness", "Aggr%", "Passing", ["QB"], "pct100", "Next Gen Stats share of throws into tight windows."),
    C("qbr", "QBR", "Passing", ["QB"], "dec1", "ESPN Total QBR, play-weighted across games."),
    C("qb_play_action_rate", "PA%", "Passing", ["QB"], "pct", "Play-action share of dropbacks (FTN)."),
    C("qb_under_center_rate", "Under ctr%", "Passing", ["QB"], "pct", "Snaps under center rather than shotgun or pistol (FTN)."),
    C("qb_first_read_rate", "1st-read%", "Passing", ["QB"], "pct", "Throws that went to the first read (FTN)."),
    C("out_of_pocket_rate", "Out of pocket%", "Passing", ["QB"], "pct", "Dropbacks where he left the pocket (FTN)."),
    C("catchable_throw_rate", "Catchable%", "Passing", ["QB"], "pct", "Attempts FTN charted as catchable."),
    C("report_status", "Injury", "Status", SKILL, "text", "Latest official injury report status."),
    C("depth", "Depth", "Status", SKILL, "int", "Depth chart order at his position on the newest chart.", True),
]
TEAM_COLUMNS = [
    C("plays_pg", "Plays/G", "Pace", [], "dec1", "Offensive plays per game."),
    C("sec_per_play_neutral", "Sec/play", "Pace", [], "dec1", "Game-clock seconds per snap in neutral situations. Lower is faster.", True),
    C("proe", "PROE", "Pace", [], "pct", "Pass rate over expected in neutral situations (win probability 20-80%, outside the last two minutes of a half)."),
    C("neutral_pass_rate", "Neutral pass%", "Pace", [], "pct", "Pass rate in neutral situations."),
    C("play_action_rate", "PA%", "Scheme", [], "pct", "Play-action share of dropbacks (FTN)."),
    C("pa_epa", "PA EPA", "Scheme", [], "dec2", "EPA per play-action dropback."),
    C("motion_rate", "Motion%", "Scheme", [], "pct", "Plays with pre-snap motion (FTN)."),
    C("under_center_rate", "Under ctr%", "Scheme", [], "pct", "Snaps under center (FTN). Pairs with play action: under-center teams run more of it."),
    C("no_huddle_rate", "No huddle%", "Scheme", [], "pct", "No-huddle snaps (FTN)."),
    C("screen_rate", "Screen%", "Scheme", [], "pct", "Screen share of pass attempts (FTN)."),
    C("rpo_rate", "RPO%", "Scheme", [], "pct", "Run-pass options (FTN)."),
    C("early_down_success", "Early-down success%", "Offense", [], "pct", "Success rate on first and second down."),
    C("early_down_pass_rate", "Early-down pass%", "Pace", [], "pct", "Neutral-situation pass rate on first and second down."),
    C("epa_play", "EPA/play", "Offense", [], "dec2", "Offensive EPA per play."),
    C("epa_pass", "EPA/pass", "Offense", [], "dec2", "EPA per pass play."),
    C("epa_rush", "EPA/rush", "Offense", [], "dec2", "EPA per run play."),
    C("success_rate", "Success%", "Offense", [], "pct", "Share of plays with positive EPA."),
    C("rz_plays_pg", "RZ plays/G", "Offense", [], "dec1", "Plays run inside the 20 per game."),
    C("rz_td_rate", "RZ TD%", "Offense", [], "pct", "Touchdowns per red-zone play."),
    C("def_epa_play", "Def EPA/play", "Defense", [], "dec2", "EPA allowed per play. Lower is a better defense, and a worse matchup.", True),
    C("def_success_rate", "Def success%", "Defense", [], "pct", "Success rate allowed.", True),
]


def build(season: int) -> dict:
    players, meta, teams = player_table(season)
    keys = [c["key"] for c in COLUMNS]
    out_p = {}
    for gsis, row in players.iterrows():
        # nflverse writes the Rams as LA; every other file on the site says LAR.
        rec = {"n": row["full_name"], "p": row["position"], "t": TEAM_FIX.get(row["team"], row["team"]), "g": gsis}
        for k in keys:
            v = row.get(k)
            if k == "report_status":
                rec[k] = v if isinstance(v, str) and v else None
            else:
                rec[k] = num(v)
        if row.get("_log"):
            rec["wk"] = row["_log"]
        out_p[str(row["sleeper_id"]).split(".")[0]] = {k: v for k, v in rec.items() if v is not None}
    out_t = {}
    for team, row in teams.iterrows():
        out_t[TEAM_FIX.get(team, team)] = {c["key"]: num(row.get(c["key"])) for c in TEAM_COLUMNS}
    return {
        "season": season,
        "throughWeek": meta["through_week"],
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source": "nflverse-data (play-by-play, stats, snap counts, Next Gen Stats, PFR advanced, ESPN QBR, injuries, depth charts)",
        "estimates": ["route_rate_est", "tprr_est", "yprr_est", "fprr_est", "xfp_pg", "fpoe_pg"],
        "logFields": ["week", "opp", "snap_pct", "tgt", "rec", "rec_yds", "rec_td", "car", "rush_yds",
                      "rush_td", "att", "pass_yds", "pass_td", "int", "ppr"],
        "columns": COLUMNS,
        "teamColumns": TEAM_COLUMNS,
        "players": out_p,
        "teams": out_t,
    }


def self_check() -> int:
    # PPR points a play produced: a 12-yard catch for a TD is 1 + 1.2 + 6.
    d = pd.DataFrame({
        "complete_pass": [1, 0, 0], "receiving_yards": [12, 0, 0], "pass_touchdown": [1, 0, 0],
        "rushing_yards": [0, 7, 0], "rush_touchdown": [0, 0, 0], "fumble_lost": [0, 0, 1],
        "receiver_player_id": ["a", None, None], "pass_attempt": [1, 0, 0],
        "rusher_player_id": [None, "b", "c"], "rush_attempt": [0, 1, 1],
    })
    pts = ppr_points(d)
    assert abs(pts[0] - 8.2) < 1e-9, pts[0]
    assert abs(pts[1] - 0.7) < 1e-9, pts[1]
    assert abs(pts[2] - -2.0) < 1e-9, pts[2]       # a lost fumble costs the carrier
    # num() must never leak NaN into JSON, which would break the whole file.
    assert num(float("nan")) is None and num(float("inf")) is None and num(3.0) == 3
    # Every estimate is flagged in its own description, so the UI can say so.
    for c in COLUMNS:
        if c["key"].endswith("_est"):
            assert "(est)" in c["label"], c
    print("build_nflverse_suite self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=season_now())
    ap.add_argument("--all", action="store_true", help="current season plus the two before it")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()
    if a.all:
        for y in (season_now() - 2, season_now() - 1, season_now()):
            a.season = y
            run_one(a)
        return 0
    return run_one(a)


def run_one(a) -> int:
    data = build(a.season)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    current = a.season == season_now()
    out = OUT if current else OUT.with_name(f"advanced-{a.season}.js")
    # The current season is the page's default and loads with it. A finished
    # season is loaded only when someone picks it in Stats Lab, into a
    # registry keyed by year, so past years add nothing to first paint.
    target = "window.ADVANCED" if current else \
        f"(window.ADVANCED_BY_SEASON=window.ADVANCED_BY_SEASON||{{}})[{a.season}]"
    out.write_text("// Generated by projections/build_nflverse_suite.py from nflverse. Do not edit.\n"
                   f"{target}={body};\n", encoding="utf-8")
    global OUT_WRITTEN
    OUT_WRITTEN = out
    by_pos = {}
    for r in data["players"].values():
        by_pos[r["p"]] = by_pos.get(r["p"], 0) + 1
    print(f"wrote {OUT_WRITTEN.name}: {len(data['players'])} players {by_pos}, {len(data['teams'])} teams, "
          f"{len(COLUMNS)} player columns, through {a.season} week {data['throughWeek']} "
          f"({OUT_WRITTEN.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
