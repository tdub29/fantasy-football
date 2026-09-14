# Refactor checkpoint — `site/js/app.js`

> Resumable state. Update after EVERY extraction/purge step. A fresh session
> reads this first and continues from "Next action" without redoing finished work.

- **Goal:** decompose `site/js/app.js` (7718 lines, one IIFE) into a layered ES-module tree under `site/js/` (`config/dom/state → data/indexes → scoring/* → picks/projections → ui/* → views/* → router → app.js`) **without changing behavior**.
- **Branch / worktree:** none yet — this pass was **documents only, no app code and no git branch created** (scope: Phases 0-2 deliverables). Phase 0's isolate + baseline-capture is still outstanding (see Blockers).
- **Baseline captured:** **no.** `refactor/baseline-tests.txt` not written yet. Existing `.test.js` files don't import app.js (it's an IIFE with no exports), so they are not a true net — a render smoke test is needed. See Blockers.
- **Current phase:** 3 (cross-reference & lock) is the next action; 0-2 documented.
- **Last green commit:** n/a (no code changed).

## Phase status

| Phase | Status |
|---|---|
| 0 Baseline & safety net | ◑ inventory done; **branch + baseline-tests NOT captured** (docs-only scope) |
| 1 Technical audit | ☑ `AUDIT.md` — 7718 lines, ~220 symbols, 15 concern groups |
| 2 Research + plan | ☑ `REFACTOR-PLAN.md` — ES-module layout chosen + 22-step sequence + shim strategy |
| 3 Cross-reference & lock plan | ☐ **next** |
| 4 Extract (loop) | ☐ |
| 5 Parity cross-check | ☐ |
| 6 Full verification | ☐ |
| 7 Purge shims + dead code | ☐ |

## Extraction steps (Phase 4) — planned, none executed

| # | Step | Status | Commit |
|---|---|---|---|
| 1 | Enabling: IIFE → module + `type="module"` + readyState boot | ☐ | |
| 2 | `config.js` | ☐ | |
| 3 | `dom.js` | ☐ | |
| 4 | `state.js` | ☐ | |
| 5 | `players/identity.js` | ☐ | |
| 6 | `scoring/value-core.js` | ☐ | |
| 7 | `data/indexes.js` (+caches, invalidate) | ☐ | |
| 8 | `scoring/vor.js` | ☐ | |
| 9 | `scoring/roster.js` (player-only) | ☐ | |
| 10 | `picks.js` | ☐ | |
| 11 | `scoring/roster.js` += `computeRosterStrength` | ☐ | |
| 12 | `scoring/trade-sim.js` | ☐ | |
| 13 | `scoring/grading.js` | ☐ | |
| 14 | `scoring/advice.js` | ☐ | |
| 15 | `projections.js` | ☐ | |
| 16 | `ui/cells.js` | ☐ | |
| 17 | `ui/layout.js` | ☐ | |
| 18 | `views/{about,strategy,sos,compare,projections,sources}.js` | ☐ | |
| 19 | `views/{dashboard,leagues,roster,trade,action}.js` | ☐ | |
| 20 | `views/player-modal.js` | ☐ | |
| 21 | `views/command-palette.js` | ☐ | |
| 22 | `router.js`; slim `app.js` entry | ☐ | |

## Purge steps (Phase 7) — planned

| Shim / dead symbol | Callers migrated | Shim removed | Commit |
|---|---|---|---|
| `import`-back bindings in `app.js` (per module) | ☐ | ☐ | migrate each caller to import from the module directly, then drop the app.js import |
| `viewRankings` (dead) | ☐ | ☐ | confirm 1 grep hit (def only), remove alone, smoke |
| `viewAllPlayers` (dead) | ☐ | ☐ | same |
| `RANKINGS_FILTER`, `ALL_FILTER` (dead) | ☐ | ☐ | die with the two dead views |

## Next action

**Phase 3 — cross-reference & lock the plan.** Walk `app.js` once more end to end and reconcile audit ↔ plan ↔ file: confirm every one of the ~220 symbols maps to exactly one extraction step and every step traces to real symbols. Specifically re-check the closures the top-level scan can miss: the `viewActionCenter` todo helpers (`TKEY`/`loadTodos`/`saveTodos`), the drag/drop `addEventListener` handlers in the trade view, and the per-league localStorage filter closures in `renderLeaguePlayers`/`renderLeagueTimeline`. Then, **before any code moves**, do the outstanding Phase 0 safety net (see Blockers).

## Blockers / notes

- **Blocker (must clear before Phase 4, not before Phase 3):** Phase 0 safety net is incomplete by design of this docs-only pass. Before moving code: (1) `git status` clean, create branch `refactor/app-js`; (2) write a **render smoke test** (Playwright/Puppeteer: app boots, each route in `ROUTES` renders into `#main` with no console error, Cmd+K opens, player modal opens) and save `refactor/baseline-tests.txt` — the existing `node` `.test.js` files do **not** exercise app.js (no exports to import) and are not a sufficient parity net.
- **Highest-risk step is #1**, not a later one: converting the IIFE to a `type="module"` script changes when `boot` runs (deferred modules vs `DOMContentLoaded`). Smoke-test boot immediately after step 1, in isolation, before extracting anything.
- **Do not touch during the move (park to later pass):** dead `viewRankings`/`viewAllPlayers`, formatter duplication (`fmtPct`/`fmtStat`/`fmtMoney` vs `fmt`), the `window.*`-global reads, the banner drift at 7139-7143. Behavior-preserving only.
- **Do not collapse the `computePlayerStrength` / `computeRosterStrength` cycle-break** (documented in the file at 558-562 and in `docs/ARCHITECTURE.md`); it is preserved as a module edge (`picks.js` ↔ `scoring/roster.js`), per the plan's shim section.
- **Line-count note:** brief said 7358; actual is 7718 (`wc -l`, file edited 2026-07-28). Audit and plan use 7718.
