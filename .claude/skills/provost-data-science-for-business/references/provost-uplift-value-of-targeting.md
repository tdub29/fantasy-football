
# Provost/Fawcett: Uplift and Value of Targeting

## When to Use

Use when the question is not who is likely to do X, but whose expected value improves if we intervene: retention offers, discounts, ads, outreach, solicitations, treatments, or targeting policies.

## Do Not Use For

Ordinary response modeling with no untreated alternative or intervention effect.

## Framework

Value of targeting compares expected value if targeted against expected value if not targeted. Estimate treated outcome, untreated outcome, incremental effect, unit value, intervention cost, and data gaps, while watching for selection bias in historically targeted samples.

## How to Apply

1. Write the naive target and why it may be wrong.
2. Define targeting value as EV(target) minus EV(no target).
3. List treated probability/value, untreated probability/value, unit economics, and intervention cost.
4. Identify which quantities exist and which require new data.
5. Check whether past treated customers were selected by the same heuristic now being improved.
6. Choose an approximation if full uplift data is missing: randomized pilot, proxy, staged data investment, or bounded rule.
7. Recommend a policy and validation plan with holdout/control where feasible.

## Output Format

- Intervention decision and timing.
- Value-of-targeting decomposition.
- Data availability matrix and selection-bias risks.
- Targeting policy and fallback approximation.
- Experiment or data-investment plan.
- Failure checks: would-buy-anyway, cannot-be-saved, low-value responders, harmed-by-contact.

## Common Failure Modes

- Targeting highest baseline probability instead of highest incremental value.
- Ignoring the no-target case.
- Training on historically targeted people and applying to everyone.
- Treating an old offer as a perfect proxy for a new offer.
- Omitting intervention cost or unit value.
- Waiting for perfect causal data when a bounded pilot would create useful information.

## References

- Foster Provost and Tom Fawcett, Data Science for Business, Chapter 11.
- Related carved skills: `provost-business-problem-to-mining-task`, `provost-target-label-design`, `provost-leakage-audit`, `provost-expected-value-evaluation`, `provost-performance-curve-selection`, `provost-uplift-value-of-targeting`.
