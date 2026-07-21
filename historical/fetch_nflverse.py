"""Download historical fantasy-football-relevant data from nflverse releases.

Pulls everything needed to power predictive models and player stat cards.
Uses the canonical nflverse release tags + corrected filename patterns.

Coverage:
  - Offense weekly/reg/post stats: 1999-2025 (stats_player release)
  - Defense (IDP) weekly/season: 1999-2024 (player_stats release; 2025 not yet pushed)
  - Kicking weekly/season: 1999-2024 (player_stats release)
  - Rosters weekly/seasonal: 1999-2025 (rosters / weekly_rosters)
  - Schedules: full history (nfldata)
  - NextGen stats: 2016-2025 (nextgen_stats)
  - Snap counts: 2012-2025 (snap_counts)
  - PFR advanced stats season-level (pfr_advstats)
  - Combine, draft picks, players ID crosswalk, dynasty values, injuries, depth charts, ESPN QBR, contracts, FTN charting
"""
from __future__ import annotations

import concurrent.futures as cf
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
BASE = "https://github.com/nflverse/nflverse-data/releases/download"

OFFENSE_YEARS = list(range(1999, 2026))  # stats_player release covers 1999-2025
DEF_KICK_YEARS = list(range(1999, 2025))  # player_stats release covers 1999-2024
ROSTER_YEARS = list(range(1999, 2026))
SNAP_YEARS = list(range(2013, 2026))  # 2012 file is empty
INJURY_YEARS = list(range(2009, 2026))
DEPTH_YEARS = list(range(2001, 2026))

JOBS: list[tuple[str, str]] = []

# --- Offense player stats (correct release: stats_player) ---
for yr in OFFENSE_YEARS:
    JOBS += [
        (f"{BASE}/stats_player/stats_player_week_{yr}.csv", f"player_stats/week_{yr}.csv"),
        (f"{BASE}/stats_player/stats_player_reg_{yr}.csv", f"player_stats/reg_{yr}.csv"),
        (f"{BASE}/stats_player/stats_player_post_{yr}.csv", f"player_stats/post_{yr}.csv"),
    ]

# --- Defense / IDP (player_stats release, name pattern: player_stats_def_*) ---
for yr in DEF_KICK_YEARS:
    JOBS += [
        (f"{BASE}/player_stats/player_stats_def_{yr}.csv", f"idp_stats/week_{yr}.csv"),
        (f"{BASE}/player_stats/player_stats_def_season_{yr}.csv", f"idp_stats/season_{yr}.csv"),
    ]
JOBS += [
    (f"{BASE}/player_stats/player_stats_def.csv", "idp_stats/_all.csv"),
    (f"{BASE}/player_stats/player_stats_def_season.csv", "idp_stats/_all_season.csv"),
]

# --- Kicking ---
for yr in DEF_KICK_YEARS:
    JOBS += [
        (f"{BASE}/player_stats/player_stats_kicking_{yr}.csv", f"kicking_stats/week_{yr}.csv"),
        (f"{BASE}/player_stats/player_stats_kicking_season_{yr}.csv", f"kicking_stats/season_{yr}.csv"),
    ]
JOBS += [
    (f"{BASE}/player_stats/player_stats_kicking.csv", "kicking_stats/_all.csv"),
]

# --- Rosters ---
for yr in ROSTER_YEARS:
    JOBS += [
        (f"{BASE}/weekly_rosters/roster_weekly_{yr}.csv", f"rosters_weekly/{yr}.csv"),
        (f"{BASE}/rosters/roster_{yr}.csv", f"rosters/{yr}.csv"),
    ]

# --- Schedules ---
JOBS += [
    ("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", "schedules/games.csv"),
    (f"{BASE}/teams/teams.csv", "schedules/teams.csv"),
]

# --- NextGen Stats (per season available 2016-2025) ---
for kind in ["passing", "rushing", "receiving"]:
    JOBS += [(f"{BASE}/nextgen_stats/ngs_{kind}.csv.gz", f"nextgen/{kind}.csv.gz")]

