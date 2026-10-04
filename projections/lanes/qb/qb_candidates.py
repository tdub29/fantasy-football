"""QB lane candidates Q1-Q3 (notes/prospect-research/lanes/qb/prereg.md), scored through the lane copy
of the addendum 8 serving replay. Writes notes/prospect-research/lanes/qb/results.json; never writes a
shared file.

    export PROSPECT_DB=.../lane-qb/prospect.sqlite
    python projections/lanes/qb/qb_candidates.py            # parity, then Q1 Q2 Q3
    python projections/lanes/qb/qb_candidates.py --self-check
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys

import numpy as np
import pandas as pd

import qb_diagnose as qd
import qb_replay as q

bpm = q.bpm
RES = q.HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "qb" / "results.json"
LIVE_QB = ["live_games", "live_att_share", "live_aypta", "live_rush_pg", "has_live"]
N_LIVE = 4
FRAGILE_MARGIN, FRAGILE_SUPPORT = 0.03, 0.68


# ----------------------------------------------------------------------------- Q1: live passing line

def live_qb(con, n=N_LIVE) -> pd.DataFrame:
    """Index (season, player_id): his passing and rushing line from his team's first n games."""
    import prospect_live as pl
    fg = pl.first_games(con, n)
    full = fg.groupby(["season", "team_id"]).size()
    fg = fg[fg.set_index(["season", "team_id"]).index.map(full).to_numpy() == n]
    pb = pd.read_sql_query('SELECT season, game_id, team_id, athlete_id, category, "completions/passingAttempts" AS ca, '
                           '"passingYards", "passingTouchdowns", "interceptions", "rushingYards" FROM cfb_player_box '
                           "WHERE category IN ('passing', 'rushing')", con)
    tb = pd.read_sql_query('SELECT season, game_id, team_id, "completionAttempts" FROM cfb_team_box', con)
    for x in (pb, tb):
        for c in ("team_id", "game_id"):
            x[c] = pd.to_numeric(x[c], errors="coerce")
    pb["athlete_id"] = pd.to_numeric(pb.athlete_id, errors="coerce")
    pb = pb.merge(fg, on=["season", "team_id", "game_id"])
    tb = tb.merge(fg, on=["season", "team_id", "game_id"])
    tb["att"] = pd.to_numeric(tb.completionAttempts.astype(str).str.split("/").str[-1], errors="coerce")
    team_att = tb.groupby(["season", "team_id"]).att.sum()
    passing = pb.category.eq("passing")
    num = lambda c: pd.to_numeric(pb[c], errors="coerce").fillna(0.0)
    pb["att"] = pd.to_numeric(pb.ca.astype(str).str.split("/").str[-1], errors="coerce").fillna(0.0).where(passing, 0.0)
    pb["ay"] = (num("passingYards") + 20 * num("passingTouchdowns") - 45 * num("interceptions")).where(passing, 0.0)
    pb["rush"] = num("rushingYards").where(pb.category.eq("rushing"), 0.0)
    per = pb.groupby(["season", "athlete_id", "team_id"]).agg(games=("game_id", "nunique"), att=("att", "sum"), ay=("ay", "sum"),
                                                              rush=("rush", "sum")).reset_index()
    per = per.sort_values("games").drop_duplicates(["season", "athlete_id"], keep="last")   # his main team, as S4
    tatt = np.array([team_att.get(k, np.nan) for k in zip(per.season, per.team_id)], float)
    out = pd.DataFrame({"season": per.season.astype(int), "player_id": per.athlete_id.astype("Int64"),
                        "live_games": per.games.astype(float),
                        "live_att_share": np.where(tatt > 0, per.att / np.where(tatt > 0, tatt, 1), np.nan),
                        "live_aypta": per.ay / np.maximum(np.nan_to_num(tatt, nan=0.0), bpm.PASS_DEN_PG * n),
                        "live_rush_pg": per.rush / n, "has_live": 1.0})
    return out.dropna(subset=["player_id"]).drop_duplicates(["season", "player_id"]).set_index(["season", "player_id"])


def q1(ctx, cols):
    live = live_qb(ctx["con"])
    snap = ctx["snap"]
    key = pd.MultiIndex.from_arrays([snap.season.astype(int) + 1, snap.player_id.astype("Int64")])
    snap_l = snap.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=LIVE_QB, index=snap.index))
    snap_l["has_live"] = snap_l.has_live.fillna(0.0)

    def served(done, subj, season):
        pid = subj.set_index("sid").loc[done.index].player_id.astype("Int64")
        lv = live.reindex(pd.MultiIndex.from_arrays([np.full(len(done), season), pid]))
        d = done.join(pd.DataFrame(lv.to_numpy(), columns=LIVE_QB, index=done.index))
        d["has_live"] = d.has_live.fillna(0.0)
        return d
    r = q.replay(ctx, cols + LIVE_QB, snap=snap_l, served=served)
    sq = snap_l[snap_l.cpos == "QB"]
    info = {"train_has_live_share": float(sq.has_live.mean()),
            "train_has_live_by_plays_next": {str(k): float(v) for k, v in sq.groupby("plays_next").has_live.mean().items()}}
    return r, info


