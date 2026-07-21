# Kahneman — Taming Intuitive Predictions

## The framework

> "Correcting your intuitive predictions is a task for System 2." (Ch 18, lines 6957)

Kahneman's explicit 4-step procedure for converting an intuitive prediction into a calibrated one. The procedure bakes in base-rate anchoring AND regression-to-the-mean automatically.

### The 4 steps (verbatim, line 6957)

1. **Start with an estimate of average GPA** [or whatever the outcome is — the base rate / mean of the population].

2. **Determine the GPA that matches your impression of the evidence.** What does your gut say given what you've read/heard?

3. **Estimate the correlation between your evidence and GPA.** How much does the evidence ACTUALLY predict the outcome? Be honest. Letters of recommendation predict graduate school performance at correlation ~0.25. Interviews predict job performance at ~0.30. Most evidence is much weaker than it feels.

4. **If the correlation is .30, move 30% of the distance from the average toward your impression.**

### Worked example

Predicting Julie's GPA from "she could read fluently at age 4":
- Step 1: Average GPA is 3.0.
- Step 2: Your impression says reading at age 4 → high IQ → high GPA, maybe 3.7.
- Step 3: Honestly, how much does early reading predict college GPA? Maybe 0.20.
- Step 4: Move 20% of the way from 3.0 to 3.7. Prediction: 3.14.

System 1's answer was 3.7. The calibrated prediction is 3.14. The gut prediction wildly overshoots.

### Why this works

It forces THREE things System 1 won't do on its own:
- Anchor on the base rate.
- Acknowledge that evidence is correlated with outcome, not deterministic.
- Apply the correlation as a regression factor — closer to mean when evidence is weaker.

### When to skip step 4

If the correlation is genuinely 1.0 (perfect prediction), keep your impression. If the correlation is 0.0 (no signal), stay at the mean. Most real-world correlations are 0.1–0.4 — closer to noise than to signal.

## How to apply

When making an intuitive prediction:

1. **Write the base rate.** What's the average outcome in the population? Look it up if needed.

2. **Write your gut impression.** Don't censor it.

3. **Estimate the correlation (honestly).** Look up known correlations if available. If unknown, use rough buckets: strong evidence ≈ 0.5+, moderate ≈ 0.3, weak ≈ 0.1, no signal ≈ 0.

4. **Compute: base_rate + correlation × (impression − base_rate).** Use that number.

5. **For yes/no predictions: same logic.** If base rate is 30% and your impression is "definitely yes" (95%) and correlation is 0.3, predicted probability ≈ 30% + 0.3 × (95% − 30%) = 49%. Big drop from your gut "definitely."

## Common failure modes

- **Overestimating correlation.** People consistently rate evidence as more predictive than it is. Look up actual correlations when possible.
- **Skipping step 1.** Going straight to impression. The base rate is the load-bearing anchor.
- **Using the procedure once and forgetting.** Apply it again next time. Calibration is a discipline.
- **Refusing because "this case is special."** Almost every individual case feels special. The base rate is built from cases that all felt special at the time.

## Output Format

```markdown
## Tamed Prediction

Forecast target:
Intuitive prediction:
Base rate:
Evidence quality:
Regression adjustment:
Final prediction:
```

## References

- Daniel Kahneman, *Thinking, Fast and Slow* (FSG, 2011), Chapter 18 lines 6767–7169 (4-step at line 6957).
- Related: references/kahneman-regression-to-the-mean.md (the principle this procedure operationalizes), references/kahneman-representativeness-base-rate.md (the bias this corrects), references/kahneman-outside-view.md (the broader version of base-rate anchoring).
