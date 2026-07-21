
# Kimball - Business Process Matrix

## The Framework

Use this skill to produce: **A filled business process matrix with process rows, conformed dimension columns, priority order, and integration risks.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- Planning the first wave of data marts
- Comparing business processes that share date/customer/product dimensions
- Explaining how marts will integrate before tables are built
- Finding stovepipe risk in a warehouse roadmap
- Sequencing a dimensional modeling backlog

## How To Apply

- List measurable business processes, not departments or source systems.
- Declare candidate dimensions across the top and mark only true shared analytic context.
- Score each row for business value, data readiness, and conformity leverage.
- Pick an implementation slice that produces value while extending the bus.

## Sub-Rules

- Rows are business processes with facts, not org-chart teams.
- Columns are conformed dimensions that can be reused with the same meaning.
- The matrix is a planning artifact; it precedes physical schema design.
- Blank cells matter because they reveal where integration is impossible or unnecessary.

## Common Failure Modes

- Department matrix: rows are Sales, Finance, Ops instead of orders, shipments, invoices.
- Source-system matrix: organizes around SAP or Salesforce rather than measurements users analyze.
- Premature conformity: assumes customer/product definitions match before ownership and grain are checked.
- Everything-first roadmap: delays value until the whole matrix is complete.

## Overlap Guardrails

Do not use for generic governance operating models (use nigd/dama governance skills) or pipeline lineage (use tracing lineage skills).

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapter 3.
- Sibling skills: references/kimball-grain-declaration.md, references/kimball-fact-table-design.md, references/kimball-dimension-design.md, references/kimball-slowly-changing-dimensions.md, references/kimball-conformed-dimensions-bus.md, references/kimball-accumulating-snapshot.md.
