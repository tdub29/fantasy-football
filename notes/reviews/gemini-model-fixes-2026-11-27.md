# Review: Gemini model fixes (06ad92e..3945573)

Reviewer: independent, did not build or brief these changes. Read from a detached worktree at origin/main 3945573, not the dirty checkout.

## Verdict: FAIL

One defect blocks: the closed-week assert in `build_fumbles.py` can pass on a partial week (check 4). Everything else passes. Two minor items do not block.

## Findings

| # | File:line | Defect | Fix |
|---|---|---|---|
| D1 (blocking) | projections/build_fumbles.py:322, :377 | The assert repeats the same `>= 10 games in play_by_play` rule that `detect_closed_max_week` already uses, so it cannot catch anything that rule misses. Every 2026 week has 13 to 16 games, so a week can have 13 games in nflverse after Sunday and still be waiting on SNF and MNF. It still clears 10 and passes. The real protection is `currentWeek - 1` from weekly-rankings.js (or leagues.js). When both are missing, only pbp is checked and the partial week leaks. The check is also a bare `assert`, which `python -O` removes. | Count a week as closed only when its distinct `game_id` count in pbp equals the scheduled game count for that week (nflverse `schedules`, or the `games` map in weekly-rankings.js). Raise a `RuntimeError` instead of using `assert`. |
| m1 (minor) | site/js/app.js:17071 (statsTable), :17265 | Some Stats Lab IDP sort keys were removed: `xRos`, `xLuck`, `dynRk` and the other `x*` keys. A saved sort on one of them falls back to `cols[0]`, which is now `fpWk`, but it keeps the saved `dir:'desc'`. An ECR rank column then lists the worst rank first. The same thing happens with saved RB sorts `fum_eb`, `fum_exp` and `fum_tag`. No model number is shown. | When `cols.find` misses, use `defaultSort` (or set dir from `lowerBetter`). |
| m2 (minor) | site/js/app.js:4224 | `idp-dynrk` is still in the ascending-sort list, but that column no longer exists. This is dead code. | Delete it. |

Not a defect, noted for the record: `site/data/idp-xstats.js` and `site/data/fumbles.js` still ship the model fields (`xWk`, `xRos`, `luck`, `dynRk`, `eb100`, `exp_lost`, `tag`, `note`) in public static files. The site does not render them. If "research only" is also meant to cover the hosted bundle, strip them in the builders.

## Checks

1. **No xStats number or rank displayed: PASS.** A grep of the post-change app.js finds every remaining `IDP_XSTATS` read. Each one uses only `fpWk`, `fpDyn`, `ytd`, `gp`, `opp`, `n/p/t` or `week/throughWeek`. That covers the weekly table at 4508, the player card at 13784, Stats Lab at 17229 and 17253, and pool membership at 3773. Saved-sort fallbacks are covered too: rankings `filter.proj === 'xstats'` maps to `blend` (3823), weekly IDP sorts not in `idp-fp/slp/ytd` map to `idp-fp asc` (4096), and the projections page's `PROJ_STATE.source` falls back when it is not in `sources` (16650). The xStats tooltips, the `PROJ_SRC_LABEL.xstats` entry and the annualized-xStats tips are removed. `projections.js` has no `xstats` string (checked by loading the file in a vm).
2. **ECR wiring and labels: PASS.** `fpWk` and `fpDyn` come from FantasyPros `rank_ecr` in `build_idp_xstats.py:751-768`. Headers and tooltips read "FP ECR", "FP Dyn" and "FantasyPros ... IDP ECR". Rank columns sort ascending in every entry path (3907, 4096, and `lowerBetter` in Stats Lab). Values render as `#N`. The ROS view shows the Dynasty ECR and labels it that way.
3. **Fumble model removed, observed counts factual: PASS.** EB True%, Lost/Exp, luck, tone classes, fluke/trend tags, the note and the reaction-rule tip are gone from the card. `fum_exp`, `fum_eb` and `fum_tag` are gone from Stats Lab. What remains are observed counts and rates (f, t, fl, ff/uf, rush/rec, the 1-yr and 3-yr per 100 touches), with the "avg 0.80%" annotation removed.
4. **Closed-week assert: FAIL.** See D1. The fix itself is right: it no longer falls back to a partial week when no week is complete. The shipped `fumbles.js` has `throughWeek` 11. But the new assert adds no independent guarantee.
5. **DVP TD fix: PASS, no double count.** Checked against nflverse (`stats_player_week` and `play_by_play`, REG, IDP positions, 2023-2026). Every pick-six matched to an IDP row has `def_tds>0`. None of them has `fumble_recovery_tds>0`, apart from the 2025 Rodgers row below. Every fumble-return TD matched to an IDP row has `fumble_recovery_tds>0`, and only that same row also has `def_tds>0`. Matched fumble-return TDs: 2023: 17/17, 2024: 14/14, 2025: 15/15, 2026: 6/6. Only one row has both fields positive: Isaiah Rodgers, 2025 W3. pbp shows two separate TDs that game, a pick-six and a fumble return, so adding the two fields is correct. I reran `build_idp_dvp.py --cache` from the worktree and got a byte-identical `idp-dvp.js`. The self-check passed. 105 of 694 numeric leaves changed, with a largest change of 2 rank places.
6. **Clay default revert: PASS, and it is the true pre-PR #16 state.** `projections.js` defense at 3945573 was compared with 7b29812^1, the parent of the PR #16 merge. Both have default `clay`, sources `[blend, clay, sleeper]`, and the same 498 player ids. `clay`, `sleeper` and `blend` totals are the same for all 498. The only difference is that the stat lines now carry `sack_yd`, `int_ret_yd` and `fum_ret_yd`. They are not in `stat_keys`, so they are not displayed, and pre-#16 already scored those yards. `def_td`, `safe` and `blk_kick` were added to `YUH` after #16, but Clay and Sleeper project none of them, so totals do not change. `vorForPlayer` uses `O.defense.default`, so IDP VOR matches pre-#16. Compared with 06ad92e, the defense pool drops 919 to 498: the 421 xStats-only rows with null blend are removed. That moves IDP replacement level back to where it was before #16.
7. **`node --check site/js/app.js`: PASS.**
8. **Nothing tuned to pass: PASS.** The `score_defense.py` self-check now asserts that xstats is absent from the site file. It keeps the xStats parity checks on `out` at their existing thresholds (0.60 and 0.05). It drops the Reese pool assert, which belonged to the xStats pool. Reese is still present through Clay. The `build_fumbles` threshold of 10 is the one that was already there, not a new one. No model constants changed.

