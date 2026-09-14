---
name: dynasty-league-format-leverage
description: Use BEFORE applying any dynasty heuristic, to recompute title-odds ceiling, seed values, replacement level, and positional scarcity from this league's own slot counts and playoff field. Triggers on "does league size change this", "is the number 1 seed worth chasing", "should I push for a bye", "what are the playoff odds", "how many QBs should I roster", "is my third QB worth anything", "how good do I need to be to win", "what's a realistic title percentage", "does 6 of 10 making playoffs matter", "is this advice right for a 10-team league", "taxi squad value", "how many wins do I need", "what does the format change", "seed value", "replacement level", "positional scarcity", "is 30% title odds realistic", "should I trade for a starter to make the playoffs".
---

# League format leverage

Format sets the payoff table. Every dynasty heuristic in circulation was written for some other format, usually 12 teams, 1 FLEX, 4 playoff spots. Recompute the payoff table from this league's own settings before quoting any rule of thumb.

Baseline league here: 10 teams, 1QB, PPR. Starters QB/RB/RB/WR/WR/TE + 4 FLEX (RB/WR/TE only). 6 of 10 make playoffs, top 2 get byes, 3 single-week rounds.

This skill prices the format. It does not decide phase (see `dynasty-roster-phase-diagnosis`), horizon (`dynasty-championship-equity-horizon`), sell timing (`dynasty-age-curve-timing`), pick math (`dynasty-pick-portfolio-valuation`), rebuild sequencing (`dynasty-rebuild-clock`), or offer shape (`dynasty-trade-construction`).

## 1. Structural seed equity: two cliffs, nothing else

Simulate 300k brackets with all six playoff teams set to identical strength. Structure alone, zero team quality:

| Seed | Title % |
|---|---|
| 1 | 25.1 |
| 2 | 25.0 |
| 3 | 12.5 |
| 4 | 12.5 |
| 5 | 12.4 |
| 6 | 12.4 |
| missed | 0.0 |

Bye multiplier = 2.00x exactly. Seed 1 over seed 2 = 0.0 points. Seed 3 over seed 6 = 0.0 points.

There are exactly two cliffs:
- **6/7 boundary**: missing to qualifying = +12.5 points.
- **2/3 boundary**: the bye = +12.5 points.

Buying seeding anywhere else buys zero. A team that pays a first to move from projected 5th to projected 3rd bought nothing structural.

## 2. Title % by projected starter-point rank

10 teams, team-strength SD 12, projection error tau 9, sigma 26, 14 weeks, 200k sims:

| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Title % | 33.9 | 20.5 | 14.3 | 10.4 | 7.6 | 5.4 | 3.8 | 2.4 | 1.3 | 0.4 |
| Bye % | 64 | 42 | 30 | 21 | 16 | 11 | 8 | 5 | - | - |

Ceiling for the best roster is 25-35%, with 30-35% typical. Nothing under a +30 points/week lineup edge over league average breaks 50%. **Treat any single-season model output above 30-35% in this format as suspect and re-check the sim before acting on it.**

## 3. Weekly math (the conversion engine)

p = Phi(delta / (sigma x sqrt(2))), sigma ~= 26 PPR points for a 10-starter lineup.

| delta (pts/wk) | +5 | +10 | +15 | +20 | +25 | +30 |
|---|---|---|---|---|---|---|
| p | 55.4% | 60.7% | 65.8% | 70.7% | 75.2% | 79.3% |

Title odds = 4p^2 x baseline with a bye, 8p^3 x baseline without.

| delta | bye mult | no-bye mult |
|---|---|---|
| +5 | 1.23x | 1.36x |
| +10 | 1.47x | 1.79x |
| +15 | 1.73x | 2.28x |
| +20 | 2.00x | 2.83x |

Rule of thumb: **+10 points per week of starter production is worth about the same as a first-round bye.**

