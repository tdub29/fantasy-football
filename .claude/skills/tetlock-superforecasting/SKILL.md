---
name: tetlock-superforecasting
description: Router hub for the FORECASTING-AND-CALIBRATION discipline of Philip E. Tetlock & Dan Gardner's *Superforecasting: The Art and Science of Prediction*. Covers the superforecaster mindset (actively open-minded thinking, growth mindset, perpetual beta, foxes vs hedgehogs), the Ten Commandments checklist for aspiring superforecasters, Fermi-izing intractable questions into knowable sub-problems, the outside-view-then-inside-view sequence with base rates, probabilistic granularity and Brier-score calibration, frequent incremental belief updating in a Bayesian spirit, and keeping score with resolvable questions plus postmortems and dragonfly-eye team aggregation. Triggers: superforecasting, Tetlock, Good Judgment Project, forecasting tournament, how confident should I be, give me a probability, "63% not likely," calibration, Brier score, resolution, granularity, base rate, outside view, inside view, reference class, Fermi estimate, Fermi-ize, ballpark, decompose the question, actively open-minded, growth mindset, perpetual beta, fox vs hedgehog, update my beliefs, overreact/underreact to evidence, Bayesian updating, keep score, resolvable question, postmortem, dragonfly eye, forecasting team, wisdom of the crowd, Ten Commandments. GUARDRAILS: this is the named *Superforecasting* forecasting/calibration router — disposition, probability hygiene, base-rate sequencing, scorekeeping, team aggregation. For general cognitive biases (anchoring, availability, framing, prospect theory) use the `behavioral-economics` hub; for online experiment statistics (OEC, power, SRM, launch decisions) use `kohavi-controlled-experiments`. Do NOT duplicate or modify those siblings. Load the matching references/<name>.md file and apply that framework exactly.
---

# tetlock-superforecasting

This hub collapses the seven *Superforecasting* frameworks into one router plus references. Route by user cue, read the referenced file(s) in full, and apply that framework's process exactly — including its granular probability discipline and scorekeeping.

Book provenance: **Philip E. Tetlock & Dan Gardner, *Superforecasting: The Art and Science of Prediction* (Crown, 2015)**. Load the matching `references/*.md` file when a specific framework is needed.

## When to use

Use this hub when the user wants to **forecast a real-world question well and keep score honestly** — putting a number on an uncertain future event, deciding how confident to be, breaking a seemingly unanswerable question into estimable parts, anchoring on a base rate before adjusting for case specifics, updating an estimate as news arrives, or running a postmortem on past calls. The orientation is **operational forecasting and calibration**, not a general tour of cognitive biases: each reference is a move a superforecaster actually makes.

## Guardrails

- This is the **forecasting / calibration** layer — disposition, the Ten Commandments checklist, Fermi decomposition, outside-then-inside sequencing, granularity and Brier scoring, incremental updating, and scorekeeping/team aggregation.
- **For general cognitive biases** (anchoring, availability, framing, loss aversion, prospect theory, the broad Kahneman canon) use the `behavioral-economics` hub. This hub references `kahneman-outside-view` there for the bias background but stays forecasting-operational — it does not duplicate it.
- **For online controlled experiment statistics** (OEC, statistical power, sample-ratio mismatch, ramping, launch decisions) use `kohavi-controlled-experiments`. Forecasting tournaments are not A/B tests.
- Cross-reference siblings via plain backtick code-spans only; do **not** modify them.
- Do **not** answer from router memory alone; load the selected reference file(s) first and follow their process.
- Order matters: triage first, then Fermi-ize, then outside view before inside view, assign a granular probability, update incrementally, and keep score. Don't skip to the inside view or to a vague "maybe."

## Quick routing table

| User cue (examples) | Route to reference |
|---|---|
| what kind of thinker forecasts well, actively open-minded, growth mindset, perpetual beta, "is forecasting a skill," fox vs hedgehog, aggregate many perspectives, am I too committed to one model | `references/tetlock-superforecaster-mindset.md` |
| give me a checklist, how do superforecasters actually do it, the Ten Commandments, full forecasting process, what steps should I run | `references/tetlock-ten-commandments.md` |
| this question feels unanswerable, ballpark it, Fermi estimate, decompose into sub-problems, separate knowable from unknowable, "how many X" | `references/tetlock-fermi-decomposition.md` |
| what's the base rate, reference class, outside view vs inside view, "this case is unique," anchor before adjusting, avoid the inside-view trap | `references/tetlock-outside-then-inside-view.md` |
| how confident should I be, put a number on it, "63% not likely," granularity, more than three settings of maybe, calibration, resolution, Brier score, keeping score numerically | `references/tetlock-calibration-brier-granularity.md` |
| new evidence arrived, should I move my estimate, update beliefs, over/underreacting to news, incremental vs jump, Bayesian-spirit updating, anchoring on my prior | `references/tetlock-belief-updating.md` |
| write resolvable questions, time-bound and scorable, run a postmortem, was I right for the right reasons, dragonfly eye, aggregate a team, forecasting group, wisdom of the crowd | `references/tetlock-keep-score-postmortem.md` |

## Workflow

1. Confirm the intent is **operational forecasting/calibration**, not general bias education (`behavioral-economics`) or experiment statistics (`kohavi-controlled-experiments`).
2. **Triage** the question: is it in the Goldilocks zone where effort pays off, or is it clocklike-trivial / cloud-like-hopeless?
3. Pick the closest row(s) in the routing table. A full forecast usually runs mindset → Ten Commandments → Fermi → outside-then-inside → granular probability → updating → scorekeeping.
4. Read those `references/*.md` files completely.
5. Apply the framework's process and produce a **numeric, granular** probability where the question is resolvable.
6. Combine references only when the question genuinely spans them — e.g., Fermi decomposition + outside view to seed each sub-estimate, or granularity + updating for a question you'll revisit.

## Common failure modes (hub-level)

- **Wrong hub** — pulling this for a general bias question (`behavioral-economics`) or an A/B-test statistics question (`kohavi-controlled-experiments`).
- **Vague verbiage** — answering "likely" / "maybe" instead of a granular number when the question is resolvable.
- **Inside-view first** — diving into vivid case specifics before anchoring on a base rate.
- **Forecast-and-forget** — issuing a number with no resolution date and no plan to update or score it.
- **Router-only answer** — summarizing a framework without loading its full reference.

## References

- [references/tetlock-belief-updating.md](references/tetlock-belief-updating.md)
- [references/tetlock-calibration-brier-granularity.md](references/tetlock-calibration-brier-granularity.md)
- [references/tetlock-fermi-decomposition.md](references/tetlock-fermi-decomposition.md)
- [references/tetlock-keep-score-postmortem.md](references/tetlock-keep-score-postmortem.md)
- [references/tetlock-outside-then-inside-view.md](references/tetlock-outside-then-inside-view.md)
- [references/tetlock-superforecaster-mindset.md](references/tetlock-superforecaster-mindset.md)
- [references/tetlock-ten-commandments.md](references/tetlock-ten-commandments.md)

- **Book:** Philip E. Tetlock & Dan Gardner, *Superforecasting: The Art and Science of Prediction* (Crown, 2015)
