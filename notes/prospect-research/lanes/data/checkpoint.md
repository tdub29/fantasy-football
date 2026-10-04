# Data lane checkpoint

Lane `data`: public sources for the coverage gaps. Writes only `projections/lanes/data/` and
`notes/prospect-research/lanes/data/`. Scratch (downloads, store copy, intermediate CSV/JSON):
`C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data\`.

## State (2026-10-04)

All five gaps have a measured disposition in `results.md` / `results.json`:
1 FCS usable 2013+ (proposed SOURCES entries + ingest plan in results section 1);
2 DOB unavailable (leakage through missingness); 3 pro day unavailable; 4 FantasyPros ECR terms
forbid + too sparse, ESPN Scouts Inc grade deferred as the best lead; 5 injury unavailable,
transfer and sit-out years usable at season grain.

Open: `espn_draft_drafted.py` (drafted skill players 2018-2026) may still be running; when done, rerun
`espn_speed_check.py` and refresh the drafted grade/speed coverage rows for 2018-2026 in results
section 3-4. Next for the coordinator: ingest the ncaa_mfb sources, then the FBS/FCS source-shift
test before any FCS row is scored.

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
python projections/lanes/data/espn_draft_summary.py                          # field coverage by class
python projections/lanes/data/espn_draft_drafted.py                          # drafted skill records (resumable)
python projections/lanes/data/espn_speed_check.py                            # speed vs forty, rank vs pick
python projections/lanes/data/transfer_redshirt.py                           # transfers, sit-outs, all-star rows
```
