"""Features lane: the addendum 8 serving replay for the shipped next-class model (WR S6n4, RB S4n4) and
the same model plus one preregistered feature (prereg.md), fit and served on identical rows.

A lane copy of `prospect_serving_backtest.run_stage` restricted to the shipped kinds: per replayed season
2012-2021 it refits on snapshot rows whose outcome windows had closed, serves the next class from completed
seasons plus the first 4 team games through `bpm.stage_score`, and scores against real outcomes. The shipped
model is refit in the same loop, so the replacement test compares two forecasts of the same rows.

    PROSPECT_DB=<lane copy> python projections/lanes/features/replay.py --coverage WR RB    # no outcomes read
    PROSPECT_DB=<lane copy> python projections/lanes/features/replay.py WR RB               # score F1, F2
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import build_prospect_model as bpm  # noqa: E402
import lane_feats as lf  # noqa: E402
import prospect_serving_backtest as psb  # noqa: E402

NOTES = HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "features"
psb.OUT = NOTES / "serving-backtest-lane.json"          # never the shared experiments file
SCRATCH = pathlib.Path(os.environ.get("LANE_SCRATCH", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-features"))
SHIPPED = {"WR": "S6n4", "RB": "S4n4"}
CANDS = {"F1": ["tal_pct"], "F2": ["pos_bc"]}
NB = 200_000


def fit(kind, X, y, g, shaped, stage_j):
    import prospect_experiments_b as peb
    if kind.startswith("S6"):
        return peb.RecalLR(stage_j).fit(X, y, g, shaped)
    return peb.NestedLR().fit(X, y, g)


def nll(y, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


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
    snap = pst.snapshots(e, ps, age0, con)
    live = pl.live_features(con, 4)
    key = pd.MultiIndex.from_arrays([snap.season.astype(int) + 1, snap.player_id.astype("Int64")])
    snap = snap.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=pl.LIVE, index=snap.index))
    snap["has_live"] = snap.has_live.fillna(0.0)
    tal, rec = lf.talent_pct(ps), lf.recruits(con)
    snaps = {}
    for pos in positions:
        sp = snap[snap.cpos == pos].copy()
        sp = sp.join(lf.attach(sp.assign(k=sp.season.astype(int)), ps, pos, tal, rec))
        snaps[pos] = sp
    return ps, e, age0, live, tal, rec, snaps, pst, pl


def served(pos, season, ps, e, age0, live, tal, rec, pl):
    """The served profile for the next class in `season`, as run_stage builds it, plus the lane features."""
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
    ks = lf.last_season(ps, pid.unique(), season - 1)
    rows = pd.DataFrame({"player_id": pid.to_numpy(), "k": pid.map(ks).to_numpy()}, index=done.index)
    have = rows.k.notna()
    feats = pd.DataFrame(np.nan, index=done.index, columns=lf.NEW)
    feats.loc[have] = lf.attach(rows[have].assign(k=rows.k[have].astype(int)), ps, pos, tal, rec).to_numpy()
    return subj, done.join(feats)


def coverage(positions):
    """Feature non-null rates and rank correlations with features already in the model. Reads no outcome."""
    ps, e, age0, live, tal, rec, snaps, pst, pl = build(positions)
    out = {}
    for pos in positions:
        sp = snaps[pos]
        cols = pst.stage_cols(pos)
        frames = []
        for season in psb.SEASONS:
            subj, done = served(pos, season, ps, e, age0, live, tal, rec, pl)
            done = done[(done.n_qual >= 1) & subj.set_index("sid").cls.reindex(done.index).eq(season + 1)]
            frames.append(done.assign(season=season))
        sv = pd.concat(frames)
        ref = [c for c in ("power", "stars", "team_off_final", "sos_career", "ryptpa_best", "dom_best", "weight") if c in cols]
        out[pos] = {
            "training_snapshots": {"rows": int(len(sp)), "by_season_nonnull": {f: sp.groupby("season")[f].apply(lambda x: round(float(x.notna().mean()), 3)).to_dict() for f in lf.NEW},
                                   "spearman_with_model_cols": {f: {c: round(float(sp[f].corr(sp[c], method="spearman")), 3) for c in ref} for f in lf.NEW},
                                   "describe": {f: sp[f].describe().round(3).to_dict() for f in lf.NEW}},
            "served_rows": {"rows": int(len(sv)), "by_season_nonnull": {f: sv.groupby("season")[f].apply(lambda x: round(float(x.notna().mean()), 3)).to_dict() for f in lf.NEW},
                            "describe": {f: sv[f].describe().round(3).to_dict() for f in lf.NEW}},
            "tal_vs_pos_bc_spearman": round(float(sp.tal_pct.corr(sp.pos_bc, method="spearman")), 3)}
        print(pos, json.dumps(out[pos], indent=1, default=str)[:4000])
    (NOTES / "coverage-rows.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")


def gates(y, p, seasons, fe):
    allr, fer = psb.summary(y, p), psb.summary(y[fe], p[fe])
    r = pd.DataFrame({"y": y, "p": p, "season": seasons})
    top = r.sort_values("p", ascending=False).groupby("season").head(60)
    topr = psb.summary(top.y.to_numpy(float), top.p.to_numpy(float))
    return {"all": allr, "first_eligible": fer, "top60_by_own": topr,
            "pass": bool(psb.passes(allr) and psb.passes(fer) and psb.passes(topr))}


def concentration(y, p_ship, p_cand, seasons):
    gain = nll(y, p_ship) - nll(y, p_cand)
    order = np.argsort(-gain)
    out = {"mean_gain": float(gain.mean())}
    for k in (3, 5, 10):
        keep = np.ones(len(y), bool)
        keep[order[:k]] = False
        b = bpm.class_bootstrap(y[keep], p_ship[keep], p_cand[keep], seasons[keep], n=NB)
        out[f"drop_top{k}"] = {"mean_gain": float(gain[keep].mean()), "boot_p": b["p"]}
    return out


def score(positions):
    import prospect_experiments_b as peb
    ps, e, age0, live, tal, rec, snaps, pst, pl = build(positions)
    hit = e.drop_duplicates("player_id").set_index("player_id").hit
    drafted = e.drop_duplicates("player_id").set_index("player_id").drafted
    res = {}
    for pos in positions:
        kind = SHIPPED[pos]
        base_cols = pst.stage_cols(pos) + pl.LIVE
        specs = {kind: base_cols, **{cid: base_cols + f for cid, f in CANDS.items()}}
        sp = snaps[pos]
        rows = []
        for season in psb.SEASONS:
            tr = sp[sp.hit.notna() & (sp.outcome_year <= season - sp.win) & (sp.season <= season - 1)]
            y, g = tr.hit.to_numpy(float), tr.draft_year.to_numpy(int)
            shaped = ((tr.stage >= 2) & tr.plays_next).to_numpy()
            subj, done = served(pos, season, ps, e, age0, live, tal, rec, pl)
            frame = None
            for cid, cols in specs.items():
                m = fit(kind, tr[cols].to_numpy(float), y, g, shaped, cols.index("stage"))
                s = bpm.stage_score(subj.assign(_pd=np.nan, _pdx=np.nan), done, {"model": m, "cols": cols}, age0, season, "next")
                if frame is None:
                    frame = s[["sid", "player_id", "hs_class"]].copy()
                frame[cid] = s._pd.to_numpy()
                frame[f"C_{cid}"] = peb.NestedLR.chosen[-1]
            frame = frame[frame[kind].notna()]
            frame["y"] = frame.player_id.map(hit)
            frame = frame[frame.y.notna()]
            frame["first_eligible"] = (season - frame.hs_class + 1) == 3
            frame["season"] = season
            frame[lf.NEW] = done[lf.NEW].reindex(frame.sid).to_numpy()
            rows.append(frame)
            print(f"{pos} {season}: train {len(tr):,} rows, served {len(frame):,}, events {int(frame.y.sum())}", flush=True)
        r = pd.concat(rows)
        r.to_parquet(SCRATCH / f"replay_rows_{pos}.parquet")
        y, sea, fe = r.y.to_numpy(float), r.season.to_numpy(int), r.first_eligible.to_numpy(bool)
        dr = r.player_id.map(drafted).eq(1).to_numpy()
        from sklearn.metrics import roc_auc_score
        out = {"shipped": kind, "n": int(len(r)), "events": int(y.sum()), "players": int(r.player_id.nunique()),
               kind: {"gates": gates(y, r[kind].to_numpy(float), sea, fe), "logloss": bpm.ll(y, r[kind].to_numpy(float)),
                      "auc": float(roc_auc_score(y, r[kind])), "drafted_auc": float(roc_auc_score(y[dr], r[kind][dr]))}}
        ps_ = r[kind].to_numpy(float)
        for cid in CANDS:
            pc = r[cid].to_numpy(float)
            b = bpm.class_bootstrap(y, ps_, pc, sea, n=NB)
            g = gates(y, pc, sea, fe)
            conc = concentration(y, ps_, pc, sea)
            rep = b["p"] >= 0.95
            conc_ok = conc["drop_top3"]["mean_gain"] > 0 and conc["drop_top5"]["mean_gain"] > 0
            out[cid] = {"features": CANDS[cid], "gates": g, "logloss": bpm.ll(y, pc), "auc": float(roc_auc_score(y, pc)),
                        "drafted_auc": float(roc_auc_score(y[dr], pc[dr])),
                        "vs_shipped": {"shipped_logloss": bpm.ll(y, ps_), "cand_logloss": bpm.ll(y, pc), "boot_by_season": b,
                                       "pass_95": bool(rep)},
                        "concentration": conc, "concentration_pass": bool(conc_ok),
                        "logit_corr_with_shipped": float(np.corrcoef(bpm.logit(ps_), bpm.logit(pc))[0, 1]),
                        "loso_gain": {int(s): float((nll(y, ps_) - nll(y, pc))[sea != s].mean()) for s in np.unique(sea)},
                        "verdict": "pass" if (g["pass"] and rep and conc_ok) else "fail"}
            gg = g
            print(f"{cid} {pos}: all {gg['all']['ratio']:.2f}/{gg['all']['slope']:.2f} fe {gg['first_eligible']['ratio']:.2f}/"
                  f"{gg['first_eligible']['slope']:.2f} D1 {gg['top60_by_own']['ratio']:.2f}/{gg['top60_by_own']['slope']:.2f} | "
                  f"ll {bpm.ll(y, ps_):.4f} -> {bpm.ll(y, pc):.4f}, boot {b['p']:.4f} | drop3 {conc['drop_top3']['mean_gain']:+.5f} "
                  f"drop5 {conc['drop_top5']['mean_gain']:+.5f} | {out[cid]['verdict']}", flush=True)
        sg = out[kind]["gates"]
        print(f"{kind} {pos} (shipped, lane replay): all {sg['all']['ratio']:.2f}/{sg['all']['slope']:.2f} fe "
              f"{sg['first_eligible']['ratio']:.2f}/{sg['first_eligible']['slope']:.2f} D1 {sg['top60_by_own']['ratio']:.2f}/"
              f"{sg['top60_by_own']['slope']:.2f} ll {out[kind]['logloss']:.4f}", flush=True)
        res[pos] = out
    p = NOTES / "results.json"
    book = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    book.setdefault("replay", {}).update(res)
    p.write_text(json.dumps(book, indent=1, default=float), encoding="utf-8")
    return res


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "--coverage":
        coverage(a[1:] or ["WR", "RB"])
    else:
        score(a or ["WR", "RB"])
