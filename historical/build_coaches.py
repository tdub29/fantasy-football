"""Derive coach-change / first-time-OC / first-time-play-caller flags from
play_callers.csv. Output team_coaches.csv enriched with year-over-year deltas.

Columns added:
  is_new_hc                 head coach is different from prior season (same team)
  is_new_oc                 OC is different from prior season (same team)
  is_new_play_caller        play caller is different from prior season (same team)
  hc_first_season           HC's first NFL HC season anywhere
  oc_first_season           OC's first NFL OC season anywhere (per OC role)
  play_caller_first_season  this person's first NFL play caller season anywhere
  oc_change_streak          number of consecutive seasons with same OC (1 = first)
  pc_change_streak          number of consecutive seasons with same play caller
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "play_callers.csv"
OUT = ROOT / "derived" / "team_coaches.csv"


def first_name(s: str) -> str:
    """If the cell has a slash (mid-season change), take the first listed name."""
    return (s or "").split("/")[0].strip()


def main() -> int:
    rows: list[dict] = []
    with open(SRC, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r["season"] = int(r["season"])
            for k in ("head_coach", "offensive_coordinator", "play_caller"):
                r[k] = first_name(r.get(k, ""))
            rows.append(r)
    rows.sort(key=lambda r: (r["team"], r["season"]))

    # Build first-season indexes
    hc_first: dict[str, int] = {}
    oc_first: dict[str, int] = {}
    pc_first: dict[str, int] = {}
    for r in rows:
        for name, idx in [(r["head_coach"], hc_first),
                          (r["offensive_coordinator"], oc_first),
                          (r["play_caller"], pc_first)]:
            if name and (name not in idx or r["season"] < idx[name]):
                idx[name] = r["season"]

    # Year-over-year deltas by team
    out_rows: list[dict] = []
    prev: dict[str, dict] = {}
    streak_oc: dict[tuple, int] = defaultdict(int)
    streak_pc: dict[tuple, int] = defaultdict(int)
    for r in rows:
        team = r["team"]
        p = prev.get(team)
        is_new_hc = bool(p and p["head_coach"] != r["head_coach"])
        is_new_oc = bool(p and p["offensive_coordinator"] != r["offensive_coordinator"])
        is_new_pc = bool(p and p["play_caller"] != r["play_caller"])
        # If no prior season for this team in the data, treat as new (first observed)
        if not p:
            is_new_hc = True
            is_new_oc = True
            is_new_pc = True

        key_oc = (team, r["offensive_coordinator"])
        key_pc = (team, r["play_caller"])
        streak_oc[key_oc] = 1 if is_new_oc else (streak_oc.get((team, p["offensive_coordinator"]) if p else key_oc, 0) + 1)
        streak_pc[key_pc] = 1 if is_new_pc else (streak_pc.get((team, p["play_caller"]) if p else key_pc, 0) + 1)

        out_rows.append({
            "season": r["season"],
            "team": team,
            "head_coach": r["head_coach"],
            "offensive_coordinator": r["offensive_coordinator"],
            "play_caller": r["play_caller"],
            "play_caller_role": r.get("play_caller_role", ""),
            "scheme": r.get("scheme", ""),
            "notes": r.get("notes", ""),
            "is_new_hc": is_new_hc,
            "is_new_oc": is_new_oc,
            "is_new_play_caller": is_new_pc,
            "hc_first_season": hc_first.get(r["head_coach"]) == r["season"],
            "oc_first_season": oc_first.get(r["offensive_coordinator"]) == r["season"],
            "play_caller_first_season": pc_first.get(r["play_caller"]) == r["season"],
            "oc_tenure_yr": streak_oc[key_oc],
            "pc_tenure_yr": streak_pc[key_pc],
        })
        prev[team] = r

    OUT.parent.mkdir(exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        for r in out_rows:
            w.writerow(r)
    print(f"wrote {OUT}: {len(out_rows)} rows")

    # Quick summary: how many first-time play callers per season?
    by_season = defaultdict(lambda: {"new_pc": 0, "first_time_pc": 0, "new_oc": 0, "first_time_oc": 0})
    for r in out_rows:
        s = r["season"]
        if r["is_new_play_caller"]:
            by_season[s]["new_pc"] += 1
        if r["play_caller_first_season"]:
            by_season[s]["first_time_pc"] += 1
        if r["is_new_oc"]:
            by_season[s]["new_oc"] += 1
        if r["oc_first_season"]:
            by_season[s]["first_time_oc"] += 1
    print("\nSummary by season:")
    print(f"  {'season':6} {'new_pc':6} {'1st_pc':6} {'new_oc':6} {'1st_oc':6}")
    for s in sorted(by_season):
        c = by_season[s]
        print(f"  {s:6} {c['new_pc']:6} {c['first_time_pc']:6} {c['new_oc']:6} {c['first_time_oc']:6}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
