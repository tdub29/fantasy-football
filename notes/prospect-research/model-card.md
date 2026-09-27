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
- **RB**: 0.007 and 0.008, winning in 91% of resamples. Ships the full model. The survivor is
  final-season receiving yards per team pass attempt, as Cole and Fantasy Life found.
- **QB** and **TE**: the full model ties capital alone (50% and 51% of resamples). Both ship the
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
| RB | top-24, yrs 1-3 | 309 / 92 | talent (no capital) | 0.719 | 0.1768 | 0.5326 | 0.50 |
| RB | top-24, yrs 1-3 | 309 / 92 | talent + capital | 0.807 | 0.1461 | 0.4578 | 0.66 |
| RB | top-24, yrs 1-3 | 309 / 92 | monotone LightGBM (challenger) | 0.803 | 0.1481 | 0.4680 | 0.66 |
| RB | | | base rate 29.8% (no model) | 0.500 | 0.2091 | 0.6089 | |
| WR | top-24, yrs 1-3 | 446 / 72 | draft only (baseline) | 0.833 | 0.1112 | 0.3548 | 0.59 |
| WR | top-24, yrs 1-3 | 446 / 72 | talent (no capital) | 0.746 | 0.1159 | 0.3842 | 0.45 |
| WR | top-24, yrs 1-3 | 446 / 72 | talent + capital | 0.827 | 0.1062 | 0.3439 | 0.61 |
| WR | top-24, yrs 1-3 | 446 / 72 | monotone LightGBM (challenger) | 0.837 | 0.1057 | 0.3401 | 0.61 |
| WR | | | base rate 16.1% (no model) | 0.500 | 0.1354 | 0.4420 | |
| TE | top-12, yrs 1-4 | 200 / 41 | draft only (baseline) | 0.771 | 0.1310 | 0.4242 | 0.56 |
| TE | top-12, yrs 1-4 | 200 / 41 | talent (no capital) | 0.708 | 0.1517 | 0.4699 | 0.36 |
| TE | top-12, yrs 1-4 | 200 / 41 | talent + capital | 0.773 | 0.1305 | 0.4240 | 0.56 |
| TE | top-12, yrs 1-4 | 200 / 41 | monotone LightGBM (challenger) | 0.756 | 0.1290 | 0.4314 | 0.56 |
| TE | | | base rate 20.5% (no model) | 0.500 | 0.1630 | 0.5073 | |

### Forward-chained check (train on earlier classes only, test 2013 on)

| Pos | n | draft only | talent + capital | LightGBM | draft AUC | full AUC | Shipped hit model |
|---|---|---|---|---|---|---|---|
| QB | 102 | 0.3810 | 0.3771 | 0.3220 | 0.817 | 0.829 | **draft only** |
| RB | 218 | 0.4628 | 0.4546 | 0.4653 | 0.792 | 0.798 | **talent + capital** |
| WR | 315 | 0.3771 | 0.3730 | 0.3935 | 0.817 | 0.798 | **talent + capital** |
| TE | 128 | 0.4215 | 0.4177 | 0.4345 | 0.777 | 0.776 | **draft only** |

Log loss columns. Ship rule: a model replaces the draft-only baseline only if it has lower log loss in BOTH the leave-one-class-out and the forward-chained runs AND wins in at least 80% of draft-class bootstrap resamples of the leave-one-class-out predictions.

### Verdict per position

- **QB**: talent + capital vs capital alone, log loss gain -0.0006 leave-one-class-out and +0.0039 forward-chained (AUC 0.808 to 0.819). Class bootstrap: the gain is positive in 50% of resamples (90% interval -0.0222 to +0.0193). That is not a reliable win over capital alone, so the hit probability ships from the draft-only model; the talent score still shows as the pre-draft profile.
  - LightGBM challenger: 0.3944 leave-one-class-out, 0.3220 forward (not promoted).
- **RB**: talent + capital vs capital alone, log loss gain +0.0070 leave-one-class-out and +0.0082 forward-chained (AUC 0.800 to 0.807). Class bootstrap: the gain is positive in 91% of resamples (90% interval -0.0017 to +0.0153). Ships **talent + capital**.
  - LightGBM challenger: 0.4680 leave-one-class-out, 0.4653 forward (not promoted).
- **WR**: talent + capital vs capital alone, log loss gain +0.0108 leave-one-class-out and +0.0041 forward-chained (AUC 0.833 to 0.827). Class bootstrap: the gain is positive in 85% of resamples (90% interval -0.0071 to +0.0265). Ships **talent + capital**.
  - LightGBM challenger: 0.3401 leave-one-class-out, 0.3935 forward (not promoted).
