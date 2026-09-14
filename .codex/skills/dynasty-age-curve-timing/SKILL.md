---
name: dynasty-age-curve-timing
description: Use when deciding whether to buy, hold, or sell a specific dynasty player based on his age. Triggers on "should I sell this player", "is he too old", "when do I sell my RB", "he's still producing so why sell", "buy low on an aging veteran", "is 26 too old for a running back", "when does a WR fall off", "hold or sell", "is he past his peak", "age curve", "aging curve", "what's my core's peak window", "how long do I have with this guy", "he had a great year, why is his value dropping". Fires buy and sell triggers off the divergence between the dynasty VALUE decay curve and the PRODUCTION decay curve. For phase diagnosis use dynasty-roster-phase-diagnosis; for horizon math use dynasty-championship-equity-horizon.
---

# Dynasty age curve timing

Two curves govern every aging asset. They peak at different ages and decay at different rates. The gap between them is the entire sell window. Substituting one for the other is the single most common dynasty valuation error.

## The two curves, never substituted

**Dynasty VALUE (ageRetention).** Net present value of the whole remaining career. Use it for "should I trade him."

**PRODUCTION (productionRetention).** One season of fantasy points. Use it for "how many points does my lineup score in year N."

Value peaks BEFORE production, because value prices the entire forward stream and production only prices the next 17 games. An asset can be a strong sell and your best starter in the same week. That is not a contradiction, it is the arbitrage.

### PROD_CURVE (points in year N)

Growth +7%/yr while below the grow-to age. Flat through the hold-to shoulder. Then compounding decline that accelerates 15% per additional year past the shoulder.

| Pos | Grow to | Hold to | Decline/yr |
|---|---|---|---|
| RB | 24 | 26 | 13% |
| WR | 25 | 28 | 8% |
| TE | 26 | 29 | 7% |
| QB | 27 | 33 | 6% |

### VALUE curve (tradeable dynasty value)

Retention shape: 1.00 through peak age, 0.92 through sell age, linear fall to 0.47 at hard-sell age, 0.25 beyond. Decay per year past peak: RB 22%, WR 10%, TE 10%, QB 5%.

| Pos | Peak | Sell | Hard-sell |
|---|---|---|---|
| RB | 25 | 26 | 28 |
| WR | 26 | 28 | 31 |
| TE | 27 | 30 | 32 |
| QB | 28 | 31 | 35 |

Half-lives. Value: RB 2.8 yrs, WR 6.6, TE 6.6, QB 13.5. Production: RB 5.0, WR 8.3, TE 9.5, QB 11.2.

## Decision procedure

1. **Name the question.** Trade or lineup. Trade uses the VALUE curve. Lineup projection uses PROD_CURVE. If the answer mixes them, stop and re-run.
2. **Get age on opening day of the season in question**, not current age.
3. **Locate the player on both curves.** Below grow-to age = pre-peak, hold or buy. Between grow-to and sell age = the sell window is open. Past hard-sell = the market is already gone, take any offer.
4. **Apply the sell trigger** (below) with the title-odds override.
5. **If holding, price the cost of waiting** from the waiting table and state it in percent of dynasty value, not in adjectives.
6. **If contending, run the arbitrage ratio** to see whether the position is a buy at that age instead.
7. **Check the durability shoulder.** Past it, subtract availability on top of production decay.
8. **Check window overlap** against the rest of the core before calling any hold correct.

## Sell trigger

The trigger fires off the **VALUE curve's sell age**, not the production curve. This
matters and is easy to get backwards: value leads production by about a season, so
by the time the box score shows decline the trade price is already gone. The trigger
is "sell while he is still producing", which is a statement about the VALUE curve.

| Pos | VALUE sell age (the trigger) | PROD hold-to (still producing) |
|---|---|---|
| RB | 26 | 26 |
| WR | 28 | 28 |
| TE | 30 | 29 |
| QB | 31 | 33 |

**Sell a producing RB the season he turns 26 unless this year's title odds are at least 1.5x fair share (15% in a 10-team league).** Same rule at WR 28, TE 30, QB 31 in 1QB.

