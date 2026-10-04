# Validation charter v2 and pre-registered candidates

Written and committed 2026-10-03 BEFORE any candidate below was scored. The git commit that adds
this file is the timestamp. Any change after results gets a v3 file and labels the v2 results
exploratory; nothing here is edited in place after the first candidate run.

## What changed from v1, and why

v1 (model-card.md) had an untouched holdout, 2020-2023. It is spent: every v1 number on it has been
read, and the WR handoff (`handoff-wr-early-declare-2026-10-03.md`) diagnosed the WR loss from it.
There is no fresh mature class until the 2024 class's three-season WR/RB window closes (after the
2026 NFL season, usable about January 2027; QB/TE need 2027). So v2 states plainly:

- **No untouched holdout exists for this search.** Every candidate is judged on nested,
  embargoed, forward-chaining evaluation over all mature classes, with the 2020+ classes reported
  separately as a regime check, labelled "seen".
- **A prospective holdout is frozen now.** Every candidate's and the baseline's predictions for the
  2024, 2025 and 2026 classes are written with a sha256 into `experiments/prospective-2024-2026.json`
  before those outcomes exist. They are scored when the windows close and can overturn a promotion.

## Contract

| Item | Value |
|---|---|
| Question | Does a candidate improve the hit probability over the frozen baseline for QB/RB/WR/TE? |
| Target | v1 labels, unchanged: top-24 RB/WR PPR PPG season (8+ games) in NFL years 1-3; top-12 QB/TE in years 1-4; ranked against that season's players at the draft position |
| Grain | one drafted player (population A) or one exiting FBS player (population B) |
| Decision time T | A: the moment after his draft pick is made (capital known). B: the day before the draft (no capital) |
| Population A | every QB/RB/WR/TE drafted 2008+ with a linked college career (1,414 of 1,525). Unlinked picks (mostly FCS) are reported, not modelled |
| Population B | every FBS QB/RB/WR/TE whose final college season is Y, draft year Y+1, drafted or not (built in `prospect_population.py`). Undrafted players stay in with their real outcomes |
| Frozen baseline | v1 shipped model per position: draft-only restricted cubic spline in log pick, C=0.1 curvature penalty (population A). Population B: per-position base rate from training classes, and a recruiting-stars-only logistic model |
| Outer folds | each draft class c from 2013 to the last mature class (WR/RB 2023, QB/TE 2022), trained on classes <= c - window (3 WR/RB, 4 QB/TE). Expanding window |
| Development check | leave-one-class-out on 2008-2019, as v1 |
| Inner tuning | none by default. A candidate with a free hyperparameter fixes it a priori or picks it by inner leave-one-class-out on the outer fold's training classes only |
| Preprocessing | imputers, scalers, splines and any target encoding fit inside each training fold |
| Primary metric | pooled log loss over every outer-fold prediction, per position, equal weight per player |
| Secondary | Brier; AUC; calibration intercept and slope (logistic recalibration of out-of-fold logits); per-class wins; Spearman with best PPR PPG in window (ranking utility, separate goal) |
| Uncertainty | draft-class bootstrap (4,000 resamples, seed 7) of the per-player log-loss gain on the outer folds |

## Promotion rule (all must hold, per position)

1. Lower pooled log loss than the baseline on the embargoed forward folds, 2013 to last mature class.
2. Lower log loss on development leave-one-class-out, 2008-2019.
3. Positive gain in at least 90% of class bootstrap resamples of (1). Up from v1's 80% because v2
   tests several candidates per position.
4. No worse log loss on the 2020+ forward subset (seen classes, regime check). A loss there blocks
   promotion; a win there is not evidence of anything on its own.
5. Calibration slope of the candidate's out-of-fold logits between 0.75 and 1.25.
6. Independent review (a fresh agent that did not build it) finds no leakage and agrees the numbers
   reproduce from the logged command.

A candidate that fails is rejected and the baseline stays. Every candidate is reported, not only
winners. Ranking utility and data-completeness gains are reported as separate outcomes and never
substitute for (1)-(6).

## Pre-registered candidates (population A, capital known)

Each names the measured weakness it targets. Features are added to the v1 full model (v1 talent
features + the same capital spline) unless stated. Fixed C = 0.1 for every one.

| ID | Candidate | Weakness it targets | Source and availability at T |
|---|---|---|---|
| A1 | Real draft age from nflverse birth date, replacing the class-year estimate | estimated-age error (1.24-year SD) | nflverse `players.birth_date`, published for every drafted player by draft day; 97-100% coverage 2008+ |
| A2 | COVID-aware experience: `early` counts college seasons excluding 2020 | WR early-declare shift after the extra eligibility year | derived from college seasons, known at T |
| A3 | WR: `early` replaced by real draft age (A1 value) | `early` may stand in for age | as A1 |
| A4 | Recruiting grade (247 composite, continuous) in place of stars | stars are a coarse 5-level proxy | `cfb_recruits.grade`, published at signing, years before T |
| A5 | College efficiency: receiving EPA per target (WR/TE/RB) and rushing success rate (RB), best qualifying season | production volume without efficiency | ESPN PBP in sportsdataverse, closed seasons |
| A6 | Best-season target share (WR/TE) | yards share misses volume earned | ESPN PBP targets |
| A7 | Partial pooling: one receiving model for WR+TE+RB with position-specific capital splines and intercepts, shared college slopes plus ridge-penalized position deviations | small TE/QB samples | same features as v1 |
| A8 | Athleticism with an explicit missing flag (speed score imputed at the fold median plus a 0/1 "no forty" indicator), RB/TE/WR | imputed athleticism treated as observed | nflverse combine, held before the draft |
| A9 | Drafting team's prior-season pass attempts and PPR points scored by its players at the drafted position (vacated targets are out: they need the post-draft roster) | landing-spot opportunity | nflverse season stats of the season before the draft, final before T |
| A10 | Fixed 50/50 average of baseline and v1 full model logits | variance of the full model | v1 models |

