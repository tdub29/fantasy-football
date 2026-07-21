# Decisive: Outside View

## When to Use

Trigger when the inside story feels persuasive but ungrounded:

- The user has a plan and needs to know what usually happens in similar cases.
- An SMB, ticker, feature, or vendor looks exceptional.
- Expert predictions are being used without base rates.
- The user needs both broad statistics and close-up texture.
- A truth condition from `decisive-what-would-have-to-be-true` needs evidence.

Don't trigger for: generic data analysis with no decision. This is a decision evidence skill.

## The Framework

### Core Thesis

The Heaths distinguish the **inside view** from the **outside view**. The inside view is the vivid story of this case. The outside view asks what happened in similar cases. Good decisions zoom out for base rates, then zoom in for texture.

### Base Rates

Start with the reference class: similar companies, deals, users, portfolios, jobs, or products. The base rate is not destiny, but it is the default prior.

### Expert Rule

Ask experts about what they have seen in the past and present, not what they predict about the future.

### Zoom In

Base rates are not enough. Get close-up evidence: customer/user examples, owner interviews, forum threads, transaction samples, demos, or operational observations.

### Reference-Class Fit

The audit is only as good as the comparison group. Too broad makes it bland; too narrow makes it self-serving.

## How to Apply

1. **Name the inside story.** Summarize why this case feels attractive or scary.
2. **Define reference classes.** List broad, medium, and narrow comparison sets.
3. **Collect base rates.** Success/failure rates, returns, adoption, multiples, churn, timelines, or costs.
4. **Ask expert-past questions.** What have you seen? How often? What usually breaks?
5. **Zoom in.** Gather close-up evidence from real examples, users, operators, or lots.
6. **Compare story vs base rate.** Decide whether this case deserves an adjustment.
7. **Update the decision.** Raise, lower, or leave confidence unchanged.

## Output Format

```markdown
## Outside View: {decision}

Inside story:

| Reference class | Base rate | Fit quality | Source |
|-----------------|-----------|-------------|--------|

Expert-past questions:
Zoom-in evidence:
Base-rate adjustment:
Updated confidence:
Decision implication:
```

## Common Failure Modes

- **Reference-class shopping.** Choosing the comparison group that flatters the plan.
- **Anecdote-only zoom-in.** Close-up evidence replaces base rates instead of complementing them.
- **Expert prediction trap.** Asking "will this work?" instead of "what usually happens?"
- **Too-broad base rate.** The reference class is so general it cannot guide action.
- **Special-case pleading.** The user explains why base rates do not apply without evidence.

## References

- Chip Heath and Dan Heath, *Decisive: How to Make Better Choices in Life and Work* (2013), chapter 6.
- Source anchors in `sure/.agents/book-to-skill-workspace/decisive/outline/synthesis.md`.
- Sibling carved skills:
  - `decisive-what-would-have-to-be-true` — identifies which assumptions need outside evidence.
  - `decisive-ooch` — tests uncertain assumptions directly.
