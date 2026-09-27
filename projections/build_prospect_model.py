"""College prospect projection model for QB/RB/WR/TE.

Writes site/data/prospect-model.js (window.PROSPECT_MODEL) and rewrites the numbers
in notes/prospect-research/model-card.md. Spec and evidence:
notes/prospect-research/{wr-te-models,rb-qb-methodology,data-sources}.md.

Three logistic models per position, all judged leave-one-draft-class-out:
  draft   log(pick) only, unpenalized: the baseline everything has to beat
  talent  college production + age + size, ridge, NO draft capital (usable before the draft)
  full    talent + log(pick), with log(pick) effectively unpenalized
The hit probability ships from `full` only where it beats `draft` on log loss both
leave-one-class-out and forward-chained, and in 80% of draft-class bootstrap resamples;
otherwise the draft-only model ships. A monotone LightGBM is scored as a challenger.

Sources, all key-free GitHub release downloads (cached; closed seasons kept forever):
  sportsdataverse-data  espn_cfb_{receiving,rushing,passing}  PBP-derived player seasons, 2004+
                        espn_cfb_rosters, cfb_recruits          position, size, class, stars
  nflverse-data         draft_picks, players, combine, stats_player_reg_<yr>
  players-nfl.json      Sleeper's own dump (fetch_sleeper.py): gsis/espn id -> Sleeper id

Cache: $NFLVERSE_CACHE if set, else projections/nflverse-cache (college files in cfb/).

    python projections/build_prospect_model.py
    python projections/build_prospect_model.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import math
import os
import pathlib
import re
import sys
import warnings

# Hundreds of tiny fits: BLAS/OpenMP thread pools only add contention here (one 12 ms
# logistic fit took a full second, and a LightGBM fit hung, with the default pools).
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_profile as bpp  # noqa: E402  (shared fetch, name/speed-score helpers)

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
CFB = CACHE / "cfb"
SDV = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
OUT = ROOT / "site" / "data" / "prospect-model.js"
CARD = ROOT / "notes" / "prospect-research" / "model-card.md"
SLEEPER_DUMP = ROOT / "players-nfl.json"

FIRST_CFB = 2004            # first sportsdataverse college season (2004 is thin, shares still valid)
SEASON = 2026               # current college + NFL season (in progress)
LAST_NFL = 2025             # last completed NFL season
FIRST_CLASS = 2008          # first draft class with a full college career on file
SCORE_FROM = 2014           # NFL draftees scored for the player card
MIN_GAMES = 8               # an NFL season counts toward the target at 8+ games
POS = ("QB", "RB", "WR", "TE")
INF = float("inf")

# (top-N PPR PPG finish, NFL seasons in the window). WR/RB per the brief; QB and TE get a
# 4-year window because both develop later (rb-qb-methodology 4.1, wr-te-models 4).
TARGET = {"WR": (24, 3), "RB": (24, 3), "QB": (12, 4), "TE": (12, 4)}
LAST_CLASS = {p: LAST_NFL - w + 1 for p, (_, w) in TARGET.items()}   # fully observed windows only

# Breakout = first qualifying college season at or above this dominator (PlayerProfiler:
# WR 20%, TE 15%; RB uses the 15% share-of-team-offense line). QB has no breakout age.
BREAKOUT = {"WR": 0.20, "TE": 0.15, "RB": 0.15}

# Talent features. A first research-driven set of 6-7 per position lost to capital alone;
# these are the research-backed subsets kept after one leave-one-class-out pruning pass
# (disclosed in the model card as selection optimism; the forward-chained check is the guard).
FEATS = {
    "WR": ["ryptpa_career", "breakout_age", "early", "stars"],
    "TE": ["ryptpa_best", "speed_score", "power"],
    "RB": ["ryptpa_final", "scrim_ypg", "weight", "speed_score", "stars"],
    "QB": ["rush_ypg_best", "comp_final", "draft_age", "power"],
}
# Anything that only exists after the draft. The talent model may never see these.
POST_DRAFT = {"log_pick", "pick", "round", "drafted_by", "team", "hit", "best_ppg", "best_rank"}
# Sign each feature is allowed to take in the LightGBM challenger (0 = free).
MONO = {"ryptpa_best": 1, "ryptpa_career": 1, "ryptpa_final": 1, "scrim_ypg": 1, "rush_ypg_best": 1,
        "comp_final": 1, "breakout_age": -1, "draft_age": -1, "early": 1, "stars": 1,
        "speed_score": 1, "log_pick": -1}
# log(pick) is scaled up after standardizing so the L2 penalty (on coef / UNPEN) barely
# touches it. Penalizing it like a college stat shrank the one strong signal and made
# every full model lose to the unpenalized draft-only baseline.
UNPEN = 10.0
# Ridge strength on standardized college stats, fixed in advance rather than tuned: a nested
# per-fold search on 150-450 players picked noisy values and cost 60x the fits.
C_FIXED = 0.1
BOOT_P = 0.8   # a model must beat draft-only in 80% of draft-class bootstrap resamples to ship
ROUNDS = {"R1": (1, 32), "R2": (33, 64), "R3": (65, 100), "D3": (101, 257)}
# Our tier names, cut on the talent percentile vs every drafted player at the position.
TIERS = [("Blue Chip", 90), ("Plus Starter", 70), ("Contributor", 45), ("Project", 20), ("Long Shot", 0)]


# ----------------------------------------------------------------------------- data

def cfb_file(tag: str, name: str, season: int) -> pathlib.Path:
    return bpp.fetch(tag, name, base=SDV, cache=CFB, max_age_h=24.0 if season >= SEASON else INF)


def nfl_file(tag: str, name: str, max_age_h: float = 24.0) -> pathlib.Path:
    return bpp.fetch(tag, name, cache=CACHE, max_age_h=max_age_h)


def load_college(seasons=range(FIRST_CFB, SEASON + 1)) -> pd.DataFrame:
    """One row per player-season (the team he played most for), stats plus team totals."""
    specs = {
        "receiving": ("espn_cfb_receiving", "receiver_player_name",
                      {"targets": "targets", "comp": "rec", "yards": "rec_yds", "passing_td": "rec_td"}),
        "rushing": ("espn_cfb_rushing", "rusher_player_name",
                    {"plays": "rush_att", "yards": "rush_yds", "rushing_td": "rush_td"}),
        "passing": ("espn_cfb_passing", "passer_player_name",
                    {"att": "pass_att", "comp": "pass_comp", "yards": "pass_yds",
                     "passing_td": "pass_td", "pass_int": "pass_int"}),
    }
    key = ["season", "player_id", "team_id"]
    parts = []
    for kind, (tag, name_col, stats) in specs.items():
        frames = [pd.read_parquet(cfb_file(tag, f"cfb_{kind}_{y}.parquet", y)) for y in seasons]
        d = pd.concat(frames, ignore_index=True)
        d = d[key + [name_col, "pos_team", "fbs_class", "games", "team_games", *stats]].rename(
            columns={name_col: "name", "games": f"g_{kind}", **stats})
        parts.append(d)
    ps = parts[0]
    for d in parts[1:]:
        ps = ps.merge(d, on=key, how="outer", suffixes=("", "_r"))
        for c in ("name", "pos_team", "fbs_class", "team_games"):
            ps[c] = ps[c].combine_first(ps.pop(f"{c}_r"))
    ps["player_id"] = pd.to_numeric(ps["player_id"], errors="coerce").astype("Int64")
    ps["team_id"] = pd.to_numeric(ps["team_id"], errors="coerce")
    return season_metrics(ps)


def season_metrics(ps: pd.DataFrame) -> pd.DataFrame:
    """Shares and rates per player-season. Team totals are the sum over every player on the
    team in the same PBP file, so a game missing from ESPN's feed drops out of both sides."""
    num = ["targets", "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td",
           "pass_att", "pass_comp", "pass_yds", "pass_td", "pass_int"]
    ps = ps.copy()
    ps[num] = ps[num].fillna(0.0).astype(float)
    tot = ps.groupby(["season", "team_id"])[["targets", "rec_yds", "rec_td", "rush_yds", "rush_td", "pass_att"]].sum()
    ps = ps.join(tot.add_prefix("t_"), on=["season", "team_id"])
    ps["games"] = ps[["g_receiving", "g_rushing", "g_passing"]].max(axis=1).fillna(0)
    ps["team_games"] = ps["team_games"].fillna(ps["games"])
    # A mid-season transfer shows up twice; keep the team he did the most for.
    ps["_touch"] = ps["rec_yds"].abs() + ps["rush_yds"].abs() + ps["pass_yds"].abs()
    ps = ps.sort_values("_touch").drop_duplicates(["player_id", "season"], keep="last").drop(columns="_touch")

    def div(a, b):
        return np.where(b > 0, a / np.where(b > 0, b, 1), 0.0)

    ps["rec_share"] = div(ps.rec_yds, ps.t_rec_yds)
    ps["rec_td_share"] = div(ps.rec_td, ps.t_rec_td)
    ps["dom_rec"] = (ps.rec_share + ps.rec_td_share) / 2
    scrim, t_scrim = ps.rush_yds + ps.rec_yds, ps.t_rush_yds + ps.t_rec_yds
    ps["dom_scrim"] = (div(scrim, t_scrim) + div(ps.rush_td + ps.rec_td, ps.t_rush_td + ps.t_rec_td)) / 2
    ps["ryptpa"] = div(ps.rec_yds, ps.t_pass_att)
    ps["target_share"] = div(ps.targets, ps.t_targets)
    ps["scrim_yds"] = scrim
    ps["rec_ypg"] = div(ps.rec_yds, ps.games)
    ps["rush_ypg"] = div(ps.rush_yds, ps.games)
    ps["aya"] = div(ps.pass_yds + 20 * ps.pass_td - 45 * ps.pass_int, ps.pass_att)
    ps["comp_pct"] = div(ps.pass_comp, ps.pass_att)
    ps["power"] = ps["fbs_class"].isin(["P5", "P4"]).astype(float)
    # A season counts for best/final/breakout at half the team's games (min 3). The
    # in-progress season is held to half of a FULL season (6), so a hot four-game start
    # cannot become anyone's "best season"; a real short season (2020) still counts.
    tg = np.where(ps.season >= SEASON, np.maximum(ps.team_games, 12), ps.team_games)
    ps["qual"] = ps.games >= np.maximum(3, np.ceil(tg / 2))
    ps["passer"] = ps.pass_att >= 5 * ps.team_games          # a real passing role
    ps["started"] = ps.pass_att >= 12.5 * ps.team_games      # QBASE: a 150-attempt season
    return ps


