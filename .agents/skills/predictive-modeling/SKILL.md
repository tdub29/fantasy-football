---
name: predictive-modeling
description: Orchestration router for building a professional, best-practice predictive model end to end — it picks and sequences the OPTIMAL skills for the situation (paradigm × stage × audience/stakes) instead of you remembering them. Use whenever the task is to build, choose, train, evaluate, explain, validate, ship, or improve a predictive/ML model, or to launch a "model workflow." Classifies the situation on three axes — paradigm (classical tabular ML | LLM/foundation-model | time-series/forecasting), lifecycle stage (frame → data/features → select/build → evaluate → explain → validate → ship/monitor → communicate), and stakes/audience (interpretability-first for stakeholder-facing or regulated work vs accuracy-first for internal/automated work) — then routes to the right skills in order. Routes to provost-data-science-for-business (problem framing, expected value, leakage, performance curves, target design), huyen-ml-systems-design (model selection, feature engineering, deployment, monitoring, drift), huyen-ai-engineering (LLM/foundation-model predictors, evals, RAG, finetuning), kohavi-controlled-experiments + ab-test-setup (validate impact online), tetlock-superforecasting (forecasting calibration, base rates), quantitative-research (research/backtest rigor), the data-engineering:* plugin (pipelines, profiling, freshness, DAGs), and data-storytelling / build-dashboard / data-visualization (communicate). Triggers: predictive model, build a model, model workflow, pick a model, model selection, baseline model, feature engineering, train a model, ML pipeline, forecasting model, churn/propensity/demand/donation forecast, regression, classification, evaluate a model, cross-validation, backtest, overfitting, deploy a model, model monitoring, model drift, predictive analytics, interpretability, explainability, explainable AI, SHAP, LIME, feature importance, partial dependence, reason codes, "most professional best-practice model," "which skills for modeling." Sibling/handoff hubs (do not modify): model-thinking for mental models; financial-modeling/dcf-* for finance valuation (NOT ML). Load the matching skill(s) the matrix points to and follow them.
---

# predictive-modeling

**Workflow router.** When a predictive-modeling task starts, this hub classifies the *situation* and tells you which skills to engage and in what order. It routes to **other skills** (not internal reference files). Read it, classify, then load the skills it names and follow each.

This is the "always-triggers, picks the optimal ones by situation" entry point: it fires on any model-building / model-workflow cue (see frontmatter triggers) so you don't have to remember the stack.

## Step 0 — classify the situation (three axes)

1. **Paradigm**
   - **Classical tabular ML** — structured rows; gradient boosting / linear / tree models.
   - **LLM / foundation-model** — predictions via prompting, embeddings, or finetuned LLMs.
   - **Time-series / forecasting** — predicting a quantity forward in time.
2. **Lifecycle stage** — frame → data/features → select/build → evaluate → **explain** → validate → ship/monitor → communicate.
3. **Stakes / audience** — the axis that flips the whole posture:
   - **Interpretability-first** — stakeholder-facing, board/exec/regulated, or "I must defend *why* the model said this." **Good360 work defaults here** (see callout). Favor inherently interpretable models; explanation is a deliverable, not an afterthought.
   - **Accuracy-first** — internal, automated, or competition/scoring where raw predictive power wins. Black-box ensembles are fine; post-hoc explanation is optional.

> **Good360 default — interpretability-first.** For any Good360 model (donation/demand forecasting, donor or partner propensity, waste/tiering, impact measurement), Trevor is more technical than his audience and must *explain and defend* the model to non-technical stakeholders. So: (a) prefer an inherently interpretable model unless a black-box meaningfully beats it; (b) always produce both **global** explanations (what drives the model overall) and **local** explanations (why *this* prediction); (c) translate them with `data-storytelling` before they leave your hands. Only drop to accuracy-first for a Good360 model when it's purely internal/automated and no human needs the "why." Outside Good360, default to accuracy-first.

## The always-on spine (load regardless of paradigm)

