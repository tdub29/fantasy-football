# Nudge: Automatic Enrollment Defaults

## When to Use

Use when the desired user action is beneficial but easy to postpone:

- Retirement or savings enrollment.
- Emergency fund automation.
- HSA/taxable recurring transfer setup.
- Re-enrolling users who never finished setup.

## Framework

Automatic enrollment changes the default from "not participating" to "participating unless you opt out." It can dramatically increase take-up, but bad defaults can also stick.

## How to Apply

1. **Name the enrollment behavior.**
2. **Define welfare goal.** Participation, contribution rate, account choice, diversification.
3. **Choose default rate/account.**
4. **Design opt-out.** Easy, clear, and non-punitive.
5. **Check bad-default stickiness.**
6. **Plan re-enrollment sweep.**
7. **Set review cadence.**

## Output Format

```markdown
## Automatic Enrollment Defaults: {flow}

Behavior:
Default:
Why:
Opt-out path:
Bad-default risk:
Re-enrollment plan:
Review cadence:
```

## Common Failure Modes

- **Low anchor default.** Participation improves but savings rate stays too low.
- **Hard opt-out.** Default becomes coercive.
- **No re-enrollment.** Old nonparticipants remain stuck.
- **Default fund mismatch.** Users enter but land in a poor investment/account.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 9.
