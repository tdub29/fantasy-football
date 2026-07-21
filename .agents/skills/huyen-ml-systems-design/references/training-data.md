# training-data (Huyen Ch4)

How to obtain and curate the data a model learns from: sampling, labeling, the lack-of-labels toolkit, class imbalance, and augmentation. The artifact is a **training-data plan** — chosen sampling method (+ bias call), labeling strategy (natural / hand / weak / semi / transfer / active), an imbalance-handling stack (metric → data-level → algorithm-level), and an augmentation plan.

## When to pull this

- "How would you get / label data for this model?" — the data half of an MLSD loop.
- You have a class-imbalanced problem (fraud, disease, churn, ads) and need to defend metric + handling choices.
- Labels are scarce, expensive, slow, or privacy-constrained and you need an alternative to hand-labeling.
- Choosing a sampling method and someone needs to hear why convenience sampling will bias the model.
- Deciding feedback-loop length for natural labels (how long until a click counts as "no click").

Don't pull this for: *feature* construction from data you already have (→ `feature-engineering`), or *evaluating* the trained model (→ `offline-evaluation`).

## Sampling — pick the method, name the bias

**Nonprobability (biased, but fast to bootstrap):** convenience, snowball, judgment, quota. Not representative — language models on Wikipedia/Reddit, sentiment on IMDB reviews, self-driving on sunny Phoenix data all carry selection bias. Fine to *start* a project, dangerous to ship on.

**Random (defensible):**
- **Simple random** — equal probability; easy, but rare classes can vanish entirely.
- **Stratified** — sample within each stratum so rare classes survive; breaks down for multilabel (a sample in many strata).
- **Weighted** — per-sample probability encodes domain knowledge (recent data matters more) or corrects a distribution mismatch (reweight 25/75 toward true 50/50). Distinct from *sample weights*, which reweight the loss.
- **Reservoir** — for **streaming** data of unknown size: keep k items, each incoming nth item replaces a reservoir slot with probability k/n. Every item has equal probability and you can stop anytime with a correct sample.
- **Importance** — sample from cheap Q(x), reweight by P(x)/Q(x) to estimate over expensive P(x); used in policy-based RL.

## Labeling — the strategy ladder

1. **Natural labels** (cheapest — start here if available): the system auto-evaluates predictions. ETA (trip ends), stock price (2 min later), **recommenders** (click = positive; no click after a window = *implicit* negative vs explicit downvote). 63% of companies in Huyen's survey work with natural labels — likely because they're easier to start on.
   - **Feedback-loop length** is a speed/accuracy trade: short window catches issues fast but mislabels slow clicks as negatives (Twitter: most ad clicks <5min but some hours later → CTR underestimate); fraud's dispute window is 1-3 months → bad models go undetected for a quarter. Pick the window per stakeholder discussion; note volume vs signal strength (clicks = high volume/weak signal; purchases = low volume/strong, revenue-correlated signal).
2. **Hand labels** (expensive, slow, privacy-risky): SME cost (radiologists), can't leave premises, slow (speech ≈ 400x duration; lung-cancer labels took ~1 year). Watch **label multiplicity** (annotators disagree — fix with a clear problem definition + annotator training) and **data lineage** (track origin; new low-quality crowdsourced data can *drop* performance and be unremovable once mixed).
3. **Lack-of-labels toolkit** when hand labels are insufficient:

| Method | How | Needs ground truth? |
|---|---|---|
| **Weak supervision** (Snorkel) | labeling functions encode noisy heuristics (keywords, regex, lookups, other models), then combine/denoise/reweight | No (small set recommended to tune LFs). Privacy-friendly, versionable, adaptive — Stanford: 8hrs of LFs ≈ 1 year of hand labels |
| **Semi-supervision** | structural assumptions extend seed labels (self-training, similarity/clustering, perturbation) | Yes — small seed set |
| **Transfer learning** | reuse a pretrained base model (often a language model) → fine-tune or zero-shot on the downstream task | No for zero-shot; small set for fine-tuning |
| **Active learning** | model queries the most useful samples to label (uncertainty, query-by-committee disagreement, max gradient) | Yes — shines on real-time/streaming data |

