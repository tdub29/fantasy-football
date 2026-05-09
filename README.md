# Fantasy Football

A single-page dynasty fantasy football tier sheet that overlays Domain Dynasty's player categories (Cornerstone, Foundational, Upside Premier) on top of live Sleeper rosters, KeepTradeCut market values, and aggregated YouTuber rankings.

## Run it

```bash
cd site
python -m http.server 8000
```

Visit http://localhost:8000

## What's in here

- `site/` — the static SPA. Vanilla JS, no build step. Hash-based routing.
  - `index.html` — shell
  - `css/styles.css` — full stylesheet, dark Tier-Sheet aesthetic
  - `js/app.js` — full SPA logic
  - `data/` — generated data files + Python build scripts
  - `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md` — design system + product context
- `Leagues/` — raw Sleeper league API data (one folder per league)
- `transcripts/` — cleaned auto-transcripts of recent Dynasty Domain ranking videos
- `players-nfl.json` — full Sleeper player dictionary (auto-fetched)
- `cornerstone-rankings-2026.md` — initial Domain rankings notes
- `transcript-*.txt` — original full transcripts

## Refreshing data

```bash
# from project root
curl -s "https://api.sleeper.app/v1/players/nfl" -o players-nfl.json
python Leagues/build_league_folders.py
python site/data/build_site_data.py
python site/data/build_ktc.py
```

## Architecture

- **Vanilla JS, no framework, no build step.** Hash-based routing (`#dashboard`, `#league/:id`, `#roster/:leagueId/:rosterId`, `#trade`, `#compare/:leagueId/:rA/:rB`, `#sources`, `#about`).
- **Multi-source rankings aggregation.** Each enabled "ranking" contributes a per-player rank position; players are sorted by average source rank, ties broken by tier value.
- **Format-aware valuation.** Superflex applies a 1.40x multiplier to QB tier values; IDP applies 1.10x to LB.
- **Surplus/shortage trade matching.** League-aware target slot counts (FLEX distributed across RB/WR/TE) drive the "is this player startable league-wide?" check, which feeds Ideal Trade Partners and Trade Strategy.
- **localStorage persistence** for source toggles + custom sources.
- **Sleeper public API** is the only live data dependency (read-only, no auth).
- **KeepTradeCut HTML scraper** for public dynasty market values.

## Features

- **Dashboard** with Empire asset visual (cornerstones / foundational / upside as colored cells), auto-generated Insights strip, KPI cards, Sleeper Market trending adds/drops, position grade heatmap.
- **Player Rankings** — flat 1 to N list aggregated across enabled sources, owned %, started %, DEPTH badge auto-detection.
- **All Players** — searchable Sleeper player DB with ownership overlay.
- **League view** with team strength rankings, cornerstones leaderboard, format banner.
- **Roster Blueprint** (Domain Team Blueprint inspired): roster value tier, archetypes, 2-year outlook, positional grades (within-position normalized), lineup composition (startable / need / surplus per position), top priorities, market gauge, buys/sells with intensity, trade strategy (downtier / uptier / pivot), ideal trade partners (outlook-aware), positional age tracker, roster by position with depth dividers, draft capital.
- **Trade Calculator** with fairness verdict + post-trade strength delta.
- **Compare Rosters** — head-to-head positional + cornerstone diff.
- **YouTuber Sources** management with CSV import + settings export/import.
- **Cmd+K palette** — fuzzy jump anywhere via keyboard.
