"""Grade the play-by-play player lines (ncaa_pbp_stats.py) against stats.ncaa.org's own box-score
totals (`ncaa_mfb_player_stats`, which carries stat columns from 2020 on), by division.

    python projections/lanes/data/ncaa_validate.py
"""
import json
import os
import pathlib
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ncaa_pbp_stats import split_name  # noqa: E402

NCAA = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data")) / "ncaa"
CHECKS = [("rushing", "rush_attempts", "rush_att", 50), ("rushing", "rush_net", "rush_yds", 50),
          ("receiving", "rec", "rec", 20), ("receiving", "receiving_yards", "rec_yds", 20),
          ("passing", "pass_attempts", "pass_att", 100), ("passing", "pass_yards", "pass_yds", 100)]


def main():
    out = {}
    for y in range(2020, 2027):
        if not (NCAA / f"pbp_player_season_{y}.parquet").exists():
            continue
        teams = pd.read_parquet(NCAA / f"ncaa_mfb_teams_{y}.parquet")[["team_id", "team_name", "division"]]
        box = pd.read_parquet(NCAA / f"ncaa_mfb_player_stats_{y}.parquet")
        box = box[box.category.isin(["rushing", "receiving", "passing"])]
        # the box file's team_id is another id space: map it to the roster's team by a majority vote
        # of the players' names (team_id -> the team whose roster holds most of its names)
        ros = pd.read_parquet(NCAA / f"ncaa_mfb_rosters_{y}.parquet", columns=["team_id", "player_name"])
        v = box[["team_id", "name"]].drop_duplicates().merge(ros.rename(columns={"team_id": "rt", "player_name": "name"}), on="name")
        tmap = v.groupby(["team_id", "rt"]).size().reset_index(name="n").sort_values("n").drop_duplicates("team_id", keep="last")
        box = box.merge(tmap[["team_id", "rt"]], on="team_id").drop(columns="team_id").rename(columns={"rt": "team_id"})
        box = box.merge(teams, on="team_id")
        num = ["rush_attempts", "rush_yds_gained", "rush_yds_lost", "rec", "receiving_yards", "pass_attempts", "pass_yards"]
        for c in num:   # stat columns arrive as strings
            box[c] = pd.to_numeric(pd.Series(box[c].astype(object).tolist(), index=box.index), errors="coerce").astype(float)
        box["rush_net"] = box.rush_yds_gained.fillna(0) - box.rush_yds_lost.fillna(0)
        box["key"] = box.name.map(split_name)
        box = box.dropna(subset=["key"])
        box["last"], box["fi"] = box.key.str[0], box.key.str[1]
        pbp = pd.read_parquet(NCAA / f"pbp_player_season_{y}.parquet")
        for cat, bc, pc, floor in CHECKS:
            vol = {"rushing": "rush_attempts", "receiving": "rec", "passing": "pass_attempts"}[cat]
            # QB rushing is graded apart: NCAA box scores count sacks as rushes, the pbp lines do not
            box["grp"] = box.position.fillna("").map(lambda q: "QB" if q == "QB" else "skill")
            b = box[box.category == cat].groupby(["team_name", "division", "grp", "last", "fi"])[
                list(dict.fromkeys([bc, vol]))].sum().reset_index()
            b = b[b[vol] >= floor]
            m = b.merge(pbp.rename(columns={"team": "team_name", pc: "p_" + pc})[["team_name", "last", "fi", "p_" + pc]],
                        on=["team_name", "last", "fi"], how="left")
            m["ratio"] = m["p_" + pc] / m[bc]
            if cat != "passing":
                m = m[m.grp.eq("skill") | (cat == "receiving")]
            for div, g in m.groupby("division"):
                k = f"{y} {'FBS' if div == 11 else 'FCS'} {pc}"
                r = g.ratio.dropna()   # accuracy on the lines found; `found` is the name-join rate
                out[k] = {"n": int(len(g)), "found": round(float(g.ratio.notna().mean()), 3),
                          "median_ratio": round(float(r.median()), 3),
                          "within_5pct_of_found": round(float(((r - 1).abs() <= 0.05).mean()), 3),
                          "within_10pct_of_found": round(float(((r - 1).abs() <= 0.10).mean()), 3)}
    df = pd.DataFrame(out).T
    print(df.to_string())
    (NCAA.parent / "ncaa_validate.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
