# QB lane results, 2026-10-04

Preregistration: `prereg.md`, committed in b595581 before any candidate was scored. Numbers:
`results.json` (written by `qb_candidates.py`, extended by `qb_checks.py` and `qb_censoring.py`).
Every candidate ran through the lane copy of the addendum 8 serving replay, which reproduces the
logged S3 QB numbers to the digit (asserted at the start of every run).

## Verdict

**Q3 passes every fixed gate, and the pass is fragile.** Q1 and Q2 fail. Q3 is S3 with a nested,
training-only level correction by served shape. Its first-eligible ratio clears 0.80 by 0.017, three
gates hold in under 68% of season resamples, and all six hold together in 14%. It goes to an
independent reviewer as a fragile pass, not as a demonstrated fix.

## Candidates

Gates: ratio 0.8-1.25 and slope 0.75-1.25. Replay seasons 2012-2021: 826 served rows, 31 events,
466 players, 20 hitters. First-eligible: 220 rows, 18 events. D1 = each season's top 60 by the
candidate's own forecast. "vs stars" = served log loss against stars plus college year, share of
4,000 season resamples won (needs 90%).

| Candidate | All ratio / slope | First-eligible ratio / slope | D1 top 60 ratio / slope | Log loss vs stars | All six gates in season resamples | Verdict |
|---|---|---|---|---|---|---|
| S3 (reference) | 1.08 / 0.84 | **0.68** / 0.96 | 1.08 / 0.84 | 0.1533 to 0.1429, 90% | 6% | fail |
| Q1 live passing line | **1.31 / 0.69** | **0.77 / 0.74** | **1.40 / 0.73** | 0.1533 to 0.1448, **77%** | 4% | fail |
| Q2 discrete-time hazard | **1.29 / 0.73** | **0.79 / 0.71** | 1.25 / **0.57** | 0.1533 to 0.1492, **67%** | 3% | fail |
| **Q3 nested shape recalibration** | 1.16 / 0.87 | 0.82 / 0.96 | 1.16 / 0.88 | 0.1533 to 0.1408, 93% | 14% | **pass, fragile** |

Bold = outside its gate.

### Q3 in detail

| Gate | Value | Margin to nearer bound | Holds in season resamples (1,000) | A calibrated model of the same sharpness holds it in |
|---|---|---|---|---|
| All rows, ratio | 1.163 | 0.087 | 72% | 74% |
| All rows, slope | 0.869 | 0.119 | 67% | 79% |
| First-eligible, ratio | 0.817 | **0.017** | **55%** | 68% |
| First-eligible, slope | 0.963 | 0.213 | 67% | 65% |
| D1 top 60, ratio | 1.165 | 0.085 | 70% | 70% |
| D1 top 60, slope | 0.884 | 0.134 | 70% | 74% |
| All six together | | | **14%** | 28% |

- **Replacement test.** Log loss 0.1533 (stars plus college year) to 0.1408; Q3 wins in 93.2% of
  4,000 season resamples (90% interval of the gain -0.0017 to +0.0261) and 92.9% of 200,000. That
  clears the lane's 90% rule. It would fail addendum 15's stricter 95% of 200,000 had that rule been
  applied to QB; it was not preregistered for this lane.
- **Against S3 on the same rows.** 0.1429 to 0.1408, Q3 better in 99.3% (4,000) and 99.5% (200,000) of
  resamples; AUC 0.751 to 0.763; logit correlation 0.997. Q3 is S3 moved, not a new ranking.
- **What the correction is.** Applied in the 2016-2021 replays (2012-2015 had fewer than 10 hits on
  served-shaped training rows, so S3 served unchanged there). The first-eligible offset b was +0.12 to
  +0.43 on the logit; the common offset a stayed within -0.03 to +0.07.
- **Fragile by the preregistered rule** on two counts: the first-eligible ratio margin (0.017 < 0.03)
  and support under 68% (first-eligible ratio 55%, all-rows slope 67%, first-eligible slope 67%).
- **Leave one season out:** all six gates hold in 3 of 10. The first-eligible ratio drops to
  0.75-0.80 without 2013, 2014, 2016, 2019 or 2021; without 2018 the all-rows ratio is 1.255; without
  2020 the D1 slope is 0.72.
- **Threshold.** The 10-hit floor was fixed in the prereg. Read only for fragility: 15 gives the same
  numbers; 5 also passes (first-eligible ratio 0.89).
- **Where it still misses.** First-eligible ratio on the 2017-2021 replays is 0.66 (12 events).

### Why Q1 and Q2 failed

- **Q1** gave QBs their live passing line (attempt share, adjusted yards per team attempt, rushing per
  game from the first 4 team games). The live flag is present on 96% of training rows from players who
  played the next season and on 0.4% of the rest, so it acts as a stayer indicator and lifts every
  served row. Older rows, already over-forecast, went higher: all-rows ratio 1.31, D1 1.40. This is the
  same failure WR S4n4 had.
