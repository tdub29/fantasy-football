# Target experiment: A4 supplementary results (written 2026-10-08)

Spec: `addendum-2026-10-07.md` (frozen, sha256 2e7606a5e00cd56dc85465daf8937e85f7e70c405564e5cf2cfcfc229c714956).
Script: `projections/lanes/parallel-2026-10-06/target-experiment/supplementary.py` (sha256
005074360b03b6eb9d951fe9c8e751f2727874f15c5cf90aeaed312d2268c182, ADDENDUM_SHA pinned). Output:
`supplementary.json`, written 2026-10-07 10:27 local by the one completed run. Both hashes re-checked 2026-10-08
before this write-up; neither the script nor any model was rerun for it. **Pending the P5 independent judge.**

Every number below is read from `supplementary.json`. Values are shown to 4 decimals; a value smaller than 0.00005
in size is shown in exponent form so its sign stays visible. Bootstrap shares are exact (2000 resamples). Intervals
are 90% class-bootstrap percentile intervals, seed 7. Format F1 is primary; F2 and F3 are consistency checks.

## Run integrity

| Item | supplementary.json | Expected |
|---|---|---|
| addendum_sha256 | 2e7606a5...4956 | matches the frozen addendum |
| population_sha256 | cb7ba4c9...7371 | the A2 rebuild (`audit.json`) |
| store_sha256 before / after | 85d9801d...a9c0 / 85d9801d...a9c0 | unchanged lane copy |
| base H1, H2 paired results, F1 to F3 | identical to `repro-85d9801d/results.json` | asserted in the script to 1e-12 |
| S6 H3 per class, F1 | identical to the prereg H3 | asserted in the script |

The script stops before writing `supplementary.json` on any reproduction miss, so the file existing with these
hashes means the base reproduced. Base, F1: H1 +0.0004 [-0.0056, +0.0062], share > 0 0.5315; H2 -0.0058
[-0.0185, +0.0061], share 0.229.

## Rules being applied (addendum section 4, as coded)

- Prereg category (`category()` in the script): ACCEPTED only if F1 share > 0 >= 0.95 and F1 point gain >= +0.02
  and F2 and F3 point gains >= 0; otherwise NOT SUPPORTED if the F1 point gain is > 0, else REJECTED.
- **H1, H2:** FRAGILE if any S4 window, or for H2 the S2 rerun, reaches ACCEPTED. A move between REJECTED and NOT
  SUPPORTED is reported, not a verdict change.
- **H3:** usable means point >= -0.05 and 90% lower bound > -0.10. FRAGILE if XC0d fails it in F1. Scope is "F1, F2,
  F3" if XC0 is usable in F2 and F3, else "F1 only".
- When checks disagree, the more conservative reading stands. No 0-100 score is adopted or served. S5 computes H1 (capital only) and H2 (capital plus college profile,
  REJECTED) ratings for 90 players for diagnosis; neither is an overall prospect rating, and rating_h2 in
  supplementary.json must not be read or served as one (revised 2026-10-08, judge finding 12).

## Deviations D1 to D8: what A4 did with each

| Dev | What | A4 handling | Outcome in the JSON |
|---|---|---|---|
| D1 | population cache provenance | every number on the rebuild cb7ba4c9 | population sha matches; base reproduces A2 |
| D2 | occurrence baseline is a position base rate, not "isotonic-on-pick" | S3 keeps the base rate | see S3 |
| D3 | panel not printed by the prereg run | S5 prints it | 90 of 91 listed players found; Austin Ekeler (2017, undrafted) not in the population, as expected |
| D4 | ridge alpha by row leave-one-out | S2 nested temporal alpha | see S2 |
| D5 | H3 point mapping (Jensen) | S6 adds XC0d | see S6 |
| D6 | coarse H3 interval | S6 jackknife, descriptive | see S6; no rule reads it |
| D7 | no-link flag in H2 | recorded only, not removed | no check by design |
| D8 | DeVonta Smith roster weight from draft year | recorded only (one row, H2) | no check by design |

