# Session log — what was built when

Chronological summary of work done in chat. Most recent at the bottom.

## May 2026 — IA + dynasty framework session

### Trade-suggestion bug (UPTIER both QBs in superflex)

Fixed in `tradeStrategy()` UPTIER block (~line 2725 of app.js). Was picking
the top-2 startables from a single surplus position, which in the user's
superflex league meant suggesting both Allen and Caleb in one trade. New
logic: take 1 quality startable + 1 non-startable depth piece from a
surplus position, and refuse to pair two startables from the same position
unless surplus there is ≥ 2.

### IA restructure (Ralph Loop session)

Replaced the flat sidebar with grouped sections (Overview / Players /
Dynasty / Tools / Reference) and added sub-tab routing to the heavy views:

- **Dashboard** → 4 sub-tabs: Overview / Leagues / Market / Cornerstones
- **League** → 3 sub-tabs (final form): Standings / Players / Timeline
- **Roster Blueprint** → 3 sub-tabs: Snapshot / Strategy / Roster (or
  "Trade Angles" instead of Strategy on non-self rosters)

Added breadcrumbs, page eyebrows + format tags, persistent league context
in the sidebar (`is-context` violet stripe + inline sub-nav with Standings
/ Players / Timeline / My Roster / Trade Lab when inside a league),
mobile hamburger + scrim, editorial thin-underline tab bar styling.

### Rankings reverse-engineering experiment

User asked to isolate one of two source rankings that were averaged to
produce a FantasyPros draft list. The math: `unknown = 2 × AVG − pasted`.
Verified by checking that all AVG values were `.0` or `.5` (confirming
exactly two sources averaged) and STD.DEV = `|unknown − pasted| / 2`.

Outputs saved at repo root:
- `_isolate_ranking.py`
- `_pasted_rankings.tsv` — the FantasyPros draft list
- `_isolated_ranking.tsv` — the reverse-engineered second source

### Beyond the Box Score positional rankings

Saved from screenshots:
- `_beyond_box_score_rb_rankings.tsv` (77 RBs, season redraft)
- `_beyond_box_score_wr_rankings.tsv` (76 WRs)
- `_beyond_box_score_te_rankings.tsv` (32 TEs)

All flagged as 2026 *season redraft* half-PPR, NOT dynasty.

### KTC pick valuations end-to-end

User asked to use KTC as the source for pick values relative to players,
specifically pick value based on the originator's projected finish in
that year.

Implementation:
- `build_ktc.py` now extracts `position: "RDP"` entries into a `picks`
  array per ranking
- `pickIndex()` builds `season|slot|round → KTC value` lookup
- `pickValue(season, round, originRosterId, league)` reads KTC first,
  falls back to strategy.js
- `slotToBucket(slot, totalRosters)` maps 1..N projected finish → early/mid/late
- `originSlot()` uses `computePlayerStrength` (not full strength) to
  break the recursion that would otherwise form

Picks now contribute to:
- `computeRosterStrength` (roster total)
- `gradeDraftCapital` (value-weighted vs league avg)
- DOWNTIER trade-strategy synthetic pool
- Trade Calculator pile + pool
- Cmd+K palette ("2027 Early 1st" searchable)

### 3-Year Outlook in Trade Calculator

Added to the middle summary card:
- `dynastyDecay(age, pos)` returns one-year multiplier; calibrated to
  position curves
- `projectAssetValue` + `projectSideValue` walk a side, age each asset
- New rows in middle card: Today / +1 yr / +2 yr / +3 yr with net Δ for
  each side, colored by gain/loss

### Code review pass

User asked for a self-review of the work. Identified and fixed:
- Memoized `gradeDraftCapital`'s league-avg into `leaguePickAvg(lg)`
- Keyed `_pickIndex` on enabled-sources signature (was unconditionally
  walking every source)
- Tightened `projectSideValue` symmetry comment + collapsed dead vars
- Added KTC pick coverage warning when fallback fires for current+2yr
  window

### Dynasty Domain "Jeremiah Smith" framework

Pulled YouTube transcript via yt-dlp, extracted principles, encoded into
`strategy.js`:

- `pick_class_premium["2027"]` — +38.5% early / +17.5% mid / +11% late
- `pick_hit_rates` — empirical hit rates per round
- `share_framework` — baseline / contender_lock / rebuild_floor
- Five new coaching tips: `27-pick-overconcentration`,
  `27-late-1st-sell-window-contender`, `rebuild-pick-ceiling-warning`,
  `pick-liquidity-warning`, `value-share-contender-lock`

UI surfaces:
- Roster Blueprint "Strength" stat shows `XX% picks` chip (liquidity)
- Trade Lab pick rows show `+38%` class-premium chip with tooltip

Source: https://www.youtube.com/watch?v=ZK5VpWQQveE
Transcript cached at `transcripts/ZK5VpWQQveE.txt`

### Value Share as first-class metric

Promoted from hidden-ctx-field to visible:
- `leagueValueTotals(lg)` (cached) + `valueShareFor(roster, lg)` +
  `classifyValueShare(share, baseline)` helpers
- Roster Blueprint banner: "Value Share" stat with band chip
  (CONTENDER / ABOVE AVG / BELOW AVG / REBUILD)
- League Standings rows: share % colored by band, with tooltip

Verified: in the 10-team taco league, baseline = 10%, user sits at 9.5%
(BELOW AVG), Karl Havoc at 14% is the only CONTENDER.

### League → Players + Timeline tabs

Replaced the old "Cornerstones" tab with two new ones:

**Players** — ranking view scoped to the league:
- Full dynasty list overlaid with this-league ownership
- Sortable columns (Rank/Player/Pos/Age/Value) with arrow indicators
- Sticky thead, clickable owner cell links to that roster
- Filters: position, category, scope (all/rostered/free/mine), search
- Filter state persists per-league
- **DST/K excluded always; IDP excluded unless league is IDP** (user
  feedback)

**Timeline** — lazy-fetched Sleeper transactions:
- Pulls `/league/{id}/transactions/{week}` in parallel up to current week
  (season) or week 18 (off-season)
- 30-min localStorage cache, refresh button busts
- Filter pills with live counts: Trades / Waivers / FA / Drafts, "My
  moves only"
- Trade rows show **value-swing chips** per side (received KTC − sent KTC)
- Pick labels now use exact notation when Sleeper publishes draft order
  ("2026 1.06"); unknown future slots stay generic ("2027 R1").
- Editorial timeline rail (border-left axis, month gutters, icon dots)

### Docs consolidation (this commit)

Created `CLAUDE.md` at repo root + `docs/` folder with:
- `USER.md` — Trevor's profile, voice, preferences, feedback history
- `FRAMEWORKS.md` — KTC, Dynasty Domain, headliner rule, value share,
  liquidity, aging curves — all in one place
- `ARCHITECTURE.md` — internals: caches, recursion break, routing, views
- `SESSION_LOG.md` — this file

## 2026-07-29 — app.js refactor audit + plan (docs only, no code moved)

Demonstration run of the workspace `refactor-god-file` skill on `site/js/app.js`
(measured 7,718 lines — one IIFE, ~220 symbols, zero exports). Produced three
docs under `site/refactor/` (additive scratch, no app code touched):

- `AUDIT.md` — every top-level symbol inventoried into 15 concern groups with
  line numbers, side effects, and dependencies; notes the dead views
  (`viewRankings`/`viewAllPlayers` are unreachable — router maps `#rankings`/
  `#players` → dashboard), the 9 memo caches, and the single `fetch` (in
  `renderLeagueTimeline`).