## Pre-registered candidates (population B, before the draft, no capital)

| ID | Candidate | Weakness it targets |
|---|---|---|
| B0 | Baselines: training base rate; stars-only logistic | reference |
| B1 | v1 talent features refit on population B (undrafted included) | v1 talent model was trained on drafted players only (selection bias) |
| B2 | B1 plus production depth: best and final dominator, career YPTPA, seasons played, size | richer pre-draft profile |
| B3 | Two-stage: P(round bucket or undrafted | college profile) times P(hit | bucket), each fit on training classes | uses the strong capital signal through its prediction |

Population B also reports draft-prediction quality (multiclass log loss of the round bucket) as a
separate outcome.

## Commands

Every result is reproduced by `python projections/prospect_experiments.py <ID>` and logged to
`notes/prospect-research/experiments/` with fold metrics, the run's source sha256s and git commit.

## Addendum 1, 2026-10-03 (committed before any candidate below was scored)

Sources found by the public-source search (`public-source-registry.md`). Same rules, same folds.

| ID | Candidate | Weakness it targets | Source and availability at T |
|---|---|---|---|
| A11 | Team and schedule context: final qualifying season team `adj_off_epa`, and career schedule strength = mean `adj_net` of every opponent faced (game-weighted) | the Power-conference flag is a crude strength proxy | sportsdataverse `cfb_ratings` + `cfb_team_opponent_splits`, season-level, final before the draft. Ratings files are regenerated by current code (no historical vintage); not tuned on NFL outcomes |
| A12 | Usage quality, best qualifying season with 30+ opportunities: `first_down_share` and `explosive_rate` (WR/TE/RB) | volume-only production | sportsdataverse `espn_cfb_usage_players` (ESPN PBP), closed seasons |

Population B feature sets, fixed now (C = 0.1, fold-median imputation, as population A):

- **B1**: the v1 talent set for the position, minus `speed_score` (no combine at this phase).
- **B2**: union of v1 college features across positions without athleticism (`ryptpa_career`,
  `ryptpa_best`, `ryptpa_final`, `scrim_ypg`, `rush_ypg_best`, `comp_final`, `early`, `stars`,
  `power`, `draft_age`, `weight`) plus `dom_best`, `dom_final`, `n_seasons`, `n_qual`.
- **B3**: two-stage. Stage 1 multinomial logistic (C = 0.1) on B2 features predicting the draft
  bucket (R1 1-32, R2 33-64, R3 65-100, Day 3, undrafted); stage 2 the training classes' hit rate
  per bucket and position. P(hit) = sum over buckets.
- **B4** (post-combine phase, March-April only): B2 plus a combine-invite flag and the measured
  forty, weight and speed score (missing for non-invitees, fold-median imputed). Scored as its own
  phase; it never replaces the in-season pre-combine model, whose T is before invitations exist.

Population B folds: the same embargoed forward chaining by draft class (test classes 2013 on),
classes 2008+. Baseline: B0 base rate and stars-only. Rules 1-5 apply against the stronger of the
two baselines (lower forward log loss), per position.

Deferred or rejected sources, with reasons, are in `public-source-registry.md`; none was scored.

## Addendum 2, 2026-10-04 (committed before any candidate below was scored)

Motivated by results already logged (so these are follow-ups, labelled as such): B1-B3 at QB fail
rule 5 with calibration slopes of 1.5 to 2.1 (predictions too compressed, i.e. C = 0.1 shrinks too
hard), and the recruit source leaves stars null for 25-30% of the 2018-2021 recruit classes,
including many later transfers (Caleb Williams, Bo Nix, Jayden Daniels), which the fold median
then fills as an average recruit.

| ID | Candidate | Weakness it targets |
|---|---|---|
| B5 | B2 with C chosen per outer fold by inner leave-one-class-out on that fold's training classes, from {0.03, 0.1, 0.3, 1, 3} | over-shrinkage, calibration slope > 1 |
| B6 | B2 plus `stars_missing` (1 where no star rating was found or the source rating is null) | source-null stars imputed as an average recruit |

Same population, folds, baseline and rules as B1-B4. If more than one population B candidate passes
at a position, the in-season (pre-combine) model ships the one with the lowest forward log loss and
the choice is disclosed as a selection among passing candidates.

## Addendum 3, 2026-10-04 (committed before any candidate below was scored)

Follow-ups to logged results, labelled as such.

| ID | Candidate | Weakness it targets |
|---|---|---|
| A13 | Population A full model with one extra talent feature: the logit of the population B pre-draft probability for his college position (the addendum 2 pick: QB B5, RB B1, WR B5, TE B2), taken from population B forward folds (each class scored by a model trained only on classes whose window had closed, first scored class 2011), so no row's feature saw its own or a later class's outcome | v1 talent features learned from ~300 draftees per position; the B model learned from ~1,000-4,000 exits |
| B7 | B2 plus A11 and A12 features (team offense, schedule strength, first-down share, explosive rate) on population B | context features may matter more across all exits than among draftees |

Same folds and rules. A13's population B feature is rebuilt inside the run from the same store.
