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

## Addendum 4, 2026-10-04 (after the independent population B review, before any candidate below was scored)

The population B review (`experiments/review-b-2026-10-04.md`) confirmed the B1/B2/B4 passes and
found no leakage, but found a flaw in the pre-registered B2 spec: it feeds the QB-only features
`comp_final` and `rush_ypg_best` to the RB/WR/TE models, where they exist for 5-22 rows and, median
filled and standardized, reach |z| = 45 (Keenan Reynolds, a Navy QB in the RB group, predicted 1.000).
Fixing a spec after seeing results makes these exploratory follow-ups, scored under the same rules.

| ID | Candidate |
|---|---|
| B8 | B2 without `comp_final` and `rush_ypg_best` for RB/WR/TE (QB unchanged), C = 0.1 |
| B9 | B8 with C picked per outer fold by inner leave-one-class-out (as B5) |

The review also found three drafted FBS hits the name join misses (Ray Rice as "Raymell Rice",
Beanie Wells as "Chris Wells", Stevie Johnson) and four drafted non-hits carried as undrafted. A
join repair is a data-completeness change, measured separately (links found, accuracy on id-known
picks) and applied to baseline and candidates alike, followed by a full re-run of every candidate.

## Addendum 5, 2026-10-04 (before B10 was scored)

B7 (scored after addendum 3) carries the same QB-only-feature flaw as B2. **B10** = B7 without
`comp_final` and `rush_ypg_best` for RB/WR/TE, C = 0.1. Exploratory follow-up like B8/B9. The
in-season ship choice stays: lowest forward log loss among candidates that passed all six rules,
disclosed as a selection among passing candidates.

## Addendum 6, 2026-10-04 (after the A10 review, before A14 was scored)

The A10 review found that v1's feature sets were pruned on every class, so any candidate built on
them carries selection leakage. **A14** removes it: inside each outer training set (forward and
leave-one-class-out alike), greedy forward selection starting from the capital spline alone adds,
one at a time, the pool feature that most lowers inner leave-one-class-out log loss of the full model
(C = 0.1), stopping when the best addition improves inner log loss by less than 0.001 or at four
features. The test class never influences which features are chosen. Pools, fixed now:

- WR and TE: `ryptpa_career`, `ryptpa_best`, `ryptpa_final`, `dom_best`, `dom_final`,
  `target_share_best`, `rec_epa_best`, `early`, `stars`, `draft_age`, `power`, `weight`, `speed_score`
- RB: `ryptpa_final`, `ryptpa_best`, `scrim_ypg`, `dom_best`, `dom_final`, `rec_epa_best`,
  `rush_succ_best`, `early`, `stars`, `draft_age`, `power`, `weight`, `speed_score`
- QB: `rush_ypg_best`, `comp_final`, `aya_final`, `starts`, `n_seasons`, `early`, `stars`, `draft_age`, `power`

The join repair of 2026-10-04 (one added link) applies to every candidate; all of A0-A13 and B1-B10
are re-run on the repaired data before A14 is compared, and the ledgers carry the re-run numbers.

## Addendum 7, 2026-10-04 (after review C, before any candidate below was scored)

Follow-ups to review C, exploratory like addenda 4-6. Same population B, folds and rules.

| ID | Candidate | Weakness it targets |
|---|---|---|
| B11 | QB with passer features only: `rush_ypg_best`, `comp_final`, `aya_final`, `starts`, `n_seasons`, `n_qual`, `early`, `stars`, `draft_age`, `power`, `weight`; C = 0.1 | B9 fed passers receiving columns that are noise for them |
| B12 | B11 with C picked per outer fold by inner leave-one-class-out | B11's likely over-shrinkage (B8's QB slope was 1.79) |
| B14 | Career-stage model, RB/WR/TE/QB: one row per player per completed college season k (his first qualifying season through his exit), features as of season k (cutoff k), plus `stage` (college year at k) and the estimated age at k; label = his eventual hit; each row's class is the player's decision class, so all of a player's rows sit in one fold. Features: the shipped B10/B8 set (B11 at QB) without the exit-only `early`, `n_seasons`, `draft_age`. Baseline: stars plus stage, logistic. Scored on all rows and reported by stage (1-2 vs 3+) | review C: the frozen-production exit scenario ran 2.5x low for freshmen and sophomores, so younger players get no number today |

