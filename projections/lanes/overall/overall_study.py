"""Lane `overall`: VOR3 target, C0/K0/M1/P1 expanding-window scoring, gates, 0-100 rating, panel.

Spec: notes/prospect-research/lanes/overall/prereg.md + addendum-2026-10-05.md (both fixed before
scoring). Reads the store copy named by PROSPECT_DB and the nflverse cache; writes only
notes/prospect-research/lanes/overall/results.{md,json}. The FantasyPros ECR (K0) is read from the
local scratch dir and never written out: only aggregate metrics leave.

    export NFLVERSE_CACHE=".../projections/nflverse-cache"
    export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/ea66a469/tmp/overall/prospect.sqlite"
    python projections/lanes/overall/overall_study.py
"""
from __future__ import annotations

import json
import os
import pathlib
import pickle
import re
import sys
import warnings
import zlib

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import SplineTransformer

warnings.filterwarnings("ignore")
WT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "projections"))
assert os.environ.get("PROSPECT_DB"), "set PROSPECT_DB to the lane's store copy"
import build_prospect_model as bpm  # noqa: E402

SCR = pathlib.Path(os.environ.get("OVERALL_SCRATCH", r"C:/Users/TrevorWhite/.claude/jobs/ea66a469/tmp/overall"))
OUT = WT / "notes" / "prospect-research" / "lanes" / "overall"
POS = ("QB", "RB", "WR", "TE")
CLASSES = range(2008, 2024)
SCORED = range(2012, 2024)
K0_CLASSES = range(2019, 2024)
UDFA_PICK = 262
NB = 2000
NB_INT = 200
RNG = np.random.default_rng(20261005)
FMTS = ("F1", "F2", "F3")
TIERS = [("Elite", 95), ("Strong", 85), ("Solid", 65), ("Dart", 35), ("Long shot", 0)]
say = print


# ----------------------------------------------------------------------------- data

def leagues():
    t = (WT / "site" / "data" / "leagues.js").read_text(encoding="utf8")
    arr, _ = json.JSONDecoder().raw_decode(t[t.index("=") + 1:].lstrip())
    by = {l["name"].strip(): l for l in arr}
    return by["Password is taco"], by["The League"]


DEF_W = dict(pass_yd=0.04, pass_td=4, pass_int=-1, rush_yd=0.1, rush_td=6, rec=1, rec_yd=0.1, rec_td=6,
             fum_lost=-2, pass_2pt=2, rush_2pt=2, rec_2pt=2)
STAT = dict(pass_yd="passing_yards", pass_td="passing_tds", pass_int="passing_interceptions",
            rush_yd="rushing_yards", rush_td="rushing_tds", rec="receptions", rec_yd="receiving_yards",
            rec_td="receiving_tds", pass_2pt="passing_2pt_conversions", rush_2pt="rushing_2pt_conversions",
            rec_2pt="receiving_2pt_conversions")
FUM = ["sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost"]


def score(stats, lg, te_bonus=0.0):
    sc = lg.get("scoring") or {}
    w = {k: sc.get(k, v) for k, v in DEF_W.items()}
    pts = sum(stats[c].fillna(0) * w[k] for k, c in STAT.items())
    pts = pts + stats[FUM].fillna(0).sum(axis=1) * w["fum_lost"]
    return pts + np.where(stats.spos.eq("TE"), stats.receptions.fillna(0) * te_bonus, 0.0)


def slots(lg):
    rp = lg["roster_positions"]
    n = lg["total_rosters"]
    return n, {p: rp.count(p) * n for p in ("QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX")}


def replacement(season_df, sl):
    """Greedy fill, dedicated then FLEX (RB/WR/TE) then SUPER_FLEX; replacement = best unstarted."""
    s = season_df.sort_values("pts", ascending=False)
    started = set()
    for p in POS:
        started.update(s[s.spos == p].index[:sl[p]])
    rest = s[~s.index.isin(started)]
    started.update(rest[rest.spos.isin(["RB", "WR", "TE"])].index[:sl["FLEX"]])
    rest = s[~s.index.isin(started)]
    started.update(rest.index[:sl["SUPER_FLEX"]])
    rest = s[~s.index.isin(started)]
    return {p: float(rest[rest.spos == p].pts.max()) for p in POS}


