"""Derive 2025 IDP weekly stats from play-by-play.

The official nflverse `player_stats` release lags and does not yet have 2025
defense data, but `pbp/play_by_play_2025.csv.gz` does. This script extracts:
  solo tackles, assist tackles, sacks, INT, FF, FR, PD, def TD, safeties
per (player_id, season, week, team) and writes:
  idp_stats/week_2025_derived.csv
  idp_stats/season_2025_derived.csv

Schema mirrors player_stats_def_*.csv so downstream code can union.
"""
from __future__ import annotations

import csv
import gzip
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
PBP = ROOT / "pbp" / "2025.csv.gz"
OUT_WEEK = ROOT / "idp_stats" / "week_2025_derived.csv"
OUT_SEASON = ROOT / "idp_stats" / "season_2025_derived.csv"


def to_f(x) -> float:
    try:
        if x in (None, "", "NA"):
            return 0.0
        return float(x)
    except Exception:
        return 0.0


def main() -> int:
    if not PBP.exists():
        print("PBP 2025 missing", file=sys.stderr)
        return 1

    weekly: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    teams: dict[str, str] = {}
    season_type_map: dict[tuple, str] = {}

    with gzip.open(PBP, "rt", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        # Identify column existence
        cols = reader.fieldnames or []
        wanted = {c for c in cols if c.startswith(("solo_tackle_1_player_id", "solo_tackle_2_player_id",
                                                    "assist_tackle_1_player_id", "assist_tackle_2_player_id",
                                                    "assist_tackle_3_player_id", "assist_tackle_4_player_id",
                                                    "sack_player_id", "half_sack_1_player_id",
                                                    "half_sack_2_player_id", "interception_player_id",
                                                    "forced_fumble_player_1_player_id",
                                                    "forced_fumble_player_2_player_id",
                                                    "fumbled_1_player_id", "fumbled_2_player_id",
                                                    "fumble_recovery_1_player_id",
                                                    "fumble_recovery_2_player_id",
                                                    "pass_defense_1_player_id",
                                                    "pass_defense_2_player_id",
                                                    "qb_hit_1_player_id", "qb_hit_2_player_id",
                                                    "tackle_for_loss_1_player_id",
                                                    "tackle_for_loss_2_player_id",
                                                    "safety_player_id"))}
        n = 0
        for r in reader:
            n += 1
            week = r.get("week")
            season = r.get("season") or "2025"
            stype = r.get("season_type") or "REG"
            defteam = r.get("defteam")
            if not week:
                continue

            def add(stat: str, pid: str, value: float = 1.0) -> None:
                if not pid or pid in ("", "NA"):
                    return
                k = (pid, season, week)
                weekly[k][stat] += value
                if defteam:
                    teams[pid] = defteam
                season_type_map[k] = stype

            # Solo tackles
            for col in ("solo_tackle_1_player_id", "solo_tackle_2_player_id"):
                add("def_tackles_solo", r.get(col, ""))
            # Assists
            for col in ("assist_tackle_1_player_id", "assist_tackle_2_player_id",
                        "assist_tackle_3_player_id", "assist_tackle_4_player_id"):
                add("def_tackle_assists", r.get(col, ""))
            # Sacks
            sacker = r.get("sack_player_id", "")
            if sacker:
                add("def_sacks", sacker, 1.0)
            for col in ("half_sack_1_player_id", "half_sack_2_player_id"):
                add("def_sacks", r.get(col, ""), 0.5)
            # INTs
            add("def_interceptions", r.get("interception_player_id", ""))
            # Forced fumbles
            for col in ("forced_fumble_player_1_player_id", "forced_fumble_player_2_player_id"):
                add("def_fumbles_forced", r.get(col, ""))
            # Fumble recoveries (defense recovers)
            fr1 = r.get("fumble_recovery_1_player_id", "")
            fr1_team = r.get("fumble_recovery_1_team", "")
            if fr1 and fr1_team and fr1_team == defteam:
                add("def_fumble_recovery_opp", fr1)
            fr2 = r.get("fumble_recovery_2_player_id", "")
            fr2_team = r.get("fumble_recovery_2_team", "")
            if fr2 and fr2_team and fr2_team == defteam:
                add("def_fumble_recovery_opp", fr2)
            # Pass defended
            for col in ("pass_defense_1_player_id", "pass_defense_2_player_id"):
                add("def_pass_defended", r.get(col, ""))
            # QB hits
            for col in ("qb_hit_1_player_id", "qb_hit_2_player_id"):
                add("def_qb_hits", r.get(col, ""))
            # TFL
            for col in ("tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id"):
                add("def_tackles_for_loss", r.get(col, ""))
            # Safety
            add("def_safety", r.get("safety_player_id", ""))
            # Defensive TD
            if r.get("td_team") and r.get("td_team") == defteam and r.get("td_player_id"):
                add("def_tds", r.get("td_player_id", ""))

    # Compose total tackles
    for k, a in weekly.items():
        a["def_tackles"] = a.get("def_tackles_solo", 0) + a.get("def_tackle_assists", 0)
        a["def_tackles_with_assist"] = a.get("def_tackles_solo", 0) + a.get("def_tackle_assists", 0)

    # Write weekly
    OUT_WEEK.parent.mkdir(exist_ok=True)
    cols = ["season", "week", "season_type", "player_id", "team",
            "def_tackles", "def_tackles_solo", "def_tackle_assists",
            "def_tackles_for_loss", "def_fumbles_forced", "def_sacks",
            "def_qb_hits", "def_interceptions", "def_pass_defended",
            "def_tds", "def_fumble_recovery_opp", "def_safety"]
    with open(OUT_WEEK, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for (pid, season, week), a in sorted(weekly.items()):
            row = {"season": season, "week": week,
                   "season_type": season_type_map.get((pid, season, week), "REG"),
                   "player_id": pid, "team": teams.get(pid, "")}
            for c in cols[5:]:
                row[c] = round(a.get(c, 0), 2)
            w.writerow(row)
    print(f"Wrote {OUT_WEEK}: rows={len(weekly)}")

    # Season aggregate
    season: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    games_seen: dict[tuple, set] = defaultdict(set)
    for (pid, s, week), a in weekly.items():
        if season_type_map.get((pid, s, week)) != "REG":
            continue
        key = (pid, s)
        for c in cols[5:]:
            season[key][c] += a.get(c, 0)
        games_seen[key].add(week)

    with open(OUT_SEASON, "w", encoding="utf-8", newline="") as f:
        sc = ["season", "player_id", "team", "games"] + cols[5:]
        w = csv.DictWriter(f, fieldnames=sc)
        w.writeheader()
        for (pid, s), a in sorted(season.items()):
            row = {"season": s, "player_id": pid, "team": teams.get(pid, ""),
                   "games": len(games_seen[(pid, s)])}
            for c in cols[5:]:
                row[c] = round(a[c], 2)
            w.writerow(row)
    print(f"Wrote {OUT_SEASON}: rows={len(season)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
