# Football data-loader packages: source, coverage, licence, auth, maintenance

Packages lane, checked 2026-10-04 (PyPI JSON API, GitHub repo API, package source files). A package
licence covers the code, never the upstream data. Two loaders that read the same upstream are one
source, not two. "Key" means an API key or account; this project uses none.

## Matrix

| Loader (version, last release) | Maintained? | Upstream data | Coverage that matters here | Ids / join | Auth | Code licence / data terms | Disposition |
|---|---|---|---|---|---|---|---|
| **nflreadpy** 0.1.5 (PyPI 2025-11-19; repo pushed 2026-09-09) | yes, official nflverse Python loader, Beta | nflverse-data GitHub releases (same assets the builder already GETs), DynastyProcess `files/`, ffopportunity releases, espnscrapeR-data | draft picks, players (DOB), combine, rosters, player stats, snap counts (PFR, 2012+), contracts (OTC), FF player ids | gsis, pfr, espn (NFL), plus every fantasy id via `load_ff_playerids` | none | MIT code; nflverse-data CC-BY-4.0; DynastyProcess repo GPL-3.0 | **Redundant for every table the store loads** (same URL, same bytes; the builder already sha256-tracks them). Adds polars + pydantic for no data gain. Use only if a new nflverse table is needed (none closes a pre-draft gap). |
| nfl_data_py 0.3.3 (2024-09-20) | **archived 2025-09-25** (superseded by nflreadpy) | nflverse | as nflreadpy | as nflreadpy | none | MIT | **Rejected**: archived; pins `pandas<2, numpy<2`, incompatible with the installed pandas 3.0.2. |
| nflreadr (R) | yes (pushed 2026-09-17) | nflverse | as nflreadpy | as nflreadpy | none | licence NOASSERTION on GitHub | **Not needed**: no R on this machine; same upstream as nflreadpy. |
| **cfbfastR** 3.0.0.9000 (R; repo pushed 2026-10-01) | yes | three families: (a) sportsdataverse-data releases (`load_*`), (b) ESPN APIs live (`espn_cfb_*`), (c) CFBD API (`cfbd_*`) | (a) same releases the store loads plus ones it does not; (b) ESPN recruiting, athlete records, per-player stats incl. FCS; (c) CFBD | ESPN athlete id throughout (a, b) | (a, b) none; (c) **CFBD key** | MIT + file; ESPN data under ESPN terms; CFBD terms | **Reused as the endpoint/URL reference** (no R here): its documented endpoints are called from Python with plain GETs, parsing only the fields its own functions read. `cfbd_*` and `load_cfb_rosters()` (wraps `cfbd_team_roster`) are key-blocked. |
| sportsdataverse-py 0.1.4 (PyPI 2026-09-01; repo pushed 2026-10-04) | yes, Alpha | sportsdataverse-data releases + ESPN APIs | cfb release loaders and ESPN helpers | ESPN ids | none | MIT code | **Redundant** with the release files the store already GETs; heavy deps (polars, pyjanitor, scipy, matplotlib, scikit-learn pins). Installed in the lane venv (0.1.4): 24 `cfb_*`, 47 `load_*`, 125 `espn_*`, 47 `sports247_*`, 82 `on3_*`, 12 `fox_*`, 7 `yahoo_*` cfb callables; none reaches data the tests below needed beyond plain GETs. |
| cfbfastR-data repo (committed `rosters/`, `player_stats/`, `data/`) | yes, CFBD-derived datasets "still updated daily" (README) | CFBD (collegefootballdata.com) | rosters 2004-2026 with real positions before 2014, home town, CFBD `recruit_ids`; player season stats 2014-2026 | ESPN athlete id (CFBD-only players negative) | none for these committed files | **no licence file**; CFBD data | **Rejected** for positions (R2: worse than the current inference against NFL positions); its `recruit_ids` match 0 store recruits. |
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

