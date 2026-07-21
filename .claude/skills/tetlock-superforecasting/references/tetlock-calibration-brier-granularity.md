# Tetlock — Granularity, Calibration, and Brier Scores

## The framework

> "Your uncertainty dial needs more than three settings." (Chapter 3; Commandment 6)

Good forecasting demands thinking — and speaking — in **fine-grained probabilities**, then **keeping score** on how well those numbers track reality. Two distinct ideas:

- **Granularity** — how many degrees of doubt you distinguish. Most people have a three-setting dial: "yes," "no," "maybe." Superforecasters separate 60/40 from 55/45, and say **63%** where others say "likely." The more degrees of uncertainty you can meaningfully distinguish, the better a forecaster you tend to be.
- **Scoring** — once forecasts are numeric, accuracy becomes measurable. That's what makes forecasting a trainable skill rather than a parlor game.

### Why "63%, not likely"

Vague verbiage ("likely," "might," "a real possibility") is unfalsifiable and means wildly different things to different people. A number is scorable, comparable, and forces honesty. Tetlock's illustration: President Obama treated the bin Laden intelligence as "fifty-fifty… a flip of the coin," yet the very same odds offered on a college basketball game would have prompted him to say "between three-to-one and four-to-one." We already think granularly about sports; the skill is to **not reserve rigorous probability for trivial pursuits.** "Slam dunk" implies infinite odds and a willingness to lose everything — almost never warranted.

The caveat in Commandment 6: distinguish as many degrees "as the problem permits **but no more**." False precision (a 1/100,000 estimate on a genuinely fuzzy question) is its own error.

### Brier scores — keeping score

The math behind the scoring (Glenn W. Brier, 1950): a **Brier score** measures the squared distance between what you forecast and what actually happened.

- **0** = perfect (omniscience).
- **2.0** = perfectly, confidently wrong (the maximum).
- **0.5** = the "blindfolded monkey" / coin-flip-on-every-question baseline.

Lower is better. But a Brier score is **meaningless without context**: forecasting "warm and sunny" in Phoenix can earn a near-0 score that's worthless, while a 0.2 in volatile Springfield could be world-class. You must compare scores against the difficulty of the questions and against other forecasters facing the same questions.

### Calibration vs. resolution — the two components

Long-term accuracy (Commandment 7) requires both:

- **Calibration** — do your probabilities match reality? Of all the times you said "70%," did the event happen about 70% of the time? Overconfidence (saying 90% when you're right 70% of the time) and underconfidence both hurt calibration.
- **Resolution** — decisiveness. Do you push toward the confident ends (closer to 0% or 100%) when warranted, rather than hugging a safe 50%? A perfectly calibrated forecaster who only ever says "50%" has no resolution and no value.

You need both: bold enough to be useful (resolution) and honest enough to be trusted (calibration).

## How to apply

1. **State a number, not a word.** Convert every "likely / maybe / probably" into a percentage before you finish.
2. **Use a fine scale.** Allow yourself 55/45, 63/37, etc. — distinguish degrees the question can actually support.
3. **Don't reserve rigor for low-stakes questions.** Apply sports-bracket granularity to the consequential ones.
4. **Avoid false precision.** Match granularity to what the problem permits; don't manufacture three decimal places on a fuzzy question.
5. **Score with Brier, in context.** Track squared error, but always benchmark against question difficulty and against other forecasters on the same questions.
6. **Diagnose calibration vs. resolution separately.** If you're well-calibrated but timid, push for more resolution; if you're bold but miscalibrated, rein in overconfidence.

## Common failure modes

- **Three-setting dial** — collapsing everything to yes/no/maybe, the single biggest granularity failure.
- **Vague verbiage** — "likely" instead of a number, so the forecast can never be scored.
- **Context-free Brier scores** — celebrating a low score on easy questions or panicking over a "high" score on hard ones.
- **All calibration, no resolution** — hugging 50% to stay safe, producing honest but useless forecasts.
- **False precision** — distinguishing more degrees than the problem can bear.

## References

- Philip E. Tetlock & Dan Gardner, *Superforecasting* (Crown, 2015), Chapter 3 ("Keeping Score" — Brier scores, calibration vs. resolution, granularity) and Appendix Commandments 6 and 7.
- Related: `references/tetlock-keep-score-postmortem.md` (resolvable questions and postmortems that make scoring possible), `references/tetlock-belief-updating.md` (granular updates), `references/tetlock-ten-commandments.md` (Commandments 6, 7).
