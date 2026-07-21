---
name: provost-data-science-for-business
description: Apply Provost and Fawcett's Data Science for Business frameworks: business-problem-to-mining-task translation, expected value evaluation, leakage audit, performance curve selection, target/label design, and uplift/value-of-targeting. Triggers: data mining task, supervised vs unsupervised, churn/fraud/recommendation framing, expected value, cost-benefit matrix, class imbalance, model makes money, leakage, information from the future, profit/lift/ROC/AUC curves, operating threshold, target/label design, outcome window, proxy label, uplift, who actually changes behavior, value of targeting. Sibling hubs: kohavi-controlled-experiments and ab-test-setup for A/B design and online metrics; marr-data-strategy for use-case framing; dama-data-management and mcgilvray-data-quality-project for data quality/governance; fde-data-lifecycle and data-mesh-principles for platform. Load the matching reference file when a specific framework is needed.
---

# provost-data-science-for-business

Book provenance: **Foster Provost and Tom Fawcett - Data Science for Business**. Load the matching `references/*.md` file when a specific framework is needed.

## When to use

Use this hub when the user's question matches any sub-framework trigger in the frontmatter description. Route to **one** reference file, read it fully, then execute that framework's process and output format.

Do not improvise a hybrid of multiple frameworks unless the user explicitly asks for a combined pass.

## Quick routing

| User cue (examples) | Reference |
| Translate a business objective into a known data mining task before modeling | `references/provost-business-problem-to-mining-task.md` |
| Replace accuracy with cost-benefit, unequal FP/FN costs, class imbalance, does the model make money | `references/provost-expected-value-evaluation.md` |
| Suspiciously strong performance, information not available at decision time, leakage register | `references/provost-leakage-audit.md` |
| Profit/lift/cumulative-response/ROC/AUC curves, operating threshold, overfitting visualization | `references/provost-performance-curve-selection.md` |
| Define the prediction target, ambiguous outcome window, fuzzy positive class, proxy/missing labels | `references/provost-target-label-design.md` |
| Whom to target, separate likely actors from those who change because of the intervention, uplift | `references/provost-uplift-value-of-targeting.md` |

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

- [references/provost-business-problem-to-mining-task.md](references/provost-business-problem-to-mining-task.md)
- [references/provost-expected-value-evaluation.md](references/provost-expected-value-evaluation.md)
- [references/provost-leakage-audit.md](references/provost-leakage-audit.md)
- [references/provost-performance-curve-selection.md](references/provost-performance-curve-selection.md)
- [references/provost-target-label-design.md](references/provost-target-label-design.md)
- [references/provost-uplift-value-of-targeting.md](references/provost-uplift-value-of-targeting.md)

- **Book:** Foster Provost and Tom Fawcett - Data Science for Business