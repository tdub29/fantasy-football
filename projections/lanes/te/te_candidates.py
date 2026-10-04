"""TE lane candidates T1-T3 (notes/prospect-research/lanes/te/prereg.md), scored through the lane copy
of the serving replay (te_replay.py, which reproduces run_stage's S3/S4n4 TE numbers exactly).

    PROSPECT_DB=<lane copy> python -W ignore projections/lanes/te/te_candidates.py T1 T2 T3

T1  TE only, served-shaped rows, unpenalized college-year intercepts, ridge C by inner leave-one-class-out
T2  T1's design pooled with WR served-shaped rows: shared ridge slopes + TE deviations penalized k times
    harder, position-specific unpenalized intercepts and college-year intercepts; (C, k) by inner
    leave-one-class-out scored on TE rows only
T3  T2 plus breakout age at the TE dominator line (15%) and the broke-out flag
Writes notes/prospect-research/lanes/te/results.json (lane path only).
"""
from __future__ import annotations

import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd

import te_replay as tr

bpm, psb = tr.bpm, tr.psb
C_GRID = (0.03, 0.1, 0.3, 1.0, 3.0)
K_GRID = (1.0, 4.0, 16.0)
UNPEN = bpm.UNPEN
NOTES = tr.PROJ.parent / "notes" / "prospect-research" / "lanes" / "te"
SEED, NBOOT = 7, 4000


def served_shape(t):
    return t[(t.stage >= 2) & t.plays_next]


class Design:
    """Median impute + standardize penalized columns on the training rows; unpenalized columns are
    standardized then multiplied by UNPEN (the v1 capital-term device), deviation columns by 1/sqrt(k)."""

    def __init__(self, prod, pooled, k=1.0):
        self.prod, self.pooled, self.k = prod, pooled, k

    def raw(self, f):
        st = f["stage"].to_numpy(float)
        te = f["is_te"].to_numpy(float) if self.pooled else np.ones(len(f))
        X = f[self.prod].to_numpy(float)
        if self.pooled:
            unp = np.column_stack([te, (st == 3) * te, (st >= 4) * te, (st == 3) * (1 - te), (st >= 4) * (1 - te)])
        else:
            unp = np.column_stack([(st == 3), (st >= 4)]).astype(float)
        return X, unp, te

    def fit(self, f):
        X, unp, _ = self.raw(f)
        self.med = np.nanmedian(X, axis=0)
        self.med = np.where(np.isnan(self.med), 0.0, self.med)
        Xi = np.where(np.isnan(X), self.med, X)
        self.mu, self.sd = Xi.mean(0), Xi.std(0)
        self.sd[self.sd == 0] = 1.0
        self.umu, self.usd = unp.mean(0), unp.std(0)
        self.usd[self.usd == 0] = 1.0
        return self

    def transform(self, f):
        X, unp, te = self.raw(f)
        Z = (np.where(np.isnan(X), self.med, X) - self.mu) / self.sd
        U = (unp - self.umu) / self.usd * UNPEN
        parts = [Z]
        if self.pooled:
            parts.append(Z * te[:, None] / np.sqrt(self.k))
        parts.append(U)
        return np.column_stack(parts)


def fit_design(f, prod, pooled, C, k):
    from sklearn.linear_model import LogisticRegression
    d = Design(prod, pooled, k).fit(f)
    m = LogisticRegression(C=C, max_iter=5000).fit(d.transform(f), f.hit.to_numpy(float))
    return d, m


def tune(f, prod, pooled):
    """Inner leave-one-class-out on the training rows; held-out log loss on TE rows only. Returns
    (C, k, inner log loss). Fallback C = 0.1, k = 4 when no class can be held out with 3+ training events."""
    y, g = f.hit.to_numpy(float), f.draft_year.to_numpy(int)
    te = f.is_te.to_numpy(bool) if pooled else np.ones(len(f), bool)
    best = (0.1, 4.0 if pooled else 1.0, np.inf)
    for C in C_GRID:
        for k in (K_GRID if pooled else (1.0,)):
            p = np.full(len(f), np.nan)
            for cls in np.unique(g[te]):
                ho = g == cls
                if y[~ho].sum() < 3 or (y[~ho & te].sum() < 1):
                    continue
                d, m = fit_design(f[~ho], prod, pooled, C, k)
                sel = ho & te
                p[sel] = m.predict_proba(d.transform(f[sel]))[:, 1]
            ok = ~np.isnan(p) & te
            if ok.sum() == 0:
                continue
            v = bpm.ll(y[ok], p[ok])
            if v < best[2]:
                best = (C, k, v)
    return best


