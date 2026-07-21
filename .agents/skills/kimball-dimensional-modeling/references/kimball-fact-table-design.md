
# Kimball - Fact Table Design

## The Framework

Use this skill to produce: **A fact table design brief with type, grain, foreign keys, facts by additivity, and load/update behavior.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- A metric model needs a fact table
- Choosing how to model inventory, balances, events, or attendance
- A table has no numeric facts but records coverage or events
- Measures do not aggregate correctly
- ETL behavior differs from append-only transaction facts

## How To Apply

- Start from the declared grain and classify the fact table type.
- List all dimension foreign keys including role-playing dates.
- Classify measures as additive, semi-additive, non-additive, or counts.
- Specify load pattern: append, periodic insert, or milestone update.

## Sub-Rules

- Transaction facts are event rows and usually append-only.
- Periodic snapshots summarize a process at regular intervals and often hold semi-additive balances.
- Accumulating snapshots track a lifecycle in one row that is revisited as milestones occur.
- Factless fact tables model events or coverage where the count is the fact.

## Common Failure Modes

- Semi-additive trap: summing balances across time as if they were transactions.
- Missing coverage table: cannot answer what did not happen because only events were modeled.
- Too-wide junk fact: descriptive attributes land in the fact table instead of dimensions.
- Unspecified update semantics: an accumulating snapshot is loaded like an append-only event table.

## Overlap Guardrails

Do not use for generic database normalization or OLTP schema design; this is presentation-layer dimensional modeling.

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapters 1-5.
- Sibling skills: references/kimball-business-process-matrix.md, references/kimball-grain-declaration.md, references/kimball-dimension-design.md, references/kimball-slowly-changing-dimensions.md, references/kimball-conformed-dimensions-bus.md, references/kimball-accumulating-snapshot.md.
