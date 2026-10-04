# Packages lane checkpoint

Lane `packages` (session b56027d3, 2026-10-04): audit installed loaders and maintained football
data-loader ecosystems, test the ones that could close a remaining coverage gap, hand verified
recommendations to the coordinator. Writes only `projections/lanes/packages/` and
`notes/prospect-research/lanes/packages/`. Scratch (lane venv, raw pulls, snapshots, store copy):
`C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp\`. Never writes the shared store, builders,
experiments, site or other lanes.

Does not duplicate the data-gaps lane (stats.ncaa.org `ncaa_mfb_*`, Wikidata DOB, ESPN draft
prospects); reads its outputs read-only (`pop_b.parquet`, `nfl_outside_b.csv`, copied with sha256).

## State (cycle 1 done; independent review running)

Full write-up and numbers: `package-matrix.md`.

| # | Finding | Verdict |
|---|---|---|
| R1 | nflreadpy 0.1.5 = store's nflverse tables exactly (0 diffs); ff_playerids adds 0 DOB | redundant |
| R2 | CFBD-derived positions (cfbfastR-data) worse than current inference vs NFL position (88.7% vs 94.2%) | rejected |
| R3 | ESPN college athlete DOB present 98% drafted / 5% never-NFL (2018-22) | leakage, rejected (corroborates data lane) |
| R4 | ESPN NFL athlete `collegeAthlete` crosswalk: validates 693/694 name links, +2 hits, +11 A profiles, +48 UDFA links, 2 split ids | accepted pending review |
| R5 | ESPN recruit grades by id: 247 coverage 52.8% to 76.6% (2018-21 cohorts), Spearman 0.68 vs 247 | accepted as source pending review; model value = coordinator experiment |

Rejected or not needed: nfl_data_py (archived), nflreadr (no R, same upstream), cfbfastR (no R; its
endpoints reused from Python), CFBD API/clients (key), cfbreadr (does not exist), ncaa_stats_py and
henrygd/ncaa-api (same NCAA upstream as the data lane's releases), sportsipy/sportsreference
(unmaintained, SR terms), espn-api (irrelevant), sports247/on3 wrappers (site APIs, terms unchecked).

## Running in background

- ESPN recruit classes 2022-2026 then 2017 down to 2006 (about 170k records), log
  `<scratch>/recruits_rest.log`, raw `<scratch>/espn_recruits/raw_<y>.jsonl`, resumable.

## Resume

```bash
cd "C:/Users/TrevorWhite/Downloads/Big Projects/Fantasy Football/.claude/worktrees/prospect-model-db"
T=/c/Users/TrevorWhite/.claude/jobs/b56027d3/tmp
python projections/lanes/packages/espn_recruits.py 2022 2023 2024 2025 2026 2017 2016 2015 2014 2013 2012 2011 2010 2009 2008 2007 2006   # resumes
python projections/lanes/packages/espn_snapshot.py 2006 2007 2008 2009 2010 2011 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026
python projections/lanes/packages/recruits_measure.py $T/prospect.sqlite $T/pop_b.parquet <complete classes>
python projections/lanes/packages/xwalk_measure.py $T/prospect.sqlite $T/espn_nfl_college_xwalk.parquet $T/pop_b.parquet $T/nfl_outside_b.csv
$T/pkvenv/Scripts/python.exe projections/lanes/packages/nflreadpy_parity.py $T/prospect.sqlite
```

## Next

1. Apply review corrections; record the verdict in `review.md`.
2. When the recruit pull finishes: snapshot all classes, re-measure fill by class 2006-2026, report
   the coverage history the coordinator needs to preregister an ESPN-grade candidate.
