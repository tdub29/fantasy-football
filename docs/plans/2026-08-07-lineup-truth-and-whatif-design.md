# Lineup truth + what-if — design

Date: 2026-08-07
Status: approved, implementing

## Why

A session of roster questions ("where would I rank if I added these four WRs?")
got answered with throwaway node scripts because the app could not answer them.
Reading the code to write those scripts turned up defects in what the app *does*
ship. This design folds the scripts into the app and fixes what they exposed.

## What already exists (do not rebuild)

- **Team starter-points board.** `viewProjections` renders "Team offense — best
  lineup" for every roster in a league, sorted, with YOU highlighted. Backed by
  `optimalOffense` + `offenseSlots`. Covered by `projections.test.js`.
- **A what-if engine.** `lineupPoints(lg, playerIds, src)` takes an arbitrary id
  list. `tradeLineupImpact` computes now/after/delta and is wired into the Trade
  Lab summary.

The gap is not the board. It is that the board lies in three specific ways, and
that nothing lets you pose a hypothetical to it.

## Defects this fixes

1. **Taxi and IR players start.** `optimalOffense` and `optimalDefense` read
   `roster.players` unfiltered. Sleeper's `players` array includes taxi and
   reserve. Measured on Password is taco: it starts Isaac TeSlaa (taxi) for
   tdub1329 and moves Karl Havoc 2356.8 → 2323.4. Every team's number is wrong
   by a different amount, so the *ranking* is wrong, not just the totals.
2. **League scoring is ignored.** `p[src]` is pre-scored by `score_offense.py`
   under one fixed rule set (1 PPR, 4pt pass TD, INT −1). Password is taco is
   INT −2. The per-source raw `stats` are already in `projections.js` and unused.
3. **Three lineup fillers.** `optimalOffense` (points, count-based slots),
   `fillLineup` (value, slot objects), `optimalDefense` (top-K, no slots). Only
   one of the three knows about position legality, and none knew about taxi. A
   fourth copy lived in the scratch scripts.

## Decisions

Questions were posed and not answered, so these are called here and stated
plainly rather than left open.

**Where the what-if lives: the existing Projections board.** Not a new page, not
the Trade Lab. The board already ranks every team and `lineupPoints` already
accepts an arbitrary id list, so the what-if is a tray over an existing surface
rather than a new one. The Trade Lab stays the two-roster negotiation tool; the
board becomes the league-wide "what would this do to the standings" tool.

**Taxi/IR handling differs by metric, deliberately.** Points lineups always
exclude taxi and reserve — those players cannot be started this week. The value
model excludes them from Present Value for the same reason but *includes* them
in Future Value, because taxi eligibility expires and a stashed rookie is a real
future starter. This asymmetry is the correct one and is commented at both sites.

**League scoring is applied by rescoring raw stats,** falling back to the
precomputed `p[src]` when a player has no stat line for the selected source. No
new data file, no pipeline change.

**One slot model, one filler.** `offenseStartingSlots` + `fillLineup` (added
earlier today for the value model) become the single implementation. Points
lineups feed it `{v: points, pos, name}`; the value model feeds it
`{v: dynastyValue, pos}`. `optimalOffense` becomes a thin adapter.

## Architecture

```
offenseStartingSlots(league)  ->  [{pos, flex}]        slot shape from roster_positions
startableIds(roster, opts)    ->  [playerId]           players minus taxi/reserve
leagueScorePoints(stats, lg)  ->  number               raw stats under this league's rules
fillLineup(assets, slots)     ->  [asset]              the one legal-lineup filler

optimalOffense(roster, lg, src)   = fillLineup(pointsAssets(...), slots)
startingStrength(roster, lg, ...) = fillLineup(valueAssets(...), slots)
lineupPoints(lg, ids, src)        = same path, arbitrary id list  <- what-if reuses this
```

The what-if tray holds a set of extra player ids in view state. The board maps
each roster through `optimalOffense`, splicing the extra ids into my roster only,
and re-sorts. Removing an id re-renders. No persistence — a hypothetical that
survives a reload is a footgun.

## Error handling

- A player with no projection for the selected source is skipped, not zeroed.
  Skipping keeps a roster comparable across sources; zeroing would silently
  punish teams whose players PrizePicks does not list.
- A league with no parseable `roster_positions` falls back to the old
  position-blind top-K, so partial league payloads still render.
- A what-if id already on my roster is a no-op, not a duplicate row.

## Testing

- Extend `starting-lineup.test.js`: taxi/reserve exclusion, league rescoring vs
  the fixed baseline, what-if splice is additive and idempotent.
- Extend `projections.test.js`: `optimalOffense` through the shared filler still
  produces a legal lineup and no longer starts a taxi player.
- Verify by render: boot the static server, open Projections, confirm the board
  order changes and the what-if tray re-ranks.

## Out of scope

- Championship win probability with injury risk. Queued separately as Taco task
  `t-1786123505568` (High, research lane) — it needs Monte Carlo over a schedule
  plus injury/games-missed priors, which is a modeling project, not a view.
- Rescaling the dynasty-value model to fix its age bias (it under-prices 30+
  production ~1.4x). That bias runs through every value view; the points model
  already exists for people who want points.
