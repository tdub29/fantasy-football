# Noise: Audit

## When to Use

Use when a judgment should be consistent across reviewers:

- Budget edge cases receive green/yellow/red labels.
- Support tickets receive priority.
- SMB targets receive quality scores.
- UX screens receive review ratings.
- Multiple reviewers rate the same stock or investment thesis.

## Framework

A noise audit measures disagreement without needing to know the true answer. Give the same cases to multiple independent judges, compare their judgments, and quantify unwanted variability.

## How to Apply

1. **Define the judgment.** What should be consistent?
2. **Select cases.** Use realistic, representative cases.
3. **Choose judges.** People or agents who normally make the call.
4. **Blind and separate.** Prevent discussion before scoring.
5. **Use one scale.** Same anchors and instructions.
6. **Measure spread.** Range, standard deviation, or disagreement rate.
7. **Debrief after scoring.** Find vague criteria, scale drift, and missing rules.

## Output Format

```markdown
## Noise Audit: {judgment}

Judgment:
Cases:
Judges:
Scale:
Independence controls:
Noise metric:
Likely sources:
Action plan:
```

## Common Failure Modes

- **Consensus first.** Discussion hides noise before it is measured.
- **Cherry-picked cases.** Easy examples understate real variability.
- **Vague scale.** Reviewers disagree because the words mean different things.
- **Truth obsession.** Audit first measures disagreement, not correctness.

## References

- Daniel Kahneman, Olivier Sibony, and Cass Sunstein, *Noise* (2021), chapter 2 and appendix A.
