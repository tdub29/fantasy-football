# Dynasty frameworks encoded in this site

This document is the source of truth for *what the site believes* about
dynasty. When an agent needs to add a feature, the methodology lives here;
the code in `site/js/app.js` and `site/data/strategy.js` is the
implementation of these ideas.

## 1. KTC as source of truth

KeepTradeCut publishes both player and rookie-draft-pick values on the same
dynasty rankings page (`https://keeptradecut.com/dynasty-rankings`).

- `site/data/build_ktc.py` scrapes the `playersArray` JSON, splitting
  `position: "RDP"` entries into a separate `picks` array per ranking.
- Generated `site/data/ktc.js` exposes two rankings: `ktc-superflex` and
  `ktc-oneqb`, each with `players` + `picks`.
- The site's `tierValue(p)` divides `ktcValue` by 100 to land on a ~0-110
  internal scale (top elite ≈ 75-80, average starter ≈ 30-50).
- `pickIndex()` builds a `season|slot|round` lookup; format chosen per
  league (`is_superflex` ? SF : 1QB). Published Sleeper draft order supplies
  exact slots; player-only roster projection fills unknown future slots.
- Fallback to `strategy.js::pick_values_1qb` only when KTC misses a bucket;
  a one-time `console.warn` fires when fallback triggers within the
  current+2-year window so we catch rollover drift.

**Don't estimate values from memory.** Always look up `ktc.js` for the live
number.

### Seasonal production context

Jacob Gibbs' dated 2026 half-PPR redraft rankings appear beside players as a
separate production signal. They are not averaged into dynasty ranks or KTC
values: redraft lists intentionally favor immediate points and older veterans,
while dynasty values must retain age, liquidity, and multi-year context.

The default Gibbs column is his August 14 top-175 tier board (16 tiers, single-QB
managed). His July 20 FantasyPros board is still there as `gibbs-fp-2026-07`,
toggled off on the Sources page: reach for it when the question is about a player
outside the top 175, since it ranks 315 and carries SOS and ECR vs ADP. Do not read
a player's absence from the tier board as a downgrade; 175 is simply where it stops.
`docs/gibbs-tier-board-<date>.html` is the standalone board with movement between
the two and a per-league read.

## 2. Headliner Rule (user-explicit feedback)

In a dynasty trade, the **biggest single asset on each side anchors the
deal.** A package of smaller pieces that "sums to" the headliner does not
substitute, even if KTC totals match. The user has explicitly told us this.

- KTC's own "Value Adjustment" mechanic confirms this: reverse-engineered
  penalty against the side trying to substitute many lesser pieces for one
  stud, factoring stud-factor + number-of-lesser-pieces.
- **The Trade Calculator implements this** (`app.js` `consolidationPremium` +
  `computeFairness`). The side giving up the bigger single asset (headliner)
  gets a premium added to its *sent* value, so a raw-even swap reads as the
  pile-sender winning. Premium = `0.15 * gap * spread`, where `gap = 1 -
  loHead/hiHead` (0 when headliners are equal) and `spread = min(1,
  extraPieces/3)` (extra pieces the pile side spreads over). Zero for a true
  1-for-1, ceiling 15%, the documented `consolidation.premium_rule_of_thumb`
  in `strategy.js` ("pay 110-115% for a single tier-up player"). A note under
  the verdict names the side and % whenever it fires.
- When proposing a counter-offer, lead with a headliner within **~70-100%
  of the other side's biggest single asset**. Sweeteners fill the gap.
- If the user has no anchor in the right range that they'd be willing to
  move, **say so**. Decline is sometimes the right answer.

## 3. Dynasty Domain "Jeremiah Smith" framework (May 2026)

Source video: https://www.youtube.com/watch?v=ZK5VpWQQveE
Transcript: `transcripts/ZK5VpWQQveE.txt`

### Pick class premium

2027 firsts are inflated above the historical "future 1st" baseline because
of Jeremiah Smith hype. Stored in
`strategy.js::pick_class_premium["2027"]`:

| Slot  | Premium | KTC raw | Historical baseline |
|-------|---------|---------|---------------------|
| Early | +38.5%  | 7,304   | ~5,124 (2026 at same point) |
| Mid   | +17.5%  | 5,628   | ~4,790                      |
| Late  | +11%    | 4,905   | ~4,420                      |

**Implication:** rebuilders holding 27 firsts capture value
*maintenance*, not value *growth*. To grow, redirect to injured
cornerstones (Nabers-type), Upside Premier shots, or buy-low veterans.

### Hit rates (`strategy.js::pick_hit_rates`)

- Early 1st (RB): ~80%
- Early 1st (non-RB): ~65%
- Mid 1st: ~50%
- Late 1st: ~35%
- 2nd: ~20%
- 3rd+: ~8%

