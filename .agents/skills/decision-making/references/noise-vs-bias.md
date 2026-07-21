# Kahneman / Sibony / Sunstein — Noise vs. Bias

## The framework

> "Error in a single measurement = Bias + Noisy Error." (Ch 5, line 2025)
> "Overall Error (MSE) = Bias² + Noise²." (line 2035)

Most organizations chase BIAS (systematic patterns of error) and ignore NOISE (variability between judges, across days, within sessions). The book's central insight: noise contributes as much to error as bias, and is usually invisible.

### The shooting-team metaphor (Ch 5)

Four teams shoot at a target.
- **Team 1:** Clustered tight on the bullseye. Low bias, low noise. Ideal.
- **Team 2:** Clustered tight but off to one side. High bias, low noise. Systematic error.
- **Team 3:** Scattered widely around the bullseye. Low bias, high noise. The shots AVERAGE to the right answer but no individual shot is reliable.
- **Team 4:** Scattered widely off to one side. High bias, high noise. Worst case.

Most organizations only check for Team 2 (bias). Many are actually Team 3 (noise). Noise is invisible at the average; only inspection of individual shots reveals it.

### The decomposition

> "Reducing noise or reducing bias by the same amount has the same effect on MSE." (Ch 6, lines 2113–2115)

Both contribute symmetrically to total error. An organization that reduces noise by 30% improves accuracy by the same amount as one that reduces bias by 30%. The asymmetric attention to bias has been a costly mistake.

### Why noise is hidden

Noise requires comparing DIFFERENT judgments of the SAME case. Most organizations don't generate that data:
- One judge sentences one defendant once. (No comparison possible.)
- One radiologist reads one X-ray once.
- One hiring panel reviews one candidate.

Without parallel comparison, noise is invisible. The book argues for "noise audits" — controlled exercises where multiple judges evaluate the SAME cases — to surface noise that would otherwise stay hidden.

## How to apply

When auditing decision quality:

1. **Decide if the decision is repeated.** If yes (hiring, sentencing, medical diagnosis, claims processing, forecasting), noise is relevant.
2. **Design a noise audit.** Have multiple decision-makers independently evaluate the SAME cases. Measure variance.
3. **Compute total error = bias² + noise² where possible.** Bias = average miss from truth. Noise = standard deviation across judges/occasions.
4. **Don't assume averaging hides the cost.** Even if averages match reality, individuals affected by noisy decisions experience the variance fully. A defendant facing a noisy sentencing system gets THIS judge on THIS day, not the average.
5. **Address the larger of the two errors first.** Often that's noise — but most organizations have never measured.

## Common failure modes

- **"Different judges have different perspectives — that's a feature."** Sometimes. Often it's just noise costing the affected parties. Distinguish.
- **Treating noise as "individual style."** Often true; doesn't change the cost.
- **Focusing only on bias correction.** Bias debiasing programs are common; noise reduction is rare. Both matter.
- **Confusing noise with error.** Noise is the variability component of error. They're not synonyms.
- **Believing averages tell you the right answer.** Averages can match truth while every individual decision is wrong. Team 3 in the shooting metaphor.

## References

- Daniel Kahneman, Olivier Sibony, Cass Sunstein, *Noise: A Flaw in Human Judgment* (Little, Brown, 2021), Chapters 5–6 (lines 1900–3100).
- Related: references/noise-types-system-occasion.md (the 3 types), references/noise-decision-hygiene.md (operational reduction), references/kahneman-system-1-system-2.md (TFAS parent — different lens on errors).
