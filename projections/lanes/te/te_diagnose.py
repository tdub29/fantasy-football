"""TE lane step 1: where does the served TE over-forecast come from, and can a correct model clear
the fixed gates with ~38 events? Reads the row-level replays written by `te_replay.py check`.

    PROSPECT_DB=<lane copy> python projections/lanes/te/te_diagnose.py > <scratch>/diagnose.txt
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

import te_replay as tr

psb = tr.psb


def ratio_table(r, by, col="_pd"):
    g = r.groupby(by).agg(n=("y", "size"), events=("y", "sum"), pred=(col, "sum"), mean_p=(col, "mean"), obs=("y", "mean"))
    g["ratio"] = g.pred / g.events.replace(0, np.nan)
    return g.round(4)


def power(r, col="_pd", sims=2000, seed=11):
    """Treat the model's own served forecasts as the truth: one uniform per player shared by all his
    rows (his outcome is one event), y_row = U < p_row. Every row is then calibrated by construction;
    count how often the fixed gates pass on the same 897 rows."""
    rng = np.random.default_rng(seed)
    pid = r.player_id.to_numpy()
    uniq, inv = np.unique(pid, return_inverse=True)
    p = r[col].to_numpy(float)
    fe = r.first_eligible.to_numpy(bool)
    season = r.season.to_numpy(int)
    order = np.lexsort((-p, season))   # top 60 per season by own forecast: fixed, does not depend on y
    top = np.zeros(len(r), bool)
    for s in np.unique(season):
        idx = order[season[order] == s][:60]
        top[idx] = True
    res = {k: {"ratio": [], "slope": [], "events": []} for k in ("all", "first_eligible", "top60")}
    passes = {"all": 0, "first_eligible": 0, "top60": 0, "every": 0}
    for _ in range(sims):
        u = rng.random(len(uniq))[inv]
        y = (u < p).astype(float)
        ok_all = True
        for k, m in (("all", np.ones(len(r), bool)), ("first_eligible", fe), ("top60", top)):
            if y[m].sum() == 0:
                ok_all = False
                continue
            sm = psb.summary(y[m], p[m])
            res[k]["ratio"].append(sm["ratio"])
            res[k]["slope"].append(sm["slope"])
            res[k]["events"].append(sm["events"])
            ok = psb.passes(sm)
            passes[k] += ok
            ok_all &= ok
        passes["every"] += ok_all
    out = {"sims": sims, "pass_rate": {k: v / sims for k, v in passes.items()}}
    for k, v in res.items():
        out[k] = {m: [float(np.percentile(v[m], q)) for q in (5, 50, 95)] for m in ("ratio", "slope", "events")}
    return out


def main():
    c = tr.load()
    snap = c["snap"]
    r4 = pd.read_pickle(tr.SCRATCH / "rows_s4n4_te.pkl")
    r3 = pd.read_pickle(tr.SCRATCH / "rows_s3_te.pkl")
    out = {}
    pd.set_option("display.width", 200)
    for name, r in (("S3", r3), ("S4n4", r4)):
        r = r.copy()
        r["served_stage"] = r.stage.clip(upper=4)
        r["era"] = np.where(r.season >= 2017, "2017-21", "2012-16")
        r["decile"] = pd.qcut(r._pd.rank(method="first"), 10, labels=False) + 1
        r["top60"] = r.groupby("season")._pd.rank(ascending=False, method="first") <= 60
        print(f"\n===== {name} TE served rows: ratio by completed-season college year (2 = first-eligible)")
        print(ratio_table(r, "served_stage"))
        print(ratio_table(r, ["era", "first_eligible"]))
        print(ratio_table(r, "season"))
        print(ratio_table(r, "decile"))
        print(ratio_table(r, ["top60", "first_eligible"]))
        if name == "S4n4":
            print(ratio_table(r, ["has_live", "first_eligible"]))
        out[name] = {"by_stage": ratio_table(r, "served_stage").reset_index().to_dict("records"),
                     "by_top60_fe": ratio_table(r, ["top60", "first_eligible"]).reset_index().to_dict("records")}
    # Training-era base rates on served-shaped rows (stage 2+, plays next season) vs what the served rows did.
    te = snap[(snap.cpos == "TE") & snap.hit.notna()].copy()
    te["srv"] = (te.stage >= 2) & te.plays_next
    te["st"] = te.stage.clip(upper=4)
    print("\n===== TE snapshot hit rate by stage, served-shaped rows (stage 2+, plays next season), by decision class era")
    te["era"] = pd.cut(te.draft_year, [2007, 2011, 2015, 2019, 2023], labels=["2008-11", "2012-15", "2016-19", "2020-23"])
    t1 = te[te.srv].groupby(["era", "st"]).agg(n=("hit", "size"), hits=("hit", "sum"), rate=("hit", "mean")).round(4)
    print(t1)
    print("\n===== TE exits (one row per player) by decision class: n, hits, hit rate; stage at exit share")
    pl = te.sort_values("season").drop_duplicates("player_id", keep="last")
    t2 = pl.groupby("draft_year").agg(n=("hit", "size"), hits=("hit", "sum"), rate=("hit", "mean"),
                                       exit_stage=("stage", "mean")).round(3)
    print(t2.T)
    print("\n===== exits by stage at exit (hit rate): early leavers vs seniors")
    print(pl.groupby(pl.stage.clip(upper=5)).agg(n=("hit", "size"), hits=("hit", "sum"), rate=("hit", "mean")).round(4))
    # Hitters on the served rows.
    r = r4
    h = r[r.y == 1].groupby("player_id").agg(rows=("y", "size"), fe_rows=("first_eligible", "sum"), mean_p=("_pd", "mean"),
                                              max_p=("_pd", "max"), seasons=("season", lambda s: ",".join(map(str, s))))
    nm = c["name"]
    h["name"] = h.index.map(nm) if nm is not None else ""
    h["drafted"] = h.index.map(c["drafted"])
    h["pick"] = h.index.map(c["pick"])
    print("\n===== the 26 served hitters (S4n4)")
    print(h.sort_values("mean_p").to_string())
    # Largest over-forecast contributors: non-hit rows with highest _pd.
    miss = r[r.y == 0].sort_values("_pd", ascending=False).head(25).copy()
    miss["name"] = miss.player_id.map(nm) if nm is not None else ""
    miss["pick"] = miss.player_id.map(c["pick"])
    print("\n===== top 25 non-hit served rows by S4n4 forecast")
    print(miss[["season", "name", "stage", "first_eligible", "_pd", "pick", "live_rec_share", "ryptpa_best", "stars"]].to_string())
    # Power: the fixed gates under perfect calibration (the model's own forecasts as truth).
    for name, r in (("S4n4", r4), ("S3", r3)):
        pw = power(r)
        out[f"power_{name}"] = pw
        print(f"\n===== power, truth = {name} served forecasts, player-shared outcomes, {pw['sims']} sims")
        print(json.dumps(pw, indent=1))
    (tr.SCRATCH / "diagnose.json").write_text(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    sys.exit(main())
