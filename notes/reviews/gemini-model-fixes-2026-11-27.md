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

## Re-review 2026-11-28 (2): FF f85c176, harness agent/gemini-model-fixes b179e5b5

### Verdict: FAIL. All FF code checks pass. The registry branch has 2 defects.

Scope: the fixes for pipeline findings F1-F4 and L1-L5 (run at FF 17942e4, registry 85333a21). I did not review 73a9800 (WR prospect odds restored); it is a separate model change.

### FF code (f85c176): PASS

- **No double-counted TDs.** `build_idp_advanced.py:435` and `build_idp_xstats.py:421` add `fumble_recovery_tds` to `def_tds` once. Nothing downstream adds it again: score_components takes only `def_tds` (`build_idp_xstats.py:428`), and idp-advanced scores `_def_td` (:148, :467). My earlier nflverse check (2023-2026) found the two fields disjoint except Isaiah Rodgers 2025 W3, who scored two separate TDs. Jessie Bates in the committed `idp-advanced.js` shows 88.1 pts / 8.81 ppg, which matches F3's recomputation.
- **No withdrawn field in site data.** I loaded `idp-xstats.js`, `fumbles.js` and `projections.js` in a vm and grepped them.
  - `idp-xstats.js` player keys: n, p, t, opp, gp, ytd, fpWk, fpDyn (892 players).
  - `fumbles.js` RB `cur` keys: car, rec, t, f, ff, uf, fl, oob, f_rush, f_rec, rate100. The fields tag, note, eb100, exp_lost, lost_luck and the p0/M/p_lost meta are gone.
  - No xstats field appears in any of the three files.
  - `build_idp_xstats.py` raises if a non-allowlisted field reaches the site file.
- **No blank columns.**
  - Every `IDP_XSTATS` read in `app.js` (3773-3785, 4123-4130, 4508-4515, 13781-13800, 17229-17256) uses only n, p, t, opp, gp, ytd, fpWk, fpDyn, week and throughWeek, and all are present.
  - The fumble card and Stats Lab read c/p f, t, fl, ff, uf, f_rush, f_rec, rate100, snp, ff_bc, ff_rb, ff_sk, ff_st and bc_1k, and all are present in `rb.cur`, `rb.pool3`, `def.cur` and `def.pool3`.
  - `node --check` passes.
- **Defense ordering shows no model number.** `score_defense.py:129` sorts by blend descending, then id. The committed `projections.js` has 498 rows in blend order, default `clay`, and no xstats. `idp-xstats.js` is sorted by id, so neither file order leaks the model rank.
- **The defender card judgment tone is gone (L4).** The 2.0/1k tone and the 1.5/1k forcer annotation are removed (app.js:13714, :13738). The observed BC/1k rate is still shown, without tone.
- **--max-week is guarded (L1).** `check_closed` now runs whether or not `--max-week` is passed (`build_fumbles.py:401`), so an override past a partial week raises.
- **RB Stats Lab sort fallback** (my earlier note) is fixed at app.js:19077-19079.
- Minor, not blocking: `build_idp_xstats.py:716` (the historical season CSV path behind the dynasty layer) still scores `def_tds` alone. It is research-only and not displayed. It is worth folding in for parity before any v2.

### Registry (b179e5b5): FAIL

- **R3: a cited artifact is missing.** `MODEL-REGISTRY.md` (yuh-idp-xstats-v1 freeze entry) cites `yuh-idp-gate10-value.json` LF `a54ee2a0…`. That file is not in the b179e5b5 tree. It exists only at `.agents/artifacts/ff-pipeline-audit-2026-11-26/yuh-idp-gate10-value.json` on unpushed local master (commit 07ae7bfe, not an ancestor of b179e5b5). Its hash there matches the registry. Fix: port that file too.
  - All other cited files exist at b179e5b5, with LF SHA-256 equal to the registry values: `eval_fumble_fault.json` 33b4eeef, `prospective_freeze_2026_w12.json` 1ca007fd, `benchmark_2026_w1_w11.json` 9fbdeedb, `rankings_2026_w12_ros.csv` f1a47686, `rankings_2026_dynasty.csv` 9e8b2357. Both model cards and both Gate ledgers are present.
- **R4: claim register row 196 overstates the withdrawal.** It lists RB `3yr Fum%` and defender `Ball-Carrier FF / 1k` (`ff_bc_1k`) as "WITHDRAWN, not displayed". Both still render as observed rates, by design:
  - the `3yr Fum%` tile and `3yr/100t` Stats Lab column (app.js:13700-13701, 18952);
  - the `2026 BC/1k` tile with its 3yr rate (app.js:13738).
  - Fix: remove those two fields from the withdrawn list, or state that they render as observed rates with no tone or shrinkage.
- Confirmed: the card Status lines read `withdrawn-from-display` and `research-only`; row 194 is marked withdrawn; the fumble interval reads 95% bootstrap; the W12 freeze is kept as historical with the 0.38 Dynasty Top-20 drift recorded.

## Re-review 2026-11-28 (3): harness agent/gemini-model-fixes e66a5951

### Verdict: PASS

- **R3 fixed.** `.agents/artifacts/ff-pipeline-audit-2026-11-26/yuh-idp-gate10-value.json` is now on the branch. Its blob (9bfc00d2) is identical to the one at 34ddebfd. Its LF SHA-256 is `a54ee2a0a539268ab55b3320c4e8b0477c802c518b831d30d36b00297f3c96bc`, which matches the registry's yuh-idp-xstats-v1 freeze entry. Every artifact the two rows cite now exists at the branch head with a matching hash.
- **R4 fixed.** Claim register row 196 now separates what was withdrawn from what is still shown:
  - withdrawn: EB True%, Lost / Exp, the fluke/trend tag and the BC/1k tone;
  - still shown as plain observed rates with no shrinkage, tone or tag: RB 3yr Fum% and defender Strip-Sack vs Ball-Carrier FF / 1k.
  - This matches the site at FF f85c176 (app.js:13700-13701, 13738, 18952). The original row text is kept as history.
- The e66a5951 diff touches only those two items (1 file added, 1 registry line changed), so nothing else moved.

With the FF code PASS at f85c176, the Gemini model fixes pass review.
