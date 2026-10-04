# Young lane results: later classes (college years 1-2), 2026-10-04

Preregistration: `prereg.md` (commit b312698, before any later-class row was scored). Numbers:
`results.json` (gates), `sensitivity.json` (reported checks), `ablation-no-weight.json` (leakage check),
`power.json` (counts). Nothing here is wired into the builder or the app.

## Bottom line

- **One preregistered candidate passes every gate, fragile: YL1 at RB** (stage-specific model fit on
  served-shaped sophomore rows, numbers year-2 players only). Ratio 0.93, slope 1.12 on all served rows
  (38 events, 67% season-resampling support); D1L top 30 ratio 0.90, slope 1.21 (32 events, 53%
  support); beats stars plus college year on served log loss in 94% of season resamples (0.2547 to
  0.2418). Dropping the last replay season (whose labels are 26% open) turns its D1L slope to 1.26, a
  fail. Freshmen get no number from it. It needs an independent review before anything ships.
- **Every other cell fails.** QB and TE cannot be validated at all with this history: their served
  later-class rows carry 4 to 15 events across six or seven replay seasons, under the preregistered
  15-event floor at nearly every gate, whatever the model.
- The exact replay of today's later-class code path (R1/R3, what `STAGE = {pos}` would serve) fails:
  RB runs 28-30% low (ratio 0.70-0.72, slope 0.72-0.75); WR passes G1 but fails D1L (R1) or the
  replacement test (R3, 85%).

## The replay built

`projections/lanes/young/young_replay.py` mirrors addendum 8 for classes after the next one: for each
replay season S, refit only on rows whose outcome window had closed (outcome year <= S - window, row
season <= S - 1), serve year-2 players through the production path (`predraft_profile` then
`stage_score(..., which="later")`), serve year-1 players (YL2/YL3 only) with a lane scorer using only
season-S data, and label each with his eventual hit. Served subjects come from the unfiltered exit
population, so nobody is kept for something he did later. Seasons: year-2 rows 2012 to LAST_CLASS - 4,
year-1 rows 2012 to LAST_CLASS - 5 (RB/WR 2012-2019 and 2012-2018; QB/TE 2012-2018 and 2012-2017).
Display rule D1L = each season's top 30 later-class players by own forecast, the size of the board's
later list (`top_n // 2`). The slope helper reproduces `prospect_serving_backtest.calib` on all 22
evaluable cells (asserted in `young_sensitivity.py`).

## Gates (point ratio/slope, events, season-resampling support; * = pass with support under 90%)

