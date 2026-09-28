# Beyond the Box Score: the metrics they actually use

Pulled from six episodes of *Fantasy Football Today: Beyond the Box Score*
(Jacob Gibbs and Dan Schneier), 2026 weeks 2 and 3: the TE, WR and RB
rest-of-season shows, both Risers and Fallers waiver shows, and the week 2
recap. Transcribed locally (the podcast RSS feed, because YouTube 403s audio
and 429s captions from this machine), then every cited stat was extracted with
its mention count, the decision it drives and any benchmark they stated.
Raw extraction: `metrics_wk2.json` and `metrics_wk3.json` in the session
scratchpad; the merged list is below.

Their main source is the paid Fantasy Points Data suite. Everything marked
**on site** is rebuilt from public nflverse data into Stats Lab (`#stats`) and
the player card, by `projections/build_nflverse_suite.py`.

## Ranked by how often they cite it

| Mentions | Metric | Their benchmark | Status |
|---:|---|---|---|
| 38 | Red-zone touch / target share | 60%+ of team RZ touches = locked-in role | on site: RZ opp%, RZ tgt%, GL% |
| 36 | Expected fantasy points (xFP) and FP over expected | | on site, our own baseline model |
| 40 | Route participation | 65-70%+ elite; TE mid-70s+ "really strong" | on site as an **estimate** |
| 37 | Snap rate | 80%+ = bell-cow | on site |
| 31 | Target share | 25-30% alpha, 28%+ both weeks elite | on site |
| 30 | Route-tree distribution (go, post, slant...) | league percentiles | **not public for 2026** |
| 32 | First-read target rate | JSN 51% the benchmark | on site (FTN charting) |
| 20 | Targets per route run | 0.26-0.28+ elite | on site as an **estimate** |
| 22 | Yards per route run | | on site as an **estimate** |
| 15 | Play-action rate | 36% was 5th in the league | on site (team and QB) |
| 12 | Pre-snap motion rate | | on site (team) |
| 12 | Yards after contact | | on site (PFR) |
| 10 | Alignment / slot rate | | **not public for 2026** |
| 13 | aDOT | | on site |
| 8 | Under-center rate | 76% well above average | on site (team and QB) |
| 8 | Catchable target rate | high 80s elite, sub-60% a concern | on site (FTN) |
| 6 | Personnel usage (12 personnel, 11 personnel) | | **not public for 2026** |
| 9 | YAC per reception | | on site |
| 8 | Missed tackles forced | | on site as PFR broken tackles per touch |
| 7 | Air yards share | | on site |
| 5 | Rushing success rate | league average about 55% | on site |
| 5 | EPA per dropback / per rush | | on site |
| 4 | Pass rate over expected | 5%+ both weeks = pass-heavy | on site (team) |
| 4 | Neutral pass rate | | on site (team) |
| 4 | Team touch share (RB) | | on site |
| 4 | Receiving first downs / chain-mover share | | on site |
| 3 | Early-down success rate | under 30% a red flag | on site (team) |
| 3 | Explosive run rate | | on site |
| 3 | Red-zone snap rate | | **not public for 2026** |
| 3 | GPS speed thresholds (15 and 20 mph) | | **not public** |
| 2 | Burst score, separation score | | partial: NGS separation is on site |
| 1 | Fantasy points per route run | | on site as an **estimate** |
| 1 | On-field target share | | **not public for 2026** |

Counts combine near-duplicate names across the two extraction passes (for
example "Snap rate" 24 + "Snap Rate" 13).

## Why the gaps are gaps

nflverse's per-play participation file (who was on the field, route run,
alignment, personnel) ends with 2025. That one missing source is the reason
route-tree mix, slot rate, personnel, red-zone snap rate and on-field target
share are absent, and why routes run is estimated from snap share times each
team's dropbacks. The estimate overcounts players who stay in to block,
mostly tight ends and pass-protecting backs, and every column built on it
carries "(est)".

## Concepts they lean on

Bell-cow back, split backfield, dead-zone back, sacrificial X, field stretcher,
catch-and-run, chain mover, concentrated passing game, the "worryometer". The
archetype labels come from Gibbs's per-player X posts and are already stored on
the rest-of-season board (`archetype` on restated players in `gibbs-ros.js`).

## How good the route estimate is

Checked 2026-09-24 against the only charted 2026 routes-run numbers visible for
free (the top five rows of statrankings.com's paywalled Routes Run table,
through week 2):

| Player | Charted routes | Our estimate | Ratio |
|---|---:|---:|---:|
| Devaughn Vele | 91 | 99.7 | 1.10 |
| Chris Olave | 90 | 91.1 | 1.01 |
| DK Metcalf | 86 | 91.8 | 1.07 |
| Amon-Ra St. Brown | 81 | 82.8 | 1.02 |
| Xavier Hutchinson | 80 | 77.5 | 0.97 |

Mean 1.03, worst 10%. Separately, against 2025 participation data (on-field
dropbacks, an upper bound on routes) the WR estimate correlates at 0.99, which
is why WRs get no correction and TEs and RBs do.

## Could we chart it ourselves from film?

Costed 2026-09-24 (full report: `notes/cv-game-film-cost.md`).
Footage is the blocker, not compute: NFL+ Premium ($99.99/season) is the only
individual source of full-season All-22 and its terms ban downloading,
recording and automated processing. Compute would be $15-120 a season on
cloud GPUs, but the pipeline is 80-150 hours of work with no open-source
starting point for American football. Not worth it: the per-play route data
comes back free in nflverse after each season (FTN still charts it), and FTN
Data ($69.99/yr) or PFF+ ($119.99/yr) sell it in season.
