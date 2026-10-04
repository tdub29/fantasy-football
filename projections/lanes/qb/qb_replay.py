"""QB lane: a row-returning copy of `prospect_serving_backtest.run_stage` for one position.

The shared `run_stage` keeps only summaries and writes experiments/serving-backtest.json. This copy
replays the same seasons, training cut, served population and scoring path (`predraft_profile` +
`stage_score(which="next")`), but returns every served row so the lane can diagnose and resample, and
never writes a shared file. `parity` proves it reproduces the logged S3 QB numbers to the digit.

    export PROSPECT_DB=.../lane-qb/prospect.sqlite
    python projections/lanes/qb/qb_replay.py parity
"""
from __future__ import annotations

import json
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
PROJ = HERE.parents[1]
sys.path.insert(0, str(PROJ))
import build_prospect_model as bpm  # noqa: E402
import prospect_serving_backtest as psb  # noqa: E402

psb.OUT = HERE / "serving-backtest-qb-lane.json"     # lane rule: run_stage may never write the shared file
SCRATCH = pathlib.Path(r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-qb")
POS = "QB"


def load(say=print):
    """Everything run_stage loads, once."""
    warnings.filterwarnings("ignore")
    import prospect_population as pp
    import prospect_stage as pst
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    e = pp.build(ps, bio, d, t, age0, bpm._CON, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    snap = pst.snapshots(e, ps, age0, bpm._CON)
    hit = e.drop_duplicates("player_id").set_index("player_id").hit
    say(f"loaded: {len(e):,} exits, {len(snap):,} snapshots, QB snapshots {int((snap.cpos == POS).sum()):,}")
    return {"ps": ps, "bio": bio, "d": d, "t": t, "age0": age0, "e": e, "snap": snap, "hit": hit, "con": bpm._CON}


def nested(X, y, g):
    import prospect_experiments_b as peb
    return peb.NestedLR().fit(X, y, g)


def replay(ctx, cols, *, snap=None, served=None, train=None, fit=None, seasons=psb.SEASONS, extra=None):
    """One served row per next-class QB per replayed season k + 1, exactly as run_stage builds it.

    snap: training snapshot frame (default ctx["snap"]); served(done, subj, season) -> done with any
    extra columns; train(tr) -> training rows (default all); fit(X, y, g) -> model (default S3's
    NestedLR); extra: {name: (cols, fit)} scored on the same rows for comparison."""
    ps, e, age0, hit = ctx["ps"], ctx["e"], ctx["age0"], ctx["hit"]
    src = ctx["snap"] if snap is None else snap
    fit = fit or nested
    rows = []
    for season in seasons:
        tr = src[(src.cpos == POS) & src.hit.notna() & (src.outcome_year <= season - src.win) & (src.season <= season - 1)]
        if train is not None:
            tr = train(tr)
        g = tr.draft_year.to_numpy(int)
        models = {"_pd": (fit(tr[cols].to_numpy(float), tr.hit.to_numpy(float), g), cols),
                  "_base": (bpm.make_lr(bpm.C_FIXED).fit(tr[["stars", "stage"]].to_numpy(float), tr.hit.to_numpy(float)),
                            ["stars", "stage"])}
        for k, (c, f) in (extra or {}).items():
            models[k] = (f(tr[c].to_numpy(float), tr.hit.to_numpy(float), g), c)
        cur = ps[ps.season == season].player_id.unique()
        subj = e[(e.cpos == POS) & e.player_id.isin(cur)][["player_id", "hs_class", "weight", "stars"]].copy()
        subj["pos"], subj["dob"] = POS, pd.NaT
        subj["sid"] = "k" + subj.player_id.astype(str)
        subj["cls"] = np.maximum(season + 1, subj.hs_class + 3)
        done = bpm.predraft_profile(subj, ps, age0, season)
        if served is not None:
            done = served(done, subj, season)
        s0 = subj.assign(_pd=np.nan, _pdx=np.nan)
        s = bpm.stage_score(s0, done, {"model": models["_pd"][0], "cols": models["_pd"][1]}, age0, season, "next")
        for k, (m, c) in models.items():
            if k != "_pd":
                s[k] = bpm.stage_score(s0, done, {"model": m, "cols": c}, age0, season, "next")._pd.to_numpy()
        s = s[s._pd.notna()]
        s["y"] = s.player_id.map(hit)
        s = s[s.y.notna()]
        s["first_eligible"] = (season - s.hs_class + 1) == 3
        s["season"] = season
        v = done.loc[s.sid]
        for c in ("starts", "n_qual", "aya_final", "comp_final", "rush_ypg_best", "cur_start", "power"):
            s[f"f_{c}"] = v[c].to_numpy()
        s["f_stage"] = ((season - 1) - s.hs_class + 1).clip(1, 6).to_numpy()
        rows.append(s[["season", "player_id", "sid", "hs_class", "y", "first_eligible", *models, *[c for c in s if c.startswith("f_")]]])
    return pd.concat(rows, ignore_index=True)


def summary(r, col="_pd"):
    return psb.summary(r.y.to_numpy(float), r[col].to_numpy(float))


def top60(r, col="_pd"):
    return r.sort_values(col, ascending=False).groupby("season").head(60)


def report(r, col="_pd"):
    """The fixed gates on all rows, first-eligible rows and D1 top 60, plus the replacement test."""
    fe = r[r.first_eligible]
    out = {"all": summary(r, col), "first_eligible": summary(fe, col), "top60_by_pd": summary(top60(r, col), col)}
    out["pass_all"], out["pass_fe"], out["pass_top60"] = (psb.passes(out["all"]), psb.passes(out["first_eligible"]),
                                                        psb.passes(out["top60_by_pd"]))
    out["pass"] = out["pass_all"] and out["pass_fe"] and out["pass_top60"]
    y = r.y.to_numpy(float)
    out["vs_stars_stage"] = {"base_logloss": bpm.ll(y, r._base.to_numpy(float)), "cand_logloss": bpm.ll(y, r[col].to_numpy(float)),
                             "boot_by_season": bpm.class_bootstrap(y, r._base.to_numpy(float), r[col].to_numpy(float),
                                                                   r.season.to_numpy(int))}
    late = r[r.season >= 2017]
    out["replays_2017_2021"] = {"all": summary(late, col), "first_eligible": summary(late[late.first_eligible], col)}
    uniq = r.groupby("player_id").y.max()
    out["players"], out["players_hit"] = int(len(uniq)), int(uniq.sum())
    out["support"] = support(r, col)
    return out


def _gate_vals(r, col):
    vals = {}
    for name, sub in (("all", r), ("first_eligible", r[r.first_eligible]), ("top60", top60(r, col))):
        y, p = sub.y.to_numpy(float), sub[col].to_numpy(float)
        if y.sum() == 0 or y.sum() == len(y):
            vals[name] = (np.nan, np.nan)
            continue
        vals[name] = (p.mean() / y.mean(), psb.calib(y, p))
    return vals


def support(r, col="_pd", n=1000, seed=7):
    """Season resampling: share of resamples (whole replay seasons, with replacement) in which each gate
    holds. top60 is cut per season first, so resampling seasons keeps D1 intact."""
    rng = np.random.default_rng(seed)
    seasons = np.array(sorted(r.season.unique()))
    by = {s: g for s, g in r.groupby("season")}
    keys = [f"{a}_{b}" for a in ("all", "first_eligible", "top60") for b in ("ratio", "slope")]
    hits = {k: 0 for k in keys + ["every_gate"]}
    for _ in range(n):
        pick = rng.choice(seasons, len(seasons))
        rr = pd.concat([by[s].assign(season=i) for i, s in enumerate(pick)], ignore_index=True)
        v = _gate_vals(rr, col)
        ok_all = True
        for a, (ratio, slope) in v.items():
            okr = psb.RATIO[0] <= ratio <= psb.RATIO[1]
            oks = psb.SLOPE[0] <= slope <= psb.SLOPE[1]
            hits[f"{a}_ratio"] += okr
            hits[f"{a}_slope"] += oks
            ok_all &= okr and oks
        hits["every_gate"] += ok_all
    return {k: v / n for k, v in hits.items()}


def fmt(name, rep):
    a, f, t = rep["all"], rep["first_eligible"], rep["top60_by_pd"]
    v = rep["vs_stars_stage"]
    sp = rep["support"]
    return (f"{name}: all {a.get('ratio', np.nan):.2f}/{a.get('slope', np.nan):.2f} (n={a['n']}, ev={a['events']}) | "
            f"first-eligible {f.get('ratio', np.nan):.2f}/{f.get('slope', np.nan):.2f} (n={f['n']}, ev={f['events']}) | "
            f"top60 {t.get('ratio', np.nan):.2f}/{t.get('slope', np.nan):.2f} | ll {v['base_logloss']:.4f} -> "
            f"{v['cand_logloss']:.4f} ({v['boot_by_season']['p']:.0%}) | support every gate {sp['every_gate']:.0%} | "
            f"{'PASS' if rep['pass'] else 'FAIL'}")


def parity(ctx):
    import prospect_stage as pst
    logged = json.loads((bpm.ROOT / "notes" / "prospect-research" / "experiments" / "serving-backtest.json").read_text(encoding="utf-8"))
    cols = pst.stage_cols(POS)
    r = replay(ctx, cols)
    r.to_parquet(SCRATCH / "rows_S3.parquet")
    rep = report(r)
    want = logged["S3 QB"]
    for k in ("all", "first_eligible", "top60_by_pd"):
        for m in ("n", "events", "ratio", "slope", "logloss"):
            assert abs(rep[k][m] - want[k][m]) < 1e-9, (k, m, rep[k][m], want[k][m])
    assert abs(rep["vs_stars_stage"]["base_logloss"] - want["vs_stars_stage"]["base_logloss"]) < 1e-9
    assert abs(rep["vs_stars_stage"]["boot_by_season"]["p"] - want["vs_stars_stage"]["boot_by_season"]["p"]) < 1e-9
    print(fmt("S3 QB (lane replay)", rep))
    print("parity with experiments/serving-backtest.json 'S3 QB': OK")
    return r, rep


if __name__ == "__main__":
    ctx = load()
    if sys.argv[1:] == ["parity"]:
        parity(ctx)
