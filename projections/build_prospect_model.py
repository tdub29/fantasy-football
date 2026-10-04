"""College prospect projection model for QB/RB/WR/TE.

Writes site/data/prospect-model.js (window.PROSPECT_MODEL) and rewrites the numbers
in notes/prospect-research/model-card.md. Spec and evidence:
notes/prospect-research/{wr-te-models,rb-qb-methodology,data-sources}.md.

Three logistic models per position:
  draft   a restricted cubic spline in log(pick): the baseline everything has to beat
  talent  college production + age + size, ridge, NO draft capital (usable before the draft)
  full    talent + the same spline in log(pick)
Judged three ways: leave-one-draft-class-out on the development classes (before HOLD),
forward-chained on them with an embargo of the outcome window, and walk-forward on the
untouched holdout classes (HOLD on). The hit probability ships from `full` only where it
beats `draft` on log loss in all three and in 80% of draft-class bootstrap resamples;
otherwise the draft-only model ships. A monotone LightGBM is scored as a challenger.

Sources, all key-free GitHub release downloads (cached; closed seasons kept forever):
  sportsdataverse-data  espn_cfb_{receiving,rushing,passing}  PBP-derived player seasons, 2004+
                        espn_cfb_rosters, cfb_recruits          position, size, class, stars
  nflverse-data         draft_picks, players, combine, stats_player_reg_<yr>, roster_<yr>
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
import prospect_db as pdb  # noqa: E402  (the local SQLite store every input is read from)

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
# Receiving shares need a passing offense to be a share of. A season on a team that threw fewer
# than this many passes a game (half the FBS median of 30.4, 2004-2025; in practice the
# triple-option teams, Army threw 9 in 2025) carries no YPTPA and cannot be a breakout: 13
# catches there were 37% of Army's receiving yards. Chosen over empirical-Bayes shrinkage by
# team pass attempts, which kept that profile near the top 10 and failed the low-volume guard
# below at every weight tried (model card, "Low-volume shares").
MIN_PASS_PG = 15.0
# The talent model must never put a player in its top decile on receiving shares posted at this
# passing volume, however extreme (build() asserts it on the shipped fit). Just ABOVE the floor:
# at 12 the floor itself zeroed the shares, so the check could not fail.
LOW_VOLUME_PG = 16.0
# Draft classes from here on are the holdout: scored walk-forward only, never used to choose a
# feature, C, knot or floor. Everything tuned is tuned on the classes before it.
HOLD = 2020
# The model's YPTPA never divides by fewer than this many team passes a game: the FBS 25th
# percentile, 2004-2025. Above the floor, shares still ran too hot: at 16 a game the guard above
# scored 100 (WR), 95 (RB), 99 (TE). The 5th (19.8) and 10th (22.7) percentiles left WR at 97 and
# 91; development log loss moved 0.0013 at most (model card, "Low-volume shares").
PASS_DEN_PG = 26.5
CURVE_PICKS = (1, 10, 32, 64, 100, 150, 250)   # picks the card prints the draft-only curve at

# Talent features. A first research-driven set of 6-7 per position lost to capital alone;
# these are the research-backed subsets kept after one leave-one-class-out pruning pass
# (disclosed in the model card as selection optimism; the untouched holdout is the check).
# WR breakout age left on 2026-09-28: on class-year ages (the only ages a college player has)
# dropping it improved the development talent and full models both, so it stays display-only.
# QB draft age is mixed (talent worse without it) and stays.
FEATS = {
    "WR": ["ryptpa_career", "early", "stars"],
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
# Pre-draft hit chance for current college players (population B: every exiting FBS player, drafted
# or not; validation-charter-v2.md addenda 1-2). A position is listed only after its candidate passed
# the five numeric rules AND an independent leakage review; the choice among passing candidates is
# the lowest forward log loss (addendum 2). Empty = no pre-draft forecast ships.
# Pulled 2026-10-04 under addendum 8: the serving backtest (prospect_serving_backtest.py) found the
# exit-scenario transform about 2x low for first-eligible players (mean ratio 0.42-0.45) although
# the same models are calibrated on real exits (0.94-1.07). B10/B8 remain reviewed as models; the
# way a current player is fed to them is what failed. Was {"RB": "B10", "WR": "B10", "TE": "B8"}.
PREDRAFT: dict[str, str] = {}
# QB is out: its only passing candidate (B9) leaned on receiving columns that are noise for passers
# and its calibration pass was a coin flip under resampling (experiments/review-c-2026-10-04.md).
# Positions whose career-stage model (B14, prospect_stage.py) passed the rules on all rows and on
# freshman-sophomore rows AND an independent review: it serves the classes after the next one, from
# completed seasons, with no exit assumption. Empty = those classes get no pre-draft number.
STAGE: set[str] = set()
# Positions whose NEXT draft class is served by the career-stage model fit on every completed season
# (S1, charter v2 addendum 9): from completed seasons, no exit scenario. Listed only after it passed
# the serving backtest (prospect_serving_backtest.py) and an independent review.
# WR only (2026-10-04): RB passed the serving backtest pooled but failed display rule D1 (top 60 by
# forecast: slope 0.74 against the 0.75 floor), addendum 10; WR passed both (review E + addendum 10).
# Position -> served variant: S1 = fixed C 0.1, S3 = C picked by inner leave-one-class-out (addendum 11;
# in practice C = 0.03, the grid's floor, on a nearly flat curve). WR: S3, which beat the shipped S1 on
# served log loss in every season resample (review G). RB is held back: S3 passes the registered gates
# but its display-rule pass has 62% resampling support and it is effectively S1 (logit correlation
# 0.993), which failed that rule; shipping it would be a re-roll, not a demonstrated improvement.
# S4n = S3 plus his team's first n games of the season in progress (addenda 12-13, prospect_live.py).
# RB: S4n4 (2026-10-04, review H): every gate passed, beats S3 on served log loss in 92% of season
# resamples, and is a different model (logit correlation 0.944). Known risk: its D1 slope pass has
# 68% resampling support. N=8 failed D1 (0.67); WR S4 failed the all-rows ratio, so WR stays on S3.
NEXT_MODEL: dict[str, str] = {"WR": "S3", "RB": "S4n4"}
NEXT_STAGE: set[str] = set(NEXT_MODEL)
# Positions where the charter v2 candidate A10 ships: a fixed 50/50 average of the draft-only and
# talent + capital logits. Listed only after it passed the charter's five numeric rules on identical
# folds AND an independent review (notes/prospect-research/experiments/A10.json). The v1 three-run
# rule still decides every other position.
BLEND: set[str] = set()
ROUNDS = {"R1": (1, 32), "R2": (33, 64), "R3": (65, 100), "D3": (101, 257)}
# Our tier names, cut on the talent percentile vs every drafted player at the position.
TIERS = [("Blue Chip", 90), ("Plus Starter", 70), ("Contributor", 45), ("Project", 20), ("Long Shot", 0)]
# nflverse draft_picks school -> the name ESPN's college feed uses (both sides normalized).
SCHOOL_ALIAS = {"mississippi": "ole miss", "central florida": "ucf", "ala birmingham": "uab", "texas el paso": "utep",
                "texas san antonio": "utsa", "ut san antonio": "utsa", "miami fl": "miami",
                "north carolina state": "nc state", "connecticut": "uconn", "southern mississippi": "southern miss",
                "la monroe": "ul monroe", "louisiana monroe": "ul monroe", "middle tenn state": "middle tennessee",
                "florida international": "florida intl", "louisiana lafayette": "louisiana"}
# First-name forms joined as one (Cam/Cameron Newton, Matt/Matthew Slater, Will/William Franklin).
NICK = {"cam": "cameron", "will": "william", "bill": "william", "billy": "william", "ken": "kenneth",
        "kenny": "kenneth", "matt": "matthew", "mike": "michael", "chris": "christopher", "steve": "steven",
        "stevie": "steven", "stephen": "steven", "jon": "jonathan", "josh": "joshua", "joe": "joseph",
        "joey": "joseph", "tony": "anthony", "nick": "nicholas", "alex": "alexander", "zach": "zachary",
        "zack": "zachary", "jake": "jacob", "ben": "benjamin", "dan": "daniel", "danny": "daniel",
        "rob": "robert", "bob": "robert", "bobby": "robert", "tom": "thomas", "tommy": "thomas", "jim": "james",
        "jimmy": "james", "dave": "david", "andy": "andrew", "drew": "andrew", "greg": "gregory",
        "jeff": "jeffrey", "sam": "samuel", "pat": "patrick", "rick": "richard", "ricky": "richard",
        "ed": "edward", "eddie": "edward", "ron": "ronald", "ronnie": "ronald", "don": "donald",
        "charlie": "charles", "chuck": "charles", "tim": "timothy", "johnny": "john", "freddie": "frederick",
        "fred": "frederick", "jerry": "gerald", "larry": "lawrence", "terry": "terrence"}


# ----------------------------------------------------------------------------- data

def cfb_file(tag: str, name: str, season: int) -> pathlib.Path:
    return bpp.fetch(tag, name, base=SDV, cache=CFB, max_age_h=24.0 if season >= SEASON else INF)


def nfl_file(tag: str, name: str, max_age_h: float = 24.0) -> pathlib.Path:
    return bpp.fetch(tag, name, cache=CACHE, max_age_h=max_age_h)


# Every input is read from the SQLite store (projections/prospect_db.py), which loads the same
# release files and records their sha256; the first read refreshes it under the cache rules above.
# --source parquet reads the cached files directly and exists only to prove the two agree.
SOURCE = "db"
_CON = None


def read_src(tbl: str, name: str, columns=None) -> pd.DataFrame:
    global _CON
    if SOURCE == "parquet":
        base, tag = pdb.SOURCES[tbl][1:3]
        m = re.search(r"_(\d{4})\.parquet$", name)
        y = int(m.group(1)) if m else None
        path = (cfb_file(tag, name, y) if base == SDV
                else nfl_file(tag, name, 24.0 if y is None or y >= SEASON else INF))
        return pd.read_parquet(path, columns=columns)
    if _CON is None:
        _CON = pdb.connect()
        pdb.ingest(_CON, say=lambda *a: None)
    return pdb.read_file(_CON, tbl, name, columns)


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
        frames = [read_src(f"cfb_{kind}", f"cfb_{kind}_{y}.parquet") for y in seasons]
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
    # The model's YPTPA divides by at least PASS_DEN_PG a game, so a team passing just over the
    # floor cannot hand its receivers a full-strength share of a tiny passing game.
    ps["pass_den"] = np.maximum(ps.t_pass_att, PASS_DEN_PG * ps.team_games)
    ps["ryptpa"] = div(ps.rec_yds, ps.pass_den)
    ps["ryptpa_posted"] = div(ps.rec_yds, ps.t_pass_att)
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
    ps["thin"] = ps.t_pass_att < MIN_PASS_PG * ps.team_games   # too little passing for a share
    return ps


def load_rosters(seasons=range(FIRST_CFB, SEASON + 1)) -> pd.DataFrame:
    cols = ["season", "athlete_id", "team_id", "full_name", "position_abbreviation",
            "height", "weight", "date_of_birth", "experience_years"]
    d = pd.concat([read_src("cfb_roster", f"cfb_rosters_{y}.parquet", cols) for y in seasons], ignore_index=True)
    d["athlete_id"] = pd.to_numeric(d["athlete_id"], errors="coerce").astype("Int64")
    d["team_id"] = pd.to_numeric(d["team_id"], errors="coerce")
    return d


def load_recruits(seasons=range(FIRST_CFB, SEASON + 1)) -> pd.DataFrame:
    d = pd.concat([read_src("cfb_recruit", f"cfb_recruits_{y}.parquet") for y in seasons], ignore_index=True)
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
    Seasons under MIN_PASS_PG drop out of every YPTPA feature and the breakout test; the
    unfiltered numbers stay on as ryptpa_raw_* for display.
    Uses nothing from the NFL side, which is what keeps the talent model pre-draft."""
    f = subj[["sid", "player_id", "pos", "cutoff", "dob", "hs_class"]].merge(ps, on="player_id")
    f = f[f.season <= f.cutoff].copy()
    f["ryptpa_raw"] = f["ryptpa_posted"]
    f.loc[f.thin, "ryptpa"] = np.nan
    sept1 = pd.to_datetime(f.season.astype(int).astype(str) + "-09-01")
    f["age"] = np.where(f.dob.notna(), age_years(sept1, f.dob), age0 + f.season - f.hs_class)
    f["dom"] = np.where(f.pos == "RB", f.dom_scrim, f.dom_rec)
    anyq = f.groupby("sid")["qual"].transform("any")
    pool = f[f.qual | ~anyq].sort_values(["sid", "season"])
    g = pool.groupby("sid")
    out = pd.DataFrame(index=subj.sid)
    for c in ("ryptpa", "ryptpa_raw", "dom", "rec_share", "target_share"):
        out[f"{c}_best"] = g[c].max()
    fin = pool.drop_duplicates("sid", keep="last").set_index("sid")
    for c in ("ryptpa", "ryptpa_raw", "dom", "rec_share", "season", "age", "power", "pos_team", "name",
              "rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td", "games"):
        out[f"{c}_final"] = fin[c]
    ga = f.groupby("sid")
    out["scrim_ypg"] = ga.scrim_yds.sum() / ga.games.sum().replace(0, np.nan)
    out["ryptpa_raw_career"] = ga.rec_yds.sum() / ga.t_pass_att.sum().replace(0, np.nan)
    ok = f[~f.thin].groupby("sid")
    out["ryptpa_career"] = ok.rec_yds.sum() / ok.pass_den.sum().replace(0, np.nan)
    out["n_seasons"] = ga.season.nunique()
    out["n_qual"] = ga.qual.sum()
    out["power"] = out.pop("power_final")
    # Breakout age: first qualifying season at the position's dominator line, on a team that
    # passed at least MIN_PASS_PG a game; a player who never got there is scored one year past
    # his final college age.
    thr = pool.pos.map(BREAKOUT)
    bo = pool[(pool.dom >= thr) & ~pool.thin].drop_duplicates("sid", keep="first").set_index("sid")
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

