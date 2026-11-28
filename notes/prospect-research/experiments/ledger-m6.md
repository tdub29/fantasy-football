# Experiment ledger: M6, feature-family prospect model (spec fixed 2026-11-28, before scoring)

Owner request (Trevor, 2026-11-28): a prospect model that visibly uses several feature families at every
position. Served at all four positions by owner decision whatever the score; cards label the evidence.

Spec, fixed before any M6 score was read (`m6_feature_families.py`):
- Model: regularized logistic, C = 0.1 (the charter's fixed C), fold-local median imputation and scaling.
- Capital: log pick through the K0 restricted cubic spline.
- Production: QB aya_final, comp_final, rush_ypg_best, starts; RB scrim_ypg, ryptpa_final, dom_best;
  WR ryptpa_career, dom_best, breakout_age; TE ryptpa_best, dom_best, breakout_age.
- Athleticism and size: weight, speed_score.
- Age: draft_age.
- Landing spot: drafting team's prior-season pass attempts and PPR at his position (final before the draft).
- A feature joins only where the DB has it for at least 30% of that position's training rows.
- Folds, rows, bootstrap and calibration: charter v2 forward folds via `prospect_experiments.py`; K0, BASE and
  M4 read from `M4-oof.csv` on identical rows. Ablation: M6 refit without each family. No tuning.

## Result (2026-11-28, `M6.json`)

| Hit line | n / hits | Log loss K0 / M4 / M6 | M6 beats K0 | M6 beats base rate | M6 slope | Lift: production / athleticism / age / landing |
|---|---|---|---|---|---|---|
| QB12 | 105 / 20 | 0.3634 / 0.3772 / 0.3991 | 2% | 90% | 0.71 | -0.0041 / -0.0021 / -0.0039 / -0.0233 |
| RB24 | 223 / 64 | 0.4640 / 0.4538 / 0.4722 | 30% | 100% | 0.79 | +0.0038 / -0.0011 / -0.0054 / -0.0072 |
| WR24 | 323 / 54 | 0.3510 / 0.3491 / 0.3617 | 28% | 100% | 0.90 | -0.0090 / -0.0016 / +0.0003 / -0.0019 |
| TE12 | 130 / 25 | 0.4035 / 0.3883 / 0.4039 | 47% | 87% | 0.73 | -0.0078 / +0.0054 / -0.0068 / +0.0011 |

Verdict under charter v2: reject at every position (M6 does not beat K0; QB and TE slopes out of band).
Served at all four positions by owner decision 2026-11-28, cards labelled with the position check and a
per-player family breakdown. Missing from the DB: depth charts, snaps, transactions (no vacated targets),
and a composite athleticism score.

## M6b (spec fixed 2026-11-28, before scoring; branch agent/m6b)

M6 with two families rebuilt (`m6b_landing_athleticism.py`); model, folds, rows, production and age unchanged:
- Athleticism: athl_comp = mean within-position percentile of forty, vertical, broad jump, cone, shuttle, bench,
  height, weight (times inverted), percentiles from each fold's training rows only, needs 2+ measures.
- Landing: tm_pass_att_prev; vac_share = share of the drafting team's prior-season position volume (QB attempts,
  RB carries + targets, WR/TE targets) by players with no contract covering the draft season, among contracts
  signed before the draft year; inc_top = largest share held by a player still under contract. Missing when any
  volume player lacks a contract record.
- Not used: depth charts and snap counts (local nflverse cache 2023+ only; a draft-season depth chart is set
  after the draft). Scored against K0, M4 (M4-oof.csv) and M6 (refit) on identical rows, with ablation.
- Addendum before any M6b score was read (2026-11-28): landing also gets snap_vac and snap_inc (prior-season
  nflverse offensive snap shares at the position held by players without / with a contract covering the draft
  season; snaps exist from 2012, so draft classes before 2013 are missing, shown as missing) and
  dc_starter_left (prior-season final regular-season depth-chart starter has no contract covering the draft
  season). Snap and depth files fetched from the public nflverse releases (depth 2007-2025, snaps 2012-2025).

### M6b result (2026-11-28, `M6b.json`; research only, not served)

| Hit line | Log loss K0 / M4 / M6 / M6b | M6b beats K0 | beats M6 | beats base rate | M6b slope | Lift: production / athleticism / age / landing |
|---|---|---|---|---|---|---|
| QB12 | 0.3634 / 0.3772 / 0.3991 / 0.3867 | 17% | 96% | 92% | 0.73 | -0.0029 / -0.0010 / -0.0037 / -0.0126 |
| RB24 | 0.4640 / 0.4538 / 0.4722 / 0.5653 | 1% | 3% | 79% | 0.49 | -0.0412 / -0.0004 / +0.0077 / -0.0999 |
| WR24 | 0.3510 / 0.3491 / 0.3617 / 0.4049 | 1% | 1% | 86% | 0.64 | +0.0035 / -0.0024 / -0.0099 / -0.0457 |
| TE12 | 0.4035 / 0.3883 / 0.4039 / 0.4251 | 14% | 2% | 82% | 0.69 | +0.0086 / +0.0005 / -0.0035 / -0.0145 |

Verdict: reject at every position; worse than M6 except QB, and overconfident everywhere (slope 0.49-0.73).
The new landing inputs hurt most (RB -0.0999, WR -0.0457). Likely cause, not tested: their coverage is
era-dependent (contract records thin before 2012, snaps none before the 2013 class: snap_vac covers 0% of
classes 2008-2013, rising to 80-100% from 2018), so missingness filled at the fold median tracks the draft era.
The composite athleticism score (86-92% coverage) added nothing material. Monitor now also scores M6;
no newly closed class exists yet for either model.

