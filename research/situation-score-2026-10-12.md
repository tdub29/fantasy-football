# Situation score for NFL landing spot: research and backtest (2026-10-12)

**Bottom line.** No landing-spot feature beat the shipped model on the model's own bar. That covers prior-season team pass volume, QB EPA per dropback, vacated opportunity, returning same-position competition and same-draft competition. Draft capital already prices the one strong situation signal, which is QB vacancy. At RB, WR and TE the remaining signals point the intuitive way but are too small to survive out of sample. Show situation as a note on the card. Do not fold it into the score.

Script: `projections/_situation/situation_backtest.py` (it writes `results.csv` and `feature_checks.csv` next to itself). The script imports `build_prospect_model` read-only and reuses its training table, `FEATS`, `fit_full`, `fit_baseline`, `cv_predict` (embargoed forward folds) and `class_bootstrap`.

## 1. What the public literature says

- **Capital buys opportunity, so it already carries much of the landing spot.** Keefer (2015, *J. Sports Economics*) used a fuzzy regression discontinuity at the round 1/2 cutoff. He found that a 10% increase in salary-cap value yields about 2.7 more games started, with no productivity difference. Teams play the players they paid for, so pick number partly measures future opportunity. ([IZA DP 7801](https://docs.iza.org/dp7801.pdf), [Springer](https://link.springer.com/doi/10.1007/s12122-015-9215-y))
- **RB production is volume-driven, and capital is the best pre-season proxy for volume.** FantasyPros' rookie RB primers report that capital correlates strongly with RB production because it signals opportunity. ([FantasyPros 2024](https://www.fantasypros.com/2024/05/fantasy-football-rookie-running-backs-dynasty-fantasy-football/amp/), [2026](https://www.fantasypros.com/2026/04/how-to-value-rookie-rbs-in-fantasy-football-pre-nfl-draft/amp/)) NFL.com found that almost every rookie RB1 had 225 or more touches. ([NFL.com](https://www.nfl.com/news/how-to-avoid-overpaying-for-rookie-rb-wr-in-fantasy-football))
- **The one regression of landing spot against skill did not control for capital.** Fantasy Footballers measured returning and vacated points. Per SD of returning points, the standardized coefficients were RB -0.37, WR -0.21, QB -0.48 and TE -0.28. The author says he had no reliable capital data, and "skill" was measured from future seasons. The study shows that vacancy correlates with rookie-year points. It does not show that vacancy adds anything beyond pick. ([Fantasy Footballers](https://www.thefantasyfootballers.com/articles/what-matters-more-for-rookies-skill-or-landing-spot-fantasy-football/))
- **Most practitioner pieces are anecdotal.** Vacated-target tables are published every year ([4for4 2018](https://www.4for4.com/2018/preseason/2018-nfl-draft-fantasy-stock-watch), [PFF vacated targets](https://pff.com/news/fantasy-football-analyzing-vacated-targets-to-find-2020-breakout-receivers)), but none I found tests them against capital. PFF ([WR](https://www.profootballfocus.com/news/fantasy-football-evaluating-the-fantasy-landing-spots-of-the-top-drafted-rookie-wide-receivers), [RB](https://pff.com/news/evaluating-the-fantasy-landing-spots-of-the-top-drafted-running-backs)) calls landing spot the biggest factor once the draft happens, but it also says the higher pick is likelier to hit. Rotoballer's view is "talent wins out over landing spot unless extreme, making draft capital the more important variable." Establish The Run argues landing spot interacts with capital: it matters for Day 2 picks and much less for Day 3. ([Establish The Run](https://establishtherun.com/?p=812102))
- **Capital hit-rate baselines** ([Footballguys 2026](https://www.footballguys.com/article/2026-draft-capital-matters-rookie-wide-receivers), [Razzball](https://football.razzball.com/does-nfl-draft-capital-matter-wide-receiver-edition/)) all show steep decay with pick. None of them partials out situation.
- **Not covered here:** coaching stability and OL quality. I found no capital-controlled study for either, and neither is in the local cache.

**Read of the literature:** situation correlates with outcomes, and capital is the main confounder. No public study I found shows situation adding signal *on top of* capital.

## 2. Backtest

**Rows.** The model's drafted, linked, mature-window rows, classes 2009 onward. Class 2008 has no prior NFL season on file. Henry Ruggs stays excluded.

**Baselines.** `draft` is the log-pick spline. `full` is the position's talent `FEATS` plus log pick, which is what the model fits. Each candidate adds one situation column to `full` and to `draft`, using the same ridge as a college stat (C=0.1).

**Validation.**
- Forward chaining embargoed by the outcome window (3 years for RB/WR, 4 for QB/TE), with test classes from 2013 to the last mature class. This is the same scheme as `prospect_experiments.py`.
- Leave-one-class-out (LOCO) log loss as a second run.
- `p_better` is the share of 4,000 draft-class bootstrap resamples where the candidate has lower forward log loss. The model ships a change only at 0.80 or above (`BOOT_P`).

**Features, all keyed to the drafting franchise.**

| Feature | Definition | Leakage |
|---|---|---|
| `pass_pg` | prior-season team pass attempts per game | none |
| `qb_epa` | prior-season team passing EPA / (attempts + sacks) | none |
| `vac` | share of prior-season team opportunity (targets for WR/TE, carries for RB, attempts for QB) held by players **not** on the draft-year roster | **optimistic**: draft-year roster includes post-draft camp cuts and trades |
| `comp_pos` | share of that opportunity held by **returning** players at his position | same as `vac` |
| `mate` | the team took a player at his position earlier in the same draft | none |

Because of the leakage, a null on `vac` or `comp_pos` would survive fixing the leak, and any gain on them would only be an upper bound. Coverage is 100% for every feature except `vac`/`comp_pos`, which are missing for 2.3% of rows (team-season not matched).

### Results: forward log loss and AUC change versus the full model

Lower log loss is better. Negative `d_ll` and positive `d_auc` would mean the situation feature helps.

| Pos | n fwd (hits) | full LL / AUC | +pass_pg | +qb_epa | +vac | +comp_pos | +mate | +3 combined |
|---|---|---|---|---|---|---|---|---|
| QB | 95 (20) | 0.3960 / 0.834 | +0.0137 / -0.021 (p .04) | +0.0022 / -0.003 (p .07) | +0.0007 / -0.005 (p .23) | +0.0007 / -0.005 (p .21) | +0.0025 / -0.003 (p .11) | +0.0156 / -0.025 (p .01) |
| RB | 223 (64) | 0.4915 / 0.793 | +0.0008 / -0.004 (p .44) | +0.0017 / -0.002 (p .04) | +0.0046 / -0.004 (p .24) | +0.0054 / -0.005 (p .15) | **-0.0031 / +0.006 (p .80)** | +0.0028 / -0.003 (p .39) |
| WR | 323 (54) | 0.3452 / 0.832 | +0.0018 / -0.002 (p .22) | +0.0027 / -0.003 (p .23) | +0.0004 / -0.002 (p .43) | -0.0009 / +0.001 (p .74) | +0.0021 / -0.002 (p .08) | +0.0042 / -0.005 (p .17) |
| TE | 114 (21) | 0.4043 / 0.808 | +0.0023 / +0.005 (p .25) | -0.0031 / -0.006 (p .79) | +0.0072 / -0.033 (p .26) | -0.0001 / -0.001 (p .64) | +0.0007 / -0.004 (p .38) | +0.0094 / -0.031 (p .16) |

Each cell is Δ log loss / Δ AUC (p_better). "+3 combined" adds `pass_pg`, `vac` and `mate` together. The draft-only + situation variants show the same pattern (see `results.csv`).

Forward draft-only versus full, for reference: QB 0.3947 vs 0.3960, RB 0.5035 vs 0.4915, WR 0.3491 vs 0.3452, TE 0.4129 vs 0.4043.

**Nothing clears the shipping bar (p ≥ 0.80 and better in both runs).**
- **RB `mate`** is the only candidate at the bar (p = 0.80; LOCO 0.4213 vs 0.4255). Its sign is backwards, though: +0.28 per unit, meaning a second RB drafted after a teammate RB hits *more* often at a given pick. No mechanism supports that sign, so it is very likely noise from about 30 such cases. A monotone constraint would remove it.
- **TE `qb_epa`** reaches p = 0.79 forward but is worse in LOCO (0.3979 vs 0.3903).
- **WR `comp_pos`** wins by 0.0009, p = 0.74. That is a coin flip.
- **The combined set is worse everywhere**, which is the usual small-sample result of adding several weak columns.

### Is capital already pricing it?

Spearman correlations, from `feature_checks.csv`:

| Pos | Feature | ρ with log pick | ρ with hit | Standardized coefficient in full + feature |
|---|---|---|---|---|
| QB | `vac` | **-0.46** | +0.28 | ≈0 |
| QB | `qb_epa` | **+0.39** | -0.18 | +0.13 (wrong sign) |
| WR | `vac` | -0.12 | +0.11 | +0.17 |
| WR | `comp_pos` | +0.15 | -0.14 | -0.20 |
| WR | `qb_epa` | +0.08 | +0.02 | +0.18 |
| RB | `vac` | -0.09 | +0.12 | +0.15 |
| RB | `comp_pos` | +0.07 | -0.10 | -0.14 |
| TE | `vac` | -0.10 | -0.05 | -0.17 (wrong sign) |

- **QB: capital fully prices situation.** Teams with a vacant QB job and a bad QB draft QBs early. Once pick is in the model, the raw +0.28 vacancy-to-hit correlation drops to a coefficient of about zero.
- **RB and WR: capital prices situation only slightly** (|ρ| about 0.1). The sign is the intuitive one: vacated opportunity helps and returning competition hurts. But the effect is about 0.15-0.20 logit per SD, which works out to roughly 2-3 percentage points at a 20% base rate. Forward samples of 223-323 players with 54-64 hits cannot separate that from zero.
- **TE: no consistent sign.**

## 3. Recommendation

**Do not fold situation into P(hit) or the talent percentile.** None of the five features improves forward log loss with bootstrap support, at any position. That holds even with the optimistic, slightly leaky version of `vac`/`comp_pos`.

**A limited version, if it is wanted at all, should be a display note, not a score change:**

1. **Positions:** WR and RB only. Skip QB, where capital already prices situation, and TE, where the sign is unstable.
2. **Features: two, combined into one opportunity index.** Use `vac` (vacated targets or carries) minus `comp_pos` (returning same-position share), both measured at the draft. To remove the leak, use the roster as of draft day rather than the season roster. Optionally show `qb_epa` as a WR context line.
3. **If it ever moves a number:**
   - fix the signs in advance (vacancy +, competition -) and do not fit them;
   - shrink to half the fitted coefficient, about 0.08 logit per SD;
   - hard-cap the shift at ±0.15 logit, about ±2.5 percentage points at a 20% base rate and at most ±3 talent-percentile points;
   - show it as a separate adjusted line, never as a change to the talent tier.
4. **Display:** a one-line "Situation" chip on the card with the facts and no number. For example: "Vacated 38% of 2025 targets · 1 returning WR >20% share · QB EPA/db +0.05 (11th)". This lets a reader see a crowded or wide-open room without the model pretending to know more than capital does.
5. **Revisit** when 2023-2024 classes mature (about 100 more forward rows per position) or when a clean draft-day depth chart source exists. Re-run `projections/_situation/situation_backtest.py` unchanged so the test stays pre-registered.

**What was not tested:** coaching stability, OL grades, Vegas team totals (no historical table on file), and situation × capital interactions such as the Establish The Run Day 2 claim. Testing the interactions would multiply comparisons on about 50 hits per position.
