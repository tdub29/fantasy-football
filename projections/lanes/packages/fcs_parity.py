"""ESPN FCS season lines (espn_fcs_box.py) against the data-gaps lane's stats.ncaa.org lines for the
same season, plus the id test that matters for labels: do the FCS NFL players get an ESPN line under
the college id ESPN's own NFL-to-college crosswalk gives them?

Reads (read-only) the data lane's `pbp_player_season_<y>.parquet` and reuses its team/name keys
(`projections/lanes/data/fcs_measure.py`: skey, sim; `ncaa_pbp_stats.split_name`).

    python projections/lanes/packages/fcs_parity.py <season> <ncaa lines dir> <xwalk.parquet> <nfl_outside_b.csv>
"""
import json
import os
import pathlib
import sys

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "data"))
from fcs_measure import sim, skey  # noqa: E402
from ncaa_pbp_stats import split_name  # noqa: E402

SCR = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp"))


def strip_mascot(name: str) -> str:
    """ESPN 'Eastern Washington Eagles' -> 'Eastern Washington' (drop the last word)."""
    parts = str(name).split()
    return " ".join(parts[:-1]) if len(parts) > 1 else str(name)


def parity(e, ncaa_dir, y):
    """Name + school join to stats.ncaa.org lines, FCS teams only."""
    n = pd.read_parquet(ncaa_dir / f"pbp_player_season_{y}.parquet")
    res = {"ncaa_lines": int(len(n))}

    # name + school join, the data lane's own rule (sim >= 0.85 on the team name)
    teams_e, teams_n = e.school.unique(), n.team.unique()
    tmap = {}
    for t in teams_e:
        best = max(teams_n, key=lambda u: sim(t, u))
        if sim(t, best) >= 0.85:
            tmap[t] = best
    e["ncaa_team"] = e.school.map(tmap)
    res["espn_schools"] = int(len(teams_e))
    res["espn_schools_matched_to_ncaa_team"] = int(len(tmap))
    # FBS opponents appear with one-game lines: keep FCS teams only (NCAA team table, division 12)
    nt = pd.read_parquet(ncaa_dir / f"ncaa_mfb_teams_{y}.parquet")
    fcs = set(nt[nt.division == 12].team_name)
    e = e[e.ncaa_team.isin(fcs)].copy()
    res["espn_fcs_lines"] = int(len(e))
    n = n[n.team.isin(fcs)]
    m = e.merge(n, left_on=["ncaa_team", "last", "fi"], right_on=["team", "last", "fi"], suffixes=("_espn", "_ncaa"))
    out = {}
    for stat, lo in (("rec_yds", 300), ("rush_yds", 300), ("pass_yds", 1000)):
        a = m[(m[f"{stat}_ncaa"] >= lo)]
        r = (a[f"{stat}_espn"] / a[f"{stat}_ncaa"]).dropna()
        base = n[n[stat] >= lo]
        out[stat] = {"ncaa_players_over_threshold": int(len(base)), "joined": int(len(a)),
                     "median_ratio_espn_over_ncaa": round(float(r.median()), 3),
                     "within_5pct": round(float((r.sub(1).abs() <= 0.05).mean()), 3),
                     "within_10pct": round(float((r.sub(1).abs() <= 0.10).mean()), 3)}
    res["parity"] = out
    return res

def main():
    y, ncaa_dir, xw, outside = int(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    e = pd.read_parquet(SCR / "espn_fcs" / f"lines_{y}.parquet")
    e["school"] = e.team.map(strip_mascot)
    k = e.name.map(split_name)
    e = e[k.notna()].copy()
    e["last"], e["fi"] = k[k.notna()].str[0], k[k.notna()].str[1]
    res = {"season": y, "espn_lines": int(len(e))}
    e_all = e
    if (ncaa_dir / f"pbp_player_season_{y}.parquet").exists():   # stats.ncaa.org starts in 2013
        res.update(parity(e, ncaa_dir, y))

    # id test: FCS NFL players whose final college season is y
    x = pd.read_parquet(xw).dropna(subset=["college_athlete_id"])
    o = pd.read_csv(outside)
    f = o[(o.div_last == "FCS") & (o.draft_year == y + 1)].merge(x[["gsis_id", "college_athlete_id"]], on="gsis_id", how="left")
    ids = set(pd.to_numeric(e_all.athlete_id))   # the id test needs no team-name join
    f["espn_line"] = f.college_athlete_id.isin(ids)
    line = e_all.assign(aid=pd.to_numeric(e_all.athlete_id)).drop_duplicates("aid").set_index("aid")
    f = f.join(line[["school", "games", "rec", "rec_yds", "rush_att", "rush_yds", "pass_yds"]], on="college_athlete_id")
    res["fcs_nfl_class"] = int(len(f))
    res["fcs_nfl_with_espn_college_id"] = int(f.college_athlete_id.notna().sum())
    res["fcs_nfl_with_espn_line_by_id"] = int(f.espn_line.sum())
    res["fcs_nfl_hits_with_line"] = int(f[f.espn_line].hit.sum())
    print(f[["name", "pos", "drafted", "hit", "college", "college_athlete_id", "espn_line", "school", "games", "rec", "rec_yds", "rush_yds", "pass_yds"]].to_string())
    print(json.dumps(res, indent=1))
    (SCR / f"fcs_parity_{y}.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
