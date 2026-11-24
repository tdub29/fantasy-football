"""Monitor for the served prospect chances (registry m4-prospect-score, frozen K0 hit line).

Reads the frozen table (site/data/prospect-cut-model.js) and the drafted rows in
site/data/prospect-model.js, then reports, per position:
  inputs       served picks (drafted classes after the fit) against the fit-era picks in the same file:
               n, quartiles, round-1 share, and picks outside the table (above 262)
  calibration  per newly closed class (drafted after the fit, outcome window now closed): n, hits, mean
               forecast, observed rate; pooled: calibration slope of logit(forecast) and the 95% interval
               of the summed forecast
Kill rule (model card, charter rule 5): on the pooled newly closed classes of a position, with at least
10 hits, observed hits outside the 95% interval of the summed forecast, or a calibration slope whose
95% class-bootstrap interval lies entirely outside 0.75-1.25, pulls that position's chances and score.
A point slope outside the band alone does not: at n=30 it trips on about half of calibrated classes.
Exit 1 when any position trips it, else 0.

    python notes/prospect-research/experiments/m4_monitor.py            # report as JSON
    python notes/prospect-research/experiments/m4_monitor.py --self-check
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[3]
# Two tests share the false-kill budget, so each runs at 95%: a calibrated position trips about 10%
# of the time in all (self-check: at most 10% on simulated calibrated classes).
SLOPE, MIN_HITS, Z95, BOOT = (0.75, 1.25), 10, 1.96, 400


def load_js(path: pathlib.Path) -> dict:
    s = path.read_text(encoding="utf-8")
    s = s[s.index("=", s.index("window.")) + 1:].strip()
    return json.loads(s.rstrip(";"))


def chance(table, pk):
    x = min(max(float(pk), 1.0), len(table)) - 1
    i = int(x)
    return table[i] + (x - i) * (table[i + 1] - table[i]) if i + 1 < len(table) else table[i]


def slope(y, p):
    """Unpenalized logistic recalibration slope of logit(p) (Newton, intercept free). None when the
    fit is undefined: a singular information matrix (one outcome, or every forecast the same) or no
    convergence (separation)."""
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    X = np.column_stack([np.ones(len(p)), np.log(p / (1 - p))])
    w = np.array([0.0, 1.0])
    for _ in range(100):
        with np.errstate(over="ignore"):
            q = 1 / (1 + np.exp(-X @ w))
        try:
            dx = np.linalg.solve((X * (q * (1 - q))[:, None]).T @ X, X.T @ (q - y))
        except np.linalg.LinAlgError:
            return None
        w -= dx
        if not np.isfinite(w).all():
            return None
        if np.abs(dx).max() < 1e-10:
            return float(w[1])
    return None


def slope_interval(y, p, g, n=BOOT, seed=7):
    """95% bootstrap interval of the slope, resampling whole draft classes (players when fewer than 3
    classes). Resamples with an undefined slope are dropped."""
    units = np.unique(g)
    idx = [np.flatnonzero(g == u) for u in units] if len(units) >= 3 else [np.array([i]) for i in range(len(y))]
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        k = np.concatenate([idx[j] for j in rng.integers(0, len(idx), len(idx))])
        v = slope(y[k], p[k])
        if v is not None:
            vals.append(v)
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))] if len(vals) >= n // 2 else None


def check(y, p, g=None):
    """Kill when, with at least MIN_HITS hits, observed hits fall outside the 95% interval of the summed
    forecast, or the slope's 95% class-bootstrap interval lies entirely outside the SLOPE band."""
    y, p = np.asarray(y, float), np.asarray(p, float)
    g = np.zeros(len(y), int) if g is None else np.asarray(g)
    exp, sd = float(p.sum()), float(np.sqrt((p * (1 - p)).sum()))
    out = {"n": int(len(y)), "hits": int(y.sum()), "forecast_hits": round(exp, 2),
           "interval_95": [round(exp - Z95 * sd, 2), round(exp + Z95 * sd, 2)]}
    trip = not (exp - Z95 * sd <= y.sum() <= exp + Z95 * sd)
    if y.sum() >= MIN_HITS and y.sum() < len(y):
        sl, ci = slope(y, p), slope_interval(y, p, g)
        out["slope"] = None if sl is None else round(sl, 3)
        out["slope_95"] = None if ci is None else [round(v, 3) for v in ci]
        trip |= ci is not None and (ci[1] < SLOPE[0] or ci[0] > SLOPE[1])
    out["kill"] = bool(trip and y.sum() >= MIN_HITS)
    return out


