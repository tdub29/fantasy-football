# Data lane results: coverage gaps

Lane `data`, 2026-10-04. Every number below was measured in this lane on a copy of the store
(scratch `C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data\`), never the shared store.
Scripts: `projections/lanes/data/`. Machine-readable: `results.json`.

| # | Gap | Disposition | One-line evidence |
|---|---|---|---|
| 1 | FCS player season stats | **usable, 2013+ only** (FBS + FCS; D2/D3 unavailable) | stats.ncaa.org play-by-play republished by sportsdataverse; 95 of the 109 FCS NFL players from the 2014-2023 classes join to a final-season line, all 8 of their hits |
| 2 | Real college birth dates | **unavailable (leakage)** | every key-free date is filled because the player reached the NFL: ESPN college roster DOB 97% drafted vs 7% never-NFL (2018-22 classes) |
| 3 | Pro-day testing after 2019 | **unavailable** | no licensed bulk source; ESPN's `speed` is not a measured time (35% exact vs combine) and is empty from the 2023 class |
| 4 | Pre-draft consensus rank | **FantasyPros: terms forbid + too sparse; ESPN Scouts Inc grade: deferred (best lead)** | FP rookie ECR 8 pre-draft classes 2019-2026, 5 mature (RB/WR); ESPN grade on 97-100% of drafted skill players 2008-2017, rank vs pick Spearman 0.72-0.89 |
| 5 | College injury, transfer, redshirt history | **injury unavailable; transfer and sit-out years usable at season grain** | transfers from the store's ESPN rosters (spot checks right); NCAA rosters give games played per season (21.5% of joined 2014-2026 exits have a 0-game season) |

## 1. FCS and lower-division players

### What is missing from population B today (measured)

`nfl_outside_b.py` builds population B exactly as `prospect_population.build` does, then lists every
NFL QB/RB/WR/TE from the 2008-2023 classes (drafted, or undrafted with an NFL game) that B does not
contain, by the division of his last college (ESPN roster `division` column by season, plus the
stats.ncaa.org team table):

| Outside B, last college | Players | Drafted | Undrafted | Hits | Hits drafted |
|---|---|---|---|---|---|
| FCS | 163 | 70 | 93 | 10 | 7 |
| D2 / D3 / NAIA / JUCO / alias misses ("other") | 121 | 17 | 104 | 4 | 1 |
| FBS (join or qualifying-season misses) | 90 | 21 | 69 | 3 | 2 |

Hits outside B: FCS Tim Hightower 2008, Julius Thomas 2011, Cameron Brate 2014, David Johnson 2015,
Carson Wentz 2016, Cooper Kupp 2017, Robert Tonyan 2017, Tarik Cohen 2017, Dallas Goedert 2018,
James Robinson 2020; lower division Victor Cruz 2010 (UMass, FCS in his era, an alias miss here),
Cecil Shorts 2011 (D3), Tyrell Williams 2015 (D2), Austin Ekeler 2017 (D2); FBS Stevie Johnson 2008
(Kentucky), Beanie Wells 2009 (Ohio State), Isaiah Crowell 2014 (Georgia, then FCS Alabama State).
Side finding for the coordinator: Stevie Johnson and Beanie Wells are FBS hits missing from B (likely
"Steve Johnson" / "Chris Wells" name variants), a join gap, not a coverage gap.

### Source found: `ncaa_mfb_*` releases (stats.ncaa.org, FBS + FCS)

| Field | Value |
|---|---|
| URL | `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/<tag>/<tag>_<season>.parquet`, tags `ncaa_mfb_pbp_cfbfastr`, `ncaa_mfb_rosters`, `ncaa_mfb_teams` (also `ncaa_mfb_player_stats`, `ncaa_mfb_schedule`) |
| Access | plain GET, no key, no account (same host as every college file in the store) |
| Producer | `sportsdataverse/ncaa-mfb-football-raw` (capture, FBS and FCS) then `ncaa-mfb-football-data` (build); both repos carry no licence file (GitHub licence API: none) |
| Licence / terms | sportsdataverse-data repo MIT (verified). Underlying data: NCAA.org Terms of Service (fetched 2026-10-04): NCAA owns or licenses "statistics"; download "only for your personal, non-commercial use"; no reproduction or republishing "for public or commercial purposes"; no "scraping, or harvesting ... or ... unauthorized automated means". stats.ncaa.org itself refuses robots.txt (Akamai 403). Reading the sportsdataverse release is not scraping NCAA, but the NCAA terms still govern the statistics: local model training is inside "personal, non-commercial"; publishing raw FCS stat lines on a public page is not. Same posture as the ESPN college feed already in use |
| History | seasons 2013-2026 (release note: "stats.ncaa.org publishes no football box scores or play-by-play before" fall 2013). D1 only: 128-138 FBS and 123-130 FCS teams a season. No D2/D3 |
| Grain | play-by-play (`game_id`, `id_play`, unique on 2016 and 2024); roster one row per (season, team_id, player_id), unique |
| Ids | stats.ncaa.org issues new team and player ids every season (Kupp: 4239984, 4553567, 4947318, 5076140), so careers chain on (team name, last name, first initial). `espn_game_id` fills 96% (2016) to 98% (2024) of games. No ESPN athlete id, no NFL id |
| `ncaa_mfb_player_stats` | box-score stat columns only from 2020; 2013-2019 rows are name/position only. Used here only to grade the play-by-play |
| Rosters | position 97-100%, class (Fr/So/Jr/Sr) 100%, games played 100%; height and weight 0% before 2023, about 90% from 2023 |
| Availability at prediction time | a season's plays and roster are complete when the season ends, before the next draft. Files are regenerated by current code (no vintage), like `cfb_ratings` |
| Leakage risk | low: no NFL or draft field in any file. The name join to NFL players uses the NFL side only to attach labels, as B already does |

### Building player-season lines (measured quality)

The file's own name columns are mostly empty (receiver 19% filled in 2016) and its reshaped flags
mislabel whole games (Eastern Washington 2016: every completion typed "Pass Incompletion", completion
false, yards null). `ncaa_pbp_stats.py` therefore parses everything from `play_text`: carrier, passer,
target, yards, completion, touchdown, interception; strips clock stamps and formation prefixes
("No Huddle-Shotgun", "NHSG,"); drops NO PLAY rows and conversion tries; keys a player by (team,
last name, first initial). 1-4% of plays carry a bare surname shared by two players on the team and
are dropped. Sacks are excluded from rushing, as in the store's ESPN lines.

Graded against stats.ncaa.org's own box-score season totals, 2020-2025 (`ncaa_validate.py`; median
over the six seasons; QB rushing excluded because NCAA box scores count sacks as rushes):

| | Name join rate | Median ratio | Within 5% | Within 10% |
|---|---|---|---|---|
| FBS rushing yards (non-QB, 50+ att) | 0.77 | 1.000 | 0.86 | 0.89 |
| FCS rushing yards | 0.74 | 1.000 | 0.84 | 0.89 |
| FBS receiving yards (20+ rec) | 0.84 | 1.000 | 0.89 | 0.92 |
| FCS receiving yards | 0.81 | 1.000 | 0.84 | 0.88 |
| FBS passing yards (100+ att) | 0.66 | 1.000 | 0.80 | 0.81 |
| FCS passing yards | 0.64 | 1.000 | 0.79 | 0.82 |

The join rate is the validation join (box names vs play-text names), not lost data. Spot checks
before 2020 against published totals: Dallas Goedert 2016 92-1,293-11 (exact), JuJu Smith-Schuster
2016 70-914-10 (exact), Corey Davis 2016 96-1,485-19 (published 97-1,500-19), Cooper Kupp 2016
115-1,670-15 (117-1,700-17), Tarik Cohen 2016 1,500 rushing yards (1,588), Sam Darnold 2016
244 of 364, 3,032 (246 of 366, 3,086).

**Source shift vs the store's ESPN FBS lines** (`ncaa_vs_espn.py`, same FBS player and season,
2013-2019 medians): the stats.ncaa.org lines run higher than ESPN's, median ratio 1.021 for receiving
yards and 1.050 for rushing yards; only 43% / 37% agree within 5%. Since stats.ncaa.org matches its
own box scores at 1.000, ESPN's play-by-play is the low one (missing plays). Mixing sources (FBS from
ESPN, FCS from stats.ncaa.org) would give FCS rows counting stats about 2-5% high; share features
(player / team totals from the same feed) mostly cancel it. The coordinator must test this shift
before any FCS row is scored next to ESPN rows.

### What it adds (measured)

| | Count |
|---|---|
| FCS NFL players outside B, 2008-2023 classes | 163 (70 drafted, 93 undrafted), 10 hits |
| with a final college season in 2013+ (classes 2014-2023) | 109, 8 hits |
| joined to an NCAA roster row (name + school) | 103 |
| joined to a final-season play-by-play line | **95 (87%), 37 drafted, all 8 hits** |
| not joined | 14: mostly transfers whose last season was elsewhere (Wes Hills, Ishmael Hyman), plus name variants |
| classes 2008-2013 (no NCAA data) | 54 players, 2 hits (Hightower, Julius Thomas): stay outside |

FCS exits a class (QB/RB/WR/TE roster position, last season on an FCS roster, 20+ carries, targets or
attempts, careers chained by team + name so a transfer starts a new chain):

| Class | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FCS exits | 392 | 558 | 544 | 630 | 563 | 614 | 703 | 293 | 700 | 765 | 766 | 863 | 968 |

(2021 is the spring-2021 COVID season; 2024+ counts include FCS-to-FBS portal transfers, which the
chain counts as exits: an overcount to fix in the ingest by linking chains across teams.)

So the release would roughly double population B from the 2014 class on (about 550-750 FCS exits a
class against about 520-550 FBS), adding 37 drafted players, about 58 undrafted NFL players and 8
hits over the ten mature classes 2014-2023. D2/D3/NAIA hits (Ekeler, Thielen-type, Shorts,
Tyrell Williams) stay outside: no key-free source, and scraping stats.ncaa.org ourselves would
breach its terms.

### Proposed SOURCES entries (for the coordinator; not applied)

```python
LIC["ncaa"] = ("sportsdataverse-data: LICENSE MIT; stats.ncaa.org data under NCAA.org Terms of Service "
               "(personal non-commercial use; no public republication of the statistics)")
SOURCES.update({
    "ncaa_team": ("ncaa", SDV, "ncaa_mfb_teams", "ncaa_mfb_teams_{y}.parquet", (2013, SEASON),
                  ["season", "team_id", "team_name", "division", "academic_year"], ["season", "team_id"]),
    "ncaa_roster": ("ncaa", SDV, "ncaa_mfb_rosters", "ncaa_mfb_rosters_{y}.parquet", (2013, SEASON),
                    ["season", "team_id", "team_name", "player_id", "player_name", "jersey", "player_class",
                     "position", "height", "weight", "games_played", "games_started"], ["season", "team_id", "player_id"]),
    "ncaa_pbp": ("ncaa", SDV, "ncaa_mfb_pbp_cfbfastr", "ncaa_mfb_pbp_cfbfastr_{y}.parquet", (2013, SEASON),
                 ["season", "game_id", "id_play", "espn_game_id", "week", "pos_team", "def_pos_team", "play_type",
                  "play_text", "yards_gained"], ["game_id", "id_play"]),
})
```

Size: 14 pbp files, 20-26 MB each as parquet (about 300,000 plays a season, about 4.2 million rows);
`play_text` dominates the SQLite footprint. Also add `division` to the `cfb_roster` columns (ESPN
roster files carry fbs/fcs per team-season; this lane needed it to classify colleges).

### Ingest plan

1. Add the three entries; `python projections/prospect_db.py ingest` (idempotent per file, as now).
2. Derived table `ncaa_player_season` from `ncaa_pbp` with the parser in
   `projections/lanes/data/ncaa_pbp_stats.py` (move it into a shared module; its `_check()` holds the
   format cases), one row per (season, team, last, first initial) with team pass attempts and games.
3. Population B extension: FCS careers chained by team + name key, linked across teams by name +
   class progression (roster `player_class`) so portal transfers do not count as exits; position
   from the NCAA roster; qualifying season and QB-start rules as in B; `src = 'ncaa'` and
   `div = 'FCS'` on every row.
4. NFL labels: name key + school match after expanding stats.ncaa.org short names (`skey` in
   `fcs_measure.py`: "Eastern Wash.", "UNI", "N.C. A&T"); a drafted player additionally by
   `nfl_draft_pick.college`. Measured: 95 of 109 joined.
5. Before any FCS row is scored: the shift test above (FBS-from-ESPN vs FCS-from-NCAA), and a
   calibration check on FCS rows alone (hit base rate is far lower: 8 hits in 5,762 FCS exits
   2014-2023, against about 15 a class in FBS).
6. Do not show raw FCS stat lines on the site (NCAA terms); model outputs only.

## 2. Real birth dates for college players

**Disposition: unavailable (every key-free source is leakage through its missingness).** Keep the
estimated age. Measured:

| Source | Licence / access | Coverage, measured | Problem |
|---|---|---|---|
| ESPN college rosters `date_of_birth` (already in the store) | ESPN terms, via sportsdataverse | population B, share with a date: 2008-12 classes drafted 85%, undrafted NFL 83%, never-NFL 78%; 2013-17: 56% / 26% / 9%; 2018-22: 97% / 79% / 7%; 2023-26: 100% / 99% / 10% | From 2013 the date is filled when the player reaches the NFL (ESPN merged college and NFL ids from about 2017). The field, and its presence, encode the outcome. Only 2008-2012 is balanced, and the current classes have almost none (train-serve skew) |
| ESPN NFL athlete record behind the draft-prospect entry (`.../athletes/<id>`) | ESPN terms, key-free core API | 97 undrafted prospects sampled (2012, 2016, 2019, 2021, 2022 classes): date present for 29 of 43 who later reached the NFL (67%) vs 10 of 54 who never did (19%) | same leak; no vintage shows the date existed before the draft |
| Wikidata (P569 birth date) | CC0, key-free SPARQL | P7262 (ESPN college id) on only 119 items; P3697 (Sports Reference CFB id) on 5,230 items, 3,805 dated; 2,586 born 1985-2006, 573 of them without a PFR id. Population B 2008-2026 has 7,337 never-NFL players: at most 7.8% reachable | items exist because a player became notable; joins to ESPN ids need a name match for all but 119 |
| stats.ncaa.org rosters (`ncaa_mfb_rosters`) | NCAA terms | no birth-date field | none to use |
| FantasyPros rookie pages `Age` column (DynastyProcess archive) | FantasyPros terms (section 4) | ranked rookies only: 73-147 QB/RB/WR/TE a class, 2019-2026 | only the prospects experts already rank, mostly future draftees |
| Sports Reference / College Football Reference | terms bar bots and competing databases (registry) | n/a | restricted |

Side warning for the coordinator: any feature built on `cfb_roster.date_of_birth` (or its presence)
after 2012 leaks the outcome. The current model already avoids it (estimated age everywhere,
`draft_age_real` post-draft only); keep it that way.

## 3. Pro-day testing after 2019

**Disposition: unavailable.** Measured:

- **ESPN draft-prospect `speed`** (key-free core API, `seasons/<y>/draft/athletes/<id>`). On 497 drafted
  QB/RB/WR/TE 2008-2017 with an nflverse combine forty: correlation 0.961, but exact (within 0.005)
  for only 35% and within 0.02 for 49%, mean +0.024 s. On 55 who skipped the combine and have a RAS
  archive pro-day forty: correlation 0.81, median gap 0.05 s, 11% exact. So it is a scouting-service
  time (often a pre-combine estimate), not a measured pro-day result. And it stops: present for
  85-100% of sampled prospects 2008-2013 and 2016-2021, 40% 2014, 18% 2015, 62% 2022, **0% of the
  40 sampled in each of 2023-2026**. Using it would recreate the RAS train-serve skew three years later.
  Arm and hand length (same record): 25-98% 2010-2022, 0% from 2023.
- **ras.football**: answered HTTP 429; no bulk download or API found; terms unverified. The only bulk
  copy (DynastyProcess `files/archives/RAS`, GPL-3.0 repo) ends with the 2019 draft (registry).
- **nflverse `combine`** (Pro Football Reference): combine invitees only; forty coverage on drafted
  skill players falls from 62-78% (2008-2017) to 38-52% (2021-2026) (`data-coverage.md`).
- **School pro-day pages and media trackers** (CBS, Steelers Depot spreadsheets, team sites): one page
  per school or season, copyright of each publisher, no licence; scraping them is out of scope.
- Closure route: none key-free today. Revisit if nflverse adds pro-day rows or RAS publishes a licensed export.

## 4. Pre-draft consensus rank

**FantasyPros rookie ECR: terms forbid reuse beyond a personal copy, and too few mature classes.**

| Field | Value |
|---|---|
| Source | DynastyProcess `files/db_fpecr.parquet` (`page_type = dynasty-rk`, scrapes 2020-10-16 to 2026-10-02) plus `files/archives/fantasypros/rookies-<date>.csv` (65 weekly files, 2018-11-18 to 2020-04-21) |
| Terms | FantasyPros Terms of Use (fetched 2026-10-04, effective July 1, 2010): "Except for a single copy made for personal use only, you may not copy, reproduce, modify, republish, upload, post, transmit, or distribute any documents or information from this site"; no commercial use. DynastyProcess's GPL-3.0 covers its code, not FantasyPros' rankings |
| Pre-draft classes | 2019 (last scrape 2019-04-23, 73 QB/RB/WR/TE), 2020 (2020-04-21, 93), 2021 (2021-04-28, 85), 2022 (2022-04-22, 108), 2023 (2023-04-21, 92), 2024 (2024-04-19, 147), 2025 (2025-04-11, 124), 2026 (2026-04-17, 120); 15-16 dated pre-draft scrapes a class from 2021 |
| Mature classes | RB/WR 2019-2023 (5), QB/TE 2019-2022 (4): too few to pass the charter's season resampling |
| Timestamp | `scrape_date` per row: legal as of any date |
| Leakage | none in the pre-draft scrapes; post-draft scrapes embed capital |

**Better lead found: ESPN Scouts Inc grade and rank** (key-free; site API
`site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=<y>` for picks, core API
`.../seasons/<y>/draft/athletes` for every prospect: 346-5,483 a class, 2006-2026).

| Field | Value |
|---|---|
| Coverage, drafted QB/RB/WR/TE | grade on 97-100% of picks 2008-2017 (fetched so far), overall rank on 43-94% |
| Coverage, all prospects (40 sampled a class) | grade and position rank 85-100% for 2008-2013, 2016-2022; 40% 2014; 18% 2015; **0% 2023**; 28% 2024-2025; 100% 2026 |
| Timing check | overall rank vs actual pick, Spearman 0.72-0.89 by class (2008-2017): a real pre-draft board, not rewritten to match the draft (Kyler Murray: rank 9, picked 1) |
| Terms | ESPN terms (Scouts Inc grades were ESPN Insider content); same ESPN posture as the college feed; local use only, never shown on the site |
| Leakage | no vintage stamp; records also carry `pick` and post-draft text, which must never be read as features |
| Closure route | full pull of the prospect lists (about 25,000 records 2008-2026, polite sequential GETs), then coverage by class for undrafted prospects, and a Wayback Machine check of a few archived pre-draft ESPN boards against the API values. The 2023-2025 holes are a train-serve risk to measure before any test |

## 5. College injury, transfer and redshirt history

**Injury: unavailable.** `espn_cfb_injuries` (sportsdataverse, daily snapshot of ESPN's current
report) holds 93 rows for 3 teams over 31 days of 2026: no history. ESPN's Scouts Inc
`durability` grade (section 4 records) is on 0-48% of prospects 2008-2018, 72-95% 2019-2022 and 0%
from 2023: sparse and stopped. No dated public college injury log was found.

**Transfers: usable at season grain from data the store already holds.** The same ESPN college id
on a new `team_id` in a later season (ESPN keeps one id through a transfer). Spot checks right:
Burrow (Ohio State to LSU 2018), Hurts (Alabama to Oklahoma 2019), Mayfield (Texas Tech to Oklahoma
2014), Wilson (NC State to Wisconsin 2011), Murray (Texas A&M to Oklahoma 2016), Fields (Georgia to
Ohio State 2019). Must drop the January all-star rosters ESPN files as teams (Senior Bowl 3144/3145,
Shrine 3146/3147, NFLPA 3193/3194, HBCU 125290/125291) or every senior invitee reads as a transfer.
Share of population B exits with 2+ schools: 6-9% (2008-2014 classes), 12-25% (2015-2021), 40-69%
(2022-2026). The early rate is depressed by thin pre-2014 rosters (6,000-9,000 rows a season vs
22,000+), so the feature's meaning drifts by era. Known when the new roster posts (start of that
season), before the next draft. No portal-entry date exists key-free (`cfb_team_portal` is team counts).

**Redshirt / sit-out years: usable at season grain, 2013+.** stats.ncaa.org rosters (section 1) give
`games_played` and class for every FBS and FCS player each season: Burrow 2015 Fr 0 games, Mayfield
2014 So 0 games (transfer sit-out). 83% of population B exits from 2014-2026 join to their exit-season
NCAA roster row (name + school); 21.5% of 6,441 joined players have a 0-game season on the same team.
A 0-game season cannot be split into redshirt, injury or sit-out. ESPN-only proxy (roster season with
no stat line) is available back to 2008 but counts low-usage seasons too (20-63% by class).

**Side finding: all-star game participation** (same ESPN roster rows): a January, pre-draft signal.
Rows in the exit-season January by class: 2009 42, 2010 46, 2015-2023 41-103, none in 2008,
2011-2014 or 2024-2026. Rate: drafted 24%, undrafted NFL 19%, never-NFL 2.4%. Strong, legal at the
draft, but the missing years (including the serving classes) make it a train-serve risk until ESPN
fills them.

## Scripts and reproduction

All under `projections/lanes/data/`; resume commands in `checkpoint.md`.

| Script | Does |
|---|---|
| `fetch_ncaa_mfb.py` | downloads the ncaa_mfb release files to scratch |
| `ncaa_pbp_stats.py` | play text to player-season lines (self-check of the name and yard parsers) |
| `nfl_outside_b.py` | population B + every NFL QB/RB/WR/TE outside it, by college division |
| `fcs_measure.py` | FCS NFL join and FCS exits by class |
| `ncaa_validate.py`, `ncaa_vs_espn.py` | line quality vs NCAA box scores and vs the store's ESPN lines |
| `espn_draft_probe.py`, `espn_draft_summary.py`, `espn_draft_drafted.py`, `espn_speed_check.py` | ESPN draft-prospect records: field coverage, speed vs measured forties, rank vs pick |
| `transfer_redshirt.py` | transfers, silent seasons and all-star rows on population B |