| Cell | G1 all | G2 year 1 | G3 year 2 | G4 D1L top 30 | G5 vs stars+year | Verdict |
|---|---|---|---|---|---|---|
| R1 QB | n/e 0.67/1.53 (7 ev) | unserved | n/e 0.67/1.53 (7 ev) | n/e 0.67/1.53 (7 ev) | 0.3261 to 0.2634, 91% | FAIL |
| R1 RB | FAIL 0.72/0.72 (38 ev, sup 5%) | unserved | FAIL 0.72/0.72 (38 ev, sup 5%) | FAIL 0.74/0.61 (34 ev, sup 6%) | 0.2547 to 0.2520, 59% | FAIL |
| R1 TE | n/e 0.88/0.62 (7 ev) | unserved | n/e 0.88/0.62 (7 ev) | n/e 0.88/0.62 (7 ev) | 0.2563 to 0.2603, 42% | FAIL |
| R1 WR | pass* 1.22/0.87 (22 ev, sup 44%) | unserved | pass* 1.22/0.87 (22 ev, sup 44%) | FAIL 1.16/0.70 (21 ev, sup 16%) | 0.1265 to 0.1203, 72% | FAIL |
| R3 QB | n/e 0.70/1.35 (7 ev) | unserved | n/e 0.70/1.35 (7 ev) | n/e 0.70/1.35 (7 ev) | 0.3261 to 0.2642, 90% | FAIL |
| R3 RB | FAIL 0.70/0.75 (38 ev, sup 2%) | unserved | FAIL 0.70/0.75 (38 ev, sup 2%) | FAIL 0.72/0.65 (34 ev, sup 4%) | 0.2547 to 0.2509, 63% | FAIL |
| R3 TE | n/e 0.97/0.39 (7 ev) | unserved | n/e 0.97/0.39 (7 ev) | n/e 0.97/0.39 (7 ev) | 0.2563 to 0.2873, 28% | FAIL |
| R3 WR | pass* 0.96/1.03 (22 ev, sup 56%) | unserved | pass* 0.96/1.03 (22 ev, sup 56%) | pass* 0.87/0.83 (21 ev, sup 38%) | 0.1265 to 0.1173, 85% | FAIL |
| YL1 QB | n/e 0.38/4.04 (4 ev) | unserved | n/e 0.38/4.04 (4 ev) | n/e 0.38/4.04 (4 ev) | 0.4500 to 0.4299, 74% | FAIL |
| **YL1 RB** | pass* 0.93/1.12 (38 ev, sup 67%) | unserved | pass* 0.93/1.12 (38 ev, sup 67%) | pass* 0.90/1.21 (32 ev, sup 53%) | 0.2547 to 0.2418, 94% | **PASS (fragile)** |
| YL1 TE | n/e 0.37/0.31 (7 ev) | unserved | n/e 0.37/0.31 (7 ev) | n/e 0.37/0.31 (7 ev) | 0.3647 to 0.4467, 16% | FAIL |
| YL1 WR | FAIL 1.10/1.38 (22 ev, sup 18%) | unserved | FAIL 1.10/1.38 (22 ev, sup 18%) | pass* 0.81/0.94 (22 ev, sup 28%) | 0.1265 to 0.1254, 56% | FAIL |
| YL2 QB | n/e 0.45/1.15 (9 ev) | n/e 0.50/1.04 (5 ev) | n/e 0.38/2.45 (4 ev) | n/e 0.45/1.15 (9 ev) | 0.3559 to 0.3319, 85% | FAIL |
| YL2 RB | pass* 0.83/1.12 (77 ev, sup 61%) | FAIL 0.80/1.56 (39 ev, sup 0%) | pass* 0.86/0.91 (38 ev, sup 68%) | FAIL 0.74/0.78 (48 ev, sup 12%) | 0.2009 to 0.1874, 96% | FAIL |
| YL2 TE | FAIL 0.94/0.07 (15 ev, sup 1%) | n/e 1.51/0.06 (8 ev) | n/e 0.29/0.20 (7 ev) | n/e 1.25/0.55 (10 ev) | 0.1711 to 0.2178, 2% | FAIL |
| YL2 WR | pass* 0.96/1.08 (50 ev, sup 66%) | pass* 0.85/0.96 (28 ev, sup 52%) | FAIL 1.10/1.46 (22 ev, sup 6%) | pass* 0.84/0.95 (32 ev, sup 42%) | 0.0937 to 0.0882, 100% | FAIL |
| YL3 RB | FAIL 0.69/1.21 (77 ev, sup 0%) | FAIL 0.70/1.45 (39 ev, sup 0%) | FAIL 0.69/1.02 (38 ev, sup 2%) | FAIL 0.58/0.83 (51 ev, sup 0%) | 0.2009 to 0.1892, 95% | FAIL |
| YL3 TE | pass* 0.91/0.80 (15 ev, sup 29%) | n/e 1.28/0.87 (8 ev) | n/e 0.49/0.72 (7 ev) | n/e 0.82/0.61 (14 ev) | 0.1596 to 0.1506, 65% | FAIL |
| YL3 WR | pass* 1.19/1.01 (50 ev, sup 55%) | pass* 1.11/0.96 (28 ev, sup 56%) | FAIL 1.30/1.15 (22 ev, sup 33%) | FAIL 0.99/0.65 (34 ev, sup 19%) | 0.0937 to 0.0893, 99% | FAIL |

n/e = under 15 events, not evaluable (does not pass). G5 rows differ across candidates because each is
scored on its own served rows (YL2/YL3 add year-1 rows; a season with fewer than 3 training events has
no fit and serves nothing, logged in `results.json` `no_fit`: QB 2012-2015, TE 2012-2013).

## Verdict per candidate

