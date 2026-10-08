# target-experiment lane checkpoint

Session: 7f87cf4a-c098-4ce8-b89d-46d262f4d6ac (Opus/high). Lane brief: notes/prospect-research/parallel-analysis-2026-10-06.md (main checkout), section "Lane target-experiment".
Write scope: this folder and projections/lanes/parallel-2026-10-06/target-experiment only. Master SQLite read-only; experiment reads a COPY.

## Inputs (sha256 at 2026-10-06T16:36Z)
- projections/prospect-db/prospect.sqlite 85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0 (master, read-only)
- overall/prereg.md ab24a504ca050a406bb1f14b640844d0b1764ffcbd183ea74a90b8593a6b2298
- overall/addendum-2026-10-05.md 49b49ab13cd3e39f7e49b9d8584e48c54c59f8df7fa3d303e772c341286bdebc
- overall/results.md d19a7424f3a0532d1d3d73ca191482a1a119fbe80617eba29bc32de2cfedd76f
- overall/results.json 43f95cdcd009eff5084370aead404bc2bf8562c18d213734b5a09e1bcae99b0a
- overall/results-narrative.md e3dc35157552e53214704de0941b803693bf530076b39e43623b16a8e64d1c71
- overall/udfa-link-audit-2026-10-06.md 73e2ade7b927b4fb5fc36bf9354e61240fe910de68d1fcadd9a843d399d9e39b
- projections/lanes/overall/overall_study.py a2b2fb80e213b051cdbd0bdd32614ffe35abd0a8e86cc5f3bf55ce98f738e732

## Phase status
- P0 checkpoint: done 2026-10-06T16:37Z
- P1 read prior study: in progress
- P2 label maturity + timestamp audit: pending
- P3 preregistration (frozen before any fit): pending
- P4 run: pending
- P5 independent judge: pending

## Runnable check
`PYTHONDONTWRITEBYTECODE=1 python -B projections/lanes/parallel-2026-10-06/target-experiment/audit_repro.py`
(A1 audit plus A2 reproduction, about 47 minutes, every fetch disabled; asserts maturity and store sha).
Phase status above is the P0 snapshot; current status is at the bottom of this file.

## Next step
Read prior overall study in full, copy DB to projections/lanes/parallel-2026-10-06/target-experiment/scratch/.

## Recovery (2026-10-07, coordinator ea66a469)

Session 7f87cf4a-c098-4ce8-b89d-46d262f4d6ac found failed: state.json `reapedMidWorkAt` 2026-10-06T16:55Z, P1, no live process. No duplicate session started and its files left as written; the coordinator has no tool to resume that session id, so the remaining phases run inline under this lane's write scope.

Continued inline. P2 maturity asserted in script, P3 prereg committed 125c50c before any fit, P4 run committed e468360 (`results.md`, `results.json`): H1 NOT SUPPORTED, H2 REJECTED, H3 USABLE descriptive. P5 independent judge: pending.

## Resumed by the original session, 7f87cf4a-c098-4ce8-b89d-46d262f4d6ac (2026-10-07)

Recovered 08:46:55Z with saved options (opus, effort max, autocompact 200k, same full ID, no copy). Hit the actual
session limit about 09:51Z; resumed 10:24Z after the 03:20 PT reset. This session is the lane's single writer again.
The coordinator's inline P3/P4 (125c50c, e468360) stay as written: never rerun in place, never overwritten.

Lane scratch (gitignored, `projections/lanes/parallel-2026-10-06/target-experiment/scratch/`), sha256:
- prospect.sqlite 85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0 (copy of master, unchanged at 10:26Z)
- rookies-20190423.csv c6f991fd810ba4c5b4455c749b9bbc4ff45789e0cf91b2f7194e1497b728d65f
- rookies-20190430.csv 82b5c8265ad716a0543636e6a64eab79c2c90ebe15f6913de34d13d6f51bc9c4
- rookies-20200421.csv bb8af4483e218652d156bb37e16818012f14acb79854b3af67c9d7670089c3c2
- db_fpecr.parquet cb81a9c41b3b45804df5fd3e067bc2419969e987a8d778947c8dcc2bb23f970e
- fp_arch.json be627f26958bfa95ed6d4de3da12300f258e9feccde72c45e9530b4f8413915c

Audit of the inline run, found so far (all to be confirmed in `label-maturity-audit.md`):
1. Provenance: prereg says the population cache was built from store 85d9801d. The cache it used,
   ea66a469 `tmp/overall/overall_data.pkl` (c79d7ab8...), was written 2026-10-05T22:52 PDT from that scratch DB,
   now b0afe017... (post-ingest). Master only became 85d9801d at 2026-10-06T09:02 PDT. Reproduction on the
   lane copy is pending.
2. Prereg names an "isotonic-on-pick occurrence" Brier baseline; the script compares with a position base rate.
   The named baseline is the two-part model's own occurrence part, so this is a recorded deviation, not a defect.
3. Prereg says Love and the frozen 36-player panel are printed; the script prints no panel.
4. Ridge alpha is chosen by RidgeCV row leave-one-out inside the training window, not nested temporal folds.
5. Shared nflverse cache: `stats_player_reg_*` unchanged since 2026-10-05T22:45 PDT (before the pickle);
   `players`, `combine`, `draft_picks`, `roster_2026`, `cfb/` were refreshed 2026-10-07T01:17 PDT by another run.