def nfl_values():
    # The store's nfl_player_season keeps only a trimmed column set; the raw stat line lives in the
    # same nflverse file in the cache (addendum point 1).
    stats = pd.concat([pd.read_parquet(bpm.CACHE / f"stats_player_reg_{y}.parquet")
                       for y in range(2008, bpm.LAST_NFL + 1)], ignore_index=True)
    missing = [c for c in list(STAT.values()) + FUM if c not in stats]
    assert not missing, f"raw stat columns missing: {missing}"
    if "season_type" in stats:
        stats = stats[stats.season_type.eq("REG")]
    sp = bpm.season_positions()
    stats["spos"] = pd.Series(pd.MultiIndex.from_arrays([stats.player_id, stats.season]).map(sp),
                              index=stats.index).fillna(stats.position).replace({"FB": "RB"})
    stats = stats[stats.spos.isin(POS)].copy()
    f1, f2 = leagues()
    fm = {"F1": (f1, 0.0), "F2": (f2, 0.0), "F3": (f1, 0.5)}
    repl, sl_info = {}, {}
    for f, (lg, bon) in fm.items():
        stats[f"pts_{f}"] = score(stats, lg, bon)
        n, sl = slots(lg)
        sl_info[f] = {"teams": n, **sl}
        rows = []
        for yr, g in stats.groupby("season"):
            r = replacement(g.rename(columns={f"pts_{f}": "pts"})[["spos", "pts"]], sl)
            rows.append({"season": int(yr), **r})
        repl[f] = pd.DataFrame(rows).set_index("season")
        rv = pd.Series(pd.MultiIndex.from_arrays([stats.season, stats.spos]).map(
            lambda k: repl[f].at[k[0], k[1]]), index=stats.index)
        stats[f"vor_{f}"] = (stats[f"pts_{f}"] - rv).clip(lower=0)
    return stats[["player_id", "season", "spos"] + [f"{k}_{f}" for f in FMTS for k in ("pts", "vor")]], repl, sl_info


def targets(pop, sv):
    m = pop[["sid", "gsis_id", "draft_year"]].merge(sv, left_on="gsis_id", right_on="player_id")
    m["yr"] = m.season - m.draft_year + 1
    out = pop.set_index("sid")
    for f in FMTS:
        g3 = m[m.yr.between(1, 3)].groupby("sid")[f"vor_{f}"]
        out[f"vor3_{f}"] = g3.sum()
        out[f"peak3_{f}"] = g3.max()
        out[f"vor4_{f}"] = m[m.yr.between(1, 4)].groupby("sid")[f"vor_{f}"].sum()
        for c in ("vor3", "peak3", "vor4"):
            out[f"{c}_{f}"] = out[f"{c}_{f}"].fillna(0.0)
        out.loc[out.draft_year > 2022, f"vor4_{f}"] = np.nan
        out.loc[out.draft_year > 2023, [f"vor3_{f}", f"peak3_{f}"]] = np.nan
    return out.reset_index()


def udfas(ps, bio, age0, draft):
    pl = bpm.read_src("nfl_player", "players.parquet")
    u = pl[pl.draft_pick.isna() & ~pl.gsis_id.isin(draft.gsis_id.dropna())
           & pl.position.isin(list(POS) + ["FB"]) & pl.rookie_season.between(2008, 2023)].copy()
    u = u.assign(season=u.rookie_season.astype(int), pfr_player_name=u.display_name, college=u.college_name)
    u.index = range(len(u))
    lm = {}
    u["player_id"] = bpm.link_college(u, u.espn_id, ps, lm)
    u["link_method"] = pd.Series(lm).reindex(u.index).fillna("none")
    n_all = len(u)
    u = u[u.player_id.notna()].copy()
    u["player_id"] = u.player_id.astype(int)
    u["pos"] = u.position.replace({"FB": "RB"})
    u["draft_year"] = u.season
    u["cutoff"] = u.season - 1
    u["pick"] = UDFA_PICK
    u["log_pick"] = np.log(UDFA_PICK)
    u["dob"] = pd.to_datetime(u.birth_date, errors="coerce")
    u = u.join(bio[["hs_class", "stars", "ros_weight"]], on="player_id")
    cmb = bpm.bpp.add_drill_percentiles(bpm.read_src("nfl_combine", "combine.parquet"))
    cmb = cmb.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")
    u["forty"] = u.pfr_id.map(cmb["forty"])
    u["weight"] = u.pfr_id.map(cmb["wt"]).fillna(u.ros_weight)
    u["speed_score"] = [bpm.bpp.speed_score(w, f) for w, f in zip(u.weight, u.forty)]
    u["sid"] = "u" + u.index.astype(str)
    u["pfr_player_name"] = u.display_name
    feats = bpm.career_features(u.assign(dob=pd.NaT), ps, age0)
    u = u.merge(feats, on="sid", how="left")
    u["udfa"] = True
    return u, n_all


def upcoming(ps, bio, age0):
    cur = ps[ps.season == bpm.SEASON].player_id.dropna().unique()
    cand = bio.loc[bio.index.isin(cur)].copy()
    cand = cand[cand.ros_pos.isin(POS)]
    s = cand.reset_index().rename(columns={"index": "player_id", "ros_pos": "pos"})
    s = s[s.player_id > 0]
    s["draft_year"] = np.maximum(bpm.SEASON + 1, s.hs_class + 3)
    s = s[s.draft_year.isin([2027, 2028])].copy()
    s["cutoff"] = bpm.LAST_NFL
    s["dob"] = pd.NaT
    s["sid"] = "c" + s.player_id.astype(int).astype(str)
    s = s.merge(bpm.career_features(s, ps, age0), on="sid", how="left").rename(columns={"ros_weight": "weight"})
    s["early"] = ((s.n_seasons + (s.draft_year - 1 - bpm.LAST_NFL)) <= 3).astype(float)
    s["speed_score"] = np.nan
    s = s[(s.n_qual >= 1) & ((s.pos != "QB") | (s.starts >= 1))]
    s["pfr_player_name"] = s.name_final
    return s