- **Q2** trained on every finished NFL season, not only finished 4-year windows. The 2021 replay saw
  classes through 2020 (66 player-year events against 19 hitters with closed windows). The forecasts
  got higher and flatter (D1 slope 0.57). More recent classes did not close the first-eligible gap
  (0.79).

## Diagnosis and power (step 1, `diagnosis.json`)

- **Training mixes leavers with stayers; serving never does.** Stage-2 training snapshots of players
  who did not play the next season: 87 rows, 0 hits. Of players who did: 288 rows, 23 hits. Served
  ratio by college year at the snapshot (2, 3, 4): 0.68 (first eligible), 1.17, 2.94. Q3 targets exactly this.
- **Small sample.** If S3 were calibrated, 18 or more first-eligible hits (12.2 expected) happens 5.6%
  of the time. A model calibrated by construction with S3's sharpness passes all six gates in 24% of
  simulations (Q1 32%, Q2 29%, Q3 28%). The 90% range of the first-eligible ratio under perfect
  calibration is 0.68-1.75. **With 31 events, these gates cannot tell a correct QB model from a near
  miss: a correct model fails them about three times in four.**
- **The replay itself censors the late first-eligible rows** (`replay_censoring` in results.json). A
  served QB whose outcome window is still open is dropped. That removes 12 of 29 first-eligible rows
  in 2019, 21 of 28 in 2020 and 29 of 31 in 2021, nearly all players who stayed in school. The kept
  late rows are mostly early declarers, a decision tied to hitting. Part of the "2017-2021 first-eligible
  under-forecast" is therefore a replay artifact that no model can fix. On the 2012-2019 replays alone
  the first-eligible ratio is S3 0.73, Q3 0.88, but the slopes fall (Q3 all 0.74, D1 0.69). Diagnostic
  only: the gate stays on all ten replays.
- **Zero completed starts.** Training snapshots need a completed start; the stage serving path does
  not check for one. The replay serves 110 such rows (5 events against 2.6 forecast). Without them,
  Q3's all-rows ratio is 1.28, a fail. Its pass depends on that population.

## Q3 against the coordinator's S6 (addendum 15)

Same mechanism family. Both fit the stage model on every training row, take leave-one-class-out
forecasts at the chosen C, and fit a level correction on served-shaped training rows only (college
year 2+ at k, played season k + 1). With an intercept, Q3's "first eligible" flag and S6's "college
year 3+" flag are the same two-group shift, reparameterized. Differences:

| | Q3 (QB lane) | S6n4 (addendum 15) |
|---|---|---|
| Base model | S3, completed seasons only, no live games | S4n4, plus the first 4 team games |
| Recalibration | offset logistic, slope fixed at 1 (2 parameters) | logistic on the logit, slope free (3 parameters) |
| Small-sample guard | no shift when the shaped rows hold under 10 hits | always fits |
| Positions | QB | RB and WR (QB left to this lane) |
| Registered | b595581 | 7f89694 (after b595581) |

Q3 was registered first and independently, but a reviewer should treat it as the QB instance of the
S6 idea without live games: one more member of the same family, not independent evidence. Q1 is the
evidence that adding live games at QB makes the level worse, so "S6 at QB" would start from a base
running 31% high.

## Proposed wiring (for the coordinator, only if review confirms)

`fit_stage` kind "Q3" for QB: NestedLR on every mature snapshot; leave-one-class-out forecasts at the
chosen C; offset logistic `logit(p) + a + b x [stage == 2]` on stage >= 2 and plays-next rows (no shift
under 10 hits; the 2021 replay already had 29). It equals `peb.RecalLR` with the slope fixed at 1, the flag
`stage == 2`, and no live columns. Serving stays `stage_score(which="next")`. Before wiring, resolve
the serving population: the board lists QBs with a start through the live season, while the replay
serves eventual starters, so the backtest scores a population production does not serve.

## Honest limit

The QB data hold 31 served events from 20 hitters across ten replays. A model that is calibrated by
construction clears all six gates about a quarter of the time, and the late replays drop the
first-eligible players who stayed in school. Q3 fixes the measured, mechanism-backed level error at
first eligibility using training data only, and it beats both stars plus college year and S3. Its
pass clears the floor by less than earlier near misses missed by. These gates and these events cannot
validate any QB model firmly. The prospective holdout (QB outcomes from the 2027 class onward) is the
only route to firmer evidence.

## Reproduce

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-qb/prospect.sqlite"   # a copy of projections/prospect-db/prospect.sqlite
python projections/lanes/qb/qb_candidates.py --self-check
python projections/lanes/qb/qb_candidates.py      # parity, S3, Q1-Q3 -> results.json (about 10 min)
python projections/lanes/qb/qb_checks.py          # Q3 robustness -> results.json q3_checks
python projections/lanes/qb/qb_censoring.py       # replay censoring diagnostic -> results.json
```
