# Prospect model card

Built 2026-09-27 by `projections/build_prospect_model.py`, revised 2026-09-28 after a review. The
builder rewrites every number between the METRICS markers below on each run, so those tables always
describe the shipped file (`site/data/prospect-model.js`). The prose above the markers is
hand-written; if a rebuild flips a verdict, the verdict lines in the block say so and this section
needs a reread.

Spec and evidence: `wr-te-models.md`, `rb-qb-methodology.md`, `dynasty-domain-bakery.md`. Data and
its verified coverage: `data-sources.md`.

## Bottom line

**Every position now ships the draft-only hit probability.** Draft capital is the forecast; the
college talent score is a pre-draft profile, not a forecast, at QB, RB, WR and TE alike.

- **WR and RB** changed. On the 2008-2019 development classes, talent + capital beats the spline
  draft-only curve clearly (WR log loss 0.3459 to 0.3200, RB 0.4397 to 0.4206, 99% and 98% of
  class bootstrap resamples). On the untouched 2020-2023 classes it loses: WR 0.3236 to 0.3386,
  RB 0.4314 to 0.4336. The ship rule needs all three runs, so both ship draft-only.
- **QB and TE** were draft-only before and still are. QB talent + capital loses on development
  (0.3745 to 0.3916); TE wins the holdout (0.2895 to 0.2813) on 6 hits but ties on development
  (54% of resamples).
- **Why WR fell apart on the holdout:** the early-declare flag. On 2008-2019, four-year receivers
  hit 5% of the time; on 2020-2023 they hit 11% (Michael Pittman, Chris Olave, Rashee Rice, Puka
  Nacua, Zay Flowers). The COVID extra year of eligibility is the likely reason, and it is a shift
  the history cannot price yet.

The conclusion does not depend on which capital curve is the baseline: talent + capital also loses
the holdout to the old straight line in log pick at QB, RB and WR.

## Charter v2 research, 2026-10-03 to 2026-10-04

Rules, candidates and every number: `validation-charter-v2.md`, `experiments/ledger.md`,
`experiments/ledger-b.md`, the per-candidate JSON beside them, and three independent reviews in
`experiments/review-*.md`. Data now comes from a local SQLite store (`projections/prospect_db.py`);
coverage by class is in `data-coverage.md`.

**After the draft (capital known): draft-only stays at every position, now on firmer evidence.**
Fifteen candidates (A0-A14) were scored on identical embargoed forward folds, 2013 to the last mature
class. One passed the numeric rules (A10, a 50/50 blend at RB) and was rejected on review: v1's
feature sets were pruned on every class, including the ones used to test, so any candidate built on
them is flattered, and two classes carried that pass. A14 removes the leak by choosing features
inside each training fold; it loses to draft capital alone at QB, RB and TE and does not clear the
bootstrap at WR. The 2020-2023 classes are spent as a holdout, so 2024-2026 predictions are frozen
in `experiments/prospective-2024-2026.json` for scoring from January 2027.

**Before the draft: a real forecast now exists.** v1 trained only on drafted players, so its college
numbers were conditional on a draft that has not happened. Population B (`prospect_population.py`)
holds every FBS QB/RB/WR/TE who left college since 2008, drafted or not, about 8,100 mature exits,
with undrafted NFL players linked and never-played players as real zeros. Fit on all of them, the
college profile beats recruiting stars by a wide margin on forward folds at every position (log loss
WR 0.093 to 0.062, RB 0.155 to 0.099, TE 0.144 to 0.100, QB 0.147 to 0.116). Most of that is
separating who gets drafted at all: among drafted players alone the AUC is 0.70-0.74, against
0.52-0.61 for stars (review B). The draft-bucket model built on the same features predicts the round
range far better than base shares (multiclass log loss 0.52 to 0.34 at WR), but it is not shipped.

## What it predicts

| Position | Hit | Window | Base rate | Training classes |
|---|---|---|---|---|
| WR | top-24 WR season by PPR points per game, 8+ games | NFL years 1-3 | 16% | 2008-2023 |
| RB | top-24 RB season by PPR points per game, 8+ games | NFL years 1-3 | 28% | 2008-2023 |
| QB | top-12 QB season by PPR points per game, 8+ games | NFL years 1-4 | 20% | 2008-2022 |
| TE | top-12 TE season by PPR points per game, 8+ games | NFL years 1-4 | 20% | 2008-2022 |

A draftee's season is ranked against every player listed at his **draft** position on that season's
nflverse roster (8+ games), whatever he was listed at himself. QB and TE get four years because both
develop later (rb-qb-methodology 4.1, wr-te-models 4). Only classes whose whole window has been
played are used. The continuous check is the best PPR PPG in the window (0 when he never had an
8-game season); the tables report the correlation of each model's out-of-sample logit with it.
Population: every QB/RB/WR/TE drafted since 2008 whose college career could be linked (92.7%, see
data-sources.md). Undrafted players are out, as in the research baselines.

## Features

