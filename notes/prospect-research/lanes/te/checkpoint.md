# TE lane checkpoint

**State (2026-10-04): done for this round.** Prereg T1-T3 committed (e417dce) before scoring; all three
scored once and FAIL (all-rows and D1 top-60 ratio). Results: `results.md`, `results.json`. No candidate
to send to review. Nothing written outside the lane paths; nothing wired.

Open items for the coordinator (none can be acted on inside this lane):
1. Optionally freeze T2's next-class TE forecasts as a prospective entry (judged by 2027+ outcomes).
2. A minimum-training-history replay window must be a new addendum before any further TE candidate.
3. Shared `NestedLR`: a held-out class with no event rewards the least-penalized C (2012 replay picks
   C = 3); proposed fix in `results.md`, coordinator applies after review.

Resume, from the worktree root, in Git Bash:

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
export PROSPECT_DB="C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-te/prospect.sqlite"   # lane copy of the store
cd projections/lanes/te
python te_replay.py cache        # only if the scratch cache (te_cache.pkl) is gone: about 5 min
python te_replay.py check        # reproduces S3 / S4n4 TE exactly, writes the row files the diagnosis reads
python -W ignore te_diagnose.py  # step 1 diagnosis + power
python -W ignore te_mechanism.py # training-only mechanism + rescaled power
python -W ignore te_candidates.py T1 T2 T3   # about 10 min; rewrites results.json candidate entries
python -W ignore te_posthoc.py   # post hoc 2012-14 / 2015-21 split into results.json
python te_report.py              # tables in results.md
```

If the lane copy of the store is gone, recreate it with the sqlite backup API from
`projections/prospect-db/prospect.sqlite` (read-only source). Scratch: `C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-te`.
