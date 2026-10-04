"""Population B experiments (charter v2 + addendum 1): pre-draft hit probability for every exiting
FBS QB/RB/WR/TE, drafted or not, grouped by college position.

  B0r  training base rate            B0s  recruiting stars only (the stronger is the baseline)
  B1   v1 talent features, no athleticism
  B2   union of v1 college features + dominator, seasons
  B3   two-stage: P(draft bucket | B2) x training hit rate per bucket
  B4   post-combine phase: B2 + combine invite, forty, weight, speed score

Same folds and rules as population A (prospect_experiments.py): embargoed forward chaining by
decision class from 2013, leave-one-class-out on 2008-2019, class bootstrap, calibration slope,
2020+ check. Each training row obeys its own outcome window.

    python projections/prospect_experiments_b.py            # all
    python projections/prospect_experiments_b.py B2 B3
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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402
import prospect_db as pdb  # noqa: E402
import prospect_experiments as pe  # noqa: E402
import prospect_population as pp  # noqa: E402

C = bpm.C_FIXED
FIRST = bpm.FIRST_CLASS
B2 = ["ryptpa_career", "ryptpa_best", "ryptpa_final", "scrim_ypg", "rush_ypg_best", "comp_final", "early", "stars",
      "power", "draft_age", "weight", "dom_best", "dom_final", "n_seasons", "n_qual"]
B4 = B2 + ["invited", "c_forty", "c_wt", "c_speed"]
BUCKETS = ["R1", "R2", "R3", "D3", "UD"]
CANDIDATES = {"B1": "v1 talent features refit on every exiting player (no athleticism)",
              "B2": "union of v1 college features plus dominator and seasons",
              "B3": "two-stage: predicted draft bucket times training hit rate per bucket",
              "B4": "post-combine phase: B2 plus combine invite and measured forty, weight, speed score",
              "B5": "B2 with C picked per outer fold by inner leave-one-class-out (addendum 2)",
              "B6": "B2 plus a stars-missing indicator (addendum 2)",
              "B7": "B2 plus team offense, schedule strength, first-down share, explosive rate (addendum 3)",
              "B8": "B2 without the QB-only features for RB/WR/TE (addendum 4)",
              "B9": "B8 with C picked by inner leave-one-class-out (addendum 4)",
              "B10": "B7 without the QB-only features for RB/WR/TE (addendum 5)",
              "B11": "QB with passer features only (addendum 7)",
              "B12": "B11 with C picked by inner leave-one-class-out (addendum 7)"}
B11 = ["rush_ypg_best", "comp_final", "aya_final", "starts", "n_seasons", "n_qual", "early", "stars", "draft_age",
       "power", "weight"]
QB_ONLY = {"comp_final", "rush_ypg_best"}


def no_qb(cols, pos):
    return cols if pos == "QB" else [c for c in cols if c not in QB_ONLY]
B7 = B2 + ["team_off_final", "sos_career", "fd_share_best", "explosive_best"]
# Addendum 2 pick per college position (lowest forward log loss among passing candidates); A13 uses it.
PICK = {"QB": "B5", "RB": "B1", "WR": "B5", "TE": "B2"}
C_GRID = (0.03, 0.1, 0.3, 1.0, 3.0)


def b1_cols(pos):
    return [c for c in bpm.FEATS[pos] if c != "speed_score"]


def combine_join(e, d, con) -> pd.DataFrame:
    """Combine row per population row: drafted players by PFR id, everyone else by name + combine
    year = decision class + a school match. The combine is held before the draft."""
    cb = pd.read_sql_query("SELECT season, player_name, school, pfr_id, wt, forty FROM nfl_combine", con)
    pfr = d.dropna(subset=["player_id"]).drop_duplicates("player_id").set_index("player_id").pfr_player_id
    by_pfr = cb.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")
    cb["_k"] = cb.player_name.map(bpm.name_key)
    groups = cb.groupby(["_k", "season"])
    rows = {}
    for r in e.itertuples():
        hit = None
        pid = pfr.get(r.player_id)
        if isinstance(pid, str) and pid in by_pfr.index:
            hit = by_pfr.loc[pid]
        else:
            k = (bpm.name_key(r.name_final), r.cls)
            if k in groups.groups:
                g = groups.get_group(k)
                g = g[[bpm.school_sim(s, r.pos_team_final) >= 0.5 for s in g.school]]
                if len(g) == 1:
                    hit = g.iloc[0]
        if hit is not None:
            rows[r.sid] = {"invited": 1.0, "c_forty": hit.forty, "c_wt": hit.wt}
    out = pd.DataFrame.from_dict(rows, orient="index")
    out = out.reindex(e.sid)
    out["invited"] = out.invited.fillna(0.0)
    out["c_speed"] = [bpm.bpp.speed_score(w, f) for w, f in zip(out.c_wt, out.c_forty)]
    return out


def lr(cols):
    def fit(X, y):
        return bpm.make_lr(C).fit(X, y)
    return fit


class NestedLR:
    """B5: C chosen by leave-one-class-out inside the training classes only, then refit on all of them."""
    chosen: list = []

    def fit(self, X, y, g):
        best, best_ll = None, np.inf
        for c in C_GRID:
            p = np.full(len(y), np.nan)
            for k in np.unique(g):
                te = g == k
                if y[~te].sum() < 3:
                    continue
                p[te] = bpm.make_lr(c).fit(X[~te], y[~te]).predict_proba(X[te])[:, 1]
            m = ~np.isnan(p)
            v = bpm.ll(y[m], p[m])
            if v < best_ll:
                best, best_ll = c, v
        best = C if best is None else best   # too few classes to tune: the fixed C
        NestedLR.chosen.append(best)
        self.m = bpm.make_lr(best).fit(X, y)
        return self

    def predict_proba(self, X):
        return self.m.predict_proba(X)


class Rate:
    def fit(self, X, y):
        self.p = float(np.mean(y))
        return self

    def predict_proba(self, X):
        return np.column_stack([np.full(len(X), 1 - self.p), np.full(len(X), self.p)])


class TwoStage:
    """Stage 1: multinomial logistic on the B2 features -> draft bucket. Stage 2: the training rows'
    hit rate in each bucket (the overall rate where a bucket is empty)."""
    def fit(self, X, y, bucket):
        from sklearn.impute import SimpleImputer
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        self.m = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                               LogisticRegression(C=C, max_iter=5000)).fit(X, bucket)
        overall = float(np.mean(y))
        self.rate = {b: (float(np.mean(y[bucket == b])) if (bucket == b).any() else overall) for b in self.m.classes_}
        return self

    def bucket_proba(self, X):
        return pd.DataFrame(self.m.predict_proba(X), columns=self.m.classes_).reindex(columns=BUCKETS, fill_value=0.0)

    def predict_proba(self, X):
        bp = self.bucket_proba(X)
        p = sum(bp[b] * self.rate.get(b, 0.0) for b in bp.columns).to_numpy()
        return np.column_stack([1 - p, p])


def predictor(tp, X, fit, win, bucket=None, nested=False):
    y = tp.hit.to_numpy(float)
    g = tp.draft_year.to_numpy(int)
    mature = tp.hit.notna().to_numpy()

    def predict(scheme, c, te):
        tr = mature & pe.fold_mask(g, scheme, c, win)
        assert not (tr & te).any()
        if y[tr].sum() < 3:   # too little history (the first classes of a 4-year window): no score
            return np.full(te.sum(), np.nan)
        if nested:
            m = NestedLR().fit(X[tr], y[tr], g[tr])
        else:
            m = fit(X[tr], y[tr]) if bucket is None else TwoStage().fit(X[tr], y[tr], bucket[tr])
        return m.predict_proba(X[te])[:, 1]
    return predict


def run(ids, say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    e = pp.build(ps, bio, d, t, age0, con, say=say)
    e = e[e.draft_year >= FIRST].reset_index(drop=True)
    e = e.join(combine_join(e, d, con).reset_index(drop=True))
    e["stars_missing"] = e.stars.isna().astype(float)
    e = e.join(pe.schedule_context(e, ps, con), on="sid").join(pe.usage_quality(e, ps, con), on="sid")
    say(f"combine: {e.invited.mean():.1%} of population B invited; drafted {e[e.drafted == 1].invited.mean():.1%}, "
        f"undrafted {e[e.drafted == 0].invited.mean():.1%}")
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    srcs = hashlib.sha256(json.dumps(pdb.source_shas(con), sort_keys=True).encode()).hexdigest()
    results, frozen = {}, []
    for pos in bpm.POS:
        tp = e[e.cpos == pos].reset_index(drop=True)
        win = tp.win.to_numpy(int)
        mature = tp.hit.notna()
        ones = np.zeros((len(tp), 1))
        pr_rate = predictor(tp, ones, lambda X, y: Rate().fit(X, y), win)
        pr_star = predictor(tp, tp[["stars"]].to_numpy(float), lr(["stars"]), win)
        base = {"B0r": {s: pe.oof(tp, pr_rate, s) for s in ("fwd", "loco")},
                "B0s": {s: pe.oof(tp, pr_star, s) for s in ("fwd", "loco")}}
        bl = {k: _fwd_ll(tp, v["fwd"]) for k, v in base.items()}
        bkey = min(bl, key=bl.get)
        pb = base[bkey]
        say(f"{pos}: n={int(mature.sum())} hits={int(tp.hit.sum())} baseline {bkey} fwd {bl[bkey]:.4f} "
            f"(rate {bl['B0r']:.4f}, stars {bl['B0s']:.4f})")
        for cid in ids:
            cols = {"B1": b1_cols(pos), "B2": B2, "B3": B2, "B4": B4, "B5": B2, "B6": B2 + ["stars_missing"], "B7": B7,
                    "B8": no_qb(B2, pos), "B9": no_qb(B2, pos), "B10": no_qb(B7, pos), "B11": B11, "B12": B11}[cid]
            if cid in ("B11", "B12") and pos != "QB":
                continue
            X = tp[cols].to_numpy(float)
            NestedLR.chosen = []
            if cid == "B3":
                pr = predictor(tp, X, None, win, bucket=tp.bucket.to_numpy())
            elif cid in ("B5", "B9", "B12"):
                pr = predictor(tp, X, None, win, nested=True)
            else:
                pr = predictor(tp, X, lr(cols), win)
            pc = {s: pe.oof(tp, pr, s) for s in ("fwd", "loco")}
            fwd, loco = pe.score(tp, pb["fwd"], pc["fwd"], "fwd"), pe.score(tp, pb["loco"], pc["loco"], "loco")
            rules, verdict = pe.decide(fwd, loco)
            res = {"fwd": fwd, "loco": loco, "rules": rules, "verdict": verdict, "cols": cols, "baseline": bkey,
                   "baseline_fwd_logloss": bl}
            if cid == "B3":
                res["bucket"] = bucket_quality(tp, X, win)
            if cid in ("B5", "B9", "B12"):
                res["chosen_C"] = list(NestedLR.chosen)
            results.setdefault(cid, {})[pos] = res
            frozen.append((cid, pos, tp, final_fit(tp, X, cid, cols)))
            say(f"  {cid} {pos}: fwd {fwd['base']['logloss']:.4f} -> {fwd['cand']['logloss']:.4f} (boot {fwd['boot']['p']:.0%}, "
                f"slope {fwd['cand']['slope']:.2f}, AUC {fwd['base']['auc']:.3f} -> {fwd['cand']['auc']:.3f}, 2020+ "
                f"{fwd['regime_2020']['base']:.4f} -> {fwd['regime_2020']['cand']:.4f}) | loco {loco['base']['logloss']:.4f} -> "
                f"{loco['cand']['logloss']:.4f} | {verdict}")
    for cid, by_pos in results.items():
        rec = {"id": cid, "description": CANDIDATES[cid], "created_at_utc": stamp, "charter": pe.CHARTER + " (addendum 1)",
               "git_head": pe.git_head(), "sources_sha256": srcs,
               "command": f"python projections/prospect_experiments_b.py {cid}",
               "population": "B: exiting FBS QB/RB/WR/TE by college position, drafted or not, decision classes 2008+",
               "primary_metric": "pooled log loss, fwd", "results": by_pos}
        (pe.EXP / f"{cid}.json").write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")
    write_ledger()
    freeze(frozen, stamp, srcs)
    return results


def final_fit(tp, X, cid, cols):
    """Fit on every mature row; predict the rows whose outcome window is still open."""
    m = tp.hit.notna().to_numpy()
    y = tp.hit.to_numpy(float)
    if cid == "B3":
        mod = TwoStage().fit(X[m], y[m], tp.bucket.to_numpy()[m])
    elif cid in ("B5", "B9", "B12"):
        mod = NestedLR().fit(X[m], y[m], tp.draft_year.to_numpy(int)[m])
    else:
        mod = bpm.make_lr(C).fit(X[m], y[m])
    return mod.predict_proba(X[~m])[:, 1], ~m


def freeze(frozen, stamp, srcs):
    """Pre-draft predictions for decision classes whose outcome is still open, keyed by college id."""
    path = pe.EXP / "prospective-b.json"
    book = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"note": (
        "Frozen population B (pre-draft) predictions for classes whose window is open, keyed by ESPN college id. "
        "Never edited: a new config adds an entry."), "entries": []}
    for cid, pos, tp, (p, open_) in frozen:
        body = {str(pid): round(float(v), 4) for pid, v in zip(tp.player_id[open_], p)}
        sha = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        if any(e["sha256"] == sha and e["id"] == cid and e["pos"] == pos for e in book["entries"]):
            continue
        book["entries"].append({"id": cid, "pos": pos, "frozen_at_utc": stamp, "git_head": pe.git_head(),
                                "sources_sha256": srcs, "sha256": sha, "p_by_college_id": body})
    path.write_text(json.dumps(book, indent=1), encoding="utf-8")


def oof_predraft(ps, bio, d, t, age0, con) -> pd.Series:
    """A13 feature: college id -> population B forward out-of-fold pre-draft probability, using the
    addendum 2 pick per college position, first scored class 2011 (trained on 2008)."""
    e = pp.build(ps, bio, d, t, age0, con, say=lambda *a: None)
    e = e[e.draft_year >= FIRST].reset_index(drop=True)
    out = []
    for pos, cid in PICK.items():
        tp = e[e.cpos == pos].reset_index(drop=True)
        cols = b1_cols(pos) if cid == "B1" else B2
        X = tp[cols].to_numpy(float)
        pr = predictor(tp, X, None if cid == "B5" else lr(cols), tp.win.to_numpy(int), nested=cid == "B5")
        p = pe.oof(tp, pr, "fwd", first_test=FIRST + 3)
        out.append(pd.Series(p, index=tp.player_id))
    s = pd.concat(out)
    return s[~s.index.duplicated()].dropna()


def _fwd_ll(tp, p):
    k = tp.hit.notna().to_numpy() & ~np.isnan(p)
    return bpm.ll(tp.hit.to_numpy(float)[k], p[k])


def bucket_quality(tp, X, win):
    """Draft-bucket prediction on the forward folds: multiclass log loss vs the training bucket shares."""
    g = tp.draft_year.to_numpy(int)
    b = tp.bucket.to_numpy()
    y = tp.hit.to_numpy(float)
    mature = tp.hit.notna().to_numpy()
    ll_m, ll_0, n = 0.0, 0.0, 0
    for c in pe.test_classes(g[mature], "fwd"):
        te = mature & (g == c)
        tr = mature & pe.fold_mask(g, "fwd", c, win)
        m = TwoStage().fit(X[tr], y[tr], b[tr])
        bp = m.bucket_proba(X[te]).to_numpy()
        share = pd.Series(b[tr]).value_counts(normalize=True).reindex(BUCKETS, fill_value=1e-4).to_numpy()
        idx = np.array([BUCKETS.index(v) for v in b[te]])
        ll_m += -np.log(np.clip(bp[np.arange(len(idx)), idx], 1e-4, 1)).sum()
        ll_0 += -np.log(np.clip(share[idx], 1e-4, 1)).sum()
        n += len(idx)
    return {"n": n, "bucket_logloss": ll_m / n, "share_logloss": ll_0 / n}


def write_ledger():
    rows = []
    for f in sorted(pe.EXP.glob("B*.json"), key=lambda q: (len(q.stem), q.stem)):
        r = json.loads(f.read_text(encoding="utf-8"))
        for pos, x in r["results"].items():
            fw, lo = x["fwd"], x["loco"]
            rows.append(f"| {r['id']} | {pos} | {x['baseline']} | {fw['base']['logloss']:.4f} | {fw['cand']['logloss']:.4f} | "
                        f"{fw['base']['auc']:.3f} / {fw['cand']['auc']:.3f} | {fw['boot']['p']:.0%} | {fw['cand']['slope']:.2f} | "
                        f"{fw['regime_2020']['base']:.4f} / {fw['regime_2020']['cand']:.4f} | "
                        f"{lo['base']['logloss']:.4f} / {lo['cand']['logloss']:.4f} | {pe.final_verdict(r['id'], pos, x['verdict'])} |")
    head = ["# Experiment ledger, population B (pre-draft, every exiting FBS player)", "",
            "Generated by `projections/prospect_experiments_b.py`. Baseline = the stronger of training base rate (B0r) "
            "and stars-only (B0s) on forward log loss, per position.", "",
            "| ID | Pos | Baseline | Fwd base | Fwd cand | AUC base / cand | Boot | Slope | 2020+ base / cand | "
            "LOCO base / cand | Verdict |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    (pe.EXP / "ledger-b.md").write_text("\n".join(head + rows) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    a = ap.parse_args()
    ids = list(CANDIDATES) if a.ids in ([], ["all"]) else a.ids
    assert not set(ids) - set(CANDIDATES), "not pre-registered"
    run(ids)


if __name__ == "__main__":
    main()
