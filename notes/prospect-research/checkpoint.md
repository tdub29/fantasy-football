# Prospect research checkpoint

Resumable state of the usage-bounded research loop in `claude-model-upgrade-brief-2026-10-03.md`.
Rewritten at the end of every cycle; history is in git.

**Where:** worktree `Fantasy Football/.claude/worktrees/prospect-model-db`, branch `prospect-model-db`
(off local `main` 855ce59). Nothing pushed, deployed or sent. The shipped site file is still the v1
draft-only model until a population B model clears review and the build is rerun.

**Environment for every command** (bash, from the worktree):

```bash
export NFLVERSE_CACHE="/c/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/projections/nflverse-cache"
python projections/prospect_db.py ingest          # refresh the SQLite store (no-op when nothing changed)
python projections/build_prospect_model.py --parity
python projections/prospect_experiments.py all    # population A candidates (about 20 min)
python projections/prospect_experiments_b.py      # population B candidates (about 15 min)
python projections/prospect_db.py coverage        # data-coverage.md + feature registry
python projections/build_prospect_model.py        # shipping build: prospect-model.js + model card
```

## State after cycle 2 (2026-10-04)

**Database.** `projections/prospect_db.py`: 13 raw source tables (226 release files, sha256 and
licence each), idempotent per-file loads, derived run/link/row/feature/prediction tables. The builder
reads only from it; `--parity` proves identical inputs and a byte-identical export. Every shipping
build and experiment run is recorded as a `build_run`; the JS carries `db_run`.

**Population A (drafted, capital known).** A0-A13 scored under charter v2. One candidate (A10 RB,
a 50/50 blend) passed rules 1-5 and was **rejected by independent review**: v1's features were
pruned on every class, so the pass is selection leakage; two classes carry it. Draft-only stays.
A14 (feature selection inside each training fold, the honest test) is running.

**Population B (pre-draft, every exiting FBS player).** College profile beats recruiting stars by a
wide margin at every position (forward log loss WR 0.093 to 0.062, RB 0.154 to 0.098, TE 0.144 to
0.100, QB 0.147 to 0.116 with nested C). Independent review confirmed B1/B2/B4 with no leakage, and
said plainly that most of the AUC gain is separating who gets drafted (among drafted players AUC is
0.70-0.74). It found a spec flaw (QB-only stats in RB/WR/TE models) that B8-B10 fix.

## Cycle 3 (2026-10-04): shipped

- **A14** (feature selection inside each training fold) loses to draft-only at every position:
  post-draft, college stats add nothing reliable to capital. Draft-only stays.
- **Review C** confirmed RB B10, WR B10, TE B8 and rejected QB B9. Shipped in commit b019fcf:
  `PREDRAFT` set, `pd`/`pdx` on next-class college rows only, scored from completed seasons; the
  prospects board shows a Pre-draft column. Prospect verify-app checks pass; site tests pass.
  Three unrelated verify-app failures (trade-finder redraft timeouts, Gibbs week column) are in code
  this branch does not touch.
- Running: B11/B12 (QB passer-only features) and B14 (career-stage model for underclassmen),
  registered in addendum 7. Each needs an independent review before it can ship.

## Cycle 4 (2026-10-04): pulled, then a served-shape replacement

- Review D rejected QB B12 as served and B14 for underclassmen.
- New in-repo serving backtest (`prospect_serving_backtest.py`, addendum 8) replays the exact served
  code on 2012-2021: the shipped exit-scenario path ran about 2x low for first-eligible players while
  the same models are calibrated on real exits. **Pre-draft numbers pulled** (commit 9a5a340).
- S1 (career-stage model served from completed seasons, addendum 9) passes that backtest at RB and WR
  and beats stars plus college year served the same way (RB log loss 0.148 to 0.121, WR 0.080 to
  0.066; AUC about 0.88; 100% of seasons). TE and QB fail. Wired behind `NEXT_STAGE` (empty);
  review E running.

## Cycle 5 (2026-10-04): WR shipped

