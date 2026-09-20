---
name: dynasty-replacement-level
description: Use before valuing any bench player, backup, or depth piece in a dynasty league, and whenever someone proposes trading FOR depth. Triggers on "what is my QB2 worth", "should I keep a backup QB", "is my bench any good", "do I need a handcuff", "what can I get off waivers", "who is available", "should I stream", "is this player droppable", "am I too deep at TE", "trade my surplus", "what does depth cost me", "replacement level", "waiver wire", "FAAB", "free agent pool". Prices every rostered player against what is FREE, which is the only baseline that makes depth valuation honest.
---

# Replacement level, and the free-agent channel

A player's value to your lineup is not his projection. It is his projection **minus
the best freely available player at his slot**. Skip that subtraction and every
bench body looks like an asset, which is how rosters fill with expensive redundancy.

This skill owns the baseline. Trade shapes belong to `dynasty-trade-construction`,
format-derived slot math to `dynasty-league-format-leverage`.

## The core quantity

```
VOR(player) = projected points - projected points of the best UNROSTERED player at that slot
```

Not "best backup on my roster". Not "average starter". **Free.** If you can sign
him Tuesday for nothing, he is your floor, and anything you own is only worth the
gap above him.

## Measure it, do not assume it

Never quote a generic replacement level. Compute it from the actual league:

1. Union every roster's `players` array. That is the rostered set.
2. Filter the projection list to unrostered skill players.
3. Sort by points under THIS league's scoring (`projPoints`, not the file default).
4. The top unrostered player at each position is that position's replacement level.

Do this per league. A 10-teamer and a 14-teamer are different worlds.

### Measured, Password is taco, 2026 (10 teams, 25 roster spots)

Re-derived 2026-09-17, in season. 557 projected skill players. 288 rostered,
**269 free (48%)**.

| Pos | Best free agent | Points | Free agents | Preseason (2026-08) |
|---|---|---|---|---|
| QB | Jacoby Brissett | 154 | 45 | Geno Smith 196 |
| WR | Chimere Dike | 89 | 87 | Chimere Dike 89 |
| TE | Mike Gesicki | 84 | 83 | Pat Freiermuth 120 |
| RB | Isaiah Davis | 61 | 54 | Chris Brooks 62 |

Roughly half of all relevant NFL skill players are still unrostered, so the free pool
is still an open supply rather than a shallow bench, and it still reprices everything
on the roster. **What changed is the top of that pool, and it changed in one direction.**
QB fell 196 to 154 and TE fell 120 to 84 as the season started and startable bodies got
claimed; WR and RB did not move. Every number downstream of "best free agent" moves with
them, which is why the rest of this file is dated and why you re-derive rather than quote.
The free SHARE is the stable claim here. The free CEILING is not.

## The rule that falls out

**Never pay a starter's price for a body free agency can replace.**

| Surplus type | What it is worth |
|---|---|
| QB2 in a 1QB league | Trade value in full. Lineup value ≈ (QB2 − best FA QB) × P(QB1 misses) |
| QB3 in a 1QB league | Effectively zero lineup value. Pure trade currency. |
| TE2 when TE1 is elite | (TE2 − best FA TE), usually 20 to 40 points |
| RB4+, WR6+ | At or below replacement. Free. |

### Worked: the owner's QB room, measured

Josh Allen 355, Caleb Williams 294, Jordan Love 270, best FA QB 154 (2026-09-17;
the sim deltas below were run against the preseason 353 / 293 / 270 / 196 board).

**Method.** Every delta below is a mean over 5 independent seeds x 15,000 sims,
paired by seed so the common noise cancels. Baseline 1.46%, seed-to-seed sd
0.056pp. A single 6000-sim run cannot resolve a delta under ~0.15pp and will
happily print a sign-flipped one; that is how an earlier pass concluded that
dropping the QB3 *improved* the roster. It does not.

| Move | Title odds | Delta |
|---|---|---|
| Baseline | 1.46% | n/a |
| Drop QB3 Jordan Love for nothing | 1.28% | −0.18pp |
| Drop QB2 Caleb Williams for nothing | 1.24% | −0.22pp |
| Drop both, sign Geno Smith | 0.99% | −0.47pp |
| Drop all three, sign Geno | 0.22% | −1.24pp |
| **Trade both spares for Nico Collins, sign Geno** | **2.28%** | **+0.82pp** |

The last row is the one that matters, and it is the row an earlier pass never ran.
Dropping a backup for nothing is not a strategy, it is a control. The transaction is
a *trade*, and traded for a startable WR the two spare QBs are worth **+0.82pp**,
from a 1.46% base. That is the largest single improvement available on this roster
without giving up a starter.

