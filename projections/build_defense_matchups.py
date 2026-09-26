"""Defense-vs-position matchups: how each of the 32 defenses is bleeding fantasy
points right now, with last season's full sample sitting next to it as a prior.

Two to three weeks of 2026 is a real signal but a small one, so every team's
block carries both a "cur" (2026 REG, season to date) and a "prior" (2025 REG,
full season) half in the same shape. A start/sit read that only agrees with
itself across both is worth more than one that only has the noisy one.

Everything here answers one question per slice: how has this defense played
against a given kind of touch, and is that kind of touch a place it specifically
struggles. Three joins carry that:

  pbp            play_by_play_{season}   posteam/defteam on every play, the
                                          target and rusher gsis ids, EPA
  roster         roster_{season}         gsis_id -> position, so a target's
                                          receiver becomes a WR/TE/RB bucket
  pfr advstats   advstats_week_pass      pressured and blitzed dropbacks, read
                                          off the passer's line; nflverse's own
                                          pbp does not carry either
  ftn charting   ftn_charting            play-action, joined on
                                          (nflverse_game_id, nflverse_play_id)

Scoring is PPR, reception 1 + 0.1/yard + 6/TD for the receiving side and
0.1/yard + 6/TD for the rushing side, read straight off the play so it never
drifts from what the plays actually did. No fumble adjustment here: this file
is about what a defense ALLOWS a position to do, and a forced fumble is the
defense's play, not a debit against the offense's production.

Pressure rate is times_pressured / dropbacks and blitz rate is times_blitzed /
dropbacks, both from PFR's advanced PASSING stats: the opposing quarterbacks'
lines, summed per defense and divided by nflverse's own dropback count. A passer
is pressured or blitzed once per dropback however many defenders PFR credits, so
these count plays. The defender table (advstats_week_def) credits every rusher,
and summing it counted a two-man blitz twice: Minnesota printed a 128.7% blitz
rate. Both stay PFR's charting, which is why `fields` below names them as PFR's.

The funnel label is computed, not picked by hand: for each defense, each
position's share of its own targets is divided by that position's LEAGUE
average share, and the biggest ratio wins. A defense with a totally average
target mix gets no funnel language worth reading, but the top ratio still
carries the label; the ratio itself (`funnelRatios`) is in the payload, so
telling a 1.02x "funnel to TEs" apart from a 1.9x one is a data read, not a
guess.

    python projections/build_defense_matchups.py
    python projections/build_defense_matchups.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "projections" / "nflverse-cache"
OUT = ROOT / "site" / "data" / "defense.js"

TEAM_FIX = {"LA": "LAR"}  # nflverse writes the Rams as LA; the site says LAR.
POSITIONS = ("WR", "TE", "RB")
FUNNEL_LABEL = {"WR": "WRs", "TE": "TEs", "RB": "RBs"}


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def read(name: str) -> pd.DataFrame:
    p = CACHE / name
    if not p.exists():
        raise SystemExit(f"missing {name} in {CACHE}; fetch it from nflverse-data releases first")
    return pd.read_parquet(p)


def num(x):
    """JSON-safe number: NaN/inf become None, whole floats collapse to int."""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return int(f) if f.is_integer() and abs(f) < 1e9 else round(f, 4)


def team_of(code: str) -> str:
    return TEAM_FIX.get(code, code)


def load_roster_positions(season: int) -> pd.Series:
    r = read(f"roster_{season}.parquet")
    r = r.sort_values("week").drop_duplicates("gsis_id", keep="last")
    return r.set_index("gsis_id")["position"]


def load_reg_pbp(season: int) -> pd.DataFrame:
    p = read(f"play_by_play_{season}.parquet")
    return p[p["season_type"] == "REG"]


def load_ftn(season: int) -> pd.DataFrame:
    f = read(f"ftn_charting_{season}.parquet")
    f = f.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
    f["play_id"] = f["play_id"].astype(float)
    return f[["game_id", "play_id", "is_play_action"]]


def load_pressure(season: int) -> pd.DataFrame:
    """Pressured and blitzed dropbacks each defense has produced, from PFR's charting.

    Read off the passer's line, keyed by his opponent, because a quarterback is
    pressured or blitzed once per dropback. The defender table counts one per
    rusher, so its sum is blitzers, not blitzes.
    """
    a = read(f"advstats_week_pass_{season}.parquet")
    a = a[a["game_type"] == "REG"]
    return a.groupby("opponent")[["times_pressured", "times_blitzed"]].sum()


def check_rates(df: pd.DataFrame, where: str) -> None:
    """Every share in the payload is a fraction of something, so it lands in 0..1."""
    cols = [c for c in df.columns if c.endswith("_rate") or c in ("target_share", "catch_rate")]
    vals = df[cols].to_numpy(dtype=float)
    bad = {(df.index[i], cols[j]): round(float(vals[i, j]), 4)
           for i, j in zip(*np.nonzero((vals < 0) | (vals > 1)))}
    if len(bad):
        raise ValueError(f"{where}: rate outside 0..1: {bad}")


def ppr_receiving(df: pd.DataFrame) -> pd.Series:
    return df["complete_pass"].fillna(0) * (1 + df["receiving_yards"].fillna(0) * 0.1
                                             + df["pass_touchdown"].fillna(0) * 6)


def ppr_rushing(df: pd.DataFrame) -> pd.Series:
    return df["rushing_yards"].fillna(0) * 0.1 + df["rush_touchdown"].fillna(0) * 6


def build_season(season: int) -> tuple[dict, int]:
    pbp = load_reg_pbp(season)
    pos = load_roster_positions(season)
    ftn = load_ftn(season)
    pressure = load_pressure(season)
    through_week = int(pbp["week"].max()) if len(pbp) else 0

    plays = pbp[pbp["play_type"].isin(["pass", "run"]) & pbp["defteam"].notna()].copy()
    games = plays.groupby("defteam")["game_id"].nunique()
    teams = sorted(games.index.tolist())

    plays = plays.merge(ftn, on=["game_id", "play_id"], how="left")
    plays["is_play_action"] = plays["is_play_action"].astype("float")

    # ---- targets, bucketed by the receiver's roster position ----
    tgt = plays[(plays["pass_attempt"] == 1) & plays["receiver_player_id"].notna()].copy()
    tgt["pos"] = tgt["receiver_player_id"].map(pos)
    tgt["pts"] = ppr_receiving(tgt)
    total_targets = tgt.groupby("defteam").size()

    by_pos: dict[str, pd.DataFrame] = {}
    league_share: dict[str, float] = {}
    league_total_targets = float(len(tgt))
    for p_code in POSITIONS:
        sub = tgt[tgt["pos"] == p_code]
        g = sub.groupby("defteam")
        n = g.size()
        rz = sub[sub["yardline_100"] <= 20].groupby("defteam").size()
        stat = pd.DataFrame(index=teams)
        stat["targets_pg"] = (n / games).reindex(teams)
        stat["target_share"] = (n / total_targets).reindex(teams)
        stat["epa_per_target"] = g["epa"].mean().reindex(teams)
        stat["success_rate"] = g["success"].mean().reindex(teams)
        stat["ypt"] = sub.groupby("defteam")["receiving_yards"].apply(lambda s: s.fillna(0).mean()).reindex(teams)
        stat["catch_rate"] = g["complete_pass"].mean().reindex(teams)
        stat["adot"] = g["air_yards"].mean().reindex(teams)
        stat["yac_per_rec"] = sub[sub["complete_pass"] == 1].groupby("defteam")["yards_after_catch"] \
            .mean().reindex(teams)
        stat["rz_targets_pg"] = (rz / games).reindex(teams)
        stat["ppr_pg"] = (g["pts"].sum() / games).reindex(teams)
        stat = stat.fillna({"targets_pg": 0, "target_share": 0, "rz_targets_pg": 0, "ppr_pg": 0})
        stat["rank"] = stat["ppr_pg"].rank(method="min", ascending=False).astype(int)
        by_pos[p_code] = stat
        league_share[p_code] = float(n.sum()) / league_total_targets if league_total_targets else 0.0

    # ---- RB rushing ----
    rush = plays[(plays["rush_attempt"] == 1) & plays["rusher_player_id"].notna()].copy()
    rush["pos"] = rush["rusher_player_id"].map(pos)
    rb_rush = rush[rush["pos"] == "RB"].copy()
    rb_rush["pts"] = ppr_rushing(rb_rush)
    rg = rb_rush.groupby("defteam")
    rush_stat = pd.DataFrame(index=teams)
    rush_stat["carries_pg"] = (rg.size() / games).reindex(teams).fillna(0)
    rush_stat["epa_per_rush"] = rg["epa"].mean().reindex(teams)
    rush_stat["success_rate"] = rg["success"].mean().reindex(teams)
    rush_stat["ypc"] = rb_rush.groupby("defteam")["rushing_yards"].apply(lambda s: s.fillna(0).mean()).reindex(teams)
    rush_stat["explosive_rate"] = rb_rush.assign(exp=(rb_rush["rushing_yards"].fillna(0) >= 10).astype(float)) \
        .groupby("defteam")["exp"].mean().reindex(teams)
    rush_stat["ppr_pg"] = (rg["pts"].sum() / games).reindex(teams).fillna(0)

    # ---- pass defense overall ----
    db = plays[plays["qb_dropback"] == 1]
    dg = db.groupby("defteam")
    dropbacks = dg.size().reindex(teams).fillna(0)
    pass_stat = pd.DataFrame(index=teams)
    pass_stat["dropbacks"] = dropbacks
    pass_stat["dropbacks_pg"] = dropbacks / games.reindex(teams)
    pass_stat["epa_per_dropback"] = dg["epa"].mean().reindex(teams)
    pass_stat["sack_rate"] = (dg["sack"].sum().reindex(teams).fillna(0) / dropbacks.replace(0, np.nan))
    pfr = pressure.reindex(teams)
    pass_stat["pressure_rate"] = pfr["times_pressured"] / dropbacks.replace(0, np.nan)
    pass_stat["blitz_rate"] = pfr["times_blitzed"] / dropbacks.replace(0, np.nan)
    pass_stat["pa_rate_faced"] = dg["is_play_action"].mean().reindex(teams)
    pass_stat["epa_allowed_pa"] = db[db["is_play_action"] == 1].groupby("defteam")["epa"].mean().reindex(teams)
    pass_stat["epa_allowed_non_pa"] = db[db["is_play_action"] == 0].groupby("defteam")["epa"].mean().reindex(teams)

    check_rates(pass_stat, f"{season} pass")
    check_rates(rush_stat, f"{season} rushRB")
    for p_code in POSITIONS:
        check_rates(by_pos[p_code], f"{season} {p_code}")

    out = {}
    for team in teams:
        ratios = {p_code: (by_pos[p_code].at[team, "target_share"] / league_share[p_code])
                          if league_share[p_code] else 0.0
                  for p_code in POSITIONS}
        top = max(ratios, key=ratios.get)
        block = {
            "games": num(games.get(team)),
            "pass": {k: num(v) for k, v in pass_stat.loc[team].to_dict().items()},
            "rushRB": {k: num(v) for k, v in rush_stat.loc[team].to_dict().items()},
            "byPos": {p_code: {k: num(v) for k, v in by_pos[p_code].loc[team].to_dict().items()}
                      for p_code in POSITIONS},
            "funnel": f"pass funnel to {FUNNEL_LABEL[top]}",
            "funnelRatios": {p_code: num(r) for p_code, r in ratios.items()},
        }
        out[team_of(team)] = block
    return out, through_week


FIELDS = {
    "games": "Games this defense has played in this slice (REG season only).",
    "pass_dropbacks": "Quarterback dropbacks this defense has faced (season total, this slice).",
    "pass_dropbacks_pg": "Dropbacks faced per game.",
    "pass_epa_per_dropback": "EPA allowed per dropback. Lower is a better pass defense.",
    "pass_sack_rate": "Sacks recorded per dropback faced (from play-by-play).",
    "pass_pressure_rate": "Share of dropbacks faced where PFR charted the passer as pressured (hurried, "
                           "hit or sacked), counted once per play from the passer's side. PFR's pressure "
                           "definition, not nflverse's.",
    "pass_blitz_rate": "Share of dropbacks faced where PFR charted a blitz, counted once per play from the "
                        "passer's side, not once per blitzer.",
    "pass_pa_rate_faced": "Share of dropbacks faced that were play-action, from FTN's charting.",
    "pass_epa_allowed_pa": "EPA allowed per dropback on play-action passes specifically.",
    "pass_epa_allowed_non_pa": "EPA allowed per dropback on non-play-action passes.",
    "rb_rush_carries_pg": "Running back carries this defense has faced per game.",
    "rb_rush_epa_per_rush": "EPA allowed per RB carry. Lower is a better run defense.",
    "rb_rush_success_rate": "Share of RB carries against this defense with positive EPA.",
    "rb_rush_ypc": "Yards allowed per RB carry.",
    "rb_rush_explosive_rate": "Share of RB carries against this defense that gained 10+ yards.",
    "rb_rush_ppr_pg": "PPR rushing points (0.1/yard + 6/TD) allowed to running backs per game.",
    "targets_pg": "Targets allowed to this position per game.",
    "target_share": "This position's share of every target this defense has faced (all positions).",
    "epa_per_target": "EPA allowed per target to this position. Lower is a tougher matchup.",
    "success_rate": "Share of targets to this position against this defense with positive EPA.",
    "ypt": "Yards allowed per target to this position (incompletions count as zero).",
    "catch_rate": "Completion rate allowed on targets to this position.",
    "adot": "Average depth of target allowed to this position (air yards).",
    "yac_per_rec": "Yards after catch allowed per reception to this position.",
    "rz_targets_pg": "Red-zone (inside the 20) targets allowed to this position per game.",
    "ppr_pg": "PPR receiving points (reception 1 + 0.1/yard + 6/TD) allowed to this position per game.",
    "rank": "1-32 rank among all defenses by PPR points allowed to this position, 1 = softest matchup.",
    "funnel": "Which position (WR/TE/RB) this defense allows a bigger-than-average target share to, "
              "computed from funnelRatios, not hand-labeled.",
    "funnelRatios": "Each position's target share against this defense divided by that position's league-average "
                     "target share. Above 1 means this defense funnels targets to that position more than most.",
}


def self_check() -> int:
    # PPR scoring: a 12-yard TD catch is 1 + 1.2 + 6 = 8.2; a 7-yard non-TD carry is 0.7.
    d = pd.DataFrame({"complete_pass": [1, 0], "receiving_yards": [12, 0], "pass_touchdown": [1, 0]})
    pts = ppr_receiving(d)
    assert abs(pts[0] - 8.2) < 1e-9, pts[0]
    assert abs(pts[1] - 0.0) < 1e-9, pts[1]
    r = pd.DataFrame({"rushing_yards": [7], "rush_touchdown": [0]})
    assert abs(ppr_rushing(r)[0] - 0.7) < 1e-9

    assert num(float("nan")) is None and num(float("inf")) is None and num(3.0) == 3

    # The 128.7% blitz rate that per-blitzer summing printed must not get through again.
    try:
        check_rates(pd.DataFrame({"blitz_rate": [0.3, 1.287]}), "demo")
        raise AssertionError("check_rates passed a 128.7% blitz rate")
    except ValueError:
        pass

    cur, through_week = build_season(season_now())
    prior, _ = build_season(season_now() - 1)
    assert len(cur) == 32, f"cur has {len(cur)} teams, want 32"
    assert len(prior) == 32, f"prior has {len(prior)} teams, want 32"
    assert through_week >= 1

    for slice_name, data in (("cur", cur), ("prior", prior)):
        for p_code in POSITIONS:
            ppr = {team: block["byPos"][p_code]["ppr_pg"] or 0.0 for team, block in data.items()}
            softest = max(ppr, key=ppr.get)
            rank1 = [team for team, block in data.items() if block["byPos"][p_code]["rank"] == 1]
            assert softest in rank1, (slice_name, p_code, softest, rank1, ppr[softest])

    # No NaN survives serialization; allow_nan=False raises if one slipped through num().
    json.dumps({"cur": cur, "prior": prior}, allow_nan=False)
    print("build_defense_matchups self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()

    season = season_now()
    prior_season = season - 1
    cur, through_week = build_season(season)
    prior, _ = build_season(prior_season)

    teams = {}
    for team in sorted(set(cur) | set(prior)):
        teams[team] = {"cur": cur.get(team), "prior": prior.get(team)}

    payload = {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "season": season,
        "throughWeek": through_week,
        "prior": prior_season,
        "source": "nflverse play-by-play (targets/rushes, EPA, roster position join), "
                  "PFR advanced passing stats (pressure, blitz faced), FTN charting (play-action)",
        "fields": FIELDS,
        "teams": teams,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    OUT.write_text("// Generated by projections/build_defense_matchups.py from nflverse. Do not edit.\n"
                   f"window.DEFENSE={body};\n", encoding="utf-8")

    softest_wr = min(teams.items(), key=lambda kv: kv[1]["cur"]["byPos"]["WR"]["rank"])
    print(f"wrote {OUT.name}: {len(teams)} teams, season {season} through week {through_week}, "
          f"prior {prior_season}, softest vs WR (cur) = {softest_wr[0]} "
          f"({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
