# Tetlock — Outside View First, Then Inside View

## The framework

> "Superforecasters are in the habit of posing the outside-view question: How often do things of this sort happen in situations of this sort?" (Chapter 5; Commandment 3)

Borrowing the distinction Daniel Kahneman popularized (cross-referenced as `kahneman-outside-view` in the `behavioral-economics` hub — this reference stays forecasting-operational rather than re-explaining the bias theory):

- **Outside view** — the **base rate** for the reference class. Treat the question as one instance of a broad category and ask how often the outcome occurs across that category. Abstract, bare, statistical.
- **Inside view** — the **specifics** of this particular case: the vivid details, the narrative, the local evidence. Concrete, story-rich, seductive.

The superforecaster's rule is **sequence**: start with the outside view, set it as your anchor, *then* move to the inside view and adjust. Not the reverse.

### Why the order matters

If you start with the inside view, the vivid specifics capture you. You build a detailed story, reach a confident conclusion, and then — if you consult the base rate at all — you treat it as a minor footnote rather than the anchor. This is the **inside-view trap**: the case feels so unique that base rates seem irrelevant, and you systematically misjudge.

Starting with the outside view gives you a disciplined anchor that the specifics then nudge. Tetlock's worked example: estimating whether the "Renzettis" own a pet. The outside view — about 62% of American households own a pet — sets the starting estimate at ~62%. *Then* you adjust for inside-view specifics (the family has a small apartment, a child who wants a dog, etc.). The base rate keeps the adjustment honest.

### Finding the reference class

- Nothing is 100% unique — uniqueness is a matter of degree. Conduct a **creative search for comparison classes**, even for seemingly one-off events (the hunt for a specific terrorist, a standoff between a new government and its creditors).
- There is often **more than one defensible outside view.** A second reference class that more closely matches the case can be a better anchor. State which class you chose and why.
- When no statistical base rate exists, a **Copernican-humility** prior helps: assume you're at no special point in time (if a war has lasted two years, you're equally likely near its start or its end), which yields a crude but real confidence band — better than "zero to infinity."

### The planning-fallacy illustration

Larry Summers corrected employees' inside-view optimism by applying an outside view to *their estimates*: he doubled the estimate and bumped it to the next time unit ("an hour" → "two days"). It's a nerd joke, but it encodes the discipline — anchor on the class behavior (people underestimate task time by 2–3×) before trusting the case-specific promise. He'd still adjust if an employee proved exceptional: outside-view anchor, inside-view adjustment.

## How to apply

1. **Reframe the case as a member of a class.** "How often do things of *this sort* happen in situations of *this sort*?"
2. **Find the base rate** for that class and write it down as your starting probability.
3. **Search for a better-matching second reference class** if one exists; choose deliberately and note why.
4. **Now bring in the inside view** — the case specifics — and adjust the anchor up or down. Adjust, don't abandon.
5. **Keep the adjustment proportionate.** Vivid specifics rarely justify large moves away from a solid base rate; demand strong, diagnostic evidence for big swings.
6. When no base rate exists, fall back to a Copernican-humility prior rather than throwing up your hands.

## Common failure modes

- **Inside view first** — diving into the gripping specifics, then treating the base rate as a footnote (the inside-view trap).
- **Skipping the outside view entirely** — "this situation is unique," so no reference class is sought.
- **Over-adjusting from the anchor** — letting a good story drag the estimate far from a solid base rate on thin evidence.
- **Cherry-picking the reference class** — choosing whichever base rate supports the answer you already want.
- **Treating the base rate as the final answer** — refusing to adjust at all when the case genuinely differs from the class.

## References

- Philip E. Tetlock & Dan Gardner, *Superforecasting* (Crown, 2015), Chapter 5 (outside vs. inside view, the Renzetti and Summers examples) and Appendix Commandment 3.
- Related: `references/tetlock-fermi-decomposition.md` (seed sub-estimates with base rates), `references/tetlock-belief-updating.md` (adjust the anchor as evidence arrives), `references/tetlock-ten-commandments.md` (Commandment 3). For the underlying bias theory, see `kahneman-outside-view` in the `behavioral-economics` hub — do not duplicate it here.
