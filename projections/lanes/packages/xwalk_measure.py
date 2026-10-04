"""Grade the store's college-to-NFL links against ESPN's own crosswalk (espn_nfl_college_xwalk.py).

  A. Drafted QB/RB/WR/TE (the builder's latest `player_link` run): agree / conflict / new / silent,
     by link method and class era.
  B. Population B (every exiting FBS QB/RB/WR/TE, snapshot parquet): the NFL id each row carries vs
     the one ESPN maps its college id to; rows B misses that played NFL games, and how many were hits.
  C. NFL players outside B (data lane's nfl_outside_b.csv) whose ESPN college id is a career the
     store already holds: candidates B never built a row for.

    python projections/lanes/packages/xwalk_measure.py <store copy> <xwalk.parquet> <pop_b.parquet> <nfl_outside_b.csv>
"""
import json
import sqlite3
import sys

import pandas as pd


def main():
    store, xw, popb, outside = sys.argv[1:5]
    con = sqlite3.connect(store)
    x = pd.read_parquet(xw)
    x = x[x.college_athlete_id.notna()].astype({"college_athlete_id": "int64"})
    dup = x.college_athlete_id.duplicated(keep=False)
    res = {"xwalk_rows": int(len(pd.read_parquet(xw))), "with_college_id": int(len(x)),
           "college_ids_mapped_to_2plus_gsis": int(x[dup].college_athlete_id.nunique())}
    x1 = x[~dup]
    g2c = x1.set_index("gsis_id").college_athlete_id
    c2g = x1.set_index("college_athlete_id").gsis_id

    # A. drafted links
    run = con.execute("SELECT run_id FROM player_link ORDER BY run_id DESC LIMIT 1").fetchone()[0]
    pl = pd.read_sql("SELECT gsis_id, cfb_player_id, method, draft_year FROM player_link WHERE run_id = ?", con, params=(run,))
    pl["espn"] = pl.gsis_id.map(g2c)
    pl["verdict"] = "no espn link"
    pl.loc[pl.espn.notna() & pl.cfb_player_id.notna() & (pl.espn == pl.cfb_player_id), "verdict"] = "agree"
    pl.loc[pl.espn.notna() & pl.cfb_player_id.notna() & (pl.espn != pl.cfb_player_id), "verdict"] = "conflict"
    pl.loc[pl.espn.notna() & pl.cfb_player_id.isna(), "verdict"] = "new link"
    known = set(pd.read_sql("SELECT DISTINCT athlete_id FROM cfb_roster", con).athlete_id) | \
        set(pd.read_sql("SELECT DISTINCT player_id FROM cfb_receiving UNION SELECT player_id FROM cfb_rushing "
                        "UNION SELECT player_id FROM cfb_passing", con).player_id)
    pl["new_in_store"] = pl.verdict.eq("new link") & pl.espn.isin(known)
    pl["era"] = pd.cut(pl.draft_year, [2007, 2016, 2026], labels=["2008-16", "2017-26"])
    tab = pd.crosstab([pl.method, pl.era], pl.verdict, margins=True)
    print("A. drafted links, run", run)
    print(tab.to_string())
    res["A_run"] = run
    res["A"] = {str(k): int(v) for k, v in pl.verdict.value_counts().items()}
    res["A_new_link_college_in_store"] = int(pl.new_in_store.sum())
    conf = pl[pl.verdict == "conflict"].merge(
        pd.read_sql("SELECT gsis_id, display_name, college_name FROM nfl_player", con), on="gsis_id")
    print("conflicts:\n", conf[["gsis_id", "display_name", "college_name", "draft_year", "method", "cfb_player_id", "espn"]].to_string())
    conf.to_csv(pathlib_out(store, "xwalk_drafted_conflicts.csv"), index=False)

    # B. population B
    b = pd.read_parquet(popb)
    b = b[b.player_id > 0].copy()
    b["espn_gsis"] = b.player_id.map(c2g)
    b["v"] = "neither"
    b.loc[b.gsis_id.notna() & b.espn_gsis.notna() & (b.gsis_id == b.espn_gsis), "v"] = "agree"
    b.loc[b.gsis_id.notna() & b.espn_gsis.notna() & (b.gsis_id != b.espn_gsis), "v"] = "conflict"
    b.loc[b.gsis_id.isna() & b.espn_gsis.notna(), "v"] = "missed by B"
    b.loc[b.gsis_id.notna() & b.espn_gsis.isna(), "v"] = "B only"
    o = pd.read_csv(outside)
    hit = o.drop_duplicates("gsis_id").set_index("gsis_id")
    b["espn_hit"] = b.espn_gsis.map(hit.hit)
    b["espn_drafted"] = b.espn_gsis.map(hit.drafted)
    st = pd.read_sql("SELECT player_id AS g, SUM(games) AS games, SUM(fantasy_points_ppr) AS ppr "
                     "FROM nfl_player_season GROUP BY 1", con).set_index("g")
    b["espn_games"] = b.espn_gsis.map(st.games)
    print("\nB. population B rows by link verdict:")
    print(pd.crosstab(b.v, b.drafted.eq(1)).to_string())
    miss = b[b.v == "missed by B"]
    res["B"] = {str(k): int(v) for k, v in b.v.value_counts().items()}
    res["B_missed_with_nfl_games"] = int((miss.espn_games > 0).sum())
    res["B_missed_hits"] = int((miss.espn_hit == 1).sum())
    res["B_missed_by_class"] = {int(k): int(v) for k, v in miss[miss.espn_games > 0].groupby("cls").size().items()}
    cols = ["sid", "cls", "cpos", "name_final", "pos_team_final", "drafted", "udfa", "hit", "espn_gsis", "espn_games", "espn_hit", "espn_drafted"]
    print("missed by B, with NFL games:\n", miss[miss.espn_games > 0][cols].sort_values("espn_games", ascending=False).head(40).to_string())
    print("conflicts:\n", b[b.v == "conflict"][cols + ["gsis_id"]].head(30).to_string())
    b[b.v.isin(["missed by B", "conflict"])][cols + ["gsis_id", "v"]].to_csv(pathlib_out(store, "xwalk_popb_issues.csv"), index=False)

    # B2. the other direction: B links a gsis that ESPN maps to a DIFFERENT college id
    rev = b[b.gsis_id.notna()].copy()
    rev["espn_college"] = rev.gsis_id.map(g2c)
    rev = rev[rev.espn_college.notna() & (rev.espn_college != rev.player_id)]
    rev["espn_college_has_rows"] = rev.espn_college.isin(known)
    res["B_reverse_conflicts"] = int(len(rev))
    res["B_reverse_conflicts_espn_id_empty"] = int((~rev.espn_college_has_rows).sum())
    print("\nB2. B links whose gsis ESPN maps to another college id:\n",
          rev[["sid", "cls", "name_final", "pos_team_final", "gsis_id", "player_id", "espn_college", "espn_college_has_rows"]].to_string())

    # Proposed rule, measured: accept ESPN's college id only if that career has rows in the store and
    # ends in time. Drafted: last FBS stat season in [draft_year - 2, draft_year - 1], the name join's
    # window. Population B: career's last season before the NFL career starts.
    seasons = pd.concat([pd.read_sql(f"SELECT player_id, season FROM {t}", con) for t in ("cfb_receiving", "cfb_rushing", "cfb_passing")])
    last_stat = seasons.groupby("player_id").season.max()
    allseas = pd.concat([seasons, pd.read_sql("SELECT athlete_id AS player_id, season FROM cfb_roster", con)])
    last_any = allseas.groupby("player_id").season.max()
    newl = pl[pl.verdict == "new link"].copy()
    newl["last_fbs"] = newl.espn.map(last_stat)
    newl["in_window"] = newl.last_fbs.between(newl.draft_year - 2, newl.draft_year - 1)
    res["A_new_links_in_window"] = int(newl.in_window.sum())
    res["A_new_links_stale_or_no_fbs"] = int((~newl.in_window & newl.last_fbs.notna()).sum())
    nfl = pd.read_sql("SELECT gsis_id, rookie_season, draft_year FROM nfl_player", con).set_index("gsis_id")
    ro1 = pd.read_sql("SELECT gsis_id, MIN(season) AS s FROM nfl_roster GROUP BY 1", con).set_index("gsis_id").s
    miss = b[b.v == "missed by B"].copy()
    miss["nfl_start"] = pd.concat([miss.espn_gsis.map(nfl.rookie_season), miss.espn_gsis.map(ro1)], axis=1).min(axis=1)
    miss["career_end"] = miss.player_id.map(last_any)
    miss["valid"] = miss.career_end < miss.nfl_start
    miss["nfl_drafted"] = miss.espn_gsis.map(nfl.draft_year).fillna(0) > 0
    ok = miss[miss.valid & (miss.espn_games > 0)]
    res["B_missed_valid_with_games"] = int(len(ok))
    res["B_missed_valid_drafted"] = int(ok.nfl_drafted.sum())
    res["B_missed_valid_undrafted"] = int((~ok.nfl_drafted).sum())
    res["B_missed_rejected_by_timing"] = miss[~miss.valid & (miss.espn_games > 0)][["name_final", "cls"]].values.tolist()
    res["B_missed_valid_already_linked_elsewhere"] = int(ok.espn_gsis.isin(set(b.gsis_id.dropna())).sum())

    # C. NFL players outside B whose ESPN college career is in the store
    ob = o[(o.in_b == False) & o.hit.notna()].copy()  # noqa: E712
    ob["espn_college"] = ob.gsis_id.map(g2c)
    ob["career_in_store"] = ob.espn_college.isin(known)
    print("\nC. NFL QB/RB/WR/TE 2008-2023 outside B:", len(ob), "| ESPN college id:", int(ob.espn_college.notna().sum()),
          "| that career in store:", int(ob.career_in_store.sum()), "| hits among them:", int(ob[ob.career_in_store].hit.sum()))
    res["C_outside_b"] = int(len(ob))
    res["C_espn_college_id"] = int(ob.espn_college.notna().sum())
    res["C_career_in_store"] = int(ob.career_in_store.sum())
    res["C_career_in_store_hits"] = int(ob[ob.career_in_store].hit.sum())
    print(ob[ob.career_in_store & (ob.hit == 1)][["name", "pos", "draft_year", "drafted", "college", "div_last"]].to_string())
    ob[ob.career_in_store].to_csv(pathlib_out(store, "xwalk_outside_b_in_store.csv"), index=False)
    print(json.dumps(res, indent=1))
    pathlib_out(store, "xwalk_measure.json").write_text(json.dumps(res, indent=1))


def pathlib_out(store, name):
    import pathlib
    return pathlib.Path(store).parent / name


if __name__ == "__main__":
    main()
