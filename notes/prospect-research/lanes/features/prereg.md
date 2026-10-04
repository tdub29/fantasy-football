# Features lane: preregistration (2026-10-04)

Written and committed before any candidate below was scored. The commit that adds this file is the
timestamp. Coverage, joins and leakage were measured first, reading no outcome
(`coverage.json`, `coverage-rows.json`); nothing about either feature's association with the hit was
computed before this commit. Definitions, gates, seed and resample count do not change after scoring.

## Families measured and their disposition

| Family | Source and licence | Finding | Disposition |
|---|---|---|---|
| Receiving shape: air-yards share, aDOT, YAC per reception | sportsdataverse-data `espn_cfb_adv_receiving` (per game, 2004-2026); repo MIT, README CC BY 4.0; ESPN data under ESPN terms | `AirYds`, `aDOT`, `CompAirYds`, `YAC` are null in every row 2004-2022 and 2024, 0.2% in 2023, 37% in 2025, 90% in 2026. Every replay trains on seasons up to 2020, so the defining columns do not exist for any training row. The populated columns (Tar, Rec, Yds, EPA, SR) come from the same ESPN play-by-play as the store's `cfb_receiving`: season EPA sums correlate 0.97-0.99 with the store's `TEPA`. The file has no player id; a name + team join reaches 62-89% of its player-seasons. WPA is the only other new column, an EPA variant (A5 tested receiving EPA and was rejected) | **Fails coverage; dropped before preregistration.** Revisit when 2025+ seasons are mature training rows (not before the 2028 class closes) |
| Team talent / competition for opportunity | sportsdataverse-data `cfb_team_talent` (2005-2026; 247-style composite from signing classes S-3..S, computed by sdv-py `cfb_roster_talent`; same host and licence) plus the store's `cfb_recruit` (247 classes) and the 2002-2003 recruit files from the same release | Every player-season of 2005+ maps to a talent row (99.0-99.6%); no nulls. `n_recruits` equals the store's recruit count in the 4-class window exactly from 2007 on (correlation 1.0): the file is a function of signing classes the store already holds, signed before the season it describes. On the replay rows: `tal_pct` non-null 98-100% for 2005+ snapshots and served rows, `pos_bc` 100%; both missing by construction for 2004 snapshots. Spearman of `tal_pct` with `power` 0.73, `sos_career` 0.72, `stars` 0.61, `team_off_final` 0.50-0.52; with production (`ryptpa_best`, `dom_best`) under 0.06. `tal_pct` vs `pos_bc` 0.76-0.80 | **Preregistered as F1 and F2 below** |

## The measured weakness addressed

The shipped next-class models separate who gets drafted far better than they rank players who are
drafted: in `experiments/serving-backtest.json`, drafted-only AUC is 0.731 for WR S6n4 (stars plus
college year 0.628) and 0.669 for RB S4n4 (stars plus college year 0.638), against 0.905 and 0.894 on
all served rows. Every production feature in the model is a share of his team's output
(yards per team pass attempt, dominator, receiving share) or a raw rate, and none sees whom he beat out
for that share. The brief's feature family "team/QB effects and competition for opportunities" has
only been tested through team performance ratings (`team_off_final`, `sos_career`, A11/B7/B10), never
through roster talent or same-position competition.

## Hypotheses

- **F1, team talent.** A production share earned on a high-talent roster was earned against stronger
  teammates, and high-talent programs are where NFL teams spend draft capital. Given the shipped
  features, the hit chance rises with his team's talent. Expected sign: positive.
- **F2, same-position competition.** The same mechanism, position-specific: the more blue-chip recruits
  at his position his team signed around him, the stronger the signal in whatever share he earned.
  Expected sign: positive.

## Exact definitions (code: `projections/lanes/features/lane_feats.py`)

