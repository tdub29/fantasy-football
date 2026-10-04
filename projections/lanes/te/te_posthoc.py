"""TE lane, POST HOC (after T1-T3 were scored; not gating, not a pass): split the served replays into
the thin-history replays 2012-2014 (TE training classes 2008-2011 only) and 2015-2021, and compare per
gate. Also: per-replay events vs forecast. Writes posthoc into results.json under "posthoc".

    PROSPECT_DB=<lane copy> python -W ignore projections/lanes/te/te_posthoc.py
"""
import json

import numpy as np
import pandas as pd

import te_replay as tr
from te_candidates import NOTES


def main():
    path = NOTES / "results.json"
    book = json.loads(path.read_text(encoding="utf-8"))
    out = {"note": "post hoc, after scoring; the preregistered gates pool 2012-2021 and are the only verdict"}
    for cid, f in (("S4n4", "rows_s4n4_te.pkl"), ("S3", "rows_s3_te.pkl"), ("T1", "rows_T1_te.pkl"),
                   ("T2", "rows_T2_te.pkl"), ("T3", "rows_T3_te.pkl")):
        r = pd.read_pickle(tr.SCRATCH / f)
        res = {}
        for name, m in (("2012-2014", r.season <= 2014), ("2015-2021", r.season >= 2015)):
            g = tr.gates(r[m])
            res[name] = {k: {x: g[k].get(x) for x in ("n", "events", "ratio", "slope")} for k in ("all", "first_eligible", "top60")}
        ps = r.groupby("season").agg(events=("y", "sum"), pred=("_pd", "sum"))
        res["per_season"] = {int(s): {"events": int(v.events), "pred": round(float(v.pred), 2)} for s, v in ps.iterrows()}
        out[cid] = res
        f2 = lambda d: " | ".join(f"{k} {d[k]['ratio']:.2f}/{d[k]['slope']:.2f} ({d[k]['events']})" for k in ("all", "first_eligible", "top60"))
        print(f"{cid}: 2012-14 {f2(res['2012-2014'])}\n      2015-21 {f2(res['2015-2021'])}")
    book["posthoc"] = out
    path.write_text(json.dumps(book, indent=1, default=float), encoding="utf-8")


if __name__ == "__main__":
    main()
