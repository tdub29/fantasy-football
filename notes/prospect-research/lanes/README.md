# Parallel research lanes (from 2026-10-04)

One coordinator session integrates; lane workers research. Lanes: `qb`, `te`, `young` (later
classes, freshman and sophomore stage models). The coordinator keeps RB and WR.

## What a lane may write

- `projections/lanes/<lane>/` (scripts) and `notes/prospect-research/lanes/<lane>/` (prereg, results,
  checkpoint). Nothing else.
- Never write: the shared SQLite store, `build_prospect_model.py` or any other shared module,
  `experiments/` (ledgers, reviews.json, serving-backtest.json), `validation-charter-v2.md`,
  `model-card.md`, `checkpoint.md`, `site/`. Proposed changes to shared code go in the lane's
  results file as a patch description; the coordinator applies them after review.
- Data: copy the store once to the lane's job scratch dir and point `PROSPECT_DB` at the copy
  (`DB_PATH` is read at import time). Never run `build_prospect_model.py` (its build records a run in
  the store and rewrites `site/data`).
- Serving backtest: import `prospect_serving_backtest` and set `psb.OUT` to a lane file before
  calling `run_stage`, or write a lane copy of the replay. Never let it write `experiments/serving-backtest.json`.

## Protocol

1. Read the brief (`Fantasy Football/notes/prospect-research/claude-model-upgrade-brief-2026-10-03.md`
   in the main checkout), `checkpoint.md`, `validation-charter-v2.md` (addenda 1-14), the ledgers and
   every review file, so no rejected trial is re-run.
2. Scout skills (`python "C:/Users/TrevorWhite/Downloads/Big Projects/.agents/scripts/find-local-skill.py" "<task>"`)
   and load the ones that fit (validation-design, leakage-audit, calibration-check, baseline-models,
   feature-rules, time-series-sports, statistical-modeling, sports-predictive-modeling, experiment-log).
3. Preregister in `notes/prospect-research/lanes/<lane>/prereg.md` BEFORE scoring: hypothesis, the
   measured weakness it addresses, the public source or method it reuses (licence), exact candidate
   definition, gates, replacement test. Commit only lane paths:
   `git -C "<worktree>" add <lane paths>` then `git -C "<worktree>" commit -m "..." -- <lane paths>`
   (retry if `index.lock` exists; never `git add -A`, never push). No AI co-author lines.
4. Score with leakage-safe temporal validation and the exact serving replay (addendum 8 backtest),
   plus the display rule for the list that would show the number (D1 for the next class).
5. Gates are fixed (charter v2 and addenda): mean ratio 0.8-1.25 and calibration slope 0.75-1.25 on
   all served rows and first-eligible rows; D1 top 60 by own forecast on the same bands; beat stars
   plus college year on served log loss in at least 90% of season resamples where nothing serves yet,
   or beat the shipped model in at least 90% where something does. Never loosen a gate, change a
   target or fold after seeing results, or re-roll a marginal pass. Report fragile passes as fragile.
6. Write results to `notes/prospect-research/lanes/<lane>/results.md` (+ JSON) and keep
   `notes/prospect-research/lanes/<lane>/checkpoint.md` current with the exact resume command.
7. Return to the coordinator: candidates tried, numbers, verdicts, and any candidate that passed every
   gate. The coordinator sends each passing candidate to a fresh independent reviewer, and only the
   coordinator wires a reviewed model into the builder and app.

## Environment

Worktree: `C:\Users\TrevorWhite\Downloads\Big Projects\Fantasy Football\.claude\worktrees\prospect-model-db`.
`export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"`.
Plain `python` on PATH. Write scripts with the Write tool and run them as single commands; avoid
`cd ... && git ...` compounds (use `git -C`). No pushes, deploys, sends, paid services or account changes.
