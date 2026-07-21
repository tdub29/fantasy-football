# feature-engineering (Huyen Ch5)

Turning raw data into the features a model consumes — the operations, the leakage traps, and how to judge a feature as good. Right features beat clever algorithms (Facebook: the single biggest production lever after a workable model). The artifact is a **feature plan + leakage audit + good-feature scorecard**: chosen operations per feature, a checklist that no leakage path is open, and an importance/generalization read on each feature.

## When to pull this

- "What features would you use / how would you build them?" in an MLSD loop.
- A model evals great offline but fails in production — suspect **data leakage** (the #1 silent killer this chapter targets).
- Deciding feature operations: missing values, scaling, discretization, categorical encoding, crossing, positional embeddings.
- A high-cardinality, ever-growing categorical (brand, account, IP, domain) needs encoding that survives unseen categories.
- Pruning a bloated feature set, or defending which features to keep (importance vs generalization).

Don't pull this for: *getting/labeling* the data (→ `training-data`), or *evaluating the model's* metrics (→ `offline-evaluation`). Feature stores are infra (→ Ch10, folded into the hub).

## Common feature operations

| Operation | Key decision / trap |
|---|---|
| **Missing values** | Diagnose type first: **MNAR** (missing *because of* the value — missingness is itself signal, keep it), **MAR** (missing due to another variable — deletion biases that group), **MCAR** (truly random — rare). Then **deletion** (column if mostly empty; row only if MCAR + <~0.1%) vs **imputation** (mean/median/mode/default). Never impute with a *valid* value (filling #children=0 hides "missing"; filling age=0 broke a model that never saw age 0). |
| **Scaling** | Almost always needed (income 150k vs age 40 — model over-weights the big number). [0,1] min-max, arbitrary [a,b] (often [-1,1] works better), standardization (zero mean/unit var) if normal, **log transform** for skew. Uses **global stats** → leakage source + needs retraining as data drifts. |
| **Discretization** | Bin continuous → buckets. Rarely helps in practice; introduces hard boundaries ($34,999 ≠ $35,000). Helps most with limited data. |
| **Categorical encoding** | Categories **change in production** (2M+ Amazon brands, new accounts daily). Naive integer encoding crashes on unseen categories; an UNKNOWN bucket starves new brands. Use the **hashing trick** (fix hash space e.g. 2^18; unseen categories still encode; collisions are random not systematic — Booking.com: 50% collisions → <0.5% log-loss hit). |
| **Feature crossing** | Combine features to model **nonlinear** relationships — essential for linear/logistic/tree models, less so for NNs. Caveat: feature space blows up (100×100=10k values) → needs more data + risks overfit. |
| **Positional embeddings** | For order-blind parallel models (transformers): don't feed raw 0..7 (not unit-variance) or rescaled (too close to differentiate). Use a learned position-embedding matrix or **fixed sine/cosine** (Fourier features — also handle continuous coordinates like 3D positions). |

## Data leakage — the section that saves the interview

**Leakage = label information leaks into features but isn't available at inference.** It's nonobvious and survives extensive testing (COVID models learned scan *position* and *font* as risk proxies; lung-cancer model learned which scan *machine* was used). Six common causes + fixes:

1. **Random split of time-correlated data** → split **by time** (train weeks 1-4, split week 5 into val/test). Future leaks backward (stock prices, an artist dying spikes plays that day).
2. **Scaling before splitting** → split first, scale all splits using **train-split stats only**.
3. **Imputing with whole-data stats** → fill missing with train-split stats only.
4. **Duplicates before splitting** → dedup before AND after splitting; oversample *after* splitting (CIFAR-10/100 had 3.3%/10% test-train dup).
5. **Group leakage** → correlated records (two scans of one patient a week apart) must stay in the same split; requires knowing how data was generated.
6. **Data-generation-process leakage** → the scan-machine case; mitigate by tracking lineage, normalizing across sources, involving SMEs.

**Detecting leakage:** measure each feature's predictive power vs the label (suspiciously high correlation → investigate); run **ablation studies** (huge drop on removal → why?); watch new features that suddenly boost a lot; and treat the **test split as radioactive** — touch it only for the final number, never for feature ideas or tuning.

## Engineering good features — two axes

More features ≠ better: each adds leakage surface, overfitting risk, memory/latency cost, and tech debt (a dropped upstream field breaks every dependent feature). Judge a feature on:

- **Importance** — how much performance drops if removed. Use XGBoost built-ins or model-agnostic **SHAP** (also gives per-prediction contributions + interpretability). Expect a long tail (Facebook: top 10 features ≈ half of total importance; bottom 300 < 1%). Prune the dead weight even though L1 *should* zero it.
- **Generalization** — does it hold on unseen data? Two checks: **coverage** (% of samples with the feature — low coverage usually = weak, unless missingness is MNAR signal; wildly different coverage train vs test = split/leakage smell) and **value distribution** (train values must overlap test values — DAY_OF_WEEK trained Mon-Sat fails on a Sunday test set; HOUR_OF_DAY overlaps and works). Watch the **generalization vs specificity** trade (IS_RUSH_HOUR generalizes but loses the detail of HOUR_OF_DAY).

## Practitioner checklist (Huyen's best-practices, operationalized)

- [ ] Split by **time**, not randomly, when data is time-correlated.
- [ ] Oversample, scale, normalize, and impute **after** splitting, using **train-split stats only**.
- [ ] Diagnosed missing-value type (MNAR/MAR/MCAR) before deleting/imputing; didn't impute with a valid value.
- [ ] Encoded high-cardinality/growing categoricals with the hashing trick, not naive integers.
- [ ] Ran a leakage audit (predictive-power, ablation, new-feature, test-split discipline).
- [ ] Scored kept features on importance (SHAP) and generalization (coverage + value overlap); removed dead weight.
- [ ] Tracked data lineage and pulled in SMEs.

## Interview signal

Feature engineering is where Applied DS loops separate practitioners from coursework graduates, and **data leakage is the trap question** — interviewers love "your model scores 0.95 offline but tanks in prod, what happened?" The senior tells: you split **by time** and scale **after** splitting unprompted; you diagnose missing-value *type* instead of defaulting to mean-impute; you reach for the **hashing trick** on growing categoricals; and you answer the offline-vs-prod gap with a concrete leakage cause.

> Senior talking point: *"My first move on any time-correlated problem is split by time and compute all scaling/imputation stats from the train split only — most offline-great/prod-bad failures I've seen are leakage from random splits or whole-data scaling. For categoricals like brand or account that grow forever I hash rather than integer-encode so unseen values don't crash or get starved. Then I keep features on two axes — SHAP importance and generalization (coverage plus train/test value overlap) — and aggressively prune, because every dead feature is leakage surface and latency I'm paying for."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 5.
- Sibling refs: `training-data` (the data these features are built from; resampling-after-split lives in both), `offline-evaluation` (importance/ablation feed slice eval; the offline-vs-prod gap connects to leakage), `data-distribution-shifts-and-monitoring` (feature distribution drift in production), `data-engineering-fundamentals` (batch/static vs stream/dynamic features; feature stores).
- Related skills: `provost-data-science-for-business` (feature/data understanding and leakage-as-overfitting framing), `mlsd-coach` (drills the feature + leakage discussion).
