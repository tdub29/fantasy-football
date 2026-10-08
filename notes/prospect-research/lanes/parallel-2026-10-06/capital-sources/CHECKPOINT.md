# Lane capital-sources CHECKPOINT

- Session: `5b948640-97e2-4142-b3e1-4c5a5f93bcc7` (Claude Code bg job dir `C:\Users\TrevorWhite\.claude\jobs\5b948640`), Opus/high, started 2026-10-06.
- Brief: main checkout `notes/prospect-research/parallel-analysis-2026-10-06.md`, sha256 `0d51ac5f19843b74d225ada49486c2b6d8f4bf84abcff985c5c8c820fb8de030`.
- Write scope: `notes/prospect-research/lanes/parallel-2026-10-06/capital-sources/` and `projections/lanes/parallel-2026-10-06/capital-sources/` only. Master SQLite read-only. No site, no master DB, no NFLMockDraftDatabase capture (coordinator ea66a469 owns it).

## Phase status

| Phase | Status |
|---|---|
| 0 Checkpoint | done |
| 1 Read critique, overall prereg/addendum/results, packages/data lanes, source registry | done |
| 2 Source audit (docs, terms, timestamps, coverage) | done 2026-10-07, pending independent review (findings below) |
| 3 Loader tests (no credentials, no purchase) | in progress: `capital_wayback.py` WF 2012-2023 loaded, 2021-2026 rerun with the 2024+ parser; CBS and ESPN loads next |
| 4 Cross-fitted expected-capital forecaster spec | pending; leak check done (`forecaster_leak_check.py`, below) |
| 5 Deliverable: acquisition path, gaps, runnable test | pending |

## Recovery (2026-10-07, coordinator ea66a469)

Session 5b948640-97e2-4142-b3e1-4c5a5f93bcc7 found failed: state.json `reapedMidWorkAt` 2026-10-06T16:55Z, phase 2/5, no live process. No duplicate session started and its files left as written; the coordinator has no tool to resume that session id, so the remaining phases run inline under this lane's write scope.

Absorbed into the coordinator's overall lane: `../../overall/expected-capital-source-audit-2026-10-06.md` (commit e1019d9) records NFLMDD 2020-2026 loaded and link-tested, ESPN core grades rejected as post-hoc, and this lane's unprobed leads (Grinding the Mocks, Lichtenstein Kaggle, ProSportsDraftData, Arif Hasan, nflverse combine, ESPN all-star) as open, each needing timestamp, depth and licence checks. Next: probe Grinding the Mocks and Hasan for 2016-2019.

## Resume (2026-10-07, original session 5b948640-97e2-4142-b3e1-4c5a5f93bcc7, effort max)

