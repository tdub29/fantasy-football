"""Pipeline finding M5/C5: how much selection optimism is in the displayed K0's forward scores?

K0 (bpm.fit_baseline: 4-knot restricted cubic spline in log pick, penalized curvature, C 0.1) was
chosen in the 2026-09-28 revision (model card, "Capital curve (P1a)") on the 2008-2019 classes, which
overlap the forward test classes 2013-2019. Two read-only estimates, both at the hit line only
(QB12, RB24, WR24, TE12), population A, embargoed forward folds from prospect_experiments.py:

  (a) nested: inside every outer forward fold, pick the capital curve again from the P1a grid by
      inner leave-one-class-out log loss on that fold's training classes only, refit the winner on
      the fold and score the held-out class. Optimism = nested log loss - fixed-K0 log loss on the
      same rows (positive: the fixed spec's forward number is flattering).
  (b) untouched classes: K0's forward predictions on the 2020+ test classes only, which no spec choice
      saw. Caveat: the 2020-2023 holdout was spent on ship decisions (M4 display), not on this spec.

Every metric is against the fold-local base rate (training-class hit rate) on identical rows, with
90% draft-class bootstrap intervals (4,000 resamples, seed 7). Nothing is tuned; the grid is the P1a
grid plus the C values the card says were checked. The DB is opened read-only.

    python notes/prospect-research/experiments/m5_k0_selection_optimism.py              # writes m5_k0_selection_optimism.json
    python notes/prospect-research/experiments/m5_k0_selection_optimism.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import sqlite3
import sys
import warnings

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "projections"))
import build_prospect_model as bpm  # noqa: E402
import prospect_db as pdb  # noqa: E402
import prospect_experiments as pe  # noqa: E402

EXP = pathlib.Path(__file__).resolve().parent
OUT = EXP / "m5_k0_selection_optimism.json"
UNTOUCHED = 2020          # first class no capital-curve choice saw (P1a used 2008-2019)
NBOOT, SEED = 4000, 7
UNPEN_C = 1e4


class RCS3:
    """Harrell 3-knot restricted cubic spline (10/50/90th training percentiles): linear term + 1."""
    def fit(self, X, y=None):
        self.k_ = np.percentile(np.asarray(X, float)[:, 0], [10, 50, 90])
        return self

    def transform(self, X):
        x, k = np.asarray(X, float)[:, 0], self.k_
        p = lambda u: np.maximum(u, 0.0) ** 3   # noqa: E731
        s = (p(x - k[0]) - p(x - k[1]) * (k[2] - k[0]) / (k[2] - k[1])
             + p(x - k[2]) * (k[1] - k[0]) / (k[2] - k[1])) / (k[2] - k[0]) ** 2
        return np.column_stack([x, s])

    def fit_transform(self, X, y=None):
        return self.fit(X).transform(X)


def _quad(X):
    x = np.asarray(X, float)[:, 0]
    return np.column_stack([x, x * x])


def curve(basis, C, boost):
    """Logistic on a standardized basis of log pick; boost=True leaves the linear term near-unpenalized
    (bpm._boost_linear), as K0 does."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import FunctionTransformer, StandardScaler
    steps = [basis(), StandardScaler()] + ([FunctionTransformer(bpm._boost_linear)] if boost else [])
    return lambda X, y: make_pipeline(*steps, LogisticRegression(C=C, max_iter=5000)).fit(X, y)


ident = lambda: __import__("sklearn.preprocessing", fromlist=["FunctionTransformer"]).FunctionTransformer()  # noqa: E731
quad = lambda: __import__("sklearn.preprocessing", fromlist=["FunctionTransformer"]).FunctionTransformer(_quad)  # noqa: E731

# P1a grid (linear, quadratic, 3- and 4-knot RCS with and without curvature penalty) plus the C values
# the card reports checking for the penalized curve. "rcs4_pen_C0.1" is K0 exactly.
GRID = {
    "linear": curve(ident, UNPEN_C, False),
    "quadratic": curve(quad, UNPEN_C, False),
    "rcs3_unpen": curve(RCS3, UNPEN_C, False),
    "rcs3_pen_C0.1": curve(RCS3, 0.1, True),
    "rcs4_unpen": curve(bpm.RCS, UNPEN_C, False),
    "rcs4_pen_C0.03": curve(bpm.RCS, 0.03, True),
    "rcs4_pen_C0.1": lambda X, y: bpm.fit_baseline(X, y, None),
    "rcs4_pen_C0.3": curve(bpm.RCS, 0.3, True),
    "rcs4_pen_C1": curve(bpm.RCS, 1.0, True),
}
K0 = "rcs4_pen_C0.1"
FALLBACK = "linear"   # pre-P1a baseline: used only when a fold has too few classes for an inner loop


