---
name: dynasty-trade-construction
description: Use when judging or building a dynasty trade offer. Triggers on "is this trade fair", "should I accept this offer", "build me a counter-offer", "the calculator says it's even", "2-for-1", "3-for-1", "should I consolidate", "I have too much depth", "what do I do with my extra QB", "is my roster too top heavy", "do I have enough startable bodies", "what can I package", "who should I trade for", "does this offer make sense", "counter this". Anchors evaluation on the biggest single asset moving and on roster shape (concentration, startable bodies, legal-lineup surplus) instead of summed calculator value. For phase (rebuild/retool/contend) see dynasty-roster-phase-diagnosis; for horizon math see dynasty-championship-equity-horizon; for sell-by ages see dynasty-age-curve-timing; for pick EV see dynasty-pick-portfolio-valuation.
---

# Dynasty trade construction

Value is convex in the top asset. Two players at 45 tier value do not equal one at 90. Only one asset occupies the roster's best lineup slot, the second one displaces a starter you already had, and the market pays a consolidation premium on top. Every evaluation is anchored on the biggest single asset moving. Summed calculator totals are the wrong unit.

## Diagnostic questions (ask before evaluating anything)

1. What is the headliner on each side, by tier value?
2. What is my top-3 share of roster dynasty value?
3. How many startable bodies do I have, and how many does the lineup need?
4. Which assets on my roster fail the surplus test against the LEGAL lineup?
5. What phase am I in, and what horizon is this trade being scored on?
6. What does this trade do to the OTHER roster's title odds?

If question 1 has no answer for one side, the offer is a pile, not a trade.

## Step 1: headliner anchor

Identify hiHeadliner (largest single asset going one way) and loHeadliner (largest single asset going the other).

Anchor band: loHeadliner must land in **70-100%** of hiHeadliner.

- Inside the band: proceed to the consolidation premium.
- Below 70%: report **"no anchor available."** Do not assemble a KTC-equal pile to close the gap. A pile of 25s against a 90 is a decline even when the calculator balances.

## Step 2: consolidation premium (the tool's formula)

```
gap     = 1 - loHeadliner / hiHeadliner
spread  = min(1, extraPieces / 3)          # extraPieces = count of non-headliner assets on the pile side
premium = 0.15 * gap * spread              # ceiling 15%
```

The pile side owes the headliner side that premium on top of nominal value. Apply it before declaring an offer even.

Worked: hiHeadliner 90, loHeadliner 72, pile side adds 3 extra pieces.
gap = 1 - 72/90 = 0.20. spread = min(1, 3/3) = 1.0. premium = 0.15 x 0.20 x 1.0 = **3.0%**.
72 is 80% of 90, inside the band, so this is a legal counter and costs 3% of nominal.

Worked: hiHeadliner 90, loHeadliner 60. 60/90 = 67%. Below the band. Output "no anchor available" and stop, regardless of what the pile sums to.

## Step 3: surplus test against the legal lineup

An asset is surplus when the roster's **best legal starting lineup is unchanged after removing it.** Run this against the lineup model, not the depth chart.

This format: QB/RB/RB/WR/WR/TE + 4 FLEX restricted to RB/WR/TE, 10 teams.

- QB3 is a **strict zero**. It cannot enter the lineup under any circumstance short of two QB injuries. Full carrying cost, zero production offset.
- QB2 is injury insurance only. Expected QB1 absence is ~1.5 of 17 games, so QB2's realized edge over a waiver QB is roughly 6 points across a season.
- Sell down to **lineup requirement + 1** at every position, in every phase. Phase does not change this; a zero contributes zero to a contender and to a rebuilder alike.
- If no offer beats a 3rd-round rookie pick (tier 10-16), **take the third or drop him for the roster slot.** Do not hold a zero-lineup-value asset waiting for a market a 10-team 1QB format cannot produce.

## Step 4: discount the outgoing side by replacement level, not by KTC sum

In a 10-team league ~200 players are rostered against ~350 relevant NFL skill players, so ~40% of relevant players sit in free agency. Replacement-level FLEX is 8-10 PPR points per week.

The real cost of two throw-ins in a 3-for-1 is their **gap over a free-agent FLEX**, a few points per week, not their combined tier value. This is the structural reason star consolidation is a better trade here than in a 14-team league. Do not port a 12-team or 14-team consolidation heuristic into this format.

Corollary: if a throw-in's weekly edge over waivers is under ~3 points, price him near zero in the trade and keep the roster slot in mind instead.

## Step 5: value concentration and body count

Concentration = top-3 assets as a share of roster dynasty value.

| Top-3 share | Read | Action |
|---|---|---|
| < 20% | No headliner. The bracket cannot be won. | Consolidate many-to-one, upward. |
| 25-33% | Healthy contender shape. | Hold shape; trade at the margin. |
| > 35% | Stars-and-scrubs, injury-fragile. | Add startable depth to 13-14 bodies BEFORE adding another headliner. |

Startable-body target: **13-14** (10 starters plus 3 for byes and injuries). Bodies 14+ are optionality only and convert to trade currency at no cost to weekly points.

A roster under 20% concentration cannot fix itself by adding a sixth FLEX-caliber body. Six FLEX bodies is still zero headliners.

## Step 6: price the roster slot

A marginal bench slot in a 10-team league converts to a startable player at ~5-10% per season. Against a late-2nd equivalent (~21 tier value) that is **1-2 tier-value points per year** of opportunity cost per wasted slot.

Three QBs in a 1QB league bleeds **2-4 points per year** in slot cost, plus the QB value decay on the assets themselves. That is a recurring charge, not a one-time one, and it is charged whether or not you ever get an offer.

