---
name: dynasty-player-evaluation
description: Use when the question is about a SPECIFIC player rather than a roster strategy, and whenever you are about to use a draft pick or pick a target off a list. Triggers on "who should I draft", "is X a buy", "what do you think of player Y", "is he a breakout candidate", "should I believe this projection", "who do I take at 1.05", "is this rookie good", "prospect profile", "is he overvalued", "why is he ranked so high", "which of these two", "is the market wrong on him". Separates what this tool can actually measure about a player from what it cannot, so an agent never fabricates scouting it does not have.
---

# Evaluating one player

The rest of this family reasons about ages, values and slots. None of it knows
whether a player is any good. This skill draws that line and refuses to cross it.

Everything below is either **measurable in this repo** or **explicitly not**. There
is no third category, and there is no guessing.

## What this tool can actually measure

| Signal | Where | What it means |
|---|---|---|
| Dynasty value | `ktc.js`, 1QB and SF lists | The market's price. Crowd-sourced from real trade votes. |
| Season projection | `projections.js` | Blend of PrizePicks market lines and Sleeper's model. |
| Age | `players.js` | Position on the aging curve. |
| Injury status | `players.js` | `injury_status`, body part, practice participation. |
| Rostership | `players.js` `owned` / `started` | Percent of leagues rostering and starting him. |
| Market movement | `sleeper-market.js` | 7-day adds and drops. Sentiment, not truth. |
| Expert ranks | `expert-rankings.js` | Named analysts' orderings, per source. |

## The two-source triangle

The only genuine edge available here is **disagreement between the market price and
the production projection**. They come from different places: KTC is trade votes,
the projection is Vegas lines plus a stat model. When they disagree, one is wrong.

```
value-implied points = intercept + slope x dynastyValue   (fit per position)
divergence = projected points - value-implied points
```

- **Divergence strongly positive**: the market prices him below what he is projected
  to produce. Usually because he is old. This is the contender's buy (see
  `dynasty-age-curve-timing` for the arbitrage ratio).
- **Divergence strongly negative**: the market prices him above his production. Usually
  because he is young. This is what you sell if you are contending, and what you hold
  if you are rebuilding.

Divergence is an **age artifact first** and an opinion second. Always check whether
the age curve alone explains it before calling the market wrong.

## Rostership: what it does and does not tell you

Measured 2026-08-09 across 397 projected players carrying rostership data:

| Signal | Correlation with projected points |
|---|---|
| owned% | **0.886** |
| started% | 0.83 |
| owned% minus started% | 0.233 |

These drift with every `build_site_data.py` refresh (they moved 0.880 to 0.886 and
0.198 to 0.233 in two days as rostership settled). The RANKING is what is stable, and
`site/js/dynasty-claims.test.js` re-derives it and fails if owned% ever stops
dominating the gap by 3x. Re-run it after any data refresh rather than trusting these
digits.

owned% is a strong consensus signal, effectively a second market price. Use it as a
sanity check: a player nobody rosters, whom your projection likes, is more often a
projection artifact than an edge.

**The "depth trap" heuristic (high owned, low started) is weak.** The gap correlates
about a quarter as strongly as owned% alone, because owned% saturates at the top, so
the gap mostly identifies mid-tier players rather than overvalued ones. Do not treat
it as a sell signal. Use value over replacement instead
(`dynasty-replacement-level`).

## What this tool does NOT have

State this out loud rather than inventing it. The tool cannot see:

- **College production**: dominator rating, breakout age, target share, yards per
  team pass attempt
- **NFL draft capital**: round and pick, which is the single strongest public
  predictor of rookie outcomes
- **Opportunity**: target share, air yards, route participation, snap share, red-zone
  usage, carries inside the 5
- **Situation**: depth chart position, offensive scheme, quarterback quality,
  offensive line, contract year, coaching change
- **Athletic testing**: combine, RAS

Consequence: **this family can price a 1.03 pick but cannot tell you who to take with
it.** Do not pretend otherwise. When a draft-selection question arrives, say what is
missing and name the external sources that carry it, rather than producing a
confident ranking from age and KTC alone.

## Decision procedure