# ----------------------------------------------------------------------------- Q2: discrete-time hazard

def year_outcomes(ctx) -> pd.DataFrame:
    """One row per population B player and NFL year j in his window: hit_j as attach_outcomes ranks."""
    e = ctx["e"].drop_duplicates("player_id")
    stats = pd.read_sql_query("SELECT player_id, season, position, games, fantasy_points_ppr FROM nfl_player_season", ctx["con"])
    seasons = bpm.nfl_outcomes(stats, bpm.season_positions())
    pools = {k: np.sort(g.ppg.to_numpy()) for k, g in seasons.groupby(["season", "spos"])}
    m = e[["player_id", "gsis_id", "pos", "outcome_year"]].dropna(subset=["gsis_id"]).merge(
        seasons[["player_id", "season", "ppg"]].rename(columns={"player_id": "gsis_id"}), on="gsis_id")
    m["j"] = m.season - m.outcome_year + 1
    m = m[(m.j >= 1) & (m.j <= m.pos.map(lambda p: bpm.TARGET[p][1]))]
    empty = np.array([])
    m["rank"] = [1 + len(p) - np.searchsorted(p, v, side="right")
                 for p, v in ((pools.get((s, pos), empty), v) for s, pos, v in zip(m.season, m.pos, m.ppg))]
    m["hit_j"] = (m["rank"] <= m.pos.map(lambda p: bpm.TARGET[p][0])).astype(float)
    hj = m.groupby(["player_id", "j"]).hit_j.max().reset_index()
    # every player x year in his window, 0 where he had no 8-game season
    grid = e[["player_id", "pos", "outcome_year", "hit"]].reset_index(drop=True)
    grid["win"] = grid.pos.map(lambda p: bpm.TARGET[p][1])
    grid = grid.loc[grid.index.repeat(grid.win)].reset_index(drop=True)
    grid["j"] = grid.groupby("player_id").cumcount() + 1
    grid = grid.merge(hj, on=["player_id", "j"], how="left", validate="one_to_one")
    grid["hit_j"] = grid.hit_j.fillna(0.0)
    grid["nfl_season"] = grid.outcome_year + grid.j - 1
    grid["first_hit_j"] = grid.player_id.map(grid[grid.hit_j == 1].groupby("player_id").j.min())
    chk = grid[grid.hit.notna()].groupby("player_id").agg(h=("hit", "first"), m=("hit_j", "max"))
    assert (chk.h == chk.m).all(), f"year outcomes disagree with hit on {(chk.h != chk.m).sum()} players"
    return grid


class Hazard:
    def __init__(self, m, J=4):
        self.m, self.J = m, J

    def predict_proba(self, X):
        X = np.asarray(X, float)
        surv = np.ones(len(X))
        for j in range(1, self.J + 1):
            d = np.zeros((len(X), 3))
            if j > 1:
                d[:, j - 2] = 1.0
            surv *= 1 - self.m.predict_proba(np.hstack([X, d]))[:, 1]
        return np.column_stack([surv, 1 - surv])


def q2(ctx, cols):
    yo = year_outcomes(ctx)
    snap = ctx["snap"]
    sq = snap[snap.cpos == "QB"][["player_id", "season", "draft_year", *cols]]
    pp = sq.merge(yo[["player_id", "j", "hit_j", "nfl_season", "first_hit_j"]], on="player_id")
    pp = pp[pp.first_hit_j.isna() | (pp.j <= pp.first_hit_j)]           # at risk: no hit before year j
    for j in (2, 3, 4):
        pp[f"yr{j}"] = (pp.j == j).astype(float)
    xcols = cols + ["yr2", "yr3", "yr4"]
    log = {}

    def fit_on(tr, season):
        h = pp[(pp.nfl_season <= season - 1) & (pp.season <= season - 1)]
        log[season] = {"rows": int(len(h)), "events": int(h.hit_j.sum()), "players": int(h.player_id.nunique()),
                       "classes": f"{int(h.draft_year.min())}-{int(h.draft_year.max())}",
                       "closed_window_rows": int(len(tr)), "closed_window_hitters": int(tr.groupby("player_id").hit.max().sum())}
        m = q.nested(h[xcols].to_numpy(float), h.hit_j.to_numpy(float), h.draft_year.to_numpy(int))
        log[season]["C"] = float(m.m[-1].C)
        return Hazard(m)
    r = q.replay(ctx, cols, fit_on=fit_on)
    return r, {"per_replay": log}


# ----------------------------------------------------------------------------- Q3: nested recalibration

class Shift:
    def __init__(self, m, a, b, i_stage):
        self.m, self.a, self.b, self.i = m, a, b, i_stage

    def predict_proba(self, X):
        X = np.asarray(X, float)
        z = bpm.logit(self.m.predict_proba(X)[:, 1]) + self.a + self.b * (X[:, self.i] == 2)
        p = 1 / (1 + np.exp(-z))
        return np.column_stack([1 - p, p])