def load():
    pk = SCR / "overall_data.pkl"
    if pk.exists():
        return pickle.loads(pk.read_bytes())
    ps, bio, d, t, age0 = bpm.prepare(say)
    feat_cols = [c for c in t.columns if c not in d.columns]
    dr = d.merge(t[["sid"] + feat_cols], on="sid", how="left")
    dr["udfa"] = False
    u, n_udfa_all = udfas(ps, bio, age0, d)
    up = upcoming(ps, bio, age0)
    sv, repl, sl = nfl_values()
    pop = pd.concat([dr, u], ignore_index=True)
    pop = pop[pop.draft_year >= 2008]
    pop = targets(pop, sv)
    data = dict(pop=pop, up=up, repl=repl, slots=sl, n_udfa_all=n_udfa_all, age0=age0)
    pk.write_bytes(pickle.dumps(data))
    return data


# ----------------------------------------------------------------------------- models

def feat_list(pos):
    return list(dict.fromkeys(bpm.FEATS[pos] + ["draft_age", "early"]))


class Design:
    """Training-window imputation and scaling, missingness flags, optional log-pick spline."""

    def __init__(self, tr, pos, capital):
        self.f = feat_list(pos)
        self.capital = capital
        X = tr[self.f].astype(float)
        self.med = X.median().fillna(0.0)
        self.flags = [c for c in self.f if X[c].isna().any()]
        Z = self._raw(tr)
        self.mu, self.sd = Z.mean(0), Z.std(0)
        self.sd[self.sd == 0] = 1.0
        if capital:
            self.spl = SplineTransformer(n_knots=5, degree=3, extrapolation="linear").fit(tr[["log_pick"]])

    def _raw(self, df):
        X = df[self.f].astype(float)
        parts = [X.fillna(self.med).to_numpy(), X[self.flags].isna().to_numpy(float),
                 df.player_id.isna().to_numpy(float)[:, None]]
        return np.hstack(parts)

    def __call__(self, df):
        Z = (self._raw(df) - self.mu) / self.sd
        if self.capital:
            Z = np.hstack([Z, self.spl.transform(df[["log_pick"]])])
        return Z


ALPHAS = np.logspace(-2, 4, 25)


def fit_predict(kind, tr, te, ycol):
    """Per-position fit on tr, prediction for te. kind: C0, M1 or P1."""
    out = pd.Series(np.nan, index=te.index)
    for pos in POS:
        a, b = tr[tr.pos == pos], te[te.pos == pos]
        if b.empty or len(a) < 10:
            continue
        y = a[ycol].to_numpy(float)
        if kind == "C0":
            m = IsotonicRegression(increasing=False, out_of_bounds="clip").fit(a.pick.astype(float), y)
            out[b.index] = m.predict(b.pick.astype(float))
            continue
        D = Design(a, pos, capital=(kind == "M1"))
        m = RidgeCV(alphas=ALPHAS).fit(D(a), y)
        out[b.index] = np.clip(m.predict(D(b)), 0, None)
    return out


def expanding(pop, kind, ycol, embargo=1):
    preds = pd.Series(np.nan, index=pop.index)
    for Y in SCORED:
        tr = pop[pop.draft_year <= Y - embargo]
        te = pop[pop.draft_year == Y]
        preds[te.index] = fit_predict(kind, tr, te, ycol)
    return preds


# ----------------------------------------------------------------------------- K0 (local only)

def nk(s):
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", str(s).lower())
    return re.sub(r"[^a-z]", "", s)


K0_SNAP = {2019: ("a:20190423", "a:20190430"), 2020: ("a:20200421", "d:2020-04-26"),
           2021: ("d:2021-04-28", "d:2021-05-07"), 2022: ("d:2022-04-22", "d:2022-05-06"),
           2023: ("d:2023-04-21", "d:2023-05-05")}