Convexity from a **generic** projected-8th roster: +0/+5/+10/+15/+20/+25/+30 pts/wk gives 2.5/4.4/7.4/11.6/17.0/23.3/30.2% title. The 2.5% start is the structural rank-8 figure from section 2, not this roster; the owner's own sim reads 1.46%, below the generic shape. Do not read the two as the same baseline. Marginal gain per additional 5 points: 1.9, 3.1, 4.2, 5.4, 6.3, 6.9. Strictly increasing across the whole feasible range. Convex payoffs forbid half measures.

**Hard reject rule.** Any win-now trade that raises projected weekly starter points by less than 5 is rejected on structural grounds. It moves a single-week matchup from 50.0% to 55.4% and multiplies title odds ~1.25x, which never justifies a first in a 10-team league where firsts average roughly the 5.5th player off the board.

## 4. Record thresholds and the win-value curve

14-game season. P(make playoffs | record): 8-6 = 100%, 7-7 = 87%, 6-8 = 37%, 5-9 = 4%, 4-10 = 0%. Median seed 1 is 11-3, median seed 2 (last bye) is 10-4, median seed 6 is 7-7.

Marginal title equity per win: wins 1 through 7 buy 5.5 points total (~0.8/win). Wins 8 through 10 buy ~21 points (~7/win). Ratio 9:1 in favor of the last three wins.

Practical: at 7-7 with two weeks left, entry is settled at ~87%. Stop paying for it. Redirect remaining capital at the bye (needs ~10 wins) or bank it. At 6-8 or worse, entry is <=37% and the season is a sell window, not a push window.

Use projected starter points or all-play as the input, never record. Record carries schedule luck; the seed cliffs are what you are actually buying.

## 5. Starter demand sets scarcity, not NFL talent

10 teams x (QB/RB/RB/WR/WR/TE + 4 FLEX limited to RB/WR/TE) = **10 QB slots and 90 skill slots** weekly.

| Position | Supply / demand | Ratio |
|---|---|---|
| QB | ~32 / 10 | 3.2x oversupply, least scarce position in this format |
| TE | ~14 / ~14 | ~1.0x, scarcest |
| RB, WR | - | 1.1-1.2x |

**Roster exactly 1 QB in this league.** QB3 has ~0 value over replacement because QB11 is on waivers. QB2 is worth ~1.5 expected starts x 4-6 points of per-game edge = **6 to 9 points per season**, injury insurance only, and measured at 0.22pp of title odds. Traded for a startable WR the pair of spares is worth **+0.82pp**, so the second QB is a holding position, not a roster slot you defend. `dynasty-replacement-level` owns this call and carries the measurement; it is the authority if the two ever disagree.

### The 1QB discount, quantified

Never price a 1QB QB off a superflex or blended number. Here is the conversion,
measured across 337 players appearing on both KTC lists (`ktc-oneqb` vs `ktc-superflex`):

| Pos | median 1QB / SF | vs the skill baseline |
|---|---|---|
| QB | **0.859** | **0.70x** |
| RB | 1.231 | 1.00x (baseline) |
| WR | 1.229 | 1.00x |
| TE | 1.199 | 0.97x |

The two KTC lists are normalized differently, so the raw column is not the answer.
The right-hand column is: divide each position's ratio by the skill-position ratio
(~1.23). **A QB is worth ~70% as much, relative to skill players, in 1QB as in
superflex.**

The discount is steepest at the top, which is the opposite of most people's intuition:

| QB tier | median 1QB/SF | relative |
|---|---|---|
| QB1-6 | 0.770 | **0.63x** |
| QB7-12 | 0.835 | 0.68x |
| QB13-24 | 0.847 | 0.69x |
| QB25+ | 0.914 | 0.75x |

Tiers are by rank on the 1QB board (40 QBs appear on both lists). Re-derive with the check in `site/js/dynasty-claims.test.js` after any `build_ktc.py` run; the raw medians drift with the board, the relative column has been stable.

Elite QBs lose the MOST converting to 1QB, because superflex demands two starters
and scarcity concentrates at the top. In 1QB that scarcity does not exist.

