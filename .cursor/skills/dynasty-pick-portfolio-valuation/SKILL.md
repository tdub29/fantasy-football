---
name: dynasty-pick-portfolio-valuation
description: Use when pricing rookie draft picks in a dynasty league. Triggers on "what are my picks worth", "is five firsts enough", "should I trade for more picks", "how many picks is too many", "what's a 2027 first worth", "should I sell my picks", "when do I buy picks", "are future firsts appreciating", "pick value share", "will these picks turn into starters", "am I hoarding picks", "how many of my picks will hit", "is this pick class overpriced", "trade picks for players", "when to sell picks". Prices picks as a probabilistic portfolio using hit rates and a target-year startability factor instead of quoting chart value.
---

# Dynasty pick portfolio valuation

A pick is not a player. It is a lottery ticket with a published payoff table, denominated in a future season. Price it as an expected value against a stated target year, and price a stack of picks as a portfolio with a hit distribution, never as a sum of chart values.

Scope: pricing and timing of PICKS. Phase diagnosis belongs to `dynasty-roster-phase-diagnosis`. Sell/hold timing on PLAYERS belongs to `dynasty-age-curve-timing` and `dynasty-rebuild-clock`. Horizon arithmetic belongs to `dynasty-championship-equity-horizon`. Package construction belongs to `dynasty-trade-construction`.

## The core equation

```
EV(pick, targetYear) = chartValue x hitRate x startability(targetYear)
```

Startability by seasons since the pick converts to a rookie:

| Seasons since draft | 1 | 2 | 3 | 4+ |
|---|---|---|---|---|
| Startability | 0.75 | 0.85 | 0.93 | 1.00 |

Quoting chart value alone double-counts. Chart value already prices the market's guess at the pick; multiplying by the hit rate and startability is what converts that market price into value you can actually field in a specific season.

Worked: a mid 1st, chart 50-58, hit rate 0.50.
- Evaluated for THIS season: 0.50 x 0.75 = 0.38 of chart.
- Evaluated for year 4: 0.50 x 1.00 = 0.50 of chart, plus the option value of the hit tail.

That 0.38 vs 0.50 gap is the entire reason a contender and a rebuilder can honestly disagree on the same pick's price.

## Hit rates

Hit = sustains dynasty-startable value for 2+ seasons.

| Slot | Hit rate |
|---|---|
| Early 1st, RB | 0.80 |
| Early 1st, non-RB | 0.65 |
| Mid 1st | 0.50 |
| Late 1st | 0.35 |
| 2nd | 0.20 |
| 3rd and later | 0.08 |

Five mixed firsts expect ~2.4 hits, ~1.8-2.2 long-term starters, and 0.5-0.7 elite pieces. Five firsts is a portfolio, never five studs. A plan that assumes full conversion has no error bars and is not a plan.

## Pick-to-points conversion

```
points = max(0, (-14 + 3.7 x tierValue) x 0.75)
```

Break-even tier value is ~3.8; below that the pick projects to zero startable output.

**This formula already contains the 0.75 rookie-year factor.** It is the same
constant as the rookie column of the startability table above, applied once, here.
Do NOT then multiply the result by startability(rookie year) as well; that squares
the discount and prices a rookie first at 0.56 of chart. The two paths are
alternatives, not stages:

- Want dynasty VALUE you can trade? Use `EV = chartValue x hitRate x startability(targetYear)`.
- Want SEASON POINTS for a lineup or a sim? Use the points formula, once, and stop.

Never sum the two for the same pick. That is failure mode 6 below.

| 2027 pick | KTC | Projected rookie points |
|---|---|---|
| Early 1st | 7304 | 192 |
| Mid 1st | 5628 | 146 |
| Late 1st | 4905 | 126 |

Reference lines in this format: starter line ~180 points, FLEX line 130-150. Only EARLY firsts project as year-one starters. Mid and late firsts land at or below the FLEX line.

## 1QB tier chart