## Out of scope, still open from wf_18d6be3a-86d

F2 is still open: the weekly IDP scoring change in `build_weekly_rankings.py` has had no independent review, and the "Slp yuH" column relies on it. F4, F6, F7 and F13 are research-record issues. The withdrawal makes them moot for the site.

## Re-review 2026-11-28: fixes at 2a98e80

### Verdict: PASS (FF code). Registry: 2 text fixes required before agent/gemini-model-fixes merges.

D1, m1 and m2 are fixed. I scoped this re-review to 624e256..2a98e80 for `projections/build_fumbles.py` and `site/js/app.js` (statsTable and the sort list). 96d385e (QB prospect odds restored, WR withdrawn) is a separate model change in the same range. I did not review it.

**D1 closed-week guard: fixed.**
- `closed_weeks` (build_fumbles.py:333) counts a week as closed only when its pbp game count equals the nflverse schedule count, for every week from 1 up to that week.
- `check_closed` (:345) raises `RuntimeError`, not `assert`, so `python -O` cannot strip it. It also rejects pbp rows after `through_week`.
- I checked this against the real cache with my own harness, not the maker's self-check.
  - 2026 schedule: W10 has 14 games, W11 13, W12 16. pbp has W10 14, W11 13, W12 1 (Thanksgiving).
  - `closed_weeks` returns 11, so the current partial Week 12 is excluded.
  - A simulated Sunday night of W12 (14 of 16 games in, with W11 data) returns 11. `check_closed(…, 12)` raises "W12 has 14 games in play_by_play, 16 scheduled". The old rule (10 or more games) would have accepted this week.
  - The same frame with all 16 W12 games returns 12.
  - With no weekly-rankings.js or leagues.js present, `detect_closed_max_week` still returns 11. The pbp-only path no longer leaks.
- `python projections/build_fumbles.py --offline --self-check` from a 2a98e80 worktree passes: guard self-check OK, invariants across 218 RBs and 1392 defenders, `throughWeek` 11. Apart from the `generated` timestamp, the rebuilt `fumbles.js` is identical to the committed file.
- A game rescheduled into another week is handled, because the nflverse `week` field moves with the game. Counts are compared, not game_id sets. A pbp game booked to the wrong week could therefore offset a missing one. I judge that unlikely, and the error only makes the guard exclude a week it should count, never include a partial one.

**m1 sort fallback: fixed for statsTable.** app.js:17071-17073 keeps a saved sort only if its key is still a column. Otherwise it uses the tab's `defaultSort`, key and direction. The IDP default `ppg` is a real `IDP_ADVANCED` column. A saved `xRos desc` now sorts `ppg desc`, not FP rank descending.

One correction to my first review: the RB position table does not go through statsTable. app.js:19079 sorts on `row[sort.key]`, so a saved `fum_eb`, `fum_exp` or `fum_tag` sort is all-null, rows stay in input order and no header shows as active. It shows no model number. It is minor and does not block. Fix: apply the same "key still in `allCols`" check at :19079.

**m2: fixed.** `idp-dynrk` is removed from app.js:4224.

`node --check site/js/app.js` passes at 2a98e80.

**Registry (Big Projects harness, agent/gemini-model-fixes at 1c43eaf9, `.agents/model-records/fantasy-football/MODEL-REGISTRY.md`):** status, reasons and re-promotion conditions match the code for both rows. Two lines are stale and must change before the branch merges:
- R1 :175 (fumble-fault-v1 Status, reason 5) still says the guard "asserts the last counted week was fully played (FF `bc5c2db`)". That is the guard this review failed. Change it to: closes a week only when every scheduled nflverse game is in pbp and raises RuntimeError otherwise (FF `2a98e80`), with the offline self-check passing at throughWeek 11.
- R2 :168 (yuh-idp-xstats-v1 Open findings) still says "FP ranks shown alongside `xYuH` in UI". Since 47871db, xYuH is not shown. Change it to: ECR shown in place of xYuH; Material #1 open as the re-promotion gate.
