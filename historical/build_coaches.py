"""Derive coach-change / first-time-OC / first-time-play-caller flags from
play_callers.csv. Output team_coaches.csv enriched with year-over-year deltas.

Head coaches are OVERLAID from nflverse before the flags are derived. The 2026 source
rows were verified on 2026-09-19 against ESPN's all-team staff table and NFL Nation's
all-team play-caller audit, then cross-checked against the NFL hiring tracker. That
verified current-season snapshot wins over nflverse, whose scheduled-game metadata
still carries three fired 2025 coaches. nflverse remains the historical HC authority.

Sources:
  https://g.espncdn.com/s/ffldraftkit/26/NFLDK2026_CS_ClayProjections2026.pdf
  https://abc7.com/post/calls-plays-every-nfl-team-2026-what-know/19783946/
  https://www.nfl.com/news/nfl-coaching-gm-tracker-latest-news-interviews-developments-2026-hiring-cycle

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
import io
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "play_callers.csv"
OUT = ROOT / "derived" / "team_coaches.csv"
NFLVERSE_GAMES = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
CURRENT_STAFF_SEASON = 2026
NFL_TEAMS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
}
# nflverse occasionally carries a display-name typo in otherwise authoritative game data.
COACH_NAME_FIXES = {"Klint Kubliak": "Klint Kubiak"}
EXPECTED_CURRENT_CHANGES = {"head_coach": 10, "offensive_coordinator": 21, "play_caller": 19}


def validate_current_staff(rows: list[dict]) -> None:
    current = [r for r in rows if r["season"] == CURRENT_STAFF_SEASON]
    teams = [r["team"] for r in current]
    if len(current) != 32 or len(set(teams)) != 32 or set(teams) != NFL_TEAMS:
        missing = sorted(NFL_TEAMS - set(teams))
        extra = sorted(set(teams) - NFL_TEAMS)
        raise ValueError(f"{CURRENT_STAFF_SEASON} staff must cover 32 teams; missing={missing}, extra={extra}")
    for r in current:
        missing = [k for k in ("head_coach", "offensive_coordinator", "play_caller") if not r.get(k)]
        if missing:
            raise ValueError(f'{r["team"]} {CURRENT_STAFF_SEASON} missing {", ".join(missing)}')
        expected_role = "HC" if r["play_caller"] == r["head_coach"] else "OC"
        if r.get("play_caller_role") != expected_role or (
                expected_role == "OC" and r["play_caller"] != r["offensive_coordinator"]):
            raise ValueError(f'{r["team"]} {CURRENT_STAFF_SEASON} play-caller role mismatch')
        if r.get("notes", "").strip().lower() == "projected":
            raise ValueError(f'{r["team"]} {CURRENT_STAFF_SEASON} still marked projected')
    previous = {r["team"]: r for r in rows if r["season"] == CURRENT_STAFF_SEASON - 1}
    changes = {field: sum(r[field] != previous[r["team"]][field] for r in current)
               for field in EXPECTED_CURRENT_CHANGES}
    if changes != EXPECTED_CURRENT_CHANGES:
        raise ValueError(f"{CURRENT_STAFF_SEASON} staff change counts wrong: {changes}")
    print(f"  validated {CURRENT_STAFF_SEASON} staff: 32 teams, changes={changes}")


def nflverse_head_coaches() -> dict[tuple[str, int], str]:
    """(team, season) -> head coach, from who actually coached the games.

    Returns {} on any network failure rather than raising: a missing overlay leaves
    the hand-maintained names in place, which is worse data but still a build.
    """
    try:
        req = urllib.request.Request(NFLVERSE_GAMES, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8", "ignore")
    except Exception as exc:
        print(f"  nflverse unavailable ({exc}); keeping play_callers.csv head coaches")
        return {}
    tally: dict[tuple[str, int], Counter] = defaultdict(Counter)
    for row in csv.DictReader(io.StringIO(raw)):
        try:
            season = int(row.get("season") or 0)
        except ValueError:
            continue
        for side in ("home", "away"):
            team, coach = row.get(f"{side}_team"), row.get(f"{side}_coach")
            if team and coach:
                tally[(team, season)][COACH_NAME_FIXES.get(coach, coach)] += 1
    # A mid-season firing leaves two names on one team-season. The modal coach is the
    # one who coached most of it, which is what a season-level row should carry.
    return {k: c.most_common(1)[0][0] for k, c in tally.items()}


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

    validate_current_staff(rows)

    # Overlay historical rows before sorting, so every downstream flag is derived
    # from the coach who worked the games rather than the preseason guess.
    truth = nflverse_head_coaches()
    fixed = []
    for r in rows:
        real = truth.get((r["team"], r["season"]))
        if real and real != r["head_coach"] and r["season"] < CURRENT_STAFF_SEASON:
            fixed.append(f'{r["team"]} {r["season"]}: {r["head_coach"]!r} -> {real!r}')
            # The OC and play caller stay as play_callers.csv has them. nflverse
            # carries no coordinator, and inventing one for a staff this overlay just
            # discovered would be a worse guess than the one being corrected.
            r["head_coach"] = real
    if truth:
        print(f"  nflverse head coaches: {len(truth)} team-seasons, corrected {len(fixed)}")
        for line in fixed[:12]:
            print(f"    {line}")
        if len(fixed) > 12:
            print(f"    ... and {len(fixed) - 12} more")
    # A play caller carried over from a staff that was replaced is not a stale name,
    # it is a wrong one: after the overlay Miami read "HC Jeff Hafley / PC Mike
    # McDaniel", crediting the plays to the coach who was fired. When the head coach
    # changed and the listed play caller IS the coach who left, nobody here knows who
    # calls plays, and saying so beats naming the wrong man.
    prior_hc = {}
    for r in sorted(rows, key=lambda r: (r["team"], r["season"])):
        was = prior_hc.get(r["team"])
        if was and r["head_coach"] != was:
            for role in ("play_caller", "offensive_coordinator"):
                if r.get(role) == was:
                    r[role] = ""
        prior_hc[r["team"]] = r["head_coach"]

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
