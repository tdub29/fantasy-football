# Codex handoff: UDFA link recount audit (deterministic), 2026-10-08

Reserved to Codex from coordinator c5d39d02. Deterministic recount only; model judgments (bias, cause
reading, write-up udfa-link-results.md) stay with the coordinator.

Inputs (read only, do not modify):
- projections/lanes/parallel-2026-10-06/udfa-links/audit/links.csv and audit/phase23.json (run 2026-10-07 10:18, exit 0, named_ok)
- Immutable store copy C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/udfa_r2.sqlite, sha256
  85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0. Open ONLY as `file:...?immutable=1` (sqlite3 uri=True).
  Never open projections/prospect-db/prospect.sqlite, never tmp/udfa.sqlite (contaminated), never out/ (contaminated run).
- Do not rerun udfa_links.py or edit it.

Write ONLY: projections/lanes/parallel-2026-10-06/udfa-links/audit/codex-recount.py and audit/codex-recount.json.

Checks, each PASS/FAIL with the numbers:
1. sha256 of udfa_r2.sqlite equals the value above, before and after.
2. From links.csv alone, recompute phase23.json totals (D n 1525, U n 1767; base/identity/feature/fresh) and the
   methods table; report any mismatch.
3. No two rows (D or U) share one college id at a link that is not base (collisions must be 0); list duplicates.
4. List the 10 rule_conflicts and the 19 D plus 177 U unlinked rows (ids, name, pos, class), no interpretation.
5. Parity: D keys 1520 equal the store's drafted rows via the immutable copy.
Finish with a one-line result appended to this file.

Codex completion 2026-10-08: all eight deterministic checks PASS, 55 coverage cells and methods match, zero nonbase collisions, 10 conflicts plus 19 drafted/177 undrafted unlinked cases labelled, 1520 baseline keys agree, copied SQLite SHA unchanged before/after; independent review APPROVE. No model or identity-method certification.
