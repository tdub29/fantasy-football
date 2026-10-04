# Young lane preregistration: later classes (college years 1-2)

Written 2026-10-04 BEFORE any later-class replay or candidate below was scored. The git commit that
adds this file is the timestamp. Nothing here is edited after a result; a change gets a dated
amendment section below and the affected results are labelled exploratory.

What was seen before writing it: the descriptive counts in `power.json` (rows, events, base rates,
no model fit, `projections/lanes/young/young_power.py`) and the already-public B14 stage-1 numbers in
`experiments/review-d-2026-10-04.md`. No model has been fit or served on later-class rows in this lane.

Data: lane copy of the store (`PROSPECT_DB`, sha256 prefix 6b8562dcf8e26469), read without ingest
(`young_data.connect`), so every run sees the same frozen data. Worktree HEAD at writing: 88dc3a5.

## 1. The later-class serving replay (exact analogue of addendum 8)

- Positions QB, RB, WR, TE, each separately (H3 pools RB/WR/TE, below). Model group = college position
  `cpos` as in population B (his last roster listing; a known approximation for young players, who
  switch positions more; disclosed, not repaired).
- Replay season S = the college season in progress when the number is served; completed seasons are
  those <= S - 1. College year y = S - hs_class + 1. First eligible class cls = max(S + 1, hs_class + 3);
  a later-class player is one with cls > S + 1, i.e. y in {1, 2}.
- Served candidates in season S: every player of the position with a college stat line in S, y in
  {1, 2}, drawn from the unfiltered exit population (`young_data.broad_exits`: population B without
  its qualifying-season filter, so no row is kept because of something he did later). A QB must have
  a start counting season S (the board's own filter in `score_college`). Each candidate adds its own
  serving requirement below.
- Label: his eventual hit (charter v2 target). Seasons are limited so that a player who stays through
  a fifth college year still has a closed window: year-2 rows S = 2012 to LAST_CLASS - 4, year-1 rows
  S = 2012 to LAST_CLASS - 5 (RB/WR: 2012-2019 and 2012-2018; QB/TE: 2012-2018 and 2012-2017).
  Rows whose label is still open (sixth-year players) are dropped and counted.
- Training per replay season S: only rows whose outcome window had closed (outcome year <= S - window)
  and whose own season is <= S - 1. Two training row types:
  - **year-2 type**: the B14 stage-1 snapshot (`prospect_stage.snapshots`, his completed freshman
    season, at least one qualifying season so far, QB at least one start) of a player who had a stat
    line in the next season (`plays_next`), i.e. shaped like a served sophomore.
  - **year-1 type**: a player of the position with a stat line in his first college season
    (season = hs_class), from the unfiltered exit population.
- Year-2 serving uses the production path: `bpm.predraft_profile(subj, ps, age0, S)` then
  `bpm.stage_score(..., season=S, which="later")`, which numbers a player only with a qualifying
  completed season (so no year-1 player can get a number this way). Year-1 serving has no production
  path; the lane scores it with the same model object on a profile built only from data available in
  season S and describes the code as a patch.

## 2. Display rule D1L (the later list)

The board lists the later classes' top `top_n // 2` = 30 per position (`score_college`, sorted by
Talent today). **D1L**: per replayed season and position, the 30 later-class players with the highest
own forecast among those the candidate numbers; pooled over seasons. Gated like D1.

## 3. Reference replays of the current code (not candidates)

- **R1** (S1 later): B14 columns, fixed C = 0.1, fit on every closed-window snapshot row (all stages),
  served by `stage_score(which="later")`. What `STAGE = {pos}` serves today where no NEXT_MODEL exists.
- **R3** (S3 later): as R1 with C by inner leave-one-class-out (`NestedLR`).

## 4. Baseline

Stars plus college year: logistic, C = 0.1, columns [stars, college year], fit per replay season on
the union of year-1-type and year-2-type closed-window training rows, scored on each candidate's served
rows. Missing stars are median-imputed (as every model here).

## 5. Hypotheses (three, no others will be scored in this lane run)

