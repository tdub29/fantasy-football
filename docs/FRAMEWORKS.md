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

## 2. Headliner Rule (user-explicit feedback)

In a dynasty trade, the **biggest single asset on each side anchors the
deal.** A package of smaller pieces that "sums to" the headliner does not
substitute, even if KTC totals match. The user has explicitly told us this.

- KTC's own "Value Adjustment" mechanic confirms this: reverse-engineered
  penalty against the side trying to substitute many lesser pieces for one
  stud, factoring stud-factor + number-of-lesser-pieces.
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
| PICK| —         | 0% (held flat)      | 0%                 |

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
