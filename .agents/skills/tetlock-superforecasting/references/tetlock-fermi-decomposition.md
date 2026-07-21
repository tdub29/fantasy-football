# Tetlock — Fermi-izing the Question

## The framework

> "Decompose the problem into its knowable and unknowable parts. Flush ignorance into the open. Expose and examine your assumptions. Dare to be wrong by making your best guesses." (Chapter 5; Commandment 2)

Enrico Fermi — physicist, builder of the first atomic reactor — was famous for "Fermi problems": ballpark estimates of seemingly unanswerable questions ("How many piano tuners are in Chicago?") using no reference material, just decomposition and reasoning. The lesson for forecasting: **a question that looks impossible to answer becomes tractable once you break it into sub-questions you actually have some grip on.** Superforecasters see Fermi-izing as part of the job — it's how they put numbers on Arafat's autopsy, bird-flu epidemics, oil prices, and bond-yield spreads.

### The core move

1. **Decompose** the unanswerable question into a chain of smaller sub-questions.
2. **Separate the knowable from the unknowable** — be explicit about which parts you can estimate and which are genuine guesses.
3. **Estimate each sub-component** with your best guess, stating the assumption out loud.
4. **Recombine** the sub-estimates into a final number.

The striking empirical finding: remarkably good probability estimates often arise from a remarkably **crude** series of assumptions and guesstimates. Errors in the sub-estimates frequently offset each other, so the combined answer is far better than the inputs look.

### The worked example (Peter Backus, "the search for love")

Backus estimated his pool of potential partners in London by chaining proportions:
- Population of London: ~6,000,000
- × proportion women (~50%)
- × proportion single (~50%)
- × proportion in the right age range (~20%)
- × proportion university graduates (~26%)
- × proportion he finds attractive (~5%)
- × proportion likely to find him attractive (~5%)
- × proportion likely to be compatible (~10%)
- → ≈ **26 women** in the pool.

Each factor is a guess; the discipline of writing them down turns "impossible to know" into a defensible ballpark you can argue with and refine.

### Why it works

- **It flushes ignorance into the open.** Hidden assumptions become visible sub-estimates you can challenge.
- **It dares you to be wrong.** Vague verbiage ("hard to say") hides errors; explicit guesses expose them so they can be corrected.
- **It localizes uncertainty.** You can see *which* sub-component is driving the answer and where to spend more research effort.

## How to apply

1. **Restate the question as a product or sum of sub-questions.** "What's the chance of X?" → "X happens if A and B and C; what's each?"
2. **Sort the pieces into knowable vs. unknowable.** Look up or reason out the knowable; make a deliberate, stated guess for the unknowable.
3. **Seed each sub-estimate with a base rate where one exists** (hand off to `references/tetlock-outside-then-inside-view.md`).
4. **Recombine** — multiply probabilities, sum quantities — into a single number.
5. **Stress the dominant factor.** Identify which assumption most moves the result and sanity-check it hardest.
6. **State the chain, not just the answer.** Showing the decomposition lets others (and future-you) attack the weakest link.

## Common failure modes

- **Refusing to start** because the question "can't be known" — the exact frown Fermi's students gave before he showed them otherwise.
- **Decomposing into pieces that are just as unknowable** as the original — push until you reach sub-questions you can actually estimate.
- **Hiding the assumptions** behind a single confident-looking number instead of exposing the chain.
- **Over-precision** — treating crude guesstimates as exact; the output is a ballpark, not a measurement.
- **Forgetting to recombine** — producing interesting sub-facts but never assembling them into the answer the question asked for.

## References

- Philip E. Tetlock & Dan Gardner, *Superforecasting* (Crown, 2015), Chapter 5 ("Supersmart?" — the Fermi estimation discussion, Levitin) and Appendix Commandment 2.
- Related: `references/tetlock-outside-then-inside-view.md` (seed each sub-estimate with a base rate), `references/tetlock-ten-commandments.md` (Commandment 2), `references/tetlock-calibration-brier-granularity.md` (turn the recombined estimate into a granular probability).