1. **Classify the question.** Pricing an asset, or picking a player? Pricing is
   supported. Picking needs data this tool lacks. Say which you are doing.
2. **Pull both prices**: dynasty value (correct format list) and season projection.
3. **Compute divergence** and check whether age explains it.
4. **Check rostership** as a consensus cross-check.
5. **Check injury status** before any of it matters (`isSidelined` benches Out,
   Doubtful, IR, PUP; Questionable still starts).
6. **Check expert dispersion.** Where named analysts disagree sharply, the market
   price is a weak prior and the range is the honest answer.
7. **If the question needs opportunity or draft capital, stop and say so.** Recommend
   pulling it before committing a first-round pick.

## The fit, so divergence is reproducible

Fit least squares per position over players appearing on both the `ktc-oneqb` board
and the projection list. Dynasty value is `ktcValue / 100`, the site's 0-110 scale.
Refit when either file is rebuilt; these coefficients are from the 2026-07-27 board.

| Pos | n | value-implied points |
|---|---|---|
| QB | 38 | −39.5 + 6.164 x value |
| RB | 97 | −43.8 + 4.118 x value |
| WR | 141 | −15.4 + 3.656 x value |
| TE | 54 | 6.7 + 3.015 x value |

## Worked: the owner's roster

- **Jeremiyah Love, RB 21, value 77.5, projects 233.** Value-implied 275, divergence
  −42: the market pays a premium over this season's production. That is exactly what
  a 21-year-old should look like and it is not a sell signal. Age explains it.
- **Mike Evans, WR 32, value 41.4, projects 200.** Value-implied 136, divergence +64.
  The market has already written off a player projected as a WR2. Classic old-producer
  arbitrage: a contender should buy him.
  **And so the owner should sell him.** Measured over 5 seeds x 15,000 sims, selling
  Evans costs **0.76pp** of title odds, the *smallest* loss among the roster's four
  best assets (McBride 0.87, Jeremiyah Love 0.91, Achane 0.93). He is the cheapest
  top asset to convert into futures and the only one the market is currently
  underpaying for, which is the entire definition of a sell window.
  An earlier pass of this skill claimed the cost was "2.8pp, the largest on the
  roster" and concluded hold. That number was never measured, and 2.8pp cannot be
  lost from a 1.4% baseline at all. Both the number and the verdict were wrong.
- **Travis Hunter, WR 23, value 40.5, projects 97.** Divergence −36 on a young player,
  which the age curve partly explains. What the tool CANNOT tell you is whether the
  97 reflects a two-way role limiting his routes. That is opportunity data, and it is
  the whole question. Flag it, do not guess.
- **Chig Okonkwo, TE 26, projects 144, absent from the 1QB board.** Resolved: the KTC
  lists are 350 entries each and he is off the end of both, so this is list truncation,
  not a market verdict of zero. His 144 outprojects the best free TE (Freiermuth 120).
  Never read "not on the list" as "worth nothing"; check the list length first.

**Any sell verdict here is a one-season number.** The deltas above price this season.
A hold-versus-sell call inside a rebuild must be scored over
`H >= max(7, years_to_flip + 4)` with the discount stated and a sensitivity sweep run,
per `dynasty-championship-equity-horizon`. A 32-year-old's cost is front-loaded and a
rebuild's payoff is not, so a one-season comparison is biased toward holding him.

## Failure modes

- **Producing a rookie ranking from age and dynasty value.** That is the market's
  ranking with extra steps, and it will read as analysis. Refuse it.
- **Calling a divergence an edge before checking age.** Most divergence is the aging
  curve, which both sources already know about.
- **Trusting a projection for a player with no role.** The projection models
  production given opportunity, and opportunity is the part not in this repo.
- **Using superflex value in a 1QB league.** See `dynasty-league-format-leverage`,
  the QB adjustment is 0.70x and steeper at the top.
- **Treating market movers as information.** `sleeper-market.js` adds and drops are
  sentiment and news-chasing. Directionally useful for detecting that something
  happened, useless for whether it matters.
- **Silently narrowing scope.** If asked who to draft and answering only what a pick
  is worth, say that is the substitution being made.
