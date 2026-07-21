# Kahneman — Prospect Theory

## The framework

> "Prospect Theory: An Analysis of Decision Under Risk." (Ch 26)

The model that replaced expected-utility theory in behavioral economics. Three core insights, all violations of classical rationality.

### The three pillars

**1. Reference dependence**
People evaluate outcomes as CHANGES from a reference point (usually the status quo), not absolute states of wealth. The same final wealth feels good if it represents a gain, bad if it represents a loss.

**2. Diminishing sensitivity**
The difference between $0 and $100 feels larger than the difference between $1,000 and $1,100 — even though both are $100. The value function is concave in gains and convex in losses.

**3. Loss aversion**
> "Losses loom larger than gains." Ratio approximately 2:1.

Losing $100 hurts about twice as much as gaining $100 pleases. This is the deepest of the three.

### The fourfold pattern (Ch 29)

Combining reference-dependence + diminishing sensitivity + loss aversion produces a 2x2 grid of risk attitudes:

| | High probability | Low probability |
|---|---|---|
| **Gains** | RISK-AVERSE (accept settlement to lock in gain) | RISK-SEEKING (buy lottery tickets) |
| **Losses** | RISK-SEEKING (gamble to avoid sure loss) | RISK-AVERSE (buy insurance) |

The diagonal: people accept BAD bets when desperate (losses, high probability — "I'll gamble to avoid losing the case") and accept BAD bets when hopeful (gains, low probability — "I'll buy the lottery ticket"). The other diagonal: people refuse GOOD bets when comfortable (gains, high probability — "I'll take the settlement") and refuse GOOD bets when threatened (losses, low probability — "I'll buy expensive insurance").

### The endowment effect (Ch 27)

Loss aversion's most measurable consequence. People demand more to sell something they own than they'd pay to acquire it.

- Mugs given to half the subjects. "Selling" subjects asked: what's your minimum price? "Buying" subjects asked: what's your maximum bid?
- Median seller: $7.12. Median buyer: $2.87. Ratio ~2.5:1.

The mug's value didn't change; what changed is whose reference point it's in. For sellers, losing the mug is a loss; for buyers, getting it is a gain. Loss aversion does the rest.

### Implications: broad framing / risk policies

Loss aversion is most painful when applied to single decisions in isolation. Bundling decisions into a portfolio reduces felt loss-aversion.

- Single bet: lose $100 or win $200, 50/50. Most people refuse (loss looms larger).
- 100 such bets, evaluated as a portfolio: clear win on expectation. People accept.

The risk policy: pre-commit to evaluating decisions in groups when appropriate, not one-by-one.

## How to apply

When predicting how someone will respond to a risky choice:

1. **Identify the reference point.** Status quo? An expected outcome? The frame of the offer? The reference point IS the choice architecture.

2. **Determine: is this in gain territory or loss territory relative to that reference?** Different sides produce different risk attitudes.

3. **Apply the fourfold pattern.** High-probability gain → risk-averse. Low-probability loss → risk-averse. High-probability loss → risk-seeking. Low-probability gain → risk-seeking.

4. **Adjust for loss aversion magnitude.** Losses ~2x as painful as equivalent gains.

5. **For yourself: ask if you're being too risk-averse on a small loss or too risk-seeking on a large unlikely loss.** Most asymmetric responses to risk trace to the fourfold pattern.

## Common failure modes

- **Treating decisions as if EV-rational.** Most decisions aren't. The asymmetries above are universal.
- **Ignoring the reference point.** "Should they take the deal?" depends entirely on what they're comparing to. Different frames produce different answers.
- **Single-decision focus where portfolio framing is appropriate.** A trader who loss-averts on each trade ends up too conservative across a year of trades.
- **Using loss aversion to manipulate.** "Free trial" → endowment effect → loss aversion when subscription canceled. Common pattern; ethically variable.

## Output Format

```markdown
## Prospect Theory Audit

Decision:
Reference point:
Gain/loss frame:
Current risk posture:
Reframe:
Recommendation:
```

## References

- Daniel Kahneman, *Thinking, Fast and Slow* (FSG, 2011), Chapter 26 lines 10107–10512; Chapter 27 (Endowment Effect) lines 10513–10924; Chapter 29 (Fourfold Pattern) lines 11295–11743; Chapter 31 (Risk Policies) lines 12214–12503.
- Related: references/kahneman-framing-effects.md (how the reference point is chosen), references/kahneman-system-1-system-2.md (parent), references/kahneman-focusing-illusion.md (related attention-based distortion of value).
