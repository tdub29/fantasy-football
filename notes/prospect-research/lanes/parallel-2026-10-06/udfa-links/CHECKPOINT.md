# udfa-links lane checkpoint

Session: 915dc2f8-81b0-4dc7-9f34-ebb4c7cd67fd (Opus/high). Brief: main checkout
`notes/prospect-research/parallel-analysis-2026-10-06.md`, lane udfa-links.

## Inputs (read-only)

| Input | Hash |
|---|---|
| worktree HEAD | 8abb76d5010b28c6c5f43ad06166ea1db34a09c5 |
| store `projections/prospect-db/prospect.sqlite` (worktree, 411 MB, mtime 2026-10-06 09:02) | sha256 85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0 |
| isolated copy `$CLAUDE_JOB_DIR/tmp/udfa.sqlite` (job 915dc2f8) | same sha256 at copy time |
| `projections/build_prospect_model.py` | a6752cf201f4caca778b5057f862988b15de29c166082f5745ddae83addecafc |
| `projections/prospect_db.py` | 9b7805d5ee896ea0591d82c33c026988d33ce68bcd62c8fa83d813d652b7a967 |
| `projections/lanes/overall/overall_study.py` | a2b2fb80e213b051cdbd0bdd32614ffe35abd0a8e86cc5f3bf55ce98f738e732 |

Writes: only this folder and `projections/lanes/parallel-2026-10-06/udfa-links/`. Run with
`PROSPECT_DB=$CLAUDE_JOB_DIR/tmp/udfa.sqlite`.

## Phases

1. [in progress] Read linker, prior audit (`lanes/overall/udfa-link-audit-2026-10-06.md`), packages/data lane xwalk work.
2. [ ] Baseline: every drafted + UDFA NFL skill player, linked / unlinked by cause, cohort x position.
3. [ ] Deterministic resolver on copy: multi-school split, aliases, gap window; collision tests.
4. [ ] Before/after by cohort/position, outcome-weighted bias.
5. [ ] Integration instructions + raw-to-canonical mapping provenance.

## Runnable check

(set once the resolver script exists)

## Next step

Read `build_prospect_model.py` link path and `overall_study.udfas()`.

## Recovery (2026-10-07, coordinator ea66a469)

Session 915dc2f8-81b0-4dc7-9f34-ebb4c7cd67fd found failed: state.json `reapedMidWorkAt` 2026-10-06T19:47Z, phase 1/5, no live process. No duplicate session started and its files left as written; the coordinator has no tool to resume that session id, so the remaining phases run inline under this lane's write scope.

Continued inline on this lane's own copy (job 915dc2f8 tmp/udfa.sqlite, sha256 re-verified 85d9801d...) and paths. Resolver: `projections/lanes/parallel-2026-10-06/udfa-links/resolve_udfa.py` (espn_xwalk from the data lane's ESPN NFL->college crosswalk, multi_school, gap_window; base links never moved, asserted). Results: `out/audit.json` there, write-up `results.md` here.

## Resume (2026-10-07 ~09:15Z, original session 915dc2f8-81b0-4dc7-9f34-ebb4c7cd67fd, saved options, effort max)

Found on resume:
- `out/` and `results.md` do NOT exist. The coordinator's inline run of `resolve_udfa.py` (PID 46672, started 2026-10-07 01:41 local) is still running; I leave it alone (not mine to kill) and never write its file names (`out/udfa_links.csv`, `out/audit.json`, `results.md`).
- Copy `tmp/udfa.sqlite` is CONTAMINATED: an earlier run of `resolve_udfa.py` called `bpm.read_src` without a preset `_CON`, so `pdb.ingest()` re-fetched and re-loaded 3 live sources at 2026-10-07T08:17-08:18Z: `players/players.parquet` (sha 84ed9906 -> a219ee0f), `rosters/roster_2026.parquet` (3,020 -> 3,027 rows), `cfb_ratings/cfb_ratings_2026.parquet`. Left in place (file locked by PID 46672); not used again.
- Fresh copy `tmp/udfa_r2.sqlite` from the unchanged master (mtime 2026-10-06 09:02:23). Opened ONLY as `file:...?immutable=1` with `bpm._CON` preset, so no ingest, WAL or DDL can touch it.