B14 needs the five numeric rules on all rows AND on the stage 1-2 rows by themselves before it may
serve underclassmen, plus an independent review.

## Addendum 8, 2026-10-04 (after review D, before the QB serving fix was scored)

Two reviews found that a model can pass on real exit rows and still fail as served, because the
board scores a current player through the exit-scenario transform (`predraft_score`). From now on a
served pre-draft number needs a **serving backtest**, in-repo (`projections/prospect_serving_backtest.py`):
for each completed season k from 2011 to 2020, refit the shipped model on population B rows whose
outcome windows had closed by season k + 1, score every player who was playing in season k + 1 and
belonged to the next draft class through the exact served code path, and compare with his real
outcome. Pass: calibration slope 0.75-1.25 AND mean predicted / observed between 0.8 and 1.25, both
overall AND on first-eligible players (college year 3 at k + 1).

**QB serving fix (QB-S1):** B12 served with the scenario's remaining seasons also added to `starts`
for a player starting in the current season, and no number when he has zero completed starts. It may
enter `PREDRAFT` only if it passes the serving backtest and an independent review. The shipped RB B10,
WR B10 and TE B8 are run through the same backtest as a check; a failure there pulls them.

## Addendum 9, 2026-10-04 (after the serving backtest pulled B10/B8, before S1/S2 were scored)

The exit-scenario transform failed because it freezes production. Two candidates are trained on rows
shaped like what is served (features through the last completed season), so no transform is needed.
Both are judged by the addendum 8 serving backtest on next-class players (refit per replayed season on
rows whose outcome windows had closed) and then by an independent review.

| ID | Candidate |
|---|---|
| S1 | B14 as fit (one row per completed season, every stage), served for the next class from completed seasons with `stage` and `age_k` |
| S2 | B14's features and C, trained only on snapshot rows shaped like the served ones: a completed season k at college year 2 or later by a player who played in season k + 1 |

RB, WR and TE use the B10/B8-derived B14 columns; QB uses B11-derived columns.

## Addendum 10, 2026-10-04 (after review E, before the display rule was scored)

Review E confirmed the S1 model at RB and WR but found that the board lists only the next class's top
60 by Talent, which uses the live season S1 ignores; within that cut S1's calibration slope is 0.63
(RB) and 0.72 (WR). Selecting on a model's own forecast does not bias its calibration the same way.

**Display rule D1:** where S1 serves the next class, the board lists that class's top 60 by S1's
pre-draft chance (Talent stays a column). Gate, from `run_stage` on the replayed seasons, using
each season's top 60 by S1: calibration slope 0.75-1.25 and mean ratio 0.8-1.25, pooled. Also
reported, not gating: the 2017-2021 replays alone, and unique players and hits next to player-seasons.

## Addendum 11, 2026-10-04 (before S3 was scored)

S1 failed at RB (D1 slope 0.74, over-confident at the top), TE (first-eligible ratio 0.77) and QB
(first-eligible ratio 0.70). **S3** = S1 with C picked per replayed season by inner
leave-one-class-out on that replay's training snapshots, from {0.03, 0.1, 0.3, 1, 3}; everything else
as S1. Same gates: the addendum 8 serving backtest (overall and first-eligible) AND display rule D1,
then an independent review. Exploratory follow-up; WR is scored too but its shipped S1 stays unless
S3 passes every gate with lower served log loss.

## Addendum 12, 2026-10-04 (before S4 was built or scored)

Every served failure so far traces to the same gap: the forecast cannot see the season in progress,
and the junior-year jump is where most hits separate. sportsdataverse `espn_cfb_player_box` and
`espn_cfb_team_box` (per-game lines, 2004-2026, same release host and licence) make as-of-game
features reconstructible for every past season.

**S4**: S3 plus live features from the first N games his team played in the season in progress
(N = 4 and N = 8, fit separately): games he appeared in, receiving yards per team pass attempt (team
attempts from the team box, floored at the PASS_DEN_PG rate), share of team receiving yards,
scrimmage yards per game, and a `has_live` flag (0 when he did not play that season; values median
filled). Training: every career-stage snapshot k with live features from season k + 1's first N team
games. Serving: the largest N his team has reached; below 4 games, S3 alone.

