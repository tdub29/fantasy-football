# Label maturity, decision-time and reproduction audit (A1, A2)

Lane target-experiment, session 7f87cf4a, 2026-10-07. Audits the inputs behind the frozen prereg (125c50c) and
its inline run (e468360), then reruns that run unchanged on a population rebuilt from the lane's store copy.
Nothing here was tuned and nothing in the frozen files was touched.

Rerun: `PYTHONDONTWRITEBYTECODE=1 python -B projections/lanes/parallel-2026-10-06/target-experiment/audit_repro.py`
(about 47 minutes; every network fetch is disabled and asserted). Numbers below are from `audit.json`; the rerun
of the frozen script wrote `repro-85d9801d/results.json`.

## Verdict

The labels are mature, the embargo the prereg chose is the one that is timestamp-safe, the decision-time inputs are
pre-draft, and the frozen run reproduces: **H1 NOT SUPPORTED, H2 REJECTED, H3 USABLE (descriptive)** on the
rebuilt population, with H1 and H3 identical to the digit. Two prereg statements were wrong and are recorded as
deviations in the addendum: the population was not built from store 85d9801d (its labels and capital match that
store exactly; some college features do not), and the inline run's post hoc QB observation for H2 does not survive
the rebuild.

## 1. Label maturity

VOR3 sums a player's clipped season VOR over NFL years 1 to 3. The last labelled season is 2025, so classes
2008 to 2023 are mature (2023 needs 2023 to 2025) and 2024 to 2026 are not; the script asserts that every 2008 to
2023 label is present and every later one is missing.

The 18 nflverse season files (2008 to 2025, regular season only) each have 32 teams, 1,765 to 2,082 player rows
and PPR totals between 40,263 and 47,430. Each season has one row with no player id carrying the league's game
count (256 through 2020, 272 from 2021, 271 in 2022 when Bills at Bengals was cancelled); it never joins a player.

`all_seasons_complete` in `audit.json` is **false because the check was wrong, not the data.** It flagged any
player with more games than the schedule (16 through 2020, 17 after). Those four seasons have exactly one such
player each, and each was traded mid-season into a team with a different bye: Will Witherspoon 17 games in 2009,
Damon Harrison 17 in 2018, Emmanuel Sanders 17 in 2019, Rashid Shaheed 18 in 2025. All four seasons are complete.

## 2. Why the embargo is 3 classes

At the draft of class Y only season Y-1 has been played. A training class whose three label seasons reach Y or
later is being taught with outcomes nobody had at decision time.

| Embargo | Future label seasons in the training set | Training rows carrying them, per scored class |
|---|---|---|
| 1 class (the frozen overall study) | 3 (class Y-1 has two, Y-2 has one) | 153 to 166 |
| 2 classes | 1 (class Y-2) | 75 to 83 |
| 3 classes (this prereg) | 0 | 0 |

With the 3-class embargo the training window holds 174 drafted rows for 2012 and 1,048 for 2023. The frozen
overall study's out-of-sample numbers (C0, M1, P1 at a 1-class embargo) therefore include label look-ahead; that
is a property of that study, recorded here, not a change to it.

## 3. Feature vintage at decision time

- Every row's college cutoff is the season before its draft; no final-season or QB final-season value comes from
  after the cutoff (0 rows each).
- Draft age is built from high-school class alone with one constant offset (18.36 years over 1,182 rows), so it
  needs nothing published after the draft. It is coarse: the builder's own check puts the error SD at 1.24 years.
- Weight is combine weight, else roster weight (134 rows). One roster weight comes from the draft-year roster
  (DeVonta Smith, 2021, pick 10). One row; recorded as deviation D8.
- The design matrix carries a flag for "no college link", which is known at decision time but is a coverage
  artifact. Its relation to outcome changes sign by draft range, so it cannot be called a clean leak in either
  direction (share with VOR3 above zero in format F1):

| Picks | Linked | Unlinked |
|---|---|---|
| 1 to 32 | 0.669 (n 148) | 0.667 (n 3) |
| 33 to 64 | 0.494 (n 160) | 0.250 (n 8) |
| 65 to 100 | 0.311 (n 164) | 0.636 (n 11) |
| 101 to 150 | 0.156 (n 237) | 0.316 (n 19) |
| 151 and later | 0.068 (n 473) | 0.017 (n 59) |

  Only the profile models read it (H2 here); C0, H1 and H3 never do. Recorded as deviation D7.