def load_rosters(seasons=range(FIRST_CFB, SEASON + 1)) -> pd.DataFrame:
    cols = ["season", "athlete_id", "team_id", "full_name", "position_abbreviation",
            "height", "weight", "date_of_birth", "experience_years"]
    d = pd.concat([pd.read_parquet(cfb_file("espn_cfb_rosters", f"cfb_rosters_{y}.parquet", y), columns=cols)
                   for y in seasons], ignore_index=True)
    d["athlete_id"] = pd.to_numeric(d["athlete_id"], errors="coerce").astype("Int64")
    d["team_id"] = pd.to_numeric(d["team_id"], errors="coerce")
    return d


def load_recruits(seasons=range(FIRST_CFB, SEASON + 1)) -> pd.DataFrame:
    d = pd.concat([pd.read_parquet(cfb_file("cfb_recruits", f"cfb_recruits_{y}.parquet", y))
                   for y in seasons], ignore_index=True)
    d["team_id"] = pd.to_numeric(d["team_id"], errors="coerce")
    d["_k"] = d["player_name"].map(bpp.norm_name)
    return d


def player_bio(ps: pd.DataFrame, rosters: pd.DataFrame, recruits: pd.DataFrame) -> pd.DataFrame:
    """Per college player id: first season on file (roster or stats), recruit class and stars
    (joined on name + a school he played for; ESPN's recruit ids do not match CFBD's), latest
    roster position/size, and DOB where ESPN has one (rare after 2010)."""
    first = pd.concat([ps[["player_id", "season"]],
                       rosters[["athlete_id", "season"]].rename(columns={"athlete_id": "player_id"})]
                      ).groupby("player_id")["season"].min().rename("first_season")
    ros = rosters.sort_values("season").dropna(subset=["athlete_id"])
    last = ros.drop_duplicates("athlete_id", keep="last").set_index("athlete_id")
    bio = pd.DataFrame(index=first.index).join(first)
    bio["ros_pos"] = last["position_abbreviation"]
    bio["ros_height"] = last["height"]
    bio["ros_weight"] = last["weight"]
    bio["ros_dob"] = pd.to_datetime(ros.dropna(subset=["date_of_birth"]).drop_duplicates("athlete_id", keep="last")
                                    .set_index("athlete_id")["date_of_birth"], errors="coerce", utc=True).dt.tz_localize(None)
    names = pd.concat([ps[["player_id", "name", "team_id"]],
                       ros[["athlete_id", "full_name", "team_id"]].rename(columns={"athlete_id": "player_id", "full_name": "name"})])
    names["_k"] = names["name"].map(bpp.norm_name)
    rk = recruits.groupby(["_k", "team_id"]).agg(rclass=("season", "min"), stars=("stars", "max")).reset_index()
    m = names.drop_duplicates(["player_id", "_k", "team_id"]).merge(rk, on=["_k", "team_id"])
    rec = m.groupby("player_id").agg(rclass=("rclass", "min"), stars=("stars", "max"))
    bio = bio.join(rec)
    # ESPN's class label (FR=1 .. SR=4) is reliable on the 2025+ rosters only (checked against
    # recruit class; older years default to 4). It catches transfers up from Division II,
    # whose first FBS season would otherwise make a sixth-year senior look 19.
    exp = last["experience_years"].where(last["season"] >= 2025)
    bio["exp_class"] = last["season"] - exp + 1
    bio["hs_class"] = bio[["first_season", "rclass", "exp_class"]].min(axis=1)
    return bio


# ----------------------------------------------------------------------------- features

def age_years(date: pd.Series, dob: pd.Series) -> pd.Series:
    return (pd.to_datetime(date) - pd.to_datetime(dob)).dt.days / 365.25


