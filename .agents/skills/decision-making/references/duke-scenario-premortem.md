# Annie Duke: Scenario + Premortem

## When to Use

Trigger when the decision is important enough that one future story is not enough. Concrete cues:

- The user is deciding position size for a single-name stock.
- A portfolio action plan has multiple plausible futures.
- Cash deployment is competing with tax-loss harvesting, debt payoff, or a better opportunity.
- A thesis depends on a catalyst, regulatory event, earnings print, or macro path.
- An SMB acquisition path needs success/failure routes before outreach or LOI.
- The user wants a pre-mortem or asks how a decision could fail.

Don't trigger for: post-outcome learning. Use `duke-resulting-audit` once the outcome has happened.

## The Framework

### Core Thesis

Duke's future-work is mental time travel: make future branches visible before the decision, not after. Scenario planning fights surprise; backcasting shows how success could happen; premortems expose how failure could happen. Together they create a fuller map than either optimism or doom alone.

### Reconnaissance

Start by scouting possible futures. Refusing to guess because the future is uncertain misses the point; uncertainty is why reconnaissance exists.

### Scenario Probabilities

Use rough probabilities. A wide range is better than pretending the branch is either impossible or certain. If two people disagree sharply on probabilities, treat the disagreement as information.

### Expected Value

When outcomes can be estimated, multiply each future's payoff by its probability. Rank options by expected value, not by headline upside.

### Backcasting

Imagine the positive future has already happened. Work backward to identify the steps, dependencies, and low-probability events required to get there.

### Premortem

Imagine the decision failed. Work backward to identify what killed it: thesis flaw, timing, liquidity, tax, behavior, concentration, or external shock.

## How to Apply

1. **Define the decision.** State the action, amount, and time horizon.
2. **List futures.** Include base, bull, bear, and weird-but-plausible branches.
3. **Assign probabilities.** Use point estimates or ranges; make them sum to 100%.
4. **Estimate payoffs.** Use dollars, percentage return, tax impact, or qualitative utility.
5. **Compute expected value if possible.** If not, rank branches by severity and likelihood.
6. **Backcast success.** Write the headline: "This worked because..." then list the path.
7. **Premortem failure.** Write the headline: "This failed because..." then list the path.
8. **Set contingencies.** Name triggers for add, hold, trim, exit, wait, or revisit.
9. **Recommend size.** Tie size to EV, uncertainty, concentration, and downside tolerance.

## Output Format

```markdown
## Scenario Premortem: {decision}

Decision:
Time horizon:
Current exposure / concentration:

| Scenario | Probability | Payoff / impact | Evidence | Response |
|----------|-------------|-----------------|----------|----------|

Expected value / ranked branch:

Backcast from success:
Premortem from failure:
Contingency triggers:
Recommended size:
Why this size:
```

## Common Failure Modes

- **One-story thesis.** Only the bull case gets written. Force bear and sideways futures.
- **Probability refusal.** "We can't know" becomes an excuse not to estimate. Use ranges.
- **Headline-upside bias.** The biggest payoff gets priority even when its probability is tiny.
- **Optimism-only backcast.** Success path exists, failure path doesn't. Run the premortem.
- **Doom-only premortem.** Failure analysis becomes paralysis. Pair every risk with a contingency.
- **Unmemorialized branches.** After the result, only the happened branch feels inevitable. Save the scenario table for later resulting audits.
- **Size disconnected from uncertainty.** A thesis with wide ranges should not get maximum capital.

## References

- Annie Duke, *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts* (Portfolio, 2018), chapter 6.
- Source anchors in `sure/.agents/book-to-skill-workspace/thinking-in-bets/outline/synthesis.md`.
- Sibling carved skills:
  - `duke-wanna-bet-belief-vet` — use first when the belief itself needs vetting.
  - `duke-ulysses-trade-rules` — use next to precommit execution rules.
  - `duke-resulting-audit` — use later to learn from the saved branches.
