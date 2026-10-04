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
    run(spec)


if __name__ == "__main__":
    main()