## S2 nested alpha (H2), read with the prereg rule

| Format | H2 nested minus C0 [90%], share > 0 | H2 nested minus row-LOO H2 [90%], share > 0 |
|---|---|---|
| F1 | -0.0012 [-0.0154, +0.0129], 0.457 | +0.0046 [-0.0038, +0.0160], 0.7525 |
| F2 | +0.0047 [-0.0115, +0.0203], 0.694 | +0.0048 [-0.0045, +0.0198], 0.6675 |
| F3 | +0.0058 [-0.0053, +0.0178], 0.7945 | +0.0027 [-0.0038, +0.0110], 0.694 |

Category: **REJECTED** (F1 point -0.0012 is not > 0). Fallback to the prereg row leave-one-out alpha was logged in
3 outer classes for every position and format (11 folds for QB, 12 for RB, WR, TE). **Verdict the rule yields: H2
not FRAGILE from S2.**

## S4 class windows, prereg rule unchanged

F1 paired Spearman gain over C0 [90%], share > 0; then F2 / F3 points.

| Window | H1 category | H1 F1 | H1 F2 / F3 | H2 category | H2 F1 | H2 F2 / F3 |
|---|---|---|---|---|---|---|
| 2020 to 2023 (features untouched) | NOT SUPPORTED | +0.0014 [-0.0131, +0.0177], 0.6025 | +0.0058 / +0.0181 | REJECTED | -0.0103 [-0.0373, +0.0166], 0.265 | +0.0008 / +0.0070 |
| 2012 to 2019 (feature dev) | REJECTED | -0.0001 [-0.0047, +0.0049], 0.4845 | -0.0008 / -1.8e-05 | REJECTED | -0.0036 [-0.0162, +0.0089], 0.3385 | -0.0005 / +0.0012 |
| drop 2012 | NOT SUPPORTED | +0.0016 [-0.0046, +0.0076], 0.655 | +0.0025 / +0.0088 | REJECTED | -0.0027 [-0.0155, +0.0096], 0.366 | +0.0028 / +0.0067 |
| drop 2013 | NOT SUPPORTED | +0.0005 [-0.0058, +0.0068], 0.532 | +4.3e-05 / +0.0071 | REJECTED | -0.0073 [-0.0205, +0.0061], 0.1825 | -0.0002 / +0.0019 |
| drop 2014 | NOT SUPPORTED | +0.0002 [-0.0062, +0.0065], 0.4915 | +0.0007 / +0.0063 | REJECTED | -0.0079 [-0.0206, +0.0052], 0.154 | -0.0013 / +0.0003 |
| drop 2015 | NOT SUPPORTED | +0.0008 [-0.0055, +0.0072], 0.5595 | +0.0018 / +0.0062 | REJECTED | -0.0089 [-0.0213, +0.0037], 0.1145 | -0.0023 / +0.0014 |
| drop 2016 | NOT SUPPORTED | +0.0011 [-0.0051, +0.0074], 0.6 | +0.0020 / +0.0079 | REJECTED | -0.0039 [-0.0174, +0.0089], 0.318 | +0.0025 / +0.0046 |
| drop 2017 | REJECTED | -0.0002 [-0.0066, +0.0062], 0.4545 | +0.0028 / +0.0051 | REJECTED | -0.0067 [-0.0204, +0.0068], 0.2005 | -0.0019 / +0.0033 |
| drop 2018 | REJECTED | -0.0010 [-0.0069, +0.0050], 0.373 | +0.0014 / +0.0047 | REJECTED | -0.0045 [-0.0182, +0.0085], 0.28 | +0.0004 / +0.0044 |
| drop 2019 | NOT SUPPORTED | +0.0006 [-0.0059, +0.0068], 0.5465 | +0.0016 / +0.0065 | REJECTED | -0.0063 [-0.0195, +0.0072], 0.2145 | -0.0002 / +0.0039 |
| drop 2020 | REJECTED | -0.0011 [-0.0070, +0.0047], 0.3565 | -0.0006 / +0.0044 | REJECTED | -0.0065 [-0.0198, +0.0070], 0.203 | -0.0002 / +0.0038 |
| drop 2021 | REJECTED | -0.0014 [-0.0071, +0.0041], 0.319 | -0.0010 / +0.0040 | REJECTED | -0.0092 [-0.0211, +0.0027], 0.099 | -0.0029 / -0.0010 |
| drop 2022 | NOT SUPPORTED | +0.0023 [-0.0028, +0.0079], 0.7495 | +0.0028 / +0.0057 | REJECTED | -0.0046 [-0.0178, +0.0082], 0.299 | -0.0037 / +0.0031 |
| drop 2023 | NOT SUPPORTED | +0.0014 [-0.0045, +0.0076], 0.635 | +0.0028 / +0.0057 | REJECTED | -0.0014 [-0.0122, +0.0098], 0.4205 | +0.0062 / +0.0052 |