Used to discount expected value when warning about over-concentration.

### Value share + production share

In an N-team league, baseline value share = 1/N (~8.33% for 12-team,
10% for 10-team). A top cornerstone alone = ~2.5%. Bands stored in
`strategy.js::share_framework`:

- `contender_lock` = 1.24× baseline
- `rebuild_floor` = 0.72× baseline

`classifyValueShare(share, baseline)` returns one of:
- **CONTENDER** (≥ contender_lock)
- **ABOVE AVG** (≥ baseline)
- **BELOW AVG** (≥ rebuild_floor)
- **REBUILD** (< rebuild_floor)

**Production-share lag:** a team with top-2 value share but bottom-third
production share is failing to field the assets it owns. The coaching tip
`value-share-contender-lock` fires when value share crosses the contender
threshold but stance ≠ contend.

### Liquidity

`pick_value_share` = picks value ÷ total dynasty value. Per Dynasty Domain:

- > 35% → you're **liquidity-locked**, can't make moves until next
  offseason. Coaching tip `pick-liquidity-warning` fires.
- 22-35% → amber (mild concentration)
- < 22% → green (normal)

The Roster Blueprint Strength card surfaces this as a `XX% picks` chip.

### Over-concentration

`27-pick-overconcentration` fires when a roster holds 3+ × 2027 first-round
picks. The recommendation: shop 1-2 to contenders before the season to
convert hype premium into rostered value.

## 4. Position aging curves (3-year outlook)

`dynastyDecay(currentAge, pos)` returns the one-year multiplier on dynasty
value:

| Pos | Peak range | Post-peak decay/yr | Pre-peak growth/yr |
|-----|-----------|---------------------|--------------------|
| QB  | 26-33     | 5%                  | 6%                 |
| RB  | 23-27     | 22% (the cliff)     | 6%                 |
| WR  | 24-29     | 10%                 | 6%                 |
| TE  | 25-30     | 10%                 | 6%                 |
| PICK| n/a       | 0% (held flat)      | 0%                 |

Used by the Trade Calculator's 3-Year Outlook block. Picks are held flat
because their KTC value is already a discounted-rookie expectation;
modeling pick conversion to a specific rookie player would add noise.

## 5. Sub-strategies in `strategy.js::coaching_tips`

Rules fire conditionally on roster state. Each tip has a `when(ctx)`
predicate and a `text(ctx)` renderer. Display order is the list order.

Notable tips:

- `year-too-early` (Belichick rule)
- `rb-sell-window`, `wr-sell-window`, `te-premium-window`
- `contender-window`, `rebuild-buying`, `reload-pivot`
- `superflex-qb-priority` (only fires in SF leagues with QB shortage)
- `27-pick-overconcentration`, `27-late-1st-sell-window-contender`
- `rebuild-pick-ceiling-warning`, `pick-liquidity-warning`
- `value-share-contender-lock`
- `calendar-pre-rookie` (Apr-May), `calendar-summer-buy-low` (Jun-Aug)

Context passed in by `evaluateCoachingTips` in app.js includes:
`rosterPlayers`, `league`, `roster`, `stance`, `archetype`, `valueTier`,
`surplus`, `strength`, and computed fields like `future_first_count_27`,
`late_first_count_27`, `pick_value_share`, `value_share`,
`upside_premier_count`, `aging_rb/wr`, `stack_pairs`, etc.


## Four rules the prompt only states in one line each

Routed out of `CLAUDE.md` on 2026-09-12 to keep that file under the 200-line prompt budget.
The one-line version stays in the prompt because a trap has to be recognizable without opening a
file; the reasoning is here.

**Replacement level is the baseline for every depth question.** 46% of projected skill players are
unrostered in Password is taco and a 196-point QB is free, so a backup is only worth its gap over
the pool. `dynasty-replacement-level` carries the measurement and is the authority if another skill
disagrees about how many QBs to roster.

**Never quote a title-odds delta from one Monte Carlo run.** At 6000 sims the standard error on a
1.4% baseline is about 0.15pp, large enough to flip the sign of a real effect. Pair seeds, report
the spread, and refuse any delta under your own noise floor. `node site/js/dynasty-claims.test.js`
re-derives every measured number the skills quote straight from the data files, so run it after any
`build_ktc.py` or `build_site_data.py` refresh.

**The horizon rule is not optional.** A rebuild sacrifices years 1 to 3 by construction, so scoring
one on a short window rejects every rebuild ever proposed. Use `H >= max(7, years_to_flip + 4)`,
state the discount, and run the discount sensitivity before reporting a verdict. This exact error
shipped once already: a teardown was scored over 3 years, lost, and was reported as refuted.

