---
name: kimball-dimensional-modeling
description: Apply Kimball and Ross dimensional modeling from The Data Warehouse Toolkit: business process / bus matrix scoping, grain declaration, fact table design, dimension design, conformed dimensions, slowly changing dimensions, and accumulating snapshots for analytics/data-warehouse star schemas. Triggers: dimensional model, star schema, data warehouse design, bus matrix, business process matrix, grain declaration, fact table grain, fact table design, dimension design, conformed dimensions, SCD, slowly changing dimensions, type 1/2/3, accumulating snapshot, periodic snapshot, drill-across, BI analytics modeling. Distinct from kleppmann-data-intensive-systems (OLTP/distributed-systems internals). Sibling hubs: fde-data-lifecycle and data-mesh-principles for platform/engineering; dama-data-management, nigd-non-invasive-governance, and mcgilvray-data-quality-project for governance and quality. Load the matching reference file when a specific framework is needed.
---

# kimball-dimensional-modeling

Book provenance: **Ralph Kimball and Margy Ross - The Data Warehouse Toolkit (3rd ed.)**. Load the matching `references/*.md` file when a specific framework is needed.

## When to use

Use this hub when the user's question matches any sub-framework trigger in the frontmatter description. Route to **one** reference file, read it fully, then execute that framework's process and output format.

Do not improvise a hybrid of multiple frameworks unless the user explicitly asks for a combined pass.

## Quick routing

| User cue (examples) | Reference |
| Scope a warehouse, enterprise data warehouse bus matrix, which business processes/marts to build, shared dimensions overview | `references/kimball-business-process-matrix.md` |
| Declare fact table grain, duplicate-looking rows, mixed-level metrics, transaction vs snapshot, query-safe star schema | `references/kimball-grain-declaration.md` |
| Design a fact table, additive/semi-additive/non-additive facts, transaction vs periodic vs accumulating, factless facts, degenerate dimensions | `references/kimball-fact-table-design.md` |
| Design dimension tables, surrogate keys, attributes/hierarchies, denormalization, role-playing/junk dimensions | `references/kimball-dimension-design.md` |
| Conformed dimensions, drill-across multiple marts, shared/standard dimensions, integration across business processes | `references/kimball-conformed-dimensions-bus.md` |
| Slowly changing dimensions, SCD type 1/2/3, track attribute history, overwrite vs new row, effective dates | `references/kimball-slowly-changing-dimensions.md` |
| Accumulating snapshot fact, pipeline/workflow with milestones, lag between stages, process lifecycle measurement | `references/kimball-accumulating-snapshot.md` |

## How to apply

1. Match the user request to a row in **Quick routing** (or the description triggers).
2. Read the corresponding file under `references/`.
3. Follow that reference's artifact, process, failure modes, and output format.
4. Return the reference's output artifact; add hub-level manipulation-risk or cross-reference notes only when the reference requires it.

## Common failure modes (hub-level)

- **Wrong reference** - loading one sub-framework when another row in Quick routing fits better.
- **Router-only answer** - summarizing the hub without loading the reference's full framework.
- **Retired atomic names** - legacy per-framework skill folders were collapsed into this hub; use `references/` only.
- **Skipping evidence** - each reference requires evidence-backed scores and explicit unknowns; do not default to parity.

## References

- [references/kimball-business-process-matrix.md](references/kimball-business-process-matrix.md)
- [references/kimball-grain-declaration.md](references/kimball-grain-declaration.md)
- [references/kimball-fact-table-design.md](references/kimball-fact-table-design.md)
- [references/kimball-dimension-design.md](references/kimball-dimension-design.md)
- [references/kimball-conformed-dimensions-bus.md](references/kimball-conformed-dimensions-bus.md)
- [references/kimball-slowly-changing-dimensions.md](references/kimball-slowly-changing-dimensions.md)
- [references/kimball-accumulating-snapshot.md](references/kimball-accumulating-snapshot.md)

- **Book:** Ralph Kimball and Margy Ross - The Data Warehouse Toolkit (3rd ed.)