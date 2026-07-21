"""Validate the historical dataset is complete enough for predictive modeling
and player stat cards."""
from __future__ import annotations
import csv, json, gzip
from pathlib import Path

ROOT = Path(__file__).parent
issues: list[str] = []

def have(p: Path) -> bool:
    return p.exists() and p.stat().st_size > 0

def check_year_range(folder: str, prefix: str, suffix: str, expected: range, label: str):
    missing = []
    for yr in expected:
        if not have(ROOT / folder / f"{prefix}{yr}{suffix}"):
            missing.append(yr)
    if missing:
        issues.append(f"{label}: missing years {missing}")

# Offense weekly 1999-2025
check_year_range("player_stats", "week_", ".csv", range(1999, 2026), "Offense weekly")
check_year_range("player_stats", "reg_", ".csv", range(1999, 2026), "Offense season (reg)")
# IDP 1999-2024 native + 2025 derived
check_year_range("idp_stats", "week_", ".csv", range(1999, 2025), "IDP weekly")
if not have(ROOT / "idp_stats/week_2025_derived.csv"):
    issues.append("IDP 2025 derived missing")
# Kicking 1999-2024 (week file 2012 may be missing)
for yr in range(2002, 2025):
    if not have(ROOT / f"kicking_stats/week_{yr}.csv"):
        issues.append(f"Kicking weekly {yr} missing")
# Rosters
check_year_range("rosters", "", ".csv", range(2000, 2026), "Rosters seasonal")
check_year_range("rosters_weekly", "", ".csv", range(2002, 2026), "Rosters weekly")
# Snap counts 2013-2025
check_year_range("snap_counts", "", ".csv", range(2013, 2026), "Snap counts")
# Injuries 2009-2025
check_year_range("injuries", "", ".csv", range(2009, 2026), "Injuries")
# Depth charts 2014-2025
check_year_range("depth_charts", "", ".csv", range(2014, 2026), "Depth charts")
# PBP 2020-2025
for yr in range(2020, 2026):
    if not have(ROOT / f"pbp/{yr}.csv.gz"):
        issues.append(f"PBP {yr} missing")
# One-shots
for path, label in [
    ("schedules/games.csv", "Schedules"),
    ("nextgen/passing.csv.gz", "NextGen passing"),
    ("nextgen/rushing.csv.gz", "NextGen rushing"),
    ("nextgen/receiving.csv.gz", "NextGen receiving"),
    ("combine/combine.csv", "Combine"),
    ("draft/draft_picks.csv", "Draft picks"),
    ("players/players.csv", "nflverse players"),
    ("players/ff_playerids.csv", "FF playerids crosswalk"),
    ("values/dp_values.csv", "DynastyProcess values"),
    ("derived/weekly_fantasy.csv", "Derived weekly FP"),
    ("derived/season_summary.csv", "Derived season summary"),
    ("derived/career_summary.csv", "Derived career summary"),
    ("derived/player_card.json", "Derived player cards"),
    ("id_crosswalk.json", "ID crosswalk"),
    ("derived/team_season_totals.csv", "Team season totals (opp share)"),
    ("derived/player_team_share.csv", "Player team share"),
    ("derived/team_turnover.csv", "Team turnover"),
    ("derived/player_new_team.csv", "Player new-team transitions"),
    ("derived/apy_expected_share.json", "APY expected share baselines"),
    ("derived/team_coaches.csv", "Team coaches"),
    ("derived/game_team_context.csv", "Game team context (Vegas + weather)"),
    ("derived/team_season_market.csv", "Team season market (PROE + pace)"),
    ("derived/def_vs_pos.csv", "Defense vs position"),
    ("derived/def_vs_pos_ranks.csv", "Defense vs position ranks"),
    ("derived/qb_changes.csv", "QB changes"),
    ("derived/player_efficiency.csv", "Player efficiency"),
    ("derived/career_health.csv", "Career health"),
    ("derived/strength_of_schedule.csv", "Strength of schedule"),
    ("play_callers.csv", "Curated play-callers source"),
]:
    if not have(ROOT / path):
        issues.append(f"{label} missing: {path}")

# Quick stat checks
def line_count(p: Path) -> int:
    with open(p, encoding="utf-8") as f:
        return sum(1 for _ in f) - 1

stats = {
    "weekly_fantasy_rows": line_count(ROOT / "derived/weekly_fantasy.csv"),
    "season_summary_rows": line_count(ROOT / "derived/season_summary.csv"),
    "career_summary_rows": line_count(ROOT / "derived/career_summary.csv"),
    "schedules_rows": line_count(ROOT / "schedules/games.csv"),
}

# id crosswalk coverage
with open(ROOT / "id_crosswalk.json") as f:
    cw = json.load(f)
stats["sleeper_players"] = len(cw["by_sleeper"])
stats["with_gsis_match"] = sum(1 for v in cw["by_sleeper"].values() if v.get("gsis_id"))

# Total disk usage
total = 0
for p in ROOT.rglob("*"):
    if p.is_file():
        total += p.stat().st_size
stats["total_size_mb"] = round(total / (1024 * 1024), 1)

print("=== DATASET VALIDATION ===")
print(f"\nStats: {json.dumps(stats, indent=2)}")
if issues:
    print(f"\nIssues found ({len(issues)}):")
    for i in issues:
        print(f"  - {i}")
else:
    print("\nAll checks passed.")
print(f"\nTotal issues: {len(issues)}")
