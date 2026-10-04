# TE lane preregistration, 2026-10-04

Committed before any candidate below was scored on served outcomes. The git commit that adds this
file and `projections/lanes/te/te_candidates.py` is the timestamp. Nothing here changes after results;
a change would be a new file and would label these results exploratory.

## What already failed at TE (not re-run)

Post-draft A1-A14 (draft capital alone stays); B8 TE (pulled by the serving backtest); served S1
(first-eligible ratio 0.77), S3, S4n4, S4n8 and S5n4 (the coordinator's run: all rows 1.39/0.83,
first-eligible 0.94/1.02, D1 top 60 1.32/0.73).

## Diagnosis, measured before proposing (lane replay, `projections/lanes/te/`)

The lane replay (`te_replay.py check`) reproduces the published S3 and S4n4 TE numbers to four
decimals, on the same 897 served player-seasons (38 events, 26 unique hitters, 549 players).

1. **The over-forecast is on returners, not first-eligible players.** S4n4 by completed-season college
   year: year 2 (first-eligible) ratio 0.87 (231 rows, 19 events); year 3 ratio 1.56 (344 rows, 14
   events); year 4+ ratio 2.92 (322 rows, 5 events). S3 is the same shape (0.83, 1.39, 2.92). On the
   D1 top 60, first-eligible rows run 0.83 and returner rows 1.91 (442 of the 600 listed rows).
2. **It is a model-form problem visible on training rows alone.** Refit per replay, S4n4 is
   miscalibrated by college year in sample on its own served-shaped training rows (year 2: 0.73-0.85;
   year 3: 1.17-1.37; year 4+: 1.05-1.23, replays 2013-2021). The inner-tuned C is the grid floor 0.03
   in 9 of 10 replays, which shrinks the standardized stage coefficient to between +0.02 and -0.10, while
   the data's stage effect is a step: on served-shaped training rows the hit rate is about 7.7% at year
   2, 4.3% at year 3 and 3.5% at year 4+. A ridge-shrunk straight line in stage cannot hold that step,
   so returners, who also carry larger best-season and career numbers, are scored too high.
3. **The first replays have almost no TE history.** The 2012 replay trains on classes 2008-2009 (74
   players, 4 hitters), picks C = 3 and serves 0.998 and 0.999 to two non-hits (Tracy Moore, Chris
   Gragg); the 2012-2014 replays run 2.5x to 5.2x high. Any TE-only model has to survive these replays.
4. **Exit stage tells the story.** TE exits after college year 3 hit 9.8% (133), after year 4 4.2% (381),
   after year 5+ 1.8% (504). Served year 4+ rows hit 1.55%.
5. **Power: the gates are close to a coin flip for a correct TE model.** Treating a model's own served
   forecasts as the truth (one uniform draw per player shared by all his rows, 2,000 simulations on the
   same 897 rows, D1 top 60 fixed by the forecast): a truth with S4n4's ranking and its own 53 expected
   events passes all six numeric gates 44% of the time (first-eligible gate alone 50%); shifted to the
   observed 38 events, 34% (first-eligible 41%); with half-strength logits and 38 events, 15%. The 90%
   range of the first-eligible slope under a correct model is 0.64 to 1.56 against a 0.75-1.25 band.
   So a failure at TE is weak evidence against a model, and a pass is weak evidence for one; this is
   reported, and no gate changes because of it.

## Hypotheses (three, each a different mechanism; none is a re-roll of S1/S3/S4/S5)

All three: next draft class, completed seasons plus his team's first 4 games of the season in progress
(the S4n4 live columns and serving rule of addendum 13, replayed exactly as `run_stage` replays S4n4),
trained per replayed season only on rows whose outcome window had closed, on served-shaped rows only
(completed college year 2+, played the next season: the S2/S5 restriction that fixed first-eligible
calibration). Production columns: the shipped TE stage set (`prospect_stage.stage_cols("TE")`) without
`stage` and `age_k`, plus the five live columns, median imputed and standardized inside the training
rows. `age_k` is dropped because it is `stage` plus a constant (correlation 0.91, identical up to the
clip at 1 and 6).

