"""Young lane: exact later-class serving replay (prereg.md sections 1-6) for the reference replays R1/R3
and the preregistered candidates YL1-YL3. Writes notes/prospect-research/lanes/young/results.json and
the served rows to the lane scratch dir. Never writes experiments/ or the shared store.

    PROSPECT_DB=<lane copy> python projections/lanes/young/young_replay.py
"""
from __future__ import annotations

import json
import pathlib
import pickle
import sys
import warnings

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import young_data as yd  # noqa: E402

bpm = yd.bpm
import prospect_experiments_b as peb  # noqa: E402
import prospect_live as pl  # noqa: E402
import prospect_serving_backtest as psb  # noqa: E402
import prospect_stage as pst  # noqa: E402

NOTES = yd.HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "young"
psb.OUT = NOTES / "serving-backtest-lane.json"   # never the shared experiments file (run_stage is not called here)
OUT = NOTES / "results.json"
SLOPE, RATIO, MIN_EV, TOP, BOOT, SUPPORT = (0.75, 1.25), (0.8, 1.25), 15, 30, 2000, 0.90
Y1C = ["stars", "power", "live_games", "live_yptpa", "live_rec_share", "live_scrim_pg", "has_live"]
POOL = ("RB", "WR", "TE")


def last_season(pos, year):
    return bpm.LAST_CLASS[pos] - (4 if year == 2 else 5)


def yl1_cols(pos):
    return [c for c in pst.stage_cols(pos) if c not in ("stage", "age_k")]


def nested(X, y, g):
    if y.sum() < 3:   # too few training events to fit: no number from this model this season (logged)
        return None
    m = peb.NestedLR().fit(X, y, g)
    m.C = peb.NestedLR.chosen[-1]
    return m


# ---------------------------------------------------------------- calibration helpers

def slope_fit(y, p):
    """Logistic recalibration slope of y on logit(p) (same MLE as psb.calib, by Newton steps)."""
    if len(y) == 0 or y.sum() == 0 or y.sum() == len(y):
        return np.nan
    x = bpm.logit(p)
    X = np.column_stack([np.ones_like(x), x])
    w = np.zeros(2)
    for _ in range(100):
        q = 1 / (1 + np.exp(-(X @ w)))
        H = X.T @ (X * (q * (1 - q))[:, None]) + 1e-10 * np.eye(2)
        step = np.linalg.solve(H, X.T @ (y - q))
        w += step
        if np.abs(step).max() < 1e-9:
            break
    return float(w[1])


def stat(y, p):
    out = {"n": int(len(y)), "events": int(y.sum())}
    if len(y) and y.sum() > 0:
        out.update(mean_pred=float(p.mean()), obs=float(y.mean()), ratio=float(p.mean() / y.mean()),
                   slope=slope_fit(y, p), logloss=bpm.ll(y, p))
    return out


def inband(r, s):
    return RATIO[0] <= r <= RATIO[1] and SLOPE[0] <= s <= SLOPE[1]


def gate(rows: pd.DataFrame, served: bool = True):
    """Point gate, season-resampling support and leave-one-season-out range for one gate cell."""
    if not served:
        return {"status": "unserved"}
    y, p = rows.hit.to_numpy(float), rows.p.to_numpy(float)
    g = stat(y, p)
    if g["events"] < MIN_EV:
        g["status"] = "not evaluable"
        return g
    g["status"] = "pass" if inband(g["ratio"], g["slope"]) else "fail"
    by = [(d.hit.to_numpy(float), d.p.to_numpy(float)) for _, d in rows.groupby("season")]
    rng = np.random.default_rng(7)
    ok = 0
    for _ in range(BOOT):
        pick = rng.integers(0, len(by), len(by))
        yy = np.concatenate([by[i][0] for i in pick])
        pp_ = np.concatenate([by[i][1] for i in pick])
        if yy.sum() > 0 and inband(pp_.mean() / yy.mean(), slope_fit(yy, pp_)):
            ok += 1
    g["support"] = ok / BOOT
    lo = []
    for i in range(len(by)):
        yy = np.concatenate([b[0] for j, b in enumerate(by) if j != i])
        pp_ = np.concatenate([b[1] for j, b in enumerate(by) if j != i])
        lo.append((pp_.mean() / yy.mean(), slope_fit(yy, pp_)))
    lo = np.array(lo)
    g["loso_ratio"] = [float(np.nanmin(lo[:, 0])), float(np.nanmax(lo[:, 0]))]
    g["loso_slope"] = [float(np.nanmin(lo[:, 1])), float(np.nanmax(lo[:, 1]))]
    if g["status"] == "pass" and g["support"] < SUPPORT:
        g["status"] = "pass (fragile)"
    return g


# ---------------------------------------------------------------- pooled model (YL3)

