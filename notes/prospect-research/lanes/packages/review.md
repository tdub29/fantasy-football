# Packages lane: independent review (2026-10-04)

Fresh reviewer, never the author; read-only on the repo and shared store, 8 spot-check GETs to ESPN.
Reran every lane script on the scratch data and rebuilt several numbers by hand. Its scratch checks:
`C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp\review\`.

| Finding | Verdict | What changed after review |
|---|---|---|
| R1 nflreadpy | confirmed with fixes | "byte-for-byte" claim narrowed to rows and compared values; pre-draft DOB check rewritten (draft_year is 0, not null, for undrafted rows); still 0 |
| R2 CFBD positions | confirmed with fixes | NFL grading moved into `cfbd_rosters.py` (was unsaved); `?` rows separated: on real positions CFBD trails inference by about 1 point, not 6; verdict unchanged |
| R3 ESPN DOB | confirmed | wording: DOB presence tracks NFL arrival; cell sizes stated |
| R4 crosswalk | confirmed with fixes | Corey Brown is two people (B's link is wrong), not a split identity; reverse-direction check added (7 disputed links: 4 ESPN errors, 2 split ids, 1 B error); "48 UDFA" was 11 drafted + 38 undrafted; id-link "690/690" is circular; timing guards added (window for drafted, career-before-NFL for undrafted; rejects Kyle Williams); 11 new profiles cut to 5 in window |
| R5 ESPN recruits | confirmed with fixes | `stars_247()` did not make `team_id` numeric as `player_bio` does, so roster-name matches never joined: 247 coverage 52.8% became 55.9%, ESPN fill 493/980 became 460/915, either 76.6% became 78.1%; id join verified (99.0% last-name agreement on 1,343 rows); leakage evidence (no timestamps; status fields not updated) recorded |
| Integration 1-5 | confirmed (1-2 with fixes) | numbers and guards above |

## R6 review (second reviewer, same day)

Confirmed with fixes. Events complete (2016 per-team counts equal stats.ncaa.org's schedule for 118 of
121 teams; playoffs and bowls captured); stat keys stable 2004-2016. Fixes applied: "all games with a
player box" was wrong (0.1-2.7% of FCS team-games have an empty team box, mostly whole-season holes);
the parity script's fuzzy team map sent 24 of 125 schools to the wrong or no team (replaced by an exact
map; now 278/276/112 joined, within 5% 69/62/62%); misses decompose mostly to the NCAA side and QB
sacks; the FBS source gap is 6-12% measured directly, not the 2-5% inferred; the 16 id-test misses are
explained (6 not FCS, 1 defender, 5 id gaps, 4 earlier last line); no consistent outcome-dependent
coverage. Its checks: `C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp\review_r6\`.

After the review the coordinator's commit eff88be linked Stevie Johnson and Beanie Wells by name;
R4 and integration item 1 now state the remaining delta.
