# Architecture — how the site is wired

## Single-file frontend

Everything lives in `site/js/app.js` (~5,400 lines). Module pattern is a
big IIFE; helpers are function declarations at the top, view functions
below, boot at the bottom.

- `h(tag, props, ...children)` — DOM builder (search "function h(" in app.js)
- `state` — global state object with `settings.enabledSources`,
  `settings.enabledRankings`, persisted to `localStorage`
- Data files load via `<script>` tags in `site/index.html` (no bundler).
  They push onto `window.RANKINGS_SOURCES` (KTC, etc.) and set
  `window.LEAGUES` + `window.PLAYERS` + `window.STRATEGY`.

## Routing

Hash-based, single-level dispatcher in `route()`:

```
#dashboard/:tab?
#rankings
#players
#leagues
#league/:leagueId/:tab?      tabs: standings | players | timeline
#roster/:leagueId/:rosterId/:tab?   tabs: snapshot | strategy | roster | angles
#trade/:leagueId?
#compare/:leagueId/:rA/:rB
#strategy
#action
#sources
#about
```

**Sub-tab routing convention:** a trailing path segment after the view's
required args is the sub-tab. `viewDashboard`, `viewLeague`, `viewRoster`
all accept a `tabArg` and validate it against an allowed list, defaulting
to the first tab.

`tabBar(tabs, activeKey, hashFor)` + `breadcrumbs(crumbs)` are reusable
helpers, defined near the top of app.js next to `pageHeader(...)`.

## Sidebar with persistent league context

`renderSidebar()` rebuilds the sidebar on every route change. When inside
any `#league/...` or `#roster/...`, the matching league entry gets
`is-context` class (violet stripe) and an inline sub-nav opens beneath it
with: Standings, Players, Timeline, My Roster, Trade Lab.

## The cache stack

Several lookups are computed lazily and cached. **All four caches invalidate
together** via `invalidateRankIndex()`:

| Cache                  | Key                                | Purpose |
|------------------------|------------------------------------|---------|
| `_rankIndex`           | enabled sources/rankings           | flat `idx.all` + name/id lookups |
| `_pickIndex`           | enabled sources/rankings           | KTC pick value by `season|slot|round` |
| `_leaguePickAvgCache`  | leagueId + enabled signature       | league-average pick stockpile (for grade normalization) |
| `_valueShareCache`     | leagueId + enabled signature       | per-roster player-only strength totals + league total |

If you add another league-derived cache, add it to `invalidateRankIndex`.

## The recursion break (CRITICAL — do not undo)

Picks are valued by their exact Sleeper draft slot when published. Unknown
future slots use their *originator's* projected finish. Projecting finish means
asking "where will roster X land?" That requires a strength comparison across
the league. But if pick values feed roster strength, and strength feeds pick
values, we get an infinite loop.

**Solution:**
- `computePlayerStrength(roster, league)` — players only, NO picks
- `computeRosterStrength(roster, league)` — calls computePlayerStrength
  then adds owned picks via `rosterOwnedPicks` + `pickValue` (which calls
  `originSlot` → `computePlayerStrength`, terminating)
- `originSlot()` uses player-only strength to break the cycle, and this is
  also semantically correct: a team's expected end-of-year finish is
  driven by their on-field roster, not by their pick stockpile.

If you ever refactor `computeRosterStrength`, preserve this split.

## Value share

`leagueValueTotals(lg)` returns `{ totals, leagueTotal, baseline }`. Cached.

`valueShareFor(roster, lg)` returns `{ share, baseline, mine, leagueTotal }`.

`classifyValueShare(share, baseline)` returns
`{ label, tone, delta }` for the four Dynasty Domain bands.

Surfaced on:
- Roster Blueprint banner — "Value Share" stat with band chip
- League → Standings rows — share % colored by band

## Trade calculator (`viewTrade`)

State lives in `TRADE_STATE = { leagueId, sideA: { rosterId, picks }, sideB }`.
`picks` is a `Set` of either Sleeper player IDs or pick keys
(`pickKey(season, round, originRosterId)`).

The middle summary card has refs to all live cells (aVal, bVal, verdict,
fair, deltaA, deltaB, y0..y3). `KT.refreshMiddle(lg, ...)` recomputes
everything on any pile change. Preview mode shows hover-state values
without committing.

**3-Year Outlook** (`y0..y3` rows): `projectSideValue(keys, lg, yearsOut)`
walks each key, multiplies by compounded `dynastyDecay(age, pos)` per year.
Picks held flat. Symmetric — `netB = aSends - aReceives` by construction.

## League Timeline (`renderLeagueTimeline`)

- Lazy-fetches `/league/{id}/transactions/{week}` for weeks 1..N
- N = current NFL week during season, 18 in off-season
- Caches in `localStorage` keyed by leagueId for 30 min
- Refresh button (in header) busts the cache
- Filter pills: Trades / Waivers / FA / Drafts + "My moves only"
- Trade rows show **value-swing chips** per side (received KTC − sent KTC)
- Pick labels use exact notation when Sleeper publishes draft order, such as
  "2026 1.06". Unknown future slots stay generic, such as "2027 R1".

## League Players (`renderLeaguePlayers`)

- Pulls `idx.all` then filters to league-relevant positions
- Excludes DST/K/P always; excludes IDP positions unless `lg.is_idp`
- Sortable columns (Rank/Player/Pos/Age/Value), sticky thead
- Owner cell is a clickable link to that roster
- Filter state persists per-league in `localStorage`

## Coaching tips engine (`evaluateCoachingTips`)

Builds a `ctx` object then runs every rule in `STRATEGY.coaching_tips`. Each
rule has `when(ctx)` + `text(ctx)`. Tips render on Roster Blueprint →
Strategy sub-tab (own roster only).

Adding a new tip:
1. Add an entry to `strategy.js::coaching_tips`
2. If it needs new ctx fields, extend the ctx-building block in
   `evaluateCoachingTips` (around line 2100 in app.js)

## Mobile

Sidebar collapses below 960px. Hamburger button (`#nav-toggle` in
`index.html`) + scrim toggle `body.nav-open`. Tab bars scroll horizontally
on overflow. `.page-actions` becomes full-width below 720px.

## Build / refresh data

```bash
# from repo root
python site/data/build_ktc.py        # refresh KTC players + picks
python site/data/build_jacob_gibbs.py path/to/FantasyPros.csv  # refresh dated half-PPR context
python Leagues/build_league_folders.py  # refresh Sleeper roster cache
python site/data/build_site_data.py  # rebuild site data from caches
```

The KTC scraper requires no auth; Sleeper API is also public.