- **TE**: talent + capital vs capital alone, log loss gain +0.0002 leave-one-class-out and +0.0038 forward-chained (AUC 0.771 to 0.773). Class bootstrap: the gain is positive in 51% of resamples (90% interval -0.0089 to +0.0096). That is not a reliable win over capital alone, so the hit probability ships from the draft-only model; the talent score still shows as the pre-draft profile.
  - LightGBM challenger: 0.4314 leave-one-class-out, 0.4345 forward (not promoted).

### Standardized coefficients (final fit on every training class)

- QB draft (unpenalized): `log_pick` -1.153
- QB talent (C=0.1): `draft_age` -0.469, `comp_final` +0.400, `rush_ypg_best` +0.285, `power` +0.258
- QB full (C=0.1): `log_pick` -1.020, `rush_ypg_best` +0.308, `power` +0.180, `comp_final` +0.177, `draft_age` -0.128
- RB draft (unpenalized): `log_pick` -1.503
- RB talent (C=0.1): `ryptpa_final` +0.451, `scrim_ypg` +0.355, `weight` +0.314, `stars` +0.314, `speed_score` +0.313
- RB full (C=0.1): `log_pick` -1.413, `ryptpa_final` +0.346, `weight` +0.219, `stars` +0.057, `scrim_ypg` -0.048, `speed_score` +0.023
- WR draft (unpenalized): `log_pick` -1.150
- WR talent (C=0.1): `ryptpa_career` +0.532, `early` +0.365, `stars` +0.297, `breakout_age` -0.285
- WR full (C=0.1): `log_pick` -0.932, `early` +0.305, `ryptpa_career` +0.281, `breakout_age` -0.164, `stars` +0.123
- TE draft (unpenalized): `log_pick` -1.165
- TE talent (C=0.1): `ryptpa_best` +0.547, `speed_score` +0.304, `power` +0.197
- TE full (C=0.1): `log_pick` -1.020, `ryptpa_best` +0.276, `speed_score` +0.127, `power` +0.062

### Calibration by decile of the shipped hit model (out of sample)

| Pos | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB pred | 0.05 | 0.06 | 0.07 | 0.08 | 0.09 | 0.11 | 0.14 | 0.21 | 0.37 | 0.70 |
| QB obs | 0.06 | 0.00 | 0.07 | 0.07 | 0.12 | 0.07 | 0.07 | 0.33 | 0.53 | 0.56 |
| RB pred | 0.06 | 0.09 | 0.11 | 0.13 | 0.17 | 0.22 | 0.29 | 0.41 | 0.61 | 0.88 |
| RB obs | 0.13 | 0.06 | 0.13 | 0.13 | 0.13 | 0.10 | 0.26 | 0.65 | 0.55 | 0.84 |
| WR pred | 0.02 | 0.03 | 0.04 | 0.05 | 0.07 | 0.09 | 0.13 | 0.20 | 0.34 | 0.63 |
| WR obs | 0.02 | 0.04 | 0.00 | 0.09 | 0.02 | 0.09 | 0.16 | 0.27 | 0.34 | 0.58 |
| TE pred | 0.05 | 0.06 | 0.08 | 0.10 | 0.12 | 0.15 | 0.19 | 0.24 | 0.39 | 0.68 |
| TE obs | 0.05 | 0.05 | 0.10 | 0.05 | 0.10 | 0.25 | 0.25 | 0.20 | 0.30 | 0.70 |

Each decile holds about a tenth of the position's sample (n per cell = n / 10).

### Tier hit rates (tiers cut on the out-of-sample talent score)

| Pos | Blue Chip (>= 90) | Plus Starter (>= 70) | Contributor (>= 45) | Project (>= 20) | Long Shot (>= 0) |
|---|---|---|---|---|---|
| QB | 50% (n=16) | 33% (n=30) | 8% (n=39) | 13% (n=38) | 10% (n=30) |
| RB | 71% (n=31) | 42% (n=62) | 26% (n=77) | 21% (n=78) | 13% (n=61) |
| WR | 53% (n=45) | 22% (n=89) | 12% (n=112) | 8% (n=111) | 6% (n=89) |
| TE | 38% (n=21) | 38% (n=40) | 20% (n=50) | 8% (n=50) | 10% (n=39) |
<!-- METRICS:END -->
