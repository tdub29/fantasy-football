# TE lane results, 2026-10-04

**Verdict: no TE candidate passes. T1, T2 and T3 fail the all-rows and D1 top-60 ratio gates; TE stays
without a served pre-draft number.** Preregistration: `prereg.md` (commit e417dce, before scoring).
Numbers: `results.json`. Code: `projections/lanes/te/`. Everything reproduces from the commands in
`checkpoint.md`; the lane replay reproduces the published S3 and S4n4 TE numbers to four decimals.

## Candidates, on the 897 served TE player-seasons (38 events, 26 hitters, 549 players)

| ID | All ratio / slope | First-eligible ratio / slope | D1 top 60 ratio / slope | Served log loss vs stars+year (season resamples) | vs S4n4 | Verdict |
|---|---|---|---|---|---|---|
| T1 | 1.35 / 0.86 | 1.10 / 1.04 | 1.29 / 0.78 | 0.1689 to 0.1408 (97%) | 0.1442 to 0.1408 (63%) | fail |
| T2 | 1.38 / 0.94 | 1.17 / 0.96 | 1.32 / 0.87 | 0.1689 to 0.1358 (99%) | 0.1442 to 0.1358 (73%) | fail |
| T3 | 1.41 / 0.90 | 1.17 / 0.92 | 1.35 / 0.84 | 0.1689 to 0.1391 (99%) | 0.1442 to 0.1391 (65%) | fail |

Bands: ratio 0.8-1.25, slope 0.75-1.25. Each fails exactly two of the six numeric gates (all-rows
ratio, top-60 ratio) and passes the replacement test against stars plus college year.

Season-resampling support (4,000 resamples of the 10 replayed seasons, seed 7; share inside each band):

| ID | All ratio | All slope | FE ratio | FE slope | Top-60 ratio | Top-60 slope | All six |
|---|---|---|---|---|---|---|---|
| T1 | 31% | 47% | 54% | 66% | 40% | 38% | 7% |
| T2 | 28% | 48% | 49% | 69% | 37% | 41% | 8% |
| T3 | 25% | 54% | 48% | 71% | 33% | 46% | 7% |

Ratio by completed-season college year (2 = first-eligible; events in brackets): T1 1.10 (19), 1.36
(14), 2.32 (5); T2 1.17, 1.37, 2.20; T3 1.17, 1.42, 2.29. Drafted-only AUC 0.549 (stars+year) to
0.759 / 0.747 / 0.735.

What each hypothesis did:
- **T1 (unpenalized college-year step)** fixed what it targeted on the slope side: top-60 slope 0.65
  (S4n4) to 0.78, first-eligible in band (1.10 / 1.04). The returner over-forecast fell (year 4+: 2.92
  to 2.32) but did not go away.
- **T2 (pooling with WR)** gave the best TE served log loss of any model scored so far (0.1358 against
  S4n4 0.1442, S5n4 0.1439, S3 0.1582), all three slopes in band (0.94, 0.96, 0.87) and the best
  top-60 slope (0.87). The inner tuning used TE deviations penalized 1x to 16x. The level is still high.
- **T3 (T2 plus breakout age)** was worse than T2 on log loss (0.1391) and on every ratio; breakout age
  adds nothing here.

## Why the level fails: three replays with almost no TE history

Post hoc (after scoring, not gating), splitting the replays:

| Model | 2012-2014 replays: all / FE / top 60 ratio (events) | 2015-2021 replays: all ratio / slope, FE ratio, top-60 ratio / slope (events) |
|---|---|---|
| S3 | 3.87 / 6.84 / 4.33 (6, 1, 5) | 0.83 / 1.48, 0.50, 0.78 / 1.45 (32) |
| S4n4 | 3.19 / 5.19 / 3.63 | 1.05 / 1.18, 0.63, 1.00 / 1.10 |
| T1 | 2.89 / 6.43 / 3.21 | 1.07 / 1.31, 0.80, 0.99 / 1.22 |
| T2 | 3.02 / 7.89 / 3.37 | 1.07 / 1.40, 0.80, 1.00 / 1.32 |
| T3 | 3.16 / 7.87 / 3.56 | 1.08 / 1.35, 0.80, 1.01 / 1.27 |

- The 2012 replay trains on effectively one TE class (2008: 69 served-shaped rows from 4 hitters),
  2013 on two, 2014 on three. Those early classes hit more often (2008 served-shaped rows 10%, later
  eras 3% to 6%), and the 2013 and 2014 replays had one hit event each (Kelvin Benjamin, an FSU receiver
  that the pre-2014 position inference files at TE by weight, drafted as a WR; and Tyler Higbee). Every model, TE-only or pooled, forecasts those three replays 2.9x to 3.9x high; they hold 6
  of the 38 events and decide both failing ratio gates.
- Inner tuning is degenerate there: in 2012 the only class that leave-one-class-out can score has no
  hit, so the least-penalized C (3, the grid ceiling) wins with inner log loss near 0. This affects
  `NestedLR` in S3/S4/S5 the same way and produced the 0.998 forecasts for Tracy Moore and Chris Gragg.
