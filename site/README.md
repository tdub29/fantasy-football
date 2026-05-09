# Fantasy Football Site

A single-page web app that overlays curated player categories (Cornerstone / Foundational / Upside Premier) on top of your live Sleeper rosters.

## Run it

Open a terminal and start any static file server in this folder. Easiest:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000

(Opening `index.html` directly via `file://` won't work — `script src=` paths break with file URLs.)

## What's in here

- **Dashboard** — KPIs, league cards with strength/rank, positional grade matrix across all leagues, your Cornerstones table.
- **Rankings** — Flat 1 to N list aggregated across all enabled sources (Domain Dynasty + KeepTradeCut by default). Tier and category influence position, but the rank is the rank. Filter by position, category, search.
- **All Players** — Sleeper player database, overlaid with rankings + ownership across your leagues.
- **My Leagues** — Cards for each league. Click into any league.
- **League view** — Team strength rankings across the full league + Cornerstones leaderboard.
- **Roster Blueprint** — full team blueprint:
  - Roster Value Tier (ELITE / CHAMPIONSHIP / CONTENDING / RELOAD / REBUILD)
  - Value Archetype (FUTURE VALUE / WIN-NOW / BALANCED) and Roster Archetype (RB HEAVY, WR HEAVY, STARS & SCRUBS, etc.)
  - 2-Year Outlook
  - Positional grades (QB/RB/WR/TE + Bench + Draft Capital + Overall)
  - Top Priorities
  - Buys / Sells with intensity tags + Market Activity gauge
  - Trade Strategy: DOWNTIER / UPTIER / PIVOT scenarios
  - Ideal Trade Partners (auto-scored by positional fit)
  - Positional Age Tracker (line chart)
  - Roster by position grid
  - Future Draft Picks (acquired vs. traded away)
  - Full slot-by-slot roster table
- **Compare Rosters** — head-to-head positional + cornerstone diff between any two rosters in a league.
- **Trade Calculator** — pick rosters on each side, click players to add, see total value swap + post-trade strength delta, fairness verdict.
- **YouTuber Sources** — toggle which analysts inform your rankings, add custom sources, paste in CSV rankings.
- **Cmd+K palette** — fuzzy jump to any league, roster, route, or player. Press `Ctrl+K` (Win/Linux) or `⌘K` (Mac) anywhere.

## Refreshing data

When your Sleeper rosters change, regenerate the data files:

```bash
python site/data/build_site_data.py
```

This pulls from the cached JSON in `Leagues/*` and the Sleeper player dictionary at `players-nfl.json`. To refresh those:

```bash
# from /Fantasy Football
curl -s "https://api.sleeper.app/v1/players/nfl" -o players-nfl.json
python Leagues/build_league_folders.py
python site/data/build_site_data.py
```

To refresh KeepTradeCut public-perception values:

```bash
python site/data/build_ktc.py
```

This scrapes the top 200 dynasty values for both 1QB and Superflex from keeptradecut.com. Defaults: 1QB enabled, SF disabled (avoids mixing formats). Toggle in **YouTuber Sources**.

## Adding a YouTuber source

1. Go to **YouTuber Sources** in the sidebar.
2. Scroll to "Add a Custom Source", fill ID + Name + URL.
3. Click the new source's "+ Import Rankings" button.
4. Paste rankings as CSV — one player per line, columns: `name, pos, team, category, tier, [note]`
   - **Categories**: `cornerstone`, `foundational`, `upside_premier`, `mainstay`, `productive_vet`, `short_term`
   - **Tiers**: S, A, B, C, D
5. Hit Validate, then Import.

Rankings persist in `localStorage` — they survive page reloads but not different browsers.

## Format-aware valuation

- **Superflex**: QBs get a 1.40× position multiplier in team strength.
- **IDP**: LBs get a 1.10× position multiplier.
- The `is_superflex` and `is_idp` flags are auto-detected from each league's roster_positions.

## Architecture

- Vanilla JS, no framework, no build step.
- Hash-based routing (`#dashboard`, `#league/:id`, `#roster/:leagueId/:rosterId`, etc.)
- Data loaded via plain `<script>` tags from `data/*.js`
- Settings (enabled sources, custom sources) persist in `localStorage`
- ~2k lines of code total; everything lives in `js/app.js`
