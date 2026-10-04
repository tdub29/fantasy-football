"""Pre-registered prospect-model experiments, scored under notes/prospect-research/validation-charter-v2.md.

Population A (drafted, capital known). Every candidate and the frozen baseline (v1's draft-only
spline) are scored on identical rows and folds:
  fwd   embargoed forward chaining, test classes 2013 to the last mature class, expanding window
  loco  leave-one-class-out on the development classes 2008-2019
Promotion needs all five numeric rules of the charter plus an independent review; the script
reports "pass, pending review" at best and never edits the shipped model.

Every run appends one JSON per candidate to notes/prospect-research/experiments/, rewrites the
ledger table there, freezes 2024-2026 class predictions (prospective holdout, sha256 per entry), and
records population, features (with observed/estimated/missing status) and predictions in the
SQLite store under a new build_run.

    python projections/prospect_experiments.py A0 A1 A2      # or: all
    python projections/prospect_experiments.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys
import warnings

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402
import prospect_db as pdb  # noqa: E402

ROOT = bpm.ROOT
EXP = ROOT / "notes" / "prospect-research" / "experiments"
CHARTER = "notes/prospect-research/validation-charter-v2.md"
FWD_START, DEV_END, REGIME = 2013, bpm.HOLD - 1, 2020
BOOT_MIN, SLOPE = 0.90, (0.75, 1.25)
PROSPECTIVE = (2024, 2025, 2026)
C = bpm.C_FIXED
# nflverse draft_picks team code -> the franchise code its season stats use for every year.
TEAM = {"GNB": "GB", "KAN": "KC", "LAR": "LA", "STL": "LA", "LVR": "LV", "OAK": "LV", "NOR": "NO",
        "NWE": "NE", "SDG": "LAC", "SFO": "SF", "TAM": "TB"}


# ----------------------------------------------------------------------------- data

def enrich(ps, bio, d, t, age0, con) -> pd.DataFrame:
    """Candidate features on the v1 training table. All are known at T (the pick is made)."""
    t = t.copy()
    apr25 = pd.to_datetime(t.draft_year.astype(int).astype(str) + "-04-25")
    t["draft_age_real"] = bpm.age_years(apr25, t.dob)                      # A1, A3
    s = t[["sid", "player_id", "cutoff"]].merge(ps[["player_id", "season"]], on="player_id")
    s = s[s.season <= s.cutoff]
    t["early_covid"] = t.sid.map(s[s.season != 2020].groupby("sid").season.nunique()).fillna(0).le(3).astype(float)  # A2
    t.loc[t.n_seasons.isna(), "early_covid"] = np.nan
    t["grade"] = t.player_id.map(recruit_grade(ps, con))                    # A4
    eff = efficiency(t, ps, con)                                            # A5
    t = t.join(eff, on="sid")
    t["no_forty"] = t.forty.isna().astype(float)                            # A8
    import prospect_experiments_b as peb                                     # A13
    pre = peb.oof_predraft(ps, bio, d, t, age0, con)
    t["pre_logit"] = bpm.logit(t.player_id.map(pre).astype(float).to_numpy())
    t = t.join(schedule_context(t, ps, con), on="sid")                       # A11
    t = t.join(usage_quality(t, ps, con), on="sid")                          # A12
    ctx = team_context(con)                                                 # A9
    key = list(zip(t.team.map(lambda x: TEAM.get(x, x)), t.draft_year - 1, t.pos))
    t["tm_pass_att_prev"] = [ctx["att"].get(k[:2], np.nan) for k in key]
    t["tm_pos_ppr_prev"] = [ctx["ppr"].get(k, np.nan) for k in key]
    return t


def recruit_grade(ps, con) -> pd.Series:
    """247 composite grade, joined exactly as player_bio joins stars (name + a school he played for)."""
    rec = pd.read_sql_query("SELECT season, team_id, player_name, grade FROM cfb_recruit", con)
    rec["team_id"] = pd.to_numeric(rec.team_id, errors="coerce")
    rec["_k"] = rec.player_name.map(bpm.bpp.norm_name)
    ros = pd.read_sql_query("SELECT athlete_id AS player_id, full_name AS name, team_id FROM cfb_roster", con)
    names = pd.concat([ps[["player_id", "name", "team_id"]], ros])
    names["player_id"] = pd.to_numeric(names.player_id, errors="coerce")
    names["_k"] = names.name.map(bpm.bpp.norm_name)
    rk = rec.groupby(["_k", "team_id"]).grade.max().reset_index()
    m = names.drop_duplicates(["player_id", "_k", "team_id"]).merge(rk, on=["_k", "team_id"])
    return m.groupby("player_id").grade.max()


def efficiency(t, ps, con) -> pd.DataFrame:
    """Best qualifying season (same season rules as v1, thin passing seasons excluded) of
    receiving EPA per target (>= 20 targets) and rushing success rate (>= 50 carries)."""
    rec = pd.read_sql_query("SELECT season, player_id, team_id, targets AS tg, EPAplay AS rec_epa FROM cfb_receiving", con)
    rus = pd.read_sql_query("SELECT season, player_id, team_id, plays AS car, success AS rush_succ FROM cfb_rushing", con)
    for x in (rec, rus):
        x["player_id"] = pd.to_numeric(x.player_id, errors="coerce").astype("Int64")
        x["team_id"] = pd.to_numeric(x.team_id, errors="coerce")
    f = t[["sid", "player_id", "cutoff"]].merge(ps[["player_id", "season", "team_id", "qual", "thin"]], on="player_id")
    f = f[(f.season <= f.cutoff) & f.qual]
    f = f.merge(rec, on=["season", "player_id", "team_id"], how="left").merge(rus, on=["season", "player_id", "team_id"], how="left")
    out = pd.DataFrame(index=pd.Index(t.sid.unique(), name="sid"))
    r = f[(f.tg >= 20) & ~f.thin]
    out["rec_epa_best"] = r.groupby("sid").rec_epa.max()
    out["rush_succ_best"] = f[f.car >= 50].groupby("sid").rush_succ.max()
    return out


def schedule_context(t, ps, con) -> pd.DataFrame:
    """A11: his team's adjusted offensive EPA in his final counted season, and the mean adjusted net
    rating of every opponent his teams played in his seasons (one value per team game)."""
    rt = pd.read_sql_query("SELECT season, team_id, adj_off_epa, adj_net FROM cfb_rating", con)
    gm = pd.read_sql_query("SELECT season, team_id, opponent_id FROM cfb_team_game", con)
    for x in (rt, gm):
        x["team_id"] = pd.to_numeric(x.team_id, errors="coerce")
    gm["opponent_id"] = pd.to_numeric(gm.opponent_id, errors="coerce")
    gm = gm.merge(rt.rename(columns={"team_id": "opponent_id", "adj_net": "opp_net"})[["season", "opponent_id", "opp_net"]],
                  on=["season", "opponent_id"], how="left")
    f = t[["sid", "player_id", "cutoff", "season_final"]].merge(ps[["player_id", "season", "team_id"]], on="player_id")
    f = f[f.season <= f.cutoff]
    out = pd.DataFrame(index=pd.Index(t.sid.unique(), name="sid"))
    fin = f[f.season == f.season_final].merge(rt, on=["season", "team_id"], how="left")
    out["team_off_final"] = fin.groupby("sid").adj_off_epa.first()
    out["sos_career"] = f.merge(gm, on=["season", "team_id"]).groupby("sid").opp_net.mean()
    return out


def usage_quality(t, ps, con) -> pd.DataFrame:
    """A12: best qualifying season (30+ opportunities) of first-down share and explosive rate.
    A player-team-season ESPN split across two name spellings is summed back together first."""
    u = pd.read_sql_query("SELECT season, player_id, pos_team_id AS team_id, opportunities, first_downs, "
                          "explosive_plays, team_first_downs FROM cfb_usage WHERE player_id IS NOT NULL", con)
    u["player_id"] = pd.to_numeric(u.player_id, errors="coerce").astype("Int64")
    u["team_id"] = pd.to_numeric(u.team_id, errors="coerce")
    u = u.groupby(["season", "player_id", "team_id"]).agg(opp=("opportunities", "sum"), fd=("first_downs", "sum"),
                                                          ex=("explosive_plays", "sum"), tfd=("team_first_downs", "max")).reset_index()
    u["fd_share"] = np.where(u.tfd > 0, u.fd / u.tfd.where(u.tfd > 0, 1), np.nan)
    u["explosive"] = u.ex / u.opp.where(u.opp > 0)
    f = t[["sid", "player_id", "cutoff"]].merge(ps[["player_id", "season", "team_id", "qual"]], on="player_id")
    f = f[(f.season <= f.cutoff) & f.qual].merge(u, on=["season", "player_id", "team_id"])
    f = f[f.opp >= 30]
    out = pd.DataFrame(index=pd.Index(t.sid.unique(), name="sid"))
    out["fd_share_best"] = f.groupby("sid").fd_share.max()
    out["explosive_best"] = f.groupby("sid").explosive.max()
    return out


def team_context(con) -> dict:
    """Per (franchise, season): pass attempts, and PPR points by players listed at each position
    on that season's roster (stats position as fallback). Final once the season ends, before the draft."""
    st = pd.read_sql_query("SELECT player_id, season, recent_team, position, attempts, fantasy_points_ppr FROM nfl_player_season", con)
    ro = pd.read_sql_query("SELECT gsis_id, season, position AS rpos FROM nfl_roster ORDER BY source_key, src_row", con)
    ro = ro.dropna().drop_duplicates(["gsis_id", "season"])
    st = st.merge(ro, left_on=["player_id", "season"], right_on=["gsis_id", "season"], how="left")
    st["pos"] = st.rpos.fillna(st.position)
    att = st.groupby(["recent_team", "season"]).attempts.sum()
    ppr = st.groupby(["recent_team", "season", "pos"]).fantasy_points_ppr.sum()
    return {"att": att.to_dict(), "ppr": ppr.to_dict()}


