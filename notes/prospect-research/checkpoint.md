# Prospect research checkpoint

Resumable state of the usage-bounded research loop in `claude-model-upgrade-brief-2026-10-03.md`.
Rewritten at the end of every cycle; history is in git.

**Where:** worktree `Fantasy Football/.claude/worktrees/prospect-model-db`, branch `prospect-model-db`
(off local `main` 855ce59). Nothing pushed, deployed or sent. The shipped site file is untouched
(`site/data/prospect-model.js` still the v1 draft-only model).

**Environment for every command** (bash, from the worktree):

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
python projections/prospect_db.py ingest          # refresh the SQLite store (no-op when nothing changed)
python projections/build_prospect_model.py --parity
python projections/prospect_experiments.py all    # population A candidates
python projections/prospect_experiments_b.py      # population B candidates
python projections/prospect_db.py coverage        # data-coverage.md + feature registry
```

## Cycle 1 (2026-10-03)

Done:

1. **SQLite store** (`projections/prospect_db.py`, DB gitignored at `projections/prospect-db/`):
   13 raw tables from 224 release files, sha256 + licence per file, idempotent per-file
   transactions, derived run/link/row/feature/prediction tables. Builder reads from it.
   **Parity proven**: inputs identical (58,496 college seasons, 1,414 training rows) and a DB-mode
   build writes byte-identical `prospect-model.js` (except timestamp) and model card.
2. **Charter v2** (`validation-charter-v2.md`) committed before any scoring, plus addendum 1.
   States that the 2020-2023 holdout is spent; freezes 2024-2026 predictions as a prospective holdout.
3. **Population A candidates A0-A12** scored (`experiments/ledger.md`). A0 reproduces v1 exactly.
   Only **A10 at RB** (50/50 logit blend of baseline and v1 full) passes the five numeric rules;
   independent review running. A10 at WR fails only the 2020+ check. All else rejected.
4. **Population B** (`prospect_population.py`): every exiting FBS QB/RB/WR/TE, drafted or not,
   11k+ exits, undrafted NFL players linked, never-played players as real zeros; pre-2014 positions
   inferred (94.6% agreement with ESPN's position where known).
5. Public source and licence registry (`public-source-registry.md`).

Open:

- Population B results (B1-B4), then independent review of anything that passes.
- Independent review verdict on A10 RB; if CONFIRM, implement in the builder (ship rule v2) and
  rebuild; if REJECT, keep baseline.
- Coverage report (`prospect_db.py coverage`).

## Next falsifiable experiments (not yet registered)

- Population B with capital-free shrinkage blends (B2 averaged with the stars baseline), the
  pre-draft analog of A10.
- Prospective holdout scoring: rerun `freeze_prospective` entries against outcomes in Jan 2027.
