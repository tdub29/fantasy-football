"""Young lane: checks on the served rows of young_replay.py (reported, not gating; prereg section 6).

1. The slope helper equals prospect_serving_backtest.calib on every evaluable gate cell.
2. Sensitivity: the last replay season of each year type loses 22-41% of its rows to open labels
   (COVID sixth years, see results.md), which can only push the observed rate up; gates recomputed
   without those seasons.
3. Sensitivity: placeholder "TEAM" rows (negative ESPN ids) removed.
4. Per-season ratio for the cells that passed.

    PROSPECT_DB=<lane copy> python projections/lanes/young/young_sensitivity.py
"""
from __future__ import annotations

import json
import pickle
import sys
import pathlib
import warnings

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import young_replay as yr  # noqa: E402

bpm, psb = yr.bpm, yr.psb


def cells(R):
    for (cand, pos), r in R.groupby(["cand", "pos"]):
        yield cand, pos, r.reset_index(drop=True)


def gates(r):
    top = r.sort_values("p", ascending=False).groupby("season").head(yr.TOP)
    out = {"G1": yr.gate(r), "G2": yr.gate(r[r.year == 1], served=(r.year == 1).any()), "G3": yr.gate(r[r.year == 2]),
           "G4": yr.gate(top)}
    b = bpm.class_bootstrap(r.hit.to_numpy(float), r.base.to_numpy(float), r.p.to_numpy(float), r.season.to_numpy(int))
    out["G5"] = {"status": "pass" if b["p"] >= 0.9 else "fail", "boot": b["p"]}
    return out


def brief(g):
    return {k: (v["status"], round(v.get("ratio", np.nan), 2), round(v.get("slope", np.nan), 2), v.get("events"),
                round(v.get("support", np.nan), 2)) if k != "G5" else (v["status"], round(v["boot"], 2)) for k, v in g.items()}


def main():
    warnings.filterwarnings("ignore")
    R = pickle.loads((yr.yd.TMP / "young-served.pkl").read_bytes())["rows"]
    out = {"calib_check": [], "drop_last_season": {}, "drop_team_rows": {}, "per_season": {}}
    for cand, pos, r in cells(R):
        for name, rows in (("all", r), ("year2", r[r.year == 2])):
            y, p = rows.hit.to_numpy(float), rows.p.to_numpy(float)
            if y.sum() >= yr.MIN_EV:
                a, b = yr.slope_fit(y, p), psb.calib(y, p)
                out["calib_check"].append([cand, pos, name, round(a, 4), round(b, 4)])
                assert abs(a - b) < 1e-3, (cand, pos, name, a, b)
        last = {y_: yr.last_season(pos, y_) for y_ in (1, 2)}
        keep = ~((r.year == 2) & (r.season == last[2])) & ~((r.year == 1) & (r.season == last[1]))
        out["drop_last_season"][f"{cand} {pos}"] = brief(gates(r[keep].reset_index(drop=True)))
        out["drop_team_rows"][f"{cand} {pos}"] = brief(gates(r[r.player_id > 0].reset_index(drop=True)))
        s = r.groupby("season").agg(n=("hit", "size"), events=("hit", "sum"), pred=("p", "sum"))
        out["per_season"][f"{cand} {pos}"] = {int(k): [int(v.n), int(v.events), round(float(v.pred), 1)] for k, v in s.iterrows()}
    for k in ("drop_last_season", "drop_team_rows"):
        print(k)
        for c, g in out[k].items():
            print("  ", c, g)
    print("per season (rows, hits, sum of forecasts) for YL1 RB:", out["per_season"]["YL1 RB"])
    (yr.NOTES / "sensitivity.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print(f"calib check: {len(out['calib_check'])} cells agree with psb.calib")


if __name__ == "__main__":
    main()
