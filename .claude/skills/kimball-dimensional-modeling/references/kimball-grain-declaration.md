
# Kimball - Grain Declaration

## The Framework

Use this skill to produce: **A grain declaration statement plus allowed facts, dimensions, exclusions, and grain violation tests.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- A fact table has duplicate-looking rows
- Metrics mix line item, order, and customer levels
- A modeler wants to add a dimension that changes the row meaning
- Choosing between transaction, periodic snapshot, and accumulating snapshot
- Reviewing whether a star schema is query-safe

## How To Apply

- Write one sentence: one row represents exactly one occurrence of X at Y level.
- Name the measurement event and all natural keys that make the row unique.
- Admit only facts that live at that grain without allocation.
- Reject dimensions that require a different row grain or bridge pattern.

## Sub-Rules

- Declare grain before dimensions or facts.
- Use the lowest practical atomic grain when analytics need drill-across flexibility.
- Snapshot grains must include the period or lifecycle milestone that defines the row.
- Derived aggregates inherit grain from their base events and must not masquerade as atomic facts.

## Common Failure Modes

- Fact-first design: starts with revenue, margin, count, then discovers they live at different levels.
- Mixed-grain table: stores order header facts beside line-item facts without allocation rules.
- Hidden periodicity: monthly balances are joined like transactions.
- Dimension creep: adding a status history dimension that multiplies rows unintentionally.

## Overlap Guardrails

Do not use for SQL query grouping advice; use this when the physical dimensional model itself is ambiguous.

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapters 1-2.
- Sibling skills: references/kimball-business-process-matrix.md, references/kimball-fact-table-design.md, references/kimball-dimension-design.md, references/kimball-slowly-changing-dimensions.md, references/kimball-conformed-dimensions-bus.md, references/kimball-accumulating-snapshot.md.
