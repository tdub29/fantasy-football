# Kahneman / Sibony / Sunstein — Three Types of Noise

## The framework

> "System Noise² = Level Noise² + Pattern Noise²." (Ch 6, line 2493)
> Plus: Occasion Noise (Ch 7, lines 2584–2993).

Noise has three structurally distinct sources. They require different remedies.

### 1. Level Noise

> "Some Judges Are Severe: Level Noise." (Ch 6, line 2373)

The variability of judges' AVERAGE judgments. Some judges are systematically harsher (or more lenient, generous, optimistic) than others, across all cases.

**Example:** In sentencing data, federal judges' average sentence for similar offenses varies by years. Some are systematically severe. Some are systematically lenient. That spread = level noise.

**Detection:** Compare each judge's MEAN judgment across many cases.

**Reduction:** Calibration (training to a common standard), guidelines, structured rubrics anchoring on common reference points.

### 2. Pattern Noise

> "Judges Differ: Pattern Noise." (Ch 6, line 2426)

Different judges weight different case features differently. Judge A weights criminal history heavily; Judge B weights mitigating circumstances heavily. Their AVERAGES might be similar (no level noise), but their reactions to specific cases diverge.

**Pattern noise is usually larger than level noise.**

In sentencing data, level noise was 2.4 years; system noise was 3.4 years; pattern noise was the difference (√(3.4² - 2.4²) ≈ 2.4 years). Pattern noise contributes as much as level noise.

**Detection:** Requires cases evaluated by multiple judges. Look at WHICH cases produce disagreement, not just whether averages differ.

**Reduction:** Structured decomposition of cases into features, with explicit weights. Mediating assessments protocol. Sometimes the only fix is algorithmic — humans systematically apply different implicit weights.

### 3. Occasion Noise

> "Occasion Noise." (Ch 7, line 2584)
> "Occasion noise is the variability among these unseen possibilities" — same judge, same case, different moment. (line 2655)

The SAME judge gives different answers to the SAME case on different days. Or in different mood. Or after lunch vs. before. Or after a string of similar cases.

**Known drivers (Ch 7):**
- Mood
- Fatigue
- Weather (yes, really — radiologists rate X-rays differently on sunny vs. rainy days)
- Time of day (judges are harsher right before lunch)
- What came right before (sequence effects)
- Random fluctuation

**Detection:** Have the same judge re-evaluate the same case at a different time, blind to their previous judgment. Measure consistency.

**Reduction:** Procedural — separate examination from consultation, blind re-checks, panel decisions (where occasion noise of multiple judges partially averages out), explicit rubrics that reduce reliance on holistic intuition.

### Why distinguishing matters

The three types have different fixes:
- **Level noise** → calibration / guidelines / anchors.
- **Pattern noise** → structured decomposition / algorithms.
- **Occasion noise** → procedural (multiple looks, blind reviews, panels).

Training that targets "consistency" without identifying which type is dominant will mostly miss.

## How to apply

When diagnosing noise in a decision system:

1. **Run a noise audit.** Have N judges evaluate the SAME M cases independently.
2. **Compute each judge's mean judgment.** Variance of means = level noise.
3. **Compute system noise.** Total variance of all individual judgments.
4. **Derive pattern noise.** √(System Noise² − Level Noise²).
5. **For occasion noise: have judges re-evaluate (blinded) on a different day.** Measure within-judge variance.
6. **Match the intervention to the dominant noise type.**

## Common failure modes

- **Diagnosing level noise, applying pattern noise fix (or vice versa).** Calibration training when the actual problem is feature-weighting variance. Algorithmic decomposition when the actual problem is severity drift.
- **Ignoring occasion noise.** "Same judge today" feels like a fixed quantity. It isn't.
- **Lumping all three under "consistency."** The fixes are different.
- **Generic training as the only intervention.** Hard to improve consistency without first measuring it.

## References

- Daniel Kahneman, Olivier Sibony, Cass Sunstein, *Noise* (Little, Brown, 2021), Chapters 6–7 (lines 2350–3100).
- Related: references/noise-vs-bias.md (parent), references/noise-decision-hygiene.md (procedural remedies), references/noise-mediating-assessments-protocol.md (pattern noise remedy), references/noise-aggregation.md (occasion noise remedy via averaging).