| Pick | Tier value |
|---|---|
| 1.01 | 90 |
| 1.02 | 80 |
| 1.03 | 70 |
| 1.05 | 53 |
| 1.08 | 42 |
| 1.12 | 34 |
| 2.01 | 32 |
| 2.12 | 21 |
| 3rd round | 10-16 |
| 4th round | 4-8 |

Future firsts: early 65, mid 45, late 30. That implies a 15-25% discount for one year of waiting.

Slot convexity: 1.01 is ~2x 1.05 and ~3.5x 1.10. Pick capital is not linear in draft position, so "I have five firsts" says almost nothing until the slots are named.

## Class hype premium is separate from slot value

Slot value answers "where in the draft". Class premium answers "which draft". They multiply, and the second one is where mispricing lives.

2027 firsts against the historical future-first baseline:

| Tier | Premium |
|---|---|
| Early | +38.5% |
| Mid | +17.5% |
| Late | +11% |

Rule: anything above +25% over baseline is a SELL trigger. Holding a hyped class returns value maintenance, not appreciation. The blanket "future picks appreciate 10-20% per year" heuristic prices the wait, not the hype, and it does not apply to a class that has already been repriced.

## Liquidity bands

Pick value as a share of total roster dynasty value:

| Band | Share | Meaning |
|---|---|---|
| Green | < 22% | Convertible, keep operating |
| Amber | 22-35% | Concentrated, watch it |
| Locked | > 35% | Cannot close a consolidating trade |

Targets by stance: contender < 12%, rebuild 25-35%, never above 35%.

Above the lock, stop acquiring and start converting. No consolidating trade can be closed because nobody trades a proven starter for a bag of futures at full price, and the rebuild has stopped compounding. It is now just waiting.

## The 10-team stack limit

In a 10-team league, sell everything past the third first. Firsts 4 and 5 convert to roughly 0.9 hits combined, and neither hit projects above the FLEX line in its rookie year. Marginal firsts beyond three buy bench players at starter prices.

## Seasonal pricing cycle

| Window | Pricing | Action |
|---|---|---|
| April-May, 6 weeks pre-rookie-draft | Annual peak | SELL |
| June-August, post-draft hangover | 10-15% below peak | BUY |
| Into the trade deadline | 10-20% recovery as contenders bid | SELL to a contender |

Sell picks into the April-May peak or to a contender pre-deadline. Buy in the hangover. This owns pick timing only; player-side deadline timing belongs to `dynasty-rebuild-clock`.

## Decision procedure

1. **State the target year.** No pick has a price without one. "What is my 1st worth" is unanswerable until you name the season you intend to field the player.
2. **Look up chart value by SLOT**, not by round. Use the 1QB tier chart. Unknown slot means a range, not a point estimate.
3. **Apply the class premium.** Check the class against the historical future-first baseline. Above +25%, flag it as a sell candidate before doing any further math.
4. **Multiply by hit rate for that slot.**
5. **Multiply by startability for the target year** (0.75 / 0.85 / 0.93 / 1.00).
6. **For a stack, sum expected hits, not values.** Report the hit count and the expected number of startable bodies, with the 0.5-0.7 elite-piece expectation stated separately.
7. **Compute pick value share.** Picks / total roster dynasty value. Place it in a band and compare it to the stance target.
8. **Check the stack limit.** More than three firsts in a 10-team league means firsts 4+ are on the block.
9. **Time the transaction** against the seasonal cycle.
10. **Report EV as a fraction of chart, with the target year attached.** Never report a bare chart number.

## Diagnostic questions

Ask these before quoting any pick price.

1. What season are you trying to field this player in?
2. What is the pick's expected SLOT, not just its round?
3. Is that class trading above or below the historical future-first baseline?
4. What is your pick value share right now, and which band does it sit in?
5. How many firsts do you already hold, and what are their slots?
6. Are you buying in the post-draft hangover or at the April-May peak?
7. Does your model count both the pick's chart value and the projected rookie's points? (If yes, it is broken.)

