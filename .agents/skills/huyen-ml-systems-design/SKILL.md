---
name: huyen-ml-systems-design
description: Apply Chip Huyen's Designing Machine Learning Systems to ML-system-design interview loops and production ML practice. Use when the user says "design an ML system", is prepping an Applied/Product DS or ML-system-design interview (Stripe, DoorDash, Uber, Anthropic), or asks how to frame an ML problem, tie ML metrics to business objectives, decouple conflicting objectives, choose a task framing (classification/regression/multilabel), or set reliability/scalability/maintainability/adaptability requirements. Also triggers on training data (sampling, labeling, natural vs hand labels, feedback-loop length, weak/semi/transfer/active supervision, class imbalance), feature engineering (scaling, encoding the hashing trick, feature crossing, data leakage, feature importance/generalization), offline evaluation (baselines, perturbation/invariance/calibration/slice-based tests), model deployment (batch vs online prediction, cloud vs edge, quantization/distillation/pruning), data distribution shifts (covariate/label/concept drift, train-serve skew, degenerate feedback loops, monitoring without labels), continual learning (stateless vs stateful retraining, retraining cadence, champion/challenger), and testing models in production (shadow, A/B, canary, interleaving, bandits). Pull this whenever someone needs a decision, checklist, tradeoff table, or crisp senior talking point for any stage of the ML lifecycle. Output is a routed reference doc with an artifact + interview signal. Not for foundation-model / LLM application engineering (use huyen-ai-engineering) or pure distributed-systems internals (use kleppmann-data-intensive-systems).
---

# huyen-ml-systems-design

