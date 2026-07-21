
# Provost/Fawcett: Leakage Audit

## When to Use

Use when model results look too good, historical features may contain future information, validation may not match deployment, or a stakeholder asks whether predictive performance is trustworthy.

## Do Not Use For

Security/privacy data leakage. This skill covers predictive leakage: target information sneaking into training or evaluation through variables unavailable when the decision is made.

## Framework

Leakage occurs when a variable or preparation step gives information about the target in historical data that would not exist at model-use time. Classes include future knowledge, outcome proxies, process artifacts, population mismatch, cross-fold contamination, and identifier/timestamp encodings.

## How to Apply

1. Fix the prediction moment and write what the model knows at that time.
2. Review each feature: would this value be available with the same meaning before the decision?
3. Trace suspicious features to who creates them, when, and because of what event.
4. Check whether training rows were selected by prior decisions, treatments, approvals, or targeting rules.
5. Compare validation design to deployment reality: time split, entity split, deduplication, and preprocessing scope.
6. Re-run evaluation after removing or time-shifting high-risk features.
7. Document residual assumptions and deployment monitoring.

## Output Format

- Prediction moment used for the audit.
- Leakage risk register: feature/source, leakage class, evidence, severity, and owner.
- Remediation: remove, time-shift, recompute, redesign split, relabel, or collect data.
- Re-evaluation requirement.
- Deployment monitor for feature availability and population drift.

## Common Failure Modes

- Accepting perfect performance without investigation.
- Saying a feature exists in the database without checking whether it exists before the decision.
- Building aggregates over the full dataset before splitting.
- Training a pre-treatment decision model on post-treatment data.
- Ignoring selection bias because held-out data comes from the same biased historical process.
- Fixing one leaked feature while leaving a correlated process artifact behind.

## References

- Foster Provost and Tom Fawcett, Data Science for Business, Chapters 2 and 14.
- Related carved skills: `provost-business-problem-to-mining-task`, `provost-target-label-design`, `provost-leakage-audit`, `provost-expected-value-evaluation`, `provost-performance-curve-selection`, `provost-uplift-value-of-targeting`.
