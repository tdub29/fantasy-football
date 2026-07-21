# Kahneman — The Outside View (Reference Class Forecasting)

## The framework

> "The Outside View." (Ch 23, lines 8962–9337)

Two ways to predict:

**Inside view** — examine THIS case in detail. Build a plan, anticipate problems, project outcomes from specific evidence. Feels rigorous. Systematically over-confident, systematically optimistic.

**Outside view** — find a REFERENCE CLASS of similar past cases. Anchor your prediction on the base-rate statistics of that class. Then adjust for what's genuinely unique about this case.

The outside view is reliably more accurate. People reliably resist it.

### The famous textbook story

Kahneman's curriculum team estimating how long it would take to finish their textbook:
- Inside view (each member's guess): 1.5–2.5 years.
- Outside view (Kahneman asks a member about similar past projects): 7–10 years, 40% failure rate.
- The team ignored the outside view and continued. The book took 8 years.

The inside view feels SO much more relevant because YOUR project is so specific. That feeling is exactly what produces the bias.

### The 3-step procedure (line 9235)

1. **Identify an appropriate reference class.** Kitchen renovations, software projects of size X, marriages, IPOs. The more similar the cases, the better.

2. **Obtain the statistics of the reference class.** What % succeeded? What was median cost/duration? What's the distribution?

3. **Use specific information about the case to adjust the baseline.** Only AFTER you've anchored on the statistics. And usually adjust LESS than feels right.

### When to trust intuition over the outside view

> Chapter 22 gives 3 criteria for trustworthy expert intuition (the only case where the inside view beats):

1. **A regular, predictable environment** — physics, chess, firefighting.
2. **Extensive practice with high-quality feedback** — thousands of hours where you saw the outcome quickly.
3. **A short feedback loop** — outcomes apparent within seconds-to-days.

Most domains DON'T satisfy these. Strategic planning, political forecasting, long-term medical predictions, project outcomes — low-validity environments. Use the outside view.

### The planning fallacy

> "Plans and forecasts that are unrealistically close to best-case scenarios; could be improved by consulting the statistics of similar cases."

Almost every project under-estimates time and cost. Government infrastructure: median overrun ~30%. Home renovations: median overrun ~50%+. Software: median overrun ~100%. The outside view exposes this; the inside view hides it.

## How to apply

When predicting cost, duration, or outcome:

1. **Identify a reference class.** What category of project is this? Be specific: not "software projects" but "internal team migrations of ~10-engineer codebases."

2. **Find the statistics.** Look up data. Ask experienced people about similar past projects. Get the distribution — best, median, worst.

3. **State the reference-class prediction.** "Based on similar past projects, median is 18 months with 60% taking 24+."

4. **Then adjust.** What's genuinely unique about this case? Adjust the reference-class prediction modestly. Resist the urge to adjust by 50%+ on the basis of "but we're different."

5. **Use the outside-view prediction as the prediction.** Not as a footnote to the inside view.

## Common failure modes

- **"Our project is different."** Yes — and so was every other project in the reference class, at the time. The outside view averages over uniqueness.
- **Choosing too narrow a reference class.** "Projects exactly like this" produces n=1. Be broad enough to have data.
- **Choosing too broad a reference class.** "Software projects" — too varied. Find the right grain.
- **Computing the outside view, then ignoring it.** The most common failure. The team agrees the outside view is informative, then makes plans based on the inside view anyway.
- **Heroic adjustment.** "Yes, similar projects took 12 months, but WE have a great team, so 6 months." The "great team" inflation is exactly what every team in the reference class also assumed.
- **Confusing skill-environment intuition with planning intuition.** A firefighter's instinct about a building is high-validity; the CEO's instinct about Q3 revenue isn't.

## References

- Daniel Kahneman, *Thinking, Fast and Slow* (FSG, 2011), Chapter 23 lines 8962–9337 (3-step at 9235); Chapter 22 lines 8527–8961 (intuition criteria).
- Related: references/kahneman-system-1-system-2.md (parent), references/kahneman-wysiati.md (the bias outside view corrects), references/kahneman-representativeness-base-rate.md (outside view IS base-rate anchoring at the project level), references/kahneman-taming-intuitive-predictions.md (the 4-step quantitative procedure).
