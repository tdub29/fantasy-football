# Data suite loop checkpoint

Started 2026-09-24. Order: (1) podcast metrics list, (2) source map, (3) build the
data suite into the site, (4) Trade Lab title odds by year (queued task
t-1790229606406). Hard stop: all four phases shipped with gates green.

## Phase status
- [x] 1. Beyond the Box Score metrics. 6 episodes (RSS audio, YouTube blocked).
      Merged list with benchmarks: notes/beyond-the-box-score-metrics.md.
- [x] 2. Source map (below).
- [x] 3. Built: projections/build_nflverse_suite.py -> site/data/advanced.js (74 player
      cols, 25 team cols, game logs), Stats Lab #stats, player card Production panel,
      wired into build_all.py, gate feature stats-lab.
- [~] 4. Trade Lab title odds by year: patch written, waiting on gate run.

## Source map (public, key-free)
nflverse-data releases, 2026 files present and updated this week:
- pbp (play_by_play_2026): EPA, air yards, xpass/pass_oe (PROE), red zone,
  goal line, success rate, CPOE, scrambles. The big one.
- stats_player_week / stats_team_week: target share, air yard share, WOPR, RACR.
- snap_counts_2026: offense snap %.
- nextgen_stats ngs_receiving/passing/rushing (all seasons, one file each):
  separation, cushion, YAC over expected, RYOE, 8+ box rate, time to throw.
- pfr_advstats week rec/rush/pass/def: drops, broken tackles, YBC/YAC, pressures.
- ftn_charting_2026: play action, motion, catchable/contested, drops.
- injuries_2026, depth_charts_2026, rosters (has sleeper_id), weekly_rosters.
- espn_data qbr_week_level. contracts, draft_picks, combine (static).
NOT available for 2026: pbp_participation (routes run) ends 2025, so TPRR/YPRR
must be an estimate from snaps x team dropbacks, and labelled as one.
Already in the site: Sleeper, KTC, FantasyPros, CBS, PrizePicks, odds, games.csv.
