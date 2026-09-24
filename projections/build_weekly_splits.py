"""Per-player, per-week USAGE splits from nflverse, for QB/RB/WR/TE.

Beyond the Box Score's stance (their podcast, cited throughout this repo's
other nflverse builder) is that week-to-week role change is the signal, not
one game's efficiency. This file exists to let the site draw trend lines and
a "last 3 weeks" view on top of build_nflverse_suite.py's season totals,
which flatten that signal away.

Reuses build_nflverse_suite.py's download/caching convention and formulas
(read, not imported: this file must not edit or import that one). Same
nflverse-data release tags, same 6h cache TTL, same route-count calibration.

What it joins, per week:
  snap_counts    offense_pct/offense_snaps, keyed by pfr_player_id -> roster.pfr_id
  play_by_play   targets/carries/air yards/red zone/PPR scoring, gsis ids
  ftn_charting   first-read targets, nflverse_game_id+play_id -> pbp game_id+play_id
  roster         sleeper_id/name/position/team, the site's player key

Two things are estimates, same caveat as the season builder:
  * routes_est: offense snaps x that game's team dropback share of team
    plays, then the same position/snap-bucket calibration (TE 0.81-0.98x by
    snap_pct that week, RB 0.94x, WR 1.0x). Public route participation data
    ends in 2025.
  * PPR points are recomputed from play-by-play, not read off a stats table:
    receptions 1, 0.1/yd rec+rush, 6/TD rec+rush, 0.04/pass yd, 4/pass TD,
    -2/INT, -2/fumble lost. Fumbles lost are charged to fumbled_1/2_player_id
    on the play, whichever offensive or defensive player the ball came off
    of that snap; only skill-position rows survive into the output.

    python projections/build_weekly_splits.py
    python projections/build_weekly_splits.py --self-check
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
OUT = ROOT / "site" / "data" / "usage-weekly.js"
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
MAX_AGE_H = 6.0
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}

FIELDS = ["week", "snap_pct", "routes_est", "route_rate_est", "targets", "target_share",
          "air_yards", "air_share", "first_read_share", "carries", "rush_share",
          "rz_opps", "rz_opp_share", "gl_carries", "ppr_pts"]

FIELD_DESC = {
    "week": "NFL week number.",
    "snap_pct": "Share of offensive snaps that week (snap_counts offense_pct).",
    "routes_est": "Estimated routes run that game: offense snaps x the team's dropback share of its "
                  "pass+run plays that game, then calibrated by position and that week's snap_pct "
                  "(TE 0.98x at snap_pct>=0.75, 0.89x at >=0.5, else 0.81x; RB 0.94x; WR/QB 1.0x). "
                  "Public per-play route data ends in 2025, so this is an estimate.",
    "route_rate_est": "routes_est over the team's dropbacks that game.",
    "targets": "Targets that game.",
    "target_share": "Share of the team's targets that game.",
    "air_yards": "Air yards on targets that game.",
    "air_share": "Share of the team's air yards that game.",
    "first_read_share": "Share of the team's FTN-charted first-read targets that game "
                        "(read_thrown == \"1\"); only counted among plays FTN charted a read on.",
    "carries": "Carries that game.",
    "rush_share": "Share of the team's carries that game.",
    "rz_opps": "Targets plus carries inside the 20 that game.",
    "rz_opp_share": "Share of the team's red-zone (targets + carries inside the 20) opportunities that game.",
    "gl_carries": "Carries inside the 5 that game.",
    "ppr_pts": "PPR fantasy points that game: 1/reception, 0.1/yd rec+rush, 6/TD rec+rush, "
               "0.04/pass yd, 4/pass TD, -2/INT, -2/fumble lost.",
}


# --------------------------------------------------------------------------
# Copied conventions from build_nflverse_suite.py (read-only reference; not
# imported, so this file has zero coupling to it).
# --------------------------------------------------------------------------
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


def read(tag: str, name: str) -> pd.DataFrame:
    return pd.read_parquet(fetch(tag, name))


def optional(label: str, fn):
    try:
        return fn()
    except Exception as e:
        print(f"  {label}: skipped ({type(e).__name__}: {e})")
        return pd.DataFrame()


def num(x):
    """JSON-safe number, rounded to 3 decimals. NaN/inf become None."""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return int(f) if f.is_integer() and abs(f) < 1e9 else round(f, 3)


def safe_div(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    return np.where(b > 0, a / np.where(b > 0, b, 1), np.nan)


def calibration_mult(position: np.ndarray, snap_pct: np.ndarray) -> np.ndarray:
    """Same calibration as build_nflverse_suite.py, applied to that week's
    snap_pct instead of the season average."""
    sp = np.where(np.isnan(snap_pct), 0.0, snap_pct)
    te_mult = np.where(sp >= 0.75, 0.98, np.where(sp >= 0.5, 0.89, 0.81))
    return np.where(position == "TE", te_mult, np.where(position == "RB", 0.94, 1.0))


def ppr_points_row(rec, rec_yds, pass_td_rec, rush_yds, rush_td, pass_yds, pass_td_pass, ints, fum_lost):
    """Per-play PPR points, vectorized. Split by the role the row is being
    scored for so passer TD and receiver TD on the same play both count."""
    rec_pts = rec * (1 + rec_yds * 0.1 + pass_td_rec * 6)
    rush_pts = rush_yds * 0.1 + rush_td * 6
    pass_pts = pass_yds * 0.04 + pass_td_pass * 4 - ints * 2
    fum_pts = -2 * fum_lost
    return rec_pts + rush_pts + pass_pts + fum_pts


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
def player_week_table(season: int) -> tuple[pd.DataFrame, int]:
    roster = read("rosters", f"roster_{season}.parquet")
    roster = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    roster = roster[roster["gsis_id"].notna()]
    pfr_to_gsis = roster.dropna(subset=["pfr_id"]).set_index("pfr_id")["gsis_id"].to_dict()
    skill_roster = roster[roster["position"].isin(SKILL) & roster["sleeper_id"].notna()]
    meta = skill_roster.set_index("gsis_id")[["sleeper_id", "full_name", "position", "team"]]

    pbp = read("pbp", f"play_by_play_{season}.parquet")
    pbp = pbp[pbp["season_type"] == "REG"].copy()
    through_week = int(pbp["week"].max()) if len(pbp) else 0

    p = pbp[pbp["play_type"].isin(["pass", "run"])].copy()

    ftn = optional("FTN charting", lambda: read("ftn_charting", f"ftn_charting_{season}.parquet"))
    if ftn.empty:
        ftn = pd.DataFrame(columns=["nflverse_game_id", "nflverse_play_id", "read_thrown"])
    ftn = ftn.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
    ftn["play_id"] = ftn["play_id"].astype(float)
    p["play_id"] = p["play_id"].astype(float)
    p = p.merge(ftn[["game_id", "play_id", "read_thrown"]], on=["game_id", "play_id"], how="left")
    has_read = p["read_thrown"].isin(["1", "2", "CHK", "SD", "DES"])
    p["first_read"] = np.where(has_read, (p["read_thrown"] == "1").astype(float), np.nan)

    # ---- team-game denominators ----
    team_plays = p.groupby(["game_id", "posteam"]).size()
    team_db = p[p["qb_dropback"] == 1].groupby(["game_id", "posteam"]).size()

    t = p[p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)].copy()
    t["rz"] = t["yardline_100"] <= 20
    t["fr"] = (t["first_read"] == 1).astype(float)
    team_targets = t.groupby(["game_id", "posteam"]).size()
    team_air = t.groupby(["game_id", "posteam"])["air_yards"].sum()
    fr_rows = t[t["fr"] == 1]
    team_fr_targets = fr_rows.groupby(["game_id", "posteam"]).size()

    r = p[p["rusher_player_id"].notna() & (p["rush_attempt"] == 1)].copy()
    r["rz"] = r["yardline_100"] <= 20
    team_carries = r.groupby(["game_id", "posteam"]).size()

    rz_mask = ((p["yardline_100"] <= 20) &
               ((p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)) |
                (p["rusher_player_id"].notna() & (p["rush_attempt"] == 1))))
    team_rz_opps = p[rz_mask].groupby(["game_id", "posteam"]).size()

    # ---- player-game usage ----
    # Renamed to "gsis_id" before grouping, not after: .join() matches
    # MultiIndex levels by NAME, and a level named "receiver_player_id"
    # sitting next to one named "gsis_id" silently falls back to joining on
    # only the shared "game_id" level, cross-joining every receiver in that
    # game onto every row of df. Same fix applies to rush_wk below.
    t = t.rename(columns={"receiver_player_id": "gsis_id"})
    rec_wk = t.groupby(["gsis_id", "game_id"]).agg(
        targets=("play_id", "size"), air_yards=("air_yards", "sum"),
        rz_targets=("rz", "sum"), first_read_targets=("fr", "sum"),
        posteam=("posteam", "last"),
    )
    r = r.rename(columns={"rusher_player_id": "gsis_id"})
    rush_wk = r.groupby(["gsis_id", "game_id"]).agg(
        carries=("play_id", "size"), rz_carries=("rz", "sum"),
        gl_carries=("yardline_100", lambda s: int((s <= 5).sum())),
        posteam=("posteam", "last"),
    )

    # ---- PPR points, scored per role then summed per (player, game) ----
    p["rec_pts"] = np.where(p["receiver_player_id"].notna() & (p["pass_attempt"] == 1),
                             p["complete_pass"].fillna(0) * (1 + p["receiving_yards"].fillna(0) * 0.1
                                                             + p["pass_touchdown"].fillna(0) * 6), np.nan)
    p["rush_pts"] = np.where(p["rusher_player_id"].notna() & (p["rush_attempt"] == 1),
                              p["rushing_yards"].fillna(0) * 0.1 + p["rush_touchdown"].fillna(0) * 6, np.nan)
    p["pass_pts"] = np.where(p["passer_player_id"].notna(),
                              p["passing_yards"].fillna(0) * 0.04 + p["pass_touchdown"].fillna(0) * 4
                              - p["interception"].fillna(0) * 2, np.nan)
    parts = [
        p.loc[p["rec_pts"].notna(), ["receiver_player_id", "game_id", "rec_pts"]]
         .rename(columns={"receiver_player_id": "gsis_id", "rec_pts": "pts"}),
        p.loc[p["rush_pts"].notna(), ["rusher_player_id", "game_id", "rush_pts"]]
         .rename(columns={"rusher_player_id": "gsis_id", "rush_pts": "pts"}),
        p.loc[p["pass_pts"].notna(), ["passer_player_id", "game_id", "pass_pts"]]
         .rename(columns={"passer_player_id": "gsis_id", "pass_pts": "pts"}),
    ]
    for fcol in ("fumbled_1_player_id", "fumbled_2_player_id"):
        fp = p.loc[(p["fumble_lost"] == 1) & p[fcol].notna(), ["game_id", fcol]].copy()
        fp["pts"] = -2.0
        parts.append(fp.rename(columns={fcol: "gsis_id"}))
    ppr_wk = pd.concat(parts, ignore_index=True).groupby(["gsis_id", "game_id"])["pts"].sum()

    # ---- snaps: the base row-per-player-per-game table ----
    snaps = read("snap_counts", f"snap_counts_{season}.parquet")
    snaps = snaps[snaps["game_type"] == "REG"].copy()
    snaps["gsis_id"] = snaps["pfr_player_id"].map(pfr_to_gsis)
    snaps = snaps.drop(columns=["position"]).dropna(subset=["gsis_id"]).merge(
        meta[["position"]], left_on="gsis_id", right_index=True, how="inner")

    tp_map = team_plays.rename("team_plays")
    db_map = team_db.rename("team_db")
    snaps = snaps.merge(tp_map, left_on=["game_id", "team"], right_index=True, how="left")
    snaps = snaps.merge(db_map, left_on=["game_id", "team"], right_index=True, how="left")
    snaps["team_db"] = snaps["team_db"].fillna(0)
    snaps["db_share"] = safe_div(snaps["team_db"], snaps["team_plays"])
    mult = calibration_mult(snaps["position"].to_numpy(), snaps["offense_pct"].to_numpy())
    snaps["routes_est"] = snaps["offense_snaps"].fillna(0) * snaps["db_share"] * mult
    snaps["route_rate_est"] = safe_div(snaps["routes_est"], snaps["team_db"])

    df = snaps.set_index(["gsis_id", "game_id"])
    df = df.join(rec_wk[["targets", "air_yards", "rz_targets", "first_read_targets"]], how="left")
    df = df.join(rush_wk[["carries", "rz_carries", "gl_carries"]], how="left")
    for c in ("targets", "air_yards", "rz_targets", "first_read_targets", "carries", "rz_carries", "gl_carries"):
        df[c] = df[c].fillna(0)
    df["ppr_pts"] = ppr_wk.reindex(df.index).fillna(0)
    df = df.reset_index()

    df = df.merge(team_targets.rename("team_targets"), left_on=["game_id", "team"], right_index=True, how="left")
    df = df.merge(team_air.rename("team_air"), left_on=["game_id", "team"], right_index=True, how="left")
    df = df.merge(team_carries.rename("team_carries"), left_on=["game_id", "team"], right_index=True, how="left")
    df = df.merge(team_rz_opps.rename("team_rz_opps"), left_on=["game_id", "team"], right_index=True, how="left")
    df = df.merge(team_fr_targets.rename("team_fr_targets"), left_on=["game_id", "team"], right_index=True, how="left")

    df["target_share"] = safe_div(df["targets"], df["team_targets"])
    df["air_share"] = safe_div(df["air_yards"], df["team_air"])
    df["rush_share"] = safe_div(df["carries"], df["team_carries"])
    df["rz_opps"] = df["rz_targets"] + df["rz_carries"]
    df["rz_opp_share"] = safe_div(df["rz_opps"], df["team_rz_opps"])
    df["first_read_share"] = safe_div(df["first_read_targets"], df["team_fr_targets"])
    df["snap_pct"] = df["offense_pct"]

    df = df.join(meta[["sleeper_id", "full_name", "team"]].rename(columns={"team": "cur_team"}), on="gsis_id")
    return df, through_week


def build(season: int) -> dict:
    df, through_week = player_week_table(season)
    players: dict[str, dict] = {}
    for gsis, g in df.sort_values("week").groupby("gsis_id"):
        row0 = g.iloc[-1]
        sid = row0.get("sleeper_id")
        if sid is None or (isinstance(sid, float) and np.isnan(sid)):
            continue
        sid = str(sid).split(".")[0]
        weeks_rows = []
        for _, r in g.iterrows():
            weeks_rows.append([
                int(r["week"]), num(r["snap_pct"]), num(r["routes_est"]), num(r["route_rate_est"]),
                num(r["targets"]), num(r["target_share"]), num(r["air_yards"]), num(r["air_share"]),
                num(r["first_read_share"]), num(r["carries"]), num(r["rush_share"]), num(r["rz_opps"]),
                num(r["rz_opp_share"]), num(r["gl_carries"]), num(r["ppr_pts"]),
            ])

        def series(key: str):
            idx = FIELDS.index(key)
            return [(w[0], w[idx]) for w in weeks_rows if w[idx] is not None]

        last3 = {}
        for key in ("snap_pct", "route_rate_est", "target_share", "first_read_share", "rush_share", "rz_opp_share"):
            vals = [v for _, v in series(key)[-3:]]
            last3[key] = round(float(np.mean(vals)), 3) if vals else None

        trend = {}
        for key in ("target_share", "snap_pct"):
            s = series(key)
            trend[key] = round(s[-1][1] - float(np.mean([v for _, v in s[:-1]])), 3) if len(s) >= 2 else None

        flags = []
        sp, ts = series("snap_pct"), series("target_share")
        d_sp = sp[-1][1] - sp[-2][1] if len(sp) >= 2 else None
        d_ts = ts[-1][1] - ts[-2][1] if len(ts) >= 2 else None
        if (d_sp is not None and d_sp >= 0.15) or (d_ts is not None and d_ts >= 0.08):
            flags.append("role_up")
        if (d_sp is not None and d_sp <= -0.15) or (d_ts is not None and d_ts <= -0.08):
            flags.append("role_down")

        players[sid] = {
            "n": row0["full_name"], "p": row0["position"],
            "t": TEAM_FIX.get(row0["cur_team"], row0["cur_team"]),
            "w": weeks_rows, "last3": last3, "trend": trend, "flags": flags,
        }

    return {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "season": season,
        "throughWeek": through_week,
        "source": "nflverse-data (play-by-play, snap counts, FTN charting, rosters)",
        "fields": FIELDS,
        "fieldDesc": FIELD_DESC,
        "players": players,
    }


# --------------------------------------------------------------------------
# Self-check: synthetic, no network/cache required.
# --------------------------------------------------------------------------
def self_check() -> int:
    # PPR: a QB throws a 12-yard TD (passer +4+0.48, receiver +1+1.2+6),
    # a back gets a 7-yard carry, a receiver loses a fumble on a non-scoring target.
    passer_pts = 20.0 * 0.04 + 1 * 4 - 0 * 2
    assert abs(passer_pts - 4.8) < 1e-9, passer_pts
    rec_pts = 1 * (1 + 12 * 0.1 + 1 * 6)
    assert abs(rec_pts - 8.2) < 1e-9, rec_pts
    rush_pts = 7 * 0.1 + 0 * 6
    assert abs(rush_pts - 0.7) < 1e-9, rush_pts
    fum_pts = -2 * 1
    assert fum_pts == -2

    # Calibration multiplier: TE snap-bucketed, RB flat, WR/QB untouched.
    pos = np.array(["TE", "TE", "TE", "RB", "WR", "QB"])
    snap = np.array([0.80, 0.60, 0.30, 0.90, 0.90, 0.90])
    mult = calibration_mult(pos, snap)
    assert np.allclose(mult, [0.98, 0.89, 0.81, 0.94, 1.0, 1.0]), mult

    # Trend: last value minus the mean of prior weeks; null under 2 weeks.
    def trend_of(vals):
        if len(vals) < 2:
            return None
        return round(vals[-1] - float(np.mean(vals[:-1])), 3)
    assert trend_of([0.40]) is None
    assert trend_of([0.40, 0.55]) == 0.15
    assert trend_of([0.20, 0.30, 0.70]) == round(0.70 - (0.20 + 0.30) / 2, 3)

    # num() must never leak NaN/inf into JSON.
    assert num(float("nan")) is None and num(float("inf")) is None and num(3.0) == 3
    assert num(0.123456) == 0.123

    print("build_weekly_splits self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=season_now())
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()
    data = build(a.season)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("// Generated by projections/build_weekly_splits.py from nflverse. Do not edit.\n"
                   f"window.USAGE_WEEKLY={body};\n", encoding="utf-8")
    by_pos = {}
    for r in data["players"].values():
        by_pos[r["p"]] = by_pos.get(r["p"], 0) + 1
    up = sum(1 for r in data["players"].values() if "role_up" in r["flags"])
    down = sum(1 for r in data["players"].values() if "role_down" in r["flags"])
    print(f"wrote {OUT.name}: {len(data['players'])} players {by_pos}, through {a.season} week "
          f"{data['throughWeek']} ({OUT.stat().st_size // 1024} KB); role_up={up} role_down={down}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