def k0_ranks(pop):
    """sid -> rank for each (class, pre/post) snapshot. Values never leave this process."""
    db = pd.read_parquet(SCR / "db_fpecr.parquet", columns=["player", "pos", "ecr", "page_type", "ecr_type", "scrape_date"])
    db["day"] = pd.to_datetime(db.scrape_date).dt.strftime("%Y-%m-%d")
    db = db[(db.page_type.eq("dynasty-rk")) | (db.ecr_type.eq("rookies"))]
    res, counts = {}, {}
    for Y, snaps in K0_SNAP.items():
        cls = pop[(pop.draft_year == Y)]
        keys = cls.pfr_player_name.map(nk)
        for tag, snap in zip(("pre", "post"), snaps):
            src, val = snap.split(":")
            if src == "a":
                a = pd.read_csv(SCR / f"rookies-{val}.csv")
                rows = [(nk(r["Rookies (Team)"]), re.sub(r"\d", "", str(r.Pos)), float(re.match(r"\s*(\d+)", str(r.Rank)).group(1))) for _, r in a.iterrows()
                        if re.match(r"\s*\d+", str(r.Rank))]  # scraped cells can carry ad markup after the rank
                rk = {}
                for sid, k, p in zip(cls.sid, keys, cls.pos):
                    hit = [rank for key, rp, rank in rows if rp == p and k and key.startswith(k)]
                    if hit:
                        rk[sid] = min(hit)
            else:
                s = db[db.day == val].sort_values("ecr").drop_duplicates(["player", "pos"])
                lut = {(nk(n), p): e for n, p, e in zip(s.player, s.pos, s.ecr)}
                rk = {sid: lut[(k, p)] for sid, k, p in zip(cls.sid, keys, cls.pos) if (k, p) in lut}
            res[(Y, tag)] = rk
            counts[f"{Y}_{tag}"] = len(rk)
    return res, counts


# ----------------------------------------------------------------------------- metrics

def ndcg(y, p, k=24):
    o = np.lexsort((np.arange(len(p)), -p))[:k]
    disc = 1 / np.log2(np.arange(2, k + 2))
    dcg = (y[o] * disc[:len(o)]).sum()
    ideal = (np.sort(y)[::-1][:k] * disc[:min(k, len(y))]).sum()
    return dcg / ideal if ideal > 0 else np.nan


def per_class(df, pcol, ycol, thr):
    """Per-class stats: pooled Spearman, per-position Spearman, NDCG@24, precision@24, abs err."""
    rows = {}
    for Y, g in df.groupby("draft_year"):
        g = g.dropna(subset=[pcol])
        y, p = g[ycol].to_numpy(float), g[pcol].to_numpy(float)
        r = {"sp": spearmanr(p, y).correlation if len(g) > 2 and np.ptp(p) > 0 else np.nan,
             "ndcg": ndcg(y, p), "n": len(g)}
        top = np.lexsort((np.arange(len(p)), -p))[:24]
        r["prec"] = float((y[top] > thr).mean())
        r["ae"] = float(np.abs(p - y).sum())
        for pos in POS:
            h = g[g.pos == pos]
            r[f"sp_{pos}"] = (spearmanr(h[pcol], h[ycol]).correlation
                              if len(h) > 2 and np.ptp(h[pcol]) > 0 else np.nan)
        rows[Y] = r
    return pd.DataFrame(rows).T


def boot_idx(classes, n=NB, seed=7):
    r = np.random.default_rng(seed)
    return r.integers(0, len(classes), size=(n, len(classes)))


def summarize(pc, idx, mae=True):
    """Point estimate and 90% interval over class resamples for each metric."""
    out = {}
    A = pc.to_numpy(float)
    cols = list(pc.columns)
    for m in ["sp", "ndcg", "prec"] + [f"sp_{p}" for p in POS] + (["mae"] if mae else []):
        if m == "mae":
            pt = A[:, cols.index("ae")].sum() / A[:, cols.index("n")].sum()
            bs = A[idx, cols.index("ae")].sum(1) / A[idx, cols.index("n")].sum(1)
        else:
            v = A[:, cols.index(m)]
            pt = np.nanmean(v)
            bs = np.nanmean(v[idx], axis=1)
        out[m] = {"est": float(pt), "lo": float(np.nanpercentile(bs, 5)), "hi": float(np.nanpercentile(bs, 95))}
    return out, {m: (np.nanmean(A[:, cols.index(m)][idx], axis=1)) for m in ["sp", "ndcg", "prec"]}


def paired(a_pc, b_pc, idx, m="sp"):
    d = a_pc[m].to_numpy(float) - b_pc[m].reindex(a_pc.index).to_numpy(float)
    bs = np.nanmean(d[idx], axis=1)
    return {"est": float(np.nanmean(d)), "lo": float(np.percentile(bs, 5)), "hi": float(np.percentile(bs, 95)),
            "share_gt0": float((bs > 0).mean())}


# ----------------------------------------------------------------------------- main

def rating(ref, v):
    ref = np.sort(ref)
    lo = np.searchsorted(ref, v, side="left")
    hi = np.searchsorted(ref, v, side="right")
    return 100.0 * (lo + 0.5 * (hi - lo)) / len(ref)


def tier(r):
    return next(n for n, c in TIERS if r >= c)


