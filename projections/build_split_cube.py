"""Situational split cube for Stats Lab: counting stats per player, per week, per situation.

Writes site/data/splits-YYYY.js for the current season and the two before it.
Every number in them is a COUNT (targets, yards, EPA and PPR sums, success
counts), never a rate, so the page can add up any set of seasons, weeks and
situation buckets and divide afterwards. That is what turns "2024 + 2025,
weeks 1-8, third down, against the blitz" into a sum instead of a new build.

A row is one player x week x bucket that actually happened. The bucket is a
single integer combining nine dimensions (DIMS below, mixed radix, first
dimension most significant). Five of them come from FTN charting; a play FTN
did not chart gets digit 0 ("unknown") on all five, so it counts when no FTN
filter is on and drops out as soon as one is.

The play filters and per-role definitions mirror build_nflverse_suite.py
exactly (REG season, pass and run plays, a target is a pass attempt with a
receiver, a dropback needs a passer), so the page summing every bucket gives
back advanced.js. --self-check proves that on the written files.

Routes are the same estimate the suite ships: snap share x the team's
dropbacks that game, with its calibration and per-game cap. Inside a situation
the page scales each week's routes by the share of that week's team dropbacks
the situation holds, so YPRR stays "(est)".

    python projections/build_split_cube.py                 # current season + two before
    python projections/build_split_cube.py --season 2025
    python projections/build_split_cube.py --self-check
    python projections/build_split_cube.py --cache D:/nflverse-cache --offline
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
# The cache can live outside this checkout (a git worktree reads the main
# checkout's): --cache, then NFLVERSE_CACHE, then the repo-relative default.
CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
OFFLINE = False
DATA = ROOT / "site" / "data"
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
MAX_AGE_H = 6.0
FINISHED_SEASON_AGE_H = 24 * 365
SKILL = ("QB", "RB", "WR", "TE")
TEAM_FIX = {"LA": "LAR"}


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def fetch(tag: str, name: str, max_age_h: float = MAX_AGE_H) -> pathlib.Path:
    """Cached download, as in build_nflverse_suite.py. --offline never writes."""
    p = CACHE / name
    if OFFLINE:
        if not p.exists():
            raise SystemExit(f"{name}: not in {CACHE} and --offline is set")
        return p
    CACHE.mkdir(parents=True, exist_ok=True)
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


def read(tag: str, name: str, columns=None) -> pd.DataFrame:
    past = any(str(y) in name for y in range(1999, season_now()))
    return pd.read_parquet(fetch(tag, name, FINISHED_SEASON_AGE_H if past else MAX_AGE_H), columns=columns)


# --------------------------------------------------------------------------
# Buckets. (key, label, radix, options); an option is (value, label, digits).
# Digit 0 is always "not known" and no option selects it.
# --------------------------------------------------------------------------
DIMS = [
    ("down", "Down", 5, [("1", "1st down", [1]), ("2", "2nd down", [2]), ("3", "3rd down", [3]), ("4", "4th down", [4])]),
    ("dist", "Distance", 4, [("s", "1-2 to go", [1]), ("m", "3-6 to go", [2]), ("l", "7+ to go", [3])]),
    ("zone", "Field", 5, [("own", "Own side", [1]), ("mid", "Opp 21-50", [2]), ("rz", "Inside 20", [3, 4]),
                          ("gl", "Inside 5", [4])]),
    ("score", "Score", 4, [("trail", "Trailing 9+", [1]), ("close", "Within 8", [2]), ("lead", "Leading 9+", [3])]),
    ("pa", "Play action", 3, [("y", "Play action", [2]), ("n", "No play action", [1])]),
    ("motion", "Motion", 3, [("y", "Motion", [2]), ("n", "No motion", [1])]),
    ("form", "QB spot", 3, [("gun", "Shotgun or pistol", [1]), ("uc", "Under center", [2])]),
    ("blitz", "Blitz", 3, [("y", "Blitzed", [2]), ("n", "Not blitzed", [1])]),
    ("box", "Box", 3, [("8", "8+ in box", [2]), ("7", "7 or fewer in box", [1])]),
]
FTN_DIMS = {"pa", "motion", "form", "blitz", "box"}


def digits(p: pd.DataFrame) -> dict:
    """One digit per dimension per play."""
    down = p["down"].fillna(0).astype(int).clip(0, 4).to_numpy()
    ytg = p["ydstogo"].to_numpy(dtype=float)
    yl = p["yardline_100"].to_numpy(dtype=float)
    sd = p["score_differential"].to_numpy(dtype=float)
    loc = p["qb_location"].fillna("").to_numpy()
    charted = np.isin(loc, ["S", "U", "P"])
    flag = lambda k: np.where(charted, 1 + (p[k].astype(float).fillna(0).to_numpy() > 0), 0)
    return {
        "down": down,
        "dist": np.where((down == 0) | np.isnan(ytg), 0, np.select([ytg <= 2, ytg <= 6], [1, 2], 3)),
        # yardline_100 is distance to the opponent's goal: over 50 is our own side.
        "zone": np.select([np.isnan(yl), yl > 50, yl > 20, yl > 5], [0, 1, 2, 3], 4),
        "score": np.select([np.isnan(sd), sd <= -9, sd >= 9], [0, 1, 3], 2),
        "pa": flag("is_play_action"),
        "motion": flag("is_motion"),
        "form": np.where(loc == "U", 2, np.where(np.isin(loc, ["S", "P"]), 1, 0)),
        "blitz": flag("n_blitzers"),
        "box": np.where(charted, 1 + (p["n_defense_box"].astype(float).fillna(0).to_numpy() >= 8), 0),
    }


def encode(d: dict) -> np.ndarray:
    code = np.zeros(len(d["down"]), dtype=np.int64)
    for key, _, n, _ in DIMS:
        code = code * n + d[key]
    return code


def decode(code: int) -> dict:
    out = {}
    for key, _, n, _ in reversed(DIMS):
        out[key] = code % n
        code //= n
    return out


# --------------------------------------------------------------------------
# The cube
# --------------------------------------------------------------------------
R_FIELDS = ["wk", "code", "tgt", "rec", "yds", "td", "air", "epa", "succ", "ppr"]
U_FIELDS = ["wk", "code", "car", "yds", "td", "epa", "succ", "ppr"]
P_FIELDS = ["wk", "code", "db", "att", "cmp", "yds", "td", "int", "epa", "succ", "ppr"]
T_FIELDS = ["wk", "code", "db", "tgt"]
S_FIELDS = ["wk", "snap_pct", "routes"]
SCALE = {"epa": 100, "ppr": 100}   # stored as integer hundredths

PBP_COLS = ["game_id", "play_id", "season_type", "week", "play_type", "posteam", "down", "ydstogo",
            "yardline_100", "score_differential", "receiver_player_id", "rusher_player_id",
            "passer_player_id", "pass_attempt", "rush_attempt", "qb_dropback", "complete_pass",
            "receiving_yards", "rushing_yards", "passing_yards", "pass_touchdown", "rush_touchdown",
            "interception", "air_yards", "epa", "success", "fumble_lost", "fumbled_1_player_id",
            "two_point_attempt", "two_point_conv_result"]
FTN_COLS = ["nflverse_game_id", "nflverse_play_id", "is_play_action", "is_motion", "qb_location",
            "n_blitzers", "n_defense_box"]


def ppr_by_role(p: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Full PPR each play produced for its target, carrier and passer, nflverse
    scoring: 1 per catch, 0.1 per rush or receiving yard, 6 per rush or
    receiving TD, 0.04 per passing yard, 4 per passing TD, -2 per INT and per
    lost fumble, 2 per successful two-point try."""
    f = lambda k: p[k].fillna(0).to_numpy(dtype=float)
    two = f("two_point_attempt") == 1
    two_ok = (p["two_point_conv_result"] == "success").to_numpy() & two
    fum = f("fumble_lost") == 1
    fum_by = p["fumbled_1_player_id"].to_numpy()
    rcv, rsh, pas = (p[k].to_numpy() for k in ("receiver_player_id", "rusher_player_id", "passer_player_id"))
    rec = np.where(two, 2.0 * two_ok, f("complete_pass") * (1 + 0.1 * f("receiving_yards") + 6 * f("pass_touchdown")))
    rec -= 2.0 * (fum & (fum_by == rcv))
    rush = np.where(two, 2.0 * two_ok, 0.1 * f("rushing_yards") + 6 * f("rush_touchdown"))
    rush -= 2.0 * (fum & (fum_by == rsh))
    pss = np.where(two, 2.0 * (two_ok & (f("pass_attempt") == 1)),
                   0.04 * f("passing_yards") + 4 * f("pass_touchdown") - 2 * f("interception"))
    pss -= 2.0 * (fum & (fum_by == pas))
    return rec, rush, pss