The QB gap is the widest and the most exploitable: a 31-year-old QB is a sell on
value while still three seasons from a production cliff. In 1QB that gap is worth
even more, because the buyer pool for a QB is small (see `dynasty-league-format-leverage`).

At 1.4% title odds the override never fires. Every RB 26 or older is an unconditional
sell. Every WR 28 or older is an unconditional sell.

Do NOT derive this trigger from PROD_CURVE hold-to minus one. That arithmetic gives
25 / 27 / 28 / 32 and disagrees with the table above at three of four positions. The
curves are not interchangeable, which is the whole thesis of this skill.

### Cost of waiting

| Pos | Wait 1 extra season past sell-by | Wait until the decline shows in the box score (2 seasons) |
|---|---|---|
| RB | 22% of dynasty value | 39% |
| WR | 10% | 19% |
| TE | 10% | 19% |
| QB | 5% | 10% |

Two seasons is the correct cost of "waiting for proof" because value leads production by about a year. You do not pay one year of decay to be sure, you pay two.

### The wedge, worked

An RB from 26 to 28 loses roughly 45% of dynasty value (0.92 retention to 0.47) but only about 24% of production (0.87 x 0.85 = 0.74). That roughly 20-point gap is exactly what a well-timed sell captures and exactly what a late sell donates to the buyer.

## Arbitrage ratio: when aging players are a BUY

Arbitrage ratio = production half-life / value half-life.

| Pos | Ratio | Read |
|---|---|---|
| RB | 1.79 | market over-discounts decline the most |
| TE | 1.44 | over-discounts |
| WR | 1.26 | over-discounts |
| QB | 0.83 | market UNDER-discounts, inverted |

Above 1.0 the market charges you less than the points are worth. **A real contender (title odds >= 12 to 15%) should BUY RBs aged 27 to 29 and WRs aged 29 to 31.** You are paying a declining-asset price for a slower-declining points stream.

Below 1.0 the market under-discounts. An aging QB in a 1QB league is a sell on the curve alone, before you even count that he may not be startable.

The same table means the seller and the buyer can both be right. The rebuilder sells RB 27 because value bleeds 22%/yr. The contender buys RB 27 because points only bleed 13%/yr. Neither is being fleeced.

## Compounding runs both directions at once

Over 3 years a 21-year-old RB reaches 1.07^3 = 1.23x production. A 27-year-old RB reaches 0.87 x 0.85 x 0.83 = 0.61x. Ratio 2.0x on production, and wider on value because the market prices forward.

**Hold every pre-peak asset (RB under 25, WR under 26, TE under 27) through any phase.** You capture the remaining value accretion and can still sell at the peak in the year your window opens. Selling ascending youth to accelerate anything is selling the accretion you are paying for.

## Window overlap, not average age

Peak ranges: QB 26 to 33, RB 23 to 27, WR 24 to 29, TE 25 to 30.

**A core needs at least 3 assets sharing at least 3 consecutive peak seasons, beginning within 2 seasons.** Compute the intersection explicitly.

Average age is a trap. A barbell roster (a 21-year-old plus a 27-year-old) reads 24 in average core age with an overlap of zero. It cannot contend as constituted and must sell one end.

## Durability shoulders

Expected games missed rises +12%/yr past: QB 33, RB 26, WR 29, TE 29.

An aging roster loses title odds twice, once through production decay and once through availability. Run both. Points-only aging understates the cost of an old core.

## Curves must be longitudinal

Only "what happens to ONE player as he ages" is a valid curve. A cross-sectional fit says a 32-year-old startable WR scores like a 25-year-old, because every 32-year-old who lost a step already left the startable pool. That is survivorship, not longevity.

Base rates that keep the curves honest: roughly 19% of RBs sustain peak production for 5 or more seasons; 5.7% of top-24 WR seasons since 2010 came after age 32.

## Discount rate depends on the plan

A contender discounts value landing outside its window 10 to 15% per year. A rebuilder applies no discount to value landing in years 4 through 8 and a heavy discount to years 1 and 2. One shared discount rate applied to both plans is a modeling error, and in practice it is win-now bias hiding in the arithmetic.

## Diagnostic questions

Ask before any hold/sell verdict:

