"""Grade the stats.ncaa.org play-by-play lines against the store's ESPN FBS season lines for the
seasons where stats.ncaa.org carries no box-score stats (2013-2019): same player, same team.

    PROSPECT_DB=<scratch>/prospect.sqlite python projections/lanes/data/ncaa_vs_espn.py
"""
import json
import os
import pathlib
import sqlite3
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fcs_measure import skey  # noqa: E402
from ncaa_pbp_stats import split_name  # noqa: E402

DB = os.environ["PROSPECT_DB"]
assert "lane-data" in DB
NCAA = pathlib.Path(DB).parent / "ncaa"


def main():
    con = sqlite3.connect(DB)
    out = {}
    for y in range(2013, 2026):
        p = pd.read_parquet(NCAA / f"pbp_player_season_{y}.parquet")
        p["tk"] = p.team.map(skey)
        for tbl, nm, ec, pc, vol, floor in [("cfb_receiving", "receiver_player_name", "yards", "rec_yds", "comp", 20),
                                            ("cfb_rushing", "rusher_player_name", "yards", "rush_yds", "plays", 50)]:
            e = pd.read_sql_query(f'SELECT pos_team, {nm} AS name, {ec} AS v, {vol} AS vol FROM {tbl} WHERE season = ?', con, params=(y,))
            e = e[e.vol >= floor].copy()
            e["key"] = e.name.map(split_name)
            e = e.dropna(subset=["key"])
            e["last"], e["fi"], e["tk"] = e.key.str[0], e.key.str[1], e.pos_team.map(skey)
            m = e.merge(p[["tk", "last", "fi", pc]], on=["tk", "last", "fi"], how="left")
            r = (m[pc] / m.v).dropna()
            out[f"{y} {pc}"] = {"n": len(m), "found": round(float(m[pc].notna().mean()), 3),
                                "median_ratio": round(float(r.median()), 3),
                                "within_5pct_of_found": round(float(((r - 1).abs() <= 0.05).mean()), 3),
                                "within_10pct_of_found": round(float(((r - 1).abs() <= 0.10).mean()), 3)}
    print(pd.DataFrame(out).T.to_string())
    (NCAA.parent / "ncaa_vs_espn.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