Both attach to his most recent completed college season on file, k, and the team he played most for
that season (store `ps.team_id`). Training snapshot rows: k is the snapshot season. Served rows in the
replay of season s: k is his latest season on file at or before s - 1 (the served profile's cutoff).

- `tal_pct` (F1): percentile of his team's `talent_composite` in `cfb_team_talent_{k}` among the
  season-k teams that have an FBS player-season in the store (`fbs_class` not null), computed as the
  share of those teams at or below his team's value. Missing when k < 2005 or his team is not in the file.
- `pos_bc` (F2): count of recruits with 4 or 5 stars whose 247 position is in his position group
  (WR: `WR`; RB: `RB`, `APB`) that his team signed in classes k-3 through k, excluding any record whose
  normalized name (`bpp.norm_name`) equals his. Missing when k < 2005.

Missing values are median-imputed inside every fit by the shipped pipeline (`bpm.make_lr`).

## Candidates (four cells)

| ID | Position | Model |
|---|---|---|
| F1 | WR | shipped S6n4 (addendum 15: S4n4 columns, C by inner leave-one-class-out, recalibrated on served-shaped rows) plus `tal_pct` |
| F1 | RB | shipped S4n4 (addenda 12-13: S3 columns plus the first 4 team games, C by inner leave-one-class-out) plus `tal_pct` |
| F2 | WR | shipped S6n4 plus `pos_bc` |
| F2 | RB | shipped S4n4 plus `pos_bc` |

Nothing else changes: same training rows, same live features, same C grid, same recalibration, same
serving rule (first 4 team games always; no number below 4 games or without a stat line).

## Availability at serving time (week 4 of the season in progress)

Both features use only season k, the last completed season. `cfb_team_talent` for season k is built
from signing classes k-3..k, all signed by February of year k, before season k is played; the
producer documents a class as immutable once signed. The 247 position and stars are the signing-day
labels. So both values exist before season k + 1 starts and are servable at week 4. Neither uses the
season in progress. Leakage review items, not contamination: the talent file is regenerated by current
code (method vintage, not data vintage), and its rank-decay exponent (0.75) was chosen upstream against
team wins across all seasons. That choice saw team wins, never NFL outcomes; it is disclosed, not
treated as clean by assumption.

## Gates (fixed; charter v2 addendum 8, display rule D1, addendum 15 replacement rule)

Scored by `projections/lanes/features/replay.py`, a lane copy of the addendum 8 replay (seasons
2012-2021, refit per replay on rows whose outcome windows had closed) that refits the shipped model and
the candidate on identical training rows and serves both to identical rows.

1. All served rows: mean predicted / observed 0.8-1.25 and calibration slope 0.75-1.25.
2. First-eligible rows (college year 3 at the replayed season): same two bands.
3. Display rule D1, each season's top 60 by the candidate's own forecast: same two bands.
4. Replacement: lower served log loss than the shipped model (S6n4 at WR, S4n4 at RB) in at least 95%
   of 200,000 season resamples (`bpm.class_bootstrap(..., n=200_000)`, seed 7, one run).
5. Gain concentration: the mean per-row log-loss gain over the shipped model stays positive after
   dropping the 3 and the 5 rows with the largest gain. Reported, not gating: the same after dropping
   10, the bootstrap support after each drop, and each leave-one-season-out gain.

A cell passes only if 1-5 all hold; it then goes to the coordinator for an independent review. A pass
whose drop-5 support is under 90% or with any negative leave-one-season-out gain is reported as
fragile. No gate, definition, seed or resample count is changed after scoring, and a marginal result is
not re-run. Multiplicity: four cells in this lane, on top of ten earlier served families; a pass is
read with that count in mind.

## Replay sanity check

Before any candidate number is read as evidence, the lane replay's shipped model must reproduce the
current `experiments/serving-backtest.json` entries (`S6n4 WR`: all 1.11/1.13, first-eligible
1.10/1.22, D1 1.01/1.07, n 3,374, 60 events; `S4n4 RB`: all 1.07/0.93, first-eligible 1.00/0.87,
D1 1.06/0.78, n 2,215, 86 events) to two decimals. A mismatch is reported and blocks any claim.
