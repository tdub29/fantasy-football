# continual-learning-and-test-in-production (Huyen Ch9)

How to *fix* the decay Ch8 detects: update models (stateless vs stateful, the four maturity stages, retraining cadence) and safely validate updates with live traffic (shadow / A-B / canary / interleaving / bandits). Continual learning is **largely an infrastructure problem**, not a training-frequency one. The artifact is an **update + online-evaluation plan**: retraining manner + trigger + cadence (justified by data-freshness value) and the test-in-production technique that gates each update.

## When to pull this

- "How do you keep the model fresh / how often do you retrain?" — the continual-learning probe.
- "How do you safely deploy a new model / test it in production?" — the shadow/A-B/canary/bandit probe.
- Choosing **stateless retraining vs stateful (fine-tuning)** and what data window to use.
- Picking an **online evaluation** method to validate an update before full rollout.
- Designing the update-trigger mechanism (time / performance / volume / drift based).

Don't pull this for: *detecting* the decay (→ `data-distribution-shifts-and-monitoring`), or the *offline* pre-deploy battery (→ `offline-evaluation`). This is the adapt-and-validate stage. Monitoring is *passive* (watch whatever's serving); test-in-production is *active* (choose which model serves so you can evaluate it).

## Continual learning ≠ "learn from every sample"

Almost no one updates per-sample (neural nets → **catastrophic forgetting**; hardware wastes compute on batch=1). Real continual learning updates in **micro-batches** (e.g., 512-1,024 examples) on a **replica (challenger)**, only replacing the production **champion** if the challenger proves better. It's about the *manner* of retraining, not the frequency.

### Stateless retraining vs stateful training

| | Stateless retraining (most companies) | Stateful training (fine-tuning / incremental) |
|---|---|---|
| What | Train from scratch each time | Continue from last checkpoint |
| Data | All data (e.g., last 3 months) | Only fresh data (e.g., last day) |
| Cost | High | Grubhub: 45x less compute, +20% purchase-through |
| Bonus | — | Can avoid storing data (each sample used once → privacy win) |

Stateful still trains from scratch *occasionally* to recalibrate. **Caveat:** stateful applies mostly to **data iteration** (same architecture/features, new data); **model iteration** (new feature/architecture) still usually needs from-scratch training.

### Four maturity stages (continual learning is a journey)

1. **Manual stateless retraining** — ad hoc, update only when a model rots; most non-tech companies.
2. **Automated retraining** — a script (Spark) runs all steps on a schedule. Needs a **scheduler** (Airflow/Argo), accessible **data**, a **model store**. ("Log and wait" reuses prediction-time features to cut train-serve skew.)
3. **Automated stateful training** — script loads the last checkpoint. Needs a mindset shift + **model/data lineage** tracking.
4. **Continual learning** — updates fire on a **trigger** (time / performance / volume / drift based), not a fixed schedule. Needs solid monitoring + a continuous evaluation pipeline. Holy grail: continual learning + edge.

### Three challenges

