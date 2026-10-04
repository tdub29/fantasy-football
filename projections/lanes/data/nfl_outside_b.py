"""Which NFL QB/RB/WR/TE (drafted, or undrafted with an NFL season) from the 2008-2023 classes sit
OUTSIDE population B, and which college division they came from.

Reads a COPY of the store (set PROSPECT_DB before running). Writes one CSV to the lane scratch dir.

    PROSPECT_DB=<scratch>/prospect.sqlite python projections/lanes/data/nfl_outside_b.py
"""
import os
import pathlib
import re
import sys
import warnings

import pandas as pd

assert "lane-data" in os.environ.get("PROSPECT_DB", ""), "point PROSPECT_DB at the lane copy of the store"
warnings.filterwarnings("ignore")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import build_prospect_model as bpm  # noqa: E402
import prospect_population as pp  # noqa: E402

SCR = pathlib.Path(os.environ["PROSPECT_DB"]).parent
NCAA = SCR / "ncaa"


def skey(s) -> str:
    s = str(s or "").lower().replace("&", " and ")
    s = re.sub(r"\bst\.?(?=\s|$)", "state", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(s.split())


def main():
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    e = pp.build(ps, bio, d, t, age0, con, say=print)
    in_b = set(e.gsis_id.dropna())
    e[["sid", "player_id", "cls", "drafted", "udfa", "gsis_id", "hit", "cpos", "name_final", "pos_team_final", "exit"]
      ].to_parquet(SCR / "pop_b.parquet", index=False)

    dp = pd.read_sql_query("SELECT season, pick, gsis_id, pfr_player_name AS name, position, college FROM nfl_draft_pick", con)
    dp = dp[dp.season.between(2008, 2023) & dp.position.isin(bpm.POS) & dp.gsis_id.notna()]
    pl = pd.read_sql_query("SELECT gsis_id, display_name AS name, position, college_name AS college, rookie_season, draft_year "
                           "FROM nfl_player", con)
    ro = pd.read_sql_query("SELECT gsis_id, season, position FROM nfl_roster ORDER BY season, source_key, src_row", con)
    first = ro.dropna().drop_duplicates("gsis_id").set_index("gsis_id").position
    ud = pl[pl.draft_year.isna() & pl.rookie_season.between(2008, 2023)].copy()
    ud["position"] = ud.gsis_id.map(first)
    ud = ud[ud.position.isin(bpm.POS)].rename(columns={"rookie_season": "season"})
    u = pd.concat([dp.assign(drafted=1), ud[["season", "gsis_id", "name", "position", "college"]].assign(drafted=0)])
    u = u.drop_duplicates("gsis_id")
    u["sid"], u["pos"], u["draft_year"] = u.gsis_id, u.position, u.season.astype(int)
    stats = pd.read_sql_query("SELECT player_id, season, position, games, fantasy_points_ppr FROM nfl_player_season", con)
    u = bpm.attach_outcomes(u, bpm.nfl_outcomes(stats, bpm.season_positions()))
    # an undrafted player counts only if he played an NFL regular-season game (same bar as B's links)
    played = set(stats[stats.games > 0].player_id)
    u = u[(u.drafted == 1) | u.gsis_id.isin(played)]
    u["in_b"] = u.gsis_id.isin(in_b)

    # Team name -> division by season, from the ESPN roster files' own `division` column (FBS teams
    # plus every FCS team that played one). The store did not ingest that column, so read the cache.
    cache = pathlib.Path(os.environ["NFLVERSE_CACHE"]) / "cfb"
    rows = []
    for y in range(2004, 2027):
        r = pd.read_parquet(cache / f"cfb_rosters_{y}.parquet",
                            columns=["division", "team_location", "team_display_name", "team_short_display_name"])
        for c in ("team_location", "team_display_name", "team_short_display_name"):
            rows.append(r[["division", c]].drop_duplicates().rename(columns={c: "name"}).assign(season=y))
    tm = pd.concat(rows).dropna()
    tm["k"] = tm.name.map(skey)
    nt = pd.concat([pd.read_parquet(NCAA / f"ncaa_mfb_teams_{y}.parquet") for y in range(2013, 2027)])
    nt = nt.assign(k=nt.team_name.map(skey), division=nt.division.map({11: "fbs", 12: "fcs"}))
    tm = pd.concat([tm[["k", "season", "division"]], nt[["k", "season", "division"]]]).drop_duplicates(["k", "season"])
    by_season = tm.set_index(["k", "season"]).division.to_dict()
    any_div = tm.sort_values("season").groupby("k").division.last().to_dict()

    def div(c, y):
        cs = [skey(x) for x in str(c or "").split(";") if x.strip()]
        if not cs:
            return "unknown"
        d_ = by_season.get((cs[-1], y - 1)) or any_div.get(cs[-1])
        return {"fbs": "FBS", "fcs": "FCS"}.get(d_, "other")
    u["div_last"] = [div(c, y) for c, y in zip(u.college, u.draft_year)]
    u.to_csv(SCR / "nfl_outside_b.csv", index=False)
    m = u[u.hit.notna()]
    print(pd.crosstab([m.in_b, m.div_last], m.drafted, margins=True).to_string())
    print("hits:")
    print(pd.crosstab([m.in_b, m.div_last], m.drafted, values=m.hit, aggfunc="sum", margins=True).to_string())
    out = m[~m.in_b & (m.hit == 1)][["name", "pos", "draft_year", "drafted", "college", "div_last", "best_rank"]]
    print(out.sort_values("draft_year").to_string())


if __name__ == "__main__":
    main()