def run():
    cm = load_js(ROOT / "site" / "data" / "prospect-cut-model.js")
    pm = load_js(ROOT / "site" / "data" / "prospect-model.js")
    rows = [r for r in pm["nfl"].values() if r.get("pk")]
    report = {"frozen_at_utc": cm["frozen_at_utc"], "frozen_sha256": cm["sha256"], "data_generated": pm.get("generated"),
              "positions": {}}
    for pos, cut in cm["cuts"].items():
        table = cm["p"][f"{pos}{cut}"]
        lo, hi = cm["fit"][f"{pos}{cut}"]["classes"]
        fit_pk = [r["pk"] for r in rows if r["p"] == pos and lo <= r["y"] <= hi]
        new = [r for r in rows if r["p"] == pos and r["y"] > hi]
        q = lambda a: [float(v) for v in np.percentile(a, [25, 50, 75])] if a else None   # noqa: E731
        r1 = lambda a: round(float(np.mean(np.asarray(a) <= 32)), 3) if a else None   # noqa: E731
        served = [r["pk"] for r in new]
        closed = [r for r in new if r.get("out")]
        y = [1.0 if r["out"][2] and r["out"][2] <= cut else 0.0 for r in closed]
        p = [chance(table, r["pk"]) for r in closed]
        per = {}
        for r, yi, pi in zip(closed, y, p):
            c = per.setdefault(r["y"], {"n": 0, "hits": 0, "sum_p": 0.0})
            c["n"] += 1; c["hits"] += int(yi); c["sum_p"] += pi
        report["positions"][pos] = {
            "cut": cut, "fit_classes": [lo, hi],
            "inputs": {"fit_era_in_file": {"n": len(fit_pk), "pick_q25_q50_q75": q(fit_pk), "r1_share": r1(fit_pk)},
                       "served": {"n": len(served), "pick_q25_q50_q75": q(served), "r1_share": r1(served),
                                  "outside_table": sum(pk > len(table) for pk in served)}},
            "per_class": {str(k): {"n": v["n"], "hits": v["hits"], "mean_forecast": round(v["sum_p"] / v["n"], 3),
                                   "observed": round(v["hits"] / v["n"], 3)} for k, v in sorted(per.items())},
            "pooled": check(y, p, [r["y"] for r in closed]) if closed else "no newly closed class yet"}
    return report


def self_check():
    rng = np.random.default_rng(3)
    p = rng.uniform(0.02, 0.9, 4000)
    y = (rng.random(4000) < p).astype(float)
    g = np.repeat(np.arange(10), 400)
    ok = check(y, p, g)
    assert not ok["kill"] and 0.9 < ok["slope"] < 1.1, ok
    sharp = 1 / (1 + np.exp(-2 * np.log(p / (1 - p))))   # overconfident forecast
    assert check(y, sharp, g)["kill"], "overconfident forecast did not trip the kill rule"
    assert slope(np.zeros(5), np.full(5, 0.3)) is None and slope(np.array([0, 1, 0, 1.]), np.full(4, 0.4)) is None
    # False kills on calibrated nulls shaped like one or two newly closed classes: must stay <= 10%.
    for n_cls, size in ((1, 30), (2, 40), (5, 60)):
        kills = 0
        for t in range(200):
            q = rng.uniform(0.03, 0.8, n_cls * size)
            kills += check((rng.random(len(q)) < q).astype(float), q, np.repeat(np.arange(n_cls), size))["kill"]
        assert kills / 200 <= 0.10, f"false-kill rate {kills / 200:.0%} at {n_cls} x {size}"
        print(f"null {n_cls} class(es) x {size}: false-kill rate {kills / 200:.1%}")
    assert chance([0.5, 0.3, 0.1], 1.5) == 0.4 and chance([0.5, 0.3], 300) == 0.3
    print("self-check ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    if ap.parse_args().self_check:
        self_check()
        sys.exit(0)
    rep = run()
    print(json.dumps(rep, indent=1))
    sys.exit(1 if any(isinstance(v["pooled"], dict) and v["pooled"]["kill"] for v in rep["positions"].values()) else 0)