**Operationally:** use `ktc-oneqb` directly; it already carries the adjustment. If a
counterparty quotes a superflex or "KTC value" number for a QB, multiply by 0.70 (0.63
if he is a top-6 QB) before comparing it to a skill player. Getting this wrong is how
you accept a QB1 as a headliner and think you won.

Pair with `dynasty-replacement-level` for the other half: what the QB you keep is worth
against the best QB sitting on waivers.

## 6. Replacement level and lineup depth

Measured, not estimated: **304 distinct rostered players, 30.4 per team** (active plus taxi plus reserve) against **559 projected skill players**, leaving **257 free, 46%**. Replacement FLEX production is **8-10 PPR points per week**, roughly 7% of a 125-point lineup.

Do not quote "~40%" or "roughly half"; both shipped in earlier passes of this family and both are wrong. The number is 46% and `dynasty-replacement-level` shows the four positional baselines that fall out of it.

Two consequences:

1. Four FLEX slots mean startable bodies 7 through 10 are real assets here. In a 1-FLEX league they are bench. Do not port bench-depth-is-worthless advice into this format.
2. Ten starters dilute stars. A +8 point/week edge is a 61.1% weekly win rate at 6 starters (SD 20), 59.7% at 8 (SD 23), **58.6% at 10 starters (SD 26)**, 57.9% at 12. Each added slot costs a star 0.5-1.0 percentage points of weekly leverage.

Discount the outgoing side of any 3-for-1 by waiver replacement level, not by KTC sum. That is the structural reason consolidation is cheaper in a 10-team league than a 14-team one.

## 7. Taxi and IR must be answered before pricing young-asset accumulation

Answer the rule before valuing any stash. Answer it, do not merely ask it: earlier passes of this family declared this question gating and then answered around it in every worked example, including the five-firsts accumulation plan.

- **No taxi/IR open**: an active-roster stash costs 8-10 PPR points per week of forgone FLEX production. Subtract that from the stash's expected value.
- **Taxi/IR open**: charge zero. Rebuilding is structurally cheaper in this league than in one without taxi, and the accumulation math changes materially.

### Measured, Password is taco 2026

`roster_positions` does not list TAXI or IR, which reads like "no taxi" and is wrong. Sleeper keeps the slot counts in league `settings` and the site export dropped them until 2026-08-08. The occupancy is observable anyway, on every roster:

| | taxi used | reserve used | total rostered |
|---|---|---|---|
| League, per team | [5, 4, 3, 5, 2, 5, 5, 4, 4, 2] | 0 to 2 | 27 to 35 |
| **The owner** | **2**, tied for fewest | 1 | 30 |

**Taxi is open and eight of nine rivals use at least as much of it as the owner.** So charge zero for a stash here, and note that the owner is carrying 2 where five rivals carry 4 and 5. On a roster whose thesis is accumulating young assets, unused taxi slots are the cheapest thing on this list to fix.

For the exact slot counts and the waiver rule, re-run `python site/data/fetch_sleeper.py && python site/data/build_site_data.py`; `build_site_data.py` now captures `taxi_slots`, `reserve_slots`, `waiver_type` and `waiver_budget`. Until that rebuild lands, read occupancy off the `taxi` and `reserve` arrays and say which you used.

Any young-asset plan quoted without this rule stated is unpriced.

## 8. Format sensitivity: single-week rounds tax excellence

| Format | Best team | Projected 8th |
|---|---|---|
| 6 teams, 3 single-week rounds (this league) | 33.9% | 2.4% |
| 6 teams, 3 two-week total-points rounds | 38.4% | 1.7% |
| 4 teams, 2 rounds | 34.0% | 2.3% |
| 8 teams, 3 rounds, no bye | 30.1% | 3.4% |

Single-week rounds are the maximum-variance setting. They tax regular-season excellence and subsidize merely qualifying, which weakens every "push for the top seed" argument by roughly 10-12% relative to a two-week format.