def name_key(s) -> str:
    """norm_name with the first name mapped through NICK."""
    s = "" if s is None or (isinstance(s, float) and math.isnan(s)) else str(s)
    toks = [t for t in s.lower().replace(".", "").replace("'", "").replace("-", " ").split() if t not in bpp.SUFFIXES]
    if toks:
        toks[0] = NICK.get(toks[0], toks[0])
    return "".join(toks)


def link_college(draft: pd.DataFrame, espn_ids: pd.Series, ps: pd.DataFrame, methods: dict | None = None) -> pd.Series:
    """College player_id per draft row. ESPN kept the college id into the NFL only from about
    the 2017 class on, so older classes fall back to name + final college season + school.
    An id whose college seasons run into his draft year is someone else (Taylor Price, 2010,
    carried the id of a 2015 Fresno State player) and falls back too. The name side matches any
    name the id was listed under (ESPN has Robert Griffin III as "Griffin III" in 2010-11).

    One fallback runs only for a pick nothing above linked (2026-10-04): a first name that is a prefix
    of the other (Ray Rice was "Raymell Rice") with the same surname, final season and school. A second
    one, the exact name at any school when one id fits the window, was tried and dropped: it found
    Dorial Green-Beckham but tied FCS players to FBS namesakes (Josh Johnson, San Diego, to Iowa State's;
    Isaiah Davis, South Dakota State, to UTSA's). `methods`, if given, gets each link's rule."""
    last = ps.sort_values("season").groupby("player_id").agg(last_season=("season", "max"),
                                                             team=("pos_team", "last"), name=("name", "last"))
    last["_k"] = last.name.map(name_key)
    eid = pd.to_numeric(espn_ids, errors="coerce")
    ok = eid.map(last.last_season) < draft["season"].reindex(eid.index)
    direct = eid.where(ok)
    names = ps[["player_id", "name"]].dropna().drop_duplicates()
    ids_by_name = names.assign(_k=names.name.map(name_key)).groupby("_k")["player_id"].agg(lambda s: sorted(set(s)))
    out = {}
    methods = {} if methods is None else methods
    by_last = names.assign(_t=names.name.map(_name_tokens)).dropna(subset=["_t"])
    by_last = by_last.assign(_l=by_last._t.str[-1], _f=by_last._t.str[0])
    for i, row in draft.iterrows():
        if pd.notna(direct.get(i)):
            out[i] = int(direct[i])
            methods[i] = "espn_id"
            continue
        key = name_key(row["pfr_player_name"])
        ids = ids_by_name.get(key)
        if ids is None:
            continue
        c = last.loc[ids]
        c = c[c.last_season.between(row["season"] - 2, row["season"] - 1)]
        if c.empty:
            continue
        sim = c.team.map(lambda t: school_sim(row["college"], t))
        c = c[(sim >= 0.5) & (sim == sim.max())]
        if len(c) > 1:   # a stray season under his name on a second id: the id still carrying it wins
            c = c[c._k == key]
        if len(c) == 1:
            out[i] = int(c.index[0])
            methods[i] = "name_school"
    for i, row in draft.iterrows():
        if i in out:
            continue
        win = lambda ids: last.loc[[x for x in ids if x in last.index]].query("last_season >= @lo and last_season <= @hi",
                                                                               local_dict={"lo": row["season"] - 2, "hi": row["season"] - 1})
        t = _name_tokens(row["pfr_player_name"])
        if t:
            cand = by_last[(by_last._l == t[-1]) & by_last._f.map(lambda f: f != t[0] and len(min(f, t[0], key=len)) >= 3
                                                                      and (f.startswith(t[0]) or t[0].startswith(f)))]
            c = win(sorted(set(cand.player_id)))
            c = c[[school_sim(row["college"], tm) >= 0.5 for tm in c.team]]
            if len(c) == 1 and int(c.index[0]) not in out.values():
                out[i] = int(c.index[0])
                methods[i] = "name_prefix"
    return pd.Series(out, dtype="Int64")


def _name_tokens(s):
    s = "" if s is None or (isinstance(s, float) and math.isnan(s)) else str(s)
    toks = [t for t in s.lower().replace(".", "").replace("'", "").replace("-", " ").split() if t not in bpp.SUFFIXES]
    return toks if len(toks) >= 2 else None


def school_key(s) -> str:
    s = str(s or "").lower().replace("st.", "state").replace("col.", "college").replace("&", "and").replace("-", " ")
    s = " ".join(re.sub(r"[^a-z ]", "", s).replace("university", "").split())
    return SCHOOL_ALIAS.get(s, s)


def school_sim(a, b) -> float:
    # No substring rule: it scored "Central Florida" a perfect match for "Florida".
    a, b = school_key(a), school_key(b)
    if not a or not b:
        return 0.0
    return 1.0 if a == b else difflib.SequenceMatcher(None, a, b).ratio()


def season_positions() -> pd.Series:
    """(gsis_id, season) -> position he was listed at on that season's nflverse roster."""
    r = pd.concat([read_src("nfl_roster", f"roster_{y}.parquet", ["gsis_id", "season", "position"])
                   for y in range(FIRST_CLASS, LAST_NFL + 1)])
    return r.dropna().drop_duplicates(["gsis_id", "season"]).set_index(["gsis_id", "season"])["position"]


def nfl_outcomes(stats: pd.DataFrame, season_pos: pd.Series) -> pd.DataFrame:
    """PPR points per game per player-season (8+ games) and his position THAT season (`spos`).
    The stats file's `position` is his current one, which ranked fullbacks drafted as RBs
    among FBs and a drafted RB among DBs; it is only the fallback here."""
    s = stats[stats.games >= MIN_GAMES][["player_id", "season", "position", "games", "fantasy_points_ppr"]].copy()
    s["ppg"] = s.fantasy_points_ppr / s.games
    s["spos"] = pd.Series(pd.MultiIndex.from_arrays([s.player_id, s.season]).map(season_pos), index=s.index
                          ).fillna(s.position)
    return s