## 4. Linkage

Drafted QB, RB, WR and TE per class equal the draft file for every class 2008 to 2023 (1,282 rows; fullbacks are
excluded). 11 lack an NFL id and none of them was a top-100 pick; their label is zero by construction. No duplicate
NFL id, class and pick, PFR id or row id. College link rate by class runs 86% to 99% (724 by name and school,
457 by ESPN id, 1 by name prefix, 100 unlinked). The population also holds 1,197 UDFA rows for 2008 to 2023; the
prereg population is drafted players only.

## 5. Formats

All three are 10 teams with QB 10, RB 20, WR 20, TE 10 and FLEX 40 starters. F2 adds 10 superflex slots; F3 is F1
plus half a point per tight-end catch. Mean replacement points 2008 to 2025: F1 QB 267.3, RB 142.4, WR 142.9,
TE 139.7; F2 drops QB to 207.2. F3 lifts TE to 146.8 through the bonus itself, and RB and WR to 145.9 and 148.7
because bonus-boosted tight ends take flex slots.

**Why the 75th percentile is zero.** 75.4% of drafted QB/RB/WR/TE score zero VOR3 in F1 (74.3% in F2, 75.4% in
F3), so the F1 and F3 75th percentile is exactly 0 and F2's is 6.25. "Above p75" therefore means "any positive
VOR3" in F1 and F3, and precision@24 is a hit rate. By position the zero share is QB 85%, RB 68%, WR 73%, TE 84%
(F1); by class the share above zero runs from 17% (2016) to 31% (2017). This is the target, not a bug, and it is
why H1 tested a two-part model.

## 6. Timestamps of pre-draft inputs

| Class | NFLMDD capture, days before round 1 | K0 pre snapshot, days before | K0 post after the draft |
|---|---|---|---|
| 2019 | none | 2 | yes |
| 2020 | 7 | 2 | yes |
| 2021 | 3 | 1 | yes |
| 2022 | 2 | 6 | yes |
| 2023 | 22 | 6 | yes |
| 2024 | 1 | none | none |
| 2025 | 3 | none | none |
| 2026 | 3 | none | none |

Every pre-draft input precedes round 1. The 2023 board is three weeks early, so it misses late pre-draft news;
that can only handicap XC0 against K0 in that class.

## 7. Population provenance and reproduction

The prereg says the population cache was built from store 85d9801d. The cache the inline run read
(`overall_data.pkl`, sha c79d7ab8, in the coordinator's job scratch) was written 2026-10-05 22:52 PDT, a minute after
that scratch's store copy was last written. The worktree store the lane copied (sha 85d9801d) was last written
2026-10-06 09:02 PDT, ten hours later.

Rebuilt from the lane's copy of 85d9801d (sha unchanged before the build), with fetching disabled, the new cache
(sha cb7ba4c9) has the same 2,479 rows for 2008 to 2023 (1,282 drafted, 1,197 UDFA) under the same keys, and
**zero mismatches** in every label (VOR3, peak and VOR4 in all three formats), position, pick, NFL id, college
link and link method, weights, stars, speed score and draft age. Replacement levels are identical. The only
differences are college production features: career rush yards per team attempt 949 rows, scrimmage yards per
game 402, final-season rush yards per team attempt 401, best-season version 373, power-conference flag 139,
final completion rate 56, best rush yards per game 10, early-entry flag 2. Only H2 reads those.

The frozen script, rerun unchanged on the rebuild: 344 numbers compared, 68 differ, every one inside H2.

| | Frozen run | Rebuild |
|---|---|---|
| H1, F1 Spearman gain over C0 | +0.0004 [-0.0056, +0.0062], share above 0 0.53 | identical |
| H2, F1 | -0.0056 [-0.0186, +0.0066], share 0.24 | -0.0058 [-0.0185, +0.0061], share 0.23 |
| H2, F2 and F3 point gains | -0.0001 and +0.0041 | -0.0001 and +0.0031 |
| H3, XC0 minus K0 pre, 2021 to 2023 | -0.0046 [-0.064, +0.055] | identical |
| Verdicts | NOT SUPPORTED, REJECTED, USABLE | same |

`results.md` notes, as a post hoc observation, that H2 lifted the QB Spearman from 0.457 (C0) to 0.475. On the
rebuild H2's QB Spearman is 0.455, below C0. The observation was feature drift between two store states, not
signal, and it is withdrawn in the ledger.