A 60% qualification rate makes "never be mediocre" far weaker here than the 12-team, 4-spot orthodoxy it came from. Entry is cheap; the bye is the expensive thing.

## 9. Risk posture is state-dependent

The payoff is a step function at the championship, so the correct risk preference flips with your own odds.

- **Below ~10% title odds**: buy variance. Concentrate, take the high-ceiling asset, accept the wider distribution.

**Tiebreak against `dynasty-trade-construction`.** That skill caps top-3 value
concentration at 35% while startable bodies are under 13. The cap wins. Risk-seeking
means preferring the higher-ceiling asset at equal cost, not fielding an illegal
lineup in week 9. Below 10% odds, concentrate UP TO the cap and no further; the
first constraint is that you can fill ten slots every week.
- **Above ~20-25%**: buy floor. Depth, bye coverage, injury insurance, handcuffs.

Maximizing expected starter points is the wrong objective in both regimes.

## 10. Projection error transfers equity to the field

Raising preseason projection error tau from 0 to 5 to 9 to 14 points per week:

| tau | 0 | 5 | 9 | 14 |
|---|---|---|---|---|
| Best team | 39.2% | 37.2% | 34.1% | 29.6% |
| 8th team | 1.2% | 1.6% | 2.4% | 3.5% |

Every point of forecast uncertainty moves title equity from favorites to the field. Use this to **cap what a contender pays for a one-year peak**. Never use it as a reason to stay mediocre; the 8th team's gain is 2.3 points, which buys nothing.

## Decision procedure

Run in order. Do not skip to a heuristic.

1. **Read the settings.** Team count, starter slots, FLEX count and eligibility, playoff field, bye count, round length, taxi/IR, waiver depth. If any is unknown, ask before answering.
2. **Recompute the payoff table.** Seed equity (section 1), rank-to-title map (section 2), win thresholds (section 4). Never quote a number from another format.
3. **Locate the roster on the rank table**, using projected starter points or all-play, not record.
4. **Price the ask in points per week** using section 3. Convert every proposed move to a delta in weekly starter points, then to a title-odds multiplier. Reject anything under +5.
5. **Check which cliff the move buys.** Only the 6/7 boundary and the 2/3 boundary carry structural equity. If the move lands inside seeds 3-6 or inside seed 1-2, it bought 0.
6. **Recompute scarcity from slot counts** (section 5). Flag every asset with zero marginal lineup contribution.
7. **Set replacement level** (section 6) and re-price all outgoing depth in any consolidation.
8. **Ask the taxi/IR rule** before valuing any stash (section 7).
9. **Set risk posture from current title odds** (section 9).
10. **State the number.** Every recommendation ships with the current title %, the delta in points per week required, and which cliff it buys. A recommendation without those three is invalid output.

## Diagnostic questions

Ask these before applying any dynasty rule of thumb.

1. How many teams, how many playoff spots, how many byes, and are rounds one week or two?
2. Exactly which slots start, and what is FLEX-eligible?
3. What is the projected starter-point rank, and what is the all-play record? (Not the win-loss record.)
4. How many points per week does this move add to the starting lineup?
5. Which cliff does that buy: the 6/7 boundary, the 2/3 boundary, or neither?
6. Are there taxi and IR slots, and are they open?
7. How deep is the waiver wire, and what does a replacement FLEX score per week?
8. Which rostered assets cannot enter the legal starting lineup this week?
9. What format was the advice being quoted originally written for?

## Worked example: the owner's league

State: 10 teams, 1QB PPR, 6 of 10 playoffs, 3 single-week rounds, 2 byes. Roster is 8th of 10 in projected starter points, ~1.4% title odds. Young at the top (RB Jeremiyah Love 21, RB Achane 24, TE McBride 26). Holds 5 first-round picks. Rosters three startable QBs.

**Step 2, payoff table.** Best roster ceiling 33.9%. Rank 8 sits at 2.4% structurally; the sim's 1.4% says this roster is below the generic 8th-place shape. Bye probability from rank 8 is 5%.