def attach_outcomes(t: pd.DataFrame, seasons: pd.DataFrame) -> pd.DataFrame:
    """hit / best_ppg / best_rank inside each player's window; blank when the window is open.
    Each of his seasons is ranked against that season's players listed at his DRAFT position,
    whatever he was listed at himself (a drafted TE playing RB still counts as a TE)."""
    m = t[["sid", "gsis_id", "pos", "draft_year"]].merge(seasons, left_on="gsis_id", right_on="player_id")
    win = m.pos.map(lambda p: TARGET[p][1])
    m = m[(m.season >= m.draft_year) & (m.season < m.draft_year + win)].copy()
    pools = {k: np.sort(g.ppg.to_numpy()) for k, g in seasons.groupby(["season", "spos"])}
    empty = np.array([])
    m["rank"] = [1 + len(p) - np.searchsorted(p, v, side="right")          # 1 + players strictly ahead
                 for p, v in ((pools.get((s, pos), empty), v) for s, pos, v in zip(m.season, m.pos, m.ppg))]
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
        r = read_src("nfl_roster", f"roster_{SEASON}.parquet", ["gsis_id", "sleeper_id"])
        for g, s in r.dropna().itertuples(index=False):
            gsis.setdefault(str(g), str(s))
    except SystemExit:
        pass
    return gsis, espn


# ----------------------------------------------------------------------------- models

def _boost_linear(Z):
    Z = np.array(Z, dtype=float, copy=True)
    Z[:, 0] *= UNPEN
    return Z


class RCS:
    """Restricted cubic spline of one column (Harrell): 4 knots at its 5/35/65/95th training
    percentiles, linear beyond the outer two, 3 columns (linear term first). The draft-only
    baseline is this curve in log(pick), not a straight line, so a talent model cannot win by
    bending capital. Chosen on the development classes only, over linear, quadratic, and 3- and
    4-knot splines with and without a curvature penalty (model card, "Capital curve")."""
    def fit(self, X, y=None):
        self.k_ = np.percentile(np.asarray(X, float)[:, 0], [5, 35, 65, 95])
        return self

    def transform(self, X):
        x, k = np.asarray(X, float)[:, 0], self.k_
        p = lambda u: np.maximum(u, 0.0) ** 3
        cols = [x] + [(p(x - k[j]) - p(x - k[2]) * (k[3] - k[j]) / (k[3] - k[2])
                       + p(x - k[3]) * (k[2] - k[j]) / (k[3] - k[2])) / (k[3] - k[0]) ** 2 for j in (0, 1)]
        return np.column_stack(cols)

    def fit_transform(self, X, y=None):
        return self.fit(X).transform(X)


def blend_p(p_draft, p_full, w=0.5):
    """Charter v2 A10: average the two models' logits with a fixed weight (no tuning)."""
    return 1 / (1 + np.exp(-((1 - w) * logit(p_draft) + w * logit(p_full))))


class Blend:
    """Fitted draft-only and talent + capital models, blended (X: talent columns then log pick)."""
    def __init__(self, draft, full, w=0.5):
        self.draft, self.full, self.w = draft, full, w

    def predict_proba(self, X):
        X = np.asarray(X, float)
        q = blend_p(self.draft.predict_proba(X[:, -1:])[:, 1], self.full.predict_proba(X)[:, 1], self.w)
        return np.column_stack([1 - q, q])


def make_lr(C: float, n_talent: int | None = None, capital: bool = False):
    """Logistic model on standardized features. capital=True treats the LAST column as log(pick),
    spline-expanded: its linear term is scaled up so the L2 penalty barely touches it, its two
    curvature terms are penalized like a college stat (unpenalized, the curve bent to 95%+ at
    the top QB picks and lost to a straight line even leave-one-class-out). n_talent=0 with
    capital is the draft-only baseline, fit at the same C so both models bend capital alike."""
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import FunctionTransformer, StandardScaler
    if not capital:
        return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(C=C, max_iter=5000))
    cap = make_pipeline(RCS(), StandardScaler(), FunctionTransformer(_boost_linear))
    parts = [("cap", cap, [n_talent])]
    if n_talent:
        parts.insert(0, ("tal", make_pipeline(SimpleImputer(strategy="median"), StandardScaler()), list(range(n_talent))))
    return make_pipeline(ColumnTransformer(parts), LogisticRegression(C=C, max_iter=5000))


def folds(groups: np.ndarray, forward: bool = False, start: int | None = None, embargo: int = 1):
    """(train_mask, test_mask) per draft class. Forward-chaining trains only on classes at least
    `embargo` years older, so with embargo = the outcome window every training label was final
    by the held-out class's draft."""
    for g in np.unique(groups):
        if start is not None and g < start:
            continue
        te = groups == g
        tr = (groups <= g - embargo) if forward else ~te
        assert not te[tr].any() and g not in set(groups[tr]), "fold trains on its held-out class"
        assert not forward or groups[tr].max(initial=-1) <= g - embargo, "fold trains on an open outcome window"
        yield tr, te


def cv_predict(X, y, groups, fit, forward=False, start=None, embargo=1):
    p = np.full(len(y), np.nan)
    for tr, te in folds(groups, forward, start, embargo):
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
    return make_lr(C_FIXED, X.shape[1] - 1, capital=True).fit(X, y)


def fit_baseline(X, y, _groups):
    return make_lr(C_FIXED, 0, capital=True).fit(X, y)


def fit_linear_baseline(X, y, _groups):
    """The old baseline (straight line in log pick), kept only to report what the spline changed."""
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

    players = read_src("nfl_player", "players.parquet")
    draft = read_src("nfl_draft_pick", "draft_picks.parquet")
    combine = read_src("nfl_combine", "combine.parquet")
    stats = pd.concat([read_src("nfl_player_season", f"stats_player_reg_{y}.parquet")
                       for y in range(FIRST_CLASS, LAST_NFL + 1)], ignore_index=True)

    d = draft[(draft.season >= FIRST_CLASS) & draft.position.isin(POS) & draft.pick.notna()].copy()
    d = d.merge(players[["gsis_id", "espn_id", "birth_date"]], on="gsis_id", how="left")
    d.index = range(len(d))
    lm = {}
    d["player_id"] = link_college(d, d.espn_id, ps, lm)
    d["link_method"] = pd.Series(lm).reindex(d.index).fillna("none")
    # The name fallback is graded against the espn id join on the classes where both work.
    both = d[pd.to_numeric(d.espn_id, errors="coerce").isin(set(ps.player_id.dropna().astype(int)))]
    cm = {}
    chk = link_college(both.assign(espn_id=np.nan), pd.Series(np.nan, index=both.index), ps, cm)
    agree = (chk.reindex(both.index) == pd.to_numeric(both.espn_id, errors="coerce").astype("Int64"))
    # The prefix fallback runs only where the main name join failed, so it never fires on these rows;
    # run alone on all 691 id-known picks it fired once and was right (review C, 2026-10-04).
    say(f"  name_prefix fallback: {(d.link_method == 'name_prefix').sum()} picks linked this way")
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
    # Train on the same age estimator college players are scored with (no DOB), so a real birth
    # date never gives the model a sharper age than it will see at prediction time.
    feats = career_features(linked.assign(dob=pd.NaT), ps, age0)
    t = linked.merge(feats, on="sid", how="left")
    t = attach_outcomes(t, nfl_outcomes(stats, season_positions()))
    return ps, bio, d, t, age0


SHARE_FEATS = {"ryptpa_best", "ryptpa_career", "ryptpa_final", "breakout_age"}


def low_volume_profile(pos, ypa, dom, age0):
    """Feature row of a low-volume career with extreme shares: two closed 12-game seasons on a
    team that threw LOW_VOLUME_PG passes a game, each at `ypa` YPTPA and `dom` dominator, the
    first at age0."""
    n = LOW_VOLUME_PG * 12
    rows = []
    for s in (SEASON - 2, SEASON - 1):
        base = {"season": s, "team_id": 1, "pos_team": "X", "fbs_class": "G5", "team_games": 12,
                "g_receiving": 12, "g_rushing": np.nan, "g_passing": np.nan, "targets": 0, "rush_att": 0,
                "rush_yds": 0, "rush_td": 0, "pass_att": 0, "pass_comp": 0, "pass_yds": 0, "pass_td": 0, "pass_int": 0}
        rows.append({**base, "player_id": 1, "name": "Low Volume", "rec": 20, "rec_yds": ypa * n, "rec_td": 10 * dom})
        rows.append({**base, "player_id": 2, "name": "Teammate", "rec": 20, "rec_yds": ypa * n * (1 / dom - 1),
                     "rec_td": 10 * (1 - dom), "pass_att": n, "g_passing": 12})
    subj = pd.DataFrame({"sid": ["lv"], "player_id": pd.array([1], dtype="Int64"), "pos": [pos], "cutoff": [SEASON - 1],
                         "draft_year": [SEASON], "dob": [pd.NaT], "hs_class": [SEASON - 2]})
    return career_features(subj, season_metrics(pd.DataFrame(rows)), age0).set_index("sid").loc["lv"]


def low_volume_ceiling(fin, pos, age0, ps):
    """Talent percentile of low_volume_profile() at the highest YPTPA and dominator a drafted
    player at the position posted on a normal-volume team (the raw maxima are thin seasons
    themselves), with every non-share feature missing, so the model imputes its median."""
    f = fin["train"][["player_id", "cutoff"]].merge(ps, on="player_id")
    f = f[(f.season <= f.cutoff) & f.qual & ~f.thin]
    x = low_volume_profile(pos, float(f.ryptpa.max()), float(min(f.dom_rec.max(), 0.95)), age0)
    X = np.array([[float(x[c]) if c in SHARE_FEATS else np.nan for c in fin["cols"]]])
    return pctile(fin["ref"], float(logit(fin["talent"].predict_proba(X)[0, 1])))


