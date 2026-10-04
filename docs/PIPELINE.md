# Data pipeline and ship checklist

The full version of what `CLAUDE.md` summarizes. Routed out of the prompt on 2026-09-12 because
`CLAUDE.md` is re-sent every turn and was 258 lines against a 200-line budget. Nothing here was
cut, only moved. `CLAUDE.md` keeps the commands and the one-line traps; the evidence behind each
trap lives here.

## When you ship

- `node --check site/js/app.js` for syntax
- **`python ../.agents/scripts/verify-app.py "Fantasy Football"` before claiming any UI change works.**
  It drives all 23 mapped features headlessly (every route, both league sub-tabs, the roster
  blueprint, Cmd+K, the phone hamburger at 420px) and exits 1 on a failure or a console error.
  A new view ships with its entry in `.agents/feature-map.json`, in the same change.
- `node site/js/origin-slot.test.js && node site/js/starting-lineup.test.js && node site/js/title-odds.test.js && node site/js/projections.test.js && node site/js/team-needs.test.js && node site/js/trade-picks.test.js && node site/js/trade-consolidation.test.js && node site/js/pick-fv.test.js && node site/js/dynasty-claims.test.js && node site/js/gibbs-tiers-source.test.js && node site/js/gibbs-fullppr.test.js && node --test site/js/jacob-gibbs.test.js` to run the test suite
- **"Refresh the data" always means the whole pipeline: `python projections/build_all.py`**
  (the full run, not `--core`). It walks the dependency order: Sleeper dump, KTC, site
  data, IDP, player info, offense components, scores, environment, SOS, categories,
  context, history, then stamps `site/data/build-info.js` from real mtimes. Never ship a
  partial refresh that leaves one fresh column beside stale ones; on the phone they look
  identical. One source it can't run because it needs a hand-fed input file:
  `site/data/build_jacob_gibbs.py`. Run `site/data/build_expert_rankings.py` too if
  `_expert_sources.json` changed. Everything else is in the pipeline.
- **Season-long market lines come from BettingPros now, not a PrizePicks dump.**
  `projections/fetch_season_props.py` (in `build_all.py`, key-free, scriptable) pulls the
  season board off BettingPros' public API, which scouts about 9 books (PrizePicks, Caesars,
  DraftKings, Kalshi, BetMGM, Hard Rock, theScore, Underdog, BetRivers) and returns a
  consensus line **plus both sides' prices**, so a line can be devigged. It writes
  `season-props.json`; `build_offense_components.py` reads that and falls back to the old
  `prizepicks-nfl-season-lines.json` only if it's missing. PrizePicks is still merged in
  for breadth because it is the one board carrying **season receptions** (78 players), a
  market no real book posts.
- **A prop's PRICE is half its information, and only the consensus pair may be devigged.**
  `projections/devig.py` turns the two-sided consensus price into the market's expected
  value, and `season-props.json` carries both (`posted_line` as boarded, `line` as the
  devigged mean, plus `fair_prob_over`). Three rules that are load-bearing:
  - **Never devig `best_over` against `best_under`.** They are the best price on each side
    from different books AT DIFFERENT LINES (97 of 107 rec-yard props disagree). Olave's
    `-140` over belongs to a 999.5 line, not the 1050.5 consensus; paired naively it reads
    as a big over lean when the real consensus pair is `-115/-110`, a 0.5pp nudge.
  - **Counts solve with Poisson, uncapped, no free parameter.** TD lines move on a half-TD
    grid, so a book that means 4.3 posts 5.5 and charges for it. 29% of rush-TD props sit
    >5pp off 50/50 vs 0% of pass-yard props. Solving `P(X>=6)=0.27` puts Kyler Murray at
    4.33 rush TDs. This is where price adds real information; yardage medians barely move.
  - **Extreme yardage leans are alt rungs and get DROPPED, not estimated.** The tell is
    clustering: 8 different players posted at exactly 749.5. Past a 10pp lean the answer
    would come entirely from the guessed CV in `devig.CV`, so the row is dropped and
    Sleeper fills the slot with a visible borrow flag instead.
