# Annie Duke: Tilt + Ticker Guard

## When to Use

Trigger in the hot state, not during calm planning. Concrete cues:

- The user wants to act immediately after a big red or green move.
- A prior plan exists but the user wants to override it.
- The user is checking the ticker repeatedly and narrowing time horizon.
- A missed rally, stop-out, or drawdown is creating urgency.
- A winner is causing overconfidence and a desire to press size.
- The user asks for a "talk me off the ledge" check.

Don't trigger for: building the plan from scratch. Use `duke-scenario-premortem` and `duke-ulysses-trade-rules` when calm.

## The Framework

### Core Thesis

Duke uses **tilt** for the emotional state where a recent result compromises the next decision. The ticker creates a zoom lens that makes short-term movement feel more important than the original horizon. The guard's job is to restore time, process, and precommitment before any trade happens.

### Tilt

Tilt can follow losses or wins. Loss tilt wants revenge, rescue, or relief. Winner's tilt wants to press because the market just validated the user.

### Ticker Zoom

Watching the ticker compresses horizon. A five-year thesis starts feeling like a five-minute vote. Re-expand the frame before deciding.

### 10-10-10 Reframe

Ask how the decision will feel in 10 minutes, 10 months, and 10 years. The exact horizons can adapt, but the purpose is to collide present emotion with future consequences.

### Rule-Sheet Check

If a Ulysses rule exists, the default is to obey it. If no rule exists, the default is to wait long enough to write one.

## How to Apply

1. **Pause execution.** No trade until the guard is complete.
2. **Name the trigger.** Loss, missed gain, news shock, social proof, boredom, or winner's tilt.
3. **Score tilt.** 0-10 for urgency, anger/fear/euphoria, and physical activation.
4. **Re-expand time.** Answer 10 minutes / 10 months / 10 years, or intraday / thesis horizon / life horizon.
5. **Check the rule sheet.** If `duke-ulysses-trade-rules` exists, quote the relevant rule.
6. **Check scenario table.** If this branch was anticipated, execute the branch response.
7. **Choose permitted action.** Wait, journal, set alert, run stock review, execute precommitted rule, or schedule review.
8. **Only allow immediate trade if precommitted.** Hot-state new trades require exceptional evidence and a written reason.

## Output Format

```markdown
## Tilt / Ticker Guard: {ticker / decision}

Immediate urge:
Trigger:
Tilt score:
Ticker-zoom symptom:

10-minute view:
10-month view:
10-year / life view:

Relevant Ulysses rule:
Relevant scenario branch:
Permitted next move:
Cooling-off period:
What to write down before acting:
```

## Common Failure Modes

- **Winner's tilt ignored.** The user guards only against panic, not euphoria. Treat both as tilt.
- **Ticker as thesis.** Price movement replaces fundamental update. Ask whether the thesis actually changed.
- **Cooling off without writing.** Time passes but the same urge returns. Require a journal note or rule reference.
- **Social proof acceleration.** Reddit/X/analyst chatter adds urgency. Label it as trigger, not evidence.
- **Plan override disguised as flexibility.** If the rule sheet is being changed in a hot state, require delay.
- **No permitted action.** "Do nothing" can feel impossible. Give a non-trade action like setting an alert or scheduling review.

## References

- Annie Duke, *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts* (Portfolio, 2018), chapter 6.
- Source anchors in `sure/.agents/book-to-skill-workspace/thinking-in-bets/outline/synthesis.md`.
- Sibling carved skills:
  - `duke-ulysses-trade-rules` — calm-state precommitments.
  - `duke-scenario-premortem` — scenario table to check before acting.
  - `duke-resulting-audit` — later review without overfitting to the outcome.
