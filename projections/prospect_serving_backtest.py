"""Serving backtest (charter v2 addendum 8): replay the exact served pre-draft code path on past
seasons and check it against what really happened.

For each completed college season k (2011-2020), as of the k + 1 season: refit a pre-draft model on
population B rows whose outcome window had closed (outcome draft year <= k + 1 - window), build every
then-current player's profile from his completed seasons with `predraft_profile`, score the next draft
class with `predraft_score`, and compare with his eventual outcome. A model passes when calibration
slope is 0.75-1.25 and mean predicted / observed is 0.8-1.25, overall and for first-eligible players
(college year 3 at k + 1).

    python projections/prospect_serving_backtest.py                  # the shipped PREDRAFT models
    python projections/prospect_serving_backtest.py QB=B12 RB=B10    # any registered candidate
"""
from __future__ import annotations

import json
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402

SEASONS = range(2012, 2022)          # the k + 1 season being replayed (k = 2011-2020)
SLOPE, RATIO = (0.75, 1.25), (0.8, 1.25)
OUT = bpm.ROOT / "notes" / "prospect-research" / "experiments" / "serving-backtest.json"


def calib(y, p):
    from sklearn.linear_model import LogisticRegression
    lg = bpm.logit(p).reshape(-1, 1)
    return float(LogisticRegression(penalty=None, max_iter=1000).fit(lg, y).coef_[0][0])


def summary(y, p):
    if len(y) == 0 or y.sum() == 0:
        return {"n": int(len(y)), "events": int(y.sum())}
    return {"n": int(len(y)), "events": int(y.sum()), "mean_pred": float(p.mean()), "obs": float(y.mean()),
            "ratio": float(p.mean() / y.mean()), "slope": calib(y, p), "logloss": bpm.ll(y, p)}


def passes(x):
    return ("slope" in x and SLOPE[0] <= x["slope"] <= SLOPE[1] and RATIO[0] <= x["ratio"] <= RATIO[1])


