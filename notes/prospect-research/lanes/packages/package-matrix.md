# Football data-loader packages: source, coverage, licence, auth, maintenance

Packages lane, checked 2026-10-04 (PyPI JSON API, GitHub repo API, package source files). A package
licence covers the code, never the upstream data. Two loaders that read the same upstream are one
source, not two. "Key" means an API key or account; this project uses none.

## Matrix

| Loader (version, last release) | Maintained? | Upstream data | Coverage that matters here | Ids / join | Auth | Code licence / data terms | Disposition |
|---|---|---|---|---|---|---|---|
| **nflreadpy** 0.1.5 (PyPI 2025-11-19; repo pushed 2026-09-09) | yes, official nflverse Python loader, Beta | nflverse-data GitHub releases (same assets the builder already GETs), DynastyProcess `files/`, ffopportunity releases, espnscrapeR-data | draft picks, players (DOB), combine, rosters, player stats, snap counts (PFR, 2012+), contracts (OTC), FF player ids | gsis, pfr, espn (NFL), plus every fantasy id via `load_ff_playerids` | none | MIT code; nflverse-data CC-BY-4.0; DynastyProcess repo GPL-3.0 | **Redundant for every table the store loads** (same release URLs; rows and compared values identical, R1; the builder already sha256-tracks the files). Adds polars + pydantic for no data gain. Use only if a new nflverse table is needed (none closes a pre-draft gap). |
| nfl_data_py 0.3.3 (2024-09-20) | **archived** (last push 2025-09-25; superseded by nflreadpy) | nflverse | as nflreadpy | as nflreadpy | none | MIT | **Rejected**: archived; pins `pandas<2, numpy<2`, incompatible with the installed pandas 3.0.2. |
| nflreadr (R) | yes (pushed 2026-09-17) | nflverse | as nflreadpy | as nflreadpy | none | licence NOASSERTION on GitHub | **Not needed**: no R on this machine; same upstream as nflreadpy. |
| **cfbfastR** 3.0.0.9000 (R; repo pushed 2026-10-01) | yes | three families: (a) sportsdataverse-data releases (`load_*`), (b) ESPN APIs live (`espn_cfb_*`), (c) CFBD API (`cfbd_*`) | (a) same releases the store loads plus ones it does not; (b) ESPN recruiting, athlete records, per-player stats incl. FCS; (c) CFBD | ESPN athlete id throughout (a, b) | (a, b) none; (c) **CFBD key** | MIT + file; ESPN data under ESPN terms; CFBD terms | **Reused as the endpoint/URL reference** (no R here): its documented endpoints are called from Python with plain GETs, parsing only the fields its own functions read. `cfbd_*` and `load_cfb_rosters()` (wraps `cfbd_team_roster`) are key-blocked. |
| sportsdataverse-py 0.1.4 (PyPI 2026-09-01; repo pushed 2026-10-04) | yes, Alpha | sportsdataverse-data releases + ESPN APIs | cfb release loaders and ESPN helpers | ESPN ids | none | MIT code | **Redundant** with the release files the store already GETs; heavy dependency set (lower bounds on pyjanitor, scipy, matplotlib, scikit-learn, xgboost; polars capped below 2). Installed in the lane venv (0.1.4): 24 `cfb_*`, 47 `load_*`, 125 `espn_*`, 47 `sports247_*`, 82 `on3_*`, 12 `fox_*`, 7 `yahoo_*` cfb callables; none reaches data the tests below needed beyond plain GETs. |
| cfbfastR-data repo (committed `rosters/`, `player_stats/`, `data/`) | yes, CFBD-derived datasets "still updated daily" (README) | CFBD (collegefootballdata.com) | rosters 2004-2026 with real positions before 2014, home town, CFBD `recruit_ids`; player season stats 2014-2026 | ESPN athlete id (CFBD-only players negative) | none for these committed files | **no licence file**; CFBD data | **Rejected** for positions (R2: worse than the current inference against NFL positions); 0 of its 16,171 recruit ids match any `cfb_recruit.recruit_id`. |
| CFBD API via `cfbd` 5.32.1 (official client, 2026-10-03) / `cfbd-json-py` 0.2.4 | yes | CFBD | recruiting, rosters, stats, draft, portal (FBS + FCS) | CFBD ids | **API key (account)** | MIT client; CFBD terms | **Blocked** (no keys or accounts by policy). Key-free republications above cover part of it. |
| cfbreadr | **not found**: no GitHub repo (search returned 0), not on PyPI or the cfbfastR export list | n/a | n/a | n/a | n/a | n/a | **Does not exist as far as verifiable**; the release-reading role belongs to cfbfastR `load_*` and sportsdataverse-py. |
| ncaa_stats_py 0.0.12 (2025-05-16; repo pushed 2025-12-05, 4 stars) | lightly | stats.ncaa.org, live HTML scraping per team/game | FBS + FCS from 2013 | NCAA ids, names | none | MIT code; NCAA site terms | **Redundant**: same upstream as the `ncaa_mfb_*` releases the data-gaps lane already pulled in bulk; per-page scraping is slower and heavier on NCAA. |
| henrygd/ncaa-api (service, MIT, pushed 2026-09-17) | yes | ncaa.com live JSON | scores, box scores, leaders; shallow history | NCAA game ids | none | MIT code; NCAA terms | **Redundant** for history (stats.ncaa.org releases); not tested. |
| sportsipy 0.6.0 / sportsreference 0.5.2 | no (2021 / 2020) | Sports Reference HTML | college stats | SR ids | none | MIT code; **SR terms bar bots** | **Rejected**: unmaintained and SR terms (registry already restricts SR). |
| espn-api 1.0.0 (cwendt94) | yes | ESPN fantasy leagues | private fantasy league data | n/a | league cookies | MIT | **Irrelevant** (not college or NFL player data). |