- **Fresh data access** — pull from real-time transports (Kafka/Kinesis) not just the warehouse; **label computation** from logs is often the bottleneck (best targets: natural labels + short feedback loops — pricing, ETA, CTR, recs). Programmatic labeling (Snorkel) speeds it.
- **Evaluation** — the *hard* part; more frequent updates = more chances to ship a bad one + adversarial-manipulation risk (Microsoft's Tay). Evaluation time itself bottlenecks cadence (fraud: 2 weeks to see enough fraud to A/B test).
- **Algorithm** — neural nets update on any batch size; matrix/tree-based models (collaborative filtering) need the full dataset → ill-suited to fast partial updates. Compute scaling stats **online** to keep them stable across micro-batches.

## How often to retrain — measure data-freshness value

Don't guess. **Experiment**: train on different past time windows, test on the most recent data, and measure the performance gain from fresher data (Facebook: weekly→daily cut ad-CTR loss 1%, enough to switch). Then weigh **model iteration vs data iteration** by compute-per-gain — if from-scratch architecture search needs 100x compute for 1% and a 3-hour data refresh needs 1x for the same 1%, iterate on data. Early/manual infra: "as often as you can." Mature infra: "however often the freshness experiment justifies."

## Test in production — online evaluation (offline isn't enough)

Static test splits and **backtests** (test on a recent window) both fail alone — a corrupted recent hour breaks a backtest; the only way to know a model works in production is to deploy it. Five techniques:

| Technique | How | Trade-off |
|---|---|---|
| **Shadow deployment** | Route requests to candidate + existing; serve only existing; log candidate | Safest; but **doubles inference cost** |
| **A/B testing** | Route a random % to candidate, rest to existing; compare via two-sample test for significance | Must be **truly random** (no selection bias) + **enough samples**. Can be A/B/C. (→ `kohavi-controlled-experiments`) |
| **Canary release** | Roll out candidate to a small slice; ramp up if good, abort if metrics degrade | Lower-risk gradual rollout; can implement A/B or run without randomization |
| **Interleaving** | Show one user recs from *both* models, see which they click (team-draft for fair positions) | Netflix: identifies the best algorithm with far smaller sample size than A/B; but user preference ≠ core metrics |
| **Bandits** | Route traffic by current performance (ε-greedy, Thompson Sampling, UCB) | Most **data-efficient** (Thompson: 12k samples vs A/B's 630k) but needs online prediction + short feedback + statefulness → harder to implement |

**Contextual bandits** go a level deeper — balance exploration/exploitation over *which item to show* (the partial/bandit-feedback problem), improving data efficiency but tightly coupled to model architecture.

> Process point: a good evaluation pipeline is about **who runs the tests**, not just which tests. Data-scientist-owned ad hoc evaluation is biased and variable — define an automated, CI/CD-style pipeline with ordered tests + promotion thresholds.

## Practitioner checklist

- [ ] Chose stateless vs stateful by cost/data/privacy; noted that model iteration still needs from-scratch.
- [ ] Placed the org on the four-stage maturity ladder and named the next infra requirement.
- [ ] Set the retraining cadence from a **data-freshness experiment**, not gut feel.
- [ ] Decided model-iteration vs data-iteration by compute-per-gain.
- [ ] Picked an update **trigger** (time/performance/volume/drift).
- [ ] Gated every update with a test-in-production technique (shadow → canary/A-B → bandit as appropriate).
- [ ] Validated A/B randomness + sample size; defined an automated, owned evaluation pipeline.

## Interview signal

"How often do you retrain?" is a trap — the junior answer is a number, the senior answer is "it depends, and here's how I'd *measure* it." And "how do you safely ship a model update" should produce a **graduated rollout** (shadow → canary/A-B), not "deploy and watch." The tells: you distinguish **stateless vs stateful** and know stateful is mostly for data iteration; you frame cadence as a **data-freshness experiment**; you know **bandits** are more data-efficient than A/B but harder; and you cite the **champion/challenger** pattern.

> Senior talking point: *"'How often' is the wrong question — I run a data-freshness experiment: train on different past windows, test on the most recent data, and let the measured gain set the cadence, the way Facebook justified weekly-to-daily on ad CTR. On the update itself I never just swap models — I update a challenger replica, shadow it to confirm parity, then canary or A/B with truly random traffic and a real sample-size calculation. If I need data efficiency and have short feedback loops I'll use a bandit, which got there in 12k samples where A/B needed 600k — but it's stateful and harder to build, so I reserve it. And the cheap part is the update script; the expensive part is the evaluation pipeline that decides the challenger is safe."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 9.
- Sibling refs: `data-distribution-shifts-and-monitoring` (the decay this fixes; drift-based triggers; the monitoring that powers triggers), `offline-evaluation` (the offline half — test splits, the battery before online testing), `model-deployment` (champion/challenger serving; streaming infra for online eval; edge + continual learning), `data-engineering-fundamentals` (real-time transports for fresh data + label computation).
- Related skills: `kohavi-controlled-experiments` (the deep treatment of A/B — randomization, sample size, significance — Huyen points here directly), `provost-data-science-for-business` (evaluating model lift as a business decision), `mlsd-coach` (drills the retrain + test-in-prod design).
