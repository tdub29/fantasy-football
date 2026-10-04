# Features lane checkpoint

**State:** preregistration committed (fdeef37). Scoring F1/F2 at WR and RB is the next step; if this
file still says so, scoring did not finish.

Environment (Git Bash, from the worktree root):

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-features/prospect.sqlite"
python projections/lanes/features/fetch.py          # idempotent; files in job tmp lane-features/dl
python projections/lanes/features/lane_feats.py     # self-check
python projections/lanes/features/coverage.py       # coverage.json (no outcomes)
python projections/lanes/features/replay.py --coverage WR RB   # coverage-rows.json (no outcomes)
python projections/lanes/features/replay.py WR RB   # scores F1, F2; writes results.json, row parquet in job tmp
```

If the lane store copy is missing, recreate it with the sqlite3 backup API from
`projections/prospect-db/prospect.sqlite` (see `notes/prospect-research/lanes/README.md`).
