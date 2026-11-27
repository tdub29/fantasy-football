# yuH IDP scoring audit, PR #16 (ff5c82a), 2026 weeks 9 to 11

**Verdict: PASS.** All four PR #16 changes are correct against Sleeper's own matchup points.
One older mapping gap (fumble-return TDs) is still there. The PR did not cause it.

Ground truth is `players_points` from `/v1/league/1312276370583220224/matchups/{9,10,11}`
for every rostered IDP (189 player-weeks). Re-run with
`python notes/idp-scoring-audit-2026-11-26/audit_idp_scoring.py`; the full rows are in `results.json`.

## Parity

| Path | n | Exact within 0.01 | MAE | Max error |
|---|---|---|---|---|
| A `build_weekly_rankings.yuh_idp_score` on Sleeper stats | 167 | 98.2% | 0.0009 | 0.05 |
| B `build_idp_dvp.score_row`, new weights, nflverse rows | 131 | 87.0% | 0.166 | 3.9 |
| C pre-PR DVP mapping, nflverse rows | 131 | 55.7% | 0.734 | 4.0 |

- **A:** the 22 rows not scored are players with no stat line, and Sleeper gave each of them 0.
  The 3 misses are all 0.05. They come from `round(total, 1)` at
  `projections/build_weekly_rankings.py:233` (5.85 becomes 5.8, 4.45 becomes 4.5), not from scoring.
- **B:** every miss traces to the data source, not to the weights:
  - nflverse and Sleeper disagree on solo/assist tackle counts in 12 and 3 player-weeks.
  - Travis Hunter's offensive points are in Sleeper's total but are not counted by a defense-only DVP.
  - Every other term matches nflverse to Sleeper exactly on matched player-weeks.

## Did the old mapping double-count? Yes.

- yuH keeps its D/ST weights in the same `scoring_settings` as the IDP weights: sack 1, int 2, ff 1.
- The old `STAT_MAP` added those onto individual defenders, so a sack paid 4 instead of 3,
  an INT 7 instead of 5, and a forced fumble 4 instead of 3.
- Sleeper never puts D/ST keys on an individual's stat line (0 of 189).
  Scoring the IDP keys alone reproduces Sleeper exactly, apart from the Hunter offense rows.
- Dropping the mapping takes DVP parity from 55.7% to 87.0%.

## The new terms

The league-wide check compares Sleeper and nflverse for every IDP from W1 to W11.

| Term | Verdict | Evidence |
|---|---|---|
| `idp_fum_rec` to `fumble_recovery_opp` | Correct | 142 of 159 events agree. The 17 misses are nflverse=1, Sleeper=0, mostly special-teams players with no forced fumble or tackle. They are likely muffed-kick recoveries, which Sleeper does not credit (not checked play-by-play). |
| `idp_fum_ret_yd` to `fumble_recovery_yards_opp` | Correct | 31 of 31 agree |
| `def_fg_blocks` as FG + punt + PAT blocks | Correct | 14 of 14 agree. Counting FG blocks alone would miss the 6 punt and PAT blocks. |
| `abs(def_sack_yards)` | Correct but has no effect | Sack yards are already positive in nflverse for 2025 and 2026. 678 of 681 agree; the 3 misses are name collisions (two Byron Youngs). |

## Defect found (from before the PR)

`projections/build_idp_dvp.py:81` maps `idp_def_td` to `def_tds` only:

- nflverse puts fumble-return TDs in `fumble_recovery_tds`, not in `def_tds`.
- All 6 league-wide def-TD misses are rows with `fumble_recovery_tds=1` and `def_tds=0`.
  Each one under-scores the defender by 6 points in the DVP pool.
- Fix: score `idp_def_td` on `def_tds + fumble_recovery_tds`. Only IDP positions are pooled,
  so own-team recovery TDs by offensive players cannot leak in.

## Not checked

- `idp_blk_kick`, `idp_safe` and `idp_fum_ret_yd` never occurred on yuH rosters in W9 to W11,
  so they were only checked league-wide, not against matchup points.
- 2 rostered player-weeks with stats had no unique nflverse name match.
