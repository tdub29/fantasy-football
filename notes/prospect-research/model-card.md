# Prospect model card

Built 2026-09-27 by `projections/build_prospect_model.py`, which also rewrites every number between
the METRICS markers below on each run, so the tables always describe the shipped file
(`site/data/prospect-model.js`). The prose above the markers is hand-written; if a rebuild flips a
verdict, the verdict lines in the block say so and this section needs a reread.

Spec and evidence: `wr-te-models.md`, `rb-qb-methodology.md`, `dynasty-domain-bakery.md`. Data and
its verified coverage: `data-sources.md`.

## Bottom line

Draft capital is most of the signal, as the research said. College production adds a small,
real amount at **WR** and **RB** and nothing reliable at **QB** or **TE**:

- **WR**: talent + capital lowers log loss by 0.011 leave-one-class-out and 0.004 forward-chained,
  winning in 85% of draft-class bootstrap resamples. Ships the full model.
- **RB**: 0.006 and 0.008, winning in 89% of resamples. Ships the full model. The survivor is
  final-season receiving yards per team pass attempt, as Cole and Fantasy Life found.
- **QB** and **TE**: the full model ties capital alone (50% and 59% of resamples). Both ship the
  draft-only hit probability. Their talent score still shows, labelled as a profile, not a forecast.

The talent score (no draft capital) is well short of capital alone everywhere (WR AUC 0.75 vs
0.83), which is the expected shape: it is the pre-draft read, and the NFL's own evaluation, which
the pick encodes, knows more than a box score.

## What it predicts

| Position | Hit | Window | Base rate | Training classes |
|---|---|---|---|---|
| WR | top-24 WR season by PPR points per game, 8+ games | NFL years 1-3 | 16% | 2008-2023 |
| RB | top-24 RB season by PPR points per game, 8+ games | NFL years 1-3 | 30% | 2008-2023 |
| QB | top-12 QB season by PPR points per game, 8+ games | NFL years 1-4 | 19% | 2008-2022 |
| TE | top-12 TE season by PPR points per game, 8+ games | NFL years 1-4 | 21% | 2008-2022 |

QB and TE get four years because both develop later (rb-qb-methodology 4.1, wr-te-models 4). Only
classes whose whole window has been played are used. The continuous check is the best PPR PPG in
the window (0 when he never had an 8-game season); the tables report the correlation of each
model's out-of-sample logit with it. Population: every QB/RB/WR/TE drafted since 2008 whose college
career could be linked (90.6%, see data-sources.md). Undrafted players are out, as in the research
baselines.

## Features

| Position | Talent features (full model adds log pick) |
|---|---|
| WR | career receiving yards per team pass attempt; breakout age (first qualifying season at a 20% dominator); early declare (3 or fewer college seasons with stats); recruiting stars |
| RB | final-season receiving yards per team pass attempt; career scrimmage yards per game; weight; speed score; recruiting stars |
| QB | best-season rushing yards per game in a passing season; final-season completion %; draft age; Power conference |
| TE | best-season receiving yards per team pass attempt; speed score; Power conference |

Definitions. Team totals are the sum of every player on that team in the same ESPN play-by-play
file, so a game missing from the feed drops out of numerator and denominator alike. Dominator =
mean of yards share and TD share (receiving for WR/TE, scrimmage for RB). A season qualifies at half
the team's games (min 3); the in-progress season must reach 6 games before it counts as a best or
final season. Ages are on Sept 1 of the season from the nflverse birth date; draft age is on April 25.
Speed score is (weight x 200) / forty^4 from the nflverse combine, the same helper `prospect.js` uses.
A season on a team that threw fewer than 15 passes a game adds nothing to any YPTPA feature and
cannot be a breakout season (see "Low-volume shares"); the card still shows the stat as posted.

## Method

- **Three models per position**, all logistic: draft only (log pick, unpenalized), talent (L2,
  C = 0.1 on standardized features), full (talent + log pick). Missing values take the training
  median inside each fold.
- **log(pick) is effectively unpenalized in the full model** (scaled up after standardizing). The
  first build penalized it like a college stat, which shrank the one strong signal and made every
  full model lose to the baseline. That was a modelling error, not a finding.
- **Validation**: leave-one-draft-class-out for every model; a forward-chained run (train on earlier
  classes only, test 2013 on) as the second check. Folds are asserted never to train on the held-out
  class.
- **Ship rule**: a model replaces the draft-only baseline only if it has lower log loss in both runs
  and wins in at least 80% of draft-class bootstrap resamples. A positive point estimate alone is
  not a win.
- **Challenger**: a monotone-constrained LightGBM (3 leaves, 150 trees) on the full feature set. It
  won leave-one-class-out at WR and forward at QB, never both, so it is not shipped anywhere.
