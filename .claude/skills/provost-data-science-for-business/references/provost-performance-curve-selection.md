
# Provost/Fawcett: Performance Curve Selection

## When to Use

Use when a single model metric hides the decision tradeoff: threshold selection, budget-limited targeting, fraud-review workload, model comparison under changing base rates, or overfitting/learning-curve questions.

## Do Not Use For

Generic visualization aesthetics or chart type selection outside model evaluation.

## Framework

Different curves answer different questions: profit curves show expected cumulative profit, cumulative response shows positives captured by targeting depth, lift shows improvement over random, ROC shows true-positive versus false-positive tradeoff independent of priors/costs, fitting curves diagnose complexity, and learning curves assess value of more data.

## How to Apply

1. Identify the decision: choose model, threshold, value story, overfitting diagnosis, or data investment.
2. If costs/benefits are known and stable, prefer profit curves.
3. If base rates match deployment but costs are unknown, use lift or cumulative response.
4. If priors or costs are uncertain, use ROC and AUC for operating-condition-free comparison.
5. If overfitting is suspected, plot train versus holdout performance across complexity.
6. If buying more data is under debate, use learning curves and compare marginal value to cost.
7. Interpret at the actual operating point, not the visually strongest region.

## Output Format

- Curve recommendation and backup view.
- Operating assumptions: costs, benefits, base rates, budget/capacity.
- Axis interpretation guide.
- Threshold/model recommendation.
- Caveats: downsampling, prior mismatch, uncertainty, or comprehension risk.

## Common Failure Modes

- Showing lift curves after downsampling negatives and treating axes as deployment-real.
- Choosing highest AUC when top-budget operating performance favors another model.
- Using profit curves with invented precise costs and no sensitivity analysis.
- Reading ROC as business value when stakeholders need dollars, workload, or captured positives.
- Looking at the curve's best region instead of the intended operating point.
- Mixing rankings from different models as if curves remain valid.

## References

- Foster Provost and Tom Fawcett, Data Science for Business, Chapter 8.
- Related carved skills: `provost-business-problem-to-mining-task`, `provost-target-label-design`, `provost-leakage-audit`, `provost-expected-value-evaluation`, `provost-performance-curve-selection`, `provost-uplift-value-of-targeting`.
