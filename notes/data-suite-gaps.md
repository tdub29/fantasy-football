# Our site vs Fantasy Points Data Suite 2.0

Graded 2026-09-24 against the launch article
(https://www.fantasypoints.com/articles/1/fantasy-points-data-suite-2-0-a-powerful-nfl-research-tool,
rendered with local Playwright because plain fetch gets a 402) and the free Data Suite landing page
(https://data.fantasypoints.com/), which adds the Bell Cow report, advanced coverage data, QB
charting, pass-concept and run-concept data, participation and separation data.

Evidence comes from `site/js/app.js`, the data builders, and a Playwright pass over the site served
on 127.0.0.1:8821 (Stats Lab WR, Teams, Defense and Trends tabs, plus a player card). xFP is not
graded here: another agent is rebuilding it. Every stat on the site is full PPR by assumption.

**Score: 10 have, 24 partial, 21 missing, out of 55 capabilities.**

Downloaded public data this relies on:

- `projections/nflverse-cache/`: pbp 2023-2026, ftn_charting 2024-2026, snap_counts, stats_player_week,
  pfr advstats week (pass/rush/rec/def), NGS passing/receiving/rushing, injuries 2024-2026,
  depth charts, rosters, combine, draft_picks, ESPN QBR.
- `historical/`: pbp_participation 2020-2025 (CSV, about 50 MB a season from 2023), ftn 2022-2025,
  pfr_adv season and week, nextgen, injuries 2009-2025, `play_callers.csv`,
  `derived/team_coaches.csv`, `derived/qb_changes.csv`.
- Not published yet: `pbp_participation_2026.parquet` returns 404 from the nflverse release as of
  today. Everything that needs coverage, personnel, formation or `was_pressure` is 2023-2025 only
  until nflverse posts it.

## Capability table

### Table engine

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 1 | Pick any combination of seasons, combined totals | partial | Stats Lab `Season` select loads one of 2024/2025/2026 at a time (`viewStats`, `loadAdvancedSeason`, `advanced-2024.js`, `advanced-2025.js`); no combined aggregation | nflverse pbp + stats_player_week | yes, 2023-2026 |
| 2 | Pick any range of weeks | missing | `advanced.js` is season to date only; the `wk` log carries box-score counts, not rates | pbp week column | yes |
| 3 | Minimum qualifier on any column | partial | Fixed `Min snap%` select (0/20/40/60%) and a hard-coded 15-dropback QB floor in `viewStats` | none needed (client side) | n/a |
| 4 | Search for any filter | partial | `Search player` box only; no filter or column finder | none needed | n/a |
| 5 | Named, saved custom views | partial | Last state persists to localStorage `ff-stats-lab-v1` (sort, groups, season, min snap); one unnamed view per browser | none needed | n/a |
| 6 | Hide and rearrange columns | partial | Whole stat groups toggle (Usage, Efficiency, Air, Red zone, Expected, NGS, PFR, Status); no per-column hide or reorder | none needed | n/a |
| 7 | Pin columns while scrolling | partial | Sticky header via `.data-sticky thead`; the player name cell is `position: static` (checked in Playwright), so it scrolls away on the 40-column WR table | none needed | n/a |
| 8 | Snapshot a column across filter changes | missing | nothing | none needed | n/a |
| 9 | Custom calculated columns | missing | nothing | none needed | n/a |
| 10 | Conditional formatting | partial | Automatic top/bottom fifth green/red tint in `viewStats` ("Percentile tint within the visible pool"); not user-set | none needed | n/a |
| 11 | Export tables | missing | No CSV or copy action in Stats Lab; the only Blob download is the settings JSON (`app.js` near line 6578) | none needed | n/a |
| 12 | Mobile support | have | `site/check-mobile-layout.py`, `appendTable` scroll wrappers, `mobile-controls.test.js`, mobile entries in `.agents/feature-map.json` | n/a | n/a |

### Data points

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 13 | Production and snaps | have | `advanced.js` `games`, `snap_pct` (snap_counts), targets, carries; card game log | n/a | yes |
| 14 | Routes run and route rates | partial | `route_rate_est`, `tprr_est`, `yprr_est`, `fprr_est` are estimates (snaps x team dropback share) in every season, including 2024/2025 | participation `offense_players` on dropbacks gives a better 2023-2025 proxy; charted routes are not public | yes, 2020-2025 |
| 15 | Missed tackles and contact | have | PFR proxy: `bt_per_touch`, `rush_broken_tackles`, `rec_broken_tackles`, `ybc_per_att`, `yac_per_att` | n/a | yes |
| 16 | EPA | have | `epa_per_target`, `epa_per_rush`, `db_epa`, team `epa_play`/`epa_pass`/`epa_rush` | n/a | yes |
| 17 | Rush yards over expected | have | `rush_yards_over_expected_per_att` (NGS) | n/a | yes |
| 18 | Hand-charted separation on every route | partial | NGS `avg_separation` and `avg_cushion`, season average at the catch point for targets only | per-route and non-target separation is not public | n/a |

### Play-level filters

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 20 | Personnel packages | missing | no personnel field anywhere in `site/data` | participation `offense_personnel`, `defense_personnel` | yes, 2020-2025; 2026 not published |
| 21 | Rush concepts | missing | nothing | not public (FTN public file has no concept; pbp `run_gap` is a gap, not a concept) | n/a |
| 22 | Formations | partial | Team `under_center_rate` and QB `qb_under_center_rate` from FTN `qb_location`; no formation filter | participation `offense_formation` 2020-2025; pbp `shotgun` 2026 | yes |
| 23 | Player alignment (slot, wide, inline, backfield) | missing | nothing | not public (the 2025 participation header has no alignment column) | n/a |
| 24 | Coverage defender position | missing | nothing | not public | n/a |
| 25 | Coverage scheme (man/zone, Cover 0-6 shells) | missing | nothing | participation `defense_man_zone_type`, `defense_coverage_type`, about 22k charted dropbacks a season | yes, 2023-2025; 2026 not published |
| 26 | Press coverage | missing | nothing | not public | n/a |
| 27 | Blitzes | partial | Defense-level `pass_blitz_rate` (PFR) in `defense.js` and the Stats Lab Defense tab; no QB or receiver split against the blitz | FTN `n_blitzers` per play | yes, 2022-2026 |
| 28 | Pressure | partial | QB `pressure_rate` (PFR), defense `pass_pressure_rate`; no production-under-pressure split | participation `was_pressure` 2020-2025; 2026 proxy from pbp `qb_hit`/`sack` plus FTN `is_qb_out_of_pocket` | yes |
| 29 | Disguised coverage | missing | nothing | not public | n/a |
| 30 | Pre-snap and at-snap motion | partial | Team `motion_rate` (FTN `is_motion`); no player split; FTN has one motion flag, so pre vs at-snap cannot be told apart | FTN `is_motion` | yes |
| 31 | Target depth and location | partial | `adot`, `air_yds`, `deep_targets`, `ez_targets`; no left/middle/right or depth-band split | pbp `pass_location`, `air_yards` | yes, 2023-2026 |
| 32 | Where the runner was first contacted | partial | PFR `ybc_per_att` season average only | PFR week rush `rushing_yards_before_contact` (per game, not per carry) | yes |
| 33 | Play action | have | Team `play_action_rate`/`pa_epa`, QB `qb_play_action_rate`, defense `pass_pa_rate_faced`/`pass_epa_allowed_pa` | n/a | yes |
| 34 | Stacked boxes | have | NGS `percent_attempts_gte_eight_defenders` (8+ box%) | FTN `n_defense_box` would make it a filter | yes |

### Situational filters

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 35 | Down and distance | partial | Team `early_down_success`, `early_down_pass_rate`; no down/distance filter for players | pbp `down`, `ydstogo` | yes |
| 36 | Red zone and field position | have | `rz_targets`, `rz_target_share`, `ez_targets`, `rz_opp_share`, `gl_carries`, `gl_share`, team `rz_td_rate` | n/a | yes |
| 37 | Score and game script | partial | Team neutral `proe` and `neutral_pass_rate` (win probability 20-80%); no score-state split for players | pbp `score_differential`, `wp` | yes |

### Splits

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 38 | By head coach, playcaller, opposing HC or DC | partial | Staff card on the player card (`contextBlock`, `context.js` `teams.coach` with play caller and tenure); no stat split by coach | `historical/play_callers.csv`, `derived/team_coaches.csv` joined to pbp | yes |
| 39 | By practice participation and injury type | missing | Current status only: `injuryChip`, `players.js` `injury_status`/`injury_body_part`, advanced `report_status` | nflverse injuries `practice_status`, `report_primary_injury` | yes, 2009-2026 |
| 40 | Bio filters (age, experience, height, weight, draft class, round, pick, combine) | partial | All on the page already (`players.js` age/exp, `prospect.js` draft, height, weight, drills, `athl_pct`, shown by `prospectBlock`) but Stats Lab cannot filter on any of them | none needed | yes |

### Visualizations

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 41 | Build scatter, bar and line charts of any stat | missing | Fixed charts only (`careerChartOne` season line, `ktcValueChart`, `sparkline`); Stats Lab renders no svg or canvas (checked) | none needed for the builder | n/a |
| 42 | Route charts comparing up to four players, by coverage or alignment | missing | No player-vs-player compare; the only compare route is Compare Rosters (`app.js` near line 6745) | participation `route` is the targeted receiver's route (about 18.9k a season); routes run on non-targets are not public | yes, 2023-2025 |
| 43 | QB efficiency and throw accuracy by field location | missing | Accuracy exists as season aggregates (`cpoe`, `bad_throw_rate`, `catchable_throw_rate`) with no location split | pbp `pass_location` x `air_yards`, FTN `is_catchable_ball` | yes, 2024-2026 |
| 44 | RB stats by run gap | missing | nothing | pbp `run_location`, `run_gap` | yes, 2023-2026 |

### Tools

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 45 | Team EPA with a player on vs off the field | shipped 2026-09-26 | Stats Lab On/Off tab (`onoff-YYYY.js`): team plays, EPA/play, pass rate, success% on vs off, 2023-2025 play level, 2026 game level | participation `offense_players` 2020-2025; 2026 only at game level (snap_counts) | yes |
| 46 | Teammate on/off (target rate with and without) | shipped 2026-09-26 | On/Off tab teammate table: target share and targets per dropback on vs off, with samples | same as 45 | yes |
| 47 | Game splits by coach, playcaller, snaps played, starting QB | partial | On/Off tab Game splits: by starting QB and playcaller (games, EPA/play, PROE, each player's PPR/G and target share); coach and snaps-played splits not built | pbp passer per game, snap_counts, `derived/qb_changes.csv`, `play_callers.csv` | yes |

### Matchup pages

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 48 | Pregame matchup edges between two teams | shipped 2026-09-26 | `#game/:game_id` pregame: both offenses (PROE, early-down pass%, PA%, motion%, under center%, EPA by unit) and defenses (EPA/DB allowed, pressure%, blitz%, PPR allowed by position, funnel) side by side with ranks, the five biggest edges by percentile gap, implied points, weather, each team's skill players with season usage; `#games` lists the week, and the player card matchup line and every `#sos` cell link in | pbp, schedule | yes |
| 49 | Playcaller tendencies (blitz rate, coverage shells, motion, PA, early-down pass rate, PROE) | partial | Stats Lab Teams tab has PROE, early-down pass%, PA%, motion%, under ctr%, screen%, RPO%, no huddle%; Defense tab has blitz%; coverage shells missing; keyed by team, not playcaller | participation coverage 2023-2025, `play_callers.csv` | yes |
| 50 | Unit efficiency by situation (down/distance, personnel, script, rush concept) | partial | Team `epa_play`, `epa_pass`, `epa_rush`, `success_rate` as season totals only | pbp plus participation | yes |
| 51 | Postgame: drive chart, full play-by-play with EPA and win probability, key plays, receiver matchups | shipped 2026-09-26 | `#game/:game_id` postgame from `games-YYYY.js` + `games-YYYY-wNN.js` (`build_game_pages.py`): drive chart, every play with down, distance, EPA, WP and WPA, top 10 by absolute WPA, each receiver's targets, catches, yards, air yards and EPA; `--self-check` ties drive yards to nflverse team box scores. Receiver vs defender matchups are not public | pbp `drive`, `epa`, `wp`, `wpa`, `desc` | yes |

### Player pages

| # | Capability | Status | Evidence on our site | Public source to fill | Downloaded |
|---|---|---|---|---|---|
| 52 | Usage and efficiency overview | have | Player card Production tab: `advancedBlock` (12-13 stats with position rank) and `usageWeeksBlock` | n/a | yes |
| 53 | Game logs with advanced stats | shipped 2026-09-26 | Card game log Box score / Advanced toggle: per game Tgt, catchable, aDOT, air yds, TPRR (est), YPRR (est), rec EPA, rush EPA; QBs DB, EPA/DB, CPOE, aDOT (`usage-weekly.js`, `cardAdvLog`) | pbp, ftn, snap_counts per week | yes |
| 54 | Complete injury history | shipped 2026-09-26 | Card Context tab Injury history: every listed week 2009-2026 with game status, practice status and injury, plus weeks listed, weeks Out and top body part per season (`injury-history.js`, lazy) | nflverse injuries 2009-2026 | yes |
| 55 | Jump to the player's upcoming matchup | have | Context tab: `matchupLine`, `weatherLine`, `scheduleStrip` | n/a | yes |
| 56 | Team and coaching pages | partial | Teams tab row per team; staff, turnover and tendencies cards live on the player card; no `#team` route | existing data | yes |

## Gap list

Severity: **high** = a core research question we cannot answer today and the data is already on
disk; **medium** = real value, more build; **low** = small value or no public source.

### Cluster A. Stats Lab table engine (rows 3-11, 40): high

Export, pinned name column, per-column minimums and bio filters are the difference between a
reference table and a research tool, and every input is already loaded on the page.
**Fix:** CSV export of the visible rows and columns; sticky first two columns; a minimum on any
column; a filter/column finder; per-column hide and reorder; named saved views in localStorage;
snapshot column; calculated columns from a small safe expression parser (no `eval`); user
conditional formatting; age, experience, draft round, draft year, height, weight and athletic
percentile filters from `players.js` and `prospect.js`. Frontend only.
**Shipped 2026-09-26** (branch `feat-ds-export`, task t-1790319841450): all ten on the QB, RB, WR, TE
and Teams tabs, behind the Stats Lab `Tools` disclosure; rows 3-11 and 40 are now "have". Guarded by
`stats-lab-export` in `.agents/feature-map.json` and `site/js/stats-expr.test.js`.

### Cluster B. Split engine: multi-season, week range, situational filters (rows 1, 2, 27, 30, 35, 37, 50): high

Every Data Suite question is "this stat, in this situation, over these weeks". Ours are fixed
season totals. **Fix:** a new builder emits per player, per week, per situation bucket counting
stats (numerators and denominators, never rates), lazy-loaded per season. The client sums the
buckets the user picks and recomputes rates, so combined seasons and week ranges come free.
Buckets: down, distance band, field zone, score state, play action, motion, shotgun or under
center, blitz (FTN `n_blitzers`), box count. Source pbp plus FTN 2024-2026, all downloaded.
**Shipped 2026-09-26** (branch `feat-ds-splits`, task t-1790319976652): `projections/build_split_cube.py`
writes `site/data/splits-YYYY.js` (counts only, lazy-loaded) and runs in `build_all.py` after the
suite, with `--self-check` proving the unfiltered sums equal advanced.js. The Stats Lab split card
on the QB, RB, WR and TE tabs picks seasons, a week range and the nine situations; rows 1, 2, 27,
30, 35 and 37 are now "have" for players (50 stays partial: team-level situational splits are not
built). Guarded by `stats-lab-splits` and `stats-lab-splits-phone` in `.agents/feature-map.json`.

### Cluster C. Coverage, personnel, formation and pressure splits (rows 14, 20, 22, 25, 28, 49): high

Man vs zone and shell splits are the most cited Data Suite feature, and nflverse participation has
them for 2023-2025 on disk. **Fix:** a new builder over `historical/pbp_participation` plus pbp:
per receiver targets, yards, TD and targets per on-field dropback vs man, vs zone, by shell, and
vs pressure; per QB the same by dropback; per team personnel and formation mix, and man/zone and
shell rates played and faced. A new Stats Lab Coverage tab, with an explicit "not public for 2026
yet" state that lights up when nflverse posts `pbp_participation_2026`.
**Shipped 2026-09-26** (branch `feat-ds-coverage`, task t-1790320021979): `projections/build_coverage_splits.py`
writes `site/data/coverage-YYYY.js` (counts only, lazy-loaded) and runs in `build_all.py` after the split
cube, with `--self-check` reconciling man plus zone targets against the participation file. The Stats Lab
Coverage tab picks position, season and split (man, zone, seven shells, pressured, clean, or a targeted
route); the Teams tab gains the defense's shell mix. 2026 renders a not-published card until nflverse
posts it, then the next build fills it with no code change. The payload's `targetedRoutes` (documented
at the top of the builder) is the input for t-1790417636140. Rows 20, 25 and 28 are now "have" for
2024-2025; 14, 22 and 49 stay partial (Tgt/DB is per dropback, not per route; formation is a team mix;
shells are keyed by team, not playcaller). Guarded by
`stats-lab-coverage` and `stats-lab-coverage-phone` in `.agents/feature-map.json`.
**Route tree shipped 2026-09-26** (branch `feat-ds-routes`, task t-1790417636140): a Stats Lab Routes tab draws the
Data Suite route tree from `targetedRoutes` (now `[tgt, rec, yds, td, epa, air]`) in two independent tiles, player vs
player or season vs season, plus a route-by-route compare against the position average. Metrics are target share,
targets, catch rate, Y/Tgt, air yards/tgt, EPA/tgt and TD; separation, win rate and routes run by route are disabled
options with a reason. `coverage-2023.js` was built once with `--season 2023`, so it covers 2023 to 2025 (build_all's
window stays the current season plus two). Guarded by `stats-lab-routes`, `stats-lab-routes-phone` and
`site/js/route-tree.test.js`.

### Cluster D. Charts and field-location splits (rows 41-44, 31): medium

**Fix:** a chart builder in Stats Lab (scatter any two columns, bar any column top N, weekly line)
with up to four players compared; a QB throw map and a receiver target map by `pass_location` x
depth band (attempts, completion %, YPA, EPA, catchable %); an RB run-gap chart by `run_location`
x `run_gap`. Vanilla SVG like `careerChartOne`, no library, no build step.
**Shipped 2026-09-26** (branch `feat-ds-charts`, task t-1790320041505): a Charts disclosure in Stats Lab
draws scatter (any two columns, average crosshair, trend line, tap readout), bar (any column, top N),
weekly line (1 to 4 players from `usage-weekly.js`), field maps and a 4-player compare on the table's
visible columns, all over the rows the table already filtered. `projections/build_location_splits.py`
writes `site/data/location-YYYY.js` (counts only, lazy-loaded) and runs in `build_all.py` after the
coverage splits, with `--self-check` proving every grid adds back to advanced.js. The player card
Production tab shows the QB throw map, receiver target map or RB run-gap chart. Rows 31 and 41-44 are
now "have" (42 stays partial: compare is player rows, not route trees). Guarded by
`stats-lab-chart-builder`, `stats-lab-chart-builder-phone` and `player-card-location-maps` in
`.agents/feature-map.json` and `site/js/chart-builder.test.js`.

### Cluster E. On/off and game splits (rows 45-47, 38): medium

**Fix:** a new builder: true on/off from participation `offense_players` for 2023-2025 (team
EPA/play, pass rate, each teammate's target share and targets per dropback with the player on and
off), game-level with/without for 2026 from snap_counts, and game splits by starting QB and
playcaller. A new Stats Lab On/Off tab with a player picker.
**Shipped 2026-09-26** (branch `feat-ds-onoff`, task t-1790320053414): `projections/build_onoff.py` writes lazy
`site/data/onoff-YYYY.js` (2023-2026, about 180 KB a played season) and runs in `build_all.py` with `--self-check`, which
recounts on + off == team total for every player straight from participation (snap counts for 2026), puts every game
in exactly one QB and one playcaller group, and ties season PPR to nflverse weekly stats. The Stats Lab On/Off tab picks
a player (100+ offensive snaps) and shows the team split and every teammate's Tgt% and Tgt/DB on vs off, grey italic
under 50 plays or dropbacks; `#stats/OnOff/games` is the Game splits view. Playcaller changes mid-season only where
`play_callers.csv` notes name a firing week. Guarded by `stats-lab-onoff`, `stats-lab-onoff-phone` and
`site/js/onoff.test.js`.

### Cluster F. Game matchup pages (rows 48, 51, 56): medium

**Fix:** a `#game/:game_id` route. Pregame: both teams side by side (PROE, early-down pass rate,
PA, motion, blitz and pressure, EPA by unit, position PPR allowed) with the biggest edges ranked.
Postgame: drive chart, play-by-play with EPA, WP and WPA, top WPA plays, each receiver's target
line. Linked from the player card matchup line and the SOS grid.

### Cluster G. Player card depth: advanced game logs and injury history (rows 39, 53, 54): medium

**Fix:** per-game EPA, aDOT, air yards, route% (est), TPRR (est), YPRR (est) and first-read share
in the card log; an injury history section (season, week, report status, practice status, body
part) from nflverse injuries 2009-2026, lazy-loaded.
**Shipped 2026-09-26** (branch `feat-ds-gamelogs`, task t-1790320164582): `projections/build_weekly_splits.py` adds the
per-game advanced fields to `usage-weekly.js` (a `q` row per game for passers) and its `--self-check` adds every player's
weeks back up to advanced.js; `projections/build_injury_history.py` writes `site/data/injury-history.js` (about 400 KB, 94 KB
gzipped, loaded when a card opens). Both run in `build_all.py` with their self-checks. Rows 53 and 54 are now "have"; 39
stays partial (the history is there, stat splits by practice status are not built). IR weeks are not on injury reports, so
they are not listed. Guarded by `player-card-advanced-log` and `player-card-injury-history` in `.agents/feature-map.json`.

### Not fixable key-free: low, no task

Rush concepts (21), alignment (23), coverage defender position (24), press (26), disguised coverage
(29), per-route and non-target separation (18), routes run by non-targeted receivers (42) and
pre vs at-snap motion (30). None is in any public dataset; they are hand-charted by paid vendors,
and Trevor does not set up keys or accounts for tooling. Revisit only if a free source appears.

## Queued tasks

| Cluster | Task id | Title |
|---|---|---|
| A | t-1790319841450 | FF Stats Lab: export, pinned columns, column minimums, saved views, calc columns, bio filters |
| B | t-1790319976652 | FF Stats Lab: multi-season, week range and situational split engine |
| C | t-1790320021979 | FF Stats Lab: man/zone, coverage shell, personnel and pressure splits (2023-2025 participation) |
| D | t-1790320041505 | FF Stats Lab: chart builder, 4-player compare, QB/WR location maps, RB run-gap chart |
| E | t-1790320053414 | FF Stats Lab: player on/off and game splits by starting QB and playcaller |
| F | t-1790320115453 | FF site: pregame and postgame game matchup pages |
| G | t-1790320164582 | FF player card: advanced game logs and injury history |

All seven are owner `ops`, project `fantasy-football`. Tasks A to E all edit `viewStats` in
`site/js/app.js`, so running them one after another is safer than running them in parallel.