- **Tiers** (our names): Blue Chip >= 90th talent percentile, Plus Starter >= 70, Contributor >= 45,
  Project >= 20, Long Shot below. Percentiles are against every drafted player at the position since
  2008, on out-of-sample talent scores, so the tier hit rates below are honest ones.
- **Comps**: the three nearest historical draftees on the standardized features, each weighted by
  its absolute coefficient. NFL players are matched in the full-model space (capital included);
  college players in the talent space.

## Read these before trusting a number

1. **Selection optimism.** The first feature sets (6-7 per position, straight from the research)
   lost to capital alone everywhere. The shipped sets are research-backed subsets kept after one
   leave-one-class-out pruning pass on the same data, and C was fixed near where that pass found
   the best values. Both steps flatter the leave-one-class-out numbers a little. The forward-chained
   run and the class bootstrap are the guards, and the gains that survive are small.
2. **Small samples.** 29 QB and 41 TE hits. One draft class moves the QB interval by about 0.02 log
   loss either way.
3. **College ages are estimated.** ESPN publishes no date of birth for current players, so a college
   player's age is 18.71 plus years since his first season on file (or his recruit class, or the
   class year on the 2025+ rosters, whichever is earliest). On drafted players with a real birth
   date the draft-age error has a 1.25-year SD. That noise lands on breakout age and draft age.
4. **College players have no combine.** Speed score is imputed at the median for them, so RB and
   TE talent scores for current players carry no athleticism.
5. **"If drafted" is conditional.** Round-scenario probabilities assume he is drafted in that range
   and averages the model over every pick in it (Round 1 = 1-32, Round 2 = 33-64, Round 3 = 65-100,
   Day 3 = 101-257). Where the draft-only model ships (QB, TE) every player gets the same
   scenario numbers, which is the honest output.
6. **The in-progress season** counts once it reaches 6 games. Until then a current player's profile
   is his completed seasons (or the live one, if it is all he has).
7. **Historical players on the card show leave-one-class-out numbers**: the model that scored a
   2019 WR never saw the 2019 class. Classes after the training window use the final fit.

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

**Before and after** (log loss, lower is better; draft-only baselines do not move):

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

**College WRs, the old top 10:**

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

T.J. Moore (Clemson) moves up from 11 to 10. The college RB and TE top 10s are unchanged. What
still holds Anderson at 68 is youth and the early-declare flag, which every underclassman carries
by construction, not his shares.

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
| **floor only (shipped)** | 0.3435 / 0.3734 | 0.4586 / 0.4548 | 0.4226 / 0.4174 | #34, 68 | 42 to 59 |

Shrinkage treats the problem as sampling noise, and it is mostly structure: a team that passes 9
times a game throws play-action shots, so its YPTPA stays inflated year after year (a label-free fit
of K on season-to-season stability came out flat for that reason). Shrinking the dominator as well
broke the breakout test, because a pull toward the drafted mean (22.6%, above the 20% line) makes a
thin season clear the line more easily: Henry Ruggs's breakout age went from 21.6 to 18.6. Adding
shrinkage on top of the floor bought RB 0.0006 and cost TE 0.0030, so it is not in the build.

**The guard.** Every build scores a two-season career on a team throwing 12 passes a game, at the
best YPTPA and dominator any drafted player at the position posted on a normal passing team, with
every other feature at the training median, and fails if that lands in the top decile. Before the
floor it scored 100 (WR), 97 (RB) and 100 (TE); the shipped numbers are in the block below. The
`--self-check` holds the same property against a toy model that runs on YPTPA alone.

**Selection.** About 30 variants were scored on the same cross-validation before this one was picked
by a stated rule (stop the artifact and pass the guard at the smallest cost), so these numbers carry
the same mild optimism as the feature pruning in item 1 above.

## Headline numbers

These are rewritten by the builder on every run.

<!-- METRICS:BEGIN (build_prospect_model.py rewrites this block) -->
Linked 1382 of 1525 drafted QB/RB/WR/TE since 2008 to college data (86% of 2008-2016 classes, 95% of 2017-2026).

### Headline: leave-one-draft-class-out

