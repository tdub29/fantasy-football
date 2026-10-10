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

## Results, 2026-10-10 (run after the commit above)

**No candidate passes. `FEATS["WR"]` stays `ryptpa_career, early, stars`. Nothing shipped.**

W0 reproduces the model card: talent dev LOCO 0.3609, 2020+ 0.4201; full LOCO 0.3308, 2020+ 0.3412.
463 mature WRs, 74 hits; forward = test classes 2013-2023, embargo 3. Draft-only reference: forward
0.3520, LOCO 0.3586, 2020+ 0.3254.

| ID | Talent fwd | Boot | Talent LOCO | Talent 2020+ | Slope | Full fwd | Full LOCO | Top 10% top-24 | Top 3% top-12 |
|---|---|---|---|---|---|---|---|---|---|
| W0 | 0.3935 | | 0.3609 | 0.4201 | 1.02 | 0.3433 | 0.3308 | 53% | 29% |
| W1 +breakout_age | 0.3989 | 24% | 0.3658 | 0.4174 | 0.89 | 0.3494 | 0.3367 | 51% | 36% |
| W2 +ryptpa_final | 0.3953 | 38% | 0.3636 | 0.4213 | 0.94 | 0.3477 | 0.3349 | 47% | 21% |
| W3 +dom_best | 0.3965 | 20% | 0.3667 | 0.4265 | 0.97 | 0.3454 | 0.3363 | 49% | 29% |
| W4 +weight | 0.3938 | 41% | 0.3653 | 0.4213 | 1.03 | 0.3437 | 0.3350 | 45% | 36% |
| W5 early_covid | 0.3894 | 65% | 0.3609 (tie) | 0.4094 | 1.17 | 0.3404 | 0.3308 (tie) | 53% | 29% |
| W6 literature set | 0.3954 | 47% | 0.3733 | 0.4058 | 0.94 | 0.3505 | 0.3456 | 49% | 43% |
| W7 in-fold select | 0.4110 | 5% | 0.3632 | 0.4336 | 0.75 | 0.3559 | 0.3358 | 45% | 29% |
| W8 recency weights | 0.3935 | 49% | 0.3661 | 0.4179 | 1.21 | 0.3429 | 0.3375 | 47% | 36% |

The top 10% is 47 players and the top 3% is 14, so one player moves the top 3% column by 7 points.
Read that column as noise. W8 was not re-run on another set, because no feature candidate passed.

- **W5 is the only lead.** It is better on talent and full, both forward and 2020+. But early_covid
  equals early on every dev class (no 2020 season exists before the 2020 draft), so LOCO ties by
  construction and rule 2 cannot pass. Its whole gain is on the seen 2020+ classes, at a 65%
  bootstrap. The clean test is the 2024 class, after the 2026 season.
- **W7 overfit.** It chose ryptpa_career, early, power and speed_score in 10 of 23 outer folds and
  dropped stars, then scored worst forward. Selection overfits about 300 rows with 50 events.
- **The caller's tail figure did not reproduce.** "Top 3% hits top-12 9% (n=11)" comes out as 4 of 14
  (29%) under the build's tier method (out-of-sample talent, percentile >= 97).
- **The tail already matches capital's tail.** The top 10% by talent hits top-24 53%, by draft pick
  55%, by talent plus capital 51%. Inside the talent top 10%, 20 round-1 picks hit 75% and 8 day-3
  picks hit 12%. The miss is opportunity that a capital-free score cannot see, not mis-sorted talent.
- **Exploratory, dev classes only:** `early` counts FBS seasons on file, so JUCO and FCS transfers
  read as early declares. Four of the 14 top-3% players are such transfers: Gallup, Westbrook,
  C. Wilson and R. Matthews. Early declares with a real draft age of 22.5 or more (46 players) hit
  22%, against 28% for younger early declares and 5% for not-early, so the cost is small. The
  sources have no JUCO field, so this has no fix yet.

Scorer: `scratch/wr_talent.py` in the worktree, not committed. It ran on a DB copy using
`prospect_experiments` `oof`, `fold_mask`, `score` and `decide`. `--self-check` OK.
