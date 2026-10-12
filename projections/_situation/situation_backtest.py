"""Does an NFL landing-spot "situation score" add anything over pick + college talent?

Research backtest only; never edits build_prospect_model.py or site/. Reuses the model's own
training table (bpm.prepare), feature lists, fit_full/fit_baseline and forward embargoed folds.

Situation features, each measured from the draftee's team (franchise code) as of the draft:
  pass_pg    team pass attempts per game, prior season                      (strictly pre-draft)
  qb_epa     team passing EPA per dropback (att + sacks), prior season      (strictly pre-draft)
  vac        share of the team's prior-season opportunity (targets for WR/TE, carries for RB,
             pass attempts for QB) held by players NOT on the team's draft-year roster
  comp_pos   share of prior-season team opportunity held by RETURNING players at his position
  mate       1 if the team took a player at his position earlier in the same draft (pre-draft)
vac/comp_pos use the draft-year season roster (any week), so post-draft camp cuts and trades leak
in. That biases toward finding signal: a null on them survives fixing the leak, a gain is an upper bound.

    python projections/_situation/situation_backtest.py
"""
from __future__ import annotations

import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_prospect_model as bpm  # noqa: E402

FWD_START = 2013   # same first forward-test class as prospect_experiments.py
FIRST = 2009       # class 2008 has no prior NFL season on file
FR = {"ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SL": "LA", "STL": "LA", "LAR": "LA",
      "SD": "LAC", "SDG": "LAC", "OAK": "LV", "LVR": "LV", "GNB": "GB", "KAN": "KC", "NOR": "NO",
      "NWE": "NE", "SFO": "SF", "TAM": "TB", "JAC": "JAX"}
OPP = {"WR": "targets", "TE": "targets", "RB": "carries", "QB": "attempts"}
POSMAP = {"FB": "RB", "HB": "RB"}
SIT = ["pass_pg", "qb_epa", "vac", "comp_pos", "mate"]


def fr(s):
    return s.map(lambda x: FR.get(x, x))


def team_tables():
    stats = pd.concat([pd.read_parquet(bpm.CACHE / f"stats_player_reg_{y}.parquet",
                                       columns=["player_id", "season", "position", "recent_team", "attempts",
                                                "sacks_suffered", "passing_epa", "targets", "carries"])
                       for y in range(bpm.FIRST_CLASS, bpm.LAST_NFL + 1)])
    stats["team"] = fr(stats.recent_team)
    stats["position"] = stats.position.replace(POSMAP)
    ros = pd.concat([pd.read_parquet(bpm.CACHE / f"roster_{y}.parquet", columns=["gsis_id", "season", "team"])
                     for y in range(bpm.FIRST_CLASS, bpm.LAST_NFL + 2)])
    ros["team"] = fr(ros.team)
    on_roster = set(zip(ros.gsis_id, ros.season, ros.team))
    tm = stats.groupby(["team", "season"]).agg(att=("attempts", "sum"), sk=("sacks_suffered", "sum"),
                                               epa=("passing_epa", "sum"), targets=("targets", "sum"),
                                               carries=("carries", "sum"))
    games = np.where(tm.index.get_level_values("season") <= 2020, 16, 17)
    tm["pass_pg"] = tm.att / games
    tm["qb_epa"] = tm.epa / (tm.att + tm.sk)
    tm["attempts"] = tm.att
    stats["ret"] = [(p, s + 1, t) in on_roster for p, s, t in zip(stats.player_id, stats.season, stats.team)]
    return stats, tm


