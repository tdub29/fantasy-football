# Pre-draft capital forecaster: specification (capital-sources lane, 2026-10-07)

Spec only. Nothing here has been fitted, and no draft position is invented. It defines how a forecast of draft
capital from timestamp-safe college inputs must be built and judged if one is ever built. Expected result,
stated before any fit: **the forecaster ranks worse than any real pre-draft board**, because a board sees
film, medicals, interviews and team intel that college stat lines do not.

## 1. Where it is allowed to be used

Boards now exist for every mature class (WalterFootball 2012-2024, CBS 2014-2016, ESPN 2018-2026 behind a
rights gate, NFLMDD 2020-2026 from the coordinator). The forecaster is a gap filler only:

- players on no board (the long tail that becomes most UDFAs and some day-3 picks);
- current college players one or two seasons out (model_row `college_current`, classes 2027-2028), before any
  deep board is published;
- a cross-fitted capital input for a downstream model's training rows where the board for that class is
  missing at a position.

Where a board exists the board is used. A blend of board and forecaster is adopted only if section 8 shows it
beats the board alone. It never feeds a "talent" score; the target-experiment found college profile adds
nothing measurable over slot (H2 rejected), and this forecaster predicts the slot, not the outcome.

## 2. Target and output

- Label: actual draft round of class D from `nfl_draft_pick`, joined through `player_link.cfb_player_id`
  (CFBD athlete ids; `nfl_draft_pick.cfb_player_id` is a different id space and joins nothing). Eight ordered
  buckets: R1, R2, R3, R4, R5, R6, R7, UDFA.
- Output per player: the 8-bucket probability vector. Within a drafted bucket, picks follow the empirical
  within-round pick distribution of the training classes at that position.
- Expected capital FX0 = sum over buckets of P(bucket) times the mean of the frozen C0 curve over that
  bucket's pick distribution. C0 is the frozen pick-to-VOR3 curve, refitted for a scored class Y on classes
  <= Y-3 only, as in the target-experiment prereg. UDFA value: C0 at the deepest pick (a ceiling, flagged),
  with 0 as the sensitivity.
- Reported: the vector and FX0. Never a single projected pick or "projected round" string.

## 3. Population (fixed now, before any fit)

- Class D candidates: QB, RB, WR, TE athletes whose last roster season in `cfb_roster` is D-1. Leaving after
  D-1 is known before the draft (declared early entrant or exhausted eligibility), so this is not
  look-ahead. Players who return for another season appear in season D and are correctly excluded.
- Usage screen, no outcome input: combine invitee, or career rushes plus targets >= 50 through D-1, or career
  pass attempts >= 100 through D-1 (`cfb_usage`, `cfb_passing`). Report per class the share of drafted
  players the screen keeps; a drafted player outside it is scored with climatology and counted as a miss.
- Label noise to handle, not hide: drafted picks with no `player_link` row (drafted minus linked at
  QB/RB/WR/TE, 2012-2023: 5, 7, 10, 9, 6, 7, 7, 1, 3, 3, 5, 3) would be read as UDFA. Before fitting, match
  them to candidates by normalized name plus school and mark them drafted; report every unmatched one.
- Classes: roster rows start with season 2014, so D >= 2015. Class 2021 has thin 2020 rosters (1,349 leavers
  against 2,600 to 2,900 in other classes) and no in-person combine; it is scored and shown, with a
  sensitivity that drops it.

## 4. Inputs

Allowed, all dated at or before the end of season D-1 (bowl games included) or the combine in D:

- Production through D-1 from `cfb_usage`, `cfb_passing`, `cfb_rushing`, `cfb_receiving`: final season and
  career totals and shares (target share, touch share, first-down share, EPA per play, success rate), games.
- Team context: `cfb_rating` (adjusted net EPA, FEI), conference, team points per game from `cfb_team_game`.
- Recruiting: stars and grade from `cfb_recruit`, linked by one deterministic name, team and class rule.
- Age proxy: D minus recruit class season. Early-declare flag: fewer than four seasons since recruit class.
- Size and athleticism: combine height, weight, forty, vertical, broad jump, cone, shuttle; one missing
  indicator per test; roster height and weight only for non-invitees.
- Combine invite flag (invites are public in February). Undefined for 2021, set missing there.