def cube(g: pd.DataFrame, pid: str, agg: dict) -> pd.DataFrame:
    """Sum plays into player x week x code rows, integers throughout."""
    out = g.groupby([pid, "week", "code"]).agg(**agg).reset_index().rename(columns={"week": "wk"})
    for k in ("epa", "ppr"):
        if k in out:
            out[k] = (out[k] * SCALE[k]).round()
    num = [c for c in out.columns if c != pid]
    out[num] = out[num].fillna(0).astype(np.int64)
    return out


def flat(df: pd.DataFrame, fields: list) -> list:
    """One flat int list per player: rows back to back, len(fields) apart."""
    return df[fields].to_numpy().ravel().tolist()


def build(season: int) -> dict:
    roster = read("rosters", f"roster_{season}.parquet")
    roster = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    roster = roster[roster["position"].isin(SKILL) & roster["gsis_id"].notna() & roster["sleeper_id"].notna()]

    pbp = read("pbp", f"play_by_play_{season}.parquet", PBP_COLS)
    p = pbp[(pbp["season_type"] == "REG") & pbp["play_type"].isin(["pass", "run"])].copy()
    ftn = read("ftn_charting", f"ftn_charting_{season}.parquet", FTN_COLS) \
        .rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
    ftn["play_id"] = ftn["play_id"].astype(float)
    p["play_id"] = p["play_id"].astype(float)
    p = p.merge(ftn.drop_duplicates(["game_id", "play_id"]), on=["game_id", "play_id"], how="left")
    p["week"] = p["week"].astype(int)
    d = digits(p)
    p["code"] = encode(d)
    p["ppr_rec"], p["ppr_rush"], p["ppr_pass"] = ppr_by_role(p)
    for k in ("receiving_yards", "rushing_yards", "passing_yards", "air_yards", "epa", "success"):
        p[k] = p[k].fillna(0)
    through = int(p["week"].max()) if len(p) else 0
    ftn_through = int(p.loc[d["form"] > 0, "week"].max()) if (d["form"] > 0).any() else 0

    is_t = p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)
    t = p[is_t]
    rec = cube(t, "receiver_player_id", dict(
        tgt=("play_id", "size"), rec=("complete_pass", "sum"), yds=("receiving_yards", "sum"),
        td=("pass_touchdown", "sum"), air=("air_yards", "sum"), epa=("epa", "sum"),
        succ=("success", "sum"), ppr=("ppr_rec", "sum")))
    r = p[p["rusher_player_id"].notna() & (p["rush_attempt"] == 1)]
    rush = cube(r, "rusher_player_id", dict(
        car=("play_id", "size"), yds=("rushing_yards", "sum"), td=("rush_touchdown", "sum"),
        epa=("epa", "sum"), succ=("success", "sum"), ppr=("ppr_rush", "sum")))
    q = p[p["passer_player_id"].notna() & (p["qb_dropback"] == 1)]
    pas = cube(q, "passer_player_id", dict(
        db=("play_id", "size"), att=("pass_attempt", "sum"), cmp=("complete_pass", "sum"),
        yds=("passing_yards", "sum"), td=("pass_touchdown", "sum"), int=("interception", "sum"),
        epa=("epa", "sum"), succ=("success", "sum"), ppr=("ppr_pass", "sum")))

    # Share denominators: every dropback and every target the TEAM had, by bucket.
    p["is_db"] = (p["qb_dropback"] == 1).astype(int)
    p["is_t"] = is_t.astype(int)
    team = p[p["posteam"].notna() & ((p["is_db"] + p["is_t"]) > 0)] \
        .groupby(["posteam", "week", "code"]).agg(db=("is_db", "sum"), tgt=("is_t", "sum")).reset_index() \
        .rename(columns={"week": "wk"})

    # Snaps and estimated routes per player-week, calibrated as the suite does.
    snaps = read("snap_counts", f"snap_counts_{season}.parquet")
    snaps = snaps[snaps["game_type"] == "REG"].copy()
    pfr_to_gsis = roster.dropna(subset=["pfr_id"]).set_index("pfr_id")["gsis_id"].to_dict()
    snaps["gsis_id"] = snaps["pfr_player_id"].map(pfr_to_gsis)
    game_db = p[p["qb_dropback"] == 1].groupby(["game_id", "posteam"]).size()
    snaps = snaps.merge(game_db.rename("team_db").reset_index().rename(columns={"posteam": "team"}),
                        on=["game_id", "team"], how="left")
    snaps = snaps.dropna(subset=["gsis_id"])
    pos = roster.set_index("gsis_id")["position"]
    season_snap = snaps.groupby("gsis_id")["offense_pct"].mean()
    ps = pos.reindex(season_snap.index)
    te_mult = np.select([season_snap >= 0.75, season_snap >= 0.5], [1.05, 0.95], 0.87)
    mult = pd.Series(np.where(ps == "TE", te_mult, np.where(ps == "RB", 0.99, np.where(ps == "WR", 1.07, 1.0))),
                     index=season_snap.index)
    snaps["routes"] = np.minimum(snaps["offense_pct"] * snaps["team_db"] * snaps["gsis_id"].map(mult),
                                 snaps["team_db"]).fillna(0)

    players = {}
    by = lambda df, k: dict(tuple(df.groupby(k)))
    rec_g, rush_g, pas_g = by(rec, "receiver_player_id"), by(rush, "rusher_player_id"), by(pas, "passer_player_id")
    snap_g = by(snaps.sort_values("week"), "gsis_id")
    for row in roster.itertuples(index=False):
        g = row.gsis_id
        if not any(g in x for x in (rec_g, rush_g, pas_g, snap_g)):
            continue
        tm = TEAM_FIX.get(row.team, row.team)
        rec_ = {"n": row.full_name, "p": row.position, "t": tm}
        if g in rec_g:
            rec_["R"] = flat(rec_g[g], R_FIELDS)
        if g in rush_g:
            rec_["U"] = flat(rush_g[g], U_FIELDS)
        if g in pas_g:
            rec_["P"] = flat(pas_g[g], P_FIELDS)
        if g in snap_g:
            # A week on another team carries that team as a fourth field, so
            # the page scales his routes by the right team's dropbacks. Routes keep two
            # decimals: at one, a two-week YPRR drifts past its own display rounding.
            rec_["S"] = [[int(s.week), int(round(s.offense_pct * 100)), round(float(s.routes), 2)]
                         + ([TEAM_FIX.get(s.team, s.team)] if TEAM_FIX.get(s.team, s.team) != tm else [])
                         for s in snap_g[g].itertuples(index=False)]
        players[str(row.sleeper_id).split(".")[0]] = rec_
    team["posteam"] = team["posteam"].map(lambda x: TEAM_FIX.get(x, x))
    teams = {tm: flat(df, T_FIELDS) for tm, df in team.groupby("posteam")}
    return {
        "season": season,
        "throughWeek": through,
        "ftnThroughWeek": ftn_through,
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source": "nflverse-data play-by-play, FTN charting and snap counts",
        "dims": [{"key": k, "label": lab, "n": n, "opts": [{"v": v, "l": ol, "d": dg} for v, ol, dg in opts]}
                 for k, lab, n, opts in DIMS],
        "ftnDims": sorted(FTN_DIMS),
        "fields": {"R": R_FIELDS, "U": U_FIELDS, "P": P_FIELDS, "T": T_FIELDS, "S": S_FIELDS},
        "scale": SCALE,
        "players": players,
        "teams": teams,
    }


