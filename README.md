# Fantasy Football Dynasty Hub (Work in Progress)

> **Warning: Work in Progress**
> This repository is an active work in progress. It is built around three live Sleeper dynasty leagues (1QB, Superflex, and IDP) and is being refactored to separate league-specific snapshot data from a reusable public demo dataset.

A static vanilla JavaScript web application and Python data pipeline for dynasty fantasy football roster evaluation, multi-year aging projections, and Monte Carlo trade simulations.

## App preview

![Dynasty league hub and roster analysis interface](docs/images/fantasy-football-01.webp)

The league hub brings roster evaluation and multi-year projections into one view.

![Dynasty trade simulator comparing packages and championship odds](docs/images/fantasy-football-02.webp)

Trade Finder compares candidate deals and simulated title-odds changes for both teams. These previews show the work in progress described above.

## Local Preview

The frontend in `site/` is a static single-page application with no npm build step:

```bash
python -m http.server 8000 --directory site
```

Then open `http://localhost:8000` in a browser.

## Repository Layout

- `site/`: Vanilla JavaScript single-page app (`index.html`, `js/app.js`, `css/`), hash router, and static data bundles in `site/data/`.
- `projections/`: Python data builders and `build_all.py` pipeline that pull public rankings, nflverse stats, and Sleeper league feeds to generate `site/data/*.js`.
- `docs/`: Architecture notes (`ARCHITECTURE.md`) and dynasty valuation methodology (`FRAMEWORKS.md`).

## Implemented vs. In-Progress Scope

- **Implemented in code:** Roster comparison tables, KeepTradeCut market value integration, multi-source ranking aggregation (with half-PPR to full-PPR conversion), five-year aging curves, and Monte Carlo championship equity simulations (`site/js/trade-sim.js`).
- **Work in progress:** Replacing hardcoded Sleeper league snapshots with a clean sample dataset for standalone public use, and modeling exact league-specific draft-lottery and Max PF draft-order rules in `originSlot` (currently approximated by starter strength).

## Data Sources and Limitations

- **External feeds:** Data generation scripts read public endpoints from the Sleeper API, KeepTradeCut, FantasyPros, and nflverse. Upstream schemas and availability can change without notice.
- **Manual inputs:** Certain analyst tier boards require local CSV inputs that are not fetched automatically by `projections/build_all.py`.

## License

[MIT](LICENSE)
