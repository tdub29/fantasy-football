
# Provost/Fawcett: Target and Label Design

## When to Use

Use before supervised modeling when the target variable is not precise: churn soon, fraud, high-value customer, conversion after exposure, risky account, donor response, or any model where labels must be inferred from events.

## Do Not Use For

Unsupervised exploration unless the work is deciding whether a supervised target can be created.

## Framework

A label is not just a column. It is a business definition translated into an observable event, time window, entity grain, and labeling rule. Specify entity grain, prediction time, outcome window, positive/negative classes, gray-zone exclusions, label source, and deployment match.

## How to Apply

1. Write the operational decision first.
2. Set the prediction timestamp and remove information unavailable at that moment.
3. Define the outcome window in business terms.
4. Define positive, negative, unlabeled, and gray-zone cases.
5. Confirm labels exist historically or state how to obtain them.
6. If using a proxy, explain why it approximates the real target and how it could fail.
7. Check selection bias from historically targeted, reviewed, approved, or treated examples.
8. Write a label QA plan with sample review, edge cases, and expected prevalence.

## Output Format

- Target statement: entity, prediction time, outcome, and window.
- Positive, negative, gray-zone, and exclusion rules.
- Data feasibility and label-source notes.
- Proxy assessment if applicable.
- Bias/leakage checks.
- Evaluation implications for class balance, baseline, and metric choice.

## Common Failure Modes

- Defining the target after feature extraction, inviting leakage.
- Treating churn or engagement as self-defining instead of specifying event and window.
- Forcing borderline cases into hard labels when gray zones would reduce noise.
- Using only historically selected examples as if they represented deployment.
- Using convenient proxy labels without validating divergence from the real business outcome.
- Optimizing accuracy when label design creates severe class imbalance or unequal error costs.

## References

- Foster Provost and Tom Fawcett, Data Science for Business, Chapters 2, 3, and 10.
- Related carved skills: `provost-business-problem-to-mining-task`, `provost-target-label-design`, `provost-leakage-audit`, `provost-expected-value-evaluation`, `provost-performance-curve-selection`, `provost-uplift-value-of-targeting`.
