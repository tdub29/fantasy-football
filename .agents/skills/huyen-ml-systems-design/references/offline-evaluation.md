# offline-evaluation (Huyen Ch6)

How to judge a model *before* it ships: baselines, then evaluation beyond aggregate accuracy (perturbation, invariance, directional-expectation, calibration, confidence, slice-based). Folds in model-selection discipline (the six tips, four phases). The artifact is an **offline evaluation report** — model choice justified against baselines, plus a battery of robustness/fairness/calibration/slice results that says "ship or don't" with evidence, not a single F1.

## When to pull this

- "How do you know the model is good / which model do you pick / is it ready to ship?" in an MLSD loop.
- Choosing among algorithms (logistic regression vs gradient-boosted trees vs a neural net / SOTA model).
- A model has a strong aggregate metric but you suspect it's hollow (no baseline, biased, miscalibrated, fails on a slice).
- Deciding what evaluation battery to run before deployment.
- Defending a model against a fairness or robustness challenge.

Don't pull this for: *online* evaluation in production — shadow/A-B/canary, monitoring (→ `continual-learning-and-test-in-production`, `data-distribution-shifts-and-monitoring`). This is the pre-deployment, ground-truth-available stage.

## Model selection (the six tips, condensed)

1. **Avoid the SOTA trap** — SOTA means "beat others on a static benchmark," not "best/cheapest for your data." Solve the problem, not the leaderboard.
2. **Start with the simplest model** — deploys early (validates the pipeline), debugs easier, serves as a baseline. (Simplest ≠ least effort: pretrained BERT is low-effort to start but high-effort to improve.)
3. **Avoid human bias** — compare architectures under *comparable* setups (don't run 100 experiments on your favorite and 2 on the rival).
4. **Now vs later** — use **learning curves** to see if more data will flip the ranking; a model that self-updates online can overtake a stronger static one.
5. **Evaluate trade-offs** — FP vs FN (fingerprint unlock vs COVID screening), accuracy vs compute/latency, performance vs interpretability.
6. **Understand assumptions** — IID, smoothness, linear boundaries, conditional independence, normality. A model fails when the data violates its assumptions.

**Four phases of development** (each phase = the baseline for the next): (1) non-ML heuristics → (2) simplest ML (LR/GBT/kNN) → (3) optimize simple models (tuning, features, ensembles) → (4) complex models. **Ensembles** (bagging/boosting/stacking) reliably boost performance (uncorrelated base learners — 3 independent 70% classifiers → 78.4% majority vote) but are harder to deploy/maintain; reserved for high-stakes small lifts (ad CTR).

> Training-ops to mention if probed: experiment tracking + versioning (code AND data — data versioning is "like flossing"), distributed training (data parallelism: sync vs async SGD, straggler/staleness; model + pipeline parallelism), AutoML (hyperparameter tuning is the practical form; NAS/learned optimizers the frontier). **Never tune hyperparameters on the test split.**

## Baselines — a metric means nothing without one

An F1 of 0.90 is worthless if random-guessing the 90%-majority class also scores ~0.90. Always evaluate against the five baselines:

- **Random** — predict per uniform or per label distribution. (90/10 task: uniform → F1 0.167/acc 0.5; label-dist → F1 0.1/acc 0.82.)
- **Simple heuristic** — forget ML; what does a rule give (reverse-chron feed)?
- **Zero rule** — always predict the most common class.
- **Human** — how do experts do? (Needed to earn user trust for self-driving.)
- **Existing solution** — the if/else logic or vendor you'd replace. (Your model can be slightly worse and still *useful* if cheaper/simpler.)

Distinguish **good** (better than prior systems) from **useful** (clears the bar that makes someone adopt it). A good system can be useless; a worse one can be useful.

## Evaluation battery — beyond aggregate accuracy

| Test | What it catches | How |
|---|---|---|
| **Perturbation** | Brittleness to real-world noise (hospital coughs vs phone coughs) | Add noise/clip the test set; pick the model best on *perturbed* data, not clean. High noise-sensitivity = hard to maintain + adversarially exposed. |
| **Invariance** | Bias / unfair dependence | Changing a sensitive input (race, name, gender) must NOT change the output. Better: exclude the sensitive feature entirely (the Berkeley mortgage case). |
| **Directional expectation** | Model learned the wrong relationship | Changing an input must move output the *expected* direction (bigger lot → not-lower price). Wrong direction → investigate before shipping. |
| **Calibration** | Probabilities that don't mean what they say | If you predict 70% and it happens 60% of the time, you're miscalibrated. Counting method / `calibration_curve`; fix with **Platt scaling**. Critical when you need P(click) for click *counts* or representative recommendations (80% romance / 20% comedy, not 100% romance), not just ranking. |
| **Confidence measurement** | Per-sample usefulness threshold | A per-sample metric: only show predictions above a certainty bar; below it discard / loop in humans / ask for more info. Showing low-confidence predictions erodes trust (or is catastrophic — predictive policing). |
| **Slice-based** | Hidden underperformance on subgroups | Split data and evaluate per slice. Catches (a) unfair gaps (Model A: 98% majority/80% minority/96.2% overall vs Model B: 95/95/95 — A's high aggregate hides bias) and (b) critical slices (paid users in churn). Watch **Simpson's paradox** — a model can win overall but lose on every subgroup. |

## Practitioner checklist

- [ ] Selected the model against the six tips (not the SOTA reflex); started simple as a baseline.
- [ ] Reported every metric against ≥1 explicit baseline (at minimum random + existing solution).
- [ ] Separated "good" from "useful" for the actual adoption bar.
- [ ] Ran perturbation (noise robustness) and chose the model best on perturbed, not clean, data.
- [ ] Ran invariance (sensitive features don't move output) and directional-expectation tests.
- [ ] Checked calibration if downstream needs probabilities (counts, representativeness), not just ranking.
- [ ] Did **slice-based** evaluation across subgroups + critical slices; checked for Simpson's paradox.
- [ ] Never touched the test split for tuning/feature ideas.

## Interview signal

This is the question that most cleanly separates levels: juniors quote one aggregate metric, seniors interrogate it. The tells: you demand a **baseline** before accepting any F1; you run **slice-based** evaluation unprompted (fairness + critical slices); you bring up **calibration** when the use case needs probabilities; and you frame shipping as a **battery** (robustness/fairness/calibration/slices), not a number.

> Senior talking point: *"A single F1 tells me almost nothing — first I anchor it to baselines, because a 0.90 F1 on a 90/10 problem can be random guessing. Then I never ship on aggregate accuracy alone: I slice by subgroup and by business-critical segment (Simpson's paradox means a model can win overall and lose on every slice), I run perturbation tests and pick the model that's best on noisy data not clean, and if the downstream consumes probabilities I check calibration, not just ranking. Invariance and directional-expectation tests are my fairness and sanity gates before deployment."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 6.
- Sibling refs: `feature-engineering` (feature importance/ablation feed model selection; the offline-vs-prod gap = leakage), `training-data` (the imbalance metrics — F1/PR-curve — carry into baselines), `model-deployment` (what you do once it passes this gate), `continual-learning-and-test-in-production` (online evaluation: shadow/A-B/canary), `data-distribution-shifts-and-monitoring` (why offline ≠ production performance).
- Related skills: `kohavi-controlled-experiments` (the online A/B counterpart to this offline gate), `provost-data-science-for-business` (baselines, profit curves, evaluation-as-business-decision), `tetlock-superforecasting` (calibration as the core of a good forecast — Nate Silver echo), `mlsd-coach` (drills the "is it good?" question).
