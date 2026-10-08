# Target experiment: claim ledger (2026-10-08)

Every claim in `results.md` (inline run, e468360) and in `CHECKPOINT.md`, checked against the A2 rebuild
(`repro-85d9801d/results.json`) and the A4 run (`supplementary.json`, addendum sha 2e7606a5...). Status is
KEPT, REVISED or WITHDRAWN. A4 checks can confirm or invalidate a verdict, never upgrade one (addendum rules).
Numbers below are copied from the JSON files named, plus `audit.json` (C2, C8, R21 22 days),
`label-maturity-audit.md` (C11) and one file time (C13); nothing here was recomputed by hand. P5 judge:
SOUND WITH CORRECTIONS (`judge-2026-10-07.md`); its corrections are applied in rows citing Judge 2026-10-08.

## results.md

| # | Date | Claim | Status | Reason |
|---|---|---|---|---|
| R1 | 2026-10-08 | H1 two-part target: F1 +0.0004 [-0.0056, +0.0062], share 0.53, F2/F3 +0.0014/+0.0060, NOT SUPPORTED | KEPT | Identical on the A2 rebuild. A4 S4: no window ACCEPTED, so not FRAGILE. REJECTED in 5 of 14 windows (2012-19 features, drop 2017, 2018, 2020, 2021); a REJECTED/NOT SUPPORTED move is reported, not a verdict change. |
| R2 | 2026-10-08 | H2 residual profile: F1 -0.0056 [-0.0186, +0.0066], share 0.24, F2/F3 -0.0001/+0.0041, REJECTED | REVISED (numbers), verdict KEPT | Rebuild gives F1 -0.0058 [-0.0185, +0.0061], share 0.229, F2/F3 -0.0001/+0.0031. The inline run read college production features from a different store state (audit point 1). Verdict REJECTED holds on the rebuild, in S2 nested alpha (F1 -0.0012, REJECTED) and in all 14 S4 windows. |
| R3 | 2026-10-08 | H3 XC0 vs K0 pre-draft 2021-2023: -0.005 [-0.064, +0.055], USABLE, descriptive only | KEPT, scope REVISED | Identical on the rebuild (S6 F1 est -0.0046, lo -0.0641). S6: XC0 and XC0d usable in F1, F2 and F3, so scope is F1, F2, F3. XC0d passes in F1, so not FRAGILE. Least margin is F2 XC0 (est -0.0403, lo -0.0884). |
| R4 | 2026-10-08 | Bars: accept needs share >= 0.95, gain >= +0.02, F2 and F3 >= 0; H3 needs point >= -0.05 and lower bound > -0.10 | KEPT | Matches prereg and `category()` / `h3_usable()` in supplementary.py. |
| R5 | 2026-10-08 | Labels 75 to 87 per class, all mature (LAST_NFL 2025, asserted) | KEPT | A1 confirmed labels mature 2008 to 2023. Not retested in A4. |
| R6 | 2026-10-08 | College profile adds nothing measurable over draft slot; stop fitting profile features to this target; no third form on the same inputs | REVISED | H2 REJECTED on the rebuild, in S2 and in every S4 window. Judge 2026-10-08 finding 6: the H2 design carries the D7 no-college-link flag (partly outcome-linked; hit rate by link status flips sign across pick bands, audit.json), net effect unmeasured, so this is a result for that design. |
| R7 | 2026-10-08 | Two-part target changes nothing in ranking | REVISED | Now: no measurable ranking gain (F1 +0.0004, share 0.53). No reorder count exists; "and it does not" was unmeasured (Judge 2026-10-08 finding 9). H1 F1 never ACCEPTED in any window; largest F1 window gain +0.0023. F3 shows +0.0181 in 2020-23 with share 1.0, but no rule reads F3 alone and F1 fails there. |
| R8 | 2026-10-08 | Occurrence part useful as a probability: Brier 0.144 vs 0.185 for a position base rate | REVISED | S3 F1: 0.1445 vs 0.1848, ratio 0.7817 [0.7366, 0.8322]. Descriptive, no verdict rule. The baseline is pick-blind (D2), so this beats a pick-blind position base rate; shrinkage at both ends is needed before any probability is shown (Judge 2026-10-08 finding 8). |
| R9 | 2026-10-08 | Overconfident at the top: top decile predicts 0.90, observes 0.70 | REVISED (twice) | J finding 8 replaces the first revision: overconfident at both ends. Outputs of 0.000 (190 rows, bins 1 and 2) occur 2 to 3 percent of the time; bins 3 to 5 predict low (0.04, 0.071, 0.109 vs 0.084, 0.106, 0.179); top decile 0.899 vs 0.695. Bins 6, 7 and 9 are within 0.02; bin 8 predicts low (0.385 vs 0.484). The 0.4443 slope depends on the 0.001 clip and does not describe the middle of the range. |
| R10 | 2026-10-08 | Same small-cell extreme behind Love's served hp 1.000 | KEPT | S5: Love occ 1.0 in all three formats. |
| R11 | 2026-10-08 | Any shown probability needs shrinkage there | REVISED, untested | Shrinkage is needed at both ends, not only the top (R9). A recommendation, not a result. No shrinkage was fitted (E1 not run). |
| R12 | 2026-10-08 | XC0 ties FantasyPros pre-draft per class 0.42/0.52/0.48 vs K0 0.53/0.47/0.41 | REVISED | "Ties" becomes "meets the prereg usable bar against" (Judge 2026-10-08 finding 7): the interval answers a non-inferiority bar, not equivalence. S6 F1: XC0 0.4175/0.5163/0.4757, K0 0.5349/0.4737/0.4146. 2021 trails by more than 0.10 in every format (F1 -0.1174, F2 -0.1199, F3 -0.1048); the lower bound passes because the all-2021 resample is 1/27 of the bootstrap mass, so the bound reads (2 x 2021 + 2022) / 3 = -0.0641. |
| R13 | 2026-10-08 | XC0 costs 0.035 Spearman against knowing the actual slot | KEPT | S6 F1 cost of unknown slot -0.0354 (F2 -0.0231, F3 -0.0102). |
| R14 | 2026-10-08 | Three classes cannot rank XC0 above or below K0 | KEPT, F2 added | S6 F1 drop-one-class jackknife changes sign: +0.0518, -0.0282, -0.0374; every value clears the -0.05 point bar. F2 jackknife: XC0 trails K0 in all three drops (-0.0006, -0.0478, -0.0726); dropping 2023 falls below the -0.05 point bar (Judge 2026-10-08 finding 7). No rule reads the jackknife (D6), so scope F1, F2, F3 stands as the rule's output. |
| R15 | 2026-10-08 | VOR3 exactly 0 for 85% of QBs, 68% RBs, 73% WRs, 84% TEs (F1) | KEPT | Same in results.json and the rebuild. Not recomputed in A4. |
| R16 | 2026-10-08 | F1 p75 is 0 | KEPT | supplementary.json `p75` agrees. |
| R17 | 2026-10-08 | "Above p75" means "any starter season" | REVISED | With p75 = 0 it means any positive VOR3, which is the addendum's wording. "Starter season" overstates it. |
| R18 | 2026-10-08 | H2's QB gain 0.457 to 0.475 | WITHDRAWN | Does not survive the rebuild: H2 QB 0.4547 vs C0 0.4568. The inline gain was feature drift between store states, not a model effect. Already labelled a not-finding; now withdrawn outright. |
| R19 | 2026-10-08 | H2's TE loss | KEPT as a not-finding | Rebuild H2 TE 0.4260 vs C0 0.4568 (inline 0.4336). Post-hoc subgroup move inside a REJECTED test. |
| R20 | 2026-10-08 | H3 2020 used an identity rank-to-pick map; shown, not gated | KEPT | S6 2020: XC0 = XC0d = 0.6086 in F1, as an identity map implies. |
| R21 | 2026-10-08 | 2023 capture is 22 days pre-draft; drafted-only conditioning as in the frozen K0 comparison | KEPT | Design facts, not retested. |
| R22 | 2026-10-08 | NFLMDD rights unverified | KEPT | Unchanged; still a blocker for any served XC0. |
| R23 | 2026-10-08 | After the draft: capital-only C0 rating, labelled as such | REVISED (wording) | Unchanged by A4. S5: published ratings match the frozen ones exactly (70 compared). Wording (Judge 2026-10-08 finding 11): the C0 rating stays as the frozen judge labelled it; results.md no longer frames it as the answer to an overall score. No overall prospect rating follows from this run. |
| R24 | 2026-10-08 | Before the draft: XC0 as "projected draft capital", 2021+, rights caveat | REVISED | XC0 meets the prereg usable bar as projected draft capital (descriptive, 3 classes); not adopted, pending the judge's corrections and the NFLMDD rights check (R22); any adoption needs an independent high judge (prereg). Scope F1, F2, F3 (S6); in F2 XC0 trails K0 by -0.0403 (lo -0.0884) and its jackknife trails in all three drops (R14). |
| R26 | 2026-10-08 | Prereg committed 125c50c before any fit (results.md:3, CHECKPOINT.md:36) | KEPT | prereg.md committed 2026-10-07 01:29:40; target_experiment.py last written 01:31:07; results 01:36 to 01:37 (e468360). Judge 2026-10-08 findings 4 and 10. |
| R25 | 2026-10-08 | No number claiming college talent adds to either; no 0-100 overall talent score | KEPT | Follows from R6. |