Excluded: every `nfl_player`, `nfl_roster`, `nfl_player_season` column; `nfl_combine.draft_team`,
`draft_round`, `draft_ovr`; `nfl_draft_pick.age`; every model_row outcome field; any board (boards are
baselines, never inputs); `cfb_roster.date_of_birth` and `age`.

Measured leak (`projections/lanes/parallel-2026-10-06/capital-sources/forecaster_leak_check.py`): among
QB/RB/WR/TE leavers, `cfb_roster` DOB is present for 49 to 100 % of drafted players (D = 2015-2024) against
3.0 to 6.7 % of undrafted, and `age` is identical. The field is backfilled for players who reach the NFL, so
its presence alone encodes the label. Height and weight are present for 98 to 100 % of both groups; whether
their values were overwritten after the draft cannot be tested here, which is why combine measures come first.

Rules that apply to every input:

- Rebuild every feature for the whole candidate pool with one code path. Do not reuse `model_feature`; it was
  computed only for drafted-linked and current-college rows, so feature availability there depends on the label.
- Before the fit, run the presence comparison for every input and for the recruit link itself on the
  training classes. Any input whose presence differs by more than 5 points between drafted and undrafted is
  dropped, or replaced by a version computed identically for all players.
- Production features are standardized within position and season.

## 5. Model

- Cumulative-logit (proportional-odds) ordinal regression with L2 penalty, position-specific thresholds,
  position interactions only on production features, 20 to 30 features in total.
- Penalty grid fixed now: 0.01, 0.03, 0.1, 0.3, 1, 3, 10, chosen by inner leave-one-class-out ranked
  probability score inside the training window.
- Size check: about 75 to 83 drafted QB/RB/WR/TE per class, so a 4-class training window holds about 300
  drafted rows. No second model family in the same cycle.

## 6. Cross-fitting and evaluation windows

- Slot labels mature on draft day, so the forecaster for test class Y trains on classes 2015 to Y-1; the
  VOR3 embargo of Y-3 applies only to the C0 curve used to turn buckets into FX0.
- Honest evaluation: expanding window, at least 4 training classes, test classes 2019 to 2026 (8).
- Downstream inputs: FX0 for training rows comes from leave-one-class-out fits, so no row is scored by a model
  that saw its own label.
- Horizon 2 (players two seasons out): a separate model on inputs truncated at D-2, evaluated the same way.
  The horizon-1 model is never applied to horizon-2 inputs.

## 7. Metrics

- Primary: ranked probability score over the 8 buckets, mean per class, then pooled across classes.
- Secondary: log loss; reliability tables (10 bins) for P(drafted) and P(R1 to R3); Spearman of expected pick
  against actual pick among drafted; AUC drafted against UDFA.
- Uncertainty: paired differences resampled by class (2000 resamples, seed 7, as in the target-experiment);
  every metric also shown per class.

## 8. Baselines and acceptance (fixed now)

- Climatology: per-position bucket frequencies of the training classes.
- WalterFootball: projected round range spread uniformly over its rounds, "FA" to UDFA, Top-N inside R1;
  off-board candidates get the empirical off-board bucket mix of the training classes. Run with and without
  rows flagged `year_text`.
- NFLMDD (2021 on): board rank to bucket by ordinal calibration on earlier NFLMDD years only.
- ESPN board 2018 on, only if Trevor clears the rights gate. K0 (FantasyPros): Spearman among drafted only,
  because it ranks fantasy value, not capital.

Acceptance:

- Usable as gap filler only if its RPS beats climatology with share > 0 >= 0.95 across class resamples and the
  P(drafted) reliability slope lies in [0.8, 1.2].
- Used where a board exists only if a board-plus-forecaster blend, weights fitted on training classes, beats
  the board alone with share > 0 >= 0.95 and an RPS gain of at least 0.005. Anything else: the board stands.
- Reported either way, including a negative result.

## 9. Freeze and log

Before any fit, commit the bucket edges, the C0 curve version, the feature list, the screen, the model
family and grid, the metrics, the seed, the sha256 of this file and of the DB copy used. Every failed or
abandoned variant goes in a ledger with its numbers. No feature added after a result is seen.

## 10. Rights

Inputs: sportsdataverse-data (LICENSE file MIT, README badge CC BY 4.0, ESPN source data under ESPN terms)
and nflverse (CC-BY-4.0, combine "courtesy of PFR"). Boards used as baselines stay in the private research
cache; only aggregate metrics are written to the repo.
