"""Features lane: fragility diagnostics for the scored cells (reporting only; no gate, definition or seed
changes). Reads the replay row files written by replay.py and refits the RB replays once for the sign of
the new feature's coefficient.

- Season-resample support (4,000 resamples, seed 7) of each calibration gate and of all six jointly,
  for the shipped model and each candidate on the same resample draws.
- Who carries the gain: the 10 largest per-row gains (season, college year, hit, drafted, feature value).
- Coefficient of the new feature (standardized scale) in each replay's fit at the C that replay chose.

    PROSPECT_DB=<lane copy> python projections/lanes/features/diag.py
"""
from __future__ import annotations

import json
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import build_prospect_model as bpm  # noqa: E402
import prospect_serving_backtest as psb  # noqa: E402
import replay as rp  # noqa: E402

NR = 4000


def support(r, col, rng_idx):
    seasons = np.array(sorted(r.season.unique()))
    by = {s: r[r.season == s] for s in seasons}
    hits = {"all": 0, "first_eligible": 0, "top60": 0, "joint": 0, "top60_slope": []}
    for idx in rng_idx:
        b = pd.concat([by[seasons[i]] for i in idx])
        y, p, fe = b.y.to_numpy(float), b[col].to_numpy(float), b.first_eligible.to_numpy(bool)
        a, f = psb.summary(y, p), psb.summary(y[fe], p[fe])
        # D1 on the resample: each drawn season's own top 60 by this forecast
        t = pd.concat([by[seasons[i]].nlargest(60, col) for i in idx])
        tt = psb.summary(t.y.to_numpy(float), t[col].to_numpy(float))
        ok = [psb.passes(a), psb.passes(f), psb.passes(tt)]
        hits["all"] += ok[0]
        hits["first_eligible"] += ok[1]
        hits["top60"] += ok[2]
        hits["joint"] += all(ok)
        hits["top60_slope"].append(tt.get("slope", np.nan))
    sl = np.array(hits.pop("top60_slope"))
    out = {k: v / len(rng_idx) for k, v in hits.items()}
    out["top60_slope_90"] = [float(np.nanpercentile(sl, 5)), float(np.nanpercentile(sl, 95))]
    return out


def main():
    warnings.filterwarnings("ignore")
    res = {}
    for pos in ("RB", "WR"):
        r = pd.read_parquet(rp.SCRATCH / f"replay_rows_{pos}.parquet")
        kind = rp.SHIPPED[pos]
        idx = np.random.default_rng(7).integers(0, r.season.nunique(), (NR, r.season.nunique()))
        res[pos] = {"support": {c: support(r, c, idx) for c in (kind, "F1", "F2")}}
        y = r.y.to_numpy(float)
        top = {}
        for c in ("F1", "F2"):
            g = rp.nll(y, r[kind].to_numpy(float)) - rp.nll(y, r[c].to_numpy(float))
            o = r.assign(gain=g, college_year=r.season - r.hs_class + 1).nlargest(10, "gain")
            top[c] = o[["season", "player_id", "college_year", "y", "gain", kind, c] + rp.lf.NEW].round(5).to_dict("records")
            res[pos][f"gain_share_top5_{c}"] = float(np.sort(g)[::-1][:5].sum() / g.sum()) if g.sum() > 0 else None
        res[pos]["top_gain_rows"] = top
        print(pos, json.dumps(res[pos]["support"], indent=1))
    # coefficient sign at RB (the only cell that passed), and F1 for contrast
    ps, e, age0, live, tal, rec, snaps, pst, pl = rp.build(["RB"])
    sp = snaps["RB"]
    r = pd.read_parquet(rp.SCRATCH / "replay_rows_RB.parquet")
    coefs = {}
    for cid, f in rp.CANDS.items():
        cols = pst.stage_cols("RB") + pl.LIVE + f
        cs = {}
        for season in psb.SEASONS:
            tr = sp[sp.hit.notna() & (sp.outcome_year <= season - sp.win) & (sp.season <= season - 1)]
            C = float(r[r.season == season][f"C_{cid}"].iloc[0])
            m = bpm.make_lr(C).fit(tr[cols].to_numpy(float), tr.hit.to_numpy(float))
            cs[season] = round(float(m[-1].coef_[0][cols.index(f[0])]), 4)
        coefs[cid] = cs
        print(cid, "RB coefficient (standardized) by replay:", cs)
    res["RB"]["coef_by_replay"] = coefs
    p = HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "features" / "results.json"
    book = json.loads(p.read_text(encoding="utf-8"))
    book["diagnostics"] = res
    p.write_text(json.dumps(book, indent=1, default=float), encoding="utf-8")


if __name__ == "__main__":
    main()
