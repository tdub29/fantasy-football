# Packages lane checkpoint

Lane `packages` (session b56027d3, 2026-10-04): audit installed loaders and maintained football
data-loader ecosystems, test the ones that could close a remaining coverage gap, hand verified
recommendations to the coordinator. Writes only `projections/lanes/packages/` and
`notes/prospect-research/lanes/packages/`. Scratch (lane venv, raw pulls, snapshots, store copy):
`C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp\`. Never writes the shared store, builders,
experiments, site or other lanes.

Does not duplicate the data-gaps lane (stats.ncaa.org `ncaa_mfb_*`, Wikidata DOB, ESPN draft
prospects); reads its outputs read-only (`pop_b.parquet`, `nfl_outside_b.csv`, copied with sha256).

## State (cycle 2: review applied)

Full write-up and numbers: `package-matrix.md`; review verdicts: `review.md`.

| # | Finding | Verdict |
|---|---|---|
| R1 | nflreadpy 0.1.5 = store's nflverse tables (rows and compared values identical); ff_playerids adds 0 pre-draft DOB | redundant |
| R2 | CFBD positions vs NFL position: 87.3% vs inference 94.8% (93.4% vs 94.6% excluding CFBD `?`) | rejected |
| R3 | ESPN college DOB present 98% drafted / 5% never-NFL (2018-22) | leakage, rejected |
| R4 | ESPN crosswalk: name joins 693/694; after eff88be still adds 3 A profiles, 49 B links, 1 B link fix, 1 merge | accepted with guards (reviewed) |
| R5 | ESPN recruit grade by id: 247 coverage 55.9% to 78.1% (2018-21 cohorts), Spearman 0.68 | accepted as source (reviewed) |
| R6 | ESPN FCS box scores with ESPN ids, 2007/2010/2016 tested; parity vs NCAA median 1.00; pre-2013 FCS hits covered | accepted as source, NOT yet reviewed |

## Usage-limit stop (2026-10-04)

The R6 reviewer died on HTTP 429 "You've hit your session limit" (resets 9:10am PT). This is the
authorized hard stop: no autoresume. R6 stays UNREVIEWED; rerun the review (same brief: parity,
playoff-game completeness, id test by hand, coverage selection) before recommending FCS ingestion.
Background downloads below are plain Python processes, not Claude work; they keep running and are
resumable if killed.

## Running in background

- ESPN recruit classes 2022-2026 then 2017 down to 2006 (about 170k records, 10 workers), log
  `<scratch>/recruits_rest.log`, raw `<scratch>/espn_recruits/raw_<y>.jsonl`, resumable.
- ESPN FCS box scores 2004-2012 and 2016 done (lines written); 2013-2015 and 2017-2025 pulling, log
  `<scratch>/fcs_post2013.log`, raw `<scratch>/espn_fcs/box_<y>.jsonl`, resumable.

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

1. When the FCS pull finishes: run `fcs_parity.py` for every pulled season (id test per class), then
   an independent review of R6 before recommending ingestion.
2. When the recruit pull finishes: snapshot all classes, re-measure fill by class 2006-2026, report
   the coverage history the coordinator needs to preregister an ESPN-grade candidate.

Resume FCS: `python projections/lanes/packages/espn_fcs_box.py fetch <years>` then `lines <years>`,
then `python projections/lanes/packages/fcs_parity.py <y> "C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-data/ncaa" $T/espn_nfl_college_xwalk.parquet $T/nfl_outside_b.csv`.
