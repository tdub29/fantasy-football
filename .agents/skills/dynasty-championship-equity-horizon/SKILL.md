---
name: dynasty-championship-equity-horizon
description: Use when scoring or comparing dynasty fantasy football strategies across multiple seasons. Triggers on "should I rebuild or contend", "is this rebuild worth it", "compare these two plans over time", "what is my 3-year outlook", "expected championships over N years", "how many years out should I model", "evaluate this trade across multiple seasons", "what discount rate should I use", "cumulative title odds", "discounted title probability", "is standing pat better", "how long until this pays off", "break-even year". Sets the horizon, the discount, and the terminal value BEFORE any number is computed, so the window cannot pick the winner.
---

# Dynasty Championship Equity Horizon

One job: convert competing multi-season strategies into a single comparable number, Discounted Championship Equity, over a horizon long enough to contain the slowest strategy's payoff.

Phase diagnosis is `dynasty-roster-phase-diagnosis`. Sell timing is `dynasty-age-curve-timing`. Sequencing and flip triggers are `dynasty-rebuild-clock`. Pick EV is `dynasty-pick-portfolio-valuation`. Format ceilings are `dynasty-league-format-leverage`. Package shape is `dynasty-trade-construction`. This skill only scores paths across time.

## The objective function

```
DCE(H) = sum over t=0..H of (delta^t * p_t) + TV
```

- `p_t` = Monte Carlo title probability in season t (t=0 is this season).
- `delta` = per-season survival discount.
- `TV` = terminal value past the horizon. Mandatory, formula below.

Every strategy comparison is a **delta-DCE**, never a delta-p_0. Comparing this year's title odds between a rebuild and a contend path measures only the rebuild's cost.

Two things are banned outright:

1. **Undiscounted sums.** A hard cutoff at H with no discount makes the answer discontinuous in H, so whoever picks H picks the winner.
2. **Discounting for projection uncertainty.** The Monte Carlo already holds forecast error. Discounting for it again is double counting, and it kills rebuilds systematically because their equity sits in the discounted years.

## Step 1: set the horizon before anything else

```
H >= max(7, years_to_flip + 4)
floor 6, default 8
```

The horizon is set by the slowest strategy on the table, not by preference or by what the user asked for. A rebuild sacrifices years 0-2 by construction, so H<=3 has already assumed the conclusion.

**REFUSE to render a rebuild verdict at H <= 3.** State it in one line: "A 3-year window measures a rebuild's full cost and roughly a third of its payoff, so it cannot decide this."

If a 3-year number is explicitly requested, print CTE(3) and CTE(8) side by side and **lead with CTE(8)**.

## Step 2: elicit the survival horizon before computing

Ask first: **"How many more seasons do you intend to play in this league?"**

- Under 5 more seasons: delta at the bottom of the band, **0.80**. Contending usually wins. Say so before running anything.
- Indefinite, established league with dues: delta = 0.90-0.92.

A stated intent under 5 seasons is itself the answer. Do not run a 10-year model
for someone who is leaving in 3; report the short-horizon verdict and stop.

## Step 3: set the discount

`delta` is a **league-survival hazard**, not a cost of capital. It answers "will this season be played by me in this league", not "is the projection right".

```
delta = (1 - 0.06 league folds) * (1 - 0.05 you leave) * (1 - 0.02 format change) = 0.875
default delta = 0.88
band 0.80 (stated intent under 5 more seasons) to 0.92 (5+ years, dues, full rosters, committed commissioner)
default band for an ongoing league 0.85 to 0.92
never 1.0, never below 0.75
```

No finance discount rate on TITLE EQUITY. Anything above 10%/yr here is a short
window wearing a disguise. State the rate explicitly every time.

This ban applies to title equity only. Discounting an ASSET's value for landing
outside your window (see `dynasty-age-curve-timing`, which uses 10-15%/yr) is a
different quantity: that is a price adjustment on a tradeable good, not a survival
probability on a season. Both can be true at once. Never apply the asset rate to
equity or the survival rate to an asset.