def nll(y, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def inner_pick(x, y, g):
    """Spec with the lowest pooled inner leave-one-class-out log loss on these training rows."""
    cls = np.unique(g)
    if len(cls) < 3:
        return FALLBACK
    best, best_ll = FALLBACK, np.inf
    for name, fit in GRID.items():
        p = np.full(len(y), np.nan)
        for c in cls:
            tr = g != c
            if y[tr].sum() < 3 or y[tr].sum() == tr.sum():
                continue
            p[~tr] = fit(x[tr], y[tr]).predict_proba(x[~tr])[:, 1]
        k = ~np.isnan(p)
        if k.sum() < len(y) * 0.5:
            continue
        v = nll(y[k], p[k]).mean()
        if v < best_ll:
            best, best_ll = name, v
    return best


def calib(y, p):
    return pe.calib(y, p)[0]


def boot(y, g, preds, n=NBOOT, seed=SEED):
    """Class bootstrap: 90% intervals of each model's pooled log loss and calibration slope, of the
    paired gains vs BASE and of nested-minus-K0 optimism. Same class draws for every quantity."""
    cls = np.unique(g)
    rows = [np.flatnonzero(g == c) for c in cls]
    idx = np.random.default_rng(seed).integers(0, len(cls), (n, len(cls)))
    L = {m: np.array([nll(y[r], p[r]).sum() for r in rows]) for m, p in preds.items()}
    N = np.array([len(r) for r in rows])
    den = N[idx].sum(1)
    ll = {m: v[idx].sum(1) / den for m, v in L.items()}
    q = lambda a: [float(np.nanpercentile(a, 5)), float(np.nanpercentile(a, 95))]   # noqa: E731
    out = {f"logloss_90_{m}": q(v) for m, v in ll.items()}
    for m in preds:
        if m != "BASE":
            gain = ll["BASE"] - ll[m]
            out[f"gain_vs_base_90_{m}"] = q(gain)
            out[f"p_beats_base_{m}"] = float((gain > 0).mean())
            sl = []
            for i in idx:
                r = np.concatenate([rows[j] for j in i])
                try:
                    sl.append(calib(y[r], preds[m][r]) if 0 < y[r].sum() < len(r) else np.nan)
                except Exception:   # separation in a tiny resample
                    sl.append(np.nan)
            out[f"slope_90_{m}"] = q(np.array(sl))
            out[f"p_slope_in_band_{m}"] = float(np.nanmean((np.array(sl) >= 0.75) & (np.array(sl) <= 1.25)))
    if "NESTED" in preds:
        out["optimism_90"] = q(ll["NESTED"] - ll["K0"])
    return out


def summarize(y, g, preds, mask):
    yy, gg = y[mask], g[mask]
    pp = {m: p[mask] for m, p in preds.items()}
    res = {"n": int(mask.sum()), "events": int(yy.sum()), "classes": sorted(int(c) for c in np.unique(gg))}
    for m, p in pp.items():
        res[m] = {"logloss": float(nll(yy, p).mean()), "brier": float(np.mean((yy - p) ** 2))}
        if m != "BASE":
            sl, ic = pe.calib(yy, p)
            res[m].update(slope=sl, intercept=ic, gain_vs_base=float(nll(yy, pp["BASE"]).mean() - nll(yy, p).mean()))
    if "NESTED" in pp:
        res["optimism"] = res["NESTED"]["logloss"] - res["K0"]["logloss"]
    res["boot"] = boot(yy, gg, pp)
    return res


def run(say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    # Read-only: pre-set the module connection so read_src never calls pdb.connect()/ingest (both write).
    bpm._CON = sqlite3.connect(f"file:{pdb.DB_PATH.as_posix()}?mode=ro", uri=True)
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    src_hash = hashlib.sha256(json.dumps(pdb.source_shas(bpm._CON), sort_keys=True).encode()).hexdigest()
    results = {}
    oof_ref = pd.read_csv(EXP / "M4-oof.csv")
    for pos in bpm.POS:
        cut, win = bpm.TARGET[pos]
        tp = t[(t.pos == pos) & t.gsis_id.notna() & t.draft_year.between(bpm.FIRST_CLASS, bpm.LAST_CLASS[pos])
               & t.hit.notna()].reset_index(drop=True)
        g = tp.draft_year.to_numpy(int)
        y = (np.nan_to_num(tp.best_rank.to_numpy(float), nan=999) <= cut).astype(float)
        x = tp[["log_pick"]].to_numpy(float)
        picks = {}

        def fold(c):
            return pe.fold_mask(g, "fwd", c, win)

        def k0(scheme, c, te):
            tr = fold(c)
            return np.full(te.sum(), np.nan) if y[tr].sum() < 3 else GRID[K0](x[tr], y[tr]).predict_proba(x[te])[:, 1]

        def base(scheme, c, te):
            tr = fold(c)
            return np.full(te.sum(), np.nan) if y[tr].sum() < 3 else np.full(te.sum(), y[tr].mean())

        def nested(scheme, c, te):
            tr = fold(c)
            if y[tr].sum() < 3:
                return np.full(te.sum(), np.nan)
            s = picks[int(c)] = inner_pick(x[tr], y[tr], g[tr])
            return GRID[s](x[tr], y[tr]).predict_proba(x[te])[:, 1]

        tpy = tp.assign(hit=y)
        preds = {m: pe.oof(tpy, f, "fwd") for m, f in (("K0", k0), ("BASE", base), ("NESTED", nested))}
        k = np.all([~np.isnan(p) for p in preds.values()], axis=0)
        # Reproduction check: this K0 OOF must match the committed M4-oof.csv forward K0 column.
        ref = oof_ref[(oof_ref.pos == pos) & (oof_ref.cut == cut)].set_index("gsis_id")["fwd_K0"]
        diff = np.abs(pd.Series(preds["K0"], index=tp.gsis_id).reindex(ref.index).to_numpy() - ref.to_numpy())
        res = {"cut": f"{pos}{cut}", "k0_vs_M4_oof_max_abs_diff": float(np.nanmax(diff)), "inner_choice_by_class": picks,
               "fwd_all": summarize(y, g, preds, k),
               "fwd_2013_2019": summarize(y, g, preds, k & (g < UNTOUCHED)),
               "untouched_2020plus": summarize(y, g, {m: preds[m] for m in ("K0", "BASE")}, k & (g >= UNTOUCHED))}
        results[f"{pos}{cut}"] = res
        a, u = res["fwd_all"], res["untouched_2020plus"]
        say(f"{pos}{cut}: n={a['n']} ev={a['events']} | fwd K0 {a['K0']['logloss']:.4f} nested {a['NESTED']['logloss']:.4f} "
            f"base {a['BASE']['logloss']:.4f} optimism {a['optimism']:+.4f} {a['boot']['optimism_90']} | slope K0 "
            f"{a['K0']['slope']:.2f} nested {a['NESTED']['slope']:.2f} | 2020+ n={u['n']} ev={u['events']} K0 "
            f"{u['K0']['logloss']:.4f} base {u['BASE']['logloss']:.4f} slope {u['K0']['slope']:.2f} "
            f"p_beat {u['boot']['p_beats_base_K0']:.0%} | picks {sorted(set(picks.values()))}")
    rec = {"id": "M5", "finding": "pipeline review M5/C5: K0 spec selection optimism",
           "created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "charter": pe.CHARTER, "git_head": pe.git_head(), "sources_sha256": src_hash,
           "script_sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest(),
           "command": "python notes/prospect-research/experiments/m5_k0_selection_optimism.py",
           "db": "opened read-only (sqlite mode=ro); no ingest",
           "population": "A: drafted QB/RB/WR/TE 2008 to last mature class, window closed; hit line only",
           "folds": "embargoed forward chaining (pe.fold_mask 'fwd'), test classes 2013 to last mature class",
           "grid": list(GRID), "k0_spec": K0, "fallback_when_under_3_training_classes": FALLBACK,
           "inner_rule": "lowest pooled inner leave-one-class-out log loss on the outer fold's training classes, "
                         "per position (the original P1a rule pooled across positions over 2008-2019)",
           "optimism": "nested log loss minus fixed-K0 log loss on identical rows; positive = fixed K0 flattered",
           "base": "fold-local base rate: training-class hit rate of the same fold",
           "intervals": f"draft-class bootstrap, {NBOOT} resamples, seed {SEED}, 5th-95th percentiles",
           "tuning": "none", "results": results}
    OUT.write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")
    return rec


def self_check():
    rng = np.random.default_rng(3)
    x = np.log(rng.integers(1, 260, 600)).astype(float)[:, None]
    y = (rng.random(600) < 1 / (1 + np.exp(-(3 - 0.9 * x[:, 0])))).astype(float)
    g = np.repeat(np.arange(2008, 2020), 50)
    for name, fit in GRID.items():
        p = fit(x, y).predict_proba(x)[:, 1]
        assert np.all((p > 0) & (p < 1)) and np.corrcoef(p, -x[:, 0])[0, 1] > 0.9, name
    assert inner_pick(x, y, g) in GRID
    assert inner_pick(x[:100], y[:100], g[:100]) == FALLBACK   # 2 classes: no inner loop
    assert np.allclose(GRID[K0](x, y).predict_proba(x), bpm.fit_baseline(x, y, None).predict_proba(x))
    print("self-check ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    self_check() if ap.parse_args().self_check else run()
