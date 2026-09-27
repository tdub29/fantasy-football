# WR and TE prospect models: what the public evidence says

Research brief, 2026-09-26. Scope: how public fantasy analysts project college WR and TE prospects to
NFL fantasy outcomes, what they publish (definitions, thresholds, hit rates, coefficients, accuracy),
and what that implies for our own model in this app.

**How to read the citations.** Every numeric claim carries a URL. Tags:

- no tag: read directly from the page text (WebFetch or a local fetch).
- **[archive]**: RotoViz blocks bots, so the page was read from its public Internet Archive snapshot
  (`http://web.archive.org/web/<year>id_/<url>`). Only the free portion of each article was visible.
- **[excerpt]**: the page is paywalled or blocked; the claim comes from the search engine's indexed
  excerpt of that page, not a direct read. Treat as likely but unconfirmed.
- **[UNVERIFIED]**: looked for and could not find a public source. Listed again in section 5.

---

## 1. Synthesis

The evidence ranks the inputs in this order. **(1) Draft capital dominates.** Converted to a value
chart it correlates r = 0.66 with WR PPR points per game over the first three seasons and r = 0.71 for
TEs, better than raw pick number (0.59 and 0.62)
([Fantasy Life, Rookie Super Model](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki)).
Round 1 WRs have produced a top-24 season 48.7% of the time versus 23.4% for Round 3 since 2001
([Campus2Canton, Peter Howard data](https://campus2canton.com/importance-of-draft-round-when-evaluating-wrs/)),
and 10 of 11 first-round TEs since 2015 have produced a TE1 season versus 22.2% of third-rounders
([Dynasty Nerds](https://www.dynastynerds.com/analytics/nfl-draft-capital-fantasy-football/)).
**(2) Age-adjusted receiving production, measured as a share of the team's passing game with yardage
weighted over touchdowns, is the second signal and the one that beats the draft.** Age- and
class-weighted career receiving yards per team pass attempt correlates r = 0.46 (WR) and r = 0.58 (TE)
with early-career PPG (same Fantasy Life source); WRs who broke out (20% dominator) at 18 hit a top-24
PPR season 38.5% of the time versus 8.9% for age-21 breakouts
([SI, citing Peter Howard](https://www.si.com/nfl/broncos/draft/analytics-reveal-why-denver-broncos-fans-should-beware-alabama-wr-henry-ruggs));
inside Round 1, age-18 breakouts hit 73%, which "beats first round draft capital alone by nearly 14%"
([DLF](https://dynastyleaguefootball.com/2018/04/17/wide-receiver-breakout-age-by-draft-round/));
and early-declare WRs from Rounds 1 to 3 posted a WR2-or-better season 43.8% of the time versus 18.6%
for non-early-declares
([Sharp Football, Rich Hribar](https://www.sharpfootballanalysis.com/fantasy/dynasty-fantasy-football-should-you-avoid-non-early-declare-wide-receivers/)).
Its marginal gain over capital in correlation terms is small (WR 0.66 to 0.68 once production and film
are added), so its value is sorting players within a draft tier and flagging busts, not replacing the
draft. **(3) Charted efficiency adds a little more:** career targeted QB rating (r = 0.40), career
contested-target rate (r = 0.40), and best-season YPRR (sixth in feature importance in PFF's 2022
ensemble, behind draft slot and market-share terms)
([Fantasy Life, CCTR](https://www.fantasylife.com/articles/nfl-draft/a-new-data-point-for-evaluating-nfl-draft-wr-prospects),
[PFF, Kevin Cole](https://www.pff.com/news/fantasy-football-post-combine-2022-rookie-wide-receiver-model)).
**(4) Scouting grades** carry real signal (NFL.com grade r = 0.56 for WRs) but overlap heavily with
draft capital (Fantasy Life). **(5) Athleticism is last for WRs** (RAS r = 0.014 with fantasy finish in
one study, and the Rookie Super Model drops speed score for WRs entirely)
([BrainyBallers](https://brainyballers.com/nfl-wide-receivers-does-ras-matter-a-comprehensive-analysis/)),
**but matters more for TEs** (speed score r = 0.46; 40, 3-cone and burst are the top features after
draft slot in one TE model) ([thirdc.cc, Chris Collins](https://thirdc.cc/p/another-te-model)). TEs also
develop slower: 73.1% of TE breakouts happen in NFL years 1 to 3 and 89.6% by year 5
([Fantasy Footballers](https://www.thefantasyfootballers.com/analysis/anticipating-the-breakout-tight-end-trends-breakout-candidates-fantasy-football/)),
and college breakout age and draft age predict TE outcomes weakly (r = 0.098 and r = -0.081)
([BrainyBallers TE breakout age](https://brainyballers.com/tight-ends-can-breakout-age-help-predict-nfl-success/),
[BrainyBallers TE draft age](https://brainyballers.com/does-it-matter-the-tight-end-draft-age-benchmark-that-predicts-elite-success/)).
Once a WR has an NFL season, rookie-year YPRR takes over and knowing draft position "adds very little
predictive power" ([Footballguys, Adam Harstad](https://www.footballguys.com/article/2023-dynasty-in-theory-85-rookie-receiver-model)).

---

## 2. Metrics table

Evidence strength: **Strong** = quantified by 3+ independent analysts with consistent direction.
**Moderate** = one or two quantified studies. **Weak/mixed** = small or conflicting effects.
**Unvalidated** = widely used, no public validation found.

| Metric | Definition | How to compute (box score vs play data) | Thresholds published | Evidence | Sources |
|---|---|---|---|---|---|
| Draft capital (value) | Pick converted to a trade-value chart (Chase Stuart's), not the raw pick number | nflverse `draft_picks` (pick, round). Box score not needed | Value chart r 0.66 WR / 0.71 TE vs raw pick 0.59 / 0.62. R1/R2/R3 WR top-24 rate 48.7% / 34.0% / 23.4% since 2001. "Within a round, draft slot is just noise" | Strong | [Fantasy Life RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki), [Campus2Canton](https://campus2canton.com/importance-of-draft-round-when-evaluating-wrs/), [Dynasty Nerds](https://www.dynastynerds.com/analytics/nfl-draft-capital-fantasy-football/) |
| Expected draft position (pre-draft) | Consensus of mocks weighted by recency and each mocker's past accuracy | Scrape a public consensus (NFL Mock Draft Database, Grinding the Mocks). Not box score | GTM: about 20 of 32 R1 picks came from the top-5 weighted-mocked players, about 15 from the top 3 | Moderate (for pick prediction) | [Grinding the Mocks](https://grindingthemocks.substack.com/p/how-well-can-consensus-mock-draft), [RSM uses NFL Mock Draft Database](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki) |
| Breakout age | Age at the start of the college season when the player first posts a dominator at or above the threshold | Box score: season rec yds and TD for player and team, plus birthdate | WR 20%, TE 15% (PlayerProfiler). Original RotoViz version used 30%. "Any breakout under 20 years old is considered early and elite" | Strong (WR), Weak (TE) | [PlayerProfiler glossary](https://www.playerprofiler.com/terms-glossary/), [Elite Drafters](https://elitedrafters.substack.com/p/predictive-rookie-receiver-metrics), [RotoViz, Siegele 2014](https://www.rotoviz.com/2014/01/keenan-allen-cordarrelle-patterson-and-why-breakout-age-is-the-skeleton-key/) [archive] |
| Breakout age hit rates (WR, 20%) | Top-24 PPR season, drafted WRs | as above | Age 18: 38.5%, 19: 31.3%, 20: 20%, 21: 8.9%, 22: 16.3%, 23: 14.3%. Never broke out: 10 of 131 (7.6%) since 2003 | Strong | [SI, Howard 2018 data](https://www.si.com/nfl/broncos/draft/analytics-reveal-why-denver-broncos-fans-should-beware-alabama-wr-henry-ruggs), [QB List, citing Jesse Reeves](https://football.pitcherlist.com/dynasty-lens-analyzing-rookie-wide-receivers-part-i/) |
| Adjusted breakout age | Breakout age shifted for context | Box score plus teammate draft data and conference | -0.5 if a Round 1 to 3 teammate, +0.5 non-Power 4, +1.0 non-FBS. Day 1 to 2 WRs since 2020 with adjusted age 21+ "predominantly poor" | Moderate | [Yahoo, Joel Smyth](https://sports.yahoo.com/fantasy/article/using-adjusted-breakout-age-to-help-you-evaluate-wide-receivers-in-the-2026-nfl-draft-for-fantasy-football-150623093.html) |
| College dominator rating | Mean of share of team receiving yards and share of team receiving TDs | Box score | 35%+ potential WR1, 20 to 35% mid-level, under 20% red flag. 78% of 32 rookie-year WR breakouts since 2011 had a peak dominator above 30% | Strong | [PlayerProfiler](https://www.playerprofiler.com/terms-glossary/), [Apex](https://apexfantasyleagues.com/what-does-a-rookie-wide-receiver-breakout-look-like/) |
| Weighted dominator (WDom) | 80% yards share plus 20% TD share (Anthony Amico) | Box score | "Over average" versions compare to the mean of college players who later had a top-24 NFL season | Moderate | [Campus2Canton glossary](https://campus2canton.com/glossary/) |
| Market share of receiving yards (career, final, best season) | Player rec yds / team rec yds | Box score | Kevin Cole tree splits near 29 to 30% career share and 42 to 43% final-season share. 30%+ career share with one 40%+ season flagged as impact profile | Strong | [PlayerProfiler on Cole's tree](https://www.playerprofiler.com/article/wide-receiver-prospect-regression-tree-nfl-draft-advanced-stats-metrics-profiles/), [CBS 2020](https://www.cbssports.com/fantasy/football/news/fantasy-football-what-is-age-adjusted-production-and-how-much-does-the-nfl-combine-matter-for-wide-receivers) |
| TD share / TDs per game | Rec TD share, or rec TD per game | Box score | TD share is "easier to trick" (Jon Moore). Yet a TD-per-game floor (Max Mulitz) flagged Reagor, Q. Johnston, Shenault, Bowden. Threshold value [UNVERIFIED] | Moderate | [RotoViz Phenom 2015](https://www.rotoviz.com/2015/04/the-2015-phenom-index-for-wrs/) [archive], [RotoViz, Andrews 2025](https://www.rotoviz.com/2025/05/how-much-do-yards-per-route-run-matter-for-wide-receiver-prospects-checking-all-the-boxes-part-1/) [archive] |
| College target share | Player targets / team targets | Needs targets (charted or play-by-play). Not in basic box scores | "You want your WR above the 25% mark" (P5, Round 1 to 3 WRs since 2021) | Weak/mixed | [Yahoo, Smyth](https://sports.yahoo.com/fantasy/article/nfl-draft-2026-why-fantasy-football-players-need-to-keep-college-target-share-in-mind-when-evaluating-wr-prospects-180520341.html) |
| RYPTPA / YPTPA | Receiving yards per team pass attempt | Box score (player rec yds, team pass att) | Age/class-weighted career RYPTPA r 0.46 WR, 0.58 TE. 72% of rookie-year WR breakouts cleared 2.5 in their best season. TE benchmark 1.50 | Strong | [Fantasy Life RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki), [Apex](https://apexfantasyleagues.com/what-does-a-rookie-wide-receiver-breakout-look-like/), [PlayerProfiler TE](https://www.playerprofiler.com/article/2026-rookie-tight-end-rankings-top-six-prospects/) |
| TDs per team pass attempt | Rec TD / team pass att | Box score | Component of RotoViz's Adjusted Production Index. No public threshold | Moderate | [RotoViz, Travis May](https://www.rotoviz.com/2021/07/predicting-future-nfl-success-for-wide-receivers-the-adjusted-production-index/) [archive] |
| Phenom Index | z(final-season yards share) minus z(final-season age) | Box score plus birthdate | Above 0 = above average. 2014 top-12 WRs: min 0.67, median 2.07, mean 2.24, max 4.2 | Moderate | [RotoViz, Jon Moore 2015](https://www.rotoviz.com/2015/04/the-2015-phenom-index-for-wrs/) [archive] |
| Draft age / early declare | Age at draft; left with eligibility remaining | Birthdate plus college seasons played | Early declares, all rounds: WR1 season 19.4% vs 2.4%. Round 1: WR2+ 64% vs 11% (2010 to 2019 classes). Draft age was significant in 17 of 18 of Moore's early-career models | Strong | [Sharp, Hribar](https://www.sharpfootballanalysis.com/fantasy/dynasty-fantasy-football-should-you-avoid-non-early-declare-wide-receivers/), [RotoViz Phenom 2015](https://www.rotoviz.com/2015/04/the-2015-phenom-index-for-wrs/) [archive] |
| Receptions per game (final season) | Rec / games | Box score | Enters Cole's 2016 logistic model with a negative sign (efficiency over volume). Tree split near 4.8 | Moderate | [PFF, Cole 2016](https://www.pff.com/news/fantasy-modeling-success-for-wide-receiver-draft-prospects), [PlayerProfiler](https://www.playerprofiler.com/article/wide-receiver-prospect-regression-tree-nfl-draft-advanced-stats-metrics-profiles/) |
| Yards per reception (best season) | Rec yds / rec | Box score | Cole tree split 14.57 to 16.4. PlayerProfiler found best-season YPR its most predictive college stat for breakouts | Weak/mixed | [PlayerProfiler tree](https://www.playerprofiler.com/article/wide-receiver-prospect-regression-tree-nfl-draft-advanced-stats-metrics-profiles/), [PlayerProfiler 2022](https://www.playerprofiler.com/article/2022-breakout-finder-guide/) |
| YPRR (college) | Rec yds / routes run | Needs route charting (PFF, SIS, Fantasy Points). Not box score | "3 or higher is considered elite" (unvalidated). Blair Andrews treats it as a threshold, not continuous; his percentile cutoffs are paywalled. One range-restricted study found r = 0.021 | Weak/mixed | [Elite Drafters](https://elitedrafters.substack.com/p/predictive-rookie-receiver-metrics), [RotoViz, Andrews](https://www.rotoviz.com/2025/05/how-much-do-yards-per-route-run-matter-for-wide-receiver-prospects-checking-all-the-boxes-part-1/) [archive], [BrainyBallers](https://brainyballers.com/wide-receiver-college-yards-per-route-run-does-it-matter-a-comprehensive-analysis/) |
| Personnel-adjusted YPRR | Actual YPRR minus expected YPRR given routes by personnel grouping | Needs route and personnel charting | At or below 50th percentile since 2019: 3.8% became top-12, 6.4% top-24 | Moderate | [PFF, Jonathon Macri](https://www.pff.com/news/fantasy-football-a-personnel-adjusted-analysis-of-the-2026-wide-receiver-class) |
| TPRR, uTPRR, 1D/RR | Targets, uncontested targets, first downs per route | Needs route charting | No public college validation found | Unvalidated | [Jakob Sanderson](https://jakobsanderson.substack.com/p/2026-wide-receiver-class-pre-draft) |
| Targeted QB rating (career) | Passer rating on throws to the player | Needs target-level charting | r 0.40 WR, 0.32 TE | Moderate | [Fantasy Life RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki) |
| Career contested-target rate (CCTR) | Share of targets that were contested (PFF college data since 2017) | Needs charting | r 0.40 (19th of 124 variables). 70th percentile+ in Rounds 1 to 3: R1 2/2, R2 1/4, R3 2/4 top-24 vs 53% / 24% / 16% base | Moderate (small n) | [Fantasy Life CCTR](https://www.fantasylife.com/articles/nfl-draft/a-new-data-point-for-evaluating-nfl-draft-wr-prospects) |
| First-read target share | Share of targets on the QB's first read | NFL charting only (Fantasy Points Data). Not public for college | NFL: 0.78 year-over-year, 0.79 with next-season FPG | Strong for NFL, none for college | [Fantasy Points, Ryan Heath](https://newsletter.fantasypoints.com/p/finding-stud-wrs-first-read-target-share) |
| Speed score | (weight x 200) / (40 time^4) | nflverse `combine` | "Vast majority of high-end fantasy receivers" have 100+. TE speed score r 0.46; WR speed score excluded from RSM | Weak (WR), Moderate (TE) | [PlayerProfiler glossary](https://www.playerprofiler.com/terms-glossary/), [PlayerProfiler](https://www.playerprofiler.com/article/wide-receiver-upside-speed-score-advanced-stat-metrics-analytics-profile/), [Fantasy Life RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki) |
| Height-adjusted speed score (HaSS) | Speed score x (height / 73.0) for WR, x (height / 76.4) for TE (Siegele) | nflverse `combine` | No public hit-rate table found | Unvalidated | [PlayerProfiler glossary](https://www.playerprofiler.com/terms-glossary/) |
| Freak Score (RotoViz) | Size (height, weight) plus speed composite aimed at red-zone wins | Combine | Above 70 = 90th percentile of all-time NFL WRs | Unvalidated publicly | [RotoViz, Andrews 2026](https://www.rotoviz.com/2026/03/the-upcoming-rookie-class-is-breaking-the-models-part-3-the-2026-wide-receiver-freak-score-leaderboard/) [archive] |
| RAS | 0 to 10 composite of position-relative percentiles for height, weight, hands, arms, 40, shuttle, vertical, broad, 3-cone, bench (Kent Lee Platte) | Combine | WR RAS vs fantasy finish r = 0.014. 8.5 to 10 held 48.8% of top-10 finishers vs 43.3% of bottom-10 | Weak (WR) | [PFN](https://www.profootballnetwork.com/what-is-ras-explaining-athletic-testing-metric/), [BrainyBallers](https://brainyballers.com/nfl-wide-receivers-does-ras-matter-a-comprehensive-analysis/) |
| Burst / agility | Vertical + broad; shuttle + 3-cone | Combine | Top TE features after draft slot: 40, 3-cone, burst | Moderate (TE) | [PlayerProfiler glossary](https://www.playerprofiler.com/terms-glossary/), [thirdc.cc](https://thirdc.cc/p/another-te-model) |
| Weight / BMI / height (WR) | BMI = lb / in^2 x 703 | Combine | 210+ lb and BMI 27+ were the old markers; WRs are getting lighter (22 WRs at 195 lb or less went in Rounds 1 to 2 in 2010 to 2019, 29 in the next six years). 98 WRs, Rounds 1 to 3, 2010 to 2019: "No significant difference" by height, weight or BMI | Weak | [Apex, Asher Molk](https://apexfantasyleagues.com/is-it-time-to-adjust-wide-receiver-weight-thresholds/), [Campus2Canton, Tim Alb](https://campus2canton.com/does-it-matter-if-my-favorite-rookie-wide-receiver-is-small/) |
| TE weight ceiling | TEs over 265 lb | Combine | "Only two fantasy-relevant exceptions (a 4.5% hit rate)" since 2000 [excerpt] | Moderate, partly unverified | [Fantasy Points TE combine](https://www.fantasypoints.com/nfl/articles/2026/nfl-combine-winners-and-losers-tight-ends) [excerpt] |
| Film / scouting grade | NFL.com (Lance Zierlein) prospect grade | Public scouting page, not box score | r 0.56 WR, 0.58 TE, but overlaps draft capital | Moderate | [Fantasy Life RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki) |
| Context adjustments | Strength of schedule, teammate competition, QB quality, team pass rate, program strength | SRS / ESPN FPI plus rosters and draft picks of teammates | RSM applies "gradual scale deductions rather than hard thresholds". Cole raised career shares for WRs with drafted teammates | Moderate | [Fantasy Life RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki), [PFF, Cole 2022](https://www.pff.com/news/fantasy-football-post-combine-2022-rookie-wide-receiver-model) |
| NFL rookie-year YPRR (post year 1) | YPRR with a TD bonus, min 250 routes, scaled by route usage | NFL route data (nflverse participation ends 2025; our site shows estimates) | After this score, draft position "adds very little predictive power" | Strong for year-2 updates | [Footballguys, Harstad](https://www.footballguys.com/article/2023-dynasty-in-theory-85-rookie-receiver-model) |

---

## 3. Per-analyst model summaries

### Outcomes and reported accuracy at a glance

| Model | Predicts | Reported accuracy | Source |
|---|---|---|---|
| Rookie Super Model (Dwain McFarland) | PPR PPG, first 3 NFL seasons (min 2 eligible) | r 0.68 WR, 0.76 TE (with capital); 0.64 / 0.70 without. WRs rated 85+ since 2018: 80% top-24 by year 3 | [RSM 2026](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki), [RSM 2025 WR](https://www.fantasylife.com/articles/fantasy/2025-rookie-wr-rankings-using-dwain-mcfarlands-super-model) |
| ZAP (JJ Zachariason) | Best two of first three NFL seasons | No public numbers [UNVERIFIED] | [Dynasty Compass](https://www.dynastycompass.com/episodes/episode-44-dynasty-breakouts-jj-zachariason) |
| Ryan Heath (Fantasy Points) | Average PPR points of best 2 of first 3 seasons | Not public [UNVERIFIED] | [Fantasy Points](https://www.fantasypoints.com/nfl/articles/season/2026/ryan-heaths-rookie-wr-rankings) [excerpt] |
| RotoViz WR Prospect Lab | Early-career fantasy output (linear model) | Not public [UNVERIFIED] | [RotoViz 2026](https://www.rotoviz.com/2026/04/the-surprising-stars-of-the-2026-wide-receiver-class-pre-draft-wr-prospect-lab-scores/) [archive] |
| Kevin Cole 2016 (PFF) | One top-24 PPR season in first 3 years (binary) | 80.9% correct on a 136-player test set; "slightly less successful at predicting success than draft position (38.5 percent versus 42.3 percent)" | [PFF 2016](https://www.pff.com/news/fantasy-modeling-success-for-wide-receiver-draft-prospects) |
| Kevin Cole 2022 (PFF) | Percentile of projected top-12 weeks, first 2 seasons | Not reported | [PFF 2022](https://www.pff.com/news/fantasy-football-post-combine-2022-rookie-wide-receiver-model) |
| PFF 2026 WR / TE (Jonathon Macri) | Top-12 / 24 / 36 PPR finishes | TE: 3 of 98 prospects scoring 7.20 or lower reached top-12 | [PFF WR](https://www.pff.com/news/fantasy-football-2026-rookie-wide-receiver-prospect-model), [PFF TE](https://www.pff.com/news/fantasy-football-2026-rookie-tight-end-prospect-model) |
| Chris Collins TE (NGBoost) | 3-year PPR total | R^2 0.31 on the 2022 class, "year-over-year inconsistency" | [thirdc.cc](https://thirdc.cc/p/another-te-model) |
| Harstad rookie receiver (Footballguys) | Career fantasy tier after NFL year 1 | Draft position adds little once scored | [Footballguys](https://www.footballguys.com/article/2023-dynasty-in-theory-85-rookie-receiver-model) |

Base rates to calibrate against: of 255 WR prospects in PFF's pool since 2019, 25 (9.8%) reached a
top-12 PPR season and 33 (14.5% as reported) a top-24 season; 16 of the 25 top-12 hits did it within
three seasons
([PFF](https://www.pff.com/news/fantasy-football-2026-rookie-wide-receiver-prospect-model)). For TEs
drafted since 2018: 6.1% reached top-4, 9.9% top-8, 13.7% top-12
([PFF TE](https://www.pff.com/news/fantasy-football-2026-rookie-tight-end-prospect-model)).

### PlayerProfiler (definitions)

- Dominator: share of team receiving production. Breakout age: age at the start of the season of the
  first 20%+ (WR) or 15%+ (TE) dominator. Speed score, HaSS (73.0 in WR, 76.4 in TE denominators),
  burst, agility, catch radius, BMI, hog rate all defined in the
  [glossary](https://www.playerprofiler.com/terms-glossary/).
- 2026 TE model benchmarks (John Laub): dominator 15%, RYPTPA 1.50
  ([PlayerProfiler](https://www.playerprofiler.com/article/2026-rookie-tight-end-rankings-top-six-prospects/)).
- Accuracy: not published for these thresholds.

### Shawn Siegele (RotoViz)

- Coined breakout age in January 2014 using a 0.30 dominator threshold on a 136-player sample. 67% of
  first-round WRs were hits; 92% of hits had more than one strong college season; 50% of first-round
  misses were one-year wonders; second-round hits broke out before age 20 while 69% of second-round
  misses were one-year wonders
  ([RotoViz 2014](https://www.rotoviz.com/2014/01/keenan-allen-cordarrelle-patterson-and-why-breakout-age-is-the-skeleton-key/) [archive]).
- Height-adjusted speed score originated on his blog ([PlayerProfiler glossary](https://www.playerprofiler.com/terms-glossary/)).
- Box Score Scout sim scores weight career and final-season market share of yards and TDs, weight,
  speed and draft position; yards over TDs; "players who declare early outperform seniors, both on a
  raw basis and adjusted for draft position"
  ([RotoViz BSS 2019](https://www.rotoviz.com/2019/04/box-score-scout-advanced-stats-wide-receivers/) [archive]).
- Failure mode he names: a fourth college season against younger players inflates numbers and
  perception (Deebo Samuel example, same source).

### Jon Moore (RotoViz): Phenom Index and the breakout-age replication

- Phenom Index 2015: z-score of final-season market share of yards minus z-score of final-season
  age. He replaced dominator with yards share because TD share is "easier to trick", and replaced his
  original ratio with the z-score difference so others could replicate it. Age was significant in 17
  of 18 models projecting receptions, yards and TDs over NFL years 1 to 3. "Other than this number and
  where a player gets drafted, not much else matters", with weight, vertical and special teams
  occasionally entering. Database of about 800 prospects since 2005
  ([RotoViz 2015](https://www.rotoviz.com/2015/04/the-2015-phenom-index-for-wrs/) [archive]).
- 2014 replication of Siegele: about 190 WRs drafted 2006 to 2011, 99 with a 0.30+ dominator, graded
  on top-30 and top-15 seasons in the first three years; the result table is paywalled
  ([RotoViz 2014](https://www.rotoviz.com/2014/01/the-rotoviz-skeleton-key-picking-better-wide-receivers-for-fantasy-football/) [archive]).
- There is also a TE edition ("Rob Gronkowski and The Phenom Index for Tight Ends"); content not read [UNVERIFIED].

### Blair Andrews (RotoViz): WR Prospect Lab, draft age, YPRR thresholds

- WR Prospect Lab: a linear model of early-career fantasy output. Pre-draft inputs: size, speed, age,
  level of competition, career production, final-season production; no projected draft slot.
  Post-draft: "Final age and breakout age still tell us something draft position alone does not.
  Career production metrics remain important, but surprisingly, all final-season metrics are rendered
  redundant"
  ([pre-draft](https://www.rotoviz.com/2026/04/the-surprising-stars-of-the-2026-wide-receiver-class-pre-draft-wr-prospect-lab-scores/) [archive],
  [post-draft](https://www.rotoviz.com/2026/04/how-much-does-draft-position-matter-for-the-2026-wide-receiver-class-post-draft-wr-prospect-lab-scores-live-updates/) [archive]).
  Coefficients and accuracy are not public [UNVERIFIED].
- 2026 Phenom Index update: YPTA-based variants "get the slight edge" over market-share versions in
  correlation with PPR and receiving expected points over NFL years 1 and 2 (values are in a chart
  image, not text) and he flags "a worrying trend in prospect ages"
  ([RotoViz 2026](https://www.rotoviz.com/2026/03/carnell-tate-bryce-lance-and-the-complexities-of-prospect-age-the-2026-phenom-index-for-rookie-wide-receivers/) [archive]).
- Draft age study (2021): splitting NFL WRs by draft age still shows "drastic" PPR-per-season gaps;
  whether it beats draft position is behind the paywall
  ([RotoViz 2021](https://www.rotoviz.com/2021/05/does-draft-age-still-matter-for-wide-receivers/) [archive]).
- Method change he argues for (2025): treat production metrics as thresholds ("checking all the
  boxes"), test with repeated cross-validation folds, and distrust random forests on small WR samples
  because they have said TD scoring does not matter while TD-per-game thresholds catch busts
  ([RotoViz 2025](https://www.rotoviz.com/2025/05/how-much-do-yards-per-route-run-matter-for-wide-receiver-prospects-checking-all-the-boxes-part-1/) [archive]).
- Freak Score leaderboard: size-speed composite, 70+ is the 90th percentile
  ([RotoViz 2026](https://www.rotoviz.com/2026/03/the-upcoming-rookie-class-is-breaking-the-models-part-3-the-2026-wide-receiver-freak-score-leaderboard/) [archive]).

### Kevin Cole (RotoViz, PFF, Unexpected Points)

- 2016 logistic regression: 254 WRs entering 2000 to 2013, outcome one top-24 PPR season in the first
  three years. Four predictors: younger draft age, higher career market share of yards, more final-season
  receiving TDs per game, and fewer final-season receptions per game. 80.9% accuracy on a 136-player
  test set, but slightly less successful than draft position alone at picking successes (38.5% vs
  42.3%). Coefficients not published
  ([PFF 2016](https://www.pff.com/news/fantasy-modeling-success-for-wide-receiver-draft-prospects)).
- 2016 regression tree: splits on career yards share (about 29 to 30%), final-season yards share
  (about 42 to 43%), YPR and receptions per game
  ([PlayerProfiler summary](https://www.playerprofiler.com/article/wide-receiver-prospect-regression-tree-nfl-draft-advanced-stats-metrics-profiles/));
  the algorithm "didn't choose a single athletic metric for any of the decision nodes"
  ([CBS 2020](https://www.cbssports.com/fantasy/football/news/fantasy-football-what-is-age-adjusted-production-and-how-much-does-the-nfl-combine-matter-for-wide-receivers)).
- 2022 ensemble (one tree model, one linear), 2006 to 2019 classes, outcome percentile of projected
  top-12 weeks in the first two seasons. Feature importance order: draft position, career yards share,
  draft age, career TD share, best-season yards share, best-season YPRR, hand size, 40, weight,
  best-season YPR, 10-yard split, vertical. Career shares adjusted up for WRs with drafted teammates
  ([PFF 2022](https://www.pff.com/news/fantasy-football-post-combine-2022-rookie-wide-receiver-model)).
- 2023: outcome as weighted weekly finishes over four seasons (top-6 = 4, top-12 = 3, top-24 = 2,
  top-36 = 1); "correlation for any particular metric isn't particularly high", draft position
  strongest ([Unexpected Points](https://www.unexpectedpoints.com/p/metrics-that-matter-for-wide-receiver)).

### Travis May and Max Mulitz (RotoViz)

- Adjusted Production Index: dominator rating plus yards per team pass attempt plus TDs per team pass
  attempt; described as predictive of both NFL production and draft capital, with no public numbers
  ([RotoViz 2021](https://www.rotoviz.com/2021/07/predicting-future-nfl-success-for-wide-receivers-the-adjusted-production-index/) [archive]).
- Mulitz's TD-per-game threshold as a bust detector, per Andrews (link above). The threshold value is
  [UNVERIFIED].

### Peter Howard (Dynasty League Football)

- Breakout age (20%) by draft round, 2000 to 2015 draft classes, hit = top-24 PPR season. Round 1 WRs
  with an age-18 breakout: 73% hit, beating first-round capital alone "by nearly 14%". Age-19
  breakouts are the only group with a clear pattern in every round and a floor of 11%, 16.7% even for
  UDFAs (survivor bias acknowledged). Only 3 of 72 WRs with a breakout age over 19 and drafted
  "outside of the fourth round" became top-24 players. "Draft capital is still the most predictive, single value"
  ([DLF 2018](https://dynastyleaguefootball.com/2018/04/17/wide-receiver-breakout-age-by-draft-round/)).
- Overall breakout-age hit rates quoted in section 2
  ([SI](https://www.si.com/nfl/broncos/draft/analytics-reveal-why-denver-broncos-fans-should-beware-alabama-wr-henry-ruggs)).
- Draft-round hit rates since 2001 (R1 top-5/12/24: 20.5 / 34.6 / 48.7%; R2: 8.0 / 22.7 / 34.0%;
  R3: 6.5 / 11.7 / 23.4%)
  ([Campus2Canton](https://campus2canton.com/importance-of-draft-round-when-evaluating-wrs/)).
- 2019 update restarted at the 2003 class because 2001 to 2002 college stats were incomplete, and
  removed converted QBs like Edelman
  ([DLF 2019](https://dynastyleaguefootball.com/2019/03/25/wide-receiver-hit-rate-by-draft-round/)).
- "WhipperSnapper": dominator computed only on pre-age-20 seasons; a large gap to full dominator is a
  red flag ([DLF 2018](https://dynastyleaguefootball.com/2018/03/03/age-rookie-wide-receiver-prospects-whippersnapper/)).
- His college YPRR work: no public source found [UNVERIFIED].

### Dwain McFarland (Fantasy Life): Rookie Super Model

- Outcome: PPR PPG over the first three NFL seasons (min two eligible seasons), 2018 classes onward
  because PFF college data starts in 2014.
- Inputs, in weight order: draft capital (Chase Stuart value chart; pre-draft from NFL Mock Draft
  Database), production, film (NFL.com grades), athleticism (smallest weight "because NFL teams largely
  account for it with draft capital").
- WR production: adjusted career RYPTPA (heavier weights on the first three college years) r 0.46;
  career targeted QB rating r 0.40. TE production: adjusted career RYPTPA r 0.58 ("TEs can still impact
  their score with a strong senior season"); targeted QB rating r 0.32; speed score r 0.46 (not used for
  WR). Normalized for age, class, SOS, teammate competition, QB quality, team style, program (ESPN FPI).
- Correlations to PPG: WR pick 0.59, capital 0.66, model without capital 0.64, full model 0.68. TE
  0.62, 0.71, 0.70, 0.76
  ([RSM 2026](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki)).
- Bands: "Ten wide receivers have garnered a Super Model rating of 85 or higher since 2018, with 80%
  delivering a top-24 finish by Year 3"
  ([RSM 2025 WR](https://www.fantasylife.com/articles/fantasy/2025-rookie-wr-rankings-using-dwain-mcfarlands-super-model)).
  The full band table is paywalled and the extracted band labels were inconsistent [UNVERIFIED].
- Change: added career contested-target rate at a small weight in 2026 (r 0.40), to be re-evaluated in
  2027 ([Fantasy Life](https://www.fantasylife.com/articles/nfl-draft/a-new-data-point-for-evaluating-nfl-draft-wr-prospects)).

### JJ Zachariason (Late-Round): ZAP Model

- "The ZAP Model measures the best two seasons across a player's first three NFL years and uses draft
  capital, college production, size, and age to project that outcome"
  ([Dynasty Compass](https://www.dynastycompass.com/episodes/episode-44-dynasty-breakouts-jj-zachariason)).
- Inputs named on his podcast: a breakout score using age and strength of schedule, program-adjusted
  receiving yards per team pass attempt, best-season reception share, size, speed score, and draft
  capital as the biggest input
  ([iHeart episode summary](https://www.iheart.com/podcast/1157-nfl-fantasy-football-podc-29699073/episode/jj-zachariason-on-his-zap-model-272251766/)).
- Framing: "it tells you when you should deviate from draft capital ... Because that capital is the
  baseline" ([X, verified via authenticated read](https://x.com/LateRoundQB/status/1891583202810118235)).
  For year-2 updates, "way less anchoring to draft capital / prospect score needed at WR versus RB ...
  Year 1 production at WR is really predictive" ([X](https://x.com/LateRoundQB/status/1906068039361012176) [excerpt]).
- Weights, score tiers and hit rates are in the paid Prospect Guide [UNVERIFIED].

### Ryan Heath (Fantasy Points; Beyond the Box Score podcast)

- Model target: average PPR points of a WR's best 2 of first 3 NFL seasons. "Seasons after a player
  turns 22 basically don't matter"; one of his most predictive stats "loses ~all of its meaning if the
  player was age 22 or older when the season began"; route-type composition (screens, slot fades) is
  examined ([Fantasy Points](https://www.fantasypoints.com/nfl/articles/season/2026/ryan-heaths-rookie-wr-rankings) [excerpt]).
  Inputs and accuracy are paywalled [UNVERIFIED].
- NFL-side work: first-read target share, 0.78 stable year to year and 0.79 with next-season FPG
  ([Fantasy Points newsletter](https://newsletter.fantasypoints.com/p/finding-stud-wrs-first-read-target-share)).

### Jakob Sanderson

- Deliberately has no WR model; warns that carving data into single "silver bullet" metrics lowers
  reliability. Primary lenses: YPTPA, market share of team receiving yards, YPRR; secondary: TPRR,
  uncontested TPRR, first downs per route, yards per target, missed tackles forced per reception. Two
  questions first: how much, and when (age/experience adjusted), then how and against whom
  ([Substack WR](https://jakobsanderson.substack.com/p/2026-wide-receiver-class-pre-draft)).
- TE: sort by role first (in-line Y, receiving-only, blocker), because "tight ends aren't playing a
  universal game"
  ([Substack TE](https://jakobsanderson.substack.com/p/2026-tight-end-class-pre-draft-rankings)).

### Campus2Canton

- Glossary adds RYPTPA "over average" and weighted dominator "over average", both relative to the
  mean of college players who later posted a top-24 NFL season, and Amico's 80/20 weighted dominator
  ([glossary](https://campus2canton.com/glossary/)).
- Devy recruit model (three averaged models, 70/30 split, 2016 to 2020 classes): R^2 0.41 for
  college PPG versus 0.14 for the 247 composite alone
  ([C2C](https://campus2canton.com/a-model-based-approach-to-the-2023-wide-receiver-recruiting-class/)).
- Size study (98 WRs, Rounds 1 to 3, 2010 to 2019, seasons 1 to 3 PPG): no significant difference by
  height, weight or BMI
  ([C2C](https://campus2canton.com/does-it-matter-if-my-favorite-rookie-wide-receiver-is-small/)).

### PFF (Jonathon Macri, 2026 models)

- WR model: career receiving grade, YPRR, performance versus single coverage, competition level,
  draft capital, plus target rate, first-down-plus-TD rate, MTF, explosive rate, YAC, slot routes;
  weights not disclosed ([PFF WR](https://www.pff.com/news/fantasy-football-2026-rookie-wide-receiver-prospect-model)).
- TE model: career receiving grade, YPRR, athleticism, competition, draft capital; a score of 8.0+
  associates with success and a receiving grade below 75.0 with low hit rates. Failure modes named:
  high capital with thin receiving metrics, late breakouts, transfers distorting efficiency
  ([PFF TE](https://www.pff.com/news/fantasy-football-2026-rookie-tight-end-prospect-model)).

### Adam Harstad (Footballguys): the year-2 update

- NFL rookie YPRR with a TD bonus and route-usage scaling, min 250 routes, 2006 to 2022. Once a player
  has a score, draft position adds little
  ([Footballguys](https://www.footballguys.com/article/2023-dynasty-in-theory-85-rookie-receiver-model)).

### Other quantified sources used above

- Rich Hribar, early declares (313 WRs, 2010 to 2019 classes; 103 early): all rounds WR3+ 38.8% vs
  12.9%, WR2+ 31.1% vs 6.7%, WR1 19.4% vs 2.4%
  ([Sharp](https://www.sharpfootballanalysis.com/fantasy/dynasty-fantasy-football-should-you-avoid-non-early-declare-wide-receivers/)).
- Mike Braude, 32 rookie-year WR breakouts since 2011 (200+ PPR points, or 180+ with 13+ PPG): 72%
  early declares, 59.4% first-rounders, 84% Rounds 1 to 2, 68.8% broke out before 20.5, 78% peak
  dominator above 30%, 72% cleared 2.5 YPTA in their best season
  ([Apex](https://apexfantasyleagues.com/what-does-a-rookie-wide-receiver-breakout-look-like/)).
- Marvin Elequin, 2000 to 2018 classes: R1 WRs 10.09 PPR PPG in years 1 to 3 vs 8.16 for R2; R1 TEs
  7.49 vs 5.67 for R2
  ([Fantasy Footballers](https://www.thefantasyfootballers.com/articles/draft-capital-its-correlation-to-early-career-fantasy-production/)).
- Dynasty Nerds (Steven Pintado, 2026): WR R1 / R2 / R3 WR1 rate 36.7% / 18.9% / 14.0%; TE R1 / R2 /
  R3 TE1 rate 90.9% (n = 11) / 35.0% / 22.2%
  ([Dynasty Nerds](https://www.dynastynerds.com/analytics/nfl-draft-capital-fantasy-football/)).
- Andrew Erickson, rookie TEs since 2013 (rookie-season finishes, inferred from the table context):
  R1 38% TE1 (5 of 13), R2 4%, R3 3%; "80 targets is the goal"
  ([FantasyPros](https://www.fantasypros.com/2026/04/how-to-value-rookie-tes-in-fantasy-football-pre-nfl-draft-2026/)).
  Read against Dynasty Nerds, the gap between rookie-year and any-year TE1 rates is the slow TE curve.
- Chris Collins TE NGBoost: feature importance draft slot, 40, 3-cone, burst, YPRR, then dominator,
  aDOT, air yards ([thirdc.cc](https://thirdc.cc/p/another-te-model)).
- BrainyBallers: WR RAS r 0.014, college YPRR r 0.021, TE draft age r -0.081, TE breakout age r 0.098
  (older TE breakouts trended slightly better). Caveat: every sample is limited to players who
  already finished top-50 in the NFL, which restricts range and pushes correlations toward zero, so
  read these as "weak inside the successful group", not as null effects
  ([RAS](https://brainyballers.com/nfl-wide-receivers-does-ras-matter-a-comprehensive-analysis/),
  [YPRR](https://brainyballers.com/wide-receiver-college-yards-per-route-run-does-it-matter-a-comprehensive-analysis/),
  [TE age](https://brainyballers.com/does-it-matter-the-tight-end-draft-age-benchmark-that-predicts-elite-success/),
  [TE breakout](https://brainyballers.com/tight-ends-can-breakout-age-help-predict-nfl-success/)).
- Dynasty Domain: no public description of a prospect model found [UNVERIFIED].

### Known failure modes, and what analysts say they would change

1. **Draft capital swamps everything.** Cole's 2016 model lost to draft position at picking successes
   (38.5% vs 42.3%, [PFF](https://www.pff.com/news/fantasy-modeling-success-for-wide-receiver-draft-prospects)).
   JJ's fix is to model the deviation from capital, not the outcome
   ([X](https://x.com/LateRoundQB/status/1891583202810118235)).
2. **Double counting.** Film and athleticism overlap with capital, so RSM down-weights both
   ([RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki)).
3. **Small samples and overfit.** Random forests have said TDs do not matter while TD thresholds catch
   busts; Andrews moved to thresholds plus repeated cross-validation
   ([RotoViz 2025](https://www.rotoviz.com/2025/05/how-much-do-yards-per-route-run-matter-for-wide-receiver-prospects-checking-all-the-boxes-part-1/) [archive]).
   The TE NGBoost model swings by class (R^2 0.31 on 2022, [thirdc.cc](https://thirdc.cc/p/another-te-model)).
4. **Age data drift.** Extra eligibility years are producing older classes (Andrews 2026, "a worrying
   trend in prospect ages", [RotoViz](https://www.rotoviz.com/2026/03/carnell-tate-bryce-lance-and-the-complexities-of-prospect-age-the-2026-phenom-index-for-rookie-wide-receivers/) [archive]);
   fourth-year production against younger defenders inflates (Siegele, [BSS](https://www.rotoviz.com/2019/04/box-score-scout-advanced-stats-wide-receivers/) [archive]);
   Heath discards seasons at 22+ ([Fantasy Points](https://www.fantasypoints.com/nfl/articles/season/2026/ryan-heaths-rookie-wr-rankings) [excerpt]).
5. **Touchdown noise.** TD share is easy to "trick" (Moore, [RotoViz](https://www.rotoviz.com/2015/04/the-2015-phenom-index-for-wrs/) [archive]),
   so weight yards over TDs; keep a TD floor as a bust flag.
6. **Teammate and context effects.** Shares are depressed next to other NFL receivers; Cole adjusts
   career shares up ([PFF 2022](https://www.pff.com/news/fantasy-football-post-combine-2022-rookie-wide-receiver-model)),
   Smyth subtracts 0.5 from breakout age ([Yahoo](https://sports.yahoo.com/fantasy/article/using-adjusted-breakout-age-to-help-you-evaluate-wide-receivers-in-the-2026-nfl-draft-for-fantasy-football-150623093.html)).
7. **Transfers and late breakouts** break career-rate metrics, especially at TE
   ([PFF TE](https://www.pff.com/news/fantasy-football-2026-rookie-tight-end-prospect-model)).
8. **Changing size norms.** WR size thresholds from the 2010s are aging out
   ([Apex](https://apexfantasyleagues.com/is-it-time-to-adjust-wide-receiver-weight-thresholds/)).
9. **Survivor bias.** UDFA hit rates and any "top-N finishers only" sample overstate or blur effects
   ([DLF 2018](https://dynastyleaguefootball.com/2018/04/17/wide-receiver-breakout-age-by-draft-round/)).

---

## 4. Recommendation for our WR and TE models

### Target variables

- **WR, primary (regression):** mean PPR points per game over the best 2 of the first 3 NFL seasons,
  with a season counted only at 8+ games and a missing or sub-threshold season scored as 0 rather than
  dropped. This is the ZAP and Heath target, it rewards ceiling (what dynasty pays for), and the zero
  rule keeps busts in the sample.
- **WR, secondary (classification):** P(at least one top-24 PPR season within the first 3 seasons), the
  target used by Cole 2016, Siegele and Howard, so our calibration can be checked against their tables.
- **TE:** same shapes on a **4-season window** (best 2 of first 4; P(top-12 TE season within 4 years)),
  because only 73.1% of TE breakouts land in years 1 to 3 and 89.6% by year 5
  ([Fantasy Footballers](https://www.thefantasyfootballers.com/analysis/anticipating-the-breakout-tight-end-trends-breakout-candidates-fantasy-football/)).
- **Benchmarks to beat,** on 2018+ classes with PPR PPG in years 1 to 3: draft capital alone r 0.66 WR /
  0.71 TE, RSM r 0.68 / 0.76
  ([RSM](https://www.fantasylife.com/articles/nfl-draft/2026-rookie-super-model-a-data-centric-approach-to-grading-rooki)).
  If our model does not beat capital alone out of sample, ship capital alone.

### Model shape

1. Fit draft capital first (value chart), then model the residual with production and age (JJ's
   "capital is the baseline"). Build two versions: **pre-draft** using expected draft position and
   **post-draft** using actual capital, as RotoViz does with its Prospect Lab.
2. Regularized linear or monotone-constrained gradient boosting, validated leave-one-draft-class-out
   (Andrews' small-sample warning). Report calibrated hit probabilities by score band, like RSM.
3. After NFL year 1, hand off to an NFL-usage model (rookie YPRR, route share, first-read share),
   because rookie production is new information that capital does not carry (Harstad; JJ). The site
   already has est. YPRR/TPRR from nflverse.

### Feature set: from box scores (buildable key-free)

Sources: nflverse `draft_picks` and `combine` (already loaded by
`projections/build_prospect_profile.py`), player birthdates from nflverse players, college player and
team season stats from Sports-Reference CFB pages (public). CollegeFootballData's API needs a key, so
it is out under the no-keys rule. Pre-draft EDP from a public mock consensus page.

| Feature | WR | TE | Why (source above) |
|---|---|---|---|
| Draft capital value (post) / EDP value (pre) | yes | yes, heavier | r 0.66 / 0.71 |
| Draft age (fractional, at draft) and early-declare flag / college seasons played | yes | yes, lighter | Hribar; Moore 17 of 18 models; TE draft age weak |
| Breakout age at 20% (WR) / 15% (TE) dominator, plus the adjusted version | yes | yes, low weight | Howard tables; TE r 0.098 |
| Age-weighted career RYPTPA (downweight seasons at 22+) | yes | yes, allow a year-4 bump | r 0.46 / 0.58; Heath age 22 |
| Best-season RYPTPA and best-season yards share | yes | yes | Cole 2022 feature order |
| Career market share of rec yards, adjusted for drafted teammates | yes | yes | Cole 2016 and 2022 |
| Final-season rec TD per game (floor flag) and TD per team pass attempt | yes | yes | Mulitz; API |
| Final-season receptions per game (expect a negative sign) | yes | no | Cole 2016 |
| Best-season YPR | yes (low) | no | Cole tree; PlayerProfiler |
| Dominator (career, peak) and pre-20 "WhipperSnapper" dominator | yes | yes | PlayerProfiler; Howard |
| Conference tier / SOS (SRS), non-FBS flag | yes | yes | RSM; Smyth |
| Weight, height, 40, speed score, HaSS, burst, agility, missing-test flags | low weight | real weight | RSM; Collins |
| TE weight over 265 lb flag | no | yes | Fantasy Points [excerpt] |

### Features that need data beyond box scores

- **Charting (PFF / Fantasy Points / SIS, paid):** college YPRR, TPRR, uncontested TPRR, first downs
  per route, targeted QB rating, contested-target rate, receiving grade, personnel-adjusted YPRR,
  slot and in-line alignment (the core TE role question), screen share and route tree, performance
  versus single coverage, missed tackles forced. College first-read target share is not publicly
  charted at all.
- **Targets:** college target share needs play-by-play or charting; box scores carry receptions, not
  targets.
- **Scouting:** NFL.com prospect grades (public pages, but scraped per player) add r 0.56 but mostly
  duplicate draft capital; only worth it in the pre-draft version.
- **Recommendation:** ship v1 on the box-score set above. Add a charted feature only if it improves
  leave-one-class-out error over capital-plus-box-score, the same bar Dwain applied to CCTR.

---

## 5. Could not verify

- ZAP Model weights, score tiers and hit rates (paid Prospect Guide).
- RotoViz WR Prospect Lab coefficients and accuracy; Phenom Index vs YPTA correlation values (chart
  image only); Andrews' YPRR percentile thresholds (paywalled).
- Ryan Heath's WR model inputs and accuracy (Fantasy Points paywall, 402); the age-22 quote is from a
  search excerpt.
- Peter Howard's college YPRR research; Dynasty Domain's model; Mulitz's TD-per-game threshold value.
- Any public validation of college TPRR or college first-read share.
- Kent Lee Platte's own RAS-vs-AV correlations (source page blocked).
- The Fantasy Points "265 lb TE, 4.5%" figure (search excerpt only).
- The Rookie Super Model's lower WR score bands (paywalled; extracted labels inconsistent).
- Jon Moore's TE Phenom Index article content.