| Position | Talent features (full model adds a spline in log pick) |
|---|---|
| WR | career receiving yards per team pass attempt; early declare (3 or fewer college seasons with stats); recruiting stars |
| RB | final-season receiving yards per team pass attempt; career scrimmage yards per game; weight; speed score; recruiting stars |
| QB | best-season rushing yards per game in a passing season; final-season completion %; draft age; Power conference |
| TE | best-season receiving yards per team pass attempt; speed score; Power conference |

Breakout age (first qualifying season at a 20% dominator, WR) is still computed and shown, but no
model uses it since 2026-09-28 (see "Review fixes").

Definitions. Team totals are the sum of every player on that team in the same ESPN play-by-play
file, so a game missing from the feed drops out of numerator and denominator alike. Dominator =
mean of yards share and TD share (receiving for WR/TE, scrimmage for RB). A season qualifies at half
the team's games (min 3); the in-progress season must reach 6 games before it counts as a best or
final season. Ages, for drafted and college players alike, are on Sept 1 of the season from the
class-year estimate in data-sources.md; draft age is on April 25. Speed score is
(weight x 200) / forty^4 from the nflverse combine, the same helper `prospect.js` uses. The model's
YPTPA divides by at least 26.5 team passes a game, and a season on a team that threw fewer than 15
a game adds nothing to any YPTPA feature and cannot be a breakout season (see "Low-volume shares");
the card still shows the stat as posted.

## Method

- **Three models per position**, all logistic: draft only (a restricted cubic spline in log pick),
  talent (L2, C = 0.1 on standardized features), full (talent + the same spline). Missing values
  take the training median inside each fold.
- **The capital term** is a 4-knot restricted cubic spline in log(pick): its linear part is
  effectively unpenalized (scaled up after standardizing), its two curvature terms are penalized at
  the same C as a college stat. The draft-only baseline and the full model use the identical term,
  so talent features get credit only for what capital's own curve cannot explain.
- **Validation, three runs.** (1) Leave-one-draft-class-out on the development classes, 2008-2019.
  (2) Forward-chained on the development classes, testing 2013 on, **embargoed by the outcome
  window**: a held-out class trains only on classes whose whole window had been played by its draft
  (WR/RB three years older, QB/TE four). (3) **The holdout, 2020-2023** (QB/TE 2020-2022): each class
  scored by a fit on the classes whose window had closed by its draft. No feature, C, knot or floor
  in this revision was chosen on the holdout classes.
- **Ship rule**: a model replaces the draft-only baseline only if it has lower log loss in all three
  runs and wins in at least 80% of draft-class bootstrap resamples of the development predictions.
- **Challenger**: a monotone-constrained LightGBM (3 leaves, 150 trees) on the full feature set. It
  never passes, so it is not shipped anywhere.
- **Tiers** (our names): Blue Chip >= 90th talent percentile, Plus Starter >= 70, Contributor >= 45,
  Project >= 20, Long Shot below. Percentiles are against every drafted player at the position since
  2008, on out-of-sample talent scores (development leave-one-class-out, holdout walk-forward), so the
  tier hit rates below are honest ones.
- **Comps**: the three nearest historical draftees on the standardized features, each weighted by
  its absolute coefficient. NFL players are matched in the full-model space (capital included);
  college players in the talent space.

## Read these before trusting a number

1. **Selection optimism, and what the holdout does and does not cover.** The first feature sets (6-7
   per position, straight from the research) lost to capital alone everywhere. The shipped sets are
   research-backed subsets kept after one leave-one-class-out pruning pass on every class, 2020-2023
   included, and C and the 15-pass floor were settled the same way. The first version of this card
   called the forward run and the class bootstrap the guards against that. They were not: both
   reused the same classes the pruning had already seen, and the forward folds trained on classes
   whose outcome windows were still open. Every choice made in the 2026-09-28 revision (the spline,
   the 26.5 denominator, dropping WR breakout age, the exit scenarios) used 2008-2019 only; on
   2008-2019 alone, C = 0.1 is still within 0.004 of the best of 0.03, 0.1, 0.3 and 1 for every
   talent model. The inherited feature sets can only flatter the talent and full models on the
   holdout, and they still lose there.
2. **Small samples.** 32 QB and 41 TE hits in all; the QB holdout is 30 players with 8 hits and the
   TE holdout 39 with 6. One draft class moves the QB interval by about 0.02 log loss either way.
3. **Ages are estimated for everyone.** ESPN publishes no date of birth for current players, so a
   college player's age is 18.71 plus years since his first season on file (or his recruit class, or
   the class year on the 2025+ rosters, whichever is earliest). The model now trains on the same
   estimate for drafted players, so it never learns from an age sharper than it will be given. On
   drafted players with a real birth date the draft-age error has a 1.24-year SD. For the 2008-2011
   classes the 2004 data floor can make a fifth-year senior look a year young.
4. **College players have no combine.** Speed score is imputed at the median for them, so RB and
   TE talent scores for current players carry no athleticism.
