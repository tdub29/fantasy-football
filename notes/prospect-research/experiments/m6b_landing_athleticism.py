"""M6b: M6 with deeper landing-spot and athleticism inputs, scored under validation-charter-v2.md.

Spec fixed in ledger-m6.md (M6b section) before scoring; nothing is tuned. Same model, folds and rows
as M6 (C 0.1 logistic, K0 capital spline, production and age families unchanged). Two families change:
  athleticism  athl_comp: mean within-position percentile of forty, vertical, broad jump, cone, shuttle,
               bench, height and weight (times inverted), with percentiles taken from each fold's
               training rows only; at least 2 measures or it is missing.
  landing      tm_pass_att_prev (as M6), plus from the drafting team's season before the draft:
               vac_share = share of the position's volume (QB pass attempts, RB carries + targets, WR/TE
               targets) by players with no contract covering the draft season among contracts signed
               before the draft year (OTC history via nflverse), and inc_top = the largest single share
               held by a player still under contract. Missing when any volume player has no contract
               record (thin before 2012). Contracts signed in the draft year are ignored: their date is
               unknown, so they could postdate the draft.
               From the prior season's nflverse snap counts (2012+, so draft classes 2013+; missing
               before) and depth charts (2001+), both final before the draft: snap_vac = share of the
               position's offensive snaps held by players with no contract covering the draft season,
               snap_inc = the largest snap share held by a player still under contract, dc_starter_left =
               1 if the final regular-season depth-chart starter at the position has no contract covering
               the draft season. Contract coverage as for vac_share; missing when it is unknown.
K0, BASE and M4 come from M4-oof.csv; M6 is refit here on the same folds.

    python notes/prospect-research/experiments/m6b_landing_athleticism.py   # writes M6b.json
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

EXP = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(EXP))
import m6_feature_families as m6  # noqa: E402

bpm, pe, pdb = m6.bpm, m6.pe, m6.pdb
ROOT = m6.ROOT
METRICS = {"forty": -1, "vertical": 1, "broad_jump": 1, "cone": -1, "shuttle": -1, "bench": 1, "ht": 1, "wt": 1}
VOL = {"QB": ["attempts"], "RB": ["carries", "targets"], "WR": ["targets"], "TE": ["targets"]}


def combine(t, con):
    c = pd.read_sql_query("SELECT pfr_id, forty, vertical, broad_jump, cone, shuttle, bench, ht, wt FROM nfl_combine", con)
    c = c.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")
    c["ht"] = c.ht.map(lambda h: float(h.split("-")[0]) * 12 + float(h.split("-")[1]) if isinstance(h, str) and "-" in h
                       else pd.to_numeric(h, errors="coerce"))
    t = t.copy()
    for k in METRICS:
        t["cmb_" + k] = t.pfr_player_id.map(c[k]).astype(float)
    return t


def athl_comp(train, rows):
    """Mean percentile of each measure among the training rows (higher = better), >= 2 measures."""
    out = []
    for k, sign in METRICS.items():
        ref = np.sort(train["cmb_" + k].dropna().to_numpy() * sign)
        v = rows["cmb_" + k].to_numpy() * sign
        out.append(np.where(np.isnan(v) | (len(ref) == 0), np.nan, np.searchsorted(ref, v, side="right") / max(len(ref), 1)))
    a = np.vstack(out)
    n = (~np.isnan(a)).sum(0)
    with np.errstate(invalid="ignore"):
        return np.where(n >= 2, np.nanmean(a, 0), np.nan)


def landing_b(t, con):
    st = pd.read_sql_query("SELECT player_id, season, recent_team, position, attempts, carries, targets FROM nfl_player_season "
                           "WHERE season_type = 'REG' OR season_type IS NULL", con)
    h = pd.read_parquet(pdb.CACHE / "historical_contracts.parquet",
                        columns=["gsis_id", "year_signed", "years"]).dropna()
    h = h[(h.year_signed > 1990) & (h.years > 0)]
    t = t.copy()
    vac, inc = [], []
    team = t.team.map(lambda x: pe.TEAM.get(x, x))
    for tm, y, pos in zip(team, t.draft_year, t.pos):
        g = st[(st.recent_team == tm) & (st.season == y - 1) & (st.position == pos)]
        vol = g[VOL[pos]].fillna(0).sum(1)
        if vol.sum() <= 0:
            vac.append(np.nan); inc.append(np.nan); continue
        hh = h[(h.gsis_id.isin(g.player_id)) & (h.year_signed <= y - 1)]   # signed before the draft year only
        if not set(g.player_id[vol > 0]) <= set(hh.gsis_id):
            vac.append(np.nan); inc.append(np.nan); continue
        covered = set(hh.gsis_id[hh.year_signed + hh.years - 1 >= y])
        share = vol / vol.sum()
        cov = g.player_id.isin(covered).to_numpy()
        vac.append(float(share[~cov].sum()))
        inc.append(float(share[cov].max()) if cov.any() else 0.0)
    t["vac_share"], t["inc_top"] = vac, inc
    return snaps_depth(t, h)


def covered_set(h, ids, y):
    """(covered gsis ids, all ids have a pre-draft-year contract record) for draft year y."""
    hh = h[(h.gsis_id.isin(ids)) & (h.year_signed <= y - 1)]
    return set(hh.gsis_id[hh.year_signed + hh.years - 1 >= y]), set(ids) <= set(hh.gsis_id)


def snaps_depth(t, h):
    """Prior-season snap and depth-chart landing inputs, plus per-draft-year coverage."""
    cache = pdb.CACHE
    pl = pd.read_parquet(cache / "players.parquet", columns=["gsis_id", "pfr_id"]).dropna().drop_duplicates("pfr_id")
    pfr2g = dict(zip(pl.pfr_id, pl.gsis_id))
    snaps, depth = {}, {}
    for y in sorted(set(t.draft_year.astype(int))):
        s = cache / f"snap_counts_{y - 1}.parquet"
        if s.exists():
            d = pd.read_parquet(s, columns=["game_type", "pfr_player_id", "position", "team", "offense_snaps"])
            d = d[d.game_type == "REG"]
            d["gsis_id"] = d.pfr_player_id.map(pfr2g)
            snaps[y] = d.groupby(["team", "position", "gsis_id"], dropna=False).offense_snaps.sum().reset_index()
        f = cache / f"depth_charts_{y - 1}.parquet"
        if f.exists():
            d = pd.read_parquet(f)
            if "club_code" in d:   # 2001-2024 schema: weekly, depth_team 1 = starter
                d = d[(d.game_type == "REG") & (d.depth_team.astype(str) == "1")]
                d = d.assign(week=pd.to_numeric(d.week, errors="coerce"))
                d = d[d.week == d.groupby("club_code").week.transform("max")]
                depth[y] = d.rename(columns={"club_code": "team", "depth_position": "pos"})[["team", "pos", "gsis_id"]]
                d = None
            else:                  # 2025+ schema: dated snapshots, pos_rank 1 = starter; last one before February
                d = d[(d.pos_rank.astype(str) == "1") & (pd.to_datetime(d.dt).dt.tz_localize(None) < pd.Timestamp(f"{y}-02-01"))]
                d = d[d.dt == d.groupby("team").dt.transform("max")]
                depth[y] = d.rename(columns={"pos_abb": "pos"})[["team", "pos", "gsis_id"]]
    sv, si, dl = [], [], []
    def era(tm, season):   # snap and depth files use the franchise's code in that season
        return {"LAC": "SD" if season < 2017 else "LAC", "LA": "STL" if season < 2016 else "LA",
                "LV": "OAK" if season < 2020 else "LV"}.get(tm, tm)
    for tm0, y, pos in zip(t.team.map(lambda x: pe.TEAM.get(x, x)), t.draft_year.astype(int), t.pos):
        a = b = c = np.nan
        tm = era(tm0, y - 1)
        if y in snaps:
            g = snaps[y][(snaps[y].team == tm) & (snaps[y].position == pos) & (snaps[y].offense_snaps > 0)]
            if len(g) and g.gsis_id.notna().all():
                cov, known = covered_set(h, g.gsis_id, y)
                if known:
                    sh = (g.offense_snaps / g.offense_snaps.sum()).to_numpy()
                    m = g.gsis_id.isin(cov).to_numpy()
                    a, b = float(sh[~m].sum()), float(sh[m].max()) if m.any() else 0.0
        if y in depth:
            g = depth[y][(depth[y].team == tm) & (depth[y].pos == pos)].dropna(subset=["gsis_id"])
            if len(g):
                cov, known = covered_set(h, g.gsis_id.iloc[:1], y)
                if known:
                    c = 0.0 if g.gsis_id.iloc[0] in cov else 1.0
        sv.append(a); si.append(b); dl.append(c)
    t = t.copy()
    t["snap_vac"], t["snap_inc"], t["dc_starter_left"] = sv, si, dl
    return t


def predictor(tp, y, cols, win, use_athl):
    g = tp.draft_year.to_numpy(int)

    def predict(scheme, c, te):
        tr = pe.fold_mask(g, scheme, c, win)
        assert scheme != "fwd" or g[tr].max(initial=-1) <= c - win, "fold trains on an open outcome window"
        if y[tr].sum() < 3:
            return np.full(te.sum(), np.nan)
        cc = list(cols)
        Xtr, Xte = tp.loc[tr, cc].to_numpy(float), tp.loc[te, cc].to_numpy(float)
        if use_athl:   # percentiles from this fold's training rows only
            Xtr = np.column_stack([Xtr, athl_comp(tp[tr], tp[tr])])
            Xte = np.column_stack([Xte, athl_comp(tp[tr], tp[te])])
        lp = tp.log_pick.to_numpy(float)
        Xtr, Xte = np.column_stack([Xtr, lp[tr]]), np.column_stack([Xte, lp[te]])
        n_tal = Xtr.shape[1] - 1
        return bpm.make_lr(pe.C, n_tal, capital=True).fit(Xtr, y[tr]).predict_proba(Xte)[:, 1]
    return predict


def run(say=print):
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    _, _, _, t, _ = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    t = landing_b(combine(m6.landing(t, con), con), con)
    oof = pd.read_csv(EXP / "M4-oof.csv")
    res = {}
    for pos in bpm.POS:
        win, cut = bpm.TARGET[pos][1], bpm.TARGET[pos][0]
        tp = m6.population(t, pos)
        y = tp.hit.to_numpy(float)
        ref = oof[(oof.pos == pos) & (oof.cut == cut)].set_index("gsis_id").reindex(tp.gsis_id)
        assert (ref.y.to_numpy() == y).all(), f"{pos}: rows differ from M4-oof.csv"
        f6 = m6.families(tp, pos)
        prod, age = f6["production"], f6["age"]
        land = ["tm_pass_att_prev", "vac_share", "inc_top", "snap_vac", "snap_inc", "dc_starter_left"]
        assert not set(prod + age + land) & m6.LEAK
        fam = {"production": prod, "athleticism": ["athl_comp"], "age": age, "landing": land}
        base = {"production": prod, "age": age, "landing": land}
        runs = {"M6b": (prod + age + land, True)}
        for f in fam:
            runs[f"M6b without {f}"] = ([c for k, v in base.items() if k != f for c in v], f != "athleticism")
        p = {k: pe.oof(tp, predictor(tp, y, c, win, a), "fwd") for k, (c, a) in runs.items()}
        p["M6"] = pe.oof(tp, m6.predictor(tp, y, [c for v in f6.values() for c in v], win), "fwd")
        k = ~np.isnan(ref.fwd_K0.to_numpy()) & ~np.isnan(ref.fwd_BASE.to_numpy()) & ~np.isnan(ref.fwd_M4.to_numpy())
        for v in p.values():
            k &= ~np.isnan(v)
        m = lambda a: np.where(k, a, np.nan)   # noqa: E731
        K0, BASE, M4, M6, B = (m(a) for a in (ref.fwd_K0.to_numpy(), ref.fwd_BASE.to_numpy(), ref.fwd_M4.to_numpy(), p["M6"], p["M6b"]))
        cover = {c: round(float(tp[c].notna().mean()), 3) for c in land[1:]}
        cover["by_class"] = {int(yy): {c: round(float(gg[c].notna().mean()), 2) for c in land[1:]}
                             for yy, gg in tp.groupby("draft_year")}
        cover["athl_comp_inputs>=2"] = round(float(((tp[[f"cmb_{x}" for x in METRICS]].notna()).sum(1) >= 2).mean()), 3)
        r = {"n": int(k.sum()), "events": int(y[k].sum()), "families": fam, "coverage": cover,
             "vs_K0": pe.score(tp, K0, B, "fwd"), "vs_BASE": pe.score(tp, BASE, B, "fwd"),
             "vs_M4": pe.score(tp, M4, B, "fwd"), "vs_M6": pe.score(tp, M6, B, "fwd"),
             "ablation": {kk: bpm.ll(y[k], m(v)[k]) for kk, v in p.items() if kk.startswith("M6b")}}
        res[f"{pos}{cut}"] = r
        a = r["ablation"]
        say(f"{pos}{cut} n={r['n']} K0 {bpm.ll(y[k], K0[k]):.4f} M4 {bpm.ll(y[k], M4[k]):.4f} M6 {bpm.ll(y[k], M6[k]):.4f} "
            f"M6b {a['M6b']:.4f} slope {r['vs_K0']['cand']['slope']:.2f} beatsK0 {r['vs_K0']['boot']['p']:.0%} "
            f"beatsM6 {r['vs_M6']['boot']['p']:.0%} beatsBASE {r['vs_BASE']['boot']['p']:.0%} cover {cover} | "
            + ", ".join(f"{kk[12:]} {v - a['M6b']:+.4f}" for kk, v in a.items() if kk != "M6b"))
    rec = {"id": "M6b", "created_at_utc": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
           "git_head": pe.git_head(), "charter": pe.CHARTER,
           "sources_sha256": hashlib.sha256(json.dumps(pdb.source_shas(con), sort_keys=True).encode()).hexdigest(),
           "script_sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest(),
           "spec": {"C": pe.C, "metrics": METRICS, "volume": VOL, "tuning": "none"}, "results": res}
    (EXP / "M6b.json").write_text(json.dumps(rec, indent=1, default=float), encoding="utf-8")


if __name__ == "__main__":
    run()
