# capital-sources results (2026-10-08; review ACCEPT WITH CORRECTIONS, all 11 applied, re-review pending)

Aggregate numbers only. Board rows stay in the private scratch cache (`C:\Users\TrevorWhite\.claude\jobs\c5d39d02\tmp\capital\data`),
because no source licenses its data. Full per class and per position rows: `results.json` (from `eval_v3.csv`, rerun after the review fixes, sha256 in the JSON).

## Method

- Loader: `projections/lanes/parallel-2026-10-06/capital-sources/capital_wayback.py`, Wayback only, last capture on a UTC day
  strictly before round 1. `--selftest` ok; `--smoke` from an empty CAPITAL_SCRATCH ok (wf 32 rows, espn 25 rows, pinned sha256).
- Eval: `capital_wayback.py eval` with PROSPECT_DB on a scratch copy, sha256 `85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0`
  (identical to the master before and after the copy). Label: `nfl_draft_pick`, QB/RB/WR/TE, 2012-2026.
- Signal: WF projected-round midpoint (Top-N inside round 1), CBS and ESPN overall rank, NFLMDD consensus rank.
- Spearman is among board players matched to one drafted player, so it is drafted-only conditioning: it says how well a board
  orders the players who were drafted, not how well it separates drafted from undrafted.

## Per source (ALL positions, mean over classes)

| Source | Classes | Coverage of drafted | Spearman vs pick | Round inside projected range |
|---|---|---|---|---|
| WalterFootball | 2012-2026 (15) | 0.832 | 0.721 | 0.668 |
| CBS / NFLDraftScout | 2013-2017 (5) | 0.607 | 0.765 | 0.480 |
| ESPN Scouts Inc | 2018-2019 (2) | 0.563 | 0.805 | n/a |
| NFLMDD (coordinator load) | 2020-2026 (7) | 0.922 | 0.803 | n/a |

Rows are not comparable across sources: classes, positions and board depth differ (CBS 2013 RB only, CBS 2016 and ESPN 2018 QB
plus TE only, NFLMDD 2020 150 deep). Truncating WF to the top 25 per position raises its rho by about 0.02, so shallow boards are
flattered. Use the paired table for comparisons.

## Paired, same drafted players

| Pair | Classes | Players | Mean rho first | Mean rho second | Classes first higher |
|---|---|---|---|---|---|
| WF vs CBS | 2013-2017 | 221 | 0.772 | 0.772 | 3 of 5 |
| WF vs ESPN | 2018-2019 | 87 | 0.754 | 0.817 | 1 of 2 |
| WF vs NFLMDD | 2020-2026 | 429 | 0.699 | 0.811 | 0 of 7 |

Reading: on 2020-2026 the consensus board orders drafted players better than WF in every class (per-class WF minus NFLMDD from
-0.031 to -0.179; single classes). Granularity is a hypothesis that was tested and is mostly rejected: within position on the same
players, WF's untied position rank averages 0.656 against 0.640 for its round signal and 0.749 for NFLMDD (NFLMDD higher in 21 of
28 cells; the reviewer's test, run on the pre-fix matches). Two untested confounds remain: NFLMDD captures are 1 to 22 days
pre-draft while the freshest WF capture is 4 to 47 days out (`days_before` in results.json), and NFLMDD is a consensus board
while WF is one analyst. No class resampling was run, so no interval is claimed.
Before 2020 WF is the only deep board for every class; CBS shows no detectable difference on 2013-2017 (pooled 0.772 vs 0.772;
per-class WF minus CBS from -0.132 to +0.098, WF higher in 3 of 5).

## Coverage limits found

- CBS: 2013 RB only; 2014-2017 first 25 per position; 2016 QB full list (45), 2016 RB and WR captures are a table with no rank
  and no projected round, so no signal (0 rows).
