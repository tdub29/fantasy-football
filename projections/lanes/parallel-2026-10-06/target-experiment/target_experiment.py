"""Lane target-experiment: H1 two-part target, H2 capital residual, H3 NFLMDD expected capital.
Spec: notes/prospect-research/lanes/parallel-2026-10-06/target-experiment/prereg.md (committed 125c50c
before this script ran). Reuses the frozen overall study's population cache, models and metrics.
Writes only results.{json,md} next to the prereg; K0 and NFLMDD rows never leave the process.

    PROSPECT_DB=.../prospect.sqlite NFMDD_CSV=.../nfmdd_predraft.csv python .../target_experiment.py
"""
import json
import os
import pathlib
import sys

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import RidgeCV

HERE = pathlib.Path(__file__).resolve().parent
WT = HERE.parents[3]
sys.path.insert(0, str(WT / "projections" / "lanes" / "overall"))
import overall_study as ov  # noqa: E402

bpm = ov.bpm
OUT = WT / "notes" / "prospect-research" / "lanes" / "parallel-2026-10-06" / "target-experiment"
NFMDD = pathlib.Path(os.environ.get("NFMDD_CSV", r"C:/Users/TrevorWhite/.claude/jobs/ea66a469/tmp/nfmdd/nfmdd_predraft.csv"))
EMB = 3
SCORED = list(ov.SCORED)


def iso(x, y, inc=False):
    return IsotonicRegression(increasing=inc, out_of_bounds="clip").fit(np.asarray(x, float), np.asarray(y, float))


def c0(tr, te, ycol):
    return ov.fit_predict("C0", tr, te, ycol)


def two_part(tr, te, ycol):
    e, occ = pd.Series(np.nan, index=te.index), pd.Series(np.nan, index=te.index)
    for pos in ov.POS:
        a, b = tr[tr.pos == pos], te[te.pos == pos]
        if b.empty or len(a) < 10:
            continue
        y = a[ycol].to_numpy(float)
        p = iso(a.pick, y > 0).predict(b.pick.astype(float))
        pos_ = a[y > 0]
        sev = (iso(pos_.pick, pos_[ycol]).predict(b.pick.astype(float)) if len(pos_) >= 10
               else np.full(len(b), pos_[ycol].mean() if len(pos_) else 0.0))
        occ[b.index], e[b.index] = p, p * sev
    return e, occ


def residual(tr, te, ycol):
    base = c0(tr, te, ycol)
    oof = pd.Series(np.nan, index=tr.index)
    for c in tr.draft_year.unique():   # leave-one-class-out C0, so no residual uses its own label
        m = tr.draft_year == c
        oof[m[m].index] = c0(tr[~m], tr[m], ycol)
    out = base.copy()
    for pos in ov.POS:
        a, b = tr[(tr.pos == pos) & oof.notna()], te[te.pos == pos]
        if b.empty or len(a) < 30:
            continue
        D = ov.Design(a, pos, capital=False)
        m = RidgeCV(alphas=ov.ALPHAS).fit(D(a), (a[ycol] - oof[a.index]).to_numpy(float))
        out[b.index] = np.clip(base[b.index] + m.predict(D(b)), 0, None)
    return out


def run(d, fn, ycol):
    preds = pd.Series(np.nan, index=d.index)
    extra = pd.Series(np.nan, index=d.index)
    for Y in SCORED:
        tr, te = d[d.draft_year <= Y - EMB], d[d.draft_year == Y]
        r = fn(tr, te, ycol)
        if isinstance(r, tuple):
            preds[te.index], extra[te.index] = r
        else:
            preds[te.index] = r
    return preds, extra


def nfmdd_expected_pick(d):
    """sid -> expected pick from board rank, mapping fit on earlier NFLMDD years (2020: identity)."""
    b = pd.read_csv(NFMDD)
    b["k"] = b.name.map(ov.nk)
    lut = {(int(y), k): int(r) for y, k, r in zip(b.year, b.k, b["rank"])}
    rk = pd.Series([lut.get((int(y), ov.nk(n))) for y, n in zip(d.draft_year, d.pfr_player_name)], index=d.index, dtype=float)
    xp = pd.Series(np.nan, index=d.index)
    for Y in range(2020, 2024):
        m = d.draft_year == Y
        prior = d[(d.draft_year < Y) & (d.draft_year >= 2020) & rk.notna()]
        if prior.empty:
            xp[m] = rk[m].fillna(ov.UDFA_PICK)    # ponytail: no earlier board year exists for 2020
            continue
        f = iso(rk[prior.index], prior.pick, inc=True)
        xp[m] = np.where(rk[m].notna(), f.predict(rk[m].fillna(0).to_numpy()), f.predict([1e4])[0])
    return rk, xp


