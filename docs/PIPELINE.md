# Data pipeline

## Preview the checked-in app

Run from the repository root:

```bash
python -m http.server 8000 --directory site
```

Open http://localhost:8000. Preview uses the checked-in data and needs no API keys.

## Refresh data

```bash
python projections/build_all.py
```

The pipeline runs builders in dependency order and writes static bundles to
`site/data/`. It uses Sleeper, KeepTradeCut, FantasyPros, nflverse, and other
public feeds. External availability, schema changes, and optional credentials
can prevent individual steps from completing. Inspect the per-step results.

`players-nfl.json`, `Leagues/`, `historical/`, FAAB inputs under `notes/`, and
curated source inputs under `site/data/` are retained because builders read them.
See [historical data setup](../historical/README.md) for source acquisition.
League snapshots currently reflect three configured leagues; a reusable demo
dataset remains work in progress.

## Optional inputs and integrations

- `site/data/build_jacob_gibbs.py` needs a manually supplied analyst-board CSV.
  Run `build_gibbs_fullppr.py` for the derived full-PPR board, and
  `site/data/_sources/build_gibbs_brief.py` for its presentation. Derived rankings
  must remain labeled separately from the analyst's original half-PPR board.
- `site/data/build_expert_rankings.py` reads curated `_expert_sources.json` inputs.
- Source-capture refresh helpers may use local X tooling outside this repository.
  Saved source captures remain available for the checks that read them.
- Kicker integration can use a sibling `kicker-analysis` checkout. It is optional
  and is not required for static preview.
- Optional API keys appear in `.env.example`. Set them in your shell; do not
  commit credentials. Some browser-based imports require an interactive session.
- `cloudflare/` contains an optional profile API. Hosting and account setup are
  separate from running the static preview.

## Offline checks

```bash
node --check site/js/app.js
node --test "site/js/*.test.js"
```

Tests cover lineup selection, trade simulation, draft-pick assumptions, player
identity, and data-source handling. Some statistical tests can be slow.
