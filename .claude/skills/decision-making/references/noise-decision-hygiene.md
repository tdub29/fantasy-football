# Kahneman / Sibony / Sunstein — Decision Hygiene

## The framework

> "We call this approach to noise reduction decision hygiene." (line 8162)
> "Just like handwashing and other forms of prevention, decision hygiene is invaluable but thankless." (line 8177)

The analogue to medical hygiene. Handwashing doesn't target a specific germ; it reduces the rate of infection broadly. Decision hygiene doesn't target a specific bias; it reduces noise broadly across decisions.

> Six principles (lines 12543–12662).

### The six principles

**1. The goal of judgment is accuracy, not individual expression.** (line 12551)

The frame-setting principle. Different judges expressing different "perspectives" feels valuable but produces noise. Where the decision should converge on truth (sentencing, diagnosis, forecasting), accuracy is the goal — not creative individual interpretation.

**2. Think statistically and take the outside view.** (Ch 15-18, referenced throughout)

Frame each case as one instance of a class, not as unique. Apply base rates. Use reference-class forecasting. (See references/kahneman-outside-view.md for the deep version.)

**3. Structure judgments into independent assessments.** (line 12615)

Decompose complex judgments into sub-assessments. Score each independently. Combine AFTER scoring, not during.

> "This protocol breaks down a complex judgment into multiple fact-based assessments and aims to ensure that each one is evaluated independently of the others." (lines 12620–12621)

See references/noise-mediating-assessments-protocol.md for the operational form.

**4. Resist premature intuitions.** (line 12625)

Hold off on holistic judgment until you've gathered structured assessments. Intuition is welcome at the end — not at the beginning.

In forensic science: "linear sequential unmasking" — examiners are kept unaware of irrelevant info as long as possible. Revealed only when needed.

**5. Obtain independent judgments from multiple judges, then aggregate.** (line 12652)

The structural antidote to group amplification. Collect independent assessments BEFORE discussion. Aggregate (average) explicitly.

> "Averaging independent judgments is guaranteed to reduce system noise." (line 12662)

See references/noise-aggregation.md for the operational form.

**6. Favor relative judgments and relative scales.** (Ch 15)

Absolute scales ("rate this 1-7") are noisier than relative scales ("which of these two is better"). When possible, frame as comparison, not absolute scoring.

### Designing scored guidelines (Apgar-style)

When a judgment repeats often but full automation is too rigid, convert it into a structured, Apgar-style scored guideline — the operational embodiment of principles 3 and 6. Good guidelines reduce noise while preserving room for justified exceptions.

1. **Name the recurring judgment.**
2. **Break it into independent dimensions.** Few, observable, non-overlapping.
3. **Define each score level.** Concrete, anchored language per level.
4. **Add concrete examples.** Worked cases for each level.
5. **Set the combination rule.** Sum, max, threshold, or override.
6. **Define the exception process.** A visible channel, not a secret workaround.
7. **Review with audit data.** Re-audit periodically so the guideline does not go stale.

Guidelines sit between rigid rules and unconstrained discretion: they structure judgment without erasing it.

### The "thankless" property

Decision hygiene's effects are statistical — visible across many decisions, invisible in any single one. The leader who introduces decision hygiene gets credit only at the aggregate level (improved hiring success rates, lower legal exposure, better forecasts). In each individual case, the procedure looks like extra friction.

This is why decision hygiene is rare. Most leaders optimize for the individual case ("we have a good gut on this one") and underweight the aggregate gain.

## How to apply

When designing a decision process:

1. **Diagnose where noise enters.** Level / pattern / occasion / group amplification?
2. **Pick the matching principles.** Group amplification → independent aggregation. Pattern noise → decomposition. Occasion noise → multiple looks + averaging.
3. **Build the procedure with the principles baked in.** Not as an add-on; as the structure.
4. **Measure noise before AND after.** Noise audit before; noise audit 6 months after. Quantify the reduction.
5. **Defend the procedure against "this feels slow."** Real argument: noise costs are aggregate. Procedure is a noise-reduction investment.

## Output Format

Document the redesigned procedure and, where a recurring judgment is being structured, its scored guideline:

```markdown
## Decision Hygiene Plan: {process}

Noise sources diagnosed:
Principles applied:
Procedure (step by step):
Independence/aggregation controls:
Measurement (noise audit before/after):

## Guideline Spec: {judgment}

Dimensions:
Scale:
Examples:
Combination rule:
Exceptions:
Review cadence:
```

## Common failure modes

- **Treating decision hygiene as a checklist.** It's a set of principles to design BY, not boxes to tick.
- **Applying selectively.** "We'll structure decomposition but skip independence." Mixed implementations leak noise.
- **Bypassing for "high-stakes" cases.** Counter-intuitive: high-stakes cases benefit MOST from decision hygiene. They're tempted to bypass because the case feels urgent.
- **Believing one good judge can substitute.** No individual judge is internally consistent enough to substitute for procedural noise reduction.
- **Resisting because it "removes judgment."** It doesn't. It restructures judgment — intuition still operates, but at the end of the process, on structured inputs.
- **Guidelines as vibes.** Score labels exist but criteria are not observable, so the rubric just relabels intuition.
- **Overloaded rubric.** Too many dimensions, and reviewers quietly ignore it.
- **No exception channel or audit loop.** People work around the guideline secretly, and it goes stale and noisy again.

## References

- Daniel Kahneman, Olivier Sibony, Cass Sunstein, *Noise* (Little, Brown, 2021), Chapter 19 (lines 7400–7700) + recapitulation at 12543–12662.
- Guideline-design material incorporated from *Noise* chapters 1 and 22 (Apgar-style scored guidelines; folds in the former `noise-guidelines` skill).
- Related: references/noise-vs-bias.md (parent), references/noise-mediating-assessments-protocol.md (the operational application of principles 3, 4, 6), references/noise-aggregation.md (principle 5), references/noise-structured-hiring.md (worked example).
