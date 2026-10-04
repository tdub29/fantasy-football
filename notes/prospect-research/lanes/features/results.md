# Features lane: results (2026-10-04)

Preregistration: `prereg.md` (commit fdeef37, before any score). Numbers: `results.json`
(`replay`, `diagnostics`). Code: `projections/lanes/features/`. Store: a lane copy (sqlite3 backup API).
Nothing shared was written; nothing is wired.

## Bottom line

- **Receiving shape (air yards, aDOT, YAC): dropped before preregistration.** The columns are null in
  every season 2004-2022 and 2024 (0.2% in 2023, 37% in 2025, 90% in 2026), so no training row of any
  replay has them. The populated columns are the store's own ESPN play-by-play recomputed (season EPA
  correlates 0.97-0.99 with the store's `TEPA`) and join by name only (62-89%).
- **Team talent, F1 (`tal_pct`): fails at WR and RB.** WR loses log loss to S6n4 (beats it in 0.7% of
  200,000 season resamples). RB improves log loss but fails display rule D1 (slope 0.72) and the
  replacement test (91.7%).
- **Same-position competition, F2 (`pos_bc`): fails at WR** (32.8%). **At RB it passes every
  preregistered gate, FRAGILE, and the whole gain is one program.** Beats the shipped S4n4 in 99.71% of
  200,000 season resamples; gain survives dropping the top 3 and top 5 gain rows; positive in all 10
  leave-one-season-out runs; coefficient positive in all 10 replays. But drop-5 support is 77.6% (under
  the preregistered 90% fragility line), D1 slope is 0.76 against a 0.75 floor, and 14 Alabama RB rows
  (13 hits) carry more than the entire gain: without them the gain is -0.00006 and support 46%. My
  recommendation to the coordinator: do not ship; if anything, freeze it prospectively.

## Replay sanity check (prereg requirement)

The lane replay's shipped models reproduce the current `experiments/serving-backtest.json` exactly:
WR S6n4 n 3,374, 60 events, all 1.11/1.13, first-eligible 1.10/1.22, D1 1.01/1.07, log loss 0.0617;
RB S4n4 n 2,215, 86 events, all 1.07/0.93, first-eligible 1.00/0.87, D1 1.06/0.78, log loss 0.1170.
(These differ from the checkpoint's cycle 7/9 figures because the store was relinked since; the JSON is
current.)

## Gate table (ratio / slope; served log loss; replacement support at 200,000 season resamples, seed 7)

| Cell | All rows | First-eligible | D1 top 60 | Log loss (shipped to cand) | Beats shipped | Drop top 3 / top 5 gain | Verdict |
|---|---|---|---|---|---|---|---|
| F1 WR | 1.11 / 1.15 | 1.10 / 1.24 | 1.00 / 1.09 | 0.06169 to 0.06199 | 0.70% | -0.00035 / -0.00038 | fail (replacement, concentration) |
| F2 WR | 1.11 / 1.14 | 1.09 / 1.24 | 1.03 / 1.13 | 0.06169 to 0.06182 | 32.8% | -0.00031 / -0.00040 | fail (replacement, concentration) |
| F1 RB | 0.97 / 0.89 | 0.94 / 0.82 | 0.97 / **0.72** | 0.11702 to 0.11562 | 91.7% | +0.00083 / +0.00054 | fail (D1 slope, replacement) |
| F2 RB | 1.05 / 0.95 | 0.99 / 0.89 | 1.00 / 0.76 | 0.11702 to 0.11521 | **99.71%** | +0.00101 / +0.00058 | **pass, fragile** |

## F2 at RB: what carries it (reported, not gating)

