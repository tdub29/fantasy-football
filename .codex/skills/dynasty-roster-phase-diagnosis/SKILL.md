---
name: dynasty-roster-phase-diagnosis
description: Assign a dynasty roster exactly one of four phases (contend, retool, rebuild, dead zone) from simulated title odds vs fair share, projected starter-point rank, core age, and pick share. Use when the user asks what phase am I in, am I a contender, should I be buying or selling, am I in the middle, is my team good, where does my roster stand, do I need to rebuild, am I a fringe team, how long is my window, is standing pat fine, is my team competitive, should I tear it down, am I close, what is my timeline. Also use before any trade, sell-off, or multi-year plan, because every downstream recommendation depends on the phase call.
---

# Dynasty roster phase diagnosis

One roster gets exactly one phase. Contend, retool, rebuild, or dead zone. The phase is a measurement, not a mood, and it is produced from four numbers plus one gate.

Phase assignment only. Horizon math lives in `dynasty-championship-equity-horizon`. Sell sequencing and flip triggers live in `dynasty-rebuild-clock`. Player-level hold/sell lives in `dynasty-age-curve-timing`. Pick math lives in `dynasty-pick-portfolio-valuation`. Format ceilings live in `dynasty-league-format-leverage`. Offer shape lives in `dynasty-trade-construction`.

## The four measurements

Compute all four before naming a phase. Missing any one means no verdict.

1. **titleOdds(y=0)** from the Monte Carlo simulator, expressed as a multiple of fair share.
2. **Projected starter-point rank** from the best legal starting lineup, out of N.
3. **Value-weighted core age** of the top 5 starting assets.
4. **Pick value share** = pick dynasty value / total roster dynasty value.

Fair share = 1/N. In this 10-team league fair share is **10.0% per season**, which is **1.0 expected title per decade**. Use the 10-team basis everywhere. Do not import the 8.33% twelve-team constant; it mislabels a 10-team roster by roughly a fifth of a band.

## Phase bands

Title odds relative to fair share (10-team absolute values in parentheses):

| Band | Multiple of 1/N | 10-team absolute |
|---|---|---|
| CONTEND | >= 1.5x | >= 15% |
| FRINGE | 1.0x to 1.5x | 10% to 15% |
| DEAD ZONE | 0.6x to 1.0x | 6% to 10% |
| REBUILD | < 0.6x | < 6% |
| DEEP REBUILD | < 0.4x | < 4% |

Projected starter-point rank in a 10-team:

| Rank | Read |
|---|---|
| 1-2 | contend |
| 3 | fringe |
| 4-7 | dead zone unless the retool gate passes |
| 8-10 | rebuild |

When the two bands disagree, the lower one wins and the retool gate decides whether the roster is rebuilding on purpose or by accident.

## Measure the starting lineup, never the roster

A window is a property of the projected STARTING lineup, not of total roster value. Value you cannot start is inventory.

- Measure with best legal starting lineup points at each projected year.
- Never use rostered KTC sum.
- Never use last season's record or finish. Record is a lagging indicator and carries near zero information in the first two years of any phase.

In a 1QB league with FLEX restricted to RB/WR/TE, QB2 and QB3 contribute approximately zero starting points. They are inventory in every phase.

## Retool gate

Retool is the hardest phase to earn and the easiest to fake. All four gates required:

- (a) At least one top-12-overall-value asset under age 26 already owned.
- (b) At least 3 startable assets whose peak windows overlap for at least 3 consecutive seasons, beginning within 2 seasons. Peak ranges: QB 26-33, RB 23-27, WR 24-29, TE 25-30.
- (c) At least 15% of total roster value sitting in assets that produce zero starting points.
- (d) Pick value share between 15% and 35%.

Scoring:

- 4 of 4: retool is available.
- Exactly 3: retool is not yet available, and **the missing gate names the first move**. No gate (a) means acquire a headliner. No gate (b) means the roster is a barbell and one end must be sold. No gate (c) means there is no ammunition and the retool cannot be funded. No gate (d) below 15% means no ammunition, above 35% means liquidity-locked and picks must be converted first.
- 2 or fewer: retool is not on the menu. The real choice is contend or rebuild. Say so.

**Young-core shortcut.** If at least 2 of the top 4 starters are under the position's growTo age (RB 24, WR 25, TE 26, QB 27) AND pick share >= 22%, the phase is RETOOL even in the mid band. This is the one override that pulls a roster out of dead zone without the full gate.

## Window length W

W = the smallest y where the sum of productionRetention across starting slots falls below 0.85x the year-0 sum.

- Old core: W = 1-2.
- Balanced: W = 3.
- Young core: W = 5+.

