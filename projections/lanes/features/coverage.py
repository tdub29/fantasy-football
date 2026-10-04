"""Features lane: coverage, join and redundancy checks for the two candidate families, BEFORE any
preregistration or scoring. Writes notes/prospect-research/lanes/features/coverage.json.

Family 1, espn_cfb_adv_receiving (per game): air-yard columns populated by season; name join rate of
season aggregates to the store's cfb_receiving player ids; whether Tar/Yds/EPA/SR equal the store's
season receiving file (same ESPN play-by-play, recomputed).
Family 2, cfb_team_talent: coverage by season, team-id join to the store's player seasons, agreement
with a recompute from the store's own cfb_recruit rows (the talent file is derived from 247 classes).

    PROSPECT_DB=<lane copy> python projections/lanes/features/coverage.py
"""
from __future__ import annotations

import json
import os
import pathlib
import sqlite3

import numpy as np
import pandas as pd

DL = pathlib.Path(os.environ.get("LANE_DL", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-features\dl"))
DB = os.environ["PROSPECT_DB"]
OUT = pathlib.Path(__file__).resolve().parents[3] / "notes" / "prospect-research" / "lanes" / "features" / "coverage.json"


def fam1(con):
    out = {}
    rec = pd.read_sql_query('SELECT season, player_id, team_id, receiver_player_name, targets, comp, yards, "TEPA", success, plays '
                            "FROM cfb_receiving", con)
    rec["team_id"] = pd.to_numeric(rec.team_id, errors="coerce")
    for y in range(2004, 2027):
        a = pd.read_parquet(DL / f"adv_receiving_{y}.parquet")
        air = pd.to_numeric(a.AirYds, errors="coerce")
        g = (a.dropna(subset=["receiver_player_name"])
             .groupby(["season", "pos_team_id", "receiver_player_name"])
             .agg(tar=("Tar", "sum"), rec=("Rec", "sum"), yds=("Yds", "sum"), epa=("EPA", "sum"), games=("game_id", "nunique"))
             .reset_index())
        r = rec[rec.season == y]
        m = g.merge(r, left_on=["season", "pos_team_id", "receiver_player_name"],
                    right_on=["season", "team_id", "receiver_player_name"], how="left", indicator=True)
        hit = m[m._merge == "both"]
        dup = r.duplicated(["team_id", "receiver_player_name"], keep=False).sum()
        out[y] = {"rows": int(len(a)), "airyds_nonnull": round(float(air.notna().mean()), 4),
                  "name_null_rows": round(float(a.receiver_player_name.isna().mean()), 4),
                  "player_seasons": int(len(g)),
                  "joined_to_store_id": round(float((m._merge == "both").mean()), 4),
                  "store_name_team_dups": int(dup),
                  "targets_equal": round(float((hit.tar == hit.targets).mean()), 4) if len(hit) else None,
                  "yards_equal": round(float((np.abs(hit.yds - hit.yards) < 0.5).mean()), 4) if len(hit) else None,
                  "receptions_equal": round(float((hit.rec == hit.comp).mean()), 4) if len(hit) else None,
                  "epa_corr": round(float(np.corrcoef(hit.epa, hit.TEPA)[0, 1]), 4) if len(hit) > 2 else None}
    return out


def fam2(con):
    out = {}
    ps = pd.read_sql_query("SELECT season, player_id, team_id FROM cfb_receiving UNION SELECT season, player_id, team_id FROM cfb_rushing",
                           con)
    ps["team_id"] = pd.to_numeric(ps.team_id, errors="coerce")
    rc = pd.read_sql_query("SELECT season, team_id, stars, grade FROM cfb_recruit", con)
    rc["team_id"] = pd.to_numeric(rc.team_id, errors="coerce")
    for y in range(2005, 2027):
        t = pd.read_parquet(DL / f"cfb_team_talent_{y}.parquet")
        t["team_id"] = pd.to_numeric(t.team_id, errors="coerce")
        p = ps[ps.season == y]
        cov = p.team_id.isin(t.team_id)
        # store-only proxy: count of the team's recruits in classes y-3..y (the talent window), to test the
        # file is a function of 247 classes the store already holds
        w = rc[(rc.season >= y - 3) & (rc.season <= y)].groupby("team_id").size()
        j = t.set_index("team_id").n_recruits.to_frame().join(w.rename("store_n"), how="left")
        out[y] = {"teams": int(len(t)), "talent_null": int(t.talent_composite.isna().sum()),
                  "player_seasons_team_covered": round(float(cov.mean()), 4),
                  "n_recruits_vs_store_window_corr": round(float(j.dropna().corr().iloc[0, 1]), 4) if j.dropna().shape[0] > 2 else None,
                  "store_recruit_classes_in_window": sorted(int(s) for s in rc[(rc.season >= y - 3) & (rc.season <= y)].season.unique())}
    return out


def main():
    con = sqlite3.connect(DB)
    res = {"family1_adv_receiving": fam1(con), "family2_team_talent": fam2(con)}
    OUT.write_text(json.dumps(res, indent=1), encoding="utf-8")
    f1 = pd.DataFrame(res["family1_adv_receiving"]).T
    f2 = pd.DataFrame(res["family2_team_talent"]).T
    print(f1.to_string())
    print(f2.drop(columns=["store_recruit_classes_in_window"]).to_string())


if __name__ == "__main__":
    main()
