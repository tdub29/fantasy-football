# udfa-links: college to NFL link results (2026-10-08)

Scope: how well college player ids link to NFL players for two populations, and whether the rows left
unlinked are a biased slice. This is a linkage audit. It says nothing about how good any player or prospect
is, and no number here is a player rating.

Sources. Paths are relative to `projections/lanes/parallel-2026-10-06/udfa-links/` unless stated.

- `[p23:key]` is `audit/phase23.json` at that key.
- `[csv: ...]` is `audit/links.csv` with the stated filter.
- `[store]` is a read-only query of the immutable store copy, `C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/udfa_r2.sqlite`, opened as `file:...?immutable=1`. Its sha was checked before and after the queries.
- `[bias]` is the session pass of 2026-10-08 (c5d39d02). It joins `links.csv` to `[store]` tables `nfl_player`, `nfl_combine`, `nfl_player_season` and `cfb_recruit`. It is not saved as a file, because the lane allows only this file and the CHECKPOINT to be written. Section 3 gives its definitions so the pass can be recomputed.

Populations:

- D: drafted QB/RB/WR/TE, built by `bpm.prepare`, n 1525.
- U: undrafted QB/RB/WR/TE/FB whose rookie season is 2008 to 2023, built by `overall_study.udfas`, n 1767. Every U row reached an NFL roster, so U is NOT the set of all undrafted college leavers.

For U, t0 is min(rookie season, first roster season).

## 1. Coverage before and after the resolver

| Pop | n | base | identity | feature | fresh |
|---|---|---|---|---|---|
| D | 1525 | 1417 (92.9%) | 1506 (98.8%) | 1428 (93.6%) | 1418 (93.0%) |
| U | 1767 | 1197 (67.7%) | 1590 (90.0%) | 1287 (72.8%) | 1218 (68.9%) |

Source: run log `C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/run23.log` totals. Codex recomputed these from `links.csv` and they match: `audit/codex-recount.json`, population and coverage checks, 55 cells, passed true.

What each column means (from `udfa_links.py`):

- base: the builder's own `bpm.link_college`, run unchanged. Its methods are espn_id, name_school and name_prefix. For D it reproduces the shipped `player_link`: 1520 keys, 0 mismatches [p23:parity].
- identity: base plus the four resolver rules. A new id is kept only when it is the single id any rule accepted and no other row (base or new) uses it. A base link is never moved.
- feature: the identity id appears in the FBS player-season stats (`bpm.load_college`), so college features can be built for that player.
- fresh: a feature id whose last stat season is 1 or 2 years before t0, with no college stats at or after t0.

What the resolver added:

- Identity links: D gains 89 (19 left unlinked) and U gains 393 (177 left).
- Every base link already had features: D 1417 of 1417, U 1197 of 1197 [csv: base_id set, feature_id set]. So the feature gain is only what the new links bring.
- Of the new links, D 11 of 89 and U 90 of 393 carry features [csv: base_id empty, identity_id set, feature_id set].
- The rest are real identities with no FBS stat line (section 5).

## 2. Methods, collisions and rule conflicts

| Method (identity) | D | U |
|---|---|---|
| name_school (base) | 726 | 738 |
| espn_id (base) | 690 | 458 |
| name_prefix (base) | 1 | 1 |
| xwalk | 27 | 162 |
| xwalk+dob_name | 57 | 152 |
| xwalk+dob_name+gap_window | 0 | 22 |
| xwalk+dob_name+multi_school+gap_window | 0 | 13 |
| xwalk+multi_school+gap_window | 0 | 12 |
| xwalk+gap_window | 1 | 4 |
| xwalk+multi_school | 0 | 2 |
| dob_name | 4 | 19 |
| dob_name+gap_window | 0 | 3 |
| dob_name+multi_school+gap_window | 0 | 3 |
| multi_school+gap_window | 0 | 1 |
| unlinked | 19 | 177 |

Source: [p23:methods]. A "+" means several rules accepted the same id. Codex reproduced this table (`codex-recount.json`, PASS).

The four resolver rules:

