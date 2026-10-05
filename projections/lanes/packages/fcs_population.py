"""Size the FCS population ESPN box scores would add to population B, by decision class, with NFL
links by id (ESPN crosswalk) instead of names.

FCS teams = 8+ games on that season's FCS scoreboard. A career is one ESPN athlete id; exit = last
season with a line; qualifying = 20+ rushes, receptions or pass attempts over the career (the data
lane used 20+ carries/targets/attempts; ESPN box scores carry receptions, not targets). Class =
exit + 1. Labels come from the data lane's outcome file (classes 2008-2023, NFL players outside B).

    python projections/lanes/packages/fcs_population.py <xwalk.parquet> <nfl_outside_b.csv>
"""
import json
import os
import pathlib
import sys

import pandas as pd

SCR = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp"))


def main():
    xw, outside = sys.argv[1], sys.argv[2]
    lines = []
    for f in sorted((SCR / "espn_fcs").glob("lines_*.parquet")):
        y = int(f.stem.split("_")[1])
        ev = json.loads((SCR / "espn_fcs" / f"events_{y}.json").read_text())
        games = pd.Series([t[0] for g in ev for t in g["teams"]]).value_counts()
        x = pd.read_parquet(f)
        lines.append(x[x.team_id.isin(games[games >= 8].index)])
    x = pd.concat(lines)
    x["athlete_id"] = pd.to_numeric(x.athlete_id)
    vol = x[["rush_att", "rec", "pass_att"]].fillna(0).sum(axis=1)
    car = x.assign(vol=vol).groupby("athlete_id").agg(exit=("season", "max"), first=("season", "min"),
                                                     vol=("vol", "sum"), name=("name", "last"))
    car = car[car.vol >= 20]
    # an FCS career that continues at an FBS school is already a population B row: drop it
    import sqlite3
    con = sqlite3.connect(SCR / "prospect.sqlite")
    fbs = pd.concat([pd.read_sql(f"SELECT player_id, season FROM {t}", con) for t in ("cfb_receiving", "cfb_rushing", "cfb_passing")])
    fbs_last = fbs.groupby("player_id").season.max()
    later_fbs = car.index.map(fbs_last) > car.exit
    print("careers continuing at FBS after their last FCS season (dropped):", int(later_fbs.sum()))
    car = car[~later_fbs]
    car["cls"] = car.exit + 1
    w = pd.read_parquet(xw).dropna(subset=["college_athlete_id"])
    c2g = w.drop_duplicates("college_athlete_id").set_index("college_athlete_id").gsis_id
    car["gsis_id"] = car.index.map(c2g)
    o = pd.read_csv(outside).drop_duplicates("gsis_id").set_index("gsis_id")
    car["drafted"] = car.gsis_id.map(o.drafted)
    car["hit"] = car.gsis_id.map(o.hit)
    car = car[car.cls <= 2026]
    by = car.groupby("cls").agg(exits=("name", "size"), nfl_linked=("gsis_id", lambda s: s.notna().sum()),
                                drafted=("drafted", lambda s: (s == 1).sum()), hits=("hit", lambda s: (s == 1).sum()))
    print(by.to_string())
    m = by.loc[2008:2023]
    res = {"classes_2008_2023": {k: int(v) for k, v in m.sum().items()},
           "by_class": {int(k): {c: int(v) for c, v in r.items()} for k, r in by.iterrows()}}
    print(json.dumps(res["classes_2008_2023"]))
    (SCR / "fcs_population.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