def career_features(subj: pd.DataFrame, ps: pd.DataFrame, age0: float) -> pd.DataFrame:
    """College profile per subject as of his final season.

    subj columns: sid (unique), player_id, pos, cutoff (last college season counted),
    draft_year (real or projected), dob (may be NaT), hs_class (for the age proxy).
    Uses nothing from the NFL side, which is what keeps the talent model pre-draft."""
    f = subj[["sid", "player_id", "pos", "cutoff", "dob", "hs_class"]].merge(ps, on="player_id")
    f = f[f.season <= f.cutoff].copy()
    sept1 = pd.to_datetime(f.season.astype(int).astype(str) + "-09-01")
    f["age"] = np.where(f.dob.notna(), age_years(sept1, f.dob), age0 + f.season - f.hs_class)
    f["dom"] = np.where(f.pos == "RB", f.dom_scrim, f.dom_rec)
    anyq = f.groupby("sid")["qual"].transform("any")
    pool = f[f.qual | ~anyq].sort_values(["sid", "season"])
    g = pool.groupby("sid")
    out = pd.DataFrame(index=subj.sid)
    for c in ("ryptpa", "dom", "rec_share", "target_share"):
        out[f"{c}_best"] = g[c].max()
    fin = pool.drop_duplicates("sid", keep="last").set_index("sid")
    for c in ("ryptpa", "dom", "rec_share", "season", "age", "power", "pos_team", "name",
              "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td", "games"):
        out[f"{c}_final"] = fin[c]
    ga = f.groupby("sid")
    out["scrim_ypg"] = ga.scrim_yds.sum() / ga.games.sum().replace(0, np.nan)
    out["ryptpa_career"] = ga.rec_yds.sum() / ga.t_pass_att.sum().replace(0, np.nan)
    out["n_seasons"] = ga.season.nunique()
    out["n_qual"] = ga.qual.sum()
    out["power"] = out.pop("power_final")
    # Breakout age: first qualifying season at the position's dominator line; a player who
    # never got there is scored one year past his final college age.
    thr = pool.pos.map(BREAKOUT)
    bo = pool[pool.dom >= thr].drop_duplicates("sid", keep="first").set_index("sid")
    out["breakout_age"] = bo["age"]
    out["broke_out"] = out.breakout_age.notna().astype(float)
    out["breakout_age"] = out.breakout_age.fillna(out.age_final + 1)
    # QB: passing seasons only.
    anyqp = (f.passer & f.qual).groupby(f.sid).transform("any")
    qb = f[f.passer & (f.qual | ~anyqp)].sort_values(["sid", "season"])
    qfin = qb.drop_duplicates("sid", keep="last").set_index("sid")
    out["aya_final"] = qfin["aya"]
    out["comp_final"] = qfin["comp_pct"]
    out["pass_att_final"] = qfin["pass_att"]
    out["pass_yds_final"] = qfin["pass_yds"]
    out["pass_td_final"] = qfin["pass_td"]
    out["qb_rush_yds_final"] = qfin["rush_yds"]
    out["qb_season_final"] = qfin["season"]
    out["rush_ypg_best"] = qb.groupby("sid")["rush_ypg"].max()
    out["starts"] = f.groupby("sid")["started"].sum()
    s = subj.set_index("sid")
    out["early"] = (out.n_seasons <= 3).astype(float)
    apr25 = pd.to_datetime(s.draft_year.astype(int).astype(str) + "-04-25")
    out["draft_age"] = np.where(s.dob.notna(), age_years(apr25, s.dob), age0 + s.draft_year - s.hs_class - 0.35)
    out.loc[out.n_seasons.isna(), "draft_age"] = np.nan
    qbs = s.pos.eq("QB")
    out.loc[qbs, ["breakout_age", "broke_out"]] = np.nan
    return out.reset_index().rename(columns={"index": "sid"})


# ----------------------------------------------------------------------------- NFL side

def link_college(draft: pd.DataFrame, espn_ids: pd.Series, ps: pd.DataFrame) -> pd.Series:
    """College player_id per draft row. ESPN kept the college id into the NFL only from about
    the 2017 class on, so older classes fall back to name + final college season + school."""
    known = set(ps.player_id.dropna().astype(int))
    eid = pd.to_numeric(espn_ids, errors="coerce")
    direct = eid.where(eid.isin(known))
    last = ps.sort_values("season").groupby("player_id").agg(name=("name", "last"), last_season=("season", "max"),
                                       team=("pos_team", "last")).reset_index()
    last["_k"] = last["name"].map(bpp.norm_name)
    by_name = {k: g for k, g in last.groupby("_k")}
    out = {}
    for i, row in draft.iterrows():
        if pd.notna(direct.get(i)):
            out[i] = int(direct[i])
            continue
        c = by_name.get(bpp.norm_name(row["pfr_player_name"]))
        if c is None:
            continue
        c = c[c.last_season.between(row["season"] - 2, row["season"] - 1)]
        if c.empty:
            continue
        sim = c.team.map(lambda t: school_sim(row["college"], t))
        c = c[sim >= 0.5]
        if len(c) == 1:
            out[i] = int(c.player_id.iloc[0])
    return pd.Series(out, dtype="Int64")


