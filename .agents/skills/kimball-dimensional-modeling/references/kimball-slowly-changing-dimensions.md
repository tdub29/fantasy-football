
# Kimball - Slowly Changing Dimensions

## The Framework

Use this skill to produce: **An SCD decision table mapping each changing attribute to history type, keys, effective dating, and query impact.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- Customer region changes and historical sales reporting is disputed
- Product category is corrected vs reclassified
- Users want both current and historical views
- A dimension load overwrites history unexpectedly
- Designing effective dates and current flags

## How To Apply

- Classify each attribute change as correction, natural evolution, or alternate viewpoint.
- Choose Type 1 overwrite, Type 2 new row, Type 3 alternate attribute, or hybrid.
- Define surrogate key, effective date, end date, and current-row semantics.
- Document which facts keep old dimension keys and which views restate history.

## Sub-Rules

- Type 1 overwrites history for corrections or always-current reporting.
- Type 2 preserves history with a new dimension row and surrogate key.
- Type 3 stores limited alternate history in additional columns.
- Hybrid patterns are valid only when each attribute's analytic promise is explicit.

## Common Failure Modes

- Default Type 2 everything: creates noise and row explosion for corrections users never analyze.
- Silent Type 1 overwrite: destroys historical reporting without stakeholder approval.
- No durable natural key: cannot link historical versions of the same entity.
- Current-view confusion: reports mix current attributes with historical facts accidentally.

## Overlap Guardrails

Do not use for event sourcing or application audit logs; this is dimensional attribute history.

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapter 5.
- Sibling skills: references/kimball-business-process-matrix.md, references/kimball-grain-declaration.md, references/kimball-fact-table-design.md, references/kimball-dimension-design.md, references/kimball-conformed-dimensions-bus.md, references/kimball-accumulating-snapshot.md.