def write(season: int) -> pathlib.Path:
    data = build(season)
    out = DATA / f"splits-{season}.js"
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    # Loaded only when Stats Lab needs it, into a registry keyed by year.
    out.write_text("// Generated by projections/build_split_cube.py from nflverse. Do not edit.\n"
                   f"(window.SPLITS_BY_SEASON=window.SPLITS_BY_SEASON||{{}})[{season}]={body};\n",
                   encoding="utf-8")
    rows = sum(len(v.get(k, [])) // len(data["fields"][k]) for v in data["players"].values() for k in "RUP")
    print(f"wrote {out.name}: {len(data['players'])} players, {rows} player rows, {len(data['teams'])} teams, "
          f"through week {data['throughWeek']} (FTN through {data['ftnThroughWeek']}), "
          f"{out.stat().st_size // 1024} KB")
    return out


# --------------------------------------------------------------------------
# Self-check: sum every bucket, recompute the rates the page shows, compare
# with advanced.js. The same arithmetic as splitRows() in site/js/app.js.
# --------------------------------------------------------------------------
def load_js(path: pathlib.Path) -> dict:
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"\]=\{|ADVANCED=\{", txt)
    return json.loads(txt[m.end() - 1:].rstrip().rstrip(";"))


def totals(S: dict, sid: str) -> dict:
    v, F = S["players"][sid], S["fields"]
    tot = {}
    for role in "RUP":
        a, f = v.get(role, []), F[role]
        for i in range(0, len(a), len(f)):
            for j, k in enumerate(f[2:], 2):
                tot[f"{role}.{k}"] = tot.get(f"{role}.{k}", 0) + a[i + j]
    a, tf = S["teams"].get(v["t"], []), F["T"]
    team_tgt = sum(a[i + 3] for i in range(0, len(a), len(tf)))
    snaps = v.get("S", [])
    g = lambda k: tot.get(k, 0)
    div = lambda a, b: a / b if b else None
    routes = sum(s[2] for s in snaps)   # no situation filter: every week's routes count in full
    # YPRR counts yards only in weeks with routes (snap counts posted), as advanced.js does.
    wk, fr, ra = {s[0] for s in snaps}, F["R"], v.get("R", [])
    routed_yds = sum(ra[i + fr.index("yds")] for i in range(0, len(ra), len(fr)) if ra[i] in wk)
    return {
        "games": len(snaps), "snap_pct": div(sum(s[1] for s in snaps) / 100, len(snaps)),
        "targets": g("R.tgt"), "carries": g("U.car"), "dropbacks": g("P.db"), "air_yds": g("R.air"),
        "target_share": div(g("R.tgt"), team_tgt), "catch_rate": div(g("R.rec"), g("R.tgt")),
        "yds_per_target": div(g("R.yds"), g("R.tgt")), "epa_per_target": div(g("R.epa") / 100, g("R.tgt")),
        "yprr_est": div(routed_yds, routes) if routes >= 5 else None,
        "ypc": div(g("U.yds"), g("U.car")), "epa_per_rush": div(g("U.epa") / 100, g("U.car")),
        "rush_success": div(g("U.succ"), g("U.car")),
        "db_epa": div(g("P.epa") / 100, g("P.db")), "ypa": div(g("P.yds"), g("P.att")),
        "pass_success": div(g("P.succ"), g("P.db")),
        "ppr": (g("R.ppr") + g("U.ppr") + g("P.ppr")) / 100,
    }