class Pooled:
    """Within-position median fill and z-score on the training rows, plus RB/TE indicators, then NestedLR."""

    def fit(self, X, y, g, pos):
        self.st = {}
        for q in POOL:
            k = pos == q
            med = np.nanmedian(X[k], axis=0)
            Z = np.where(np.isnan(X[k]), med, X[k])
            sd = Z.std(axis=0)
            self.st[q] = (med, Z.mean(axis=0), np.where(sd > 0, sd, 1.0))
        self.m = nested(self._z(X, pos), y, g)
        if self.m is None:
            return None
        self.C = self.m.C
        return self

    def _z(self, X, pos):
        Z = np.empty_like(X, dtype=float)
        for q in POOL:
            k = pos == q
            med, mu, sd = self.st[q]
            Z[k] = (np.where(np.isnan(X[k]), med, X[k]) - mu) / sd
        return np.column_stack([Z, (pos == "RB").astype(float), (pos == "TE").astype(float)])

    def bind(self, q):
        outer = self

        class B:
            def predict_proba(self, X):
                return outer.m.predict_proba(outer._z(np.asarray(X, float), np.full(len(X), q)))
        return B()


# ---------------------------------------------------------------- data

def frames(D):
    ps, snap, wide, live4 = D["ps"], D["snap"], D["wide"], D["live4"]
    W = wide.drop_duplicates("player_id").set_index("player_id")
    psu = ps.drop_duplicates(["player_id", "season"])
    key = lambda s, p: pd.MultiIndex.from_arrays([np.asarray(s, int), pd.array(np.asarray(p), dtype="Int64")])  # noqa: E731

    def live_at(seasons, pids):
        lv = live4.reindex(key(seasons, pids))
        out = pd.DataFrame(lv.to_numpy(), columns=pl.LIVE)
        out["has_live"] = out.has_live.fillna(0.0)
        return out

    # year-2 type: stage-1 snapshot of a player who played the next season; live line from k + 1
    t2 = snap[(snap.stage == 1) & snap.plays_next & snap.hit.notna()].reset_index(drop=True)
    t2 = pd.concat([t2, live_at(t2.season + 1, t2.player_id)], axis=1)
    t2["year"] = 2
    t2["drafted"] = t2.player_id.map(W.drafted)
    # year-1 type: a stat line in his first college season (unfiltered exits), live line from that season
    fr = psu[psu.player_id.isin(W.index)][["player_id", "season", "power"]].copy()
    fr["hs_class"] = fr.player_id.map(W.hs_class)
    fr = fr[fr.season == fr.hs_class].reset_index(drop=True)
    for c in ("cpos", "stars", "hit", "outcome_year", "win", "draft_year", "drafted", "weight"):
        fr[c] = fr.player_id.map(W[c])
    fr = fr[fr.hit.notna()].reset_index(drop=True)
    t1 = pd.concat([fr, live_at(fr.season, fr.player_id)], axis=1)
    t1["year"] = 1
    allsnap = snap[snap.hit.notna()]
    return W, psu, t1, t2, allsnap, live_at


