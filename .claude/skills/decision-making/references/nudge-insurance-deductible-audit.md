# Nudge: Insurance Deductible Audit

## When to Use

Use when insurance choices trade premiums against out-of-pocket risk:

- Auto/home deductible selection.
- Health plan comparison.
- Extended warranty decision.
- HSA/FSA/open enrollment support.
- Menus with many confusing plans.

## Framework

Thaler and Sunstein argue people often overinsure small losses because of deductible aversion. Insurance is best used for catastrophic risks, while small predictable losses can often be self-insured.

## How to Apply.

1. **List plan options.** Premium, deductible, out-of-pocket max, coverage.
2. **Check catastrophic protection.**
3. **Compare premium savings.**
4. **Identify dominated plans.** Worse on both cost and coverage.
5. **Recommend largest affordable deductible.**
6. **Create self-insurance account.** Set aside premium savings when needed.
7. **Flag behavioral hazard.** Do not discourage necessary care.

## Output Format

```markdown
## Insurance Deductible Audit: {plan}

Options:
Dominated plans:
Recommended deductible:
Premium savings:
Catastrophe protection:
Self-insurance plan:
Care-access warning:
```

## Common Failure Modes

- **Insuring small stuff.** Paying high premiums to avoid modest losses.
- **Ignoring affordability.** A high deductible is bad if the user cannot cover it.
- **Dominated plan blindness.** Too many choices hide clearly worse plans.
- **Care avoidance.** High deductibles can suppress necessary health care.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 12.
