# Kahneman / Sibony / Sunstein — How Groups Amplify Noise

## The framework

> "How Groups Amplify Noise." (Ch 8, line 3096)

The common intuition: groups reduce error by combining perspectives.
The empirical reality: groups AMPLIFY error compared to independent individuals + averaging, because of three structural mechanisms.

> "Independence is a prerequisite for the wisdom of crowds." (line 3276)

Once judges interact, the wisdom-of-crowds property breaks.

### The three mechanisms

**1. Information Cascades** (Ch 8, lines 3293–3410)

The first speaker's view ANCHORS the group. Subsequent speakers update their own views toward the first speaker (rational, given their imperfect information). Their public statements then reinforce the anchor. By the time the 5th person speaks, the group has converged on the first speaker's view — even if it was wrong.

> "If someone starts a meeting by favoring a major change... that person might initiate a discussion that leads a group unanimously to support the change. Their agreement might be a product of social pressures, not of conviction." (lines 3400–3405)

**2. Group Polarization** (Ch 8, lines 3413–3501)

> "When people speak with one another, they often end up at a more extreme point in line with their original inclinations." (lines 3419–3420)

A group leaning slightly toward Option A will, after discussion, lean STRONGLY toward A. Discussion amplifies the original tilt, not corrects it. This is the opposite of what most meeting-organizers expect.

> "Juries experienced a shift toward greater leniency (when median member was lenient) and a shift toward greater severity (when median member was severe)." (lines 3473–3480)

**3. Social Influence** (Ch 8, lines 3147–3172)

People defer to perceived consensus, perceived authority, perceived expertise — even when their own assessment differs. This is partly motivated (don't want to be the odd one out) and partly informational (they know something I don't).

> "The level of success in the social influence condition was more unpredictable than in the independent condition. In short, social influences create significant noise across groups." (lines 3168–3170)

In the relevant study: songs that became hits in one group flopped in another. Different early adopters → different cascade dynamics → wildly different group outcomes.

### Empirical consequence

> "Deliberation had the effect of increasing noise" — deliberating juries are FAR noisier than statistical juries (independent judgments averaged). (Ch 8, line 3459)

Two procedures applied to the SAME set of cases:
- **Statistical jury:** Each member independently scores. Scores averaged.
- **Deliberating jury:** Members discuss, reach consensus.

Statistical juries are dramatically less noisy. Deliberating juries' decisions vary wildly across groups even with similar members. The discussion is generating the variance.

## How to apply

When designing a group decision:

1. **Collect independent judgments BEFORE discussion.** Each person writes their assessment privately. No talking yet.
2. **THEN discuss.** Discussion has value (sharing info, surfacing concerns). But the discussion shouldn't drive the consensus; the independent prior judgments should.
3. **Aggregate the independent judgments.** Average (numerical) or majority (categorical) BEFORE deliberation.
4. **Avoid early-speaker dominance.** Rotate who speaks first. Or speak in reverse seniority (junior first).
5. **Use estimate-talk-estimate.** Members estimate privately → share + discuss → re-estimate privately. The final estimate captures both independent judgment AND group learning.
6. **Beware "we all agreed."** Unanimous agreement after discussion often means cascade succeeded, not that judgment converged on truth.

## Common failure modes

- **Treating consensus as validation.** "We all agreed" can mean cascade. The independent priors are the test.
- **Letting the senior person speak first.** Cascade amplified. Reverse the order.
- **Trying to address one mechanism while ignoring others.** Anti-cascade procedure (vote-then-discuss) doesn't fix polarization; you need both privacy AND structured aggregation.
- **Believing discussion "irons out" individual noise.** It usually adds variance through cascade and polarization, not removes it.
- **Holding meetings to "decide" when independent judgment would do.** Default to private estimates + aggregation; reserve meetings for the cases where genuine information exchange would change minds.

## References

- Daniel Kahneman, Olivier Sibony, Cass Sunstein, *Noise* (Little, Brown, 2021), Chapter 8 (lines 3095–3540).
- Related: references/noise-aggregation.md (the structural alternative to group discussion), references/noise-mediating-assessments-protocol.md (incorporates independent-before-aggregate), `cc-four-decision-methods` (related: when to use which decision mode).
