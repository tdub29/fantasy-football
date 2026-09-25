# xFP and FPOE: how the pros build them (source notes)

Researched 2026-09-25. Research only; nothing in the repo was changed except this file.
Every claim carries its source link. "Not public" means I looked and the source does not say.

## Top findings

1. **Fantasy Points rebuilt XFP for 2026.** It is now a per-play model. It adds game state, catchability/accuracy
   and charted separation, covers QBs, and is recombined through any scoring system. The old 2017 to 2025
   version was a historical lookup by field position plus depth (targets) or down and distance (carries), for RB/WR/TE only.
2. **ffopportunity is a chain of 8 XGBoost models** (5 pass, 3 rush) trained on nflverse 2006 to 2020. Each model
   predicts one component and feeds the next. Full PPR scoring is hard-coded, and receptions_exp is published
   so other formats can be rescored. Data goes to the `latest-data` release, updated through 2026 week 2.
3. **A site can get most of the way on nflverse alone.** Field position, depth, down and distance, game script
   and opportunity type are all in play-by-play. The FTN charting feed in nflverse (2022+) adds catchable ball,
   screen pass and box count. Only separation and coverage charting are proprietary to Fantasy Points.

---

## 1. Fantasy Points Data Suite: XFP and FPOE

**Was the definition readable?** Yes. The Data Suite 2.0 article rendered fine in local Playwright (Python 3.12, headless
Chromium). It has one XFP paragraph, not a full method. The fuller definitions come from a Ryan Heath X post (the
"explained in detail here" link in The Everything Report), the Data Suite landing page, and a Wayback copy of the
2021 XFP Report. Older FP articles now 404 or say "archived" on the live site.

### Current model (2026, "new and improved")

