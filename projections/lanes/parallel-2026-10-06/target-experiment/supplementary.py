"""Lane target-experiment A4: the supplementary checks fixed in addendum-2026-10-07.md, which was frozen (its sha256
is pinned below and in CHECKPOINT.md) before this script first ran. A check confirms a prereg verdict or marks it
FRAGILE; none can upgrade one.

Reads the 85d9801d rebuild (scratch/overall_data.pkl, written by audit_repro.py, sha in audit.json), the lane's K0,
NFLMDD and nflverse cache copies, the frozen overall results (tier table and panel, compared, never rewritten) and
repro-85d9801d/results.json (the base numbers must reproduce before anything new is computed). Writes only
supplementary.json next to the prereg. K0 and NFLMDD rows never leave the process; only class-level correlations do.

    PYTHONDONTWRITEBYTECODE=1 python -B projections/lanes/parallel-2026-10-06/target-experiment/supplementary.py
"""
import hashlib
import json
import os
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy
import sklearn
from scipy.optimize import brentq
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, Ridge, RidgeCV
from sklearn.metrics import roc_auc_score

HERE = pathlib.Path(__file__).resolve().parent
WT = HERE.parents[3]
SCR = HERE / "scratch"
NOTES = WT / "notes" / "prospect-research" / "lanes" / "parallel-2026-10-06" / "target-experiment"
FROZEN = WT / "notes" / "prospect-research" / "lanes" / "overall" / "results.json"
FROZEN_SHA = "43f95cdcd009eff5084370aead404bc2bf8562c18d213734b5a09e1bcae99b0a"
STORE_SHA = "85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0"
ADDENDUM_SHA = "2e7606a5e00cd56dc85465daf8937e85f7e70c405564e5cf2cfcfc229c714956"
os.environ["PROSPECT_DB"] = str(SCR / "work.sqlite")
os.environ["NFLVERSE_CACHE"] = str(SCR / "nflverse-cache")
os.environ["OVERALL_SCRATCH"] = str(SCR)
os.environ["NFMDD_CSV"] = str(SCR / "nfmdd" / "nfmdd_predraft.csv")
sys.path.insert(0, str(WT / "projections"))
sys.path.insert(0, str(HERE))
import build_prospect_profile as bpp  # noqa: E402
import prospect_db as pdb  # noqa: E402


def _blocked(*a, **k):
    raise RuntimeError("fetch disabled: the lane reads its store copy as frozen")


pdb.ingest = lambda *a, **k: {}   # read the copy as it is; never refresh it from the network
bpp.fetch = _blocked
import target_experiment as te  # noqa: E402

ov, bpm = te.ov, te.bpm
assert pathlib.Path(bpm.CACHE) == SCR / "nflverse-cache" and pathlib.Path(pdb.DB_PATH) == SCR / "work.sqlite"
assert ov.SCR == SCR and te.NFMDD == SCR / "nfmdd" / "nfmdd_predraft.csv"

POS, FMTS, EMB, SCORED = ov.POS, ov.FMTS, te.EMB, te.SCORED
DEEP = [2021, 2022, 2023]   # H3 classes that have an earlier NFLMDD board year to map from
K = 15                      # S6: earlier-year (board rank, pick) pairs averaged per player
WIDE_MAX_PICK = 64          # S5: wider panel is drafted 2024-2026 at or above this pick
T0 = time.time()


def say(msg):
    print(f"[{time.time() - T0:7.1f}s] {msg}", flush=True)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def r4(x):
    return None if x is None or not np.isfinite(float(x)) else round(float(x), 4)


