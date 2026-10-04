# Prospect model: data sources, as used and verified

Checked 2026-09-27 while building `projections/build_prospect_model.py`. Every source is a plain
GET of a GitHub release asset: no key, no account, no login. Files cache under `$NFLVERSE_CACHE`
(default `projections/nflverse-cache/`, gitignored), college files in its `cfb/` folder. A closed
season is downloaded once and kept; the current season refreshes after 24 hours. Nothing here is
committed; the builder only commits its output, `site/data/prospect-model.js`.

## College: sportsdataverse-data

URL pattern: `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/<tag>/<file>`.
Asset lists come from `https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/<tag>`.

| Tag | File | Seasons | Columns used |
|---|---|---|---|
| `espn_cfb_receiving` | `cfb_receiving_<YYYY>.parquet` | 2004-2026 | `season, player_id, receiver_player_name, team_id, pos_team, fbs_class, games, team_games, targets, comp` (receptions), `yards, passing_td` (receiving TDs) |
| `espn_cfb_rushing` | `cfb_rushing_<YYYY>.parquet` | 2004-2026 | `plays` (carries), `yards, rushing_td`, plus the same id/team columns |
| `espn_cfb_passing` | `cfb_passing_<YYYY>.parquet` | 2004-2026 | `att, comp, yards, passing_td, pass_int`, plus the same id/team columns |
| `espn_cfb_rosters` | `cfb_rosters_<YYYY>.parquet` | 2004-2026 | `athlete_id, team_id, full_name, position_abbreviation, height, weight, date_of_birth, experience_years` |
| `cfb_recruits` | `cfb_recruits_<YYYY>.parquet` | 2002-2026 (2004+ used) | `season` (recruit class), `team_id, player_name, stars` |

Looked at and not used: `espn_cfb_team_box` (per-game team totals; summing the player files gives
the same denominators from the same games), `espn_cfb_player_box` (per-game lines, not needed for
season shares), `cfb_crosswalk` (ESPN/Fox/Yahoo id map; no NFL ids in it).

What the files are, verified:

- **Season rows are play-by-play aggregates, FBS only.** Every row's `division` is `fbs` (118 teams
  in 2004, 138 in 2026). FCS and lower-division seasons are absent, which is most of the 7.3% of
  drafted players the join could not place.
- **2004 is thin and 2005-2007 miss games.** 2004's leading receiver has 786 yards and the median
  team shows 202 pass attempts. Michael Crabtree's 2007 row has 1,604 of his 1,962 yards over 11 of
  13 games. From 2008 on the leaders match their real totals closely (Dez Bryant 2008 1,520; Justin
  Blackmon 2010 1,798; Tank Dell 2022 1,389 vs 1,398). Because team totals are summed from the same
  file, shares and per-team-attempt rates stay consistent even where games are missing; raw counts
  do not, which is why the model uses rates.
- **Rushing excludes sacks.** QB rushing yards per game therefore need no sack correction (the
  research flagged this as a problem with NCAA box scores).
- **`fbs_class`** is `P5`/`G5` through 2024 and `P4`/`G6` from 2025. `power` = P5 or P4.
- **The 2026 files are the live season** (about five games in on 2026-09-27; 2026 receiving has
  1,742 rows and a 617-yard leader).
- **Roster birth dates are nearly gone:** 95% present in 2004, 41% in 2010, about 10% from 2013 to
  2022, 2% in 2025 and 0% in 2026. The `age` column is as sparse. ESPN's athlete API returns
  `dateOfBirth: null` for college players too (checked on athlete 4870620), so there is no key-free
  DOB for current players. The model estimates their age instead (below).
- **Roster class labels are reliable only recently.** Against recruit class, 2014-2023 rosters label
  most players `experience_years = 4` whatever their year; on the 2026 roster 1,082 of 1,116
  first-year recruits are FR and seniors read SR. The builder uses the label only from the 2025
  roster on, as a bound on the recruit class.
- **Recruit ids do not join.** `cfbd_recruit_ids` on the rosters never matches `recruit_id` in
  `cfb_recruits` (0 of 35,365 on 2024-2026). Recruits are joined on normalized name plus a school the
  player was on, which finds a recruit for about 40% of 2014-2026 skill-position players and for 82%
  (TE) to 90% (RB) of the drafted ones in the training set. Unmatched players take the median star rating inside each model fold.

## NFL: nflverse-data

URL pattern: `https://github.com/nflverse/nflverse-data/releases/download/<tag>/<file>`, fetched with
the existing helper in `projections/build_prospect_profile.py` (given `base`, `cache` and
`max_age_h` arguments so both builders share it).

| Tag | File | Used for |
|---|---|---|
| `draft_picks` | `draft_picks.parquet` | every QB/RB/WR/TE pick since 2008: `season, pick, gsis_id, pfr_player_id, pfr_player_name, position, college` |
| `players` | `players.parquet` | `gsis_id -> espn_id`, `birth_date`, `height`, `weight` |
| `combine` | `combine.parquet` | `wt, forty` by `pfr_id` for speed score (Barnwell's formula, the `prospect.js` helper) |
| `stats_player` | `stats_player_reg_<YYYY>.parquet`, 2008-2025 | `player_id` (gsis), `position, games, fantasy_points_ppr` for the outcome |
| `rosters` | `roster_<YYYY>.parquet`, 2008-2025 | `gsis_id, season, position`: the position he was listed at THAT season |
| `rosters` | `roster_2026.parquet` | `gsis_id -> sleeper_id` fallback |

- `fantasy_points_ppr` is nflverse's full PPR (4-point pass TD). A draftee's season is ranked by
  points per game against every player with 8+ games who was listed at his DRAFT position on that
  season's roster. The stats file's own `position` is the player's CURRENT one (Cordarrelle
  Patterson reads RB in 2013), which ranked five fullbacks drafted as RBs among fullbacks and two
  draftees among defensive backs, so it is only the fallback when a roster row is missing.
