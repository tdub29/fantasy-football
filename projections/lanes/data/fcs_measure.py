"""What the stats.ncaa.org release would add to population B.

1. The NFL QB/RB/WR/TE outside B whose last college was FCS (from nfl_outside_b.csv): how many
   land on an NCAA roster row and a play-by-play line in their final college season.
2. Every FCS QB/RB/WR/TE exit by class (last roster season on an FCS team, a qualifying line).

    python projections/lanes/data/fcs_measure.py
"""
import difflib
import json
import os
import pathlib
import re
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ncaa_pbp_stats import split_name  # noqa: E402

SCR = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data"))
NCAA = SCR / "ncaa"
YEARS = [y for y in range(2013, 2027) if (NCAA / f"pbp_player_season_{y}.parquet").exists()]
POS = {"QB", "RB", "WR", "TE"}


# stats.ncaa.org short names -> the long names nflverse and ESPN use
ABBR = {"uni": "northern iowa", "etsu": "east tennessee state", "sfa": "stephen f austin", "uiw": "incarnate word",
        "utrgv": "texas rio grande valley", "liu": "long island", "ualbany": "albany", "mcneese": "mcneese state",
        "nicholls": "nicholls state", "alcorn": "alcorn state", "grambling": "grambling state", "southern u": "southern",
        "sam houston": "sam houston state", "prairie view": "prairie view a and m", "umass": "massachusetts",
        "the citadel": "citadel", "ut martin": "tennessee martin", "lamar university": "lamar"}
WORD = {"ariz": "arizona", "wash": "washington", "colo": "colorado", "ill": "illinois", "ky": "kentucky",
        "caro": "carolina", "ark": "arkansas", "conn": "connecticut", "mo": "missouri", "la": "louisiana",
        "ala": "alabama", "ga": "georgia", "val": "valley", "so": "southern", "mich": "michigan", "fla": "florida",
        "tenn": "tennessee", "miss": "mississippi", "n c": "north carolina", "nc": "north carolina"}


def skey(s) -> str:
    s = str(s or "").lower().replace("&", " and ").replace("n.c.", "north carolina")
    s = re.sub(r"\bst\.?(?=\s|$)", "state", s)
    s = " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())
    s = ABBR.get(s, s)
    return " ".join(WORD.get(w, w) for w in s.split())


def sim(a, b) -> float:
    a, b = skey(a), skey(b)
    if a == b or (a and b and (a.startswith(b) or b.startswith(a))):
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def load():
    teams = pd.concat([pd.read_parquet(NCAA / f"ncaa_mfb_teams_{y}.parquet") for y in YEARS])
    ros = pd.concat([pd.read_parquet(NCAA / f"ncaa_mfb_rosters_{y}.parquet") for y in YEARS])
    ros = ros.merge(teams[["team_id", "season", "team_name", "division"]].rename(columns={"team_name": "team"}),
                    on=["team_id", "season"], how="left")
    ros["key"] = ros.player_name.map(split_name)
    ros = ros.dropna(subset=["key"])
    ros["last"], ros["fi"] = ros.key.str[0], ros.key.str[1]
    lines = pd.concat([pd.read_parquet(NCAA / f"pbp_player_season_{y}.parquet") for y in YEARS])
    lines = lines.merge(teams[["season", "team_name", "division"]].rename(columns={"team_name": "team"}),
                        on=["season", "team"], how="left")
    return teams, ros, lines