- `REFACTOR-PLAN.md` — target ES-module tree under `site/js/` (config/dom/state
  → data/indexes → scoring/* → picks/projections → ui → views → router → slim
  `app.js`), a 22-step leaf-first extraction sequence, and the inverted-shim
  strategy (imports pulled *back* into `app.js` since nothing external imports
  it). Preserves the no-build constraint and the `computePlayerStrength` vs
  `computeRosterStrength` cycle-break as a module edge.
- `CHECKPOINT.md` — Phases 0-2 done; next action is Phase 3 (lock the plan).

Not started: Phase 0's git branch + baseline. The existing `.test.js` files
can't import the IIFE, so they aren't a real parity net — a render smoke test
is needed before any code moves. Nothing here changes the app.

## Aug 2026 — Trade calc: headliner / consolidation premium

The Trade Calculator now applies KTC's "Value Adjustment." Before, the verdict
was pure `min/max` of raw KTC sums, so trading one 9,000 stud for three pieces
that sum to 9,000 read as perfectly FAIR — which violates the house headliner
rule (a pile of lesser pieces does not substitute for a stud). Now the side
giving up the bigger single asset gets a premium added to its *sent* value, so
a raw-even swap correctly reads as favoring whoever receives the headliner.

- New pure `consolidationPremium(aSize,bSize,aHead,bHead)` in `app.js`:
  `0.15 * gap * spread`, `gap = 1 - loHead/hiHead`, `spread = min(1,
  extraPieces/3)`. Zero for a true 1-for-1, capped at the documented 15%.
- `KT.assetValue` extracted from `valOf`; new `KT.headlinerOf` (max single
  asset, picks included). `computeFairness` takes headliners and boosts the
  headliner-giver's side before the min/max + verdict.
- A note under the verdict names the side + % whenever the premium fires.
- Self-check: `node site/js/trade-consolidation.test.js` (slice-eval of the
  pure premium fn; monotonic in gap and piece count, symmetric, 15% ceiling).
- Verified end-to-end: even 1-for-3 → FAIR 94.7% (+5.6% to headliner side);
  even 1-for-6 → CLOSE 88.9% (+12.5%); 1-for-1 studs → no premium.

Pre-existing test rot noted (not from this change): `trade-picks.test.js`
asserts `drafts[0].status === 'pre_draft'` but live Sleeper data now says
`complete` (2026 rookie draft finished); `jacob-gibbs.test.js` expects
`jacobGibbsCell(` which a concurrent expert-rankings refactor was mid-way
through renaming.

## August 2026 — Expert rankings registry (extensible columns)



### Generalized the single Gibbs column into an expert-rankings registry



Trevor wanted to add expert rankings (two Andrew Kiorkof videos) "like the

gibbs rankings", and for the site to allow adding *any* expert rankings he

wants alongside the Vegas market (PP-Slp) and Sleeper context columns.



- New `window.EXPERT_RANKINGS` registry (`site/data/expert-rankings.js`,

  generated by `build_expert_rankings.py` from hand-editable

  `_expert_sources.json`; resolves each player to a Sleeper ID).

- app.js: replaced the hardcoded `jacobGibbs*` header/cell/sort functions with a

  generic layer (`expertSources`/`activeExpertSources`/`expertHeaders`/

  `expertCells`/`expertRankOf`). Gibbs is now just the first source, adapted from

  the generated `JACOB_GIBBS_RANKINGS` file (untouched, still source of truth).

  Every table that showed the Gibbs column now spreads N expert columns.

- Sortable per-source columns via `xr:<id>` sort keys in the League Players table.

- Overall-scope sources show `#rank`; positional sources (Kiorkof: RB+WR top-36)

  show `pos+posRank` (RB1, WR7...). QB/TE rows show blank for a positional source.

- Per-source visibility toggle on the Sources page (`enabledExpertCols` setting).

- First new source: Andrew Kiorkof 2026 Top-36 RB & WR (half-PPR redraft), pulled

  from the two YouTube videos via YouTube auto-captions (whisper stalled on the

  ~45-min audio); 71/72 players Sleeper-matched (Gainwell absent from snapshot).

- Add a future expert: append to `_expert_sources.json`, run the build script.

- Updated `jacob-gibbs.test.js` to assert the generic wiring + registry data

  integrity (ranks unique per position, ids/tiers present).

- Verified in a real headless render: both columns show, Kiorkof sort interleaves

  RB1/WR1/WR2/RB2..., toggling Kiorkof off hides only its column, no console errors.

## August 2026 — lineup truth + what-if

Design doc: [`plans/2026-08-07-lineup-truth-and-whatif-design.md`](plans/2026-08-07-lineup-truth-and-whatif-design.md).

Started as "where would I rank if I added these four WRs" and turned into
fixing the four ways the app was answering that question wrong.

### Legal lineups (the big one)

`startingStrength` — which powers PV, FV, the trajectory chart, and every
roster's contender/rebuilder stance — summed the top-K assets by value with no
regard for position. In a 1QB league it started two quarterbacks whenever the
QB2 outvalued a flex body. Replaced with `offenseStartingSlots` (reads real
`roster_positions`) + `fillLineup`, which assigns value-sorted assets to their
most-constrained eligible slot. Optimal here because slot eligibility nests:
QB ⊂ SUPER_FLEX, RB/WR/TE ⊂ FLEX ⊂ SUPER_FLEX. Measured on Password is taco:
tdub1329's PV fell 574.0 → 539.8 and his rank 5th → 7th.

`optimalOffense` (the points-side lineup) now runs through the same filler, so
there is ONE slot model instead of three. `offenseSlots` was deleted.

### Taxi, IR, and injuries were all startable

`optimalOffense`/`optimalDefense` read `roster.players` raw, and Sleeper's
`players` array includes taxi and reserve. New `startableIds(roster, opts)`.
Points lineups always exclude stashed players; the value model excludes them
from PV but INCLUDES them in FV, because taxi eligibility expires.

Worse: `build_site_data.py` was dropping `injury_status` entirely, so the app
had never seen an injury. Ricky Pearsall was on IR (PCL) and starting in every
projection. The pipeline now carries `injury_status` / `injury_body_part` /
`injury_start_date` / `injury_notes` / `practice`, `isSidelined()` benches
Out / Doubtful / IR / PUP / NA / Sus / DNR / COV, and an `injuryChip` renders
on roster rows, position columns, and search results. Questionable deliberately
still starts — benching every Q would gut every in-season projection.

### League-specific scoring

`p[src]` in projections.js is pre-scored under one fixed rule set (INT −1, see
`score_offense.py`). `leagueScorePoints(stats, lg)` rescores from the raw stat
line already in the file, so Password is taco gets its INT −2. Falls back to the
precomputed total when a source has no stat line, so a missing projection reads
as "skip", never as zero.

### Rookie startability on converted picks

FV folded a converted pick in at full KTC value, so a 2027 2nd read 44.3 — the
same as a proven WR3. Calibrated the gap against this repo's own data (2026
blended projections vs KTC 1QB value, 330 matched players): median actual /
value-implied points runs 0.85 at 21-22, 0.93 at 24, 1.09 at 26-27, 1.42 at 30+,
and 0.75 for true rookies. `rookieStartability` applies 0.75 → 0.85 → 0.93 → 1.0
from the draft year. Only picks get it; rostered players keep full value.

Known remaining bias, deliberately unfixed: the same table shows dynasty value
UNDER-prices 30+ production ~1.4x, so FV still penalizes aging vets. That runs
through every value view, and the points model already exists for people who
want points.

### What-if tray

New tray above the Projections board (`buildWhatIfTray`). Search any projected
player, add him to your roster hypothetically, and the whole board re-ranks with
per-team Δ and ▲/▼ rank movement. Adds only — what you'd give up is the Trade
Lab's job. Not persisted, by design.

### Trade search: one button

The Trade Lab's player search had two ambiguous buttons ("+ Send" / "+ Get").
Now one, chosen by ownership: Send if he's on the send side's roster, For if
he's anyone else's, with the owning team named inline.

### Tests

New `starting-lineup.test.js` (slot legality, SUPER_FLEX, pick-can't-steal-QB,
rookie ramp, degenerate rosters). `projections.test.js` extended with taxi/IR
exclusion, league rescoring, injury gating against a synthetic PLAYERS map, and
what-if splice idempotence (a starter added twice must not score twice — this
caught a real double-count).

### Championship odds (the "% chance to win a ship" ask)

Season points rank rosters; they do not say who wins. This league sends 6 of 10
to the playoffs and decides the rest in three single-week rounds, so title odds
are not remotely linear in projected points. `championshipOdds(lg, opts)` runs a
Monte Carlo over the real league settings (`playoff_teams`, `playoff_week_start`)
and returns each roster's playoff / bye / final / title rate.

Per simulated season, per player:
- a **season-long lognormal projection error** (sigma 0.35), drawn once. This is
  the load-bearing piece. Summing only weekly noise assumes the projections are
  RIGHT and just the weeks are random, which makes the favorite win far too often
  — the first cut had the top roster at 31% and the 8th at 0.2%.
- weekly noise (CV 0.34 QB / 0.55 RB / 0.62 WR / 0.60 TE)
- a random bye week
- an **injury process with duration**, not a per-week coin flip: expected games
  missed by position (1.5 QB / 3.0 RB / 2.3 WR / 2.6 TE) with a +12%/yr penalty
  past a positional age shoulder, converted to a weekly hazard, mean absence 3
  weeks. Live Sleeper designations start a player already out (IR = 6 weeks).
- plus a correlated **team-week shock** (CV 0.14), because ten starters summed
  independently is far too smooth — real teams share game scripts and blowouts.

Lineups are set each week on EXPECTED points among available players, then
actuals are sampled. That order is what makes depth show up as value: a manager
cannot see Sunday. `mulberry32` + Box-Muller keep it deterministic, because a
title percentage that jitters between renders is useless for comparing trades.

**Performance.** First working version took 30s for 2000 sims. A CPU profile
(not guesswork — two wrong guesses preceded it) put 50% of the time in the RNG
closure, which turned out to be `vm.runInContext` overhead in the test harness,
~12x slower than the main realm. Real cost is ~2s for 4000 sims. Two genuine
wins stayed: `fillLineup` gained an early exit and a `presorted` flag, and
`rollSeason` now sorts the pool once per season instead of once per team-week
(a player's season multiplier is fixed, so the order cannot change).

UI: "Run title odds" on the Projections board adds Title% / Playoff% columns, and
with the what-if tray armed a ΔTitle column prices a hypothetical in championships
instead of points. Results cache against league + source + sim count + what-if set.

`title-odds.test.js` pins the invariants a Monte Carlo can't be eyeballed for:
champion mass sums to exactly 1, playoff mass to exactly 6, wins sum to one per
matchup, title <= final <= playoff per team, same seed replays exactly, adding a
stud never lowers your own odds, and a what-if on one roster does not leak into
another's.

### Multi-year title equity

The first cut of `championshipOdds` answered ONE season. That's the wrong horizon
for a dynasty trade, so it grew a `yearsOut` option: age every roster in the
league forward, convert everyone's picks into rookies, and re-run.

Two pieces had to be built, and the first one is easy to get wrong:

**`productionRetention` is not `ageRetention`.** Dynasty VALUE falls faster than
PRODUCTION, because value prices a player's whole remaining career while points
price one season. A 32-year-old WR still produces; he just isn't worth anything
in a trade. Reusing the value curve here would have double-counted decline.

Fitting the production curve to this repo's own projections was tried and
**rejected**: cross-sectionally, a 32-year-old startable WR looks as good as a
25-year-old, because the 32-year-olds who lost a step already fell out of the
startable pool. That's survivorship, not durability. `PROD_CURVE` uses
longitudinal shapes instead (grow to peak at +7%/yr, hold, then a compounding
decline that accelerates past the shoulder: RB 13%/yr, WR 8%, TE 7%, QB 6%).

**`pickRookiePoints`** converts a pick's KTC value into expected rookie-season
production through the same value→points relation the rookie-startability
calibration used, times the measured 0.75 rookie factor.

`whatIf` gained `spendPicks` / `gainPicks` so a trade removes the picks you sent
AND hands them to the rival who received them. Without that the out-years flatter
you: your rivals have to get to convert what you sold them.

Tests pin the distinction (production aging is gentler than value aging, RBs fall
faster than WRs, QBs age best, decline compounds) plus the two directional facts
the whole exercise rests on: spending a 2027 first costs you 2027 production and
gains the receiver 2027 production, while in the current season a pick is worth
exactly zero.

### The horizon error, and the dynasty-* skill family

Trevor caught a real methodological failure. A rebuild was scored on a 3-year
window and lost, which is question-begging: a rebuild sacrifices years 1-3 BY
CONSTRUCTION and pays off in years 4-8. The test was rigged, not the strategy.

Two fixes.

**The model was missing the engine that makes a rebuild work.** Pick values were
flat regardless of where the owner finished, so losing bought you nothing and the
simulator could only ever say "contend". `pickValueBySlot` now slots each pick by
its ORIGINAL team's projected finish (~6% per slot off the KTC rookie curve, so
the worst roster's first is worth ~1.7x the best roster's), and `titleEquity`
runs seasons in sequence, feeding each year's finish into the next year's pick
slotting. Note the sign: rank 1 is the STRONGEST roster and gets the WEAKEST pick.
That was backwards on the first pass and the test now pins it.

`titleEquity(lg, {years, discount})` returns per-year title odds plus discounted
equity. The discount is a league-SURVIVAL hazard (leagues fold, managers quit),
not a cost of capital.

With the horizon fixed, the rebuild's payoff shows up exactly where Trevor said it
would: 23.5% and first place in 2032, 38.9% and first in 2034. It still loses on
discounted equity at every horizon and discount tested except 10 years at zero
discount, where it wins outright. That is the honest answer, and it is a statement
about how long you plan to keep playing, not about roster construction.

**The doctrine was improvised, so it got carved into skills.** A 15-agent workflow
researched contention windows, rebuild sequencing, retool-vs-teardown, championship
equity mathematics, asset timing, and format leverage, then carved 7 atomic skills
(from ~60 candidates, with the rejects and reasons recorded) and drafted them in
parallel: `dynasty-championship-equity-horizon`, `dynasty-roster-phase-diagnosis`,
`dynasty-rebuild-clock`, `dynasty-age-curve-timing`, `dynasty-pick-portfolio-valuation`,
`dynasty-league-format-leverage`, `dynasty-trade-construction`.

An adversarial critic then found real defects, and the ones that mattered were fixed
rather than filed:
- The most-quoted line in the family, the sell trigger, cited the wrong curve. The
  prose derived it from "PROD hold-to minus one" (25/27/28/32) while the stated
  ages matched the VALUE sell column (26/28/30/31). In the one skill whose entire
  thesis is "never substitute the curves". Now a table, with the bad derivation
  called out by name.
- Risk posture contradicted roster shape: one skill said concentrate below 10% odds,
  another said depth before headliners above 35% concentration. The cap now wins,
  explicitly.
- The discount-rate ban (no rate above 10%) contradicted the 10-15%/yr asset discount
  in a sibling skill. They are different quantities; both skills now say so.
- The pick-to-points formula already contains the 0.75 rookie factor and the skill
  told you to multiply by it again, building the exact trap its own failure-mode
  section warns about.

Mirrored to `.agents/`, `.claude/`, `.cursor/` (real copies, byte-identical, no
symlinks) and registered in `skills-lock.json` as local/self with sha256 hashes.
42 entries now.

## 2026-08-08 - Finishing the dynasty family: measuring what the last pass asserted

The previous session hit its usage limit immediately after writing
`dynasty-player-evaluation/SKILL.md`. That left the two newest skills unmirrored,
unregistered, absent from the routing table, and, more seriously, carrying numbers
nobody had ever computed. This pass re-derived every measured claim in the family
from the actual data files and fixed what did not survive.

**What verified exactly**, recomputed from `ktc.js`, `projections.js`, `players.js`
and `leagues.js`: 559 projected skill players, 302 rostered, 257 free (46%); best
free agents Geno Smith 196 / Freiermuth 120 / Dike 89 / Brooks 62; the 337-player
1QB-vs-superflex pairing giving a 0.70x relative QB discount, steepest at the top;
and the rostership correlations (owned 0.880, started 0.825, gap 0.198, n=379).

**What did not.** Three load-bearing numbers were wrong, all three from reading a
single 6000-sim Monte Carlo as though it were a measurement.

- **"Dropping the QB3 improved title odds by 0.08pp."** It does not. Re-measured
  across 5 seeds x 15,000 sims, paired by seed, it costs 0.18pp. At 6000 sims the SE
  on a 1.4% baseline is ~0.15pp, so the original delta was smaller than its own noise
  and came back sign-flipped.
- **"Selling Mike Evans costs 2.8pp, the largest on the roster."** Never measured,
  and impossible on its face: you cannot lose 2.8 percentage points from a 1.4%
  baseline. The real figure is 0.76pp, and it is the *smallest* loss among the
  roster's four best assets (McBride 0.87, Jeremiyah Love 0.91, Achane 0.93). That
  inverts the verdict. Evans is the cheapest top asset to convert into futures and
  the one the market underprices, which is the definition of a sell window, and the
  corrected call now agrees with `dynasty-age-curve-timing` instead of contradicting it.
- **"Nico Collins is worth +3.5pp, a 15-to-1 conversion."** Measured at +1.55pp. The
  real transaction, trading both spare QBs for a startable WR, is **+0.82pp** net,
  roughly 3-to-1. Dropping a player for nothing is the control, not the trade.

**Contradictions closed.** `dynasty-league-format-leverage` said "roster exactly 2
QBs" while `dynasty-replacement-level` said "keep exactly one". Both were computing
the same 6-to-9 points a season of insurance and drawing opposite headlines.
Replacement level is now named as the authority and both say one QB. The free-agent
share appeared as "~40%", "roughly half" and 46% across the family; it is 46%
everywhere now. Rostered-player counts said "~200 (10 x ~20)"; measured 304, 30.4
per team.

**The gating question that was never answered.** format-leverage declared the
taxi/IR rule gating and then answered around it in every worked example, including
the five-firsts accumulation plan. `roster_positions` lists no TAXI or IR, which
reads like "no taxi" and is wrong: Sleeper keeps the counts in league `settings`,
which the export dropped. Occupancy was observable the whole time. Every team carries
taxi, [5, 4, 3, 5, 2, 5, 5, 4, 4, 2], and the owner is tied for fewest at 2 against
five rivals at 4 and 5. So a stash costs zero here, and there are free stash slots
sitting unused on a roster whose whole thesis is accumulating young assets.
`build_site_data.py` now captures `taxi_slots`, `reserve_slots`, `waiver_type` and
`waiver_budget`, so the next data rebuild answers it outright.

**Gaps closed.** The waiver/FAAB channel, the last of the three critic gaps, now
lives in `dynasty-replacement-level`: how to read the waiver rule, FAAB bid sizing
off VOR share rather than habit percentages, why a rebuilder's budget buys age
instead of points, and what a reverse-standings claim is worth instead. The horizon
rule `H >= max(7, years_to_flip + 4)` was missing from the three skills that issue
horizon-dependent verdicts, including `dynasty-trade-construction` step 7, which the
critic called the re-entry point for the original 3-year error. All three now carry it.

**New check.** `site/js/dynasty-claims.test.js` re-derives every measured number the
skills quote, straight from the data files, and fails when a data refresh invalidates
a doctrine claim rather than letting it rot silently. Banded, not pinned, so a routine
rebuild does not break it. Added to the suite in `CLAUDE.md`.

Family is 9 skills, mirrored byte-identical to `.agents/`, `.claude/`, `.cursor/` and
`.codex/` (the last of which the previous pass missed entirely), zero symlinks,
44 lockfile entries.

### Closing the three gaps, and a handoff verification

The critic's three unfixed gaps got closed with measurement rather than assertion.

**1QB QB discount, quantified.** Measured across 337 players appearing on both KTC
boards: QB median 1QB/SF ratio is 0.859 against a skill-position baseline of 1.221,
so a QB is worth **0.70x** as much relative to skill players in 1QB as in superflex.
Steepest at the top, which is counterintuitive: QB1-6 is 0.63x, QB25+ is 0.75x,
because superflex demands two starters and concentrates scarcity where 1QB does not.
Lives in `dynasty-league-format-leverage`.

**Replacement level and the waiver channel.** New `dynasty-replacement-level` skill.
46% of projected skill players are unrostered in Password is taco and the best free
QB projects 196 points, which reprices the entire bench. Measured: the two spare QBs
cost ~0.2pp each to lose but are worth **+0.82pp traded for a startable WR**, a
conversion nothing else on the roster comes close to.

**Player evaluation, with an explicit refusal.** New `dynasty-player-evaluation`
skill covering what the repo CAN measure (value-vs-projection divergence, rostership
as a second market price, injury status, expert dispersion) and naming what it cannot
(college dominator, NFL draft capital, target share, snap share, scheme). The family
can price a 1.03 and cannot say who to take with it. The skill says so rather than
fabricating a ranking from age and KTC.

**Handoff verification.** A second agent picked this up mid-stream. Its work checked
out and improved on mine in two places worth recording:

- Its QB tier ratios were right and mine were wrong. I had used
  `g[Math.floor(g.length/2)]` as a median, which takes the upper element on
  even-length arrays. Its version averages the two middles. Small, and it was the
  headline table.
- It caught that my per-asset title deltas were inside the Monte Carlo noise floor.
  At 6000 sims the SE on a 1.4% baseline is ~0.15pp, so my "dropping Jordan Love
  IMPROVES odds by 0.08pp" was noise, not a finding. Re-measured across paired seeds
  it costs 0.25pp. An independent 8-seed x 6000 run reconciles with its 5-seed x
  15,000 run on every case.

One thing it left undone: `build_site_data.py` was extended to emit `taxi_slots`,
`reserve_slots`, `waiver_type` and `waiver_budget` but never re-run, so `leagues.js`
still lacked them while the skills gated on that data. Regenerated. Password is taco
carries 5 taxi slots, 2 IR, FAAB with a 201 budget.

The refresh also moved the rostership correlations (owned% 0.880 to 0.886, gap 0.198
to 0.233 over two days), so those are now stamped with a date and an n, and
`dynasty-claims.test.js` re-derives them rather than trusting the prose.

### The phase-diagnosis bug: classifying on current odds instead of reachable odds

Trevor pushed back on the skill family: "seems like it's pushing my window so far out?
I would have to wait so long for my team's value and odds to pick up." He was right,
and it exposed a real doctrinal bug rather than a wording problem.

`dynasty-roster-phase-diagnosis` assigned its phase from `titleOdds(y=0)`. That number
is depressed by every asset contributing nothing to a lineup TODAY, and draft picks
contribute exactly nothing by construction. So a young roster holding five firsts posts
0.14x fair share and gets labelled DEEP REBUILD, when those firsts are precisely the
ammunition to contend immediately. Measured conversion gap on this roster: **7.3x**
(1.4% current, 10.2% reachable).

The rest of the family inherited the error. `dynasty-rebuild-clock` set a clock and a
2029 flip. `dynasty-age-curve-timing` ran its hold/sell override on the 0.14x figure,
which made every veteran an unconditional sell.

Measured cost of the prescription, feedback off, 2500-4000 sims per season:

| Plan | 2026 | 2027 | 2028 | 2029 | 2030 | DCE 10y @0.88 |
|---|---|---|---|---|---|---|
| Convert and contend | 10.2% | 9.2% | 8.5% | 7.7% | 5.2% | 43.1% |
| Do nothing | 1.4% | 4.0% | 6.1% | 9.0% | 9.7% | 42.5% |
| The prescribed teardown | 0.0% | 0.0% | 0.1% | 0.4% | 1.0% | **21.0%** |

Five consecutive last-place seasons, for half the equity of doing nothing. And doing
nothing was never a long wait for this roster: it reaches 3rd in the league by 2029
unaided, because the top three assets are 21, 24 and 26.

**Fixes.** Phase diagnosis now computes `titleOdds_now` AND `titleOdds_reachable`
(every zero-contribution asset converted at market, both sides modelled), classifies on
the reachable figure, reports the conversion gap, and adds a WIN-NOW CAPABLE band for
the 0.8x-1.5x case. A gap above 3x means the diagnosis is CONVERSION, not phase.
The age-curve override reads the reachable number and drops its hold bar from 1.5x to
1.0x for a format whose ceiling is ~30%. The rebuild clock keeps its machinery but its
worked example is now the counter-example, with three explicit preconditions a roster
must fail before a clock may start.

**Two model artifacts documented rather than hidden**, as a new Step 10 in the horizon
skill. There is no roster persistence: a "+6 years" roster is today's roster aged six
years with every pick converted, which biases against rebuilds because a real rebuilder
keeps trading. And the draft-slot feedback loop oscillates without damping, sawing a
do-nothing roster between 3rd and 6th in alternating seasons while the same seasons run
smooth and monotone with feedback off. Year-by-year figures past +3 are now explicitly
not quotable as predictions.

The horizon skill's flagship worked example had been built on invented p_t shapes that
produced "rebuild wins by 0.216". Replaced with the measured trajectories, which teach
the same mechanic (the raw sum favours patience, discounting reverses it) without
arguing for a teardown the data rejects.

## August 16, 2026 — Gibbs top-175 tier sheet, transcription guard, and a tier board

CBS Sports published Jacob Gibbs' 2026 board on August 14 (top 175 overall, 16 tiers,
single-QB managed half-PPR redraft) with the rankings living only inside two embedded
images, so there is no machine-readable source anywhere. Trevor sent phone photos of both
pages over Telegram and two operator jobs fired on them concurrently. Both typed all 175
rows by hand, one from the full-resolution article images and one from the phone photos,
without either reading the other's file. The two transcriptions plus the build CSV were
diffed three ways and agree on every field of every row, so the numbers in
`site/data/jacob-gibbs.js` are corroborated rather than single-pass OCR.

**Validation that ran before anything shipped.** Bye week is a team property, so every
row's bye was checked against the team-to-bye map derived from the previous Gibbs board:
zero mismatches across 175 rows, all 32 teams present, ranks contiguous 1 to 175, tiers
monotonic 1 to 16, no duplicate names. Every player resolved to a Sleeper id with the
position and team Sleeper carries.

**New artifacts.**

- `site/data/_sources/jacob-gibbs-2026-08-14_independent-transcription.tsv` — the second
  transcription. It is **not** a build input; `jacob-gibbs-2026-08-14.csv` is. Its only
  job is to be a copy nobody derived from the CSV. `site/data/_shots/gibbs-tiers-2026-08-16-p*.jpg`
  are the phone photos it was typed from.
- `site/js/gibbs-tiers-source.test.js` — pins the generated board to that TSV field by
  field, re-checks the one-bye-per-team invariant, and asserts the deep board survives.
  Added to the suite line in CLAUDE.md. Regenerating the TSV from the CSV would leave this
  test asserting a file against itself, which is why the file says so at the top.
- `site/data/_sources/build_gibbs_brief.py` — the one tier-board generator, writing
  `site/gibbs-tiers.html` (linked from the Sources page, live at `/ff/gibbs-tiers.html`).
  Search, position filters, bye weeks, which of the three Sleeper rosters own each player,
  the rank move since the previous Gibbs board, and a per-league read: best you hold, who
  Gibbs soured on, who he warmed to, and who is still unrostered in that league. No network,
  no build step. A second generator briefly existed in this session and was folded into this
  one; only this file writes a board now, so a Gibbs refresh means re-running it.

**The 315-player board was not thrown away.** The tier sheet replaced the contents of
`jacob-gibbs.js`, which had held Gibbs' 315-player FantasyPros export with SOS and
ECR-vs-ADP. It is archived byte-for-byte at
`historical/jacob-gibbs-2026-07-20-fantasypros-315.js` and, so it stays queryable rather
than just stored, it is also the `gibbs-fp-2026-07` source in `_expert_sources.json` with
`defaultEnabled: false`. It adds no column unless toggled on from the Sources page, but it
still covers the 140 players the tier sheet stops short of and it is what the tier board's
movement numbers are computed against.

**Two small fixes found on the way.** `expert-rankings.js` had a plain-English label in
app.js's freshness map but was missing from `build_all.py`'s `TRACKED` list, so it never
got a freshness stamp; it is tracked now. And `build_expert_rankings.py` lacked the
`NAME_ALIASES` map its sibling `build_jacob_gibbs.py` has, which is why Hollywood Brown
never resolved to Marquise Brown.

**What the new board says relative to July 20.** Biggest risers are De'Zhaun Stribling
(+141), Cyrus Allen (+136), Jack Bech (+84), Stefon Diggs (+81) and Malik Washington
(+66). Biggest fallers are Travis Kelce (-48), Dak Prescott (-33), Mark Andrews (-32),
Jordan Love (-30) and Patrick Mahomes II (-29). Twelve players who were inside his July
top 175 are off the board entirely, Ricky Pearsall (89) the highest. This is a redraft
board, so it prices 2026 production only; KTC remains the dynasty value source of truth.

**Two jobs on one board, and what that cost.** Both operator jobs built a tier-board
generator without knowing the other existed, which is pure duplicated effort and the reason
this section exists. It resolved cleanly, and the detail is in "One generator, one page"
below: the second generator's features were folded into `build_gibbs_brief.py` and the file
itself moved to `historical/` rather than being deleted. The part that was not waste is the
transcription. Two people typing 175 rows off the same images
independently, then diffing, is a real check that one person typing them twice is not, and
it is the only reason the numbers can be called verified rather than proofread. When a
board arrives as images again, the transcription is worth doing twice on purpose; the
tooling around it is not.

### Aug 16, 2026 — the two Gibbs jobs reconciled to one board

Two jobs ingested the same rankings at the same time. They are now one path.

**The transcription is verified, not merely careful.** The two jobs typed the 175 rows
out of the CBS images independently and never saw each other's file. A field-by-field
diff of `_sources/jacob-gibbs-2026-08-14.csv` against
`_sources/jacob-gibbs-2026-08-14_independent-transcription.tsv` came back with zero
differences across rank, tier, name, team, bye and position. `gibbs-tiers-source.test.js`
keeps that pinned; the one-bye-per-team invariant and the 32-team count ride along.

**The full-resolution images, not the phone photo.** Trevor sent one screenshot, which
covers ranks 90 to 175 only. The CBS article embeds both halves; the originals came off
`sportshub.cbsistatic.com` at 1486x1554 by dropping the `/resize/670x377/<hash>/`
segment from the article's `<img>` URL. Worth remembering the next time a CBS piece
hides a table in a picture.

**One generator, one page.** `site/data/_sources/build_gibbs_brief.py` writes
`site/gibbs-tiers.html`, which is the page the Sources view links to and the page that
ships in the `trevor-apps` bundle at `/ff/gibbs-tiers.html`. It now carries everything
both jobs had built: the 16 tier bands with per-tier position mix, a sticky position and
name filter with a mine-only toggle, per-league roster reads (best you hold, who Gibbs
soured on or warmed to, who is still unrostered inside the 175), the climbing and
sliding lists, the fell-out-of-the-top-175 line, a positional-runway table, and Gibbs'
own QB/RB/WR/TE strategy plus his round-by-round calls. The other job's variant moved to
`historical/build_gibbs_tier_board-2026-08-16.py` with its output beside it; nothing was
deleted, and the TSV and its test stayed because they are the thing that makes the
numbers trustworthy.

**`build_jacob_gibbs.py` takes the publisher now.** It hard-coded "Jacob Gibbs via
FantasyPros" and "2026 Draft Rankings" in the payload, which was wrong the moment the
board came from CBS. `--source` and `--title` set them, defaults unchanged. It also
learned a three-entry `TEAM_ALIASES` map (JAC to JAX, WSH to WAS, LA to LAR) used only
when matching, because seven Jacksonville players were falling through the team check
into the position-only branch. The board still prints whatever the source printed.

**Refresh command, both steps.**

```
python site/data/build_jacob_gibbs.py site/data/_sources/<new>.csv \
  --updated-at YYYY-MM-DD --source "Jacob Gibbs via CBS Sports" \
  --title "2026 Top-175 Overall (Half-PPR)"
python site/data/_sources/build_gibbs_brief.py
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.agents\scripts\deploy-phone-apps.ps1 -Deploy
```

### Aug 16, 2026 — a full-PPR board, because he publishes half and every league is full

All three Sleeper leagues score 1.0 per reception. Gibbs ranks for 0.5. That gap is worth
about 53 points to a 107-catch receiver and 9 to a 17-catch back, so his board was being read
in the wrong currency. `site/data/_sources/build_gibbs_fullppr.py` derives a full-PPR version
and the tier board now opens on it, with a toggle back to his published order.

**The method keeps his opinion and moves only on catches.** Re-ranking on raw projections
would have thrown his board away and just published the projection set. Instead: take the
half-PPR projections of the flex players he ranked, sort them high to low, and hand the k-th
largest to his k-th flex player. His board keeps its own value distribution and he decides
only who sits in which slot. Then add 0.5 per projected catch and re-sort. Tier sizes are his,
exactly.

**Two wrong versions came first and both are worth remembering.** Smoothing the projections
into a value curve with a rolling median flattened the top ten to within a few points, which
alone dropped Jahmyr Gibbs from 1 to 11 for the crime of being a running back. And letting QBs
re-sort on that flex curve dropped Lamar Jackson 36 spots for catching no passes, which is a
curve artifact, not a full-PPR effect: in a 1QB league a quarterback's rank comes from scarcity
and PPR does not change how many starting QB jobs there are. QBs now hold their exact slots and
only RB/WR/TE re-sort, into the gaps between them.

**The result is a real adjustment, not a rebuild.** Median move 5 spots, 33 players unchanged,
5 players move more than one tier. Net by position: RB -495 spots, WR +319, TE +176, QB 0.
Chase takes 1 from Gibbs by a hair, Trey McBride +9 to TE2 at 24 overall, Kyle Pitts +15,
George Kittle +22, Jake Ferguson +19. The falls are the backs who do not catch: Blake Corum
-27, Zach Charbonnet -24, Jadarian Price -25, Jonathon Brooks -22.

**It is a derived board and the code says so everywhere.** The expert column is labelled
"Jacob Gibbs, full-PPR adaptation", `defaultEnabled: false`, and the page states in the header
that the full-PPR view is not his. `site/js/gibbs-fullppr.test.js` asserts the three promises
(QBs pinned, tier sizes preserved, no flex player passes another without out-catching him) plus
that the move field agrees with both boards.

**The pairwise check was rewritten after it failed to fail.** The first version compared only
adjacent pairs and a deliberately corrupted board sailed through it. It now checks every flipped
pair, sorts by rank instead of trusting array order, and asserts at least one flip exists so it
cannot silently pass on an empty set. All four guards were then re-run against corrupted copies
and each one throws.

**Refresh, now three commands.**

```
python site/data/build_jacob_gibbs.py site/data/_sources/<new>.csv --updated-at YYYY-MM-DD \
  --source "Jacob Gibbs via CBS Sports" --title "2026 Top-175 Overall (Half-PPR)"
python site/data/_sources/build_gibbs_fullppr.py
python site/data/_sources/build_gibbs_brief.py
```

### Aug 16, 2026 — the PPR column in every players table

Turned the derived full-PPR source on by default (`defaultEnabled: true` in
`build_gibbs_fullppr.py`), since every league here is full PPR and an off-by-default column
answers nothing. His published half-PPR column stays on beside it; the 315-player July board
stays off.

**Swept every route rather than assuming.** The column now renders in all three per-league
Players tabs, the roster tab's four position tables, `#dashboard/trajectory`,
`#dashboard/cornerstones`, and the player detail modal. `#rankings` and `#players` are dead
routes that redirect to the dashboard, so `viewRankings` and `viewAllPlayers` are unreachable
code that still carries the wiring.

**One table was genuinely missing it.** `#projections` lists 182 players and had no expert
columns at all, while the Sources page promises them "beside players in every table". Added,
gated on `PROJ_STATE.unit === 'offense'` because the expert boards rank offense only, and
verified header and cell counts match exactly in both units (22/22 offense, 19/19 defense). A
header without its cell shifts every stat column one to the left, which is why that is asserted
rather than eyeballed.

**Counting call sites was the wrong test.** The existing assertions counted five
`...expertHeaders(),` lines and six `...expertCells(` lines, which looked like an off-by-one
bug and was not: the per-league Players tab builds a sortable header inline with
`sortHdr('xr:' + src.id)` instead of calling `expertHeaders()`. Both the inline header and the
new offense-gated projections pair are now asserted by shape, and all three new guards were
proven to fail against a modified `app.js`.

## August 22, 2026 — Gibbs republished at 200 deep, and the copy that lied about it

Trevor photographed Gibbs' board off his phone again and sent both pages over Telegram. It
is a different artifact from the August 14 one: 200 players instead of 175, 17 tier bands
instead of 16, and a `# / Player (Team/Bye) / Pos` layout rather than the FantasyPros-style
export CBS embedded. The CBS article is still the August 14 top-175, so there is no public
URL for this board; the two screenshots are the only source.

Same two-pass discipline as last time. Two jobs fired on the photos concurrently, one
holding page 2 and one holding page 1, and since both files sit on disk this run typed all
200 rows and had a second worker type them independently off the same crops.
**Zero differences on name, team, position and bye across all 200 rows.** Three further
checks agreed: every team on the board carries exactly one bye week, all 32 teams are
present, and `build_jacob_gibbs.py` resolved 200 of 200 names to Sleeper ids, which a
misspelling would have failed.

**One field had to be adjudicated, and it is a typo in his sheet.** The green bar above
rank 178 prints `TIER 15`, even though 148 to 160 are already tier 15 and 161 to 177 are
tier 16. That is not a misread: template-matching the label bitmap against the confirmed
`TIER 15` and `TIER 16` bars on the same board scores 0.99 against 15 and 0.925 against 16,
distinct-string pairs on this sheet sit around 0.93, and the glyph is a 5 not a 7 when
checked against the real `TIER 7` bar on page 1. A new green bar always opens a new tier
here, and 17 is the only value that keeps tiers monotonic in rank, so the board carries 17.
The printed value is preserved as a `printedTier` column in the transcription TSV and
`gibbs-tiers-source.test.js` now pins the exception to exactly ranks 178 to 200, so a future
board cannot quietly inherit it.

**What moved.** Only one name fell off the board entirely: Jayden Higgins, who was 110.
Tier 3 reordered at the top (Cook, Jeanty, Taylor, Hampton, Chase Brown became Cook, Chase
Brown, Jeanty, Taylor, Hampton) and Nico Collins came up to 15 as WR7.

**Three generators were writing the previous board's facts into the current one.** Each is
now derived rather than typed:

- `build_gibbs_fullppr.py` wrote its CSV to a filename hardcoded to `2026-08-14` and
  registered a `Top-175` title with an `updatedAt` of `2026-08-14`, so a new board landed
  under the old board's name claiming the old depth. All three now come off the board.
- `build_gibbs_brief.py` had `PRIOR` pointed at the July FantasyPros 315 board, which made
  the movers column a cross-publisher month-old diff. Rather than repoint the literal and
  create the same trap for the next board, `newest_prior_board()` now resolves the newest
  archived Gibbs board whose own `updatedAt` predates the live one, and the build prints
  which file it diffed against. `--selftest` asserts that choice is made by date and not by
  whichever filename sorts last, and refuses to pass if both cutoffs would pick the same
  archive, because then it is testing nothing; inverting the resolver to `min` makes it fail
  with the two filenames named. `175`, `16` and "July 20" appeared four more times as
  literals in the page template and in the "N of the 175" league line; all are interpolated
  now, the header link is labelled as his strategy write-up rather than "Original piece"
  because this board did not come from that article, and the round-by-round prose carries a
  line saying it is quoted from the August 14 write-up rather than from these 200 ranks.
- `app.js` hardcoded "175 in 16 tiers" in the Sources-page link copy and in the Cmd+K
  palette hint. Both read `gibbsBoardShape()` off the loaded board now. Verified live at
  both call sites: they render "200 in 17 tiers".

**Two design fixes on the tier board while it was open.** The intro ran nine lines on a
phone before a single ranking appeared, so the mechanism folded into a native `<details>`
and only the honesty line ("that is a derived board, not his") stayed visible; the page
now reaches the board four lines sooner. The seven stat tiles wrapped 6 + 1 at 420px and
the lone tile read as an orphan, so they flex-grow and wrap 4 + 3. Controls were exercised
rather than eyeballed: the format toggle, the position filter (25 rows for TE, matching the
board's TE count) and the name search all work with no console errors.

Twelve suites green, `node --check` clean, deployed.

### Refresh next time Gibbs publishes

```
cd "C:\Users\TrevorWhite\Downloads\Big Projects\Fantasy Football"
# 1. transcribe both images to site/data/_sources/jacob-gibbs-<date>.csv
#    (RK,TIERS,PLAYER NAME,TEAM,POS,BYE,SOS,ECR VS ADP; POS carries a dense posRank)
#    and type a SECOND pass to jacob-gibbs-<date>_independent-transcription.tsv
# 2. archive the outgoing board so the movers column has something to diff against
cp site/data/jacob-gibbs.js historical/jacob-gibbs-<prev-date>-top<N>.js
#    then point PRIOR in build_gibbs_brief.py at that file
python site/data/build_jacob_gibbs.py site/data/_sources/jacob-gibbs-<date>.csv \
  --updated-at <date> --source "Jacob Gibbs" --title "2026 Top-<N> Overall (Half-PPR)"
python site/data/_sources/build_gibbs_fullppr.py
python site/data/build_expert_rankings.py
python site/data/_sources/build_gibbs_brief.py
# then update the pinned counts in jacob-gibbs.test.js and gibbs-tiers-source.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.agents\scripts\deploy-phone-apps.ps1 -Deploy
```

## August 2026, Draft Room (`#draft`)

Live best-available board over any Sleeper draft. Built after confirming that
Sleeper's public API serves a **mock** draft by id (`/v1/draft/<id>` and
`/picks`, CORS open, no auth) even though mocks never appear in
`/user/<id>/drafts`, so a pasted URL is the only way in.

What it shows: pick counter and who is on the clock, your own pick numbers
(snake, `reversal_round` respected), your team filled into real starting slots
with the leftovers benched, a pick feed with your picks flagged, and a
best-available table sortable by VOR / points / Gibbs rank / KTC dynasty value.
The `Fall` column is Gibbs rank minus the pick on the clock and stays blank
pre-draft, where every rank would otherwise read as a fall.

Reuses the existing model wholesale through `draftAsLeague(d)`: no new scoring,
no new lineup filler, no new data file. Polls every 5s while picks land, 20s
before the draft opens, and `route()` clears the interval on navigation.

Second pass, same day. The first cut had a vertical pick feed and the team in a
card; both were wrong for a live draft. Replaced with Sleeper's shape: a
teams-by-rounds board grid (position-tinted cells, your column ringed, on-clock
cell outlined, auto-scrolled to the current round) and a bottom drawer for your
team that taps open/closed and drags to resize, persisted per draft.

Columns brought up to parity with the Players tab (sortable headers, search,
Proj Src toggle, expert rank columns, SOS rank, projected stat line, 18-week
schedule grid) plus four that only matter in redraft: **Drop** (points to the
next available player at the position, the tier cliff, gated above replacement
or QB34 tops the sort with a meaningless gap), **Need** (fills an unfilled
starting slot), **Bye** (off the schedule, not off a ranking board, so it is
populated past Gibbs' top 200) and a positional run strip.

The half-PPR Gibbs column now defaults OFF with a one-shot migration, because
all three leagues are full PPR and the derived `gibbs-ppr-*` board is the one
that applies. The half-PPR board is still the source it is derived from and
still drives `gibbs-tiers.html`; only the duplicate same-date column went.

Third pass, same day, two corrections worth keeping.

The tray holds the **best-available table**, not just the team. Putting only the
team down there left the thing you actually draft from in the page flow below a
fixed overlay, with dead space under it. Now the tray is tabbed (`Available` /
`Your team`), filters pinned above one scrolling pane, and the board owns the
space above it.

**A CSS edit did not reach the browser and it read as broken markup.** The board
rendered as one bare column: every `.draft-*` rule was on disk and served over
HTTP, but Chrome answered from its own cache without asking. `sw.js` was already
network-first, which is not enough, because `fetch()` consults the HTTP cache
first and a static server that sends `Last-Modified` with no `Cache-Control`
licenses heuristic caching. Fixed with `fetch(request, { cache: "no-cache" })`:
always revalidated, still 304-cheap so a 366 KB `projections.js` does not
re-download. If a style or script edit ever appears to have no effect, suspect
this before the code.

### Sleeper ADP is real, and it is on the projections endpoint

Sleeper publishes ADP and documents it nowhere. It is not on the stats endpoint
(`/v1/stats/nfl/regular/<season>` has rank fields and no `adp_*` at all, and
`order_by: "adp_ppr"` on the GraphQL `season_stats` query is accepted and then
silently ignored). It is on **`/v1/projections/nfl/regular/2026`**: key-free,
`access-control-allow-origin: *`, twelve flavors per player, `adp_ppr`,
`adp_half_ppr`, `adp_std`, `adp_2qb`, the four `adp_dynasty_*`, `adp_idp`,
`adp_idp_1qb`, `adp_rookie`.

ADP is per FORMAT, never per league, so `adpKeyForDraft()` picks the flavor from
the draft itself: `player_type === 1` is a rookie-only draft and takes
`adp_rookie`; IDP and superflex have their own; `scoring_type` carries a
`dynasty_` prefix on dynasty drafts.

The payload is ~2.7 MB, so it is trimmed to the ADP fields of players with an ADP
under 400 (Sleeper parks everyone else at 999) and cached in **session**Storage at
~87 KB. Session and not local on purpose: ADP moves daily in August.

This replaced the `Fall` column, which was position-rank-minus-current-round, a
proxy that only existed because no market number was on hand. `Val` is now
ADP minus the pick on the clock: positive means he has slid past where the field
takes him.

### Polling is status-driven, and a finished draft is silent

`status` was read once at mount and never again. Every consequence of that was
wrong in the same direction, too much traffic about nothing:

- `pre_draft` polled `/picks` every 20s, asking for picks that cannot exist
  until the draft starts.
- `paused` polled every 2s forever, because only `complete` turned it off.
- A draft that ended with unfilled slots never stopped at all: the only stop
  condition was `picks.length >= teams * rounds`, which such a draft never hits.

Now one timer whose beat decides what to ask for. Not running (`pre_draft` /
`paused`) asks the draft object whether it started, every 15s, and nothing else.
Running polls `/picks` at 1s inside three picks of your turn, 2s otherwise, 10s
once the room has gone three minutes without a pick, and folds a status re-read
in every fifteenth beat so a pause or a short finish is noticed. `complete` is
terminal: no timer at all, not a slow one.

The `Live` button is the state readout rather than a switch label, so a stopped
poller is never mistaken for a silent draft: `done`, `waiting`, `paused`, `off`,
or the seconds since the last good response.

Verified all three paths: a complete draft makes 0 requests over 8s, a
`pre_draft` makes 2 status requests and 0 picks requests over 20s, and a status
flipped to `drafting` switches to fast picks polling on the next beat.

### Your own ranking column (`Mine`)

An editable rank column in the Draft Room, seeded from the derived full-PPR
Gibbs board and saved in `localStorage` under `ff-my-rankings-v1`. Global, not
per-draft: it is an opinion, not a property of one room.

**The ORDER is the stored truth and rank is its index.** Storing numbers instead
invites gaps, ties, and two players at 14 after a bad edit; an array cannot
express any of those. `saveMyRanks()` de-dupes on the way in anyway, because a
drag landing mid-repaint would otherwise leave a player in the list twice and
every rank below him would read one too high.

Two edit paths, because they answer different questions. Typing a number moves a
player a long way ("he is actually my 4"); dragging the grip nudges him past the
two guys he was beside. Dragging is offered **only** when sorted by `Mine`
ascending, because reordering rows in a VOR-sorted table would mean nothing.

Two implementation notes worth keeping:

- **The new order is read back off the DOM, not tracked during the drag.** Only
  the top 150 of the board is on screen, so the visible pids are slotted back
  into the positions they held in the full list and everyone off screen keeps his
  rank exactly. Unranked rows carry no grip (they get a `+` that appends them
  instead), which is what guarantees the visible count matches the slot count.
- **`elementFromPoint` during the drag, not cached row rects.** The tray pane
  scrolls under the pointer mid-drag and cached rects go stale immediately.

`Reset` re-seeds from Gibbs behind a confirm. Verified: type-a-rank moves a
player, drag moves him back, the order survives a reload, and 200 entries stay
200 unique.

### Draft Room escape paths, keyboard reorder, undo, mobile tray

A /critique pass scored the view 27/40 and named User Control and Freedom the
failure (1/4). The diagnosis is worth keeping: an exit DID exist, the sidebar
Draft Room link goes to the picker, but `setActiveNav` prefix-matches
`#draft/123` against `#draft` and rendered it `.active`, so the only working
exit was styled as the page you were already on. Added breadcrumbs (every other
nested view had them), a weighted `back` button, a draft switcher, and Escape.

Three fixes behind that, each with a real bug found while testing:

- **Keyboard reorder** (arrows move one slot, Shift ten). The drag handle was
  pointer-only, so there was no way at all to reorder without a mouse. Only the
  FIRST arrow press worked at first: `wrapDataTables()` runs on the next frame
  and re-parents the table, which destroyed focus. The restore has to run inside
  that same rAF, after it, or focus lands on the body and press two is inert.
- **Undo stack** (20 deep) on every ranking mutation. One bad drag used to be
  unrecoverable short of resetting the whole board.
- **Mobile tray.** Capped to 42% of viewport height under 700px wide, because a
  desktop-set height follows the same browser profile onto the phone. That
  exposed the real problem: the filter row WRAPPED to 302px of a 354px tray,
  leaving room for exactly one table row. Now a single sideways-scrolling line,
  78px, so the table gets 276px and eight rows.

Skipped by choice: column grouping (27 columns stays). `ui-ux-pro-max` is a
broken bundle here (SKILL.md only, no `scripts/search.py` or CSV data) and is
queued as a dashboard task rather than fixed inline.

### 2026-08-25 — Market prop refresh + deploy

Full `python projections/build_all.py`, 16/16 steps ok. Board was a week stale
(Aug 18). Fresh: BettingPros 9-book season board at 1,189 props / 310 players,
PrizePicks at 792 props / 283 players. The headed-Chrome grab cleared DataDome
on the first call, so no interstitial and no partial-board fallback. Everything
downstream rebuilt off it: offense components (561 players, 173 PP-matched, 128
PP gap-filled), offense/defense scores, environment, SOS (actual Vegas lines
through week 16), SOS grid, categories, context, history. `build-info.js`
stamped from 15 real mtimes.

Deployed after, since the site is hosted and a local rebuild is not done:
`deploy-phone-apps.ps1 -Deploy` staged 82 files / 18.2 MB (`ff` 9.1 MB) and
uploaded 13 changed to `trevor-apps` production.

### 2026-09-12 - JoeysYIDS trade priced in titles, and the August deal is still on the board

Telegram ask: evaluate the Sleeper offer of Christian Watson + Quentin Johnston +
Joey's 2028 4th for a 2027 2nd, the 2028 1st and a 2027 3rd. Password is taco.
Written up in [TRADE-DECISION-2026-09-joeysyids.md](TRADE-DECISION-2026-09-joeysyids.md)
with a phone brief at `docs/trade-brief-joeysyids-2026-09-12.html`.

**Verdict: send it, swapping the two 2027 picks for the acquired ones, and then go
take Deal A.** The trade is 12% light on KTC (12,960 out, 11,407 in) and is the wrong
side of the Headliner Rule, but it measures +1.5pp of 2026 title odds and +2.5 of
seven-year equity across two paired seeds.

Three findings worth keeping:

- **Deal A from the August doc was never executed.** Breece's Pieces still rosters
  Collins, Waddle and Downs, and both 2027 firsts are still on roster 10. Re-run on
  today's data it is worth +17.4 starter ppg, moves him 8th to 5th, clears the playoff
  line, and *wins* the value ledger at 16,549 in against 13,156 out. The two trades do
  not compete for the same assets: together they read 8.0% title and 73% playoff.
- **`simPool` has no waiver pool**, so any what-if that ships every backup QB is charged
  an empty QB slot rather than the gap over replacement. Shipping both backup QBs for
  nothing scored 22.6% to 18.2% playoff on that artifact alone. Every QB-surplus counter
  has to add the real replacement by hand (best unrostered arm is Jacoby Brissett, 158.8,
  down from the 196 the August doc quoted: the league has hoarded QBs since).
- **His own picks are expensive because the roster is bad.** `originSlot` puts roster 10
  at slot 3 of 10, so the 2028 1st interpolates to 5,545, an early first, not 4,748.
  Sending the acquired 2027 2nd (Wood Grain Grippers, 4,071) and 3rd (Breece's, 2,978)
  instead of his own is worth about 1.5 points of equity for one dropdown.

Sensitivity: the +8.4 ppg falls to +5.0 at Watson's own career availability (47 of 68
games), and the 8th-place finish holds under blend, market-props-only and Sleeper-only.

**Sensitivity that changed the verdict, run after the first write-up.** The long-run answer
rests entirely on `pickRookiePoints`, which prices roster 10's 2028 first at about 143 points
in its rookie year. Scaling that relation for every roster flips the seven-year sign at about
**1.07x**: the trade is +1.5 equity as calibrated, -4.8 at 1.3x, -23.5 at 2.0x, and Deal A
moves the same way but harder (+5.7, -9.1, -32.2). The 2026 column is byte-identical across
the whole sweep, which is the proof that the win-now half carries no pick assumption at all.
Verdict was rewritten from "send it" to "send it only as half of a pair", because a trade that
leaves him 8th and needs a calibration to hold within seven percent does not stand alone. He
is pick-rich (30% of value in picks, seven in 2027), which is exactly why he is the manager
most exposed to picks being underpriced by the model.

### 2026-09-12 (evening) - both trades executed, and the pick pricing was wrong

Trevor caught it: **the value of the picks changes after the trades.** Every KTC figure in
the morning write-up slotted picks off the pre-trade rosters, which is the wrong world,
because the deal being priced is what moves the slot. Buying five starting receivers takes
roster 10 from third worst to third best, so his own picks stop being early picks the instant
the trade lands, while the ones he acquired from other teams do not move with him and the
team he bought from moves the other way.

Pre-trade against post-trade on the choice he actually faced:

| | pre-trade | real | |
|---|---:|---:|---|
| own 2027 2nd | 4,410 | 4,000 | send |
| acquired 2027 2nd (Shroom) | 4,070 | 4,150 | keep |
| own 2027 3rd | 3,010 | 2,840 | send |
| acquired 2027 3rd (djcom) | 2,980 | 3,040 | keep |

The columns rank opposite ways. He sent his own and kept the acquired ones, which was right
by about 150 KTC on the 2nd and 200 on the 3rd, and the doc had told him to do the reverse.
Across all five picks he sent the bill was 24,480, not the 26,140 published, so he paid about
1,660 less than the ledger claimed. The one pick that moved against him is Breece's 2027
first: selling Collins, Waddle and Downs made djcomstock the worst team in the league, so
that pick went 6,470 to 6,930.

`championshipOdds` was never wrong here. `projectLeagueForward` slots converted picks off the
previous simulated season's finish with the what-if applied, so every title-odds number came
from post-trade rosters. Only the hand-built ledger beside it used the old world, and four
verification passes all tested the simulator. **Cross-check the two numbers that reach the
reader against each other, not one of them four times.**

Fixed: `pv(season, round, rid, whatIf)` in `site/js/trade-sim.js` now slots under the trade
being priced, `repriceUnder()` prints before-vs-after for a set of picks, and
`trade-sim.test.js` fails (mutation-verified) if a buyer's own pick does not get strictly
cheaper when the deal lands. Trap written into `CLAUDE.md`.

State of the roster after both: Collins, Waddle, Downs, Watson and Johnston in, no
first-round pick before 2029, three QBs in a one-QB league still unsold.
