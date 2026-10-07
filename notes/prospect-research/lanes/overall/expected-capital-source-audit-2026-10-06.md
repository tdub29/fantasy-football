# Expected draft capital: source audit (2026-10-06, written 2026-10-07)

Owner: overall lane (integration owner). Absorbs the capital-sources lane (5b948640, reaped mid phase 2/5).
Question: which public, timestamped, PRE-DRAFT sources give an expected-capital signal we can load,
and what may we do with each. A source not yet ingested is not proof none exists.

## Verdict

One source is loaded and tested: NFL Mock Draft Database consensus big board via Wayback, 2020-2026.
It is the only pre-draft, timestamped, deep (530-729 rows from 2021) board found so far. Rights are
UNVERIFIED, so it stays a private research cache: raw HTML and the CSV live in job scratch, never in
the repo, never redistributed. 2016-2019 have no pre-draft capture of it.

## Loaded: NFLMDD consensus big board

Loader `projections/lanes/overall/nfmdd_wayback.py` (selftest passes). Capture = last Wayback 200
strictly before draft day (UTC date). Link test = exact normalized name + season against
`nfl_draft_pick`; rho = Spearman board rank vs actual pick among drafted, linked players.

| Year | Capture | Rows | Proj picks | Linked drafted | rho all | rho QB/RB/WR/TE (n) | Proj MAE |
|---|---|---|---|---|---|---|---|
| 2020 | 20200416175451 | 150 | 32 | 140/255 | 0.78 | 0.82 (46) | 11.2 |
| 2021 | 20210426233914 | 574 | 32 | 252/258 | 0.80 | 0.84 (74) | 11.3 |
| 2022 | 20220426213946 | 635 | 63 | 247/262 | 0.84 | 0.86 (76) | 19.8 |
| 2023 | 20230405000531 | 530 | 64 | 241/258 | 0.76 | 0.73 (77) | 21.0 |
| 2024 | 20240424233950 | 652 | 64 | 250/257 | 0.86 | 0.87 (76) | 14.9 |
| 2025 | 20250421045931 | 691 | 32 | 248/257 | 0.82 | 0.76 (79) | 11.7 |
| 2026 | 20260420030444 | 729 | 32 | 251/257 | 0.81 | 0.72 (77) | 8.4 |

Raw sha256 per year is in scratch `nfmdd_provenance.json` (2020 8559a477, 2021 4b2726f3, 2022 517dac8c,
2023 15f58e2d, 2024 14d408cc, 2025 62d649c5, 2026 03182dc5). Name ambiguity: 2 rows in 2021, 0 elsewhere.

Caveats that bind any use:
- 2020 board stops at 150, so day-3 and UDFA coverage starts in 2021.
- 2023 capture is 22 days pre-draft, the stalest; its lower rho is partly that.
- Projected pick is censored past R1 (2020, 2021, 2025, 2026) or about R2 (2022-2024). Rank is the
  usable signal; projection is a censored extra.
- rho is computed on drafted players only (selection on the outcome), so it is a sanity check of the
  loader, not a model metric.
- Rights: site 403s scripted GETs; robots.txt allows the board path for crawlers with a crawl delay;
  a paid `/api-checkout` exists; 2026 page script flags ia_archiver. No licence found. Research use,
  private cache, cite as source, do not republish rows.

## Label maturity with this source

A 3-season NFL horizon is complete for 2020-2023 only (2023 class: 2023-2025 seasons). 2024-2026 are
immature and may be used for capital forecasting checks, never for talent labels. Four mature classes,
one of them with a 150-row board, is a small sample; every result on it must say so.

## Probed, not adopted

| Source | Finding | Status |
|---|---|---|
| ESPN core draft athletes API | grade, OVR/POS rank, speed for 2012-2027 (2016: 1132 athletes) | REJECTED as pre-draft: `lastUpdated` is 2025, values may be revised post-draft |
| ESPN bestavailable page (Wayback) | pre-draft captures 2018-2026, embedded JSON | Not parsed yet. Only candidate for 2018-2019 |
| FantasyPros rookie ECR CSVs (target-experiment scratch) | 2019-04-23, 2019-04-30, 2020-04-21 | Fantasy rookie ranks, not draft capital; pre-draft dated. Terms K0 (unreviewed) |
| FantasyPros `db_fpecr.parquet` (39 MB, same scratch) | ECR archive | Terms unreviewed; not used |

## Inherited leads from capital-sources lane, not probed here

Grinding the Mocks (bitbucket benjamin_robinson/grindingthebayes), Lichtenstein ESPN Kaggle set,
CRAN ProSportsDraftData, Arif Hasan consensus board, nflverse combine, ESPN all-star rosters. Each needs
the same three checks before use: pre-draft timestamp, depth past R2, licence. Grinding the Mocks and
Hasan are the likeliest 2016-2019 fills.

## Next

Use NFLMDD board rank as the expected-capital covariate for 2021-2023 (2020 partial) in the
preregistered target experiment. Do not backfill 2016-2019 with post-hoc ESPN grades.