| Pos | Target | n / hits | Model | AUC | Brier | Log loss | r vs best PPG |
|---|---|---|---|---|---|---|---|
| QB | top-12, yrs 1-4 | 153 / 29 | draft only (baseline) | 0.808 | 0.1231 | 0.3925 | 0.69 |
| QB | top-12, yrs 1-4 | 153 / 29 | talent (no capital) | 0.708 | 0.1398 | 0.4446 | 0.45 |
| QB | top-12, yrs 1-4 | 153 / 29 | talent + capital | 0.819 | 0.1246 | 0.3931 | 0.70 |
| QB | top-12, yrs 1-4 | 153 / 29 | monotone LightGBM (challenger) | 0.828 | 0.1239 | 0.3944 | 0.70 |
| QB | | | base rate 19.0% (no model) | 0.500 | 0.1536 | 0.4856 | |
| RB | top-24, yrs 1-3 | 309 / 92 | draft only (baseline) | 0.800 | 0.1493 | 0.4648 | 0.67 |
| RB | top-24, yrs 1-3 | 309 / 92 | talent (no capital) | 0.717 | 0.1776 | 0.5347 | 0.50 |
| RB | top-24, yrs 1-3 | 309 / 92 | talent + capital | 0.807 | 0.1463 | 0.4586 | 0.66 |
| RB | top-24, yrs 1-3 | 309 / 92 | monotone LightGBM (challenger) | 0.800 | 0.1489 | 0.4709 | 0.66 |
| RB | | | base rate 29.8% (no model) | 0.500 | 0.2091 | 0.6089 | |
| WR | top-24, yrs 1-3 | 446 / 72 | draft only (baseline) | 0.833 | 0.1112 | 0.3548 | 0.59 |
| WR | top-24, yrs 1-3 | 446 / 72 | talent (no capital) | 0.748 | 0.1154 | 0.3829 | 0.46 |
| WR | top-24, yrs 1-3 | 446 / 72 | talent + capital | 0.827 | 0.1061 | 0.3435 | 0.62 |
| WR | top-24, yrs 1-3 | 446 / 72 | monotone LightGBM (challenger) | 0.838 | 0.1051 | 0.3391 | 0.62 |
| WR | | | base rate 16.1% (no model) | 0.500 | 0.1354 | 0.4420 | |
| TE | top-12, yrs 1-4 | 200 / 41 | draft only (baseline) | 0.771 | 0.1310 | 0.4242 | 0.56 |
| TE | top-12, yrs 1-4 | 200 / 41 | talent (no capital) | 0.713 | 0.1505 | 0.4667 | 0.38 |
| TE | top-12, yrs 1-4 | 200 / 41 | talent + capital | 0.775 | 0.1300 | 0.4226 | 0.57 |
| TE | top-12, yrs 1-4 | 200 / 41 | monotone LightGBM (challenger) | 0.761 | 0.1277 | 0.4286 | 0.56 |
| TE | | | base rate 20.5% (no model) | 0.500 | 0.1630 | 0.5073 | |

### Forward-chained check (train on earlier classes only, test 2013 on)

| Pos | n | draft only | talent + capital | LightGBM | draft AUC | full AUC | Shipped hit model |
|---|---|---|---|---|---|---|---|
| QB | 102 | 0.3810 | 0.3771 | 0.3220 | 0.817 | 0.829 | **draft only** |
| RB | 218 | 0.4628 | 0.4548 | 0.4649 | 0.792 | 0.797 | **talent + capital** |
| WR | 315 | 0.3771 | 0.3734 | 0.4006 | 0.817 | 0.796 | **talent + capital** |
| TE | 128 | 0.4215 | 0.4174 | 0.4366 | 0.777 | 0.779 | **draft only** |

Log loss columns. Ship rule: a model replaces the draft-only baseline only if it has lower log loss in BOTH the leave-one-class-out and the forward-chained runs AND wins in at least 80% of draft-class bootstrap resamples of the leave-one-class-out predictions.

### Verdict per position

- **QB**: talent + capital vs capital alone, log loss gain -0.0006 leave-one-class-out and +0.0039 forward-chained (AUC 0.808 to 0.819). Class bootstrap: the gain is positive in 50% of resamples (90% interval -0.0222 to +0.0193). That is not a reliable win over capital alone, so the hit probability ships from the draft-only model; the talent score still shows as the pre-draft profile.
  - LightGBM challenger: 0.3944 leave-one-class-out, 0.3220 forward (not promoted).
- **RB**: talent + capital vs capital alone, log loss gain +0.0062 leave-one-class-out and +0.0080 forward-chained (AUC 0.800 to 0.807). Class bootstrap: the gain is positive in 89% of resamples (90% interval -0.0023 to +0.0144). Ships **talent + capital**.
  - LightGBM challenger: 0.4709 leave-one-class-out, 0.4649 forward (not promoted).
- **WR**: talent + capital vs capital alone, log loss gain +0.0112 leave-one-class-out and +0.0037 forward-chained (AUC 0.833 to 0.827). Class bootstrap: the gain is positive in 85% of resamples (90% interval -0.0072 to +0.0273). Ships **talent + capital**.
  - LightGBM challenger: 0.3391 leave-one-class-out, 0.4006 forward (not promoted).