- r1 xwalk: the ESPN NFL-to-college pointer from the packages-lane crosswalk.
- r2 dob_name: exact DOB plus same surname and a compatible first name, with the college career ended before t0.
- r3 multi_school: the builder linker run once per listed school, and every school must agree.
- r4 gap_window: exact name, last season 1 to 5 years before t0, one candidate with school_sim >= 0.8, and no DOB or position conflict.

Safety checks, from [p23]:

- Collisions: 0 [p23:collisions], and no base duplicate ids [p23:base_duplicate_ids].
- On the 1148 rows where the ESPN id is known, every rule agrees with it whenever it fires [p23:rule_on_id_known]: xwalk 1146/1146, dob_name 1020/1020, multi_school 67/67, gap_window 1097/1097.
- r1 disagrees with base once, Dan Buckner (xwalk 377926, base 530818, name_school) [p23:r1_vs_base]. The base link is kept.
- The builder's name fallback, graded on espn_id rows [p23:lio]:
  - D: 682 found, 682 correct.
  - U: 404 found, 403 correct. The one wrong is 00-0038685.

Rule conflicts: 10 rows, all U, all left unlinked (cause rule_conflict, [p23:causes]). Ids and seasons below come from [store] `cfb_roster`.

| Player | id A (rules) | id B (rules) |
|---|---|---|
| Joe Anderson | 489006 (xwalk; 2009, team 2640, no DOB) | 237552 (dob_name, gap_window; 2007, team 2348, DOB) |
| Phil Bates | 489456 (xwalk, multi, gap; 2010-2011, team 195) | 235698 (dob_name; 2007-2008, team 66, DOB) |
| McLeod Bethel-Thompson | 477950 (xwalk; 2009-2010, team 16) | 192265 (dob_name; 2007, team 26, DOB) |
| Isaiah Crowell | 536398 (xwalk; 2013, team 2011) | 512836 (gap_window; 2011, team 61) |
| Dominique Davis | 236575 (xwalk, dob_name; 2008, team 103, DOB) | 500941 (multi_school; 2010-2011, team 151) |
| Nic Jacobs | 548774 (xwalk; 2013, team 2377) | 504189 (multi, gap; 2012, team 99) |
| Jake Kumerow | 558147 (xwalk, dob_name; 2014, team 3193, DOB) | 505112 (gap_window; 2011, team 356) |
| JoJo Natson | 531268 (xwalk, dob_name; 2012-2013 and 2016, DOB) | 3125355 (multi, gap; 2014 and 2016) |
| Manase Tonga | 487664 (xwalk; 2009, team 252) | 134674 (dob_name; 2005-2007 and 2009, team 252, DOB) |
| Myles White | 536315 (xwalk, multi; 2012, team 2348) | 381923 (dob_name; 2009 and 2011, DOB) |

How the conflicts were resolved: the code refuses all ten, so they stay unlinked.

- Only 5 of the 10 share the full pattern (Anderson, Bates, Bethel-Thompson, Davis, Kumerow): one name, seasons in sequence at different schools, and a DOB on only one of the two ids. That fits ESPN giving a transfer a new id. (revised 2026-10-08, review finding 3)
  - Crowell and Nic Jacobs are sequential at distinct teams but have no DOB on either id, so 7 of 10 fit a transfer re-key.
  - Natson (teams 328 and 2006 shared, both ids hold 2016), Tonga (both team 252, both hold 2009) and Myles White (both team 2348) look like same-school duplicate ids, not transfers.
- Nobody has certified that each pair is one person, so leaving them unlinked is the right default.
- Two hand-traced NAMED labels ("JoJo Natson: base kept", "Dominique Davis: base kept") pass only because base and identity are both empty. They do not confirm either id.

## 3. Are the unlinked rows biased?

Definitions for [bias]:

- Conference type comes from `nfl_player.college_conference`:
  - P5: SEC, B1G, ACC, B12, Pac-12, Pac-10, Big East.
  - G5: AAC, MWC, CUSA, MAC, SBC, WAC.
  - FCS: the FCS conferences.
  - D2-lower: everything else that is named.
  - missing: NaN, NO FOOTBALL or NO COLLEGE.
