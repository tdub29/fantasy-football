# model-deployment (Huyen Ch7)

How a model serves predictions in production: batch vs online prediction, cloud vs edge, and the compression toolkit to make online/edge feasible. Deploying is "easy if you ignore all the hard parts" — the hard parts are millisecond latency at scale, 99% uptime, and seamless updates. The artifact is a **serving-architecture decision**: prediction mode (batch / online-batch-features / streaming) + compute location (cloud / edge) + a compression/optimization plan that hits the latency budget.

## When to pull this

- "How would you serve / deploy this model?" in an MLSD loop — the architecture half.
- Choosing **batch vs online** prediction (precompute vs on-demand), or whether you need streaming features.
- Deciding **cloud vs edge** (latency, cost, connectivity, privacy constraints).
- A model is accurate but too slow/big — you need **compression** (distillation, quantization, pruning, low-rank) or inference optimization.
- Defending why an online system needs a unified batch+stream pipeline (the train/serve skew bug).

Don't pull this for: *whether the model is good* (→ `offline-evaluation`), *post-deployment evaluation* like A/B/canary (→ `continual-learning-and-test-in-production`), or *detecting degradation* (→ `data-distribution-shifts-and-monitoring`).

## Deployment reality (debunk the myths first)

1. You deploy **many** models, not one (Uber: thousands; 41% of 25k+-employee orgs run 100+).
2. Performance **decays** untouched (software rot + data distribution shift) — best right after training.
3. The question isn't "how often *should* I update" but "how often *can* I" (Weibo: 10-min cycles) — update as fast as possible.
4. You **do** need to care about scale — most ML jobs are at 100+ person companies serving real traffic.

## Decision 1: Batch vs online prediction

Three modes to anchor on: **batch** (batch features only), **online with batch features** (e.g., precomputed embeddings), **streaming prediction** (online + streaming features).

| | Batch (asynchronous) | Online (synchronous) |
|---|---|---|
| When | Periodic/triggered; results not needed instantly | As requests arrive; results needed now |
| Optimized for | Throughput | Latency (ms for consumer apps) |
| Examples | Netflix recs every 4hrs; reach top-10% buyers | Fraud, translation, autonomous vehicles, face unlock |
| Pro | Precompute heavy models → retrieval ≪ generation | Responsive to user's changing preferences |
| Con | Stale to preference change; must know queries in advance | Latency budget; can't precompute |

They're **not mutually exclusive**: DoorDash batches restaurant recs (too many to do online) but generates food-item recs online once you click. Hybrid: precompute popular queries, serve the tail online. Batch is largely a **workaround** for when online isn't cheap/fast enough — as hardware improves, online-on-device trends toward default. Online doesn't waste compute on the 98% of users who don't visit today.

**Streaming features need a unified pipeline.** Training computes a feature (avg speed last 5 min) in **batch** over a dataframe; inference computes it in a **stream** over a sliding window. Two separate pipelines (often two teams) = the classic **train/serve skew** bug. Fix: unify on a stream processor (Flink) or use a **feature store** for batch/stream consistency.

## Decision 2: Cloud vs edge

- **Cloud** — easy to set up (wrap predict in FastAPI → container → SageMaker/App Engine endpoint). Downsides: **cost** (cloud bills bankrupt startups), **network latency** (often bigger than inference latency — seconds vs the 10ms you shaved off inference), **privacy** (data over the wire, breaches).
- **Edge** — compute on-device (phone, car, camera, browser). Wins on: runs **without internet** (rural, no-internet-policy clients), no network latency, **privacy/GDPR** (data stays local). Requires the device to have enough compute/memory/battery (full BERT kills a phone battery). Drives the whole compression need.

## Decision 3: Compression & inference optimization (hit the latency budget)

If the model's too slow: faster inference, smaller model, or faster hardware. Four compression techniques:

| Technique | Idea | Notes |
|---|---|---|
| **Quantization** | Fewer bits per parameter (32→16 half-precision, →8 int "fixed point", →1 binary) | **Most general/common.** Halves memory, speeds compute, bigger batches. Roblox's biggest win: 32-bit→8-bit = 7x latency, 8x throughput. Risk: rounding/overflow errors. Quantization-aware training vs post-training. |
| **Knowledge distillation** | Small student mimics large teacher (DistilBERT: -40% size, 97% capability, 60% faster) | Architecture-agnostic; depends on a teacher being available. |
| **Pruning** | Remove nodes, or zero out least-useful weights (sparsity) | Can cut nonzero params 90%+ without accuracy loss. |
| **Low-rank factorization** | Replace high-dim tensors with low-dim (SqueezeNet, MobileNets) | Architecture-specific, needs expertise. |

**Inference optimization** lowers framework code → hardware via **IRs** (intermediate representations) in a compiler. Local optimizations: vectorization, parallelization, loop tiling, **operator fusion**. Global: fuse the computation graph. ML-powered compilers (autoTVM) search execution paths and learn a cost model — slow to run (hours) but one-time + cacheable. **WASM** runs models in any browser (93% device support) at the cost of being ~45-55% slower than native.

## Practitioner checklist

- [ ] Chose batch vs online by latency need + whether queries are knowable in advance; considered the hybrid.
- [ ] If using streaming features, unified the batch+stream pipeline (or a feature store) to avoid train/serve skew.
- [ ] Chose cloud vs edge against latency, cost, connectivity, and privacy/regulatory constraints.
- [ ] Set a latency budget (p95/p99) and, if the model misses it, applied compression (quantization first) + inference optimization.
- [ ] Planned for continuous updates (the model decays), not one-and-done deploy.

## Interview signal

The deployment half is where Applied-DS candidates with only notebook experience get exposed — and "batch vs online" plus "train/serve skew" are the staple probes. The senior tells: you pick batch vs online from the **latency requirement and query predictability**, not habit; you flag the **two-pipeline skew bug** when streaming features appear; you reach for **quantization first** under a latency budget; and you weigh **network latency** (not just inference latency) when choosing cloud vs edge.

> Senior talking point: *"I pick the serving mode from the requirement: fraud and autonomy must be online, recommendations can be batched and precomputed — and often it's hybrid, batch the heavy candidate generation and do the final ranking online. The moment I'm using streaming features I unify the training and serving pipelines or use a feature store, because the number-one production bug I've seen is train/serve skew from two teams maintaining two pipelines. If I'm over the latency budget I quantize before anything else — it's the most general lever and usually the biggest win — and on cloud-vs-edge I weigh network latency and privacy, not just raw inference speed."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 7.
- Sibling refs: `data-engineering-fundamentals` (batch/static vs stream/dynamic features — the input to the batch-vs-online choice), `offline-evaluation` (the gate this comes after), `data-distribution-shifts-and-monitoring` (why deployed models decay), `continual-learning-and-test-in-production` (update cadence + online evaluation of the deployed model).
- Related skills: `kleppmann-data-intensive-systems` (latency percentiles, request vs event-driven, the systems-engineering depth), `huyen-ai-engineering` (inference optimization for foundation models — the deeper companion treatment), `mlsd-coach` (drills the serving-architecture question).
