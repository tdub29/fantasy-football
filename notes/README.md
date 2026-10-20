# Research and model evidence

This directory holds inputs and evidence used by the data pipeline.

- [Prospect research](prospect-research/model-card.md): model specification, validation, and recorded experiments.
- [Data sources](prospect-research/data-sources.md): coverage and provenance for prospect features.
- `faab_extract.py`, `faab-bids-2026-09-16.csv`, and related files: Sleeper claim extraction and FAAB analysis inputs read by the builders.
- Other methodology notes document assumptions behind generated rankings and player features.

The app reads generated bundles in `site/data/`; these files support rebuilding and evaluating those bundles.
