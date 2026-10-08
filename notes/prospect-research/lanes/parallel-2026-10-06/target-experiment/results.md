# Target experiment: results and ledger (2026-10-07)

Spec: `prereg.md`, committed 125c50c before any fit. Script:
`projections/lanes/parallel-2026-10-06/target-experiment/target_experiment.py`. Raw numbers: `results.json`.
Drafted QB/RB/WR/TE, classes 2012-2023 scored, training on classes <= Y-3 (label embargo), 2000 class
resamples. Labels: 75-87 per class, all mature (LAST_NFL 2025, asserted). **Pending independent judge.**

2026-10-08: judged SOUND WITH CORRECTIONS (`judge-2026-10-07.md`). Current status of every claim is in
`ledger.md`: R18 WITHDRAWN; R2, R6 to R9, R11, R12, R14, R17, R23, R24 REVISED. Text below is the original
inline write-up except the lines marked "(revised 2026-10-08)", which apply judge findings 6, 7, 9 and 11.
No overall prospect rating follows from this run. The "22 days" at the end comes from `audit.json`
timestamps, not results.json.

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
  residual. (revised 2026-10-08) That is a result for the H2 design as built: it carries the D7 no-college-link
  flag, partly outcome-linked, whose net effect was not measured. Two different model forms (frozen M1 joint fit, H2 residual) both fail. Stop fitting profile
  features to this target until a new data source arrives; do not try a third form on the same inputs.
- **The two-part target changes nothing in ranking.** Within a position both parts are monotone in pick, so
  it can only reorder across positions. (revised 2026-10-08) No reorder count was measured; the result is
  no measurable ranking gain (F1 +0.0004, share 0.53). Its occurrence part is useful as a probability:
  Brier 0.144 vs 0.185 for a position base rate. It is overconfident at the top: the top decile predicts
  0.90 and observes 0.70, the same small-cell extreme behind Love's served hp 1.000. Any shown probability
  needs shrinkage there. (revised 2026-10-08) Overconfident at both ends, not only the top; see ledger R9.
  The occurrence part beats a pick-blind position base rate (D2) and needs shrinkage at both ends first.
- **A candidate pre-draft capital input meets the usable bar** (revised 2026-10-08). XC0 meets the prereg
  usable bar against FantasyPros pre-draft consensus on 2021-2023 (per class
  0.42/0.52/0.48 vs K0 0.53/0.47/0.41) and costs 0.035 Spearman against knowing the actual slot. Three
  classes cannot rank it above or below K0; it only shows it is in the same range. (revised 2026-10-08) It
  trails K0 by more than 0.10 in 2021 in every format (F1 -0.1174, F2 -0.1199, F3 -0.1048); the lower
  bound passes because the all-2021 resample is 1/27 of the bootstrap. Not equivalence.
- **The target is zero-heavy:** VOR3 is exactly 0 for 85% of drafted QBs, 68% of RBs, 73% of WRs, 84% of
  TEs (F1). The F1 p75 is 0, so the frozen tier labels' "above p75" means "any starter season".

## Limits and not-findings

- H2's QB gain (0.457 to 0.475) and TE loss are post-hoc subgroup moves inside a rejected test; not findings.
- H3 2020 used an identity rank-to-pick map (no earlier board year); it is shown, not gated. The 2023
  capture is 22 days pre-draft. Drafted-only conditioning, as in the frozen K0 comparison.
- NFLMDD rights are unverified (private research cache; see `../../overall/expected-capital-source-audit-2026-10-06.md`).

## What this run does and does not license (revised 2026-10-08)

After the draft: the capital-only C0 rating stays as the frozen judge labelled it. Before the draft: XC0
meets the prereg usable bar as projected draft capital (descriptive, 3 classes, 2021+); not adopted, pending
the judge's corrections and the NFLMDD rights check, and any adoption needs an independent high judge first
(prereg). Not supported: any number claiming college talent adds to either. No overall prospect rating
follows from this run.