def school_sim(a, b) -> float:
    def n(s):
        s = str(s or "").lower().replace("st.", "state").replace("col.", "college").replace("&", "and")
        return re.sub(r"[^a-z ]", "", s).replace("university", "").strip()
    a, b = n(a), n(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def nfl_outcomes(stats: pd.DataFrame) -> pd.DataFrame:
    """Season rank by PPR points per game within the position, 8+ games to be ranked."""
    s = stats[stats.games >= MIN_GAMES][["player_id", "season", "position", "games", "fantasy_points_ppr"]].copy()
    s["ppg"] = s.fantasy_points_ppr / s.games
    s["rank"] = s.groupby(["season", "position"])["ppg"].rank(ascending=False, method="min")
    return s


def attach_outcomes(t: pd.DataFrame, seasons: pd.DataFrame) -> pd.DataFrame:
    """hit / best_ppg / best_rank inside each player's window; blank when the window is open."""
    m = t[["sid", "gsis_id", "pos", "draft_year"]].merge(seasons, left_on="gsis_id", right_on="player_id")
    win = m.pos.map(lambda p: TARGET[p][1])
    m = m[(m.season >= m.draft_year) & (m.season < m.draft_year + win)]
    m["top"] = m.pos.map(lambda p: TARGET[p][0])
    g = m.groupby("sid")
    t = t.set_index("sid")
    t["best_ppg"] = g.ppg.max()
    t["best_rank"] = g["rank"].min()
    t["hit"] = (t.best_rank <= t.pos.map(lambda p: TARGET[p][0])).astype(float)
    t["best_ppg"] = t.best_ppg.fillna(0.0)
    observed = t.draft_year <= t.pos.map(LAST_CLASS)
    t.loc[~observed, ["hit", "best_ppg", "best_rank"]] = np.nan
    return t.reset_index()


def sleeper_maps():
    """gsis_id / espn_id -> Sleeper id, from Sleeper's own dump (its gsis ids carry a leading space)."""
    gsis, espn = {}, {}
    if SLEEPER_DUMP.exists():
        for sid, p in json.loads(SLEEPER_DUMP.read_text(encoding="utf-8")).items():
            if p.get("gsis_id"):
                gsis[str(p["gsis_id"]).strip()] = sid
            if p.get("espn_id"):
                espn[str(p["espn_id"])] = sid
    try:
        r = pd.read_parquet(nfl_file("rosters", f"roster_{SEASON}.parquet"), columns=["gsis_id", "sleeper_id"])
        for g, s in r.dropna().itertuples(index=False):
            gsis.setdefault(str(g), str(s))
    except SystemExit:
        pass
    return gsis, espn


# ----------------------------------------------------------------------------- models

def _boost_last(Z):
    Z = np.array(Z, dtype=float, copy=True)
    Z[:, -1] *= UNPEN
    return Z


def make_lr(C: float, boost_last: bool = False):
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import FunctionTransformer, StandardScaler
    steps = [SimpleImputer(strategy="median"), StandardScaler()]
    if boost_last:
        steps.append(FunctionTransformer(_boost_last))
    return make_pipeline(*steps, LogisticRegression(C=C, max_iter=5000))


def folds(groups: np.ndarray, forward: bool = False, start: int | None = None):
    """(train_mask, test_mask) per draft class. Forward-chaining trains only on earlier classes."""
    for g in np.unique(groups):
        if start is not None and g < start:
            continue
        te = groups == g
        tr = (groups < g) if forward else ~te
        assert not te[tr].any() and g not in set(groups[tr]), "fold trains on its held-out class"
        yield tr, te


def cv_predict(X, y, groups, fit, forward=False, start=None):
    p = np.full(len(y), np.nan)
    for tr, te in folds(groups, forward, start):
        if y[tr].sum() < 3:
            continue
        p[te] = fit(X[tr], y[tr], groups[tr]).predict_proba(X[te])[:, 1]
    return p


def ll(y, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def fit_talent(X, y, _groups):
    return make_lr(C_FIXED).fit(X, y)


def fit_full(X, y, _groups):
    return make_lr(C_FIXED, boost_last=True).fit(X, y)


def fit_baseline(X, y, _groups):
    return make_lr(1e4).fit(X, y)


def fit_lgbm(mono):
    def fit(X, y, _groups):
        import lightgbm as lgb
        return lgb.LGBMClassifier(n_estimators=150, learning_rate=0.03, num_leaves=3, min_child_samples=25,
                                  subsample=0.8, subsample_freq=1, monotone_constraints=mono,
                                  verbose=-1, random_state=7, n_jobs=1).fit(X, y)
    return fit


def class_bootstrap(y, pa, pb, g, n=4000, seed=7):
    """Resample whole draft classes: share of resamples where b has lower log loss than a,
    and the 90% interval of the per-player gain. A positive point gain is not a win."""
    k = ~(np.isnan(pa) | np.isnan(pb))
    y, g = y[k], g[k]
    def nll(p):
        p = np.clip(p[k], 1e-4, 1 - 1e-4)
        return -(y * np.log(p) + (1 - y) * np.log(1 - p))
    d = pd.DataFrame({"g": g, "gain": nll(pa) - nll(pb)}).groupby("g")["gain"].agg(["sum", "size"])
    idx = np.random.default_rng(seed).integers(0, len(d), (n, len(d)))
    gain = d["sum"].to_numpy()[idx].sum(1) / d["size"].to_numpy()[idx].sum(1)
    return {"p": float((gain > 0).mean()), "lo": float(np.percentile(gain, 5)), "hi": float(np.percentile(gain, 95))}


def metrics(y, p, best_ppg=None):
    from sklearn.metrics import brier_score_loss, roc_auc_score
    k = ~np.isnan(p)
    y, p = y[k], p[k]
    out = {"n": int(len(y)), "events": int(y.sum()), "auc": float(roc_auc_score(y, p)),
           "brier": float(brier_score_loss(y, p)), "logloss": ll(y, p)}
    if best_ppg is not None:
        lg = np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
        out["r_ppg"] = float(np.corrcoef(lg, best_ppg[k])[0, 1])
    return out


def calibration(y, p, bins=10):
    d = pd.DataFrame({"y": y, "p": p}).dropna()
    d["bin"] = pd.qcut(d.p.rank(method="first"), bins, labels=False)
    return [{"bin": int(b) + 1, "n": int(len(g)), "pred": float(g.p.mean()), "obs": float(g.y.mean())}
            for b, g in d.groupby("bin")]


def tier_of(pct):
    for i, (_, cut) in enumerate(TIERS):
        if pct >= cut:
            return i
    return len(TIERS) - 1


def pctile(ref: np.ndarray, v):
    ref = np.sort(ref[~np.isnan(ref)])
    return float(np.searchsorted(ref, v, side="right") / len(ref) * 100) if len(ref) and not np.isnan(v) else None


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


# ----------------------------------------------------------------------------- build

def prepare(say=print):
    """Load everything and return the linked, featured, labelled draft table."""
    ps = load_college()
    rosters, recruits = load_rosters(), load_recruits()
    bio = player_bio(ps, rosters, recruits)
    say(f"college: {len(ps):,} player-seasons {ps.season.min()}-{ps.season.max()}, {ps.player_id.nunique():,} players")

    players = pd.read_parquet(nfl_file("players", "players.parquet"))
    draft = pd.read_parquet(nfl_file("draft_picks", "draft_picks.parquet"))
    combine = pd.read_parquet(nfl_file("combine", "combine.parquet"))
    stats = pd.concat([pd.read_parquet(nfl_file("stats_player", f"stats_player_reg_{y}.parquet",
                                                24.0 if y >= SEASON else INF))
                       for y in range(FIRST_CLASS, LAST_NFL + 1)], ignore_index=True)

    d = draft[(draft.season >= FIRST_CLASS) & draft.position.isin(POS) & draft.pick.notna()].copy()
    d = d.merge(players[["gsis_id", "espn_id", "birth_date"]], on="gsis_id", how="left")
    d.index = range(len(d))
    d["player_id"] = link_college(d, d.espn_id, ps)
    # The name fallback is graded against the espn id join on the classes where both work.
    both = d[pd.to_numeric(d.espn_id, errors="coerce").isin(set(ps.player_id.dropna().astype(int)))]
    chk = link_college(both.assign(espn_id=np.nan), pd.Series(np.nan, index=both.index), ps)
    agree = (chk.reindex(both.index) == pd.to_numeric(both.espn_id, errors="coerce").astype("Int64"))
    say(f"join: {d.player_id.notna().mean():.1%} of {len(d)} drafted QB/RB/WR/TE {FIRST_CLASS}+ linked to college; "
        f"name fallback on {len(both)} id-known rows: {chk.notna().mean():.1%} found, "
        f"{agree.sum() / max(chk.notna().sum(), 1):.1%} of those correct")

    cmb = bpp.add_drill_percentiles(combine)
    cmb = cmb.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")
    d["forty"] = d.pfr_player_id.map(cmb["forty"])
    d["cwt"] = d.pfr_player_id.map(cmb["wt"])
    d["dob"] = pd.to_datetime(d.birth_date, errors="coerce")
    d = d.join(bio[["hs_class", "stars", "ros_weight"]], on="player_id")
    # Combine weight, else his last college roster weight. Never nflverse's current weight:
    # that is measured after the draft, so it would leak into a pre-draft model.
    d["weight"] = d.cwt.fillna(d.ros_weight)
    d["speed_score"] = [bpp.speed_score(w, f) for w, f in zip(d.weight, d.forty)]
    d["sid"] = "n" + d.index.astype(str)
    d["pos"], d["draft_year"], d["cutoff"] = d.position, d.season, d.season - 1
    d["log_pick"] = np.log(d.pick.astype(float))

    # Age proxy for players with no DOB (every current college player): age on Sept 1 of the
    # first season on file, measured on drafted players who have both.
    known = d[d.draft_year >= 2012].dropna(subset=["dob", "hs_class"])  # 2004 data floor truncates older careers
    age0 = float(np.median(age_years(pd.to_datetime(known.hs_class.astype(int).astype(str) + "-09-01"), known.dob)))
    err = age_years(pd.to_datetime(known.draft_year.astype(int).astype(str) + "-04-25"), known.dob) - (
        age0 + known.draft_year - known.hs_class - 0.35)
    say(f"age proxy: {age0:.2f} at first college season, draft-age error sd {err.std():.2f}y (n={len(known)})")

    linked = d[d.player_id.notna()].copy()
    feats = career_features(linked, ps, age0)
    t = linked.merge(feats, on="sid", how="left")
    t = attach_outcomes(t, nfl_outcomes(stats))
    return ps, bio, d, t, age0


def build(verbose=True):
    say = print if verbose else (lambda *a, **k: None)
    ps, bio, d, t, age0 = prepare(say)
    results, final = {}, {}
    for pos in POS:
        tp = t[(t.pos == pos) & t.draft_year.between(FIRST_CLASS, LAST_CLASS[pos]) & t.hit.notna()
               & t.gsis_id.notna()].copy()
        cols = FEATS[pos]
        assert not set(cols) & POST_DRAFT, f"{pos} talent features leak post-draft info"
        y, g, ppg = tp.hit.to_numpy(float), tp.draft_year.to_numpy(int), tp.best_ppg.to_numpy(float)
        Xt, Xb = tp[cols].to_numpy(float), tp[["log_pick"]].to_numpy(float)
        Xf = tp[cols + ["log_pick"]].to_numpy(float)
        fwd0 = FIRST_CLASS + 5
        fit_gbm = fit_lgbm([MONO.get(c, 0) for c in cols + ["log_pick"]])
        fits = {"draft": (Xb, fit_baseline), "talent": (Xt, fit_talent), "full": (Xf, fit_full), "gbm": (Xf, fit_gbm)}
        pred = {k: cv_predict(X, y, g, f) for k, (X, f) in fits.items()}
        fwd = {k: cv_predict(X, y, g, f, forward=True, start=fwd0) for k, (X, f) in fits.items() if k != "talent"}
        base = np.full(len(y), y.mean())
        res = {k: metrics(y, v, ppg) for k, v in pred.items()}
        res["base_rate"] = {"logloss": ll(y, base), "brier": float(np.mean((y - y.mean()) ** 2)), "rate": float(y.mean())}
        res["forward"] = {k: metrics(y, v) for k, v in fwd.items()}

        res["boot"] = {k: class_bootstrap(y, pred["draft"], pred[k], g) for k in ("full", "gbm")}

        def beats(a, b):  # lower log loss both ways, and not a coin flip across draft classes
            return (res[a]["logloss"] < res[b]["logloss"] and res["forward"][a]["logloss"] < res["forward"][b]["logloss"]
                    and (b != "draft" or res["boot"][a]["p"] >= BOOT_P))
        shipped = "full" if beats("full", "draft") else "draft"
        if beats("gbm", "draft") and beats("gbm", shipped if shipped != "draft" else "full"):
            shipped = "gbm"
        res["shipped"] = shipped
        res["calibration"] = calibration(y, pred[shipped])
        m_t, m_f, m_b = fit_talent(Xt, y, g), fit_full(Xf, y, g), fit_baseline(Xb, y, g)
        m_g = fit_gbm(Xf, y, g)
        res["C"] = {"talent": C_FIXED, "full": C_FIXED}
        cf = m_f[-1].coef_[0].copy()
        cf[-1] *= UNPEN  # back to the per-SD effect of log(pick)
        res["coef"] = {"talent": dict(zip(cols, m_t[-1].coef_[0].round(3).tolist())),
                       "full": dict(zip(cols + ["log_pick"], cf.round(3).tolist())),
                       "draft": {"log_pick": round(float(m_b[-1].coef_[0][0]), 3)}}
        # Tiers on the out-of-sample talent logit, so each tier's hit rate is honest.
        ref = logit(pred["talent"])
        tp["_tpct"] = [pctile(ref, v) for v in ref]
        tp["_tier"] = [tier_of(v) for v in tp._tpct]
        res["tier_hit"] = [{"tier": TIERS[i][0], "n": int((tp._tier == i).sum()),
                            "hit": float(tp.hit[tp._tier == i].mean()) if (tp._tier == i).any() else None}
                           for i in range(len(TIERS))]
        res["n_linked"] = int(len(tp))
        results[pos] = res
        final[pos] = {"cols": cols, "talent": m_t, "full": m_f, "draft": m_b, "gbm": m_g, "shipped": shipped,
                      "ref": ref, "train": tp, "oos": dict(zip(tp.sid, zip(pred["talent"], pred[shipped])))}
        say(f"{pos}: n={len(tp)} hits={int(y.sum())}  logloss draft {res['draft']['logloss']:.4f} "
            f"talent {res['talent']['logloss']:.4f} full {res['full']['logloss']:.4f} gbm {res['gbm']['logloss']:.4f} "
            f"| fwd draft {res['forward']['draft']['logloss']:.4f} full {res['forward']['full']['logloss']:.4f} "
            f"gbm {res['forward']['gbm']['logloss']:.4f} -> {shipped}")

    nfl = score_nfl(t, d, final)
    college = score_college(ps, bio, final, age0)
    return {"results": results, "nfl": nfl, "college": college, "coverage": coverage(d, t)}


def coverage(d, t):
    return {"drafted": int(len(d)), "linked": int(d.player_id.notna().sum()),
            "by_era": {e: float(d[(d.season >= a) & (d.season <= b)].player_id.notna().mean())
                       for e, a, b in (("2008-2016", 2008, 2016), ("2017-2026", 2017, 2026))}}


def comps_for(fin, X_row, model):
    """Nearest historical draftees, each standardized feature weighted by |coef| so comps match
    on what the model thinks matters. model="full" includes log(pick) (draftees), "talent"
    does not (college players have no pick)."""
    tr = fin["train"]
    pipe = fin[model]
    cols = fin["cols"] + (["log_pick"] if model == "full" else [])
    Z = pipe[:-1].transform(tr[cols].to_numpy(float))
    w = np.abs(pipe[-1].coef_[0])
    z = pipe[:-1].transform(X_row.reshape(1, -1))[0]
    dist = np.sqrt((((Z - z) * w) ** 2).sum(axis=1))
    return tr.iloc[np.argsort(dist)[:4]]


def comp_rows(fin, X_row, model, skip_sid=None):
    out = []
    for r in comps_for(fin, X_row, model).itertuples():
        if r.sid == skip_sid or len(out) == 3:
            continue
        out.append([r.pfr_player_name, int(r.draft_year), int(r.pick), round(float(r.best_ppg), 1), int(r.hit)])
    return out


def key_stats(r):
    pos = r["pos"]
    def f(v, d=3):
        return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), d)
    if pos == "QB":
        st = {"aya": f(r.get("aya_final"), 2), "comp": f(r.get("comp_final")), "rypg": f(r.get("rush_ypg_best"), 1),
              "starts": f(r.get("starts"), 0)}
        st["stars"] = f(r.get("stars"), 0)
        line = (f"{int(r['pass_yds_final']):,} pass yds, {int(r['pass_td_final'])} TD, "
                f"{int(r['qb_rush_yds_final']):,} rush yds") if pd.notna(r.get("pass_yds_final")) else None
        if line:
            return st, f"{int(r['qb_season_final'])} {r.get('pos_team_final') or ''}: {line}"
    else:
        yp = {"WR": "ryptpa_career", "TE": "ryptpa_best", "RB": "ryptpa_final"}[pos]
        st = {"dom": f(r.get("dom_best")), "yptpa": f(r.get(yp), 2), "share": f(r.get("rec_share_best")),
              "stars": f(r.get("stars"), 0)}
        if pos == "RB":
            st["sypg"] = f(r.get("scrim_ypg"), 1)
            line = (f"{int(r['rush_yds_final']):,} rush yds, {int(r['rec_final'])} rec, {int(r['rec_yds_final']):,} rec yds, "
                    f"{int(r['rush_td_final'] + r['rec_td_final'])} TD") if pd.notna(r.get("rush_yds_final")) else None
        else:
            line = (f"{int(r['rec_final'])} rec, {int(r['rec_yds_final']):,} yds, {int(r['rec_td_final'])} TD"
                    ) if pd.notna(r.get("rec_final")) else None
    if line and pd.notna(r.get("season_final")):
        line = f"{int(r['season_final'])} {r.get('pos_team_final') or ''}: {line}"
    return st, line