Scratch for every number below: `C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp\` (store copy taken
2026-10-04T07:35Z via the SQLite backup API; population B snapshot `pop_b.parquet` copied from the
data-gaps lane, sha256 `14a8f064...0fce`; `nfl_outside_b.csv` sha256 `06dd09f9...8963`).

### R1. nflreadpy is byte-for-byte redundant (verified)

`<venv>/python projections/lanes/packages/nflreadpy_parity.py <store copy>` (nflreadpy 0.1.5,
polars 1.44.2): `load_draft_picks` 12,927 rows vs 12,927 in the store, 0 rows only on either side,
0 value differences in gsis_id/pfr id/position/college; `load_players` 24,844 vs 24,844, 0 diffs in
birth_date/espn_id/pfr_id/college; `load_combine` 8,968 vs 8,968, forty present 8,039 both.
`load_ff_playerids` (DynastyProcess, 12,518 rows, current snapshot only, `db_season` 2026) fills 0
missing nflverse birth dates and holds 0 pre-draft QB/RB/WR/TE with a DOB. **Verdict: keep the
builder's thin GETs; nflreadpy adds a dependency and no data.**

### R2. CFBD-derived roster positions lose to the current inference (rejected)

`python projections/lanes/packages/cfbd_rosters.py <pop_b> <store copy>` (cfbfastR-data
`rosters/parquet`, 2004-2019). CFBD positions exist for 95-98% of population B rows in classes
2010-2014 (0.6% for 2008, 5.5% for 2009: CFBD carries almost no positive ESPN ids before 2009) and
agree with the inferred position on 82% (2,146 of 2,589). Graded against the NFL draft/roster
position of the players who reached the NFL: pre-2014, inference 94.2% vs CFBD 88.7% (n=538; of 65
disagreements inference is right 46, CFBD 16); 2016-2020, ESPN's own position 96.8% vs CFBD 93.1%
(n=793). CFBD `recruit_ids` match 0 of 16,171 `cfb_recruit.recruit_id` values (different id systems,
as the store already found for ESPN's copy). **Verdict: no gain; keep the inference.**

### R3. ESPN college athlete DOB is outcome-revealing (leakage; rejected for pre-draft use)

`python projections/lanes/packages/espn_dob_probe.py <pop_b> 8` (360 population B players, 8 per
class x outcome group, classes 2012-2026). DOB present: 2018-2022 drafted 98%, undrafted with an NFL
roster 88%, neither 5%; 2023-2026 100% / 100% / 12%; 2012-2017 46% / 31% / 19%. Every drafted and
UDFA record carries a `proAthlete` link; ESPN fills the DOB when the player turns pro. The earlier
"ESPN DOB is null for college players" finding holds for players who never reach the NFL, and a
DOB's presence predicts the label. **Verdict: never a pre-draft feature or age input; nflverse
already supplies DOB post-draft.**

### R4. ESPN's NFL-to-college crosswalk validates the joins and fixes two mislabeled hits (accepted for review)

`python projections/lanes/packages/espn_nfl_college_xwalk.py <store copy>` then
`python projections/lanes/packages/xwalk_measure.py <store copy> <xwalk> <pop_b> <nfl_outside_b.csv>`.
3,432 nflverse QB/RB/WR/TE/FB (rookie or draft year 2008-2026, with an `espn_id`) fetched; 3,431
records, 3,343 carry `collegeAthlete`; no college id maps to two NFL players.

- **Drafted links** (builder run 20261004T064925): name + school links agree with ESPN on 693 of
  694 where ESPN has a link (619/620 for 2008-2016, 74/74 for 2017-2026); id links 690/690. The one
  conflict (Kevin O'Connell) is ESPN's error: its college id 479818 is an empty duplicate record,
  the store's 147785 holds his 2007 San Diego State season. ESPN links 98 of the 110 unlinked
  draftees; 11 of those have FBS stat seasons before their draft (Stevie Johnson, Beanie Wells, Mardy
  Gilyard, Corey Fuller, Dorial Green-Beckham, Bryce Brown, Taylor Thompson; Joe Flacco, Rashad
  Jennings, B.J. Coleman, Beau Sandland only before an FCS transfer). The rest are FCS careers.
- **Population B**: 2,645 rows agree, 0 conflicts. 85 rows carry no NFL id while ESPN links their
  college id to an NFL player; 52 of those played NFL games, and **2 are hits labeled as misses**:
  Stevie Johnson (WR, class 2008, drafted round 7) and Beanie Wells (RB, class 2009, round 1). Both
  are nickname failures (Steve/Stevie, Chris/Beanie). Two more rows are split identities (one person,
  two ESPN college ids: Philly/Corey Brown, Bruce/JoJo Natson), each counted once as a linked UDFA
  and once as an unlinked exit. Of the other 48 (Marcel Reece 94 games, Andrew Hawkins 73, Dontrelle
  Inman 63, ...), 37 are labeled non-hits by the data lane's outcome file and 11 carry no label
  there because the NFL lists them at FB or the class is 2007 (Peyton Hillis 75 games, Zach Line,
  Derrick Coleman); their label depends on the builder's FB rule, not on this crosswalk.
- Population B carries 2,898 NFL links; none has an NFL career starting before the class year.
- **Verdict**: use ESPN's crosswalk as the first link step (id), keeping the name join as fallback
  and refusing an ESPN id whose college record has no rows (the O'Connell case). Measured effect: +2
  positive labels in B (classes 2008-2009), +11 drafted college profiles in A, 48 UDFA links, 2
  duplicate exits removable. Independent review pending.

### R5. ESPN recruiting grades join by id and lift recruiting coverage (in progress)

ESPN recruit records (`espn_recruits.py`, cfbfastR `espn_cfb_recruits` endpoint) exist for classes
2006-2026 (0 records 2002-2005; 3,242 to 18,881 a class). `athlete.alternateId` is the ESPN college
athlete id (checked by hand on Grant Abbott 4426520 and Damir Abdullah 4683911). Each record has an
ESPN grade (0-100), position/state/region ranks for ranked recruits, and real high-school testing
(2019: 40-yard dash on 1,535 of 4,638, shuttle 1,802, vertical 1,793; 99 = not tested). No stars
attribute. Complete classes 2018-2021 (17,540 records; 92-95% carry `alternateId`; 85-99% a grade
above 0), `python projections/lanes/packages/recruits_measure.py <store> <pop_b> 2018 2019 2020 2021`:

| First college season | Population B rows | 247 stars (builder join) | ESPN grade (id join) | ESPN fills where 247 missing | Either |
|---|---|---|---|---|---|
| 2018 | 592 | 60.1% | 69.1% | 52.1% | 80.9% |
| 2019 | 527 | 50.3% | 57.7% | 50.4% | 75.3% |
| 2020 | 491 | 49.5% | 65.0% | 54.4% | 77.0% |
| 2021 | 467 | 49.9% | 65.3% | 44.0% | 71.9% |
| all | 2,077 | 52.8% | 64.4% | 493 of 980 (50.3%) | 76.6% |

Validity: Spearman(ESPN grade, 247 stars) = 0.68 on 844 rows with both. Descriptive only (not a
model test; univariate, target = drafted, not the model's hit label): on those 844 rows AUC is 0.744
for 247 stars and 0.724 for ESPN grade; on the 493 rows only ESPN grades, 0.626, and their drafted
rate is 12.6% vs 8.2% for rows neither source rates. Presence differs by outcome for both sources
(247: drafted 66%, undrafted 51%; ESPN: 76% / 62%). Unrated walk-ons are a real pre-college fact, so
this is legitimate missingness, but it must enter as an indicator inside the fold, never be imputed
as observed. High-school 40 time on file for 19% of the cohort (drafted 29%, undrafted 18%; QB 34%,
RB 20%, WR 17%, TE 16%): too sparse and too selective for a feature now; recorded as a disposition.
Coverage history: ESPN recruit records start with the 2006 class (0 for 2002-2005), so population B
classes before about 2010 cannot carry the grade; a model using it needs the training window or a
missingness indicator chosen before scoring.
**Verdict: accepted as a source for review; whether it improves the model is a coordinator
experiment under the charter (registered before scoring).**

## Integration recommendations (for the coordinator; nothing applied to shared code)

1. **ESPN NFL-to-college crosswalk as link step 1 (R4).** Snapshot
   `<scratch>/snapshots/espn_nfl_college_xwalk.parquet` (3,432 rows, sha256 prefix `eab2eccd7748`;
   raw records in `<scratch>/espn_nfl_athletes/`). In the builder's drafted link and in
   `prospect_population`'s undrafted link: take `college_athlete_id` when that id has roster or stat
   rows in the store and the career ends before the draft year; else fall through to the existing id
   and name joins. Expected, measured on the current store: +2 positive labels in B (Stevie Johnson,
   Beanie Wells), +11 drafted college profiles in A (7 with FBS final seasons), 48 more UDFA links in
   B, 2 split-identity duplicates merged. It supersedes the data lane's nickname-table patch for the
   same two players (that patch fixes only those two). Re-run every served backtest after the label
   change: the two new hits move class 2008/2009 base rates.
2. **ESPN recruit grade as a second recruiting source (R5).** Snapshots
   `espn_recruits_<class>.parquet` (2018-2021 done; 2006-2017 and 2022-2026 pulling, resumable).
   Ingest as table `cfb_recruit_espn` keyed by `recruit_id`, joined to careers on
   `athlete_id = player_id`. Candidate feature (needs preregistration): `espn_grade` plus
   `espn_missing`, alongside 247 stars; test both "fill 247 nulls" and "second opinion" forms.
3. **`prospect_db` change needed for both**: a `local` base in `SOURCES` that reads a snapshot dir
   instead of `bpp.fetch`, keeping the same sha256 / `source_file` bookkeeping. Licence string:
   "ESPN core API (undocumented, key-free; endpoint used by cfbfastR/sportsdataverse); ESPN terms;
   local research use only".
4. **No change** for nflreadpy (R1), CFBD positions (R2), ESPN college DOB (R3, corroborates the data
   lane's DOB leakage finding by a second endpoint), sportsdataverse-py, ncaa_stats_py, CFBD clients.
5. Not tested: sportsdataverse-py 0.1.4 ships 47 `sports247_*` and 82 `on3_*` wrappers over
   247Sports' and On3's internal site APIs (recruiting, offers, transfer portal). These are live
   site APIs, not published releases, and this lane did not check either site's terms; left alone
   until someone reads those terms. 247 data already reaches the store through `cfb_recruits`.