### Discount weight table

| t | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| delta^t | 1.00 | 0.88 | 0.77 | 0.68 | 0.60 | 0.53 | 0.46 | 0.41 | 0.36 |

Sum at H=8: **5.70 weight units.** Effective horizon 1/(1-delta) = **8.33**.

The criticism, quantified:

- Years 0-2 hold 2.65 of 5.70 units = **46% of an H=8 budget**, but only **32% of the infinite-horizon total (8.33)**.
- So a 3-year window sees roughly **one third** of available championship equity. A rebuild parks most of its return in the other two thirds.
- Tail past year 9 = delta^10/(1-delta) = 0.279/0.12 = **2.32 units, 28% of total**. That tail is why terminal value cannot be dropped.

## Step 4: terminal value (mandatory)

```
TV = delta^(H+1) * [ lambda * p_H + (1 - lambda) * (1/N) ] / (1 - delta)
lambda = 0.5
```

Half the roster's advantage persists past the horizon, half reverts to fair share. Without TV, truncation silently zeroes the younger roster's residual advantage and the horizon choice IS the answer.

**Stress-test at lambda = 0 (full mean reversion) and lambda = 1 (no reversion). Report whether the sign flips.**

## Step 5: report delta-star

`delta-star` = the indifference discount at which the two paths tie.

- delta-star inside **[0.80, 0.95]**: the decision is **discount-sensitive**. Give two conditional recommendations, not a verdict. "If you play 5+ more seasons, X. If fewer, Y."
- delta-star outside that band: the verdict is robust, state it plainly.

## Step 6: print the crossover year

```
break_even_year ~= 3 + (p_0 / (1/N))
```

- p_0 = 1.4%, N = 10: **year 3.1**. A 3-year test stops one year short by construction.
- p_0 = 20%, N = 10: **year 5.0**.

Always print the crossover year so the reader sees where the chosen window falls relative to it.

## Step 7: pick the objective function (ask which)

Two objectives, they rank spiky strategies differently:

1. **Linear expected titles** (maximize titles over the league's life): `sum of delta^t * p_t`.
2. **P(at least one)** ("win one before I quit"): `1 - product over t of (1 - delta^t * p_t)`.

Worked contrast, undiscounted: one 25% shot gives **0.250 expected** and **25.0% P(at least one)**. Three 10% shots give **0.300 expected** and **27.1% P(at least one)**. Spread wins on both. Report both metrics; when they disagree, ask which one the manager actually wants.

## Step 8: simulation hygiene before any delta is reported

```
SE = sqrt(p(1-p)/n)
SE of the DCE sum = sqrt(sum of delta^(2t) * SE_t^2)
```

- At p=0.15, n=400 gives **SE 1.8pp**, larger than most trade deltas.
- Use **common random numbers**: same seed for base and whatIf, paired comparison. Cuts required sims **3-10x**.
- **Minimum reportable delta at 4000 sims: 1.0pp.** Resolving 0.7pp needs ~16,000 sims.
- Never flip a strategic recommendation on a sub-1pp delta.

## Step 9: age every roster, not just yours

`p_t` is a **relative** quantity. Run `projectLeagueForward`: age and convert picks for **all N rosters**. Projecting only your roster forward turns a title-odds model into a decay model and makes every rebuild look better than it is.

**No delta-DCE may be reported from a one-sided projection.**

## Step 10: know where this simulator stops being trustworthy

Two measured artifacts. Both bite the out-years, which is exactly where a long horizon
puts its weight, so state them whenever you quote a season past +3.

**1. No roster persistence.** Each simulated season takes TODAY's roster, ages it, and
converts picks. It does not carry forward what would actually have happened: players
acquired, dropped, drafted, streamed, or aged out in the intervening simulated seasons.
A "+6 years" roster is "today's roster, six years older, every pick converted", not a
roster anyone would really be fielding. This biases **against** the strategy that
depends most on mid-course roster churn, which is a rebuild, because a real rebuilder
keeps trading through the sell phase and this model freezes him after one transaction.

**2. The draft-slot feedback loop oscillates.** `pickValueBySlot` rewards a bad finish
with a better pick, which is correct and necessary (without it losing buys nothing and
the model can only ever say contend). But because the roster does not persist, the loop
has no damping: a bad year earns a great pick, the pick converts, the roster jumps, the
next pick is bad, it falls back. Measured on one roster, do-nothing:

| | 2028 | 2029 | 2030 | 2031 | 2032 | 2033 |
|---|---|---|---|---|---|---|
| Feedback ON | 7.7% (#5) | 8.5% (#3) | 6.5% (#5) | 12.2% (#3) | 9.0% (#6) | 12.6% (#4) |
| Feedback OFF | 6.4% (#6) | 9.5% (#3) | 8.5% (#3) | 11.0% (#3) | 12.3% (#3) | 14.5% (#2) |

Feedback OFF is smooth and monotone. Feedback ON saws between 3rd and 6th. The
oscillation is an artifact, not a forecast.

**Rules that follow:**

- **Never quote a single out-year title percentage as a prediction.** Quote the trend.
- Read year-by-year figures only through +3. Past that, use the DIRECTION and the
  discounted total.
- Report both feedback settings when a verdict hinges on a season past +4. If the two
  disagree about the ranking of two strategies, the horizon cannot settle it and you
  should say so rather than pick.
- The long-horizon defence of a rebuild is legitimate, but it cannot rest on a single
  spiky out-year. A rebuild that wins only in 2032 and only with feedback ON has not
  been shown to win.

## Worked example: the owner's roster, same paths, opposite verdicts

10-team, 1QB PPR. 8th of 10 in projected starter points, titleOdds_now 1.4%,
titleOdds_reachable 10.2%, young top (RB Love 21, RB Achane 24, TE McBride 26), 5
firsts, three startable QBs in a 1QB league.

These are MEASURED trajectories from the simulator, not illustrative shapes.

| Plan | 2026 | 2027 | 2028 | 2029 | 2030 |
|---|---|---|---|---|---|
| Convert and contend | 10.2% | 9.2% | 8.5% | 7.7% | 5.2% |
| Do nothing | 1.4% | 4.0% | 6.1% | 9.0% | 9.7% |
| Tear down and rebuild | 0.0% | 0.0% | 0.1% | 0.4% | 1.0% |

Over 10 seasons:

| Plan | Raw sum | DCE at delta=0.88 |
|---|---|---|
| Convert and contend | 61.9% | **43.1%** |
| Do nothing | 77.6% | 42.5% |
| Tear down and rebuild | 45.4% | 21.0% |

Two lessons, and the second one is the one that was learned the hard way.

**The horizon really does move verdicts.** Do-nothing's raw sum (77.6%) beats
contend's (61.9%), and discounting reverses it. A rebuild's raw sum likewise looks far
better than its discounted one, 45.4% against 21.0%. Anyone quoting an undiscounted
sum over a long window is arguing for patience by arithmetic sleight of hand.

**But the horizon is not a licence.** Here the rebuild loses at EVERY horizon and every
discount tested, and it spends five consecutive seasons in last place to do it. The
horizon rule exists to stop a good rebuild being rejected by a short window. It does
not make a bad rebuild good, and it is not a reason to skip
`dynasty-roster-phase-diagnosis`. On this roster the reachable number was 1.02x fair
share, which meant the correct call was CONVERT, and the horizon argument was being
used to defend a teardown that never should have been on the table.

**Check the reachable number first. Then argue about the window.**

- delta-star for this pair = **0.84**. Inside [0.80, 0.95], so this is discount-sensitive: it genuinely hinges on how many more seasons he plays.
- break-even year at p_0 = 1.4% in a 10-team league = **3 + 0.14 = year 3.1**.
- p_0 = 1.4% means the entire year-0 cost of rebuilding is 0.014 of a 5.70-unit budget, **under 0.25% of total equity**. "This hurts next season" is a rounding error. Say it numerically.
- Three startable QBs in a 1QB league contribute exactly zero to `p_t` in every year. Their whole market value converts at **zero p_t cost**. Flag that before analyzing any harder tradeoff.

## Guard rails

**Optionality tie-breaker.** If `|delta-DCE| < 1.5 percentage points`, take the higher-optionality side: younger, more picks, more convertible surplus. Justification is conversion taxes, not vibes: youth to win-now costs 10-20% of market plus a 5-15% contender premium; win-now back to youth after a bad start costs 25-40%. Optionality is worth **1-3pp of aggregate equity**, so it breaks ties under 1.5pp but **never overturns a 5pp gap**.

**Late-years disclosure.** If a strategy's DCE edge comes **more than 60% from year 6 and later**, say so plainly: "the terminal-value assumption is doing the work here." Then show the lambda=0 and lambda=1 branches.

**Neither-plan-is-a-plan check.** If `p_t < 1/N` for three consecutive years under **both** strategies, stop. The problem is asset quality, not timing. The answer is "acquire better assets", not "pick a window."

## Output template

```
Horizon: H = 8 (set by rebuild flip year 3 + 4; refuse H<=3)
Seasons intended: <elicited>  ->  delta = 0.88 [band 0.85-0.92, survival hazard only]
Break-even year: 3 + (p_0 / (1/N)) = <year>

Path A p_t: ...
Path B p_t: ...

CTE(3):  A ____  B ____   [reported only for contrast, not the verdict]
CTE(8):  A ____  B ____
TV:      A ____  B ____   (lambda=0.5; lambda=0 -> __, lambda=1 -> __, sign flip? Y/N)
DCE:     A ____  B ____   delta-DCE = ____ pp

delta-star = ____   [discount-sensitive if in 0.80-0.95]
Objective: linear expected titles ____ | P(at least one) ____
Sims: n = ____, common random numbers Y/N, SE(delta) = ____ pp
All N rosters aged forward: Y/N
Share of edge from year 6+: ____%
```

## Failure modes

1. **3-year windows on multi-year strategies.** The single most common error. A 3-year test sees ~32% of infinite-horizon equity and 100% of a rebuild's cost. It is invalid, not conservative. Refuse it, do not caveat it.
2. **Undiscounted sums.** Makes the answer discontinuous in H. The analyst picks the winner by picking the window.
3. **Missing terminal value.** Silently zeroes the younger roster's residual advantage. In the worked case it hid 55% of the rebuild's edge.
4. **Inflated discount rates.** Any delta below 0.85, or any "rate" borrowed from finance, is a short window in disguise. Above 10%/yr, stop and re-derive from the three survival hazards.
5. **Double-discounting projection uncertainty.** Already inside the Monte Carlo. Discounting it again is a systematic anti-rebuild bias.
6. **Comparing projected starter points instead of title probability.** Points are linear; titles are convex. A 12% points edge can be a 3x title-odds edge, and the reverse understates rebuild payoffs at the top of the S-curve.
7. **One-sided aging.** Projecting only your roster forward is a decay model, not a title-odds model.
8. **Flipping a verdict on Monte Carlo noise.** Sub-1pp deltas at 4000 sims are unresolved. Raise n or declare the paths equivalent.
9. **Skipping the delta-star report.** A verdict at delta=0.88 with delta-star=0.87 is a coin flip presented as a conclusion.
10. **Analyzing hard tradeoffs before liquidating zero-contribution surplus.** QB2 and QB3 in a 1QB league convert at zero cost to any p_t in any year. Free money first.
