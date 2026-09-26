"""Postgame data for the #game/:game_id page.

Writes, for every finished game of the season (nflverse play-by-play with an
END GAME row):
  site/data/games-YYYY.js       index, loaded when the page or the Games list
                                needs it, into window.GAME_INDEX_BY_SEASON[YYYY]
  site/data/games-YYYY-wNN.js   one file per week, loaded only for a game of that
                                week, into window.GAME_WEEKS["YYYY_NN"]

PAYLOAD. Teams use the site's codes (LAR, not nflverse's LA); game ids stay
nflverse's. side 0 is the away team, 1 the home team.
  index  {season, throughWeek, generated, source, weeks: [1, 2],
          games: {game_id: [week, away, home, away score, home score]}}
  week   {season, week, fields: {drive, play, rec}, games: {game_id: {
            away, home, as, hs,
            drives  [side, quarter, clock, start, end, plays, yds, time of possession,
                     result, start yards from own goal]
                    yds is scrimmage yards (pass, run, kneel, spike; sacks in,
                    penalties and two-point tries out), so a team's drives add
                    up to its offensive yards
            plays   [drive index or -1, quarter, clock, side, down (0 = none),
                     to go, yard line, desc, EPA, WP, WPA]; WP and WPA are the
                     offense's (the team with the ball)
            top     the ten play indexes with the largest absolute WPA
            rec     [side, gsis id, name, targets, rec, yds, air yds, EPA]
          }}}

    python projections/build_game_pages.py                 # current season
    python projections/build_game_pages.py --season 2025
    python projections/build_game_pages.py --self-check
    python projections/build_game_pages.py --cache D:/nflverse-cache --offline
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

import pandas as pd

import build_split_cube as cube   # cached nflverse fetch/read, season_now, load_js

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
TEAM_FIX = {"LA": "LAR"}
SCRIM = ("pass", "run", "qb_kneel", "qb_spike")
SOURCE = "nflverse play-by-play (drives, EPA, win probability)"
FIELDS = {
    "drive": ["side", "qtr", "clock", "start", "end", "plays", "yds", "top", "result", "yl"],
    "play": ["drive", "qtr", "clock", "side", "down", "togo", "yrdln", "desc", "epa", "wp", "wpa"],
    "rec": ["side", "gsis", "name", "tgt", "rec", "yds", "air", "epa"],
}
COLS = ["game_id", "week", "home_team", "away_team", "posteam", "qtr", "time", "down", "ydstogo", "yrdln", "desc",
        "play_type", "yards_gained", "epa", "wp", "wpa", "fixed_drive", "fixed_drive_result", "drive_start_yard_line",
        "drive_end_yard_line", "drive_play_count", "drive_time_of_possession", "drive_quarter_start",
        "drive_game_clock_start", "two_point_attempt", "pass_attempt", "receiver_player_id", "receiver_player_name",
        "complete_pass", "receiving_yards", "lateral_receiving_yards", "air_yards", "total_home_score", "total_away_score", "yardline_100"]


def fix(t):
    return TEAM_FIX.get(t, t)


def num(v, d=2):
    return None if pd.isna(v) else round(float(v), d)


def txt(v):
    return "" if pd.isna(v) else str(v)


def load(season: int) -> pd.DataFrame:
    p = cube.read("pbp", f"play_by_play_{season}.parquet", COLS)
    done = set(p.loc[p["desc"] == "END GAME", "game_id"])
    p = p[p["game_id"].isin(done)].copy()
    p["two_point_attempt"] = p["two_point_attempt"].fillna(0)
    p["scrim"] = p["play_type"].isin(SCRIM) & (p["two_point_attempt"] != 1)
    p["is_t"] = (p["play_type"].isin(["pass", "run"]) & p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)
                 & (p["two_point_attempt"] != 1))
    return p


def game(g: pd.DataFrame) -> dict:
    away, home = g["away_team"].iloc[0], g["home_team"].iloc[0]
    side = lambda t: 1 if t == home else 0
    # Real snaps and kicks only: GAME, END QUARTER and timeouts have no offense.
    k = g[g["posteam"].notna() & g["play_type"].notna() & g["desc"].notna()].reset_index(drop=True)
    drives, dix = [], {}
    for d, dp in k.groupby("fixed_drive", sort=False):
        s = dp[dp["scrim"]]
        if s.empty:
            continue
        f = dp.iloc[0]
        dix[d] = len(drives)
        drives.append([side(s["posteam"].iloc[0]), int(f["drive_quarter_start"]) if pd.notna(f["drive_quarter_start"]) else int(f["qtr"]),
                       txt(f["drive_game_clock_start"]), txt(f["drive_start_yard_line"]), txt(f["drive_end_yard_line"]),
                       int(f["drive_play_count"]) if pd.notna(f["drive_play_count"]) else len(s),
                       int(s["yards_gained"].fillna(0).sum()), txt(f["drive_time_of_possession"]),
                       txt(f["fixed_drive_result"]), int(100 - s["yardline_100"].iloc[0])])
    plays = [[dix.get(r.fixed_drive, -1), int(r.qtr), txt(r.time), side(r.posteam),
              0 if pd.isna(r.down) else int(r.down), 0 if pd.isna(r.ydstogo) else int(r.ydstogo), txt(r.yrdln),
              r.desc, num(r.epa), num(r.wp, 3), num(r.wpa, 3)] for r in k.itertuples()]
    top = k["wpa"].abs().dropna().sort_values(ascending=False, kind="stable").index[:10].tolist()
    t = k[k["is_t"]]
    rec = []
    for (tm, gs), r in t.groupby(["posteam", "receiver_player_id"]):
        rec.append([side(tm), gs, txt(r["receiver_player_name"].iloc[0]), len(r), int(r["complete_pass"].sum()),
                    int(r["receiving_yards"].fillna(0).sum()), int(r["air_yards"].fillna(0).sum()), num(r["epa"].sum())])
    rec.sort(key=lambda x: (x[0], -x[3], -x[5]))
    return {"away": fix(away), "home": fix(home), "as": int(g["total_away_score"].max()),
            "hs": int(g["total_home_score"].max()), "drives": drives, "plays": plays, "top": top, "rec": rec}


def dump(path: pathlib.Path, head: str, body: dict) -> int:
    path.write_text("// Generated by projections/build_game_pages.py from nflverse. Do not edit.\n"
                    f"{head}={json.dumps(body, ensure_ascii=False, separators=(',', ':'), allow_nan=False)};\n",
                    encoding="utf-8")
    return path.stat().st_size


def write(season: int) -> None:
    p = load(season)
    index = {"season": season, "throughWeek": int(p["week"].max()) if len(p) else 0,
             "generated": dt.datetime.now().isoformat(timespec="seconds"), "source": SOURCE, "weeks": [], "games": {}}
    for wk, w in p.groupby("week"):
        games = {gid: game(g) for gid, g in w.groupby("game_id", sort=True)}
        size = dump(DATA / f"games-{season}-w{int(wk):02d}.js",
                    f'(window.GAME_WEEKS=window.GAME_WEEKS||{{}})["{season}_{int(wk):02d}"]',
                    {"season": season, "week": int(wk), "fields": FIELDS, "games": games})
        index["weeks"].append(int(wk))
        for gid, G in games.items():
            index["games"][gid] = [int(wk), G["away"], G["home"], G["as"], G["hs"]]
        print(f"wrote games-{season}-w{int(wk):02d}.js: {len(games)} games, "
              f"{sum(len(G['plays']) for G in games.values())} plays, {size // 1024} KB")
    size = dump(DATA / f"games-{season}.js", f"(window.GAME_INDEX_BY_SEASON=window.GAME_INDEX_BY_SEASON||{{}})[{season}]", index)
    print(f"wrote games-{season}.js: {len(index['games'])} finished games, weeks {index['weeks']}, {size / 1024:.1f} KB")


def team_stats(season: int) -> pd.DataFrame | None:
    """nflverse's own team box scores, the independent side of the yardage check."""
    try:
        t = cube.read("stats_team", f"stats_team_week_{season}.parquet")
    except SystemExit:
        return None
    t = t.assign(team=t["team"].map(fix))
    t["off_yds"] = t["passing_yards"] - t["sack_yards_lost"].abs() + t["rushing_yards"]
    return t.set_index(["game_id", "team"])