No window reaches ACCEPTED for either hypothesis. H1 moves from NOT SUPPORTED to REJECTED in 5 windows (2012 to
2019, drop 2017, drop 2018, drop 2020, drop 2021); by the rule that is reported, not a verdict change. The largest
H1 F1 point in any window is +0.0023, against a bar of +0.02. In the 2020 to 2023 window H1's F3 gain is +0.0181
with share 1.0; F3 is a consistency check and no rule reads it alone.

**Verdicts the rule yields:** H1 NOT SUPPORTED, not FRAGILE. H2 REJECTED, not FRAGILE (S2 and every S4 window
REJECTED).

## S6 H3 (XC0, XC0d), 2021 to 2023

| Format | XC0 minus K0pre [90%] | XC0 usable | XC0d minus K0pre [90%] | XC0d usable | Cost of unknown slot, XC0 / XC0d |
|---|---|---|---|---|---|
| F1 | -0.0046 [-0.0641, +0.0549] | yes | +0.0334 [-0.0314, +0.0981] | yes | -0.0354 / +0.0025 |
| F2 | -0.0403 [-0.0884, +0.0077] | yes | -0.0061 [-0.0306, +0.0185] | yes | -0.0231 / +0.0112 |
| F3 | +0.0076 [-0.0580, +0.0731] | yes | +0.0584 [-0.0168, +0.1337] | yes | -0.0102 / +0.0406 |

Per class Spearman, F1 (XC0 / XC0d / K0 / C0 at actual pick, n): 2021 0.4175 / 0.471 / 0.5349 / 0.474, n 57;
2022 0.5163 / 0.6042 / 0.4737 / 0.4958, n 63; 2023 0.4757 / 0.4481 / 0.4146 / 0.5458, n 71. 2020 (shown, not
gated, identity map) 0.6086 / 0.6086 / 0.5219 / 0.5215, n 62. XC0d out-ranks C0 at the actual pick in every format
(cost column above); that is not evidence a pre-draft estimate beats the actual slot (revised 2026-10-08).

Jackknife, drop one class (descriptive, D6, no rule reads it), XC0 minus K0pre: F1 2021 +0.0518, 2022 -0.0282,
2023 -0.0374; F2 -0.0006, -0.0478, -0.0726; F3 +0.0638, -0.0346, -0.0065. XC0d: F1 +0.082, -0.0152, +0.0333;
F2 +0.0117, -0.0251, -0.0048; F3 +0.1041, -0.0088, +0.0799. The F1 XC0 jackknife changes sign with the dropped
class, so three classes do not order XC0 against K0. (revised 2026-10-08, judge finding 7) In F2, XC0 trails K0 in
all three drops (-0.0006, -0.0478, -0.0726), and dropping 2023 falls below the -0.05 point bar; no rule reads the
jackknife (D6), so the F2 scope stands as the rule's output but rests on the thinnest evidence.