def main():
    warnings.filterwarnings("ignore")
    D = yd.load()
    ps, age0 = D["ps"], D["age0"]
    W, psu, t1, t2, allsnap, live_at = frames(D)
    team_at = psu.set_index(["player_id", "season"]).team_id
    power_at = psu.set_index(["player_id", "season"]).power
    started = psu[psu.started.astype(bool)].groupby("player_id").season.min()   # first season with a start
    served_rows, dropped, chosen, nofit = [], {}, [], []
    CANDS = ("R1", "R3", "YL1", "YL2", "YL3")
    for S in range(2012, max(last_season(p, 2) for p in bpm.POS) + 1):
        closed = lambda f: f[(f.outcome_year <= S - f.win) & (f.season <= S - 1)]  # noqa: E731
        c1, c2, ca = closed(t1), closed(t2), closed(allsnap)
        cur = psu[psu.season == S].player_id
        pooled = {}
        if S <= max(last_season(p, 2) for p in POOL):
            for yr, tr, cols in ((2, c2, yl1_cols("TE") + pl.LIVE), (1, c1, Y1C)):
                tr = tr[tr.cpos.isin(POOL)]
                pooled[yr] = Pooled().fit(tr[cols].to_numpy(float), tr.hit.to_numpy(float), tr.draft_year.to_numpy(int),
                                          tr.cpos.to_numpy())
                if pooled[yr] is None:
                    nofit.append({"S": S, "pos": "pooled", "what": f"YL3 year {yr}"})
                else:
                    chosen.append({"S": S, "cand": "YL3", "year": yr, "C": pooled[yr].C})
        for pos in bpm.POS:
            if S > last_season(pos, 2):
                continue
            # served subjects: stat line in S, college year 1-2, label known (prereg section 1)
            sub = W[(W.cpos == pos) & W.index.isin(cur)].copy()
            sub["year"] = S - sub.hs_class + 1
            sub = sub[sub.year.isin([1, 2])]
            sub = sub[(sub.year == 2) | (S <= last_season(pos, 1))]
            if pos == "QB":
                sub = sub[sub.index.map(started).to_numpy(float) <= S]
            dropped.setdefault(pos, 0)
            dropped[pos] += int(sub.hit.isna().sum())
            sub = sub[sub.hit.notna()]
            sub = sub.reset_index().rename(columns={"index": "player_id"})
            sub["player_id"] = sub.player_id.astype("Int64")
            sub["team_ok"] = [D["team_games"][S].get(team_at.get((p, S)), 0) >= 4 for p in sub.player_id]
            # models
            p2, p1, pa = c2[c2.cpos == pos], c1[c1.cpos == pos], ca[ca.cpos == pos]
            pb_ = pd.concat([p1, p2])
            if pb_.hit.sum() < 3 or pa.hit.sum() < 3:   # nothing can be fit or compared this season
                nofit.append({"S": S, "pos": pos, "what": "baseline/R1"})
                continue
            base = bpm.make_lr(bpm.C_FIXED).fit(pb_[["stars", "year"]].to_numpy(float), pb_.hit.to_numpy(float))
            sc = pst.stage_cols(pos)
            models = {"R1": (bpm.make_lr(bpm.C_FIXED).fit(pa[sc].to_numpy(float), pa.hit.to_numpy(float)), sc),
                      "R3": (nested(pa[sc].to_numpy(float), pa.hit.to_numpy(float), pa.draft_year.to_numpy(int)), sc),
                      "YL1": (nested(p2[yl1_cols(pos)].to_numpy(float), p2.hit.to_numpy(float), p2.draft_year.to_numpy(int)),
                              yl1_cols(pos))}
            c2l = yl1_cols(pos) + pl.LIVE
            models["YL2"] = (nested(p2[c2l].to_numpy(float), p2.hit.to_numpy(float), p2.draft_year.to_numpy(int)), c2l)
            y1m = nested(p1[Y1C].to_numpy(float), p1.hit.to_numpy(float), p1.draft_year.to_numpy(int))
            for k, (m_, _) in list(models.items()):
                if m_ is None:
                    nofit.append({"S": S, "pos": pos, "what": f"{k} year 2"})
                elif k != "R1":
                    chosen.append({"S": S, "pos": pos, "cand": k, "year": 2, "C": m_.C})
            if y1m is None:
                nofit.append({"S": S, "pos": pos, "what": "YL2 year 1"})
            else:
                chosen.append({"S": S, "pos": pos, "cand": "YL2", "year": 1, "C": y1m.C})
            if pos in POOL:
                models["YL3"] = (pooled[2].bind(pos) if pooled.get(2) else None, yl1_cols("TE") + pl.LIVE)
            # year-2 serving: the production path (predraft_profile + stage_score which="later")
            s2 = sub[sub.year == 2].copy()
            s2["pos"], s2["dob"], s2["sid"] = pos, pd.NaT, "k" + s2.player_id.astype(str)
            s2["cls"] = np.maximum(S + 1, s2.hs_class + 3)
            done = bpm.predraft_profile(s2, ps, age0, S) if len(s2) else None
            if done is not None:
                lv = live_at(np.full(len(done), S), s2.set_index("sid").loc[done.index].player_id)
                done_l = done.join(lv.set_index(done.index))
                done_l = done_l[s2.set_index("sid").loc[done_l.index].team_ok.to_numpy()]
            for cand in CANDS:
                if cand == "YL3" and pos not in POOL:
                    continue
                m, cols = models[cand]
                parts = []
                if done is not None and m is not None:
                    d_ = done_l if cand in ("YL2", "YL3") else done
                    sc_ = bpm.stage_score(s2.assign(_pd=np.nan, _pdx=np.nan), d_, {"model": m, "cols": cols}, age0, S, "later")
                    sc_ = sc_[sc_._pd.notna()]
                    parts.append(pd.DataFrame({"player_id": sc_.player_id.to_numpy(), "year": 2, "p": sc_._pd.to_numpy(float),
                                               "stars": sc_.stars.to_numpy(float), "hit": sc_.hit.to_numpy(float),
                                               "drafted": sc_.drafted.to_numpy(float)}))
                if cand in ("YL2", "YL3"):
                    s1 = sub[(sub.year == 1) & sub.team_ok].copy()
                    if len(s1) and (y1m if cand == "YL2" else pooled.get(1)) is not None:
                        X1 = pd.concat([s1[["stars"]].reset_index(drop=True),
                                        pd.Series([power_at.get((p, S), np.nan) for p in s1.player_id], name="power"),
                                        live_at(np.full(len(s1), S), s1.player_id)], axis=1)
                        mm = y1m if cand == "YL2" else pooled[1].bind(pos)
                        parts.append(pd.DataFrame({"player_id": s1.player_id.to_numpy(), "year": 1,
                                                   "p": mm.predict_proba(X1[Y1C].to_numpy(float))[:, 1],
                                                   "stars": s1.stars.to_numpy(float), "hit": s1.hit.to_numpy(float),
                                                   "drafted": s1.drafted.to_numpy(float)}))
                if not parts:
                    continue
                r = pd.concat(parts, ignore_index=True)
                r["base"] = base.predict_proba(r[["stars", "year"]].to_numpy(float))[:, 1]
                r["season"], r["pos"], r["cand"] = S, pos, cand
                served_rows.append(r)
        print(f"replayed {S}", flush=True)
    R = pd.concat(served_rows, ignore_index=True)
    (yd.TMP / "young-served.pkl").write_bytes(pickle.dumps({"rows": R, "chosen": chosen, "dropped": dropped, "nofit": nofit}))
    report(R, chosen, dropped, nofit)


