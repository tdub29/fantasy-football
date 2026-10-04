# Data lane checkpoint

Lane `data`: public sources for the coverage gaps. Writes only `projections/lanes/data/` and
`notes/prospect-research/lanes/data/`. Scratch (downloads, store copy, intermediate CSV/JSON):
`C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data\`.

## State (2026-10-04)

- Gap 1 FCS: **done**, usable 2013+ (results.md section 1). Sources downloaded to scratch `ncaa/`,
  player-season lines built (`pbp_player_season_<y>.parquet`), graded, joined, measured.
- Gap 2 DOB: Wikidata measured (too sparse for never-NFL players, missingness tied to outcome);
  ESPN draft-prospect probe running (`espn_draft_probe.py`, samples in scratch `espn_draft/`).
- Gaps 3-5: not finished. Leads: ESPN draft-prospect records carry `speed` (40 time), `arm`, `hand`,
  Scouts Inc `grade`, overall and position rank, and a `durability` grade, for 346-5,483 prospects a
  class (2006-2027 counts measured), drafted and undrafted; NCAA rosters carry class and games played
  (redshirt / transfer by season, 2013+); `espn_cfb_injuries` is a daily snapshot from 2026 only.

## Resume (bash, from the worktree)

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-data/prospect.sqlite"   # lane copy
python projections/lanes/data/fetch_ncaa_mfb.py                              # idempotent downloads
python projections/lanes/data/fetch_ncaa_mfb.py ncaa_mfb_pbp_cfbfastr
python projections/lanes/data/ncaa_pbp_stats.py                              # player-season lines
python projections/lanes/data/nfl_outside_b.py                               # NFL players outside B + pop_b.parquet
python projections/lanes/data/fcs_measure.py                                 # FCS join and exits
python projections/lanes/data/ncaa_validate.py                               # vs NCAA box 2020+
python projections/lanes/data/ncaa_vs_espn.py                                # vs store ESPN lines
python projections/lanes/data/espn_draft_probe.py 40                         # ESPN draft-prospect sample
```