def js(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return str(o)


def category(f1, f2_est, f3_est):
    """The prereg's H1/H2 rule (125c50c), applied unchanged to any window or variant."""
    if f1["share_gt0"] >= 0.95 and f1["est"] >= 0.02 and f2_est >= 0 and f3_est >= 0:
        return "ACCEPTED"
    return "NOT SUPPORTED" if f1["est"] > 0 else "REJECTED"


# ----------------------------------------------------------------------------- S2 nested alpha

def loco_c0(tr, ycol):
    """Leave-one-class-out C0 inside a training window, exactly as te.residual builds its targets."""
    oof = pd.Series(np.nan, index=tr.index)
    for c in tr.draft_year.unique():
        m = tr.draft_year == c
        oof[m[m].index] = te.c0(tr[~m], tr[m], ycol)
    return oof


INNER = {}


def inner_fold(dr, v, ycol):
    """Forward-chaining inner fold under the outer embargo: train on classes <= v-3, validate on class v.
    It depends only on v, so every outer fold whose window holds class v shares it."""
    if (ycol, v) not in INNER:
        itr, iva = dr[dr.draft_year <= v - EMB], dr[dr.draft_year == v]
        INNER[(ycol, v)] = (itr, loco_c0(itr, ycol), iva, te.c0(itr, iva, ycol))
    return INNER[(ycol, v)]


def nested_alpha(dr, tr, pos, ycol):
    """Alpha with the least summed squared residual error (unclipped) over the inner folds of window tr that
    have >= 30 training rows at this position. None when no inner fold qualifies."""
    err, n = np.zeros(len(ov.ALPHAS)), 0
    for v in sorted(tr.draft_year.unique()):
        itr, oof, iva, base = inner_fold(dr, v, ycol)
        a = itr[(itr.pos == pos) & oof.notna()]
        b = iva[(iva.pos == pos) & base.notna()]
        if b.empty or len(a) < 30:
            continue
        D = ov.Design(a, pos, capital=False)
        Xa, ya = D(a), (a[ycol] - oof[a.index]).to_numpy(float)
        Xb, yb = D(b), (b[ycol] - base[b.index]).to_numpy(float)
        for i, al in enumerate(ov.ALPHAS):
            err[i] += ((Ridge(alpha=al).fit(Xa, ya).predict(Xb) - yb) ** 2).sum()
        n += len(b)
    return (float(ov.ALPHAS[err.argmin()]), n) if n else (None, 0)


ALPHA_LOG = []


def make_residual_nested(dr):
    def residual_nested(tr, te_, ycol):
        """te.residual with alpha from nested temporal folds; the prereg's row-LOO fit where none qualifies."""
        base = te.c0(tr, te_, ycol)
        oof = loco_c0(tr, ycol)
        out = base.copy()
        for pos in POS:
            a, b = tr[(tr.pos == pos) & oof.notna()], te_[te_.pos == pos]
            if b.empty or len(a) < 30:
                continue
            D = ov.Design(a, pos, capital=False)
            X, y = D(a), (a[ycol] - oof[a.index]).to_numpy(float)
            cv = RidgeCV(alphas=ov.ALPHAS).fit(X, y)
            al, nval = nested_alpha(dr, tr, pos, ycol)
            m = Ridge(alpha=al).fit(X, y) if al is not None else cv
            ALPHA_LOG.append({"ycol": ycol, "class": int(te_.draft_year.iloc[0]), "pos": pos,
                              "alpha_nested": al, "inner_val_rows": nval, "alpha_row_loo": float(cv.alpha_)})
            out[b.index] = np.clip(base[b.index] + m.predict(D(b)), 0, None)
        return out
    return residual_nested


# ----------------------------------------------------------------------------- S3 calibration

def occ_metrics(p, z):
    """Brier on raw p; log loss, calibration slope (with its intercept) and calibration-in-the-large (intercept with
    the slope fixed at 1) on p clipped to [0.001, 0.999]. Degenerate input gets the Brier only."""
    p, z = np.asarray(p, float), np.asarray(z, float)
    out = {"n": int(len(z)), "mean_p": r4(p.mean()) if len(p) else None,
           "obs_rate": r4(z.mean()) if len(z) else None, "brier": r4(((p - z) ** 2).mean()) if len(z) else None}
    if len(z) < 10 or z.min() == z.max():
        return out | {"degenerate": True}
    pc = np.clip(p, 1e-3, 1 - 1e-3)
    lp = np.log(pc / (1 - pc))
    fit = LogisticRegression(C=1e9, max_iter=1000).fit(lp[:, None], z)
    citl = brentq(lambda a: (1 / (1 + np.exp(-(a + lp)))).sum() - z.sum(), -20, 20)
    return out | {"logloss": r4(-(z * np.log(pc) + (1 - z) * np.log(1 - pc)).mean()),
                  "auc": r4(roc_auc_score(z, p)), "cal_slope": r4(fit.coef_[0, 0]),
                  "cal_intercept_with_slope": r4(fit.intercept_[0]), "citl": r4(citl)}


def reliability(p, z, bins=10):
    """Equal-count bins by rank (isotonic output ties, so value bins would merge)."""
    df = pd.DataFrame({"p": np.asarray(p, float), "z": np.asarray(z, float)})
    df["bin"] = pd.qcut(df.p.rank(method="first"), bins, labels=False)
    g = df.groupby("bin").agg(mean_p=("p", "mean"), obs=("z", "mean"), n=("z", "size"), p_min=("p", "min"),
                              p_max=("p", "max"))
    return g.round(3).to_dict("records")


def class_boot_ratio(num, den, cls, idx, classes=SCORED):
    """Ratio of class sums under class resamples: point and 90% interval."""
    nc = num.groupby(cls).sum().reindex(classes).to_numpy(float)
    dc = den.groupby(cls).sum().reindex(classes).to_numpy(float)
    bs = nc[idx].sum(1) / dc[idx].sum(1)
    return {"est": r4(nc.sum() / dc.sum()), "lo": r4(np.percentile(bs, 5)), "hi": r4(np.percentile(bs, 95))}


def decile_table(pred, y):
    df = pd.DataFrame({"pred": np.asarray(pred, float), "y": np.asarray(y, float)})
    df["bin"] = pd.qcut(df.pred.rank(method="first"), 10, labels=False)
    return df.groupby("bin").agg(mean_pred=("pred", "mean"), mean_obs=("y", "mean"), n=("y", "size"),
                                 share_pos=("y", lambda s: (s > 0).mean())).round(3).to_dict("records")


# ----------------------------------------------------------------------------- T1 tiers

def tier_table(t, y, thr):
    out = {}
    for name, cut in ov.TIERS:
        g = t[t.tier == name]
        out[name] = {"rating_floor": cut, "n": int(len(g)), "p_vor3_gt0": r4((g[y] > 0).mean()),
                     "median_vor3": r4(g[y].median()), "mean_vor3": r4(g[y].mean()),
                     "share_above_p75": r4((g[y] > thr).mean()),
                     "pick_range": [int(g.pick.min()), int(g.pick.max())] if len(g) else None,
                     "by_pos": {p: {"n": int((g.pos == p).sum()), "p_vor3_gt0": r4((g.loc[g.pos == p, y] > 0).mean())}
                                for p in POS}}
    return out


# ----------------------------------------------------------------------------- S6 distributional XC0

def c0_curve(tr, pos, ycol):
    a = tr[tr.pos == pos]   # the C0 branch of ov.fit_predict, kept as a curve to evaluate at many picks
    return IsotonicRegression(increasing=False, out_of_bounds="clip").fit(a.pick.astype(float), a[ycol].to_numpy(float))


def xc0_dist(dr, rk, xp, Y, ycol):
    """Mean of the class-Y C0 curve over the actual picks of the K earlier-year drafted players nearest in log
    board rank. Off-board players keep the prereg's point (the deepest mapped pick)."""
    tr, cls = dr[dr.draft_year <= Y - EMB], dr[dr.draft_year == Y]
    prior = dr[(dr.draft_year < Y) & (dr.draft_year >= 2020) & rk.notna()]
    curves = {p: c0_curve(tr, p, ycol) for p in POS}
    lr_prior, pk_prior = np.log(rk[prior.index].to_numpy(float)), prior.pick.to_numpy(float)
    out = pd.Series(np.nan, index=cls.index)
    for i, row in cls.iterrows():
        f = curves[row.pos]
        if pd.isna(rk[i]):
            out[i] = f.predict([float(xp[i])])[0]
            continue
        near = np.argsort(np.abs(lr_prior - np.log(rk[i])), kind="stable")[:K]
        out[i] = f.predict(pk_prior[near]).mean()
    return out


def h3_rows(dr, rk, xp, k0, ycol):
    rows = {}
    for Y in range(2020, 2024):
        tr, cls = dr[dr.draft_year <= Y - EMB], dr[dr.draft_year == Y]
        xc0 = te.c0(tr, cls.assign(pick=xp[cls.index]), ycol)
        xd = xc0_dist(dr, rk, xp, Y, ycol) if Y in DEEP else xc0
        act = te.c0(tr, cls, ycol)
        kpre = pd.Series({s: -r for s, r in k0[(Y, "pre")].items()})
        t = cls.assign(xc0=xc0, xc0d=xd, c0=act, k0=cls.sid.map(kpre)).dropna(subset=["k0", "xc0"])
        rows[Y] = {k: float(t[k].corr(t[ycol], method="spearman")) for k in ("xc0", "xc0d", "k0", "c0")} | {"n": len(t)}
    H = pd.DataFrame(rows).T
    deep = H.loc[DEEP]
    ix = ov.boot_idx(DEEP)   # seed 7, 2000 x 3: the prereg's own H3 resamples
    # np.round, as the prereg's H3.round(4), so the per-class reproduction check in main is exact
    res = {"per_class": {int(Y): {k: (int(v) if k == "n" else float(np.round(v, 4))) for k, v in r.items()}
                         for Y, r in rows.items()}}
    for k in ("xc0", "xc0d"):
        dlt = (deep[k] - deep.k0).to_numpy()
        bs = dlt[ix].mean(1)
        res[f"{k}_minus_k0pre_2021_23"] = {"est": float(dlt.mean()), "lo": float(np.percentile(bs, 5)),
                                           "hi": float(np.percentile(bs, 95))}
        res[f"{k}_jackknife_drop_class"] = {int(c): r4(np.delete(dlt, j).mean()) for j, c in enumerate(DEEP)}
    res["cost_of_unknown_slot_2021_23"] = {k: r4((deep[k] - deep.c0).mean()) for k in ("xc0", "xc0d")}
    return res


def h3_usable(d):
    return bool(d["est"] >= -0.05 and d["lo"] > -0.10)


# ----------------------------------------------------------------------------- S5 panel

def rate(ref, v):
    return None if v is None or not np.isfinite(v) else float(ov.rating(ref, np.array([v]))[0])


def panel(pop, dr, sc_by_f, FR):
    """Love, the other 35 frozen panel members and the wider 2024-2026 panel, for diagnosis only: no metric, no tuning."""
    sv = ov.nfl_values()[0]
    drafted = ~pop.udfa.astype(bool)
    rows, seen = [], set()
    for n, y in ov.PANEL:
        i = ov.find(pop, n, y)
        rows.append((n, y, i, "love" if n == "Jeremiyah Love" else "frozen_panel"))
        seen.add(i)
    wide = pop[drafted & pop.draft_year.between(2024, 2026) & (pop.pick <= WIDE_MAX_PICK)]
    for i, r in wide.sort_values(["draft_year", "pick"]).iterrows():
        if i not in seen:
            rows.append((r.pfr_player_name, int(r.draft_year), i, "wide"))
    # Unlabelled classes: the prereg's models fit on classes <= Y-3; the published C0 on every mature class.
    fut = {}
    for Y in (2024, 2025, 2026):
        cls, tr = pop[drafted & (pop.draft_year == Y)], dr[dr.draft_year <= Y - EMB]
        for f in FMTS:
            yv = f"vor3_{f}"
            e, occ = te.two_part(tr, cls, yv)
            fut[(Y, f)] = pd.DataFrame({"c0_emb1": te.c0(dr, cls, yv), "c0": te.c0(tr, cls, yv), "h1": e,
                                        "occ": occ, "h2": te.residual(tr, cls, yv)})
    refs = {f: {k: sc_by_f[f][k].dropna().to_numpy(float) for k in ("c0_emb1", "c0", "h1", "h2")} for f in FMTS}
    frozen = {f: {(r["name"], r["class"]): r.get("rating_C0") for r in FR["panel"][f]} for f in FR["panel"]}
    out, diffs = [], []
    for n, y, i, tag in rows:
        rec = {"name": n, "class": y, "panel": tag, "found": i is not None}
        if i is None:
            out.append(rec)
            continue
        r = pop.loc[i]
        rec |= {"pos": r.pos, "pick": None if pd.isna(r.pick) else int(r.pick), "udfa": bool(r.udfa)}
        if r.udfa:
            out.append(rec | {"note": "UDFA: outside the drafted-only experiment population"})
            continue
        for f in FMTS:
            src = sc_by_f[f] if y <= 2023 else fut[(y, f)]
            if i not in src.index:
                rec[f] = None
                continue
            p = src.loc[i]
            d = {k: r4(p[k]) for k in ("c0_emb1", "c0", "h1", "occ", "h2")}
            rp, r3 = rate(refs[f]["c0_emb1"], p.c0_emb1), rate(refs[f]["c0"], p.c0)
            d |= {"rating_published": r4(rp), "tier_published": None if rp is None else ov.tier(rp),
                  "rating_emb3": r4(r3), "tier_emb3": None if r3 is None else ov.tier(r3),
                  "rating_h1": r4(rate(refs[f]["h1"], p.h1)), "rating_h2": r4(rate(refs[f]["h2"], p.h2))}
            if y <= 2023:
                d["vor3"] = r4(r[f"vor3_{f}"])
            elif y <= 2025:
                s = sv[(sv.player_id == r.gsis_id) & sv.season.between(y, 2025)] if pd.notna(r.gsis_id) else None
                d["partial_vor_through_2025_immature"] = None if s is None else r4(s[f"vor_{f}"].sum())
            fz = frozen.get(f, {}).get((n, y))
            if fz is not None and rp is not None:
                d["frozen_rating_C0"] = r4(fz)
                diffs.append(abs(fz - rp))
            rec[f] = d
        out.append(rec)
    return {"wide_rule": f"drafted QB/RB/WR/TE, classes 2024-2026, pick <= {WIDE_MAX_PICK}, not already listed",
            "members": out, "n": {t: sum(1 for m in out if m["panel"] == t) for t in ("love", "frozen_panel", "wide")},
            "published_rating_vs_frozen": {"compared": len(diffs), "max_abs_diff": r4(max(diffs)) if diffs else None}}


# ----------------------------------------------------------------------------- main

def main():
    assert sha(NOTES / "addendum-2026-10-07.md") == ADDENDUM_SHA, "addendum changed since it was frozen"
    A = json.loads((NOTES / "audit.json").read_text())
    assert sha(SCR / "overall_data.pkl") == A["new_pickle_sha256"], "population is not the audited rebuild"
    assert sha(FROZEN) == FROZEN_SHA, "frozen overall results changed"
    db0 = sha(SCR / "work.sqlite")
    assert db0 == STORE_SHA, "lane store copy is not 85d9801d"
    REP = json.loads((NOTES / "repro-85d9801d" / "results.json").read_text())
    FR = json.loads(FROZEN.read_text())
    pop = ov.load()["pop"]
    assert bpm.LAST_NFL == 2025 and pop.loc[pop.draft_year > 2023, "vor3_F1"].isna().all()
    hist = pop[pop.draft_year.between(2008, 2023)]
    assert hist[[f"vor3_{f}" for f in FMTS]].notna().all().all(), "immature label in 2008-2023"
    dr = hist[~hist.udfa.astype(bool)].copy()
    idx = ov.boot_idx(SCORED)
    thr = {f: float(dr[f"vor3_{f}"].quantile(.75)) for f in FMTS}
    S = {"addendum_sha256": ADDENDUM_SHA, "population_sha256": A["new_pickle_sha256"], "store_sha256": db0,
         "versions": {"numpy": np.__version__, "pandas": pd.__version__, "scipy": scipy.__version__,
                      "sklearn": sklearn.__version__},
         "p75": thr, "base": {}, "T1": {}, "S3": {}, "S2": {}, "S4": {}}
    pcs, sc_by_f = {}, {}
    for f in FMTS:
        y = f"vor3_{f}"
        c, _ = te.run(dr, te.c0, y)
        e, occ = te.run(dr, te.two_part, y)
        rs, _ = te.run(dr, te.residual, y)
        sc = dr[dr.draft_year.isin(SCORED)].assign(c0=c, c0_emb1=ov.expanding(dr, "C0", y), h1=e, occ=occ, h2=rs)
        for k in ("c0", "h1", "h2"):
            pcs[(f, k)] = ov.per_class(sc, k, y, thr[f])
        S["base"][f] = {h: ov.paired(pcs[(f, h)], pcs[(f, "c0")], idx) for h in ("h1", "h2")}
        for h in ("h1", "h2"):
            for m in ("est", "lo", "hi", "share_gt0"):
                assert abs(S["base"][f][h][m] - REP[h.upper()][f][m]) < 1e-12, f"base {f} {h} {m} does not reproduce"
        say(f"{f}: base H1/H2 reproduce repro-85d9801d")

        # T1: what a tier means, under the frozen study's 1-class embargo (must reproduce its table) and under 3.
        S["T1"][f] = {}
        tiers = {}
        for tag, col in (("emb1_published", "c0_emb1"), ("emb3", "c0")):
            ref = sc[col].to_numpy(float)
            assert not np.isnan(ref).any(), f"missing OOS {col}"
            t = sc.assign(tier=pd.Series(ov.rating(ref, ref), index=sc.index).map(ov.tier))
            tiers[tag] = t.tier
            S["T1"][f][tag] = tier_table(t, y, thr[f])
            if tag == "emb1_published" and f in FR["tier_table"]:
                diff = {}   # recorded, not asserted: the frozen table predates the 85d9801d rebuild
                for name, _ in ov.TIERS:
                    g, d = t.loc[t.tier == name, y], FR["tier_table"][f].get(name)
                    if d is None:
                        if len(g):
                            diff[name] = {"n": [0, int(len(g))]}
                        continue
                    got = {"n": len(g), "median_vor3": g.median(), "share_above_p75": (g > thr[f]).mean()}
                    bad = {k: [d[k], float(v)] for k, v in got.items() if not abs(float(v) - d[k]) < 1e-9}
                    if bad:
                        diff[name] = bad
                S["T1"][f]["emb1_vs_frozen_tier_table_diffs"] = diff
                S["T1"][f]["emb1_reproduces_frozen_tier_table"] = not diff
        S["T1"][f]["rows_changing_tier_emb1_to_emb3"] = int((tiers["emb1_published"] != tiers["emb3"]).sum())
        S["T1"][f]["crosstab_emb1_rows_emb3_cols"] = pd.crosstab(tiers["emb1_published"], tiers["emb3"]).to_dict("index")

        # S3: occurrence calibration (two-part vs the script's position base rate) and magnitude calibration.
        z = (sc[y] > 0).astype(float)
        base = pd.Series(np.nan, index=sc.index)
        for Y in SCORED:
            tr = dr[dr.draft_year <= Y - EMB]
            rate_ = tr.groupby("pos")[y].apply(lambda s: (s > 0).mean())
            m = sc.draft_year == Y
            base[m] = sc.loc[m, "pos"].map(rate_)
        ok = sc.occ.notna() & base.notna()
        o, b, zz, cl, ps = sc.occ[ok], base[ok], z[ok], sc.draft_year[ok], sc.pos[ok]
        if f == "F1":
            assert abs(((o - zz) ** 2).mean() - REP["H1_occurrence"]["brier_two_part"]) < 1e-12
            assert abs(((b - zz) ** 2).mean() - REP["H1_occurrence"]["brier_pos_base_rate"]) < 1e-12
        top = o.rank(pct=True) > 0.9
        S["S3"][f] = {"occurrence_two_part": occ_metrics(o, zz), "occurrence_pos_base_rate": occ_metrics(b, zz),
                      "brier_ratio_two_part_over_base": class_boot_ratio((o - zz) ** 2, (b - zz) ** 2, cl, idx),
                      "occurrence_reliability": reliability(o, zz),
                      "occurrence_by_pos": {p: occ_metrics(o[ps == p], zz[ps == p]) for p in POS},
                      "top_decile_by_pos": {p: {"mean_p": r4(o[top & (ps == p)].mean()), "obs": r4(zz[top & (ps == p)].mean()),
                                                "n": int((top & (ps == p)).sum())} for p in POS}}
        for k in ("c0", "h1"):
            v = sc[k].notna()
            S["S3"][f][f"magnitude_{k}"] = {
                "deciles": decile_table(sc.loc[v, k], sc.loc[v, y]),
                "sum_pred_over_sum_obs": class_boot_ratio(sc.loc[v, k], sc.loc[v, y], sc.draft_year[v], idx),
                "mae": r4((sc.loc[v, k] - sc.loc[v, y]).abs().mean())}
        say(f"{f}: T1 and S3 done")

        # S2: H2 with alpha from nested temporal folds.
        rn, _ = te.run(dr, make_residual_nested(dr), y)
        sc["h2n"] = rn
        pcs[(f, "h2n")] = ov.per_class(sc, "h2n", y, thr[f])
        S["S2"][f] = {"h2_nested_minus_c0": ov.paired(pcs[(f, "h2n")], pcs[(f, "c0")], idx),
                      "h2_nested_minus_rowloo": ov.paired(pcs[(f, "h2n")], pcs[(f, "h2")], idx),
                      "metrics_h2_nested": ov.summarize(pcs[(f, "h2n")], idx)[0]}
        sc_by_f[f] = sc
        say(f"{f}: S2 done")
    S["S2"]["category"] = category(S["S2"]["F1"]["h2_nested_minus_c0"], S["S2"]["F2"]["h2_nested_minus_c0"]["est"],
                                   S["S2"]["F3"]["h2_nested_minus_c0"]["est"])
    S["S2"]["alphas"] = [{"ycol": yc, "pos": p, "folds": int(len(g)), "nested_fallbacks": int(g.alpha_nested.isna().sum()),
                          "nested_median": r4(g.alpha_nested.median()), "rowloo_median": r4(g.alpha_row_loo.median()),
                          "same_alpha": int((g.alpha_nested == g.alpha_row_loo).sum()),
                          "inner_val_rows_median": r4(g.inner_val_rows.median())}
                         for (yc, p), g in pd.DataFrame(ALPHA_LOG).groupby(["ycol", "pos"])]

    # S4: the prereg rule on fixed class windows, each bootstrapped over its own classes.
    win = {"feats_untouched_2020_23": list(range(2020, 2024)), "feats_dev_2012_19": list(range(2012, 2020))}
    win |= {f"drop_{Y}": [c for c in SCORED if c != Y] for Y in SCORED}
    for w, cl in win.items():
        ix = ov.boot_idx(cl)
        r = {h: {f: ov.paired(pcs[(f, h)].loc[cl], pcs[(f, "c0")].loc[cl], ix) for f in FMTS} for h in ("h1", "h2")}
        S["S4"][w] = {h: {"category": category(d["F1"], d["F2"]["est"], d["F3"]["est"]), **d} for h, d in r.items()}
    say("S4 done")

    # S6: H3 with a distributional expected capital, F2/F3 rows and a jackknife over the three classes.
    rk, xp = te.nfmdd_expected_pick(dr)
    k0, _ = ov.k0_ranks(dr)
    S["S6"] = {f: h3_rows(dr, rk, xp, k0, f"vor3_{f}") for f in FMTS}
    for m in ("est", "lo", "hi"):
        assert abs(S["S6"]["F1"]["xc0_minus_k0pre_2021_23"][m] - REP["H3"]["xc0_minus_k0pre_2021_23"][m]) < 1e-12
    for Y, d in REP["H3"]["per_class"].items():
        for k in ("xc0", "k0", "c0"):
            assert abs(S["S6"]["F1"]["per_class"][int(Y)][k] - d[k]) < 1e-9, f"H3 {Y} {k} does not reproduce"
    S["S6"]["usable"] = {f: {k: h3_usable(S["S6"][f][f"{k}_minus_k0pre_2021_23"]) for k in ("xc0", "xc0d")} for f in FMTS}
    say("S6 done (prereg H3 reproduces)")

    S["S5"] = panel(pop, dr, sc_by_f, FR)
    say("S5 done")

    # Robustness, by the addendum's rules: confirm or FRAGILE, never upgrade.
    pre = {r["hypothesis"]: r["verdict"] for r in REP["ledger"]}
    rob = {}
    for h in ("h1", "h2"):
        H = h.upper()
        checks = {f"S4 {w}": S["S4"][w][h]["category"] for w in S["S4"]}
        if h == "h2":
            checks["S2 nested alpha"] = S["S2"]["category"]
        acc = sorted(k for k, v in checks.items() if v == "ACCEPTED")
        rob[H] = {"prereg": pre[H], "fragile": bool(acc), "accepted_in": acc,
                  "other_category_in": {k: v for k, v in checks.items() if v not in (pre[H], "ACCEPTED")}}
    u = S["S6"]["usable"]
    rob["H3"] = {"prereg": pre["H3"], "fragile": not u["F1"]["xc0d"],
                 "scope": "F1, F2, F3" if u["F2"]["xc0"] and u["F3"]["xc0"] else "F1 only"}
    S["robustness"] = rob
    S["store_sha256_after"] = sha(SCR / "work.sqlite")
    (NOTES / "supplementary.json").write_text(json.dumps(S, indent=1, default=js), encoding="utf8")
    say("wrote supplementary.json")
    print(json.dumps({"robustness": rob, "S2": {f: S["S2"][f]["h2_nested_minus_c0"] for f in FMTS},
                      "S2_category": S["S2"]["category"],
                      "S4": {w: {h: S["S4"][w][h]["category"] for h in ("h1", "h2")} for w in S["S4"]},
                      "S6_F1": {k: v for k, v in S["S6"]["F1"].items() if k != "per_class"},
                      "S6_usable": u, "S5_check": S["S5"]["published_rating_vs_frozen"],
                      "store_unchanged": S["store_sha256_after"] == db0}, indent=1, default=js))


if __name__ == "__main__":
    main()
