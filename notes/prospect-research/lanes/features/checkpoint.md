# Features lane checkpoint

**State: done.** Preregistered (fdeef37), scored, diagnosed; results in `results.md` / `results.json`.
F1 fails at WR and RB; F2 fails at WR; F2 RB passes every preregistered gate, fragile, with the gain
carried by 14 Alabama rows. Recommendation: no ship. Open for the coordinator: whether to send F2 RB to
an independent review (a school-clustered bootstrap is the natural first check) or freeze it
prospectively.

Environment (Git Bash, from the worktree root):

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-features/prospect.sqlite"
python projections/lanes/features/fetch.py          # idempotent; files in job tmp lane-features/dl
python projections/lanes/features/lane_feats.py     # self-check
python projections/lanes/features/coverage.py       # coverage.json (no outcomes)
python projections/lanes/features/replay.py --coverage WR RB   # coverage-rows.json (no outcomes), ~4 min
python projections/lanes/features/replay.py WR RB   # scores F1, F2 (~25 min); results.json "replay"; row parquet in job tmp
python projections/lanes/features/diag.py           # resampling support, top gain rows, RB coefficients (~45 min)
python projections/lanes/features/school.py         # gain without the top contributing school
```

If the lane store copy is missing, recreate it with the sqlite3 backup API from
`projections/prospect-db/prospect.sqlite` (see `notes/prospect-research/lanes/README.md`). The replay
reproduces `experiments/serving-backtest.json` only on the store as of 2026-10-04 07:42 (after the
relink); a later store can move the shipped numbers.
