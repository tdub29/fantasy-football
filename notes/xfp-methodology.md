# xFP methodology: which expected fantasy points the site ships, and why

2026-09-24. Research on how Fantasy Points, ffopportunity and others build xFP lives in
[xfp-sources.md](xfp-sources.md). This file is the build decision and the backtest behind it.

## Verdict

**ffopportunity ships as xFP/G and FPOE/G.** It beat our lookup table on the 2024 and 2025
backtest, but only just. Pooled over RB, WR and TE, its next-week correlation is 0.007 higher
(95% player-clustered bootstrap +0.001 to +0.013) and its next-week error is 0.035 PPR points
per game lower. It wins at RB and WR and ties at TE, where ours is 0.002 ahead on next week and
0.014 ahead on rest of season, both well inside the noise. Its xFP/G is also slightly more stable
week to week (split-half r 0.803 against 0.797, and 0.731 against 0.705 at WR).

The lookup stays in the builder as the fallback. If the ffopportunity release cannot be reached
and nothing is cached, the build uses the lookup, writes `xfpSource: "lookup"` into the data, and
the column tooltip and Stats Lab footnote say so. Only one xFP is ever shown.

## The two candidates

| | Ours (lookup) | ffopportunity |
|---|---|---|
| What prices a target | league-average PPR of targets in the same air-yard band x yardline band | XGBoost on nflfastR play-by-play; inputs in `R/ep_preprocess.R` include air yards, yardline, down, distance, air yards relative to the sticks and the end zone, pass location, shotgun, no-huddle, QB hit, score differential, Vegas win probability and implied total, time left, roof and weather |
| What prices a carry | league-average PPR of carries in the same yardline band x down | XGBoost; inputs include yardline, down, distance, run location and gap, shotgun, scramble flag, score differential, Vegas win probability, time left |
| Fit on | last season plus the scored season | ffverse's trained model, as published in the `latest-data` release |
| Fumbles | inside the average | not in expected points; actual points charge -2 per lost fumble, so FPOE absorbs them |
| Source | `xfp_tables()` / `apply_xfp()` | `github.com/ffverse/ffopportunity/releases/tag/latest-data`, `ep_weekly_{season}.parquet` |

**Scoring check.** ffopportunity is already full PPR. Regressing `rec_fantasy_points_exp` on its
components gives 1.000 per expected catch, 0.100 per expected yard and 6.0 per expected TD
(2025 file). Actual points match 1.0 per catch, 0.1 per yard, 6 per TD, 2 per two-point
conversion and -2 per lost fumble exactly, and agree with nflverse `fantasy_points_ppr` to a mean
of -0.03 per player-week. The site uses `rec_fantasy_points_exp + rush_fantasy_points_exp`
(passing is left out, as ours leaves it out). The builder self-check fails if the published file
ever stops paying 1.0 per expected catch.

## Method

- Seasons 2024 and 2025, regular season. Player-weeks are the rows in nflverse
  `stats_player_week` for RB, WR and TE; a week with a row is a game.
- The truth for every candidate is nflverse `fantasy_points_ppr`, so neither xFP grades itself.
- At each cutoff week w, each predictor is a season-to-date per-game rate through week w:
  ours xFP/G, ffopportunity xFP/G, actual PPR/G (the naive baseline), and a fixed 50/50 blend of
  ffopportunity xFP/G and PPR/G (nothing fitted).
- Next week: the actual PPR in week w+1 if he played; cutoffs 3 to 17.
  Rest of season: actual PPR per game over weeks w+1 to 18, at least 3 games; cutoffs 3 to 14.
- Filter: at least 3 games to date and at least 4 targets plus carries per game to date.
- Pearson r and MAE (PPR points). Rows from all cutoffs are pooled, so one player appears many
  times; the confidence intervals resample players (400 draws), not rows.
- Split-half: per player-season, odd-week rate against even-week rate, at least 4 games in each
  half and 4 opportunities per game.
- Reproduce: `python notes/xfp_backtest.py` (prints every table below; aggregates only).

## Predictive test (pooled cutoffs; r = Pearson, MAE in PPR points)

