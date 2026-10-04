# QB lane preregistration, 2026-10-04

Written and committed BEFORE any candidate below was scored. The commit that adds this file is the
timestamp. Nothing here is edited after the first score; a change gets a dated amendment below and
labels the affected result exploratory.

## What the diagnosis found (step 1, `diagnosis.json`, from the S3 replay rows only)

The lane replay (`projections/lanes/qb/qb_replay.py parity`) reproduces the logged S3 QB numbers to
the digit (826 served rows, 31 events, 466 players, 20 hitters).

1. **The first-eligible gap is real-sized but marginal on its own.** S3 expects 12.2 first-eligible
   hits and 18 happen; if S3 were calibrated, 18 or more happens 5.6% of the time.
2. **Training mixes leavers with stayers; serving never does.** Stage-2 training snapshots: 87 rows of
   players who did not play the next season, 0 hits; 288 rows of players who did, 23 hits (8.0%).
   Every served first-eligible row is a stayer. Served ratio by college year at the snapshot: stage 2
   (first eligible) 0.68, stage 3 1.17, stage 4 2.94 (3 events against 8.8 expected).
3. **Era.** First-eligible ratio 1.00 on the 2012-2016 replays (6 events) and 0.52 on 2017-2021 (12
   events). QB exit classes 2017-2020 hit 13 of 240; 2013-2016 hit 4 of 235. The 4-year embargo means
   the 2021 replay trains on classes through 2017 only and never sees the 2018-2020 classes.
4. **Zero completed starts.** Training snapshots require a completed start; served rows do not (the
   stage path checks only a qualifying season). 110 served rows have zero completed starts: 5 events
   against 2.6 expected (ratio 0.51); first-eligible 4 against 1.7.
5. **Who is missed.** The lowest-forecast first-eligible hitters are QBs whose production at the
   sophomore snapshot was thin or who had not started yet (Bortles 0.007, Minshew, Love, Kyler Murray,
   Trubisky, Prescott, Allen, Daniel Jones, Goff 0.08); half of the 18 declared right after the served
   season.
6. **Power.** A model that is calibrated by construction with S3's sharpness (outcomes drawn from its
   own forecasts, one draw per player) passes all six gates in 24% of simulations; each single gate
   holds in 61-75%. The 90% range of the first-eligible ratio under perfect calibration is 0.68-1.75.
   With 31 events, a correct model fails these gates most of the time, so a failure is weak evidence
   against a model and a single pass is weak evidence for one. Every candidate below reports this
   power figure for its own forecasts.

## Fixed for every candidate

- **Replay:** the addendum 8 serving backtest as `run_stage` builds it (copied row-for-row in
  `qb_replay.py`, parity-checked): seasons 2012-2021, served = next-class QBs of population B playing
  in that season, scored by `stage_score(which="next")` from completed seasons, refit per season.