def score_nfl(t, d, final):
    gsis_map, espn_map = sleeper_maps()
    out = {}
    for pos in POS:
        fin = final[pos]
        rows = t[(t.pos == pos) & (t.draft_year >= SCORE_FROM)]
        if rows.empty:
            continue
        X = rows[fin["cols"]].to_numpy(float)
        Xf = rows[fin["cols"] + ["log_pick"]].to_numpy(float)
        tal = fin["talent"].predict_proba(X)[:, 1]
        Xs = rows[fin["cols"] + ["log_pick"]].to_numpy(float) if fin["shipped"] != "draft" else rows[["log_pick"]].to_numpy(float)
        hp = fin[fin["shipped"]].predict_proba(Xs)[:, 1]
        for i, (_, r) in enumerate(rows.iterrows()):
            slp = gsis_map.get(str(r.gsis_id)) or espn_map.get(str(r.espn_id))
            if not slp:
                continue
            oos = fin["oos"].get(r.sid)
            t_p, h_p = (oos if oos is not None else (tal[i], hp[i]))
            ts = pctile(fin["ref"], float(logit(t_p)))
            st, line = key_stats(r)
            row = {"n": r.pfr_player_name, "p": pos, "y": int(r.draft_year), "pk": int(r.pick),
                   "ts": round(ts), "tr": tier_of(ts), "hp": round(float(h_p), 3), "tp": round(float(t_p), 3),
                   "ba": None if pd.isna(r.breakout_age) else round(float(r.breakout_age), 1),
                   "sch": r.pos_team_final if isinstance(r.pos_team_final, str) else r.college,
                   "st": st, "ln": line, "cp": comp_rows(fin, Xf[i], "full", r.sid), "oos": int(oos is not None)}
            if pd.notna(r.hit):
                row["out"] = [int(r.hit), round(float(r.best_ppg), 1), None if pd.isna(r.best_rank) else int(r.best_rank)]
            out[slp] = row
    # Draftees with no college line on file (mostly FCS): capital-only probability, no profile.
    for r in d[d.player_id.isna() & (d.draft_year >= SCORE_FROM)].itertuples():
        slp = gsis_map.get(str(r.gsis_id)) or espn_map.get(str(r.espn_id))
        if slp and slp not in out:
            hp = final[r.pos]["draft"].predict_proba([[r.log_pick]])[0, 1]
            out[slp] = {"n": r.pfr_player_name, "p": r.pos, "y": int(r.draft_year), "pk": int(r.pick),
                        "ts": None, "tr": None, "hp": round(float(hp), 3), "sch": r.college, "nocfb": 1}
    return out


