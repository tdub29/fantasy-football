"""Score the displayed prospect cut model (registry m4-prospect-score) under validation-charter-v2.md.

The site's pmTopChance (site/js/app.js, shipped 2026-10-11) fit one L2 (lambda 1, intercept free)
logistic per position and cut on [1, log(pick), ts/100] in the browser, in-sample on every labelled
row. This script scores that exact spec on the charter's folds with every step fitted inside the
fold, against two references on identical rows:

  M4    the shipped spec: IRLS on [1, log pick, ts/100], lambda 1. ts is rebuilt fold-locally: the
        builder's talent model (FEATS, C 0.1) is refit on the fold's training classes only; training
        rows get their inner leave-one-class-out talent logit, the reference pool is those logits,
        and every ts is round(percentile in that pool), as score_nfl builds it.
  PICK  the shipped spec's own pick-only fallback: IRLS on [1, log pick], lambda 1.
  K0    the charter's frozen baseline: draft-only restricted cubic spline in log pick, C 0.1
        (bpm.fit_baseline), refit on the cut's label.

Folds, bootstrap, calibration and rules come from projections/prospect_experiments.py unchanged:
fwd = embargoed forward chaining, test classes 2013 to the last mature class; loco = leave-one-class-
out on 2008-2019. Cuts: the hit line (QB/TE 12, RB/WR 24, the charter target and gate) and the first
cut (QB/TE 6, RB/WR 12, reported under the same rules; not a charter target). Nothing is tuned:
lambda, cuts and features are the shipped values. Every configuration run is listed in the JSON.

    python notes/prospect-research/experiments/m4_cut_model.py           # writes M4.json, M4-oof.csv
    python notes/prospect-research/experiments/m4_cut_model.py --freeze  # also writes the frozen serving file

--freeze writes site/data/prospect-cut-model.js: the charter baseline K0 (both candidates rejected) at the hit
line only, fit once on every mature class 2008+, tabulated by pick so the browser does no fitting.
M4.json and the frozen file carry this script's sha256. Monitor: m4_monitor.py.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
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
CUTS = {"QB": (6, 12), "TE": (6, 12), "RB": (12, 24), "WR": (12, 24)}   # app.js PM_CUTS
LAMBDA = 1.0
ROUNDS = (("R1", 1, 32), ("R2", 33, 64), ("R3", 65, 100), ("D3", 101, 999))
SERVE_PICKS = 262          # largest pick in the training rows; 257 is the app's projected-UFD slot
FREEZE = ROOT / "site" / "data" / "prospect-cut-model.js"
# Positions whose K0 hit-line chance is served. TE is out: on forward folds K0 beat the fold-local TE
# base rate in under 90% of class resamples (M4.json K0_vs_BASE), the reference-policy bar. Only locked
# rules withdraw a cut. WR is served: its 2020+ slope (1.69) is a seen regime check (charter rule 4),
# reported on the card; the monitor kill rule acts only on classes drafted after the fit (WR: 2024 on).
SERVED = ("QB", "RB", "WR")


def irls(X, y, lam=LAMBDA):
    """Newton/IRLS logistic, L2 lam on all but the intercept: the same objective as app.js fit()."""
    w = np.zeros(X.shape[1])
    pen = np.full(X.shape[1], lam)
    pen[0] = 0.0
    for _ in range(50):
        q = 1 / (1 + np.exp(-X @ w))
        H = (X * (q * (1 - q))[:, None]).T @ X + np.diag(pen)
        dx = np.linalg.solve(H, X.T @ (q - y) + pen * w)
        w -= dx
        if np.abs(dx).max() < 1e-8:
            break
    return w


class Irls:
    def __init__(self, w):
        self.w = w

    def predict_proba(self, X):
        q = 1 / (1 + np.exp(-np.column_stack([np.ones(len(X)), X]) @ self.w))
        return np.column_stack([1 - q, q])


def fit_irls(X, y):
    return Irls(irls(np.column_stack([np.ones(len(X)), X]), y))


def ts_local(Xt, y, g, tr, te):
    """Fold-local talent score (0-100) for train and test rows, built the way score_nfl builds ts."""
    lg_tr = np.full(tr.sum(), np.nan)
    gt = g[tr]
    for c in np.unique(gt):
        k = gt != c
        if y[tr][k].sum() < 3:
            continue
        m = bpm.fit_talent(Xt[tr][k], y[tr][k], None)
        lg_tr[~k] = bpm.logit(m.predict_proba(Xt[tr][~k])[:, 1])
    full = bpm.fit_talent(Xt[tr], y[tr], None)
    lg_te = bpm.logit(full.predict_proba(Xt[te])[:, 1])
    if np.isnan(lg_tr).all():   # one training class (first forward folds): no inner split, so in-fold fit
        lg_tr = bpm.logit(full.predict_proba(Xt[tr])[:, 1])
    ref = lg_tr[~np.isnan(lg_tr)]
    pct = lambda v: np.array([round(bpm.pctile(ref, x)) for x in v], float)   # noqa: E731
    lg_tr = np.where(np.isnan(lg_tr), np.nanmedian(lg_tr), lg_tr)
    return pct(lg_tr), pct(lg_te)


def predictors(tp, y, win, from_class=None):
    g = tp.draft_year.to_numpy(int)
    mature = tp.hit.notna().to_numpy()
    lp = tp.log_pick.to_numpy(float)
    Xt = tp[bpm.FEATS[tp.pos.iloc[0]]].to_numpy(float)

    def mask(scheme, c):
        tr = mature & pe.fold_mask(g, scheme, c, win)
        return tr & (g >= from_class) if from_class else tr

    def m4(scheme, c, te):
        tr = mask(scheme, c)
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        s_tr, s_te = ts_local(Xt, y, g, tr, te)
        return fit_irls(np.column_stack([lp[tr], s_tr / 100]), y[tr]).predict_proba(np.column_stack([lp[te], s_te / 100]))[:, 1]

    def pick(scheme, c, te):
        tr = mask(scheme, c)
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        return fit_irls(lp[tr, None], y[tr]).predict_proba(lp[te, None])[:, 1]

    def k0(scheme, c, te):
        tr = mask(scheme, c)
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        return bpm.fit_baseline(lp[tr, None], y[tr], None).predict_proba(lp[te, None])[:, 1]

    def base(scheme, c, te):
        tr = mask(scheme, c)
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        return np.full(te.sum(), y[tr].mean())
    return {"M4": m4, "PICK": pick, "K0": k0, "BASE": base}


def interval(y, p, g, n=4000, seed=7):
    """Draft-class bootstrap 90% interval of pooled log loss and Brier for one model."""
    d = pd.DataFrame({"g": g, "ll": -(y * np.log(np.clip(p, 1e-4, 1 - 1e-4)) + (1 - y) * np.log(np.clip(1 - p, 1e-4, 1))),
                      "br": (y - p) ** 2}).groupby("g").agg(ll=("ll", "sum"), br=("br", "sum"), n=("ll", "size"))
    idx = np.random.default_rng(seed).integers(0, len(d), (n, len(d)))
    den = d.n.to_numpy()[idx].sum(1)
    q = lambda a: [float(np.percentile(a, 5)), float(np.percentile(a, 95))]   # noqa: E731
    return {"logloss_90": q(d.ll.to_numpy()[idx].sum(1) / den), "brier_90": q(d.br.to_numpy()[idx].sum(1) / den)}


def slices(tp, y, p, k):
    out = []
    pk = tp.pick.to_numpy(int)
    for name, lo, hi in ROUNDS:
        kk = k & (pk >= lo) & (pk <= hi)
        if kk.sum():
            out.append({"slice": name, "n": int(kk.sum()), "events": int(y[kk].sum()),
                        **{m: {"logloss": bpm.ll(y[kk], p[m][kk]), "brier": float(np.mean((y[kk] - p[m][kk]) ** 2)),
                               "mean_pred": float(p[m][kk].mean())} for m in p}, "obs": float(y[kk].mean())})
    return out


def compare(tp, y, pb, pc, scheme):
    """pe.score with the cut's label in place of hit (score reads tp.hit)."""
    return pe.score(tp.assign(hit=y), pb, pc, scheme)