## Class imbalance — the three-layer stack

Imbalance hurts because: (1) too little signal for the minority class (few-shot), (2) the model can exploit a trivial majority heuristic (99.99% accuracy by always predicting "normal"), (3) asymmetric error cost (missing cancer ≫ false alarm). It's the *norm* (fraud, churn, disease, resume screening, object detection's background boxes), and can also come from sampling bias or labeling errors — always diagnose the cause.

**Layer 1 — right metric (do this first):** Accuracy/error rate are useless under imbalance (Model A and B both score 0.9 accuracy; B detects 90/100 cancers vs A's 10). Use **per-class accuracy, F1/precision/recall** (asymmetric — declare which class is positive), **ROC-AUC**, and for heavy imbalance the **Precision-Recall curve** (more informative than ROC).

**Layer 2 — data-level (resampling):** oversample minority (SMOTE synthesizes convex combinations) or undersample majority (Tomek links remove borderline majority pairs) — both proven mainly low-dimensional. **Never evaluate on resampled data** (overfits the resampled distribution). Advanced: two-phase learning (train resampled → fine-tune on original), dynamic sampling.

**Layer 3 — algorithm-level (reweight the loss):** cost-sensitive learning (cost matrix C_ij per misclassification), class-balanced loss (weight ∝ 1/class size), **focal loss** (down-weight easy examples so the model focuses on hard ones). Caveat: a large enough model may be better left to learn the real imbalance than to have it "fixed."

## Data augmentation

- **Label-preserving transforms** — crop/flip/rotate images (a rotated dog is a dog; ~free on CPU while GPU trains); synonym swaps in NLP.
- **Perturbation** — add noise to harden against adversarial attacks (one-pixel changes flip CNN predictions); BERT's random token replacement gives a small boost.
- **Data synthesis** — NLP templates ("Find me a [CUISINE] restaurant within [NUMBER] miles of [LOCATION]"); mixup (interpolate examples + labels) improves generalization; GAN-synthesized images (CycleGAN for CT segmentation).

## Practitioner checklist

- [ ] Chose a sampling method and stated its bias (or why nonprobability is acceptable for a bootstrap only).
- [ ] Checked for natural labels first; if using them, set a feedback-loop window with the speed/accuracy trade in mind.
- [ ] For hand labels: planned for multiplicity (clear def + training) and tracked data lineage.
- [ ] If labels are scarce, picked from the toolkit (weak/semi/transfer/active) with the right ground-truth budget.
- [ ] Imbalance: replaced accuracy with F1/PR-curve, then applied data-level and/or algorithm-level handling.
- [ ] Did NOT evaluate on resampled data.
- [ ] Added augmentation appropriate to the modality.

## Interview signal

The data half of MLSD is where most candidates are thin — they say "I'd collect labeled data" and stop. The senior tells: you ask whether **natural labels** exist before assuming hand-labeling; you name the **feedback-loop length** trade explicitly; under imbalance you **lead with the metric** (not resampling); and you reach for **weak supervision / transfer learning** when labels are expensive or privacy-bound.

> Senior talking point: *"First I check for natural labels — if it's a recommender or fraud task, the system labels itself, I just have to set the feedback window, and for fraud that window is months so I can't rely on it to catch a broken model fast. If I need hand labels I budget for multiplicity and track lineage so a batch of bad crowdsourced labels doesn't silently tank the model. For imbalance I start by throwing out accuracy for a PR curve, then layer resampling and a focal/class-balanced loss — but I never validate on the resampled set."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 4.
- Sibling refs: `ml-systems-design-process` (framing the task these labels serve), `feature-engineering` (what you build from this data), `offline-evaluation` (metrics, slice eval — the imbalance metrics carry over), `data-distribution-shifts-and-monitoring` (label shift and degraded-label detection in production).
- Related skills: `provost-data-science-for-business` (the business cost matrix behind cost-sensitive learning), `mlsd-coach` (drills the data half live).