SPECS = {
    "T1": {"pooled": False, "extra": []},
    "T2": {"pooled": True, "extra": []},
    "T3": {"pooled": True, "extra": ["breakout_age", "broke_out"]},
}


def make_fit(cid, c, log):
    spec = SPECS[cid]
    prod = [x for x in c["stage_cols"]["TE"] if x not in ("stage", "age_k")] + spec["extra"] + c["live_cols"]
    cols = prod + ["stage"]

    def fit(t_te, _cols, season):
        f = served_shape(t_te).assign(is_te=1.0)
        if spec["pooled"]:
            w = served_shape(tr.train_rows(c, "WR", season)).assign(is_te=0.0)
            f = pd.concat([f, w], ignore_index=True)
        C, k, inner = tune(f, prod, spec["pooled"])
        d, m = fit_design(f, prod, spec["pooled"], C, k)
        log.append({"season": season, "C": C, "k": k, "inner_te_logloss": inner, "rows": int(len(f)),
                    "te_rows": int(f.is_te.sum()), "te_events": int(f[f.is_te == 1].hit.sum())})

        def predict(X):
            v = pd.DataFrame(X, columns=cols).assign(is_te=1.0)
            return m.predict_proba(d.transform(v))[:, 1]
        return predict
    return fit, cols


def season_support(r, col="_pd", n=NBOOT, seed=SEED):
    """Resample the 10 replayed seasons with replacement; share of resamples where each gate's metric
    is inside its band, and where all six are. Top 60 rows are each season's own top 60 (fixed)."""
    rng = np.random.default_rng(seed)
    r = r.copy()
    r["top60"] = r.groupby("season")[col].rank(ascending=False, method="first") <= 60
    seasons = np.array(sorted(r.season.unique()))
    by = {s: r[r.season == s] for s in seasons}
    keys = [(sub, met) for sub in ("all", "first_eligible", "top60") for met in ("ratio", "slope")]
    hits = {k: 0 for k in keys}
    joint, done = 0, 0
    for _ in range(n):
        x = pd.concat([by[s] for s in rng.choice(seasons, len(seasons))], ignore_index=True)
        allok = True
        for sub in ("all", "first_eligible", "top60"):
            xs = x if sub == "all" else x[x[sub]]
            if xs.y.sum() == 0:
                allok = False
                continue
            sm = psb.summary(xs.y.to_numpy(float), xs[col].to_numpy(float))
            okr = psb.RATIO[0] <= sm["ratio"] <= psb.RATIO[1]
            oks = psb.SLOPE[0] <= sm["slope"] <= psb.SLOPE[1]
            hits[(sub, "ratio")] += okr
            hits[(sub, "slope")] += oks
            allok &= okr and oks
        joint += allok
        done += 1
    return {f"{a}_{b}": hits[(a, b)] / done for a, b in keys} | {"all_six": joint / done}


