"""Backtest the two xFP sources the Stats Lab can show, 2024 and 2025.

  ours  build_nflverse_suite.xfp_tables/apply_xfp: league-average PPR of plays
        in the same (air-yard band x yardline band) or (yardline band x down)
  ffo   ffopportunity (ffverse) XGBoost expected points, weekly release,
        rec_fantasy_points_exp + rush_fantasy_points_exp (full PPR)
  ppr   the naive baseline: actual PPR per game to date

For every cutoff week w, each rate is season-to-date through w and is scored
against next-week PPR (week w+1, if he played) and rest-of-season PPR per game
(weeks w+1..18, at least 3 games). Actual PPR is nflverse stats_player_week
fantasy_points_ppr for all three, so no source grades itself. Only aggregates
are printed.

    python notes/xfp_backtest.py
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "projections"))
import build_nflverse_suite as S  # noqa: E402

SEASONS = (2024, 2025)
POS = ("RB", "WR", "TE")
MIN_GAMES = 3          # to date
MIN_OPP_PG = 4.0       # targets + carries per game to date
NEXT_CUTS = range(3, 18)
ROS_CUTS = range(3, 15)
ROS_MIN_GAMES = 3
BOOT = 400
PBP_COLS = ["game_id", "week", "season_type", "play_type", "complete_pass", "receiving_yards",
            "pass_touchdown", "rushing_yards", "rush_touchdown", "fumble_lost", "receiver_player_id",
            "pass_attempt", "rusher_player_id", "rush_attempt", "yardline_100", "air_yards", "down"]


def pbp(season):
    return pd.read_parquet(S.fetch("pbp", f"play_by_play_{season}.parquet", S.FINISHED_SEASON_AGE_H),
                           columns=PBP_COLS)


def weekly(season):
    now, prev = pbp(season), pbp(season - 1)
    tgt, rush = S.xfp_tables(pd.concat([prev, now], ignore_index=True))
    p = now[(now["season_type"] == "REG") & now["play_type"].isin(["pass", "run"])]
    p = S.apply_xfp(p, tgt, rush)
    is_t = p["receiver_player_id"].notna() & (p["pass_attempt"] == 1)
    is_r = p["rusher_player_id"].notna() & (p["rush_attempt"] == 1)
    ours = p[is_t].groupby(["receiver_player_id", "week"])["xfp"].sum().rename_axis(["player_id", "week"]) \
        .add(p[is_r].groupby(["rusher_player_id", "week"])["xfp"].sum().rename_axis(["player_id", "week"]),
             fill_value=0).rename("ours")
    reg_games = set(p["game_id"])
    ffo = S.ffo_weekly(season, reg_games).set_index(["player_id", "week"])["xfp_ffo"].rename("ffo")
    ffo = ffo.groupby(level=[0, 1]).sum()
    w = pd.read_parquet(S.fetch("stats_player", f"stats_player_week_{season}.parquet", S.FINISHED_SEASON_AGE_H))
    w = w[(w["season_type"] == "REG") & w["position"].isin(POS)]
    w = w[["player_id", "position", "week", "targets", "carries", "fantasy_points_ppr"]].copy()
    w["opp"] = w["targets"].fillna(0) + w["carries"].fillna(0)
    w = w.rename(columns={"fantasy_points_ppr": "ppr"}).set_index(["player_id", "week"])
    w = w.join(ours).join(ffo)
    w[["ours", "ffo"]] = w[["ours", "ffo"]].fillna(0)
    w["season"] = season
    return w.reset_index()


def to_date(w, cut):
    d = w[w["week"] <= cut].groupby("player_id").agg(
        position=("position", "last"), g=("week", "size"), opp=("opp", "sum"),
        ours=("ours", "sum"), ffo=("ffo", "sum"), ppr=("ppr", "sum"))
    for k in ("ours", "ffo", "ppr"):
        d[k] = d[k] / d["g"]
    d["blend"] = (d["ffo"] + d["ppr"]) / 2  # fixed 50/50, nothing fitted
    return d[(d["g"] >= MIN_GAMES) & (d["opp"] / d["g"] >= MIN_OPP_PG)]


def panels(w):
    nxt, ros = [], []
    for cut in NEXT_CUTS:
        d = to_date(w, cut)
        y = w[w["week"] == cut + 1].set_index("player_id")["ppr"].rename("y")
        nxt.append(d.join(y, how="inner").assign(cut=cut, season=w["season"].iloc[0]))
    for cut in ROS_CUTS:
        d = to_date(w, cut)
        r = w[w["week"] > cut].groupby("player_id")["ppr"].agg(["mean", "size"])
        y = r[r["size"] >= ROS_MIN_GAMES]["mean"].rename("y")
        ros.append(d.join(y, how="inner").assign(cut=cut, season=w["season"].iloc[0]))
    return pd.concat(nxt).reset_index(), pd.concat(ros).reset_index()


def score(d):
    out = {"n": len(d)}
    for k in ("ours", "ffo", "ppr", "blend"):
        out[f"r_{k}"] = np.corrcoef(d[k], d["y"])[0, 1]
        out[f"mae_{k}"] = (d[k] - d["y"]).abs().mean()
    return out


def boot_dr(d, rng):
    """Player-clustered bootstrap of r(ffo) - r(ours): rows for one player are
    not independent, so resample players, not rows."""
    key = d["player_id"] + "_" + d["season"].astype(str)
    groups = [g.index.to_numpy() for _, g in d.groupby(key)]
    a, b, y = d["ffo"].to_numpy(), d["ours"].to_numpy(), d["y"].to_numpy()
    diffs = []
    for _ in range(BOOT):
        idx = np.concatenate([groups[i] for i in rng.integers(0, len(groups), len(groups))])
        diffs.append(np.corrcoef(a[idx], y[idx])[0, 1] - np.corrcoef(b[idx], y[idx])[0, 1])
    return np.percentile(diffs, [2.5, 97.5])


def split_half(w):
    rows = []
    for (pid, season), g in w.groupby(["player_id", "season"]):
        odd, even = g[g["week"] % 2 == 1], g[g["week"] % 2 == 0]
        if len(odd) < 4 or len(even) < 4 or g["opp"].mean() < MIN_OPP_PG:
            continue
        rec = {"position": g["position"].iloc[-1]}
        for half, h in (("o", odd), ("e", even)):
            for k in ("ours", "ffo", "ppr"):
                rec[f"{k}_{half}"] = h[k].mean()
            rec[f"fpoe_ours_{half}"] = (h["ppr"] - h["ours"]).mean()
            rec[f"fpoe_ffo_{half}"] = (h["ppr"] - h["ffo"]).mean()
        rows.append(rec)
    return pd.DataFrame(rows)


def main():
    rng = np.random.default_rng(29)
    w = pd.concat([weekly(s) for s in SEASONS], ignore_index=True)
    nxt, ros = (pd.concat(x) for x in zip(*[panels(w[w["season"] == s]) for s in SEASONS]))
    f = lambda x: f"{x:.3f}"
    print("## Predictive test (pooled cutoffs; r = Pearson, MAE in PPR points)\n")
    print("| Target | Pos | Season | n | r ours | r ffo | r PPR/G | r blend | MAE ours | MAE ffo | MAE PPR/G | MAE blend |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for name, d in (("Next week", nxt), ("Rest of season /G", ros)):
        for pos in POS:
            for season in (*SEASONS, "both"):
                x = d[d["position"] == pos]
                if season != "both":
                    x = x[x["season"] == season]
                s = score(x)
                print(f"| {name} | {pos} | {season} | {s['n']} | {f(s['r_ours'])} | {f(s['r_ffo'])} | {f(s['r_ppr'])} "
                      f"| {f(s['r_blend'])} | {f(s['mae_ours'])} | {f(s['mae_ffo'])} | {f(s['mae_ppr'])} "
                      f"| {f(s['mae_blend'])} |")
    print("\n## Next week by cutoff window, both seasons\n")
    print("| Pos | Cutoff weeks | n | r ours | r ffo | r PPR/G | r blend |")
    print("|---|---|---|---|---|---|---|")
    for pos in POS:
        for lo, hi in ((3, 6), (7, 17)):
            x = nxt[(nxt["position"] == pos) & nxt["cut"].between(lo, hi)]
            s = score(x)
            print(f"| {pos} | {lo}-{hi} | {s['n']} | {f(s['r_ours'])} | {f(s['r_ffo'])} | {f(s['r_ppr'])} "
                  f"| {f(s['r_blend'])} |")
    print("\n## r(ffo) - r(ours), both seasons, 95% player-clustered bootstrap\n")
    print("| Target | Pos | delta r | 95% CI | delta MAE (ffo - ours) |")
    print("|---|---|---|---|---|")
    for name, d in (("Next week", nxt), ("Rest of season /G", ros)):
        for pos in (*POS, "all"):
            x = (d if pos == "all" else d[d["position"] == pos]).reset_index(drop=True)
            s = score(x)
            lo, hi = boot_dr(x, rng)
            print(f"| {name} | {pos} | {s['r_ffo'] - s['r_ours']:+.3f} | {lo:+.3f} to {hi:+.3f} "
                  f"| {s['mae_ffo'] - s['mae_ours']:+.3f} |")
    sh = split_half(w)
    print("\n## Split-half stability (odd vs even weeks, r between halves)\n")
    print("| Pos | n | xFP/G ours | xFP/G ffo | PPR/G | FPOE/G ours | FPOE/G ffo |")
    print("|---|---|---|---|---|---|---|")
    for pos in (*POS, "all"):
        x = sh if pos == "all" else sh[sh["position"] == pos]
        r = lambda k: np.corrcoef(x[f"{k}_o"], x[f"{k}_e"])[0, 1]
        print(f"| {pos} | {len(x)} | {f(r('ours'))} | {f(r('ffo'))} | {f(r('ppr'))} "
              f"| {f(r('fpoe_ours'))} | {f(r('fpoe_ffo'))} |")
    print("\n## Calibration: mean per player-week (all RB/WR/TE rows)\n")
    for pos in POS:
        x = w[w["position"] == pos]
        print(f"- {pos}: actual {x['ppr'].mean():.2f}, ours {x['ours'].mean():.2f}, ffo {x['ffo'].mean():.2f}")


if __name__ == "__main__":
    main()