# ----------------------------------------------------------------------------- candidates

V1 = bpm.FEATS


def lr_full(cols):
    def fit(X, y):
        return bpm.make_lr(C, len(cols), capital=True).fit(X, y)
    return fit


def cand_cols(cid: str, pos: str) -> list[str] | None:
    """Talent columns of a feature-swap candidate (capital spline added by the model). None = not
    applicable at this position."""
    v = list(V1[pos])
    if cid == "A0":
        return v
    if cid == "A1":
        return ([c for c in v if c != "draft_age"] + ["draft_age_real"]) if "draft_age" in v else v + ["draft_age_real"]
    if cid == "A2":
        return [("early_covid" if c == "early" else c) for c in v] if "early" in v else None
    if cid == "A3":
        return [("draft_age_real" if c == "early" else c) for c in v] if pos == "WR" else None
    if cid == "A4":
        return [("grade" if c == "stars" else c) for c in v] if "stars" in v else v + ["grade"]
    if cid == "A5":
        if pos == "QB":
            return None
        return v + (["rec_epa_best", "rush_succ_best"] if pos == "RB" else ["rec_epa_best"])
    if cid == "A6":
        return v + ["target_share_best"] if pos in ("WR", "TE") else None
    if cid == "A8":
        if pos == "QB":
            return None
        return (v if "speed_score" in v else v + ["speed_score"]) + ["no_forty"]
    if cid == "A9":
        return v + ["tm_pass_att_prev", "tm_pos_ppr_prev"]
    if cid == "A11":
        return v + ["team_off_final", "sos_career"]
    if cid == "A12":
        return v + ["fd_share_best", "explosive_best"] if pos != "QB" else None
    if cid == "A13":
        return v + ["pre_logit"]
    return None


