# Annie Duke: Resulting Audit

## When to use

Trigger when the result is already visible and the user is trying to learn from it. Concrete cues:

- A position went up or down and the user asks whether the original decision was right.
- A trade produced a bad result even though the process may have been sound.
- A trade produced a good result and the user may be over-crediting skill.
- A thesis review says "I should have known" after the information is no longer uncertain.
- A portfolio action in `financial-insight-loop` needs a post-outcome process review.
- The user wants to change future behavior after a single outcome or small sample.

Don't trigger for: deciding whether to buy a ticker from scratch. Use `stock-review` for research, then use Duke skills to evaluate decision process and sizing.

## The Framework

### Core Thesis

Duke calls the common error **resulting**: judging decision quality from outcome quality. In poker-like environments, hidden information and luck mean good decisions can lose and bad decisions can win. The goal is not to explain away every loss as luck; it is to keep the learning loop from overfitting to a noisy outcome.

### Outcome Quality vs Decision Quality

Separate the two axes:

| | Good outcome | Bad outcome |
|---|---|---|
| **Good decision** | Process worked and got paid | Unlucky or thesis time horizon incomplete |
| **Bad decision** | Lucky win; dangerous reinforcement | Clean mistake; fix process |

The most important cell is often **bad decision / good outcome**, because it rewards behavior that should not be repeated.

### Luck vs Skill Buckets

Field the outcome like an outfielder: decide what belongs in the skill bucket, what belongs in the luck bucket, and what remains mixed. Force at least one item into each bucket before concluding.

### Hindsight Bias

"I should have known" is often present-day knowledge smuggled backward. Audit only what was knowable at the decision time, what was reasonably inferable, and what was genuinely hidden.

### Small-Sample Trap

One earnings print, one chart move, or one tax lot result is not enough to rewrite the whole strategy. Ask whether the new lesson survives across a larger reference class.

## How to Apply

1. **State the original decision.** Name the date, action, size, thesis, and alternatives available at the time.
2. **Freeze the information set.** List only what was known or reasonably knowable before the outcome.
3. **Score outcome quality.** Good, mixed, or bad; include dollars, percentage, and time horizon.
4. **Score decision quality.** Good, mixed, or bad based on process, not result.
5. **Bucket the drivers.** Make separate lists for skill/process, luck/noise, and hidden information.
6. **Find the false reinforcement.** Ask what behavior the outcome is tempting you to repeat or abandon incorrectly.
7. **Extract one process lesson.** Write a next-time rule that would have improved the decision before the result.
8. **Decide whether to update.** Update the rule only if the evidence is broader than a one-off result or the process flaw is obvious.

## Output Format

```markdown
## Resulting Audit: {decision}

Original decision:
Known at the time:
Outcome quality: Good / Mixed / Bad
Decision quality: Good / Mixed / Bad

Skill/process bucket:
Luck/noise bucket:
Hidden-information bucket:

False lesson the outcome is tempting:
True lesson worth keeping:
Next-time rule:
Update strength: none / light / meaningful / strategy-changing
```

## Common Failure Modes

- **P&L as verdict.** Treating green as smart and red as dumb. Re-score the decision from the information available at the time.
- **Lucky win reinforcement.** A bad process prints money and becomes a habit. Call this out explicitly.
- **Unlucky loss overreaction.** A sound thesis gets hit by variance and the user abandons a good rule.
- **Hindsight certainty.** "Obvious" only after the event. Strip out facts learned after the decision.
- **Single-hand strategy change.** One outcome rewrites allocation policy. Require a larger reference class unless the process error was severe.
- **Self-serving attribution.** Wins become skill, losses become luck. Force both favorable and unfavorable evidence into the audit.

## References

- Annie Duke, *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts* (Portfolio, 2018), chapters 1 and 3.
- Source anchors in `sure/.agents/book-to-skill-workspace/thinking-in-bets/outline/synthesis.md`.
- Sibling carved skills:
  - `duke-wanna-bet-belief-vet` — use before acting on a thesis.
  - `duke-scenario-premortem` — use before sizing a meaningful bet.
  - `duke-tilt-ticker-guard` — use when emotion is driving the next decision.
