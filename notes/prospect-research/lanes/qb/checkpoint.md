# QB lane checkpoint

**State (2026-10-04): done; Q3 awaits independent review.** Diagnosis and preregistration committed in
b595581 before scoring. Q1 and Q2 fail. Q3 (S3 plus a nested level correction on served-shaped
training rows) passes every fixed gate, fragile: first-eligible ratio 0.817 (margin 0.017), all six
gates together in 14% of season resamples (a calibrated model of the same sharpness: 28%). Full
write-up: `results.md`; numbers: `results.json`. No new candidates beyond the preregistration.

**Open for the reviewer / coordinator:**
1. Independent review of Q3 (leakage, reproduction, fragility). It is the QB instance of the S6
   family (addendum 15) without live games and with the recalibration slope fixed at 1.
2. Serving population: the replay serves eventual starters; the board serves QBs with a start through
   the live season. Without zero-completed-start rows, Q3's all-rows ratio is 1.28 (fail).
3. Replay censoring: open outcome windows drop 62 of 88 first-eligible rows in 2019-2021, mostly the
   players who stayed in school (shared `run_stage` behaviour, all positions).

**Resume** (Git Bash, from the worktree; the store copy is the lane's own):

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-qb/prospect.sqlite"
python projections/lanes/qb/qb_replay.py parity        # lane replay == logged S3 QB, to the digit
python projections/lanes/qb/qb_diagnose.py             # step 1 diagnosis -> diagnosis.json
python projections/lanes/qb/qb_candidates.py           # S3, Q1-Q3 -> results.json (about 10 min)
python projections/lanes/qb/qb_checks.py               # Q3 robustness -> results.json q3_checks
python projections/lanes/qb/qb_censoring.py            # replay censoring diagnostic -> results.json
```

If the store copy is gone, copy `projections/prospect-db/prospect.sqlite` to that path first.
`qb_candidates.py` rewrites results.json, so rerun the two check scripts after it.

**Writes:** only `projections/lanes/qb/` and `notes/prospect-research/lanes/qb/`. Row-level replay
frames go to the job scratch dir, never the repo.
