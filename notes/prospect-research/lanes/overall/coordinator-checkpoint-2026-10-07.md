# Coordinator checkpoint, 2026-10-07

Session `ea66a469-ae9b-4732-9cdf-87b42ecfc999` (integration owner, effort max, 200k compaction). Plan:
main `notes/prospect-research/parallel-analysis-2026-10-06.md` (sha256 251719a9...). This file is the
coordinator's durable record; the three lane `CHECKPOINT.md` files belong to their live lane sessions and
the coordinator no longer writes them.

## 1. Exact-ID recovery and handback

| Lane | Session | Reaped (state.json) | Coordinator inline work | Resumed under own ID |
|---|---|---|---|---|
| capital-sources | `5b948640-97e2-4142-b3e1-4c5a5f93bcc7` | 2026-10-06T16:55Z, phase 2/5 | NFLMDD absorbed into overall lane (e1019d9) | yes, effort max |
| target-experiment | `7f87cf4a-c098-4ce8-b89d-46d262f4d6ac` | 2026-10-06T16:55Z, P1 | prereg 125c50c, run e468360 | yes, effort max |
| udfa-links | `915dc2f8-81b0-4dc7-9f34-ebb4c7cd67fd` | 2026-10-06T19:47Z, phase 1/5 | draft `resolve_udfa.py` (see 4) | yes, about 09:15Z, effort max |

All three plus `aafe185e` (CBB) were marked for auto-resume at 2026-10-07T10:18Z; this session has been
marked since 2026-10-05T16:35Z. No session was copied or forked. Once each lane resumed, the coordinator
stopped writing lane paths. Each lane now owns its remaining phases and dispatches its own judge; the
coordinator does not duplicate a lane task or a lane judge.

## 2. Incident: live re-ingest into a lane copy and the shared cache

- **Root cause.** `build_prospect_model.read_src` (lines 208-220) calls `pdb.connect()` and `pdb.ingest()`
  when `bpm._CON` is None. The coordinator's first `resolve_udfa.py` run (about 01:15 PDT) called it without a
  preset connection, so live sources were re-fetched.
- **Affected.** (a) The udfa lane's copy `jobs/915dc2f8/tmp/udfa.sqlite`: `players.parquet` sha 84ed9906 to
  a219ee0f, `roster_2026` 3,020 to 3,027 rows, `cfb_ratings_2026` (the lane's own record). (b) The shared cache
  `prospect-model-db/projections/nflverse-cache/` (gitignored), 14 files rewritten 2026-10-07 01:17-01:18 PDT:
  `players`, `combine`, `draft_picks`, `roster_2026`, and `cfb/` 2026 files (rushing, receiving, passing,
  ratings, team_opponent_splits, usage_players, rosters, team_box, player_box, recruits).
  `stats_player_reg_*` unchanged.
- **Not affected.** The master store (sha256 85d9801d, mtime 2026-10-06 09:02) and the coordinator's copy
  `jobs/ea66a469/tmp/lane-overall2/prospect.sqlite` (re-verified 85d9801d, no WAL).
- **Consequence.** Any rebuild that reads the shared cache after 01:17 PDT sees refreshed 2026 and cross-season
  files. Frozen results must be reproduced from 85d9801d with ingest disabled, which is how the target-experiment
  lane's A2 and the udfa lane's `udfa_r2.sqlite` run now work (immutable URI, preset `_CON`).
- **Fix pending, not applied.** A guard in `read_src` (opt-in ingest, e.g. refuse when `PROSPECT_DB` is a copy)
  is the root-cause fix. It changes a module the live lanes import, so it waits until they finish (checklist).

## 3. Errata

1. **Prereg provenance (125c50c).** The prereg says the population cache came from store 85d9801d. The cache
   used, `jobs/ea66a469/tmp/overall/overall_data.pkl` (c79d7ab8...), was written 2026-10-05 22:52 PDT from a
   scratch DB now at b0afe017 (post-ingest); the master became 85d9801d only at 2026-10-06 09:02 PDT. The
   e468360 verdicts stand as pending until the target-experiment lane's reproduction (A2) and judge (P5).
2. **"Lane recovery records are committed"** was wrong. They were never committed; they live in the lane
   `CHECKPOINT.md` files, which the live lanes now own.

## 4. Draft UDFA outputs (coordinator's, superseded)

`projections/lanes/parallel-2026-10-06/udfa-links/resolve_udfa.py` and its `out/udfa_links.csv`,
`out/audit.json` ran on the contaminated copy. Draft only, never cite. Draft numbers, for comparison by the lane:
1,767 candidates, linked 1,197 to 1,295, 0 duplicate ids; name_school 449/449 and espn_xwalk 8/8 on 457
id-known drafted rows; multi_school and gap_window never fired there (precision untested). Leads handed over:
FCS cache `espn_fcs_lines_2004..2025` for FCS/D2 misses (Ekeler, Cruz, J. Robinson, Tyrell Williams, Shaheed);
UDFA class year should be last college season + 1, not NFL rookie season (Inman: CFL gap, 2010 vs 2014). The
lane's clean run (`udfa_links.py`, `audit/`, `udfa-link-results.md`) is the result of record. A check script
started at 02:32 PDT against the contaminated copy was killed before output (no writes, 0-byte WAL).

## 5. NFLMDD source (coordinator's own lane): independent judge

Pending at write time; verdict saved verbatim to `nfmdd-judge-2026-10-07.md` and summarised here when returned.

## 6. Integration checklist (coordinator, when lanes finish)

1. A lane result is integrated only after that lane's own independent judge passes it, saved verbatim in the lane.
2. Re-read each lane's final `CHECKPOINT.md` and judge file; confirm inputs trace to 85d9801d with ingest off.
3. udfa-links: adopt resolved links into the C0 capital population only if precision on id-known rows holds
   for every rule that fires; re-run the frozen C0 comparison with and without them.
4. target-experiment: adopt nothing into a score; the ledger (H1, H2, H3) is descriptive until A2 reproduces it.
5. capital-sources: pre-2020 sources only with timestamp, depth and rights each verified; NFLMDD rights stay
   unverified, so it remains a private research cache, never published or committed as rows.
6. Apply the `read_src` ingest guard (section 2) after all lanes stop, with a check that fails on a copy.
7. No score, rating or UI publication without Trevor. A draft-slot-only rating labelled as capital is his call.