- **Inputs named publicly:** "field location, down-and-distance, score, and even catchable targets/throw accuracy",
  with "tons of old and new contextual data points". Source: [Data Suite 2.0 article, 2026-09-08](https://www.fantasypoints.com/articles/1/fantasy-points-data-suite-2-0-a-powerful-nfl-research-tool).
- **Per play, not per opportunity bucket:** "a model that predicts how many fantasy points an 'average' player would
  score on each specific play". The worked example uses yard line, quarter and clock, and score margin: a carry at the
  2 with the game tied in Q3 versus a 1st-and-10 at the 45 with a 24-10 lead late in Q4. Source: [Ryan Heath on X, 2026-08-31](https://x.com/RyanJ_Heath/status/2094492706047238594)
  (read through the key-free [fxtwitter API](https://api.fxtwitter.com/RyanJ_Heath/status/2094492706047238594)).
- **Target context:** "a catchable target near the end zone vs. an uncatchable target at midfield. Or of a deep pass to
  a receiver with a +2 separation score on the play vs. a checkdown." It incorporates "all of the standardized context
  our film charters record from watching every play". Source: [Heath post](https://x.com/RyanJ_Heath/status/2094492706047238594).
- **QBs included:** "It works for QBs!" ([Heath post](https://x.com/RyanJ_Heath/status/2094492706047238594)) and "fully
  functional for QBs as well" ([Data Suite 2.0 article](https://www.fantasypoints.com/articles/1/fantasy-points-data-suite-2-0-a-powerful-nfl-research-tool)).
- **Scoring format:** it is not tied to one format. "XFP from a model over the play's own context, recombined through
  whichever scoring system you pick, so FP minus XFP means something." Source: [fantasypointsdata.com](https://fantasypointsdata.com/).
  That wording implies they predict components (catches, yards, TDs) and weight them by the chosen scoring. Their
  default house format is half PPR ("Fantasy scoring is Half PPR", [Barfield, 2023, Wayback](https://web.archive.org/web/20230804165330/https://www.fantasypoints.com/nfl/articles/2023/fantasy-points-data-most-important-wr-stats)).
- **Benchmark they publish:** the chart attached to the [Heath post](https://x.com/RyanJ_Heath/status/2094492706047238594)
  shows "correlation to next week's fantasy points, 2021 to 2025, including weeks with a minimum of 5.0 XFP":

  | Pos | player-weeks | FP | XFP |
  |---|---|---|---|
  | QB | 2,126 | 0.183 | 0.188 |
  | RB | 2,845 | 0.202 | 0.206 |
  | WR | 3,649 | 0.177 | 0.186 |
  | TE | 1,325 | 0.160 | 0.175 |

  The chart says "correlation", but values this size look like r-squared. A backtest should compute both before comparing.
  The claim: "more predictive of next week's fantasy points than fantasy points are of themselves" ([Everything Report 2026 Wk 3](https://www.fantasypoints.com/nfl/articles/2026/the-everything-report-2026-fantasy-football-week-3)).
- **Algorithm, training window, feature weights:** not public.

### Legacy model (Scott Barrett, 2017 to 2025)

- Barrett "populariz[ed] the now widely-used XFP in 2017" ([data.fantasypoints.com](https://data.fantasypoints.com/)).
- **Method, a historical lookup:** "It looks at every individual carry by down and distance and distance from the end
  zone and every individual target by depth of target and distance from the end zone, and then cross-references each
  carry and target to each carry and target with those specific qualifiers over a multi-year sample."
  Source: [XFP Report Week 5, 2021 (Wayback)](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5).
  At PFF the same method used "a 10-season sample of play-by-play data" and PPR tables ([PFF, Barrett, 2019](https://www.pff.com/news/fantasy-football-z-expected-fantasy-points-week-4-2019)).
- **Positions:** "a perfectly league-average RB, WR, or TE", so no QBs ([2021 XFP Report](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5)).
- **Expected TDs (XTD)** is the same method on TDs: "RBs score from the one-yard line on 54% of their attempts ... from the
  17-yard line only 3.6% of the time" ([same](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5)).
- **Efficiency metric naming:** in 2021 the actual-minus-expected gap was called PAR ("Points Above Replacement ... the
  differential between actual- and expected fantasy points") ([same](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5)).
  It is now FPOE, which FP calls "the most predictive and all-encompassing efficiency metric for fantasy purposes" and
  ranks below volume in predictiveness ([FP newsletter](https://newsletter.fantasypoints.com/p/late-round-sleepers-roundup)).

### The specific questions

| Question | Answer | Source |
|---|---|---|
| Per opportunity or per play | Legacy: per carry/target, bucketed. 2026: per play, model-based | [2021 report](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5), [Heath](https://x.com/RyanJ_Heath/status/2094492706047238594) |
| QBs | Legacy no. 2026 yes | same two |
| Air yards | Yes, as "depth of target" in both versions | [2021 report](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5) |
| End-zone targets | Not a separate input. Captured by depth crossed with distance from the end zone. FP tracks end-zone targets as their own stat | [2021 report](https://web.archive.org/web/20250911161645/https://www.fantasypoints.com/nfl/articles/season/2021/the-xfp-report-week-5) |
| Designed vs scramble runs | Not public for XFP. FP charts "designed carry share" as a stat, and "designed targets" = "screens or all quick throws" | [newsletter](https://newsletter.fantasypoints.com/p/late-round-sleepers-roundup), [Barfield 2023](https://web.archive.org/web/20230804165330/https://www.fantasypoints.com/nfl/articles/2023/fantasy-points-data-most-important-wr-stats) |
| Scoring format | 2026: any, user-picked. House default half PPR | [landing](https://fantasypointsdata.com/), [Barfield 2023](https://web.archive.org/web/20230804165330/https://www.fantasypoints.com/nfl/articles/2023/fantasy-points-data-most-important-wr-stats) |

FP also uses "catchable target rate on all non-designed targets" as a separate diagnostic next to XFP/G ([FP newsletter](https://newsletter.fantasypoints.com/p/positive-regression-and-week-5-decisions)).

---

## 2. ffopportunity (ffverse, open source)

Repo: [github.com/ffverse/ffopportunity](https://github.com/ffverse/ffopportunity). Package docs: [ffopportunity.ffverse.com](https://ffopportunity.ffverse.com/).

- "It uses xgboost and tidymodels trained on public nflverse data from 2006-2020" ([README](https://github.com/ffverse/ffopportunity/blob/main/README.md)).
  Model releases `latest-model` and `v1.0.0-model` are dated 2022-01-10, and "latest" and "v1.0.0" "are currently identical"
  ([R/ep_load.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_load.R), [releases API](https://api.github.com/repos/ffverse/ffopportunity/releases)).
  **Backtest implication:** 2021+ is out of sample for these models. 2006 to 2020 is in sample.
- The pipeline is `ep_preprocess` to `ep_predict` to `ep_summarize` ([R/](https://github.com/ffverse/ffopportunity/tree/main/R)).
  Models are chained, so each later model gets the earlier predictions as features ([R/ep_predict.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_predict.R)).

### Exact model features

Method: I extracted the post-recipe column names from each model's hardhat blueprint in
[modelling/v1.0.0/](https://github.com/ffverse/ffopportunity/tree/main/modelling/v1.0.0). I dropped the `season` ID column
and the outcome, then checked each count against `num_features()` on the matching `.xgb` Booster. All 8 match.
Dummies come from one-hot encoding (`_X1` = factor level 1).

**Pass models** (rows: `play_type` pass or qb_spike, sacks removed; [ep_preprocess.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_preprocess.R))

| Model file | Target | XGB objective | n features |
|---|---|---|---|
| pass_completion | complete_pass | binary:logistic | 41 |
| yards_after_catch | yards_after_catch | reg:squarederror | 42 (+ pass_completion_exp) |
| pass_touchdown | pass_touchdown | binary:logistic | 44 (+ yards_after_catch_exp, yardline_exp) |
| pass_first_down | first_down | binary:logistic | 45 (+ pass_touchdown_exp) |
| passing_int | interception | binary:logistic | 46 (+ pass_first_down_exp) |

Base 41 pass features:
- Numeric (16): `air_yards` (NA set to 0), `yardline_100`, `relative_to_endzone` (= air_yards minus yardline_100),
  `relative_to_sticks` (= air_yards minus ydstogo), `ydstogo`, `score_differential`, `ep`, `xpass`, `vegas_wp`,
  `total_line`, `implied_total`, `half_seconds_remaining`, `game_seconds_remaining`, `fixed_drive`, `wind`, `temp`.
- Dummies (25): `pass_location` left/middle/right, `receiver_position` QB/RB/TE/WR, `passer_position_QB`, `qtr` 1 to 5,
  `down` 1 to 4, `era_pre2018`, `qb_hit`, `posteam_type_home`, `surface_turf`, `roof_outdoors`, `goal_to_go`,
  `shotgun`, `no_huddle`.
- `yardline_exp` = yardline_100 minus air_yards minus yards_after_catch_exp (expected spot after the catch).

**Rush models** (rows: `play_type` run or qb_kneel. nflfastR codes scrambles as runs, so scrambles are in with a flag)

| Model file | Target | XGB objective | n features |
|---|---|---|---|
| rushing_yards | rushing_yards | reg:squarederror | 48 |
| rushing_td | rush_touchdown | binary:logistic | 49 (+ rushing_yards_exp) |
| rushing_fd | first_down | binary:logistic | 50 (+ rushing_yards_exp, rushing_td_exp) |

Base 48 rush features:
- Numeric (13): `yardline_100`, `ydstogo`, `score_differential`, `ep`, `xpass`, `vegas_wp`, `implied_total`,
  `half_seconds_remaining`, `game_seconds_remaining`, `fixed_drive`, `wind`, `temp`, `two_point_attempt`.
- Dummies (35): `position` QB/RB/TE/WR, `run_gap_dir` (left/right x end/guard/tackle plus middle_guard, 7),
  `run_gap` end/guard/tackle, `run_location` left/middle/right, `qtr` 1 to 5, `down` 1 to 4, `posteam_type_home`,
  `surface_turf`, `roof_outdoors`, `era_pre2018`, `goal_to_go`, `shotgun`, `no_huddle`, **`qb_dropback`**, **`qb_scramble`**.
- Missing run location and gap are filled from the play text, then "unk". A 2-point try is set to down 4, with xpass 0.75.

**Engineered context features** built in [ep_preprocess.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_preprocess.R):
`implied_total` comes from `spread_line` and `total_line`. Roof becomes indoors/outdoors, surface grass/turf. Domes get temp 68 and wind 0.
Missing temp is set to 60 and missing wind to 8. Era is split at 2018.

### Post-model rules ([ep_predict.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_predict.R), [ep_summarize.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_summarize.R))

- Expected receiving yards = `pass_completion_exp * (air_yards + yards_after_catch_exp)`.
- If `air_yards == yardline_100` (caught right at the goal line, including every 2-pt pass), TD prob = completion prob.
- Kneels: expected rush yards -1, TD 0. Spikes: every pass expectation 0. Aborted snaps: 0.
- 2-pt tries go to `two_point_conv_exp` instead of TD columns.
- Passer and receiver share the same play's expectations; passing is credited to the passer and receiving to the target.

### Scoring used in the fantasy-points columns

Full PPR. It is hard-coded in [ep_summarize.R](https://github.com/ffverse/ffopportunity/blob/main/R/ep_summarize.R):
- Receiving: 1 per reception, 0.1 per yard, 6 per TD, 2 per 2-pt. Actual points also take -2 per fumble lost; expected points have no fumble term.
- Rushing: 0.1 per yard, 6 per TD, 2 per 2-pt. Fumbles are handled the same way.
- Passing: 0.04 per yard, 4 per TD, -2 per INT, 2 per 2-pt. Sacks are excluded entirely, including sack fumbles ("Haven't included sack fumbles yet").
- For half PPR or standard, subtract 0.5 x or 1.0 x `receptions_exp` from `rec_fantasy_points_exp`, and do the same with `receptions` on the actual side.
- FPOE equivalents are the `*_diff` columns (actual minus expected), for example `total_fantasy_points_diff`.

### Release files (tag `latest-data`)

- [Release page](https://github.com/ffverse/ffopportunity/releases/tag/latest-data): 191 assets. For each season 2006 to 2026,
  `ep_weekly_{season}`, `ep_pbp_pass_{season}` and `ep_pbp_rush_{season}` come as `.csv`, `.parquet` and `.rds`. Also
  `timestamp.txt` and `version.txt` ([releases API](https://api.github.com/repos/ffverse/ffopportunity/releases/tags/latest-data)).
  The same files are mirrored under `v1.0.0-data`.
- URL pattern: `https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_2026.csv`.
  At the time of checking, timestamp.txt read `2026-09-22 10:21:06` and `ep_weekly_2026.csv` was updated 2026-09-22.
- `ep_weekly` has 159 columns in three groups: player-game counts; `*_exp` for attempts, air yards, completions/receptions,
  yards, TDs, 2-pt, first downs, INTs and fantasy points; and `*_diff` plus `*_team` for team totals and shares
  (header read from the 2026 CSV).
- Update cron from [ep-update-data.yaml](https://github.com/ffverse/ffopportunity/blob/main/.github/workflows/ep-update-data.yaml):
  Fri 05:45, Sun 22:15, Mon 00:20, Mon 05:45 and Tue 05:45 UTC, in Jan, Feb and Sep to Dec.
- License: models and data are CC BY-SA 4.0, code is GPL v3 ([README](https://github.com/ffverse/ffopportunity/blob/main/README.md)).

---

## 3. Other public xFP work (brief)

- **Mike Clay, ESPN xFP.** Rushing yards = attempts x expected yards "based on position and rush direction". Receptions
  and receiving yards = targets x expected catch rate and yards "based on depth of throw, location and position". TDs
  come from xTD. The efficiency gap is called FORP, actual minus xFP. QB leaderboards are separate.
  [ESPN WR 2026](https://www.espn.com/fantasy/football/story/_/id/49869659/fantasy-football-2026-expected-fantasy-points-xfp-wr),
  [ESPN QB 2026](https://www.espn.com/fantasy/football/story/_/id/49869566/2026-fantasy-football-expected-fantasy-points-xfp-qb).
  The 2025 RB version also listed "in-box defenders" ([ESPN RB 2025](https://www.espn.com/fantasy/football/story/_/id/46168913/2025-fantasy-football-expected-fantasy-points-xfp-rb)).
- **Mike Leone, Establish The Run.** A per-target and per-carry expected outcome. For RBs the key inputs are "Team Scoring
  Expectation, Air Yards, Carries, Goal-Line Carries, Down and Distance, Defenders in the Box". It uses a machine
  learning model over "every carry and target a player has seen over the last six weeks" to predict PPR points per
  game, weights recent weeks more, and compares against a rolling 3-game average.
  [Buy Leone RB](https://establishtherun.com/buy-leone-rb-underperformers/), [Buy Leone WR/TE](https://establishtherun.com/buy-leone-wr-and-te-underperformers/)
  (the WR/TE list is "Team Scoring Expectation, Air Yards, Field Position"). ETR's xFP page says "Each play has an expected yardage, catch
  probability, and TD probability" ([ETR](https://establishtherun.com/expected-vs-actual-fantasy-points/)).
  He is a forward-looking predictor, not a pure same-week opportunity value.
- **Josh Hermsmeyer, air yards.** Receiver air yards are "the total number of yards thrown toward a receiver on a play in
  which he is targeted, both complete and incomplete". WOPR = 1.5 x target share + 0.7 x air-yards share (opportunity).
  RACR = receiving yards / air yards (efficiency, "regresses heavily to the mean").
  [NBC Sports, 2018-10-04](https://www.nbcsports.com/fantasy/football/news/article-numbers-why-receiver-air-yards-matter).
  nflverse ships `wopr`, `racr`, `pacr`, `target_share` and `air_yards_share` in weekly player stats
  ([nflreadr dictionary](https://github.com/nflverse/nflreadr/blob/main/data-raw/dictionary_player_stats.json)).
- **nflfastR building blocks** (all already columns in nflverse pbp):
  - `cp` / `cpoe`: completion probability from air_yards, yardline_100, ydstogo, down, air_is_zero, pass_middle, era,
    qb_hit, home, roof type and distance_to_sticks ([helper_add_cp_cpoe.R](https://github.com/nflverse/nflfastR/blob/master/R/helper_add_cp_cpoe.R)).
  - `xyac_*`: a multiclass model over YAC values -5 to 70 using the same inputs plus distance_to_goal. It outputs
    `xyac_mean_yardage`, `xyac_median_yardage`, `xyac_epa`, `xyac_success` and `xyac_fd`; Baldwin and Carl
    ([helper_add_xyac.R](https://github.com/nflverse/nflfastR/blob/master/R/helper_add_xyac.R)).
  - `xpass` / `pass_oe`: dropback probability from down, ydstogo, yardline_100, qtr, wp, vegas_wp, era, score_differential,
    home, half_seconds_remaining, both teams' timeouts and roof ([helper_add_xpass.R](https://github.com/nflverse/nflfastR/blob/master/R/helper_add_xpass.R)).
  - With these, you can build a fast receiving xFP without training anything: `cp` x (air_yards + xyac_mean_yardage) plus a TD model.
- **Others, methods mostly unpublished:**
  - [PFF Expected Points](https://www.pff.com/fantasy/expected-points): "based on how they were used and targeted".
  - [Sharp Football xFP](https://www.sharpfootballanalysis.com/fantasy/expected-fantasy-points/): "location, down, distance, air yards, etc."
  - [Fantasy Footballers](https://www.thefantasyfootballers.com/dfs/fantasy-football-expected-points-opportunity-the-2023-primer/):
    an opportunity is "a rush attempt, target, or pass attempt", QBs are included, and FPOE = actual minus expected.

---

## What a site should copy

Build it the way Fantasy Points 2026 and ffopportunity both do. Use per-play component models (catch prob, E[yards | catch],
TD prob, rush yards, rush TD, INT for QBs), then combine them with the league's own scoring weights. That makes one model
work for PPR, half PPR and superflex, and FPOE = actual minus XFP under the same scoring. The target to beat is FP's chart:
XFP should predict next-week FP better than FP does (2021 to 2025, weeks with at least 5 XFP).

Features ranked by how much they drive value. "In pbp" = nflverse play-by-play has it today.

| Rank | Feature | Why it matters | In nflverse? |
|---|---|---|---|
| 1 | Distance to end zone (`yardline_100`) | Carries TD value; the 1-yard line vs the 17 is 54% vs 3.6% TD for RBs | Yes, pbp |
| 2 | Target depth plus end-zone geometry (`air_yards`, air_yards minus yardline_100) | Sets catch prob, yards and TD on catch | Yes, pbp (derive) |
| 3 | Opportunity type and role (target, carry, dropback; receiver position; QB designed run vs `qb_scramble`; kneels and spikes zeroed) | QB support, and not paying for kneels | Yes, pbp plus rosters |
| 4 | Down and distance (`down`, `ydstogo`, `goal_to_go`, air_yards minus ydstogo) | First-down and short-yardage TD value | Yes, pbp |
| 5 | Game script and team scoring expectation (`score_differential`, `vegas_wp`, `spread_line`/`total_line` implied total, clock, `xpass`) | FP's "score" input and ETR's top input | Yes, pbp |
| 6 | Catchable / accurate target | FP's headline 2026 addition | Partial: FTN `is_catchable_ball`, 2022+ only ([dictionary](https://github.com/nflverse/nflreadr/blob/main/data-raw/dictionary_ftn_charting.csv)) |
| 7 | Target direction and screen/designed flag (`pass_location`, `is_screen_pass`) | Screens change the YAC and catch rate | pass_location yes. Screen flag FTN 2022+ only |
| 8 | Run direction and box count (`run_location`, `run_gap`, `n_defense_box`) | Clay and Leone both use box count for rush yards | Direction yes, pbp. Box count FTN 2022+ only |

Not available in nflverse at all: FP's per-route separation score and coverage/route charting. Skip them.
FTN charting is CC BY-SA 4.0 and needs attribution to "FTN Data via nflverse" ([load_ftn_charting.R](https://github.com/nflverse/nflreadr/blob/main/R/load_ftn_charting.R)).
