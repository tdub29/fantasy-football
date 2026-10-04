"""ESPN's own NFL-to-college athlete crosswalk. An ESPN NFL athlete record (core API
`leagues/nfl/athletes/<id>`, the record cfbfastR/sportsdataverse ESPN athlete helpers read) carries
`collegeAthlete.$ref`, the ESPN college-football athlete id the store's college careers are keyed on.
nflverse `players.espn_id` is that NFL id, so gsis -> college career becomes an id join for every
class, including 2008-2016 where ESPN issued a new id at turning pro and the builder falls back to
name + school. Key-free; ESPN data under ESPN terms, local research use only.

Population: nflverse players at QB/RB/WR/TE/FB (player or any roster row) with a rookie season or
draft year 2008-2026 and an `espn_id`; those with NFL games first. Raw records cached one file per
id under <scratch>/espn_nfl_athletes/; output <scratch>/espn_nfl_college_xwalk.parquet.

    python projections/lanes/packages/espn_nfl_college_xwalk.py <store copy>
"""
import datetime as dt
import json
import os
import pathlib
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

SCR = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp"))
RAW = SCR / "espn_nfl_athletes"
URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/{}?lang=en&region=us"
HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json"}


def get(eid):
    f = RAW / f"{eid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL.format(eid), headers=HDR), timeout=60) as r:
                d = json.load(r)
            d["_fetched_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            f.write_text(json.dumps(d), encoding="utf-8")
            return d
        except urllib.error.HTTPError as ex:
            if ex.code == 404:
                d = {"_status": 404}
                f.write_text(json.dumps(d), encoding="utf-8")
                return d
            time.sleep(2 * (i + 1))
        except Exception:  # noqa: BLE001  retried; a persistent failure is reported as error
            time.sleep(2 * (i + 1))
    return {"_status": "error"}


def ref_id(d, key):
    m = re.search(r"/(\d+)\?", ((d.get(key) or {}).get("$ref")) or "")
    return int(m.group(1)) if m else None


def candidates(con):
    pl = pd.read_sql("SELECT gsis_id, display_name, position, espn_id, rookie_season, draft_year, college_name "
                     "FROM nfl_player", con)
    ro = pd.read_sql("SELECT DISTINCT gsis_id FROM nfl_roster WHERE position IN ('QB','RB','WR','TE','FB')", con)
    st = pd.read_sql("SELECT player_id AS gsis_id, SUM(games) AS nfl_games FROM nfl_player_season GROUP BY 1", con)
    x = pl[pl.position.isin(["QB", "RB", "WR", "TE", "FB"]) | pl.gsis_id.isin(ro.gsis_id)]
    x = x[x.rookie_season.between(2008, 2026) | x.draft_year.between(2008, 2026)].merge(st, on="gsis_id", how="left")
    x = x.dropna(subset=["espn_id"]).copy()
    x["espn_id"] = x.espn_id.astype(str).str.replace(r"\.0$", "", regex=True)
    return x.sort_values("nfl_games", ascending=False, na_position="last")


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    x = candidates(sqlite3.connect(sys.argv[1]))
    with ThreadPoolExecutor(6) as ex:
        recs = list(ex.map(get, x.espn_id))
    x["status"] = [r.get("_status", 200) for r in recs]
    x["college_athlete_id"] = [ref_id(r, "collegeAthlete") for r in recs]
    x["espn_college_id"] = [ref_id(r, "college") for r in recs]
    x["espn_dob"] = [r.get("dateOfBirth") for r in recs]
    x["fetched_at"] = [r.get("_fetched_at") for r in recs]
    x.to_parquet(SCR / "espn_nfl_college_xwalk.parquet", index=False)
    print("records", len(x), "status", x.status.value_counts().to_dict(),
          "with collegeAthlete", int(x.college_athlete_id.notna().sum()))


if __name__ == "__main__":
    main()
