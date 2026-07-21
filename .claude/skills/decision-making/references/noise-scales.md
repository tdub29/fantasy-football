# Noise: Scales

## When to Use

Use when reviewers use the same scale differently:

- "High priority" means different things to different people.
- A conviction score lacks anchors.
- Green/yellow/red budget labels drift.
- UX reviews use vague numeric ratings.
- SMB targets are scored inconsistently.

## Framework

Scales create noise when their labels are vague, anchors are missing, or reviewers translate impressions into numbers differently. Ranks and direct comparisons can often be more reliable than absolute scores.

## How to Apply

1. **Identify the scale.**
2. **List current anchors.** If none exist, say so.
3. **Find ambiguous labels.**
4. **Add behavioral examples.**
5. **Choose rating or ranking.** Use ranking when absolute levels are fuzzy.
6. **Calibrate reviewers on sample cases.**
7. **Document edge cases.**

## Output Format

```markdown
## Scale Audit: {scale}

Current scale:
Ambiguous labels:
Anchor examples:
Rating vs ranking recommendation:
Calibration cases:
Rewrite:
```

## Common Failure Modes

- **False precision.** A 7.2/10 score looks more exact than it is.
- **Verbal drift.** "Moderate" means different things across reviewers.
- **No examples.** Abstract labels do not calibrate judgment.
- **Absolute rating where rank would work better.**

## References

- Daniel Kahneman, Olivier Sibony, and Cass Sunstein, *Noise* (2021), chapters 15 and 23.