**Step 4, price of contention.** From 2.5% baseline:
- Reaching a generic playoff team's 12.5% requires roughly **+15 points per week**.
- Reaching bye-caliber ~25% requires roughly **+25 points per week**.

+25 points per week means converting the worst starting-lineup half in the league into the best. State that number before any push conversation continues.

**Step 5, which cliff.** From 8th, no realistic single trade reaches either cliff. A trade that moves the roster from projected 8th to projected 5th crosses no cliff (seeds 3-6 are worth the same) and buys ~5 points of qualification equity that resets to zero next season. Reject.

**Step 6, scarcity.** 10 QB slots league-wide against ~32 startable NFL QBs, 3.2x oversupply. QB3 is worth ~0 points over replacement. QB2 is worth ~6 points per season. So of the three QBs, one is a starter, one is insurance, and one is free money sitting on a roster slot. Sell QB3 for anything with nonzero startable or convertible value; if the best offer in a 10-team 1QB market is a third-round rookie pick, take it. Do not hold waiting for a market this format cannot produce.

**Step 7, replacement level.** Each dead QB slot also costs 8-10 PPR points per week of forgone FLEX production if taxi/IR are full, since four FLEX slots mean bodies 7 through 10 actually score. Over 14 weeks that is 112-140 points of lineup production burned to hold an asset worth ~0.

**Step 8, taxi. Answered: open, and under-used.** Every team in the league carries taxi players, 2 to 5 each; the owner carries 2, the fewest. So holding rookies costs nothing here and rebuilding is structurally cheaper than in most leagues, and the 5 firsts price as an accumulation plan without the 8-10 points per week penalty. Fill the empty taxi slots before spending anything on more picks; that is free capacity the plan already assumes.

**Step 9, risk posture.** 1.4% is far below the 10% line. Correct posture is risk-seeking: concentrate, take ceiling over floor, refuse to buy depth or insurance. Buying a floor at 1.4% odds is spending on a distribution that never reaches the payoff.

**Step 10, output.** Current 1.4%. Push to a generic playoff team costs ~+15 pts/wk and buys the 6/7 cliff, worth +12.5 points once, non-recurring. Push to bye-caliber costs ~+25 pts/wk, which is not purchasable from this roster. Free moves available today: convert QB3 (0 lineup contribution) and QB2 above insurance value. Format verdict: this league's structure does not support a win-now push from rank 8. Hand the phase, horizon, and rebuild questions to the sibling skills.

## Failure modes

1. **Chasing the 1 seed.** Seed 1 over seed 2 is worth 0.0 points of structural equity. The bye is the target, not the top line.
2. **Paying to move within seeds 3-6.** Worth 0.0 points. This is the single most common wasted purchase in a 6-team bracket.
3. **Presenting a projected top-2 finish as a plan without stating the failure rate.** The best projected roster wins 33.9% of the time. That plan fails ~66-70% of the time and the number must be said out loud.
4. **Quoting a title % above 30-35% for one season in this format.** Structurally impossible without a +30 pts/wk edge. Re-check the sim.
5. **Porting 12-team, 1-FLEX, 4-playoff-spot heuristics into a 10-team, 4-FLEX, 1QB league with live waivers.** "Never be mediocre", "bench depth is worthless", "QB depth has value", and "consolidation is expensive" all invert or weaken here.
6. **Pricing a 1QB QB surplus off KTC.** KTC blends superflex. QB3's KTC number is a superflex price for an asset with zero lineup contribution in this format.
7. **Using win-loss record as the input.** Record carries schedule luck. Use projected starter points or all-play.
8. **Valuing a young-asset stash without asking the taxi/IR rule.** The answer changes by 8-10 PPR points per week per stash.
9. **Buying floor at low title odds, or buying variance at high title odds.** The correct posture flips at roughly 10% and again at 20-25%.
10. **Using projection error as an argument to stay mediocre.** Higher tau moves the 8th team from 2.4% to 3.5%. That is a rounding error, not a strategy. Its real use is capping what a contender pays for a one-year peak.
