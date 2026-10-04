"""TE lane: a lane copy of the addendum 8/9 serving replay (prospect_serving_backtest.run_stage) that
keeps row-level output, so served TE rows can be diagnosed and lane candidates scored on the exact
same rows. Shared modules are imported read-only; nothing here writes the store or experiments/.

    PROSPECT_DB=<lane copy> python projections/lanes/te/te_replay.py cache    # build the pickled inputs
    PROSPECT_DB=<lane copy> python projections/lanes/te/te_replay.py check    # reproduce S3 / S4n4 TE

The cache holds, for TE and WR: the career-stage snapshots with live first-4-game features (training
rows) and, per replayed season 2012-2021, the served next-class profiles exactly as run_stage builds
them (predraft_profile through season - 1, live line from season's first 4 team games).
"""
from __future__ import annotations

import os
import pathlib
import pickle
import sys
import warnings

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
PROJ = HERE.parents[1]
sys.path.insert(0, str(PROJ))
assert os.environ.get("PROSPECT_DB"), "set PROSPECT_DB to the lane copy of the store"
import build_prospect_model as bpm  # noqa: E402
import prospect_serving_backtest as psb  # noqa: E402

SCRATCH = pathlib.Path(os.environ.get("TE_LANE_SCRATCH", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-te"))
CACHE = SCRATCH / "te_cache.pkl"
psb.OUT = SCRATCH / "serving-backtest-lane.json"   # never the shared experiments file
SEASONS = list(psb.SEASONS)
N_LIVE = 4


def build_cache(positions=("TE", "WR")):
    warnings.filterwarnings("ignore")
    import prospect_live as pl
    import prospect_population as pp
    import prospect_stage as pst
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    e = pp.build(ps, bio, d, t, age0, bpm._CON, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    snap = pst.snapshots(e, ps, age0, bpm._CON)
    live = pl.live_features(bpm._CON, N_LIVE)
    key = pd.MultiIndex.from_arrays([snap.season.astype(int) + 1, snap.player_id.astype("Int64")])
    snap = snap.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=pl.LIVE, index=snap.index))
    snap["has_live"] = snap.has_live.fillna(0.0)
    snap = snap[snap.cpos.isin(positions)].reset_index(drop=True)
    er = e.drop_duplicates("player_id").set_index("player_id")
    served = {}
    for pos in positions:
        for season in SEASONS:
            cur = ps[ps.season == season].player_id.unique()
            subj = e[(e.cpos == pos) & e.player_id.isin(cur)][["player_id", "hs_class", "weight", "stars"]].copy()
            subj["pos"], subj["dob"] = pos, pd.NaT
            subj["sid"] = "k" + subj.player_id.astype(str)
            subj["cls"] = np.maximum(season + 1, subj.hs_class + 3)
            done = bpm.predraft_profile(subj, ps, age0, season)
            lv = live.reindex(pd.MultiIndex.from_arrays([np.full(len(done), season),
                                                         subj.set_index("sid").loc[done.index].player_id.astype("Int64")]))
            done = done.join(pd.DataFrame(lv.to_numpy(), columns=pl.LIVE, index=done.index))
            done["has_live"] = done.has_live.fillna(0.0)
            served[(pos, season)] = (subj, done)
    out = {"snap": snap, "served": served, "age0": age0, "hit": er.hit, "drafted": er.drafted, "pick": er.pick,
           "pos_label": er.pos, "name": er.name_final if "name_final" in er else None, "exit": er.exit,
           "hs_class": er.hs_class, "draft_year": er.draft_year, "stage_cols": {p: __import__("prospect_stage").stage_cols(p) for p in positions},
           "live_cols": list(pl.LIVE)}
    CACHE.write_bytes(pickle.dumps(out))
    print(f"cache: {len(snap):,} snapshot rows ({snap.cpos.value_counts().to_dict()}), {len(served)} served frames -> {CACHE}")


def load():
    return pickle.loads(CACHE.read_bytes())


def serve_rows(c, pos, season, cols, model_predict):
    """Score the next class of `season` exactly as run_stage does (bpm.stage_score, which='next')."""
    subj, done = c["served"][(pos, season)]

    class _M:   # adapter: stage_score calls model.predict_proba(X)
        def predict_proba(self, X):
            p = model_predict(X)
            return np.column_stack([1 - p, p])
    s = bpm.stage_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, {"model": _M(), "cols": cols}, c["age0"], season, "next")
    s = s[s._pd.notna()].copy()
    s["y"] = s.player_id.map(c["hit"])
    s = s[s.y.notna()]
    s["first_eligible"] = (season - s.hs_class + 1) == 3
    s["season"] = season
    v = done.loc[s.sid].copy()
    v["stage"] = ((season - 1) - v.hs_class + 1).clip(1, 6)
    v["age_k"] = c["age0"] + (season - 1) - v.hs_class
    return s, v


