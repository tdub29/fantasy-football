"""B14, career-stage model (charter v2 addendum 7): a pre-draft hit chance for a college player at
any point in his career, not just at his exit.

Population B rows are finished careers. To score a freshman, the shipped model has to pretend his
career ends now or later at today's production, which a backtest found 2.5x too low for freshmen and
sophomores (review C). Here every exiting FBS player contributes one row per completed season k, with
features as of k (`cutoff = k`), his college year `stage` and estimated age at k; the label is his
eventual hit. All of a player's rows carry his decision class, so they always share a fold.

    python projections/prospect_stage.py            # scores B14, writes experiments/B14.json
"""
from __future__ import annotations

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
import prospect_experiments_b as peb  # noqa: E402
import prospect_population as pp  # noqa: E402

EXIT_ONLY = {"early", "n_seasons", "draft_age"}
SHIPPED = {"RB": "B10", "WR": "B10", "TE": "B8", "QB": "B11"}


def stage_cols(pos):
    base = peb.B11 if pos == "QB" else (peb.no_qb(peb.B7, pos) if SHIPPED[pos] == "B10" else peb.no_qb(peb.B2, pos))
    return [c for c in base if c not in EXIT_ONLY] + ["stage", "age_k"]


def snapshots(e, ps, age0, con) -> pd.DataFrame:
    """One row per player per completed season k <= exit, features as of k."""
    seasons = ps[["player_id", "season"]].drop_duplicates()
    s = e[["sid", "player_id", "cpos", "exit", "hs_class", "draft_year", "outcome_year", "hit", "best_ppg", "win", "weight",
           "stars"]].merge(
        seasons, on="player_id")
    s = s[s.season <= s.exit].copy()
    s["base_sid"] = s.sid
    s["sid"] = s.sid + "_" + s.season.astype(int).astype(str)
    subj = s.rename(columns={"cpos": "pos"}).assign(cutoff=s.season.astype(int), dob=pd.NaT,
                                                     draft_year=s.season.astype(int) + 1)
    f = bpm.career_features(subj[["sid", "player_id", "pos", "cutoff", "draft_year", "dob", "hs_class"]], ps, age0)
    s = s.merge(f, on="sid", how="left")
    s = s.join(pe.schedule_context(s.assign(cutoff=s.season.astype(int)), ps, con), on="sid")
    s = s.join(pe.usage_quality(s.assign(cutoff=s.season.astype(int)), ps, con), on="sid")
    s["stage"] = (s.season - s.hs_class + 1).clip(1, 6)
    s["age_k"] = age0 + s.season - s.hs_class
    nxt = set(zip(seasons.player_id, seasons.season))
    s["plays_next"] = [(p, k + 1) in nxt for p, k in zip(s.player_id, s.season)]
    s = s[(s.n_qual >= 1) & ((s.cpos != "QB") | (s.starts >= 1))]
    return s.reset_index(drop=True)


def run(say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    e = pp.build(ps, bio, d, t, age0, con, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    snap = snapshots(e, ps, age0, con)
    say(f"B14 snapshots: {len(snap):,} rows from {snap.base_sid.nunique():,} players; stages "
        f"{snap.stage.value_counts().sort_index().to_dict()}")
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    srcs = hashlib.sha256(json.dumps(pdb.source_shas(con), sort_keys=True).encode()).hexdigest()
    results = {}
    for pos in bpm.POS:
        tp = snap[snap.cpos == pos].reset_index(drop=True)
        win = tp.win.to_numpy(int)
        cols = stage_cols(pos)
        pr_b = peb.predictor(tp, tp[["stars", "stage"]].to_numpy(float), peb.lr(["stars", "stage"]), win)
        pr_c = peb.predictor(tp, tp[cols].to_numpy(float), peb.lr(cols), win)
        pb = {s: pe.oof(tp, pr_b, s) for s in ("fwd", "loco")}
        pc = {s: pe.oof(tp, pr_c, s) for s in ("fwd", "loco")}
        fwd, loco = pe.score(tp, pb["fwd"], pc["fwd"], "fwd"), pe.score(tp, pb["loco"], pc["loco"], "loco")
        rules, verdict = pe.decide(fwd, loco)
        young = tp.stage.le(2).to_numpy()
        sub = tp[young].reset_index(drop=True)
        fy = pe.score(sub, pb["fwd"][young], pc["fwd"][young], "fwd")
        ly = pe.score(sub, pb["loco"][young], pc["loco"][young], "loco")
        ry, vy = pe.decide(fy, ly)
        final = "pass" if verdict.startswith("pass") and vy.startswith("pass") else "reject"
        results[pos] = {"fwd": fwd, "loco": loco, "rules": rules, "verdict": final + (", pending independent review" if final == "pass" else ""),
                        "cols": cols, "baseline": "stars + stage", "young_stage_1_2": {"fwd": fy, "loco": ly, "rules": ry, "verdict": vy},
                        "baseline_fwd_logloss": {"stars+stage": fwd["base"]["logloss"]}}
        say(f"B14 {pos}: rows {len(tp):,} | all fwd {fwd['base']['logloss']:.4f} -> {fwd['cand']['logloss']:.4f} "
            f"(boot {fwd['boot']['p']:.0%}, slope {fwd['cand']['slope']:.2f}) | stage 1-2 fwd {fy['base']['logloss']:.4f} -> "
            f"{fy['cand']['logloss']:.4f} (boot {fy['boot']['p']:.0%}, slope {fy['cand']['slope']:.2f}, 2020+ "
            f"{fy['regime_2020']['base']:.4f} -> {fy['regime_2020']['cand']:.4f}) | {results[pos]['verdict']}")
    rec = {"id": "B14", "description": "career-stage model: one row per completed college season (addendum 7)",
           "created_at_utc": stamp, "charter": pe.CHARTER + " (addendum 7)", "git_head": pe.git_head(),
           "sources_sha256": srcs, "command": "python projections/prospect_stage.py",
           "population": "B snapshots: every exiting FBS QB/RB/WR/TE, one row per completed season, decision classes 2008+",
           "primary_metric": "pooled log loss, fwd, all rows and stage 1-2 rows", "results": results}
    (pe.EXP / "B14.json").write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")
    peb.write_ledger()
    return results


if __name__ == "__main__":
    run()
