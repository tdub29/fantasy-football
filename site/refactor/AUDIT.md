# Technical audit — `site/js/app.js`

> Phase 1 output. A complete, technical description of everything the file does.
> Group symbols by concern; the groups become module boundaries in the plan.
> Keep updating this in Phase 3 until it agrees exactly with the file.

- **File:** `Fantasy Football/site/js/app.js`
- **Lines:** `7718` (measured `wc -l`; the task brief's "7358" is stale — the file was edited 2026-07-28)
- **Language / stack:** vanilla ES (ES2020+), **no build step**, no framework, no bundler. One classic (non-module) `<script>` wrapping everything in a single IIFE.
- **Audited:** 2026-07-29
- **Baseline tests:** not captured in this pass (Phase 0 baseline is a later step). Existing suite per `Fantasy Football/CLAUDE.md`: `node site/js/projections.test.js && node site/js/team-needs.test.js && node site/js/trade-picks.test.js && node --test site/js/jacob-gibbs.test.js`, plus `node --check site/js/app.js` for syntax. **These `.test.js` files require app.js internals but app.js exports nothing — see "How it's loaded" — so they must contain their own copies of the logic under test; verify before treating them as a parity net.**

## How it's loaded (the wiring that constrains everything)

`index.html` loads **17 data scripts first**, then `app.js`, all as classic scripts (no `type="module"`):

```
data/players.js data/leagues.js data/rankings.js data/ktc.js data/sleeper-idp.js
data/sleeper-market.js data/history.js data/context.js data/player-info.js
data/projections.js data/environment.js data/sos.js data/categories.js
data/sos-grid.js data/jacob-gibbs.js data/strategy.js data/build-info.js
→ js/app.js
```

Each `data/*.js` assigns one or more **globals on `window`**. `app.js` reads them by name; it never imports them. The contract app.js consumes:

| Global | From | Used for |
|---|---|---|
| `window.PLAYERS` | players.js | Sleeper player master (id → {name,pos,team,age,…}) |
| `window.LEAGUES` | leagues.js | the 3 leagues + rosters |
| `window.RANKINGS_SOURCES` | rankings.js | tier/ranking sources + `picks` + KTC-anchored entries |
| `window.TIER_VALUES`, `window.SUPERFLEX_POS_MULT`, `window.IDP_POS_MULT`, `window.CATEGORY_LABELS`, `window.CATEGORY_COLORS` | categories.js | tier→value tables, format multipliers, category labels/colors |
| `window.OFFENSE_PROJ` | projections.js | fantasy-point projections (offense+defense units) |
| `window.STRATEGY` | strategy.js | age curves, share framework, legacy `pick_values_1qb` fallback |
| `window.SLEEPER_MARKET` | sleeper-market.js | trending adds/drops |
| `window.JACOB_GIBBS_RANKINGS` | jacob-gibbs.js | analyst rank overlay |
| `window.HISTORY`, `window.CONTEXT`, `window.PLAYER_INFO` | history/context/player-info.js | player-detail modal data |
| `window.TEAM_ENV`, `window.TEAM_SOS`, `window.SOS_GRID`, `window.PLAYER_CATEGORIES` | environment/sos/sos-grid/categories | env chips, schedule strip, SOS grid |
| `window.BUILD_INFO` | build-info.js | data-freshness timestamps |

**app.js writes back to `window` exactly once:** `window.__app = { state, rankIndex, computeRosterStrength, sleeperIdFor }` (line 7715, console-debug handle). It defines **no ES exports** — everything else lives inside the IIFE closure and is unreachable from outside. This is the single most important fact for the refactor: there is no public surface to diff and no import graph, only lexical scope.

**Entry:** `document.addEventListener('DOMContentLoaded', boot)` (7717). `boot()` guards on the required globals, seeds settings, renders the sidebar, wires mobile-nav + Cmd+K + `hashchange`, then calls `route()`. Routing is hash-based (`#dashboard`, `#league/:id/:tab`, `#roster/:lg/:rid/:tab`, `#trade/:lg`, …).

**Structure:** the whole file is `(() => { 'use strict'; … })();`. Top-level symbols therefore sit at 2-space indent, which is why a `^function`/`^const` (column-0) grep returns nothing. Sections are marked with `// ====` banner comments.

## Concern groups (→ future modules)

| Group | What it is | Symbol count (approx) | Target module (Phase 2) |
|---|---|---|---|
| Config / constants | route table, label/color maps, filter defaults, magic numbers | ~22 | `config.js` |
| DOM / format primitives | `$`, `$$`, `h`, `fmt`, `toast`, `cssEscape` | 6 | `dom.js` |
| Settings & module state | settings persistence + all mutable view state / caches | ~18 | `state.js` |
| Player identity / matching | name normalization → Sleeper id resolution | 6 | `players/identity.js` |
| Data indexes & caches | derived views over the globals (rank/pick/mispricing/proj indexes, freshness) | ~14 | `data/indexes.js` |
| Scoring / valuation core | tier value, VOR, roster strength, value share (the domain math) | ~26 | `scoring/` |
| Roster grading / archetypes | position grades, buys/sells, coaching tips, trade strategy | ~30 | `scoring/grading.js`, `scoring/advice.js` |
| Draft-picks domain | pick keys, slots, KTC pick values, owned picks | 11 | `picks.js` |
| Trade projection / simulation | N-year value projection, trade before/after, finder | ~13 | `scoring/trade-sim.js` |
| Projections domain | VOR/optimal-lineup math over `OFFENSE_PROJ` | ~14 | `projections.js` |
| Shared cell renderers | chips/badges/rows reused across views | ~35 | `ui/cells.js` |
| Layout & navigation | ROUTES, sidebar, tabs, breadcrumbs, router | 8 | `ui/layout.js`, `router.js` |
| View controllers (pages) | one function per route; build the page DOM | ~26 | `views/*.js` |
| Player-detail modal | self-contained overlay feature | ~13 | `views/player-modal.js` |
| Command palette + boot | Cmd+K, `boot`, entry listeners | 3 | `views/command-palette.js`, `main.js` |

## Symbol inventory

Complete, grouped by concern. Every top-level symbol in the IIFE appears exactly once. Side effects = I/O, DOM, network, localStorage, global reads/writes, mutation of shared closure state. Line = definition start.

### 1. Config / constants → `config.js`

| Symbol | Line | Kind | What | Deps / notes |
|---|---|---|---|---|
| `SETTINGS_KEY` | 38 | const | localStorage key `'ff-site-settings-v2'` | — |
| `defaults` | 39 | const | default settings shape | — |
| `FRESH_CRITICAL` | 171 | const | files that gate "stale" banner | — |
| `DATA_LABEL` | 173 | const | filename → plain-English label | — |
| `ROUTES` | 703 | const | sidebar/route table (hash,label,icon,section) | read by `renderSidebar`, `setActiveNav`, `openCmdK` |
| `PROJECTION_YEARS` | 2842 | const | =5, projection horizon | scoring |
| `CURRENT_SEASON` | 2843 | const (IIFE) | current NFL season int | scoring/picks |
| `RANKINGS_FILTER` | 1553 | const (mutable) | Rankings-page filter state | **only used by dead `viewRankings`** |
| `ALL_FILTER` | 1718 | const (mutable) | All-Players filter state | **only used by dead `viewAllPlayers`** |
| `POS_STAT_COLS` | 6595 | const | per-position stat columns (history block) | modal |
| `PROJ_SRC_LABEL` | 7149 | const | proj source → label | projections |
| `STAT_LABEL` | 7150 | const | stat key → label | projections |
| `POS_CHIPS` | 7155 | const | position chip lists per unit | projections |
| `FLEX_GROUPS` | 7156 | const | `['RB','WR','TE']` | projections |
| `ENV_TIER_COLOR` | 7164 | const | env tier → CSS var | cells |
| `OURCAT_COLOR` | 7179 | const | category → color | cells |
| `OURTIER_COLOR` | 7187 | const | tier letter → color | cells |

Mutable view-state consts (`state`, `TRADE_STATE`, `KT`, `PROJ_STATE`, `SOS_GRID_POS`, `SOS_GRID_SORT`) are inventoried under group 3 because they are *state*, not config.

### 2. DOM / format primitives → `dom.js`

| Symbol | Line | Kind | What → out | Side effects | Depended on by |
|---|---|---|---|---|---|
| `$` | 12 | const fn | `(sel,root)` → first match | DOM read | ~everywhere |
| `$$` | 13 | const fn | `(sel,root)` → array of matches | DOM read | many views |
| `h` | 14 | const fn | hyperscript `(tag,props,...children)` → Element; handles `class/dataset/style/on*/html` | DOM create + `addEventListener` (line 21) | **~every renderer** |
| `fmt` | 31 | const obj | `{pct,num,decimal}` formatters | — | many |
| `toast` | 51 | function | transient notification | DOM append to `#toasts`, `setTimeout` | import flow, settings |
| `cssEscape` | 5490 | function | `CSS.escape` wrapper w/ fallback | reads `window.CSS` | trade DOM queries |

### 3. Settings & module state → `state.js`

| Symbol | Line | Kind | What | Side effects |
|---|---|---|---|---|
| `state` | 63 | const obj | root mutable state `{settings}` (exposed via `window.__app`) | shared-mutable |
| `defaults`/`SETTINGS_KEY` | 39/38 | const | (also config) | — |
| `loadSettings` | 44 | function | parse settings from localStorage | localStorage read |
| `saveSettings` | 48 | function | persist `state.settings` | localStorage write |
| `getAllSources` | 67 | function | built-in + custom sources | reads `RANKINGS_SOURCES`, `state` |
| `ensureSourceDefaults` | 72 | function | seed per-source/-ranking enabled flags | mutates `state.settings` |
| `_sleeperByName` | 96 | let | memo for `sleeperByName` | closure cache |
| `_sleeperByLastPos` | 137 | let | memo for `sleeperByLastNamePos` | closure cache |
| `_rankIndex`/`_rankIndexKey` | 167/168 | let | memo for `rankIndex` | closure cache |
| `_mispriceIdx`/`_mispriceKey` | 269 | let | memo for `mispricingIndex` | closure cache |
| `_projByPidIdx` | 325 | let | memo for `projByPid` | closure cache |
| `_vorLevelCache` | 333 | const Map | VOR-level cache | closure cache |
| `_pickIndex`/`_pickIndexKey` | 425/426 | let | memo for `pickIndex` | closure cache |
| `_valueShareCache` | 648 | const Map | value-share cache | closure cache |
| `_jacobGibbsIndex` | 916 | let | memo for `jacobGibbsIndex` | closure cache |
| `_stanceCache` | 1968 | const Map | roster-stance cache | closure cache |
| `_leaguePickAvgCache` | 3146 | const Map | league pick-avg cache | closure cache |
| `TRADE_STATE` | 5073 | const obj | trade-calculator working state (sides, rosterIds) | shared-mutable |
| `KT` | 5087 | const obj | kinetic-trade UI flags `{reduced}` | shared-mutable |
| `PROJ_STATE` | 7148 | const obj | projections-page filter/sort state | shared-mutable |
| `SOS_GRID_POS` | 7485 | let | SOS grid selected position | shared-mutable |
| `SOS_GRID_SORT` | 7486 | let | SOS grid sort key/dir | shared-mutable |

> The nine `_*` caches are the load-bearing hidden coupling — see Notes. `invalidateRankIndex` (group 5) is the one function that knows all of them.

### 4. Player identity / matching → `players/identity.js`

| Symbol | Line | Kind | What → out | Deps |
|---|---|---|---|---|
| `norm` | 86 | const fn | normalize a name (strip punctuation/suffixes) | — |
| `sleeperByName` | 97 | function | build/memo name→pid Map incl. aliases | `norm`, `PLAYERS`, `_sleeperByName` |
| `sleeperIdFor` | 128 | function | exact name → pid | `sleeperByName`, `norm` |
| `sleeperByLastNamePos` | 138 | function | build/memo (lastname\|pos)→pid | `norm`, `PLAYERS`, `_sleeperByLastPos` |
| `sleeperIdForFuzzy` | 151 | function | fuzzy name+pos → pid | `sleeperIdFor`, `sleeperByLastNamePos` |

### 5. Data indexes & caches → `data/indexes.js`

| Symbol | Line | Kind | What → out | Side effects / deps | Depended on by |
|---|---|---|---|---|---|
| `dataFreshness` | 180 | function | per-file age + stalest critical | reads `BUILD_INFO` | dashboard, about |
| `rankIndex` | 193 | function | aggregate enabled rankings → `{byName,bySleeperId,all}` w/ overall+pos ranks | reads sources/`TIER_VALUES`; memo `_rankIndex` | **the core index — read by ~everything** |
| `invalidateRankIndex` | 254 | function | clear rank/pick/mispricing/valueShare/leaguePickAvg caches | mutates 5 cache vars | source toggles (viewSources) |
| `mispricingIndex` | 270 | function | per-pos value-rank vs proj-rank gap Map | `rankIndex`,`OFFENSE_PROJ`,`tierValue`; memo | verdicts, chips, action center |
| `projByPid` | 326 | function | pid → `{p,unit}` from `OFFENSE_PROJ` | memo `_projByPidIdx` | VOR/proj |
| `pickIndex` | 427 | function | build 1qb+sf pick-value Maps (2-pass, KTC-canonical) | reads `RANKINGS_SOURCES`; memo | `pickValue`, cmdk |
| `jacobGibbsIndex` | 917 | function | name→Gibbs rank Map | reads `JACOB_GIBBS_RANKINGS`; memo | gibbs cells |

### 6. Scoring / valuation core → `scoring/value.js` + `scoring/roster.js`

| Symbol | Line | Kind | What → out | Deps | Notes |
|---|---|---|---|---|---|
| `playerVerdict` | 301 | function | BUY/SELL/HOLD `{label,tone,why}` | `mispricingIndex`,`STRATEGY.age_curve`,`ageOf` | |
| `projByPid` | (326) | — | (in group 5) | | |
| `vorLevels` | 334 | function | per-pos replacement level, memo | `targetStartersByPos`,`projPosGroup`,`OFFENSE_PROJ` | |
| `vorForPlayer` | 357 | function | VOR from a proj player obj | `vorLevels` | |
| `vorByPid` | 367 | function | VOR by pid | `projByPid`,`vorForPlayer` | |
| `ppEdge` | 378 | function | PrizePicks − Sleeper pts | — | |
| `ppEdgeByPid` | 382 | function | ppEdge by pid | `projByPid` | |
| `primaryLeague` | 395 | function | the "me" league or first | reads `LEAGUES` | |
| `slotToBucket` | 464 | function | 1..N slot → early/mid/late | — | |
| `tierValue` | 473 | function | ranked entry → numeric value (KTC-first, format mult) | `TIER_VALUES`,`SUPERFLEX/IDP_POS_MULT` | **hot path** |
| `targetStartersByPos` | 492 | function | league → fractional starter slots/pos | reads `league.roster_positions` | |
| `isStartable` | 518 | function | is player a league-wide starter | `targetStartersByPos` | |
| `rosterSurplusShortage` | 530 | function | per-pos surplus/shortage | `targetStartersByPos`,`isStartable` | |
| `computePlayerStrength` | 563 | function | roster → player-only strength+breakdown | `rankIndex`,`tierValue`,`norm`,`PLAYERS` | **cycle-break: NO picks** |
| `ageRetention` | 606 | function | aging multiplier N yrs out | `STRATEGY.age_curve` | |
| `projectedPlayerStrength` | 628 | function | player-only strength N yrs out | `computePlayerStrength`,`rankIndex`,`ageRetention` | |
| `leagueValueTotals` | 649 | function | per-roster player strength totals, memo | `computePlayerStrength` | |
| `valueShareFor` | 664 | function | roster share of league value | `leagueValueTotals` | |
| `classifyValueShare` | 672 | function | share → CONTENDER/…/REBUILD | `STRATEGY.share_framework` | |
| `computeRosterStrength` | 682 | function | player strength **+ picks** | `computePlayerStrength`,`rosterOwnedPicks` | **cycle-break: WITH picks** (exposed on `window.__app`) |

### 7. Roster grading / archetypes → `scoring/grading.js` + `scoring/advice.js`

| Symbol | Line | Kind | What (one line) |
|---|---|---|---|
| `rankInLeague` | 1907 | fn | roster's value rank within its league |
| `offenseStarterCount` | 1915 | fn | count offensive starter slots |
| `startingStrength` | 1927 | fn | top-N lineup value (optionally w/ picks) |
| `rosterStance` | 1969 | fn | contender/rebuild stance, memo `_stanceCache` |
| `getRosterPlayers` | 2774 | fn | roster → `[{sleeper,ranked,value}]` |
| `classifyValueTier` | 2782 | fn | strength→value tier label |
| `classifyValueArchetype` | 2790 | fn | roster player-mix archetype |
| `classifyRosterArchetype` | 2800 | fn | overall roster archetype |
| `classifyTwoYearOutlook` | 2827 | fn | 2-yr outlook label |
| `ageMultiplier` | 2858 | fn | per-pos age multiplier (value projection) |
| `projectPlayerValue` | 2887 | fn | player value curve (present+future) |
| `rosterValueCurve` | 2931 | fn | roster value curve over horizon |
| `maxPosValue` | 2967 | fn | max value at a position (grading scale) |
| `gradePosition` | 2984 | fn | letter grade for one position |
| `gradeLineupSlots` | 3006 | fn | fill optimal lineup slots + grade (123 lines) |
| `gradePositionFromSlots` | 3129 | fn | grade a pos from slot result |
| `gradeBench` | 3134 | fn | bench-depth grade |
| `leaguePickAvg` | 3147 | fn | avg pick value in league, memo |
| `gradeDraftCapital` | 3161 | fn | draft-capital grade |
| `getDraftCapitalSummary` | 3177 | fn | pick summary for a roster |
| `suggestBuysSells` | 3221 | fn | buy/sell target lists |
| `evaluateCoachingTips` | 3271 | fn | actionable coaching tips (95 lines) |
| `topPriorities` | 3367 | fn | top priorities for a roster |
| `idealTradePartners` | 4377 | fn | ranked trade-partner suggestions |
| `stanceOf` | 4470 | fn | tier+archetype → stance |
| `tradeStrategy` | 4479 | fn | full trade-strategy block (170 lines) |

### 8. Draft-picks domain → `picks.js`

| Symbol | Line | Kind | What |
|---|---|---|---|
| `isPickKey` | 5527 | fn | is a trade key a `pick:` key |
| `parsePickKey` | 5528 | fn | parse pick key → parts |
| `pickKey` | 5532 | fn | build a pick key |
| `knownDraftSlot` | 5535 | fn | exact Sleeper draft slot if known |
| `draftPickSlot` | 5547 | fn | slot (known or projected) |
| `draftPickLabel` | 5551 | fn | human label for a pick |
| `originSlot` | 5564 | fn | project a future pick's slot from expected finish → `projectedPlayerStrength` |
| `pickYearsOut` | 5579 | fn | seasons until a pick |
| `pickValue` | 5584 | fn | KTC pick value (66 lines); `STRATEGY` legacy fallback |
| `rosterOwnedPicks` | 5650 | fn | picks a roster owns w/ values (54 lines) |

### 9. Trade projection / simulation → `scoring/trade-sim.js`

| Symbol | Line | Kind | What |
|---|---|---|---|
| `dynastyDecay` | 6034 | fn | 1-yr dynasty multiplier by age/pos |
| `projectAssetValue` | 6046 | fn | asset value N yrs out |
| `projectSideValue` | 6065 | fn | value of a trade side N yrs out |
| `lineupStrengthFrom` | 6096 | fn | lineup strength from ids+picks |
| `projectedRosterStrength` | 6117 | fn | roster strength N yrs out |
| `projectedTradeStrength` | 6126 | fn | roster strength after a trade |
| `projectedTradeRanks` | 6145 | fn | league ranks after a trade |
| `simulateRosterStrength` | 6165 | fn | strength w/ ids removed/added |
| `openTradeFor` | 5090 | fn | open trade calc pre-filled |
| `suggestTrades` | 5107 | fn | candidate trades |
| `buildTradeFinder` | 5138 | fn | trade-finder panel data |
| `buildTeamNeeds` | 5235 | fn | per-team needs block (255 lines) |

### 10. Projections domain → `projections.js`

| Symbol | Line | Kind | What |
|---|---|---|---|
| `projPosMatch` | 7157 | fn | pos matches filter |
| `ageOf` | 7166 | fn | player age by pid w/ fallback |
| `teamEnv` | 7172 | fn | team → env row (`TEAM_ENV`) |
| `ourCat` | 7185 | fn | pid → our category (`PLAYER_CATEGORIES`) |
| `teamSos` | 7199 | fn | team → SOS row (`TEAM_SOS`) |
| `projUnitData` | 7244 | fn | current unit's proj data |
| `projMap` | 7245 | fn | unit → pid→proj Map |
| `offenseSlots` | 7250 | fn | offense starter slots |
| `idpSlotCount` | 7258 | fn | IDP slot count |
| `projPosGroup` | 7264 | fn | pos → group |
| `optimalOffense` | 7270 | fn | best offensive lineup by proj |
| `optimalDefense` | 7290 | fn | best defensive lineup by proj |
| `lineupPoints` | 7300 | fn | total lineup projected pts |
| `tradeLineupImpact` | 7310 | fn | lineup-pts delta from a trade |

### 11. Shared cell renderers → `ui/cells.js`

All return DOM (`h(...)`); many read globals for labels/colors. Presentation adapters that also call scoring (`vorChip`, `mispriceChip`, `ppEdgeChip`) are flagged.

| Symbol | Line | What | Notes |
|---|---|---|---|
| `pillCategory` | 887 | category pill | reads `CATEGORY_LABELS` |
| `tierChip` | 895 | tier chip | |
| `posChip` | 900 | position chip | |
| `teamChip` | 903 | team chip | |
| `rookieBadge` | 906 | rookie badge | |
| `uncertainBadge` | 909 | uncertainty badge | |
| `depBadge` | 912 | depth-chart badge | |
| `jacobGibbsEntry` | 927 | Gibbs entry lookup | `jacobGibbsIndex` |
| `jacobGibbsDateLabel` | 931 | Gibbs date label | |
| `jacobGibbsHeader` | 935 | Gibbs col header | |
| `jacobGibbsCell` | 941 | Gibbs cell | |
| `playerRow` | 951 | standard player row | composes many chips |
| `ppEdgeChip` | 386 | PP-edge chip | **calls `ppEdgeByPid` (scoring)** |
| `vorChip` | 400 | VOR chip | **calls `vorByPid` (scoring)** |
| `mispriceChip` | 412 | mispricing chip | **calls `mispricingIndex`** |
| `kpiCard` | 1542 | KPI card | dashboard |
| `archetypeChip` | 4073 | archetype chip | |
| `slotPPG` | 4083 | slot PPG cell | |
| `gradeCircle` | 4103 | grade circle | |
| `buyRow` | 4142 | buy/sell row | |
| `posColumn` | 4154 | position column | `maxPosValue` |
| `marketGauge` | 4230 | market gauge | |
| `positionalAgeTracker` | 4292 | age tracker viz | |
| `tradeScenarioCard` | 4650 | trade scenario card | |
| `draftCapitalCard` | 4707 | draft-capital card | |
| `fmtStat` | 6607 | stat formatter | **dup of `fmt`** |
| `sparkline` | 6614 | inline sparkline SVG | |
| `fmtPct` | 6692 | percent formatter | **dup of `fmt.pct`** |
| `fmtMoney` | 6696 | money formatter | |
| `deltaChip` | 6703 | delta chip | |
| `envChip` | 7173 | team-env chip | `teamEnv`,`ENV_TIER_COLOR` |
| `ourTierChip` | 7188 | our-tier chip | `ourCat`,`OURTIER_COLOR` |
| `ourCatChip` | 7193 | our-category chip | `ourCat`,`OURCAT_COLOR` |
| `envInfoLine` | 7200 | env info line | |
| `defColor` | 7211 | defense color | |
| `scheduleStrip` | 7218 | schedule strip | `teamSos`,`defColor` |
| `defRankColor` | 7487 | SOS-grid cell color | |

### 12. Layout & navigation → `ui/layout.js` + `router.js`

| Symbol | Line | Kind | What | Side effects |
|---|---|---|---|---|
| `tabBar` | 721 | fn | sub-tab bar | DOM |
| `breadcrumbs` | 737 | fn | breadcrumb trail | DOM |
| `pageHeader` | 749 | fn | page header block | DOM |
| `renderSidebar` | 760 | fn | build sidebar from ROUTES + leagues (~100 lines) | DOM into `#sidebar`, reads `LEAGUES` |
| `setActiveNav` | 862 | fn | mark active nav item | DOM, reads `location.hash` |
| `navigate` | 7549 | fn | set `location.hash` | **navigation side effect** |
| `route` | 7550 | fn | hash → view dispatch (switch) | renders `#main`, calls `renderSidebar`,`setActiveNav`, `window.scrollTo`; try/catch renders error |
| `ROUTES` | (703) | — | (config) | |

### 13. View controllers (pages) → `views/*.js`

Each builds a page into `#main`. Line = start.

| Symbol | Line | Route | Notes |
|---|---|---|---|
| `viewDashboard` | 973 | `#dashboard` | ~488 lines |
| `insightsStrip` | 1461 | (dashboard helper) | |
| `viewRankings` | 1554 | (none) | **DEAD — router maps `#rankings`→dashboard** |
| `viewAllPlayers` | 1719 | (none) | **DEAD — router maps `#players`→dashboard** |
| `viewLeagues` | 1834 | `#leagues` | |
| `viewLeague` | 1989 | `#league/:id/:tab` | ~170 lines |
| `renderLeaguePlayers` | 2166 | (league subview) | ~280 lines; per-league filter in localStorage |
| `renderLeagueTimeline` | 2452 | (league subview) | ~317 lines; **only network fetch in file** |
| `viewRoster` | 3384 | `#roster/:lg/:rid/:tab` | **~690 lines — largest function** |
| `viewSources` | 4748 | `#sources` | |
| `renderSourceCard` | 4828 | (sources helper) | |
| `openImportModal` | 4894 | (sources helper) | modal; toast |
| `viewCompare` | 4965 | `#compare/:lg/:a/:b` | |
| `viewTrade` | 5173 | `#trade/:lg` | kinetic trade calc |
| `buildTradeSide` | 5705 | (trade helper) | ~160 lines; drag/drop |
| `attachDrag` | 5866 | (trade helper) | `addEventListener` dragstart/end |
| `attachPileDropTarget` | 5890 | (trade helper) | `addEventListener` drag events |
| `attachPoolDropTarget` | 5918 | (trade helper) | `addEventListener` drag events |
| `tradeMiddleSummary` | 5950 | (trade helper) | before/after summary |
| `viewActionCenter` | 6183 | `#action` | contains todo localStorage (`TKEY`, `loadTodos`, `saveTodos` — inner closures) |
| `viewStrategy` | 6385 | `#strategy` | |
| `viewAbout` | 6536 | `#about` | reads `BUILD_INFO`, `dataFreshness` |
| `viewProjections` | 7321 | `#projections` | ~159 lines |
| `viewSosGrid` | 7492 | `#sos` | reads `SOS_GRID` |
| `leagueSelector` | 5518 | (shared control) | |

### 14. Player-detail modal → `views/player-modal.js`

| Symbol | Line | Kind | What |
|---|---|---|---|
| `openPlayerDetail` | 6584 | fn | entry: open modal for a player |
| `historyBlock` | 6633 | fn | career history section (`HISTORY`) |
| `contextBlock` | 6709 | fn | opportunity/coaching/contract context (~225 lines, `CONTEXT`) |
| `playerModal` | 6934 | fn | assemble modal DOM (~128 lines); `keydown` listener |
| `projectionBlock` | 7062 | fn | projection section (`OFFENSE_PROJ`) |
| `playerInfoBlock` | 7106 | fn | player-info section (`PLAYER_INFO`) |
| `envInfoLine` | (7200) | — | (also cells) |
| Inner helpers `fmtStat`/`fmtPct`/`fmtMoney`/`sparkline`/`deltaChip` | — | — | inventoried in group 11 |

### 15. Command palette + boot → `views/command-palette.js` + `main.js`

| Symbol | Line | Kind | What | Side effects |
|---|---|---|---|---|
| `openCmdK` | 7587 | fn | Cmd+K palette over routes/leagues/rosters/players/picks | DOM overlay, `keydown` listener, `navigate`, `openPlayerDetail` |
| `boot` | 7685 | fn | guard globals → seed → wire nav/Cmd+K/hashchange → `route()` | DOM, `addEventListener` (hashchange, click, keydown) |
| `window.__app` | 7715 | assignment | console-debug export | **only `window` write** |
| DOMContentLoaded listener | 7717 | side effect | `boot` on ready | **top-level side effect** |

## Notes

- **Dead-code suspects (confirm unreferenced before any Phase-7 removal):**
  - `viewRankings` (1554) and `viewAllPlayers` (1719) — defined but the router explicitly maps `#rankings`/`#players` → `viewDashboard` (route() lines 7562-7563, comment "Tier Sheet + All Players removed"). Each name appears only at its own definition. Strong dead-code candidates.
  - `RANKINGS_FILTER` (1553) and `ALL_FILTER` (1718) — appear only inside those two dead views; die with them.
  - Verify with `grep -n '\bviewRankings\b' app.js` (expect 1 hit = the def) before removal. **Do NOT remove during the behavior-preserving move — park to later pass.**
- **Duplication (park for a later pass, do not collapse during the move):**
  - `fmt.pct` (31) vs `fmtPct` (6692); `fmt.decimal/num` vs `fmtStat` (6607)/`fmtMoney` (6696) — overlapping formatters, one canonical set would do.
  - `slotToBucket`/`draftPickSlot`/`originSlot` bucketing logic is threaded through several call sites; leave as-is until picks module lands.
  - VOR replacement-level math (`vorLevels`) and starter-slot math (`targetStartersByPos`, `offenseSlots`) partly overlap conceptually.
- **Hidden coupling / globals:**
  - **One IIFE, one lexical scope, ~220 symbols.** No exports. Any extraction converts implicit closure references into explicit imports.
  - **Nine memo caches** (`_sleeperByName`, `_sleeperByLastPos`, `_rankIndex`+key, `_mispriceIdx`+key, `_projByPidIdx`, `_vorLevelCache`, `_pickIndex`+key, `_valueShareCache`, `_jacobGibbsIndex`, `_stanceCache`, `_leaguePickAvgCache`). `invalidateRankIndex` (254) resets five of them by name — extraction must keep a single owner per cache or the invalidation desyncs.
  - **All domain math reads `window.*` globals directly** rather than taking data as parameters (e.g. `computePlayerStrength` reads `window.PLAYERS` inside the loop). Modules will import a thin data-access layer or keep reading `window` for now (shim-friendly).
  - Mutable shared state objects (`state`, `TRADE_STATE`, `KT`, `PROJ_STATE`, `SOS_GRID_POS/SORT`, `RANKINGS_FILTER`, `ALL_FILTER`) are mutated across many functions — they must live in one `state.js` that others import, not be re-declared per module.
- **Top-level side effects (constrain load order):**
  - `window.__app = {…}` (7715) and `document.addEventListener('DOMContentLoaded', boot)` (7717) run at IIFE load.
  - Everything assumes the 17 `data/*.js` globals already exist (they load in earlier `<script>` tags). Any move to `type="module"` must preserve "data globals defined before app code runs."
- **The deliberate cycle-break (do NOT "fix"):** the picks-free strength path exists specifically to break the recursion `computeRosterStrength → rosterOwnedPicks → pickValue → originSlot → startingStrength(includePicks=false)`. (`projectedPlayerStrength` used to sit at the end of that chain; it was deleted in Aug 2026 because ranking finish by whole-roster sum mispriced hoarders' picks.) These must land in modules that preserve this one-directional call (picks/trade-sim may import scoring, scoring must not import picks except via the existing `computeRosterStrength → rosterOwnedPicks` edge). Documented in the file (558-562) and in `docs/ARCHITECTURE.md`.
- **Surprises the audit almost missed:**
  - The **only** `fetch` in the entire file is inside `renderLeagueTimeline` (2511) — Sleeper transactions API, cached in localStorage for 30 min. Network access is not spread out; it is one call site.
  - `viewActionCenter` hides a whole todo-list feature (`TKEY`, `loadTodos`, `saveTodos`) as inner closures with their own localStorage — not visible in the top-level symbol scan.
  - `h`'s `on*` prop path (line 21) is where most event listeners are attached; the explicit `addEventListener` calls (drag/drop in trade, keydown in modal/cmdk, hashchange/click in boot) are the exceptions.
  - Two adjacent `// ====` banners at 7139-7143 ("Router" immediately followed by "Projections") — cosmetic banner drift; the projections code, not the router, follows.
  - `.test.js` siblings can't import from the IIFE, so they duplicate logic; they are **not** a true characterization net for app.js until Phase 0 adds a render smoke test.