- Combine: the pfr id is present in `nfl_combine`.
- NFL games and PPR points: regular-season sums from `nfl_player_season`.
- Recruit match: an exact normalized name match to `cfb_recruit`, recruiting season t0-6 to t0-3. It is name only and rough.

Two rates are shown. "Unlinked" means no identity id. "No feature" means no feature id, which also includes identity links that have no stats.

### D (19 unlinked of 1525; 97 with no feature)

| Factor | Unlinked rate (count/n) | No feature |
|---|---|---|
| QB | 0.9% (2/222) | 5.4% |
| RB | 0.8% (3/400) | 5.5% |
| TE | 1.4% (4/287) | 6.3% |
| WR | 1.6% (10/616) | 7.3% |
| Class 2008-11 | 3.0% (10/334) | 10.2% |
| Class 2012-15 | 1.3% (4/313) | 7.0% |
| Class 2016-19 | 1.2% (4/323) | 6.2% |
| Class 2020-23 | 0.3% (1/312) | 4.2% |
| Class 2024-26 | 0.0% (0/243) | 3.3% |
| D2-lower | 55.6% (5/9) | 88.9% |
| FCS | 2.0% (1/51) | 90.2% |
| G5 | 0% (0/155) | 0% |
| P5 | 0.1% (1/793) | 0.1% |
| Independent | 0% (0/37) | 0% |
| Conference missing | 2.5% (12/480) | 8.8% |
| Combine | 0.9% (12/1321) | 4.2% |
| No combine | 3.4% (7/204) | 20.6% |
| Recruit match, one | 0.3% (4/1215) | 2.8% |
| Recruit match, none | 6.1% (14/229) | 25.3% |

Read this with care: 19 rows is too few for any rate to be stable.

- The 19 are small-school receivers and backs from older classes: Pierre Garcon, Cecil Shorts (Mount Union), Johnny Knox, Bernard Scott, Clyde Gates, Daryl Richardson (Abilene Christian), John Brown, Jeff Janis, Adam Shaheen, David Moore and others [csv: pop D, identity_id empty].
- Only one is P5: Kyle Williams, Arizona St., xwalk_reject:end.
- "Conference missing" holds 12 of the 19, so the conference field is a weak proxy here. Most of those are D2 or FCS schools whose conference is not recorded.
- NFL outcome:
  - Games, in the buckets 0 / 1-16 / 17-48 / 49+: 0.9 / 1.3 / 1.7 / 1.0%.
  - Mean PPR: linked 343.7, unlinked 277.0. Medians: 105.1 and 134.1.
  - With n 19 there is no usable outcome skew either way.

### U (177 unlinked of 1767; 480 with no feature)

| Factor | Unlinked rate (count/n) | No feature |
|---|---|---|
| QB | 8.3% (9/109) | 22.0% |
| RB | 7.1% (33/465) | 23.0% |
| TE | 12.9% (49/380) | 31.3% |
| WR | 10.6% (86/813) | 28.3% |
| Class 2008-11 | 15.2% (59/387) | 27.6% |
| Class 2012-15 | 11.8% (57/482) | 33.4% |
| Class 2016-19 | 8.3% (42/503) | 25.8% |
| Class 2020-23 | 4.8% (19/395) | 20.8% |
| D2-lower | 65.6% (40/61) | 95.1% |
| FCS | 3.2% (4/126) | 88.9% |
| G5 | 1.1% (2/189) | 3.7% |
| P5 | 0.8% (3/370) | 2.2% |
| Independent | 0% (0/13) | 23.1% |
| Conference missing | 12.7% (128/1008) | 29.0% |
| Combine | 1.8% (8/442) | 8.1% |
| No combine | 12.8% (169/1325) | 33.5% |
| pfr id known | 8.9% (139/1564) | |
| pfr id missing | 18.7% (38/203) | |
| Recruit match, one | 1.6% (17/1055) | 9.1% |
| Recruit match, none (revised 2026-10-08, review finding 6) | 25.0% (160/639) | 59.6% |
| NFL games 0 | 10.7% (97/910) | 27.6% |
| NFL games 1-16 | 10.2% (50/489) | 26.2% |
| NFL games 17-48 | 7.0% (17/242) | 26.4% |
| NFL games 49+ | 10.3% (13/126) | 29.4% |

