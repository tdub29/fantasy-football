# Kahneman / Sibony / Sunstein — Aggregating Independent Judgments

## The framework

> "Independence is a prerequisite for the wisdom of crowds." (Ch 8, line 3276)
> "Averaging independent judgments is guaranteed to reduce system noise." (Ch 25, line 12662)

Two propositions, both load-bearing:

1. **N independent estimates AVERAGED outperform any single estimate.** Mathematically guaranteed — the average filters out the random component, preserving the signal.

2. **The moment estimates are no longer independent — discussion, cascade, social influence — the property breaks.** "Wisdom of crowds" only works on UN-discussed crowds.

### The three aggregation methods (Ch 21, lines 8760–8800)

**Method 1: Straight averaging of independent forecasts**

> "The unweighted average of a group of forecasters outperforms most and sometimes all individual forecasts." (line 8761–8765)

Collect N independent estimates. Take the mean (or median for robustness). That's the aggregate.

Findings: "Combined forecasts reduced errors by an average of 12.5%." (line 8765)

**Method 2: Delphi method**

> "Multiple rounds during which the participants submit estimates (or votes) to a moderator and remain anonymous." (lines 8782–8789)

Each round, participants see the previous round's distribution (anonymous) and the reasons given. They submit a new estimate. Converges over rounds. Combines aggregation with social learning while preserving anonymity (preventing cascade).

**Method 3: Estimate-Talk-Estimate (mini-Delphi)**

> "Requires participants first to produce separate (and silent) estimates, then to explain and justify them, and finally to make a new estimate." (lines 8793–8797)

The lightweight version. One round of independent → discussion → revised independent. Captures most of the benefit; fits in a single meeting.

### The independence requirement

> "The requirement of independence is routinely violated in the procedures of organizations, notably in meetings in which participants' opinions are shaped by those of others." (lines 12654–12655)

Most meetings DESTROY the wisdom-of-crowds property by anchoring everyone on early speakers. By the time the "vote" happens, the votes are not independent — they're correlated cascades.

**The simple intervention:** Collect estimates BEFORE the meeting starts.

> "The simple procedure of collecting participants' judgments before the discussion both reveals the extent of noise and facilitates a constructive resolution of differences." (lines 12658–12660)

This single move:
- Reveals noise (the spread of independent estimates).
- Provides aggregation anchor (the mean of independent estimates).
- Makes cascade visible if it happens (post-discussion votes that converge unanimously look suspicious next to the independent priors).

## How to apply

When a group needs to estimate something:

1. **Distribute the question BEFORE the meeting.** Each person submits an independent estimate, written.
2. **Aggregate (mean or median) before discussion.** That's your noise-reduced first estimate.
3. **In the meeting: share the distribution.** Show the spread. Discuss what drives it.
4. **For estimate-talk-estimate: collect a second independent round.** People can update based on what they've learned, individually.
5. **For Delphi (high-stakes): repeat the round 2-4 times.** Anonymous each round; convergence emerges.
6. **Final aggregate = mean of final independent round.** Not "what we agreed on after discussion." That's cascade.

When a meeting is happening anyway:

1. **Lock down individual votes BEFORE the discussion.** Even a 30-second silent estimate captures independence.
2. **Reveal the spread.** Make noise visible.
3. **Beware unanimous "agreement" after discussion.** Check against the independent priors.

## Common failure modes

- **"Let's discuss first, then vote."** Cascade installed. The vote isn't independent.
- **Asking the senior person first.** Cascade amplified. Use silent simultaneous estimates.
- **Treating the post-discussion consensus as the answer.** Often the BEST aggregate was the simple mean of the independent priors before anyone talked.
- **Believing more rounds always help.** Diminishing returns after 2-3 Delphi rounds. Often estimate-talk-estimate captures most of the benefit.
- **Averaging when distribution is bimodal.** If estimates split into two clusters, the mean is meaningless. Use median or examine the structure.
- **Aggregating estimates from non-independent sources.** If everyone read the same forecast yesterday, their "independent" estimates aren't actually independent. The aggregation property fails.

## References

- Daniel Kahneman, Olivier Sibony, Cass Sunstein, *Noise* (Little, Brown, 2021), Chapter 21 (lines 8750–9120) + reinforced at Chapter 25 (lines 12652–12662).
- Related: references/noise-decision-hygiene.md (parent), references/noise-groups-amplify.md (the failure mode this prevents), references/noise-mediating-assessments-protocol.md (uses estimate-talk-estimate as a sub-procedure), `cc-four-decision-methods` (related: when Vote method fits).