**Two curves, never interchangeable.** `ageRetention` is dynasty VALUE, which prices a whole
remaining career. `productionRetention` is season POINTS. Value leads production by about a season,
which is why the sell trigger fires while a player is still producing.

**A pick's price is endogenous to the trade that moves it.** `pickValue` slots a pick by its
origin team's projected finish, and the deal being priced is what changes that finish. Price
a buyer's own picks at his pre-trade slot and you will tell him to keep the wrong ones.
Measured 2026-09-12 on the JoeysYIDS + Deal A pair: pre-trade, roster 10 sat at slot 3 and his
own 2027 2nd read 4,410 against 4,070 for the one he had acquired from a better team, so the
advice was to send the acquired pick. Adding five starting receivers moved him to slot 8 and
it inverted, 4,000 against 4,150. Across the five picks he sent, pre-trade slotting overstated
the bill by 1,660 KTC. `pv(season, round, rid, whatIf)` in `site/js/trade-sim.js` takes the
what-if, `repriceUnder()` prints before against after, and `trade-sim.test.js` fails if a
buyer's own pick does not get strictly cheaper once his trade lands.

**Cross-check the two numbers that reach the reader, not one of them four times.**
`championshipOdds` was right the whole time, because `projectLeagueForward` already slots
converted picks off the post-trade finish. The error lived only in a KTC ledger hand-built
beside it, and every verification pass tested the simulator. When a doc carries a model number
and a hand number for the same thing, the check that matters is whether they agree.

## Five rules the 2026-09-16 Tee Higgins call added

**A pick has two prices and only one of them is on KTC.** KTC is what the LEAGUE will pay.
`pickRookiePoints` is what the pick will DO for the roster that holds it, and on a deep roster
those diverge by a factor of two. Measured 2026-09-16: roster 10's own late 2029 first prices at
4,330 KTC and converts to about 110 season points, against a measured replacement-level FLEX of
104.9. It can never enter a lineup that already fields 14 startable bodies. djcomstock's 2027 3rd
and 2028 2nd price at 3,080 and 3,940 and convert to about 75 and 99, both below replacement.
That is why a package the Trade Lab called a 64% overpay scored SECOND of nine in title equity,
and why the package the Trade Lab called 96% fair scored LAST. **Quote both numbers when they
disagree, and say which question each one answers.**

**Where the simulator is blind: it turns a pick into a rookie, never into a trade.** It has no
model of flipping a pick to a third team for a starter, which is exactly what roster 10 did with
five picks on 2026-09-12. So the model systematically UNDERVALUES picks held by a manager who
trades them, and the KTC ledger is the right lens for that manager. When the two disagree, ask
whether the picks are going to become rookies or become players. On 2026-09-16 both lenses
happened to point the same way, at the cheaper of the two pick packages, which is the only
reason that verdict was safe to state plainly.

**QB3 is a strict zero in-season and the succession over the horizon.** `dynasty-trade-construction`
calls a third quarterback in a 1QB league an unconditional sell, and that is correct about this
week's lineup: it cannot enter one short of two simultaneous injuries. It is wrong over
`H >= 7` when the starter is 30, the best unrostered arm in the league projects 148.8 (Jacoby
Brissett, 2026-09-16, 296 players rostered) and the QB slot is the highest-scoring slot on the
roster at 343.9. Paying with the 24-year-old backup scored +1.02 mean equity against +9.18 for
paying with picks, across three seeds. **The skill sets the in-season rule; `titleEquity` over the
horizon overrides it, and the two are not in conflict, they answer different questions.**

**Measure depth by knocking starters out, not by counting bodies.** Six packages all bought the
identical +57.5 season points, because the incoming player took the same lineup slot in every
one. They separate only when a starter misses: average the best legal lineup across knocking out
each of the ten starters in turn and Jordan Love plus a below-replacement body costs 0.0, Caleb
Williams costs 2.5 (Love at 257.5 rather than Caleb at 281.8 covering the starter's absence), and
Quentin Johnston costs 12.7 (Boutte at 125.2 rather than Johnston at 160.7 as the first man up).
`site/js/_depth-cost.js` is the tool; a season total will never show this.

**KTC stops at three rookie classes, and a question about the fourth is still a real question.**
`pv()` in `site/js/trade-sim.js` now synthesizes any class past the last published one as those
anchors times `DECAY` per year beyond it (0.88 default), and `HORIZON` extends the slate; both are
handed to EVERY roster so the comparison stays fair. 0.88 is the honest middle because the live
2027 to 2028 step measures 0.82 to 0.86 per slot AND that step is also unwinding the Jeremiah
Smith premium on 2027, which a plain year of discount is not. Six assertions in
`trade-sim.test.js` pin it under HORIZON 2 to 5 and DECAY 0.7 to 1.0. **Run DECAY at 0.80 and
1.00 before trusting any sign that turns on a synthesized class.**