## Step 7: model both sides

Run whatIf on your roster AND on the counterparty's. Selling a producer to the #2 roster raises their title odds, which subtracts from yours by more than the outgoing value implies. A one-sided whatIf systematically overstates the benefit of selling. Never report a trade verdict computed on your roster alone.

Related: any forward projection must age and convert picks for all 10 rosters, not just yours.

## Step 8: market price vs fair value

KTC and any trade calculator is a **market price with lag**, not truth.

- Injuries reprice in days.
- Age cliffs reprice a full offseason late.

A defensible fair value and a tradeable value can legitimately differ **15-25%**. "The calculator says it is even" is a statement about consensus, not about correctness. Quote both numbers when they diverge: what he is worth, and what he will fetch.

## Conversion taxes (quote these when shaping an offer)

| Direction | Tax |
|---|---|
| Youth or picks into win-now | 10-20% of market, plus a 5-15% contender premium |
| Win-now back into youth after a bad start | 25-40% |

The asymmetry is why optionality is worth something. It is typically worth 1-3 percentage points of aggregate title equity, enough to break near-ties and never enough to overturn a large gap.

## Noise floor

At 4000 sims, standard error at p=0.10 is 0.47pp and the SE of a two-path difference is 0.67pp. **Never flip a trade recommendation on a sub-1.0pp title-odds delta.** Report "inside Monte Carlo noise," then either raise to ~16,000 sims with common random numbers (same seed, paired) or declare the paths equivalent. See dynasty-championship-equity-horizon for the full noise math.

## Decision procedure

1. Name both headliners. No headliner on one side means no trade to evaluate.
2. Check the 70-100% anchor band. Outside it, output "no anchor available" and stop.
3. Apply `0.15 * gap * spread` to the pile side.
4. Run the surplus test on every asset leaving. Zero-lineup-value assets cost nothing to spend.
5. Discount incoming and outgoing depth to its gap over replacement FLEX, not its tier value.
6. Recompute top-3 share and startable-body count post-trade. Reject any trade that pushes concentration past 35% while body count is under 13.
7. Score both rosters with whatIf over **`H >= max(7, years_to_flip + 4)` seasons**, never one. State the discount you used and run the sensitivity across [0.80, 0.95] before reporting anything. A one-season score rejects every rebuild by construction, because a rebuild gives up years 1-3 to buy years 4-8. This step is where that error re-enters the family; `dynasty-championship-equity-horizon` owns the formula.
8. If the title-odds delta is under 1.0pp at 4000 sims, report noise, not a verdict. Pair your seeds and quote the spread; a single run at 6000 sims cannot resolve a delta under ~0.15pp and will sometimes hand you the wrong sign.

## Worked example: this roster

State: 8th of 10 in projected starter points, 1.4% title odds, top-end is RB Jeremiyah Love 21, RB De'Von Achane 24, TE Trey McBride 26. Five first-round picks. Three startable QBs.

**Surplus test first.** QB3 changes the best legal lineup by 0.0 points. QB2 changes it by ~6 points across a season. Lineup requirement is 1, so requirement + 1 = 2 QBs. QB3 is an unconditional sell, first in the sequence, before any core decision. If the best offer is under a 3rd (tier 10-16), take the third. If nobody bids, drop him: the slot alone is worth 1-2 tier points a year and the asset decays for free while you wait.

**Concentration.** Love, Achane, McBride are the top 3. If they clear 35% of roster value, the shape is already stars-and-scrubs and the next move is startable bodies up to 13-14, not another headliner. If they sit under 20%, no bracket is winnable and the five firsts plus the QB surplus should be consolidating into one asset in the same tier as the league's best.

**Anchor discipline on the five firsts.** Firsts 4 and 5 are not a headliner and cannot be assembled into one. If the target's headliner is a 90 and the best single first available is a mid-1st at ~45 tier value, that is 50% of the headliner, below the 70% floor. Output "no anchor available" rather than sending 5 picks that sum to 90. To reach the band the package must lead with a rostered player at 63+ tier value, with picks as the extra pieces.

**Slot arithmetic.** Three QBs currently costs 2-4 tier-value points per season in slot opportunity cost plus QB-curve decay. At 1.4% title odds none of that cost buys any title equity. It is the cheapest fix on the roster and it is free.

**Both sides.** Any Achane sale must be scored against the buyer's roster too. Selling him to the current #2 raises their odds and lowers yours by more than his tier value suggests. If the resulting delta is under 1.0pp at 4000 sims, that is noise and the trade should be decided on shape (concentration, body count, surplus) rather than on the simulated delta.

## Failure modes

- **Balancing on summed calculator totals.** The pile side loses by up to 15% before anyone opens the app. Anchor on the headliner.
- **Retooling with six FLEX-caliber bodies instead of a headliner.** Depth cannot manufacture a top asset. A team that accumulates mid-tier pieces stays 6th forever.
- **Holding surplus because the player is good.** Good is not the test. Marginal contribution to the best legal lineup is the test. QB3 is good and worth exactly zero.
- **Treating KTC as ground truth.** It is a lagged consensus price. Fair value and tradeable value can differ 15-25%, and the age-cliff lag is the edge.
- **Scoring a trade on your roster only.** A one-sided whatIf always makes selling look better than it is.
- **Discounting throw-ins at their KTC value.** In a 10-team league with ~40% of relevant players free, two throw-ins cost a few points per week, not their tier sum.
- **Flipping a recommendation on a 0.4pp simulated delta.** That is inside the noise band at 4000 sims.
- **Adding a headliner to a roster already above 35% concentration and under 13 startable bodies.** One injury removes a disproportionate share of the title odds you just bought.