| ID | Hypothesis | Measured weakness it addresses | Source reused |
|---|---|---|---|
| YL1 | A stage-specific fit on served-shaped sophomore rows serves year 2 calibrated | review D: B14's pooled all-stage fit runs about 20% low on served stage-1 players because it trains on freshmen who never play again (power.json: 13-18% of stage-1 rows, hit rate 0-3% vs 4-8% for returners), and its slope at stage 1 is 0.67 (over-confident: coefficients learned mostly at stage 3+) | charter addenda 9/14 (S2/S5 served-shaped rows), NestedLR (B5) |
| YL2 | His team's first 4 games of the season in progress add the signal completed seasons lack: it numbers freshmen at all (recruiting plus early role) and lets a sophomore breakout show | no year-1 player can be numbered from completed seasons; S4n4's live line beat S3 for RB next class mostly where a new season's jump matters | addendum 12 live features (`prospect_live`); public freshman market-share breakout method (Campus2Canton, true-freshman receiving-yards share >= 25%/30%; method only, no data or prose copied) via `live_rec_share` and `live_yptpa` |
| YL3 | Partial pooling across RB/WR/TE stabilizes slopes where events are scarce | power.json: year-2 served events WR 17, TE 7 (QB 5); per-position slopes from that few events over-fit | partial pooling (A7 idea), within-position standardization |

Exact definitions:

- **YL1**: year-2 rows only. Columns `prospect_stage.stage_cols(pos)` minus `stage` and `age_k` (both
  constant at stage 1). Fit `NestedLR` (C from {0.03, 0.1, 0.3, 1, 3} by inner leave-one-class-out on
  the replay's training rows) on year-2-type rows. Served by `stage_score(which="later")`. Year-1
  players get no number.
- **YL2**: year 2: YL1 columns plus `prospect_live.LIVE` from his team's first 4 games of season S
  (`has_live` 0 when his team reached 4 games but he missed them); training rows get the same line
  from season k + 1. Year 1: columns [stars, power, live_games, live_yptpa, live_rec_share,
  live_scrim_pg, has_live], power = his team's conference group in S; training rows use their own
  freshman season's line. Weight is left out at year 1: roster weight is his last listing (no
  historical vintage), and three or four years ahead it encodes how he developed. Separate `NestedLR`
  per year. Served only when his team has played at least 4 games in S (as addendum 13); never a
  fallback to YL1.
- **YL3**: YL2's rows, live rule and served rows, RB/WR/TE only. Per year type, one `NestedLR` on the
  stacked RB, WR and TE training rows: the columns common to the three positions (year 2: TE's stage
  columns minus stage and age_k, plus LIVE; year 1: YL2's year-1 columns), each median-filled and
  z-scored within position on the training rows, plus RB and TE indicators. Served per position. QB
  gets no number.

## 6. Gates (fixed; README and charter bands, never loosened)

Per position and candidate, on served later-class rows:

| Gate | Rows | Pass |
|---|---|---|
| G1 | all served rows | mean predicted / observed 0.8-1.25 AND calibration slope 0.75-1.25 |
| G2 | year-1 rows | same; "unserved" when the candidate numbers no year-1 player |
| G3 | year-2 rows | same |
| G4 | D1L top 30 per season, pooled | same |
| G5 | all served rows | lower log loss than stars plus college year in at least 90% of 4,000 season resamples (`bpm.class_bootstrap` grouped by replay season) |

- A gate cell with fewer than 15 events is **not evaluable** and does not pass.
- Slope = logistic recalibration of the outcome on the forecast's logit (as `prospect_serving_backtest.calib`).
- Support: for G1-G4, the share of 2,000 season resamples (seed 7) in which both ratio and slope sit in
  their bands; also the leave-one-season-out range. A pass with support under 90% on any gate is
  reported as **fragile**, with the number.
- A candidate passes when G1, G3, G4, G5 pass and G2 passes or is unserved. Passing does not ship:
  the coordinator sends it to an independent review.
- If more than one candidate passes at a position, the preference is the one that numbers more of the
  later list (year 1 and 2 over year 2 only), then the lower served log loss on the year-2 rows both
  serve; disclosed as a selection among passing candidates.
- Reported, not gating: AUC and drafted-only AUC against the baseline, the 2016+ replays alone, unique
  players and hitters, rows dropped for open labels, R1/R3 on the same gates.
- No re-roll: a failing candidate is not tweaked and re-scored in this lane run.

## Command

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-young/prospect.sqlite"
python projections/lanes/young/young_replay.py        # writes notes/prospect-research/lanes/young/results.json
```
