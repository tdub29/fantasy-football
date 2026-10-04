"""Freeze the lane's ESPN pulls into ingestible snapshot files plus a manifest, so the coordinator can
load them through `prospect_db` like any release file (one table per family, sha256 per file).

  espn_recruits_<class>.parquet   one row per ESPN recruit record (raw JSONL -> the fields
                                  cfbfastR::espn_cfb_recruits returns, plus high-school testing)
  espn_nfl_college_xwalk.parquet  gsis_id -> ESPN college athlete id (espn_nfl_college_xwalk.py)

Raw responses stay in the scratch dir (`espn_recruits/raw_<y>.jsonl`, `espn_nfl_athletes/<id>.json`)
so every snapshot row is traceable to the record it came from.

    python projections/lanes/packages/espn_snapshot.py <class> [<class> ...]
"""
import hashlib
import json
import os
import pathlib
import sys

import pandas as pd

SCR = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp"))
OUT = SCR / "snapshots"
TEST = ("fortyYrdDash", "twentyYrdShuttle", "verticalJump", "threeConeDrill")


def recruit_rows(y):
    refs = json.loads((SCR / "espn_recruits" / f"refs_{y}.json").read_text())
    recs = {}
    for line in (SCR / "espn_recruits" / f"raw_{y}.jsonl").open(encoding="utf-8"):
        r = json.loads(line)
        recs[r["_id"]] = r
    missing = len(set(x.split("/recruits/")[1].split("?")[0] for x in refs) - set(recs))
    if missing:
        raise SystemExit(f"class {y}: {missing} of {len(refs)} records not fetched; rerun espn_recruits.py {y}")
    rows = []
    for rid, r in recs.items():
        a = r.get("athlete") or {}
        at = {x.get("name"): x.get("value") for x in r.get("attributes") or []}
        committed = [s for s in r.get("schools") or []
                     if (s.get("status") or {}).get("id") not in (0, None) and (s.get("status") or {}).get("id") == (r.get("status") or {}).get("id")]
        team = ((committed[0].get("team") or {}).get("$ref") or "") if committed else ""
        rows.append({
            "recruit_id": int(rid), "recruit_class": r.get("recruitingClass"),
            "athlete_id": pd.to_numeric(a.get("alternateId"), errors="coerce"),  # ESPN college athlete id
            "full_name": a.get("fullName"), "position": (a.get("position") or {}).get("abbreviation"),
            "height": a.get("height"), "weight": a.get("weight"),
            "hometown_state": (a.get("hometown") or {}).get("stateAbbreviation"),
            "grade": r.get("grade"), "overall_rank": at.get("rank"), "position_rank": at.get("positionRank"),
            "state_rank": at.get("stateRank"), "region_rank": at.get("regionRank"),
            "status": (r.get("status") or {}).get("description"),
            "committed_team_id": pd.to_numeric(team.split("/teams/")[1].split("?")[0], errors="coerce") if "/teams/" in team else None,
            **{f"hs_{k}": (None if at.get(k) in (None, 99.0) else at.get(k)) for k in TEST},
        })
    return pd.DataFrame(rows).sort_values("recruit_id")


def write(df, name, man, src):
    p = OUT / name
    df.to_parquet(p, index=False)
    man[name] = {"rows": len(df), "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                 "source": src}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "manifest.json"
    man = json.loads(mf.read_text()) if mf.exists() else {}
    for y in [int(a) for a in sys.argv[1:]]:
        write(recruit_rows(y), f"espn_recruits_{y}.parquet", man,
              f"sports.core.api.espn.com college-football seasons/{y}/recruits (+ one GET per record)")
    xw = SCR / "espn_nfl_college_xwalk.parquet"
    if xw.exists():
        x = pd.read_parquet(xw)[["gsis_id", "espn_id", "status", "college_athlete_id", "espn_college_id", "fetched_at"]]
        write(x, "espn_nfl_college_xwalk.parquet", man, "sports.core.api.espn.com nfl athletes/<espn_id> collegeAthlete")
    mf.write_text(json.dumps(man, indent=1))
    print(json.dumps(man, indent=1))


if __name__ == "__main__":
    main()