If any of the first four has no answer, the pick cannot be priced and the correct output is "underspecified", not a number.

## Worked example: the owner's roster

State: 8th of 10 in projected starter points, ~1.4% title odds, young at the top (RB Jeremiyah Love 21, RB Achane 24, TE McBride 26), five first-round picks, three startable QBs in a 1QB league.

**Target year.** At 1.4% title odds this season, the target year is not this season. Set the target at year 4 (the first plausible window open), so startability = 1.00 on picks converting in 2027 and maturing by 2029-2030.

**Portfolio math.** Assume the five firsts run roughly one early, two mid, two late:
- Early 1st non-RB: 0.65 hits
- 2 x mid 1st: 1.00 hits
- 2 x late 1st: 0.70 hits
- Total: ~2.35 expected hits, ~1.8-2.2 long-term starters, 0.5-0.7 elite pieces.

Five firsts, roughly two real starters and a coin flip on one difference-maker. Not five core players.

**Year-one startability.** Only the early first projects above the ~180-point starter line (192). Both mids project 146 and both lates 126, both at or below the 130-150 FLEX line. So four of the five picks are, in their rookie season, FLEX bodies.

**Class premium.** 2027 firsts are +38.5% early, +17.5% mid, +11% late. The early first is above the +25% sell trigger. Holding it returns value maintenance, not appreciation. It is the single best sell in the stack precisely because it is the most valuable and the most overpriced.

**Stack limit.** Ten-team league, five firsts. Sell everything past the third. Firsts 4 and 5 combine for ~0.9 hits and neither projects above FLEX in year one.

**Liquidity.** Compute picks / total roster value. If it is above 35%, stop acquiring immediately and convert; the roster owns Love, Achane and McBride and cannot close a consolidating trade around them with futures nobody wants at par. Rebuild target band is 25-35%.

**Timing.** Sell the surplus firsts in the April-May pre-draft peak or to a contender before the deadline. Do not buy rookies during draft week; that is the annual price top.

**Third QB.** In a 1QB league the third QB is not pick capital, but it is the same category of error: value that cannot enter the lineup. Convert it and note that a third-round rookie pick (tier 10-16) is a fair floor, not an insult. See `dynasty-roster-phase-diagnosis` for the surplus test.

**Verdict shape.** Sell two firsts (the +38.5% early one and the weaker late one) into the April-May peak, hold three, target year 4, expect ~1.5 hits from the retained three. That is a priced plan with error bars. "I have five firsts so I'm loaded" is not.

## Failure modes

1. **Chart value without hit rates.** Quoting 50 for a mid first and treating it as 50 of realized value. The correct number is 0.38-0.50 of chart depending on the target year. This inflates every pick-heavy trade and every rebuild projection.
2. **Hoarding past the 35% liquidity lock.** More picks past the lock produce value maintenance, not growth. The roster becomes unable to execute the very consolidation the picks were accumulated to fund.
3. **Stockpiling a class already priced +38.5% over baseline.** Buying the appreciation after it has been paid. Above +25% the class is a sell, not an accumulation target.
4. **Planning a window around 5 firsts as 5 core players.** The honest expectation is ~2.4 hits and 0.5-0.7 elite pieces. Any window plan built on full conversion has assumed away its own risk.
5. **Buying rookies at draft-week peak while rebuilding.** The rebuilder's buy window is the June-August hangover, 10-15% cheaper. Paying peak while rebuilding is paying the contender's price on the rebuilder's timeline.
6. **Double-counting.** Never count both a pick's chart value AND the projected rookie's points in the same model. Counting the same asset twice inflates every rebuild projection and is the most common silent error in pick-heavy analysis.
7. **Calling picks "low value".** Picks contribute structurally zero to this season's lineup and full weight to a future one. "Low value" is a statement about the chosen horizon, not about the asset. A pick is value denominated in a different year.
8. **Pricing a pick without naming a target year.** Any pick price quoted without a stated season is not wrong, it is undefined.
