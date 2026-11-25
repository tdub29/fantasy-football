"""D2: score the frozen K0 hit-line chance on the drafted players K0 was NOT fit on.

K0 (site/data/prospect-cut-model.js) is fit on population A: drafted QB/RB/WR/TE 2008+ with a linked
college record (bpm.prepare's `t`, gsis id present). The rest of the draftees ("excluded"; the site
calls the 2014+ ones it can map to a Sleeper id "nocfb") still get K0's chance by pick. This scores
that chance on the excluded rows with a closed outcome window, at the hit line (QB12/RB24/WR24/TE12):
observed vs expected hits, log loss against the fit population's base rate, and a calibration slope
when there are at least 10 hits. Intervals are 90% class-bootstrap percentiles. Nothing is fitted.
TE has no K0 table (not served), so TE gets counts only.

The prospect DB is opened read-only (mode=ro): bpm's reader is handed that connection, so the builder's
ingest/refresh never runs.

    python notes/prospect-research/experiments/d2_nocfb_k0.py               # writes d2_nocfb_k0.json
    python notes/prospect-research/experiments/d2_nocfb_k0.py --self-check
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sqlite3
import sys
import warnings

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[3]
EXP = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "projections"))
sys.path.insert(0, str(EXP))
import build_prospect_model as bpm  # noqa: E402
import m4_monitor as mon  # noqa: E402  (frozen-table reader, pick interpolation, calibration slope)

CUTS = {"QB": 12, "RB": 24, "WR": 24, "TE": 12}
BOOT, SEED, Q = 4000, 11, (5, 95)


def logloss(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def boot(y, p, base, g, n=BOOT, seed=SEED):
    """90% class-bootstrap intervals of observed - expected hits, O/E, and mean log-loss gain over the
    base rate (base - K0; positive = K0 better). Resamples whole draft classes."""
    units = np.unique(g)
    idx = [np.flatnonzero(g == u) for u in units]
    rng = np.random.default_rng(seed)
    d, r, gain = [], [], []
    for _ in range(n):
        k = np.concatenate([idx[j] for j in rng.integers(0, len(idx), len(idx))])
        d.append(y[k].sum() - p[k].sum())
        r.append(y[k].sum() / p[k].sum())
        gain.append(logloss(y[k], np.full(len(k), base)).mean() - logloss(y[k], p[k]).mean())
    ci = lambda v: [round(float(x), 3) for x in np.percentile(v, Q)]   # noqa: E731
    return {"obs_minus_exp_90": ci(d), "o_over_e_90": ci(r), "logloss_gain_90": ci(gain),
            "p_gain_gt_0": round(float(np.mean(np.array(gain) > 0)), 3)}


def score(y, p, base, g):
    out = {"n": int(len(y)), "classes": int(len(np.unique(g))), "hits": int(y.sum()),
           "expected_hits": round(float(p.sum()), 2), "o_over_e": round(float(y.sum() / p.sum()), 3),
           "mean_chance": round(float(p.mean()), 4), "base_rate": round(base, 4),
           "logloss_k0": round(float(logloss(y, p).mean()), 4),
           "logloss_base": round(float(logloss(y, np.full(len(y), base)).mean()), 4)}
    out.update(boot(y, p, base, g))
    out["slope"] = round(mon.slope(y, p), 3) if y.sum() >= mon.MIN_HITS and mon.slope(y, p) is not None \
        else f"not estimated: {int(y.sum())} hits < {mon.MIN_HITS}"
    return out


def rounds(y, p, pk):
    """Observed vs expected by draft round band: descriptive only, n is small."""
    out = {}
    for name, lo, hi in (("R1-2", 1, 64), ("R3-4", 65, 136), ("R5-7", 137, 999)):
        k = (pk >= lo) & (pk <= hi)
        if k.any():
            out[name] = {"n": int(k.sum()), "hits": int(y[k].sum()), "expected": round(float(p[k].sum()), 2)}
    return out


def load():
    warnings.filterwarnings("ignore")
    con = sqlite3.connect(f"file:{bpm.pdb.DB_PATH.as_posix()}?mode=ro", uri=True)
    bpm.SOURCE, bpm._CON = "db", con      # read_src now only SELECTs; no ingest
    _, _, d, t, _ = bpm.prepare(say=lambda *a: None)
    stats = __import__("pandas").concat([bpm.read_src("nfl_player_season", f"stats_player_reg_{y}.parquet")
                                         for y in range(bpm.FIRST_CLASS, bpm.LAST_NFL + 1)], ignore_index=True)
    fit_sids = set(t.loc[t.gsis_id.notna(), "sid"])
    ex = d[~d.sid.isin(fit_sids) & d.gsis_id.notna()].copy()
    ex = bpm.attach_outcomes(ex, bpm.nfl_outcomes(stats, bpm.season_positions()))
    gsis, espn = bpm.sleeper_maps()
    ex["sleeper"] = [gsis.get(str(a)) or espn.get(str(b)) for a, b in zip(ex.gsis_id, ex.espn_id)]
    no_gsis = int((~d.sid.isin(fit_sids) & d.gsis_id.isna()).sum())
    sha = hashlib.sha256(bpm.pdb.DB_PATH.read_bytes()).hexdigest()
    con.close()
    return d, t, ex, no_gsis, sha


def run():
    cm = mon.load_js(ROOT / "site" / "data" / "prospect-cut-model.js")
    d, t, ex, no_gsis, sha = load()
    rep = {"what": "frozen K0 hit-line chance scored on drafted players outside its fit population",
           "frozen_at_utc": cm["frozen_at_utc"], "frozen_sha256": cm.get("sha256"),
           "db_sha256": sha, "script_sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
           "last_nfl": bpm.LAST_NFL, "last_class": bpm.LAST_CLASS,
           "excluded_without_gsis_id_unscorable": no_gsis, "positions": {}}
    for pos, cut in CUTS.items():
        lo, hi = 2008, bpm.LAST_CLASS[pos]
        e = ex[(ex.pos == pos) & ex.draft_year.between(lo, hi)]
        closed = e[e.hit.notna()]
        y = (np.nan_to_num(closed.best_rank.to_numpy(float), nan=999) <= cut).astype(float)
        g, pk = closed.draft_year.to_numpy(int), closed.pick.to_numpy(float)
        fitpop = t[(t.pos == pos) & t.gsis_id.notna() & t.draft_year.between(lo, hi)]
        r = {"cut": cut, "fit_population_rows": int(len(fitpop)), "excluded_rows": int(len(e)),
             "excluded_closed": int(len(closed)),
             "excluded_pick_q25_q50_q75": [float(v) for v in np.percentile(e.pick, [25, 50, 75])] if len(e) else None,
             "fit_pick_q25_q50_q75": [float(v) for v in np.percentile(fitpop.pick, [25, 50, 75])]}
        key = f"{pos}{cut}"
        if key not in cm["p"]:
            r["k0"] = "no frozen table: chance not served at this position"
            r["observed"] = {"n": int(len(y)), "hits": int(y.sum())}
        else:
            f = cm["fit"][key]
            base = f["events"] / f["n"]
            p = np.array([mon.chance(cm["p"][key], v) for v in pk], float)
            r["all_closed_2008plus"] = score(y, p, base, g)
            r["all_closed_2008plus"]["by_round"] = rounds(y, p, pk)
            s = (g >= bpm.SCORE_FROM) & closed.sleeper.notna().to_numpy()
            r["served_nocfb_closed_2014plus"] = score(y[s], p[s], base, g[s]) if s.sum() and y[s].sum() else \
                {"n": int(s.sum()), "hits": int(y[s].sum()), "expected_hits": round(float(p[s].sum()), 2)}
        rep["positions"][pos] = r
    served = ex[(ex.draft_year >= bpm.SCORE_FROM) & ex.sleeper.notna()]
    rep["served_nocfb_rows_all_classes"] = int(len(served))
    return rep


def self_check():
    # Calibrated forecasts: the 90% O/E interval should cover 1 about 90% of the time (12 classes x 15).
    rng = np.random.default_rng(5)
    g = np.repeat(np.arange(12), 15)
    cover = 0
    for _ in range(200):
        p = rng.uniform(0.02, 0.5, len(g))
        y = (rng.random(len(g)) < p).astype(float)
        lo, hi = boot(y, p, float(p.mean()), g, n=400)["o_over_e_90"]
        cover += lo <= 1 <= hi
    assert 0.78 <= cover / 200 <= 0.97, cover
    print(f"self-check ok: O/E 90% interval covered 1 in {cover}/200 calibrated draws")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    if ap.parse_args().self_check:
        self_check()
        sys.exit(0)
    rep = run()
    (EXP / "d2_nocfb_k0.json").write_text(json.dumps(rep, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(rep, indent=1))