- Review E confirmed S1 at RB and WR as models, rejected the wiring (crash, missing payload metadata,
  misleading copy) and found the top-60-by-Talent cut breaks calibration. Display rule D1 (addendum
  10: list the next class by S1's own forecast) passed at WR (ratio 1.15, slope 0.80) and failed at RB
  (slope 0.74). **Shipped WR only** (commit fb1a1d1); all review E fixes in; site tests pass; prospect
  verify-app checks pass and now assert the Pre-draft column. A short independent fix check is running.

## Cycle 6 (2026-10-04): WR upgraded to S3; RB held back

- S3 (S1 with C tuned inside training, addendum 11) passes every gate at RB and WR; TE and QB fail.
- Review G: WR S3 confirmed (beats S1 in every season resample); RB S3 passes but with 62% resampling
  support on the display rule and is a near-copy of S1, so it is held back as a re-roll. Copy fixes in;
  WR now serves S3. Site tests and prospect verify-app checks pass.


## Cycle 7 (2026-10-04): live as-of-game features (S4); RB ships S4n4

- Per-game box scores (sportsdataverse player and team box, 2004-2026) in the store; addendum 12
  registered S4 = S3 plus the first N team games of the season in progress, N = 4 and 8.
- Serving backtest: RB S4n4 passes every gate (beats S3 in 92% of resamples); RB S4n8 fails D1
  (0.67); WR S4 fails the all-rows ratio (1.31/1.34); TE and QB fail.
- Review H confirmed RB S4n4 with fixes: addendum 13 (fixed N=4, no S3 fallback, 68% D1 support as a
  known risk), three copy fixes. RB now serves S4n4; site tests and prospect verify-app checks pass.

## Cycle 8 (2026-10-04): S5n4 (live model on served-shaped rows); parallel lanes

- Addendum 14 registered S5n4 before scoring. Serving backtest
  (`python projections/prospect_serving_backtest.py RB=S5n4 WR=S5n4 TE=S5n4 QB=S5n4`):
  - RB: every gate passes (all 0.92/1.00, D1 0.84/0.78) but it loses to the shipped S4n4 (14% of
    season resamples). Rejected at RB on the replacement test.
  - WR: every gate passes (all 1.12/1.16, first-eligible 0.92/1.20, D1 1.00/1.11) and it beats the
    shipped S3 on served log loss (0.0649 to 0.0635) in 91% of resamples, one point over the floor.
    FRAGILE; sent to independent review I.
  - TE: fails (all 1.39/0.83, D1 1.32/0.73). QB: fails (first-eligible 0.77/1.27).
- Parallel lanes launched (`notes/prospect-research/lanes/README.md`): QB, TE and young (classes after
  the next one), each in its own write zone with a private copy of the store. The coordinator keeps
  RB/WR and integrates; only reviewed candidates reach the builder.

**Next (open research)**: RB/TE/QB served models need a genuinely different idea, not a re-roll (for
example more training seasons, or features the serving backtest says matter); later classes (stage 1)
fail; prospective holdout from January 2027. **Next**: if the fix check passes, the cycle is done. Open research: RB (S1 fails D1 by 0.01 of slope;
no threshold change), TE and QB (fail the serving backtest), later classes (stage 1 fails), and the
prospective holdout from January 2027. Earlier: review E verdict on S1.
Earlier note: review whatever of B11/B12/B14 passes; if B14 passes on stage 1-2 rows, serve underclassmen
from it; score the prospective holdout from January 2027 (`python projections/prospect_prospective.py`).

## Rejected or deferred, with reasons

A1-A13 at every position (ledger.md); B3 everywhere (calibration); QB B1-B4/B6/B8/B10 (calibration);
FantasyPros rookie ECR (5 mature classes, terms unverified, revisit Jan 2027); RAS pro-day archive
(train-serve skew); any-school name join (tied FCS players to FBS namesakes). Prospective holdout:
`experiments/prospective-2024-2026.json` and `prospective-b.json`, scoreable from January 2027.