Report W with every phase call. "You are a contender" is incomplete. "Contender with W = 2" is a decision.

Production curves for the retention sum: growth +7%/yr below growTo; flat to holdTo; then compounding decline accelerating 15% per additional year past the shoulder. RB growTo 24 / holdTo 26 / -13%. WR 25 / 28 / -8%. TE 26 / 29 / -7%. QB 27 / 33 / -6%.

## Present value rank vs 3-year future value rank

Rank now answers "am I good today." The phase question is answered by the gap between present-value rank (PV) and 3-year future-value rank (FV).

| Shape | Verdict |
|---|---|
| PV 8th, FV <= 5, core age <= 25.5 | Already rebuilt. Needs **conversion**, not a teardown. |
| PV 8th, FV >= 7, value share < 7.2% | The only shape that justifies a teardown. |
| PV <= 3, FV >= 7 | Contending with W = 1-2. Spend now, the window is closing. |

Selling a 21-year-old cornerstone because "I am rebuilding" is a category error. A rebuild sells AGE. A young stud is the rebuild's payoff arriving early.

## Value share bands (10-team basis)

| Marker | Value share |
|---|---|
| League average | 10.0% |
| Contender lock | 12.4% (1.24x) |
| Rebuild floor | 7.2% (0.72x) |

One elite cornerstone is roughly 2.5 points of value share.

Value share above 12.4% with bottom-third starter points is **misdeployment**, not weakness. Fix lineup shape or consolidate. Do not tear down a roster that already owns above-average value; it does not need more value, it needs the value in the lineup.

Reject any teardown proposal from a roster at or above 10.0% value share.

## Dead zone is a failure state, not a strategy

Inside 0.6x to 1.0x fair share, never output a neutral or stand-pat recommendation. Force a phase choice and print CTE(8) for both committed paths.

Simulated 8-year expected titles in this format:

| Path | Expected titles over 8 yrs | P(at least one) |
|---|---|---|
| Perpetual mid (~7%/yr) | 0.56 | 44% |
| All-in 3 years then collapse | 0.63 | 49% |
| Committed rebuild | 0.85 | 60% |
| Sustained top-4 | 0.96 | 64% |

The middle is dominated by both alternatives. It is the only square on the board with no upside tail, and its draft slot is a mid-first.

If a stand-pat recommendation is ever made from the mid band, it must state its own CTE(8) against both committed paths and beat both. Feeling safe is not a result.

## Convexity is why half-measures fail

Title odds are nearly flat below the playoff cut and steep above it. From the projected-8th roster:

| Added pts/week | Title odds | Marginal gain per +5 |
|---|---|---|
| +0 | 2.5% | |
| +5 | 4.4% | 1.9 |
| +10 | 7.4% | 3.1 |
| +15 | 11.6% | 4.2 |
| +20 | 17.0% | 5.4 |
| +25 | 23.3% | 6.3 |
| +30 | 30.2% | 6.9 |

Marginal gain per 5 points RISES the whole way. Moving 8th to 6th buys almost nothing. Moving 4th to 1st buys a lot. This is the mathematical statement of "do not do a little bit of contending," and it is why partial moves from below the cut are the least efficient purchase available.

## VPP: the phase-honesty check

VPP = total dynasty value / projected starter points.

- A retool must LOWER VPP season over season. It converts inventory into lineup.
- A teardown RAISES VPP. It converts lineup into inventory.

A team claiming to retool whose VPP rose is tearing down by accident. Report VPP with the phase call and again the following offseason.

## Phase is league-relative and dynamic

A rival's rebuild maturing can close your window with no change to your roster. Any forward projection must age and convert picks for all N rosters (projectLeagueForward), not just yours. A one-sided projection systematically overstates your future.

Report your future **RANK**, not your future points. Points are absolute; title odds are relative.

## Diagnostic questions before any verdict

1. What year do you intend to flip?
2. What horizon is this evaluated on, and is it at least flip year + 4?
3. Which of your top-8 assets pass the flip-year age test (age + years_to_flip <= holdTo: RB 26, WR 28, TE 29, QB 33)?
4. What is your value share versus 1/N?
5. What are the written flip triggers, and who checks them?
6. Which assets have zero marginal lineup contribution today?

Any question without an answer means the phase call is unspecified. Say which one is missing rather than guessing.

## Decision procedure