def situation(t: pd.DataFrame) -> pd.DataFrame:
    stats, tm = team_tables()
    t = t.copy()
    t["fteam"] = fr(t.team)
    t["prev"] = t.draft_year - 1
    key = list(zip(t.fteam, t.prev))
    t["pass_pg"] = [tm.pass_pg.get(k, np.nan) for k in key]
    t["qb_epa"] = [tm.qb_epa.get(k, np.nan) for k in key]
    vac, comp = [], []
    g = {k: v for k, v in stats.groupby(["team", "season"])}
    for (team, prev), pos in zip(key, t.pos):
        s, col = g.get((team, prev)), OPP[pos]
        if s is None or s[col].sum() == 0:
            vac.append(np.nan); comp.append(np.nan); continue
        tot = s[col].sum()
        vac.append(float(s.loc[~s.ret, col].sum() / tot))
        comp.append(float(s.loc[s.ret & (s.position == pos), col].sum() / tot))
    t["vac"], t["comp_pos"] = vac, comp
    # Same-draft competition: an earlier pick by his team at his position (known the moment he is picked).
    first = t.groupby(["draft_year", "fteam", "pos"]).pick.transform("min")
    t["mate"] = (t.pick > first).astype(float)
    return t


def evaluate(t: pd.DataFrame):
    rows, corr = [], []
    for pos in bpm.POS:
        win = bpm.TARGET[pos][1]
        tp = t[(t.pos == pos) & t.draft_year.between(FIRST, bpm.LAST_CLASS[pos]) & t.hit.notna()
               & t.gsis_id.notna()].copy()
        y, g = tp.hit.to_numpy(float), tp.draft_year.to_numpy(int)
        cols = bpm.FEATS[pos]
        for c in SIT:
            ok = tp[c].notna()
            corr.append({"pos": pos, "feat": c, "rho_logpick": float(tp.loc[ok, c].corr(tp.loc[ok, "log_pick"], method="spearman")),
                         "rho_hit": float(tp.loc[ok, c].corr(tp.loc[ok, "hit"], method="spearman")),
                         "missing": int((~ok).sum())})
        variants = {"draft": ([], bpm.fit_baseline), "full": (cols, bpm.fit_full)}
        for c in SIT:
            variants[f"full+{c}"] = (cols + [c], bpm.fit_full)
            variants[f"draft+{c}"] = ([c], bpm.fit_full)   # capital + one situation column, no talent
        variants["full+pass_pg+vac+mate"] = (cols + ["pass_pg", "vac", "mate"], bpm.fit_full)
        preds = {}
        for name, (fc, fit) in variants.items():
            X = tp[fc + ["log_pick"]].to_numpy(float)
            preds[name] = (bpm.cv_predict(X, y, g, fit, forward=True, start=FWD_START, embargo=win),
                           bpm.cv_predict(X, y, g, fit))
        k = ~np.isnan(preds["draft"][0])
        for name, (pf, pl) in preds.items():
            base = "draft" if name.startswith("draft") else "full"
            mf, ml = bpm.metrics(y[k], pf[k]), bpm.metrics(y, pl)
            bf = bpm.metrics(y[k], preds[base][0][k])
            boot = bpm.class_bootstrap(y[k], preds[base][0][k], pf[k], g[k]) if name != base else {"p": np.nan}
            rows.append({"pos": pos, "model": name, "vs": base, "n": mf["n"], "hits": mf["events"],
                         "fwd_ll": mf["logloss"], "fwd_auc": mf["auc"], "d_ll": mf["logloss"] - bf["logloss"],
                         "d_auc": mf["auc"] - bf["auc"], "p_better": boot["p"], "loco_ll": ml["logloss"]})
        # Coefficient sign of each situation column in the all-years full+sit fit (standardized scale).
        for c in SIT:
            X = tp[cols + [c, "log_pick"]].to_numpy(float)
            m = bpm.fit_full(X, y, g)
            corr.append({"pos": pos, "feat": c, "coef_std": float(m[-1].coef_[0][len(cols)])})
    return pd.DataFrame(rows), pd.DataFrame(corr).groupby(["pos", "feat"]).first().reset_index()


def main():
    _, _, _, t, _ = bpm.prepare(say=lambda *a, **k: None)
    t = situation(t)
    cov = t[t.draft_year >= FIRST][SIT].notna().mean()
    print("coverage:", cov.round(3).to_dict())
    res, corr = evaluate(t)
    pd.set_option("display.width", 200)
    print(res.round(4).to_string(index=False))
    print(corr.round(3).to_string(index=False))
    res.to_csv(HERE / "results.csv", index=False)
    corr.to_csv(HERE / "feature_checks.csv", index=False)


if __name__ == "__main__":
    main()