## Upstream sources reached through these loaders (deduplicated)

| Upstream | Reached by | Already in store | New here |
|---|---|---|---|
| nflverse-data releases | builder GET, nflreadpy, nfl_data_py, nflreadr | yes | nothing |
| sportsdataverse-data ESPN college releases | store GET, cfbfastR `load_espn_cfb_*`, sportsdataverse-py | 9 tags | untested tags listed below |
| stats.ncaa.org | `ncaa_mfb_*` releases (cfbfastR `load_ncaa_mfb_*`), ncaa_stats_py | no (data-gaps lane owns it) | FCS |
| ESPN core API live (recruits, athletes) | cfbfastR `espn_cfb_recruits`, `espn_cfb_player*` | no | recruiting grades with ESPN ids; athlete DOB (see leakage test) |
| CFBD | CFBD API (key), cfbfastR-data committed files (no key) | only through `cfb_recruits` (sportsdataverse) | rosters with positions and recruit ids |
| DynastyProcess `files/` | nflreadpy `load_ff_playerids`, `load_ff_rankings` | no | NFL-side ids and DOB (post-draft, fantasy-relevant players only) |

## Release tags not in the store, by gap (from the data-gaps lane's release inventory, read-only)

| Tag | Seasons | What it is | Gap it could touch | Disposition |
|---|---|---|---|---|
| `espn_cfb_injuries` | 2026 only | daily snapshot of current state; history only from 2026 snapshots | injury history | **Unavailable for history** (no vintage before 2026) |
| `espn_cfb_play_participants` | 2014-2026, 557 MB | one row per player per play | snaps / routes proxy | candidate, deferred (large; needs a measured question) |
| `espn_cfb_game_rosters` | 2004-2026, 3.5 GB | who dressed each game | games available, positions | candidate for pre-2014 positions, deferred (CFBD rosters tested first, 1000x smaller) |
| `espn_cfb_adv_receiving`, `adv_player_usage` | 2004-2026 | advanced box / usage | usage | likely overlaps `espn_cfb_usage_players` (A12 rejected); untested |
| `cfb_recruiting_proj` | 2016-2025 | team-level projections | none (team grain) | not useful |
| `cfb_crosswalk` | 2014-2025 | ESPN/Fox/Yahoo/stats-site ids | id joins | examined earlier (no NFL ids); stats-site player mapping still worth checking for the FCS join |


## Results