Gates, per N and position: the addendum 8 serving backtest replayed with live features through N
games (overall and first-eligible) and display rule D1; to replace S3 at WR, also lower served log
loss than S3 in at least 90% of season resamples. Then an independent review.

## Addendum 13, 2026-10-04 (after S4 was scored; a serving change, not a new candidate)

Written after the S4 numbers were seen, so it is labelled as a deviation from addendum 12, not a
pre-registration. Results: RB S4n4 passed every gate; RB S4n8 failed D1 (slope 0.67); WR S4n4 and
S4n8 failed the all-rows ratio (1.31, 1.34); TE and QB failed.

Serving differs from addendum 12 in two ways, and the backtest replayed exactly this rule:
1. Always the first 4 team games, never 8, because N=8 failed. Later in the season the number still
   uses games 1-4 only.
2. Below 4 team games, or with no stat line this season, no number at all instead of an S3
   fallback, so one displayed list never mixes two models.

Known risk, recorded by review H: the D1 slope pass (0.79) has 68% support under season resampling
(RB S3 had 62-64%), and a top-70 cut gives 0.74. The top-60 ratio is robust (90% interval
0.95-1.13). The prospective holdout scores this when the 2027 class's outcome window closes.

## Addendum 14, 2026-10-04 (before S5 was built or scored)

Diagnosis from the S1-S4 backtests: the over-forecast sits in the rows past first eligibility (WR S4n4
all-rows ratio 1.31 against 1.04 first-eligible; TE S3 1.31 against 0.83). Training snapshots at
college year 3+ mix players who left after that season (early entrants, who hit often, and seniors,
who rarely do) with players who came back, while every served row is a player who came back. The
`has_live` flag enters as a main effect only, so it cannot separate those two kinds of leaver. S2 fixed
the same mismatch for S1 by training on served-shaped rows only, and passed at RB and WR, but it was
never scored on display rule D1 and never combined with tuned C or live games.

**S5n4**: S4n4 (addenda 12-13: S3 plus his team's first 4 games of the season in progress, tuned C by
inner leave-one-class-out) trained only on S2's served-shaped rows: a completed season k at college
year 2 or later by a player who played in season k + 1. Serving as addendum 13 (first 4 team games
always; no number below 4 games or with no stat line). N = 4 only; no N = 8 variant.

Gates, every position: the addendum 8 serving backtest (overall and first-eligible), display rule D1,
then an independent review. Replacement tests on the same served rows, at least 90% of season
resamples with lower served log loss: at RB against the shipped S4n4; at WR against the shipped S3.
At TE and QB it must also beat stars plus college year in at least 90% of season resamples, since
neither position has a served model. This is the ninth served candidate family (B10/B8, B12, S1, S2,
S3, S4n4, S4n8, S5n4); a pass that clears its floors by less than the earlier near misses missed by
is reported as fragile, not as a win.

## Addendum 15, 2026-10-04 (after review I, before S6 was built or scored)

Review I rejected S5n4 at WR: training only on served-shaped rows costs log loss, while the live
features carry a real gain (S4n4 beats S3 in 97.7% of resamples) that S4n4 could not ship because its
all-rows ratio was 1.31, almost all of it on later-eligible rows.

**S6n4** (RB and WR only; TE and QB belong to their lanes): fit S4n4 on every training row as
addendum 12 (C by inner leave-one-class-out). Compute out-of-fold S4n4 forecasts for every training
row by leave-one-draft-class-out refits at the chosen C. Then fit a logistic recalibration, effectively
unpenalized, of the hit on [out-of-fold logit, 1 if the snapshot's college year is 3 or later] using
only the served-shaped training rows (college year 2 or later, played the next season). Serve the
recalibrated S4n4 forecast. Three recalibration parameters; nothing else is tuned. Serving as addendum 13.

Gates: the addendum 8 serving backtest (all rows and first-eligible) and display rule D1, as before.
Replacement tests are stricter than earlier addenda, for the family-wise concern review I raised:
season-resampling bootstrap with 200,000 resamples, and the candidate must beat the shipped model
(S3 at WR, S4n4 at RB) in at least 95% of them. Then an independent review, which also checks the gain
does not rest on a handful of rows. This is the tenth served candidate family.