PANEL = [("Christian McCaffrey", 2017), ("Saquon Barkley", 2018), ("Justin Jefferson", 2020), ("CeeDee Lamb", 2020),
         ("Jonathan Taylor", 2020), ("Ja'Marr Chase", 2021), ("Bijan Robinson", 2023),
         ("Trent Richardson", 2012), ("Corey Davis", 2017), ("John Ross", 2017), ("N'Keal Harry", 2019),
         ("Jalen Reagor", 2020), ("Kadarius Toney", 2021), ("Zach Wilson", 2021), ("Eric Ebron", 2014),
         ("Tyreek Hill", 2016), ("Cooper Kupp", 2017), ("George Kittle", 2017), ("Austin Ekeler", 2017),
         ("Mark Andrews", 2018), ("Amon-Ra St. Brown", 2021), ("Kyren Williams", 2022), ("Brock Purdy", 2022),
         ("Puka Nacua", 2023), ("Tyler Boyd", 2016), ("Devin Singletary", 2019), ("Darrell Henderson", 2019),
         ("Michael Pittman", 2020), ("Cole Kmet", 2020), ("Patrick Mahomes", 2017), ("Josh Allen", 2018),
         ("Lamar Jackson", 2018), ("Justin Fields", 2021), ("Jeremiyah Love", 2026), ("Eli Stowers", 2026),
         ("Kenyon Sadiq", 2026)]


def find(pop, name, yr):
    k = nk(name)
    m = pop[(pop.draft_year == yr) & pop.pfr_player_name.map(lambda s: nk(s).startswith(k))]
    return m.index[0] if len(m) else None


