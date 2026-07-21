"""Build a unified player ID crosswalk.

Joins the Sleeper player dictionary with nflverse `gsis_id` (the canonical
identifier in stats files) and dynastyprocess `db_playerids.csv` to produce
a single map keyed by sleeper_id and gsis_id.

Output: id_crosswalk.json
  {
    "by_sleeper": { sleeper_id: {gsis_id, espn_id, pfr_id, fantasypros_id, name, position, team} },
    "by_gsis":    { gsis_id:    {sleeper_id, ...} }
  }
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
PROJECT = ROOT.parent

SLEEPER_FILE = PROJECT / "players-nfl.json"
FFIDS = ROOT / "players/ff_playerids.csv"
NFLVERSE_PLAYERS = ROOT / "players/players.csv"


def norm_name(s: str | None) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def main() -> int:
    # 1. Load Sleeper
    with open(SLEEPER_FILE, encoding="utf-8") as f:
        sleeper = json.load(f)

    # 2. Load ff_playerids
    ff_rows = []
    with open(FFIDS, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ff_rows.append(row)

    # Index ff_playerids by sleeper_id and by gsis_id and by name+pos
    ff_by_sleeper = {r["sleeper_id"]: r for r in ff_rows if r.get("sleeper_id")}
    ff_by_gsis = {r["gsis_id"]: r for r in ff_rows if r.get("gsis_id")}
    ff_by_namepos: dict[tuple[str, str], list[dict]] = {}
    for r in ff_rows:
        key = (norm_name(r.get("merge_name") or r.get("name")), (r.get("position") or "").upper())
        ff_by_namepos.setdefault(key, []).append(r)

    # 3. Load nflverse players (has gsis_id, sleeper_id direct in newer versions)
    nfl_rows = []
    with open(NFLVERSE_PLAYERS, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            nfl_rows.append(row)
    nfl_by_gsis = {r.get("gsis_id"): r for r in nfl_rows if r.get("gsis_id")}
    nfl_by_sleeper = {r.get("sleeper_id"): r for r in nfl_rows if r.get("sleeper_id")}

    by_sleeper: dict[str, dict] = {}
    by_gsis: dict[str, dict] = {}

    for sid, p in sleeper.items():
        if not isinstance(p, dict):
            continue
        gsis = (p.get("gsis_id") or "").strip()
        # Try ff_playerids match
        ff = ff_by_sleeper.get(sid)
        if not ff and gsis:
            ff = ff_by_gsis.get(gsis)
        if not ff:
            key = (norm_name(p.get("full_name")), (p.get("position") or "").upper())
            cands = ff_by_namepos.get(key, [])
            if len(cands) == 1:
                ff = cands[0]

        nfl = nfl_by_sleeper.get(sid) or (nfl_by_gsis.get(gsis) if gsis else None)
        if not gsis and ff:
            gsis = ff.get("gsis_id") or ""
        if not gsis and nfl:
            gsis = nfl.get("gsis_id") or ""

        record = {
            "sleeper_id": sid,
            "gsis_id": gsis or None,
            "name": p.get("full_name"),
            "position": p.get("position"),
            "team": p.get("team"),
            "age": p.get("age"),
            "years_exp": p.get("years_exp"),
            "college": p.get("college"),
            "espn_id": p.get("espn_id") or (ff.get("espn_id") if ff else None) or (nfl.get("espn_id") if nfl else None),
            "yahoo_id": p.get("yahoo_id") or (ff.get("yahoo_id") if ff else None),
            "pfr_id": p.get("pfr_id") or (ff.get("pfr_id") if ff else None) or (nfl.get("pfr_id") if nfl else None),
            "fantasypros_id": (ff.get("fantasypros_id") if ff else None),
            "ktc_id": (ff.get("ktc_id") if ff else None),
            "rotowire_id": (ff.get("rotowire_id") if ff else None),
            "sportradar_id": p.get("sportradar_id"),
            "draft_year": p.get("metadata", {}).get("rookie_year") if isinstance(p.get("metadata"), dict) else None,
            "height": p.get("height"),
            "weight": p.get("weight"),
            "birth_date": p.get("birth_date"),
        }
        by_sleeper[sid] = record
        if gsis:
            by_gsis[gsis] = record

    # Add gsis_only entries from nflverse players that have no sleeper match (historical)
    for r in nfl_rows:
        gsis = r.get("gsis_id")
        if not gsis or gsis in by_gsis:
            continue
        by_gsis[gsis] = {
            "sleeper_id": r.get("sleeper_id"),
            "gsis_id": gsis,
            "name": r.get("display_name") or r.get("full_name"),
            "position": r.get("position"),
            "team": r.get("team_abbr"),
            "espn_id": r.get("espn_id"),
            "pfr_id": r.get("pfr_id"),
            "draft_year": r.get("draft_year"),
            "height": r.get("height"),
            "weight": r.get("weight"),
            "birth_date": r.get("birth_date"),
            "college": r.get("college_name"),
        }

    out = {"by_sleeper": by_sleeper, "by_gsis": by_gsis}
    out_path = ROOT / "id_crosswalk.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {out_path}: by_sleeper={len(by_sleeper)} by_gsis={len(by_gsis)}")
    matched = sum(1 for v in by_sleeper.values() if v.get("gsis_id"))
    print(f"sleeper rows with gsis: {matched}/{len(by_sleeper)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