CANDIDATES = {
    "A0": "v1 full model (talent + capital), re-scored under charter v2",
    "A1": "real draft age (nflverse birth date) replaces the class-year estimate",
    "A2": "COVID-aware early flag (college seasons excluding 2020)",
    "A3": "WR: early flag replaced by real draft age",
    "A4": "247 composite recruiting grade replaces stars",
    "A5": "best-season receiving EPA per target (+ RB rushing success rate)",
    "A6": "best-season target share (WR/TE)",
    "A7": "partial pooling of WR/TE/RB college slopes with position deviations",
    "A8": "speed score with an explicit no-forty indicator",
    "A9": "drafting team's prior-season pass attempts and position PPR",
    "A10": "50/50 logit average of baseline and v1 full model",
    "A11": "final-season team adjusted offensive EPA and career opponent strength",
    "A12": "best-season first-down share and explosive rate (30+ opportunities)",
    "A13": "logit of the population B pre-draft probability (forward out-of-fold) as a talent feature",
}


# ----------------------------------------------------------------------------- evaluation

def test_classes(g, scheme, first_test=FWD_START):
    return [c for c in sorted(set(g.tolist())) if (c >= first_test if scheme == "fwd" else c <= DEV_END)]


def fold_mask(g, scheme, c, win):
    """Training rows for test class c. fwd: classes whose outcome window had closed by c's draft
    (win may be a per-row array: a pooled TE row needs four seasons, a WR row three). loco: the
    other development classes."""
    return (g <= c - win) if scheme == "fwd" else ((g != c) & (g <= DEV_END))