def report(R, chosen, dropped, nofit):
    from sklearn.metrics import roc_auc_score
    res = {"prereg": "notes/prospect-research/lanes/young/prereg.md", "dropped_open_labels": dropped, "no_fit": nofit, "cells": {}}
    for (cand, pos), r in R.groupby(["cand", "pos"]):
        r = r.reset_index(drop=True)
        top = r.sort_values("p", ascending=False).groupby("season").head(TOP)
        g = {"G1_all": gate(r), "G2_year1": gate(r[r.year == 1], served=(r.year == 1).any()),
             "G3_year2": gate(r[r.year == 2]), "G4_D1L_top30": gate(top)}
        y_, pc, pb = r.hit.to_numpy(float), r.p.to_numpy(float), r.base.to_numpy(float)
        boot = bpm.class_bootstrap(y_, pb, pc, r.season.to_numpy(int))
        g["G5_vs_stars_year"] = {"base_logloss": bpm.ll(y_, pb), "cand_logloss": bpm.ll(y_, pc), "boot": boot,
                                 "status": "pass" if boot["p"] >= 0.9 else "fail"}
        dr = r.drafted.eq(1).to_numpy()
        ex = {"auc": float(roc_auc_score(y_, pc)) if 0 < y_.sum() < len(y_) else None,
              "base_auc": float(roc_auc_score(y_, pb)) if 0 < y_.sum() < len(y_) else None,
              "drafted_auc": float(roc_auc_score(y_[dr], pc[dr])) if 0 < y_[dr].sum() < dr.sum() else None,
              "drafted_base_auc": float(roc_auc_score(y_[dr], pb[dr])) if 0 < y_[dr].sum() < dr.sum() else None,
              "replays_2016_on": stat(y_[r.season >= 2016], pc[r.season >= 2016]),
              "players": int(r.player_id.nunique()), "players_hit": int(r.groupby("player_id").hit.max().sum()),
              "seasons": [int(r.season.min()), int(r.season.max())]}
        core = [g["G1_all"], g["G3_year2"], g["G4_D1L_top30"], g["G5_vs_stars_year"]]
        ok = all(x["status"].startswith("pass") for x in core) and g["G2_year1"]["status"] in ("unserved", "pass", "pass (fragile)")
        fragile = any(x.get("status") == "pass (fragile)" for x in g.values())
        res["cells"][f"{cand} {pos}"] = {"gates": g, "extra": ex,
                                         "verdict": ("PASS (fragile)" if fragile else "PASS") if ok else "FAIL"}
        line = " | ".join(f"{k.split('_')[0]} {v['status']}"
                          + (f" r{v['ratio']:.2f} s{v['slope']:.2f} ev{v['events']} sup{v.get('support', float('nan')):.0%}"
                             if "ratio" in v else (f" ev{v.get('events')}" if "events" in v else ""))
                          for k, v in g.items() if k != "G5_vs_stars_year")
        print(f"{cand} {pos}: {line} | G5 {g['G5_vs_stars_year']['base_logloss']:.4f}->{g['G5_vs_stars_year']['cand_logloss']:.4f} "
              f"({boot['p']:.0%}) | {res['cells'][f'{cand} {pos}']['verdict']}")
    res["chosen_C"] = {f"{c} year {y}": {str(k): int(v) for k, v in g.C.value_counts().items()}
                       for (c, y), g in pd.DataFrame(chosen).groupby(["cand", "year"])}
    OUT.write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")


if __name__ == "__main__":
    if sys.argv[1:] == ["--report"]:
        d = pickle.loads((yd.TMP / "young-served.pkl").read_bytes())
        report(d["rows"], d["chosen"], d["dropped"], d["nofit"])
    else:
        main()
