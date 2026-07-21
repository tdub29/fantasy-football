# Session log — what was built when

Chronological summary of work done in chat. Most recent at the bottom.

## May 2026 — IA + dynasty framework session

### Trade-suggestion bug (UPTIER both QBs in superflex)

Fixed in `tradeStrategy()` UPTIER block (~line 2725 of app.js). Was picking
the top-2 startables from a single surplus position, which in the user's
superflex league meant suggesting both Allen and Caleb in one trade. New
logic: take 1 quality startable + 1 non-startable depth piece from a
surplus position, and refuse to pair two startables from the same position
unless surplus there is ≥ 2.

### IA restructure (Ralph Loop session)

Replaced the flat sidebar with grouped sections (Overview / Players /
Dynasty / Tools / Reference) and added sub-tab routing to the heavy views:

- **Dashboard** → 4 sub-tabs: Overview / Leagues / Market / Cornerstones
- **League** → 3 sub-tabs (final form): Standings / Players / Timeline
- **Roster Blueprint** → 3 sub-tabs: Snapshot / Strategy / Roster (or
  "Trade Angles" instead of Strategy on non-self rosters)

Added breadcrumbs, page eyebrows + format tags, persistent league context
in the sidebar (`is-context` violet stripe + inline sub-nav with Standings
/ Players / Timeline / My Roster / Trade Lab when inside a league),
mobile hamburger + scrim, editorial thin-underline tab bar styling.

### Rankings reverse-engineering experiment

User asked to isolate one of two source rankings that were averaged to
produce a FantasyPros draft list. The math: `unknown = 2 × AVG − pasted`.
Verified by checking that all AVG values were `.0` or `.5` (confirming
exactly two sources averaged) and STD.DEV = `|unknown − pasted| / 2`.

Outputs saved at repo root:
- `_isolate_ranking.py`
- `_pasted_rankings.tsv` — the FantasyPros draft list
- `_isolated_ranking.tsv` — the reverse-engineered second source

### Beyond the Box Score positional rankings

Saved from screenshots:
- `_beyond_box_score_rb_rankings.tsv` (77 RBs, season redraft)
- `_beyond_box_score_wr_rankings.tsv` (76 WRs)
- `_beyond_box_score_te_rankings.tsv` (32 TEs)

All flagged as 2026 *season redraft* half-PPR, NOT dynasty.

### KTC pick valuations end-to-end

User asked to use KTC as the source for pick values relative to players,
specifically pick value based on the originator's projected finish in
that year.

Implementation:
- `build_ktc.py` now extracts `position: "RDP"` entries into a `picks`
  array per ranking
- `pickIndex()` builds `season|slot|round → KTC value` lookup
- `pickValue(season, round, originRosterId, league)` reads KTC first,
  falls back to strategy.js
- `slotToBucket(slot, totalRosters)` maps 1..N projected finish → early/mid/late
- `originSlot()` uses `computePlayerStrength` (not full strength) to
  break the recursion that would otherwise form

Picks now contribute to:
- `computeRosterStrength` (roster total)
- `gradeDraftCapital` (value-weighted vs league avg)
- DOWNTIER trade-strategy synthetic pool
- Trade Calculator pile + pool
- Cmd+K palette ("2027 Early 1st" searchable)

### 3-Year Outlook in Trade Calculator

Added to the middle summary card:
- `dynastyDecay(age, pos)` returns one-year multiplier; calibrated to
  position curves
- `projectAssetValue` + `projectSideValue` walk a side, age each asset
- New rows in middle card: Today / +1 yr / +2 yr / +3 yr with net Δ for
  each side, colored by gain/loss

### Code review pass

User asked for a self-review of the work. Identified and fixed:
- Memoized `gradeDraftCapital`'s league-avg into `leaguePickAvg(lg)`
- Keyed `_pickIndex` on enabled-sources signature (was unconditionally
  walking every source)
- Tightened `projectSideValue` symmetry comment + collapsed dead vars
- Added KTC pick coverage warning when fallback fires for current+2yr
  window

### Dynasty Domain "Jeremiah Smith" framework

Pulled YouTube transcript via yt-dlp, extracted principles, encoded into
`strategy.js`:

- `pick_class_premium["2027"]` — +38.5% early / +17.5% mid / +11% late
- `pick_hit_rates` — empirical hit rates per round
- `share_framework` — baseline / contender_lock / rebuild_floor
- Five new coaching tips: `27-pick-overconcentration`,
  `27-late-1st-sell-window-contender`, `rebuild-pick-ceiling-warning`,
  `pick-liquidity-warning`, `value-share-contender-lock`

UI surfaces:
- Roster Blueprint "Strength" stat shows `XX% picks` chip (liquidity)
- Trade Lab pick rows show `+38%` class-premium chip with tooltip

Source: https://www.youtube.com/watch?v=ZK5VpWQQveE
Transcript cached at `transcripts/ZK5VpWQQveE.txt`

### Value Share as first-class metric

Promoted from hidden-ctx-field to visible:
- `leagueValueTotals(lg)` (cached) + `valueShareFor(roster, lg)` +
  `classifyValueShare(share, baseline)` helpers
- Roster Blueprint banner: "Value Share" stat with band chip
  (CONTENDER / ABOVE AVG / BELOW AVG / REBUILD)
- League Standings rows: share % colored by band, with tooltip

Verified: in the 10-team taco league, baseline = 10%, user sits at 9.5%
(BELOW AVG), Karl Havoc at 14% is the only CONTENDER.

### League → Players + Timeline tabs

Replaced the old "Cornerstones" tab with two new ones:

**Players** — ranking view scoped to the league:
- Full dynasty list overlaid with this-league ownership
- Sortable columns (Rank/Player/Pos/Age/Value) with arrow indicators
- Sticky thead, clickable owner cell links to that roster
- Filters: position, category, scope (all/rostered/free/mine), search
- Filter state persists per-league
- **DST/K excluded always; IDP excluded unless league is IDP** (user
  feedback)

**Timeline** — lazy-fetched Sleeper transactions:
- Pulls `/league/{id}/transactions/{week}` in parallel up to current week
  (season) or week 18 (off-season)
- 30-min localStorage cache, refresh button busts
- Filter pills with live counts: Trades / Waivers / FA / Drafts, "My
  moves only"
- Trade rows show **value-swing chips** per side (received KTC − sent KTC)
- Pick labels now use exact notation when Sleeper publishes draft order
  ("2026 1.06"); unknown future slots stay generic ("2027 R1").
- Editorial timeline rail (border-left axis, month gutters, icon dots)

### Docs consolidation (this commit)

Created `CLAUDE.md` at repo root + `docs/` folder with:
- `USER.md` — Trevor's profile, voice, preferences, feedback history
- `FRAMEWORKS.md` — KTC, Dynasty Domain, headliner rule, value share,
  liquidity, aging curves — all in one place
- `ARCHITECTURE.md` — internals: caches, recursion break, routing, views
- `SESSION_LOG.md` — this file