def oof(tp, predictor, scheme, first_test=FWD_START):
    """Out-of-fold probabilities for the mature rows of tp. predictor(scheme, c, test_mask) -> p."""
    p = np.full(len(tp), np.nan)
    g = tp.draft_year.to_numpy(int)
    mature = tp.hit.notna().to_numpy()
    for c in test_classes(g[mature], scheme, first_test):
        te = mature & (g == c)
        p[te] = predictor(scheme, c, te)
    return p


def simple_predictor(tp, X, fit, win):
    y = tp.hit.to_numpy(float)
    g = tp.draft_year.to_numpy(int)
    mature = tp.hit.notna().to_numpy()

    def predict(scheme, c, te):
        tr = mature & fold_mask(g, scheme, c, win)
        assert not (tr & te).any()
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        return fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
    return predict


def calib(y, p):
    from sklearn.linear_model import LogisticRegression
    k = ~np.isnan(p)
    lg = bpm.logit(p[k]).reshape(-1, 1)
    m = LogisticRegression(penalty=None, max_iter=1000).fit(lg, y[k])
    return float(m.coef_[0][0]), float(m.intercept_[0])


def score(tp, pb, pc, scheme):
    y = tp.hit.to_numpy(float)
    g = tp.draft_year.to_numpy(int)
    k = ~np.isnan(pb) & ~np.isnan(pc)
    out = {"n": int(k.sum()), "events": int(y[k].sum())}
    for name, p in (("base", pb), ("cand", pc)):
        m = bpm.metrics(y[k], p[k], tp.best_ppg.to_numpy(float)[k])
        sl, ic = calib(y[k], p[k])
        rho = float(pd.Series(p[k]).corr(pd.Series(tp.best_ppg.to_numpy(float)[k]), method="spearman"))
        out[name] = {"logloss": m["logloss"], "brier": m["brier"], "auc": m["auc"], "slope": sl, "intercept": ic,
                     "spearman_ppg": rho}
    out["gain"] = out["base"]["logloss"] - out["cand"]["logloss"]
    out["boot"] = bpm.class_bootstrap(y[k], pb[k], pc[k], g[k])
    per = []
    for c in sorted(set(g[k].tolist())):
        kk = k & (g == c)
        per.append({"class": c, "n": int(kk.sum()), "hits": int(y[kk].sum()),
                    "base": bpm.ll(y[kk], pb[kk]), "cand": bpm.ll(y[kk], pc[kk])})
    out["per_class"] = per
    out["class_wins"] = int(sum(r["cand"] < r["base"] for r in per))
    if scheme == "fwd":
        kr = k & (g >= REGIME)
        out["regime_2020"] = {"n": int(kr.sum()), "base": bpm.ll(y[kr], pb[kr]), "cand": bpm.ll(y[kr], pc[kr])}
    return out


def decide(fwd, loco):
    rules = {
        "1 fwd log loss lower": fwd["gain"] > 0,
        "2 loco log loss lower": loco["gain"] > 0,
        f"3 bootstrap >= {BOOT_MIN:.0%}": fwd["boot"]["p"] >= BOOT_MIN,
        "4 2020+ not worse": fwd["regime_2020"]["cand"] <= fwd["regime_2020"]["base"],
        "5 calibration slope in range": SLOPE[0] <= fwd["cand"]["slope"] <= SLOPE[1],
    }
    return rules, ("pass, pending independent review" if all(rules.values()) else "reject")


# ----------------------------------------------------------------------------- pooled model (A7)