def main():
    D = ov.load()
    pop = D["pop"]
    assert bpm.LAST_NFL == 2025 and pop.loc[pop.draft_year > 2023, "vor3_F1"].isna().all()
    hist = pop[pop.draft_year.between(2008, 2023)].copy()
    assert hist[[f"vor3_{f}" for f in ov.FMTS]].notna().all().all(), "immature label in 2008-2023"
    dr = hist[~hist.udfa].copy()
    idx = ov.boot_idx(SCORED)
    R = {"prereg_commit": "125c50c", "embargo": EMB, "labels_per_class": dr.groupby("draft_year").size().to_dict(),
         "zero_share": {f: dr.groupby("pos")[f"vor3_{f}"].apply(lambda s: round(float((s == 0).mean()), 3)).to_dict()
                        for f in ov.FMTS},
         "p75": {f: float(dr[f"vor3_{f}"].quantile(.75)) for f in ov.FMTS}, "H1": {}, "H2": {}, "ledger": []}
    for f in ov.FMTS:
        y = f"vor3_{f}"
        thr = R["p75"][f]
        c, _ = run(dr, c0, y)
        e, occ = run(dr, two_part, y)
        rs, _ = run(dr, residual, y)
        sc = dr[dr.draft_year.isin(SCORED)].assign(c0=c, h1=e, h2=rs)
        pcs = {k: ov.per_class(sc, k, y, thr) for k in ("c0", "h1", "h2")}
        R[f"metrics_{f}"] = {k: ov.summarize(pc, idx)[0] for k, pc in pcs.items()}
        R["H1"][f] = ov.paired(pcs["h1"], pcs["c0"], idx)
        R["H2"][f] = ov.paired(pcs["h2"], pcs["c0"], idx)
        if f == "F1":
            z = (sc[y] > 0).astype(float)
            base = pd.Series(np.nan, index=sc.index)
            for Y in SCORED:
                tr = dr[dr.draft_year <= Y - EMB]
                rate = tr.groupby("pos")[y].apply(lambda s: (s > 0).mean())
                m = sc.draft_year == Y
                base[m] = sc.loc[m, "pos"].map(rate)
            ok = occ.reindex(sc.index).notna() & base.notna()
            o = occ.reindex(sc.index)[ok]
            R["H1_occurrence"] = {"brier_two_part": float(((o - z[ok]) ** 2).mean()),
                                  "brier_pos_base_rate": float(((base[ok] - z[ok]) ** 2).mean()),
                                  "reliability": pd.DataFrame({"p": o, "z": z[ok]}).assign(
                                      bin=pd.qcut(o, 10, duplicates="drop")).groupby("bin", observed=True).agg(
                                      mean_p=("p", "mean"), obs=("z", "mean"), n=("z", "size")).round(3).astype(str)
                                      .to_dict("records")}
    for h in ("H1", "H2"):
        g = R[h]
        acc = (g["F1"]["share_gt0"] >= 0.95 and g["F1"]["est"] >= 0.02 and g["F2"]["est"] >= 0 and g["F3"]["est"] >= 0)
        R["ledger"].append({"hypothesis": h, "verdict": "ACCEPTED" if acc else
                            ("NOT SUPPORTED" if g["F1"]["est"] > 0 else "REJECTED"),
                            "F1": g["F1"], "F2_est": g["F2"]["est"], "F3_est": g["F3"]["est"]})

    # H3: NFLMDD expected capital vs K0 pre-draft consensus, drafted, K0-covered subset.
    rk, xp = nfmdd_expected_pick(dr)
    R["H3_link"] = {int(Y): f"{int(rk[dr.draft_year == Y].notna().sum())}/{int((dr.draft_year == Y).sum())}"
                    for Y in range(2020, 2024)}
    k0, _ = ov.k0_ranks(dr)
    y = "vor3_F1"
    rows = {}
    for Y in range(2020, 2024):
        tr, te = dr[dr.draft_year <= Y - EMB], dr[dr.draft_year == Y]
        xc0 = c0(tr, te.assign(pick=xp[te.index]), y)
        act = c0(tr, te, y)
        kpre = pd.Series({s: -r for s, r in k0[(Y, "pre")].items()})
        t = te.assign(xc0=xc0, c0=act, k0=te.sid.map(kpre)).dropna(subset=["k0", "xc0"])
        rows[Y] = {k: float(t[k].corr(t[y], method="spearman")) for k in ("xc0", "k0", "c0")} | {"n": len(t)}
    H3 = pd.DataFrame(rows).T
    deep = H3.loc[[2021, 2022, 2023]]
    dlt = (deep.xc0 - deep.k0).to_numpy()
    bs = dlt[np.random.default_rng(7).integers(0, 3, size=(2000, 3))].mean(1)
    R["H3"] = {"per_class": H3.round(4).to_dict("index"),
               "xc0_minus_k0pre_2021_23": {"est": float(dlt.mean()), "lo": float(np.percentile(bs, 5)),
                                           "hi": float(np.percentile(bs, 95))},
               "cost_of_unknown_slot_2021_23": float((deep.xc0 - deep.c0).mean())}
    h3ok = R["H3"]["xc0_minus_k0pre_2021_23"]["est"] >= -0.05 and R["H3"]["xc0_minus_k0pre_2021_23"]["lo"] > -0.10
    R["ledger"].append({"hypothesis": "H3", "verdict": "USABLE (descriptive, 3 classes)" if h3ok else "NOT USABLE",
                        **R["H3"]["xc0_minus_k0pre_2021_23"]})
    (OUT / "results.json").write_text(json.dumps(R, indent=1, default=str))
    print(json.dumps(R["ledger"], indent=1, default=str))
    print(json.dumps({k: R[k] for k in ("zero_share", "p75", "H1_occurrence", "H3_link")}, default=str)[:3000])
    print(json.dumps(R["H3"]["per_class"]))


if __name__ == "__main__":
    main()