- **Call `grab_prizepicks_browser.py` once per refresh, not in a loop.** DataDome escalates
  to an interstitial after a few grabs in one session (hit 2026-08-18 on the 4th). A failed
  grab leaves the previous board on disk untouched and `build_all.py` reports 15/16 rather
  than pretending, which is the intended behaviour.
- **The PrizePicks browser dump is scripted now**: `projections/grab_prizepicks_browser.py`,
  in the pipeline. It opens a real **headed** Chrome for ~15s, lets DataDome's script set its
  cookie, then fetches the JSON:API from inside the page and pipes it to `fetch_prizepicks.py`.
  **Do not "optimize" it to headless**: verified 2026-08-18 that the identical code headless
  gets a `geo.captcha-delivery.com` 403 while headed returns 200 / 1351 rows. The visible
  window IS the mechanism. `curl_cffi` with Chrome TLS impersonation still 403s, which is why
  `fetch_prizepicks.py`'s own live path stays dead.
- **The site is hosted, so a local rebuild is not done.** `Fantasy Football/site/` ships
  inside the `trevor-apps` Cloudflare Pages bundle as `ff/`. After any data refresh or UI
  change, re-stage + deploy:
  `powershell -NoProfile -ExecutionPolicy Bypass -File ..\.agents\scripts\deploy-phone-apps.ps1 -Deploy`
- `python site/data/fetch_sleeper.py && python site/data/build_site_data.py` to refresh
  rosters + the player dump only. **Do this before answering any lineup question**,
  `injury_status` goes stale fast, and a stale dump silently starts an IR player.
- `python site/data/build_ktc.py` if KTC data may have changed
- **A new Gibbs board is two commands, and the second is not optional.** He publishes it as
  images: transcribe to `site/data/_sources/<date>.csv`, run `build_jacob_gibbs.py` on it
  (`--updated-at --source --title`) for the rank column, then
  `python site/data/_sources/build_gibbs_brief.py` for `site/gibbs-tiers.html`. Skip the
  second and the column moves while the tier board lies. `gibbs-tiers-source.test.js` pins
  the board to a second, independently typed transcription; regenerate that TSV from the CSV
  and the test stops testing anything. Full detail in `docs/SESSION_LOG.md`.
- **All three leagues are full PPR; Gibbs publishes half.** `build_gibbs_fullppr.py` derives the
  full-PPR board (run it between the two commands above) and is the third command in that chain.
  It re-sorts RB/WR/TE only, by the reception bonus only, and holds every QB slot and tier size.
  It is a DERIVED board and must never be presented as his. `gibbs-fullppr.test.js` asserts those
  promises and each of its guards was proven to fail on a corrupted board.
- `python site/data/build_expert_rankings.py` after editing `site/data/_expert_sources.json`
  (the hand-editable expert-ranking sources); regenerates `site/data/expert-rankings.js`
  with Sleeper IDs resolved. This is how you add a new analyst's rank column
  (Gibbs, Kiorkof, ...) alongside the Vegas/Sleeper context. Toggle columns on the Sources page.
- Smoke-test by booting `python -m http.server 8765` in `site/` and opening
  http://localhost:8765
- Commit your own finished work without asking: stage only your files, then push the
  branch.


## Why each trap above exists, in one line

- The devig rules exist because pairing `best_over` against `best_under` reads a 0.5pp nudge as a
  big over lean, and 97 of 107 rec-yard props disagree on the line the two best prices belong to.
- The headed-Chrome rule exists because the identical code headless returns a 403 from
  geo.captcha-delivery.com while headed returns 200 and 1351 rows, verified 2026-08-18.
- The Gibbs three-command chain exists because skipping the brief rebuild moves the rank column
  while the tier board keeps showing the old tiers, so the page contradicts itself.
- The full-pipeline rule exists because a partial refresh leaves one fresh column beside stale
  ones, and on a phone those look identical.
