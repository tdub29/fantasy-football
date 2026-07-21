# data-engineering-fundamentals (Huyen Ch3)

The data-stack layer beneath every ML system: where data comes from, how it's stored, how it moves between processes, and batch vs stream processing. This is the **lighter reference** — Huyen explicitly defers the deep version to Kleppmann's *Designing Data-Intensive Applications*. The artifact is a **data-stack decision sheet**: chosen format, model, storage workload, dataflow mode, and batch/stream split for the features you'll serve.

## When to pull this

- The MLSD interview drills into "where does the data live / how does it get to the model."
- Choosing a storage format (CSV vs Parquet, text vs binary) or data model (relational vs document vs graph) for an ML dataset.
- Deciding how services exchange data (database / request-driven / real-time transport) and whether to go event-driven.
- Splitting features into **batch (static)** vs **streaming (dynamic)** — the decision that recurs in `model-deployment`.

Don't pull this for: storage-engine *internals*, replication, partitioning, transactions, consensus — those are `kleppmann-data-intensive-systems`. This reference is the ML-flavored orientation; route there for depth.

## Decision 1: Data format — row-major vs column-major, text vs binary

| Choose | When |
|---|---|
| **Row-major (CSV)** | Write-heavy; appending individual examples; access by *example/row* (all examples collected today). |
| **Column-major (Parquet)** | Read-heavy on *features/columns* (pull 4 of 1,000 features); large feature tables; analytics. |
| **Text (JSON/CSV)** | Human-readable, ubiquitous; pays in size + serialization quirks (CSV loses float precision). |
| **Binary (Parquet/Avro/Protobuf)** | Compact + fast (Huyen's file: 14MB CSV → 6MB Parquet; AWS ~6x less storage, ~2x faster). |

Gotcha: **pandas DataFrame is column-major.** Iterating it by row is ~30x slower than by column (2.41s vs 0.07s in Huyen's bench); convert to a NumPy ndarray for fast row access.

## Decision 2: Data model — relational / document / graph

- **Relational** (SQL, declarative): normalize to kill redundancy + improve integrity; cost is joins across spread-out relations. Default for most ML feature stores.
- **Document** (JSON/BSON, "schemaless"): better *locality* (all of a book's info in one doc), weak cross-doc joins. Schema responsibility shifts from writer to reader.
- **Graph** (nodes + edges): wins when *relationships* are the query ("everyone born in the USA" across N hops) — awkward in SQL/document.

Structured (warehouse, schema-on-write) vs unstructured (data lake, schema-on-read): the real question is *who assumes the structure* — the code that writes (structured) or the code that reads (unstructured). Lakehouse (Databricks/Snowflake) hybridizes both.

## Decision 3: Storage workload — OLTP vs OLAP (and the caveat)

OLTP (row-major, low-latency, high-availability, often ACID) for per-transaction reads/writes; OLAP for column-aggregating analytics. **But say the caveat in interviews**: these terms are dated — modern engines do both (CockroachDB, DuckDB, Iceberg), and storage is increasingly **decoupled from compute** (BigQuery, Snowflake). ACID's loose foil is BASE (Basically Available, Soft state, Eventual consistency).

## Decision 4: Dataflow mode — how processes pass data

| Mode | Mechanism | Use when |
|---|---|---|
| **Through database** | A writes, B reads | Simplest; fails if processes can't share a DB or latency is tight. |
| **Request-driven (REST/RPC)** | A requests, B responds (synchronous) | Logic-heavy systems, microservices. Trap: B down → everyone needing B is down; the request web blows up at scale. |
| **Real-time transport (Kafka/Kinesis)** | Broadcast **events** to a broker (async) | Data-heavy systems; decouples producers from consumers. Pubsub (topics, retention) vs message queue (intended consumer). |

The senior framing: **request-driven for logic-heavy, event-driven for data-heavy.** A broker collapses an O(N²) interservice request mesh into N broker connections.

## Decision 5: Batch vs stream processing → static vs dynamic features

- **Batch processing** (Spark/MapReduce, periodic): computes **static features** that change slowly — a driver's lifetime rating.
- **Stream processing** (Flink/KSQL, continuous): computes **dynamic features** that change fast — drivers available *right now*, rides requested in the last minute. Strength is **stateful computation** (incrementally update a 30-day window instead of recomputing daily).
- Most real systems need **both**, joined at serving time (→ `model-deployment`). "Batch is a special case of streaming" — easier to make a stream engine do batch than vice versa.

## Practitioner checklist

- [ ] Picked format by access pattern (row=write/example, column=read/feature) and weighed binary vs text on size.
- [ ] Chose data model by query shape (relational default; graph if relationships are the query).
- [ ] Named the workload (OLTP/OLAP) AND the modern caveat (decoupled storage/compute).
- [ ] Chose dataflow mode (DB / request / event), defaulting to event-driven if data-heavy.
- [ ] Classified each feature as batch/static or stream/dynamic and noted where they join.

## Interview signal

This rarely *leads* an MLSD round, but interviewers probe it to separate people who've shipped from people who've only trained models. The tells: you distinguish **static vs dynamic features** unprompted, you reach for a **real-time transport** when the request mesh would blow up, and you name the **decoupled storage/compute** caveat instead of reciting textbook OLTP/OLAP.

> Senior talking point: *"I split features by freshness — batch jobs compute the slow-moving ones like lifetime ratings, a stream engine like Flink computes the fast ones like current driver supply, and the serving layer joins them. For service-to-service data I default to a Kafka-style event bus over point-to-point REST once the system is data-heavy, because the synchronous request mesh becomes the bottleneck and a single downed service cascades."*

## References

- *Designing Machine Learning Systems*, Chip Huyen (O'Reilly, 2022), Ch. 3.
- For depth on storage engines, replication, partitioning, transactions, consensus: `kleppmann-data-intensive-systems` (Huyen defers here explicitly).
- Sibling refs: `ml-systems-design-process` (the framing this stack serves), `training-data` (turning raw data into labeled training data), `model-deployment` (batch vs online prediction, where static/dynamic features are joined).
