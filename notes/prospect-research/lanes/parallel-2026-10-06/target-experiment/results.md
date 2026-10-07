# Target experiment: results and ledger (2026-10-07)

Spec: `prereg.md`, committed 125c50c before any fit. Script:
`projections/lanes/parallel-2026-10-06/target-experiment/target_experiment.py`. Raw numbers: `results.json`.
Drafted QB/RB/WR/TE, classes 2012-2023 scored, training on classes <= Y-3 (label embargo), 2000 class
resamples. Labels: 75-87 per class, all mature (LAST_NFL 2025, asserted). **Pending independent judge.**

## Ledger

| Hyp | What | F1 paired Spearman vs C0 [90%] | share > 0 | F2 / F3 point | Verdict |
|---|---|---|---|---|---|
| H1 | two-part target, capital only | +0.0004 [-0.0056, +0.0062] | 0.53 | +0.0014 / +0.0060 | NOT SUPPORTED |
| H2 | profile fitted to out-of-fold C0 residual | -0.0056 [-0.0186, +0.0066] | 0.24 | -0.0001 / +0.0041 | REJECTED |
| H3 | NFLMDD rank to expected pick to C0 curve (XC0) vs K0 pre-draft, 2021-2023 | -0.005 [-0.064, +0.055] | - | - | USABLE, descriptive only |

Bars (prereg): accept needs share >= 0.95, gain >= +0.02, F2 and F3 >= 0. H3 needs point >= -0.05 and lower
bound > -0.10.

## What it means

- **College profile still adds nothing measurable over draft slot**, now under the stricter embargo and as a
  residual. Two different model forms (frozen M1 joint fit, H2 residual) both fail. Stop fitting profile
  features to this target until a new data source arrives; do not try a third form on the same inputs.
- **The two-part target changes nothing in ranking.** Within a position both parts are monotone in pick, so
  it can only reorder across positions, and it does not. Its occurrence part is useful as a probability:
  Brier 0.144 vs 0.185 for a position base rate. It is overconfident at the top: the top decile predicts
  0.90 and observes 0.70, the same small-cell extreme behind Love's served hp 1.000. Any shown probability
  needs shrinkage there.
- **A pre-draft capital input now exists.** XC0 ties FantasyPros pre-draft consensus on 2021-2023 (per class
  0.42/0.52/0.48 vs K0 0.53/0.47/0.41) and costs 0.035 Spearman against knowing the actual slot. Three
  classes cannot rank it above or below K0; it only shows it is in the same range.
- **The target is zero-heavy:** VOR3 is exactly 0 for 85% of drafted QBs, 68% of RBs, 73% of WRs, 84% of
  TEs (F1). The F1 p75 is 0, so the frozen tier labels' "above p75" means "any starter season".

## Limits and not-findings

- H2's QB gain (0.457 to 0.475) and TE loss are post-hoc subgroup moves inside a rejected test; not findings.
- H3 2020 used an identity rank-to-pick map (no earlier board year); it is shown, not gated. The 2023
  capture is 22 days pre-draft. Drafted-only conditioning, as in the frozen K0 comparison.
- NFLMDD rights are unverified (private research cache; see `../../overall/expected-capital-source-audit-2026-10-06.md`).

## Consequence for an overall score

Supported after the draft: the capital-only C0 rating, labelled as such (frozen judge). Supported before the
draft: an expected-capital rating from XC0, labelled "projected draft capital", 2021+ only, rights caveat.
Not supported: any number claiming college talent adds to either. No 0-100 overall talent score.