- **TE**: talent + capital vs capital alone, log loss gain +0.0016 leave-one-class-out and +0.0041 forward-chained (AUC 0.771 to 0.775). Class bootstrap: the gain is positive in 59% of resamples (90% interval -0.0078 to +0.0114). That is not a reliable win over capital alone, so the hit probability ships from the draft-only model; the talent score still shows as the pre-draft profile.
  - LightGBM challenger: 0.4286 leave-one-class-out, 0.4366 forward (not promoted).

### Low-volume check (asserted on every build)

Talent score of a two-season career on a team throwing 12 passes a game, at the best YPTPA and dominator a drafted player at the position posted on a normal passing team, every other feature at the median: RB 42, WR 43, TE 59. The build fails at 90 (top decile).

### Standardized coefficients (final fit on every training class)

- QB draft (unpenalized): `log_pick` -1.153
- QB talent (C=0.1): `draft_age` -0.469, `comp_final` +0.400, `rush_ypg_best` +0.285, `power` +0.258
- QB full (C=0.1): `log_pick` -1.020, `rush_ypg_best` +0.308, `power` +0.180, `comp_final` +0.177, `draft_age` -0.128
- RB draft (unpenalized): `log_pick` -1.503
- RB talent (C=0.1): `ryptpa_final` +0.430, `scrim_ypg` +0.354, `speed_score` +0.322, `stars` +0.321, `weight` +0.315
- RB full (C=0.1): `log_pick` -1.421, `ryptpa_final` +0.332, `weight` +0.219, `stars` +0.060, `scrim_ypg` -0.050, `speed_score` +0.025
- WR draft (unpenalized): `log_pick` -1.150
- WR talent (C=0.1): `ryptpa_career` +0.532, `early` +0.364, `breakout_age` -0.307, `stars` +0.295
- WR full (C=0.1): `log_pick` -0.930, `early` +0.309, `ryptpa_career` +0.269, `breakout_age` -0.197, `stars` +0.117
- TE draft (unpenalized): `log_pick` -1.165
- TE talent (C=0.1): `ryptpa_best` +0.566, `speed_score` +0.310, `power` +0.188
- TE full (C=0.1): `log_pick` -1.009, `ryptpa_best` +0.295, `speed_score` +0.131, `power` +0.060

### Calibration by decile of the shipped hit model (out of sample)

| Pos | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB pred | 0.05 | 0.06 | 0.07 | 0.08 | 0.09 | 0.11 | 0.14 | 0.21 | 0.37 | 0.70 |
| QB obs | 0.06 | 0.00 | 0.07 | 0.07 | 0.12 | 0.07 | 0.07 | 0.33 | 0.53 | 0.56 |
| RB pred | 0.06 | 0.09 | 0.11 | 0.13 | 0.17 | 0.22 | 0.29 | 0.42 | 0.61 | 0.87 |
| RB obs | 0.13 | 0.06 | 0.13 | 0.13 | 0.13 | 0.10 | 0.26 | 0.65 | 0.55 | 0.84 |
| WR pred | 0.02 | 0.03 | 0.04 | 0.05 | 0.07 | 0.09 | 0.13 | 0.20 | 0.34 | 0.63 |
| WR obs | 0.02 | 0.02 | 0.05 | 0.07 | 0.02 | 0.09 | 0.16 | 0.27 | 0.32 | 0.60 |
| TE pred | 0.05 | 0.06 | 0.08 | 0.10 | 0.12 | 0.15 | 0.19 | 0.24 | 0.39 | 0.68 |
| TE obs | 0.05 | 0.05 | 0.10 | 0.05 | 0.10 | 0.25 | 0.25 | 0.20 | 0.30 | 0.70 |

Each decile holds about a tenth of the position's sample (n per cell = n / 10).

### Tier hit rates (tiers cut on the out-of-sample talent score)

| Pos | Blue Chip (>= 90) | Plus Starter (>= 70) | Contributor (>= 45) | Project (>= 20) | Long Shot (>= 0) |
|---|---|---|---|---|---|
| QB | 50% (n=16) | 33% (n=30) | 8% (n=39) | 13% (n=38) | 10% (n=30) |
| RB | 71% (n=31) | 42% (n=62) | 26% (n=77) | 21% (n=78) | 13% (n=61) |
| WR | 56% (n=45) | 22% (n=89) | 12% (n=112) | 8% (n=111) | 6% (n=89) |
| TE | 38% (n=21) | 38% (n=40) | 20% (n=50) | 8% (n=50) | 10% (n=39) |
<!-- METRICS:END -->
