# Annie Duke: Wanna Bet? Belief Vet

## When to Use

Trigger before action, when a belief is becoming a position. Concrete cues:

- The user wants to add to a single name because the thesis feels compelling.
- A `stock-review` result is about to become a buy/hold/sell decision.
- A portfolio note has strong conviction but weak source discipline.
- The user is comparing two claims that could both explain the same data.
- An SMB acquisition assumption is driving valuation or outreach.
- The user says "obviously," "everyone knows," or "I can't see how this fails."

Don't trigger for: generic web research or initial fundamentals gathering. Use this after enough facts exist to vet the belief.

## The Framework

### Core Thesis

Duke's "Wanna bet?" move makes beliefs behave like wagers. A claim becomes clearer when the user has to say what they would risk on it, what evidence supports it, and what evidence would make them fold. The point is not to become paralyzed; it is to stop treating belief as free.

### All Decisions Are Bets

Buying, holding, trimming, staying in cash, and doing nothing are all bets against uncertain futures. "No action" is still a wager that the opportunity cost is acceptable.

### Beliefs Need Vetting

Duke emphasizes that people often hear, believe, and only sometimes vet later. The vetting step must be deliberate: source quality, base rates, alternatives, incentives, and missing facts.

### Motivated Reasoning

The stronger the desired conclusion, the harder the vet must work. Smart people can become better at defending a bad belief. Look for clever explanations that only protect the current thesis.

### Confidence Is a Range

Replace "I know" with a calibrated range: "I am 60-70% confident this thesis is true over this horizon." Wide ranges are honest when uncertainty is high.

## How to Apply

1. **Name the belief.** Write the thesis as one falsifiable sentence.
2. **Name the bet.** State the proposed action, size, time horizon, and opportunity cost.
3. **List supporting evidence.** Separate primary data, secondary analysis, market narrative, and vibes.
4. **List rival explanations.** Give at least two alternate stories that explain the same facts.
5. **Ask the wager question.** "What would I risk if someone took the other side?"
6. **Calibrate confidence.** Use a percentage or range, not "high/medium/low" alone.
7. **Find disconfirmers.** Name 3 facts that would reduce confidence or invalidate the thesis.
8. **Decide.** Bet, wait, size down, seek more data, or fold.

## Output Format

```markdown
## Wanna Bet? Belief Vet: {belief}

Proposed bet:
Time horizon:
Opportunity cost:

Evidence for:
Evidence quality:
Rival explanations:
Missing information:

Confidence range:
What would change my mind:
Recommended action: bet / size down / wait / fold
Reason:
```

## Common Failure Modes

- **Free belief.** The user can say a thesis but not name what they would wager. Convert it to an action or park it.
- **Only confirming evidence.** The research file reads like an advocate brief. Require rival explanations.
- **Vibes masquerading as evidence.** Social sentiment, chart excitement, or news momentum may matter, but label it correctly.
- **False binary.** "Right or wrong" replaces confidence ranges. Reframe to probability and horizon.
- **Smart-person spin.** The user has reasons for everything but no kill condition. Force disconfirmers.
- **Ignoring opportunity cost.** Holding a weak position is still a bet against alternatives like VOO, cash, or a better idea.

## References

- Annie Duke, *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts* (Portfolio, 2018), chapter 2.
- Source anchors in `sure/.agents/book-to-skill-workspace/thinking-in-bets/outline/synthesis.md`.
- Sibling carved skills:
  - `duke-scenario-premortem` — use after belief vetting to map futures and size.
  - `duke-resulting-audit` — use after the bet has an outcome.
  - `duke-ulysses-trade-rules` — use when the bet needs precommitted rules.