class Pooled:
    """WR/TE/RB stacked: shared standardized college slopes, position deviations scaled by DEV (so
    the ridge penalizes them 1/DEV^2 harder), and each position's own capital spline and intercept.
    The receiving features are the union of the v1 WR/TE/RB sets."""
    DEV = 0.5
    FEATS = ["ryptpa_career", "ryptpa_best", "ryptpa_final", "early", "stars", "speed_score", "power", "scrim_ypg", "weight"]
    POS = ("WR", "TE", "RB")

    def fit(self, X, pos, y):
        from sklearn.impute import SimpleImputer
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        self.imp, self.sc = SimpleImputer(strategy="median").fit(X[:, :-1]), None
        Z = self.imp.transform(X[:, :-1])
        self.sc = StandardScaler().fit(Z)
        self.cap = {}
        for p in self.POS:
            m = pos == p
            r = bpm.RCS().fit(X[m][:, -1:])
            s = StandardScaler().fit(r.transform(X[m][:, -1:]))
            self.cap[p] = (r, s)
        self.lr = LogisticRegression(C=C, max_iter=5000).fit(self._design(X, pos), y)
        return self

    def _design(self, X, pos):
        Z = self.sc.transform(self.imp.transform(X[:, :-1]))
        cols = [Z]
        for p in self.POS:
            m = (pos == p).astype(float)[:, None]
            r, s = self.cap[p]
            cap = s.transform(r.transform(X[:, -1:]))
            cap[:, 0] *= bpm.UNPEN
            cols += [Z * m * self.DEV, cap * m, m * bpm.UNPEN]
        return np.column_stack(cols)

    def predict_proba(self, X, pos):
        return self.lr.predict_proba(self._design(X, pos))


def pooled_predictor(t, tp):
    st = t[t.pos.isin(Pooled.POS) & t.gsis_id.notna()].reset_index(drop=True)
    X = st[Pooled.FEATS + ["log_pick"]].to_numpy(float)
    P = st.pos.to_numpy()
    y = st.hit.to_numpy(float)
    g = st.draft_year.to_numpy(int)
    win = st.pos.map(lambda p: bpm.TARGET[p][1]).to_numpy(int)
    mature = st.hit.notna().to_numpy()
    idx = pd.Series(np.arange(len(st)), index=st.sid)
    rows = idx.loc[tp.sid].to_numpy()

    def predict(scheme, c, te):
        tr = mature & fold_mask(g, scheme, c, win)
        assert not np.isin(np.flatnonzero(tr), rows[te]).any()
        return Pooled().fit(X[tr], P[tr], y[tr]).predict_proba(X[rows[te]], P[rows[te]])[:, 1]

    def final():
        return Pooled().fit(X[mature], P[mature], y[mature]).predict_proba(X[rows], P[rows])[:, 1]
    return predict, final


# ----------------------------------------------------------------------------- run

def git_head() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        return "unknown"


