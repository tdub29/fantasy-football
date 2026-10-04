"""Young lane (later classes): load the frames every replay needs once and cache them in the lane's
scratch dir. Reads only the lane's copy of the store ($PROSPECT_DB) and never ingests or fetches, so
every run sees the same frozen data.

    PROSPECT_DB=<lane copy> python projections/lanes/young/young_data.py     # build the cache
"""
from __future__ import annotations

import os
import pathlib
import pickle
import sys
import warnings

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
import build_prospect_model as bpm  # noqa: E402
import prospect_db as pdb  # noqa: E402

TMP = pathlib.Path(os.environ.get("YOUNG_TMP", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-young"))
CACHE = TMP / "young-frames.pkl"


def connect():
    """The lane copy, no ingest (ingest may fetch live files into the shared cache)."""
    assert os.environ.get("PROSPECT_DB"), "set PROSPECT_DB to the lane copy"
    assert pathlib.Path(os.environ["PROSPECT_DB"]).resolve() != (bpm.ROOT / "projections" / "prospect-db" / "prospect.sqlite").resolve()
    bpm.SOURCE = "db"
    if bpm._CON is None:
        bpm._CON = pdb.connect()
    return bpm._CON


def broad_exits(ps, bio, d, age0, con) -> pd.DataFrame:
    """prospect_population.build without its `n_qual >= 1` filter: every exit, so a freshman who
    never qualified (or never played again) keeps his real outcome. Labels as pp.build."""
    import prospect_population as pp
    drafted = d.dropna(subset=["player_id"]).drop_duplicates("player_id").set_index("player_id")
    e = pp.exits(ps, bio, con, drafted.season)
    e["gsis_id"] = e.player_id.map(drafted.gsis_id)
    e["pick"] = e.player_id.map(drafted.pick)
    e["draft_pos"] = e.player_id.map(drafted.position)
    e["drafted_year"] = e.player_id.map(drafted.season)
    ud = pp.link_undrafted(e[e.gsis_id.isna()], ps, con)
    e["gsis_id"] = e.gsis_id.fillna(e.player_id.map(ud))
    ro = pd.read_sql_query("SELECT gsis_id, season, position FROM nfl_roster ORDER BY season, source_key, src_row", con)
    first = ro.dropna().drop_duplicates("gsis_id").set_index("gsis_id").position
    e["pos"] = e.draft_pos.fillna(e.gsis_id.map(first).where(lambda s: s.isin(bpm.POS))).fillna(e.ros_pos)
    e["cpos"] = e.ros_pos.where(e.ros_pos.isin(bpm.POS), e.inf_pos)
    e["weight"] = e.player_id.map(bio.ros_weight)
    e["stars"] = e.player_id.map(bio.stars)
    e["cls"] = (e.exit + 1).astype(int)
    e["sid"] = "w" + e.player_id.astype(str)
    stats = pd.read_sql_query("SELECT player_id, season, position, games, fantasy_points_ppr FROM nfl_player_season", con)
    e["draft_year"] = e.drafted_year.fillna(e.cls).astype(int)
    e = bpm.attach_outcomes(e, bpm.nfl_outcomes(stats, bpm.season_positions()))
    e["outcome_year"], e["draft_year"] = e.draft_year, e.cls
    e["win"] = e.pos.map(lambda q: bpm.TARGET[q][1])
    e["drafted"] = e.pick.notna().astype(float)
    return e


def build(say=print):
    warnings.filterwarnings("ignore")
    import prospect_live as pl
    import prospect_population as pp
    import prospect_stage as pst
    con = connect()
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    e = pp.build(ps, bio, d, t, age0, con, say=say)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    snap = pst.snapshots(e, ps, age0, con)
    wide = broad_exits(ps, bio, d, age0, con)
    wide = wide[wide.draft_year >= bpm.FIRST_CLASS]
    live4 = pl.live_features(con, 4)
    rosters = bpm.load_rosters()[["season", "athlete_id", "position_abbreviation"]]
    team_games = {s: pl.team_games_played(con, s) for s in range(2008, bpm.SEASON + 1)}
    out = {"ps": ps, "bio": bio, "e": e, "snap": snap, "wide": wide, "live4": live4, "age0": age0,
           "rosters": rosters, "team_games": team_games}
    TMP.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(pickle.dumps(out))
    say(f"cached {CACHE} ({CACHE.stat().st_size / 1e6:.0f} MB): e {len(e):,}, snap {len(snap):,}, wide {len(wide):,}, "
        f"live4 {len(live4):,}")
    return out


def load(say=print):
    connect()   # predraft_profile / context_features read the store
    if CACHE.exists():
        return pickle.loads(CACHE.read_bytes())
    return build(say)


if __name__ == "__main__":
    build()