Recovered in place under its own ID with saved options, no copy. Brief re-read: main
`notes/prospect-research/parallel-analysis-2026-10-06.md` sha256 `251719a90b45a6589cd8a3708db8ca3e2e2aba5ce287190ad6d54f02adbac60f`
(Oct 7 renewal text added; lane scope unchanged). Read coordinator's absorbed audit
`../../overall/expected-capital-source-audit-2026-10-06.md` (e1019d9) and target-experiment
`results.md` (e468360). Not duplicated: NFLMDD 2020-2026 (coordinator). This lane's remaining job:
pre-2020 pre-draft capital sources (2012-2019 are the mature classes NFLMDD cannot cover), an ESPN grade
vintage test against Wayback pre-draft captures (coordinator rejected the API on `lastUpdated` alone,
untested), rights for every source, loaders, forecaster spec, independent review.
Scratch: `C:\Users\TrevorWhite\.claude\jobs\5b948640\tmp\` (untrusted downloads under `dl\<source>\`, Python `-I`).

## Phase 2 findings (2026-10-07, not yet independently reviewed)

Signal types kept apart: pre-draft expected capital (board rank or projected pick), mock pick, scouting
grade, fantasy consensus rank, real draft slot.

- Grinding the Mocks (Bitbucket `benjamin_robinson/grindingthebayes`, commit `51e469908724ae09ea8e584b9bbab3334e895cc7`):
  2018 class only. `Mocks.csv` 18,179 rows, 392 mocks (site, date), dated 2017-04-29 to 2018-04-26 (draft
  2018-04-26); 1,035 rows dated ON draft day, so strict vintage needs `date < draft_date`. About 300 of 392
  mocks are round 1 only; about 8 cover 7 rounds. `EDP.csv` is a brms Gamma(log) random-intercept fit on mocks
  that INCLUDE draft-day rows and ignore censoring by mock depth; recompute strictly from `Mocks.csv`. Source
  data: a Google Sheet of third-party mocks. No LICENSE file: all rights reserved, private research cache only.
- ESPN Scouts Inc board (OVR RK, POS RK, grade): Wayback holds a last pre-draft `bestavailable` capture for
  every class 2018-2026, days before draft: 2018 2, 2019 5, 2020 1, 2021 4, 2022 1, 2023 23 (20230404, the
  earlier 503 was transient), 2024 2, 2025 17, 2026 3. The 2026 capture is not a new format; the Wayback raw
  body was gzip and, decompressed, embeds the same JSON. Each page embeds
  `"bestAvailable":{"pageCount":15,"pageSize":25,...}` with 25 athletes (ESPN athlete id, OVR RK, POS RK,
  grade); the full board is ovr/page/N plus qb/rb/wr/te[/page/N], each archived at its own vintage (2019 qb, rb,
  te, wr all 2 to 4 days pre-draft; 2020 qb 72 days; 2020 te and some 2020 ovr pages September 2019, stale).
  Nothing for 2015-2017 beyond an 18 KB insider stub. Vintage test of the current core API: not feasible via
  the Internet Archive. CDX holds 0 archived `sports.core.api.espn.com/.../draft/athletes/` captures for
  2012-2025 except 5 rows in 2021, and post-draft `bestavailable` captures are empty (pageCount 0) or truncated
  at exactly 1 MiB. Only evidence: Nick Bosa 2019 pre-draft OVR 1, POS 1, grade 95, same as the current API
  (n=1). The current API lists 412 athletes for 2019 against at most 375 board slots, gap unexplained (late adds
  or unranked records). A real test needs a terms-compliant ESPN pull: rights gate for Trevor.
  Rights gate: Disney Terms of Use (last updated 2024-05-24) 2.B(x) forbid automated extraction from Disney
  products, 2.A grants personal noncommercial use only. No bulk ESPN API pull from this lane. Three ESPN API
  calls were made in the first window (athlete list, 2019 draft, Bosa) before the terms were read.
- Internet Archive Terms of Use (last revised 2014-12-31; read from Wayback capture 20241130085839 because
  the live page is a JS shell): access "granted for scholarship and research purposes only", use "limited to
  noninfringing or fair use under copyright law". IA grants no rights in archived pages; publisher rights
  stay. Every archived source here: private research cache, facts extracted, no redistribution.
- WalterFootball (single analyst, Walter Cherepinsky): position boards `walterfootball.com/draft{Y}{POS}.php`,
  renamed `/{POS}Rankings{Y}.php` by the 2025 class. Ordered list (position rank) with "Projected Round (Y): R"
  per player and a page "last updated" stamp. Round grammar: N, N-M (en dash from 2021), N-FA, FA, "Top-N",
  "First Overall Pick", "No. 1", "No", typos such as "54-6". Vintage is the page stamp, not the capture.
  Loaded with `capital_wayback.py wf`: 2012-2020 36 of 36 pages parse with the list-item parser; 2021-2023
  need the en dash and "View Ranking History" suffix fixes (now in); 2024 moved to `prpSlot` panel markup
  (now parsed: QB 17, RB 30, TE 17, WR 39 rows, was 1 each). Rows per class 2012-2023: 115, 107, 118, 101,
  113, 127, 132, 126, 146, 117, 109, 96. Stamp days before draft: 2012 2-27, 2013 2-12, 2014 19-33, 2015 3-19,
  2016 2-26, 2017 2-61, 2018 2-19, 2019 19-21, 2020 19-84, 2021 23-33, 2022 47-145 (RB, TE, WR stamped
  2021-12-04), 2023 37-47, 2024 26-100. A "(YYYY)" label that differs from the class (flag `year_text`) hits
  2012 2, 2013 6, 2014 4, 2015 2, 2016 37 rows; 2016 TE Hooper, Higbee, Vannett, Adams are real 2016 picks
  labelled "(2015)", a template carryover, so eval runs with and without flagged rows. Rights: no terms page,
  robots.txt allows all agents, no licence, so all rights reserved.
- CBSSports position boards (page title "CBSSports.com - NFLDraftScout.com", so NFLDraftScout-powered):
  `prospect-rankings-results/{Y}_{POS}/all/overall`. The earlier "sparse" verdict is withdrawn (that query used
  `collapse=urlkey&limit=500` from the start of time and stopped at the 2005-2011 classes). Last pre-draft
  captures from the windowed CDX: 2013 RB only (04-21), 2014 all four (04-30 to 05-07, draft 05-08), 2015 all
  four (04-25), 2016 QB, RB, WR as `print_rows=9999` full lists (04-11 to 04-22) and TE first page (04-21),
  2017 pages about 3.3 KB compressed (04-01 to 04-20), likely stubs, 2018-2019 none. Depth and stubs are
  confirmed by the loader, not yet. NFLDraftScout's own pages are shallow and stale. Rights: NDS pages carry
  "(c) Copyright - The Sports Xchange | All Rights Reserved". CBS Interactive Terms of Use, issued by CBS's parent company (effective
  2025-05-27, read live, saved to scratch `dl/cbs_terms/`) prohibit "unauthorized spidering, scraping, data
  mining or harvesting of Content" and limit access to "personal, non-commercial purposes". The 2014-2016
  version was not read. Reading archived copies through the Internet Archive does not touch CBS servers, but
  the content rights stay with CBS: private research cache only.
- Drafttek Top-100 (overall big board, 4 pages of 25, `Top-100-NFL-Draft-Prospects-{Y}[-Page-N].asp`). Last
  pre-draft captures: 2012 none; 2013 p1 04-12, p2-p3 03-13, p4 02-20 (URL "-Page2" style); 2014 p1 02-09,
  p2-p4 04-06; 2015 p1 04-18, p2-p4 03-20; 2016 p1 04-27, p2 04-27, p3 04-13, p4 04-26; 2017 p1 04-20, p2-p4
  03-26; 2018 p1 04-23, p2 03-28, p3 04-23, p4 03-28; 2019 stale (2018-11 to 2019-02). Mixed vintage across
  pages of one board; recorded, not loaded. Terms not read.
- FantasyPros (K0 fantasy rank): terms (effective 2010-07-01) allow a single personal-use copy only.
- nflverse combine: CC-BY-4.0 data licence, combine data "courtesy of PFR". DB `nfl_combine` carries
  draft_team/draft_round/draft_ovr columns that must never be forecaster inputs.
- Rejected: CRAN ProSportsDraftData (round 1 only, selected on the outcome; data-raw is a stub with no scrape
  dates; GPL-3 covers code only). Lichtenstein Kaggle ESPN set (updated 2021-05-05, post-draft API scrape,
  account needed; uploader's GPL 2 label cannot license ESPN data).
- Open, not found: Arif Hasan consensus board (OTC post p=20822 confirms a 2015-2018 board whose "data can be
  downloaded"; no download link or archive found). ESPN insider rankings pages are 18-29 KB paywall stubs, skipped.

## Phase 4 inputs found so far (read-only on scratch DB copy, run 20261004T144240-26c1527e)

- `cfb_roster` DOB and age are an outcome leak, not a usable input. `forecaster_leak_check.py`: among
  QB/RB/WR/TE leavers (last roster season D-1), DOB present for 49.3, 63.8, 78.7, 96.0, 90.9, 98.7, 100, 100,
  100, 100 % of drafted (D = 2015-2024) against 3.0 to 6.7 % of undrafted. Age has the identical pattern.
  Height and weight are present for 98-100 % of both groups (no presence leak; a value overwrite after the
  draft is not testable here). Age proxy instead: years since recruit class (`cfb_recruit.season`), fixed
  before college.
- Join space: `player_link.cfb_player_id` matches `cfb_roster.athlete_id` (CFBD ids); `nfl_draft_pick.cfb_player_id`
  is a different id space and joins nothing.
- Roster rows start with season 2014, so roster-based inputs exist for classes 2015 on; season 2020 rosters
  are thin (1,349 leavers for class 2021 against about 2,600 to 2,900 in other classes).
- Drafted QB/RB/WR/TE per class 2012-2023: 77, 80, 77, 79, 77, 83, 83, 80, 78, 75, 79, 80; linked 72, 73, 67,
  70, 71, 76, 76, 79, 75, 72, 74, 77. Combine fantasy-position rows per class (undrafted in brackets): 105 (39),
  106 (38), 121 (48), 107 (40), 100 (37), 122 (49), 111 (42), 113 (42), 122 (48), 150 (93, no in-person combine
  2021), 112 (43), 111 (40). model_row has no UDFA population.

## Next step (as of this write, 2026-10-07)

Finish WF 2021-2026 rerun, then `cbs` and bounded `espn 2018 2019`, eval against `nfl_draft_pick` with
PROSPECT_DB on the scratch copy, `--smoke` from a fresh `CAPITAL_SCRATCH`. Then `forecaster-spec.md`,
`results.md`/`results.json`, one independent review, commit lane paths only.

## Resume 3 (2026-10-08, session job c5d39d02, inline continuation)

- Found done: WF 2021-2026 rerun finished (`5b948640\tmp\wf_rerun.log`: 2021 117, 2022 109, 2023 96, 2024 103,
  2025 101, 2026 98 rows, EXIT 0). `forecaster-spec.md` already written (138 lines); not redone.
- Not yet done: `cbs`, bounded `espn 2018 2019`, eval, `--smoke` from fresh scratch, results.md/results.json.
- New scratch for this resume: `C:\Users\TrevorWhite\.claude\jobs\c5d39d02\tmp\capital\` (DB copy plus loader
  cache copied from `5b948640\tmp\capital`).
- Next step: copy cache, `CAPITAL_SCRATCH=<c5d39d02 tmp>\capital python -I capital_wayback.py cbs`, then
  `... espn 2018 2019`, then eval with PROSPECT_DB on the c5d39d02 DB copy.
- 2026-10-08 step: DB scratch copy `c5d39d02\tmp\capital\db\prospect.sqlite`, sha256
  `85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0`, identical for master before copy, master
  after copy and the copy (master opened once, read only by `cp`; never again). Loader cache (cdx 48, raw 60,
  `wf_predraft.csv` sha256 `52ef97ea...a9fb`) copied to `c5d39d02\tmp\capital\data` = CAPITAL_SCRATCH. Selftest ok.
  Next: `cbs` load (running), then `espn 2018 2019`.
- 2026-10-08 step done: `cbs` loaded (2013 RB 25; 2014 and 2015 4x25; 2016 QB 45 full list, TE 25, RB and WR 0;
  2017 4x25). The 2016 RB and WR `print_rows=9999` captures are a different table: no Rank and no Proj. Round
  column (round cell "--"), so they carry no capital signal and are recorded as 0 rows, not parsed. 2017 pages
  are real 25-row boards, not stubs.
- 2026-10-08 step done: `espn 2018 2019` (bounded, Wayback only, no ESPN server call). 2018 pages carry no
  `draftYear` key, so the loader now falls back to the page title year (fix plus selftest line in
  `capital_wayback.py`). Rows: 2018 QB 16, TE 19 (no pre-draft RB or WR capture); 2019 QB 13, RB 25, TE 22,
  WR 25. Only page 1 per position exists pre-draft. Logs: `c5d39d02\tmp\capital\{cbs,espn}_load.log`.
  Next: eval with PROSPECT_DB on the c5d39d02 copy.
- 2026-10-08 step done: eval, PROSPECT_DB = c5d39d02 copy (sha256 unchanged after), output
  `c5d39d02\tmp\capital\eval.csv` (152 rows, sha256 3b44d1d5e0d9a6f7...). Smoke from an empty
  CAPITAL_SCRATCH (`c5d39d02\tmp\capital\smoke_fresh`): wf 32 rows sha b650de1b7c846826, espn 25 rows sha
  dc1b2fd2b6ed3ded, both ok. Next: results.md and results.json in this folder.
- 2026-10-08 step done: `results.md` and `results.json` written in this folder (aggregate metrics only). Phase 3
  loaders done, phase 4 spec done (unfitted), phase 5 deliverable written. Key: WF 2012-2026 mean rho 0.722,
  coverage 0.833; paired WF vs NFLMDD 2020-2026 0.694 vs 0.796 (NFLMDD higher in 7 of 7; single classes, no interval, vintage and consensus confounded); WF vs CBS 2013-2017
  0.772 vs 0.772.
- Next step: independent review of phases 2-5 (coordinator assigns; the doer does not run it), then commit lane
  paths only. Nothing committed by this session.

## Review corrections applied (2026-10-08)

Source: review-2026-10-08.md, ACCEPT WITH CORRECTIONS (not edited). Nothing committed.

- 8: capital_wayback.py evaluate and forecaster_leak_check.py open the DB as `?immutable=1` (was `?mode=ro`, which left a
  stale -shm and 0 byte -wal beside the scratch copy at 09:53).
- 10: NFLMDD `days_before` computed from the capture stamp: 7, 3, 2, 22, 1, 3, 3 for 2020-2026.
- 11: selftest asserts the title fallback (2018), key beats title (2019), and load("espn", 2018) skips a draftYear 2019 page.
- 7: fallback (initial plus surname plus position) refused when its pick is already claimed by an exact-name row on the
  same board, or when `same_first` says the first names cannot be one person (catches Darrel Williams to David Williams,
  whose real player is not on the board). New column `fallback_dropped`: WF 3, NFLMDD 8, all 11 reviewer-listed false hits.
  Nickname hits kept (Pat Mahomes, Cam Ward, Chig Okonkwo, KC Concepcion, Mike Strachan). Selftest ok.
  Rerun: `CAPITAL_SCRATCH=$T/data PROSPECT_DB=$T/db/prospect.sqlite python -I capital_wayback.py eval > $T/eval_v3.csv`
  (T = C:/Users/TrevorWhite/.claude/jobs/c5d39d02/tmp/capital). 152 rows, sha256
  c3aa151367a7259d9a811ffda1b4356bfb1383419a0afd2e864f89499faa8a0c. DB copy sha256 unchanged (85d9801d...a9c0).
  eval_v2.csv (claimed-pick guard only) is an intermediate, superseded.
  Moved: WF pooled 0.833 / 0.722 / 0.669 to 0.832 / 0.721 / 0.668; WF 2020 ALL 0.764 to 0.758; WF 2018 ALL 0.792 to
  0.788; paired WF vs NFLMDD 0.694 / 0.796 to 0.699 / 0.811 (gap 0.102 to 0.112, still 0 of 7). Unchanged: CBS, ESPN,
  NFLMDD pooled, WF vs CBS, WF vs ESPN.
- results.json regenerated from eval_v3.csv (keeps the old eval sha as eval_csv_sha256_before_review_fixes).
- 1, 2, 3, 9: results.md reading, comparability note, CBS wording and coverage limits rewritten; corrections table added.
- 4: line above amended.
- 5, 6: forecaster-spec.md coverage years and population timing caveat.

Next step: coordinator re-review of the corrections, then commit. The doer does not judge.

## Pause state (2026-10-08, coordinator safe pause)

- Corrections done: 1 through 11, all. Open: none.
- After the corrections, three literal dash occurrences (en and em dash in the parser, en dash in the selftest) in
  capital_wayback.py became `\u2013` and `\u2014` escapes, which behave the same. Selftest ok; an eval rerun reproduces eval_v3.csv
  byte for byte (sha256 c3aa1513...8a0c).
- Eval state: eval_v3.csv is final, and results.json and results.md are built from it. No eval or fetch is running.
- Dash check: no en or em dash in CHECKPOINT.md, results.md, results.json, forecaster-spec.md or either lane .py file.
- Exact next step: the coordinator re-reviews the corrections against review-2026-10-08.md (the doer does not judge),
  then commits the lane paths. Nothing has been committed.
- Re-review fixes (rereview-2026-10-08.md, 4 of 4, 2026-10-08): forecaster-spec population wording, results.md nickname-miss note, paired dict first-wins (capital_wayback.py:391, reversed like :374), this file's dash count; selftest ok, eval_v3.csv sha unchanged (c3aa1513...8a0c), no eval rerun, nothing committed.
