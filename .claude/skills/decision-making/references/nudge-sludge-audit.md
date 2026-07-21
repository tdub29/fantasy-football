# Nudge: Sludge Audit

## When to Use

Use when a user is trying to do something beneficial but the process gets in the way:

- Bank linking or CSV import is painful.
- Export/delete/cancel is harder than signup.
- Forms ask for too much.
- Users abandon setup.
- A workflow feels bureaucratic.

## Framework

Sludge is choice architecture that makes useful action harder. Some friction is justified for safety, consent, or fraud prevention; unnecessary sludge should be hunted down and removed.

## How to Apply

1. **Map the flow.** Count steps, fields, waits, decisions, and handoffs.
2. **Separate needed friction.** Security, legal consent, data safety, irreversible action.
3. **Flag sludge.** Repeated data entry, hidden requirements, asymmetric friction, unclear copy, waits, dark patterns.
4. **Score severity.** User harm, drop-off risk, frequency, and reversibility.
5. **Remove or shrink.** Delete, prefill, combine, automate, or defer.
6. **Measure.** Define completion rate/time-to-complete metric.

## Output Format

```markdown
## Sludge Audit: {flow}

Flow map:
Necessary friction:
Sludge inventory:
Severity:
Removal plan:
Metric:
```

## Common Failure Modes

- **Security excuse.** All friction is labeled safety without evidence.
- **Asymmetric friction.** Easy to start, hard to stop.
- **Internal convenience.** The organization saves work by pushing toil to users.
- **Dark pattern drift.** Retention friction gets defended as "engagement."

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 8.