# "Within rounding": half a unit of the precision each stat is shown at.
TOL = {"games": 0, "targets": 0, "carries": 0, "dropbacks": 0, "air_yds": 0.5, "snap_pct": 0.005,
       "target_share": 0.0005, "catch_rate": 0.0005, "rush_success": 0.0005, "pass_success": 0.0005,
       "yds_per_target": 0.05, "ypc": 0.05, "ypa": 0.05,
       "epa_per_target": 0.005, "epa_per_rush": 0.005, "db_epa": 0.005, "yprr_est": 0.005}
POS_CHECK = {"QB": ["dropbacks", "db_epa", "ypa", "pass_success", "carries", "ypc", "epa_per_rush", "games"],
             "RB": ["carries", "ypc", "epa_per_rush", "rush_success", "targets", "catch_rate", "yds_per_target",
                    "games", "snap_pct"],
             "WR": ["targets", "target_share", "catch_rate", "yds_per_target", "epa_per_target", "yprr_est",
                    "air_yds", "games", "snap_pct"],
             "TE": ["targets", "target_share", "catch_rate", "yds_per_target", "epa_per_target", "yprr_est",
                    "air_yds", "games", "snap_pct"]}
VOLUME = {"QB": "dropbacks", "RB": "carries", "WR": "targets", "TE": "targets"}


