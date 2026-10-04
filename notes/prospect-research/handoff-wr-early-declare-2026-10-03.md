# Handoff: WR college model lost the 2020-2023 holdout (early-declare flag)

For whoever picks up the prospect model next. Written 2026-10-03 alongside the college prospect
cards; no model code or validation rule changed in that work. Source numbers: `model-card.md`.

## The question

Is the WR miss a failure of this feature specification, or evidence that college data add nothing
once draft slot is known? The shipped file only settles the first part.

## What is established

- **WR talent + capital lost the untouched holdout**: log loss 0.3236 (spline draft-only) to 0.3386,
  AUC 0.877 to 0.853, on 124 players and 22 hits. It won the other two runs (development
  leave-one-class-out 0.3459 to 0.3200, embargoed forward 0.3674 to 0.3439) and 99% of class
  bootstrap resamples. The ship rule needs all three runs plus 80% bootstrap, so WR ships draft-only.
- **College stats alone still carried signal on that same holdout**: talent-only AUC 0.743 against
  0.500 for no model, log loss 0.4196 against 0.4701, Brier 0.1314 against 0.1466. They did not add
  to draft slot, which already prices most of that information. That is narrower than "no signal".
- **The model card's diagnosis**: the `early` flag (3 or fewer college seasons with stats). Four-year
  WRs hit 5% of the time in 2008-2019 and 11% in 2020-2023 (Pittman, Olave, Rice, Nacua, Flowers).
  The COVID extra year is the likely cause. `early` is the largest coefficient in the WR full model
  (+0.346 standardized, ahead of career YPTPA at +0.342), so a shift in it moves the whole forecast.

## What is not established

- That `early` is the only cause. Nobody has refit WR without it, or with a COVID-aware version, and
  scored the holdout. Dropping it costs 0.013 (leave-one-class-out) and 0.015 (forward) on
  development, which is all that is known.
- That the production stats (career YPTPA, stars) held up on 2020-2023 on their own.

## Constraint that matters most: the holdout is spent for this search

Every number above has now been read. A respecification chosen after looking at 2020-2023 cannot
use 2020-2023 as untouched evidence. So:

1. Write the candidate list down BEFORE scoring any of it on 2020-2023, from 2008-2019 results and
   a priori reasoning only. Score each once on the holdout and report every candidate, not the best.
2. The next clean test is the 2024 class, whose three-season WR window closes after the 2026 season
   (outcomes usable around January 2027). Treat any 2026-10 respecification as provisional until it
   survives that class.
3. The ship rule does not change: lower log loss than the spline draft-only baseline in development,
   embargoed forward and holdout, and positive in at least 80% of class bootstrap resamples.

## Candidates to pre-register (hypotheses, not results)

1. COVID-aware experience: count college seasons with stats excluding 2020, or flag players whose
   eligibility clock was extended, instead of the raw `n_seasons <= 3`.
2. Drop `early`; keep career YPTPA and stars. Known development cost, holdout unknown.
3. Estimated draft age in place of `early` (the flag may be standing in for age). Ages are estimated
   from class year with a 1.24-year SD error on players with real birth dates, so expect noise.
4. Same feature set, refit with the 2020+ classes allowed to carry their own intercept for four-year
   players. Only testable forward, since development has no post-2020 class.

## Weak hint from the shipped file (do not cite as evidence)

`PROSPECT_MODEL.nfl` only holds players who still have a Sleeper id (177 of 338 development WRs, 99 of
124 holdout WRs), so this is survivorship-biased and tiny. WR hits by draft round, talent score 70+ vs under 70:

| Classes | R1 | R2 | R3 | Day 3 |
|---|---|---|---|---|
| 2008-2019 | 9/18 vs 0/4 | 6/12 vs 6/16 | 4/11 vs 1/10 | 1/16 vs 3/90 |
| 2020-2023 | 12/16 vs 2/4 | 1/9 vs 2/10 | 1/4 vs 2/10 | 1/9 vs 1/37 |

Too small to read either way: Round 1 leans toward the talent score mattering, Rounds 2 and 3 on the
holdout do not. A within-slot residual check on the full linked sample (1,414 players) under the existing
protocol would say whether that is real.

## Done means

- A dated section in `model-card.md` listing the pre-registered candidates and, for each, development,
  forward, holdout and bootstrap numbers under the existing protocol, with a ship or no-ship verdict.
- `python projections/build_prospect_model.py --self-check` and the full build pass.
- If the WR verdict flips, update `PM_WR_EARLY` and the notes logic in `viewProspects`
  (`site/js/app.js`), then `node site/js/prospect-cards.test.js`.