| Target | Pos | Season | n | r ours | r ffo | r PPR/G | r blend | MAE ours | MAE ffo | MAE PPR/G | MAE blend |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Next week | RB | 2024 | 846 | 0.552 | 0.559 | 0.580 | 0.579 | 5.360 | 5.321 | 5.271 | 5.262 |
| Next week | RB | 2025 | 814 | 0.517 | 0.520 | 0.498 | 0.514 | 5.585 | 5.554 | 5.719 | 5.595 |
| Next week | RB | both | 1660 | 0.535 | 0.539 | 0.539 | 0.546 | 5.470 | 5.435 | 5.490 | 5.425 |
| Next week | WR | 2024 | 934 | 0.359 | 0.377 | 0.383 | 0.398 | 6.044 | 5.981 | 5.963 | 5.911 |
| Next week | WR | 2025 | 904 | 0.382 | 0.389 | 0.404 | 0.410 | 5.951 | 5.911 | 5.859 | 5.824 |
| Next week | WR | both | 1838 | 0.370 | 0.381 | 0.394 | 0.403 | 5.998 | 5.947 | 5.911 | 5.868 |
| Next week | TE | 2024 | 293 | 0.277 | 0.283 | 0.275 | 0.295 | 5.383 | 5.346 | 5.407 | 5.329 |
| Next week | TE | 2025 | 342 | 0.301 | 0.292 | 0.282 | 0.295 | 5.253 | 5.310 | 5.390 | 5.312 |
| Next week | TE | both | 635 | 0.288 | 0.286 | 0.275 | 0.292 | 5.313 | 5.327 | 5.398 | 5.320 |
| Rest of season /G | RB | 2024 | 784 | 0.704 | 0.715 | 0.758 | 0.749 | 3.514 | 3.457 | 3.222 | 3.227 |
| Rest of season /G | RB | 2025 | 710 | 0.732 | 0.730 | 0.700 | 0.723 | 3.161 | 3.166 | 3.436 | 3.238 |
| Rest of season /G | RB | both | 1494 | 0.717 | 0.722 | 0.732 | 0.737 | 3.347 | 3.319 | 3.324 | 3.232 |
| Rest of season /G | WR | 2024 | 867 | 0.519 | 0.546 | 0.606 | 0.606 | 3.657 | 3.574 | 3.390 | 3.384 |
| Rest of season /G | WR | 2025 | 847 | 0.610 | 0.611 | 0.601 | 0.628 | 3.615 | 3.581 | 3.633 | 3.480 |
| Rest of season /G | WR | both | 1714 | 0.552 | 0.564 | 0.599 | 0.608 | 3.637 | 3.577 | 3.510 | 3.432 |
| Rest of season /G | TE | 2024 | 266 | 0.371 | 0.392 | 0.372 | 0.405 | 3.173 | 3.120 | 3.299 | 3.116 |
| Rest of season /G | TE | 2025 | 315 | 0.535 | 0.496 | 0.490 | 0.510 | 2.789 | 2.873 | 3.012 | 2.887 |
| Rest of season /G | TE | both | 581 | 0.459 | 0.445 | 0.429 | 0.457 | 2.965 | 2.986 | 3.144 | 2.992 |

## Next week by cutoff window, both seasons

| Pos | Cutoff weeks | n | r ours | r ffo | r PPR/G | r blend |
|---|---|---|---|---|---|---|
| RB | 3-6 | 403 | 0.532 | 0.538 | 0.493 | 0.525 |
| RB | 7-17 | 1257 | 0.535 | 0.538 | 0.553 | 0.552 |
| WR | 3-6 | 485 | 0.336 | 0.355 | 0.357 | 0.378 |
| WR | 7-17 | 1353 | 0.382 | 0.391 | 0.410 | 0.413 |
| TE | 3-6 | 157 | 0.248 | 0.257 | 0.205 | 0.242 |
| TE | 7-17 | 478 | 0.302 | 0.297 | 0.299 | 0.310 |

## r(ffo) - r(ours), both seasons, 95% player-clustered bootstrap

