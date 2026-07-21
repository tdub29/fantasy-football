# Nudge: Error-Forgiving UX

## When to Use

Use when a flow is vulnerable to predictable mistakes:

- CSV import duplicates entries.
- A transfer is categorized as spending.
- User forgets to save or confirm.
- Destructive action lacks recovery.
- Interface signals are incompatible with expected response.

## Framework

Good choice architecture expects error. It uses forcing functions, feedback, compatibility, warnings, and recovery to prevent predictable mistakes from becoming harm.

## How to Apply

1. **Map the action.**
2. **List likely errors.** Wrong account, duplicate, postcompletion, misread signal, omission, irreversible click.
3. **Add prevention.** Constraints, defaults, previews, validation, or forcing functions.
4. **Add feedback.** Immediate, clear, and specific.
5. **Add recovery.** Undo, restore, re-run, or support path.
6. **Retest with edge cases.**

## Output Format

```markdown
## Error-Forgiving UX: {flow}

Likely errors:
Prevention:
Feedback:
Recovery:
Edge cases:
Copy changes:
```

## Common Failure Modes

- **Blaming the user.** Predictable errors are design inputs.
- **Feedback too late.** The user learns after harm is done.
- **Warning spam.** Too many warnings make all warnings invisible.
- **No recovery.** Prevention fails eventually; recovery must exist.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), chapter 5.