What the U table says:

- Unlinked rows are concentrated, not random. They come from:
  - lower-division schools (D2-lower 65.6%, against 0.8% for P5);
  - older classes (15.2% for 2008-11, against 4.8% for 2020-23);
  - players who skipped the combine (12.8%, against 1.8%);
  - players with no recruit record (25.0%, against 1.6%; revised 2026-10-08, review finding 6).
- TE and WR run a few points above QB and RB.
- The small cells are D2-lower (n 61) and Independent (n 13). The "Conference missing" bucket (n 1008) holds 128 of the 177 unlinked rows, so its rate mixes school types.
- Unlinked causes by conference [bias, crosstab of cause by conference type]:
  - xwalk_reject:no_rows: 26 D2-lower, 38 missing.
  - school_not_in_ps:absent: 8 D2-lower, 33 missing.
  - Only 3 of the 177 are P5 and 2 are G5, matching the conference table. (revised 2026-10-08, review finding 2)
- NFL outcome shows no skew:
  - Unlinked rates by games bucket are flat, 7.0 to 10.7% with no trend.
  - Mean PPR: linked 51.7, unlinked 47.9, both medians 0.
  - Mean games: 11.2 and 10.9.
  - Mean PPR with a feature row is 50.3, without one 53.9.
  - Unique recruit matches average 2.86 stars unlinked (n 14) against 3.14 linked (n 975). (revised 2026-10-08, review finding 6)
- The unlinked set still holds real NFL producers. 80 of the 177 played at least one game and 16 have 100+ PPR points: Adam Thielen (Minnesota State), Danny Woodhead (Chadron State), Isaiah Crowell (rule_conflict), Seth Roberts, Darren Fells, Andre Holmes, Mo Alie-Cox, Dan Arnold.

What this means for a model:

- Missing college rows are missing by school level and era, with no marginal skew by NFL result.
  - Within 2008-11, though, unlinked falls with NFL games: 19.4% (41/211) at 0 games, 12.0% (12/100) at 1-16, 8.2% (4/49) at 17-48, 7.4% (2/27) at 49+. 2012-15 and 2016-19 are flat; 2020-23 cells are small. (revised 2026-10-08, review finding 4)
- A model trained only on linked rows under-represents small-school and older UDFAs.
- Among rows with features, the gap is wider, because FCS players link but have no FBS stats (section 5).
- Any comparison of FBS features across D and U describes FBS players only. It does not describe all UDFAs.

## 4. DOB caution

DOB decides few links on its own and corroborates many [csv: method contains dob_name, base_id empty]:

| | D | U |
|---|---|---|
| New links | 89 | 393 |
| New links whose method includes dob_name | 61 | 212 |
| dob_name as the only accepting rule | 4 | 19 |
| dob_name without xwalk (dob_name, dob_name+gap, dob_name+multi+gap) | 4 | 25 |

r1 also lets an incompatible name pass when the DOB matches exactly. That path cannot be counted from `links.csv`.

DOB status of the identity id, from the evidence column (id.dob) [csv]:

| Group | exact | none | conflict | within1 | no link |
|---|---|---|---|---|---|
| D base | 1150 | 237 | 24 | 6 | |
| D new | 61 | 25 | 3 | 0 | 19 |
| U base | 732 | 433 | 29 | 3 | |
| U new | 212 | 173 | 8 | 0 | 177 |

Exact DOB covers 1211 of 1506 linked D rows (80.4%) and 944 of 1590 linked U rows (59.4%). Flags [p23:flags]: dob_conflict 64 and dob_within1 9 across all rows.

Why this is a caution and not just a count:

1. DOB is backfilled for players who reach the NFL. The capital-sources lane found:
   - Among all QB/RB/WR/TE college leavers, DOB is present for 49.3 to 100% of drafted players.
   - For all undrafted leavers it is present for only 3.0 to 6.7%.
   - Height and weight are 98 to 100% in both groups.
   - Sources: `notes/prospect-research/lanes/parallel-2026-10-06/capital-sources/CHECKPOINT.md` line 108, `forecaster-spec.md` lines 66 to 73, and `review-2026-10-08.md` section 5.
   - Here U holds only NFL UDFAs, and 59.4% have an exact DOB. That fits the same backfill.
