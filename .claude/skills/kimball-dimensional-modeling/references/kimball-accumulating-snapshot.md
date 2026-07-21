
# Kimball - Accumulating Snapshot

## The Framework

Use this skill to produce: **An accumulating snapshot schema spec with lifecycle grain, milestone date keys, lag facts, status facts, and update rules.**

This is not a summary route. It should fire only when the user needs the artifact above and the request matches the trigger surface in the frontmatter.

## Trigger Checks

- A process has known stages and users ask cycle-time questions
- One application/order/claim moves through milestones
- Users need current pipeline state plus elapsed days
- A transaction fact cannot easily answer lifecycle completion
- Milestone dates are scattered across event tables

## How To Apply

- Declare one row per pipeline instance at the lifecycle grain.
- List standard milestones and create role-playing date keys for each.
- Add lag/duration facts between milestones and current status measures.
- Define update rules for late, skipped, reopened, or cancelled milestones.

## Sub-Rules

- Accumulating snapshots revisit the same row as milestones are reached.
- They fit bounded processes with a recognizable beginning and end.
- Multiple date foreign keys are expected; each date plays a different role.
- Cycle-time facts should be derived consistently from milestone dates.

## Common Failure Modes

- Unbounded-process misuse: tries to model perpetual inventory or user activity as a finite pipeline.
- Append-only loading: creates one row per status change instead of updating the lifecycle row.
- Milestone ambiguity: stages are optional or repeated but no rules define which occurrence counts.
- No exception states: cancelled, skipped, reversed, and reopened cases corrupt cycle-time metrics.

## Overlap Guardrails

Do not use for generic event streams or process mining; use when a dimensional lifecycle fact table is the target.

## Output Format

Return the artifact in this order:

1. **Decision context:** one paragraph naming the business/system decision.
2. **Working table or checklist:** the concrete rows, columns, scores, or mappings required by the artifact.
3. **Recommendation:** the chosen design or next action and why.
4. **Risks and tests:** the top failure modes to verify before adoption.

## References

- Ralph Kimball and Margy Ross - The Data Warehouse Toolkit, 2nd ed. (Wiley, 2002), Chapters 3 and 5.
- Sibling skills: references/kimball-business-process-matrix.md, references/kimball-grain-declaration.md, references/kimball-fact-table-design.md, references/kimball-dimension-design.md, references/kimball-slowly-changing-dimensions.md, references/kimball-conformed-dimensions-bus.md.
