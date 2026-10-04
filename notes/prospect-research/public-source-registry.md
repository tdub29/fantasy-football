# Public source, licence and reuse registry

Every public source examined for the prospect model, what was reused, under what terms, and why
anything was not. Checked 2026-10-03. "Verified" = the licence file or terms page was fetched
(GitHub licence API, README or the site itself); "unverified" = not fetched or the page refused.
Nothing in the SQLite store or parquet cache is committed or redistributed; the site ships model
aggregates only. Rows are added, never silently rewritten.

## In use

| Source | What | Licence / terms | Access | Reuse | Used for |
|---|---|---|---|---|---|
| sportsdataverse-data `espn_cfb_{receiving,rushing,passing}` | ESPN PBP player seasons, FBS, 2004-2026 | repo LICENSE MIT, README badge CC BY 4.0 (verified); underlying ESPN data under ESPN terms | plain GET of release assets | reuse-data | every college production feature |
| sportsdataverse-data `espn_cfb_rosters`, `cfb_recruits` | rosters (position from 2014 only, DOB sparse), 247 stars and composite grade | as above | plain GET | reuse-data | position, size, stars, grade (A4) |
| sportsdataverse-data `cfb_ratings`, `cfb_team_opponent_splits` | season team ratings (adjusted EPA, FEI-style), per-game opponents | as above; files regenerated daily by current code (no historical vintage) | plain GET | reuse-data | A11 (rejected) |
| sportsdataverse-data `espn_cfb_usage_players` | season usage: shares, explosive and success rates, EPA per opportunity | as above | plain GET | reuse-data | A12 (rejected) |
| nflverse-data `draft_picks`, `players`, `combine`, `stats_player`, `rosters` | draft, birth dates, combine, season PPR, roster positions | CC-BY-4.0 (verified, LICENSE.md). draft_picks and combine originate at Pro Football Reference (nflreadr docs) | plain GET | reuse-data, attribute nflverse | labels, capital, real DOB (A1), combine (A8, B4) |
| Restricted cubic spline (Harrell), class-grouped bootstrap, embargoed forward chaining | methods | textbook methods | n/a | replicate-method | baseline and validation |

## Examined, not used

| Source | Finding | Verdict and closure route |
|---|---|---|
| FantasyPros dynasty rookie ECR via DynastyProcess `files/db_fpecr.parquet` (+ 2018-2020 archive CSVs) | Dated pre-draft expert consensus, about 90 rookies a class, 2019-2026 classes. Repo GPL-3.0 (verified); FantasyPros data has no licence found (unverified) | **Deferred.** Only five mature classes (2019-2023) and two embargoed forward test classes, too few to pass the charter; terms unclear. Revisit when the 2024 class matures (Jan 2027) |
| DynastyProcess RAS archive (`files/archives/RAS`) | Pro-day testing for draft years 1987-2019 | **Rejected: unavailable at serving time.** Frozen at 2019, so training would see athleticism the 2020+ and current classes never get (train-serve skew). Repo GPL-3.0; RAS terms unverified |
| ESPN core API athlete `dateOfBirth` | 0 of 40 sampled 2025 college players had a DOB (worker sample) | **Unavailable.** Estimated age stays for college players; real DOB used post-draft (A1) |
| NFL Mock Draft Database consensus boards | robots.txt disallows the API; terms page 403; API is sold | **Restricted.** Not scraped |
| Sports Reference / College Football Reference | terms bar bots, competing databases and AI training (verified by worker) | **Restricted.** Not used, including for birth dates |
| MockDraftable | no bulk download; site JS-rendered | **Unavailable** |
| cfbfastR-data, CFBD API | CFBD needs an API key; cfbfastR-data has no licence file | **Unavailable** (no keys by policy); the key-free sportsdataverse releases cover the same plays |
| nflverse `nfldata` draft_values | no licence file; a draft-value curve | **Replicated** by the fitted capital spline instead |
| dynastyprocess `values-players.csv` | post-draft values | **Rejected: leakage** for any pre-draft use (embeds capital) |
| Small public GitHub prospect-model repos (CrackedPeanut34/nfl-draft-model, pitchafwa/wrpi-board, paarthkeswani-droid/DraftIQ) | 0-1 stars, mostly no licence, no validated out-of-time results | **Not reused**: nothing validated to copy |
| cfb_team_portal | team-level transfer counts 2015-2026, not player-level | **Too coarse** for player transfer history; deferred |

## Literature checked

| Paper | Finding used |
|---|---|
| Wolfson, Addona, Schmicker (2011) "The quarterback prediction problem", JQAS | all drafted QBs incl. those who never played; college and combine stats add little to draft slot. Consistent with every QB candidate here failing |
| Berri and Simmons (2011) "Catching a draft", J. Productivity Analysis | weak draft-slot to performance link for QBs (summary unverified) |
| Mulholland and Jensen (2014), TE draft and career success, JQAS | what predicts draft order differs from career success; size over-weighted by the draft (snippet only). Motivates two-stage B3 |
| Szekely et al. (2023) arXiv 2303.05774 | combine data alone weak for career snaps (R-squared 0.17) |

No peer-reviewed WR/RB study with an out-of-time holdout was found. Practitioner claims that
breakout age, market share or yards per route add to draft capital come from blog posts.