- **Gates (unchanged):** mean predicted / observed 0.8-1.25 and calibration slope 0.75-1.25 on all
  served rows, on first-eligible rows, and on D1 (each season's top 60 by the candidate's own
  forecast). Replacement test: lower served log loss than stars plus college year (logistic, C = 0.1,
  fit on the same replay's closed-window snapshots, as `run_stage`) in at least 90% of season
  resamples (`bpm.class_bootstrap`, seed 7, 4,000).
- **Reported for each gate:** value, margin to the nearer bound, and the share of 1,000 season
  resamples (seed 7) in which it holds; plus the power figure above.
- **Fragile:** a pass is labelled fragile if any gate clears its bound by less than 0.03 (the earlier
  QB near misses missed by 0.02-0.03; RB S1's D1 slope by 0.01) or any gate holds in under 68% of
  season resamples (the level recorded as a known risk for RB S4n4).
- **No re-rolls:** no seed, C grid, N, feature or threshold change after a score. A failing
  candidate is reported as failing.

## Candidates

### Q1. Live passing line (QB analog of S4n4)

- **Hypothesis.** Hits separate in the season being played (the junior-year jump, and whether he is
  the starter now). S4 fed QBs receiving columns (yards per team pass attempt as a receiver, receiving
  share), which are near zero for passers, so the served QB model never saw his live passing.
- **Weakness addressed.** Diagnosis 4 and 5: under-forecast hitters who had thin or no completed-season
  starts; the stage path cannot see that he is starting now.
- **Source.** sportsdataverse `espn_cfb_player_box` (passing and rushing categories) and
  `espn_cfb_team_box`, already in the store (same release host and licence as S4); method copied from
  `prospect_live.live_features`.
- **Definition.** For season t, each team's first 4 games (season type then week, `pl.first_games`;
  teams that played fewer than 4 games have no live line). From those games:
  `live_games` = games he has a passing or rushing line in; `live_att_share` = his pass attempts /
  team pass attempts (team box `completionAttempts`); `live_aypta` = (passing yards + 20 x passing TD
  minus 45 x interceptions) / max(team pass attempts, 26.5 x 4); `live_rush_pg` = rushing yards / 4;
  `has_live` = 1 (0 when he has no line, filled as the training rows are). Model: S3's columns plus
  these five, C by `NestedLR` (inner leave-one-class-out, grid 0.03-3), trained on every closed-window
  snapshot (as S4n4, not served-shaped rows), each snapshot k joined to season k + 1's live line.
  Served: the replay season's live line. N = 4 only.

### Q2. Censoring-aware training: a discrete-time hazard over NFL years 1-4

- **Hypothesis.** The 4-year window throws away the most recent classes: a class contributes nothing
  until all four seasons are played, so the 2017-2021 replays train on classes 4+ years stale while
  the hit rate moved. Every completed NFL season is final the moment it ends, so a class's first
  years can train the model before its fourth is played.
- **Weakness addressed.** Diagnosis 3 (era, embargo) and the small event count.
- **Source.** Discrete-time survival (logistic hazard, person-period data; Singer and Willett 1993,
  J. Educational Statistics 18:155-195; Allison 1982, Sociological Methodology 13:61-98). Method only.
- **Definition.** Per population B QB, his year-j outcome (j = 1..4, NFL season = his outcome year + j - 1)
  is a hit when that season ranks him top 12 among players listed at his label position with 8+
  games, exactly as `attach_outcomes` ranks (asserted: the max over j equals `hit` on every mature
  row). Each snapshot k (same snapshot rule as S3, any window state) contributes one row per year j with NFL season
  outcome_year + j - 1 <= replay season - 1 (complete by the time the replayed season is played) and
  no hit before year j; label = hit in year j. Features: S3's columns plus indicators for j = 2, 3, 4.
  C by `NestedLR` on these rows, grouped by draft class. Served forecast = 1 - prod over j = 1..4 of
  (1 - hazard_j). This changes only which training information is used; the target, served rows,
  scoring path and gates are unchanged. Deviation stated plainly: training uses player-years whose
  season is final, not only players whose whole 4-year window has closed.

### Q3. Nested recalibration to the served shape

- **Hypothesis.** S3's ranking is fine (slopes 0.84-0.96) but its level is wrong by served shape:
  trained on every snapshot, it under-forecasts stayers at the first-eligible stage and over-forecasts
  older stayers (diagnosis 2). A calibration-in-the-large correction per served shape, estimated only
  from training data, fixes the level without dropping training rows (S2/S5 dropped rows and their
  first-eligible slopes went to 1.27-1.61).
- **Weakness addressed.** Diagnosis 2.
- **Source.** Recalibration-in-the-large with the slope held at 1 (Cox 1958, Biometrika 45:562-565;
  Steyerberg, Clinical Prediction Models, 2nd ed., ch. 15), fit nested as the calibration-check skill
  requires (training folds only).
- **Definition.** Per replay season: fit S3 as served (NestedLR, chosen C). Inner out-of-fold forecasts
  for the replay's closed-window snapshots by leave-one-class-out at that chosen C. Recalibration rows
  = served-shaped training snapshots (college year 2+ at k, plays season k + 1; the S2 rule). Fit
  logit(p_recal) = logit(p_oof) + a + b x [college year at k = 2] by maximum likelihood (offset
  logistic, no penalty). Served forecast = S3's forecast shifted by a + b x [first eligible]. When the
  recalibration rows hold fewer than 10 hits, no shift (S3 as is) for that replay, stated per season.

## Considered and not registered

- **Height (traits that drive QB draft capital).** ESPN roster height is one later vintage per
  athlete (constant across seasons for 99.9% of players first rostered before 2018; 2.4% vary at
  all), and for players who reached the NFL ESPN's profile can carry the NFL listing: a post-draft
  revision correlated with being drafted. No as-of college or recruiting height is in the store
  (`cfb_recruit` has no height). Deferred; closure route: an archived as-of roster or recruiting height.
- **QBASE v2 / Lewin feature swaps** (pass TD per completion, rush yards per attempt, years started
  with a one-year-wonder dock). Same production family as B11's columns; nothing in the diagnosis
  points at a ranking failure (S3's slopes are in range), so a swap is a re-roll here. Not run.
- **League-level vacancy (age of the current top-12 NFL QBs).** Plausible for a rank-based target, but
  it takes about 11 distinct class-level values in training, so it is a fitted time trend. Not run.
- **Serving no number at zero completed starts** (the addendum 8 QB rule applied to stage models).
  Already visible in the diagnosis rows (first-eligible ratio would be 0.75), so it cannot be
  preregistered as a fresh test; reported as a diagnostic only.
