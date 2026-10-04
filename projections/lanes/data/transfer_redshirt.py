"""Player-level transfer and redshirt history that the store ALREADY holds, measured on population B.

Transfer: the same ESPN athlete id on a different team_id in a later season (ESPN keeps one college id
through a transfer). Known at season granularity: the new team's roster is published at the start of
that season, before the next draft. No portal-entry date exists in any key-free source.
Redshirt proxy: a season on a roster with no stat line in any of the three PBP files (a sat-out year,
injury year, or a year with no touches; the data cannot tell which).

    PROSPECT_DB=<scratch>/prospect.sqlite python projections/lanes/data/transfer_redshirt.py
"""
import json
import os
import pathlib
import sqlite3

import pandas as pd

DB = os.environ["PROSPECT_DB"]
assert "lane-data" in DB
SCR = pathlib.Path(DB).parent
ALLSTAR = {3144, 3145, 3146, 3147, 3193, 3194, 125290, 125291}


def main():
    con = sqlite3.connect(DB)
    ros = pd.read_sql_query("SELECT DISTINCT season, CAST(athlete_id AS INTEGER) AS player_id, CAST(team_id AS INTEGER) AS team_id "
                            "FROM cfb_roster", con)
    stat = pd.concat([pd.read_sql_query(f"SELECT DISTINCT season, CAST(player_id AS INTEGER) AS player_id FROM {t}", con)
                      for t in ("cfb_receiving", "cfb_rushing", "cfb_passing")]).drop_duplicates()
    # ESPN rosters also hold the January all-star games (Senior Bowl North/South 3144-3145, Shrine
    # East/West 3146-3147, NFLPA American/National 3193-3194, HBCU Gaither/Robinson 125290-125291):
    # not transfers, but a dated pre-draft signal of their own, counted separately.
    allstar = ros.team_id.isin(ALLSTAR)
    star = ros[allstar]
    ros = ros[~allstar]
    b = pd.read_parquet(SCR / "pop_b.parquet")
    b = b[b.cls.between(2008, 2026)]
    r = ros[ros.player_id.isin(b.player_id)]
    teams = r.sort_values("season").groupby("player_id").team_id.agg(lambda s: s.drop_duplicates().size)
    first_ros = r.groupby("player_id").season.min()
    seasons_ros = r.groupby("player_id").season.nunique()
    st = stat[stat.player_id.isin(b.player_id)]
    first_stat = st.groupby("player_id").season.min()
    seasons_stat = st.groupby("player_id").season.nunique()
    b = b.set_index("player_id")
    b["n_teams"] = teams.reindex(b.index)
    b["transfer"] = b.n_teams.gt(1)
    b["ros_seasons"] = seasons_ros.reindex(b.index)
    b["silent_seasons"] = (seasons_ros.reindex(b.index) - seasons_stat.reindex(b.index)).clip(lower=0)
    b["rs_before_first_stat"] = (first_stat.reindex(b.index) - first_ros.reindex(b.index)).clip(lower=0)
    b["grp"] = ["drafted" if d == 1 else "udfa" if u else "never" for d, u in zip(b.drafted, b.udfa)]
    # all-star game in the January right after his exit season (season label = that college season)
    sk = set(zip(star.player_id, star.season))
    b["allstar"] = [(i, e) in sk for i, e in zip(b.index, b.exit)]
    a = b.groupby("cls").allstar.sum()
    print("all-star game rows (exit-season January) by class:", a[a > 0].astype(int).to_dict())
    print(b.groupby("grp").allstar.mean().round(3).to_dict())
    by = b.groupby("cls").agg(exits=("grp", "size"), roster_found=("ros_seasons", lambda s: s.notna().mean()),
                              transfer=("transfer", "mean"), silent_any=("silent_seasons", lambda s: (s > 0).mean()))
    print(by.round(3).to_string())
    print(b.groupby("grp").agg(transfer=("transfer", "mean"), silent_any=("silent_seasons", lambda s: (s > 0).mean()),
                               roster_found=("ros_seasons", lambda s: s.notna().mean())).round(3).to_string())
    out = {"allstar_by_class": a.astype(int).to_dict(), "allstar_by_group": b.groupby("grp").allstar.mean().round(3).to_dict(),
           "by_class": by.round(3).reset_index().to_dict("records"),
           "by_group": b.groupby("grp").agg(transfer=("transfer", "mean")).round(3).reset_index().to_dict("records")}
    (SCR / "transfer_redshirt.json").write_text(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    main()
