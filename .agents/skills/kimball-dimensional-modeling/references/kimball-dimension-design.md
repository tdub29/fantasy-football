
# Kimball - Dimension Design

## The Framework

Use this skill to produce: **A dimension design spec with business key, surrogate key, attribute groups, hierarchies, special dimension patterns, and quality checks.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- A dimension is snowflaked into hard-to-query fragments
- Users need labels, groupings, and hierarchies around a fact
- Order number or invoice number does not deserve a full dimension
- Low-cardinality flags are cluttering facts
- Date appears several ways in one business process

## How To Apply

- Identify the business entity or descriptive context users filter by.
- Choose surrogate key policy and durable natural/business key.
- Flatten attributes into understandable groups and hierarchies.
- Use special patterns deliberately: date, role-playing, junk, degenerate, mini-dimension.

## Sub-Rules

- Dimensions carry textual context, filters, labels, and rollups.
- Surrogate keys isolate warehouse history from operational key churn.
- Hierarchies should match business navigation, not source table structure.
- Role-playing dimensions reuse one physical dimension through different semantic roles.

## Common Failure Modes

- Snowflake reflex: preserves source normalization and makes BI users join through technical tables.
- Key leakage: exposes operational keys as warehouse join keys and breaks history.
- Attribute dumping: hundreds of source columns with no business grouping or naming cleanup.
- Misplaced degenerate dimensions: creates empty one-column dimensions for identifiers already useful in the fact.

## Overlap Guardrails

Do not use for master data governance or source-system MDM ownership; use DAMA/MDM skills for that.

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapters 1-5.
- Sibling skills: references/kimball-business-process-matrix.md, references/kimball-grain-declaration.md, references/kimball-fact-table-design.md, references/kimball-slowly-changing-dimensions.md, references/kimball-conformed-dimensions-bus.md, references/kimball-accumulating-snapshot.md.
