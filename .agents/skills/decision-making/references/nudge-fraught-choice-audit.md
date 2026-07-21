# Nudge: Fraught Choice Audit

## When to Use

Use before designing a financial choice flow:

- Users choose rarely, like insurance, mortgages, imports, or retirement setup.
- Feedback is slow or invisible.
- The choice is complex or unfamiliar.
- Benefits arrive now and costs arrive later, or vice versa.

## Framework

Nudges are most useful where Humans struggle: hard choices, rare choices, weak feedback, unfamiliar domains, and timing mismatches.

## How to Apply

1. **Name the choice.**
2. **Score difficulty.** Easy / moderate / hard.
3. **Score frequency.** Frequent / occasional / rare.
4. **Score feedback.** Immediate / delayed / absent.
5. **Score familiarity.** Familiar / partially familiar / unfamiliar.
6. **Score timing mismatch.** Benefits now-costs later, costs now-benefits later, or neutral.
7. **Choose architecture.** Default, active choice, feedback, disclosure, error prevention, or sludge removal.

## Output Format

```markdown
## Fraught Choice Audit: {choice}

Difficulty:
Frequency:
Feedback:
Familiarity:
Timing mismatch:
Nudge need: low / medium / high
Recommended architecture:
```

## Common Failure Modes

- **Nudging easy choices.** Users do not need help choosing ice cream.
- **Ignoring feedback gaps.** Users cannot learn if outcomes arrive months later.
- **Assuming education is enough.** Hard/rare choices need architecture, not just copy.
- **Overbuilding.** A light reminder may be enough for medium-risk choices.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 4.
