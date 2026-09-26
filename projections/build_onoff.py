"""On/off and game splits for the Stats Lab On/Off tab.

Writes site/data/onoff-YYYY.js for the current season and the three before it.
The page loads one only when the On/Off tab asks for it, into
window.ONOFF_BY_SEASON[YYYY].

ON/OFF. For every skill player (QB, RB, WR, TE) with MIN_SNAPS+ offensive snaps
for a team: that team's plays with him on the field and off it, and every
teammate's targets and dropbacks on each side.
  * A season nflverse has posted pbp_participation for is PLAY level: the 11
    offense_players on each play, joined to play-by-play on game id + play id.
    A snap is a charted regular-season pass or run play (build_nflverse_suite.py's
    play rules), so on + off is exactly the team's charted plays.
  * A season without participation (2026 today) is GAME level, from snap counts:
    a game is "with" him when he played 10%+ of the team's offensive snaps and
    "without" otherwise (inactive, or under 10%). Snaps are summed from snap
    counts; team numbers are every play of those games.

GAME SPLITS. Every team-season's games grouped by starting QB (the passer with
the most dropbacks that game) and by playcaller (historical/play_callers.csv,
switched mid-season only where its notes say the play caller was fired in week
N and the OC column names a successor). Each group: games, plays, EPA, neutral
PROE, team targets, and every skill player's games, full PPR points and targets.

PAYLOAD. Every number is a count or a sum except proe; the page divides.
  season, level ("play" | "game"), throughWeek, minSnaps, smallSample, note
  T      ["plays", "pass", "db", "epa", "succ", "tgt"]: plays, pass attempts
         (sacks in, scrambles out, as the Teams tab's pass rate), dropbacks, EPA
         sum, successful plays, targets
  names  {pid: [name, position]}   pid is the Sleeper id, else the gsis id
  teams  {team: {
    games  team games in the window
    tot    T for the team
    r      {pid: [tgt, db]} every skill teammate with a target: his targets, and the
           dropbacks he was on the field for (play) or team dropbacks in games he
           played (game)
    on     {pid: {s: snaps, g: games he was "with" (game level only),
                  v: T with him on the field (off = tot - v),
                  m: {teammate pid: [targets, dropbacks] with him on; off = r - m}}}
    qb, pc [{id, g, pl, epa, proe, tgt, w (pc only: [first week, last week]),
             P: {pid: [games, PPR, targets]}}]
  }}

    python projections/build_onoff.py                 # current season + three before
    python projections/build_onoff.py --season 2025
    python projections/build_onoff.py --self-check
    python projections/build_onoff.py --participation D:/pbp_participation --cache D:/nflverse-cache --offline
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
import build_coverage_splits as cov   # participation loader

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
# Inputs can live outside this checkout (a git worktree reads the main checkout's):
# the flag, then the env var, then the repo-relative default.
cov.PART = pathlib.Path(os.environ.get("FF_PARTICIPATION_DIR") or ROOT / "historical" / "pbp_participation")
CALLERS = pathlib.Path(os.environ.get("FF_PLAY_CALLERS") or ROOT / "historical" / "play_callers.csv")
ROSTERS = ROOT / "historical" / "rosters"
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}
MIN_SNAPS = 100
SMALL = 50          # the page flags a side with fewer plays than this
GAME_PCT = 0.10     # under this share of the offensive snaps, a game is "without" him
T = ["plays", "pass", "db", "epa", "succ", "tgt"]

PBP_COLS = ["game_id", "play_id", "season_type", "week", "play_type", "posteam", "pass_attempt", "rush_attempt",
            "qb_dropback", "epa", "success", "wp", "half_seconds_remaining", "pass_oe", "passer_id",
            "passer_player_id", "receiver_player_id", "rusher_player_id", "complete_pass", "passing_yards",
            "receiving_yards", "rushing_yards", "pass_touchdown", "rush_touchdown", "interception",
            "fumble_lost", "fumbled_1_player_id", "two_point_attempt", "two_point_conv_result", "td_player_id",
            "lateral_receiver_player_id", "lateral_receiving_yards", "lateral_rusher_player_id", "lateral_rushing_yards"]


def fix(s: pd.Series) -> pd.Series:
    return s.map(lambda x: TEAM_FIX.get(x, x))


def roster(season: int) -> pd.DataFrame:
    """Skill players, one row per gsis id: the cached nflverse roster, else the tracked CSV."""
    name = f"roster_{season}.parquet"
    if (cube.CACHE / name).exists() or not cube.OFFLINE:
        try:
            r = cube.read("rosters", name)
        except SystemExit:
            r = pd.read_csv(ROSTERS / f"{season}.csv", low_memory=False)
    else:
        r = pd.read_csv(ROSTERS / f"{season}.csv", low_memory=False)
    r = r.sort_values("week").drop_duplicates("gsis_id", keep="last")
    r = r[r["position"].isin(SKILL) & r["gsis_id"].notna()].copy()
    r["pid"] = [str(s).split(".")[0] if pd.notna(s) and str(s).strip() else g for s, g in zip(r["sleeper_id"], r["gsis_id"])]
    return r


def plays(season: int) -> pd.DataFrame:
    pbp = cube.read("pbp", f"play_by_play_{season}.parquet", PBP_COLS)
    p = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"]) & pbp["posteam"].notna()].copy()
    p["posteam"] = fix(p["posteam"])
    p["play_id"] = p["play_id"].astype(float)
    for k in ("epa", "success", "pass_attempt", "qb_dropback", "complete_pass", "passing_yards", "receiving_yards",
              "rushing_yards", "pass_touchdown", "rush_touchdown", "interception", "fumble_lost", "two_point_attempt",
              "lateral_receiving_yards", "lateral_rushing_yards"):
        p[k] = p[k].fillna(0)
    p["is_t"] = (p["pass_attempt"] == 1) & p["receiver_player_id"].notna()
    p["plays"], p["pass"], p["db"], p["succ"], p["tgt"] = 1, p["pass_attempt"], p["qb_dropback"], p["success"], p["is_t"].astype(int)
    return p


def ppr(p: pd.DataFrame) -> pd.DataFrame:
    """Full PPR by (game, player) from play-by-play, nflverse's fantasy_points_ppr rules:
    pass yd 0.04, pass TD 4, INT -2, rush/rec yd 0.1, TD 6, catch 1, 2-pt 2, fumble lost -2.
    The touchdown goes to whoever scored it (td_player_id), so a hook-and-lateral pays the
    lateral man. Kick and punt return touchdowns come from returns()."""
    two = (p["two_point_attempt"] == 1) & (p["two_point_conv_result"] == "success")
    reg = p["two_point_attempt"] == 0
    parts = [
        (p["passer_player_id"], p["passing_yards"] * 0.04 + p["pass_touchdown"] * 4 - p["interception"] * 2 + two * 2),
        (p["rusher_player_id"], p["rushing_yards"] * 0.1 + two * 2),
        (p["receiver_player_id"], reg * p["complete_pass"] * (1 + p["receiving_yards"] * 0.1) + two * 2),
        (p["lateral_receiver_player_id"], p["lateral_receiving_yards"] * 0.1),
        (p["lateral_rusher_player_id"], p["lateral_rushing_yards"] * 0.1),
        (p["td_player_id"], 6.0 * ((p["pass_touchdown"] + p["rush_touchdown"]) > 0)),
        (p["fumbled_1_player_id"], -2.0 * p["fumble_lost"]),
    ]
    out = pd.concat([pd.DataFrame({"game_id": p["game_id"], "posteam": p["posteam"], "gsis": who, "pts": pts})
                     for who, pts in parts])
    out = out[out["gsis"].notna() & (out["pts"] != 0)]
    return out.groupby(["game_id", "posteam", "gsis"], as_index=False)["pts"].sum()


def returns(season: int) -> pd.DataFrame:
    """Kick and punt return touchdowns, 6 each to the returner, on his (the receiving) team."""
    r = cube.read("pbp", f"play_by_play_{season}.parquet", ["game_id", "season_type", "play_type", "return_touchdown",
                                                                "td_player_id", "td_team"])
    r = r[(r["season_type"] == "REG") & r["play_type"].isin(["punt", "kickoff"]) & (r["return_touchdown"] == 1)]
    return pd.DataFrame({"game_id": r["game_id"], "posteam": fix(r["td_team"]), "gsis": r["td_player_id"], "pts": 6.0}).dropna()


def neutral(p: pd.DataFrame) -> pd.Series:
    """As build_nflverse_suite.py: win probability 20-80%, outside the last two minutes of a half."""
    return p["wp"].between(0.2, 0.8) & (p["half_seconds_remaining"] > 120)


def ints(a) -> list:
    return [int(round(x)) for x in a]


def trow(v) -> list:
    """T values: counts as ints, EPA to 1 decimal."""
    return [round(float(x), 1) if k == "epa" else int(round(x)) for k, x in zip(T, v)]


# --------------------------------------------------------------------------
# On/off
# --------------------------------------------------------------------------
def onoff_play(p: pd.DataFrame, part: pd.DataFrame, pid: dict) -> dict:
    """Play level: a boolean plays x players matrix per team, then two matrix products."""
    part = part.rename(columns={"nflverse_game_id": "game_id"})[["game_id", "play_id", "offense_players"]]
    part = part[part["offense_players"].notna()].drop_duplicates(["game_id", "play_id"])
    part["play_id"] = part["play_id"].astype(float)
    c = p.merge(part, on=["game_id", "play_id"], how="inner")
    teams = {}
    for tm, g in c.groupby("posteam"):
        g = g.reset_index(drop=True)
        on = g["offense_players"].str.split(";").explode()
        on = on[on.isin(pid)]
        cols = sorted(on.unique())
        M = np.zeros((len(g), len(cols)))
        M[on.index.to_numpy(), pd.Index(cols).get_indexer(on.to_numpy())] = 1
        S = g[T].to_numpy(dtype=float)
        tgt = g["receiver_player_id"].where(g["is_t"])
        rc = [x for x in cols if (tgt == x).any()]
        R = np.stack([(tgt == x).to_numpy(dtype=float) for x in rc], axis=1) if rc else np.zeros((len(g), 0))
        ri = [cols.index(x) for x in rc]
        db = g["db"].to_numpy(dtype=float)
        snaps = M.sum(0)
        V = M.T @ S                              # T with each player on
        TG = M.T @ R                             # teammate targets with each player on
        DB = (M * db[:, None]).T @ M[:, ri]      # dropbacks with both on
        rtot = [int(R[:, k].sum()) for k in range(len(rc))]
        rdb = (M[:, ri] * db[:, None]).sum(0)
        team = {"games": int(g["game_id"].nunique()), "tot": trow(S.sum(0)),
                "r": {pid[x]: [rtot[k], int(rdb[k])] for k, x in enumerate(rc)}, "on": {}}
        for j, x in enumerate(cols):
            if snaps[j] < MIN_SNAPS:
                continue
            team["on"][pid[x]] = {"s": int(snaps[j]), "v": trow(V[j]),
                                  "m": {pid[y]: [int(TG[j, k]), int(DB[j, k])] for k, y in enumerate(rc) if y != x}}
        teams[tm] = team
    return teams


def snap_games(season: int, pfr: dict) -> pd.DataFrame:
    sc = cube.read("snap_counts", f"snap_counts_{season}.parquet",
                   ["game_id", "game_type", "week", "pfr_player_id", "team", "offense_snaps", "offense_pct"])
    sc = sc[sc["game_type"] == "REG"].copy()
    sc["team"] = fix(sc["team"])
    sc["gsis"] = sc["pfr_player_id"].map(pfr)
    return sc


def onoff_game(p: pd.DataFrame, sc: pd.DataFrame, pid: dict) -> dict:
    """Game level: the same products over a games x players matrix."""
    p = p[p["game_id"].isin(set(sc["game_id"]))]
    per = p.groupby(["posteam", "game_id"])[T].sum()
    tg = p[p["is_t"]].groupby(["posteam", "game_id", "receiver_player_id"]).size()
    sc = sc[sc["gsis"].isin(pid)]
    teams = {}
    for tm, s in sc.groupby("team"):
        if tm not in per.index.get_level_values(0):
            continue
        G = per.loc[tm]
        games = list(G.index)
        cols = sorted(s["gsis"].unique())
        played = s[s["offense_snaps"] > 0].pivot_table(index="game_id", columns="gsis", values="offense_snaps", aggfunc="sum")
        pct = s.pivot_table(index="game_id", columns="gsis", values="offense_pct", aggfunc="max")
        P = played.reindex(index=games, columns=cols).notna().to_numpy(dtype=float)
        W = (pct.reindex(index=games, columns=cols).fillna(0) >= GAME_PCT).to_numpy(dtype=float)
        snaps = s.groupby("gsis")["offense_snaps"].sum().reindex(cols).fillna(0).to_numpy()
        S = G[T].to_numpy(dtype=float)
        tt = tg.loc[tm] if tm in tg.index.get_level_values(0) else pd.Series(dtype=float)
        rc = [x for x in cols if x in set(tt.index.get_level_values(1))]
        R = np.stack([tt.xs(x, level=1).reindex(games).fillna(0).to_numpy(dtype=float) for x in rc], axis=1) if rc else np.zeros((len(games), 0))
        ri = [cols.index(x) for x in rc]
        db = G["db"].to_numpy(dtype=float)
        V, TG, DB = W.T @ S, W.T @ R, (W * db[:, None]).T @ P[:, ri]
        rdb = (P[:, ri] * db[:, None]).sum(0)
        team = {"games": len(games), "tot": trow(S.sum(0)),
                "r": {pid[x]: [int(R[:, k].sum()), int(rdb[k])] for k, x in enumerate(rc)}, "on": {}}
        for j, x in enumerate(cols):
            if snaps[j] < MIN_SNAPS:
                continue
            team["on"][pid[x]] = {"s": int(snaps[j]), "g": int(W[:, j].sum()), "v": trow(V[j]),
                                  "m": {pid[y]: [int(TG[j, k]), int(DB[j, k])] for k, y in enumerate(rc) if y != x}}
        teams[tm] = team
    return teams


# --------------------------------------------------------------------------
# Game splits
# --------------------------------------------------------------------------
def caller_weeks(season: int) -> dict:
    """{team: [(first week, name), ...]} from play_callers.csv. A mid-season switch only
    where the notes say the play caller was fired in week N and the OC column names
    someone else, who calls from week N on."""
    df = pd.read_csv(CALLERS)
    out = {}
    for r in df[df["season"] == season].itertuples(index=False):
        name, spans = str(r.play_caller).strip(), None
        m = re.search(r"([A-Z][\w.'-]+) fired Week (\d+)", str(r.notes or ""))
        if m and name.split()[-1] == m.group(1):
            oc = [re.sub(r"\s*\(.*?\)", "", x).strip() for x in str(r.offensive_coordinator).split("/")]
            nxt = [x for x in oc if x and x != name and not x.lower().startswith("no ")]
            if nxt:
                spans = [(1, name), (int(m.group(2)), nxt[-1])]
        out[TEAM_FIX.get(r.team, r.team)] = spans or [(1, name)]
    return out


def game_splits(season: int, p: pd.DataFrame, pts: pd.DataFrame, present: pd.DataFrame, pid: dict, names: dict) -> dict:
    """{team: {"qb": [...], "pc": [...]}}; present is (game_id, posteam, gsis) on the field."""
    starter = (p[p["qb_dropback"] == 1].dropna(subset=["passer_id"]).groupby(["game_id", "posteam", "passer_id"]).size()
               .reset_index(name="n").sort_values("n", ascending=False).drop_duplicates(["game_id", "posteam"]))
    gm = p.groupby(["posteam", "game_id"]).agg(week=("week", "first"), **{k: (k, "sum") for k in T}).reset_index()
    gm = gm.merge(starter.rename(columns={"passer_id": "qb"})[["game_id", "posteam", "qb"]], on=["game_id", "posteam"], how="left")
    callers = caller_weeks(season)
    gm["pc"] = [next((n for w, n in reversed(callers.get(t, [(1, "Unknown")])) if wk >= w), "Unknown")
                for t, wk in zip(gm["posteam"], gm["week"])]
    n = p[neutral(p) & p["pass_oe"].notna()][["game_id", "posteam", "pass_oe"]]
    tg = p[p["is_t"]].groupby(["game_id", "posteam", "receiver_player_id"]).size().rename("tgt").reset_index() \
        .rename(columns={"receiver_player_id": "gsis"})
    stat = pd.concat([pts[["game_id", "posteam", "gsis"]], tg[["game_id", "posteam", "gsis"]],
                      present[["game_id", "posteam", "gsis"]]]).drop_duplicates()
    stat = stat[stat["gsis"].isin(pid)] \
        .merge(pts, on=["game_id", "posteam", "gsis"], how="left").merge(tg, on=["game_id", "posteam", "gsis"], how="left").fillna(0)
    out = {}
    for tm, g in gm.groupby("posteam"):
        team = {}
        for key in ("qb", "pc"):
            rows = []
            for k, gg in g.groupby(g[key].fillna("?"), sort=False):
                ids = set(gg["game_id"])
                pl = stat[(stat["posteam"] == tm) & stat["game_id"].isin(ids)].groupby("gsis").agg(
                    g=("game_id", "nunique"), pts=("pts", "sum"), tgt=("tgt", "sum"))
                oe = n[(n["posteam"] == tm) & n["game_id"].isin(ids)]["pass_oe"]
                row = {"id": pid.get(k, k) if key == "qb" else k, "g": len(ids), "pl": int(gg["plays"].sum()),
                       "epa": round(float(gg["epa"].sum()), 1), "proe": round(float(oe.mean()) / 100, 4) if len(oe) else None,
                       "tgt": int(gg["tgt"].sum()),
                       "P": {pid[x]: [int(r.g), round(float(r.pts), 1), int(r.tgt)] for x, r in pl.iterrows()}}
                if key == "pc":
                    row["w"] = [int(gg["week"].min()), int(gg["week"].max())]
                rows.append(row)
            team[key] = sorted(rows, key=lambda r: -r["g"])
        out[tm] = team
    return out


# --------------------------------------------------------------------------
def build(season: int) -> dict:
    ro = roster(season)
    pid = dict(zip(ro["gsis_id"], ro["pid"]))
    names = {r.pid: [r.full_name, r.position] for r in ro.itertuples(index=False)}
    p = plays(season)
    pts = pd.concat([ppr(p), returns(season)]).groupby(["game_id", "posteam", "gsis"], as_index=False)["pts"].sum()
    part, src = cov.participation(season)
    if part is not None:
        level = "play"
        teams = onoff_play(p, part, pid)
        pr = part.rename(columns={"nflverse_game_id": "game_id"})
        pr = pr[pr["offense_players"].notna()][["game_id", "play_id", "offense_players"]].copy()
        pr["play_id"] = pr["play_id"].astype(float)
        pr = pr.merge(p[["game_id", "play_id", "posteam"]], on=["game_id", "play_id"])
        present = pr.assign(gsis=pr["offense_players"].str.split(";")).explode("gsis")[["game_id", "posteam", "gsis"]]
        source = f"nflverse pbp_participation ({src}) joined to play-by-play"
        note = "On and off the field, play by play, from nflverse participation charting."
        through = int(p[p["game_id"].isin(set(pr["game_id"]))]["week"].max())
    else:
        level = "game"
        pfr = dict(zip(ro["pfr_id"], ro["gsis_id"])) if "pfr_id" in ro else {}
        sc = snap_games(season, pfr)
        teams = onoff_game(p, sc, pid)
        present = sc[sc["offense_snaps"] > 0].rename(columns={"team": "posteam"})[["game_id", "posteam", "gsis"]]
        source = "nflverse snap counts and play-by-play"
        note = (f"nflverse has not posted pbp_participation_{season}, so this is game level: a game is without him "
                f"when he was inactive or played under {GAME_PCT:.0%} of the offensive snaps.")
        through = int(sc["week"].max()) if len(sc) else 0
    splits = game_splits(season, p, pts, present, pid, names)
    for tm, s in splits.items():
        teams.setdefault(tm, {"games": 0, "tot": [0] * len(T), "r": {}, "on": {}}).update(s)
    used = set()
    for t in teams.values():
        used |= set(t["r"]) | set(t["on"])
        for k in ("qb", "pc"):
            for row in t.get(k, []):
                used |= set(row["P"])
                if k == "qb":
                    used.add(row["id"])
    return {"season": season, "level": level, "generated": dt.datetime.now().isoformat(timespec="seconds"),
            "source": source, "note": note, "throughWeek": through, "splitsThroughWeek": int(p["week"].max()),
            "minSnaps": MIN_SNAPS, "smallSample": SMALL, "gamePct": GAME_PCT, "T": T,
            "names": {k: v for k, v in names.items() if k in used}, "teams": dict(sorted(teams.items()))}


def write(season: int) -> pathlib.Path:
    data = build(season)
    out = DATA / f"onoff-{season}.js"
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    out.write_text("// Generated by projections/build_onoff.py from nflverse. Do not edit.\n"
                   f"(window.ONOFF_BY_SEASON=window.ONOFF_BY_SEASON||{{}})[{season}]={body};\n", encoding="utf-8")
    n = sum(len(t["on"]) for t in data["teams"].values())
    print(f"wrote {out.name}: {data['level']} level, {n} player on/off rows, {len(data['teams'])} teams, "
          f"through week {data['throughWeek']}, {out.stat().st_size // 1024} KB")
    return out


def self_check() -> int:
    """Recount from the source files, not from build(): on + off == team total for every player."""
    cube.OFFLINE = True
    cur, bad = cube.season_now(), []
    assert caller_weeks(2023)["BUF"] == [(1, "Ken Dorsey"), (11, "Joe Brady")]
    assert caller_weeks(2023)["LV"] == [(1, "Josh McDaniels"), (8, "Bo Hardegree")]
    counts = [i for i, k in enumerate(T) if k != "epa"]
    for season in range(cur - 3, cur + 1):
        path = DATA / f"onoff-{season}.js"
        if not path.exists():
            bad.append(f"{season}: {path.name} missing, run the builder first")
            continue
        F = cube.load_js(path)
        ro = roster(season)
        gs = dict(zip(ro["pid"], ro["gsis_id"]))
        p = plays(season)
        part, _ = cov.participation(season)
        checked, before = 0, len(bad)
        want_level = "play" if part is not None else "game"
        if F["level"] != want_level:
            bad.append(f"{season}: file is {F['level']} level, sources say {want_level}")
        if part is not None:
            part = part.rename(columns={"nflverse_game_id": "game_id"})
            part = part[part["offense_players"].notna()].drop_duplicates(["game_id", "play_id"])
            part["play_id"] = part["play_id"].astype(float)
            c = p.merge(part[["game_id", "play_id", "offense_players"]], on=["game_id", "play_id"])
        else:
            sc = snap_games(season, dict(zip(ro["pfr_id"], ro["gsis_id"])))
        for tm, t in F["teams"].items():
            if part is not None:
                g = c[c["posteam"] == tm]
                if len(g) != t["tot"][0]:
                    bad.append(f"{season} {tm}: {len(g)} charted plays, file total {t['tot'][0]}")
                for sid, v in t["on"].items():
                    has = g["offense_players"].str.contains(gs[sid], regex=False)
                    on, off = int(has.sum()), int((~has).sum())
                    if not (on == v["v"][0] == v["s"] and on + off == t["tot"][0]):
                        bad.append(f"{season} {tm} {sid}: on {on} + off {off} vs file on {v['v'][0]}, total {t['tot'][0]}")
                    checked += 1
            else:
                s = sc[sc["team"] == tm]
                games = set(s["game_id"])
                n = int((p["posteam"].eq(tm) & p["game_id"].isin(games)).sum())
                if len(games) != t["games"] or n != t["tot"][0]:
                    bad.append(f"{season} {tm}: {len(games)} games / {n} plays, file {t['games']} / {t['tot'][0]}")
                for sid, v in t["on"].items():
                    mine = s[s["gsis"] == gs[sid]]
                    with_ = set(mine.loc[mine["offense_pct"] >= GAME_PCT, "game_id"])
                    if len(with_) != v["g"] or len(with_) + len(games - with_) != t["games"]:
                        bad.append(f"{season} {tm} {sid}: {len(with_)} games with him, file {v['g']}")
                    checked += 1
            for sid, v in t["on"].items():
                if any(v["v"][i] > t["tot"][i] for i in counts):
                    bad.append(f"{season} {tm} {sid}: an on count exceeds the team total")
            # Game splits: every game and play lands in exactly one group of each kind.
            n, gms = int((p["posteam"] == tm).sum()), p.loc[p["posteam"] == tm, "game_id"].nunique()
            for k in ("qb", "pc"):
                if sum(r["g"] for r in t[k]) != gms or sum(r["pl"] for r in t[k]) != n:
                    bad.append(f"{season} {tm} {k}: groups hold {sum(r['g'] for r in t[k])} games / "
                               f"{sum(r['pl'] for r in t[k])} plays of {gms} / {n}")
        # PPR ties to nflverse's weekly stats where they are cached.
        wk, miss = cube.CACHE / f"stats_player_week_{season}.parquet", []
        if wk.exists():
            s = pd.read_parquet(wk, columns=["player_id", "season_type", "fantasy_points_ppr"])
            want = s[s["season_type"] == "REG"].groupby("player_id")["fantasy_points_ppr"].sum()
            mine = {}
            for t in F["teams"].values():
                for r in t["qb"]:
                    for sid, a in r["P"].items():
                        mine[sid] = mine.get(sid, 0) + a[1]
            top = sorted(mine, key=lambda s: -mine[s])[:150]
            miss = [f"{F['names'][s][0]} {mine[s]:.1f} vs {want.get(gs[s], 0):.1f}" for s in top
                    if abs(mine[s] - want.get(gs[s], 0)) > 3]
            if len(miss) > 3:   # kneel-downs (-1 rushing yard each) are the known gap
                bad.append(f"{season}: PPR off by 3+ for {len(miss)} of the top 150: {'; '.join(miss[:6])}")
        ppr_line = f"PPR off by 3+ for {len(miss)} of top 150" if wk.exists() else "PPR unchecked (no weekly stats cached)"
        print(f"  {season}: {F['level']} level, {checked} players recounted, {ppr_line}: "
              f"{'ok' if len(bad) == before else 'MISMATCH'}")
    for m in bad[:20]:
        print("  " + m)
    print(f"build_onoff self-check: {len(bad)} problem(s)")
    if bad:
        return 1
    print("build_onoff self-check ok")
    return 0


def main() -> int:
    global CALLERS
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, help="one season; default is the current one plus the three before it")
    ap.add_argument("--participation", help="folder of <season>.csv participation files "
                                            "(default: FF_PARTICIPATION_DIR or historical/pbp_participation)")
    ap.add_argument("--cache", help="nflverse cache directory (default: NFLVERSE_CACHE or projections/nflverse-cache)")
    ap.add_argument("--callers", help="play_callers.csv (default: FF_PLAY_CALLERS or historical/play_callers.csv)")
    ap.add_argument("--offline", action="store_true", help="read local files only; never download")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.participation:
        cov.PART = pathlib.Path(a.participation)
    if a.cache:
        cube.CACHE = pathlib.Path(a.cache)
    if a.callers:
        CALLERS = pathlib.Path(a.callers)
    cube.OFFLINE = a.offline
    if a.self_check:
        return self_check()
    cur = cube.season_now()
    for y in ([a.season] if a.season else range(cur - 3, cur + 1)):
        write(y)
    return 0


if __name__ == "__main__":
    sys.exit(main())
