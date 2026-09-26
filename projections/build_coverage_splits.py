"""Coverage, personnel, formation and pressure splits for the Stats Lab Coverage tab.

Writes site/data/coverage-YYYY.js for the current season and the two before it.
The page loads one only when the Coverage tab (or the Teams tab's shell columns)
asks for it, into window.COVERAGE_BY_SEASON[YYYY].

Source: nflverse pbp_participation (man/zone type, coverage shell, offensive
personnel and formation, the pressure flag, the 11 offensive players on the
field, and the targeted receiver's route) joined to nflverse play-by-play on
game id + play id. Regular season only, with the play rules of
build_nflverse_suite.py: plays are pass or run, a dropback is qb_dropback == 1,
a target is a pass attempt with a receiver.

Participation for a season is read from, in order: <participation dir>/<season>.csv,
<cache>/pbp_participation_<season>.parquet, then the nflverse release (skipped
with --offline). A season with none of them still gets a file saying
"published": false, so the page shows a not-published-yet state instead of a
404, and the first build after nflverse posts pbp_participation_<season> lights
it up with no code change.

PAYLOAD SHAPE. An unpublished season carries only season, published (false),
generated, source and note. A published one:

  season, published (true), throughWeek, generated, source
  splits       ["all", "man", "zone", "c0", "c1", "c2", "c2m", "c3", "c4", "c6", "pr", "cl"]
  splitLabels  {split: label}
  fields       {"R": ["db", "tgt", "rec", "yds", "td", "epa", "air"],
                "Q": ["db", "att", "cmp", "yds", "td", "int", "sk", "epa", "air"]}
  players      {sleeper_id: {"n": name, "p": position, "t": team,
                             "R": [one entry per split, in `splits` order: null, or numbers in fields.R order],
                             "Q": [the same, fields.Q order]}}
      R, as a receiver (any position): db = his team's dropbacks in the split with
      him on the field, tgt/rec/yds/td = targets, catches, yards and TDs on them,
      epa = EPA summed over his targets, air = air yards on his targets.
      aDOT = air / tgt; targets per on-field dropback = tgt / db.
      Q, as a passer: db = his dropbacks, att = pass attempts (sacks included, as
      nflverse counts them), sk = sacks, air = air yards thrown; aDOT = air / att.
  targetedRoutes {sleeper_id: {route: [tgt, rec, yds, td, epa, air]}}
      TARGETED routes, not routes run. Participation charts a route only for the
      receiver the ball went to, so this is the tree of routes each player was
      targeted on, never his full route tree. Route names are nflverse's labels:
      GO, POST, CORNER, IN/DIG, QUICK OUT, DEEP OUT, HITCH/CURL, SHALLOW CROSS/DRAG,
      SLANT, SCREEN, SWING, WHEEL, TEXAS/ANGLE. epa is the EPA sum, 2 decimals; air is the
      air yards summed over those targets (the Stats Lab Route Tree's air yards per target).
  teamFields   {"pers": ["11", "12", "21", "other"], "form": ["SHOTGUN", "UNDER CENTER", "PISTOL"],
                "cov": ["man", "zone", "c0", "c1", "c2", "c2m", "c3", "c4", "c6", "other"]}
  teams        {team: {"pers": counts, "form": counts, "dcov": counts, "ocov": counts}}
      pers and form: offensive plays by personnel (backs then tight ends) and formation.
      dcov: charted dropbacks the DEFENSE played; ocov: charted dropbacks the OFFENSE faced.
      Every team number is a count. A rate is count / sum(list); for cov it is
      count / (man + zone), and "other" is Cover 9, combo and blown coverages.
  league       {"tgt": {split: n}, "unmapped": {split: n}}
      Every regular-season target by split, and those whose receiver has no Sleeper id.
      --self-check proves players' tgt + unmapped == tgt == a fresh recount of the
      participation file for man and zone.

    python projections/build_coverage_splits.py               # current season + two before
    python projections/build_coverage_splits.py --season 2023
    python projections/build_coverage_splits.py --self-check
    python projections/build_coverage_splits.py --participation D:/pbp_participation --cache D:/nflverse-cache --offline
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

import build_split_cube as cube   # cached nflverse fetch/read, season_now, load_js

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
# Inputs can live outside this checkout (a git worktree reads the main checkout's):
# --participation / --cache, then the env var, then the repo-relative default.
PART = pathlib.Path(os.environ.get("FF_PARTICIPATION_DIR") or ROOT / "historical" / "pbp_participation")
cube.CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}

SPLITS = [("all", "All dropbacks"), ("man", "vs Man"), ("zone", "vs Zone"), ("c0", "Cover 0"), ("c1", "Cover 1"),
          ("c2", "Cover 2"), ("c2m", "2-Man"), ("c3", "Cover 3"), ("c4", "Cover 4"), ("c6", "Cover 6"),
          ("pr", "Pressured"), ("cl", "Clean pocket")]
SHELLS = {"c0": "COVER_0", "c1": "COVER_1", "c2": "COVER_2", "c2m": "2_MAN", "c3": "COVER_3", "c4": "COVER_4",
          "c6": "COVER_6"}
R_FIELDS = ["db", "tgt", "rec", "yds", "td", "epa", "air"]
Q_FIELDS = ["db", "att", "cmp", "yds", "td", "int", "sk", "epa", "air"]
PERS = ["11", "12", "21", "other"]
FORM = ["SHOTGUN", "UNDER CENTER", "PISTOL"]
COV = ["man", "zone", *SHELLS, "other"]
PRESSURE = {True: 1, False: 0, "TRUE": 1, "FALSE": 0, "True": 1, "False": 0, 1: 1, 0: 0}

PBP_COLS = ["game_id", "play_id", "season_type", "week", "play_type", "posteam", "defteam",
            "receiver_player_id", "passer_player_id", "pass_attempt", "qb_dropback", "complete_pass",
            "receiving_yards", "passing_yards", "pass_touchdown", "interception", "sack", "air_yards", "epa"]
PART_COLS = ["nflverse_game_id", "play_id", "offense_formation", "offense_personnel", "offense_players",
             "was_pressure", "route", "defense_man_zone_type", "defense_coverage_type"]


def participation(season: int):
    """(frame, source name), or (None, None) when nflverse has not posted the season."""
    csv = PART / f"{season}.csv"
    if csv.exists():
        return pd.read_csv(csv, usecols=PART_COLS, low_memory=False), csv.name
    name = f"pbp_participation_{season}.parquet"
    path = cube.CACHE / name
    if not cube.OFFLINE:
        # The current season re-downloads every few hours, as nflverse adds weeks to it.
        age = cube.MAX_AGE_H if season >= cube.season_now() else cube.FINISHED_SEASON_AGE_H
        try:
            path = cube.fetch("pbp_participation", name, age)
        except SystemExit as e:   # a 404 until nflverse publishes the season
            print(f"  {name}: not published ({e})")
    if not path.exists():
        return None, None
    return pd.read_parquet(path, columns=PART_COLS), name


def personnel(s) -> str:
    """'1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR' -> '11': backs (RB + FB), then tight ends."""
    if not isinstance(s, str):
        return "other"
    n = {pos: int(k) for k, pos in re.findall(r"(\d+)\s+([A-Z]+)", s)}
    code = f"{n.get('RB', 0) + n.get('FB', 0)}{n.get('TE', 0)}"
    return code if code in PERS else "other"


def plays(season: int, part: pd.DataFrame) -> pd.DataFrame:
    pbp = cube.read("pbp", f"play_by_play_{season}.parquet", PBP_COLS)
    p = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"])].copy()
    part = part.rename(columns={"nflverse_game_id": "game_id"}).drop_duplicates(["game_id", "play_id"])
    part["play_id"] = part["play_id"].astype(float)
    p["play_id"] = p["play_id"].astype(float)
    p = p.merge(part, on=["game_id", "play_id"], how="left")
    for k in ("posteam", "defteam"):
        p[k] = p[k].map(lambda x: TEAM_FIX.get(x, x))
    for k in ("complete_pass", "receiving_yards", "passing_yards", "pass_touchdown", "interception", "sack",
              "air_yards", "epa"):
        p[k] = p[k].fillna(0)
    p["is_t"] = (p["pass_attempt"] == 1) & p["receiver_player_id"].notna()
    p["is_db"] = p["qb_dropback"] == 1
    mz, cov, pr = p["defense_man_zone_type"], p["defense_coverage_type"], p["was_pressure"].map(PRESSURE)
    p["s_all"] = True
    p["s_man"], p["s_zone"] = mz == "MAN_COVERAGE", mz == "ZONE_COVERAGE"
    for k, v in SHELLS.items():
        p[f"s_{k}"] = cov == v
    p["s_pr"], p["s_cl"] = pr == 1, pr == 0
    return p


def per_split(g: pd.DataFrame, key: str, agg: dict, fields: list, extra: pd.DataFrame | None = None) -> dict:
    """{player id: [one entry per split]} with an entry null when the split is empty."""
    cols = {}
    for s, _ in SPLITS:
        t = g[g[f"s_{s}"]].groupby(key).agg(**agg)
        if extra is not None:
            t = t.join(extra[f"s_{s}"].rename("db"), how="outer")
        cols[s] = t.reindex(columns=fields).fillna(0)
    out = {}
    for pid in set().union(*(c.index for c in cols.values())):
        row = []
        for s, _ in SPLITS:
            c = cols[s]
            vals = c.loc[pid].tolist() if pid in c.index else [0] * len(fields)
            row.append([round(v, 2) if f == "epa" else int(round(v)) for f, v in zip(fields, vals)] if any(vals) else None)
        out[pid] = row
    return out


def build(season: int) -> dict:
    base = {"season": season, "generated": dt.datetime.now().isoformat(timespec="seconds"),
            "source": "nflverse-data pbp_participation joined to play-by-play"}
    part, src = participation(season)
    if part is None:
        return {**base, "published": False,
                "note": f"nflverse has not posted pbp_participation_{season} yet. Coverage, personnel, formation "
                        "and pressure charting for this season appears the first build after it does."}
    roster = cube.read("rosters", f"roster_{season}.parquet")
    roster = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    roster = roster[roster["position"].isin(SKILL) & roster["gsis_id"].notna() & roster["sleeper_id"].notna()]
    p = plays(season, part)
    scols = [f"s_{s}" for s, _ in SPLITS]

    t = p[p["is_t"]]
    d = p[p["is_db"] & p["offense_players"].notna()]
    on_field = d[scols].assign(gsis=d["offense_players"].str.split(";")).explode("gsis").groupby("gsis")[scols].sum()
    rec = per_split(t, "receiver_player_id", dict(
        tgt=("play_id", "size"), rec=("complete_pass", "sum"), yds=("receiving_yards", "sum"),
        td=("pass_touchdown", "sum"), epa=("epa", "sum"), air=("air_yards", "sum")), R_FIELDS, on_field)
    q = p[p["is_db"] & p["passer_player_id"].notna()]
    pas = per_split(q, "passer_player_id", dict(
        db=("play_id", "size"), att=("pass_attempt", "sum"), cmp=("complete_pass", "sum"),
        yds=("passing_yards", "sum"), td=("pass_touchdown", "sum"), int=("interception", "sum"),
        sk=("sack", "sum"), epa=("epa", "sum"), air=("air_yards", "sum")), Q_FIELDS)
    rt = t[t["route"].notna()].groupby(["receiver_player_id", "route"]).agg(
        tgt=("play_id", "size"), rec=("complete_pass", "sum"), yds=("receiving_yards", "sum"),
        td=("pass_touchdown", "sum"), epa=("epa", "sum"), air=("air_yards", "sum"))

    players, routes, mapped, has_routes = {}, {}, set(), set(rt.index.get_level_values(0))
    for row in roster.itertuples(index=False):
        g, sid = row.gsis_id, str(row.sleeper_id).split(".")[0]
        # A receiver needs a target; on-field dropbacks alone are not a row.
        r = rec.get(g)
        if not (r and r[0] and r[0][1]):
            r = None
        if not r and g not in pas:
            continue
        mapped.add(g)
        v = {"n": row.full_name, "p": row.position, "t": TEAM_FIX.get(row.team, row.team)}
        if r:
            v["R"] = r
        if g in pas:
            v["Q"] = pas[g]
        players[sid] = v
        if r and g in has_routes:
            routes[sid] = {name: [int(x.tgt), int(x.rec), int(x.yds), int(x.td), round(float(x.epa), 2), int(round(x.air))]
                           for name, x in rt.loc[g].sort_values("tgt", ascending=False).iterrows()}

    def count(frame, key, codes):
        return frame.groupby(key).value_counts().unstack(fill_value=0).reindex(columns=codes, fill_value=0)
    o = p[p["offense_personnel"].notna()].assign(pers=lambda x: x["offense_personnel"].map(personnel))
    pers = count(o[["posteam", "pers"]], "posteam", PERS)
    form = count(p.loc[p["offense_formation"].notna(), ["posteam", "offense_formation"]], "posteam", FORM)
    ch = p[p["is_db"] & p["defense_man_zone_type"].notna()].copy()
    for k in SHELLS:
        ch[k] = ch[f"s_{k}"].astype(int)
    ch["man"], ch["zone"] = ch["s_man"].astype(int), ch["s_zone"].astype(int)
    ch["other"] = ch["man"] + ch["zone"] - ch[list(SHELLS)].sum(axis=1)
    dcov, ocov = ch.groupby("defteam")[COV].sum(), ch.groupby("posteam")[COV].sum()
    teams = {}
    for tm in sorted(set(pers.index) | set(dcov.index)):
        get = lambda f: [int(x) for x in f.loc[tm]] if tm in f.index else [0] * len(f.columns)
        teams[tm] = {"pers": get(pers), "form": get(form), "dcov": get(dcov), "ocov": get(ocov)}

    league = {"tgt": {s: int(t[f"s_{s}"].sum()) for s, _ in SPLITS},
              "unmapped": {s: int(t.loc[~t["receiver_player_id"].isin(mapped), f"s_{s}"].sum()) for s, _ in SPLITS}}
    return {**base, "published": True, "throughWeek": int(p.loc[p["offense_players"].notna(), "week"].max()),
            "source": f"{base['source']} ({src})",
            "splits": [s for s, _ in SPLITS], "splitLabels": dict(SPLITS),
            "fields": {"R": R_FIELDS, "Q": Q_FIELDS},
            "players": players, "targetedRoutes": routes,
            "teamFields": {"pers": PERS, "form": FORM, "cov": COV}, "teams": teams, "league": league}


def write(season: int) -> pathlib.Path:
    data = build(season)
    out = DATA / f"coverage-{season}.js"
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    out.write_text("// Generated by projections/build_coverage_splits.py from nflverse. Do not edit.\n"
                   f"(window.COVERAGE_BY_SEASON=window.COVERAGE_BY_SEASON||{{}})[{season}]={body};\n",
                   encoding="utf-8")
    kb = out.stat().st_size // 1024
    if data["published"]:
        print(f"wrote {out.name}: {len(data['players'])} players, {len(data['targetedRoutes'])} route trees, "
              f"{len(data['teams'])} teams, through week {data['throughWeek']}, {kb} KB")
    else:
        print(f"wrote {out.name}: participation not published yet, {kb} KB")
    return out


def self_check() -> int:
    assert personnel("1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR") == "11"
    assert personnel("1 C, 1 FB, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 2 WR") == "21"
    assert personnel("1 RB, 2 TE, 2 WR") == "12"
    assert personnel("1 C, 2 G, 1 QB, 2 T, 1 TE, 4 WR") == "other" and personnel(None) == "other"
    cube.OFFLINE = True   # read-only: never download while checking
    cur, bad = cube.season_now(), 0
    for season in (cur - 2, cur - 1, cur):
        path = DATA / f"coverage-{season}.js"
        if not path.exists():
            print(f"  {season}: {path.name} missing, run the builder first")
            bad += 1
            continue
        C = cube.load_js(path)
        part, src = participation(season)
        if part is None or not C.get("published"):
            ok = part is None and C.get("published") is False
            bad += not ok
            print(f"  {season}: participation {'on disk' if part is not None else 'not published'}, "
                  f"file published={C.get('published')} {'ok' if ok else 'MISMATCH, rebuild'}")
            continue
        # A fresh recount, not build()'s merge: key sets from each file.
        pbp = cube.read("pbp", f"play_by_play_{season}.parquet",
                        ["game_id", "play_id", "season_type", "play_type", "pass_attempt", "receiver_player_id"])
        tg = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"])
                 & (pbp["pass_attempt"] == 1) & pbp["receiver_player_id"].notna()]
        keys = set(zip(tg["game_id"], tg["play_id"].astype(float)))
        charted = part[part["defense_man_zone_type"].notna()]
        line = []
        for typ, s in (("MAN_COVERAGE", "man"), ("ZONE_COVERAGE", "zone")):
            rows = charted[charted["defense_man_zone_type"] == typ]
            want = sum((g, float(i)) in keys for g, i in zip(rows["nflverse_game_id"], rows["play_id"]))
            i = C["splits"].index(s)
            mine = sum(v["R"][i][1] for v in C["players"].values() if v.get("R") and v["R"][i])
            league, unm = C["league"]["tgt"][s], C["league"]["unmapped"][s]
            if not want == league == mine + unm:
                bad += 1
                print(f"  MISMATCH {season} {s}: participation recount {want}, file league {league}, "
                      f"players {mine} + unmapped {unm}")
            line.append(f"{s} {want} (players {mine} + unmapped {unm})")
        print(f"  {season}: {len(charted)} charted man/zone rows in {src}; REG targets {', '.join(line)}")
        # The "all" split keeps the suite's play rules, so it ties out to advanced.js.
        ap = DATA / ("advanced.js" if season == cur else f"advanced-{season}.js")
        if ap.exists():
            A = cube.load_js(ap)
            for pos, key, role, j in (("WR", "targets", "R", 1), ("TE", "targets", "R", 1), ("QB", "dropbacks", "Q", 0)):
                top = sorted(((sid, a) for sid, a in A["players"].items() if a.get("p") == pos and sid in C["players"]),
                             key=lambda x: -(x[1].get(key) or 0))[:5]
                for sid, a in top:
                    have = ((C["players"][sid].get(role) or [None])[0] or [0] * 9)[j]
                    if have != (a.get(key) or 0):
                        bad += 1
                        print(f"  MISMATCH {season} {a['n']}: {key} advanced={a.get(key)} coverage all={have}")
    print(f"build_coverage_splits self-check: {bad} problem(s)")
    if bad:
        return 1
    print("build_coverage_splits self-check ok")
    return 0


def main() -> int:
    global PART
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, help="one season; default is the current one plus the two before it")
    ap.add_argument("--participation", help="folder of <season>.csv participation files "
                                            "(default: FF_PARTICIPATION_DIR or historical/pbp_participation)")
    ap.add_argument("--cache", help="nflverse cache directory (default: NFLVERSE_CACHE or projections/nflverse-cache)")
    ap.add_argument("--offline", action="store_true", help="read local files only; never download")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.participation:
        PART = pathlib.Path(a.participation)
    if a.cache:
        cube.CACHE = pathlib.Path(a.cache)
    cube.OFFLINE = a.offline
    if a.self_check:
        return self_check()
    cur = cube.season_now()
    for y in ([a.season] if a.season else [cur - 2, cur - 1, cur]):
        write(y)
    return 0


if __name__ == "__main__":
    sys.exit(main())
