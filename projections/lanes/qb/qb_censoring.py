"""QB lane diagnostic (not a candidate): how many served next-class QBs does each replay drop because
their outcome window is still open, and does that drop select on the outcome? Adds "replay_censoring"
to results.json.

    python projections/lanes/qb/qb_censoring.py
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import qb_candidates as qc
import qb_replay as q

bpm = q.bpm


def main():
    ctx = q.load()
    ps, e, age0 = ctx["ps"], ctx["e"], ctx["age0"]
    out = {}
    for season in q.psb.SEASONS:
        cur = ps[ps.season == season].player_id.unique()
        subj = e[(e.cpos == "QB") & e.player_id.isin(cur)][["player_id", "hs_class", "weight", "stars", "hit", "exit"]].copy()
        subj["pos"], subj["dob"] = "QB", pd.NaT
        subj["sid"] = "k" + subj.player_id.astype(str)
        subj = subj[np.maximum(season + 1, subj.hs_class + 3) == season + 1]
        done = bpm.predraft_profile(subj.drop(columns=["hit", "exit"]), ps, age0, season)
        subj = subj[subj.sid.map(done.n_qual).ge(1).to_numpy()]
        fe = subj[(season - subj.hs_class + 1) == 3]
        out[season] = {"served": int(len(subj)), "dropped_open_window": int(subj.hit.isna().sum()),
                       "first_eligible": int(len(fe)), "first_eligible_dropped": int(fe.hit.isna().sum()),
                       "first_eligible_kept_left_after_season": int(((fe.exit == season) & fe.hit.notna()).sum())}
    rows = {k: pd.read_parquet(q.SCRATCH / f"rows_{k}.parquet") for k in ("S3", "Q1", "Q2", "Q3")}
    early = {}
    for k, r in rows.items():
        a = r[r.season <= 2019]
        early[k] = {"all": q.summary(a), "first_eligible": q.summary(a[a.first_eligible]), "top60": q.summary(q.top60(a))}
    res = json.loads(qc.RES.read_text(encoding="utf-8"))
    res["replay_censoring"] = {"by_replay": out, "gates_on_2012_2019_replays_only": early,
                               "note": "diagnostic only; the gate stays on all ten replays"}
    qc.RES.write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    print(json.dumps(res["replay_censoring"], indent=1, default=float))


if __name__ == "__main__":
    main()
