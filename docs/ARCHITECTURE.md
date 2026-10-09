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
#draft/:draftId?
#strategy
#action
#sources
#about
```

**Sub-tab routing convention:** a trailing path segment after the view's
required args is the sub-tab. `viewDashboard`, `viewLeague`, `viewRoster`
all accept a `tabArg` and validate it against an allowed list, defaulting
to the first tab.

## Draft Room (`#draft`), the one live-polling view

`viewDraft` is the only view whose data comes from Sleeper at render time
rather than from `data/*.js`. Two facts shape it:

- **Any draft is readable by id, mocks included.** A mock carries
  `league_id: null` and `metadata.type: 'league_mock'`, and never appears in
  `/user/<id>/drafts`, which is why the picker takes a pasted URL. The board
  itself does not care which kind it got.
- **`draftAsLeague(d)` turns a draft into a league object.** The draft
  publishes `slots_*` and `scoring_type`, enough to build `roster_positions`
  and `scoring` and hand them to `offenseStartingSlots`, `fillLineup`,
  `projPoints` and `vorByPid` unchanged. When the draft belongs to a league
  in `window.LEAGUES` the real scoring map is borrowed instead, because
  `scoring_type` alone loses per-league tweaks (an INT at -2, TE premium).

The layout copies Sleeper on purpose, because that is the shape muscle memory
expects mid-draft:

- **The board is a grid, teams across and rounds down**, not a feed. Cells carry
  the snake label (`2.11`), the player, and `POS-TEAM (bye)`, tinted by position
  with the same `--c` idiom as `.pos-chip`. Your column is ringed, the cell on
  the clock gets an accent border, and the grid scrolls that cell into view when
  a pick lands.
- **The tray at the bottom holds everything you act on**, Sleeper-style: two
  tabs, `Available` (the best-available table plus its filters) and `Your team`.
  Tap the bar to open or close it, drag the bar to resize; a press that moves
  under 4px counts as a tap, anything more is a resize. A tab tapped while the
  tray is shut opens it on that tab. Tab, open state and height persist per
  draft. The tray body is a flex column so the filters stay pinned while only
  the table scrolls.
- **`Mine` is your own editable ranking**, seeded from the full-PPR Gibbs board
  and stored in `localStorage` (`ff-my-rankings-v1`) as an ORDERED ARRAY of
  sleeper ids, so rank is the index and a gap or a tie is unrepresentable. Type
  a number to jump a player; drag the grip to nudge him, which is enabled only
  when sorted by `Mine` ascending. The store is global, not per-draft.
- **What it polls depends on the draft's live status, which is re-read.** Not
  running (`pre_draft` / `paused`) asks only whether it started, every 15s.
  Running polls `/picks` at 1s-2s (10s once stalled) and re-reads status every
  fifteenth beat. `complete` is terminal and holds no timer. The `Live` button
  reports which of those states it is in.
- The tray is `position: fixed` and pads `#main` to stay clear of the board,
  which is why leaving the view calls `teardownDraftView()` rather than just
  clearing the poll timer.
Best available sorts by **VOR** by default, not points: raw points always
drafts a QB first. Kickers and defenses carry no projection in this repo, so
they never appear on the board. `_draftTimer` is the only interval the app
holds, and `route()` calls `stopDraftPoll()` so navigating away cannot leave
it polling a view that is gone.

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

### Public Sleeper account selection

`site/js/account.js` runs before the app and supplies `LEAGUES`, `MY_USER_ID`
and `FANTASY_SCHEDULE` for the chosen public username. This is a read-only
selector, with no credentials or ownership verification. No selection means
empty account views, while shared rankings stay available.

The remembered selection uses stable Sleeper user ID. Snapshots are versioned
and keyed by user ID and NFL season; each contains league IDs, lineup rules and
scoring settings. All app storage keys pass through `FF_ACCOUNT.storageKey`.
Marks retain their league-and-player keys inside the account namespace. Only
the build owner's stable ID can migrate his older unscoped personal keys.
Account changes abort requests and reload to discard the previous account's
memory. A generation guard also rejects late responses.

Account data refreshes on each visit, after 15 minutes on focus, every 30
minutes while visible, and manually. Failed automatic refreshes have a
one-minute cooldown; requests retry at most twice and time out after 12
seconds. Leagues and matchup weeks load with bounded concurrency. A closed
app catches up when opened; browser timers do not run while it is closed.
This static app needs no per-user server job. Shared source builds keep their
own freshness timestamps and are not duplicated by the account loader.

The owner's same-season imported ESPN league remains a separately dated
snapshot. Sleeper refreshes never claim to refresh ESPN, and other accounts
never receive that league. Missing optional data is listed explicitly; unknown
buy-ins do not produce dollar-weighted results, and missing draft/pick feeds
do not manufacture an owned-picks slate.

`site/js/espn-account.js` links public ESPN football league URLs or numeric
IDs after the viewer selects a team. Direct browser requests omit credentials;
private leagues require making the league public in ESPN. No password, cookie
collection or public proxy is used. Links persist under the stable Sleeper ID,
or a separate disconnected browser persona. Selecting Sleeper never adopts
the disconnected persona's leagues. Up to eight links refresh with the same
visit/focus/manual/visible cadence, one ESPN league request at a time.

Linked ESPN snapshots replace an imported league with the same ID. Unlinking
also records a per-persona exclusion so the build's imported snapshot does not
reappear on refresh. Rosters resolve against the existing shared player data;
unmatched names and unsupported lineup/scoring rules stay explicit. Original
ESPN scoring, schedule settings and status are retained. The shared weekly
model cannot represent arbitrary ESPN scoring, and ESPN playoff forecasts are
unavailable; those limitations are separate from current records and rosters.

## The recursion break (CRITICAL — do not undo)

Picks are valued by their exact Sleeper draft slot when published. Unknown
future slots use their *originator's* projected finish. Projecting finish means
asking "where will roster X land?" That requires a strength comparison across
the league. But if pick values feed roster strength, and strength feeds pick
values, we get an infinite loop.

**Solution:**
- `startingStrength(roster, league, yearsOut, includePicks=false)` — best legal
  lineup, NO picks when `includePicks` is false
- `computeRosterStrength(roster, league)` — calls `computePlayerStrength`
  then adds owned picks via `rosterOwnedPicks` + `pickValue` (which calls
  `originSlot` → `startingStrength` with picks off, terminating)
- `originSlot()` ranks by picks-free STARTING strength. That breaks the cycle
  and is the correct model twice over: finish is driven by the lineup you
  field, not by a pick stockpile *and not by roster depth*. It used to rank on
  `computePlayerStrength` (sum of every rostered player), which ranked a
  depth-hoarding rebuilder among the best teams and priced their future first
  as a late-round pick. `js/origin-slot.test.js` pins this.

If you ever refactor `computeRosterStrength`, preserve this split, and never
pass `includePicks: true` from `originSlot`.

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
# refresh the dated half-PPR context board (hand-fed CSV; --source/--title label it)
python site/data/build_jacob_gibbs.py site/data/_sources/jacob-gibbs-2026-08-14.csv \
  --updated-at 2026-08-14 --source "Jacob Gibbs via CBS Sports" --title "2026 Top-175 Overall (Half-PPR)"
python site/data/build_expert_rankings.py   # rebuild the toggleable analyst columns
python site/data/_sources/build_gibbs_brief.py  # regenerate site/gibbs-tiers.html to match
python Leagues/build_league_folders.py  # refresh Sleeper roster cache
python site/data/build_site_data.py  # rebuild site data from caches
```

The KTC scraper requires no auth; Sleeper API is also public.