| ID | Hypothesis | Weakness addressed (measured above) | Method reused (licence) |
|---|---|---|---|
| T1 | The college-year step belongs outside the ridge penalty: unpenalized intercepts for college year 3 and 4+ (year 2 the reference), production columns ridge-penalized with C from {0.03, 0.1, 0.3, 1, 3} by inner leave-one-class-out on the training rows | items 1, 2: in-sample year 3/4+ over-forecast from a shrunk linear stage term | v1's unpenalized capital term (`UNPEN`, in repo); structural terms left unpenalized in ridge regression, Hastie, Tibshirani and Friedman, Elements of Statistical Learning, 2nd ed., section 3.4.1 (method only) |
| T2 | TE borrows strength from WR: one logistic on TE and WR served-shaped rows with shared ridge slopes, TE slope deviations penalized k times harder, unpenalized position intercept and position-specific year-3 and year-4+ intercepts; (C, k) from {0.03, 0.1, 0.3, 1, 3} x {1, 4, 16} by inner leave-one-class-out scored on TE rows only | items 1-3: few TE events make TE-only slopes unstable (2012 C = 3, p near 1) and over-confident at the top of the list | partial pooling: Gelman and Hill, Data Analysis Using Regression and Multilevel/Hierarchical Models (2007), ch. 12-13; Efron and Morris, JASA 1975; shared-plus-specific feature copies: Daume III, Frustratingly Easy Domain Adaptation, ACL 2007 (methods only, no code or data copied) |
| T3 | T2 plus age-adjusted production: breakout age at the TE dominator line (15%, `BREAKOUT["TE"]`, as of the completed season; unbroken players carry final age + 1, as `career_features` defines it for training and serving alike) and the broke-out flag | item 4: a returner's production is older production; breakout age prices production by the age it came at | breakout age (public prospect research: PlayerProfiler and RotoViz definitions, already implemented in repo); Mulholland and Jensen, Predicting the Draft and Career Success of Tight Ends in the NFL, JQAS 10(4), 2014: college production predicts TE career success while size is over-weighted by the draft (paywalled; method-level reading only) |

Exact code: `projections/lanes/te/te_candidates.py` (`SPECS`, `Design`, `tune`, `make_fit`), committed
with this file. The k scaling divides the deviation columns by sqrt(k); unpenalized columns are
standardized then multiplied by `UNPEN` = 10 (penalty 1/100 of a production column). Tuning fallback
when no class can be held out with 3+ training events: C = 0.1, k = 4 (T2/T3) or 1 (T1).

## Gates (fixed; charter v2 addenda 8, 10, 14)

Lane copy of the addendum 8 serving replay (`te_replay.replay`, seasons 2012-2021, next class,
`bpm.stage_score(which="next")`), on the same 897 served rows:

1. All served rows: mean predicted / observed 0.8-1.25 AND calibration slope 0.75-1.25.
2. First-eligible rows (college year 3 at the replayed season): same two bands.
3. Display rule D1, each replayed season's top 60 by the candidate's own forecast: same two bands.
4. Replacement (nothing serves TE): lower served log loss than stars plus college year (logistic,
   C = 0.1, on `stars` and `stage`, fit per replay on every TE training snapshot, exactly the S3/S4n4
   baseline in `run_stage`) in at least 90% of 4,000 season resamples (`bpm.class_bootstrap`, seed 7).
5. Independent review by a fresh agent (the coordinator sends it).

**Fragility, declared now.** For each of the six numeric gate metrics and for all six jointly: the share
of 4,000 resamples of the 10 replayed seasons (with replacement, seed 7, each season's own top 60 kept)
in which the metric is inside its band. A pass with any single-gate support under 80% is reported as
fragile. Also reported, not gating: the 2017-2021 replays, ratio by college year, unique players and
hitters, drafted-only AUC, and log loss against S4n4 on the same rows.

**Selection and multiplicity.** Three candidates are scored once each. If more than one passes, all
are reported and the lane recommends the lowest served log loss among them, disclosed as a selection
among passing candidates. No grid, feature, row filter, college-year cut or seed changes after results;
a failure is reported as a failure. Given item 5, a pass that clears a band by less than 0.02 is called
marginal on top of the support fractions.