- ESPN: page 1 per position only. 2018 QB 16 and TE 19, no pre-draft RB or WR capture; 2019 QB 13, RB 25, TE 22, WR 25. 2018
  pages lack `draftYear`; the class comes from the page title (loader fix plus selftest).
- WF vintage: even the freshest page stamp is 47 days before the draft in 2022 and 37 in 2023; `year_text` flagged rows change rho only in
  2012-2014, 2016 (0.726 to 0.805), 2025 and 2026 (`rho_signal_pick_noflag` in results.json).
- Coverage above 1 (WF 2012 TE, NFLMDD 2021 TE, NFLMDD 2026 RB) comes from board position differing from draft position. Six WF
  players appear on two position pages and count in both position rows; ALL dedupes them by pick.
- Name matching: exact normalized name first; the initial plus surname plus position fallback is refused when its pick is
  already claimed by an exact-name row on the same board or the first names cannot be one person (`fallback_dropped`: WF 3,
  NFLMDD 8). Nickname hits such as Pat Mahomes, Cam Ward, Chig Okonkwo and KC Concepcion are kept.
  Nicknames with a different first initial are not matched (Tank Dell, Bucky Irving, Woody Marks; 4 board rows).

## Not done here

- Forecaster: spec only (`forecaster-spec.md`), nothing fitted.
- ESPN beyond 2018-2019 and any live ESPN pull: rights gate for Trevor (Disney terms 2.B(x)).
- Re-review of the corrections below: next, assigned by the coordinator.

## Review corrections (review-2026-10-08.md)

| # | Fix | Old value | New value |
|---|---|---|---|
| 1 | Granularity restated as a mostly rejected hypothesis; vintage and consensus named as confounds | "Part of that gap is granularity" | rejected hypothesis, two confounds |
| 2 | Comparability note under the per-source table | none | rows not comparable, top-25 depth adds about 0.02 |
| 3 | CBS wording | "CBS ties it" | no detectable difference, per class -0.132 to +0.098 |
| 4 | CHECKPOINT 7 of 7 caveat | "NFLMDD higher in 7 of 7" | plus single classes, no interval, vintage and consensus confounded |
| 5 | forecaster-spec coverage years | WF 2012-2024, CBS 2014-2016 | WF 2012-2026, CBS 2013-2017, ESPN 2018-2019 |
| 6 | forecaster-spec population timing | "not look-ahead" only | backtests only; real time needs the declaration list |
| 7 | Fallback matcher: claimed-pick and first-name guards; eval rerun | 11 false hits incl. Darrel Williams | 11 refused (WF 3, NFLMDD 8) |
| 7 | WF pooled coverage / rho / round_hit | 0.833 / 0.722 / 0.669 | 0.832 / 0.721 / 0.668 |
| 7 | WF 2020 ALL rho | 0.764 | 0.758 |
| 7 | WF 2018 ALL rho | 0.792 | 0.788 |
| 7 | NFLMDD 2020 TE rho; 2021 WR rho | -0.107; 0.876 | -0.179; 0.896 |
| 7 | Paired WF vs NFLMDD mean rho (WF / NFLMDD) | 0.694 / 0.796 | 0.699 / 0.811 |
| 7 | Paired WF minus NFLMDD rho, 2020 / 2022 / 2023 / 2024 / 2026 (2021, 2025 unchanged) | -0.062 / -0.170 / -0.141 / -0.078 / -0.033 | -0.031 / -0.179 / -0.156 / -0.114 / -0.078 |
| 8 | DB access in capital_wayback.py and forecaster_leak_check.py | `?mode=ro` | `?immutable=1` |
| 9 | Coverage above 1 and two-page players explained | none | coverage limits bullet |
| 10 | NFLMDD `days_before` | blank | 1 to 22 |
| 11 | Selftest: key beats title, load() skips a page from another year | not covered | asserted, selftest ok |

Unchanged by the rerun: CBS and ESPN rows, NFLMDD pooled 0.922 / 0.803, WF vs CBS and WF vs ESPN pairs.

