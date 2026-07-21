# data-distribution-shifts-and-monitoring (Huyen Ch8)

Why deployed models decay and how to catch it: failure taxonomy, the three shift types, degenerate feedback loops, detection, and what to monitor. A model performs best right after training and degrades over time — silently. The artifact is a **production-failure diagnosis + monitoring plan**: classify the failure (software vs ML-specific; which shift), pick detection methods, and specify the four monitoring artifacts with alert thresholds.

## When to pull this

- "A model worked at launch, now performance dropped — what happened / how do you catch it?" — the staple monitoring probe.
- Diagnosing a production degradation (is it covariate shift? concept drift? a pipeline bug? a feedback loop?).
- Designing what to monitor for a deployed model and how to detect drift without labels.
- A recommender/CTR system's outputs are getting homogeneous (popularity bias / degenerate feedback loop).
- Defending why offline metrics don't guarantee production performance.

Don't pull this for: *fixing* the decay via retraining/online experiments (→ `continual-learning-and-test-in-production`), or the offline pre-deployment battery (→ `offline-evaluation`). This is the detect-and-diagnose stage.

## Step 1: Classify the failure

- **Software system failures** (~60% of failures in Google's 96-case study!) — dependency, deployment, hardware, downtime. Not ML, but ML engineers must handle them. "ML engineering is mostly engineering, not ML."
- **ML-specific failures** — production data ≠ training data (train-serve skew + distribution shift), **edge cases**, **degenerate feedback loops**. Rarer but harder to detect and more dangerous (silent).

**Two failure modes from data:** (1) **train-serve skew** — great in dev, poor at deployment, because training data didn't represent production. (2) **degradation over time** — fine at launch, decays as distribution shifts. And remember: a *huge* fraction of apparent "data shift" on dashboards is actually **internal bugs** (pipeline errors, wrong feature stats, wrong model version) — diagnose human error before assuming a real shift.

**Edge cases vs outliers:** outliers are about *data* (an example far from others); edge cases are about *performance* (an example where the model fails catastrophically). Remove outliers in *training*; you can't drop them at inference. A 99.99%-safe self-driving car is unusable if the 0.01% kills you.

## Step 2: Identify the shift type (decompose P(X,Y))

| Shift | Definition | Plain English | Example |
|---|---|---|---|
| **Covariate shift** | P(X) changes, P(Y\|X) same | Input distribution changes | Marketing campaign brings more affluent users; P(convert\|income) unchanged. Also caused by sampling bias, oversampling, active learning. |
| **Label shift** | P(Y) changes, P(X\|Y) same | Output distribution changes | Output mix shifts but the input profile per label holds. Often co-occurs with covariate shift. |
| **Concept drift** | P(Y\|X) changes, P(X) same | "Same input, different output" | SF apartment $2M pre-COVID → $1.5M; features same, price relationship changed. Often cyclic/seasonal. |

**General shifts** beyond the math: **feature change** (new/removed feature, range changes — age in years→months; a bug NaNs a feature), **label schema change** (set of possible Y changes — new credit-score range, NEGATIVE split into SAD/ANGRY — usually needs relabel + retrain from scratch). Multiple shifts can hit at once.

> In practice you rarely stop to name the shift type — you care what to *do*. But naming it is the interview tell that you understand the mechanism.

## Step 3: Detect the shift

- **Best, if available: monitor accuracy-related metrics** vs ground truth. But labels are often unavailable/delayed in production.
- **Without labels: monitor the input distribution P(X).** Most industry drift detection focuses on feature distributions.
  - **Summary statistics** (min/max/mean/median/variance/quantiles/skew/kurtosis) — cheap start, but *insufficient*: differing stats → maybe shifted; similar stats → no guarantee of no shift.
  - **Two-sample tests** — KS test (nonparametric but one-dimensional only), Least-Squares Density Difference, MMD (research). Reduce dimensionality first; small-sample-detectable difference = probably serious, huge-sample-needed = probably benign. (Alibi Detect implements many.)
- **Time-scale window matters.** Abrupt shifts are easier to detect than gradual. The window confounds with seasonality (day 15 looks shifted vs a 6-day window, normal vs a 14-day window). Shorter window = faster detection but more false alarms. Distinguish **cumulative** stats (hide a sudden dip) from **sliding** stats (reset per window — surface the dip).

## Step 4: Degenerate feedback loops (the recommender-specific trap)

Predictions influence future inputs which influence future predictions: a song ranked slightly higher gets clicked more → ranked higher still (popularity/exposure bias, filter bubbles). Resume screening on "feature X" → only X-candidates hired → model weights X more (amplifies bias).
- **Detect:** measure **popularity diversity** of outputs (aggregate diversity, long-tail coverage); or **hit-rate by popularity bucket** (much better on popular items = popularity bias). Homogenizing outputs over time = degenerate loop.
- **Correct:** **randomization** (TikTok's initial traffic pool gives new videos unbiased exposure — costs UX, so use bandits) or **positional features** (encode "shown in position 1" as a feature; set it False at inference; or two models — P(seen) given position × P(click) given seen).

## Step 5: Monitor the right artifacts (closest-to-care vs easiest-to-attribute)

Four artifacts, deepest-in-pipeline = closest to what you care about but more transformed:
1. **Accuracy-related metrics** — most direct; log all user feedback (click, completion rate, up/downvote). CTR flat but completion-rate dropping = recommender degrading.
2. **Predictions** — low-dimensional, easy two-sample tests; a proxy for input shift (if weights unchanged); catches "all False for 10 min" immediately while accuracy lags.
3. **Features** — feature validation (schema/range/set checks — "unit tests for data", Great Expectations/Deequ). Caveats: hundreds of models × thousands of features is expensive; most feature drift is **benign** → **alert fatigue**; can't tell shift from pipeline bug; schemas change.
4. **Raw inputs** — usually the data-platform team's job, out of ML scope.

**Operational metrics** still matter (uptime/SLA — 99.99% = 4 min/month down; latency p99). **Monitoring** (track + detect) vs **observability** (instrument so you can investigate). Toolbox: logs (distributed tracing with unique IDs; stream-process for real-time anomaly detection), dashboards (beware *dashboard rot*), alerts.

## Practitioner checklist

- [ ] Ruled out software/pipeline/human error before declaring a "data shift."
- [ ] Classified the shift (covariate / label / concept / feature / schema) by what changed.
- [ ] Chose detection: accuracy metrics if labels available; else feature/prediction two-sample tests with dimensionality reduction.
- [ ] Set a sensible time-scale window; used sliding (not just cumulative) stats.
- [ ] For recommenders/CTR: checked popularity diversity / hit-rate-by-bucket for degenerate loops.
- [ ] Monitored all four artifacts with thresholds tuned to avoid alert fatigue.
- [ ] Tracked operational metrics + instrumented for observability.

## Interview signal

"Your model degraded in production — diagnose it" is the canonical monitoring question, and the senior answer **does not jump to retraining**. The tells: you first rule out **pipeline/human error** (60% of real failures), you name the **shift type** by what changed (covariate vs concept), you detect drift **without labels** via feature/prediction distributions, and you flag **degenerate feedback loops** on any recommender. You also know ML systems **fail silently** — no 404 fires when predictions go wrong.

> Senior talking point: *"First I separate ML failure from software failure — most production breakage is actually a pipeline bug or wrong model version, not a real distribution shift, so I check that before touching the model. If it's a genuine shift I figure out which: covariate (input moved, P(Y|X) held — usually fine to reweight or retrain), or concept drift (the input-output relationship itself changed — that needs new labels). Since labels are usually delayed, I monitor feature and prediction distributions with two-sample tests rather than waiting for accuracy. And on any recommender I watch output diversity, because degenerate feedback loops silently homogenize predictions and amplify bias."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 8.
- Sibling refs: `model-deployment` (the train-serve skew bug originates in two pipelines; why deployed models decay), `continual-learning-and-test-in-production` (the *fix* — retraining cadence + online experiments), `offline-evaluation` (why offline ≠ production; calibration/slices), `training-data` (sampling bias as a covariate-shift source; delayed natural labels), `feature-engineering` (feature distribution + coverage drift).
- Related skills: `kleppmann-data-intensive-systems` (operational reliability, SLAs, observability depth), `tetlock-superforecasting` (monitoring as belief-updating on incoming evidence), `mlsd-coach` (drills the production-failure diagnosis).