def self_check() -> int:
    # The bucket code round-trips, and a known play lands in the right bucket:
    # 3rd and 2 at the opponent's 4, down 10, play action from shotgun, blitzed, 8 in the box.
    play = pd.DataFrame({"down": [3.0], "ydstogo": [2.0], "yardline_100": [4.0], "score_differential": [-10.0],
                         "qb_location": ["S"], "is_play_action": [True], "is_motion": [False],
                         "n_blitzers": [2.0], "n_defense_box": [8.0]})
    got = decode(int(encode(digits(play))[0]))
    assert got == {"down": 3, "dist": 1, "zone": 4, "score": 1, "pa": 2, "motion": 1, "form": 1,
                   "blitz": 2, "box": 2}, got
    # An uncharted play is unknown on every FTN dimension, never "no".
    play["qb_location"] = [None]
    got = decode(int(encode(digits(play))[0]))
    assert all(got[k] == 0 for k in FTN_DIMS), got
    # Every option points at real digits, and 0 (unknown) is never selectable.
    for k, _, n, opts in DIMS:
        assert all(0 < x < n for _, _, dg in opts for x in dg), k
    # The page's situation menus (SPLIT_DIMS in app.js) offer exactly these values and labels.
    app = (ROOT / "site" / "js" / "app.js").read_text(encoding="utf-8")
    block = app[app.index("const SPLIT_DIMS = ["):]
    block = block[:block.index("];")]
    for k, lab, _, opts in DIMS:
        want = f"{{ key:'{k}', label:'{lab}', opts:[" + ", ".join(f"['{v}', '{ol}']" for v, ol, _ in opts) + "] }"
        assert want in block, f"app.js SPLIT_DIMS drifted from DIMS: {want}"
    assert block.count("key:") == len(DIMS), "app.js SPLIT_DIMS has a dimension the builder does not"
    # PPR: a 12-yard TD catch is 8.2 (and 14.0 for the 250-yard passer who threw it);
    # a lost fumble costs the carrier 2; a good two-point pass pays both ends 2.
    two = pd.DataFrame({"two_point_attempt": [0, 0, 1], "two_point_conv_result": [None, None, "success"],
                        "fumble_lost": [0, 1, 0], "fumbled_1_player_id": [None, "b", None],
                        "receiver_player_id": ["a", None, "a"], "rusher_player_id": [None, "b", None],
                        "passer_player_id": ["q", None, "q"], "complete_pass": [1, 0, 0],
                        "receiving_yards": [12, 0, None], "pass_touchdown": [1, 0, 0], "rushing_yards": [0, 7, 0],
                        "rush_touchdown": [0, 0, 0], "passing_yards": [250, 0, None], "interception": [0, 0, 0],
                        "pass_attempt": [1, 0, 1]})
    rec, rush, pss = ppr_by_role(two)
    assert abs(rec[0] - 8.2) < 1e-9 and abs(rush[1] - (0.7 - 2)) < 1e-9, (rec, rush)
    assert abs(pss[0] - 14.0) < 1e-9 and rec[2] == 2.0 and pss[2] == 2.0, pss

    # The written files, summed with no filter, give back advanced.js.
    cur = season_now()
    bad = checked = 0
    for season in (cur - 2, cur - 1, cur):
        sp = DATA / f"splits-{season}.js"
        ap = DATA / ("advanced.js" if season == cur else f"advanced-{season}.js")
        if not sp.exists() or not ap.exists():
            print(f"  {season}: {sp.name} or {ap.name} missing, run the builders first")
            bad += 1
            continue
        S, A = load_js(sp), load_js(ap)
        for pos, keys in POS_CHECK.items():
            vol = VOLUME[pos]
            pool = [(sid, a) for sid, a in A["players"].items() if a.get("p") == pos and sid in S["players"]]
            for sid, a in sorted(pool, key=lambda x: -(x[1].get(vol) or 0))[:5]:
                mine = totals(S, sid)
                checked += 1
                for k in keys:
                    want, have = a.get(k), mine.get(k)
                    if want is None and have is None:
                        continue
                    if want is None or have is None or abs(want - have) > TOL[k] + 1e-9:
                        bad += 1
                        print(f"  MISMATCH {season} {pos} {a['n']}: {k} advanced={want} splits={have}")
                # PPR has no advanced.js column; its weekly log carries nflverse's own
                # fantasy_points_ppr. Loose, because that also counts return TDs.
                ppr = sum(w[-1] or 0 for w in a.get("wk", []))
                if a.get("wk") and abs(ppr - mine["ppr"]) > max(2.0, 0.02 * abs(ppr)):
                    bad += 1
                    print(f"  MISMATCH {season} {pos} {a['n']}: PPR weekly log={ppr:.1f} splits={mine['ppr']:.1f}")
    print(f"build_split_cube self-check: {checked} players checked, {bad} problem(s)")
    if bad:
        return 1
    print("build_split_cube self-check ok")
    return 0


def main() -> int:
    global CACHE, OFFLINE
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, help="one season; default is the current one plus the two before it")
    ap.add_argument("--cache", help="nflverse cache directory (default: NFLVERSE_CACHE or projections/nflverse-cache)")
    ap.add_argument("--offline", action="store_true", help="read the cache only; never download")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.cache:
        CACHE = pathlib.Path(a.cache)
    OFFLINE = a.offline
    if a.self_check:
        return self_check()
    cur = season_now()
    for y in ([a.season] if a.season else [cur - 2, cur - 1, cur]):
        write(y)
    return 0


if __name__ == "__main__":
    sys.exit(main())