1. Compute best legal starting lineup points and rank, for all N rosters, at y=0.
2. Run the simulator for titleOdds(y=0). Express as a multiple of 1/N = 10.0%.
3. Compute W.
4. Compute value share, pick share, top-3 concentration, core age.
5. Score the retool gate, 0 to 4.
6. Assign the phase:
   - titleOdds >= 1.5x OR rank <= 2 -> CONTEND.
   - titleOdds < 0.6x AND rank >= 0.7N -> REBUILD (< 0.4x is DEEP REBUILD).
   - Mid band AND retool gate 4 of 4, or young-core shortcut -> RETOOL.
   - Mid band otherwise -> DEAD ZONE. Print CTE(8) for committed contend and committed rebuild, and force the choice.
7. Output: phase, W, the four measurements, VPP, and the single first move.

## Worked example: the owner's roster

Inputs: 10 teams, 1QB PPR, QB/RB/RB/WR/WR/TE + 4 FLEX (RB/WR/TE only), 6 of 10 make the playoffs, 3 single-week rounds. Projected 8th of 10 in starter points. titleOdds(y=0) = 1.4%. Top-end: RB Jeremiyah Love 21, RB Achane 24, TE McBride 26. Five first-round picks. Three startable QBs.

Measurements:

- Fair share = 10.0%. 1.4% / 10.0% = **0.14x**. That is below the 0.4x deep-rebuild line by a factor of three.
- Rank 8 of 10 = 0.8N, past the 0.7N rebuild trigger.
- Core age: Love 21, Achane 24, McBride 26. Value-weighted core age is under 25.5.
- Pick share: five firsts in a 10-team roster puts pick share in the amber band, near or above 22%.

Both rebuild triggers fire. **This is not a fringe team and must not be diagnosed as one.** A 1.4% roster is not "close." It is 0.14x of a random roster's title odds.

PV vs FV: PV rank 8, core age <= 25.5, FV rank improves sharply once picks convert and Love reaches growTo at 24. That shape is "already rebuilt, needs conversion," not "tear it down." The correct label is REBUILD in progress, with the young core untouchable and the sell list drawn from age.

W: with a 21-year-old RB, a 24-year-old RB, and a 26-year-old TE anchoring the top, the retention sum does not fall below 0.85x for several seasons. W = 5+. The window is long and it is open in the future, not now.

VPP: high, and correctly so. Five firsts plus two QBs that cannot start are pure inventory. The job over the next two offseasons is to LOWER VPP by converting inventory into lineup, and the fastest zero-cost conversion is the QB surplus: QB2 is worth roughly 6 points across a season over a waiver replacement and QB3 is worth under 1 point, so their entire market value is free to spend.

Phase call, in the format the skill demands:

> **DEEP REBUILD. W = 5+.** titleOdds 1.4% = 0.14x fair share. Rank 8/10 = 0.8N. Core age <= 25.5. Pick share amber. Retool gate fails on liquidity, not on talent. First move: convert QB2 and QB3, which cost zero starting points. Do not sell Love. Do not sell Achane for youth. Evaluate every trade at H = 8, never H = 3.

What a 3-year evaluation does to this roster: it sees roughly 10% of a rebuild's payoff against 100% of its cost, and returns "the rebuild is a wash or worse." Same rosters, opposite verdict, horizon alone. Hand the horizon question to `dynasty-championship-equity-horizon` and refuse to render a phase-driven verdict on a window shorter than 6 seasons.

## Failure modes

1. **Treating middle as a phase.** Dead zone is what happens when nobody chooses. Outputting "stay the course" from the 0.6x to 1.0x band is the single most expensive mistake in the taxonomy, worth roughly 0.56 expected titles per 8 years against 0.85 for committing.
2. **Anchoring on record or last season's finish.** Both are lagging by one to two seasons and carry no information about phase health. Use simulated title odds and projected starter-point rank.
3. **Confusing total roster value with starting strength.** A roster can lead the league in KTC sum and rank 8th in points it can actually field. Value share above 12.4% with bottom-third starter points is misdeployment, and the fix is lineup shape or consolidation, never a teardown.
4. **Using "retool" as a euphemism for doing nothing.** The gate exists to stop this. Score it 0 to 4 and name the missing gate. If VPP rose year over year, the retool claim is false.
5. **Importing 12-team, 4-playoff-spot orthodoxy into a 10-team, 6-playoff league.** Fair share here is 10.0%, not 8.33%. Playoff entry is cheap at a 60% berth rate, the top-2 bye is the only regular-season prize worth paying for, and the format ceiling for the best roster is roughly 25-30% per season. Any single-season model output above ~30% in this format is suspect.
6. **Projecting only your own roster forward.** Rivals age and convert picks too. A one-sided projection inflates your future rank and can turn a rebuild call into a false fringe call.
7. **Selling youth during a rebuild.** The sell list is generated by the intersection of high current value and steep forward decay. Young producers at premium positions are the payoff arriving early.
