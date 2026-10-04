"""Does ESPN's college athlete record (core API, the endpoint behind cfbfastR::espn_cfb_player and
sportsdataverse's ESPN athlete helpers) carry a birth date, and does that depend on the outcome?

Stratified sample of population B (every exiting FBS QB/RB/WR/TE) by class and outcome group:
drafted, undrafted with an NFL roster row (udfa), and neither. If DOB presence differs by group,
DOB is outcome-revealing missingness (ESPN fills it when a player turns pro) and must not feed a
pre-draft model or be compared across groups.

    python projections/lanes/packages/espn_dob_probe.py <pop_b.parquet> [per_cell]
"""
import json
import os
import pathlib
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

OUT = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp")) / "espn_dob"
URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/{}?lang=en&region=us"
HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json"}


def get(aid):
    f = OUT / f"{aid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL.format(aid), headers=HDR), timeout=60) as r:
                d = json.load(r)
            f.write_text(json.dumps(d), encoding="utf-8")
            return d
        except urllib.error.HTTPError as ex:
            if ex.code == 404:
                return {"_status": 404}
            time.sleep(2 * (i + 1))
        except Exception:  # noqa: BLE001  retried
            time.sleep(2 * (i + 1))
    return {"_status": "error"}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    per = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    b = pd.read_parquet(sys.argv[1])
    b = b[(b.player_id > 0) & b.cls.between(2012, 2026)].copy()
    b["group"] = b.drafted.eq(1).map({True: "drafted", False: ""}).where(b.drafted.eq(1), b.udfa.map({True: "udfa", False: "none"}))
    s = b.sample(frac=1, random_state=11).groupby(["cls", "group"]).head(per).copy()
    with ThreadPoolExecutor(4) as ex:
        recs = list(ex.map(get, s.player_id.astype(int)))
    s["status"] = [r.get("_status", 200) for r in recs]
    s["dob"] = [r.get("dateOfBirth") for r in recs]
    s["pro_link"] = [bool(r.get("proAthlete")) for r in recs]
    s["has_dob"] = s.dob.notna()
    s.drop(columns=["hit"]).to_csv(OUT.parent / "espn_dob_probe.csv", index=False)
    era = pd.cut(s.cls, [2011, 2017, 2022, 2026], labels=["2012-17", "2018-22", "2023-26"])
    print("records fetched:", int((s.status == 200).sum()), "of", len(s))
    print(pd.crosstab([era, s.group], s.has_dob, normalize="index").round(2).to_string())
    print(pd.crosstab(s.group, s.pro_link).to_string())


if __name__ == "__main__":
    main()