K0 format caveat (addendum section 2): the FantasyPros snapshots behind K0 do not record 1QB or superflex, so every
F2 and F3 row above is against a board of unknown format. F2 XC0 (-0.0403, lower bound -0.0884) passes both bars
with the least margin of any row.

**Verdict the rule yields:** H3 USABLE (descriptive, 3 classes), not FRAGILE (XC0d usable in F1). Scope "F1, F2,
F3" (XC0 usable in F2 and F3), subject to the K0 format caveat. (revised 2026-10-08, judge finding 7) "Usable" is a
non-inferiority bar, not equivalence: XC0 minus K0 in 2021 is -0.1174 (F1), -0.1199 (F2), -0.1048 (F3), and the F1
lower bound passes because the all-2021 resample is 1/27 of the bootstrap mass.

## S3 calibration (descriptive, no rule reads it)

Occurrence of VOR3 > 0, 948 scored rows.

| Format | Model | Brier | Log loss | AUC | Cal. slope | Cal. intercept | CITL | Mean p / observed |
|---|---|---|---|---|---|---|---|---|
| F1 | two-part | 0.1445 | 0.5079 | 0.8214 | 0.4443 | -0.4636 | 0.071 | 0.2453 / 0.2532 |
| F1 | position base rate | 0.1848 | 0.5533 | 0.6082 | 1.3361 | 0.4947 | 0.106 | 0.2339 / 0.2532 |
| F2 | two-part | 0.1465 | 0.5365 | 0.8205 | 0.4075 | -0.4916 | 0.1026 | 0.2547 / 0.2658 |
| F2 | position base rate | 0.1928 | 0.5723 | 0.587 | 1.2442 | 0.4005 | 0.1258 | 0.2423 / 0.2658 |
| F3 | two-part | 0.1465 | 0.5209 | 0.8134 | 0.412 | -0.5494 | 0.0073 | 0.2501 / 0.2511 |
| F3 | position base rate | 0.1855 | 0.556 | 0.5866 | 1.2528 | 0.359 | 0.0698 | 0.2383 / 0.2511 |

Brier ratio, two-part over base rate [90%]: F1 0.7817 [0.7366, 0.8322]; F2 0.7596 [0.7103, 0.8186]; F3 0.7896
[0.7511, 0.8319].

F1 reliability, 10 equal-count bins by rank (mean p / observed): 0.0/0.021, 0.0/0.032, 0.04/0.084, 0.071/0.106,
0.109/0.179, 0.167/0.168, 0.22/0.202, 0.385/0.484, 0.562/0.558, 0.899/0.695. The calibration slope is 0.4443 in F1
(0.4075 F2, 0.412 F3). (revised 2026-10-08, judge finding 8) Overconfident at both ends: outputs of 0.000 (190 rows)
occur 2 to 3 percent of the time, bins 3 to 5 predict low, and the top decile predicts 0.899 against 0.695. Bins 6, 7
and 9 are within 0.02 and bin 8 predicts low (underconfident). The 0.4443 slope is fit on logit(clip(p, 0.001, 0.999))
and depends on that clip; it does not describe the middle of the range.

Top decile by position, F1 (mean p / observed, n): QB 0.8524 / 0.5, 14; RB 0.8837 / 0.84, 25; WR 0.9296 / 0.6923,
39; TE 0.8768 / 0.6111, 18.

Magnitude, summed prediction over summed outcome [90%] and MAE: F1 C0 0.863 [0.7566, 0.992], 32.8067; H1 0.8804
[0.7761, 1.0057], 33.0169. F2 C0 0.8755 [0.779, 0.9877], 36.5477; H1 0.8898 [0.7982, 0.9972], 36.6554. F3 C0
0.892 [0.7804, 1.0281], 32.3562; H1 0.9095 [0.7993, 1.0427], 32.4428.