| Target | Pos | delta r | 95% CI | delta MAE (ffo - ours) |
|---|---|---|---|---|
| Next week | RB | +0.004 | -0.001 to +0.011 | -0.035 |
| Next week | WR | +0.011 | -0.001 to +0.022 | -0.052 |
| Next week | TE | -0.002 | -0.020 to +0.017 | +0.014 |
| Next week | all | +0.007 | +0.001 to +0.013 | -0.035 |
| Rest of season /G | RB | +0.005 | -0.008 to +0.018 | -0.028 |
| Rest of season /G | WR | +0.011 | -0.012 to +0.034 | -0.059 |
| Rest of season /G | TE | -0.014 | -0.057 to +0.032 | +0.022 |
| Rest of season /G | all | +0.007 | -0.005 to +0.018 | -0.034 |

## Split-half stability (odd vs even weeks, r between halves)

| Pos | n | xFP/G ours | xFP/G ffo | PPR/G | FPOE/G ours | FPOE/G ffo |
|---|---|---|---|---|---|---|
| RB | 146 | 0.853 | 0.856 | 0.813 | 0.065 | -0.020 |
| WR | 152 | 0.705 | 0.731 | 0.615 | 0.149 | 0.057 |
| TE | 58 | 0.647 | 0.640 | 0.379 | 0.210 | 0.188 |
| all | 356 | 0.797 | 0.803 | 0.711 | 0.138 | 0.056 |

## Calibration: mean per player-week (all RB/WR/TE rows)

- RB: actual 7.66, ours 7.68, ffo 7.63
- WR: actual 7.06, ours 7.17, ffo 7.04
- TE: actual 5.52, ours 5.26, ffo 5.32

## What the numbers say

1. **ffopportunity over ours, by a hair.** The pooled next-week edge clears zero; the
   rest-of-season edge (+0.007, CI -0.005 to +0.018) does not. The ranking agrees with the MAE
   and with split-half stability, which is why it ships. It is not a big upgrade: the two agree at
   r 0.993 to 0.997 on the shipped season files.
2. **xFP earns its place early and at TE.** Through weeks 3 to 6, xFP/G predicts next week better
   than PPR/G at RB (0.538 against 0.493) and TE (0.257 against 0.205) and ties at WR. By weeks 7
   to 17 actual PPR/G has caught up and leads at RB and WR. Over the whole sample, WR PPR/G beats
   either xFP alone (0.394 next week, 0.599 rest of season).
3. **The blend is the best single predictor.** Half xFP/G plus half PPR/G is best or within 0.01 of
   best in 17 of the 18 rows of the first table, so xFP carries information PPR/G does not. That is a use for the
   number, not something the site computes.
4. **xFP/G is the stable half.** Split-half r is 0.80 for xFP/G against 0.71 for PPR/G, and
   0.64 against 0.38 at TE: opportunity repeats, production on it mostly does not.
5. **FPOE/G is close to noise.** Split-half r is 0.06 (ffopportunity) and 0.14 (ours). Read it
   as what happened, not as a skill rating. Ours leaves more repeatable signal in FPOE, likely because
   its xFP ignores game state and distance, so part of what it calls "over expected" is situation.

## Caveats

- Ours is fit on the scored season plus the one before it, so it has seen the plays it prices.
  With 49 target cells and 28 carry cells that is small, and it can only flatter ours.
- ffopportunity publishes a few days after games. For the current season the builder divides by
  games in the weeks ffopportunity has published, so a trailing week never deflates xFP/G.
- Both seasons were scored with the model in today's `latest-data` release. A new ffopportunity
  model could move these numbers; rerun the backtest after one.

## What shipped

- `projections/build_nflverse_suite.py`: `ffo_weekly()` / `ffo_points()` read ffopportunity's
  weekly file (cached like every nflverse file, 6h for the current season), `xfp_pg` and
  `fpoe_pg` come from it, the lookup is the fallback, `xfpSource` names which one ran, and the
  self-check covers the new logic and the PPR guard.
- `site/data/advanced.js`, `advanced-2024.js`, `advanced-2025.js`: rebuilt with ffopportunity xFP.
- `site/js/app.js`: the Stats Lab footnote names the source that ran.
