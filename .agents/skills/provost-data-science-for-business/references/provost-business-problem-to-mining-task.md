
# Provost/Fawcett: Business Problem to Mining Task

## When to Use

Use when a business request arrives as a vague analytics or AI ask: predict churn, find high-value donors, use ML for fraud, segment customers, recommend next best action, or decide what data science approach fits a business problem.

## Do Not Use For

SQL, dashboarding, algorithm tutorials, or already-scoped model implementation. This skill owns the pre-modeling translation from business objective to data-mining task.

## Framework

Provost and Fawcett separate the business problem from the data-mining task. The analyst decomposes a business goal into task families such as classification, class probability estimation, regression, similarity matching, clustering, co-occurrence discovery, profiling, link prediction, data reduction, or causal modeling, then recomposes the output into a decision workflow.

## How to Apply

1. Restate the business objective as an operational decision: who will do what differently?
2. Identify the decision unit: customer, transaction, donor, account, document, product, event, or relationship.
3. List candidate task families and reject ones that do not match the available target or intended use.
4. Decide whether a supervised target exists; if not, choose exploratory work or a label-acquisition plan.
5. Decompose multi-part problems into subtasks such as response probability, value estimation, capacity ranking, or causal effect.
6. Recompose outputs into the business action: rank, threshold, route, recommend, review, or trigger outreach.
7. Name the evaluation artifact that will prove value: expected value, profit curve, lift at budget, false-alarm workload, or decision quality.

## Output Format

- Problem framing with business objective and decision to improve.
- Task decomposition table: subtask, task family, entity grain, output, and reason.
- Data and label requirements.
- Decision integration path.
- Evaluation plan and baseline.
- Open assumptions around causality, costs, labels, and deployment.

## Common Failure Modes

- Treating a business word like fraud or churn as if it already defines a technical task.
- Choosing clustering when a specific target exists and supervised segmentation would be more useful.
- Modeling probability when the decision needs expected value, capacity-aware ranking, or incremental effect.
- Ignoring the use phase; mining the model and using the model are different processes.
- Letting algorithm familiarity determine the formulation.
- Skipping a baseline decision process, making added value impossible to prove.

## References

- Foster Provost and Tom Fawcett, Data Science for Business, Chapters 2 and 11.
- Related carved skills: `provost-business-problem-to-mining-task`, `provost-target-label-design`, `provost-leakage-audit`, `provost-expected-value-evaluation`, `provost-performance-curve-selection`, `provost-uplift-value-of-targeting`.