- On 2015-2021 the totals are calibrated (1.07-1.08 on 32 events) but slopes run 1.22-1.40 and the
  first-eligible ratio sits at 0.80. So no subset of the replays makes these candidates clean either,
  and dropping seasons after the fact is not allowed in any case.

## Power: a correct TE model fails these gates more often than it passes

From `te_diagnose.py` and `te_mechanism.py`: take a model's own served forecasts as the truth, draw one
uniform per player shared by all his rows (his outcome is one event), and re-score the same 897 rows
2,000 times with the fixed gates.

| Truth | All six pass | All rows | First-eligible | Top 60 |
|---|---|---|---|---|
| S4n4 ranking, its own 53 expected events | 44% | 84% | 50% | 80% |
| S4n4 ranking, shifted to the observed 38 events | 34% | 76% | 41% | 71% |
| Half-strength logits, 38 events | 15% | 58% | 26% | 52% |

With the observed 38 events, the 90% range of the first-eligible slope under a correct model is about
0.64-1.56 (band 0.75-1.25).
These numbers assume players are independent; TE hits also cluster by draft class (served events per
replay: 4, 1, 1, 6, 9, 3, 3, 3, 5, 3; the 2016-2018 draft classes, the 2017 class above all, supply the
15 events of the 2015-2016 replays), so the
real pass rate for a correct model is lower still. With 38 events and 26 hitters, a TE failure is weak
evidence against a model and a pass would be weak evidence for one.

## Step 1 diagnosis (on the already-failed S3 and S4n4 replays)

- The over-forecast is on returners: S4n4 ratio 0.87 at college year 2 (first-eligible), 1.56 at year
  3, 2.92 at year 4+. On the D1 top 60, 442 of 600 listed rows are returners, at ratio 1.91.
- In sample on its own served-shaped training rows S4n4 is already miscalibrated by college year (year
  2: 0.73-0.85, year 3: 1.17-1.37, year 4+: 1.05-1.23): inner tuning picks C = 0.03 in 9 of 10 replays,
  which shrinks the stage term to between +0.02 and -0.10 standardized, while the data's stage effect is
  a step (about 7.7%, 4.3%, 3.5% hit rate at years 2, 3, 4+). T1-T3 fix that in sample by construction.
- Exit stage: TEs leaving after year 3 hit 9.8% (133), after year 4 4.2% (381), after year 5+ 1.8% (504).
- Feature means between training and served rows at the same college year show no consistent shift
  (best YPTPA at year 2: 0.58 served, 0.54-0.56 training; year 3: 0.59-0.62 against 0.59-0.63), so the
  level gap is not a covariate shift; it is the thin-history replays plus class-level clustering.
- It is not a features-that-suit-WRs problem: borrowing WR slopes (T2) improved ranking and slopes and
  left the level unchanged; what fails is the level in replays with one to three TE classes behind them.

## Honest limit

No TE pre-draft hit chance can be validated against these fixed gates with this data. The gates pool
three replays fit on one to three TE classes, which every model over-forecasts about 3x on 6 events, and
even a perfectly calibrated model would clear all six gates only about a third of the time with 38
events. More TE history before 2008 is not in the store (ESPN play-by-play starts 2004, so 2008 is the
first full career; CollegeFootballData needs an API key). What would settle it:

1. **The prospective holdout.** T2 is the strongest TE candidate by served log loss and slopes; freezing
   its forecasts for the 2027+ next classes now (as the frozen prospective files do)
   would let the 2027-2030 outcomes judge it. That is a coordinator decision and does not serve a number.
2. **A replay window with a minimum training history**, declared in a new addendum before any further
   TE candidate is scored, and applied to every position. It cannot be applied to T1-T3 now: their
   results have been seen.
3. **A NestedLR fix for every position** (shared code, coordinator only): skip held-out classes with no
   event when scoring the C grid, and fall back to the fixed C when fewer than two scorable classes
   remain. As written, a replay whose only scorable class has no hit picks the least-penalized C.

## Public sources examined

- Mulholland and Jensen, Predicting the Draft and Career Success of Tight Ends in the NFL, Journal of
  Quantitative Analysis in Sports 10(4), 2014 (De Gruyter, paywalled; abstract only: college production
  predicts TE career success, size is over-weighted in the draft). Method-level only; informed T3.
- PFF TE prospect model, Jonathon Macri, 2025-03-27 (pff.com): uses PFF grades, yards per route run
  and draft capital, none of which exist pre-draft in this store; no reuse.
- PlayerProfiler breakout age and TE dominator thresholds (playerprofiler.com, public articles): the
  definition is already in the repo (`BREAKOUT["TE"] = 0.15`); used in T3.
- Partial pooling: Gelman and Hill (2007) ch. 12-13; Efron and Morris (1975); Daume III (2007), feature
  copies for shared plus specific effects. Methods only, no code or data copied.

## Reproduce

See `checkpoint.md`. `python -W ignore projections/lanes/te/te_candidates.py T1 T2 T3` rewrites the
candidate entries; `te_posthoc.py` adds the post hoc split; `te_report.py` prints the tables above.