- **YL1 (stage-specific, served-shaped sophomores).** RB: PASS, fragile (above). WR: fails G1/G3 (slope
  1.38: under-confident) and G5 (56%). QB, TE: not evaluable.
- **YL2 (plus his team's first 4 games; numbers freshmen).** RB: fails year 1 (slope 1.56, support 0%)
  and D1L (ratio 0.74). WR: passes all rows, year 1 and D1L (fragile) and beats stars plus year in 100%
  of resamples (0.0937 to 0.0882), but fails year 2 (slope 1.46 on 22 events, support 6%). QB, TE fail
  or are not evaluable.
- **YL3 (pooled RB/WR/TE).** Fails at RB (ratio 0.58-0.70 everywhere: shared slopes pull RB down), WR
  (year 2 ratio 1.30, D1L slope 0.65) and TE (not evaluable). Rejected.

## YL1 RB in detail (what a reviewer should test)

- Served rows: 461 sophomore player-seasons, 461 players, 38 of whom hit; per season 41-69 rows, 3-7
  hits. Leave-one-season-out: all-rows ratio 0.88-0.97, slope 1.02-1.34; D1L ratio 0.86-0.93, slope
  1.08-1.35 (so dropping single seasons can break the D1L slope ceiling).
- Sensitivity (`sensitivity.json`): without the 2019 replay (26% of its RB sophomores dropped as
  COVID sixth years with open windows) G1 0.95/1.21 (support 50%), D1L 0.89/1.26: **fail**. Without
  the placeholder TEAM rows: unchanged (none are served at year 2).
- Weight ablation: see below.
- Ranking: AUC 0.78 against 0.72 for stars plus year, but among drafted players 0.61 against 0.64:
  the edge is telling who gets drafted at all, as with every population B model. The 2016+ replays
  alone: ratio 0.88, slope 1.54 (16 events).
- Chosen C sits at the grid floor 0.03 in 17 of 24 YL1 fits: the inner curve prefers maximum
  shrinkage on these few events, which is why served slopes run above 1 (most clearly at WR).

## Diagnosis: why B14 failed at college years 1-2

1. **Survivorship (confirmed as the level problem).** 13-18% of stage-1 snapshot rows are freshmen
   who never play another FBS season, hit rate 0-2.9% against 4.3-7.6% for returners. A model trained
   on all rows and served only to returners runs low: R1/R3 RB ratio 0.70-0.72. Training on
   served-shaped rows (YL1) restores the level (0.93). Of served RB sophomores, 12% never reach a third
   FBS season and 3% play six.
2. **Power (the binding limit).** Served later-class events over the whole replay: QB 4-9, TE 7-15,
   WR 22 (year 2) and 28 (year 1), RB 38 and 39. Year-2 hit rates: QB 7.6%, RB 8.1%, WR 3.2%, TE 9.3%.
   Each extra mature season adds about 1 QB or TE event and 2-5 RB or WR events at year 2, so QB and
   TE cannot reach the 15-event floor at year 2 for roughly another decade of seasons.
3. **Horizon.** Sophomore hits are drafted 2-3 years after the serving season (RB 21 at two years,
   11 at three), freshmen 3-4: the forecast must see through the junior-year jump that addenda 12-14
   found is where most hits separate.
4. **Recruiting dominates what is knowable.** RB sophomores: 5-stars 13 of 36 hit, 4-stars 8 of 59,
   3-stars 11 of 186, unrated 0 of 85. WR: 8 of 33, 6 of 85, 2 of 208, 1 of 117. One completed freshman
   season adds little beyond that: YL1 beats stars plus year by 0.013 log loss at RB and 0.001 at WR.
5. **Calibration slope above 1 at WR year 2** (YL1 1.38, YL2 1.46, 22 events): forecasts too
   compressed; nested C picks the 0.03 floor.
6. **Transfers are not a driver** between the freshman and sophomore FBS seasons (0-0.7% of
   returning stage-1 rows change team); players who leave FBS show up as non-returners (item 1).
7. **Stars missingness drifts** (share of freshmen with no star rating: 38% in 2012-2014, 20-27% in
   2015-2017, 32-46% in 2018-2022, 4-15% in 2024-2026), so a missing-stars flag would mean something
   different at serving time than in training; no candidate used one.
8. **Data defects found.** (a) ESPN placeholder "TEAM" rows (negative ids, one per team-season, e.g.
   -6037) are in population B (27 rows) and in B14 snapshots (164 rows) as players with hit 0; YL2/YL3
   served 24 of them as freshmen. (b) The last replay season of each year type loses 22-41% of its rows
   to open labels because COVID sixth years were common for the 2018 cohort.

## Public research checked

| Source | Finding | Reuse |
|---|---|---|
| Campus2Canton, "Anatomy of a freshman wide receiver breakout" (campus2canton.com, copyright, terms not stated) | true freshmen with >= 25% of team receiving yards since 2006 (49 players): >30% share drafted 75%, Day 1-2 60%; 25-29% drafted 37% | method only (share of team receiving yards in the freshman season), as `live_rec_share` and the stage-1 `dom`/`ryptpa` columns; no data or prose copied |
| Last Word on Sports, "What do those star ratings mean" (2021) | 247 composite: about 61% of 5-stars, 23% of 4-stars, 5.1% of 3-stars drafted | context only; consistent with item 4 above |
| PlayerProfiler / RotoViz / CBS age-adjusted production articles | breakout age, dominator, yards per team attempt as WR signals; blog claims without out-of-time validation | already the production columns here; nothing new to copy |

No peer-reviewed study validating freshman or sophomore signals against NFL outcomes out of time was
found (consistent with `public-source-registry.md`).

## Proposed shared-code changes (not applied; coordinator decides after review)

1. **Later-class model for RB (only if review confirms YL1 RB):** in `fit_stage`, a separate later model
   per STAGE position: train on `snap[(snap.stage == 1) & snap.plays_next]`, columns
   `stage_cols(pos)` minus `stage`, `age_k`, `NestedLR`; keep it apart from the NEXT_MODEL object.
   Today `fit_stage` builds ONE model per position with `kind = NEXT_MODEL.get(pos, "S1")`, and
   `score_college` passes it to `stage_score(s, done, ...)` for STAGE too; for RB that is S4n4, whose
   columns include LIVE, which `done` lacks, so `STAGE = {"RB"}` would crash with a KeyError.
2. **D1L in `score_college`:** sort the later list by `_pd` (blanks last) before `.head(top_n // 2)`
   when the position is in STAGE, as D1 does for the next class. Freshmen would then drop off the RB
   later list (they get no number); the copy must say the number is for sophomores with a qualifying
   freshman season only, calibration fragile (D1L slope 1.21 with 53% support, fails without 2019).
3. **Data:** drop placeholder rows (`name == "TEAM"` or negative ESPN ids) in `load_college` or
   `prospect_population.exits`; a data fix applied to every candidate, then re-run.

## Honest limits

- QB and TE later-class numbers cannot be validated with the history that exists (4-15 events); no
  model choice changes that. They should stay blank.
- WR: no candidate passes; the best (YL2) fails only its sophomore cell, on 22 events with a slope the
  resampling cannot pin down (support 6%). A second try would be a re-roll on the same 22 events.
- RB: YL1 passes, fragile, on 38 events, and flips to a fail without the one season with open labels.
  Its forecast ranks drafted players no better than stars do.
- Freshmen (year 1): only YL2/YL3 number them; YL2 fails at RB (slope 1.56) and passes at WR only as
  part of a candidate that fails overall.
- Served rows use the player's last roster position and last roster weight (no historical vintage).
- No untouched holdout: every number is a replay of seen seasons.

## Reproduce

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-young/prospect.sqlite"   # copy of the store
python projections/lanes/young/young_data.py          # cache frames (5 min; skip if young-frames.pkl exists)
python projections/lanes/young/young_power.py         # counts, no model
python projections/lanes/young/young_replay.py        # R1, R3, YL1-YL3 gates -> results.json (7 min)
python projections/lanes/young/young_sensitivity.py   # calib agreement, last-season and TEAM-row sensitivity
python projections/lanes/young/young_ablation.py      # replay without weight -> ablation-no-weight.json
```