def main():
    teams, ros, lines = load()
    first, last = min(YEARS), max(YEARS)
    u = pd.read_csv(SCR / "nfl_outside_b.csv")
    f = u[(u.div_last == "FCS") & u.hit.notna() & ~u.in_b].copy()
    f["final"] = f.draft_year - 1
    f["covered"] = f.final.between(first, last)
    res = []
    for r in f[f.covered].itertuples():
        k = split_name(r.name)
        sch = str(r.college).split(";")[-1]
        cand = ros[(ros.season.between(r.final - 1, r.final)) & (ros["last"] == k[0]) & (ros.fi == k[1])]
        cand = cand[cand.team.map(lambda t: sim(sch, t) >= 0.85).astype(bool)]
        ln = lines[(lines.season <= r.final) & (lines["last"] == k[0]) & (lines.fi == k[1])]
        ln = ln[ln.team.map(lambda t: sim(sch, t) >= 0.85).astype(bool)]
        res.append({"name": r.name, "pos": r.pos, "draft_year": r.draft_year, "drafted": r.drafted, "hit": r.hit,
                    "college": sch, "roster": len(cand) > 0, "ncaa_pos": ";".join(sorted(set(cand.position.dropna()))),
                    "line_seasons": int(ln.season.nunique()), "final_line": bool((ln.season == r.final).any()),
                    "yds_final": float(ln.loc[ln.season == r.final, ["rush_yds", "rec_yds", "pass_yds"]].sum().sum())})
    m = pd.DataFrame(res)
    m.to_csv(SCR / "fcs_nfl_join.csv", index=False)
    summ = {
        "fcs_nfl_outside_b_2008_2023": int(len(f)), "drafted": int(f.drafted.sum()), "undrafted": int((f.drafted == 0).sum()),
        "hits": int(f.hit.sum()), "hits_drafted": int(f[f.drafted == 1].hit.sum()),
        "covered_final_season_2013_plus": int(f.covered.sum()), "covered_hits": int(f[f.covered].hit.sum()),
        "joined_roster": int(m.roster.sum()), "joined_final_line": int(m.final_line.sum()),
        "joined_final_line_drafted": int(m[m.final_line].drafted.sum()),
        "joined_final_line_hits": int(m[m.final_line].hit.sum()),
        "by_class": f.groupby("draft_year").agg(n=("name", "size"), drafted=("drafted", "sum"), hits=("hit", "sum")
                                                ).reset_index().to_dict("records"),
    }
    print(json.dumps({k: v for k, v in summ.items() if k != "by_class"}, indent=1))
    print(m[m.hit == 1].to_string())
    print("not joined:", m[~m.final_line][["name", "pos", "draft_year", "college", "roster", "line_seasons"]].to_string())

    # 2. every FCS skill exit: last season on an FCS roster (division 12), position QB/RB/WR/TE,
    # careers chained by (team, last, first initial); transfers start a new chain (undercount ok here).
    fr = ros[(ros.division == 12) & ros.position.isin(POS)]
    car = fr.groupby(["team", "last", "fi"]).agg(exit=("season", "max"), seasons=("season", "nunique"),
                                                   pos=("position", "last"), gp=("games_played", "sum")).reset_index()
    fl = lines[lines.division == 12]
    prod = fl.groupby(["team", "last", "fi"])[["rush_att", "targets", "pass_att"]].sum().reset_index()
    car = car.merge(prod, on=["team", "last", "fi"], how="left").fillna({"rush_att": 0, "targets": 0, "pass_att": 0})
    car["qual"] = (car.rush_att + car.targets + car.pass_att) >= 20
    ex = car[(car.exit < last) & car.qual]
    by = ex.groupby("exit").agg(exits=("last", "size"), QB=("pos", lambda s: (s == "QB").sum()),
                                RB=("pos", lambda s: (s == "RB").sum()), WR=("pos", lambda s: (s == "WR").sum()),
                                TE=("pos", lambda s: (s == "TE").sum()))
    by.index = by.index + 1
    by.index.name = "class"
    print("FCS QB/RB/WR/TE exits with 20+ touches/targets/attempts on file, by decision class:")
    print(by.to_string())
    summ["fcs_exits_by_class"] = by.reset_index().to_dict("records")
    (SCR / "fcs_measure.json").write_text(json.dumps(summ, indent=1, default=int))




def _check():
    assert skey("Eastern Wash.") == skey("Eastern Washington")
    assert skey("UNI") == skey("Northern Iowa")
    assert skey("N.C. A&T") == skey("North Carolina A&T")
    assert sim("Northern Iowa", "Northern Ariz.") < 0.85


if __name__ == "__main__":
    _check()
    main()