def score(cid, c, r_s4=None):
    log = []
    fit, cols = make_fit(cid, c, log)
    t0 = time.time()
    r = tr.replay(c, "TE", fit, cols)
    from sklearn.metrics import roc_auc_score
    y, pc, pb = r.y.to_numpy(float), r._pd.to_numpy(float), r._base.to_numpy(float)
    g = tr.gates(r)
    dr = r.player_id.map(c["drafted"]).eq(1).to_numpy()
    late = r[r.season >= 2017]
    uniq = r.groupby("player_id").y.max()
    out = {"id": cid, "gates": g, "served_logloss": bpm.ll(y, pc), "auc": float(roc_auc_score(y, pc)),
           "vs_stars_stage": {"base_logloss": bpm.ll(y, pb), "base_auc": float(roc_auc_score(y, pb)),
                              "boot_by_season": bpm.class_bootstrap(y, pb, pc, r.season.to_numpy(int), n=NBOOT, seed=SEED),
                              "drafted_base_auc": float(roc_auc_score(y[dr], pb[dr])),
                              "drafted_cand_auc": float(roc_auc_score(y[dr], pc[dr]))},
           "season_support": season_support(r),
           "replays_2017_2021": {"all": psb.summary(late.y.to_numpy(float), late._pd.to_numpy(float)),
                                 "first_eligible": psb.summary(late[late.first_eligible].y.to_numpy(float),
                                                               late[late.first_eligible]._pd.to_numpy(float))},
           "by_college_year": [{"year": int(k), "n": int(len(v)), "events": int(v.y.sum()), "pred": float(v._pd.sum()),
                                "ratio": float(v._pd.sum() / max(v.y.sum(), 1e-9))}
                               for k, v in r.groupby(r.stage.clip(upper=4))],
           "players": int(len(uniq)), "players_hit": int(uniq.sum()), "fits": log, "seconds": round(time.time() - t0, 1)}
    if r_s4 is not None:   # informational: the strongest earlier TE failure on the same rows
        m = r.merge(r_s4[["season", "player_id", "_pd"]].rename(columns={"_pd": "_s4"}), on=["season", "player_id"])
        assert len(m) == len(r)
        out["vs_s4n4"] = {"s4n4_logloss": bpm.ll(m.y.to_numpy(float), m._s4.to_numpy(float)),
                          "boot_by_season": bpm.class_bootstrap(m.y.to_numpy(float), m._s4.to_numpy(float), m._pd.to_numpy(float),
                                                                m.season.to_numpy(int), n=NBOOT, seed=SEED)}
    out["pass_gates"] = g["pass"]
    out["pass_replacement"] = out["vs_stars_stage"]["boot_by_season"]["p"] >= 0.9
    out["pass"] = out["pass_gates"] and out["pass_replacement"]
    r.to_pickle(tr.SCRATCH / f"rows_{cid}_te.pkl")
    return out


def line(o):
    g = o["gates"]
    f = lambda k: f"{g[k]['ratio']:.2f}/{g[k]['slope']:.2f}"
    return (f"{o['id']} TE: all {f('all')} | first-eligible {f('first_eligible')} | top60 {f('top60')} | ll "
            f"{o['vs_stars_stage']['base_logloss']:.4f} -> {o['served_logloss']:.4f} ({o['vs_stars_stage']['boot_by_season']['p']:.0%}) "
            f"| joint support {o['season_support']['all_six']:.0%} | {'PASS' if o['pass'] else 'FAIL'}")


def main(ids):
    c = tr.load()
    r_s4 = pd.read_pickle(tr.SCRATCH / "rows_s4n4_te.pkl")
    path = NOTES / "results.json"
    book = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for cid in ids:
        o = score(cid, c, r_s4)
        o["command"] = f"PROSPECT_DB=<lane copy> python -W ignore projections/lanes/te/te_candidates.py {cid}"
        o["git_head"] = __import__("subprocess").run(["git", "-C", str(tr.PROJ), "rev-parse", "--short", "HEAD"],
                                                      capture_output=True, text=True).stdout.strip()
        book[cid] = o
        print(line(o), flush=True)
        path.write_text(json.dumps(book, indent=1, default=float), encoding="utf-8")


def self_check():
    """The design: pooled deviation columns vanish for WR rows; unpenalized columns are boosted."""
    f = pd.DataFrame({"a": [1.0, 2.0, np.nan, 4.0], "stage": [2, 3, 4, 5], "is_te": [1.0, 0.0, 1.0, 0.0], "hit": [1, 0, 0, 1]})
    d = Design(["a"], True, 4.0).fit(f)
    Z = d.transform(f)
    assert Z.shape == (4, 1 + 1 + 5)
    assert Z[1, 1] == 0 and Z[3, 1] == 0, "TE deviation column is zero on WR rows"
    assert abs(Z[0, 1] - Z[0, 0] / 2) < 1e-12, "deviation scaled by 1/sqrt(k)"
    assert abs(np.std(Z[:, 2]) - UNPEN) < 1e-9, "unpenalized columns standardized then boosted"
    print("te_candidates self-check OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-check"]:
        self_check()
    else:
        main(sys.argv[1:] or list(SPECS))
