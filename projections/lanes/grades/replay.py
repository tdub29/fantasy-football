"""Grades lane: the ESPN recruit grade (R5) against the shipped next-class models, WR S6n4 and RB S4n4.

Same replay as the features lane (`projections/lanes/features/replay.py`, a lane copy of
`prospect_serving_backtest.run_stage` restricted to the shipped kinds), with the grade from `espn_grade.py`:

  Ga (fill):           `stars` -> `stars_a` = 247 stars, else the ESPN grade mapped to the star scale by an
                       isotonic fit of 247 stars on ESPN grade (refit inside each replay's training rows), plus
                       `rec_missing` = 1 where `stars_a` is still empty.
  Gb (second opinion): shipped columns + `espn_grade` + `espn_missing`.

    PROSPECT_DB=<lane copy> python projections/lanes/grades/replay.py --coverage    # reads no outcome
    PROSPECT_DB=<lane copy> python projections/lanes/grades/replay.py WR RB         # score Ga, Gb
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import warnings
from collections import Counter

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
import build_prospect_model as bpm  # noqa: E402
import prospect_serving_backtest as psb  # noqa: E402

NOTES = HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "grades"
psb.OUT = NOTES / "serving-backtest-lane.json"          # never the shared experiments file
import importlib.util  # noqa: E402
_sp = importlib.util.spec_from_file_location("features_replay", HERE.parent / "features" / "replay.py")
sys.path.insert(0, str(HERE.parent / "features"))   # its lane_feats import
fr = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(fr)   # features lane: fit, nll, gates, concentration; it resets psb.OUT, so set again
psb.OUT = NOTES / "serving-backtest-lane.json"
SCRATCH = pathlib.Path(os.environ.get("LANE_GRADES_TMP", r"C:\Users\TrevorWhite\.claude\jobs\ea66a469\tmp\grades"))
SHIPPED = {"WR": "S6n4", "RB": "S4n4"}
NB = 200_000
EG = ["espn_grade", "espn_join"]


def grades():
    g = pd.read_parquet(SCRATCH / "espn_grade.parquet")
    return g.set_index("player_id")


def build(positions):
    warnings.filterwarnings("ignore")
    import prospect_live as pl
    import prospect_population as pp
    import prospect_stage as pst
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    e = pp.build(ps, bio, d, t, age0, con, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    g = grades()
    e = e.assign(espn_grade=e.player_id.map(g.espn_grade), espn_join=e.player_id.map(g["join"]))
    snap = pst.snapshots(e, ps, age0, con)
    live = pl.live_features(con, 4)
    key = pd.MultiIndex.from_arrays([snap.season.astype(int) + 1, snap.player_id.astype("Int64")])
    snap = snap.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=pl.LIVE, index=snap.index))
    snap["has_live"] = snap.has_live.fillna(0.0)
    snap = snap.assign(espn_grade=snap.player_id.map(g.espn_grade), espn_join=snap.player_id.map(g["join"]))
    snaps = {pos: snap[snap.cpos == pos].copy() for pos in positions}
    return ps, e, age0, live, snaps, pst, pl


def served(pos, season, ps, e, age0, live, pl):
    """The served profile for the next class in `season`, as run_stage builds it, plus the ESPN grade."""
    cur = ps[ps.season == season].player_id.unique()
    subj = e[(e.cpos == pos) & e.player_id.isin(cur)][["player_id", "hs_class", "weight", "stars"]].copy()
    subj["pos"], subj["dob"] = pos, pd.NaT
    subj["sid"] = "k" + subj.player_id.astype(str)
    subj["cls"] = np.maximum(season + 1, subj.hs_class + 3)
    done = bpm.predraft_profile(subj, ps, age0, season)
    pid = subj.set_index("sid").loc[done.index].player_id
    lv = live.reindex(pd.MultiIndex.from_arrays([np.full(len(done), season), pid.astype("Int64")]))
    done = done.join(pd.DataFrame(lv.to_numpy(), columns=pl.LIVE, index=done.index))
    done["has_live"] = done.has_live.fillna(0.0)
    g = grades()
    done["espn_grade"] = pid.map(g.espn_grade).to_numpy()
    done["espn_join"] = pid.map(g["join"]).to_numpy()
    return subj, done


def star_map(tr):
    """Isotonic 247-stars-on-ESPN-grade map from training players with both. No outcome is read."""
    from sklearn.isotonic import IsotonicRegression
    b = tr.drop_duplicates("player_id")
    b = b[b.stars.notna() & b.espn_grade.notna()]
    return IsotonicRegression(out_of_bounds="clip").fit(b.espn_grade.to_numpy(float), b.stars.to_numpy(float))


def add_forms(df, iso):
    df = df.copy()
    has = df.espn_grade.notna()
    fill = pd.Series(np.nan, index=df.index)
    if has.any():
        fill[has] = iso.predict(df.espn_grade[has].to_numpy(float))
    df["stars_a"] = df.stars.fillna(fill)
    df["rec_missing"] = df.stars_a.isna().astype(float)
    df["espn_missing"] = (~has).astype(float)
    return df


def specs(base):
    return {"Ga": [("stars_a" if c == "stars" else c) for c in base] + ["rec_missing"],
            "Gb": base + ["espn_grade", "espn_missing"]}


def _rate(s):
    return round(float(s.mean()), 3) if len(s) else None


def _cov(df, by):
    gg = df.groupby(by)
    return {str(k): {"rows": int(len(x)), "espn": _rate(x.espn_grade.notna()), "stars247": _rate(x.stars.notna()),
                     "either": _rate(x.espn_grade.notna() | x.stars.notna()),
                     "espn_fills_247_null": int((x.espn_grade.notna() & x.stars.isna()).sum()),
                     "join_id": int(x.espn_join.eq("id").sum()), "join_fallback": int(x.espn_join.eq("fallback").sum())}
            for k, x in gg}


def raw_audit():
    """What the ESPN records carry: top-level keys, status, class-year coverage. Looks for post-recruitment fields."""
    import recruits_measure as rm  # packages lane loader (path set by espn_grade import)
    keys, akeys, attrs, status = Counter(), Counter(), Counter(), Counter()
    for y in range(2006, 2027):
        for line in (rm.SCR / "espn_recruits" / f"raw_{y}.jsonl").open(encoding="utf-8"):
            r = json.loads(line)
            keys.update(r.keys())
            akeys.update((r.get("athlete") or {}).keys())
            attrs.update(x.get("name") for x in r.get("attributes") or [])
            status[(r.get("status") or {}).get("description")] += 1
    return {"top_keys": dict(keys), "athlete_keys": dict(akeys), "attributes": dict(attrs), "status": dict(status)}


def coverage():
    sys.path.insert(0, str(HERE))
    import espn_grade  # noqa: F401  (puts the packages lane on sys.path)
    pos4 = ["WR", "RB", "TE", "QB"]
    ps, e, age0, live, snaps, pst, pl = build(pos4)
    out = {"raw_audit": raw_audit()}
    eb = e[e.player_id > 0].drop_duplicates("player_id")
    out["population_by_class"] = _cov(eb, "hs_class")
    out["population_by_pos"] = _cov(eb, "cpos")
    out["population_by_pos_class"] = {p: _cov(eb[eb.cpos == p], "hs_class") for p in pos4}
    g = grades()
    out["linked_ids_by_class_join"] = {str(k): v for k, v in g.groupby(["rclass_espn", "join"]).size().unstack(fill_value=0).to_dict("index").items()}
    out["served"] = {}
    for pos in ("WR", "RB"):
        sp = snaps[pos]
        trn = _cov(sp, "season")
        frames = []
        for season in list(psb.SEASONS) + [int(ps.season.max())]:
            subj, done = served(pos, season, ps, e, age0, live, pl)
            done = done[(done.n_qual >= 1) & subj.set_index("sid").cls.reindex(done.index).eq(season + 1)]
            frames.append(done.assign(season=season))
        sv = pd.concat(frames)
        out["served"][pos] = {"training_snapshots_by_season": trn, "served_next_class_by_season": _cov(sv, "season"),
                              "served_replay_all": _cov(sv[sv.season <= 2021].assign(k=0), "k")["0"],
                              "training_all": _cov(sp.assign(k=0), "k")["0"]}
        print(pos, json.dumps(out["served"][pos]["served_next_class_by_season"], indent=0), flush=True)
    NOTES.mkdir(parents=True, exist_ok=True)
    (NOTES / "coverage.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    print(json.dumps(out["population_by_class"], indent=0))


def calib_int(y, p):
    from sklearn.linear_model import LogisticRegression
    m = LogisticRegression(penalty=None, max_iter=1000).fit(bpm.logit(p).reshape(-1, 1), y)
    return float(m.intercept_[0])


def school(r, gain):
    """Gain by school of his last pre-draft season: top schools' share of total gain."""
    s = pd.Series(gain, index=r.index).groupby(r.school).agg(["sum", "size"]).sort_values("sum", ascending=False)
    tot = float(gain.sum())
    return {"total_gain": tot, "top5": [{"school": str(k), "gain_sum": float(v["sum"]), "rows": int(v["size"])} for k, v in s.head(5).iterrows()],
            "gain_without_top1_school": float(gain[r.school.ne(s.index[0]).to_numpy()].mean()) if len(s) else None}