def self_check(season: int) -> int:
    bad = []
    path = DATA / f"games-{season}.js"
    if not path.exists():
        print(f"build_game_pages self-check: {path.name} missing, run the builder first")
        return 1
    index = cube.load_js(path)
    p, ts = load(season), team_stats(season)
    p["posteam"] = p["posteam"].map(fix)
    fresh = p[p["scrim"]].groupby(["game_id", "posteam"])["yards_gained"].sum()
    # A lateral's yards count as team receiving yards but belong to the man who took the pitch, not the target.
    lat = p.groupby(["game_id", "posteam"])["lateral_receiving_yards"].sum()
    by_box = by_pbp = 0
    for wk in index["weeks"]:
        W = cube.load_js(DATA / f"games-{season}-w{wk:02d}.js")
        for gid, G in W["games"].items():
            if gid not in index["games"]:
                bad.append(f"{gid}: in week {wk} but not in the index")
            for s, tm in enumerate((G["away"], G["home"])):
                yds = sum(d[6] for d in G["drives"] if d[0] == s)
                r = [x for x in G["rec"] if x[0] == s]
                if ts is not None and (gid, tm) in ts.index:
                    box = ts.loc[(gid, tm)]
                    by_box += 1
                    want = {"yds": box["off_yds"], "tgt": box["targets"], "rec": box["receptions"],
                            "rec yds": box["receiving_yards"] - lat.get((gid, tm), 0)}
                else:
                    by_pbp += 1
                    want = {"yds": fresh.get((gid, tm), 0)}
                got = {"yds": yds, "tgt": sum(x[3] for x in r), "rec": sum(x[4] for x in r), "rec yds": sum(x[5] for x in r)}
                for k, v in want.items():
                    if int(v) != got[k]:
                        bad.append(f"{gid} {tm}: drive {k} {got[k]} vs team {int(v)}")
            wpa = sorted((abs(x[10]) for x in G["plays"] if x[10] is not None), reverse=True)[:10]
            if sorted((abs(G["plays"][i][10]) for i in G["top"]), reverse=True) != wpa:
                bad.append(f"{gid}: top plays are not the ten largest |WPA|")
            if any(x[0] >= len(G["drives"]) for x in G["plays"]):
                bad.append(f"{gid}: a play points past the drive list")
    n = len(index["games"])
    print(f"  {season}: {n} games, {by_box} team-games vs nflverse team stats (yards, targets, catches, receiving yards), "
          f"{by_pbp} vs play-by-play scrimmage yards")
    for m in bad[:20]:
        print("  " + m)
    if bad or not n:
        print(f"build_game_pages self-check: {len(bad) or 'no games'} problem(s)")
        return 1
    print("build_game_pages self-check ok: drive yards add up to team offensive yards")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, help="default: the current season")
    ap.add_argument("--cache", help="nflverse cache directory (default: NFLVERSE_CACHE or projections/nflverse-cache)")
    ap.add_argument("--offline", action="store_true", help="read local files only; never download")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.cache:
        cube.CACHE = pathlib.Path(a.cache)
    cube.OFFLINE = a.offline
    season = a.season or cube.season_now()
    if a.self_check:
        return self_check(season)
    write(season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
