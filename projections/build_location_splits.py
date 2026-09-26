"""Field location maps for Stats Lab and the player card.

Writes site/data/location-YYYY.js for the current season and the two before it:

  * per QB, his dropbacks by pass_location (left, middle, right) x depth band
    (behind the line, 0-9, 10-19, 20+ air yards): attempts, completions, yards,
    EPA, FTN-charted attempts and catchable balls among them;
  * per receiver (WR, TE, RB), the same grid over his targets;
  * per RB, his carries by run_location x run_gap: left end, left tackle, left
    guard, middle, right guard, right tackle, right end.

Every number is a COUNT (EPA in integer hundredths), never a rate, so the page
can add seasons together and divide afterwards. A grid is 12 cells, depth-major
(cell = depth * 3 + column), then cell 12 for plays with no charted location;
a QB grid adds cell 13 for sacks, which have no target spot. The run chart is
7 gaps plus cell 7 for carries with no charted gap. Those extra cells are what
make every grid add back up to the season totals in advanced.js, and
--self-check proves it on the written files.

Catchable counts only plays FTN charted (its file can trail play-by-play by a
week), so each cell carries its own FTN denominator and the page says how many
attempts it covers.

This builder only READS the nflverse cache that build_nflverse_suite.py keeps
fresh, so it never downloads and never writes there.

    python projections/build_location_splits.py                 # current season + two before
    python projections/build_location_splits.py --season 2025
    python projections/build_location_splits.py --self-check
    python projections/build_location_splits.py --cache D:/nflverse-cache
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
# The cache can live outside this checkout (a git worktree reads the main
# checkout's): --cache, then NFLVERSE_CACHE, then the repo-relative default.
CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
DATA = ROOT / "site" / "data"
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}

COLS = ["Left", "Middle", "Right"]
DEPTHS = ["Behind LOS", "0-9", "10-19", "20+"]          # shallow to deep; cell = depth * 3 + column
GAPS = ["Left end", "Left tackle", "Left guard", "Middle", "Right guard", "Right tackle", "Right end"]
GAP_KEY = {("left", "end"): 0, ("left", "tackle"): 1, ("left", "guard"): 2, ("middle", None): 3,
           ("right", "guard"): 4, ("right", "tackle"): 5, ("right", "end"): 6}
FIELDS = {"Q": ["att", "cmp", "yds", "epa", "ftn", "catch"],
          "R": ["tgt", "rec", "yds", "epa", "ftn", "catch"],
          "U": ["car", "yds", "epa", "succ"]}
CELLS = {"Q": 14, "R": 13, "U": 8}
UNKNOWN = {"Q": 12, "R": 12, "U": 7}
SACK = 13
ROLE_POS = {"Q": ("QB",), "R": ("WR", "TE", "RB"), "U": ("RB",)}

PBP_COLS = ["game_id", "play_id", "season_type", "week", "play_type", "passer_player_id", "receiver_player_id",
            "rusher_player_id", "pass_attempt", "rush_attempt", "qb_dropback", "sack", "complete_pass",
            "passing_yards", "receiving_yards", "rushing_yards", "epa", "success", "pass_location",
            "air_yards", "run_location", "run_gap"]


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def grid_cell(loc: pd.Series, air: pd.Series) -> np.ndarray:
    """Depth-major cell 0-11 from pass_location and air_yards; 12 when either is missing."""
    col = loc.map({"left": 0, "middle": 1, "right": 2}).to_numpy(dtype=float)
    a = air.to_numpy(dtype=float)
    depth = np.select([a < 0, a < 10, a < 20], [0, 1, 2], 3)
    return np.where(np.isnan(col) | np.isnan(a), 12, depth * 3 + np.nan_to_num(col)).astype(int)


def gap_cell(loc: pd.Series, gap: pd.Series) -> np.ndarray:
    """Gap 0-6 from run_location x run_gap; 7 when the gap was not charted."""
    return np.array([GAP_KEY.get((l, g if l != "middle" and isinstance(g, str) else None), 7) if isinstance(l, str) else 7
                     for l, g in zip(loc.to_numpy(), gap.to_numpy())], dtype=int)


def flat(g: pd.DataFrame, pid: str, role: str, agg: dict) -> dict:
    """{gsis_id: [cells x fields ints]} from plays already tagged with a cell."""
    out = g.groupby([pid, "cell"]).agg(**agg)
    out["epa"] = (out["epa"] * 100).round()
    nf, res = len(FIELDS[role]), {}
    for gid, df in out.groupby(level=0):
        a = np.zeros(CELLS[role] * nf, dtype=np.int64)
        for cell, row in zip(df.index.get_level_values(1), df[FIELDS[role]].to_numpy()):
            a[cell * nf:(cell + 1) * nf] = np.nan_to_num(row).astype(np.int64)
        res[gid] = a.tolist()
    return res


def build(season: int) -> dict:
    roster = pd.read_parquet(CACHE / f"roster_{season}.parquet")
    roster = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    roster = roster[roster["position"].isin(SKILL) & roster["gsis_id"].notna() & roster["sleeper_id"].notna()]

    pbp = pd.read_parquet(CACHE / f"play_by_play_{season}.parquet", columns=PBP_COLS)
    p = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"])].copy()
    fp = CACHE / f"ftn_charting_{season}.parquet"
    p["play_id"] = p["play_id"].astype(float)
    if fp.exists():
        ftn = pd.read_parquet(fp, columns=["nflverse_game_id", "nflverse_play_id", "is_catchable_ball"]) \
            .rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
        ftn["play_id"] = ftn["play_id"].astype(float)
        p = p.merge(ftn.drop_duplicates(["game_id", "play_id"]), on=["game_id", "play_id"], how="left")
    else:
        p["is_catchable_ball"] = np.nan
    cb = p["is_catchable_ball"].astype(float)
    p["ftn"] = cb.notna().astype(int)
    p["catch"] = (cb == 1).astype(int)
    for k in ("passing_yards", "receiving_yards", "rushing_yards", "epa", "success", "complete_pass"):
        p[k] = p[k].fillna(0)
    p["week"] = p["week"].astype(int)
    p["cell"] = grid_cell(p["pass_location"], p["air_yards"])

    # Same play filters as build_nflverse_suite.py, so the sums land on advanced.js.
    q = p[p["passer_player_id"].notna() & (p["qb_dropback"] == 1)].copy()
    q.loc[q["sack"] == 1, "cell"] = SACK
    t = p[p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)]
    r = p[p["rusher_player_id"].notna() & (p["rush_attempt"] == 1)].copy()
    r["cell"] = gap_cell(r["run_location"], r["run_gap"])

    roles = {
        "Q": flat(q, "passer_player_id", "Q", dict(att=("play_id", "size"), cmp=("complete_pass", "sum"),
                  yds=("passing_yards", "sum"), epa=("epa", "sum"), ftn=("ftn", "sum"), catch=("catch", "sum"))),
        "R": flat(t, "receiver_player_id", "R", dict(tgt=("play_id", "size"), rec=("complete_pass", "sum"),
                  yds=("receiving_yards", "sum"), epa=("epa", "sum"), ftn=("ftn", "sum"), catch=("catch", "sum"))),
        "U": flat(r, "rusher_player_id", "U", dict(car=("play_id", "size"), yds=("rushing_yards", "sum"),
                  epa=("epa", "sum"), succ=("success", "sum"))),
    }
    players = {}
    for row in roster.itertuples(index=False):
        rec = {k: roles[k][row.gsis_id] for k in roles if row.position in ROLE_POS[k] and row.gsis_id in roles[k]}
        if rec:
            players[str(row.sleeper_id).split(".")[0]] = {"n": row.full_name, "p": row.position,
                                                          "t": TEAM_FIX.get(row.team, row.team), **rec}
    ftn_weeks = p.loc[p["ftn"] == 1, "week"]
    return {
        "season": season,
        "throughWeek": int(p["week"].max()) if len(p) else 0,
        "ftnThroughWeek": int(ftn_weeks.max()) if len(ftn_weeks) else 0,
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source": "nflverse-data play-by-play (pass_location, air_yards, run_location, run_gap) and FTN charting",
        "cols": COLS, "depths": DEPTHS, "gaps": GAPS,
        "fields": FIELDS, "cells": CELLS, "unknown": UNKNOWN, "sack": SACK,
        "players": players,
    }


def write(season: int) -> pathlib.Path:
    data = build(season)
    out = DATA / f"location-{season}.js"
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    # Loaded only when a map is on screen, into a registry keyed by year.
    out.write_text("// Generated by projections/build_location_splits.py from nflverse. Do not edit.\n"
                   f"(window.LOCATION_BY_SEASON=window.LOCATION_BY_SEASON||{{}})[{season}]={body};\n",
                   encoding="utf-8")
    n = {k: sum(k in v for v in data["players"].values()) for k in "QRU"}
    print(f"wrote {out.name}: {n['Q']} passers, {n['R']} receivers, {n['U']} RBs, through week "
          f"{data['throughWeek']} (FTN through {data['ftnThroughWeek']}), {out.stat().st_size // 1024} KB")
    return out


# --------------------------------------------------------------------------
# Self-check: every grid, extra cells included, adds back up to advanced.js.
# --------------------------------------------------------------------------
def load_js(path: pathlib.Path) -> dict:
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"\]=\{|ADVANCED=\{", txt)
    return json.loads(txt[m.end() - 1:].rstrip().rstrip(";"))


def sums(a: list, role: str) -> dict:
    f = FIELDS[role]
    return {k: sum(a[i + j] for i in range(0, len(a), len(f))) for j, k in enumerate(f)}


# (advanced.js key, volume key, numerator key or None, divide EPA by 100, tolerance)
CHECKS = {
    "Q": [("dropbacks", "att", None, 0), ("ypa", "att", "yds", 0.05), ("db_epa", "att", "epa", 0.005),
          ("catchable_throw_rate", "ftn", "catch", 0.0005)],
    "R": [("targets", "tgt", None, 0), ("catch_rate", "tgt", "rec", 0.0005), ("yds_per_target", "tgt", "yds", 0.05),
          ("epa_per_target", "tgt", "epa", 0.005), ("catchable_rate", "ftn", "catch", 0.0005)],
    "U": [("carries", "car", None, 0), ("ypc", "car", "yds", 0.05), ("epa_per_rush", "car", "epa", 0.005),
          ("rush_success", "car", "succ", 0.0005)],
}
VOLUME = {"Q": "dropbacks", "R": "targets", "U": "carries"}


def self_check() -> int:
    # Cells land where the page expects them.
    loc = pd.Series(["left", "middle", "right", "left", "right", None, "middle"])
    air = pd.Series([-2.0, 0.0, 9.9, 10.0, 25.0, 5.0, np.nan])
    assert grid_cell(loc, air).tolist() == [0, 4, 5, 6, 11, 12, 12], grid_cell(loc, air)
    g = gap_cell(pd.Series(["left", "middle", "right", None, "left", "right"]),
                 pd.Series(["end", None, "tackle", None, None, "guard"]))
    assert g.tolist() == [0, 3, 5, 7, 7, 4], g
    # The page reads the same labels (LOC_* in site/js/app.js).
    app = (ROOT / "site" / "js" / "app.js").read_text(encoding="utf-8")
    assert "LOCATION_BY_SEASON" in app and "location-${" in app, "app.js no longer loads location-YYYY.js"

    cur = season_now()
    bad = checked = 0
    for season in (cur - 2, cur - 1, cur):
        lp = DATA / f"location-{season}.js"
        ap = DATA / ("advanced.js" if season == cur else f"advanced-{season}.js")
        if not lp.exists() or not ap.exists():
            print(f"  {season}: {lp.name} or {ap.name} missing, run the builders first")
            bad += 1
            continue
        L, A = load_js(lp), load_js(ap)
        for sid, v in L["players"].items():
            for role in "QRU":
                if role in v:
                    a = v[role]
                    ok = len(a) == CELLS[role] * len(FIELDS[role]) and min(a[i] for i in range(0, len(a), len(FIELDS[role]))) >= 0
                    if role != "U":
                        nf = len(FIELDS[role])
                        ok = ok and all(a[i + 1] <= a[i] and a[i + 5] <= a[i + 4] <= a[i] for i in range(0, len(a), nf))
                    if not ok:
                        bad += 1
                        print(f"  BAD CELLS {season} {v['n']} {role}")
        for sid, a in A["players"].items():
            for role, keys in CHECKS.items():
                if a.get("p") not in ROLE_POS[role] or not a.get(VOLUME[role]):
                    continue
                grid = (L["players"].get(sid) or {}).get(role)
                if grid is None:
                    bad += 1
                    print(f"  MISSING {season} {a['n']} {role}: {a[VOLUME[role]]} {VOLUME[role]} in advanced.js, no grid")
                    continue
                s = sums(grid, role)
                checked += 1
                for key, vol, num, tol in keys:
                    want = a.get(key)
                    if num is None:
                        have = s[vol]
                    else:
                        have = (s[num] / 100 if num == "epa" else s[num]) / s[vol] if s[vol] else None
                        # EPA is stored per cell in hundredths: allow half a hundredth per cell.
                        tol = tol + (0.005 * CELLS[role] / s[vol] if num == "epa" and s[vol] else 0)
                    if want is None and have is None:
                        continue
                    if want is None or have is None or abs(want - have) > tol + 1e-9:
                        bad += 1
                        print(f"  MISMATCH {season} {a['n']} {role} {key}: advanced={want} grid={have}")
    print(f"build_location_splits self-check: {checked} player grids checked, {bad} problem(s)")
    if bad:
        return 1
    print("build_location_splits self-check ok")
    return 0


def main() -> int:
    global CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, help="one season; default is the current one plus the two before it")
    ap.add_argument("--cache", help="nflverse cache directory (default: NFLVERSE_CACHE or projections/nflverse-cache)")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.cache:
        CACHE = pathlib.Path(a.cache)
    if a.self_check:
        return self_check()
    cur = season_now()
    for y in ([a.season] if a.season else [cur - 2, cur - 1, cur]):
        write(y)
    return 0


if __name__ == "__main__":
    sys.exit(main())