5. **"If drafted" is conditional**, and with every position on the draft-only model every player at
   a position gets the same round numbers (Round 1 = 1-32, Round 2 = 33-64, Round 3 = 65-100,
   Day 3 = 101-257). That is the honest output. The curve is steep where the history is perfect:
   all 12 RBs taken in the top 12 since 2008 hit, so the RB curve reads 96% at pick 10 and rounds
   to 100% at pick 1. Out of sample the top decile runs hot at RB (0.86 predicted, 0.78 observed)
   and QB (0.71, 0.62).
6. **Current players are scored at the more conservative of two exits**: leaving after his third
   college year or his fourth (or now, for a senior). The early flag and the estimated draft age
   follow the exit. `cls` stays his first eligible draft; `ex` says which exit the score assumes.
7. **The in-progress season** counts once it reaches 6 games. Until then a current player's profile
   is his completed seasons (or the live one, if it is all he has).
8. **Historical players on the card show out-of-sample numbers**: development classes from
   leave-one-class-out, holdout classes from the walk-forward fit. Classes after the training window
   use the final fit.

## Review fixes (2026-09-28)

A review found ten wrong outcome labels, a baseline that could be bent, forward folds that peeked,
current players scored on flags that were true by construction, and join gaps. All fixed:

- **Outcome labels (P0).** Seasons were ranked within nflverse's `position`, which is a player's
  CURRENT position. Five fullbacks drafted as RBs (Tony Fiammetta, John Conner, Anthony Sherman,
  Stanley Havili, Tommy Bohanon) were top-24 "hits" among fullbacks; Brandon Wilson and Tony Lippett
  ranked among defensive backs, Jordan Thomas among linebackers and Connor Heyward among fullbacks;
  Jaylen Samuels, drafted a TE, was a missed TE hit. Every season is now ranked against that season's
  roster at the draft position. 12 labels flipped: those 10, plus Roy Helu (24th to 25th) and Torrey
  Smith (25th to 24th) on cleaner pools. The self-check pins a fullback and a TE-listed-at-RB case.
- **Capital curve (P1a).** The baseline was a straight line in log pick. Six curves were scored on the
  development classes only: linear, quadratic, 3- and 4-knot restricted cubic splines, each spline
  with and without a curvature penalty. The rule, fixed before scoring: best mean development log
  loss across positions in both leave-one-class-out and embargoed forward. The 4-knot spline with
  penalized curvature won both (0.3976 and 0.4114 vs linear 0.4043 and 0.4173). Unpenalized, the
  spline lost to the straight line even on development (QB 0.3977 vs 0.3799) by bending to 95%+ at
  the top picks. On the holdout the straight line edges the chosen spline at all four positions
  (by 0.002 to 0.020); the spline stays because it was chosen before the holdout was scored, and
  the ship decisions come out the same against either.
- **Embargo and holdout (P1b).** See Method. The forward folds used to train on the class just
  before the held-out one, which had played one of its three seasons.
- **Current players (P1c).** `early` was 1 for every underclassman, and the draft year pinned
  a 3-year exit (draft age 21.36 for 36% of college WRs). Each player is now scored at the more
  conservative of a 3-year and a 4-year exit. `early` itself survives the spline baseline on
  development (dropping it costs WR 0.013 leave-one-class-out and 0.015 forward). A current player
  with no breakout yet was scored as broken out at "final age + 1", a late breakout; he is now
  treated as missing (the training median, floored at his current age) and shown blank.
- **Training ages (P2a).** The model trained on real birth dates and scored on the class-year
  estimate. It now trains on the estimate. Under estimated ages, WR breakout age stopped earning its
  place: dropping it improved the development talent model (0.3617 to 0.3565), the full model
  (0.3260 to 0.3200) and the bootstrap (92% to 99%), so it left the WR model and is display-only.
  QB draft age is mixed (the talent model is worse without it) and stays.
- **Joins (P2b).** School aliases, a nickname table, any-name matching and the before-the-draft id
  check took the linked count from 1,382 to 1,414 of 1,525 (90.6% to 92.7%), none lost; details in
  data-sources.md. The name join's accuracy on the 691 id-known picks went from 99.8% to 99.9%.
- **Low-volume guard (P3).** It tested 12 passes a game, under the 15 floor, so it could not fail. It
  now tests 16 and failed at first (WR 100, RB 95, TE 99), which is the new denominator in
  "Low-volume shares" below.

**Before and after, per position.** Log loss, lower is better. "Before" is the 2026-09-27 build
(old labels, old join, real birth dates, linear baseline, WR breakout age, no denominator) scored
under this revision's protocol; its own card's numbers (every class leave-one-class-out, forward
without embargo) are in the last column. Baselines: linear before, spline after.

