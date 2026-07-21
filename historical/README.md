# Historical Fantasy Football Dataset

Bulk historical data sourced from [nflverse](https://github.com/nflverse/nflverse-data),
[dynastyprocess](https://github.com/dynastyprocess/data), and Sleeper, plus derived
fantasy points and player cards. Built to power predictive models and player
historical stat cards for 3 dynasty leagues for 2026 (Sleeper user `tdub1329`).

Total size: ~1.2 GB | 716k weekly fantasy rows | 11k player career cards.

## Layout

| Folder | Source | Coverage | Notes |
|---|---|---|---|
| `player_stats/` | `stats_player` release | 1999-2025 | offense weekly + reg + post |
| `idp_stats/` | `player_stats` release | 1999-2024 | def weekly + season; 2025 derived from PBP |
| `kicking_stats/` | `player_stats` release | 1999-2024 | weekly + season |
| `team_stats/` | `stats_team` release | 1999-2025 | weekly + reg team totals |
| `rosters/` | `rosters` release | 1999-2025 | one row per (player, season) |
| `rosters_weekly/` | `weekly_rosters` release | 2002-2025 | active rosters per week |
| `snap_counts/` | `snap_counts` release | 2013-2025 | offensive + defensive + ST snaps |
| `injuries/` | `injuries` release | 2009-2025 | weekly injury reports |
| `depth_charts/` | `depth_charts` release | 2001-2025 | weekly depth charts |
| `nextgen/` | `nextgen_stats` release | 2016-2025 | passing/rushing/receiving NextGen |
| `pfr_adv/` | `pfr_advstats` release | 2018-2025 (season-only) | PFR advanced stats |
| `pbp/` | `pbp` release | 2020-2025 | full play-by-play, gzipped |
| `pbp_participation/` | `pbp_participation` release | 2020-2025 | personnel + participation |
| `ftn/` | `ftn_charting` release | 2022-2025 | FTN advanced charting |
| `combine/` | `combine` release | history | NFL combine measurables |
| `draft/` | `draft_picks` release | history | every NFL draft pick |
| `players/` | `players` release + dynastyprocess | current | id crosswalk inputs |
| `values/` | dynastyprocess | current | KTC + DP dynasty values history |
| `schedules/` | `nfldata` + `teams` | full history | game results, teams metadata |
| `espn/` | `espn_data` release | history | QBR season + week |
| `contracts/` | `contracts` release | history | OTC historical contracts |
| `trades/` | `trades` release | history | NFL trades |
| `officials/` | `officials` release | history | game officials |
| **`derived/`** | computed locally | — | **fantasy points + cards (see below)** |

## Derived files (`derived/`)

| File | Description |
|---|---|
| `weekly_fantasy.csv` | One row per (player, season, week, season_type). Includes raw stats and fantasy points in 5 scoring variants: `fp_std`, `fp_half`, `fp_ppr`, `fp_4pt_ppr` (matches the user's offense leagues), `fp_idp_yuh` (matches the yuH IDP league: solo=1, asst=0.5, sack=3, INT=5, FF=3, FR=3, PD=3, def TD=6, safety=2). |
| `season_summary.csv` | Per (player, season) regular-season totals + per-game averages. |
| `career_summary.csv` | Per player career totals, seasons played, peak values. |
| `player_card.json` | Single keyed dict {`player_id` → {career, peak, by_season}} optimized for UI. |
| `team_season_totals.csv` | Per (team, season) — total targets, carries, air yards. |
| `player_team_share.csv` | Per (player, season, team) — target_share, rush_share, air_yards_share, rz_tgt_share, rz_rush_share. |
| `team_turnover.csv` | Per (team, season) — vacated target/rush/AY share, leaver_count, joiner_count, top 5 leavers and joiners (JSON cells). |
| `player_new_team.csv` | Per (player, season) — new_team flag, prev_team, APY, contract terms, prior shares, current shares, **expected_target_share / expected_rush_share** baselines from position × draft-tier (rookies) or position × APY bucket (vets). |
| `apy_expected_share.json` | The realized-median lookup table behind `expected_target_share` and `expected_rush_share`. |
| `team_coaches.csv` | Per (team, season) — HC, OC, play caller, scheme, plus boolean flags `is_new_hc`, `is_new_oc`, `is_new_play_caller`, `hc_first_season`, `oc_first_season`, `play_caller_first_season`, and `oc_tenure_yr` / `pc_tenure_yr` counters. Built from the curated [`play_callers.csv`](play_callers.csv) source. |
| `game_team_context.csv` | Per (game, team) — implied team total (from Vegas total ± half spread), spread for team, weather (temp, wind, roof, surface), home/away. |
| `team_season_market.csv` | Per (team, season) — `avg_implied_total`, `plays_per_game`, `pass_rate`, `neutral_pass_rate`, `proe` (pass-rate over expected, situation-adjusted), W/L record. |
| `def_vs_pos.csv` + `def_vs_pos_ranks.csv` | Per (def_team, season, opp_pos) — fp_ppr_per_g allowed plus rank 1-32 and tier (stingy / tough / soft / smash). |
| `qb_changes.csv` | Per (team, season) — primary QB by attempts, % of team attempts, `is_new_starting_qb`, `prev_qb`, `qb_continuity_streak`. |
| `player_efficiency.csv` | Per (player, season, team) — `snap_share`, `adot`, `ybc_per_rec`, `yac_per_rec`, `drop_pct`, `brk_tkl`, `passer_rating_when_targeted`, `tgt_per_g_when_active`. |
| `career_health.csv` | Per player — career games played vs potential (17/season since 2021, 16 before), `availability_pct`. |
| `strength_of_schedule.csv` | Per (team, target_season, opp_pos) — average opponent prior-year DvP and delta from league average. |

### Opportunity-share / new-team modeling notes

- **Rookies** are bucketed by draft slot (`d_top16`, `d_round1`, `d_round2`,
  `d_round3`, `d_late`) because APY for rookies is uniformly low and doesn't
  separate Bijan from a UDFA.
- **Vets** are bucketed by APY (`rookie/min`, `low`, `mid`, `high`, `elite`).
- Realized target/rush share medians per (position, bucket) become the
  `expected_*` baseline. The UI surfaces realized - expected as a delta so it's
  easy to see who's been outperforming the contract/draft expectation.

### Play-caller source

[`play_callers.csv`](play_callers.csv) is hand-curated for 2020-2026 because no
public CSV reliably tracks who actually calls plays (often the HC, not the OC).
Each row: season, team, head_coach, offensive_coordinator, play_caller,
play_caller_role (HC/OC), scheme, notes. Mid-season changes use `Name1/Name2`
in the relevant column; the builder takes the first listed name as the
season-of-record. Refresh: edit the CSV → run `python build_coaches.py`.

## ID crosswalk (`id_crosswalk.json`)

Joins Sleeper player_id ↔ nflverse `gsis_id` ↔ dynastyprocess (mfl, espn, pfr,
fantasypros, KTC, rotowire, sportradar). 7,651 of 12,127 Sleeper players have
gsis_id matches (the rest are mostly practice-squad / never-played players).

```
{
  "by_sleeper": { sleeper_id: { gsis_id, name, position, team, espn_id, pfr_id,
                                 fantasypros_id, ktc_id, rotowire_id, ... } },
  "by_gsis":    { gsis_id:    { sleeper_id, ... } }
}
```

## Scripts

| Script | What it does |
|---|---|
| `fetch_nflverse.py` | Downloads ~400 files from nflverse releases. Idempotent; safe to re-run. |
| `derive_idp_2025.py` | Builds `idp_stats/week_2025_derived.csv` from PBP (nflverse hasn't pushed 2025 IDP to releases yet). |
| `build_crosswalk.py` | Produces `id_crosswalk.json`. |
| `build_fantasy_points.py` | Produces fantasy-point derived files (`weekly_fantasy.csv`, `season_summary.csv`, `career_summary.csv`, `player_card.json`). |
| `build_opportunity.py` | Produces `team_season_totals.csv`, `player_team_share.csv`, `team_turnover.csv`, `player_new_team.csv`, `apy_expected_share.json`. |
| `build_coaches.py` | Reads `play_callers.csv` and produces `derived/team_coaches.csv` with change/first-time flags. |
| `build_market_context.py` | Produces `game_team_context.csv` and `team_season_market.csv` (implied totals + PROE + pace). |
| `build_def_vs_pos.py` | Produces `def_vs_pos.csv` and `def_vs_pos_ranks.csv`. |
| `build_player_features.py` | Produces `qb_changes.csv`, `player_efficiency.csv`, `career_health.csv`, `strength_of_schedule.csv`. |
| `validate.py` | Asserts every expected file is present + prints summary stats. |

## Refreshing

```bash
cd historical
python fetch_nflverse.py        # ~5 min cold; near-instant warm
python derive_idp_2025.py       # 30 sec (PBP only)
python build_crosswalk.py       # <5 sec
python build_fantasy_points.py  # ~30 sec
python build_opportunity.py     # ~60 sec (also scans PBP for red-zone)
python build_market_context.py  # ~90 sec (scans PBP for pace + PROE)
python build_def_vs_pos.py      # ~20 sec
python build_player_features.py # ~30 sec (snap + PFR adv joins)
python build_coaches.py         # <1 sec (curated source)
python validate.py              # confirm coverage

# Then rebuild the site-side JS bundles:
cd ../site/data
python build_history.py
python build_context.py
```

## Known gaps

- **2025 IDP from native release**: nflverse hasn't pushed defense weekly stats
  for 2025 yet (release `player_stats` last updated 2025-05-07). Workaround:
  `derive_idp_2025.py` extracts from PBP. Re-run when nflverse updates.
- **Kicking 2025**: also tied to the same lagging release.
- **Pre-2018 PFR advanced stats**: weekly file not published; season-level
  PFR advanced is available 2018+.
- **NextGen pre-2016**: NextGen stats start 2016 by NFL design.

## What this enables

**Predictive models**
- 27 seasons of offense weekly stats (player_id, opponent, snap%, target share, air yards, EPA, CPOE, NextGen)
- 26 seasons of IDP weekly stats + 2025 derived
- Schedule + opponent context for each game
- Snap counts, depth chart history, injury history for usage modelling
- Combine measurables + draft capital for rookie projection
- Historical dynasty values (KTC + DP) for market-aware features

**Player stat cards** (one lookup per player_id)
- `player_card.json` returns career totals, peak season, year-by-year breakdown
- ID crosswalk lets a Sleeper-driven UI pull historical stats by passing the
  `sleeper_id → gsis_id` mapping into `player_card[gsis_id]`.