Plan for this session (lane paths only; master DB, shared cache and frozen outputs read-only):
- A1 label-maturity and timestamp audit: script plus `label-maturity-audit.md`.
- A2 reproduce the frozen prereg on the lane DB copy with ingest disabled and a lane cache copy, output to
  `repro-85d9801d/`.
- A3 audit addendum, frozen and hashed here before any supplementary run: deviations, pre-specified robustness
  checks that can confirm or invalidate but never upgrade a verdict, full selection ledger, Love and wider-panel
  diagnosis.
- A4 supplementary runs. P5 one independent judge (max effort), verdict saved verbatim as `judge-2026-10-07.md`.
  The coordinator remains integration owner; this lane dispatches only its own P5 judge.

## A1 and A2 done (2026-10-07T11:57Z, written up 12:14Z)

Outputs: `audit.json`, `label-maturity-audit.md`, `repro-85d9801d/results.json` (all in this folder).
Lane scratch after the run: work.sqlite 85d9801d (mtime 03:48 PDT, untouched by the build),
overall_data.pkl cb7ba4c90ae89aee8d0c1b7a868999979ce32277e2791f7a518e7150b03b7371 (the audited rebuild).

- Labels mature 2008 to 2023, missing after; EMB=3 is the only embargo with zero future label seasons.
- Rebuild vs the inline run's pickle: same 2,479 rows, zero label, pick, link or capital mismatches; only college
  production features differ (H2 inputs). Audit points 1 and 5 resolved this way.
- Frozen script rerun on the rebuild: 344 numbers, 68 differ, all H2. Verdicts identical (H1 NOT SUPPORTED,
  H2 REJECTED F1 -0.0058 [-0.0185, +0.0061], H3 USABLE). The results.md QB note for H2 does not survive
  (H2 QB 0.455 vs C0 0.457); withdraw it in the ledger.
- `all_seasons_complete: false` in audit.json is a flag-definition error (traded players exceed the schedule
  length in 2009, 2018, 2019, 2025); all 18 seasons are complete.

Next: A3 addendum (deviations D1 to D8, checks S2 to S6 and T1, rules), freeze and record its sha here, set
ADDENDUM_SHA in supplementary.py, then run A4.

## A3 frozen (2026-10-07T16:27Z), A4 launched

Hit the session limit again after A2; resumed about 15:31Z after the 08:20 PT reset, same full ID, saved options.
Before the freeze the addendum was checked line by line against `supplementary.py`, `overall_study.py`,
`build_prospect_model.py` and the prereg; no check, metric or model output was computed before the hash.

- addendum-2026-10-07.md sha256 2e7606a5e00cd56dc85465daf8937e85f7e70c405564e5cf2cfcfc229c714956
- supplementary.py sha256 005074360b03b6eb9d951fe9c8e751f2727874f15c5cf90aeaed312d2268c182 (ADDENDUM_SHA pinned)

A4 command (log in the job tmp dir, output `supplementary.json` in this folder):
`PYTHONDONTWRITEBYTECODE=1 python -B projections/lanes/parallel-2026-10-06/target-experiment/supplementary.py`

Next: when it finishes, write `supplementary.md` and `ledger.md`, then P5 (one independent judge, max effort,
verdict verbatim in `judge-2026-10-07.md`). If the run dies, record it in the ledger before any rerun.

## A4 written (2026-10-08)

Integrity re-checked before writing: addendum sha 2e7606a5... and supplementary.py sha 00507436... match the A3
record; store copy 85d9801d unchanged before and after A4. No rerun; every number is read from `supplementary.json`.

- `supplementary.md`: A4 results by check (D1 to D8, S2 to S6, T1), each with rule, number and verdict.
- `ledger.md`: every claim in `results.md` and this checkpoint, marked kept, revised or withdrawn. Withdrawn: the
  H2 QB note and the `all_seasons_complete` flag (definition error). Revised: H2 numbers (verdict kept), the
  "overconfident at the top" wording (slope 0.4443), "above p75" meaning, XC0 scope F1, F2, F3 with a F2 caveat.
  (revised 2026-10-08) The calibration wording is now "overconfident at both ends" (judge finding 8, ledger R9).
- Verdicts after A4: H1 NOT SUPPORTED, H2 REJECTED, H3 USABLE (descriptive, 3 classes), F1 to F3 with the K0
  format caveat. None FRAGILE.

## P5 judge (2026-10-08)

`judge-2026-10-07.md`: SOUND WITH CORRECTIONS, 12 findings. Applied 2026-10-08 in `results.md`, `ledger.md`
(rows citing "Judge 2026-10-08", R26 and C14 added, R18 WITHDRAWN) and `supplementary.md` (lines marked
"revised 2026-10-08"). No number recomputed; no overall prospect rating; XC0 not adopted pending the NFLMDD
rights check and an independent high judge.

Next: P5 independent judge (one agent, max effort), verdict saved verbatim as `judge-2026-10-07.md`.