| Pos | Holdout: capital / full, before | Holdout, after | Dev leave-one-class-out, before | Dev, after | Embargoed forward, before | Forward, after | Bootstrap, before / after | Ships, before / after | Old card: LOCO / forward |
|---|---|---|---|---|---|---|---|---|---|
| QB | 0.4539 / 0.4387 | 0.4582 / 0.4430 | 0.3834 / 0.3970 | 0.3745 / 0.3916 | 0.3289 / 0.3379 | 0.3255 / 0.3363 | 16% / 12% | draft / draft | 0.3925 / 0.3931, 0.3810 / 0.3771 |
| RB | 0.4349 / 0.4315 | 0.4314 / 0.4336 | 0.4758 / 0.4686 | 0.4397 / 0.4206 | 0.4796 / 0.4661 | 0.4859 / 0.4670 | 91% / 98% | full / **draft** | 0.4648 / 0.4586, 0.4628 / 0.4548 |
| WR | 0.3207 / 0.3331 | 0.3236 / 0.3386 | 0.3708 / 0.3520 | 0.3459 / 0.3200 | 0.4093 / 0.4011 | 0.3674 / 0.3439 | 86% / 99% | full / **draft** | 0.3548 / 0.3435, 0.3771 / 0.3734 |
| TE | 0.3525 / 0.3513 | 0.2895 / 0.2813 | 0.4406 / 0.4405 | 0.4297 / 0.4288 | 0.4688 / 0.4666 | 0.4524 / 0.4521 | 50% / 54% | draft / draft | 0.4242 / 0.4226, 0.4215 / 0.4174 |

Holdout AUC, capital / full: QB 0.824 / 0.864 before, 0.824 / 0.841 after; RB 0.799 / 0.806 and
0.801 / 0.818; WR 0.875 / 0.855 and 0.877 / 0.853; TE 0.799 / 0.804 and 0.904 / 0.904. The TE
holdout moved most because Connor Heyward, a pick-208 false hit, is gone. Under the old pipeline and
the new protocol RB would still have shipped (holdout 0.4349 to 0.4315 against the straight line);
against the spline, which is 0.0035 better on that holdout, it does not.

## Low-volume shares (2026-09-28)

**The problem.** Army WR Brady Anderson ranked #3 of all college WRs at talent 96 on 13 catches for
336 yards. Army threw 107 passes in 2025 (9 a game), so his 336 yards came to 3.14 yards per team
pass attempt and a 40% dominator, and one qualifying season at 19.7 counted as a young breakout.
A small denominator was doing the work, not the player.