def score_college(ps, bio, final, age0, top_n=60):
    """Every current college QB/RB/WR/TE, profiled as of now and 'drafted' at his first
    eligible draft (three seasons after his first on file)."""
    cur = ps[ps.season == SEASON].drop_duplicates("player_id").set_index("player_id")
    cand = bio.loc[bio.index.isin(cur.index)].copy()
    cand = cand[cand.ros_pos.isin(POS)]
    subj = cand.reset_index().rename(columns={"index": "player_id", "ros_pos": "pos"})
    subj["player_id"] = subj.player_id.astype("Int64")
    subj["draft_year"] = np.maximum(SEASON + 1, subj.hs_class + 3)
    subj["cutoff"] = SEASON
    subj["dob"] = subj.ros_dob
    subj["sid"] = "c" + subj.player_id.astype(str)
    feats = career_features(subj, ps, age0)
    subj = subj.merge(feats, on="sid", how="left").rename(columns={"ros_weight": "weight"})
    subj["speed_score"] = np.nan
    rows = []
    for pos in POS:
        fin = final[pos]
        # Plausible prospects only: a qualifying season on file, and for a QB a season as the
        # starter. The models were fit on draftees, nearly all of them starters, so a backup's
        # 30-attempt completion rate is an extrapolation, not a profile.
        s = subj[(subj.pos == pos) & (subj.n_qual >= 1) & ((pos != "QB") | (subj.starts >= 1))].copy()
        X = s[fin["cols"]].to_numpy(float)
        s["_tp"] = fin["talent"].predict_proba(X)[:, 1]
        s = s.sort_values("_tp", ascending=False)
        s = pd.concat([s[s.draft_year == SEASON + 1].head(top_n), s[s.draft_year > SEASON + 1].head(top_n // 2)])
        X = s[fin["cols"]].to_numpy(float)
        for i, (_, r) in enumerate(s.iterrows()):
            scen = []
            for a, b in ROUNDS.values():
                lp = np.log(np.arange(a, b + 1, dtype=float))
                if fin["shipped"] != "draft":
                    Xs = np.column_stack([np.repeat(X[i:i + 1], len(lp), axis=0), lp])
                else:
                    Xs = lp.reshape(-1, 1)
                scen.append(round(float(fin[fin["shipped"]].predict_proba(Xs)[:, 1].mean()), 3))
            ts = pctile(fin["ref"], float(logit(r._tp)))
            st, line = key_stats(r)
            rows.append({"n": r["name_final"], "p": pos, "sch": cur.pos_team.get(r.player_id, r.pos_team_final),
                         "cls": int(r.draft_year),
                         "ts": round(ts), "tr": tier_of(ts), "tp": round(float(r._tp), 3),
                         "ba": None if pd.isna(r.breakout_age) else round(float(r.breakout_age), 1),
                         "age": None if pd.isna(r.draft_age) else round(float(r.draft_age), 1),
                         "st": st, "ln": line, "r": scen, "cp": comp_rows(fin, X[i], "talent")})
    return rows


# ----------------------------------------------------------------------------- output

FIELDS = {
    "ts": "Talent score 0-100: percentile of the no-draft-capital model among drafted players at the position since 2008",
    "tr": "Tier index into tiers[] (cut on the talent score)",
    "hp": "Hit probability with actual draft capital (shipped model, see pos[].shipped)",
    "tp": "Talent-only hit probability, as if drafted, with no draft capital",
    "ba": "Breakout age: age at the first college season at the dominator line (never broke out = final age + 1)",
    "st": "Key college stats: dom = best dominator, yptpa = best rec yds per team pass att, share = best rec yds share, "
          "sypg = career scrimmage yds/game, aya/comp = final passing season, rypg = best QB rush yds/game, starts = 150-att seasons",
    "ln": "Final counted college season line",
    "cp": "Comps: [name, draft year, pick, best PPR PPG in window, hit 0/1]",
    "oos": "1 = hp/tp are leave-one-class-out (the model never saw his class)",
    "out": "Observed: [hit 0/1, best PPR PPG in window, best position rank]",
    "r": "College only: hit probability if drafted in [Round 1, Round 2, Round 3, Day 3]",
    "cls": "College only: first eligible draft year",
    "age": "College only: projected age at that draft (estimated from class, no public DOB)",
}


def write_payload(res):
    pos_meta = {}
    for pos, r in res["results"].items():
        top, win = TARGET[pos]
        pos_meta[pos] = {"target": f"Top-{top} {pos} season by PPR points per game ({MIN_GAMES}+ games) in NFL years 1-{win}",
                         "base_rate": round(r["base_rate"]["rate"], 3), "n": r["draft"]["n"], "shipped": r["shipped"],
                         "tier_hit": [[x["n"], None if x["hit"] is None else round(x["hit"], 3)] for x in r["tier_hit"]],
                         "auc": {k: round(r[k]["auc"], 3) for k in ("draft", "talent", "full")},
                         "logloss": {k: round(r[k]["logloss"], 4) for k in ("draft", "talent", "full")}}
    payload = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "season": SEASON,
               "source": "sportsdataverse-data (ESPN college PBP seasons, rosters, recruits) + nflverse-data "
                         "(draft picks, players, combine, season stats); see notes/prospect-research/data-sources.md",
               "tiers": [t[0] for t in TIERS], "tier_cut": [t[1] for t in TIERS], "rounds": list(ROUNDS),
               "fields": FIELDS, "pos": pos_meta, "nfl": res["nfl"], "college": res["college"]}
    body = json.dumps(bpp.clean(payload), allow_nan=False, separators=(",", ":"))
    OUT.write_text(f"window.PROSPECT_MODEL={body};\n", encoding="utf-8")
    print(f"wrote {OUT.name} ({OUT.stat().st_size:,} bytes): {len(res['nfl'])} NFL players, {len(res['college'])} college prospects")


def f3(v):
    return "n/a" if v is None else f"{v:.3f}"


def write_card(res):
    """Regenerate the numbers block of the model card between its markers."""
    L = []
    cov = res["coverage"]
    L.append(f"Linked {cov['linked']} of {cov['drafted']} drafted QB/RB/WR/TE since {FIRST_CLASS} to college data "
             f"({cov['by_era']['2008-2016']:.0%} of 2008-2016 classes, {cov['by_era']['2017-2026']:.0%} of 2017-2026).")
    L.append("")
    L.append("### Headline: leave-one-draft-class-out")
    L.append("")
    L.append("| Pos | Target | n / hits | Model | AUC | Brier | Log loss | r vs best PPG |")
    L.append("|---|---|---|---|---|---|---|---|")
    for pos, r in res["results"].items():
        top, win = TARGET[pos]
        for k, lab in (("draft", "draft only (baseline)"), ("talent", "talent (no capital)"), ("full", "talent + capital"),
                       ("gbm", "monotone LightGBM (challenger)")):
            m = r[k]
            L.append(f"| {pos} | top-{top}, yrs 1-{win} | {m['n']} / {m['events']} | {lab} | {m['auc']:.3f} | "
                     f"{m['brier']:.4f} | {m['logloss']:.4f} | {m.get('r_ppg', float('nan')):.2f} |")
        L.append(f"| {pos} | | | base rate {r['base_rate']['rate']:.1%} (no model) | 0.500 | {r['base_rate']['brier']:.4f} | "
                 f"{r['base_rate']['logloss']:.4f} | |")
    L.append("")
    L.append(f"### Forward-chained check (train on earlier classes only, test {FIRST_CLASS + 5} on)")
    L.append("")
    L.append("| Pos | n | draft only | talent + capital | LightGBM | draft AUC | full AUC | Shipped hit model |")
    L.append("|---|---|---|---|---|---|---|---|")
    label = {"draft": "draft only", "full": "talent + capital", "gbm": "monotone LightGBM"}
    for pos, r in res["results"].items():
        fw = r["forward"]
        L.append(f"| {pos} | {fw['draft']['n']} | {fw['draft']['logloss']:.4f} | {fw['full']['logloss']:.4f} | "
                 f"{fw['gbm']['logloss']:.4f} | {fw['draft']['auc']:.3f} | {fw['full']['auc']:.3f} | **{label[r['shipped']]}** |")
    L.append("")
    L.append("Log loss columns. Ship rule: a model replaces the draft-only baseline only if it has lower log loss in BOTH "
             f"the leave-one-class-out and the forward-chained runs AND wins in at least {BOOT_P:.0%} of draft-class "
             "bootstrap resamples of the leave-one-class-out predictions.")
    L.append("")
    L.append("### Verdict per position")
    L.append("")
    for pos, r in res["results"].items():
        fw = r["forward"]
        dl = r["draft"]["logloss"] - r["full"]["logloss"]
        fl = fw["draft"]["logloss"] - fw["full"]["logloss"]
        head = (f"- **{pos}**: talent + capital vs capital alone, log loss gain {dl:+.4f} leave-one-class-out and "
                f"{fl:+.4f} forward-chained (AUC {r['draft']['auc']:.3f} to {r['full']['auc']:.3f}). ")
        bt = r["boot"]["full"]
        head += (f"Class bootstrap: the gain is positive in {bt['p']:.0%} of resamples "
                 f"(90% interval {bt['lo']:+.4f} to {bt['hi']:+.4f}). ")
        if r["shipped"] == "draft":
            head += ("That is not a reliable win over capital alone, so the hit probability ships from the draft-only "
                     "model; the talent score still shows as the pre-draft profile.")
        else:
            head += f"Ships **{label[r['shipped']]}**."
        L.append(head)
        L.append(f"  - LightGBM challenger: {r['gbm']['logloss']:.4f} leave-one-class-out, {fw['gbm']['logloss']:.4f} "
                 f"forward ({'promoted' if r['shipped'] == 'gbm' else 'not promoted'}).")
    L.append("")
    L.append("### Standardized coefficients (final fit on every training class)")
    L.append("")
    for pos, r in res["results"].items():
        for k in ("draft", "talent", "full"):
            c = sorted(r["coef"][k].items(), key=lambda kv: -abs(kv[1]))
            pen = f" (C={r['C'][k]})" if k in r["C"] else " (unpenalized)"
            L.append(f"- {pos} {k}{pen}: " + ", ".join(f"`{a}` {b:+.3f}" for a, b in c))
    L.append("")
    L.append("### Calibration by decile of the shipped hit model (out of sample)")
    L.append("")
    L.append("| Pos | " + " | ".join(f"D{i}" for i in range(1, 11)) + " |")
    L.append("|---|" + "---|" * 10)
    for pos, r in res["results"].items():
        L.append(f"| {pos} pred | " + " | ".join(f"{c['pred']:.2f}" for c in r["calibration"]) + " |")
        L.append(f"| {pos} obs | " + " | ".join(f"{c['obs']:.2f}" for c in r["calibration"]) + " |")
    L.append("")
    L.append("Each decile holds about a tenth of the position's sample (n per cell = n / 10).")
    L.append("")
    L.append("### Tier hit rates (tiers cut on the out-of-sample talent score)")
    L.append("")
    L.append("| Pos | " + " | ".join(f"{t[0]} (>= {t[1]})" for t in TIERS) + " |")
    L.append("|---|" + "---|" * len(TIERS))
    for pos, r in res["results"].items():
        L.append(f"| {pos} | " + " | ".join(
            "n/a" if x["hit"] is None else f"{x['hit']:.0%} (n={x['n']})" for x in r["tier_hit"]) + " |")
    block = "\n".join(L)
    start, end = "<!-- METRICS:BEGIN (build_prospect_model.py rewrites this block) -->", "<!-- METRICS:END -->"
    text = CARD.read_text(encoding="utf-8") if CARD.exists() else f"# Prospect model card\n\n{start}\n{end}\n"
    if start not in text:
        text += f"\n{start}\n{end}\n"
    a, b = text.index(start) + len(start), text.index(end)
    CARD.write_text(text[:a] + "\n" + block + "\n" + text[b:], encoding="utf-8")
    print(f"updated {CARD.name}")


# ----------------------------------------------------------------------------- self-check

def self_check():
    # 1. feature math on a two-season fixture: team totals, shares, breakout, best/final.
    ps = pd.DataFrame({
        "season": [2020, 2020, 2021, 2021], "player_id": [1, 2, 1, 2], "team_id": [9, 9, 9, 9],
        "name": ["A B", "C D", "A B", "C D"], "pos_team": ["X"] * 4, "fbs_class": ["P5"] * 4,
        "team_games": [12] * 4, "g_receiving": [12, 12, 12, 12], "g_rushing": [np.nan] * 4, "g_passing": [12, np.nan, 12, np.nan],
        "targets": [40, 60, 90, 30], "rec": [30, 45, 70, 20], "rec_yds": [300, 700, 1000, 250], "rec_td": [2, 6, 10, 2],
        "rush_att": [0] * 4, "rush_yds": [0] * 4, "rush_td": [0] * 4,
        "pass_att": [400, 0, 400, 0], "pass_comp": [0] * 4, "pass_yds": [0] * 4, "pass_td": [0] * 4, "pass_int": [0] * 4,
    })
    m = season_metrics(ps).set_index(["player_id", "season"])
    assert m.loc[(1, 2020), "rec_share"] == 0.3 and m.loc[(1, 2020), "rec_td_share"] == 0.25
    assert abs(m.loc[(1, 2020), "dom_rec"] - 0.275) < 1e-9
    assert abs(m.loc[(1, 2021), "ryptpa"] - 2.5) < 1e-9          # 1000 / 400 team attempts
    assert abs(m.loc[(1, 2021), "target_share"] - 0.75) < 1e-9
    part = season_metrics(ps.assign(season=[SEASON - 1, SEASON - 1, SEASON, SEASON], g_receiving=[5, 5, 4, 4], g_passing=[np.nan] * 4,
                                    team_games=[5, 5, 5, 5])).set_index(["player_id", "season"])
    assert part.loc[(1, SEASON - 1), "qual"] and not part.loc[(1, SEASON), "qual"], "4 games of the live season never qualify"
    subj = pd.DataFrame({"sid": ["s1"], "player_id": pd.array([1], dtype="Int64"), "pos": ["WR"], "cutoff": [2021],
                         "draft_year": [2022], "dob": [pd.Timestamp("2001-09-01")], "hs_class": [2020]})
    cf = career_features(subj, m.reset_index(), 18.7).set_index("sid").loc["s1"]
    assert abs(cf.ryptpa_best - 2.5) < 1e-9 and cf.season_final == 2021
    assert abs(cf.breakout_age - 19.0) < 0.01, cf.breakout_age   # 2020 dom 0.275 clears 0.20 at age 19
    assert cf.early == 1.0 and cf.n_seasons == 2
    assert abs(cf.draft_age - (pd.Timestamp("2022-04-25") - pd.Timestamp("2001-09-01")).days / 365.25) < 1e-9
    # cutoff hides later seasons: the same player cut at 2020 has no 2021 in his profile.
    cf20 = career_features(subj.assign(cutoff=2020), m.reset_index(), 18.7).set_index("sid").loc["s1"]
    assert cf20.season_final == 2020 and abs(cf20.ryptpa_best - 0.75) < 1e-9

    # 2. the college join: espn id first, then name + final season + school, never a guess.
    ps2 = pd.DataFrame({"player_id": pd.array([10, 11, 12, 13], dtype="Int64"), "season": [2015, 2015, 2015, 2015],
                        "name": ["Joe Smith", "Joe Smith", "Ann Lee", "Bo Diddley"],
                        "pos_team": ["Michigan State", "Rice", "Oregon", "Iowa"]})
    dr = pd.DataFrame({"pfr_player_name": ["Joe Smith", "Ann Lee", "Bo Diddley", "Zed Q"], "season": [2016] * 4,
                       "college": ["Michigan St.", "Oregon", "Texas", "Iowa"]})
    got = link_college(dr, pd.Series([np.nan, "12", np.nan, np.nan]), ps2)
    assert got.get(0) == 10, "name + school picks the right Joe Smith"
    assert got.get(1) == 12, "espn id wins"
    assert 2 not in got.index, "a school mismatch is left unlinked, not guessed"
    assert 3 not in got.index

    # 3. no post-draft input in any talent model, and the talent profile ignores the pick.
    for pos, cols in FEATS.items():
        assert not set(cols) & POST_DRAFT, pos
    subj_b = subj.assign(pick=1, log_pick=0.0)
    cf_b = career_features(subj_b, m.reset_index(), 18.7).set_index("sid").loc["s1"]
    assert cf_b.equals(cf), "talent features must not depend on draft position"

    # 4. CV folds never train on the held-out class; forward folds only on earlier ones.
    g = np.array([2010, 2010, 2011, 2012, 2012, 2013])
    for tr, te in folds(g):
        assert set(g[te]).isdisjoint(g[tr]) and len(set(g[te])) == 1
    for tr, te in folds(g, forward=True, start=2011):
        assert g[tr].max(initial=0) < g[te].min()
    y = np.array([0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1], float)
    X = np.arange(12, dtype=float).reshape(-1, 1)
    gg = np.repeat([2010, 2011, 2012, 2013], 3)
    seen = []
    def spy(a, b, grp):
        seen.append(set(grp))
        return make_lr(1.0).fit(a, b)
    cv_predict(X, y, gg, spy)
    assert all(len(s) == 3 for s in seen) and len(seen) == 4

    # 5. outcome window: only seasons inside the window count, and an open window is blank.
    t = pd.DataFrame({"sid": ["a", "b"], "gsis_id": ["g1", "g2"], "pos": ["WR", "WR"], "draft_year": [2018, LAST_NFL]})
    s = pd.DataFrame({"player_id": ["g1", "g1", "g2"], "season": [2019, 2021, LAST_NFL], "ppg": [12.0, 20.0, 18.0],
                      "rank": [30, 5, 10]})
    o = attach_outcomes(t, s).set_index("sid")
    assert o.loc["a", "hit"] == 0.0 and o.loc["a", "best_ppg"] == 12.0, "2021 is year 4, outside a 3-year window"
    assert pd.isna(o.loc["b", "hit"])
    print("self-check OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()
    if args.self_check:
        self_check()
        return
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", message="X does not have valid feature names")
    res = build()
    write_payload(res)
    write_card(res)


if __name__ == "__main__":
    main()