| Check | F2 RB | Shipped S4n4 |
|---|---|---|
| Gain 90% interval (season resampling) | +0.00067 to +0.00299 | |
| Support after dropping top 3 / 5 / 10 gain rows | 90.4% / 77.6% / 30.0% (drop 10 gain -0.00028) | |
| Share of total gain in top 5 rows | 68% | |
| Leave-one-season-out gain | positive in 10 of 10 (min +0.00133) | |
| Coefficient of `pos_bc` (standardized), by replay | +0.19 to +0.32, all 10 positive | |
| Without Alabama rows (14 rows, 13 hits) | gain -0.00006, support 46% | |
| D1 slope in band under season resampling (4,000) | 54% (90% interval 0.57-0.95) | 60% (0.59-0.97) |
| All six calibration gates jointly | 54% | 57% |
| First-eligible gates in band | 89% | 88% |
| AUC, all served / drafted only | 0.900 / 0.679 | 0.894 / 0.669 |
| Logit correlation with shipped | 0.989 | |

Top gain rows: Eddie Lacy 2012, Brian Robinson 2019 and 2020, Carlos Hyde 2013, Kenyan Drake 2014 and
2015, Josh Jacobs 2018, Najee Harris 2019, Kerryon Johnson 2017, Clyde Edwards-Helaire 2019: committee
backs in deep blue-chip rooms (4-7 blue-chip teammates) whose modest shares made S4n4 forecast them at
3-27% (nine of ten under 13%). By `pos_bc` bucket, S4n4 under-forecasts the deepest rooms (3+: observed 11.4%, S4n4 7.9%,
F2 9.2%), so the direction matches the hypothesis. But the season bootstrap treats seasons as the unit
while the gain clusters in one school; a single program's RB pipeline (13 hits in 14 rows) is not
evidence that same-position competition generalizes. The targeted weakness (drafted-only ranking)
moves 0.669 to 0.679, a small change.

## Leakage and availability (feature-rules / leakage-audit)

- `tal_pct`: `cfb_team_talent` season k is built by sdv-py `cfb_roster_talent` from 247 signing classes
  k-3..k (producer code read: `cfbfastR-cfb-data/python/cfb_data_build/recruiting.py`), all signed before
  season k; `n_recruits` equals the store's own 4-class recruit count exactly from 2007. Percentile
  reference set is season-k FBS teams. Available before season k + 1, so servable at week 4. REVIEW items
  disclosed: method vintage (regenerated by current code) and a rank-decay exponent tuned upstream
  against team wins (not NFL outcomes).
- `pos_bc`: 247 position and stars at signing, classes k-3..k, own name excluded. Same timing. Missing
  for 2004 snapshots by construction (median-imputed inside each fit).
- Both use only the last completed season, never the season in progress; training rows and served rows
  use one definition (`lane_feats.attach`). Self-check: `python projections/lanes/features/lane_feats.py`.
- Verdict: no contamination found; REVIEW REQUIRED only for the upstream method items above.

## Dispositions for the coordinator's registry

| Family | Disposition |
|---|---|
| Air yards, aDOT, YAC, air-yards share (`espn_cfb_adv_receiving`) | too sparse: absent before 2025; revisit once 2025+ seasons are mature training rows |
| Per-game receiving EPA, SR, WPA (`espn_cfb_adv_receiving`) | redundant with the store's ESPN PBP (EPA r 0.97-0.99); name-only join |
| Team talent composite (`cfb_team_talent`) | tested (F1): fails at WR and RB |
| Same-position blue-chip competition (247 classes) | tested (F2): fails at WR; RB passes all preregistered gates, fragile, gain is one program (Alabama); recommend no ship, prospective freeze at most |

## If the coordinator sends F2 RB to review anyway (patch description, not applied)

1. Data: add `cfb_recruits` 2002-2003 to `prospect_db.SOURCES` years (the 4-class window for 2005-2006).
2. `prospect_stage.snapshots`: attach `pos_bc` per row with `lane_feats.attach(rows.assign(k=season))`.
3. `build_prospect_model.predraft_profile` (or `with_live`): attach `pos_bc` from each player's latest
   season at or before `season - 1`, same function.
4. `fit_stage`: RB columns `stage_cols("RB") + LIVE + ["pos_bc"]`; `NEXT_MODEL["RB"]` stays `S4n4` until
   review; registry rows for `cfb_team_talent` and the 2002-2003 recruit files.
The reviewer should check the school concentration first; a school-clustered bootstrap is the natural
next test and was not preregistered here.