def build(verbose=True):
    say = print if verbose else (lambda *a, **k: None)
    ps, bio, d, t, age0 = prepare(say)
    results, final = {}, {}
    for pos in POS:
        tp = t[(t.pos == pos) & t.draft_year.between(FIRST_CLASS, LAST_CLASS[pos]) & t.hit.notna()
               & t.gsis_id.notna()].copy()
        cols = FEATS[pos]
        assert not set(cols) & POST_DRAFT, f"{pos} talent features leak post-draft info"
        win = TARGET[pos][1]
        y, g, ppg = tp.hit.to_numpy(float), tp.draft_year.to_numpy(int), tp.best_ppg.to_numpy(float)
        Xt, Xb = tp[cols].to_numpy(float), tp[["log_pick"]].to_numpy(float)
        Xf = tp[cols + ["log_pick"]].to_numpy(float)
        fit_gbm = fit_lgbm([MONO.get(c, 0) for c in cols + ["log_pick"]])
        fits = {"draft": (Xb, fit_baseline), "talent": (Xt, fit_talent), "full": (Xf, fit_full), "gbm": (Xf, fit_gbm),
                "linear": (Xb, fit_linear_baseline)}
        dev = g < HOLD
        # Development classes only: leave-one-class-out, and forward-chaining embargoed by the
        # outcome window (the class just before a draft has played one season of its three).
        pred = {k: np.full(len(y), np.nan) for k in fits}
        for k, (X, f) in fits.items():
            pred[k][dev] = cv_predict(X[dev], y[dev], g[dev], f)
        fwd = {k: cv_predict(X[dev], y[dev], g[dev], f, forward=True, start=FIRST_CLASS + 5, embargo=win)
               for k, (X, f) in fits.items() if k != "talent"}
        # Holdout: each class from HOLD on, scored by a fit on the classes whose window had closed by its draft.
        hold = {k: cv_predict(X, y, g, f, forward=True, start=HOLD, embargo=win) for k, (X, f) in fits.items()}
        hb = np.full(len(y), np.nan)
        for c in np.unique(g[~dev]):
            hb[g == c] = y[g <= c - win].mean()
        res = {k: metrics(y, v, ppg) for k, v in pred.items()}
        yd = y[dev]
        res["base_rate"] = {"logloss": ll(yd, np.full(len(yd), yd.mean())), "brier": float(np.mean((yd - yd.mean()) ** 2)),
                            "rate": float(y.mean())}
        res["forward"] = {k: metrics(yd, v) for k, v in fwd.items()}
        res["hold"] = {k: metrics(y, v, ppg) for k, v in hold.items()}
        res["hold"]["base"] = {"logloss": ll(y[~dev], hb[~dev]), "brier": float(np.mean((y[~dev] - hb[~dev]) ** 2))}
        res["hold_classes"] = [int(g[~dev].min()), int(g[~dev].max())]
        res["boot"] = {k: class_bootstrap(yd, pred["draft"][dev], pred[k][dev], g[dev]) for k in ("full", "gbm")}

        def beats(a, b):  # lower log loss in all three runs, and not a coin flip across draft classes
            return (res[a]["logloss"] < res[b]["logloss"] and res["forward"][a]["logloss"] < res["forward"][b]["logloss"]
                    and res["hold"][a]["logloss"] < res["hold"][b]["logloss"]
                    and (b != "draft" or res["boot"][a]["p"] >= BOOT_P))
        shipped = "full" if beats("full", "draft") else "draft"
        if beats("gbm", "draft") and beats("gbm", shipped if shipped != "draft" else "full"):
            shipped = "gbm"
        if pos in BLEND:
            shipped = "blend"
            for dct in (pred, hold):
                dct["blend"] = blend_p(dct["draft"], dct["full"])
            res["blend"] = metrics(y, pred["blend"], ppg)
            res["hold"]["blend"] = metrics(y, hold["blend"], ppg)
        res["shipped"] = shipped
        # Out of sample for every training player: dev classes leave-one-class-out, holdout walk-forward.
        oos = {k: np.where(dev, pred[k], hold[k]) for k in ("talent", shipped)}
        assert not np.isnan(oos["talent"]).any() and not np.isnan(oos[shipped]).any(), f"{pos}: a player has no OOS score"
        res["calibration"] = calibration(y, oos[shipped])
        m_t, m_f, m_b = fit_talent(Xt, y, g), fit_full(Xf, y, g), fit_baseline(Xb, y, g)
        m_g = fit_gbm(Xf, y, g)
        res["C"] = {"talent": C_FIXED, "full": C_FIXED}
        res["coef"] = {"talent": dict(zip(cols, m_t[-1].coef_[0].round(3).tolist())),
                       "full": dict(zip(cols, m_f[-1].coef_[0][:len(cols)].round(3).tolist()))}
        res["curve"] = {int(k): round(float(v), 3) for k, v in
                        zip(CURVE_PICKS, m_b.predict_proba(np.log(np.array(CURVE_PICKS, float)).reshape(-1, 1))[:, 1])}
        # Tiers on the out-of-sample talent logit, so each tier's hit rate is honest.
        ref = logit(oos["talent"])
        tp["_tpct"] = [pctile(ref, v) for v in ref]
        tp["_tier"] = [tier_of(v) for v in tp._tpct]
        res["tier_hit"] = [{"tier": TIERS[i][0], "n": int((tp._tier == i).sum()),
                            "hit": float(tp.hit[tp._tier == i].mean()) if (tp._tier == i).any() else None}
                           for i in range(len(TIERS))]
        res["n_linked"] = int(len(tp))
        results[pos] = res
        final[pos] = {"cols": cols, "talent": m_t, "full": m_f, "draft": m_b, "gbm": m_g, "blend": Blend(m_b, m_f), "shipped": shipped,
                      "ref": ref, "train": tp, "oos": dict(zip(tp.sid, zip(oos["talent"], oos[shipped])))}
        if set(cols) & SHARE_FEATS:
            res["ceiling"] = low_volume_ceiling(final[pos], pos, age0, ps)
            assert res["ceiling"] < TIERS[0][1], (
                f"{pos}: shares at {LOW_VOLUME_PG:.0f} team passes a game alone reach talent {res['ceiling']:.0f}")
        say(f"{pos}: n={len(tp)} hits={int(y.sum())} | dev LOCO draft {res['draft']['logloss']:.4f} "
            f"full {res['full']['logloss']:.4f} (linear {res['linear']['logloss']:.4f}) boot {res['boot']['full']['p']:.0%} "
            f"| fwd draft {res['forward']['draft']['logloss']:.4f} full {res['forward']['full']['logloss']:.4f} "
            f"| hold draft {res['hold']['draft']['logloss']:.4f} full {res['hold']['full']['logloss']:.4f} "
            f"gbm {res['hold']['gbm']['logloss']:.4f} -> {shipped}")

    nfl = score_nfl(t, d, final)
    for pos, m in fit_predraft(ps, bio, d, t, age0).items():
        final[pos]["predraft"] = m
        results[pos]["predraft"] = m["meta"]
    for pos, m in fit_stage(ps, bio, d, t, age0).items():
        final[pos]["stage"] = m
        results[pos]["stage"] = m["meta"]
    college = score_college(ps, bio, final, age0)
    # Generated-data consistency: a pre-draft number exists exactly where a reviewed model ships.
    for r in college:
        nxt = r["cls"] == SEASON + 1
        assert r["pd"] is None or (0.0 <= r["pd"] <= 1.0 and ((nxt and (r["p"] in PREDRAFT or r["p"] in NEXT_STAGE))
                                                             or (not nxt and r["p"] in STAGE))), \
            f"{r['n']}: pd where no reviewed model serves that class, or out of range"
    assert not set(PREDRAFT) & NEXT_STAGE, "one next-class model per position"
    for pos in set(PREDRAFT) | NEXT_STAGE:
        nxt = [r for r in college if r["p"] == pos and r["cls"] == SEASON + 1]
        assert sum(r["pd"] is not None for r in nxt) >= 0.8 * len(nxt), f"{pos}: most next-class players lack pd"
    return {"results": results, "nfl": nfl, "college": college, "coverage": coverage(d, t), "t": t, "d": d, "ps": ps}


def fit_predraft(ps, bio, d, t, age0) -> dict:
    """Fit each PREDRAFT position's population B model on every mature exit. The candidate's
    feature list, C rule and validation numbers come from its experiment record."""
    if not PREDRAFT:
        return {}
    import prospect_experiments as pe
    import prospect_experiments_b as peb
    import prospect_population as pp
    e = pp.build(ps, bio, d, t, age0, _CON, say=lambda *a: None)
    e = e[e.draft_year >= FIRST_CLASS]
    e = e.join(context_features(e, ps), on="sid")
    out = {}
    for pos, cid in PREDRAFT.items():
        rec = json.loads((ROOT / "notes" / "prospect-research" / "experiments" / f"{cid}.json").read_text(encoding="utf-8"))
        r = rec["results"][pos]
        tp = e[(e.cpos == pos) & e.hit.notna()]
        X, y = tp[r["cols"]].to_numpy(float), tp.hit.to_numpy(float)
        m = (peb.NestedLR().fit(X, y, tp.draft_year.to_numpy(int)) if cid in ("B5", "B9", "B12") else make_lr(C_FIXED).fit(X, y))
        fw = r["fwd"]
        out[pos] = {"cols": r["cols"], "model": m, "meta": {
            "model": cid, "n": int(len(tp)), "hits": int(y.sum()), "base_rate": round(float(y.mean()), 4),
            "logloss": round(fw["cand"]["logloss"], 4), "base_logloss": round(fw["base"]["logloss"], 4),
            "auc": round(fw["cand"]["auc"], 3), "base_auc": round(fw["base"]["auc"], 3), "baseline": r["baseline"],
            "classes": f"{min(c['class'] for c in fw['per_class'])}-{max(c['class'] for c in fw['per_class'])}"}}
    return out