def run(freeze=False, say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    srcs = pdb.source_shas(bpm._CON)
    src_hash = hashlib.sha256(json.dumps(srcs, sort_keys=True).encode()).hexdigest()
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    results, rows, configs = {}, [], []
    for pos in bpm.POS:
        win = bpm.TARGET[pos][1]
        tp = t[(t.pos == pos) & t.gsis_id.notna() & t.draft_year.between(bpm.FIRST_CLASS, bpm.LAST_CLASS[pos])
               & t.hit.notna()].reset_index(drop=True)
        g = tp.draft_year.to_numpy(int)
        rank = tp.best_rank.to_numpy(float)
        assert (tp.hit.to_numpy() == (np.nan_to_num(rank, nan=999) <= bpm.TARGET[pos][0])).all(), "hit != rank cut"
        for cut in CUTS[pos]:
            y = (np.nan_to_num(rank, nan=999) <= cut).astype(float)
            res = {"n": int(len(tp)), "events": int(y.sum()), "classes": [int(g.min()), int(g.max())],
                   "charter_target": cut == bpm.TARGET[pos][0]}
            for tag, frm in (("main", None), ("from2014", 2014)):
                pr = predictors(tp, y, win, frm)
                p = {s: {m: pe.oof(tp.assign(hit=y), f, s) for m, f in pr.items()} for s in ("fwd", "loco")}
                configs += [f"{pos} cut{cut} {m} {s} train={'2008+' if not frm else '2014+'}" for m in pr for s in p]
                blk = {}
                for s in ("fwd", "loco"):
                    k = ~np.isnan(p[s]["K0"]) & ~np.isnan(p[s]["M4"]) & ~np.isnan(p[s]["PICK"]) & ~np.isnan(p[s]["BASE"])
                    pk = {m: np.where(k, v, np.nan) for m, v in p[s].items()}
                    cmp_ = {c: compare(tp, y, pk["K0"], pk[c], s) for c in ("M4", "PICK")}
                    cmp_["M4_vs_PICK"] = compare(tp, y, pk["PICK"], pk["M4"], s)
                    # Reference-policy check: does the served K0 beat the training base rate (fold-local)?
                    cmp_["K0_vs_BASE"] = compare(tp, y, pk["BASE"], pk["K0"], s)
                    blk[s] = {"n": int(k.sum()), "events": int(y[k].sum()), "vs": cmp_,
                              "intervals": {m: interval(y[k], pk[m][k], g[k]) for m in pk}}
                    if s == "fwd":
                        blk[s]["rounds"] = slices(tp, y, pk, k)
                for c in ("M4", "PICK"):
                    rules, verdict = pe.decide(blk["fwd"]["vs"][c], blk["loco"]["vs"][c])
                    blk[f"rules_{c}"] = {"rules": rules, "verdict": verdict}
                res[tag] = blk
                if tag == "main":
                    for i in range(len(tp)):
                        rows.append({"pos": pos, "cut": cut, "class": int(g[i]), "name": tp.pfr_player_name[i],
                                     "gsis_id": tp.gsis_id[i], "pick": int(tp.pick[i]), "y": int(y[i]),
                                     **{f"{s}_{m}": (None if np.isnan(p[s][m][i]) else round(float(p[s][m][i]), 5))
                                        for s in p for m in p[s]}})
            results[f"{pos}{cut}"] = res
            f, lo = res["main"]["fwd"], res["main"]["loco"]
            say(f"{pos}{cut}: n={f['n']} ev={f['events']} | fwd K0 {f['vs']['M4']['base']['logloss']:.4f} "
                f"PICK {f['vs']['PICK']['cand']['logloss']:.4f} M4 {f['vs']['M4']['cand']['logloss']:.4f} "
                f"(boot {f['vs']['M4']['boot']['p']:.0%}, slope {f['vs']['M4']['cand']['slope']:.2f}) | loco K0 "
                f"{lo['vs']['M4']['base']['logloss']:.4f} M4 {lo['vs']['M4']['cand']['logloss']:.4f} | M4 "
                f"{res['main']['rules_M4']['verdict']}, PICK {res['main']['rules_PICK']['verdict']}")
    rec = {"id": "M4", "model": "pmTopChance / pmScore (site/js/app.js), registry m4-prospect-score",
           "created_at_utc": stamp, "charter": pe.CHARTER, "git_head": pe.git_head(), "sources_sha256": src_hash,
           # LF-normalized, so a CRLF checkout hashes the same as the committed blob
           "script_sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest(),
           "command": "python notes/prospect-research/experiments/m4_cut_model.py",
           "spec": {"M4": "IRLS L2 lambda 1 (no intercept penalty) on [1, log pick, ts/100]; ts rebuilt in fold",
                    "PICK": "IRLS L2 lambda 1 on [1, log pick]", "K0": "bpm.fit_baseline: RCS in log pick, C 0.1"},
           "population": "A: drafted QB/RB/WR/TE 2008 to last mature class, linked college career, window closed",
           "configurations_run": configs,
           "tuning": "none; lambda, cuts and features are the shipped values, fixed before this run",
           "calibration": "slope and intercept of an unpenalized logistic recalibration of out-of-fold logits, both free",
           "intervals": "draft-class bootstrap, 4,000 resamples, seed 7: 90% interval of pooled log loss and Brier",
           "results": results}
    (EXP / "M4.json").write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")
    pd.DataFrame(rows).to_csv(EXP / "M4-oof.csv", index=False)
    if freeze:
        write_freeze(t, rec, results)
    return rec


def write_freeze(t, rec, results):
    """Serve the model that passed on this scoring: the charter baseline K0 (the cut model and the
    pick-only logistic were rejected). Hit line only: the first cut fails the charter slope band
    out of sample (QB6, WR12, RB12), so it is not served. One fit per position on every mature
    class 2008+, tabulated at picks 1..SERVE_PICKS; index i holds pick i + 1."""
    table, meta = {}, {}
    picks = np.log(np.arange(1, SERVE_PICKS + 1, dtype=float))[:, None]
    for pos in SERVED:
        tp = t[(t.pos == pos) & t.gsis_id.notna() & t.draft_year.between(bpm.FIRST_CLASS, bpm.LAST_CLASS[pos])
               & t.hit.notna()]
        rank = np.nan_to_num(tp.best_rank.to_numpy(float), nan=999)
        for cut in (bpm.TARGET[pos][0],):
            y = (rank <= cut).astype(float)
            m = bpm.fit_baseline(tp[["log_pick"]].to_numpy(float), y, None)
            table[f"{pos}{cut}"] = [round(float(v), 4) for v in m.predict_proba(picks)[:, 1]]
            meta[f"{pos}{cut}"] = {"n": int(len(tp)), "events": int(y.sum()),
                                   "classes": [int(tp.draft_year.min()), int(tp.draft_year.max())]}
    body = {"id": "m4-prospect-score K0", "frozen_at_utc": rec["created_at_utc"], "git_head": rec["git_head"],
            "sources_sha256": rec["sources_sha256"], "script_sha256": rec["script_sha256"],
            "scoring": "notes/prospect-research/experiments/M4.json",
            "model": "draft-only restricted cubic spline in log pick, C 0.1 (charter v2 frozen baseline)",
            "cuts": {p: bpm.TARGET[p][0] for p in SERVED}, "fit": meta, "p": table,
            "not_served": {"TE": "K0 did not beat the TE base rate in 90% of class resamples"}}
    js = json.dumps(body, separators=(",", ":"))
    body["sha256"] = hashlib.sha256(js.encode()).hexdigest()
    FREEZE.write_text("// Frozen by notes/prospect-research/experiments/m4_cut_model.py --freeze. Do not hand-edit;\n"
                      "// a refit is a new model version (ledger + card + registry).\n"
                      f"window.PROSPECT_CUT_MODEL={json.dumps(body, separators=(',', ':'))};\n", encoding="utf-8")


def self_check():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(400, 2))
    y = (rng.random(400) < 1 / (1 + np.exp(-(0.5 + X @ [1.0, -0.7])))).astype(float)
    w = irls(np.column_stack([np.ones(400), X]), y, lam=0.0)
    from sklearn.linear_model import LogisticRegression
    m = LogisticRegression(C=np.inf, max_iter=10000, tol=1e-10).fit(X, y)
    assert np.allclose(w, [m.intercept_[0], *m.coef_[0]], atol=1e-4), "IRLS != unpenalized logistic"
    print("self-check ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--freeze", action="store_true")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    self_check() if a.self_check else run(a.freeze)
