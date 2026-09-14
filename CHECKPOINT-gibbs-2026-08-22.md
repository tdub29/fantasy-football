# Checkpoint - Jacob Gibbs Top-200 (2026-08-22) ingest - DONE

Request (Telegram, 2026-08-22): two phone screenshots of Jacob Gibbs' updated 2026 board,
sent with no instruction beyond "work out what they are and do the obvious next thing".
They are his republished redraft board, so the obvious next thing was the documented Gibbs
refresh, end to end.

Sibling job ej-1787421877403 held only page 2; this job (ej-1787421882034) held page 1 but
both files are on disk, so this run owned the full 200.

Source images, copied into the repo:
- site/data/_shots/gibbs-tiers-2026-08-22-p1.jpg  (ranks 1-84, tiers 1-11)
- site/data/_shots/gibbs-tiers-2026-08-22-p2.jpg  (ranks 85-200, tiers 11-17)

No public URL exists for this board. The CBS article is still the Aug 14 top-175, and the
screenshots use a different layout (`# / Player (Team/Bye) / Pos`, no posRank column), so
posRank is computed densely when the CSV is written.

## Done
- All 200 rows typed twice, independently, off the same crops. **Zero differences on name,
  team, pos and bye.** Corroborated by: one bye week per team, all 32 teams present, and
  200 of 200 names resolving to Sleeper ids.
- Tier for ranks 178-200 is the one adjudicated field. His sheet prints "TIER 15" a second
  time there; label-bitmap template matching scores 0.99 vs the confirmed "TIER 15" bar and
  0.925 vs "TIER 16" (distinct strings on this board score ~0.93), and the glyph is a 5 not
  a 7 against the real "TIER 7" bar on page 1. A new bar always opens a new tier and 17 is
  the only monotonic value, so the board carries 17 and the print is kept as `printedTier`.
- `site/data/_sources/jacob-gibbs-2026-08-22.csv` is the build input;
  `..._independent-transcription.tsv` is the second pass and the test pin.
- Aug 14 board archived to `historical/jacob-gibbs-2026-08-14-top175.js` and
  `historical/jacob-gibbs-2026-08-14-fullppr.csv`.
- `site/data/jacob-gibbs.js`, the derived full-PPR column, `expert-rankings.js` and
  `site/gibbs-tiers.html` all regenerated (200 players, 17 tiers, 55 already rostered).
- Three generators de-hardcoded so they follow the board rather than the previous one:
  `build_gibbs_fullppr.py` (output filename, title, updatedAt), `build_gibbs_brief.py`
  (`newest_prior_board()` resolves the movers baseline by date instead of a hardcoded
  filename, with a `--selftest` proven to fail on an inverted resolver; plus 5 literal
  counts, the source-link label, and a dated attribution on the strategy prose),
  `app.js` (`gibbsBoardShape()` feeds the Sources copy and the Cmd+K hint).
- Tier board design pass applied: methodology folded into a native `<details>` so the board
  reaches the fold sooner, stat tiles flex-grow so 7 of them wrap 4+3 instead of 6+1.
  Format toggle, position filter and name search all exercised, no console errors.
- Tests: `gibbs-tiers-source`, `jacob-gibbs`, `gibbs-fullppr` plus the nine existing suites
  green; `node --check site/js/app.js` clean. Test pins updated to 200/17/2026-08-22/
  Eli Raridon.
- Deployed to Cloudflare Pages production (trevor-apps), 9 changed files uploaded. The
  staged bundle at deploy/phone-apps/ff/ carries the 200-in-17 board. The live site sits
  behind Cloudflare Access so it cannot be curl-verified anonymously.

## What actually changed on his board vs Aug 14
- 175 players to 200, 16 tiers to 17.
- Only one name off the board entirely: Jayden Higgins (was 110).
- Tier 3 reordered: Cook, Jeanty, Taylor, Hampton, Chase Brown -> Cook, Chase Brown,
  Jeanty, Taylor, Hampton.
- Nico Collins up to 15 (WR7). Sam LaPorta 53 -> 57. Brock Bowers 23 -> 24.

## Refresh next time
See the "Refresh next time Gibbs publishes" block at the end of docs/SESSION_LOG.md.