def fit_stage(ps, bio, d, t, age0) -> dict:
    """Fit B14 per STAGE position on every mature snapshot (prospect_stage.py)."""
    if not (STAGE or NEXT_STAGE):
        return {}
    import prospect_population as pp
    import prospect_stage as pst
    e = pp.build(ps, bio, d, t, age0, _CON, say=lambda *a: None)
    snap = pst.snapshots(e[e.draft_year >= FIRST_CLASS], ps, age0, _CON)
    rec = json.loads((ROOT / "notes" / "prospect-research" / "experiments" / "B14.json").read_text(encoding="utf-8"))
    sbt = ROOT / "notes" / "prospect-research" / "experiments" / "serving-backtest.json"
    sbt = json.loads(sbt.read_text(encoding="utf-8")) if sbt.exists() else {}
    out = {}
    for pos in STAGE | NEXT_STAGE:
        r = rec["results"][pos]
        tp = snap[(snap.cpos == pos) & snap.hit.notna()]
        X, y = tp[r["cols"]].to_numpy(float), tp.hit.to_numpy(float)
        fy = r["young_stage_1_2"]["fwd"]
        kind = NEXT_MODEL.get(pos, "S1")
        cols = list(r["cols"])
        live_n = int(kind[3:]) if kind.startswith(("S4", "S5")) else None
        if live_n:   # addendum 12: plus the next season's first n games
            import prospect_live as pl
            live = pl.live_features(_CON, live_n)
            key = pd.MultiIndex.from_arrays([tp.season.astype(int) + 1, tp.player_id.astype("Int64")])
            tp = tp.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=pl.LIVE, index=tp.index))
            tp["has_live"] = tp.has_live.fillna(0.0)
            cols = cols + pl.LIVE
        if kind.startswith("S5"):   # addendum 14: only rows shaped like the served ones
            tp = tp[(tp.stage >= 2) & tp.plays_next]
        X, y = tp[cols].to_numpy(float), tp.hit.to_numpy(float)
        if kind == "S3" or live_n:
            import prospect_experiments_b as peb
            model = peb.NestedLR().fit(X, y, tp.draft_year.to_numpy(int))
        else:
            model = make_lr(C_FIXED).fit(X, y)
        out[pos] = {"cols": cols, "model": model, "kind": kind, "meta": {
            "model": kind, "rows": int(len(tp)), "players": int(tp.base_sid.nunique()),
            "logloss": round(r["fwd"]["cand"]["logloss"], 4), "base_logloss": round(r["fwd"]["base"]["logloss"], 4),
            "young_logloss": round(fy["cand"]["logloss"], 4), "young_base_logloss": round(fy["base"]["logloss"], 4),
            "later": pos in STAGE, "next": pos in NEXT_STAGE,
            "live_n": live_n}}
        b = sbt.get(f"{kind} {pos}")
        if b and pos in NEXT_STAGE:
            v = b["vs_stars_stage"]
            # strings: the payload rounds floats to 2 places, which would show 0.066 vs 0.080 as 0.07 vs 0.08
            out[pos]["meta"]["served"] = {"logloss": f"{v['cand_logloss']:.3f}", "base_logloss": f"{v['base_logloss']:.3f}",
                                          "auc": f"{v['cand_auc']:.2f}", "base_auc": f"{v['base_auc']:.2f}",
                                          "drafted_auc_gain": f"{v['drafted_cand_auc'] - v['drafted_base_auc']:.2f}",
                                          "auc_gain": f"{v['cand_auc'] - v['base_auc']:.2f}",
                                          "ratio": round(b["all"]["ratio"], 2), "fe_ratio": round(b["first_eligible"]["ratio"], 2),
                                          "n": b["all"]["n"], "events": b["all"]["events"],
                                          "players": b.get("players"), "players_hit": b.get("players_hit"),
                                          "top60_ratio": round(b["top60_by_pd"]["ratio"], 2),
                                          "late_ratio": round(b["replays_2017_2021"]["all"]["ratio"], 2)}
    return out


def context_features(f, ps) -> pd.DataFrame:
    """Team offense, schedule strength, first-down share and explosive rate (charter v2 A11/A12)
    per sid, from the store; frame needs sid, player_id, cutoff, season_final."""
    import prospect_experiments as pe
    return pe.schedule_context(f, ps, _CON).join(pe.usage_quality(f, ps, _CON))


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
        yp = {"WR": "ryptpa_raw_career", "TE": "ryptpa_raw_best", "RB": "ryptpa_raw_final"}[pos]
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


def exit_scenario(s: pd.DataFrame, years: int, age0: float) -> pd.DataFrame:
    """His profile if he leaves after `years` college years (or now, if that is already past):
    draft year, draft age (the same class-year estimator the model trains on) and the early
    flag, counting the seasons he would still play. As-of-now, every underclassman has 3 or
    fewer seasons, so `early` was 1 for all of them by construction."""
    s = s.copy()
    s["draft_year"] = np.maximum(SEASON + 1, s.hs_class + years)
    s["early"] = ((s.n_seasons + (s.draft_year - 1 - SEASON)) <= 3).astype(float)
    s["draft_age"] = np.where(s.dob.notna(), age_years(pd.to_datetime(s.draft_year.astype(int).astype(str) + "-04-25"), s.dob),
                              age0 + s.draft_year - s.hs_class - 0.35)
    return s


def censor_breakout(s: pd.DataFrame, med: float) -> pd.DataFrame:
    """Active player, no breakout yet: model value = training median floored at his current age,
    shown value = blank. A breakout on file is left alone."""
    s = s.copy()
    open_ = s.broke_out.eq(0)
    s.loc[open_, "breakout_age"] = np.maximum(s.loc[open_, "age_final"], med)
    s["ba_show"] = s.breakout_age.where(~open_)
    return s