Lane outputs from here (distinct names, superseding the draft): code `projections/lanes/parallel-2026-10-06/udfa-links/udfa_links.py`, outputs `.../udfa-links/audit/`, write-up `notes/.../udfa-links/udfa-link-results.md`. `resolve_udfa.py` is kept as the coordinator's draft and reviewed, not edited.

## Phase log (resumed session, same ID 915dc2f8-81b0-4dc7-9f34-ebb4c7cd67fd)

- 2026-10-07 ~10:30Z: phase 1 DONE. `tmp/udfa_r2.sqlite` sha256 re-verified 85d9801d... Reuse crosswalk `tmp/reuse/espn_nfl_college_xwalk.parquet` sha256 eab2eccd774823e1a84a190c3b05a82eca8864649c8e690f275e42b17c559431 (= packages lane R4 snapshot, 3,432 rows). PID 46672 has exited; its `out/audit.json` + `out/udfa_links.csv` (02:15 local) were computed on the CONTAMINATED copy (players.parquet re-fetched), so they are compared, never cited as the result. New evidence found: `cfb_roster.date_of_birth` (ISO, 80-95% filled 2004-08, ~10-30% later) vs `nfl_player.birth_date` gives an outcome-free corroborating key; validated on id-known links before any use.
- Next: phase 2+3 script `udfa_links.py` (baseline, cause taxonomy, resolver with collision and DOB-conflict guards, named-case self-check).

## Coordinator check (2026-10-08, c5d39d02)

- Phase 2+3 DONE: `udfa_links.py` run 2026-10-07 10:18, exit 0, named_ok, provenance_ok, collisions 0,
  rule_conflicts 10 (`$JOB/915dc2f8/tmp/run23.log`, `audit/phase23.json`, `audit/links.csv`). udfa_r2.sqlite sha256
  re-verified 85d9801d... today. Coverage identity: D 1506/1525, U 1590/1767 (base 1417 and 1197).
- Deterministic recount reserved to Codex: `CODEX-UDFA-RECOUNT-HANDOFF.md`.
- Coordinator owns: bias reading, cause taxonomy judgment, `udfa-link-results.md`, independent review.
  Note from capital-sources: cfb_roster DOB presence is an outcome leak as a FEATURE; here DOB is a link key only,
  so the write-up must state that DOB-linked rows skew drafted and check U links by DOB separately.

## Results write-up (2026-10-08, c5d39d02 subagent)

- DONE: `udfa-link-results.md` (coverage, methods, 10 rule conflicts, bias, DOB caution, cause taxonomy,
  provenance, limits). Read-only on `audit/*`, `run23.log` and `udfa_r2.sqlite` (immutable; sha256 85d9801d...
  identical before and after). No rerun, no code edit, no commit. Excluded and unopened: `prospect.sqlite`,
  `tmp/udfa.sqlite`, `out/`.
- Bias: unlinked rows track school level and era, not NFL outcome. U unlinked 65.6% D2-lower (40/61) vs 0.8% P5;
  15.2% 2008-11 vs 4.8% 2020-23; flat across NFL games buckets overall, but within 2008-11 unlinked falls 19.4%
  (41/211) at 0 games to 7.4% (2/27) at 49+ (revised 2026-10-08, review finding 4).
- DOB: inside U, exact DOB on linked rows rises with NFL games (51.8% at 0 games to 74.3% at 49+), so link method
  and DOB presence stay join keys only, never features.
- Next fix: transfer re-key merge reaches 7 of the 10 conflicts (hand check); Natson, Tonga and Myles White look
  like same-school duplicate ids and need a separate check (revised 2026-10-08, review finding 3). Then
  xwalk_reject:no_rows (U 64) only if identity-only rows are needed.
- Next step: check link precision by NFL games bucket; precision was checked only on the 1148 ESPN-id rows
  (revised 2026-10-08, review).
- Open: [bias] tables come from an unsaved session pass; one verifier recompute before any decision uses them.
- Hygiene: scratch pickle `$JOB/915dc2f8/tmp/c5d39d02_bias_frame.pkl` was outside the write set; deleted.