Book provenance: **Chip Huyen — Designing Machine Learning Systems (O'Reilly, 2022)**. Carved for an Applied/Product DS + ML-system-design interview prep + practitioner lens. Load the matching `references/*.md` file when a specific stage of the ML lifecycle is in play.

## When to use

Use this hub when the user is **designing an ML system, prepping an MLSD/Applied-DS interview, or making a production-ML decision** that maps to a stage in the lifecycle. Route to **one** reference, read it fully, then produce that stage's artifact (decision tree, checklist, tradeoff table, diagnosis, or interview talking point) — not a book summary.

Don't improvise a hybrid across stages unless the user explicitly wants an end-to-end pass. For an end-to-end mock, walk the framework below and pull each reference in order.

## The end-to-end design framework at a glance

Huyen's lifecycle is an **iterative loop**, not a waterfall. Walk it in interviews:

1. **Frame** — business objective → ML objective(s) → inputs/outputs/loss → reliability/scalability/maintainability/adaptability. *(`ml-systems-design-process`)*
2. **Data stack** — sources, storage, dataflow, batch vs stream. *(`data-engineering-fundamentals`)*
3. **Training data** — sampling, labeling, imbalance, augmentation. *(`training-data`)*
4. **Features** — operations, leakage audit, good-feature scorecard. *(`feature-engineering`)*
5. **Model + offline eval** — baselines, robustness/fairness/calibration/slice battery. *(`offline-evaluation`)*
6. **Deploy** — batch vs online, cloud vs edge, compression. *(`model-deployment`)*
7. **Monitor** — failure taxonomy, shift types, detection, feedback loops. *(`data-distribution-shifts-and-monitoring`)*
8. **Update + test in prod** — stateless vs stateful, cadence, shadow/A-B/canary/bandits. *(`continual-learning-and-test-in-production`)*
9. **Business analysis** → back to step 1.

The senior framing: state the **business metric and the ML→business map first**, present the lifecycle as a **loop**, and treat ML systems as **part code, part data** that **fail silently** and **decay over time**.

## Quick routing

| User cue (examples) | Reference |
|---|---|
| "Design an ML system for X", frame a vague ask, tie ML metric to business metric, decouple conflicting objectives, task framing, set RSMA requirements | `references/ml-systems-design-process.md` |
| Where data lives / moves, format (Parquet/CSV), relational vs document vs graph, OLTP vs OLAP, batch vs stream, static vs dynamic features | `references/data-engineering-fundamentals.md` |
| How to get/label data, sampling method + bias, natural vs hand labels, feedback-loop length, weak/semi/transfer/active learning, class imbalance | `references/training-data.md` |
| Feature operations, scaling, categorical/hashing trick, feature crossing, **data leakage**, feature importance vs generalization | `references/feature-engineering.md` |
| Model selection, baselines, "is it good?", perturbation/invariance/calibration/**slice-based** evaluation before deploy | `references/offline-evaluation.md` |
| Batch vs online prediction, cloud vs edge, latency budget, quantization/distillation/pruning, train-serve skew from two pipelines | `references/model-deployment.md` |
| "Worked at launch, degraded now", covariate/label/concept shift, drift detection without labels, degenerate feedback loops, what to monitor | `references/data-distribution-shifts-and-monitoring.md` |
| "How often to retrain", stateless vs stateful, champion/challenger, shadow/A-B/canary/interleaving/bandits, test in production | `references/continual-learning-and-test-in-production.md` |

## How to apply

1. Match the request to a row in **Quick routing** (or the description triggers).
2. Read the corresponding file under `references/`.
3. Follow that reference's decision flow, produce its artifact, and end with its **Interview signal** + **practitioner checklist** where relevant.
4. For a full mock loop, walk the framework above and pull references 1→8 in order.

## Infrastructure & human factors (Ch10-11, folded)

These chapters don't carry their own reference doc — surface the interview-relevant nuggets inline when they come up:

- **Infra (Ch10):** four layers — storage/compute, resource management (Airflow/Kubeflow), ML platform (**model store**, **feature store**, monitoring), dev environment. A **feature store** is the canonical fix for batch/stream feature consistency (the train-serve skew of `model-deployment`). A **model store** + lineage is the prerequisite for stage-2/3 continual learning. Default to **build-vs-buy = buy/adapt** at "reasonable scale" (GB-TB/day, not petabytes); most companies aren't FAANG-scale.
- **Human side (Ch11):** ML is **probabilistic** → manage the **consistency-accuracy trade-off** (Booking.com pinned filter recs with rules); **"mostly correct" predictions** need a **human-in-the-loop** UI (show k candidates the user can pick/edit); **smooth failing** via a fast backup heuristic; **team structure** — keep model dev and deployment close to avoid handoff bugs; **responsible AI** — fairness via the invariance tests in `offline-evaluation`, bias amplified by the feedback loops in `data-distribution-shifts-and-monitoring`.

## Common failure modes (hub-level)

- **Skipping the frame.** Jumping to "I'd train XGBoost" without the business metric, I/O, and requirements — the #1 junior tell. Always start at `ml-systems-design-process`.
- **Router-only answer.** Summarizing the hub without loading the reference's full framework + artifact.
- **Wrong reference.** Loading "offline eval" when the question is about online A/B testing (that's `continual-learning-and-test-in-production`), or "data engineering" depth that actually belongs in `kleppmann-data-intensive-systems`.
- **One-metric thinking.** Reporting a single F1 with no baseline or slice — route to `offline-evaluation`.
- **Treating deploy as the end.** Forgetting that models decay and need monitoring + continual learning.

## References

- [references/ml-systems-design-process.md](references/ml-systems-design-process.md) — frame the problem (Ch1-2)
- [references/data-engineering-fundamentals.md](references/data-engineering-fundamentals.md) — the data stack (Ch3, lighter; defers to Kleppmann)
- [references/training-data.md](references/training-data.md) — sampling, labeling, imbalance (Ch4)
- [references/feature-engineering.md](references/feature-engineering.md) — features + leakage (Ch5)
- [references/offline-evaluation.md](references/offline-evaluation.md) — baselines + eval battery (Ch6)
- [references/model-deployment.md](references/model-deployment.md) — batch/online, cloud/edge, compression (Ch7)
- [references/data-distribution-shifts-and-monitoring.md](references/data-distribution-shifts-and-monitoring.md) — shifts + monitoring (Ch8)
- [references/continual-learning-and-test-in-production.md](references/continual-learning-and-test-in-production.md) — retraining + online eval (Ch9)

- **Book:** Chip Huyen — *Designing Machine Learning Systems: An Iterative Process for Production-Ready Applications* (O'Reilly, 2022).
- **Sibling skills:**
  - `mlsd-coach` — drills these frameworks live as a mock ML-system-design interviewer (pair this hub as the reference, mlsd-coach as the rehearsal).
  - `kohavi-controlled-experiments` — the deep treatment of A/B testing (randomization, sample size, significance) that `offline-evaluation` and `continual-learning-and-test-in-production` point to.
  - `kleppmann-data-intensive-systems` — distributed-systems / storage-engine internals beneath the data layer (Huyen defers Ch3 depth here).
  - `provost-data-science-for-business` — business-value framing, baselines, profit/expected-value curves, leakage-as-overfitting.
  - `huyen-ai-engineering` — the companion volume for foundation-model / LLM application engineering (evaluation, prompting, RAG, finetuning, inference optimization). Route there for FM/LLM work; route here for classical/production ML systems.