def main():
    D = load()
    pop, up = D["pop"], D["up"]
    hist = pop[pop.draft_year.between(2008, 2023)].copy()
    say(f"population: {len(hist)} drafted+udfa rows 2008-2023 ({(~hist.udfa).sum()} drafted, {hist.udfa.sum()} udfa)")
    R = {"addendum": "addendum-2026-10-05.md", "slots": D["slots"], "n_udfa_candidates": int(D["n_udfa_all"])}

    # A. targets, replacement, coverage
    R["replacement"] = {f: D["repl"][f].round(2).to_dict(orient="index") for f in ("F1", "F2")}
    dr = hist[~hist.udfa]
    cov = dr.groupby(["draft_year", "pos"]).agg(n=("sid", "size"), linked=("player_id", lambda s: s.notna().mean()),
                                               gsis=("gsis_id", lambda s: s.notna().mean()),
                                               any_vor=("vor3_F1", lambda s: (s > 0).mean()))
    R["coverage"] = {f"{y}_{p}": {k: round(float(v), 4) for k, v in r.items()} for (y, p), r in cov.iterrows()}
    R["coverage_total"] = {"drafted": int(len(dr)), "linked": float(dr.player_id.notna().mean()),
                           "gsis": float(dr.gsis_id.notna().mean()),
                           "udfa_linked": int(hist.udfa.sum()), "udfa_candidates": int(D["n_udfa_all"])}
    thr = {f: float(np.percentile(dr[f"vor3_{f}"], 75)) for f in FMTS}
    R["p75"] = thr
    R["target_summary"] = {f: {p: {"mean": float(g[f"vor3_{f}"].mean()), "share_pos": float((g[f"vor3_{f}"] > 0).mean())}
                               for p, g in dr.groupby("pos")} for f in FMTS}

    # B. forecasts
    pops = {"drafted": hist[~hist.udfa].copy(), "with_udfa": hist.copy()}
    preds = {}
    for v, P in pops.items():
        for f in FMTS:
            for kind in ("C0", "M1", "P1"):
                preds[(v, f, kind)] = expanding(P, kind, f"vor3_{f}")
                say(f"  fit {v} {f} {kind}")
    emb = {k: expanding(pops["drafted"], k, "vor3_F1", embargo=3) for k in ("C0", "M1")}

    idx_all = boot_idx(list(SCORED))
    idx_k = boot_idx(list(K0_CLASSES), seed=11)
    K, kcounts = k0_ranks(hist)
    R["k0_matched"] = kcounts
    R["metrics"], R["paired"], R["k0"] = {}, {}, {}
    pcs = {}
    for v, P in pops.items():
        for f in FMTS:
            S = P[P.draft_year.isin(SCORED)].copy()
            for kind in ("C0", "M1", "P1"):
                S[kind] = preds[(v, f, kind)]
                pcs[(v, f, kind)] = per_class(S, kind, f"vor3_{f}", thr[f])
                R["metrics"][f"{v}|{f}|{kind}"] = summarize(pcs[(v, f, kind)], idx_all)[0]
            R["paired"][f"{v}|{f}|M1-C0"] = paired(pcs[(v, f, "M1")], pcs[(v, f, "C0")], idx_all)
            # K0 subset comparisons, 2019-2023
            kk = {}
            for tag in ("pre", "post"):
                sub_rows = []
                for Y in K0_CLASSES:
                    rk = K[(Y, tag)]
                    g = S[(S.draft_year == Y) & S.sid.isin(rk)].copy()
                    g["K0"] = -g.sid.map(rk)
                    sub_rows.append(g)
                sub = pd.concat(sub_rows)
                kk[tag] = {kind: per_class(sub, kind, f"vor3_{f}", thr[f]) for kind in ("K0", "C0", "M1", "P1")}
                # sensitivity: uncovered tied last, on the full class
                full = S[S.draft_year.isin(K0_CLASSES)].copy()
                full["K0"] = [-K[(int(y_), tag)].get(s_, 1e6) for s_, y_ in zip(full.sid, full.draft_year)]
                kk[tag + "_tiedlast"] = {kind: per_class(full, kind, f"vor3_{f}", thr[f]) for kind in ("K0", "M1", "P1", "C0")}
            R["k0"][f"{v}|{f}"] = {
                t: {kind: summarize(pc, idx_k, mae=(kind != "K0"))[0] for kind, pc in d_.items()} for t, d_ in kk.items()}
            R["paired"][f"{v}|{f}|M1-K0post"] = paired(kk["post"]["M1"], kk["post"]["K0"], idx_k)
            R["paired"][f"{v}|{f}|P1-K0pre"] = paired(kk["pre"]["P1"], kk["pre"]["K0"], idx_k)
            R["paired"][f"{v}|{f}|C0-K0post"] = paired(kk["post"]["C0"], kk["post"]["K0"], idx_k)
    Sd = pops["drafted"][pops["drafted"].draft_year.isin(SCORED)].copy()
    for k in ("C0", "M1"):
        Sd[k + "e"] = emb[k]
    R["embargo_F1"] = {k: summarize(per_class(Sd, k + "e", "vor3_F1", thr["F1"]), idx_all)[0]["sp"] for k in ("C0", "M1")}
    R["embargo_F1"]["M1-C0"] = paired(per_class(Sd, "M1e", "vor3_F1", thr["F1"]),
                                      per_class(Sd, "C0e", "vor3_F1", thr["F1"]), idx_all)

    # C. gates (F1, drafted)
    g1 = R["paired"]["drafted|F1|M1-C0"]
    g2 = R["paired"]["drafted|F1|M1-K0post"]
    g3 = R["paired"]["drafted|F1|P1-K0pre"]
    m1_ships = g1["share_gt0"] >= 0.90 and g2["est"] >= -0.05
    p1_shows = g3["est"] >= -0.05
    R["gates"] = {"M1_beats_C0_share": g1["share_gt0"], "M1_minus_K0post": g2["est"], "M1_ships": bool(m1_ships),
                  "P1_minus_K0pre": g3["est"], "P1_shown": bool(p1_shows),
                  "published_post_draft": "M1" if m1_ships else "C0"}
    for f in ("F2", "F3"):
        R["gates"][f"{f}_check"] = {"M1_beats_C0_share": R["paired"][f"drafted|{f}|M1-C0"]["share_gt0"],
                                    "M1_minus_K0post": R["paired"][f"drafted|{f}|M1-K0post"]["est"],
                                    "P1_minus_K0pre": R["paired"][f"drafted|{f}|P1-K0pre"]["est"]}
    pub = R["gates"]["published_post_draft"]
    say(f"gates: {R['gates']}")

    # D. ratings, tiers, panel (F1 and F2, drafted population)
    P = pops["drafted"]
    R["tier_table"], R["panel"], R["upcoming"] = {}, {}, {}
    for f in ("F1", "F2"):
        y = f"vor3_{f}"
        S = P[P.draft_year.isin(SCORED)].copy()
        ref = {k: preds[("drafted", f, k)].reindex(S.index).to_numpy() for k in ("C0", "M1", "P1")}
        assert not any(np.isnan(v).any() for v in ref.values()), "missing OOS predictions"
        S["rating"] = rating(ref[pub], ref[pub])
        S["tier"] = S.rating.map(tier)
        R["tier_table"][f] = {t: {"n": int(len(g)), "median_vor3": float(g[y].median()),
                                  "share_above_p75": float((g[y] > thr[f]).mean())}
                              for t, g in S.groupby("tier")}
        # Panel: OOS prediction for history, full-history fit for 2026; UDFAs from the UDFA-inclusive fit.
        rows = []
        cur = pop[pop.draft_year == 2026]
        cur_pred = {k: fit_predict(k, P, cur, y) for k in ("C0", "M1", "P1")}
        for name, yr in PANEL:
            src = pop if yr == 2026 else hist
            i = find(src, name, yr)
            if i is None:
                rows.append({"name": name, "class": yr, "found": False})
                continue
            row = src.loc[i]
            if yr == 2026:
                e = {k: float(cur_pred[k][i]) for k in cur_pred}
                cls = cur.assign(**{k: cur_pred[k] for k in cur_pred})
            else:
                v = "with_udfa" if row.udfa else "drafted"
                e = {k: float(preds[(v, f, k)][i]) for k in ("C0", "M1", "P1")}
                base = pops[v]
                cls = base[base.draft_year == yr].assign(**{k: preds[(v, f, k)].reindex(base[base.draft_year == yr].index)
                                                            for k in ("C0", "M1", "P1")})
            r_pub = float(rating(ref[pub], e[pub]))
            rows.append({
                "name": name, "class": yr, "pos": row.pos, "pick": int(row.pick), "udfa": bool(row.udfa),
                "linked": bool(pd.notna(row.player_id)),
                "rating": r_pub, "tier": tier(r_pub),
                "rating_M1": float(rating(ref["M1"], e["M1"])), "rating_C0": float(rating(ref["C0"], e["C0"])),
                "profile_pct_P1": float(rating(ref["P1"], e["P1"])),
                "rank_class": int((cls[pub] > e[pub]).sum() + 1), "n_class": int(len(cls)),
                "rank_pos": int((cls[cls.pos == row.pos][pub] > e[pub]).sum() + 1),
                "exp_C0": e["C0"], "exp_M1": e["M1"], "exp_P1": e["P1"],
                "actual_vor3": None if yr == 2026 else float(row[y]),
                "feats": {c: (None if pd.isna(row.get(c)) else float(row.get(c))) for c in feat_list(row.pos)},
            })
        # Interval: class-bootstrap refits of the published forecast and M1 on each panel player's window.
        for r in rows:
            if not r.get("found", True):
                continue
            src = pop if r["class"] == 2026 else hist
            i = find(src, r["name"], r["class"])
            base = pops["with_udfa" if r["udfa"] else "drafted"]
            tr0 = base[(base.draft_year < r["class"]) & (base.draft_year <= 2023)]
            cl = np.array(sorted(tr0.draft_year.unique()))
            te = src.loc[[i]]
            sims = {k: [] for k in {pub, "M1"}}
            rr = np.random.default_rng(zlib.crc32(f"{r['name']}|{f}".encode()))
            grp = {c: tr0[(tr0.draft_year == c) & (tr0.pos == r["pos"])] for c in cl}
            for _ in range(NB_INT):
                tr = pd.concat([grp[c] for c in rr.choice(cl, len(cl))], ignore_index=True)
                for k in sims:
                    sims[k].append(float(fit_predict(k, tr, te, y).iloc[0]))
            for k, s in sims.items():
                r[f"int_{k}"] = [float(np.nanpercentile(s, 5)), float(np.nanpercentile(s, 95))]
        R["panel"][f] = rows
        # Upcoming classes under P1 (profile only).
        u = up.copy()
        u["P1"] = fit_predict("P1", P, u, y)
        u["p1_pct"] = rating(ref["P1"], u.P1.to_numpy())
        R["upcoming"][f] = {int(c): [{"name": g2_.name_final, "pos": g2_.pos, "school": g2_.pos_team_final,
                                      "exp_P1": float(g2_.P1), "profile_pct": float(g2_.p1_pct)}
                                     for _, g2_ in g.nlargest(5, "P1").iterrows()]
                            for c, g in u.groupby("draft_year")}
        R.setdefault("upcoming_n", {})[f] = {int(c): int(len(g)) for c, g in u.groupby("draft_year")}
        say(f"  {f} panel + upcoming done")

    (OUT / "results.json").write_text(json.dumps(R, indent=1, default=float), encoding="utf8")
    write_md(R)
    say("wrote results.json, results.md")