2. Inside U, DOB presence tracks NFL tenure. Exact DOB among linked U rows, by NFL games [bias]:
   - 0 games: 51.8% (421/813).
   - 1-16: 62.4% (274/439).
   - 17-48: 73.3% (165/225).
   - 49+: 74.3% (84/113).
   - D runs 74.3% (165/222) / 77.9% (296/380) / 77.3% (316/409) / 87.7% (434/495). (revised 2026-10-08, review finding 1)
   - D is not flatter. Its 0-games bucket holds 102 class 2024-26 rows; for classes through 2023, D runs 55.0% (66/120) / 72.2% (213/295) / 74.5% (263/353) / 87.7% (434/495), as steep as U. (revised 2026-10-08, review finding 1)
   - Exact DOB presence also swings by class: U 2012-15 is 32.2% and 2020-23 is 92.3%. (revised 2026-10-08, review finding 6)
   - So any feature built from DOB presence, from a dob_name link, or from link method encodes NFL outcome and era.
3. The link RATE does not track tenure (section 3). The problem is how the link was made, not whether it was made.

Rule: link presence and link method are join keys only. Never use them as model inputs, and never compare DOB-derived age features between D and U or across eras without a per-era presence check.

## 5. Why rows fail, and which fix to do next

Causes are scored on every row with no feature id [p23:causes]. The first two lines below are identity links that have no stats.

| Cause | D | U | Kind |
|---|---|---|---|
| identity_no_stats:fcs | 75 | 265 | linked, no FBS stats |
| identity_no_stats:roster_box | 3 | 38 | linked, roster or box only |
| xwalk_reject:no_rows | 10 | 64 | unlinked: crosswalk id absent from the store |
| school_not_in_ps:absent | 1 | 41 | unlinked: school absent from stats |
| school_not_in_ps:fcs_lines | 5 | 25 | unlinked: school has FCS lines only |
| player_not_in_ps | 1 | 18 | unlinked: school present, player not |
| rule_conflict | 0 | 10 | unlinked: two ids, refused |
| no_college | 0 | 10 | unlinked: no college listed |
| window_other | 1 | 5 | unlinked: name present, outside the window |
| xwalk_reject:name | 0 | 4 | unlinked: crosswalk name incompatible |
| xwalk_reject:end | 1 | 0 | unlinked: id seen at or after t0 |
| Total (unlinked part) | 97 (19) | 480 (177) | |

Unlinked U causes by class [bias]:

- school_not_in_ps:absent falls with era: 18 / 16 / 6 / 1.
- xwalk_reject:no_rows peaks in the middle: 9 / 25 / 22 / 8.
- rule_conflict sits mostly in 2012-15 (7 of 10).

Fixes ranked by return:

1. Transfer re-key merge, for the 10 rule conflicts.
   - Merge two ids when the name is the same, seasons are in sequence at distinct listed schools, at most one id has a DOB, and stats do not overlap.
   - Small. The rule reaches 7 of 10 (Anderson, Bates, Bethel-Thompson, Crowell, Davis, Jacobs, Kumerow), including named producers Crowell, Kumerow and Bethel-Thompson. (revised 2026-10-08, review finding 3)
   - It does not reach Natson, Tonga or White; those need a separate same-school duplicate-id check. (revised 2026-10-08, review finding 3)
   - It needs a hand check of each pair, because a wrong merge would create a false identity.
   - Next step: check link precision (wrong-person links) by NFL games bucket. Precision was checked only on the 1148 ESPN-id rows, and U links at 0 games carry the least DOB corroboration. (revised 2026-10-08, review)
2. xwalk_reject:no_rows (D 10, U 64), the largest unlinked cause.
   - The crosswalk names a college id that is not in the store. 26 of the 64 in U are D2-lower and 38 have no conference.
   - Fetching those ids' rosters would restore identity. It would add almost no features, because these are non-FBS schools.
   - Worth doing only if identity-only rows matter, for example for a selection or attrition model.