Decomposed: the pair costs 0.47pp of insurance to give up, and Nico Collins alone
is worth +1.55pp to add. Roughly a 3-to-1 conversion, not the 15-to-1 an earlier
pass claimed from a noisy single run.

Keep exactly one QB, and hold the second only until it converts. It nearly always
converts, because 0.47pp is a cheap thing to sell and a startable WR is not.

The same logic, weaker, on tight ends: dropping Okonkwo, Juwan Johnson and Mayer
together costs 0.51pp, because the best free TE projected 120 and Okonkwo projects 144.
That 120 is now 84, so re-run this one before acting on it: the same sim with a 36-point
lower TE floor prices the TE surplus higher than 0.51pp, not lower.

**These are one-season deltas.** They price the insurance, not the plan. Any
hold-versus-sell verdict that turns on a rebuild must be scored over
`H >= max(7, years_to_flip + 4)` with the discount stated and a sensitivity sweep
run, per `dynasty-championship-equity-horizon`. A backup QB's insurance value is a
year-1 quantity; a rebuild's payoff is a year-4-to-8 quantity, and comparing them on
one season is the exact error this family exists to prevent.

## The insurance term, so you do not over-sell

Backups are not worthless. They are worth their INSURANCE value:

```
insurance = P(starter misses time) x (backup points - best FA points) x (fraction of season)
```

For a QB1 with ~1.5 expected missed games out of 17, measured on this roster:

| Backup | Projects | Edge over best FA QB | Insurance value |
|---|---|---|---|
| Caleb Williams | 294 | 140 pts/season, 8.2 pts/game | **12.4 pts/season** |
| Jordan Love | 270 | 116 pts/season, 6.8 pts/game | **10.2 pts/season** |
| _preseason, best FA QB 196_ | _293 / 270_ | _97 and 74 pts/season_ | _8.5 and 6.5_ |

**Re-derived 2026-09-17, and the arithmetic no longer says what it said in August.** The
threshold in the next paragraph is ~10 points of lineup value. At a 196-point free QB both
backups sat under it, so "always sell" followed. At a 154-point free QB, Williams prices at
12.4 and Love at 10.2, and both clear it. The conclusion did not change because anyone
re-argued it. It changed because the replacement level moved 42 points.

Sell the backup unless the return is under ~10 points of lineup value. In August that meant
always sell, because nothing trades for that little. It does not mean that today.

**Two gates, and they now disagree. Say so rather than picking one.** Hold one backup only
when BOTH of these are true: the best free agent is under ~60% of your starter's output, AND
your starter is injury-flagged. Brissett 154 against Allen 355 is 43.4%, so the first gate
fires much harder than the 55.5% that made it marginal in August, but `players.js` still
shows Allen with `injury_status: null`, so the second does not fire. One of two is still not
the rule, so the two-gate check says sell. The ~10-point threshold now says hold. **Do not
sell a QB2 out of this room on the August number without re-running both.**

Honest bound on that: 12.4 against a round ~10 is not a wide margin, and the insurance
formula fixes P(starter misses) at 1.5 of 17 games rather than fitting it. Read it as "the
margin closed, re-check before selling", not as a hold verdict. Derived and self-checked in
one pass on 2026-09-17, with no second lens on it.

Re-run the second half of that check before every lineup answer; `injury_status`
goes stale fast (`python site/data/fetch_sleeper.py`).

## Decision procedure

1. Compute the league's actual replacement level per position. Do not skip this.
2. For every rostered player, compute VOR against it.
3. Any player with VOR at or below zero is **inventory, not an asset**. He occupies a
   roster spot and a bench slot and returns nothing.
4. For the ones above zero but not starting, compute the insurance term.
5. Sell anything whose trade value exceeds its VOR plus insurance. That is nearly
   every backup.
6. Before signing depth, check that the free pool cannot cover the same need. In a
   10-team league it usually can.

## The waiver and FAAB channel

With 46% of skill players free, waivers are the cheapest youth channel available and
it costs no trade capital at all. This is the channel the rest of the family ignores,
and in a 10-team league it plausibly supplies more 2030 starters than a rebuilder's
fourth and fifth first-round picks, which this family itself prices at ~0.9 combined
hits.

### Read the waiver rule before you bid

`waiver_type` 2 means FAAB, 1 means reverse-standings priority, 0 means rolling
priority. These are three different games and the same player is worth a different
thing in each.

