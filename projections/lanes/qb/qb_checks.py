"""QB lane: robustness checks on Q3 (the only candidate that cleared the numeric gates). None of these
gate anything; they say how much weight the pass can bear. Adds "q3_checks" to results.json.

    python projections/lanes/qb/qb_checks.py
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import qb_candidates as qc
import qb_replay as q

bpm = q.bpm


def gates(r, col="_pd"):
    v = q._gate_vals(r, col)
    ok = all(q.psb.RATIO[0] <= a <= q.psb.RATIO[1] and q.psb.SLOPE[0] <= b <= q.psb.SLOPE[1] for a, b in v.values())
    return {k: [round(float(a), 3), round(float(b), 3)] for k, (a, b) in v.items()}, ok


def main():
    from sklearn.metrics import roc_auc_score
    s3 = pd.read_parquet(q.SCRATCH / "rows_S3.parquet")
    q3 = pd.read_parquet(q.SCRATCH / "rows_Q3.parquet")
    assert (s3[["season", "player_id", "y"]].to_numpy() == q3[["season", "player_id", "y"]].to_numpy()).all(), "row order differs"
    y = q3.y.to_numpy(float)
    out = {}
    out["q3_vs_s3_same_rows"] = {"s3_logloss": bpm.ll(y, s3._pd.to_numpy(float)), "q3_logloss": bpm.ll(y, q3._pd.to_numpy(float)),
                                 "boot_by_season": bpm.class_bootstrap(y, s3._pd.to_numpy(float), q3._pd.to_numpy(float),
                                                                       q3.season.to_numpy(int)),
                                 "auc_s3": float(roc_auc_score(y, s3._pd)), "auc_q3": float(roc_auc_score(y, q3._pd)),
                                 "logit_corr": float(np.corrcoef(bpm.logit(s3._pd.to_numpy(float)), bpm.logit(q3._pd.to_numpy(float)))[0, 1])}
    # addendum 15's stricter read (200,000 season resamples), reported only: the lane gate stays 90% of 4,000
    g = q3.season.to_numpy(int)
    out["bootstrap_200k"] = {"q3_vs_stars_stage": bpm.class_bootstrap(y, q3._base.to_numpy(float), q3._pd.to_numpy(float), g, n=200_000),
                             "q3_vs_s3": bpm.class_bootstrap(y, s3._pd.to_numpy(float), q3._pd.to_numpy(float), g, n=200_000)}
    loo = {}
    for s in sorted(q3.season.unique()):
        v, ok = gates(q3[q3.season != s])
        loo[int(s)] = {"gates": v, "every_gate": ok}
    out["leave_one_season_out"] = {"passes": int(sum(x["every_gate"] for x in loo.values())), "of": len(loo), "by_season": loo}
    fe = q3[q3.first_eligible]
    out["first_eligible_by_season"] = {int(s): {"n": int(len(g)), "events": int(g.y.sum()), "pred": round(float(g._pd.sum()), 2)}
                                       for s, g in fe.groupby("season")}
    nz = q3[q3.f_starts.fillna(0) > 0]
    v, ok = gates(nz)
    out["without_zero_completed_start_rows"] = {"rows": int(len(nz)), "events": int(nz.y.sum()), "gates": v, "every_gate": ok}
    # threshold sensitivity (preregistered value 10); a different value is NOT a candidate, only a read on fragility
    import prospect_stage as pst
    ctx = q.load()
    cols = pst.stage_cols("QB")
    sens = {}
    for k in (5, 15):
        r, info = qc.q3(ctx, cols, min_events=k)
        v, ok = gates(r)
        sens[k] = {"gates": v, "every_gate": ok, "shifted_replays": [s for s, x in info["per_replay"].items() if x["shifted"]],
                   "logloss": bpm.ll(r.y.to_numpy(float), r._pd.to_numpy(float))}
    out["min_events_sensitivity"] = sens
    res = json.loads(qc.RES.read_text(encoding="utf-8"))
    res["q3_checks"] = out
    qc.RES.write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    print(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    main()