3. school_not_in_ps (D 6, U 66) and player_not_in_ps (D 1, U 18). Identity can be recovered, but no FBS features will ever exist for these players. Same value test as fix 2.

Not worth chasing: identity_no_stats (D 78, U 303). These players are linked correctly. Their schools have no FBS stat lines, so this is a data-coverage limit, not a linking failure. More features here would need an FCS stat source, not a better linker.

## 6. Provenance

Inputs, read only:

| Input | sha256 |
|---|---|
| `udfa_links.py` | 613a554df15892adc59f1fcc1f10ab86762c058ac15fe0876f2168d3712cfa44 |
| `audit/links.csv` | c6abdc18b19ecfde858aa212214d6c0d4294c589006261228987b177c202df8e |
| `audit/phase23.json` | 5a5dd1ab30cf715ad7fe80c8011029087c6a86f868aab531ac7cc4d06513e839 |
| `audit/codex-recount.json` | 2b62d1fd3340f444f6c41bb9d915d935f246aa91f03d42b96471f9982fd09197 |
| store copy `udfa_r2.sqlite` | 85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0 (same before and after this pass, opened immutable) |
| crosswalk `tmp/reuse/espn_nfl_college_xwalk.parquet` | eab2eccd... (3432 rows) [p23:provenance.xwalk_sha] |

- Worktree HEAD 8abb76d5010b28c6c5f43ad06166ea1db34a09c5. Inputs bpm a6752cf2..., prospect_db 9b7805d5..., overall_study a2b2fb80... (lane CHECKPOINT).
- FCS files 22, none bad [p23:provenance].
- Shipped build run 20261004T144240-26c1527e.
- Phase 2+3 run 2026-10-07 10:18, exit 0, about 1263 s, named_ok True, provenance_ok True (`run23.log`).
- The log shows the shipped run's code sha (a83ac2fa) differs from the current bpm (a6752cf2). D parity is still 1520 keys with 0 mismatches [p23:parity].
- Codex recount: all eight deterministic checks PASS, and an independent review gave APPROVE (`CODEX-UDFA-RECOUNT-HANDOFF.md`). Codex checked counts and safety, not whether the identity method is right.

Excluded, never opened for this write-up:

- `projections/prospect-db/prospect.sqlite`: the master store, used only through the immutable copy above.
- `tmp/udfa.sqlite`: contaminated. An unset `_CON` let `pdb.ingest()` re-fetch players.parquet, roster_2026 and cfb_ratings_2026 at 2026-10-07T08:17Z (lane CHECKPOINT).
- `out/audit.json` and `out/udfa_links.csv`: these came from that contaminated run.

Session hygiene: a scratch pickle written during the bias pass (`C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/c5d39d02_bias_frame.pkl`) fell outside the allowed write set. It was deleted the same day. No code was edited, `udfa_links.py` was not rerun, and nothing was committed.

## Limits

- The [bias] numbers come from an unsaved session pass. Their definitions are in section 3. An independent reviewer recomputed them on 2026-10-08 (`review-2026-10-08.md`, `audit/review-recompute.py` and `.json`); the corrections it found are applied above, marked "review finding N".
- Conference type comes from the NFL-side college conference field, and 1008 U rows and 480 D rows have none. School level for those rows is unknown.
  - Conference presence is not random. U conference missing runs 68.7% (625/910) at 0 games, 51.7% (253/489) at 1-16, 38.0% (92/242) at 17-48, 30.2% (38/126) at 49+, and by class 94.3% (365/387) 2008-11, 81.5% 2012-15, 48.3% 2016-19, 1.8% (7/395) 2020-23. The D2-lower against P5 contrast rests on a subset that skews recent and toward NFL tenure. (revised 2026-10-08, review finding 5)
- The recruit match is name only, with no school check. "None" partly means a name the matcher could not find, not a player who was never recruited.
- D has only 19 unlinked rows, and several U cells are under 100 rows. Treat those rates as directional.
- The 10 rule conflicts look like transfer re-keys, but that is not certified. The DOB fallback inside r1 cannot be counted from `links.csv`.
- Feature coverage is FBS only. Nothing here measures FCS or D2 college production.
