"""As-of-game features for a college season in progress (charter v2 addendum 12, candidate S4).

A player's live line is what his team's first N games of a season show: games he appeared in,
receiving yards per team pass attempt (team attempts from the team box, never fewer than
PASS_DEN_PG a game, as the season features do), his share of the team's receiving yards, and
scrimmage yards per team game. Games are ordered by season type then week from the opponent-split
file, so the same cut can be rebuilt for any past season.

    python projections/prospect_live.py --self-check
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402

LIVE = ["live_games", "live_yptpa", "live_rec_share", "live_scrim_pg", "has_live"]


def first_games(con, n: int) -> pd.DataFrame:
    """(season, team_id, game_id) for each team's first n games of each season."""
    g = pd.read_sql_query("SELECT season, season_type, week, game_id, team_id FROM cfb_team_game", con)
    for c in ("team_id", "game_id"):
        g[c] = pd.to_numeric(g[c], errors="coerce")
    g = g.sort_values(["season", "team_id", "season_type", "week", "game_id"])
    g["k"] = g.groupby(["season", "team_id"]).cumcount() + 1
    return g[g.k <= n][["season", "team_id", "game_id"]]


def team_games_played(con, season: int) -> pd.Series:
    g = pd.read_sql_query("SELECT team_id, COUNT(*) n FROM cfb_team_game WHERE season = ? GROUP BY team_id", con, params=(season,))
    return g.set_index(pd.to_numeric(g.team_id, errors="coerce")).n


def live_features(con, n: int) -> pd.DataFrame:
    """Index (season, player_id): live features from his team's first n games. A team that has
    played fewer than n games is left out (its live line is not yet comparable)."""
    fg = first_games(con, n)
    full = fg.groupby(["season", "team_id"]).size()
    fg = fg[fg.set_index(["season", "team_id"]).index.map(full).to_numpy() == n]
    pb = pd.read_sql_query('SELECT season, game_id, team_id, athlete_id, category, "receivingYards", "receivingTouchdowns", '
                           '"rushingYards" FROM cfb_player_box WHERE category IN (\'passing\', \'rushing\', \'receiving\')', con)
    tb = pd.read_sql_query('SELECT season, game_id, team_id, "completionAttempts" FROM cfb_team_box', con)
    for x in (pb, tb):
        for c in ("team_id", "game_id"):
            x[c] = pd.to_numeric(x[c], errors="coerce")
    pb["athlete_id"] = pd.to_numeric(pb.athlete_id, errors="coerce")
    pb = pb.merge(fg, on=["season", "team_id", "game_id"])
    tb = tb.merge(fg, on=["season", "team_id", "game_id"])
    tb["att"] = pd.to_numeric(tb.completionAttempts.astype(str).str.split("/").str[-1], errors="coerce")
    team_att = tb.groupby(["season", "team_id"]).att.sum()
    for c in ("receivingYards", "rushingYards"):
        pb[c] = pd.to_numeric(pb[c], errors="coerce").fillna(0.0)
    rec = pb[pb.category == "receiving"]
    team_rec = rec.groupby(["season", "team_id"]).receivingYards.sum()
    pb["rec_y"] = pb.receivingYards.where(pb.category == "receiving", 0.0)
    pb["rush_y"] = pb.rushingYards.where(pb.category == "rushing", 0.0)
    per = pb.groupby(["season", "athlete_id", "team_id"]).agg(games=("game_id", "nunique"), rec=("rec_y", "sum"),
                                                              rush=("rush_y", "sum")).reset_index()
    per = per.sort_values("games").drop_duplicates(["season", "athlete_id"], keep="last")   # his main team
    key = list(zip(per.season, per.team_id))
    att = np.array([team_att.get(k, np.nan) for k in key], float)
    trec = np.array([team_rec.get(k, np.nan) for k in key], float)
    out = pd.DataFrame({"season": per.season.astype(int), "player_id": per.athlete_id.astype("Int64"),
                        "live_games": per.games.astype(float),
                        "live_yptpa": per.rec / np.maximum(att, bpm.PASS_DEN_PG * n),
                        "live_rec_share": np.where(trec > 0, per.rec / np.where(trec > 0, trec, 1), np.nan),
                        "live_scrim_pg": (per.rec + per.rush) / n, "has_live": 1.0})
    return out.dropna(subset=["player_id"]).drop_duplicates(["season", "player_id"]).set_index(["season", "player_id"])


def self_check():
    import sqlite3
    con = sqlite3.connect(":memory:")
    pd.DataFrame({"season": [2020] * 3, "season_type": [2] * 3, "week": [3, 1, 2], "game_id": [13, 11, 12],
                  "team_id": [7] * 3}).to_sql("cfb_team_game", con)
    pd.DataFrame({"season": [2020] * 4, "game_id": [11, 12, 13, 11], "team_id": [7] * 4, "athlete_id": [1, 1, 1, 2],
                  "category": ["receiving"] * 3 + ["rushing"], "receivingYards": [100, 50, 999, None],
                  "receivingTouchdowns": [1, 0, 0, None], "rushingYards": [None, None, None, 80]}).to_sql("cfb_player_box", con)
    pd.DataFrame({"season": [2020] * 3, "game_id": [11, 12, 13], "team_id": [7] * 3,
                  "completionAttempts": ["20/40", "10/20", "1/1"]}).to_sql("cfb_team_box", con)
    f = live_features(con, 2)
    a = f.loc[(2020, 1)]
    assert a.live_games == 2 and abs(a.live_yptpa - 150 / 60) < 1e-9, "game 3 (week 3) is outside the first two"
    assert abs(a.live_rec_share - 1.0) < 1e-9 and abs(a.live_scrim_pg - 75) < 1e-9
    assert abs(f.loc[(2020, 2)].live_scrim_pg - 40) < 1e-9
    assert live_features(con, 4).empty, "a team short of n games has no live line"
    print("live self-check OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    if ap.parse_args().self_check:
        self_check()
