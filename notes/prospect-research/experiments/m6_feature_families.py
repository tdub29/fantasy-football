"""M6: a prospect model built from named feature families, scored under validation-charter-v2.md.

Spec fixed before any score was read (ledger-m6.md, 2026-11-28); nothing is tuned:
  regularized logistic, C = 0.1 (the charter's fixed C), fold-local median imputation and scaling,
  draft capital as the K0 restricted cubic spline in log pick (bpm.make_lr capital=True).
  Families (a feature joins only if the DB has it for >= 30% of that position's training rows):
    capital      log pick (spline)
    production   QB: aya_final, comp_final, rush_ypg_best, starts; RB: scrim_ypg, ryptpa_final, dom_best;
                 WR: ryptpa_career, dom_best, breakout_age; TE: ryptpa_best, dom_best, breakout_age
    athleticism  weight, speed_score
    age          draft_age
    landing      drafting team's prior-season pass attempts and PPR at his position (final before
                 the draft; the team is known at T, the moment after the pick)
Folds, rows, bootstrap and calibration come from prospect_experiments.py; K0, BASE and M4 are read
from M4-oof.csv on identical rows (hit line only). Ablation: M6 refit without each family.

    python notes/prospect-research/experiments/m6_feature_families.py            # M6.json
    python notes/prospect-research/experiments/m6_feature_families.py --freeze   # + per-player served table
"""
from __future__ import annotations

import argparse
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
FREEZE = ROOT / "site" / "data" / "prospect-cut-model.js"
PROD = {"QB": ["aya_final", "comp_final", "rush_ypg_best", "starts"], "RB": ["scrim_ypg", "ryptpa_final", "dom_best"],
        "WR": ["ryptpa_career", "dom_best", "breakout_age"], "TE": ["ryptpa_best", "dom_best", "breakout_age"]}
FAMILIES = {"production": PROD, "athleticism": ["weight", "speed_score"], "age": ["draft_age"],
            "landing": ["tm_pass_att_prev", "tm_pos_ppr_prev"]}
MIN_COVER = 0.30
LEAK = bpm.POST_DRAFT - {"team"}   # team is known at T (after the pick); outcomes and pick-derived columns are not


def landing(t, con):
    ctx = pe.team_context(con)
    key = list(zip(t.team.map(lambda x: pe.TEAM.get(x, x)), t.draft_year - 1, t.pos))
    t = t.copy()
    t["tm_pass_att_prev"] = [ctx["att"].get(k[:2], np.nan) for k in key]   # season before the draft only
    t["tm_pos_ppr_prev"] = [ctx["ppr"].get(k, np.nan) for k in key]
    return t


def families(tp, pos):
    """{family: [cols]} after the fixed coverage rule; missing families come back empty."""
    out = {}
    for fam, cols in FAMILIES.items():
        cols = cols[pos] if isinstance(cols, dict) else cols
        out[fam] = [c for c in cols if c in tp and tp[c].notna().mean() >= MIN_COVER]
    assert not {c for v in out.values() for c in v} & LEAK, "a family uses post-draft information"
    return out


def predictor(tp, y, cols, win):
    g = tp.draft_year.to_numpy(int)
    X = tp[cols + ["log_pick"]].to_numpy(float)

    def predict(scheme, c, te):
        tr = pe.fold_mask(g, scheme, c, win)
        assert scheme != "fwd" or g[tr].max(initial=-1) <= c - win, "fold trains on an open outcome window"
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        return bpm.make_lr(pe.C, len(cols), capital=True).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
    return predict


def population(t, pos):
    return t[(t.pos == pos) & t.gsis_id.notna() & t.draft_year.between(bpm.FIRST_CLASS, bpm.LAST_CLASS[pos])
             & t.hit.notna()].reset_index(drop=True)


