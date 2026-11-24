# Experiment ledger: M4, the displayed pick + profile cut model (scored 2026-11-24)

Kept apart from `ledger.md`, which `projections/prospect_experiments.py` regenerates from the A*.json files.

`python notes/prospect-research/experiments/m4_cut_model.py` -> `M4.json`, `M4-oof.csv`. Not pre-registered: a retrospective score of the model the site displayed from 2026-10-11, same charter folds and rules, against K0 (this ledger's baseline) and its own pick-only logistic (PICK) on identical rows. Hit-line rows below; first cuts (QB/TE 6, RB/WR 12) are in the JSON and model card and also reject.

| ID | Pos | Fwd base | Fwd cand | Boot | Class wins | Slope | 2020+ base / cand | LOCO base / cand | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| M4 | QB | 0.3634 | 0.3772 | 16% | 4/10 | 0.91 | 0.4582 / 0.4638 | 0.3745 / 0.3874 | reject |
| M4 | RB | 0.4640 | 0.4538 | 89% | 5/11 | 1.05 | 0.4316 / 0.4306 | 0.4400 / 0.4276 | reject |
| M4 | WR | 0.3510 | 0.3491 | 60% | 6/11 | 1.12 | 0.3227 / 0.3274 | 0.3586 / 0.3494 | reject |
| M4 | TE | 0.4035 | 0.3883 | 68% | 5/10 | 1.04 | 0.2895 / 0.2867 | 0.4297 / 0.4275 | reject |
| PICK | all | | | | | | | | reject at every position and cut |

Displayed instead: K0 at the hit line only, drafted players only, frozen in `site/data/prospect-cut-model.js` (`--freeze`). First cut is not shown: it is not a charter target, and K0 fails the slope band at QB6 (0.58) and WR12 (0.69); RB12 (1.22, 90% interval 1.07-1.52, under-predicts) and TE6 (1.03) are inside the band and hidden with it. Sensitivity (not charter): on 2014+ classes M4 and PICK both pass RB24; non-charter population, decides nothing.
Rule 6 independent review: PASS 2026-11-24 (reproduced M4.json and M4-oof.csv exactly), `review-m4-2026-11-24.md`. Monitor: `m4_monitor.py`.
