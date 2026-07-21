
# Provost/Fawcett: Expected Value Evaluation

## When to Use

Use when accuracy, F1, AUC, or RMSE does not answer the business question: churn ROI, fraud-review workload, false-positive costs, threshold choice, or whether a model makes money.

## Do Not Use For

Metric selection for online experiments, accounting statements, or pure operating-condition-free predictiveness.

## Framework

Expected value separates outcome probabilities from business values. Each confusion-matrix cell receives a value, and the model's expected value is the cell-wise sum of probability times value. The class base rate should match deployment, not an artificially balanced training set.

## How to Apply

1. State the model decision: target, deny, approve, review, alert, recommend, retain, or ignore.
2. Build the confusion matrix on holdout data resembling deployment.
3. Define the cost-benefit matrix with stakeholders.
4. Check sign consistency and double-counting.
5. Convert counts to rates or probabilities under realistic class priors.
6. Compute expected value for each model, threshold, and baseline policy.
7. Stress-test conclusions under plausible cost, benefit, and base-rate ranges.

## Output Format

- Business decision and population.
- Confusion matrix summary and class priors.
- Cost-benefit matrix with source/owner for each value.
- Expected value table by model, threshold, and baseline.
- Sensitivity notes and recommendation.

## Common Failure Modes

- Reporting accuracy on an imbalanced population where the majority classifier looks excellent.
- Using a balanced test set without replacing class priors with realistic deployment priors.
- Treating false positives and false negatives as equal because the metric does.
- Double-counting avoided losses as both benefit and cost.
- Omitting operational costs such as staff review, incentives, customer annoyance, or capacity.
- Comparing only to random instead of a simple stakeholder-credible baseline.

## References

- Foster Provost and Tom Fawcett, Data Science for Business, Chapter 7.
- Related carved skills: `provost-business-problem-to-mining-task`, `provost-target-label-design`, `provost-leakage-audit`, `provost-expected-value-evaluation`, `provost-performance-curve-selection`, `provost-uplift-value-of-targeting`.