1. Is this a trade question or a lineup question? (Picks the curve.)
2. How old is he on opening day of the season in question?
3. What are the title odds THIS season, as a multiple of 1/N? (Sets the override.)
4. What year does this roster intend to contend, and what is his age in that year?
5. What is the cost of waiting one more season, in percent of dynasty value?
6. Does he share 3 consecutive peak seasons with at least 2 other core assets?
7. Is he past the durability shoulder?

## Worked example: this roster

State: 8th of 10 in projected starter points, ~1.4% title odds (0.14x fair share), young top end, 5 first-round picks, three startable QBs in 1QB.

**Override check.** 1.4% is far below the 15% contend threshold. The "hold and cash the production" branch is unavailable on every asset. Every sell trigger fires on schedule.

**Jeremiyah Love, RB 21.** Pre-peak by 3 years on production, by 4 on value. Growing +7%/yr. Over the next 3 seasons he compounds to 1.23x while a 27-year-old RB decays to 0.61x. Hold, do not shop, do not let him be the sweetener in a consolidation. His sell window opens at 26, five seasons out.

**De'Von Achane, RB 24.** Value peaks next season at 25, sell trigger at 26 (two seasons out), hard-sell at 28. He is also at the RB durability shoulder in two seasons. If the roster's flip year is 2029 he arrives at 27, one year past the RB shoulder and past the sell age. He is a SELL despite reading young today. Sell at the value peak (age 25) into a contender at the trade deadline, not in the offseason. Waiting to 27 costs 22% of his dynasty value; waiting until the box score shows it costs 39%.

**Trey McBride, TE 26.** Value peak is 27, sell age 30, hard-sell 32. Production holds to 29. At a 2029 flip he is 29, still inside the TE peak range of 25 to 30. HOLD. His sell trigger fires at 29 to 30, which is on the far side of the window, so he is core, not inventory.

**Window overlap.** Love peaks 23 to 27 (seasons 2028 to 2032). McBride peaks 25 to 30 (through 2030). Overlap 2028 to 2030, three consecutive seasons, two assets. The core needs a THIRD asset whose peak range covers 2028 to 2030: a WR born to peak at 24 to 29 in that span, which is what the picks are for. Achane's peak range (23 to 27) ends in 2029 and he is a sell before it closes.

**Three QBs in 1QB.** The QB arbitrage ratio is 0.83, the only inverted position. QB value decays slower than production, so the market pays you a premium relative to points. Combined with a lineup contribution of zero for QB2 and QB3, this is the cleanest sell on the roster and it costs nothing in any year. Sell down to starter plus one. Construction details live in dynasty-trade-construction; format leverage in dynasty-league-format-leverage.

**Verdict from the curves alone.** Sell Achane at 25, sell QB2 and QB3 now, hold Love and McBride, and buy the third overlap asset young enough to peak in 2028 to 2030. No aging veteran on this roster survives the override at 1.4%.

## Failure modes

1. **Swapping the curves.** Quoting production retention to justify a hold ("he's still an RB1") when the question was a trade. Value already left; production has not yet. That is the sell window, not evidence against selling.
2. **Holding until the decline shows in the box score.** By construction that is two seasons of value decay, not one: 39% at RB, 19% at WR/TE, 10% at QB. The proof you were waiting for is the receipt for what you lost.
3. **Selling young ascending assets to accelerate a rebuild.** A rebuild sells AGE, never YOUTH. Pre-peak assets are the rebuild's own payoff arriving early. Trading them restarts the clock and pays the ascending-player premium to do it.
4. **Confusing "young" with "valuable."** A 22-year-old who is not on a startable trajectory has no value curve to ride, only a roster slot cost. Youth is a multiplier on startable talent, not a substitute for it.
5. **Using average core age instead of window overlap.** A barbell roster reads young and contends never.
6. **Fitting cross-sectional aging curves.** Produces "veterans age fine" conclusions that are pure survivorship.
7. **Ignoring the durability shoulder.** Old cores lose twice. A points-only projection understates the cost by the missed-games term.
8. **Applying the contender's discount rate to a rebuilder's assets.** Discounting year 5 value at 15%/yr is a 3-year window wearing a disguise.
