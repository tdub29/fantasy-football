# WR talent features, pre-registered 2026-10-10

Written and committed BEFORE any candidate below was scored. The commit that adds this file is the
timestamp. Results go in a section appended below; nothing above "Results" changes after the first
run. Anything decided after seeing numbers is labelled exploratory.

## Question

The WR talent score (no capital, `FEATS["WR"] = ryptpa_career, early, stars`) sorts the middle of the
board but not the top. Out of sample its top 10% hits top-24 53% of the time; its top 3% hits top-12
9% (n=11), where RB's top 3% hits top-24 89%. Dev leave-one-class-out log loss: talent 0.3609, worse
than draft-only 0.3586. Can a different WR talent feature set separate the elite tail better, judged
out of sample under validation-charter-v2.md?

## Comparison and gates

Baseline W0 = the shipped WR talent set. Every candidate is a talent model (`make_lr(C_FIXED)`,
median impute, standardize, C = 0.1, no capital) and the matching full model (same columns plus the
log-pick spline). Rows, folds and labels are the charter's, unchanged: drafted WRs 2008+ linked to
college, top-24 PPR PPG season in NFL years 1-3.

Primary (ships or not): candidate talent vs W0 talent under charter rules 1-5.

1. Lower pooled forward log loss, test classes 2013-2023, trained on classes <= c - 3.
2. Lower dev leave-one-class-out log loss, 2008-2019.
3. Gain positive in >= 90% of 4,000 class bootstrap resamples (seed 7) of (1).
4. 2020-2023 forward subset not worse (seen classes; a loss blocks, a win proves nothing).
5. Forward calibration slope of out-of-fold logits in [0.75, 1.25].
6. Independent review before it ships.

Guards (all must hold too, or the candidate is rejected):

- G1. The full model on the candidate set is not worse than the W0 full model on forward and dev
  LOCO log loss.
- G2. The build's low-volume guard holds (a 16-pass/game profile stays below talent 90).
- G3. `build_prospect_model.py --self-check` passes.

Reported, not gating (n is small): hit rates at top-12 / top-24 / top-36 for the top 10% and top 3%
of the out-of-sample talent score (dev classes leave-one-class-out, 2020+ walk-forward, percentile
against every drafted WR, as the build's tiers); AUC; Spearman with best PPG.

If more than one candidate passes, the one with the lowest forward log loss ships. Testing several
candidates inflates the chance one passes by luck; the 90% bootstrap rule and the review are the
check on that, and the multiplicity is stated in the results.

## Candidates

Each names the weakness it targets, from wr-te-models.md (evidence order: capital, then age-adjusted
production share, then efficiency, scouting, athleticism).

| ID | Talent columns | Targets |
|---|---|---|
| W0 | ryptpa_career, early, stars | baseline |
| W1 | W0 + breakout_age | the only age signal is a binary early flag; breakout age is the continuous age-adjusted production signal research ranks second only to capital |
| W2 | W0 + ryptpa_final | career YPTPA averages a weak freshman year into an elite final year; Cole's splits favour final-season share |
| W3 | W0 + dom_best | market share including touchdowns (dominator), the other share literature uses; YPTPA ignores TDs |
| W4 | W0 + weight | size: sub-180 lb WRs rarely reach the top; weight is combine or last roster, never post-draft |
| W5 | early -> early_covid | the COVID extra year makes 2020+ four-year WRs look old; early_covid counts seasons excluding 2020 (charter A2's flag) |
| W6 | ryptpa_career, ryptpa_final, breakout_age, early_covid, stars, weight | the literature set: production, peak, age, declare, recruiting, size together |
| W7 | in-fold greedy forward selection | the honest "best set": selection redone inside every outer training fold by inner leave-one-class-out talent log loss, add while the gain >= 0.001, at most 5 columns, from the pool below |
| W8 | W0 with recency sample weights | Trevor's portal-era hypothesis: weight each training class 0.5^(d / 4), d = years before the newest training class (forward); for leave-one-class-out d = years from the held-out class |

W7 pool: ryptpa_career, ryptpa_best, ryptpa_final, dom_best, dom_final, target_share_best,
breakout_age, early, early_covid, stars, draft_age, power, weight, speed_score.

Half-life 4 in W8 is fixed a priori, not tuned. If a feature candidate passes, W8's weighting is
re-run on that candidate's set with the same half-life and the same gates (fixed now, so it is not
exploratory). Labelled data from the portal era is thin: draft classes 2022-2023 are the only mature
ones whose careers ran through the 2021 free-transfer rule, about 60 WRs and 10 hits, so W8 can only
test "recent classes matter more", not the portal itself.

Not run, with the reason: receptions share (yards share carries the same signal with more weight in
the literature; would need new team totals); target share as a fixed add (A6 failed, coverage starts
late; it stays in the W7 pool); stars x production interaction (a logit is already multiplicative in
odds; one more term on 52 events is noise); speed score as a fixed add (A8 failed; weak for WR in the
literature; in the W7 pool); RAS (no licensed source).

## Commands

Scored by a scratch script on a copy of the DB (`PROSPECT_DB` set to the copy, sources unchanged),
reusing `prospect_experiments.py`'s folds (`oof`, `fold_mask`, `score`, `decide`).