def ci(d, nd=3):
    return f"{d['est']:.{nd}f} [{d['lo']:.{nd}f}, {d['hi']:.{nd}f}]"


def write_md(R):
    L = []
    nar = OUT / "results-narrative.md"
    if nar.exists():
        L += [nar.read_text(encoding="utf8").rstrip(), ""]
    L += ["## Generated tables", "", "All values unrounded at source (`results.json`); shown to 3-4 places. "
          "Intervals are 90% from 2000 class resamples (12 classes 2012-2023; K0 rows 5 classes 2019-2023).", ""]
    ct = R["coverage_total"]
    L += [f"Coverage: {ct['drafted']} drafted QB/RB/WR/TE 2008-2023, {ct['linked']:.1%} linked to a college record, "
          f"{ct['gsis']:.1%} with an NFL id; {ct['udfa_linked']} of {ct['udfa_candidates']} UDFA candidates linked and kept. "
          f"75th percentile VOR3: F1 {R['p75']['F1']:.2f}, F2 {R['p75']['F2']:.2f}, F3 {R['p75']['F3']:.2f}.", ""]
    L += ["### Forecast metrics, drafted population", "",
          "| fmt | model | pooled Spearman | NDCG@24 | prec@24 | MAE | QB | RB | WR | TE |", "|---|---|---|---|---|---|---|---|---|---|"]
    for v in ("drafted", "with_udfa"):
        if v == "with_udfa":
            L += ["", "### Same, UDFAs added (pick 262)", "",
                  "| fmt | model | pooled Spearman | NDCG@24 | prec@24 | MAE | QB | RB | WR | TE |", "|---|---|---|---|---|---|---|---|---|---|"]
        for f in FMTS:
            for k in ("C0", "M1", "P1"):
                m = R["metrics"][f"{v}|{f}|{k}"]
                L.append(f"| {f} | {k} | {ci(m['sp'])} | {ci(m['ndcg'])} | {ci(m['prec'])} | {ci(m['mae'], 2)} | "
                         + " | ".join(f"{m['sp_' + p]['est']:.3f}" for p in POS) + " |")
    L += ["", "### K0 comparison, 2019-2023, K0-covered subset (drafted)", "",
          "| fmt | snapshot | K0 | C0 | M1 | P1 |", "|---|---|---|---|---|---|"]
    for f in FMTS:
        for t in ("pre", "post", "pre_tiedlast", "post_tiedlast"):
            k = R["k0"][f"drafted|{f}"][t]
            L.append(f"| {f} | {t} | " + " | ".join(ci(k[m]["sp"]) for m in ("K0", "C0", "M1", "P1")) + " |")
    L += ["", f"K0 matched players per snapshot: {R['k0_matched']}", "", "### Paired differences (pooled Spearman)", "",
          "| key | est [90%] | share > 0 |", "|---|---|---|"]
    for k, d in R["paired"].items():
        L.append(f"| {k} | {ci(d)} | {d['share_gt0']:.4f} |")
    e = R["embargo_F1"]
    L += ["", f"Embargo sensitivity (F1, train on classes <= Y-3): C0 {ci(e['C0'])}, M1 {ci(e['M1'])}, "
          f"M1-C0 {ci(e['M1-C0'])} (share > 0 {e['M1-C0']['share_gt0']:.4f}).", "", "### Gates (F1)", "",
          "```", json.dumps(R["gates"], indent=1), "```", ""]
    for f in ("F1", "F2"):
        L += [f"### Tier outcomes, {f} (drafted 2012-2023, published forecast)", "",
              "| tier | n | median VOR3 | share > p75 |", "|---|---|---|---|"]
        for t, _ in TIERS:
            d = R["tier_table"][f].get(t)
            if d:
                L.append(f"| {t} | {d['n']} | {d['median_vor3']:.2f} | {d['share_above_p75']:.3f} |")
        L += ["", f"### Panel, {f}", "",
              "| player | cls | pos | pick | rating | tier | rank cls/pos | M1 rating | C0 rating | profile pct | exp (published) [90%] | exp M1 [90%] | actual VOR3 |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        pub = R["gates"]["published_post_draft"]
        for r in R["panel"][f]:
            if not r.get("found", True):
                L.append(f"| {r['name']} | {r['class']} | not found |  |  |  |  |  |  |  |  |  |  |")
                continue
            ex = f"{r['exp_' + pub]:.1f} [{r['int_' + pub][0]:.1f}, {r['int_' + pub][1]:.1f}]"
            em = f"{r['exp_M1']:.1f} [{r['int_M1'][0]:.1f}, {r['int_M1'][1]:.1f}]"
            act = "" if r["actual_vor3"] is None else f"{r['actual_vor3']:.1f}"
            L.append(f"| {r['name']} | {r['class']} | {r['pos']} | {r['pick']}{' (UDFA)' if r['udfa'] else ''} | "
                     f"{r['rating']:.1f} | {r['tier']} | {r['rank_class']}/{r['rank_pos']} | {r['rating_M1']:.1f} | "
                     f"{r['rating_C0']:.1f} | {r['profile_pct_P1']:.1f} | {ex} | {em} | {act} |")
        L += ["", f"Upcoming classes under P1 ({f}), top five by expected VOR3 (profile percentile vs drafted P1 reference); "
              f"pool sizes {R['upcoming_n'][f]}:", ""]
        for c, lst in R["upcoming"][f].items():
            L.append(f"- {c}: " + "; ".join(f"{x['name']} ({x['pos']}, {x['school']}) {x['exp_P1']:.1f} / pct {x['profile_pct']:.1f}" for x in lst))
        L.append("")
    L += ["### Replacement levels (season points of the best unstarted player)", ""]
    for f in ("F1", "F2"):
        L += [f"{f}:", "", "| season | QB | RB | WR | TE |", "|---|---|---|---|---|"]
        for s, r in R["replacement"][f].items():
            L.append(f"| {s} | " + " | ".join(f"{r[p]:.1f}" for p in POS) + " |")
        L.append("")
    L += ["### Linkage coverage by class (drafted, share linked to college / with any F1 VOR3)", "",
          "| class | QB | RB | WR | TE |", "|---|---|---|---|---|"]
    for Y in CLASSES:
        cells = []
        for p in POS:
            c = R["coverage"].get(f"{Y}_{p}")
            cells.append("" if c is None else f"{int(c['n'])}: {c['linked']:.0%} / {c['any_vor']:.0%}")
        L.append(f"| {Y} | " + " | ".join(cells) + " |")
    (OUT / "results.md").write_text("\n".join(L) + "\n", encoding="utf8")


if __name__ == "__main__":
    if "--md" in sys.argv:
        write_md(json.loads((OUT / "results.json").read_text(encoding="utf8")))
    else:
        main()