- Birth dates cover 97% to 100% of drafted QB/RB/WR/TE in every class from 2008.
- 2025 is the last complete NFL season; 2026 is not used for outcomes.

## Sleeper ids

`players-nfl.json` at the repo root (Sleeper's own dump, written by `site/data/fetch_sleeper.py`)
carries `gsis_id` (with a leading space, stripped) and `espn_id` for each Sleeper player id. That
map keys the card; `roster_2026.parquet`'s `sleeper_id` fills gaps. 955 of the drafted 2014-2026
QB/RB/WR/TE land on a Sleeper id.

## Joining college to NFL

- **By id where ESPN kept it.** nflverse `espn_id` equals the college `player_id` only from about
  the 2017 class: 0% of 2008-2015 picks match, 4% of 2016, 30% of 2017, 67% of 2018 and 94% to 96%
  from 2019 on. ESPN used to issue a new athlete id when a player turned pro.
- **An id is trusted only if his college seasons end before the draft.** Taylor Price (2010) carried
  the id of a 2015 Fresno State player; he now falls back to the name join and lands on his own
  Ohio career.
- **By name otherwise.** Normalized name (punctuation and Jr/Sr/II-V dropped, first name through a
  nickname table: Cam/Cameron, Matt/Matthew, Will/William, Kenny/Kenneth), matched against ANY name
  the college id was listed under (ESPN lists Robert Griffin III as "Griffin III" in 2010-11 and
  A.J. McCarron as "Corey McCarron" in 2013), a final college season one or two years before the
  draft, and a school match: `St.` expanded, a school alias map (Mississippi/Ole Miss, Central
  Florida/UCF, Ala-Birmingham/UAB, Texas-El Paso/UTEP, NC State, UConn, UTSA and a few more), then
  exact or a SequenceMatcher ratio of 0.5 or better, best match only. The old substring rule is
  gone: it scored "Central Florida" a perfect match for "Florida". A name that still matches two
  ids, or no school, stays unlinked rather than guessed.
- **Graded on the classes where both work:** run name-only on the 691 id-known picks, it found all
  691 and 99.9% of them were the same player the id join picked (99.8% before the aliases).
- **Result:** 1,414 of 1,525 picks since 2008 linked (90% of the 2008-2016 classes, 96% of
  2017-2026), up from 1,382; 32 new links (Mike Wallace, Evan Engram, Cam Newton, Robert Griffin III,
  Blake Bortles, Aaron Jones among them), none lost. The rest are almost all FCS or lower-division players; they appear on the card with a
  capital-only probability and no college profile.

## Estimated age for current college players

No public DOB exists (above), so a player's age on Sept 1 of a season is 18.71 plus the years since
his first season on file. "First season" is the earliest of his first roster or stat season, his
recruit class, and (2025+ rosters only) the season minus his class year plus one. 18.71 is the
median age on Sept 1 of that first season among drafted players from 2012 on who have a real birth
date; on those same 1,115 players the estimated draft age misses the real one with a 1.24-year SD.
Since 2026-09-28 the model trains on this same estimate for drafted players too, so training and
scoring see the same ages; a real birth date only sets the 18.71 and grades the estimate.

## The SQLite store and what changed on 2026-10-03

Every source above now loads into `projections/prospect-db/prospect.sqlite` (gitignored) through
`python projections/prospect_db.py ingest`, one raw table per source family with the file's sha256
and licence, and the model builders read from it. `build_prospect_model.py --parity` proves the store
and the parquet files hand the builder identical inputs. Added sources (charter v2 addendum 1):
`cfb_ratings` (season team ratings), `cfb_team_opponent_splits` (per-game opponents) and
`espn_cfb_usage_players` (season usage rates), all from the same sportsdataverse release host.
Licences and every source examined but not used: `public-source-registry.md`. Counts by class:
`data-coverage.md` (`python projections/prospect_db.py coverage`).

Defects found while building population B (every exiting FBS player, `prospect_population.py`):

- **ESPN rosters before 2014 list every position as "-".** Older players' positions are inferred
  from usage, then recruit position and weight; 94.6% agreement with ESPN's own position where both
  exist. Pre-2014 rosters also hold 6,000-9,000 rows a season against 22,000+ from 2014.
- **The recruit source leaves stars and grade null for 25-30% of the 2018-2021 classes**, including
  highly rated players who later transferred (Caleb Williams, Bo Nix, Jayden Daniels, Keon
  Coleman). The careers themselves are intact under one ESPN id. Stars on file for linked draftees
  fall from 84-95% (2009-2023) to 47-62% (2024-2026). No key-free source fills it (CFBD needs a key).
- **A few usage rows repeat** (no player id, or one player-season under two name spellings); they
  are summed back together or dropped on read.
- **Supplemental draft picks** (Josh Gordon, Terrelle Pryor) carry no draft year in nflverse and so
  count as undrafted; their label position is the one on their first NFL roster.
