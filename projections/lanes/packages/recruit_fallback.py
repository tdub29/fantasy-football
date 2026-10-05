"""Name + school fallback for ESPN recruit records without `alternateId` (ESPN attaches it late:
2024 class 54%, 2025 16%, 2026 7%). Same rule as the builder's 247 join: normalized name
(`bpp.norm_name`) + the committed ESPN team id, against store rosters from the class year on; a key
matching two college ids stays unlinked.

Graded on records that DO carry `alternateId` (hide it, join by name + school, compare), then applied
to the ones that do not.

    python projections/lanes/packages/recruit_fallback.py <store copy> <class> [<class> ...]
"""
import json
import os
import pathlib
import sqlite3
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import build_prospect_profile as bpp  # noqa: E402  (norm_name only)

SCR = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp"))


def recruits(y):
    rows = []
    for line in (SCR / "espn_recruits" / f"raw_{y}.jsonl").open(encoding="utf-8"):
        r = json.loads(line)
        a = r.get("athlete") or {}
        st = (r.get("status") or {}).get("id")
        team = next(((s.get("team") or {}).get("$ref", "") for s in r.get("schools") or []
                     if (s.get("status") or {}).get("id") not in (0, None) and (s.get("status") or {}).get("id") == st), "")
        rows.append({"recruit_id": int(r["_id"]), "rclass": y, "name": a.get("fullName"),
                     "alt": pd.to_numeric(a.get("alternateId"), errors="coerce"),
                     "team_id": pd.to_numeric(team.split("/teams/")[1].split("?")[0], errors="coerce") if "/teams/" in team else None})
    return pd.DataFrame(rows)


def main():
    con = sqlite3.connect(sys.argv[1])
    years = [int(a) for a in sys.argv[2:]]
    ros = pd.read_sql("SELECT season, athlete_id, team_id, full_name FROM cfb_roster WHERE athlete_id IS NOT NULL", con)
    ros["team_id"] = pd.to_numeric(ros.team_id, errors="coerce")
    ros["_k"] = ros.full_name.map(bpp.norm_name)
    out = {}
    for y in years:
        r = recruits(y)
        r["_k"] = r.name.map(bpp.norm_name)
        cand = ros[ros.season >= y].drop_duplicates(["_k", "team_id", "athlete_id"])
        m = r.dropna(subset=["team_id"]).merge(cand[["_k", "team_id", "athlete_id"]], on=["_k", "team_id"])
        n_ids = m.groupby("recruit_id").athlete_id.nunique()
        m = m[m.recruit_id.isin(n_ids[n_ids == 1].index)].drop_duplicates("recruit_id").set_index("recruit_id").athlete_id
        r["fallback"] = r.recruit_id.map(m)
        # grade only where alternateId is a real college id (on some store roster): transfer-portal
        # records and some others carry an alternateId that no roster uses
        on_roster = set(ros.athlete_id)
        r["alt_on_roster"] = r.alt.isin(on_roster)
        g = r[r.alt_on_roster]
        hit = g.fallback.notna()
        res = {"records": len(r), "with_alt": int((r.alt > 0).sum()), "alt_on_roster": int(len(g)),
               "fallback_found_where_alt": int(hit.sum()),
               "fallback_precision": round(float((g.fallback[hit] == g.alt[hit]).mean()), 4) if hit.any() else None,
               "fallback_recall": round(float(hit.mean()), 3) if len(g) else None,
               "not_on_roster": int((~r.alt_on_roster).sum()),
               "not_on_roster_recovered": int(r.fallback[~r.alt_on_roster].notna().sum())}
        out[y] = res
        print(y, res)
    (SCR / "recruit_fallback.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
