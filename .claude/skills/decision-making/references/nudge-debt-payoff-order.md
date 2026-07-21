# Nudge: Debt Payoff Order

## When to Use

Use for multi-debt payoff decisions:

- Several cards or loans have different balances and APRs.
- The user is splitting extra payments equally or by balance.
- A debt UI needs to nudge optimal allocation.
- Autopay or late-fee prevention matters.

## Framework

People often use **balance matching**, spreading payments in proportion to balances. The economically better rule is: pay minimums on all debts, then direct all extra dollars to the highest APR, with behavioral exceptions made deliberately.

## How to Apply.

1. **List debts.** Balance, APR, minimum, due date.
2. **Pay all minimums.**
3. **Rank by APR.**
4. **Allocate extra to highest APR.**
5. **Flag balance matching.**
6. **Check savings-vs-debt arbitrage.**
7. **Set autopay.**
8. **Document behavioral exception if snowball is chosen.**

## Output Format

```markdown
## Debt Payoff Order

Debts:
Minimums:
Extra available:
Optimal target:
Balance-matching risk:
Autopay setup:
Behavioral exception:
```

## Common Failure Modes

- **Balance matching.** Paying in proportion to balances instead of APR.
- **Minimum missed.** Extra payment goes to one card while another incurs fees.
- **Savings drag.** Cash earns less than debt costs but is not deployed.
- **Behavioral exception hidden.** Snowball choice is fine only if named as behavioral.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 11.