def run(freeze=False, say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    _, _, _, t, _ = bpm.prepare(say=lambda *a: None)
    t = landing(t, bpm._CON)
    oof = pd.read_csv(EXP / "M4-oof.csv")
    res, fams_all = {}, {}
    for pos in bpm.POS:
        win, cut = bpm.TARGET[pos][1], bpm.TARGET[pos][0]
        tp = population(t, pos)
        y = tp.hit.to_numpy(float)
        ref = oof[(oof.pos == pos) & (oof.cut == cut)].set_index("gsis_id").reindex(tp.gsis_id)
        assert len(ref) == len(tp) and ref.y.notna().all() and (ref.y.to_numpy() == y).all(), f"{pos}: rows differ from M4-oof.csv"
        fam = families(tp, pos)
        fams_all[pos] = fam
        cols = [c for v in fam.values() for c in v]
        runs = {"M6": cols, **{f"M6 without {f}": [c for c in cols if c not in v] for f, v in fam.items() if v}}
        p = {k: pe.oof(tp, predictor(tp, y, c, win), "fwd") for k, c in runs.items()}
        k = ~np.isnan(ref.fwd_K0.to_numpy()) & ~np.isnan(ref.fwd_BASE.to_numpy()) & ~np.isnan(ref.fwd_M4.to_numpy())
        for v in p.values():
            k &= ~np.isnan(v)
        m = lambda a: np.where(k, a, np.nan)   # noqa: E731
        K0, BASE, M4 = (m(ref[c].to_numpy()) for c in ("fwd_K0", "fwd_BASE", "fwd_M4"))
        M6 = m(p["M6"])
        r = {"n": int(k.sum()), "events": int(y[k].sum()), "families": fam,
             "missing_families": [f for f, v in fam.items() if not v],
             "vs_K0": pe.score(tp, K0, M6, "fwd"), "vs_BASE": pe.score(tp, BASE, M6, "fwd"),
             "vs_M4": pe.score(tp, M4, M6, "fwd"),
             "ablation": {kk: bpm.ll(y[k], m(v)[k]) for kk, v in p.items()}}
        res[f"{pos}{cut}"] = r
        say(f"{pos}{cut} n={r['n']} K0 {r['vs_K0']['base']['logloss']:.4f} M4 {r['vs_M4']['base']['logloss']:.4f} "
            f"M6 {r['vs_K0']['cand']['logloss']:.4f} slope {r['vs_K0']['cand']['slope']:.2f} "
            f"beatsK0 {r['vs_K0']['boot']['p']:.0%} beatsBASE {r['vs_BASE']['boot']['p']:.0%} | "
            + ", ".join(f"-{kk[11:]} {v - r['ablation']['M6']:+.4f}" for kk, v in r["ablation"].items() if kk != "M6"))
    rec = {"id": "M6", "created_at_utc": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
           "git_head": pe.git_head(), "charter": pe.CHARTER,
           "sources_sha256": hashlib.sha256(json.dumps(pdb.source_shas(bpm._CON), sort_keys=True).encode()).hexdigest(),
           "script_sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest(),
           "spec": {"C": pe.C, "capital": "K0 spline in log pick", "families": FAMILIES, "min_cover": MIN_COVER,
                    "tuning": "none"}, "results": res}
    (EXP / "M6.json").write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")
    if freeze:
        write_freeze(t, fams_all, rec)
    return rec


def write_freeze(t, fams_all, rec):
    """Per-player served chance plus each family's effect in percentage points: his chance minus his
    chance with that family set to the training average. Families with no data are listed, not hidden."""
    gsis_map, _ = bpm.sleeper_maps()
    out = {}
    for pos in bpm.POS:
        fam = fams_all[pos]
        cols = [c for v in fam.values() for c in v]
        tp = population(t, pos)
        mdl = bpm.make_lr(pe.C, len(cols), capital=True).fit(tp[cols + ["log_pick"]].to_numpy(float), tp.hit.to_numpy(float))
        lr = mdl[-1]
        serve = t[(t.pos == pos) & t.gsis_id.notna() & (t.draft_year >= bpm.SCORE_FROM)]
        raw = serve[cols + ["log_pick"]].to_numpy(float)
        Z = mdl[:-1].transform(raw) * lr.coef_[0]
        logit = Z.sum(1) + lr.intercept_[0]
        idx = {f: [cols.index(c) for c in v] for f, v in fam.items() if v}
        idx["capital"] = list(range(len(cols), Z.shape[1]))
        sig = lambda v: 1 / (1 + np.exp(-v))   # noqa: E731
        for i, r in enumerate(serve.itertuples()):
            slp = gsis_map.get(str(r.gsis_id))
            if not slp:
                continue
            pr = sig(logit[i])
            eff = {f: round(float(100 * (pr - sig(logit[i] - Z[i, j].sum()))), 1) for f, j in idx.items()}
            # Every input he lacks is listed (the model set it to the training median), so the card can say so.
            miss = [cols[j] for j in range(len(cols)) if np.isnan(raw[i, j])]
            out[slp] = [pos, round(float(pr), 4), eff, miss]
    src = FREEZE.read_text(encoding="utf-8")
    head, body = src.split("window.PROSPECT_CUT_MODEL=", 1)
    cm = json.loads(body.strip().rstrip(";"))
    cm.pop("sha256", None)
    cm["m6"] = {"model": "M6: regularized logistic (C 0.1) on capital spline + production, athleticism, age, landing",
                "scoring": "notes/prospect-research/experiments/M6.json", "frozen_at_utc": rec["created_at_utc"],
                "script_sha256": rec["script_sha256"], "families": fams_all,
                "note": "served at every position by owner decision 2026-11-28, whatever its score",
                "players": out}
    cm["sha256"] = hashlib.sha256(json.dumps(cm, separators=(",", ":")).encode()).hexdigest()
    FREEZE.write_text(head + f"window.PROSPECT_CUT_MODEL={json.dumps(cm, separators=(',', ':'))};\n", encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--freeze", action="store_true")
    ap.add_argument("--freeze-only", action="store_true", help="rewrite the served table from M6.json's spec, no rescoring")
    a = ap.parse_args()
    if a.freeze_only:
        warnings.filterwarnings("ignore")
        bpm.SOURCE = "db"
        _, _, _, t0, _ = bpm.prepare(say=lambda *x: None)
        rec0 = json.loads((EXP / "M6.json").read_text(encoding="utf-8"))
        write_freeze(landing(t0, bpm._CON), {k[:2]: v["families"] for k, v in rec0["results"].items()}, rec0)
    else:
        run(a.freeze)
