# Kahneman — Representativeness and Base-Rate Neglect

## The framework

> "Tom W's specialty... the prediction by representativeness." (Ch 14)

When you read a description and ask "which category does this person belong to?", System 1 answers by similarity-to-stereotype. It ignores how common each category actually is.

### The Tom W example

You read: "Tom W is intelligent, but lacks creativity. Has a need for order. Strong writing skills but mechanical. Concerned with being competent."

Most people rank him most likely to be in: computer science, engineering, library science.

Actual base rates: business administration is the largest grad school field; computer science is small; library science is tiny. The stereotype-fit dominates; the population sizes don't enter the judgment.

### Three named sub-rules

**1. Base-rate neglect**
> When the description is vivid, System 1 attends to fit-with-stereotype, not to how common the category is.

The Bayesian correction: P(category | evidence) ∝ P(evidence | category) × P(category). Representativeness gives you the first factor and drops the second.

**2. Law of small numbers** (Ch 10)
> We over-trust small samples. A small sample's pattern is treated as the population's pattern.

A clinic with 3 surgeries and a 100% success rate feels safer than one with 100 surgeries and a 95% success rate. (The first has wider error bars.) Small samples are MORE likely to produce extreme outcomes in either direction — which we mistake for "the clinic is genuinely 100%."

**3. Insensitivity to predictability**
> Even when the description provides only weak evidence, intuitive predictions are confident.

If the description gives you 30% predictive information about GPA, your estimate should be 30% of the distance from average toward your impression. Most people give 90% — over-trusting weak evidence.

## How to apply

When predicting category, profession, performance, or behavior from description:

1. **Start with base rates.** Before reading the description, what's the prior probability of each category?
2. **Then update from evidence.** How much does this specific description shift the base rates? Usually less than it feels.
3. **For weak evidence (low correlation): stay close to the base rate.** See references/kahneman-taming-intuitive-predictions.md for the explicit 4-step procedure.
4. **For small samples: don't generalize.** A 100% success rate from 3 data points means almost nothing.
5. **For "the description fits perfectly!": notice that fit is what System 1 generates. Coherence isn't predictive accuracy.

## Common failure modes

- **Confusing similarity with probability.** "Steve is so much like a librarian" is information about resemblance, not about Steve.
- **Ignoring base rates when emotionally engaged.** When the description is vivid (sympathetic, scary, surprising), base rates evaporate from consideration.
- **Treating large samples like small ones.** If 100 of 100 patients did well, you should trust the result. If 10 of 10, you have weak evidence.
- **Sample size insensitivity in news.** "Crime up 50% in town X!" — town X has 200 residents; the absolute numbers are tiny; the headline misleads.

## Output Format

```markdown
## Base-Rate Check

Claim:
Archetype:
Base rate needed:
Case-specific evidence:
Adjusted judgment:
```

## References

- Daniel Kahneman, *Thinking, Fast and Slow* (FSG, 2011), Chapters 14 (Tom W, lines 5264–5625) and 10 (Law of Small Numbers, lines 3832–4240) and 18 (lines 6767–7169).
- Related: references/kahneman-system-1-system-2.md (parent), references/kahneman-substitution.md (representativeness is a substitution), references/kahneman-conjunction-fallacy.md (the Linda problem — related representativeness failure), references/kahneman-taming-intuitive-predictions.md (the 4-step debiasing procedure), references/kahneman-outside-view.md (the structural antidote).