def train_rows(c, pos, season, src=None):
    src = c["snap"] if src is None else src
    return src[(src.cpos == pos) & src.hit.notna() & (src.outcome_year <= season - src.win) & (src.season <= season - 1)]


def replay(c, pos, fit, cols, train_filter=None, train_src=None, extra=None):
    """fit(tr_frame, cols) -> predict(X) on served X (cols order). Returns row frame with _pd and _base."""
    rows = []
    for season in SEASONS:
        tr = train_rows(c, pos, season, train_src)
        if train_filter is not None:
            tr = train_filter(tr)
        pred = fit(tr, cols, season)
        base = bpm.make_lr(bpm.C_FIXED).fit(tr[tr.cpos == pos][["stars", "stage"]].to_numpy(float),
                                            tr[tr.cpos == pos].hit.to_numpy(float))
        s, v = serve_rows(c, pos, season, cols, pred)
        s["_base"] = base.predict_proba(v[["stars", "stage"]].to_numpy(float))[:, 1]
        for k in ("stage", "age_k", "n_qual", "has_live", "live_rec_share", "live_yptpa", "ryptpa_best", "dom_best", "stars", "weight"):
            if k in v:
                s[k] = v[k].to_numpy()
        rows.append(s[["season", "player_id", "_pd", "_base", "y", "first_eligible", "hs_class", "stage", "age_k", "n_qual",
                       "has_live", "live_rec_share", "live_yptpa", "ryptpa_best", "dom_best", "stars", "weight"]])
    return pd.concat(rows, ignore_index=True)


def gates(r, col="_pd"):
    """All rows, first-eligible rows and display rule D1 (each season's top 60 by own forecast)."""
    y, p = r.y.to_numpy(float), r[col].to_numpy(float)
    fe = r[r.first_eligible]
    top = r.sort_values(col, ascending=False).groupby("season").head(60)
    out = {"all": psb.summary(y, p), "first_eligible": psb.summary(fe.y.to_numpy(float), fe[col].to_numpy(float)),
           "top60": psb.summary(top.y.to_numpy(float), top[col].to_numpy(float))}
    out["pass"] = all(psb.passes(out[k]) for k in ("all", "first_eligible", "top60"))
    return out


# ---------------------------------------------------------------- reference models (shared code, not lane candidates)

def fit_nested(tr, cols, season):
    import prospect_experiments_b as peb
    m = peb.NestedLR().fit(tr[cols].to_numpy(float), tr.hit.to_numpy(float), tr.draft_year.to_numpy(int))
    return lambda X: m.predict_proba(X)[:, 1]


def check():
    c = load()
    cols3 = c["stage_cols"]["TE"]
    r3 = replay(c, "TE", fit_nested, cols3)
    g3 = gates(r3)
    r4 = replay(c, "TE", fit_nested, cols3 + c["live_cols"])
    g4 = gates(r4)
    for name, g in (("S3", g3), ("S4n4", g4)):
        print(name, {k: (g[k]["n"], g[k]["events"], round(g[k]["ratio"], 4), round(g[k]["slope"], 4)) for k in ("all", "first_eligible", "top60")})
    print("published S3 TE: all 1.3114/0.6768, fe 0.8300/0.7771, top60 1.2699/0.5940")
    print("published S4n4 TE: all 1.3919/0.7336, fe 0.8690/0.9429, top60 1.3553/0.6545")
    r4.to_pickle(SCRATCH / "rows_s4n4_te.pkl")
    r3.to_pickle(SCRATCH / "rows_s3_te.pkl")


if __name__ == "__main__":
    {"cache": build_cache, "check": check}[sys.argv[1]]()