**This is not in the site export unless the data has been rebuilt since 2026-08-08.**
`build_site_data.py` now captures `taxi_slots`, `reserve_slots`, `waiver_type` and
`waiver_budget` from Sleeper's league settings, but `leagues.js` only carries them
after `python site/data/fetch_sleeper.py && python site/data/build_site_data.py`
runs again. Until then, read the rule off Sleeper directly and say you did. Do not
assume FAAB.

### FAAB bid sizing

FAAB is a sealed-bid, single-unit auction against a budget that does not roll over,
so unspent budget at the final waiver run is worth exactly zero. Bid the player's
VOR share of the remaining season, not a habit percentage.

```
max sensible bid % = (VOR over the rest of the season / total VOR your budget can still buy) x remaining budget
```

Three rules that follow, in decreasing order of how often they are broken:

1. **Bid on the gap, not the name.** A WR who projects 40 points above the best
   remaining free WR is worth roughly a tenth of what one projecting 400 above is
   worth. Most bidders anchor on hype.
2. **Spend down as the season shortens.** Budget held into week 13 buys fewer
   remaining games, so the same player is a rising fraction of what is left to buy.
   A 40% bid in week 2 and a 40% bid in week 12 are not comparable decisions.
3. **A rebuilder's budget is for age, not points.** Bid aggressively on a 23-year-old
   with a new role and let the contenders overpay for the 29-year-old handcuff who
   helps only this year. This is the one channel where a rebuilder outbids a
   contender without paying trade capital.

If the league is reverse-standings priority instead, a rebuilder holds the top claim
by construction and should treat it as a real, non-renewable asset: it is worth
roughly the best player who will hit waivers this season, so do not burn it in
week 2 on a body.

### Roster spots are the scarce resource

25 active spots against a 257-player free pool means every spot spent on a
known-mediocre backup is a spot not spent on a lottery ticket. Two uses:

- **Contending**: stream the bye-week and injury holes instead of rostering insurance.
  Every spot you free is a spot for an upside stash.
- **Rebuilding**: the free pool is where you park lottery tickets. A rookie who costs
  a waiver claim is strictly better than one who costs a 3rd, and the pool refreshes
  every week of the season while a draft pick arrives once a year.

### Taxi and IR change the spot math, and they are measurable

Do not report the taxi rule as unknown. `leagues.js` carries every roster's `taxi`
and `reserve` arrays, so the channel is observable even when the slot counts are not.

Measured in Password is taco, 2026: every one of the 10 teams carries taxi players.
Per-team taxi counts are [5, 4, 3, 5, 2, 5, 5, 4, 4, 2], reserve 0 to 2, and total
rostered players per team run 27 to 35 against 25 active slots. **The owner carries 2,
tied for the fewest, against five rivals at 4 and 5.** That is 2 to 3 unused stash
slots on a roster whose whole thesis is accumulating young assets, and it costs
nothing to fix.

Read the arrays before pricing any stash:

```
node -e "…window.LEAGUES…rosters.map(r => [r.owner_name, r.taxi.length, r.reserve.length])"
```

## Failure modes

- **Quoting a generic replacement level.** It is a property of THIS league's team
  count, roster size and scoring. Compute it.
- **Valuing a backup at his projection.** His projection includes points a free agent
  would have scored for you anyway.
- **Confusing trade value with lineup value.** A QB3 in 1QB has real trade value and
  near-zero lineup value. Both are true. Sell on the first, do not mourn the second.
- **Over-selling to zero.** Dropping all three QBs costs 1.24pp, roughly three times
  the cost of dropping two. The first backup is cheap to sell, the starter is not.
- **Reading Monte Carlo noise as a finding.** At 6000 sims the standard error on a
  1.4% baseline is ~0.15pp, so any delta under ~0.3pp is unresolvable and can come
  back sign-flipped. An earlier pass of this skill reported that dropping the QB3
  *improved* title odds by 0.08pp. Re-measured across 5 seeds x 15,000 sims it costs
  0.18pp. Pair the seeds, report the spread, and refuse to quote a delta smaller than
  your own noise floor.
- **Pricing a backup by dropping it instead of trading it.** A drop-for-nothing is
  the control, not the transaction. The pair of spare QBs reads as −0.47pp dropped
  and **+0.82pp traded for a startable WR**. Only the second number is a decision.
- **Treating the owned-minus-started "depth trap" flag as a sell signal.** owned%
  correlates ~0.89 with projected points and the owned-minus-started gap only ~0.23
  (n=397, 2026-08-09). The gap mostly detects mid-tier players, not overvalued ones.
  Use VOR instead. `dynasty-player-evaluation` owns this measurement.
- **Ignoring the pool when rebuilding.** Free agency plausibly supplies more future
  starters than your fourth and fifth first-round picks, at zero acquisition cost.
