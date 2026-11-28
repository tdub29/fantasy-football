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
