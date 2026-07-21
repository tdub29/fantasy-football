# Decisive: Ooch

## When to Use

Trigger when a small test can beat prediction:

- The user is considering a big commitment but can try a smaller version.
- SMB acquisition interest can be tested through calls, shadowing, LOI terms, or customer diligence.
- A Sure feature can be prototyped or offered manually before building.
- A stock idea can start as a small tracking/starter position, if appropriate.
- A vendor, tool, or contractor can be sampled before full commitment.

Don't trigger for: irreversible decisions with no testable slice. Use `decisive-outside-view` and `duke-scenario-premortem`.

## The Framework

### Core Thesis

The Heaths use **ooch** to mean running a small experiment before a leap. When prediction is unreliable, test the assumption in the real world.

### Ooch Before You Leap

Look for the smallest action that produces real information. The test should expose the user to the relevant reality, not simulate comfort.

### Discovery Over Prediction

If something can be tested cheaply, do not over-rely on forecasting.

### Commitment Caveat

Ooching is not always wise. Some decisions require commitment to work; a half-measure may produce misleading evidence.

### Work Sample Logic

A good ooch looks like the work itself: trial project, customer call, sample week, small campaign, prototype, or limited capital deployment.

## How to Apply

1. **Name the leap.** What big commitment is being considered?
2. **Name the riskiest assumption.** What must be true for the leap to work?
3. **Design the smallest real test.** Make it close to the actual work or market.
4. **Cap downside.** Define max dollars, time, reputation risk, and complexity.
5. **Set success criteria.** Decide in advance what would count as pass, fail, or inconclusive.
6. **Set the next leap.** If the ooch passes, what larger action follows?
7. **Check commitment risk.** Ask whether a partial test would poison the real decision.
8. **Run or schedule.** Convert the ooch into an action with owner and date.

## Output Format

```markdown
## Ooch Plan: {decision}

Big leap:
Riskiest assumption:
Smallest real test:
Downside cap:
Success criteria:
Failure criteria:
Inconclusive criteria:
Next leap if passed:
Commitment caveat:
Owner/date:
```

## Common Failure Modes

- **Fake test.** The ooch measures opinions, not behavior.
- **Too safe to learn.** The test avoids the part of reality that matters.
- **Uncapped experiment.** A "small" test quietly becomes a large commitment.
- **No pass/fail criteria.** The user interprets results after the fact.
- **Ooching when commitment matters.** Some opportunities require full effort to reveal their value.
- **Prediction addiction.** The user keeps researching when a cheap test is available.

## References

- Chip Heath and Dan Heath, *Decisive: How to Make Better Choices in Life and Work* (2013), chapter 7.
- Source anchors in `sure/.agents/book-to-skill-workspace/decisive/outline/synthesis.md`.
- Sibling carved skills:
  - `decisive-outside-view` — use when base rates are available before an ooch.
  - `decisive-what-would-have-to-be-true` — identifies which assumption the ooch should test.