**No verdict.** The occurrence part beats the base rate on Brier in every format with intervals below 1, and is
overconfident at both ends (revised 2026-10-08; see the reliability bins above). Shrinkage at both ends is needed
before any probability is shown.

## T1 tiers (descriptive)

p75 of VOR3: F1 0.0, F2 6.249999999999986, F3 0.0. In F1 and F3 "above p75" therefore means "any positive VOR3".

| Format | Tier | n emb1 / emb3 | Share VOR3 > 0, emb1 / emb3 | Median VOR3, emb1 / emb3 | Pick range emb1 / emb3 |
|---|---|---|---|---|---|
| F1 | Elite | 48 / 48 | 0.7083 / 0.7708 | 117.35 / 130.6 | 2 to 55 / 2 to 67 |
| F1 | Strong | 97 / 97 | 0.6495 / 0.6289 | 32.4 / 32.4 | 1 to 102 / 1 to 93 |
| F1 | Solid | 185 / 185 | 0.427 / 0.427 | 0.0 / 0.0 | 2 to 116 / 2 to 106 |
| F1 | Dart | 289 / 287 | 0.1522 / 0.1603 | 0.0 / 0.0 | 8 to 224 / 6 to 224 |
| F1 | Long shot | 329 / 331 | 0.0608 / 0.0514 | 0.0 / 0.0 | 57 to 262 / 22 to 262 |

Embargo 1 reproduces the frozen tier table in F1 and F2 (no differences recorded). F3 has no frozen tier table, so
no comparison was made. Rows changing tier between embargo 1 and embargo 3, out of 948: F1 139, F2 123, F3 135.
F2 and F3 per tier tables, by-position splits and the crosstabs are in `supplementary.json` under `T1`.

**No verdict.** In F1, Solid keeps its n and its share above zero across embargoes; Elite, Strong (0.6495 to 0.6289) and Long shot (0.0608 to 0.0514) shares move.
139 of 948 rows change tier with the embargo.

## S5 panel (diagnosis only)

91 listed: Love, 35 other frozen panel names, 55 wide-panel players (drafted QB/RB/WR/TE, 2024 to 2026, pick 64 or
earlier, not already listed). 90 found. Published C0 ratings match the frozen `rating_C0` in all 70 comparisons
(max absolute difference 0.0).

Jeremiyah Love (2026, RB, pick 3), F1: published rating 99.8945 (Elite), embargo-3 rating 99.789 (Elite), H1 rating 99.789
and H2 rating 99.789 (H2 is REJECTED; neither is an overall prospect rating), occurrence probability 1.0 (also 1.0 in F2 and F3). Players with occurrence probability 1.0 among
the 90: F1 15, F2 19, F3 16. Published tier differs from the embargo-3 tier for 19 players in F1, 1 in F2 and 8 in
F3. 2024 and 2025 rows carry partial VOR through 2025 only, labelled immature; 2026 rows carry no outcome.

**No verdict, by design.** Nothing in S5 changes a model or a verdict.

## Verdicts after A4

| Hypothesis | Prereg verdict | A4 result | Standing verdict |
|---|---|---|---|
| H1 two-part target | NOT SUPPORTED | not FRAGILE; REJECTED in 5 of 14 S4 windows (reported only) | NOT SUPPORTED |
| H2 capital residual | REJECTED | not FRAGILE; S2 and all 14 S4 windows REJECTED | REJECTED |
| H3 pre-draft capital | USABLE (descriptive, 3 classes) | not FRAGILE; scope F1, F2, F3 | USABLE (descriptive, 3 classes), F1 to F3 with the K0 format caveat |

These match `robustness` in `supplementary.json`. No 0-100 score is adopted or served from any of this; S5's diagnostic H1 and H2 ratings are not an overall
prospect rating (revised 2026-10-08). P5 independent judge:
SOUND WITH CORRECTIONS (`judge-2026-10-07.md`), applied 2026-10-08.
