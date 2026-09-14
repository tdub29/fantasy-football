# CHECKPOINT — "Do all other open tasks" run (2026-08-02)

Fired from Telegram: "Do all other open tasks". Open queue (from cursor-dashboard state, API was DOWN):

1. **[HEADLINE] FF trade calc "best asset boost"** (t-1785697281516) — the person giving up the better single asset needs a boost, like KeepTradeCut's Value Adjustment. STATUS: in progress.
2. **harness-conformance-eval grade** of the 2026-08-02 orchestration-and-loops.md edit (t-1785688931539). STATUS: todo.
3. **PRTL Now Playing + Clock** (t-1785385082176) — Now Playing is OAuth-blocked (can't complete, outward infra); Clock is a new local build. Marked "do last". STATUS: assess.
4. **baseball Supabase RLS verify** (t-1784628475334) — Blocked, needs live Supabase creds. STATUS: likely can't complete, document recipe only.

Also live (separate job ej-1785705081293, DO NOT TOUCH): expert-rankings ingestion (YouTube). Stay off rankings/transcripts to avoid collision.

## Task 1 detail — where + what
- File: `site/js/app.js`
- Core math: `KT.computeFairness(aVal,bVal,aSize,bSize)` @ ~5387 — pure min/max of raw KTC sums, NO consolidation premium.
- Documented spec: `docs/FRAMEWORKS.md` §2 Headliner Rule + `data/strategy.js` `consolidation.premium_rule_of_thumb` = "110-115% of ledger sum for a single tier-up player, extra 10-15% is the consolidation premium." → ceiling 15%.
- Plan:
  - Extract `KT.assetValue(k,lg)` from valOf (per-key value); valOf sums it; add `KT.headlinerOf` (max single asset).
  - Add pure `consolidationPremium(aSize,bSize,aHead,bHead)` → `{side, pct}`, pct = 0.15 * gap * spread, gap = 1 - loHead/hiHead, spread = min(1, extraPieces/3). Zero for 1-for-1.
  - `computeFairness` boosts the SENT value of the side that gave the bigger headliner, computes verdict on adjusted values.
  - Surface a premium note under fairness in `tradeMiddleSummary` + `refreshMiddle`.
  - Add `js/trade-consolidation.test.js` self-check (slice-eval pattern like trade-picks.test.js).
  - Verify: `node --check site/js/app.js` + run all tests.

## Done so far
- **Task 1 DONE.** consolidationPremium + assetValue/headlinerOf added; computeFairness boosts headliner-giver's sent value; premium note in trade middle UI. `node --check` clean, new `trade-consolidation.test.js` passes, end-to-end verdict verified (even 1-for-3 FAIR 94.7% +5.6%, even 1-for-6 CLOSE 88.9% +12.5%, 1-for-1 no premium). Docs synced (FRAMEWORKS §2, SESSION_LOG, CLAUDE.md). Accomplishment logged.
- Pre-existing failing tests noted (NOT my regression): trade-picks (stale draft status in leagues.js from Sleeper refresh), jacob-gibbs (concurrent expert-rankings job mid-rename of jacobGibbsCell).
- Collision note: `site/js/app.js` + `site/data/leagues.js` also being edited by the concurrent expert-rankings job (ej-1785705081293). My edits are in the trade-calc region, isolated. Risk: a full-file Write by that job could clobber; my markers verified present on disk at last check.

## Task 2 — harness-conformance-eval grade (DONE)
- Graded the 2026-08-02 orchestration edit (take-DONE-back + code-gate-single-writer). Added 2 golden cases (cases.yaml now 24), ran 2 blind executors + 2 blind graders, verify-the-verifier (trap plans → 0.0). Both rules clear/forcing, no rule-text gap; real gap was missing eval coverage, closed. Results in .agents/harness-eval/results/2026-08-02.{json,md} + latest.* + CHANGELOG.

## Task 3 — PRTL Clock build (DONE; Now Playing stays OAuth-blocked)
- Built clockRenderer.js (3 styles: digital/world/minimal, multi-tz world clock from timezones[], pure/injected now, key-free Intl, bad-zone degrade), generateClockDisplay op in index.js, client liveDataOps route in useModeState.js. clock.smoke.mjs passes (9 groups). Rendered + eyeballed real PNGs (fixed a label-drop bug). repo-reality.md updated (clock stub→real, count 16→17). Accomplishment logged.
- Now Playing = per-user Spotify OAuth infra = outward-facing, left blocked (correct). Task t-1785385082176 stays Inbox for the Now Playing half.

## Task 4 — baseball Supabase RLS (documented half DONE; live-verify stays blocked)
- Wrote docs/supabase-rls-and-sync-recipe.md: RLS security model, static verification (RLS on, anon select/insert/update on both tables only, service-key guard, player_id-keyed round-trip), full write→read→call_assignments sync recipe, + exact live-verify SQL/curl. Cross-linked from board-interaction-setup.md.
- Live-DB verify (confirm the real project has RLS applied) needs project URL + anon key → stays Blocked (correct). Task t-1784628475334 stays Blocked.

## Final status
- Done + POST'd: FF trade calc (t-1785697281516), harness-eval grade (t-1785688931539).
- Partial (reported, not marked done): PRTL Clock shipped, Now Playing OAuth-blocked (t-1785385082176 stays Inbox); baseball recipe written, live-verify blocked (t-1784628475334 stays Blocked).