**The fix: a minimum-volume floor.** A season on a team that threw fewer than 15 passes a game
(half the FBS median of 30.4, 2004-2025) adds nothing to any YPTPA feature, best, final or career,
and cannot be the breakout season. It is a volume rule, not a team list: in practice it catches the
triple-option offenses (Army, Navy, Air Force, Georgia Southern, Paul Johnson's Georgia Tech) and
seasons where ESPN's feed carries only part of a team's passes (San Diego State 2005-06, Illinois
2007). A player with no season over the floor gets the training median for YPTPA, the model's answer
for "no information". Among the training draftees it touches 20 players (12 WR, 6 RB, 2 TE), two of them hits (Demaryius Thomas,
Rashard Mendenhall). The 15 was set from the league rate, not tuned: 18 gives the same result, and 12
still catches Army but lets Navy and Air Force (13.5 a game in 2025) through.

**Update, same day: a denominator floor above it.** The guard below used to test 12 passes a game,
which the floor zeroes, so it could not fail. Moved to 16, just over the floor, it failed on the
development fit: WR 100, RB 95, TE 99. A team throwing 16 a game still handed its receivers a
full-strength share of a small passing game. So the model's YPTPA now divides by at least 26.5 team
passes a game, the FBS 25th percentile, 2004-2025; the posted YPTPA on the card is unchanged. The 5th
percentile (19.8) and 10th (22.7) left the guard at 97 and 91 for WR on the development fit. On
2008-2019, log loss moved 0.0013 at most at any position. On the final fit (every class) the guard
reads RB 72.6, WR 89.6, TE 84.7: WR clears the line by 0.4 points, so a new extreme WR season in a
later class could trip it, and the build will fail loudly if it does.

**Before and after the 15 floor** (log loss, lower is better; draft-only baselines do not move;
these are the first build's numbers, before the review fixes above):

| Pos | Talent, leave-one-class-out | Full, leave-one-class-out | Full, forward-chained | Beats capital in bootstrap | Ships |
|---|---|---|---|---|---|
| WR | 0.3842 to 0.3829 | 0.3439 to 0.3435 | 0.3730 to 0.3734 | 85% to 85% | talent + capital, both |
| RB | 0.5326 to 0.5347 | 0.4578 to 0.4586 | 0.4546 to 0.4548 | 91% to 89% | talent + capital, both |
| TE | 0.4699 to 0.4667 | 0.4240 to 0.4226 | 0.4177 to 0.4174 | 51% to 59% | draft only, both |

TE improves everywhere. WR improves leave-one-class-out (it loses Demaryius Thomas, a hit on 11
Georgia Tech passes a game, and gains more back on Stephen Hill and the thin-feed seasons) and gives
back 0.0004 forward. RB is the cost: 0.0021 on the talent model, 0.0008 and 0.0002 on
the shipped full model, most of it Mendenhall, whose final Illinois season the feed covers at 13
passes a game, then Bernard Pierce and Jonathan Dwyer. Every change sits well inside the class
bootstrap interval (about 0.008 either side at RB) and no ship decision moves. The WR Blue Chip
tier's out-of-sample hit rate went from 53% to 56%. QB features use no shares and did not change.

**College WRs, the old top 10** (first build, before the review fixes):

| Old rank | Player | Talent | New rank | Talent |
|---|---|---|---|---|
| 1 | Jeremiah Smith, Ohio State | 100 | 1 | 100 |
| 2 | Malachi Toney, Miami | 99 | 2 | 99 |
| 3 | Brady Anderson, Army | 96 | 34 | 68 |
| 4 | Ryan Coleman-Williams, Alabama | 95 | 3 | 95 |
| 5 | Cam Coleman, Texas | 92 | 4 | 93 |
| 6 | Andrew Marsh, Michigan | 91 | 5 | 92 |
| 7 | KJ Duff, Rutgers | 89 | 6 | 91 |
| 8 | Vernell Brown III, Florida | 89 | 7 | 90 |
| 9 | Griffin Wilde, Northwestern | 88 | 8 | 89 |
| 10 | Nick Marsh, Indiana | 84 | 9 | 86 |

T.J. Moore (Clemson) moved up from 11 to 10. The college RB and TE top 10s were unchanged. What
still held Anderson at 68 was youth and the early-declare flag, which every underclassman carried
by construction, not his shares; the exit scenarios above now fix that.

**Why not empirical-Bayes shrinkage.** Shrinking each YPTPA toward the drafted position mean,
(N x raw + K x mean) / (N + K) with N the team's pass attempts, was the first thing tried. It
preserved the metrics but never fixed the artifact:

| Variant | WR full, LOCO / forward | RB full | TE full | Anderson | Extreme low-volume profile |
|---|---|---|---|---|---|
| none (old build) | 0.3439 / 0.3730 | 0.4578 / 0.4546 | 0.4240 / 0.4177 | #3, 96 | top decile |
| shrink, K = 200 | 0.3439 / 0.3730 | 0.4576 / 0.4543 | 0.4256 / 0.4202 | #8, 87 | top decile |
| shrink, K = 400 | 0.3440 / 0.3731 | 0.4575 / 0.4542 | 0.4262 / 0.4211 | #9, 84 | top decile |
| shrink, K = 600 | 0.3442 / 0.3732 | 0.4574 / 0.4541 | 0.4266 / 0.4216 | #10, 81 | top decile |
| shrink K = 400 + floor | 0.3437 / 0.3734 | 0.4580 / 0.4544 | 0.4256 / 0.4210 | #33, 69 | 42 to 58 |
| **floor only (first build)** | 0.3435 / 0.3734 | 0.4586 / 0.4548 | 0.4226 / 0.4174 | #34, 68 | 42 to 59 |

Shrinkage treats the problem as sampling noise, and it is mostly structure: a team that passes 9
times a game throws play-action shots, so its YPTPA stays inflated year after year (a label-free fit
of K on season-to-season stability came out flat for that reason). Shrinking the dominator as well
broke the breakout test, because a pull toward the drafted mean (22.6%, above the 20% line) makes a
thin season clear the line more easily: Henry Ruggs's breakout age went from 21.6 to 18.6. Adding
shrinkage on top of the floor bought RB 0.0006 and cost TE 0.0030, so it is not in the build.

**The guard.** Every build scores a two-season career on a team throwing 16 passes a game, at the
best YPTPA and dominator any drafted player at the position posted on a normal passing team, with
every other feature at the training median, and fails if that lands in the top decile. The shipped
numbers are in the block below. The `--self-check` pins the mechanism: 12 a game is under the floor,
16 is over it and divided by 26.5.

**Selection.** About 30 variants were scored on the same cross-validation before the 15 floor was
picked by a stated rule (stop the artifact and pass the guard at the smallest cost), on every class,
so those numbers carry the same mild optimism as the feature pruning in item 1 above. The 26.5
denominator was picked on 2008-2019 only.

## Headline numbers

These are rewritten by the builder on every run.

<!-- METRICS:BEGIN (build_prospect_model.py rewrites this block) -->
Linked 1414 of 1525 drafted QB/RB/WR/TE since 2008 to college data (90% of 2008-2016 classes, 96% of 2017-2026).

### Headline: untouched holdout, draft classes 2020-2023

Each class is scored by a fit on the classes whose outcome window had closed by its draft (WR/RB: classes up to three years older; QB/TE: four). QB and TE stop at 2022, the last class with four seasons played. Nothing in the 2026-09-28 revision was chosen on these classes; the feature sets and C inherited from the first build were (model card, "Read these", item 1).

| Pos | Target | n / hits | Model | AUC | Brier | Log loss | r vs best PPG |
|---|---|---|---|---|---|---|---|
| QB | top-12, yrs 1-4 | 30 / 8 | draft only, spline (baseline) | 0.824 | 0.1384 | 0.4582 | 0.64 |
| QB | top-12, yrs 1-4 | 30 / 8 | talent (no capital) | 0.795 | 0.1632 | 0.4943 | 0.59 |
| QB | top-12, yrs 1-4 | 30 / 8 | talent + capital | 0.841 | 0.1364 | 0.4430 | 0.67 |
| QB | top-12, yrs 1-4 | 30 / 8 | monotone LightGBM (challenger) | 0.920 | 0.1127 | 0.3491 | 0.75 |
| QB | top-12, yrs 1-4 | 30 / 8 | draft only, linear (old baseline) | 0.824 | 0.1388 | 0.4384 | 0.65 |
| QB | | | base rate, walk-forward (no model) | 0.500 | 0.2056 | 0.6117 | |
| RB | top-24, yrs 1-3 | 77 / 20 | draft only, spline (baseline) | 0.801 | 0.1351 | 0.4314 | 0.66 |
| RB | top-24, yrs 1-3 | 77 / 20 | talent (no capital) | 0.737 | 0.1619 | 0.4928 | 0.58 |
| RB | top-24, yrs 1-3 | 77 / 20 | talent + capital | 0.818 | 0.1362 | 0.4336 | 0.69 |
| RB | top-24, yrs 1-3 | 77 / 20 | monotone LightGBM (challenger) | 0.806 | 0.1515 | 0.4671 | 0.66 |
| RB | top-24, yrs 1-3 | 77 / 20 | draft only, linear (old baseline) | 0.798 | 0.1344 | 0.4291 | 0.66 |
| RB | | | base rate, walk-forward (no model) | 0.500 | 0.1933 | 0.5753 | |
| WR | top-24, yrs 1-3 | 124 / 22 | draft only, spline (baseline) | 0.877 | 0.1004 | 0.3236 | 0.62 |
| WR | top-24, yrs 1-3 | 124 / 22 | talent (no capital) | 0.743 | 0.1314 | 0.4196 | 0.42 |
| WR | top-24, yrs 1-3 | 124 / 22 | talent + capital | 0.853 | 0.1061 | 0.3386 | 0.62 |
| WR | top-24, yrs 1-3 | 124 / 22 | monotone LightGBM (challenger) | 0.834 | 0.1198 | 0.3766 | 0.57 |
| WR | top-24, yrs 1-3 | 124 / 22 | draft only, linear (old baseline) | 0.876 | 0.0971 | 0.3213 | 0.64 |
| WR | | | base rate, walk-forward (no model) | 0.500 | 0.1466 | 0.4701 | |
| TE | top-12, yrs 1-4 | 39 / 6 | draft only, spline (baseline) | 0.904 | 0.0820 | 0.2895 | 0.54 |
| TE | top-12, yrs 1-4 | 39 / 6 | talent (no capital) | 0.793 | 0.1090 | 0.3676 | 0.64 |
| TE | top-12, yrs 1-4 | 39 / 6 | talent + capital | 0.904 | 0.0790 | 0.2813 | 0.63 |
| TE | top-12, yrs 1-4 | 39 / 6 | monotone LightGBM (challenger) | 0.884 | 0.0914 | 0.3007 | 0.58 |
| TE | top-12, yrs 1-4 | 39 / 6 | draft only, linear (old baseline) | 0.899 | 0.0807 | 0.2869 | 0.52 |
| TE | | | base rate, walk-forward (no model) | 0.500 | 0.1323 | 0.4362 | |

### Development classes 2008-2019: leave-one-draft-class-out

| Pos | Target | n / hits | Model | AUC | Brier | Log loss | r vs best PPG |
|---|---|---|---|---|---|---|---|
| QB | top-12, yrs 1-4 | 128 / 24 | draft only, spline (baseline) | 0.828 | 0.1174 | 0.3745 | 0.73 |
| QB | top-12, yrs 1-4 | 128 / 24 | talent (no capital) | 0.657 | 0.1436 | 0.4580 | 0.41 |
| QB | top-12, yrs 1-4 | 128 / 24 | talent + capital | 0.814 | 0.1238 | 0.3916 | 0.71 |
| QB | top-12, yrs 1-4 | 128 / 24 | monotone LightGBM (challenger) | 0.803 | 0.1258 | 0.4077 | 0.68 |
| QB | top-12, yrs 1-4 | 128 / 24 | draft only, linear (old baseline) | 0.823 | 0.1182 | 0.3799 | 0.72 |
| QB | | | base rate (no model) | 0.500 | 0.1523 | 0.4826 | |
| RB | top-24, yrs 1-3 | 240 / 68 | draft only, spline (baseline) | 0.820 | 0.1394 | 0.4397 | 0.65 |
| RB | top-24, yrs 1-3 | 240 / 68 | talent (no capital) | 0.769 | 0.1618 | 0.4906 | 0.51 |
| RB | top-24, yrs 1-3 | 240 / 68 | talent + capital | 0.838 | 0.1332 | 0.4206 | 0.67 |
| RB | top-24, yrs 1-3 | 240 / 68 | monotone LightGBM (challenger) | 0.820 | 0.1376 | 0.4457 | 0.63 |
| RB | top-24, yrs 1-3 | 240 / 68 | draft only, linear (old baseline) | 0.821 | 0.1396 | 0.4389 | 0.65 |
| RB | | | base rate (no model) | 0.500 | 0.2031 | 0.5961 | |
| WR | top-24, yrs 1-3 | 338 / 51 | draft only, spline (baseline) | 0.818 | 0.1114 | 0.3459 | 0.56 |
| WR | top-24, yrs 1-3 | 338 / 51 | talent (no capital) | 0.775 | 0.1077 | 0.3565 | 0.45 |
| WR | top-24, yrs 1-3 | 338 / 51 | talent + capital | 0.844 | 0.1014 | 0.3200 | 0.60 |
| WR | top-24, yrs 1-3 | 338 / 51 | monotone LightGBM (challenger) | 0.845 | 0.1009 | 0.3232 | 0.61 |
| WR | top-24, yrs 1-3 | 338 / 51 | draft only, linear (old baseline) | 0.818 | 0.1157 | 0.3649 | 0.55 |
| WR | | | base rate (no model) | 0.500 | 0.1281 | 0.4242 | |
| TE | top-12, yrs 1-4 | 164 / 35 | draft only, spline (baseline) | 0.789 | 0.1362 | 0.4297 | 0.60 |
| TE | top-12, yrs 1-4 | 164 / 35 | talent (no capital) | 0.728 | 0.1547 | 0.4750 | 0.35 |
| TE | top-12, yrs 1-4 | 164 / 35 | talent + capital | 0.791 | 0.1362 | 0.4288 | 0.59 |
| TE | top-12, yrs 1-4 | 164 / 35 | monotone LightGBM (challenger) | 0.769 | 0.1389 | 0.4498 | 0.54 |
| TE | top-12, yrs 1-4 | 164 / 35 | draft only, linear (old baseline) | 0.791 | 0.1357 | 0.4329 | 0.58 |
| TE | | | base rate (no model) | 0.500 | 0.1679 | 0.5184 | |

### Embargoed forward check (development classes 2013-2019)

Train only on classes whose whole outcome window had been played by the held-out class's draft.

| Pos | n | draft only, spline | talent + capital | LightGBM | draft only, linear | draft AUC | full AUC | Shipped hit model |
|---|---|---|---|---|---|---|---|---|
| QB | 75 | 0.3255 | 0.3363 | 0.3463 | 0.3281 | 0.857 | 0.860 | **draft only** |
| RB | 146 | 0.4859 | 0.4670 | 0.4685 | 0.4844 | 0.795 | 0.813 | **draft only** |
| WR | 200 | 0.3674 | 0.3439 | 0.3460 | 0.3838 | 0.812 | 0.827 | **draft only** |
| TE | 91 | 0.4524 | 0.4521 | 0.4609 | 0.4572 | 0.811 | 0.816 | **draft only** |

Log loss columns. Ship rule: a model replaces the spline draft-only baseline only if it has lower log loss in ALL THREE runs (development leave-one-class-out, embargoed forward, holdout) AND wins in at least 80% of draft-class bootstrap resamples of the development leave-one-class-out predictions.

### Verdict per position

- **QB**: talent + capital vs the spline baseline, log loss gain +0.0152 on the holdout (AUC 0.824 to 0.841), -0.0171 development leave-one-class-out, -0.0108 embargoed forward. Class bootstrap: positive in 12% of resamples (90% interval -0.0427 to +0.0058). Fails: development, forward, bootstrap under 80%. The hit probability ships from the draft-only model; the talent score still shows, as a profile, not a forecast.
  - LightGBM challenger: 0.3491 holdout, 0.4077 development, 0.3463 forward (not promoted).
- **RB**: talent + capital vs the spline baseline, log loss gain -0.0022 on the holdout (AUC 0.801 to 0.818), +0.0192 development leave-one-class-out, +0.0189 embargoed forward. Class bootstrap: positive in 98% of resamples (90% interval +0.0031 to +0.0361). Fails: holdout. The hit probability ships from the draft-only model; the talent score still shows, as a profile, not a forecast.
  - LightGBM challenger: 0.4671 holdout, 0.4457 development, 0.4685 forward (not promoted).
- **WR**: talent + capital vs the spline baseline, log loss gain -0.0150 on the holdout (AUC 0.877 to 0.853), +0.0259 development leave-one-class-out, +0.0236 embargoed forward. Class bootstrap: positive in 99% of resamples (90% interval +0.0080 to +0.0441). Fails: holdout. The hit probability ships from the draft-only model; the talent score still shows, as a profile, not a forecast.
  - LightGBM challenger: 0.3766 holdout, 0.3232 development, 0.3460 forward (not promoted).
- **TE**: talent + capital vs the spline baseline, log loss gain +0.0081 on the holdout (AUC 0.904 to 0.904), +0.0009 development leave-one-class-out, +0.0003 embargoed forward. Class bootstrap: positive in 54% of resamples (90% interval -0.0133 to +0.0139). Fails: bootstrap under 80%. The hit probability ships from the draft-only model; the talent score still shows, as a profile, not a forecast.
  - LightGBM challenger: 0.3007 holdout, 0.4498 development, 0.4609 forward (not promoted).

### Low-volume check (asserted on every build)

Talent score of a two-season career on a team throwing 16 passes a game (just over the 15 floor, so the shares count), at the best YPTPA and dominator a drafted player at the position posted on a normal passing team, every other feature at the median: RB 72.6, WR 89.6, TE 84.7. The build fails at 90 (top decile).

### Coefficients (final fit on every training class)

- QB draft only (spline in log pick, curvature penalized at C=0.1), hit chance by pick: 1 78%, 10 42%, 32 24%, 64 15%, 100 11%, 150 7%, 250 4%
- QB talent (C=0.1, standardized): `draft_age` -0.427, `comp_final` +0.424, `rush_ypg_best` +0.394, `power` +0.257
- QB full (C=0.1, standardized) + spline in log pick: `rush_ypg_best` +0.330, `comp_final` +0.177, `power` +0.145, `draft_age` -0.116
- RB draft only (spline in log pick, curvature penalized at C=0.1), hit chance by pick: 1 100%, 10 96%, 32 75%, 64 46%, 100 27%, 150 14%, 250 6%
- RB talent (C=0.1, standardized): `scrim_ypg` +0.605, `ryptpa_final` +0.446, `stars` +0.376, `speed_score` +0.356, `weight` +0.228
- RB full (C=0.1, standardized) + spline in log pick: `ryptpa_final` +0.388, `scrim_ypg` +0.219, `weight` +0.136, `stars` +0.114, `speed_score` +0.050
- WR draft only (spline in log pick, curvature penalized at C=0.1), hit chance by pick: 1 91%, 10 60%, 32 35%, 64 20%, 100 12%, 150 6%, 250 1%
- WR talent (C=0.1, standardized): `ryptpa_career` +0.668, `early` +0.403, `stars` +0.315
- WR full (C=0.1, standardized) + spline in log pick: `early` +0.346, `ryptpa_career` +0.342, `stars` +0.113
- TE draft only (spline in log pick, curvature penalized at C=0.1), hit chance by pick: 1 100%, 10 91%, 32 62%, 64 35%, 100 20%, 150 10%, 250 2%
- TE talent (C=0.1, standardized): `ryptpa_best` +0.628, `speed_score` +0.357, `power` +0.203
- TE full (C=0.1, standardized) + spline in log pick: `ryptpa_best` +0.325, `speed_score` +0.165, `power` +0.061

### Calibration by decile of the shipped hit model (out of sample: development leave-one-class-out plus holdout walk-forward)

| Pos | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB pred | 0.03 | 0.04 | 0.05 | 0.06 | 0.08 | 0.11 | 0.15 | 0.24 | 0.42 | 0.71 |
| QB obs | 0.06 | 0.00 | 0.06 | 0.00 | 0.25 | 0.00 | 0.07 | 0.38 | 0.56 | 0.62 |
| RB pred | 0.05 | 0.07 | 0.09 | 0.11 | 0.15 | 0.20 | 0.27 | 0.41 | 0.58 | 0.86 |
| RB obs | 0.09 | 0.03 | 0.13 | 0.16 | 0.16 | 0.03 | 0.22 | 0.65 | 0.53 | 0.78 |
| WR pred | 0.01 | 0.02 | 0.03 | 0.05 | 0.09 | 0.13 | 0.17 | 0.23 | 0.31 | 0.49 |
| WR obs | 0.00 | 0.00 | 0.02 | 0.07 | 0.07 | 0.09 | 0.22 | 0.24 | 0.35 | 0.53 |
| TE pred | 0.03 | 0.05 | 0.07 | 0.10 | 0.13 | 0.17 | 0.21 | 0.27 | 0.40 | 0.65 |
| TE obs | 0.00 | 0.05 | 0.05 | 0.10 | 0.10 | 0.25 | 0.25 | 0.20 | 0.30 | 0.71 |

Each decile holds about a tenth of the position's sample (n per cell = n / 10).

### Tier hit rates (tiers cut on the same out-of-sample talent score)

| Pos | Blue Chip (>= 90) | Plus Starter (>= 70) | Contributor (>= 45) | Project (>= 20) | Long Shot (>= 0) |
|---|---|---|---|---|---|
| QB | 56% (n=16) | 31% (n=32) | 10% (n=39) | 10% (n=40) | 16% (n=31) |
| RB | 75% (n=32) | 41% (n=64) | 25% (n=79) | 16% (n=79) | 8% (n=63) |
| WR | 51% (n=47) | 26% (n=92) | 12% (n=116) | 6% (n=115) | 4% (n=92) |
| TE | 43% (n=21) | 35% (n=40) | 24% (n=51) | 4% (n=51) | 10% (n=40) |
<!-- METRICS:END -->
