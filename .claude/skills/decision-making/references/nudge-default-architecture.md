# Nudge: Default Architecture

## When to Use

Use whenever a product or workflow must choose what happens if the user does nothing:

- Auto-categorization rules.
- Budget templates.
- Savings/retirement contribution setup.
- Import matching behavior.
- Portfolio or reminder defaults.

## Framework

There is no neutral choice architecture. Defaults are often treated as recommendations and many users stick with them through inertia. Good defaults should approximate what thoughtful, informed users would choose, while remaining easy to override.

## How to Apply

1. **Name the default decision.**
2. **Identify user welfare.** What would a thoughtful, informed user likely want?
3. **Choose default type.** Status quo, back-to-zero, personalized, active choice, or no default.
4. **Forecast stickiness.** Low, medium, high.
5. **Design override.** Make opting out easy and visible.
6. **Check harm.** Who is worse off if they accept the default?
7. **Set review trigger.** When should the default be revisited?

## Output Format

```markdown
## Default Architecture: {flow}

Default decision:
Recommended default:
Why:
Stickiness forecast:
Override path:
User harm risk:
Review trigger:
```

## Common Failure Modes

- **Random default.** Default chosen by implementation convenience.
- **Back-to-zero damage.** Resetting something users likely wanted to keep.
- **Status quo trap.** Preserving stale choices that should expire.
- **Hidden override.** A default becomes coercive through friction.
- **One-size-fits-all.** Personalized defaults may be safer when user circumstances vary.

## References

- Richard Thaler and Cass Sunstein, *Nudge: The Final Edition* (2021), introduction, chapter 1, and chapter 5.