def run_stage(spec: dict, say=print):
    """Addendum 9: S1 (B14 rows, every stage) and S2 (served-shaped rows: college year 2+ and playing
    the next season), refit per replayed season, served to the next class by `stage_score`."""
    warnings.filterwarnings("ignore")
    import prospect_population as pp
    import prospect_stage as pst
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    e = pp.build(ps, bio, d, t, age0, bpm._CON, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    snap = pst.snapshots(e, ps, age0, bpm._CON)
    hit = e.drop_duplicates("player_id").set_index("player_id").hit
    out = {}
    import prospect_live as pl
    lives = {}
    for pos, cid in spec.items():
        cols = pst.stage_cols(pos)
        live = None
        if cid.startswith("S4"):   # addendum 12: live features from the first n games of the next season
            n = int(cid[3:])
            live = lives.setdefault(n, pl.live_features(bpm._CON, n))
            key = pd.MultiIndex.from_arrays([snap.season.astype(int) + 1, snap.player_id.astype("Int64")])
            snap_l = snap.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=pl.LIVE, index=snap.index))
            snap_l["has_live"] = snap_l.has_live.fillna(0.0)
            cols_s3 = cols
            cols = cols + pl.LIVE
        rows = []
        src = snap_l if live is not None else snap
        for season in SEASONS:
            tr = src[(src.cpos == pos) & src.hit.notna() & (src.outcome_year <= season - src.win) & (src.season <= season - 1)]
            if cid == "S2":
                tr = tr[(tr.stage >= 2) & tr.plays_next]
            if cid == "S3" or cid.startswith("S4"):   # addenda 11-12: C by inner leave-one-class-out on this replay's rows
                import prospect_experiments_b as peb
                model = peb.NestedLR().fit(tr[cols].to_numpy(float), tr.hit.to_numpy(float), tr.draft_year.to_numpy(int))
                if live is not None:
                    m3 = peb.NestedLR().fit(tr[cols_s3].to_numpy(float), tr.hit.to_numpy(float), tr.draft_year.to_numpy(int))
            else:
                model = bpm.make_lr(bpm.C_FIXED).fit(tr[cols].to_numpy(float), tr.hit.to_numpy(float))
            base = bpm.make_lr(bpm.C_FIXED).fit(tr[["stars", "stage"]].to_numpy(float), tr.hit.to_numpy(float))
            cur = ps[ps.season == season].player_id.unique()
            subj = e[(e.cpos == pos) & e.player_id.isin(cur)][["player_id", "hs_class", "weight", "stars"]].copy()
            subj["pos"], subj["dob"] = pos, pd.NaT
            subj["sid"] = "k" + subj.player_id.astype(str)
            subj["cls"] = np.maximum(season + 1, subj.hs_class + 3)
            done = bpm.predraft_profile(subj, ps, age0, season)
            if live is not None:
                lv = live.reindex(pd.MultiIndex.from_arrays([np.full(len(done), season), subj.set_index("sid").loc[done.index].player_id.astype("Int64")]))
                done = done.join(pd.DataFrame(lv.to_numpy(), columns=pl.LIVE, index=done.index))
                done["has_live"] = done.has_live.fillna(0.0)
            s = bpm.stage_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, {"model": model, "cols": cols}, age0, season, "next")
            if live is not None:
                s["_s3"] = bpm.stage_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, {"model": m3, "cols": cols_s3}, age0, season,
                                           "next")._pd.to_numpy()
            s["_base"] = bpm.stage_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, {"model": base, "cols": ["stars", "stage"]},
                                         age0, season, "next")._pd.to_numpy()
            s = s[s._pd.notna()]
            s["y"] = s.player_id.map(hit)
            s = s[s.y.notna()]
            s["first_eligible"] = (season - s.hs_class + 1) == 3
            s["season"] = season
            rows.append(s[["season", "player_id", "_pd", "_base", "y", "first_eligible"] + (["_s3"] if live is not None else [])])
        r = pd.concat(rows)
        from sklearn.metrics import roc_auc_score
        y_, pc, pb = r.y.to_numpy(float), r._pd.to_numpy(float), r._base.to_numpy(float)
        boot = bpm.class_bootstrap(y_, pb, pc, r.season.to_numpy(int))
        dr = r.player_id.map(e.drop_duplicates("player_id").set_index("player_id").drafted).eq(1).to_numpy()
        vs = {"base_logloss": bpm.ll(y_, pb), "cand_logloss": bpm.ll(y_, pc), "base_auc": float(roc_auc_score(y_, pb)),
              "cand_auc": float(roc_auc_score(y_, pc)), "boot_by_season": boot,
              # how much of the edge survives among players who were drafted (who gets drafted is most of it)
              "drafted_base_auc": float(roc_auc_score(y_[dr], pb[dr])), "drafted_cand_auc": float(roc_auc_score(y_[dr], pc[dr]))}
        fe = r[r.first_eligible]
        allr, fer = summary(r.y.to_numpy(float), r._pd.to_numpy(float)), summary(fe.y.to_numpy(float), fe._pd.to_numpy(float))
        ok = passes(allr) and passes(fer)
        top = r.sort_values("_pd", ascending=False).groupby("season").head(60)          # display rule D1
        topr = summary(top.y.to_numpy(float), top._pd.to_numpy(float))
        late = r[r.season >= 2017]
        later = {"all": summary(late.y.to_numpy(float), late._pd.to_numpy(float)),
                 "first_eligible": summary(late[late.first_eligible].y.to_numpy(float), late[late.first_eligible]._pd.to_numpy(float))}
        uniq = r.groupby("player_id").y.max()
        if live is not None:   # addendum 12 replacement test: S4 against S3 on the same served rows
            vs["vs_s3"] = {"s3_logloss": bpm.ll(y_, r._s3.to_numpy(float)),
                           "boot_by_season": bpm.class_bootstrap(y_, r._s3.to_numpy(float), pc, r.season.to_numpy(int))}
            say(f"{cid} {pos}: vs S3 on the same rows: {vs['vs_s3']['s3_logloss']:.4f} -> {bpm.ll(y_, pc):.4f}, "
                f"season bootstrap {vs['vs_s3']['boot_by_season']['p']:.0%}")
        out[f"{cid} {pos}"] = {"all": allr, "first_eligible": fer, "pass": ok, "vs_stars_stage": vs,
                               "top60_by_pd": topr, "top60_pass": passes(topr), "replays_2017_2021": later,
                               "players": int(len(uniq)), "players_hit": int(uniq.sum())}
        say(f"{cid} {pos}: D1 top 60 by pd: n={topr['n']} events={topr['events']} ratio {topr.get('ratio', float('nan')):.2f} "
            f"slope {topr.get('slope', float('nan')):.2f} -> {'PASS' if passes(topr) else 'FAIL'} | 2017-2021 ratio "
            f"{later['all'].get('ratio', float('nan')):.2f} slope {later['all'].get('slope', float('nan')):.2f}, first-eligible "
            f"{later['first_eligible'].get('ratio', float('nan')):.2f} | {len(uniq)} players, {int(uniq.sum())} hit")
        say(f"{cid} {pos}: vs stars+stage served the same way: log loss {vs['base_logloss']:.4f} -> {vs['cand_logloss']:.4f}, "
            f"AUC {vs['base_auc']:.3f} -> {vs['cand_auc']:.3f}, season bootstrap {boot['p']:.0%}")
        say(f"{cid} {pos}: all n={allr['n']} events={allr['events']} ratio {allr.get('ratio', float('nan')):.2f} "
            f"slope {allr.get('slope', float('nan')):.2f} ll {allr.get('logloss', float('nan')):.4f} | first-eligible "
            f"n={fer['n']} events={fer['events']} ratio {fer.get('ratio', float('nan')):.2f} slope {fer.get('slope', float('nan')):.2f} "
            f"| {'PASS' if ok else 'FAIL'}")
    book = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    book.update(out)
    OUT.write_text(json.dumps(book, indent=1), encoding="utf-8")
    return out