def run(ids, say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    t = enrich(ps, bio, d, t, age0, con)
    head = git_head()
    srcs = pdb.source_shas(con)
    src_hash = hashlib.sha256(json.dumps(srcs, sort_keys=True).encode()).hexdigest()
    EXP.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    results, preds = {}, {}
    for pos in bpm.POS:
        win = bpm.TARGET[pos][1]
        tp = t[(t.pos == pos) & t.gsis_id.notna() & t.draft_year.between(bpm.FIRST_CLASS, max(PROSPECTIVE))].reset_index(drop=True)
        Xb = tp[["log_pick"]].to_numpy(float)
        base_pred = simple_predictor(tp, Xb, lambda X, y: bpm.fit_baseline(X, y, None), win)
        pb = {s: oof(tp, base_pred, s) for s in ("fwd", "loco")}
        preds[(pos, "baseline")] = (tp, pb, bpm.fit_baseline(Xb[tp.hit.notna()], tp.hit[tp.hit.notna()].to_numpy(float), None)
                                    .predict_proba(Xb)[:, 1])
        for cid in ids:
            if cid == "A7":
                if pos not in Pooled.POS:
                    continue
                pr, fin = pooled_predictor(t, tp)
                pc = {s: oof(tp, pr, s) for s in ("fwd", "loco")}
                final = fin()
            elif cid == "A10":
                cols = V1[pos]
                X = tp[cols + ["log_pick"]].to_numpy(float)
                fb, ff = (lambda A, y: bpm.fit_baseline(A[:, -1:], y, None)), lr_full(cols)

                def avg_fit(A, y, fb=fb, ff=ff):
                    mb, mf = fb(A, y), ff(A, y)
                    class M:
                        def predict_proba(self, Z):
                            lg = 0.5 * bpm.logit(mb.predict_proba(Z[:, -1:])[:, 1]) + 0.5 * bpm.logit(mf.predict_proba(Z)[:, 1])
                            q = 1 / (1 + np.exp(-lg))
                            return np.column_stack([1 - q, q])
                    return M()
                pr = simple_predictor(tp, X, avg_fit, win)
                pc = {s: oof(tp, pr, s) for s in ("fwd", "loco")}
                m = tp.hit.notna().to_numpy()
                final = avg_fit(X[m], tp.hit[m].to_numpy(float)).predict_proba(X)[:, 1]
            else:
                cols = cand_cols(cid, pos)
                if cols is None:
                    continue
                X = tp[cols + ["log_pick"]].to_numpy(float)
                pr = simple_predictor(tp, X, lr_full(cols), win)
                pc = {s: oof(tp, pr, s) for s in ("fwd", "loco")}
                m = tp.hit.notna().to_numpy()
                final = lr_full(cols)(X[m], tp.hit[m].to_numpy(float)).predict_proba(X)[:, 1]
            fwd, loco = score(tp, pb["fwd"], pc["fwd"], "fwd"), score(tp, pb["loco"], pc["loco"], "loco")
            rules, verdict = decide(fwd, loco)
            results.setdefault(cid, {})[pos] = {"fwd": fwd, "loco": loco, "rules": rules, "verdict": verdict,
                                                "cols": cand_cols(cid, pos) if cid not in ("A7", "A10") else None}
            preds[(pos, cid)] = (tp, pc, final)
            say(f"{cid} {pos}: fwd {fwd['base']['logloss']:.4f} -> {fwd['cand']['logloss']:.4f} "
                f"(boot {fwd['boot']['p']:.0%}, slope {fwd['cand']['slope']:.2f}, 2020+ "
                f"{fwd['regime_2020']['base']:.4f} -> {fwd['regime_2020']['cand']:.4f}) | loco "
                f"{loco['base']['logloss']:.4f} -> {loco['cand']['logloss']:.4f} | {verdict}")
    for cid, by_pos in results.items():
        rec = {"id": cid, "description": CANDIDATES[cid], "created_at_utc": stamp, "charter": CHARTER,
               "git_head": head, "sources_sha256": src_hash, "command": f"python projections/prospect_experiments.py {cid}",
               "population": "A: drafted QB/RB/WR/TE 2008+, linked college career", "primary_metric": "pooled log loss, fwd",
               "results": by_pos}
        (EXP / f"{cid}.json").write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")
    freeze_prospective(preds, stamp, head, src_hash)
    write_ledger()
    record_db(con, t, preds, ids)
    return results


def freeze_prospective(preds, stamp, head, src_hash):
    path = EXP / "prospective-2024-2026.json"
    book = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"note": (
        "Frozen predictions for draft classes whose outcome window is still open. Scored when the "
        "windows close (WR/RB 2024 class: after the 2026 season). Never edited: a new config adds an entry."),
        "entries": []}
    for (pos, cid), (tp, _pc, final) in sorted(preds.items()):
        if final is None:
            continue
        m = tp.draft_year.isin(PROSPECTIVE).to_numpy()
        body = {str(s): round(float(p), 4) for s, p in zip(tp.gsis_id[m], final[m])}
        sha = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        if any(e["sha256"] == sha and e["id"] == cid and e["pos"] == pos for e in book["entries"]):
            continue
        book["entries"].append({"id": cid, "pos": pos, "frozen_at_utc": stamp, "git_head": head,
                                "sources_sha256": src_hash, "sha256": sha, "p_by_gsis": body})
    path.write_text(json.dumps(book, indent=1), encoding="utf-8")


