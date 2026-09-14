# Refactor plan — `site/js/app.js`

> Phase 2 output, reconciled in Phase 3. Cross-reference: every audit symbol
> maps to exactly one extraction step; every step traces to real symbols.

## Target architecture

- **Pattern chosen:** **ES modules, no build step** — one `<script type="module">` entry (`app.js`) that imports a layered tree (`config → dom/state → data/indexes → scoring → picks/projections → ui → views → router → entry`). This is exactly the "Vanilla JS / HTML-with-inline-`<script>`" default in the skill's [architecture-patterns.md](../../../.agents/skills/refactor-god-file/references/architecture-patterns.md): `config.js, state.js, api-ish, ui/*.js, main.js as ES modules; keep the HTML as the shell; `<script type="module">`; no build step needed.`
- **Why this one (fits the stack + matches THIS repo's conventions):**
  1. The project's hard constraint (root `CLAUDE.md` + `Fantasy Football/CLAUDE.md`) is **"served as static files, no npm, no build step, don't introduce one."** ES modules are the only way to get a real import graph *without* a bundler — they run natively in the browser. A bundler/feature-framework is explicitly off the table.
  2. The repo **already ships JS as many separate files** (`data/*.js`, `js/*.test.js`) loaded by `<script>`. Splitting `app.js` into more small files is consistent, not novel. The only new thing is `type="module"` on the one entry tag.
  3. Layered (not feature-folder) is right here because the domain math (scoring, picks, projections) is **shared across every page**, and the audit shows a clean dependency gradient (constants → indexes → scoring → views). Feature folders shine when features are independent; here the "features" (pages) all sit on one shared valuation engine, so a shared layered core + thin `views/` is DRY-er. Reference doc: "Feature folders beat layer folders once past a few features … a shared `lib/` only for genuinely cross-feature code" — inverted here because the cross-cutting core is the bulk of the code.
- **Sources consulted (Phase 2 research):**
  - Skill reference [references/architecture-patterns.md](../../../.agents/skills/refactor-god-file/references/architecture-patterns.md) — vanilla-JS row + leaf-first order + shim mechanics.
  - Web search "vanilla JavaScript ES modules no build step project structure" (2026-07): native `<script type="module">` needs no build and is the recommended no-build approach for a project this size; the common no-build layout is `js/{main.js, router.js, …}` with modules by responsibility. Tradeoff noted: many small module files = more HTTP requests than a bundle; acceptable for a personal static tool (and mitigable later with HTTP/2 or a one-line esbuild step if it ever ships wide — that is a *later pass*, not this refactor).
  - This repo's own existing structure: `site/data/*.js` (one concern per file), `site/js/*.test.js`, `docs/ARCHITECTURE.md` (documents the `computePlayerStrength`/`computeRosterStrength` cycle-break the plan must preserve).

## Target directory tree

```
site/js/
  app.js                    # slim module entry: imports the tree + boot() + window.__app  (was the 7718-line IIFE)
  config.js                 # constants: ROUTES, DATA_LABEL, FRESH_CRITICAL, label/color maps, magic numbers
  dom.js                    # $, $$, h, fmt, toast, cssEscape  (zero domain knowledge)
  state.js                  # settings persistence + all mutable view-state objects (single owner)
  data/
    indexes.js              # rankIndex/pickIndex/mispricingIndex/projByPid/jacobGibbsIndex/dataFreshness/invalidateRankIndex (+ their caches)
  players/
    identity.js             # norm + sleeper* name→id resolution (+ its caches)
  scoring/
    value-core.js           # tierValue, targetStartersByPos, isStartable, slotToBucket, projPosGroup, primaryLeague, ageRetention  (leaves)
    vor.js                  # VOR + ppEdge + playerVerdict + classifyValueShare
    roster.js               # computePlayerStrength/projectedPlayerStrength/value share/rosterSurplusShortage/stance + computeRosterStrength
    grading.js              # position/bench/draft grades, archetypes, outlook, value curves
    advice.js               # suggestBuysSells, evaluateCoachingTips, topPriorities, idealTradePartners, tradeStrategy
    trade-sim.js            # dynasty decay + N-year projection + trade before/after + finder + team needs
  picks.js                  # pick keys/slots/labels/KTC values/owned picks
  projections.js            # proj-domain math (projMap, optimal lineups, lineupPoints, tradeLineupImpact, unit helpers)
  ui/
    cells.js                # chips/badges/rows/gauges reused across views
    layout.js               # renderSidebar, setActiveNav, tabBar, breadcrumbs, pageHeader, leagueSelector
  router.js                 # navigate, route (hash → view dispatch)
  views/
    dashboard.js  leagues.js  roster.js  trade.js  sources.js  compare.js
    projections.js  sos.js  action.js  strategy.js  about.js
    player-modal.js  command-palette.js
```

| Path | Responsibility (one line) |
|---|---|
| `app.js` | Import the tree, expose `window.__app`, run `boot()` after DOM ready. |
| `config.js` | Static tables/labels/colors/magic numbers, no logic. |
| `dom.js` | DOM + formatting primitives with zero domain knowledge. |
| `state.js` | The one place mutable settings + view state live. |
| `data/indexes.js` | Derived, memoized views over the `window.*` data globals. |
| `players/identity.js` | Name → Sleeper-id resolution. |
| `scoring/*` | The valuation engine (values, VOR, roster strength, grades, advice, trade sim). |
| `picks.js` | Draft-pick keys, slots, and KTC values. |
| `projections.js` | Fantasy-point / optimal-lineup math over `OFFENSE_PROJ`. |
| `ui/*` | Reusable render pieces + shell layout + router. |
| `views/*` | One page controller per route; compose everything below into `#main`. |

## Concern-group → target module mapping

| Audit group (§) | Symbols | → target module | Extraction step |
|---|---|---|---|
| 1 Config | SETTINGS_KEY, defaults, FRESH_CRITICAL, DATA_LABEL, ROUTES, PROJECTION_YEARS, CURRENT_SEASON, POS_STAT_COLS, PROJ_SRC_LABEL, STAT_LABEL, POS_CHIPS, FLEX_GROUPS, ENV_TIER_COLOR, OURCAT_COLOR, OURTIER_COLOR | `config.js` | 2 |
| 2 DOM/format | $, $$, h, fmt, toast, cssEscape | `dom.js` | 3 |
| 3 Settings/state | state, loadSettings, saveSettings, getAllSources, ensureSourceDefaults, TRADE_STATE, KT, PROJ_STATE, SOS_GRID_POS, SOS_GRID_SORT, RANKINGS_FILTER, ALL_FILTER | `state.js` | 4 |
| 4 Identity | norm, sleeperByName, sleeperIdFor, sleeperByLastNamePos, sleeperIdForFuzzy (+ caches) | `players/identity.js` | 5 |
| 6 (leaves) | tierValue, targetStartersByPos, isStartable, slotToBucket, projPosGroup, primaryLeague, ageRetention | `scoring/value-core.js` | 6 |
| 5 Indexes | rankIndex, invalidateRankIndex, mispricingIndex, projByPid, pickIndex, jacobGibbsIndex, dataFreshness (+ caches) | `data/indexes.js` | 7 |
| 6 (VOR) | vorLevels, vorForPlayer, vorByPid, ppEdge, ppEdgeByPid, playerVerdict, classifyValueShare | `scoring/vor.js` | 8 |
| 6 (roster, no picks) | computePlayerStrength, projectedPlayerStrength, leagueValueTotals, valueShareFor, rosterSurplusShortage, rosterStance, rankInLeague, offenseStarterCount, startingStrength, stanceOf | `scoring/roster.js` | 9 |
| 8 Picks | isPickKey, parsePickKey, pickKey, knownDraftSlot, draftPickSlot, draftPickLabel, originSlot, pickYearsOut, pickValue, rosterOwnedPicks | `picks.js` | 10 |
| 6 (roster + picks) | computeRosterStrength | `scoring/roster.js` (added after picks) | 11 |
| 9 Trade sim | dynastyDecay, projectAssetValue, projectSideValue, lineupStrengthFrom, projectedRosterStrength, projectedTradeStrength, projectedTradeRanks, simulateRosterStrength, openTradeFor, suggestTrades, buildTradeFinder, buildTeamNeeds | `scoring/trade-sim.js` | 12 |
| 7 Grading | getRosterPlayers, classifyValueTier, classifyValueArchetype, classifyRosterArchetype, classifyTwoYearOutlook, ageMultiplier, projectPlayerValue, rosterValueCurve, maxPosValue, gradePosition, gradeLineupSlots, gradePositionFromSlots, gradeBench, leaguePickAvg, gradeDraftCapital, getDraftCapitalSummary | `scoring/grading.js` | 13 |
| 7 Advice | suggestBuysSells, evaluateCoachingTips, topPriorities, idealTradePartners, tradeStrategy | `scoring/advice.js` | 14 |
| 10 Projections | projPosMatch, ageOf, teamEnv, ourCat, teamSos, projUnitData, projMap, offenseSlots, idpSlotCount, optimalOffense, optimalDefense, lineupPoints, tradeLineupImpact | `projections.js` | 15 |
| 11 Cells | pillCategory, tierChip, posChip, teamChip, rookieBadge, uncertainBadge, depBadge, jacobGibbsIndex+entry/date/header/cell, playerRow, ppEdgeChip, vorChip, mispriceChip, kpiCard, archetypeChip, slotPPG, gradeCircle, buyRow, posColumn, marketGauge, positionalAgeTracker, tradeScenarioCard, draftCapitalCard, fmtStat, sparkline, fmtPct, fmtMoney, deltaChip, envChip, ourTierChip, ourCatChip, envInfoLine, defColor, scheduleStrip, defRankColor | `ui/cells.js` | 16 |
| 12 Layout | tabBar, breadcrumbs, pageHeader, renderSidebar, setActiveNav, leagueSelector | `ui/layout.js` | 17 |
| 13 Views | viewDashboard/insightsStrip, viewLeagues/viewLeague/renderLeaguePlayers/renderLeagueTimeline, viewRoster (+ its render helpers), viewTrade/buildTradeSide/attach*/tradeMiddleSummary, viewSources/renderSourceCard/openImportModal, viewCompare, viewProjections, viewSosGrid, viewActionCenter, viewStrategy, viewAbout | `views/*.js` (one file per page) | 18-19 |
| 14 Modal | openPlayerDetail, playerModal, historyBlock, contextBlock, projectionBlock, playerInfoBlock | `views/player-modal.js` | 20 |
| 15 Palette | openCmdK | `views/command-palette.js` | 21 |
| 12 Router | navigate, route | `router.js` | 22 |
| 15 Boot | boot, window.__app, DOMContentLoaded | `app.js` (stays as entry) | — |
| DEAD | viewRankings, viewAllPlayers, RANKINGS_FILTER, ALL_FILTER | **not moved — later-pass removal** | — |

> The `jacobGibbsIndex` memo function is data-index by nature but is only consumed by the Gibbs cells; it can live in `data/indexes.js` (step 7) and be imported by `ui/cells.js` (step 16). Listed once, in step 7.

## Extraction sequence (leaf-first, dependency-ordered)

Each step depends only on already-extracted or not-yet-touched code. Execute in this order in Phase 4.

| # | Extract | → target path | Depends on steps | Done |
|---|---|---|---|---|
| 1 | **Enabling step (no symbols moved).** Convert the IIFE to a module: change `index.html` `<script src="js/app.js">` → `<script type="module" src="js/app.js">`; drop the `(() => { … })()` wrapper; fix boot so it still runs (module scripts are deferred and can execute *after* `DOMContentLoaded` — replace the late `addEventListener('DOMContentLoaded', boot)` with `document.readyState === 'loading' ? addEventListener(...) : boot()`). Smoke: app boots, all routes render, no console errors. | `app.js` (+`index.html`) | — | ☐ |
| 2 | Config constants | `config.js` | 1 | ☐ |
| 3 | DOM/format primitives | `dom.js` | 1 | ☐ |
| 4 | Settings + mutable state | `state.js` | 2,3 | ☐ |
| 5 | Player identity/matching (+caches) | `players/identity.js` | 3,4 | ☐ |
| 6 | Scoring leaves (tierValue, starter slots, buckets, ageRetention, primaryLeague, projPosGroup) | `scoring/value-core.js` | 2,4 | ☐ |
| 7 | Data indexes (+caches, invalidateRankIndex) | `data/indexes.js` | 4,5,6 | ☐ |
| 8 | VOR / edge / verdict / share-class | `scoring/vor.js` | 6,7 | ☐ |
| 9 | Roster strength (player-only) + value share + stance | `scoring/roster.js` | 6,7 | ☐ |
| 10 | Draft-picks domain | `picks.js` | 6,7,9 | ☐ |
| 11 | Add `computeRosterStrength` (needs picks) | `scoring/roster.js` (append) | 9,10 | ☐ |
| 12 | Trade projection / simulation / team-needs | `scoring/trade-sim.js` | 6,9,10,11 | ☐ |
| 13 | Roster grading / archetypes / value curves | `scoring/grading.js` | 6,7,9,10 | ☐ |
| 14 | Advice (buys/sells, coaching, partners, strategy) | `scoring/advice.js` | 9,12,13 | ☐ |
| 15 | Projections domain math | `projections.js` | 6,7 | ☐ |
| 16 | Shared cell renderers (+scoring-backed chips, gibbs cells) | `ui/cells.js` | 3,6,7,8,15 | ☐ |
| 17 | Layout + shell | `ui/layout.js` | 2,3,7 | ☐ |
| 18 | Leaf views: about, strategy, sos, compare, projections, sources | `views/{about,strategy,sos,compare,projections,sources}.js` | 16,17,+domain | ☐ |
| 19 | Heavy views: dashboard, leagues(+subviews), roster, trade, action | `views/{dashboard,leagues,roster,trade,action}.js` | 16,17,all scoring/picks/trade-sim | ☐ |
| 20 | Player-detail modal | `views/player-modal.js` | 15,16 | ☐ |
| 21 | Command palette | `views/command-palette.js` | 7,16,router-hooks | ☐ |
| 22 | Router | `router.js` | all views | ☐ |
| — | `boot` + `window.__app` remain in slim `app.js`, now just importing + wiring | `app.js` | all | ☐ |

Split steps 18/19 per-view (each page = its own commit) so a red smoke test isolates to one page. `viewRoster` (~690 lines) and the kinetic `viewTrade` block (~950 lines) are the two that may each warrant their own multi-part step.

## Shim strategy (adapted for a single-IIFE browser file)

The template's shim is "the original re-exports moved symbols so downstream callers resolve." **This file is unusual: it has no exports and no external importers** — every caller of `tierValue`, `rankIndex`, etc. is *another function inside the same IIFE*. So the compatibility facade is inverted:

1. **Step 1 flips `app.js` from an IIFE to an ES module** and `index.html` to `<script type="module" src="js/app.js">`. This is the enabling change; nothing else can be shimmed until `app.js` can `import`.
2. **Import-back is the shim.** When step 6 moves `tierValue` into `scoring/value-core.js`, `app.js` adds `import { tierValue } from './scoring/value-core.js';` at the top. Because ES-module imports are **live top-level bindings**, every remaining in-file call to `tierValue(...)` still resolves to the same name — the app keeps working with the code physically moved out. `app.js` shrinks each step; no `export … from` needed in `app.js` because nothing outside imports its symbols.
3. **Newly extracted modules import from already-extracted ones** (their real deps), never from `app.js`. Dependencies point downward per the layering rule; `app.js` is the only thing that imports "up" during the transition.
4. **`window.__app` stays the public facade.** After all moves, `app.js` rebuilds `window.__app = { state, rankIndex, computeRosterStrength, sleeperIdFor }` from its imports — external/console consumers (and the debug handle) are unaffected.

**Global-namespace coupling that complicates shimming (call-outs):**

- **The `type="module"` / `DOMContentLoaded` trap.** Classic scripts run synchronously in source order; `boot` is registered via `DOMContentLoaded` *before* that event fires. Module scripts are **deferred** and can execute *after* `DOMContentLoaded` has already fired → a late `addEventListener('DOMContentLoaded', boot)` never runs. Step 1 must switch to `readyState`-guarded boot (`document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot()`). This is the single highest-risk mechanical change; smoke-test the boot path immediately after step 1.
- **The 17 `data/*.js` globals stay classic scripts.** They assign `window.PLAYERS` etc. and must run *before* `app.js`. Module scripts always execute after all classic scripts in the document, so load order is preserved for free — but only as long as the data files remain classic `<script>` (do not convert them to modules in this refactor). Extracted modules keep **reading `window.PLAYERS`/`LEAGUES`/…` directly**; that is the shim that avoids threading a data layer through 200 functions now (parametrizing the globals is a later pass).
- **Shared mutable state must be a single module.** `state`, `TRADE_STATE`, `KT`, `PROJ_STATE`, `SOS_GRID_*` are mutated from many functions. They live once in `state.js` and are imported (object references, so mutation is shared). Re-declaring them per module would silently fork the state — the classic shim failure here.
- **The nine memo caches move *with their owner function* and stay module-private.** `invalidateRankIndex` must import and reset every cache it clears (`_rankIndex`, `_pickIndex`, `_mispriceIdx`, `_valueShareCache`, `_leaguePickAvgCache`). Because `let` caches aren't externally resettable across modules, either (a) keep all five invalidated caches in `data/indexes.js` with `invalidateRankIndex` (chosen), or (b) expose a `reset()` per cache module. Step 7 co-locates them so the invalidation stays correct.
- **Preserve the cycle-break as a module edge, don't collapse it.** `scoring/roster.js` exports `computePlayerStrength`/`projectedPlayerStrength` (no picks); `picks.js` imports `projectedPlayerStrength` (for `originSlot`); `computeRosterStrength` (added in step 11) imports `rosterOwnedPicks` from `picks.js`. That mutual import is fine in ES modules (bindings used only at call time, never at module top-level eval). Do not "simplify" by having `computePlayerStrength` count picks — that reintroduces the recursion the split exists to break.

## Later pass (NOT done during this refactor)

Behavior-preserving means parking every improvement:

- **Dead-code removal:** `viewRankings`, `viewAllPlayers`, `RANKINGS_FILTER`, `ALL_FILTER` — confirm each is unreferenced (`grep` shows only the definition) then remove alone with a smoke test (Phase 7 / later pass). Do not delete during the move.
- **Formatter de-dup:** collapse `fmtPct`/`fmtStat`/`fmtMoney` into the `fmt` object in `dom.js`. Behavior change risk (rounding) → own change with a test.
- **Split the giant view functions further:** `viewRoster` (~690) and the kinetic `viewTrade` region (~950) are still large after moving; break them into sub-render functions in a follow-up. Not required for the layered move.
- **Parametrize the `window.*` reads:** thread a data-access layer so domain functions take data as arguments instead of reaching for `window.PLAYERS`. Makes them unit-testable (fixes the `.test.js` duplication problem). Separate pass with tests.
- **Consolidate the 9 memo caches** into one small cache registry with a single `invalidateAll()`; removes the "invalidate knows every cache" coupling.
- **Bucket-logic dedup:** `slotToBucket`/`draftPickSlot`/`originSlot` share threading; consider one pick-slot helper.
- **Cosmetic:** fix the double `// ====` banner at 7139-7143; rename `_*` closure caches to a clearer convention.
- **Build-step option (only if it ever ships wide):** a one-line `esbuild --bundle` to cut the many-small-files HTTP cost. Explicitly out of scope now — the project forbids a build step, and native modules are fine for a personal tool.
- **Add a real render smoke test** (Playwright/Puppeteer "boots, key selectors present, each route renders without console error") as the Phase 0 characterization net, since the existing `.test.js` files can't import from the IIFE and don't cover app.js directly.
