
# Kimball - Conformed Dimensions and Bus Architecture

## The Framework

Use this skill to produce: **A conformance contract listing shared dimensions/facts, allowed local extensions, stewardship, and drill-across tests.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- Sales and shipments reports disagree on customer
- A new mart must integrate with existing stars
- Teams want local product attributes without breaking enterprise reporting
- Planning shared date/customer/product dimensions
- Testing whether two facts can drill across

## How To Apply

- Name the business process stars that must integrate.
- Define each conformed dimension's grain, keys, mandatory attributes, and allowed subsets.
- Define conformed facts with identical business meaning and calculation rules.
- Run drill-across scenarios before declaring marts integrated.

## Sub-Rules

- Conformed dimensions mean same keys, same attribute meanings, or strict rollup compatibility.
- Dimension subsets are acceptable only when they preserve common rollups.
- Local extensions may exist but cannot redefine shared attributes.
- Conformed facts require identical definitions, not just identical column names.

## Common Failure Modes

- Same-name fallacy: customer_id means different survivorship or householding rules across marts.
- Stovepipe data marts: each star works alone but cannot answer cross-process questions.
- Centralization theater: a committee approves names without usable shared dimensions.
- Over-conformance: forces irrelevant attributes into every mart and slows delivery.

## Overlap Guardrails

Do not use for broad data governance operating model design; use when the artifact is dimensional drill-across conformance.

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapter 3.
- Sibling skills: references/kimball-business-process-matrix.md, references/kimball-grain-declaration.md, references/kimball-fact-table-design.md, references/kimball-dimension-design.md, references/kimball-slowly-changing-dimensions.md, references/kimball-accumulating-snapshot.md.