## CHECKPOINT.md

| # | Date | Claim | Status | Reason |
|---|---|---|---|---|
| C1 | 2026-10-08 | Inline verdicts: H1 NOT SUPPORTED, H2 REJECTED, H3 USABLE descriptive | KEPT | Same on the A2 rebuild; none FRAGILE in A4 (`robustness`). |
| C2 | 2026-10-08 | Audit point 1: population cache came from a scratch DB later changed, not store 85d9801d | KEPT, resolved | A2 rebuilt on the lane copy: same 2,479 rows, zero label, pick, link or capital mismatches. Deviation D1. |
| C3 | 2026-10-08 | Audit point 2: Brier baseline is a position base rate, not the named isotonic occurrence baseline | KEPT | Recorded deviation D2, not a defect. |
| C4 | 2026-10-08 | Audit point 3: the script prints no Love or frozen-panel diagnosis | KEPT, resolved | D3. A4 S5 prints it: 90 of 91 members found; Ekeler is not in the population. |
| C5 | 2026-10-08 | Audit point 4: ridge alpha by row leave-one-out, not nested temporal folds | KEPT, tested | D4. S2 nested alpha: H2 still REJECTED (F1 -0.0012); row-LOO fallback used in 3 outer classes per position and format. |
| C6 | 2026-10-08 | Audit point 5: shared nflverse cache partly refreshed by another run | KEPT, resolved | A2 found zero mismatches outside H2 inputs. |
| C7 | 2026-10-08 | A1: labels mature 2008 to 2023; EMB=3 the only embargo with zero future label seasons | KEPT | Not retested in A4. |
| C8 | 2026-10-08 | A2: 344 numbers, 68 differ, all H2; verdicts identical | KEPT | A4 base reproduces the rebuild to 1e-12. |
| C9 | 2026-10-08 | A2: H2 F1 -0.0058 [-0.0185, +0.0061] | KEPT | Used as the corrected R2 figure. |
| C10 | 2026-10-08 | results.md QB note for H2 does not survive (H2 QB 0.455 vs C0 0.457) | KEPT | Recorded as R18 WITHDRAWN. |
| C11 | 2026-10-08 | `all_seasons_complete: false` in audit.json | WITHDRAWN as a finding | Flag-definition error: traded players exceed the schedule length in 2009, 2018, 2019 and 2025, which trips the check. All 18 seasons are complete (A1). Not retested in A4. |
| C12 | 2026-10-08 | Store copy 85d9801d unchanged | KEPT | supplementary.json `store_sha256` equals `store_sha256_after`; A3 shas re-verified 2026-10-08. |
| C13 | 2026-10-08 | Addendum and supplementary.py frozen before any A4 number | KEPT, evidence qualified | Both shas match the CHECKPOINT record. One supplementary.json exists (2026-10-07 10:27 local); no failed or repeated A4 run is recorded in this folder. The job tmp log was not searched. Git does NOT order A3 before A4: f275a61 commits addendum, supplementary.py and supplementary.json together. The order rests on file times (addendum 09:26:11, supplementary.py 09:27:47, supplementary.json 10:27:53) and the sha pin asserted at supplementary.py:349 (Judge 2026-10-08 finding 4). |
| C14 | 2026-10-08 | Addendum: no 0-100 score is produced (addendum:101) | CONFLICT RECORDED | The addendum also orders S5's 0-100 ratings (addendum:79-80); S5 computed rating_h1 (capital only) and rating_h2 (capital plus college profile, REJECTED) for 90 players, values 9.55 to 99.79, 17 from 2026. The addendum is frozen and sha-pinned, so the conflict is recorded, not repaired. Neither rating is an overall prospect rating; rating_h2 in supplementary.json must not be read or served as one (Judge 2026-10-08 finding 12). |
