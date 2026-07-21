# Decisive: Tripwire

## When to Use

Trigger when the user needs the future to interrupt them:

- An SMB search, product experiment, or side-income project needs stage gates.
- A budget or lifestyle commitment could drift without review.
- A vendor or workflow should be reassessed after a threshold.
- A decision has a date, metric, or pattern that should force attention.
- The user wants to avoid Kodak-style slow drift or endless "we'll see."

Don't trigger for: trade kill switches. Use `duke-ulysses-trade-rules` for ticker-specific add/trim/exit rules.

## The Framework

### Core Thesis

A tripwire is a pre-set signal that snaps a decision out of autopilot. The Heaths use tripwires to make future review automatic instead of dependent on memory, mood, or crisis.

### Deadline Tripwire

A date forces a decision: review by Friday, kill after 30 days, renew after one quarter.

### Metric Tripwire

A number forces a decision: loss limit, cash floor, reply rate, churn rate, deal count, hours spent, or revenue target.

### Partition Tripwire

Divide a resource into bounded chunks: budget envelopes, experiment capital, outreach batches, or staged commitments.

### Pattern Tripwire

Unexpected success, repeated friction, or recurring exceptions can also trigger review.

## How to Apply

1. **Name the drifting decision.** What might stay on autopilot?
2. **Choose trigger type.** Deadline, metric, partition, pattern, or external event.
3. **Set the threshold.** Make it observable and unambiguous.
4. **Define the action.** What must happen when the tripwire fires?
5. **Assign owner.** Who notices and acts?
6. **Set escalation.** What if the owner ignores the trigger?
7. **Place it somewhere real.** Calendar, task file, alert, spreadsheet, code, or report.
8. **Review for false alarms.** Make it sensitive enough to matter, not so noisy it gets ignored.

## Output Format

```markdown
## Tripwire: {decision}

Autopilot risk:
Trigger type:
Threshold:
Owner:
Where it lives:

When fired, do this:
Escalation:
False-alarm check:
Review date:
```

## Common Failure Modes

- **Vague trigger.** "Revisit later" is not a tripwire. Use a date, metric, or event.
- **No action.** A threshold fires but nothing is specified.
- **No owner.** Everyone assumes someone else noticed.
- **Too noisy.** A trigger fires so often it gets muted.
- **Too late.** The tripwire comes after the damage is already done.
- **Wrong domain.** Trade execution belongs in Ulysses rules; this skill is for broader decision drift.

## References

- Chip Heath and Dan Heath, *Decisive: How to Make Better Choices in Life and Work* (2013), chapter 11.
- Source anchors in `sure/.agents/book-to-skill-workspace/decisive/outline/synthesis.md`.
- Sibling carved skills:
  - `decisive-ooch` — use tripwires to govern small experiments.
  - `duke-ulysses-trade-rules` — use for ticker-specific trade guardrails.