Every number below was produced by a saved lane script on scratch data
(`C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp\`: store copy taken 2026-10-04T07:35Z through the
SQLite backup API; population B snapshot `pop_b.parquet` copied from the data-gaps lane, sha256
`14a8f064...0fce`; `nfl_outside_b.csv` sha256 `06dd09f9...8963`). An independent reviewer reran them
and rebuilt several by hand (`review.md`); its corrections are applied.

### R1. nflreadpy adds nothing the store lacks (redundant)

`<venv>/python projections/lanes/packages/nflreadpy_parity.py <store copy>` (nflreadpy 0.1.5,
polars 1.44.2). Rows and the compared columns are identical (compared as strings):
`load_draft_picks` 12,927 vs 12,927 rows, 0 rows on one side only, 0 differences in
gsis/pfr id/position/college; `load_players` 24,844 vs 24,844, 0 differences in
birth_date/espn_id/pfr_id/college; `load_combine` 8,968 vs 8,968, forty present on 8,039 in both.
`load_ff_playerids` (DynastyProcess, 12,518 rows, current snapshot, `db_season` 2026) fills 0
missing nflverse birth dates and has 0 skill players with a draft year of 2027 or later; its 40
no-gsis skill players born 2000+ are past-class UDFAs (draft_year 2021-2026), not prospects.
**Verdict: keep the builder's thin GETs; nflreadpy adds a dependency and no data.**

### R2. CFBD-derived roster positions do not beat the current inference (rejected)

`python projections/lanes/packages/cfbd_rosters.py <pop_b> <store copy>` (cfbfastR-data
`rosters/parquet`, 2004-2019). For population B classes 2010-2014 CFBD has a row for 95-98% and a
real position (not `?`) for about 90-95%; for 2008-2009 almost none (CFBD carries few positive ESPN
ids before 2009). CFBD agrees with the inferred position on 87% of rows with a real CFBD position
(2,146 of 2,456). Graded against the NFL position (draft position, else first NFL roster position),
NFL QB/RB/WR/TE only:

| Classes | n | Current position | CFBD | Disagreements: current right / CFBD right |
|---|---|---|---|---|
| 2008-2014 (inferred), all CFBD rows | 535 | 94.8% | 87.3% | 52 / 12 |
| 2008-2014, CFBD `?` excluded | 500 | 94.6% | 93.4% | 18 / 12 |
| 2016-2020 (ESPN position), all | 793 | 96.8% | 92.7% | 34 / 1 |
| 2016-2020, `?` excluded | 765 | 97.1% | 96.1% | 9 / 1 |

Most of CFBD's apparent deficit is its `?` rows; on real positions it trails the inference by about
1 point. 0 of CFBD's 16,171 recruit ids match any `cfb_recruit.recruit_id` (different id systems).
**Verdict: no gain; keep the inference.**

### R3. ESPN college athlete DOB tracks NFL arrival (leakage; rejected for pre-draft use)

`python projections/lanes/packages/espn_dob_probe.py <pop_b> 8` (360 population B players, 8 per
class x outcome cell, classes 2012-2026, 40-48 rows per era x group). DOB present: 2018-2022 drafted
98%, undrafted with an NFL roster 88%, neither 5%; 2023-2026 100% / 100% / 12%; 2012-2017 46% / 31% /
19%. All 240 drafted and UDFA records carry a `proAthlete` link (54% of 2012-2017 drafted still lack
a DOB). Presence of a DOB predicts the label, so it is never a pre-draft feature or age input;
nflverse already supplies DOB post-draft. Corroborates the data lane's finding on the ESPN roster DOB
with a second endpoint.

### R4. ESPN's NFL-to-college crosswalk: a precision check on the joins and 51 missing links (accepted with guards)

`python projections/lanes/packages/espn_nfl_college_xwalk.py <store copy>` then
`python projections/lanes/packages/xwalk_measure.py <store copy> <xwalk> <pop_b> <nfl_outside_b.csv>`.
3,432 nflverse QB/RB/WR/TE/FB with an `espn_id` (rookie or draft year 2008-2026): 3,431 records,
3,343 with `collegeAthlete`; no college id maps to two NFL players.

- **Drafted links** (builder run 20261004T064925). Name + school links agree with ESPN on 693 of the
  694 ESPN can grade (619/620 for 2008-2016, 74/74 for 2017-2026; 26 of 720 ungraded, mostly 2008-2011
  picks without an `espn_id`). The 690/690 agreement on id links is circular (ESPN's college id is
  the `espn_id` the builder joined on) and is not evidence. ESPN's link is not a copy of an exact-name
  join (it ties NFL "Beanie Wells" to college "Chris Wells"), but same-name errors shared by both
  methods cannot be ruled out. The one conflict (Kevin O'Connell) is ESPN's error: its college id
  479818 has no rows; the store's 147785 holds his 2007 San Diego State season.
- **New drafted profiles**: ESPN links 98 of the 110 unlinked draftees. Only 5 pass the name join's
  window (last FBS season in draft year minus 2 to minus 1): Stevie Johnson, Beanie Wells, Mardy
  Gilyard, Corey Fuller, Dorial Green-Beckham. 6 more have only stale pre-transfer FBS seasons (Joe
  Flacco 2004, Rashad Jennings 2005, B.J. Coleman 2008, Bryce Brown 2009, Taylor Thompson 2009, Beau
  Sandland 2013); Kyle Williams's ESPN college id 183335 merges his 2006-2009 Arizona State seasons
  with a 2016 namesake. The rest are FCS, Division II/III or no college.
- **Population B, missing links**: 85 rows carry no NFL id while ESPN links their college id to an
  NFL player; 52 played NFL games. With the timing guard (college career ends before the NFL career
  starts; it rejects Kyle Williams) 51 remain: 13 drafted (among them the **2 hits labeled as
  misses**, Stevie Johnson WR 2008 round 7 and Beanie Wells RB 2009 round 1, plus Green-Beckham,
  Jacob Hester, Gilyard, Owen Schmitt, Fuller, Jay Prosch, Jordan Palmer, Rashad Jennings, Bryce
  Brown, Peyton Hillis, Joey Iosefa) and 38 undrafted (Marcel Reece 94 games, Andrew Hawkins 73,
  Dontrelle Inman 63, and others; 3 played NFL games at OT, DB or DE). Two of the 51 point at an NFL
  id B already gives another row (below).
- **Population B, existing links ESPN disputes** (checked in both directions): 0 rows where the
  college id maps to a different NFL id; 7 links whose NFL id ESPN maps to another college id. 4 are
  ESPN errors (O'Connell, Dwight Jones and Ian Thompson point at empty records; Kenneth Harris at a
  2020-2025 namesake), 2 are true split identities (JoJo/Bruce Natson, Akron then Utah State;
  Dominique Davis, Boston College then East Carolina), and 1 is B's error: B links Corey Brown (ESPN
  487791, a DB from Monroeville) to the NFL WR Corey "Philly" Brown (ESPN 534284, from Upper Darby);
  the link belongs on b534284.
- Population B's 2,898 NFL links: none has an NFL career starting before the class year.
- **Since this run** the coordinator linked Stevie Johnson and Beanie Wells through the name join
  (commit eff88be, link run 20261004T144240: both `name_school`); Gilyard, Fuller and Green-Beckham
  are still unlinked there. What the crosswalk still adds: 3 drafted college profiles, 49 population B
  NFL links (11 drafted, 38 undrafted; no hit among the 38 labeled, 11 unlabeled as NFL FB or class
  2007), the Corey Brown correction,
  the Natson merge, and a standing precision check on every name join.
- **Verdict: accept as link step 1 with three guards** (college id has store rows; drafted: last FBS
  season within draft year minus 2 to minus 1; undrafted: career ends before the NFL career starts),
  name join as fallback, and the 7 disputed links listed for manual resolution rather than an
  automatic override (an override would wrongly move Dominique Davis to his first school).

### R5. ESPN recruiting grades join by id and lift recruiting coverage (accepted as a source)

ESPN recruit records (`espn_recruits.py`, the endpoint of cfbfastR `espn_cfb_recruits`) start with
the 2006 class (2004 has 2 records, 2002-2003 and 2005 none); probed classes hold 3,242 (2021) to
18,881 (2012). `athlete.alternateId` is the ESPN college athlete id: on 1,343 joined population B rows
the last name agrees on 99.0% (the 13 others are name changes or spellings) and the signed school is
in the career for 99.7% of 1,306. Each record has an ESPN grade (0-100), ranks for ranked recruits
and high-school testing (99 = not tested); no stars attribute. 29 `alternateId`s carry two records;
the measure keeps the higher grade.

Complete classes 2018-2021 (17,540 records; 91-95% carry `alternateId`; 85-99% a grade above 0),
`python projections/lanes/packages/recruits_measure.py <store> <pop_b> 2018 2019 2020 2021`, with
the 247 side reproducing `player_bio`'s join (team ids made numeric as the builder does):

| First college season | Population B rows | 247 stars (builder join) | ESPN grade (id join) | ESPN fills where 247 missing | Either |
|---|---|---|---|---|---|
| 2018 | 592 | 62.7% | 69.1% | 49.8% | 81.2% |
| 2019 | 527 | 52.6% | 57.7% | 50.8% | 76.7% |
| 2020 | 491 | 51.9% | 65.0% | 54.2% | 78.0% |
| 2021 | 467 | 55.5% | 65.3% | 45.7% | 75.8% |
| all | 2,077 | 55.9% (1,162) | 64.4% (1,337) | 460 of 915 (50.3%) | 78.1% (1,622) |

Validity: Spearman(ESPN grade, 247 stars) = 0.68 on 877 rows with both. Descriptive only (univariate,
target = drafted, not the model's hit label): on those rows AUC is 0.739 for 247 stars and 0.720 for
ESPN grade; on the 460 rows only ESPN rates, 0.628, with a drafted rate of 13.5% vs 8.6% for rows
neither source rates. Presence differs by outcome for both sources (247: drafted 66%, undrafted 54%;
ESPN 76% / 62%); an unrated walk-on is a real pre-college fact, so the gap enters as a missingness
indicator inside the fold, never as an imputed observation. Leakage: no record carries a timestamp,
so a later regrade cannot be ruled out; evidence leans against revision (5,211 records still say
Undecided and 1,080 Verbal; drafted players' records sit early in each class's id order, not late).
High-school 40 time is on file for 19% of the cohort (drafted 29%, undrafted 18%): too sparse and too
selective to use. Population B classes before about 2010 cannot carry the grade (records start with
the 2006 class).

**All complete classes, 2015-2026** (same command with those years; classes 2006-2014 still pulling):
over 4,179 population B rows with a first season 2015-2025, 247 covers 65.5%, either source 79.4%;
Spearman 0.735 on 2,167 rows with both; univariate drafted AUC 0.727 (247) vs 0.728 (ESPN) on those
rows, 0.634 on the 579 ESPN-only rows. ESPN fills little where 247 is strong (2015-2017 first
seasons: 247 75-83%, ESPN fills 14-26% of the gaps) and about half where 247 thins (2018-2021).

**Serving caveat (train-serve skew):** ESPN attaches `alternateId` late. Share of a class's records
with it: 2015-2023 classes 91-97%, 2024 54%, 2025 16%, 2026 7%. So the id join reaches the next
draft class (mostly 2022-2023 recruits) but not most underclassmen now in college. Serving later
classes needs a name + school fallback (the 247 join's rule) or the grade stays out of the young
models; training rows must use the same join the served rows get, or the feature's missingness
differs between training and serving.

**Fallback, measured** (`python projections/lanes/packages/recruit_fallback.py <store> <classes>`:
normalized name + committed ESPN team id against store rosters from the class year on, ambiguous keys
left unlinked). Not every `alternateId` is a college id: only 53-89% of a class's ids appear on any
store roster (the rest belong to transfer-portal records or players never on an ESPN-covered roster),
so the fallback is graded where the id is a real roster id: precision 94.6% (2019 class), 99.7-100%
(2021-2026); recall 74% (2019), 86-92% (2021-2026). Records it links that have no usable id: 2024
class 1,657, 2025 3,338, 2026 4,029, enough to serve the grade to current underclassmen. Recommended
join: id where it is a roster id, else the fallback, the same rule for training and serving rows.

**All 21 classes (2006-2026, 187,575 records), recommended join.** Classes before 2013 carry reissued
ESPN ids (median about 4.5M) that no store roster uses, so by id alone they join 0% of population B
rows with a first season 2006-2013; the fallback is the only route there (graded on the 2013 class:
99.2% precise; older classes have no independent id to grade against). With
`RECRUIT_FALLBACK=1 python projections/lanes/packages/recruits_measure.py <store> <pop_b> 2006 ... 2026`,
over 9,344 population B rows with a first season 2006-2025: ESPN grades 71.9% (6,721) against 247's
71.0% (6,636), either 81.6% (7,626); ESPN fills 990 of 2,708 rows 247 misses. ESPN coverage holds at
65-86% a cohort from 2007 on (2006, the first class, 33%). Spearman with 247 stars 0.75 on 5,731 rows
with both; univariate drafted AUC 0.705 (247) vs 0.711 (ESPN) on those rows, 0.636 on ESPN-only rows.
Presence by outcome now matches 247's (ESPN drafted 85%, undrafted 70%; 247 84% / 69%).

### R6. ESPN box scores give FCS seasons with ESPN ids, before 2013 too (accepted as a source, reviewed)

`python projections/lanes/packages/espn_fcs_box.py fetch|lines <season>` (ESPN site API scoreboard
`groups=81` plus one summary per completed game; the endpoints behind cfbfastR `espn_cfb_schedule` /
`espn_cfb_game_player_box`). The store's ESPN files hold FBS games only (from about 2010: 200-236
teams, 800-960 games a season; 2004: 161 teams, 699 games); this adds games involving FCS teams.
2004-2012 and 2016 pulled: 740-822 games a season, no duplicate game ids. Every game has a players
block, but 0.1-2.7% of FCS team-games a season have an empty team box (2004 2.7%, 2012 2.0%, 2016
0.4%), mostly whole-season holes for FBS-transition teams (Western Kentucky 2004-2006, FIU and FAU
2004, Old Dominion and Georgia State 2012). In 2016 per-team event counts equal stats.ncaa.org's
schedule for 118 of 121 teams; FCS playoffs, the championship and the Celebration Bowl are captured.
The same team and name appear under two ESPN ids 1-2 times a season in 2007-2012 and 20 times in
2016 (one season split into two lines). 2013-2025 pulled afterwards (813-878 games a season; 2020 has 307 because the FCS played
spring 2021 under season 2020, season types 5 and 6, which the fetcher now adds).

`python projections/lanes/packages/fcs_parity.py <season> <data lane ncaa dir> <xwalk> <nfl_outside_b.csv>`:

- **Against stats.ncaa.org, 2016, ESPN's FCS teams only** (exact school-name map after review; the
  first version's fuzzy map sent 24 of 125 FCS schools to the wrong or no NCAA team): median ESPN/NCAA
  ratio 1.00 receiving (278 of 283 players with 300+ yards joined), 1.00 rushing (276 of 278), 1.007
  passing (112 of 115); within 5%: 69%, 62%, 62%; within 10%: 81%, 73%, 79%. Most misses are on the
  NCAA side (NCAA has fewer games in 38, 34 and 15 of the 86, 105 and 43 rows outside 5%; ESPN in 28,
  14 and 6), and same-game rushing misses are mostly QBs (46 of 57: ESPN counts sacks as rushes).
- **Spot checks**: Kupp 2016 116-1,700 (published 117-1,700); Flacco 2007 4,263 (4,263); Julius Thomas
  2010 32-474 (29-453); Cohen 2016 1,434 in 11 games (1,588 in 12) and Hightower 2007 1,829 (1,924)
  each lose one game whose team box is empty.
- **Exact-id lines for the FCS NFL players** (ESPN crosswalk college id, no name join): final season
  2016 (class 2017) 9 of 11, all 3 hits (Kupp, Cohen, Tonyan). For the data lane's 54 FCS NFL players
  of the 2008-2013 classes, which its stats.ncaa.org route must leave outside B (no data before the
  2013 season): ESPN has a college id for 47 and a final-season line by that id for 38, including
  both hits (Hightower 2008, Julius Thomas 2011). By class: 2008 7 of 9, 2009 6 of 11, 2010 9 of 10,
  2011 6 of 8, 2012 6 of 10, 2013 4 of 6. A line by id can be a few games (Mahaffey 2, Lawrence 3).
  Of the 16 misses, 6 were not FCS in their last season (Abilene Christian before 2013, Henderson
  State, Tarleton), 1 played defense, 2 have box lines under a different ESPN id than the crosswalk
  gives (Sorensen, Vaughan), 3 have lines but no crosswalk id (Bomar, Sherry, Shields), and 4 have
  their last line before draft year minus 1. With a name + team fallback, all 47 FCS offensive players
  have a last-season line.
- **Source caveat**: the store's FBS season lines are ESPN play-by-play aggregates. The data lane
  inferred they run 2-5% low (stats.ncaa.org play-by-play over ESPN play-by-play, FBS 2013-2019 medians
  1.021 receiving, 1.050 rushing); measured directly against `cfb_player_box`, the store's lines run
  6-12% below box totals (median 0.93 receiving and 0.88-0.94 rushing, 2010 and 2016). These FCS lines
  are box totals, so FCS and FBS rows need one counting basis before they are scored together.
- **Population sizing** (`python projections/lanes/packages/fcs_population.py <xwalk> <nfl_outside_b.csv>`;
  ESPN's FCS teams, career = one ESPN id, 20+ rushes, receptions or pass attempts, exit = last season
  with a line, 649 careers that continue at an FBS school dropped): classes 2008-2023 add 8,680 FCS
  exits (518-621 a class), 342 linked by id to an nflverse QB/RB/WR/TE/FB (any NFL roster, not only
  game players), 67 drafted, 12 hits under the data lane's labels. Class 2020 (791) and 2021 (40) are
  distorted by the spring 2021 season (players who skipped it exit a year early); class 2026 is not
  usable until the 2026 season is pulled (its "exits" include players still in school). Positions
  are not in box scores: infer from usage as population B already does before 2014.
- **Outcome dependence**: usable-box coverage for teams that produced NFL players (flagged from
  neighbouring seasons) vs the rest: 98.9% vs 98.3% (2005), 98.9% vs 98.8% (2007), 99.9% vs 99.5%
  (2011), 96.2% vs 99.9% (2012, Old Dominion and Georgia State); no consistent sign. The real risk is
  the population definition: a whole-season hole moves a player's exit back a year or drops him.

## Integration recommendations (for the coordinator; nothing applied to shared code)

1. **ESPN crosswalk as link step 1, with the R4 guards.** Snapshot
   `<scratch>/snapshots/espn_nfl_college_xwalk.parquet` (3,432 rows, sha256 prefix `eab2eccd7748`;
   raw records `<scratch>/espn_nfl_athletes/`). After eff88be the two mislabeled hits are already
   fixed; the remaining measured delta is 3 drafted profiles (Gilyard, Fuller, Green-Beckham), 49
   population B links to NFL players (11 drafted, 38 undrafted; no labeled hit), Corey Brown's link moved to
   b534284 and Natson's two rows merged. Labels do not change, so served backtests need a rerun only
   if the undrafted links feed a feature. Also usable as a regression check: any future name-join
   change can be graded against it in one command.
2. **ESPN recruit grade as a second recruiting source (R5).** Snapshots `espn_recruits_<class>.parquet`
   (2018-2021 written; the rest pulling, resumable). Table `cfb_recruit_espn` keyed by `recruit_id`,
   joined on `athlete_id = player_id`. Candidate (needs preregistration before scoring): `espn_grade`
   plus `espn_missing` next to 247 stars, in a "fill 247 nulls" and a "second opinion" form.
3. **ESPN FCS box-score lines (R6)** as the FCS source for seasons before 2013 and as the id layer for
   the data lane's stats.ncaa.org lines after; decide one counting basis for FBS and FCS first.
   Before use: keep only FCS teams' lines (the pull also holds FBS and Division II opponents'
   one-game lines); flag team-seasons with empty boxes; bridge crosswalk ids with name + team; take
   the exit season from the last season on file, not draft year minus 1; put QB rushing on one sack
   basis.
4. **`prospect_db`**: a `local` base in `SOURCES` reading a snapshot directory instead of `bpp.fetch`,
   same sha256 / `source_file` bookkeeping. Licence string: "ESPN APIs (undocumented, key-free;
   endpoints used by cfbfastR/sportsdataverse); ESPN terms; local research use only".
5. **No change** for nflreadpy (R1), CFBD positions (R2), ESPN college DOB (R3), sportsdataverse-py,
   ncaa_stats_py, CFBD clients. Not tested: sportsdataverse-py's 47 `sports247_*` and 82 `on3_*`
   wrappers over 247Sports' and On3's live site APIs; nobody has read those sites' terms here, and
   247 data already reaches the store through `cfb_recruits`.