# --- Snap counts ---
for yr in SNAP_YEARS:
    JOBS += [(f"{BASE}/snap_counts/snap_counts_{yr}.csv", f"snap_counts/{yr}.csv")]

# --- PFR advanced stats season-level (no weekly file in release) ---
for kind in ["pass", "rush", "rec", "def"]:
    JOBS += [(f"{BASE}/pfr_advstats/advstats_season_{kind}.csv", f"pfr_adv/season_{kind}.csv")]
# Weekly PFR if present
for kind in ["pass", "rush", "rec", "def"]:
    for yr in range(2018, 2026):
        JOBS += [(f"{BASE}/pfr_advstats/advstats_week_{kind}_{yr}.csv", f"pfr_adv/week_{kind}_{yr}.csv")]

# --- One-shots ---
JOBS += [
    (f"{BASE}/combine/combine.csv", "combine/combine.csv"),
    (f"{BASE}/draft_picks/draft_picks.csv", "draft/draft_picks.csv"),
    (f"{BASE}/players/players.csv", "players/players.csv"),
    (f"{BASE}/players_components/players_components.csv", "players/players_components.csv"),
    (f"{BASE}/contracts/historical_contracts.csv", "contracts/historical_contracts.csv"),
    ("https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv", "players/ff_playerids.csv"),
    ("https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv", "values/dp_values.csv"),
    ("https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv", "values/dp_values_players.csv"),
    ("https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-picks.csv", "values/dp_values_picks.csv"),
    (f"{BASE}/trades/trades.csv", "trades/trades.csv"),
    (f"{BASE}/officials/officials.csv", "officials/officials.csv"),
]

# --- Injuries ---
for yr in INJURY_YEARS:
    JOBS += [(f"{BASE}/injuries/injuries_{yr}.csv", f"injuries/{yr}.csv")]

# --- Depth charts ---
for yr in DEPTH_YEARS:
    JOBS += [(f"{BASE}/depth_charts/depth_charts_{yr}.csv", f"depth_charts/{yr}.csv")]

# --- ESPN QBR ---
JOBS += [
    (f"{BASE}/espn_data/qbr_season_level.csv", "espn/qbr_season.csv"),
    (f"{BASE}/espn_data/qbr_week_level.csv", "espn/qbr_week.csv"),
]

# --- Team-level stats (handy for opponent context features) ---
for yr in OFFENSE_YEARS:
    JOBS += [
        (f"{BASE}/stats_team/stats_team_week_{yr}.csv", f"team_stats/week_{yr}.csv"),
        (f"{BASE}/stats_team/stats_team_reg_{yr}.csv", f"team_stats/reg_{yr}.csv"),
    ]

# --- FTN charting (advanced) ---
JOBS += [(f"{BASE}/ftn_charting/ftn_charting.csv", "ftn/ftn_charting.csv")]


def fetch_one(job: tuple[str, str]) -> tuple[str, str, str]:
    url, rel = job
    out = ROOT / rel
    if out.exists() and out.stat().st_size > 0:
        return (rel, "skip", "")
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(out, "wb") as f:
            data = r.read()
            f.write(data)
        return (rel, "ok", f"{len(data)//1024}KB")
    except Exception as e:
        try:
            if out.exists():
                out.unlink()
        except Exception:
            pass
        return (rel, "err", str(e)[:120])


def main() -> int:
    print(f"Fetching {len(JOBS)} files...")
    ok = err = skip = 0
    errors: list[tuple[str, str]] = []
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for rel, status, info in ex.map(fetch_one, JOBS):
            if status == "ok":
                ok += 1
            elif status == "skip":
                skip += 1
            else:
                err += 1
                errors.append((rel, info))
    print(f"\nDone. ok={ok} skip={skip} err={err}")
    if errors:
        print("\nFailures:")
        for rel, info in errors:
            print(f"  {rel}: {info}")
    return 0 if err < 50 else 1


if __name__ == "__main__":
    sys.exit(main())