def offset_fit(y, off, fe):
    from scipy.optimize import minimize

    def nll(t):
        z = off + t[0] + t[1] * fe
        return float(np.sum(np.logaddexp(0, z) - y * z))
    return minimize(nll, np.zeros(2), method="BFGS").x


def q3(ctx, cols, min_events=10):
    log = {}
    i_stage = cols.index("stage")

    def fit_on(tr, season):
        X, y, g = tr[cols].to_numpy(float), tr.hit.to_numpy(float), tr.draft_year.to_numpy(int)
        m = q.nested(X, y, g)
        c = float(m.m[-1].C)
        oof = np.full(len(y), np.nan)
        for k in np.unique(g):
            te = g == k
            if y[~te].sum() < 3:
                continue
            oof[te] = bpm.make_lr(c).fit(X[~te], y[~te]).predict_proba(X[te])[:, 1]
        sel = ((tr.stage >= 2) & tr.plays_next).to_numpy() & ~np.isnan(oof)
        ev = int(y[sel].sum())
        a = b = 0.0
        if ev >= min_events:
            a, b = offset_fit(y[sel], bpm.logit(oof[sel]), (tr.stage.to_numpy()[sel] == 2).astype(float))
        log[season] = {"C": c, "recal_rows": int(sel.sum()), "recal_events": ev, "a": float(a), "b": float(b),
                       "shifted": ev >= min_events}
        return Shift(m, a, b, i_stage)
    r = q.replay(ctx, cols, fit_on=fit_on)
    return r, {"per_replay": log}


# ----------------------------------------------------------------------------- scoring

def margins(rep):
    out = {}
    for k in ("all", "first_eligible", "top60_by_pd"):
        x = rep[k]
        out[k] = {"ratio": round(min(x["ratio"] - 0.8, 1.25 - x["ratio"]), 4), "slope": round(min(x["slope"] - 0.75, 1.25 - x["slope"]), 4)}
    return out


def verdict(rep):
    if not rep["pass"] or rep["vs_stars_stage"]["boot_by_season"]["p"] < 0.90:
        return "fail"
    lo = min(v for g in rep["margins"].values() for v in g.values())
    sup = min(v for k, v in rep["support"].items() if k != "every_gate")
    return "pass, fragile" if lo < FRAGILE_MARGIN or sup < FRAGILE_SUPPORT else "pass"


def score(name, r):
    rep = q.report(r)
    rep["margins"] = margins(rep)
    rep["power_if_calibrated"] = qd.power(r)
    rep["verdict"] = verdict(rep)
    print(q.fmt(name, rep), "|", rep["verdict"], f"| power {rep['power_if_calibrated']['every_gate']:.0%}")
    return rep


def main():
    import prospect_stage as pst
    ctx = q.load()
    cols = pst.stage_cols("QB")
    out = {"created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "git_head": subprocess.run(["git", "-C", str(q.HERE), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip(),
           "prereg": "notes/prospect-research/lanes/qb/prereg.md (committed b595581 before scoring)",
           "command": "python projections/lanes/qb/qb_candidates.py", "candidates": {}}
    r0, _ = q.parity(ctx)                       # asserts the replay still matches the logged S3 QB numbers
    out["candidates"]["S3 (reference, logged)"] = score("S3 (reference)", r0)
    for cid, fn in (("Q1", q1), ("Q2", q2), ("Q3", q3)):
        r, info = fn(ctx, cols)
        r.to_parquet(q.SCRATCH / f"rows_{cid}.parquet")
        rep = score(cid, r)
        rep["info"] = info
        out["candidates"][cid] = rep
    RES.write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print(f"wrote {RES}")


def self_check():
    # hazard: two years at 0.1 then 0.2 compound to 1 - 0.9 x 0.8
    class M:
        def predict_proba(self, X):
            p = np.where(X[:, -3] == 1, 0.2, 0.1)   # yr2 flag
            p = np.where(X[:, -2:].sum(1) > 0, 0.0, p)   # yr3, yr4 zero
            return np.column_stack([1 - p, p])
    hz = Hazard(M()).predict_proba(np.zeros((1, 2)))[0, 1]
    assert abs(hz - (1 - 0.9 * 0.8)) < 1e-12
    # offset fit recovers a known shift
    rng = np.random.default_rng(0)
    off = rng.normal(-2, 1, 20000)
    fe = (rng.random(20000) < 0.3).astype(float)
    y = (rng.random(20000) < 1 / (1 + np.exp(-(off + 0.4 + 0.5 * fe)))).astype(float)
    a, b = offset_fit(y, off, fe)
    assert abs(a - 0.4) < 0.08 and abs(b - 0.5) < 0.12, (a, b)
    print("qb_candidates self-check OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-check"]:
        self_check()
    else:
        main()
