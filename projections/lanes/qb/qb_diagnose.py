"""QB lane step 1: why are first-eligible QBs under-forecast in the served replay, and can ~31 events
clear the fixed gates at all? Reads the S3 replay rows (qb_replay.py parity) and the snapshot table.

    python projections/lanes/qb/qb_diagnose.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qb_replay as q  # noqa: E402

OUT = q.HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "qb" / "diagnosis.json"


def rate(df, col="_pd"):
    return {"n": int(len(df)), "events": int(df.y.sum()), "pred": round(float(df[col].sum()), 2),
            "ratio": round(float(df[col].sum() / df.y.sum()), 3) if df.y.sum() else None}


def power(r, col="_pd", n=2000, seed=11):
    """A model that is calibrated by construction: draw each player's outcome from its own forecasts
    (one uniform per player, so his rows move together, as the real label does) and count how often
    the fixed gates hold. If a calibrated model with this sharpness rarely clears them, a failure says
    little about the model."""
    rng = np.random.default_rng(seed)
    pid = r.player_id.to_numpy()
    uniq, inv = np.unique(pid, return_inverse=True)
    p = r[col].to_numpy(float)
    keys = [f"{a}_{b}" for a in ("all", "first_eligible", "top60") for b in ("ratio", "slope")] + ["every_gate"]
    cnt = {k: 0 for k in keys}
    vals = {k: [] for k in keys if k != "every_gate"}
    for _ in range(n):
        u = rng.random(len(uniq))[inv]
        rr = r.assign(y=(u < p).astype(float))
        v = q._gate_vals(rr, col)
        ok = True
        for a, (ratio, slope) in v.items():
            okr, oks = q.psb.RATIO[0] <= ratio <= q.psb.RATIO[1], q.psb.SLOPE[0] <= slope <= q.psb.SLOPE[1]
            cnt[f"{a}_ratio"] += okr
            cnt[f"{a}_slope"] += oks
            vals[f"{a}_ratio"].append(ratio)
            vals[f"{a}_slope"].append(slope)
            ok &= okr and oks
        cnt["every_gate"] += ok
    out = {k: v / n for k, v in cnt.items()}
    out["interval_90"] = {k: [round(float(np.nanpercentile(v, 5)), 3), round(float(np.nanpercentile(v, 95)), 3)] for k, v in vals.items()}
    return out


def main():
    ctx = q.load()
    r = pd.read_parquet(q.SCRATCH / "rows_S3.parquet")
    e = ctx["e"].drop_duplicates("player_id").set_index("player_id")
    snap = ctx["snap"]
    sq = snap[(snap.cpos == "QB") & snap.hit.notna()]
    r["exit"] = r.player_id.map(e.exit)
    r["drafted"] = r.player_id.map(e.drafted)
    r["name"] = r.player_id.map(e.name_final)
    r["declared_now"] = r.exit.eq(r.season)                     # left after the season being played
    r["zero_starts"] = r.f_starts.fillna(0).eq(0)
    fe = r[r.first_eligible]
    d = {}
    d["s3_first_eligible"] = rate(fe)
    d["fe_by_zero_completed_starts"] = {str(k): rate(g) for k, g in fe.groupby("zero_starts")}
    d["all_by_zero_completed_starts"] = {str(k): rate(g) for k, g in r.groupby("zero_starts")}
    d["fe_by_declared_after_season"] = {str(k): rate(g) for k, g in fe.groupby("declared_now")}
    d["fe_by_era"] = {"2012-2016": rate(fe[fe.season <= 2016]), "2017-2021": rate(fe[fe.season >= 2017])}
    d["all_by_stage"] = {str(int(k)): rate(g) for k, g in r.groupby("f_stage")}
    d["fe_by_drafted"] = {str(k): rate(g) for k, g in fe.groupby("drafted")}
    # where does the missing forecast sit: hitters' own forecasts
    hit_rows = fe[fe.y == 1].sort_values("_pd")
    d["fe_hitters"] = [{"season": int(x.season), "name": x["name"], "p": round(float(x._pd), 3), "starts": float(x.f_starts),
                        "aya": None if pd.isna(x.f_aya_final) else round(float(x.f_aya_final), 2),
                        "rush_ypg_best": None if pd.isna(x.f_rush_ypg_best) else round(float(x.f_rush_ypg_best), 1),
                        "declared_after_season": bool(x.declared_now), "zero_starts": bool(x.zero_starts)}
                       for _, x in hit_rows.iterrows()]
    # training rows that mirror the first-eligible served row: stage-2 snapshots
    s2 = sq[sq.stage == 2]
    d["train_stage2_hit_rate"] = {"plays_next": {str(k): {"n": int(len(g)), "hits": int(g.hit.sum()), "rate": round(float(g.hit.mean()), 4)}
                                                 for k, g in s2.groupby("plays_next")}}
    s3 = sq[sq.stage >= 3]
    d["train_stage3plus_hit_rate"] = {str(k): {"n": int(len(g)), "hits": int(g.hit.sum()), "rate": round(float(g.hit.mean()), 4)}
                                      for k, g in s3.groupby("plays_next")}
    # outcome window: draft classes whose window closed by each replayed season, and their hits
    d["training_by_replay"] = {}
    for season in q.psb.SEASONS:
        tr = sq[(sq.outcome_year <= season - sq.win) & (sq.season <= season - 1)]
        d["training_by_replay"][season] = {"rows": int(len(tr)), "players": int(tr.player_id.nunique()),
                                           "hitters": int(tr.groupby("player_id").hit.max().sum()),
                                           "classes": f"{int(tr.draft_year.min())}-{int(tr.draft_year.max())}" if len(tr) else ""}
    # did the hit rate of QB exits rise over classes (drift)?
    m = e[(e.cpos == "QB") & e.hit.notna()]
    d["qb_exit_hit_rate_by_class"] = {int(k): {"n": int(len(g)), "hits": int(g.hit.sum())} for k, g in m.groupby("draft_year")}
    # chance of the observed first-eligible count or more if S3 were calibrated (Poisson binomial, exact)
    pf = fe._pd.to_numpy(float)
    dist = np.zeros(len(pf) + 1)
    dist[0] = 1.0
    for p in pf:
        dist[1:] = dist[1:] * (1 - p) + dist[:-1] * p
        dist[0] *= (1 - p)
    k = int(fe.y.sum())
    d["fe_tail_prob_if_calibrated"] = {"expected": round(float(pf.sum()), 2), "observed": k, "p_ge_observed": float(dist[k:].sum())}
    d["power_check_S3_forecasts"] = power(r)
    r.to_parquet(q.SCRATCH / "rows_S3_diag.parquet")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(d, indent=1, default=float), encoding="utf-8")
    print(json.dumps(d, indent=1, default=float))


if __name__ == "__main__":
    main()
