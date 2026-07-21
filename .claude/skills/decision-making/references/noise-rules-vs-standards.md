# Noise: Rules vs Standards

## When to Use

Use when deciding how much discretion a process should allow:

- Auto-categorize recurring merchants.
- Triage support tickets.
- Screen SMB acquisition targets.
- Approve budget exceptions.
- Enforce product quality gates.

## Framework

Rules reduce noise by limiting discretion. Standards preserve flexibility but invite variability. Guidelines sit between them. Algorithms can reduce noise but introduce transparency, fairness, and dignity concerns.

## How to Apply

1. **Name the decision.**
2. **Estimate recurrence.** One-off, occasional, frequent.
3. **Estimate edge-case variety.**
4. **Estimate noise cost.**
5. **Estimate discretion value.**
6. **Choose control.** Rule, standard, guideline, algorithm, or hybrid.
7. **Define override and audit.**

## Output Format

```markdown
## Rules vs Standards: {decision}

Decision:
Recurrence:
Noise cost:
Need for flexibility:
Recommended control:
Override:
Audit plan:
```

## Common Failure Modes

- **Rules for rare cases.** Rigid automation breaks on edge cases.
- **Standards for repeated cases.** Same facts get different treatment.
- **Algorithm worship.** Noiseless does not always mean fair or acceptable.
- **No override log.** Exceptions happen but never improve the system.

## References

- Daniel Kahneman, Olivier Sibony, and Cass Sunstein, *Noise* (2021), chapter 28.
