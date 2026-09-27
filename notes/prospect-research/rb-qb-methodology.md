# RB and QB prospect models: what the public work says, and how to build ours

Research brief, 2026-09-26. Scope: how public analysts turn college RB and QB prospects into NFL fantasy
projections, and how our app (vanilla JS site plus the Python builders under `historical/`) should do it.

Conventions:

- **[L]** = computed locally for this brief from our own nflverse mirror, drafted players 2000-2022, season
  rank by total full-PPR points (4-pt pass TD, `fp_4pt_ppr`). Files: `historical/draft/draft_picks.csv`
  (upstream https://github.com/nflverse/nflverse-data/releases/tag/draft_picks), `historical/derived/season_summary.csv`
  (built from https://github.com/nflverse/nflverse-data/releases/tag/player_stats), birthdates from
  `historical/players/ff_playerids.csv` (upstream https://github.com/dynastyprocess/data). Scripts:
  `base_rates.py` and `baseline_loco.py` in the session scratchpad (one-off, not app code). Undrafted players
  are not in these numbers.
- **[U]** = unverified: taken from a search-result snippet or a paywalled page's teaser, not read in full.
- Paywalled and not readable here: Fantasy Points (402), Fantasy Life full player write-ups, most RotoViz
  bodies (read the free intros via web.archive.org), Late-Round Prospect Guide, KoalatyStats full posts.
- Football Outsiders is offline; QBASE and LCF were read from web.archive.org copies of the original URLs.

---

## 0. Three findings that should shape the build

1. **Draft capital is most of the signal, and it has to go in as a curve, not a raw pick number.** A
   draft-capital-only logistic already gets AUC 0.80 for "top-12 season in years 1-3" at both RB and QB
   [L]. Fantasy Life's best RB model reaches r = 0.73 with first-3-year PPG against 0.69 for draft capital
   alone, and 0.57 for the raw pick number
   (https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).
   College stats are the tiebreaker, not the engine. Expect small gains and prove them.
2. **RB: receiving production is the college stat that survives. QB: rushing is.** Kevin Cole found each
   college receiving yard moved the RB success score 3x as much as a rushing yard
   (https://www.pff.com/news/fantasy-the-post-combine-running-back-success-model). A peer-reviewed study of
   QBs found college rushing predicts NFL performance among drafted QBs while college passing does not,
   even after controlling for scout grades
   (https://economics.uccs.edu/sites/g/files/kjihxj2156/files/2021-11/Predicting-the-National-Football-League.pdf).
   The NFL stability data agrees: QB rush attempts per game carry year-over-year r = 0.89 against 0.32
   for yards per attempt (https://www.4for4.com/2024/preseason/most-predictable-quarterback-stats).
3. **The samples are tiny, so the model has to be small and penalized, and it has to be judged on
   probability quality, not accuracy.** 2000-2022 gives 68 RB and 38 QB "top-12 in years 1-3" events [L].
   That caps an unpenalized logistic at about 7 RB and 4 QB predictors under the 10 events-per-variable
   rule of thumb (https://pubmed.ncbi.nlm.nih.gov/8970487/). And a published "85% accuracy" RB model
   (https://www.pff.com/news/fantasy-modeling-success-for-running-back-draft-prospects) is about what you
   get by predicting "miss" for everyone, since only 14.9% of drafted RBs hit [L]. Use leave-one-draft-class-out
   log loss and Brier score against the draft-capital-only baseline.

---

## 1. What matters most, by position, in order

### Running backs

**1. Draft capital (dominant).**

- Local base rate, top-12 PPR season within NFL seasons 1-3, by pick [L]: picks 1-12 hit 65% (top-24 85%,
  n=20); 13-32 hit 42% (68%, n=31); 33-64 hit 26% (53%, n=58); 65-100 hit 22% (42%, n=60); 101-160 hit 7%
  (14%, n=122); 161+ hit 4% (6%, n=166). Across all 457: 14.9% top-12, 26.5% top-24.
- Rookie season only, 2016-2025: round 1 finished top-12 50% of the time, round 2 4.5%, Day 3 0.6%
  (https://www.footballguys.com/article/2026-draft-capital-matters-rookie-running-backs).
- First three years, 2000-2018 classes: round 1 RBs averaged 13.06 PPR PPG, round 2 8.59, Day 3 4.33
  (https://www.thefantasyfootballers.com/articles/draft-capital-its-correlation-to-early-career-fantasy-production/).
- Form matters. With draft capital expressed through Chase Stuart's value chart, correlation with first-3-year
  PPG is 0.69, against 0.57 for the raw pick
  (https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).
  Locally, raw and log pick came out about even for RBs (r = -0.62 both, best-season PPG in years 1-3,
  n=457) [L]. Stuart chart anchors: pick 1 = 34.6, 10 = 19.9, 32 = 12.5, 64 = 8.1, 100 = 5.3, 224 = 0.1
  (https://www.footballperspective.com/draft-value-chart/).
- Why it dominates: Day 1-2 RBs drafted since 2017 averaged a 46.4% opportunity share as rookies, Day 3
  RBs 22.2%
  (https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/).
  Draft capital buys opportunity, and opportunity is the RB outcome.

**2. Receiving production.**

- Kevin Cole's post-combine logistic (330 RBs, 2000-2013): "each additional receiving yard raises the
  prediction score by three times that of each additional rushing yard"
  (https://www.pff.com/news/fantasy-the-post-combine-running-back-success-model).
- Best-season receiving yards per team pass attempt (RYPTPA) correlates 0.38 with first-3-year PPG
  (https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).
- College target share of 9.2% (73rd percentile) is PlayerProfiler's line for a 10%+ NFL rookie target share
  (https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/).
- PFF: prospects under 0.15 targets per route run and 0.90 yards per route run hit a ceiling on top-12
  outcomes (https://www.pff.com/news/draft-fantasy-football-rookie-running-back-prospect-model).
- JJ Zachariason's ZAP model uses best-season reception share and program-adjusted RYPTPA
  (https://www.iheart.com/podcast/1157-nfl-fantasy-football-podc-29699073/episode/jj-zachariason-on-his-zap-model-272251766/).

**3. Age (draft age or final college age). Strong in public work, not yet shown in ours.**

- Cole's pre-combine model kept draft age as one of three significant predictors
  (https://www.pff.com/news/fantasy-modeling-success-for-running-back-draft-prospects). RotoViz keeps age in
  the post-draft Prospect Lab after draft position is added
  (https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/).
- PlayerProfiler: backs averaging 15+ PPG since 2017 had an average breakout age of 19.5
  (https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/).
- Our quick check disagrees: adding decimal age (on Sept 1 of the rookie season) to log pick did not improve
  leave-one-class-out log loss (0.3757 against 0.3727 on the same 374 RBs) [L]. Birthdate coverage is
  incomplete for late picks, so this is not the last word, but age has to earn its place in our model.

**4. Size and speed.**

- Speed Score = weight x 200 / (40 time)^4 (formula per
  https://www.playerprofiler.com/terms-glossary/ [U]). It correlates 0.23 with first-3-year PPG
  (https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).
  It correlates 0.39 with draft capital. Fantasy Life says it "correlates more strongly to future success than
  any individual data point" among combine measures
  (https://www.fantasylife.com/articles/nfl-draft/how-much-does-the-nfl-draft-combine-matter-for-fantasy-football).
- Backs averaging 15+ PPG since 2017 had an average Speed Score of 104.1 (78th percentile)
  (https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/).
- Pre-draft vs post-draft: in Cole's 2016 post-combine model the 40 was the most significant input, weight
  second (https://www.pff.com/news/fantasy-the-post-combine-running-back-success-model). Once draft
  position is added, RotoViz drops the 40 but keeps weight and three-cone
  (https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/).
  NFL teams already price speed. Weight and agility still add something.

**5. Total production and backfield share.**

- RotoViz inputs: career scrimmage yards per game and final-season backfield dominator rating
  (https://www.rotoviz.com/2026/04/the-2026-running-back-class-pre-draft-prospect-lab-scores/). Both
  "career and final-season metrics are still significant" post-draft
  (https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/).
- Adjusted yards per team attempt correlates 0.42 with first-3-year PPG, and PFF career composite grade 0.42
  (https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).
- Cole's pre-combine model: final-season rushing TD and final-season receiving yards were significant
  (https://www.pff.com/news/fantasy-modeling-success-for-running-back-draft-prospects).

**6. Elusiveness and yards after contact (PFF). Weak evidence, paywalled data.**

- The only published thresholds come from survivors: 21 RBs who ran for 700+ yards as rookies over six
  seasons averaged 3.8 college yards after contact per attempt (3.2 floor), 64.9 missed tackles forced
  (30.0 floor) and a 117.0 elusive rating (90.0 floor)
  (https://www.pff.com/news/draft-2025-nfl-draft-scouting-running-backs-using-pff). That sample has no
  failures in it, so it describes survivors but cannot say how well the metric predicts.
- PFF's own RB model uses elusiveness inputs but does not publish weights
  (https://www.pff.com/news/fantasy-football-2026-rookie-running-back-prospect-model).
- At the NFL level, efficiency metrics that try to separate a back from his blocking do not predict future
  fantasy scoring. Rush yards over expected correlates 0.000 with it, while snap share correlates +0.198
  (https://www.gwttkb.com/research/what-actually-predicts-fantasy-football.html).
- Our call: leave it out of v1. We cannot compute it from public box scores and the evidence is weak.

**7. Competition level.** Significant in RotoViz's pre-draft model, drops out once draft position is added
(https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/).
Fantasy Life normalizes inputs for strength of schedule and program quality instead
(https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).

### Quarterbacks

**1. Draft capital, with a cliff after the top 12 picks.**

- Local, top-12 QB season within NFL seasons 1-3 [L]: picks 1-12 hit 53% (n=45); 13-32 hit 14% (n=22);
  33-64 hit 18% (n=22); 65-100 hit 7% (n=30); 101-160 hit 2% (n=47); 161+ hit 4% (n=92). All 258: 14.7%
  top-12, 9.3% top-6. Log pick beats raw pick here (r = -0.69 against -0.63 with best-season PPG) [L].
- At least one QB1 season in a career: picks 1-5 about 70%, picks 6-10 about 45%, round 1 overall 55.56%,
  round 2 33.33% (https://fantasyclassroom.org/Blogs/draft-capital/qbs).
- 2015-2025: 59.5% of 37 first-round QBs posted at least one QB1 season, against 4 of 90 non-first-rounders
  (https://www.dynastynerds.com/analytics/nfl-draft-capital-fantasy-football/).
- On first-3-year PPG, only 24.53% of round-1 QBs cleared the QB1 line (2000-2018 classes)
  (https://www.thefantasyfootballers.com/articles/draft-capital-its-correlation-to-early-career-fantasy-production/).
  QBs take longer to hit than RBs, which matters for the outcome window (section 4).

**2. Rushing ability (the fantasy driver, and underpriced by scouts).**

- Craig and Winchester (EJOR 2021; FBS QBs whose final season fell in 2005-2013; performance = best Total QBR
  in the first five NFL years): a QB with passing ability 1 SD above average was about 4x as likely to be
  selected, and one with rushing ability 1 SD above average two-thirds more likely. Among selected QBs,
  "college rushing ability is significantly correlated with NFL performance, but college passing ability is
  not", and that held with ESPN scout grades in the model
  (https://economics.uccs.edu/sites/g/files/kjihxj2156/files/2021-11/Predicting-the-National-Football-League.pdf).
- QBASE v2.0 (2021) merged in the Rosen/Olbrecht "functional mobility" model and now uses college rushing
  yards per attempt as one of its three core stats
  (https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20).
- In the NFL, rushing is the stable part of QB scoring. Year over year, rush attempts per game carry r = 0.89
  and rush yards per game 0.86, against completion % at 0.48, TD rate 0.37, yards per attempt 0.32 and INT
  rate 0.26 (2018-2023) (https://www.4for4.com/2024/preseason/most-predictable-quarterback-stats).
  Season-level rushing yards come out at 0.5533 in Hribar's sample
  (https://www.sharpfootballanalysis.com/fantasy/quarterback-stats-that-matter-fantasy-football-2025/).
- "Konami Code" (Rich Hribar's 2013 coinage for rushing-QB value,
  https://www.fantasypros.com/2022/06/konami-code-quarterbacks-rankings-notes-outlook-2022-fantasy-football/),
  in numbers [L]: of the 75 top-5 QB seasons from 2011 to 2025, 35% had 400+ rushing yards and 29% had
  500+. Rushing supplied 17% of their fantasy points. The share is rising: 26% had 400+ rushing yards in
  2011-2017 against 42% in 2018-2025, with the rushing share of points going from 14% to 20%. The top 3
  scorers averaged 7.3 rushing points per game
  (https://www.sharpfootballanalysis.com/fantasy/quarterback-stats-that-matter-fantasy-football-2025/).
- Of 74 NFL QB metrics tested against the next four weeks of scoring, only rushing ones predicted it
  positively (https://www.gwttkb.com/research/what-actually-predicts-fantasy-football.html). This is
  NFL-level, but it points the same way as the college evidence.

**3. Age.**

- Top-40 picks since 2000, by age at the rookie season: 21-year-olds 9 of 18 ever posted a top-10 season,
  22-year-olds 15 of 25, 23-year-olds 7 of 27, 24-year-olds 1 of 6
  (https://fantasyindex.com/2024/04/22/factoid/older-rookies).
- Local, picks 1-100 by integer draft age, top-12 in years 1-3 [L]: 21 = 8/22, 22 = 11/32, 23 = 13/55,
  24 = 1/10. The drop comes at 23 and older. As with RBs, a continuous age term added nothing to log pick in
  our leave-one-class-out test (log loss 0.3657 against 0.3619) [L].

**4. Passing efficiency, adjusted for context.** Needed to get drafted, weak once drafted.

- RotoViz's 2017 QB success model found draft position and final-season adjusted yards per attempt (AYA) the
  top two factors (http://rotoviz.com/2017/05/the-post-draft-qb-success-model/).
- QBASE v2.0 inputs, all from the final college season: completion %, rushing yards per attempt, passing TD
  per completion. They are adjusted for teammate draft value (pass catchers and OL) and a Power 5 flag.
  Interceptions "in theory" should predict "but empirically, it isn't"
  (https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20).
- PFF college-to-pro correlations (only 16 QBs with 100+ NFL passes): passing grade 0.37, adjusted completion
  rate 0.35 against 0.26 for raw completion %
  (https://www.pff.com/news/draft-can-pff-data-predict-success-at-the-next-level).

**5. Experience (starts).** Lewin Career Forecast v2.0: "Career college games started. This is still the
most important variable", bounded 20-48. It also uses log completion rate, BMI minus 28, run-pass ratio
(max 0.5), final-season rushing yards (0-600) and the junior-to-senior passer rating change
(https://www.footballoutsiders.com/stat-analysis/2011/introducing-lewin-career-forecast-v20). The same
article shows the original rule (33+ starts, 58%+ completions, rounds 1-2) went from no busts in 1997-2005
to four flops in eight QBs in 2006-2009. QBASE v2.0 counts years started with 150+ attempts and docks
one-year wonders a year (https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20).

**6. PFF charting: big-time throws, turnover-worthy plays, scramble rate, sack rate.** PFF's QB model uses
passing grades, rushing, scramble rate, sack rate, competition and draft capital, across 123 QBs since 2017
(https://www.pff.com/news/fantasy-football-2026-rookie-quarterback-prospect-model). No public
college-to-NFL-fantasy validation of BTT or TWP rates turned up, and the data is paywalled. A sack-rate
signal does exist on the NFL side: rookies under 8.7% sack rate with over 6.5 adjusted air yards went 17
for 18 on at least one QB1 season (https://fantasyclassroom.org/Blogs/draft-capital/qbs). That makes it a
year-2 update feature, not a prospect feature.

**7. CPOE.** No public college air-yards source was found, so college CPOE is not computable here [U].
In the NFL, CPOE had a negative partial correlation (-0.113) with future fantasy points
(https://www.gwttkb.com/research/what-actually-predicts-fantasy-football.html). Skip it.

---

## 2. Metrics table

Evidence strength: **A** = survives draft capital in a published multivariate model or in our own test;
**B** = significant or correlated in published work, but not shown to add value beyond draft capital;
**C** = descriptive, from a small or survivor-only sample, or unvalidated.

| Metric | Pos | Definition | How to compute from public data | Thresholds seen | Evidence | Source |
|---|---|---|---|---|---|---|
| Draft capital | RB, QB | Overall pick, run through a value curve | `draft_picks.csv` pick, then log(pick) or Stuart value; undrafted = pick 260 plus a flag | QB: top-12 picks 53% top-12 hit against 14% at picks 13-32 [L] | A | [L]; https://www.footballperspective.com/draft-value-chart/ |
| Expected draft position (EDP) | RB, QB | Weighted mock-draft consensus pick, pre-draft only | Grinding the Mocks or NFL Mock Draft Database consensus; weight mocks by 1/(days to draft) | EDP explains ~85% of variance in log pick | A (pre-draft stand-in) | https://www.stat.cmu.edu/cmsac/conference/2020/assets/pdf/Robinson.pdf |
| Final college age | RB, QB | Age on Dec 31 of final college season | birthdate (`ff_playerids.csv`) and final college season | none published for this form | A in RotoViz, not yet in ours [L] | https://www.rotoviz.com/2023/04/draft-age-is-still-one-of-the-most-predictive-metrics-at-all-positions-the-2023-nfl-prospect-age-database/ |
| Draft age | RB, QB | Age on draft day or Sept 1 of rookie year | birthdate and draft date | QB top-40 picks: 21-22 at rookie year hit far more often than 23+ | A (Cole) / C in our test | https://www.pff.com/news/fantasy-modeling-success-for-running-back-draft-prospects; https://fantasyindex.com/2024/04/22/factoid/older-rookies |
| Weight | RB | Combine weight | `combine.csv` wt, falling back to `ff_playerids.csv` | 200+ lb common among difference-makers [U] | A (survives in RotoViz post-draft) | https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/ |
| Speed Score | RB | weight x 200 / forty^4 | `combine.csv` wt and forty | 104.1 average for 15+ PPG backs | B (r 0.23 with PPG; largely priced into the pick) | https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki |
| Three-cone | RB | Combine 3-cone time | `combine.csv` cone (often missing) | none published | A (RotoViz post-draft), thin coverage | https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/ |
| RYPTPA, best season | RB | Receiving yards / team pass attempts | Sports Reference CFB player and team season pages | none published | B (r 0.38 with PPG) | https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki |
| Receiving yards per game, final season | RB | rec yds / games | Sports Reference CFB | 1 rec yd = 3x rush yd in Cole's score | A (Cole 2016 logistic, no draft input) | https://www.pff.com/news/fantasy-the-post-combine-running-back-success-model |
| Reception share / target share | RB | Player receptions (or targets) / team | receptions from Sports Reference; targets only from college PBP [U] | 9.2% college target share | B | https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/ |
| Career scrimmage yards per game | RB | (rush + rec yds) / games, career | Sports Reference CFB | none published | A (RotoViz, both versions) | https://www.rotoviz.com/2026/04/the-2026-running-back-class-pre-draft-prospect-lab-scores/ |
| Backfield dominator (BDR) | RB | RB's share of his team's RB production (yards and TD, rushing and receiving) | player / sum of team RBs, from Sports Reference team rosters | none published | A (RotoViz, final season) | https://www.rotoviz.com/2026/04/jonah-coleman-emmett-johnson-and-the-hidden-value-of-collegiate-production-2026-backfield-dominator-ratings/ |
| College dominator / breakout age | RB | Share of team offensive yards and TD; breakout = first season at 15%+ | Sports Reference team totals | 15% breakout line; 40% "excellent" [U] | B | https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/ |
| Adjusted yards per team attempt | RB | Scrimmage yards per team play, adjusted for age and SOS [U: exact form] | Sports Reference player and team | none published | B (r 0.42) | https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki |
| Yards after contact / MTF / elusive rating | RB | PFF charting; elusive = MTF / (carries + rec) x YCO/A x 100 [U] | Not public (PFF+) | 3.8 YCO/A average, 90 elusive floor among rookie successes | C | https://www.pff.com/news/draft-2025-nfl-draft-scouting-running-backs-using-pff |
| Competition level / SOS | RB, QB | Power 5 flag, or opponent-adjusted stats | conference from Sports Reference; SR SOS | drops out of RotoViz post-draft | B | https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20 |
| College rushing (yds per game, yds per attempt) | QB | Rushing, ideally with sacks removed (NCAA counts sacks as rushes) | Sports Reference (sacks included); cfbfastR PBP 2014+ to strip sacks | LCF caps final-season rushing at 600 | A (Craig and Winchester; QBASE v2) | https://economics.uccs.edu/sites/g/files/kjihxj2156/files/2021-11/Predicting-the-National-Football-League.pdf |
| Run-pass ratio | QB | Rush att / pass att, final season | Sports Reference | capped at 0.5 in LCF | B | https://www.footballoutsiders.com/stat-analysis/2011/introducing-lewin-career-forecast-v20 |
| AYA | QB | (pass yds + 20 x TD - 45 x INT) / att | Sports Reference, final season | none published | B (top-2 factor in RotoViz 2017) | http://rotoviz.com/2017/05/the-post-draft-qb-success-model/ |
| Completion % | QB | Completions / attempts, logged, context-adjusted | Sports Reference | LCF v1 used 58%+ | B | https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20 |
| Pass TD per completion | QB | Arm-strength proxy | Sports Reference | none published | B | https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20 |
| Starts / years started | QB | Seasons with 150+ attempts; dock one-year wonders a year | Sports Reference season attempts | LCF: 20 to 48 starts | B (stopped working after 2005) | https://www.footballoutsiders.com/stat-analysis/2011/introducing-lewin-career-forecast-v20 |
| Teammate draft value | QB | Stuart value of his drafted pass catchers and OL, same draft year and the next | `draft_picks.csv` college column | none published | B | https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20 |
| BTT / TWP rate | QB | PFF-graded throw quality | Not public (PFF+) | quadrant view only | C | https://www.pff.com/news/fantasy-football-2026-rookie-quarterback-prospect-model |
| CPOE (college) | QB | Completion % over expected | Not computable: no public college air yards [U] | none | C | https://www.gwttkb.com/research/what-actually-predicts-fantasy-football.html |
| BMI | QB | BMI minus 28, small penalty either side | `combine.csv` ht, wt | none published | C | https://www.footballoutsiders.com/stat-analysis/2011/introducing-lewin-career-forecast-v20 |

---

## 3. Analyst and model summaries

**Kevin Cole, PFF 2016 (RB, two models).** Logistic regression on 330 RBs who entered 2000-2013, split
roughly 2:1 train/test. Target: a top-12 PPR season within the first three years. The pre-combine model
used draft age, final-season rushing TD and final-season receiving yards, with no draft position. It
claimed "nearly 85 percent" test accuracy, "roughly equal to using NFL draft position", and 5 of its top 10
predictions hit (https://www.pff.com/news/fantasy-modeling-success-for-running-back-draft-prospects).
The post-combine model used 40 time, weight, and final-season rushing and receiving yards per game, with
about 92% accuracy (https://www.pff.com/news/fantasy-the-post-combine-running-back-success-model).
Caveat: at a ~15% base rate [L], accuracy is the wrong yardstick. Cole's current work (consensus mocks,
analytical big boards) lives at https://www.unexpectedpoints.com/p/final-2025-consensus-nfl-draft-mock.

**RotoViz RB Prospect Lab (Blair Andrews writes it up).** "A simple linear model", backtested to 2009.
Pre-draft inputs: final college age, weight, 40, three-cone, competition level, career scrimmage yards per
game and final-season backfield dominator
(https://www.rotoviz.com/2026/04/the-2026-running-back-class-pre-draft-prospect-lab-scores/). Post-draft:
the 40 and competition drop out; age, weight, three-cone and the production metrics stay
(https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/).
Scores are scaled 0-100. RotoViz: apart from draft slot, no prospect metric is as powerful as age across all
fantasy positions (https://www.rotoviz.com/2023/04/draft-age-is-still-one-of-the-most-predictive-metrics-at-all-positions-the-2023-nfl-prospect-age-database/).
RotoViz QB work (RotoDoc 2017) used machine-learning variable selection; draft position and final-season AYA
came out as the top two factors (http://rotoviz.com/2017/05/the-post-draft-qb-success-model/). Coefficients
and accuracy are paywalled.

**Fantasy Life Rookie Super Model (Dwain McFarland).** RB, WR and TE only, with no QB model. Hit = top-6
finish within three seasons; validated on first-3-year PPG. Training runs from the 2018 class on, because
PFF college charting starts in 2014. RB inputs: draft capital (Stuart chart), adjusted YPTA (r 0.42), best
RYPTPA (r 0.38), PFF career composite grade (r 0.42) and Speed Score (r 0.23). Normalized for age, SOS, program
quality (ESPN FPI), teammates, QB quality and offensive style. RB correlation with PPG: raw pick 0.57, draft
capital 0.69, model without capital 0.69, model with capital 0.73. All three RBs rated 90+ hit
(https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki).
The companion combine study (RB classes 2017-2025, PPG over three seasons) calls draft capital "the best
predictor of future fantasy success"
(https://www.fantasylife.com/articles/nfl-draft/how-much-does-the-nfl-draft-combine-matter-for-fantasy-football).

**PFF prospect models (Jonathon Macri).** RB: 254 past prospects since 2017. Base rates 11.8% top-12, 22.8%
top-24, 30.7% top-36; 90% of top-12 finishers did it within three seasons; scores above 8.50 went 82%
top-12. Inputs: rushing grades, production, elusiveness, competition, draft capital. Weights are not
published (https://www.pff.com/news/fantasy-football-2026-rookie-running-back-prospect-model; 2025
version: https://www.pff.com/news/draft-fantasy-football-rookie-running-back-prospect-model). QB: 123
prospects since 2017, hit = top-4 within three seasons. 8.9% ever finished top-4 and 81.8% of those did it
by year 3; 15.4% ever top-12; nobody scoring under 6.50 hit top-12
(https://www.pff.com/news/fantasy-football-2026-rookie-quarterback-prospect-model).

**PlayerProfiler.** A metric library rather than a model. Definitions and thresholds: dominator, breakout
age (15% line), Speed Score, college target share, and NFL usage lines: backs on the field for 50%+ of snaps
averaged 15 PPG, and 30% route participation is the usual floor for a 10% target share. The author ranks draft capital as "far more" important
than any single college metric
(https://www.playerprofiler.com/article/playerprofilers-guide-to-advanced-stats-metrics-vol-1-running-backs-draft/).

**JJ Zachariason, ZAP model (Late-Round).** Projects first-three-year performance for RB, WR and TE.
Inputs: age, breakout score (age plus strength of schedule), program-adjusted RYPTPA, best-season reception
share, size, Speed Score, draft capital. The test database runs from 2011 through the 2022 class
(https://www.iheart.com/podcast/1157-nfl-fantasy-football-podc-29699073/episode/jj-zachariason-on-his-zap-model-272251766/).
Pre-draft he runs projected capital from NFL Mock Draft Database through Chase Stuart's chart
(https://x.com/LateRoundQB/status/2047884665365647605). Draft capital is described as the biggest input
[U]. The target may be "best two seasons across the first three" [U]. Weights are in the paid guide
(https://lateround.com/prospect-guide/).

**Fantasy Points.** The prospect guide mixes film grades with metrics. Every page returned 402 Payment
Required, so no methodology could be verified (https://www.fantasypoints.com/nfl/prospect-guide). No
Fantasy Points QB model methodology is public [U].

**Peter Howard.** He is a senior writer at Dynasty League Football
(https://dynastyleaguefootball.com/author/peterhoward/) and publishes stats work on Patreon
(https://www.patreon.com/pahoward). No public prospect-model methodology was found. Treat anything
attributed to him as unverified.

**Campus2Canton.** A neural network trained on 695 RBs (2017-2022 classes) and applied to 328 (2023-2025),
70/30 split, minimum three college seasons. Seven inputs, including high-school recruit weight, Power 5 flag,
rushing and receiving fantasy points over expectation by college year, rush attempts and receptions. Separate
heads for PPR PPG and draft position. Reported error is a sum of squared errors (0.4803), which cannot be
compared with anyone else's number (https://campus2canton.com/2023-rb-model-using-neural-networks/).

**KoalatyStats (Joseph Bryan).** A tuned elastic net. Target: average PPG over the first three seasons.
Inputs: PFF grades, RAS and college production, plus a custom six-variable college RYOE. Validation R-squared
0.608, with the author's own warning that "the validation/holdout can vary by a lot"
(https://koalatystats.substack.com/p/2026-dynasty-running-back-pre-draft). "Dynasty Domain": no public
methodology was found, and search results that credit this model to Dynasty Domain are unconfirmed [U].

**Football Outsiders QBASE v2.0 (Olbrecht, Rosen, Schatz, 2021).** Covers QBs drafted in the top 100 since
2004. Target: Total DYAR per attempt ((pass DYAR + rush DYAR) / (pass att + sacks + rush att)). Three
predictors: adjusted college performance (completion %, rush YPA, pass TD per completion, adjusted for
teammate draft value and Power 5), adjusted experience (years with 150+ attempts, one-year-wonder penalty),
and projected draft position (Scouts Inc. pre-draft, actual pick in training). Fit on the training set was
"similar" to QBASE v1, and no numbers were given
(https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20). LCF v2.0 is the older
seven-factor QB regression on DYAR in years 3-5, rounds 1-3 only
(https://www.footballoutsiders.com/stat-analysis/2011/introducing-lewin-career-forecast-v20).

**Craig and Winchester (EJOR 2021).** A two-stage model: selection first, then performance as the best Total
QBR in the first five years. College stats are showcase-season based and adjusted for opponent defense in a
robustness check. The main finding is rushing over passing among drafted QBs
(https://economics.uccs.edu/sites/g/files/kjihxj2156/files/2021-11/Predicting-the-National-Football-League.pdf).

**NFL Next Gen Stats Draft Model.** Position-specific XGBoost on combine data since 2003 and college stats
since 2005. Target: NFL starter or Pro Bowler within three seasons. "Setting monotonic constraints was also
critical for the results to be interpretable"
(https://www.nfl.com/news/next-gen-stats-draft-model-can-predict-prospects-pro-success-0ap3000001103347).

**Grinding the Mocks (Benjamin Robinson).** Expected Draft Position from weighted public mocks. The weight is
1/(days to draft) times each mocker's historical accuracy
(https://grindingthemocks.substack.com/p/how-well-can-consensus-mock-draft). The log-scale EDP explains
about 85% of the variance in log draft outcomes (2018 case study). EDP and actual pick predict AV about
equally (https://www.stat.cmu.edu/cmsac/conference/2020/assets/pdf/Robinson.pdf).

**The Huddle QB rookie model (Dan Mader).** Archetype matching across 175 QBs, reported as outcome
probabilities. Example: elite QB1 4.44%, QB1 18.57%, QB2 30.00%, bust 46.99%
(https://sports.yahoo.com/articles/ty-simpson-analytical-draft-profile-004924159.html). A good example of
reporting a distribution instead of a point score.

**TAMIDS 2026 (open code).** nflverse draft and combine data joined to Sports Reference college stats on
`pfr_id`. Logistic, random forest and gradient boosting for hit/bust on weighted AV. Adding college data
raised cross-validated accuracy for RB gradient boosting from 0.734 to 0.793 and for QB logistic from 0.561
to 0.701 (https://github.com/tylernordberg0/TAMIDS_2026). These are accuracy figures, not calibrated
probabilities.

**Age curves (for the dynasty horizon, not the prospect score).** RBs lose 25.2% of PPR PPG from age 28 to
29. QB rushing fantasy production drops 25.7% from age 26 to 27, and ages 23-25 average 2.5 rushing points
per game (https://www.espn.com/fantasy/football/story/_/id/37933720/2023-fantasy-football-players-peak-decline-quarterback-running-back-wide-receiver).
68.8% of a small QB sample had their best PPG season between 25 and 33
(https://www.thefantasyfootballers.com/articles/the-lifecycle-of-a-dynasty-quarterback-dynasty-football/).
Rushing-QB value decays sooner than passing value, so rookie contracts on rushing QBs are front-loaded value.

---

## 4. Recommendation for our build

### 4.1 Target variables

| Position | Primary (binary) | Secondary | Continuous (for value curves) | Base rate [L] |
|---|---|---|---|---|
| RB | Top-12 PPR season (season-total rank) in NFL seasons 1-3 | Top-24 in seasons 1-3 | Best-season PPG, min 6 games, seasons 1-3 | 14.9% top-12, 26.5% top-24 (n=457) |
| QB | Top-12 season in NFL seasons 1-4 | Top-6 in seasons 1-4 | Best-season PPG, min 6 games, seasons 1-4 | 18.5% top-12 in 1-4 (46/249, classes 2000-2021); 14.7% in 1-3 |

Why: the 3-year RB window matches Cole, Fantasy Life, PFF and ZAP, and PFF finds 90% of RB top-12 finishers
get there by year 3 (https://www.pff.com/news/fantasy-football-2026-rookie-running-back-prospect-model).
QBs sit early. Craig and Winchester use five years on the rookie-contract logic
(https://economics.uccs.edu/sites/g/files/kjihxj2156/files/2021-11/Predicting-the-National-Football-League.pdf),
and going to four years adds 8 events to our QB set [L]. The year-4 window drops the 2022 class, so re-check
this choice once 2026 data lands. Career value measures (QBASE's TDYAR/A, weighted AV) track real football
value, not fantasy points, so we do not use them as targets.

### 4.2 Model form

- **Penalized logistic regression per position and per threshold** (ridge or elastic net, with the penalty
  tuned by grouped CV). Fit one model per threshold and enforce P(top-12) <= P(top-24) at output. An ordinal
  logistic is the one-model alternative.
- The draft term is log(pick) plus an indicator for picks 1-12 (the QB cliff: 53% against 14% [L]).
  Undrafted players go in as pick 260 with a flag.
- Why not gradient boosting or neural nets: with 38-68 events, trees memorize. Keep a monotone-constrained
  gradient boosting model as a challenger (the NGS approach,
  https://www.nfl.com/news/next-gen-stats-draft-model-can-predict-prospects-pro-success-0ap3000001103347)
  and promote it only if it wins out-of-sample.
- Budget: about 7 RB and 4 QB effective predictors under the 10 EPV rule
  (https://pubmed.ncbi.nlm.nih.gov/8970487/). The rule is disputed
  (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5122171/), which is one more reason to penalize rather than
  count.

### 4.3 Validation scheme

1. **Leave-one-draft-class-out** (grouped by draft year) for tuning and feature selection. Never let a
   draft class sit in both train and test.
2. **Forward-chaining test** for the number we quote: train on classes up to t-1, predict class t, for t
   from 2012 to 2022. That is the real use case.
3. **Metrics:** log loss and Brier (primary), AUC (discrimination), a calibration table by predicted decile.
   Never raw accuracy.
4. **Baseline to beat (draft capital only, log pick, leave-one-class-out)** [L]:

| Target | n / events | AUC | Brier | Base-rate Brier | Log loss | Base log loss |
|---|---|---|---|---|---|---|
| RB top-12, yrs 1-3 | 457 / 68 | 0.804 | 0.1061 | 0.1267 | 0.3514 | 0.4206 |
| RB top-24, yrs 1-3 | 457 / 121 | 0.833 | 0.1391 | 0.1947 | 0.4413 | 0.5780 |
| QB top-12, yrs 1-3 | 258 / 38 | 0.804 | 0.0970 | 0.1256 | 0.3227 | 0.4180 |
| QB top-12, yrs 1-4 | 249 / 46 | 0.796 | 0.1175 | 0.1506 | 0.3796 | 0.4785 |

5. **Ship rule:** a feature or model ships only if it lowers log loss against this baseline in both the
   leave-one-class-out and the forward-chaining runs. The best public RB model gains about +0.04 in
   correlation over draft capital alone (https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki),
   so plan for small lifts and do not treat a large one as real until it survives the forward test.

### 4.4 Feature sets (v1, public data only)

**RB post-draft (7):** log pick plus the undrafted flag; weight; Speed Score (with a missing flag);
best-season RYPTPA; career scrimmage yards per game; final-season backfield dominator; decimal final college
age, kept only if it passes the ship rule. Challengers: three-cone (thin coverage), Power 5 flag,
final-season reception share.

**RB pre-draft:** swap log pick for log EDP, and add the 40 and a competition flag back in. RotoViz keeps
both before the draft and drops them after
(https://www.rotoviz.com/2026/04/how-does-the-draft-change-our-outlook-post-draft-rb-prospect-lab-scores-live-updates/).

**QB post-draft (4 core plus 2 challengers):** log pick plus the picks 1-12 indicator; best-season college
rushing yards per game (sacks stripped when PBP allows, otherwise raw with run-pass ratio as the LCF
correction); final-season AYA adjusted for Power 5 and teammate draft value; years started (150+ attempts,
QBASE one-year-wonder rule). Challengers: decimal draft age, log completion %.

**QB pre-draft:** log EDP in place of log pick.

**Pre-draft mechanics:** train on actual picks and never on EDP, then at prediction time integrate over the
pick distribution. Draw picks from log(pick) ~ Normal(log EDP, s), with s estimated from past EDP misses,
and average the predicted probabilities. This carries draft uncertainty into the probability instead of
pretending the mock is the pick.

### 4.5 Output in the app

- **Probabilities first:** RB P(top-12) and P(top-24); QB P(top-6) and P(top-12), each with an 80% band
  from a bootstrap that resamples draft classes.
- **Tiers from the probability, not from rank:** for example RB Tier 1 at P(top-12) >= 40%, Tier 2 at
  20-40%, Tier 3 at 8-20%, dart throws under that. These cut points are our proposal; set the final ones
  from the calibration table.
- **Comps:** 5 nearest neighbors on the standardized model features, each feature weighted by the absolute
  size of its coefficient so that comps match on what the model thinks matters. Show each comp's actual
  outcome (best PPG and top-12/24 hits). The Huddle's archetype probabilities
  (https://sports.yahoo.com/articles/ty-simpson-analytical-draft-profile-004924159.html) are the display
  model to copy.
- **Year-2 update:** after the rookie season, fold in NFL usage (snap share, target share, and for QBs,
  rushing attempts and sack rate). Those beat any college stat
  (https://www.gwttkb.com/research/what-actually-predicts-fantasy-football.html).

### 4.6 Data plan (no keys, no accounts)

- Already local: draft picks 1980-2026 with `cfb_player_id` (the Sports Reference CFB slug), combine
  2000-2026, birthdates and `cfbref_id` in `ff_playerids.csv`, and fantasy seasons 1999-2025. That covers 551
  drafted RBs and 328 drafted QBs since 2000 [L].
- College box scores: Sports Reference CFB player pages keyed on `cfb_player_id`, throttled under the
  20-requests-per-minute limit (https://www.sports-reference.com/bot-traffic.html). About 900 players
  means about 45 minutes, cached once.
- College play-by-play for 2014+ (sack stripping, targets): cfbfastR's `load_cfb_pbp` reads GitHub releases
  with no API key (https://cfbfastr.sportsdataverse.org/reference/load_cfb_pbp.html).
- Skip the CollegeFootballData API, which needs a key (https://collegefootballdata.com/key), and PFF college
  charting (YCO/A, MTF, BTT/TWP, grades), which is paywalled. Both are out of v1 by design.
- Undrafted backs: add them from nflverse rosters or players by entry year as pick 260 with a flag. They
  are missing from every number above.