def score_college(ps, bio, final, age0, top_n=60):
    """Every current college QB/RB/WR/TE, profiled as of now and scored at the more conservative
    of two exits: after his third college year or after his fourth. `cls` stays his first
    eligible draft; `ex` says which exit the score assumes."""
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
    if PREDRAFT or STAGE or NEXT_STAGE:
        subj = subj.join(context_features(subj, ps), on="sid")
        done = predraft_profile(subj, ps, age0)
    subj["speed_score"] = np.nan
    subj["cls"] = subj.draft_year
    rows = []
    for pos in POS:
        fin = final[pos]
        # Plausible prospects only: a qualifying season on file, and for a QB a season as the
        # starter. The models were fit on draftees, nearly all of them starters, so a backup's
        # 30-attempt completion rate is an extrapolation, not a profile.
        s = subj[(subj.pos == pos) & (subj.n_qual >= 1) & ((pos != "QB") | (subj.starts >= 1))].copy()
        # Still playing and no breakout yet is censored, not late: "final age + 1" is right for a
        # finished career only. He can still break out, just not younger than he is now, so any
        # model using it sees the training median floored at his current age; the card shows a
        # blank. (No shipped feature set uses breakout age today; it is display-only.)
        if pos != "QB":
            s = censor_breakout(s, float(np.nanmedian(fin["train"].breakout_age)))
        else:
            s["ba_show"] = np.nan
        sc = {n: exit_scenario(s, n, age0) for n in (3, 4)}
        tp = {n: pd.Series(fin["talent"].predict_proba(v[fin["cols"]].to_numpy(float))[:, 1], index=s.index)
              for n, v in sc.items()}
        pick4 = tp[4] <= tp[3]
        s = pd.concat([sc[3][~pick4], sc[4][pick4]])
        s["_tp"] = np.minimum(tp[3], tp[4]).reindex(s.index)
        s["_pd"], s["_pdx"] = np.nan, np.nan
        pre = fin.get("predraft")
        if pre:
            s = predraft_score(s, done, pre, age0)
        if pos in STAGE:
            s = stage_score(s, done, fin["stage"], age0)
        if pos in NEXT_STAGE:
            m = fin["stage"]
            d_ = done
            if m["kind"].startswith(("S4", "S5")):
                d_ = with_live(done, subj, ps, int(m["kind"][3:]))
            s = stage_score(s, d_, m, age0, which="next")
        s = s.sort_values("_tp", ascending=False)
        nxt = s[s.cls == SEASON + 1]
        if pos in NEXT_STAGE:   # display rule D1: the next class's top by its own forecast, not by Talent
            nxt = nxt.sort_values("_pd", ascending=False, na_position="last")
        s = pd.concat([nxt.head(top_n), s[s.cls > SEASON + 1].head(top_n // 2)])
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
            rows.append({"n": r["name_final"], "p": pos, "cid": int(r.player_id), "sch": cur.pos_team.get(r.player_id, r.pos_team_final),
                         "cls": int(r.cls), "ex": int(r.draft_year - r.hs_class),
                         "ts": round(ts), "tr": tier_of(ts), "tp": round(float(r._tp), 3),
                         "ba": None if pd.isna(r.ba_show) else round(float(r.ba_show), 1),
                         "age": None if pd.isna(r.draft_age) else round(float(r.draft_age), 1),
                         "st": st, "ln": line, "r": scen, "cp": comp_rows(fin, X[i], "talent"),
                         "pd": None if pd.isna(r._pd) else round(float(r._pd), 3),
                         "pdx": None if pd.isna(r._pdx) else int(r._pdx)})
    return rows


def predraft_profile(subj, ps, age0, season=SEASON) -> pd.DataFrame:
    """Each current player's college profile through his last COMPLETED season, the shape the
    population B models were trained on (finished careers). Scoring from the live season instead
    made the number jump when a player crossed six games with no new production (review C).
    `cur_start`: he is the passer of record in the current season (`season`), so far.
    `season` is a parameter only so the serving backtest can replay past seasons."""
    c = subj[["sid", "player_id", "pos", "hs_class", "dob"]].assign(cutoff=season - 1, draft_year=season + 1, dob=pd.NaT)
    f = career_features(c, ps, age0).set_index("sid")
    f = f.join(context_features(c.merge(f[["season_final"]], left_on="sid", right_index=True), ps))
    now = ps[ps.season == season].set_index("player_id").started
    f["cur_start"] = c.set_index("sid").player_id.map(now).fillna(False).astype(float)
    return f.join(subj.set_index("sid")[["weight", "stars", "hs_class"]])


def with_live(done, subj, ps, n, season=SEASON) -> pd.DataFrame:
    """Attach the live line from his team's first n games of `season` (addendum 13: always the first n,
    even later in the season). Dropped from `done` (no number yet): a player whose team has not reached
    n games, and one with no stat line this season (his team is unknown). One whose team reached n
    games but who missed those games gets has_live 0, as the training rows do."""
    import prospect_live as pl
    live = pl.live_features(_CON, n)
    played = pl.team_games_played(_CON, season)
    pid = subj.set_index("sid").player_id.reindex(done.index)
    team = pid.map(ps[ps.season == season].drop_duplicates("player_id").set_index("player_id").team_id)
    ok = team.map(played).fillna(0).ge(n)
    lv = live.reindex(pd.MultiIndex.from_arrays([np.full(len(done), season), pid.astype("Int64")]))
    d = done.join(pd.DataFrame(lv.to_numpy(), columns=pl.LIVE, index=done.index))
    d["has_live"] = d.has_live.fillna(0.0)
    return d[ok.to_numpy()]


def stage_score(s, done, m, age0, season=SEASON, which="later") -> pd.DataFrame:
    """A career-stage model (B14 family) on his profile through his last completed season, his
    college year then, and his estimated age then. No exit is assumed, so `pdx` stays empty.
    `which`: "later" = classes after the next one, "next" = the next draft class (addendum 9)."""
    s = s.copy()
    cls_ok = s.cls.gt(season + 1) if which == "later" else s.cls.eq(season + 1)
    later = cls_ok & s.sid.isin(done.index)
    if not later.any():
        return s
    v = done.loc[s.sid[later]].copy()
    v["stage"] = ((season - 1) - v.hs_class + 1).clip(1, 6)
    v["age_k"] = age0 + (season - 1) - v.hs_class
    p = m["model"].predict_proba(v[m["cols"]].to_numpy(float))[:, 1]
    ok = (v.n_qual >= 1).to_numpy()
    s.loc[later, "_pd"] = np.where(ok, p, np.nan)
    return s


def predraft_score(s, done, pre, age0, season=SEASON, exits=(3, 4)) -> pd.DataFrame:
    """Pre-draft hit chance for the next draft class only (review C: for freshmen and sophomores the
    frozen-production scenario ran 2.5x too low on a 2014-2017 backtest; for the next class it was
    calibrated). The current season counts as one more season played, qualifying, at his completed
    seasons' production; he is scored leaving after it and, for a junior, after one more year; the
    lower ships and `pdx` says which draft that is. A QB model (it uses `starts`) also counts the
    remaining seasons as starts for a player starting now, and gives no number to a QB with no
    completed start, who sits outside its training data (review D, addendum 8)."""
    s = s.copy()
    nxt = s.cls.eq(season + 1) & s.sid.isin(done.index)
    if not nxt.any():
        return s
    base = done.loc[s.sid[nxt]].reset_index()
    best_p, best_x = None, None
    for years in exits:
        v = base.copy()
        v["draft_year"] = np.maximum(season + 1, v.hs_class + years)
        extra = v.draft_year - season
        v["n_seasons"] = v.n_seasons + extra
        v["n_qual"] = v.n_qual + extra
        v["early"] = (v.n_seasons <= 3).astype(float)
        v["draft_age"] = age0 + v.draft_year - v.hs_class - 0.35
        ok = v.n_qual.notna().to_numpy() & (v.n_qual - extra >= 1).to_numpy()   # a completed qualifying season
        if "starts" in pre["cols"]:
            ok &= (v.starts.fillna(0) >= 1).to_numpy()
            v["starts"] = v.starts + extra * v.cur_start
        p = pre["model"].predict_proba(v[pre["cols"]].to_numpy(float))[:, 1]
        p = np.where(ok, p, np.nan)
        if best_p is None:
            best_p, best_x = p, v.draft_year.to_numpy(float)
        else:
            take = p < best_p
            best_p, best_x = np.where(take, p, best_p), np.where(take, v.draft_year, best_x)
    s.loc[nxt, "_pd"] = best_p
    s.loc[nxt, "_pdx"] = np.where(np.isnan(best_p), np.nan, best_x)
    return s


# ----------------------------------------------------------------------------- output

FIELDS = {
    "ts": "Talent score 0-100: percentile of the no-draft-capital model among drafted players at the position since 2008",
    "tr": "Tier index into tiers[] (cut on the talent score)",
    "hp": "Hit probability with actual draft capital (shipped model, see pos[].shipped)",
    "tp": "Talent-only hit probability, as if drafted, with no draft capital",
    "ba": "Breakout age: age at the first college season at the dominator line (drafted and never broke out = final "
          "age + 1; a current player who has not broken out yet is blank). Ages come from class year for everyone",
    "st": "Key college stats, as posted: dom = best dominator, yptpa = rec yds per team pass att (WR career, TE best, "
          "RB final; the model skips seasons on teams under 15 passes a game), share = best rec yds share, "
          "sypg = career scrimmage yds/game, aya/comp = final passing season, rypg = best QB rush yds/game, starts = 150-att seasons",
    "ln": "Final counted college season line",
    "cp": "Comps: [name, draft year, pick, best PPR PPG in window, hit 0/1]",
    "oos": "1 = hp/tp are out of sample (the model never saw his class; holdout classes scored walk-forward)",
    "out": "Observed: [hit 0/1, best PPR PPG, best rank among that season's players at his draft position]",
    "r": "College only: hit probability if drafted in [Round 1, Round 2, Round 3, Day 3], at the scored exit",
    "pd": "College only: pre-draft hit probability counting the chance he goes undrafted, from his completed college "
          "seasons and with no exit assumed. Next class: pos[].stage with stage.next (career-stage model, variant in "
          "stage.model: S1 fixed C, S3 tuned C, S4n = S3 plus his team's first n games this season, n in stage.live_n, S5n = S4n fit on served-shaped rows) or "
          "pos[].predraft (exit model); later classes: pos[].stage with stage.later. Null where no reviewed model serves "
          "that class, he has no completed qualifying season, or (S4) his team has not played n games or he has no stat line this season",
    "pdx": "College only: the draft year pd assumes (the lower of leaving after this season or, for a junior, one more)",
    "cls": "College only: first eligible draft year",
    "cid": "College only: ESPN college athlete id (the key in the SQLite store, projections/prospect_db.py)",
    "ex": "College only: college years at the exit he is scored at, the more conservative of leaving after year 3 or 4",
    "age": "College only: projected age at the scored exit's draft (estimated from class, no public DOB)",
}


def record_build(res) -> str | None:
    """Record this build in the SQLite store: the run (code + source sha256s), every draft row's
    college link and how it was found, the population and outcomes, and the shipped probabilities.
    The JS payload carries the run id, so a shipped number traces to its data and code."""
    if SOURCE != "db" or _CON is None:
        return None
    con, t, d, ps = _CON, res["t"], res["d"], res["ps"]
    rid = pdb.record_run(con, __file__, {"feats": FEATS, "C": C_FIXED, "hold": HOLD, "shipped":
                                         {p: r["shipped"] for p, r in res["results"].items()}}, note="shipped build")
    last = ps.groupby("player_id").season.max()
    eid = pd.to_numeric(d.espn_id, errors="coerce")
    links = []
    for r, e in zip(d.itertuples(), eid):
        if pd.isna(r.player_id):
            method = "none"
        elif pd.notna(e) and int(e) == int(r.player_id) and last.get(int(e), 9999) < r.season:
            method = "espn_id"
        else:
            method = "name_school"
        key = r.gsis_id if isinstance(r.gsis_id, str) else f"pfr:{r.pfr_player_id}"
        links.append((rid, key, None if pd.isna(r.player_id) else int(r.player_id), method, int(r.season)))
    pdb.write_rows(con, "player_link", links)
    rows = t[t.gsis_id.notna()]
    pdb.write_rows(con, "model_row", [
        (rid, r.sid, "A_drafted_linked", r.pos, int(r.draft_year), r.gsis_id, int(r.player_id), r.pfr_player_name,
         int(r.pick), None if pd.isna(r.hit) else float(r.hit), None if pd.isna(r.best_ppg) else float(r.best_ppg),
         None if pd.isna(r.best_rank) else int(r.best_rank), "open" if pd.isna(r.hit) else "final") for r in rows.itertuples()])
    pdb.write_rows(con, "model_row", [
        (rid, f"c{c['cid']}", "college_current", c["p"], int(c["cls"]), None, c["cid"], c["n"], None, None, None, None, "open")
        for c in res["college"]])
    sid_by_gsis = dict(zip(rows.gsis_id, rows.sid))
    gsis_by_slp = {v: k for k, v in sleeper_maps()[0].items()}
    preds = []
    for slp, r in res["nfl"].items():
        sid = sid_by_gsis.get(gsis_by_slp.get(slp))
        if sid:
            preds.append((rid, sid, "shipped_hit", "oos" if r.get("oos") else "final_fit", float(r["hp"])))
            if r.get("tp") is not None:
                preds.append((rid, sid, "talent", "oos" if r.get("oos") else "final_fit", float(r["tp"])))
    preds += [(rid, f"c{c['cid']}", "talent", "exit_scenario", float(c["tp"])) for c in res["college"]]
    pdb.write_rows(con, "prediction", preds)
    print(f"recorded run {rid}: {len(links)} links, {len(rows) + len(res['college'])} rows, {len(preds)} predictions")
    return rid


def write_payload(res, run_id=None):
    pos_meta = {}
    for pos, r in res["results"].items():
        top, win = TARGET[pos]
        pos_meta[pos] = {"target": f"Top-{top} {pos} season by PPR points per game ({MIN_GAMES}+ games) in NFL years 1-{win}",
                         "base_rate": round(r["base_rate"]["rate"], 3), "n": r["n_linked"], "shipped": r["shipped"],
                         "tier_hit": [[x["n"], None if x["hit"] is None else round(x["hit"], 3)] for x in r["tier_hit"]],
                         "holdout": f"{r['hold_classes'][0]}-{r['hold_classes'][1]}",
                         "auc": {k: round(r["hold"][k]["auc"], 3) for k in ("draft", "talent", "full")},
                         "logloss": {k: round(r["hold"][k]["logloss"], 4) for k in ("draft", "talent", "full")},
                         "predraft": r.get("predraft"), "stage": r.get("stage")}
    payload = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "season": SEASON, "db_run": run_id,
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
    rows = (("draft", "draft only, spline (baseline)"), ("talent", "talent (no capital)"), ("full", "talent + capital"),
            ("gbm", "monotone LightGBM (challenger)"), ("linear", "draft only, linear (old baseline)"))

    def table(get, base_row):
        L.append("| Pos | Target | n / hits | Model | AUC | Brier | Log loss | r vs best PPG |")
        L.append("|---|---|---|---|---|---|---|---|")
        for pos, r in res["results"].items():
            top, win = TARGET[pos]
            for k, lab in rows:
                m = get(r)[k]
                L.append(f"| {pos} | top-{top}, yrs 1-{win} | {m['n']} / {m['events']} | {lab} | {m['auc']:.3f} | "
                         f"{m['brier']:.4f} | {m['logloss']:.4f} | {m.get('r_ppg', float('nan')):.2f} |")
            b = base_row(r)
            L.append(f"| {pos} | | | {b[0]} | 0.500 | {b[1]['brier']:.4f} | {b[1]['logloss']:.4f} | |")
        L.append("")

    h0, h1 = min(r["hold_classes"][0] for r in res["results"].values()), max(r["hold_classes"][1] for r in res["results"].values())
    L.append(f"### Headline: untouched holdout, draft classes {h0}-{h1}")
    L.append("")
    L.append(f"Each class is scored by a fit on the classes whose outcome window had closed by its draft (WR/RB: classes "
             f"up to three years older; QB/TE: four). QB and TE stop at {LAST_CLASS['QB']}, the last class with four seasons "
             "played. Nothing in the 2026-09-28 revision was chosen on these classes; the feature sets and C inherited from "
             "the first build were (model card, \"Read these\", item 1).")
    L.append("")
    table(lambda r: r["hold"], lambda r: ("base rate, walk-forward (no model)", r["hold"]["base"]))
    L.append(f"### Development classes {FIRST_CLASS}-{HOLD - 1}: leave-one-draft-class-out")
    L.append("")
    table(lambda r: r, lambda r: (f"base rate (no model)", r["base_rate"]))
    L.append(f"### Embargoed forward check (development classes {FIRST_CLASS + 5}-{HOLD - 1})")
    L.append("")
    L.append("Train only on classes whose whole outcome window had been played by the held-out class's draft.")
    L.append("")
    L.append("| Pos | n | draft only, spline | talent + capital | LightGBM | draft only, linear | draft AUC | full AUC | Shipped hit model |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    label = {"draft": "draft only", "full": "talent + capital", "gbm": "monotone LightGBM",
             "blend": "50/50 blend of draft only and talent + capital (charter v2 A10, independently reviewed)"}
    for pos, r in res["results"].items():
        fw = r["forward"]
        L.append(f"| {pos} | {fw['draft']['n']} | {fw['draft']['logloss']:.4f} | {fw['full']['logloss']:.4f} | "
                 f"{fw['gbm']['logloss']:.4f} | {fw['linear']['logloss']:.4f} | {fw['draft']['auc']:.3f} | "
                 f"{fw['full']['auc']:.3f} | **{label[r['shipped']]}** |")
    L.append("")
    L.append("Log loss columns. Ship rule: a model replaces the spline draft-only baseline only if it has lower log loss "
             "in ALL THREE runs (development leave-one-class-out, embargoed forward, holdout) AND wins in at least "
             f"{BOOT_P:.0%} of draft-class bootstrap resamples of the development leave-one-class-out predictions.")
    L.append("")
    L.append("### Verdict per position")
    L.append("")
    for pos, r in res["results"].items():
        fw, ho = r["forward"], r["hold"]
        hl = ho["draft"]["logloss"] - ho["full"]["logloss"]
        dl = r["draft"]["logloss"] - r["full"]["logloss"]
        fl = fw["draft"]["logloss"] - fw["full"]["logloss"]
        bt = r["boot"]["full"]
        head = (f"- **{pos}**: talent + capital vs the spline baseline, log loss gain {hl:+.4f} on the holdout "
                f"(AUC {ho['draft']['auc']:.3f} to {ho['full']['auc']:.3f}), {dl:+.4f} development leave-one-class-out, "
                f"{fl:+.4f} embargoed forward. Class bootstrap: positive in {bt['p']:.0%} of resamples "
                f"(90% interval {bt['lo']:+.4f} to {bt['hi']:+.4f}). ")
        if r["shipped"] == "draft":
            failed = [n for n, ok in (("holdout", hl > 0), ("development", dl > 0), ("forward", fl > 0),
                                      (f"bootstrap under {BOOT_P:.0%}", bt["p"] >= BOOT_P)) if not ok]
            head += (f"Fails: {', '.join(failed)}. The hit probability ships from the draft-only model; "
                     "the talent score still shows, as a profile, not a forecast.")
        else:
            head += f"Ships **{label[r['shipped']]}**."
        L.append(head)
        L.append(f"  - LightGBM challenger: {ho['gbm']['logloss']:.4f} holdout, {r['gbm']['logloss']:.4f} development, "
                 f"{fw['gbm']['logloss']:.4f} forward ({'promoted' if r['shipped'] == 'gbm' else 'not promoted'}).")
    L.append("")
    L.append("### Low-volume check (asserted on every build)")
    L.append("")
    L.append(f"Talent score of a two-season career on a team throwing {LOW_VOLUME_PG:.0f} passes a game (just over the "
             f"{MIN_PASS_PG:.0f} floor, so the shares count), at the best YPTPA and dominator a drafted player at the "
             "position posted on a normal passing team, every other feature at the median: "
             + ", ".join(f"{pos} {r['ceiling']:.1f}" for pos, r in res["results"].items() if "ceiling" in r)
             + f". The build fails at {TIERS[0][1]} (top decile).")
    L.append("")
    L.append("### Coefficients (final fit on every training class)")
    L.append("")
    for pos, r in res["results"].items():
        L.append(f"- {pos} draft only (spline in log pick, curvature penalized at C={C_FIXED}), hit chance by pick: "
                 + ", ".join(f"{k} {v:.0%}" for k, v in r["curve"].items()))
        for k in ("talent", "full"):
            c = sorted(r["coef"][k].items(), key=lambda kv: -abs(kv[1]))
            extra = " + spline in log pick" if k == "full" else ""
            L.append(f"- {pos} {k} (C={r['C'][k]}, standardized){extra}: " + ", ".join(f"`{a}` {b:+.3f}" for a, b in c))
    L.append("")
    L.append("### Calibration by decile of the shipped hit model (out of sample: development leave-one-class-out plus holdout walk-forward)")
    L.append("")
    L.append("| Pos | " + " | ".join(f"D{i}" for i in range(1, 11)) + " |")
    L.append("|---|" + "---|" * 10)
    for pos, r in res["results"].items():
        L.append(f"| {pos} pred | " + " | ".join(f"{c['pred']:.2f}" for c in r["calibration"]) + " |")
        L.append(f"| {pos} obs | " + " | ".join(f"{c['obs']:.2f}" for c in r["calibration"]) + " |")
    L.append("")
    L.append("Each decile holds about a tenth of the position's sample (n per cell = n / 10).")
    L.append("")
    L.append("### Tier hit rates (tiers cut on the same out-of-sample talent score)")
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
    lm = {}
    got = link_college(dr, pd.Series([np.nan, "12", np.nan, np.nan]), ps2, lm)
    assert got.get(0) == 10 and lm[0] == "name_school", "name + school picks the right Joe Smith"
    assert got.get(1) == 12 and lm[1] == "espn_id", "espn id wins"
    assert 2 not in got.index, "a school mismatch is left unlinked, not guessed (FCS players have FBS namesakes)"
    assert 3 not in got.index
    # first-name prefix with the same surname, season window and school: Ray Rice was Raymell Rice.
    ps2c = pd.DataFrame({"player_id": pd.array([30], dtype="Int64"), "season": [2007], "name": ["Raymell Rice"],
                         "pos_team": ["Rutgers"]})
    lm = {}
    got = link_college(pd.DataFrame({"pfr_player_name": ["Ray Rice"], "season": [2008], "college": ["Rutgers"]}),
                       pd.Series([np.nan]), ps2c, lm)
    assert got.get(0) == 30 and lm[0] == "name_prefix"
    # school aliases, nicknames, an id listed under two names, and a direct id that is someone else.
    ps3 = pd.DataFrame({"player_id": pd.array([20, 30, 31, 40, 41, 50, 50, 60, 60, 61], dtype="Int64"),
                        "season": [2010, 2007, 2007, 2015, 2009, 2009, 2011, 2005, 2006, 2007],
                        "name": ["Cameron Newton", "Kevin Smith", "Kevin Smith", "Justin Johnson", "Taylor Price",
                                 "Robert Griffin III", "Griffin III", "Martellus Bennett", "Other Guy", "Martellus Bennett"],
                        "pos_team": ["Auburn", "UCF", "Florida", "Fresno State", "Ohio", "Baylor", "Baylor"] + ["Texas A&M"] * 3})
    dr3 = pd.DataFrame({"pfr_player_name": ["Cam Newton", "Kevin Smith", "Taylor Price", "Robert Griffin III", "Martellus Bennett"],
                        "season": [2011, 2008, 2010, 2012, 2008],
                        "college": ["Auburn", "Central Florida", "Ohio", "Baylor", "Texas A&M"]})
    got = link_college(dr3, pd.Series([np.nan, np.nan, "40", np.nan, np.nan]), ps3)
    assert got.get(0) == 20, "Cam is Cameron"
    assert got.get(1) == 30, "Central Florida is UCF, not Florida"
    assert got.get(2) == 41, "an espn id whose college seasons run past his draft is someone else"
    assert got.get(3) == 50, "match any name the id was listed under"
    assert got.get(4) == 61, "a stray season under his name on another id does not make him ambiguous"

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
    for tr, te in folds(g, forward=True, start=2012, embargo=2):   # a 2-year window: 2011 is still open at 2012
        assert g[tr].max(initial=0) <= g[te].min() - 2
    # the spline baseline is linear beyond its outer knots
    r = RCS().fit(np.linspace(0, 5.5, 200).reshape(-1, 1))
    tail = r.transform(np.array([[6.0], [7.0], [8.0]]))
    assert np.allclose(np.diff(tail, 2, axis=0), 0.0), "RCS must be linear past the last knot"
    y = np.array([0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1], float)
    X = np.arange(12, dtype=float).reshape(-1, 1)
    gg = np.repeat([2010, 2011, 2012, 2013], 3)
    seen = []
    def spy(a, b, grp):
        seen.append(set(grp))
        return make_lr(1.0).fit(a, b)
    cv_predict(X, y, gg, spy)
    assert all(len(s) == 3 for s in seen) and len(seen) == 4

    # 5. outcomes: only seasons inside the window count, an open window is blank, and every season
    #    is ranked against that season's players at his DRAFT position, whatever he was listed at.
    t = pd.DataFrame({"sid": ["a", "b", "fb", "te"], "gsis_id": ["g1", "g2", "g3", "g4"], "pos": ["WR", "WR", "RB", "TE"],
                      "draft_year": [2018, LAST_NFL, 2018, 2018]})
    s = pd.DataFrame({"player_id": ["g1", "g1", "g2", "g3", "g4"], "season": [2019, 2021, LAST_NFL, 2019, 2019],
                      "ppg": [12.0, 20.0, 18.0, 3.0, 10.0], "spos": ["WR", "WR", "WR", "FB", "RB"]})
    fill = [("WR", 2019, 13.0 + i) for i in range(30)] + [("RB", 2019, 4.0 + i) for i in range(40)] + \
           [("FB", 2019, 1.0 + i / 10) for i in range(5)] + [("TE", 2019, 10.5 + i) for i in range(5)] + \
           [("TE", 2019, 2.0 + i / 10) for i in range(20)]
    s = pd.concat([s, pd.DataFrame([{"player_id": f"x{i}", "season": se, "ppg": v, "spos": p} for i, (p, se, v) in enumerate(fill)])])
    o = attach_outcomes(t, s).set_index("sid")
    assert o.loc["a", "hit"] == 0.0 and o.loc["a", "best_ppg"] == 12.0 and o.loc["a", "best_rank"] == 31, \
        "2021 is year 4, outside a 3-year window; 30 WRs were ahead in 2019"
    assert pd.isna(o.loc["b", "hit"])
    assert o.loc["fb", "hit"] == 0.0 and o.loc["fb", "best_rank"] == 42, \
        "a drafted RB listed at FB ranks among RBs (41 ahead of him), not first among fullbacks"
    assert o.loc["te", "hit"] == 1.0 and o.loc["te", "best_rank"] == 6, "a drafted TE listed at RB ranks among TEs"
    st = pd.DataFrame({"player_id": ["g3", "g3"], "season": [2019, 2020], "position": ["FB", "FB"], "games": [10, 10],
                       "fantasy_points_ppr": [30.0, 30.0]})
    no = nfl_outcomes(st, pd.Series({("g3", 2019): "RB"}))
    assert no.spos.tolist() == ["RB", "FB"], "season roster position first, current position only as the fallback"

    # 6. low-volume shares: a season on a team under MIN_PASS_PG passes a game keeps its raw
    #    numbers for display but carries no YPTPA and cannot be the breakout.
    th = season_metrics(ps.assign(pass_att=[100, 0, 400, 0])).set_index(["player_id", "season"])
    assert th.loc[(1, 2020), "thin"] and not th.loc[(1, 2021), "thin"]      # 100 / 12 games vs 400 / 12
    ct = career_features(subj, th.reset_index(), 18.7).set_index("sid").loc["s1"]
    assert abs(ct.ryptpa_best - 2.5) < 1e-9 and abs(ct.ryptpa_career - 2.5) < 1e-9, "the thin 2020 season drops out"
    assert abs(ct.ryptpa_raw_best - 3.0) < 1e-9 and abs(ct.ryptpa_raw_career - 2.6) < 1e-9
    assert abs(ct.breakout_age - 20.0) < 0.01, "2020 cleared the line on 100 team attempts; 2021 is the breakout"
    # ...and just over the floor (the guard's 16 a game) the season counts, but the model's YPTPA
    # divides by PASS_DEN_PG a game, while the card still shows the posted number. The guard
    # itself runs against the shipped fit in build().
    assert MIN_PASS_PG < LOW_VOLUME_PG < PASS_DEN_PG, "the guard must test volume the floor lets through"
    lv = low_volume_profile("WR", 3.0, 0.6, 18.7)
    assert abs(lv.ryptpa_career - 3.0 * LOW_VOLUME_PG / PASS_DEN_PG) < 1e-9 and abs(lv.ryptpa_raw_career - 3.0) < 1e-9
    lv12 = season_metrics(ps.assign(pass_att=[12 * 12, 0, 12 * 12, 0]))
    assert lv12.thin.all(), "12 a game is under the floor"

    # 7. current players: exit scenarios and censored breakouts.
    cur = pd.DataFrame({"n_seasons": [2, 4], "hs_class": [SEASON - 1, SEASON - 3], "dob": [pd.NaT, pd.NaT]})
    e3, e4 = exit_scenario(cur, 3, 18.7), exit_scenario(cur, 4, 18.7)
    assert e3.early.tolist() == [1.0, 0.0] and e4.early.tolist() == [0.0, 0.0], "a sophomore is early only if he leaves after year 3"
    assert e3.draft_year.tolist() == [SEASON + 2, SEASON + 1] and e4.draft_year.tolist() == [SEASON + 3, SEASON + 1]
    assert abs(e4.draft_age.iloc[0] - e3.draft_age.iloc[0] - 1.0) < 1e-9, "a year later is a year older"
    cb = censor_breakout(pd.DataFrame({"broke_out": [1.0, 0.0, 0.0], "breakout_age": [19.5, 22.0, 21.0],
                                       "age_final": [20.5, 19.7, 21.6]}), 20.4)
    assert cb.breakout_age.tolist() == [19.5, 20.4, 21.6] and cb.ba_show.isna().tolist() == [False, True, True], \
        "no breakout yet: the median, floored at his current age, and shown blank"
    # 8. the A10 blend is the logit midpoint and stays inside its two inputs.
    q = blend_p(np.array([0.2, 0.6]), np.array([0.4, 0.6]))
    assert np.allclose(logit(q[:1]), (logit(np.array([0.2])) + logit(np.array([0.4]))) / 2) and abs(q[1] - 0.6) < 1e-12
    print("self-check OK")


def parity():
    """The SQLite store must hand the builder exactly what the parquet files do: same rows, same
    links, same features, same labels. Run after any change to prospect_db.py or its ingest."""
    global SOURCE
    out = {}
    for src in ("parquet", "db"):
        SOURCE = src
        out[src] = prepare(say=lambda *a: None)
    names = ("college seasons", "bio", "draft table", "training table")
    for name, a, b in zip(names, out["parquet"][:4], out["db"][:4]):
        a, b = a.reset_index(drop=True), b.reset_index(drop=True)
        # The store keeps only the source columns a model may use (no post-draft career columns
        # such as w_av or allpro), so the parquet side can carry extras; the output diff proves
        # nothing downstream read them.
        extra = [c for c in a.columns if c not in b.columns]
        assert set(b.columns) <= set(a.columns) and len(a) == len(b), f"{name}: shape {a.shape} vs {b.shape}"
        a = a[list(b.columns)]
        for c in a.columns:
            x, y = a[c], b[c]
            if pd.api.types.is_numeric_dtype(x) and pd.api.types.is_numeric_dtype(y):
                xv, yv = x.astype(float).to_numpy(), y.astype(float).to_numpy()
                ok = np.allclose(xv, yv, rtol=1e-9, atol=1e-9, equal_nan=True)
            else:
                ok = (x.isna().eq(y.isna()) & (x.astype(str).where(x.notna(), "") == y.astype(str).where(y.notna(), ""))).all()
            assert ok, f"{name}: column {c} differs between parquet and db"
        print(f"parity {name}: {a.shape[0]:,} rows x {a.shape[1]} columns identical"
              + (f" (parquet-only, unused: {', '.join(extra)})" if extra else ""))
    assert out["parquet"][4] == out["db"][4], "age proxy differs"
    print("parity OK")


def main():
    global SOURCE
    # Run as a script this module is __main__; the population B helpers import it by name, and must
    # share this copy (its SOURCE and open store connection) rather than load a second one.
    sys.modules.setdefault("build_prospect_model", sys.modules[__name__])
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--parity", action="store_true", help="prove the SQLite store and the parquet files agree")
    ap.add_argument("--source", choices=["db", "parquet"], default="db")
    args = ap.parse_args()
    SOURCE = args.source
    if args.self_check:
        self_check()
        return
    if args.parity:
        warnings.filterwarnings("ignore", category=FutureWarning)
        parity()
        return
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", message="X does not have valid feature names")
    res = build()
    write_payload(res, record_build(res))
    write_card(res)


if __name__ == "__main__":
    main()
