# Target experiment: preregistration (frozen 2026-10-07, before any fit)

Lane target-experiment (session 7f87cf4a, reaped at P1 2026-10-06T16:55Z). Run inline by the coordinator
(ea66a469) on the lane's own paths; no second session was started for it. The frozen overall study
(`lanes/overall/results.md`, gates FAILED) is untouched and stays the record of what C0, M1, P1 and K0 did.

## Question

Three bounded hypotheses, nothing else will be tried in this cycle:

- **H1 target form.** A two-part zero-heavy target (P(VOR3 > 0) times E[VOR3 | VOR3 > 0]), on capital only,
  ranks outcomes better than the frozen one-part isotonic C0.
- **H2 capital residual.** College profile features fitted to the residual of an out-of-fold C0 add ranking
  value over C0. This is the "profile adds to capital" test the frozen M1 failed with a joint fit.
- **H3 pre-draft expected capital.** NFLMDD consensus board rank, mapped to an expected pick on earlier
  NFLMDD years only, then passed through the C0 curve (XC0), is close enough to FantasyPros pre-draft
  consensus (K0pre) to serve as the capital input of a pre-draft rating.

## Data and labels

- Population: the frozen study's cached population (`overall_data.pkl`, built from store sha 85d9801d),
  drafted QB/RB/WR/TE, classes 2008-2023. UDFA rows are a secondary report only; the UDFA-links fix is
  scored separately after its own review, not mixed in here.
- Target: VOR3 per format (F1 1QB primary; F2 superflex and F3 TE-premium as consistency checks).
- Label maturity: LAST_NFL = 2025, so the 3-season horizon is complete for classes through 2023 and
  nothing from the in-progress 2026 season enters. The script asserts this and the per-class label count.
- Decision time for class Y is draft week of year Y. Class c's label is complete after NFL season c+2.

## Protocol

- **Embargo, primary:** a model scoring class Y trains on classes <= Y-3 only, which are the classes whose
  labels existed at decision time. (The frozen study used <= Y-1 with Y-3 as a sensitivity; that is reversed here.)
- Scored classes 2012-2023 (12). Hyperparameters (ridge alpha) are chosen inside the training window only.
- H2 residual: C0 out-of-fold predictions inside the training window come from leave-one-class-out
  isotonic fits, so no row's residual uses its own label.
- Related players: resampling unit is the class (2000 class resamples, seed 7), as in the frozen study.
- H3 mapping: isotonic rank-to-pick fitted on NFLMDD years strictly before Y (2021 uses 2020 only).
  Players beyond board depth get the deepest mapped pick. Evaluated on 2021-2023 (deep boards, mature
  labels) with 2020 shown separately (150-row board). Drafted-only population, the same conditioning
  the frozen K0 comparison used.

## Metrics and acceptance (fixed now)

- Primary metric: pooled per-class Spearman of forecast vs VOR3, F1, drafted. Secondary: NDCG@24, MAE;
  Brier and a 10-bin reliability table for the H1 occurrence probability against an isotonic-on-pick
  occurrence baseline.
- Two primary tests (H1, H2), so the bar is Bonferroni 0.10/2: **accept only if** paired Spearman gain over
  C0 has share > 0 >= 0.95 across class resamples **and** point gain >= +0.02 **and** the F2 and F3 point
  gains are >= 0. Anything else is rejected; a positive but sub-bar result is reported as "not supported".
- H3 (descriptive, 3-4 classes): XC0 is "usable as pre-draft capital input" only if XC0 - K0pre point
  estimate >= -0.05 and its 90% lower bound > -0.10. It is never compared with actual-slot C0 as a rival,
  only to report the cost of not knowing the slot.
- Zero-heavy diagnosis: share of VOR3 == 0 by position and format, and what that makes of the p75 tiers.

## Not allowed in this cycle

No extra features, no new hypotheses after seeing results, no panel-driven changes. Love and the frozen
36-player panel are printed for diagnosis only. No 0-100 overall score is produced or published from this
run; any adoption needs an independent high judge first.