def write_ledger():
    rows = []
    for f in sorted(EXP.glob("A*.json"), key=lambda p: (len(p.stem), p.stem)):
        r = json.loads(f.read_text(encoding="utf-8"))
        for pos, x in r["results"].items():
            fw, lo = x["fwd"], x["loco"]
            rows.append(f"| {r['id']} | {pos} | {fw['base']['logloss']:.4f} | {fw['cand']['logloss']:.4f} | "
                        f"{fw['boot']['p']:.0%} | {fw['class_wins']}/{len(fw['per_class'])} | {fw['cand']['slope']:.2f} | "
                        f"{fw['regime_2020']['base']:.4f} / {fw['regime_2020']['cand']:.4f} | "
                        f"{lo['base']['logloss']:.4f} / {lo['cand']['logloss']:.4f} | "
                        f"{fw['base']['spearman_ppg']:.3f} / {fw['cand']['spearman_ppg']:.3f} | {x['verdict']} |")
    head = ["# Experiment ledger (population A, charter v2)", "",
            "Generated by `projections/prospect_experiments.py`; one JSON per candidate beside this file holds fold-level "
            "numbers, rules and the exact command. Baseline = v1 draft-only spline. Log loss, lower is better.", "",
            "| ID | Pos | Fwd base | Fwd cand | Boot | Class wins | Slope | 2020+ base / cand | LOCO base / cand | "
            "Spearman vs PPG base / cand | Verdict |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    (EXP / "ledger.md").write_text("\n".join(head + rows) + "\n", encoding="utf-8")


def record_db(con, t, preds, ids):
    """Population A, its features with a status, and every out-of-fold prediction, under one run."""
    rid = pdb.record_run(con, __file__, {"ids": ids, "charter": CHARTER}, note="charter v2 experiments")
    rows = t[t.gsis_id.notna() & t.draft_year.between(bpm.FIRST_CLASS, max(PROSPECTIVE))]
    pdb.write_rows(con, "model_row", [
        (rid, r.sid, "A_drafted_linked", r.pos, int(r.draft_year), r.gsis_id, None if pd.isna(r.player_id) else int(r.player_id),
         r.pfr_player_name, int(r.pick), None if pd.isna(r.hit) else float(r.hit),
         None if pd.isna(r.best_ppg) else float(r.best_ppg), None if pd.isna(r.best_rank) else int(r.best_rank),
         "open" if pd.isna(r.hit) else "final") for r in rows.itertuples()])
    feats = sorted({c for pos in bpm.POS for c in V1[pos]} | {"draft_age_real", "early_covid", "grade", "rec_epa_best",
                                                            "rush_succ_best", "target_share_best", "no_forty",
                                                            "tm_pass_att_prev", "tm_pos_ppr_prev", "log_pick",
                                                            "team_off_final", "sos_career", "fd_share_best", "explosive_best",
                                                            "pre_logit"})
    out = []
    for r in rows.itertuples():
        for f in feats:
            v = getattr(r, f)
            out.append((rid, r.sid, f, None if pd.isna(v) else float(v), feature_status(f, r, v)))
    pdb.write_rows(con, "model_feature", out)
    pr = []
    for (pos, cid), (tp, pc, final) in preds.items():
        for scheme, p in pc.items():
            pr += [(rid, s, cid, scheme, float(v)) for s, v in zip(tp.sid, p) if not np.isnan(v)]
        if final is not None:
            pr += [(rid, s, cid, "final_fit", float(v)) for s, v in zip(tp.sid, final)]
    pdb.write_rows(con, "prediction", pr)
    print(f"db: run {rid}, {len(rows)} rows, {len(out)} feature values, {len(pr)} predictions")


def feature_status(f, r, v) -> str:
    if f == "draft_age":
        return "estimated" if not pd.isna(v) else "missing"
    if f in ("breakout_age",) and r.pos == "QB":
        return "inapplicable"
    if f == "weight" and not pd.isna(v):
        return "observed"   # combine weight, else last college roster weight: both measured
    return "missing" if pd.isna(v) else "observed"


def self_check():
    g = np.array([2008, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2020])
    for c in test_classes(g, "fwd"):
        assert c >= FWD_START and g[fold_mask(g, "fwd", c, 3)].max() <= c - 3
    w = np.where(np.arange(len(g)) % 2, 4, 3)          # pooled: each row keeps its own window
    for c in test_classes(g, "fwd"):
        m = fold_mask(g, "fwd", c, w)
        assert (g[m] <= c - w[m]).all()
    for c in test_classes(g, "loco"):
        tr = g[fold_mask(g, "loco", c, 3)]
        assert c not in tr and tr.max() <= DEV_END
    rules, v = decide({"gain": 0.01, "boot": {"p": 0.95}, "regime_2020": {"base": 0.3, "cand": 0.29},
                       "cand": {"slope": 1.0}}, {"gain": 0.002})
    assert v.startswith("pass")
    rules, v = decide({"gain": 0.01, "boot": {"p": 0.85}, "regime_2020": {"base": 0.3, "cand": 0.29},
                       "cand": {"slope": 1.0}}, {"gain": 0.002})
    assert v == "reject", "bootstrap under 90% must reject"
    print("experiments self-check OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        self_check()
        return
    ids = list(CANDIDATES) if a.ids in ([], ["all"]) else a.ids
    unknown = set(ids) - set(CANDIDATES)
    assert not unknown, f"not pre-registered: {unknown}"
    run(ids)


if __name__ == "__main__":
    main()