def run(spec: dict, say=print):
    warnings.filterwarnings("ignore")
    import prospect_experiments_b as peb
    import prospect_population as pp
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    e = pp.build(ps, bio, d, t, age0, bpm._CON, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    e = e.join(bpm.context_features(e, ps), on="sid")
    hit = e.drop_duplicates("player_id").set_index("player_id").hit
    exp = bpm.ROOT / "notes" / "prospect-research" / "experiments"
    out = {}
    for pos, cid in spec.items():
        rec = json.loads((exp / f"{cid}.json").read_text(encoding="utf-8"))
        cols = rec["results"][pos]["cols"]
        rows = []
        for season in SEASONS:
            tr = e[(e.cpos == pos) & e.hit.notna() & (e.outcome_year <= season - e.win)]
            X, y = tr[cols].to_numpy(float), tr.hit.to_numpy(float)
            model = (peb.NestedLR().fit(X, y, tr.draft_year.to_numpy(int)) if cid in ("B5", "B9", "B12")
                     else bpm.make_lr(bpm.C_FIXED).fit(X, y))
            cur = ps[ps.season == season].player_id.unique()
            subj = e[(e.cpos == pos) & e.player_id.isin(cur)][["player_id", "hs_class", "weight", "stars"]].copy()
            subj["pos"], subj["dob"] = pos, pd.NaT
            subj["sid"] = "k" + subj.player_id.astype(str)
            subj["cls"] = np.maximum(season + 1, subj.hs_class + 3)
            done = bpm.predraft_profile(subj, ps, age0, season)
            pre = {"model": model, "cols": cols}
            s = bpm.predraft_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, pre, age0, season)
            for ex in (3, 4):   # diagnostics: each exit alone
                s[f"_p{ex}"] = bpm.predraft_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, pre, age0, season, (ex,))._pd.to_numpy()
            # diagnostic: the same model on his real exit row (what the forward folds score)
            er = e.drop_duplicates("player_id").set_index("player_id")
            s["_oracle"] = model.predict_proba(er.loc[s.player_id, cols].to_numpy(float))[:, 1]
            s = s[s._pd.notna()]
            s["y"] = s.player_id.map(hit)
            s = s[s.y.notna()]
            s["first_eligible"] = (season - s.hs_class + 1) == 3
            s["season"] = season
            rows.append(s[["season", "player_id", "_pd", "_p3", "_p4", "_oracle", "y", "first_eligible"]])
        r = pd.concat(rows)
        allr = summary(r.y.to_numpy(float), r._pd.to_numpy(float))
        fe = r[r.first_eligible]
        fer = summary(fe.y.to_numpy(float), fe._pd.to_numpy(float))
        ok = passes(allr) and passes(fer)
        diag = {k: {"all": summary(r.y.to_numpy(float), r[k].to_numpy(float)),
                    "first_eligible": summary(fe.y.to_numpy(float), fe[k].to_numpy(float))} for k in ("_p3", "_p4", "_oracle")}
        out[f"{cid} {pos}"] = {"all": allr, "first_eligible": fer, "pass": ok, "diagnostics": diag}
        for k, v in diag.items():
            say(f"   {k}: all ratio {v['all'].get('ratio', float('nan')):.2f} slope {v['all'].get('slope', float('nan')):.2f} | "
                f"first-eligible ratio {v['first_eligible'].get('ratio', float('nan')):.2f} slope {v['first_eligible'].get('slope', float('nan')):.2f}")
        say(f"{cid} {pos}: all n={allr['n']} events={allr['events']} ratio {allr.get('ratio', float('nan')):.2f} "
            f"slope {allr.get('slope', float('nan')):.2f} | first-eligible n={fer['n']} events={fer['events']} "
            f"ratio {fer.get('ratio', float('nan')):.2f} slope {fer.get('slope', float('nan')):.2f} | {'PASS' if ok else 'FAIL'}")
    book = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    book.update(out)
    OUT.write_text(json.dumps(book, indent=1), encoding="utf-8")
    return out


def main():
    spec = dict(a.split("=") for a in sys.argv[1:]) or dict(bpm.PREDRAFT)
    stage = {k: v for k, v in spec.items() if v.startswith("S")}
    if stage:
        run_stage(stage)
    rest = {k: v for k, v in spec.items() if not v.startswith("S")}
    if rest:
        run(rest)


if __name__ == "__main__":
    main()