1. **`provost-data-science-for-business`** — frame the problem, confirm ML is the right tool, design the target/label, expected-value evaluation, leakage audit, performance-curve selection. **Start here every time.** Also carries model *comprehensibility* framing — relevant to the interpretability axis.
2. **`huyen-ml-systems-design`** — baselines-first model selection, feature engineering, train/serve split, deployment, monitoring, drift. The production backbone.
3. **`kohavi-controlled-experiments`** (+ `ab-test-setup`) — prove the model moves the real metric online, not just offline AUC.

## Routing matrix (stage → lead skill, with forks)

| Stage | Lead skill(s) | Paradigm / stakes fork |
|---|---|---|
| **Frame** | `provost-data-science-for-business` | + `tetlock-superforecasting` if the target is a forward-looking forecast |
| **Data & features** | `data-engineering:profiling-tables`, `data-engineering:analyzing-data`, `data-engineering:checking-freshness`, `data-engineering:authoring-dags` | + `kimball-dimensional-modeling`, `mcgilvray-data-quality-project` when the data layer itself needs structure/quality |
| **Select / build** | `huyen-ml-systems-design` | LLM predictor → **`huyen-ai-engineering`** instead; forecasting → keep `tetlock-superforecasting` + `quantitative-research`. **Interpretability-first → bias the candidate set toward glass-box models (regularized linear/GLM, single trees, EBM/GAM, rule lists) and only escalate to black-box if it clearly wins.** |
| **Evaluate** | `provost-data-science-for-business` (eval), `quantitative-research` | proper holdout/CV, calibration, lift/ROC; backtest discipline for time-series/markets |
| **Explain** (interpretability-first; optional otherwise) | `provost-data-science-for-business` (comprehensibility) + `data-storytelling` to translate | **Global**: feature importance, permutation importance, partial-dependence/ALE, global surrogate. **Local**: SHAP, LIME, counterfactuals, reason codes. Produce both; check they agree with domain sense. |
| **Validate impact** | `kohavi-controlled-experiments`, `ab-test-setup` | gate the rollout on a real experiment when feasible |
| **Ship / monitor** | `huyen-ml-systems-design` (monitoring), `kleppmann-data-intensive-systems` if serving is non-trivial | drift, retraining triggers, prediction logging |
| **Communicate** | `data-storytelling`, `build-dashboard`, `kpi-dashboard-design`, `data-visualization` / `d3-viz` | for Good360, pair every model with a stakeholder-readable explanation surface |

## Engage-in-order sequence

```
provost-data-science-for-business        ← frame: target, value, is-ML-right, leakage
        │
        ├─ data-engineering:profiling-tables / analyzing-data   ← know the data
        │
huyen-ml-systems-design                  ← baseline → candidates → feature plan
   (huyen-ai-engineering if LLM;          (interpretability-first → glass-box first)
    + tetlock-superforecasting if forecast)
        │
provost (eval) + quantitative-research   ← honest offline evaluation
        │
[EXPLAIN]  global + local explanations   ← REQUIRED for Good360 / interpretability-first
   + data-storytelling
        │
kohavi-controlled-experiments            ← validate impact live
        │
huyen-ml-systems-design (monitoring)     ← drift, retraining, ship
        │
data-storytelling / build-dashboard      ← make it actionable
```

## Orchestration (optional, opt-in)

For a real dataset, the select/build + evaluate stages are a strong fit for a **multi-agent workflow** (ultracode): fan out N candidate models in parallel, evaluate each honestly, run a judge pass, and synthesize a ranked, justified choice — with an explanation pass per finalist for interpretability-first work. This is token-heavy, so launch it only on explicit opt-in ("use a workflow"). For lighter dynamic discovery of relevant skills, `scout-skills` finds matches before starting.

## Guardrails

- **Don't skip framing, evaluation, or validation** to get to a model faster — those three are what make it "professional/defensible."
- **`data-engineering:*` is a globally-installed plugin**, not a local bundle — it's available without per-project copying; just invoke the namespaced skill.
- **Interpretability ≠ a chart.** A bar of feature importances is not an explanation a stakeholder can act on; pair global + local methods and run them through `data-storytelling`.
- **Accuracy-first is a deliberate choice, not a default** for Good360. If you skip the explain stage on a Good360 model, say why (purely internal/automated, no human needs the "why").
- **Route, don't improvise a hybrid.** Load the skill the matrix points to and follow its process rather than paraphrasing it from memory.
