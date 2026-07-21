# Annie Duke: Ulysses Trade Rules

## When to Use

Trigger before the emotionally hard moment arrives. Concrete cues:

- A position is being opened or resized and needs exit/add rules.
- A thesis has identifiable catalysts or kill conditions.
- The user wants to avoid panic selling or revenge buying.
- The user is setting a concentration cap, trim ladder, or tax-lot plan.
- A scenario premortem produced contingencies that need enforcement.
- A volatile name is likely to create temptation after news.

Don't trigger for: deciding whether a stock is attractive. Use `stock-review`, `duke-wanna-bet-belief-vet`, and `duke-scenario-premortem` first.

## The Framework

### Core Thesis

Duke borrows from Ulysses: when you know a future self may be weaker, bind that future self in advance. In investing, the point is not rigidity for its own sake; it is to make the calm self write rules the volatile self must respect.

### Buy Rules

Define what must be true before initiating or adding: price, valuation, catalyst, thesis evidence, concentration room, and cash source.

### Hold Rules

Define what noise you will ignore. Holding is a decision, so it needs its own conditions.

### Sell / Trim Rules

Precommit thesis-break exits, valuation trims, risk trims, tax-loss harvest actions, and time-based reviews.

### Press Rules

If the position works, decide in advance when adding is allowed and when winner's tilt is banned.

### Breach Handling

Write what happens when the user wants to violate the rule: wait period, second review, re-run scenario premortem, or ask a trusted reviewer.

## How to Apply

1. **Summarize the bet.** Name the thesis, size, and time horizon.
2. **Import scenarios.** Use the scenario/premortem table if one exists.
3. **Write buy/add triggers.** Include required evidence and maximum size.
4. **Write hold triggers.** Name volatility or news that should not change the plan.
5. **Write trim/sell triggers.** Separate thesis-break, risk, tax, and valuation triggers.
6. **Write press conditions.** Define when adding to a winner is allowed.
7. **Write forbidden moves.** Name actions not allowed without a cooling-off review.
8. **Set review cadence.** Date-based and event-based.
9. **Set breach protocol.** What must happen before overriding the sheet.

## Output Format

```markdown
## Ulysses Trade Rules: {ticker / decision}

Thesis:
Initial size:
Maximum size:
Time horizon:

Buy/add rules:
Hold rules:
Trim/sell rules:
Press rules:
Forbidden moves:

Review cadence:
Breach protocol:
Rule owner / reviewer:
```

## Common Failure Modes

- **Vague kill switch.** "Sell if thesis breaks" is too soft. Name observable facts.
- **No hold rule.** Without hold rules, every red day becomes a decision.
- **Only downside rules.** Big winners also create bad behavior; include press rules.
- **Cooling-off theater.** A five-minute pause may not beat a panic state. Match waiting period to volatility and stakes.
- **Rule sheet ignored after catalyst.** Make event reviews part of the contract, not exceptions.
- **No max size.** A good idea can still become portfolio-dangerous.
- **Tax blind spot.** Sell rules should consider lots, holding period, wash-sale window, and substitution where relevant.

## References

- Annie Duke, *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts* (Portfolio, 2018), chapter 6.
- Source anchors in `sure/.agents/book-to-skill-workspace/thinking-in-bets/outline/synthesis.md`.
- Sibling carved skills:
  - `duke-scenario-premortem` — generates the futures and contingencies these rules enforce.
  - `duke-tilt-ticker-guard` — use when the future self is already emotionally compromised.
  - `duke-resulting-audit` — use after rule execution to learn without resulting.
