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

  * Routes run, for a season with no participation on disk (2026 on). nflverse
    participation (the only public per-play route data) ends with 2025, so
    routes = his share of the team's offensive snaps x the team's dropbacks
    that game, calibrated on pooled 2023-2025 participation (ROUTE_MULT).
    A season that HAS participation (2023-2025) uses the measured count
    instead, the team dropbacks he was on the field for, and drops "(est)".
    Either way a pass-block counts as a route, so blocking TEs and backs read
    high. Route% divides by the team's dropbacks in the games he played, at
    the team he played for that game.
  * Expected fantasy points. ffopportunity's (ffverse) per-play XGBoost
    expected points, receiving plus rushing, full PPR, joined on gsis id.
    FPOE = his actual PPR minus that. If ffopportunity is unreachable the
    fallback is our lookup: the league-average PPR of plays like each target
    (air-yard band x field-position band) or carry (field-position band x
    down), from last season plus this one. ffopportunity won the 2024-25
    backtest in notes/xfp-methodology.md.

    python projections/build_nflverse_suite.py
    python projections/build_nflverse_suite.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import time
import urllib.request

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Both can live outside this checkout (a git worktree reads the main checkout's).
CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
PART = pathlib.Path(os.environ.get("FF_PARTICIPATION_DIR") or ROOT / "historical" / "pbp_participation")
OUT = ROOT / "site" / "data" / "advanced.js"
OUT_WRITTEN = OUT
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
MAX_AGE_H = 6.0
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def fetch(tag: str, name: str, max_age_h: float = MAX_AGE_H, base: str = BASE) -> pathlib.Path:
    """Cached download. A failed refresh keeps the copy on disk and says so."""
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    fresh = p.exists() and (time.time() - p.stat().st_mtime) / 3600 < max_age_h
    if not fresh:
        try:
            req = urllib.request.Request(f"{base}/{tag}/{name}", headers={"User-Agent": "Mozilla/5.0"})
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


FFO_BASE = "https://github.com/ffverse/ffopportunity/releases/download"


def ffo_weekly(season: int, reg_games: set) -> pd.DataFrame:
    """ffopportunity (ffverse): per-play XGBoost expected points on nflfastR,
    summed to player-games. Expected receiving points pay 1.0 per expected
    catch, so it is full PPR as published. Passing is left out, as in ours."""
    past = season < season_now()
    return ffo_points(pd.read_parquet(fetch("latest-data", f"ep_weekly_{season}.parquet",
                                            FINISHED_SEASON_AGE_H if past else MAX_AGE_H, FFO_BASE)), reg_games)


def ffo_points(e: pd.DataFrame, reg_games: set) -> pd.DataFrame:
    e = e[e["game_id"].isin(reg_games)].copy()
    e["week"] = e["week"].astype(int)
    f = lambda k: e[k].fillna(0)
    e["xfp_ffo"] = f("rec_fantasy_points_exp") + f("rush_fantasy_points_exp")
    e["pts_ffo"] = f("rec_fantasy_points") + f("rush_fantasy_points")
    return e[["player_id", "week", "xfp_ffo", "pts_ffo"]]


# --------------------------------------------------------------------------
# Estimated routes
# --------------------------------------------------------------------------
# Routes = offense_pct (his snaps over the team's, both from snap_counts) x the
# team's dropbacks that game (pass and run plays, the ones route_rate_est
# divides by). Until 2026-09-28 it was raw snaps x dropbacks per pass/run play,
# but snap_counts also counts post-snap penalty plays, kneels and spikes, about
# 6.5% more plays than pbp keeps, so a full-time QB came out at 103-106% of
# his own dropbacks and DK Metcalf at 103%.
#
# Fitted on pooled 2023-2025 participation, the seasons that have it: the
# median of on-field dropbacks over this estimate, players with 100+ on-field
# dropbacks. WRs and RBs get one number each. A TE's multiplier rises with his
# season snap share, linear between the median TE under 50% snaps (37% snaps,
# 0.807x) and the median TE at 50%+ (65%, 1.038x), flat outside: the old
# 2025-only fit had three TE steps, and a TE at 74% vs 76% moved Route% about
# 9.5 points while the 50-75% step swung from 1.065x to 0.946x between seasons
# on 28-31 players. Held out one season at a time (fit on the other two), the
# season Route% misses the measured number by 3.2 points at the median and 8.8
# at the 90th percentile, against 3.4 and 9.2 for the 2025-only steps on
# 2023-2024. --self-check refits all of it; ROUTE_FIT holds the claims it
# enforces. The target is on-field dropbacks, so a pass-block counts as a
# route. QBs fit 1.00: both sides count the same plays. A game's routes never
# exceed the team's dropbacks.
ROUTE_MULT = {"WR": 1.063, "RB": 0.987, "TE": ((0.374, 0.807), (0.651, 1.038))}
ROUTE_FIT = {"seasons": (2023, 2024, 2025), "min_on_field_db": 100, "te_split": 0.5,
             "oos_median": 0.0325, "oos_p90": 0.0885}
ROUTE_KEYS = ("route_rate_est", "tprr_est", "yprr_est", "fprr_est")


def route_mult(position, snap_pct, fit: dict = ROUTE_MULT) -> np.ndarray:
    pos = np.asarray(position, dtype=object)
    sp = np.nan_to_num(np.asarray(snap_pct, dtype=float))
    (x0, y0), (x1, y1) = fit["TE"]
    return np.where(pos == "TE", np.interp(sp, [x0, x1], [y0, y1]),
                    np.where(pos == "WR", fit["WR"], np.where(pos == "RB", fit["RB"], 1.0)))


def on_field_dropbacks(season: int, plays: pd.DataFrame):
    """(gsis_id, game_id) -> the team's dropbacks he was on the field for, from
    nflverse participation, or None when the season has none on disk."""
    csv = PART / f"{season}.csv"
    if not csv.exists():
        return None
    part = pd.read_csv(csv, usecols=["nflverse_game_id", "play_id", "offense_players"])
    part = part.rename(columns={"nflverse_game_id": "game_id"}).astype({"play_id": float}) \
        .drop_duplicates(["game_id", "play_id"])
    on = plays.loc[plays["qb_dropback"] == 1, ["game_id", "play_id"]].astype({"play_id": float}).merge(part)
    on = on.assign(gsis_id=on["offense_players"].fillna("").str.split(";")).explode("gsis_id")
    return on[on["gsis_id"] != ""].groupby(["gsis_id", "game_id"]).size()


def add_routes(snaps: pd.DataFrame, pbp_plays: pd.DataFrame, roster: pd.DataFrame, calibrate: bool = True,
               measured=None) -> pd.DataFrame:
    """snap_counts rows (gsis_id mapped) plus team_db and routes_est for that game.
    `measured` (on_field_dropbacks) replaces the estimate with the charted count.
    The build_split_cube and build_weekly_splits builders call this too, so one
    calibration serves all three."""
    db = pbp_plays[pbp_plays["qb_dropback"] == 1].groupby(["game_id", "posteam"]).size()
    s = snaps.merge(db.rename("team_db").reset_index().rename(columns={"posteam": "team"}),
                    on=["game_id", "team"], how="left")
    if measured is not None:
        r = pd.MultiIndex.from_frame(s[["gsis_id", "game_id"]]).map(measured).to_numpy(dtype=float)
        r = np.where(s["team_db"].notna(), np.nan_to_num(r), np.nan)
    else:
        m = route_mult(s["gsis_id"].map(roster.set_index("gsis_id")["position"]),
                       s.groupby("gsis_id")["offense_pct"].transform("mean")) if calibrate else 1.0
        r = s["offense_pct"] * s["team_db"] * m
    s["routes_est"] = np.minimum(r, s["team_db"])
    return s


def route_totals(s: pd.DataFrame) -> pd.DataFrame:
    """Season routes per player and the dropbacks they are out of: the team's
    dropbacks in the games he has a snap row in, each at the team he played for
    that game. Until 2026-09-28 the denominator was his final team's dropbacks
    in every game, so a player who missed games (2025 Garrett Wilson, 7 of 17)
    read 36.8% instead of 95.0%."""
    s = s[s["routes_est"].notna()]
    return s.groupby("gsis_id").agg(routes_est=("routes_est", "sum"), route_db=("team_db", "sum"))


def route_fit_frame(seasons=ROUTE_FIT["seasons"]):
    """Per player-season: uncalibrated estimate (raw), measured on-field
    dropbacks (on), their dropbacks (db) and mean snap share, over the same
    snap rows. None when a season's participation is not on disk."""
    out = []
    for season in seasons:
        pbp = read("pbp", f"play_by_play_{season}.parquet")
        p = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"])]
        measured = on_field_dropbacks(season, p)
        if measured is None:
            return None
        roster = read("rosters", f"roster_{season}.parquet").sort_values("week").drop_duplicates("gsis_id", keep="last")
        roster = roster[roster["position"].isin(SKILL) & roster["gsis_id"].notna()]
        snaps = read("snap_counts", f"snap_counts_{season}.parquet")
        snaps = snaps[snaps["game_type"] == "REG"].copy()
        snaps["gsis_id"] = snaps["pfr_player_id"].map(roster.dropna(subset=["pfr_id"]).set_index("pfr_id")["gsis_id"])
        snaps = snaps.dropna(subset=["gsis_id"])
        s = add_routes(snaps, p, roster, calibrate=False)
        s["on"] = add_routes(snaps, p, roster, measured=measured)["routes_est"]
        s = s[s["routes_est"].notna()]
        g = s.groupby("gsis_id").agg(raw=("routes_est", "sum"), on=("on", "sum"), db=("team_db", "sum"),
                                     snap=("offense_pct", "mean"))
        out.append(g.join(roster.set_index("gsis_id")["position"], how="inner").assign(season=season))
    g = pd.concat(out)
    return g[(g["on"] >= ROUTE_FIT["min_on_field_db"]) & (g["raw"] > 0)]


def fit_routes(g: pd.DataFrame) -> dict:
    """ROUTE_MULT's shape, fitted on route_fit_frame rows."""
    r = g["on"] / g["raw"]
    te = g["position"] == "TE"
    lo, hi = te & (g["snap"] < ROUTE_FIT["te_split"]), te & (g["snap"] >= ROUTE_FIT["te_split"])
    return {"WR": r[g["position"] == "WR"].median(), "RB": r[g["position"] == "RB"].median(),
            "TE": ((g["snap"][lo].median(), r[lo].median()), (g["snap"][hi].median(), r[hi].median()))}


def route_error(g: pd.DataFrame, fit: dict) -> pd.Series:
    """|estimated - measured| season Route%, in Route% units (0.03 = 3 points)."""
    est = np.minimum(g["raw"] * route_mult(g["position"], g["snap"], fit), g["db"])
    return (est - g["on"]).abs() / g["db"]


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
    # ffopportunity is the shipped xFP: it beat the lookup above on the 2024-25
    # backtest (notes/xfp-methodology.md). The lookup is the fallback.
    ffo = optional("ffopportunity", lambda: ffo_weekly(season, set(p["game_id"])))
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
    measured = on_field_dropbacks(season, p)
    snaps = add_routes(snaps, p, roster, measured=measured)
    # Route stats count only games he has a snap row in, on both sides of every
    # ratio: play-by-play lands the night of a game, snap_counts a day or so later.
    played = pd.MultiIndex.from_frame(snaps.dropna(subset=["gsis_id"])[["gsis_id", "game_id"]])
    routed = t[pd.MultiIndex.from_arrays([t["receiver_player_id"], t["game_id"]]).isin(played)]
    routed = routed.groupby("receiver_player_id").agg(
        routed_tgt=("play_id", "size"), routed_yds=("receiving_yards", "sum"), routed_pts=("pts", "sum"))
    sn = snaps.dropna(subset=["gsis_id"]).groupby("gsis_id").agg(
        games=("game_id", "nunique"),
        off_snaps=("offense_snaps", "sum"),
        snap_pct=("offense_pct", "mean"),
    ).join(route_totals(snaps.dropna(subset=["gsis_id"])))

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
    for part in (sn, routed, rec, rush, pas, ngs_rec, ngs_rush, ngs_pass, pfr_rec, pfr_rush, pfr_pass,
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
    xfp_source = "lookup"
    if not ffo.empty:
        # Per game over the weeks ffopportunity has published, which can trail pbp.
        f_wk = int(ffo["week"].max())
        g_ffo = snaps[snaps["week"] <= f_wk].dropna(subset=["gsis_id"]).groupby("gsis_id")["game_id"].nunique()
        fs = ffo.groupby("player_id")[["xfp_ffo", "pts_ffo"]].sum()
        df = df.join(fs).join(g_ffo.rename("games_ffo"))
        df["xfp_pg"] = df["xfp_ffo"] / df["games_ffo"]
        df["fpoe_pg"] = (df["pts_ffo"] - df["xfp_ffo"]) / df["games_ffo"]
        xfp_source = "ffopportunity"
    else:
        df["xfp_pg"] = df["xfp"] / g
        df["fpoe_pg"] = df["fpoe"] / g
    # routes_est is already calibrated (or measured) and capped per game (add_routes).
    df["route_rate_est"] = df["routes_est"] / df["route_db"].where(df["route_db"] > 0)
    routes = df["routes_est"].where(df["routes_est"] >= 5)
    df["tprr_est"] = df["routed_tgt"] / routes
    df["yprr_est"] = df["routed_yds"] / routes
    df["fprr_est"] = df["routed_pts"] / routes
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
    return keep, {"through_week": through, "xfp_source": xfp_source, "routes_measured": measured is not None}, teams


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
    C("route_rate_est", "Route% (est)", "Usage", REC, "pct", "Estimated routes over the team's dropbacks in the games he played, at the team he played for. His share of the offensive snaps x the team's dropbacks each game, because public route data ends in 2025, calibrated on pooled 2023-2025 participation (WRs 1.06x, RBs 0.99x, TEs 0.81x at 37% snaps rising to 1.04x at 65%) and never more than the team's dropbacks that game. Held out a season at a time, it misses the measured number by 3.2 points at the median and 8.8 at the 90th percentile. It counts every dropback he was on the field for, so a pass-block counts as a route: an upper bound for blocking TEs and backs. Benchmark cited on the show: 65-70%+ is an every-down receiver."),
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
    C("xfp_pg", "xFP/G", "Expected", ["RB", "WR", "TE"], "dec1", "Expected PPR points per game from the targets and carries he got. ffopportunity's model (XGBoost on nflfastR play-by-play) prices each target by air yards, field position, down, distance and game state, and each carry by field position, down, distance, run direction and game state."),
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


XFP_LOOKUP_DESC = ("Expected PPR points per game from the targets and carries he got, priced at league average "
                   "for plays like them. ffopportunity was unavailable for this build, so this is the fallback.")


ESTIMATES = ["route_rate_est", "tprr_est", "yprr_est", "fprr_est", "xfp_pg", "fpoe_pg"]
MEASURED_ROUTE_DESC = ("Routes over the team's dropbacks in the games he played, at the team he played for. Measured, "
                       "not estimated: routes are the team's dropbacks he was on the field for, from nflverse participation "
                       "charting, so a pass-block counts as a route and blocking TEs and backs read high. Benchmark cited "
                       "on the show: 65-70%+ is an every-down receiver.")
MEASURED_ROUTE_NOTE = (" Routes are measured this season: the team's dropbacks he was on the field for (nflverse "
                       "participation), so a pass-block counts as a route.")


def season_columns(measured: bool, xfp_source: str) -> tuple[list, list]:
    """(columns, estimate keys) for one season's file. A season with
    participation measures routes, so its route columns drop "(est)"; the keys
    stay, because the page reads every season by the same key."""
    cols = COLUMNS if xfp_source == "ffopportunity" else \
        [dict(c, desc=XFP_LOOKUP_DESC) if c["key"] == "xfp_pg" else c for c in COLUMNS]
    if not measured:
        return cols, ESTIMATES
    cols = [dict(c, label=c["label"].replace(" (est)", ""),
                 desc=MEASURED_ROUTE_DESC if c["key"] == "route_rate_est"
                 else c["desc"].replace("estimated route", "route") + MEASURED_ROUTE_NOTE)
            if c["key"] in ROUTE_KEYS else c for c in cols]
    return cols, [k for k in ESTIMATES if k not in ROUTE_KEYS]


def build(season: int) -> dict:
    players, meta, teams = player_table(season)
    keys = [c["key"] for c in COLUMNS]
    cols, estimates = season_columns(meta["routes_measured"], meta["xfp_source"])
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
        "source": "nflverse-data (play-by-play, stats, snap counts, Next Gen Stats, PFR advanced, ESPN QBR, injuries, depth charts)"
                  + (", ffopportunity expected points" if meta["xfp_source"] == "ffopportunity" else "")
                  + (", participation (routes)" if meta["routes_measured"] else ""),
        "xfpSource": meta["xfp_source"],
        "estimates": estimates,
        "logFields": ["week", "opp", "snap_pct", "tgt", "rec", "rec_yds", "rec_td", "car", "rush_yds",
                      "rush_td", "att", "pass_yds", "pass_td", "int", "ppr"],
        "columns": cols,
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
    # ffopportunity: postseason dropped, receiving plus rushing only (passing is not ours to price).
    e = pd.DataFrame({"game_id": ["g1", "g1", "post"], "week": [1.0, 1.0, 19.0], "player_id": ["a", "b", "a"],
                      "rec_fantasy_points_exp": [5.0, None, 9.0], "rush_fantasy_points_exp": [1.5, 2.0, 9.0],
                      "rec_fantasy_points": [4.0, 0.0, 9.0], "rush_fantasy_points": [0.0, 6.0, 9.0],
                      "pass_fantasy_points_exp": [0.0, 20.0, 0.0]})
    f = ffo_points(e, {"g1"})
    assert f["xfp_ffo"].tolist() == [6.5, 2.0] and f["pts_ffo"].tolist() == [4.0, 6.0], f
    # The published model must still pay 1.0 per expected catch, or xFP stops being full PPR.
    cached = CACHE / f"ep_weekly_{season_now() - 1}.parquet"
    if cached.exists():
        w = pd.read_parquet(cached).fillna(0)
        X = w[["receptions_exp", "rec_yards_gained_exp", "rec_touchdown_exp", "rec_two_point_conv_exp"]].to_numpy()
        per_catch = np.linalg.lstsq(X, w["rec_fantasy_points_exp"].to_numpy(), rcond=None)[0][0]
        assert abs(per_catch - 1.0) < 0.02, f"ffopportunity pays {per_catch:.2f} per expected catch, not 1.0"
    # Routes: snap share x dropbacks x calibration, capped at the team's dropbacks.
    snaps = pd.DataFrame({"game_id": ["g"] * 4, "team": ["X"] * 4, "gsis_id": ["w", "t", "q", "r"],
                          "offense_pct": [0.97, 0.30, 1.0, 0.5]})
    plays = pd.DataFrame({"game_id": ["g"] * 50, "posteam": ["X"] * 50, "qb_dropback": [1] * 40 + [0] * 10})
    pos = pd.DataFrame({"gsis_id": ["w", "t", "q", "r"], "position": ["WR", "TE", "QB", "RB"]})
    got = add_routes(snaps, plays, pos)["routes_est"].tolist()
    te_m = route_mult(["TE"], [0.30])[0]
    assert abs(te_m - ROUTE_MULT["TE"][0][1]) < 1e-9, te_m          # flat below the low anchor
    assert np.allclose(got, [40, 0.3 * 40 * te_m, 40, 0.5 * 40 * ROUTE_MULT["RB"]]), got
    # The TE multiplier has no steps: 74% vs 76% snaps moves it by the slope only.
    (x0, y0), (x1, y1) = ROUTE_MULT["TE"]
    step = route_mult(["TE", "TE", "TE"], [0.49, 0.51, (x0 + x1) / 2])
    assert abs(step[1] - step[0]) < 0.02 and np.isclose(step[2], (y0 + y1) / 2), step
    # Route% is out of the team's dropbacks in HIS games, at the team he played for:
    # w misses X's game g2; z plays g1 for X, then g4 for Y, who had played g0 without him.
    snaps = pd.DataFrame({"game_id": ["g1", "g3", "g1", "g4"], "team": ["X", "X", "X", "Y"],
                          "gsis_id": ["w", "w", "z", "z"], "offense_pct": [0.9, 0.9, 0.5, 0.5]})
    dbs = {("g1", "X"): 40, ("g2", "X"): 30, ("g3", "X"): 50, ("g4", "Y"): 35, ("g0", "Y"): 60}
    plays = pd.DataFrame([{"game_id": g, "posteam": t, "qb_dropback": 1} for (g, t), n in dbs.items() for _ in range(n)])
    pos = pd.DataFrame({"gsis_id": ["w", "z"], "position": ["WR", "WR"]})
    tot = route_totals(add_routes(snaps, plays, pos))
    assert tot.loc["w", "route_db"] == 90 and tot.loc["z", "route_db"] == 75, tot   # not 120, not Y's 95
    assert abs(tot.loc["w", "routes_est"] / 90 - 0.9 * ROUTE_MULT["WR"]) < 1e-9, tot
    # A measured season counts charted on-field dropbacks, 0 in a game he has none.
    measured = pd.Series({("w", "g1"): 38, ("w", "g3"): 49, ("z", "g1"): 12})
    tot = route_totals(add_routes(snaps, plays, pos, measured=measured))
    assert tot["routes_est"].to_dict() == {"w": 87, "z": 12} and tot.loc["z", "route_db"] == 75, tot
    # A measured season's file says so: no "(est)" on its route columns, and not in its estimates.
    cols, est = season_columns(True, "ffopportunity")
    lab = {c["key"]: c["label"] for c in cols}
    assert all("(est)" not in lab[k] for k in ROUTE_KEYS) and not set(ROUTE_KEYS) & set(est), (lab, est)
    assert all("(est)" in c["label"] for c in season_columns(False, "ffopportunity")[0] if c["key"] in ROUTE_KEYS)
    # The calibration still matches pooled 2023-2025 participation, and a QB, on the
    # field for every dropback, fits 1.00: numerator and denominator count the same
    # plays. Needs the gitignored participation files (FF_PARTICIPATION_DIR).
    g = route_fit_frame()
    if g is None:
        print(f"  route calibration: SKIPPED, participation {ROUTE_FIT['seasons']} not all in {PART}")
    else:
        flat = lambda f: [f["WR"], f["RB"], *f["TE"][0], *f["TE"][1]]
        names = ["WR", "RB", "TE lo snap", "TE lo mult", "TE hi snap", "TE hi mult"]
        pooled, ys = fit_routes(g), ROUTE_FIT["seasons"]
        folds = {y: fit_routes(g[g["season"] != y]) for y in ys}
        # Tolerance: how far the fit moves when any one season is left out. Drift
        # inside that is what dropping a season does anyway; drift past it is new.
        for i, name in enumerate(names):
            tol = max(abs(flat(f)[i] - flat(pooled)[i]) for f in folds.values()) + 0.0005
            assert abs(flat(ROUTE_MULT)[i] - flat(pooled)[i]) <= tol, \
                f"route calibration: {name} fits {flat(pooled)[i]:.3f}, shipped {flat(ROUTE_MULT)[i]}, tol {tol:.3f}"
        qb = (g["on"] / g["raw"])[g["position"] == "QB"].median()
        assert abs(qb - 1.0) <= 0.01, f"QBs fit {qb:.3f}: the two sides no longer count the same plays"
        # The out-of-sample error the Route% (est) description quotes is still true.
        err = pd.concat([route_error(g[(g["season"] == y) & (g["position"] != "QB")], folds[y]) for y in ys])
        med, p90 = err.median(), err.quantile(0.9)
        assert med <= ROUTE_FIT["oos_median"] and p90 <= ROUTE_FIT["oos_p90"], (med, p90)
        print(f"  route calibration matches pooled {ys[0]}-{ys[-1]} (n={len(g)}), QB {qb:.3f}; "
              f"leave-one-season-out Route% error median {med:.1%}, p90 {p90:.1%}")
    # No written season has a route rate over 100%, and each says whether its routes are measured.
    for path in sorted(OUT.parent.glob("advanced*.js")):
        txt = path.read_text(encoding="utf-8")
        data = json.loads(txt[txt.index('={"season"') + 1:].rstrip().rstrip(";"))
        players = data["players"]
        over = [(v["n"], v["route_rate_est"]) for v in players.values() if (v.get("route_rate_est") or 0) > 1]
        assert not over, f"{path.name}: Route% over 100% for {over}"
        has_part = (PART / f"{data['season']}.csv").exists()
        assert ("route_rate_est" in data["estimates"]) != has_part, f"{path.name}: stale build, rerun the suite"
        top = max((v.get("route_rate_est") or 0) for v in players.values() if v["p"] != "QB")
        print(f"  {path.name}: routes {'measured' if has_part else 'estimated'}, max non-QB Route% {top:.1%}")
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