def score(positions):
    import prospect_experiments_b as peb
    from sklearn.metrics import roc_auc_score
    ps, e, age0, live, snaps, pst, pl = build(positions)
    hit = e.drop_duplicates("player_id").set_index("player_id").hit
    drafted = e.drop_duplicates("player_id").set_index("player_id").drafted
    last_team = ps.sort_values("season").drop_duplicates("player_id", keep="last").set_index("player_id")
    res = {}
    for pos in positions:
        kind = SHIPPED[pos]
        base = pst.stage_cols(pos) + pl.LIVE
        assert "stars" in base
        sp_ = specs(base)
        allspec = {kind: base, **sp_}
        sp = snaps[pos]
        rows = []
        for season in psb.SEASONS:
            tr = sp[sp.hit.notna() & (sp.outcome_year <= season - sp.win) & (sp.season <= season - 1)]
            iso = star_map(tr)
            tr = add_forms(tr, iso)
            y, g = tr.hit.to_numpy(float), tr.draft_year.to_numpy(int)
            shaped = ((tr.stage >= 2) & tr.plays_next).to_numpy()
            subj, done = served(pos, season, ps, e, age0, live, pl)
            done = add_forms(done, iso)
            frame = None
            for cid, cols in allspec.items():
                m = fr.fit(kind, tr[cols].to_numpy(float), y, g, shaped, cols.index("stage"))
                s = bpm.stage_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, {"model": m, "cols": cols}, age0, season, "next")
                if frame is None:
                    frame = s[["sid", "player_id", "hs_class"]].copy()
                frame[cid] = s._pd.to_numpy()
            frame = frame[frame[kind].notna()]
            frame["y"] = frame.player_id.map(hit)
            frame = frame[frame.y.notna()]
            frame["first_eligible"] = (season - frame.hs_class + 1) == 3
            frame["season"] = season
            for c in ("espn_grade", "espn_join", "stars", "stars_a"):
                frame[c] = done[c].reindex(frame.sid).to_numpy()
            rows.append(frame)
            print(f"{pos} {season}: train {len(tr):,} rows, served {len(frame):,}, events {int(frame.y.sum())}", flush=True)
        r = pd.concat(rows).reset_index(drop=True)
        tcol = "team" if "team" in last_team.columns else ("team_id" if "team_id" in last_team.columns else None)
        r["school"] = r.player_id.map(last_team[tcol]).astype(str) if tcol else "na"
        r.to_parquet(SCRATCH / f"replay_rows_{pos}.parquet")
        y, sea, fe = r.y.to_numpy(float), r.season.to_numpy(int), r.first_eligible.to_numpy(bool)
        dr = r.player_id.map(drafted).eq(1).to_numpy()
        ps_ = r[kind].to_numpy(float)

        def block(p):
            gt = fr.gates(y, p, sea, fe)
            top = r.assign(p=p).sort_values("p", ascending=False).groupby("season").head(60)
            gt["intercepts"] = {"all": calib_int(y, p), "first_eligible": calib_int(y[fe], p[fe]),
                                "top60_by_own": calib_int(top.y.to_numpy(float), top.p.to_numpy(float))}
            return {"gates": gt, "logloss": bpm.ll(y, p), "auc": float(roc_auc_score(y, p)),
                    "drafted_auc": float(roc_auc_score(y[dr], p[dr])),
                    "logloss_fe": bpm.ll(y[fe], p[fe])}
        out = {"shipped": kind, "n": int(len(r)), "events": int(y.sum()), "players": int(r.player_id.nunique()),
               "served_espn_rate": float(r.espn_grade.notna().mean()), "served_fill_rows": int((r.espn_grade.notna() & r.stars.isna()).sum()),
               kind: block(ps_)}
        for cid in sp_:
            pc = r[cid].to_numpy(float)
            b = fr.bpm.class_bootstrap(y, ps_, pc, sea, n=NB)
            blk = block(pc)
            conc = fr.concentration(y, ps_, pc, sea)
            gain = fr.nll(y, ps_) - fr.nll(y, pc)
            loso = {int(s): float(gain[sea != s].mean()) for s in np.unique(sea)}
            rep = b["p"] >= 0.95
            conc_ok = conc["drop_top3"]["mean_gain"] > 0 and conc["drop_top5"]["mean_gain"] > 0
            fragile = conc["drop_top5"]["boot_p"] < 0.90 or min(loso.values()) < 0
            verdict = ("fragile" if fragile else "pass") if (blk["gates"]["pass"] and rep and conc_ok) else "fail"
            fill = (r.espn_grade.notna() & r.stars.isna()).to_numpy()
            out[cid] = {"columns": sp_[cid], **blk,
                        "vs_shipped": {"shipped_logloss": bpm.ll(y, ps_), "cand_logloss": bpm.ll(y, pc), "boot_by_season": b, "pass_95": bool(rep)},
                        "concentration": conc, "concentration_pass": bool(conc_ok), "loso_gain": loso,
                        "school": school(r, gain), "gain_on_fill_rows": {"rows": int(fill.sum()), "sum": float(gain[fill].sum()),
                                                                       "rest_sum": float(gain[~fill].sum())},
                        "logit_corr_with_shipped": float(np.corrcoef(bpm.logit(ps_), bpm.logit(pc))[0, 1]),
                        "verdict": verdict}
            gg = blk["gates"]
            print(f"{cid} {pos}: all {gg['all']['ratio']:.2f}/{gg['all']['slope']:.2f} fe {gg['first_eligible']['ratio']:.2f}/"
                  f"{gg['first_eligible']['slope']:.2f} D1 {gg['top60_by_own']['ratio']:.2f}/{gg['top60_by_own']['slope']:.2f} | "
                  f"ll {bpm.ll(y, ps_):.4f} -> {bpm.ll(y, pc):.4f}, boot {b['p']:.4f} | drop3 {conc['drop_top3']['mean_gain']:+.5f} "
                  f"drop5 {conc['drop_top5']['mean_gain']:+.5f} | {verdict}", flush=True)
        sg = out[kind]["gates"]
        print(f"{kind} {pos} (shipped, lane replay): n {out['n']} ev {out['events']} all {sg['all']['ratio']:.2f}/{sg['all']['slope']:.2f} fe "
              f"{sg['first_eligible']['ratio']:.2f}/{sg['first_eligible']['slope']:.2f} D1 {sg['top60_by_own']['ratio']:.2f}/"
              f"{sg['top60_by_own']['slope']:.2f} ll {out[kind]['logloss']:.4f}", flush=True)
        res[pos] = out
    p = NOTES / "results.json"
    book = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    book.setdefault("replay", {}).update(res)
    p.write_text(json.dumps(book, indent=1, default=float), encoding="utf-8")
    return res


def _check():
    t = pd.DataFrame({"player_id": [1, 2, 3, 4], "stars": [2.0, np.nan, 4.0, np.nan], "espn_grade": [60.0, 80.0, 85.0, np.nan]})
    from sklearn.isotonic import IsotonicRegression
    iso = IsotonicRegression(out_of_bounds="clip").fit([60, 85], [2, 4])
    f = add_forms(t, iso)
    assert f.stars_a.tolist()[:3] == [2.0, 3.6, 4.0] and np.isnan(f.stars_a[3])
    assert f.rec_missing.tolist() == [0, 0, 0, 1] and f.espn_missing.tolist() == [0, 0, 0, 1]
    s = specs(["a", "stars", "stage"])
    assert s["Ga"] == ["a", "stars_a", "stage", "rec_missing"] and s["Gb"][-2:] == ["espn_grade", "espn_missing"]


if __name__ == "__main__":
    _check()
    a = sys.argv[1:]
    if a and a[0] == "--check":
        print("ok")
    elif a and a[0] == "--coverage":
        coverage()
    else:
        score(a or ["WR", "RB"])
