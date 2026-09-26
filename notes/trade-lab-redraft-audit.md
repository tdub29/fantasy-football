# Trade Lab redraft audit: Phi Kap Fantasy (2026-09-25)

**Bottom line: redraft trade verdicts cannot be trusted today.** The Trade Lab prices a redraft
player at zero unless he is a top-12 player at his position, so 162 of the 210 rostered players in
Phi Kap read 0.0. The verdict is then built from summed values alone, never from the starting
lineup. It calls a trade that leaves Trevor with no quarterback a "WIN FOR A" (a win for him) and
calls a clear win for him a "WIN FOR B". The middle panel is the dynasty panel with the picks card
removed: three seasons of title odds, five years of age-curved strength, and phantom KTC rookie
picks feeding both.

Defects: **4 high, 7 medium, 5 low.** Every one below was reproduced in two separate browser
sessions with identical output.

## Method

- League: Phi Kap Fantasy `1389722402430136320` (redraft, `is_dynasty: false`, 12 teams, full PPR,
  lineup QB RB RB WR WR TE FLEX FLEX K DEF + 7 BN, 6-team playoff from week 15, week 3 of 2026).
  User roster is R7 "tuten browns" (tdub1329), 1-1.
- Site served from `site/` with `python -m http.server 8841 --bind 127.0.0.1` (8831 was already
  taken by another process; its `app.js` matched the repo byte for byte, but I used my own port so a
  worktree swap could not change what I tested). Driven by Python Playwright, Chromium headless.
- Every trade was built by clicking pool rows in the real UI and reading the rendered text. To
  cross-check numbers, the test harness rewrote `app.js` IN MEMORY (Playwright route) to add more
  names to `window.__app`. No repo file other than this report was touched.
- Dynasty comparison: Password is taco `1341184676601028608`.
- Scripts and raw outputs live in the session scratchpad (`tl/`), not in the repo.

## Scenario results

| # | Scenario | Result |
|---|---|---|
| 1 | Load with no partner, with partner | Loads, no console errors. Middle panel is identical to dynasty except the picks card (see H4, L4) |
| 2 | Best RB for partner's worst bench body | Verdict right by accident; title odds drop in 2026, but headline sums 3 seasons (H4). Reverse case inverts (H1) |
| 3 | Even 2-for-1, 1 is an upgrade at a thin spot | FAIR 92% while lineup is +64 / -124 (H2) |
| 4 | Leaves fewer legal starters than slots | No-QB trade reads WIN FOR A, strength +2.9 (H2, H3). K and DEF invisible (M3) |
| 5 | Old producer for young player, similar points | PASS for today's value (priced by points). FAIL: +1 to +5 yr rows age the vet (H4) |
| 6 | Picks | PASS: no pick pool, search is players only. FAIL: phantom KTC picks priced into future rows (M1) |
| 7 | Title odds: seed stability, horizon, standings | Deterministic across runs and sessions (PASS). Playoff settings match (PASS). 3-season horizon (H4), standings ignored (M2), noise shown as signal (M4) |
| 8 | Console errors, NaN, blanks, disagreements | No console errors, no NaN or undefined anywhere. Disagreements: M7, H2, H3, L2 |

## Scenario 1 inventory (what the page shows in redraft)

Header: breadcrumb, "TRADE LAB / Trade Calculator", sub "Click players or picks to add to the pile",
league selector (Phi Kap labelled "(1QB)", no redraft marker). "Who you trade with" strip (works:
Los Pollos Hermanos, 1 trade). FIND A PLAYER search. Two side cards (YOU SEND / YOU RECEIVE) with
roster selects, "In Trade" pile and total, roster pool with pos chip, team chip, dynasty tier letter
and value (zero shows as "."). No picks card (correctly gated). Middle: Total Value, Verdict, %
fairness, headliner premium note, Post-Trade Strength Δ, Starting Lineup (proj pts) now → after,
"Championship odds by season" rows 2026 / 2027 / 2028 plus "pts over 3 seasons", Run title odds,
"Year-by-Year Team Strength Δ" rows Today / +1 yr to +5 yr with the note "Players age via position
curve; picks count 0 until their draft year, then convert as age-22 WR", Reset Trade. Below: Trade
Finder, Team Needs table.

Dynasty-flavored in a redraft league: the 2027 and 2028 title rows and 3-season total, the whole
Year-by-Year block, the age-curve and picks notes, the tier letters, "players or picks" copy, KTC
position ranks in Team Needs, dynasty-rank startables in the Trade Finder, and phantom picks inside
the future numbers.

---

## HIGH

### H1. Redraft value is zero for everyone outside the top 12 at his position

- **Repro:** `#trade/1389722402430136320/1`. Click Kaelon Black (your RB, 79.3 rest-of-season pts) on
  the left, Breece Hall (their RB, 218.6 pts) on the right.
- **Page shows:** Total Value 0.0 ⇄ 0.0, verdict **WIN FOR B**, 0% fairness, Post-Trade Strength Δ
  +0.0 / +0.0, while the lineup row says you gain (+66) and they lose (-79). The page tells you the
  partner wins a trade that is a clear win for you. Same pattern for Rashee Rice (your WR1 by
  rest-of-season points, 219.2) for Emanuel Wilson (30.6): 0.0 ⇄ 0.0.
- **Scale:** 162 of 210 rostered players read 0.0, including 27 players with 200+ rest-of-season
  points (Justin Herbert 258.7, Tyler Shough 259.5, Ashton Jeanty 226.2, Saquon Barkley 222.7, Breece
  Hall 218.6, Tee Higgins 218.8, Garrett Wilson 214.0 ...). On the user's roster only McCaffrey 32.0,
  Kraft 16.3 and Goff 3.4 are nonzero. In the dynasty league the same Josh Downs is 43.5; here 0.0.
- **Should show:** a rest-of-season value that is positive for any player who would start for some
  roster, and a verdict that favors whoever gains starting-lineup points.
- **Cause:** `KT.assetValue` (and the pool, pile and search) call `tierValue(r, lg)` with no roster,
  so `rosVorByPid` falls to `tier = 1` and `rosBaseline(tier 1)` measures EVERY player against rank
  n*1+1 (RB13 at 226.2, WR13 at 219.2, QB13 at 267.9), then `Math.max(0, vor)` floors the rest. The
  tiered baseline that `rosBoard` builds (RB25, RB37, free level) is never used by the Trade Lab.
- **Location:** `KT.assetValue`, `tierValue` redraft branch, `rosVorByPid`, `rosBaseline`;
  callers `buildTradeSide` (pool and `makePileRow`), `buildTradeSearch`, `suggestTrades`,
  `buildTeamNeeds`, `lineupStrengthFrom`.

### H2. The verdict is summed value only; lineup legality and impact never reach it

- **Repro A (user left with no QB):** `#trade/1389722402430136320/1`. Left: Jared Goff and Tyler
  Shough (both of your QBs). Right: Tyler Warren. **Shows:** 3.4 ⇄ 6.3, verdict **WIN FOR A**, 53%,
  "+2.3% headliner premium to Side B". Same panel: Starting Lineup A 1526 → 1310 (-217), and after
  Run title odds, 2026 title odds A 5.0% → 1.2%.
- **Repro B (partner left with no QB):** same route. Left: Tucker Kraft. Right: Tyler Warren and
  Patrick Mahomes (their only QB). **Shows:** 16.3 ⇄ 16.0, **FAIR 96%**, while Starting Lineup B
  1664 → 1348 (-316).
- **Repro C (2-for-1, scenario 3):** `#trade/1389722402430136320/8`. Left: Tucker Kraft and Josh
  Downs. Right: CeeDee Lamb (fills the user's thinnest spot, WR). **Shows:** 16.3 ⇄ 17.6, **FAIR
  92%**, lineup A +64, B -124, 2026 title odds A +2.8, B -3.3. Swapping Downs for the NYG defense
  gives the identical FAIR 92%: the second piece changes nothing.
- **Should show:** a verdict driven by each side's starting-lineup change (and title odds when run),
  with a trade that empties a required slot reading as a loss for that side no matter what the
  summed value says.
- **Location:** `KT.computeFairness` (inputs are `aVal`, `bVal`, sizes, headliners only);
  `KT.refreshMiddle` computes `tradeLineupImpact` for display but never feeds it to the verdict.

### H3. Post-Trade Strength Δ and Year-by-Year strength use a hand-rolled top-K, not the lineup filler

- **Repro:** Repro A from H2 (Goff + Shough for Tyler Warren).
- **Shows:** Post-Trade Strength Δ **+2.9 / -2.9**, and every Year-by-Year row positive for the
  user (+2.9 to +3.8), for a roster that can no longer field a QB. The lineup row beside it says
  -217.
- **Should show:** a negative strength change, since the QB slot is empty. CLAUDE.md: "There is ONE
  lineup filler: `fillLineup` ... Never hand-roll a top-K by value lineup."
- **Location:** `lineupStrengthFrom` (`vals.sort(...).slice(0, offenseStarterCount(lg))`), used by
  `simulateRosterStrength`, `projectedRosterStrength`, `projectedTradeStrength`.

### H4. Redraft shows a 3-season title horizon and 5 years of age-curved strength

- **Repro:** `#trade/1389722402430136320/1`. Left: Christian McCaffrey. Right: Emanuel Wilson. Run
  title odds.
- **Shows:** rows 2026 (-2.8, 5.0% → 2.2%), 2027 (-2.5), **2028 (+4.2, 4.6% → 8.9%)**, and the
  headline **"-1.1 pts over 3 seasons"** for trading your best player for a 30-point scrub. The
  title meta says "Later seasons age every roster forward and slot draft picks by the simulated
  finish". Year-by-Year shows Today -32.0, then +1 yr -12.8 down to +5 yr -0.3 as CMC "ages".
  Scenario 5 (`#trade/.../8`, Tucker Kraft 25 for Travis Kelce 36, 178.4 vs 175.6 pts): today's
  value is correctly 16.3 vs 14.7 (FAIR 90%), but Year-by-Year runs -10.4 at +1 yr to -16.1 at
  +5 yr from Kelce's age alone.
- **Should show:** one row, 2026, and a headline equal to the 2026 change. No Year-by-Year block
  (or Today only), no age curve, no picks note. Rosters do not carry over in redraft.
- **Location:** `tradeMiddleSummary` (`TITLE_YEARS = 3`, `y0` to `y5` rows, the notes),
  `KT.refreshMiddle` (year loop over `projectSideValue` and `projectedTradeRanks`),
  `titleOddsByYear`, `projectSideValue` / `dynastyDecay`, `lineupStrengthFrom` (`ageRetention`).
  None of these check `isDynastyLeague`.

## MEDIUM

### M1. Phantom KTC rookie picks are priced into redraft future projections

- **Repro:** any trade on `#trade/1389722402430136320/1`; read the Year-by-Year sub-lines. The user
  sits at 20 to 55 "Today", then 186 to 202 at +1 yr and #1 of 12 by +4 yr in every trade tested,
  whatever is traded.
- **Measured:** `rosterOwnedPicks(7, PhiKap)` returns 12 picks (2027 to 2029, rounds 1 to 4) at
  dynasty KTC prices, 2027 R1 = 71.4. The user's strength at +1 yr is 198.2 with them and 27.0
  without them. The same picks convert to rookies inside the 2027 and 2028 title odds.
- **Should show:** a redraft league owns no future picks; nothing pick-derived anywhere.
- **Location:** `rosterOwnedPicks` (no `isDynastyLeague` gate; only `buildTradeSide` gates it),
  called from `projectedRosterStrength`, `projectedTradeStrength`, `projectLeagueForward`.

### M2. 2026 title odds ignore the standings and the weeks already played

- **Repro:** Run title odds on any trade; baseline levels come from `championshipOdds`.
- **Measured (baseline, seed 20260807):** Mr immortals (2-0, 275.5 PF) has the league's lowest
  title odds, 3.8%, and 31.9% playoff odds; UncWill (0-2, 200.1 PF) gets 5.6% and 42.2%. Expected
  wins across all teams sum to 84.0 = 14 weeks x 6 games, so all 14 regular-season weeks are
  replayed from 0-0 with full-season projections; the two played weeks and real records count for
  nothing. Pairings are random each week although the real schedule is in `FANTASY_SCHEDULE`.
- **Should show:** odds that start from each team's actual record and points-for, simulate weeks
  3 to 14 only, and use the real remaining schedule.
- **Location:** `championshipOdds` (weeks loop `w = 1..cfg.regularWeeks`, `randomPairing`), and
  `simPool` (full-season `projPoints`).
- Playoff settings themselves are right: 6 teams, start week 15, 2 byes, 3 rounds.

### M3. Kickers and defenses are invisible to the trade math

- **Repro:** `#trade/1389722402430136320/1`. Left: Evan McPherson (your only K) and New York Giants
  (your only DEF). Right: Emanuel Wilson.
- **Shows:** 0.0 ⇄ 0.0, WIN FOR B, Post-Trade Strength Δ +0.0, Starting Lineup 1526 → 1526 (+0).
  Two required starting slots go empty and nothing moves. Every K and DEF in the pools shows ".".
  FIND A PLAYER returns "No players match." for "Seahawks", "Aubrey", "McPherson".
- **Should show:** K and DEF valued on rest-of-season points over this league's replacement (the
  data exists: `rosVorByPid` gives Seattle DEF +19.2, Mevis K +6.8), and an empty K or DEF slot
  costing lineup points.
- **Location:** `KT.assetValue` (returns 0 when the player is not in `rankIndex`, which has no K or
  DEF); `optimalOffense` and `simPool` keep only `SLOT_TAKES.SUPER_FLEX` positions;
  `buildTradeSearch` searches `rankIndex().all`.

### M4. Title-odds changes at noise level are painted as signal

- **Repro:** `#trade/1389722402430136320/1`. Left: Emmett Johnson (bench RB). Right: Emanuel Wilson
  (bench RB). Run title odds.
- **Shows:** lineup +0 / +0, yet 2026 title odds A +0.4 (green) and B **+1.1** (green, 8.8% → 9.9%).
  Both teams "gain" from a swap of two players who never start.
- **Measured:** the same trade over 6 seeds moves the user -0.5 to +0.5 and the partner -0.4 to
  +1.1, so the sign flips with the seed. The panel shows one 2,500-sim run, colors anything past
  0.1 pts, and gives no error band. CLAUDE.md: never quote a title-odds delta from one run.
- **Should show:** an uncertainty band (or several seeds), and grey for any change inside it.
- **Location:** `tradeMiddleSummary` run handler (`TITLE_SIMS = 2500`, `paint` threshold 0.1).
- Not a defect: identical output across repeated clicks and fresh sessions (fixed seeds).

### M5. Team Needs picks the wrong "top" player and ranks needs off zero ties

- **Repro:** scroll to Team Needs on `#trade/1389722402430136320`.
- **Shows:** Mr immortals RB cell "0 NEED, George Holani · RB71" while Ashton Jeanty (226.2 pts) is
  on that roster; UncWill RB "Braelon Allen · RB46" over Kyren Williams (212.7); Los Pollos
  Hermanos WR "Jayden Reed · WR56" over Drake London (195.4). "Biggest TE need: PriceIsRight ...
  value 0" is a tie-break among three teams at 0 (King Henry's best TE, 139.7, is lower than
  PriceIsRight's 140.4). The rank labels (RB71, TE18) are KTC dynasty ranks.
- **Should show:** each team's real best player by rest-of-season points, needs ranked on a
  nonzero redraft measure, and redraft position ranks.
- **Location:** `buildTeamNeeds` (sorts on `tierValue`, which ties at 0; label from
  `ranked.ktcPosRank`). Same tie trap `orderValue` was written to fix for lineups.

### M6. Trade Finder is dynasty-driven and returns nothing

- **Repro:** Trade Finder on `#trade/1389722402430136320`.
- **Shows:** "No balanced 1-for-1 fits right now." Its inputs: the user has **0 startable QBs**
  (need 1) although Goff (274.1) and Shough (259.5) are rostered; startable WRs include IR Jordyn
  Tyson and IR A.J. Brown; startable RBs include Kaelon Black (79.3). Pairs must also have value
  15+, which almost no redraft player has (H1). The note promises swaps "that improve both
  starting lineups", but no lineup check exists.
- **Should show:** redraft needs from rest-of-season lineup slots, and proposals checked with
  `tradeLineupImpact`.
- **Location:** `suggestTrades`, `rosterSurplusShortage`, `isStartable` (uses KTC `_posRank`).

### M7. The pile's VOR chip contradicts the value on the same row

- **Repro:** add Tucker Kraft (left) and CeeDee Lamb (right) on `#trade/1389722402430136320/8`;
  add Rashee Rice or Breece Hall on `/1`.
- **Shows:** "Tucker Kraft | VOR +2 | 16.3" and "Rashee Rice | VOR +29 | 0.0", "Breece Hall | VOR
  +73 | 0.0", "Christian McCaffrey | VOR +124 | 32.0". The chip ranks Rice far above Kraft; the
  value ranks Kraft far above Rice.
- **Should show:** one VOR basis per row (rest-of-season, this league's baseline), so the chip and
  the value agree in order.
- **Location:** `makePileRow` in `buildTradeSide` calls `vorChip(k, lg, 'blend')` → `vorByPid`
  (full-season points vs a flat last-startable line) while the value is `tierValue` (rest of
  season vs rank 13, x0.55).

## LOW

### L1. Any exact tie in value reads "WIN FOR B"

- **Repro:** H1 repro or M3 repro (0.0 ⇄ 0.0). **Shows:** WIN FOR B, 0% fairness, in red.
- **Should show:** INCOMPLETE or EVEN when both sides are zero.
- **Location:** `KT.computeFairness`: `delta > 0 ? 'WIN FOR A' : 'WIN FOR B'` sends delta 0 to B,
  and `Math.max(adjA, adjB, 1)` makes 0 vs 0 score 0%.

### L2. The lineup row is full-season while the value is rest-of-season

- **Repro:** any load. **Shows:** "Starting Lineup (proj pts)" 1526 for the user, a full 2026
  projection that includes the two weeks already played, and it drops an IR player for the whole
  season (`isSidelined`) while his rest-of-season line counts his return (A.J. Brown: 149.8 over 10
  games).
- **Should show:** the same rest-of-season basis the value uses.
- **Location:** `tradeLineupImpact` → `lineupPoints` → `optimalOffense` (`projPoints`,
  `isSidelined`).

### L3. Rest-of-season points include NFL week 18

- **Measured:** `rosPointsByPid` sums weeks 3 through 18. McCaffrey 284.3 includes 19.9 from week
  18; Phi Kap's season ends in week 17 (playoffs 15 to 17).
- **Should show:** weeks current through the league's last playoff week.
- **Location:** `rosPointsByPid` (`for (w = from; w <= wk.length ...)`).

### L4. Dynasty copy and ordering in the pools

- **Shows:** "Click players or picks to add", "Drag players or picks here"; dynasty tier letters
  (S, A, B, C, D from the cornerstone / foundational / mainstay categories) on every pool row,
  e.g. "Adonai Mitchell S ." Zero-valued rows keep roster order, so Mr immortals' starting QB
  Justin Herbert (258.7) is row 12 of 16, below Adonai Mitchell (131.5) at row 3.
- **Should show:** "players", no dynasty tier letters in redraft, pools sorted by rest-of-season
  points (the `orderValue` pattern).
- **Location:** `viewTrade` (page sub), `buildTradeSide` (pile empty text, `tierChip`, pool sort).

### L5. FIND A PLAYER misses rostered players whose ranking entry has no Sleeper id

- **Repro:** type "DJ Moore" on `#trade/1389722402430136320/3`. **Shows:** "No players match."
  He is on that roster (202.1 pts) and appears in the pool.
- **Location:** `buildTradeSearch` filters `idx.all` on `p._sleeperId`; the same null id makes
  `tierValue` return 0 for him in redraft even if he were a top-12 player.

---

## Suggested fix order

1. H1 first: price redraft assets on the tiered rest-of-season baseline (or the post-trade lineup
   delta) instead of tier 1. Most other symptoms shrink with it.
2. H2 and H3 together: drive the redraft verdict and strength from `fillLineup`-based lineup
   deltas (`tradeLineupImpact` already does the filling).
3. H4 and M1: gate the multi-year rows and `rosterOwnedPicks` on `isDynastyLeague`.
4. M2, then the rest.

Re-test with the same routes and clicks listed above; each repro is deterministic.

---

## Fixed (2026-09-25, branch fix-tradelab-redraft)

Re-run of the 8 scenarios on `python -m http.server 8841` serving this worktree's `site/`, same
routes and clicks, Playwright Chromium. Before = the audit commit, after = this branch. Zero console
errors, NaN or undefined in either run.

| Defect | Repro | Before | After |
|---|---|---|---|
| H1 value floor | pool rows reading 0.0, all 12 rosters | 162 of 210 | 62 of 210 |
| H1 | Kaelon Black for Breece Hall | 0.0 ⇄ 0.0, WIN FOR B, strength +0.0 / +0.0 | 0.0 ⇄ 68.0, WIN FOR A (lineup edge 70), strength +37.8 / -39.6 |
| H1 | Rashee Rice for Emanuel Wilson | 0.0 ⇄ 0.0, WIN FOR B | 53.5 ⇄ 0.0, WIN FOR B (lineup edge 71) |
| H2 repro A | Goff + Shough for Tyler Warren | WIN FOR A, 53% | WIN FOR B, 2026 odds A 5.3% → 0.9% |
| H2 repro B | Kraft for Warren + Mahomes | FAIR 96% | WIN FOR A, "Side B is left with an empty starting slot" |
| H2 repro C | Kraft + Downs for CeeDee Lamb | FAIR 92%, identical with NYG DEF in place of Downs | WIN FOR A (title edge 2.1); with NYG: WIN FOR B, empty DEF slot |
| H3 | Goff + Shough for Warren, strength Δ | +2.9 / -2.9 | -145.0 / -88.2 |
| H4 | title rows / Year-by-Year rows | 3 seasons / 6 rows | 1 season (2026) / none |
| H4 | McCaffrey for Emanuel Wilson | -3.8 pts over 3 seasons (2028 +1.3) | WIN FOR B, -2.7 pts in 2026 (5.3% → 2.6% ±0.6) |
| H4 / M1 | `rosterOwnedPicks(7, Phi Kap)` | 8 KTC picks | 0 |
| M2 | 2-0 Mr immortals vs 0-2 UncWill, title / playoff | 3.8% / 31.9% (lowest) vs 5.6% / 42.2% | 5.4% / 44.9% vs 3.7% / 26.7% (lowest) |

What changed, at the shared source:

- **H1.** `tierValue` with no roster now measures against replacement, the best FREE body at the
  position in this league (`DEPTH_TIER`, from `rosBoard`), not rank n+1. Same currency
  (`REDRAFT_VOR_SCALE` 0.55), continuous in rest-of-season points, floored at 0. The 62 zeros left
  are below the waiver wire: every rostered kicker (the best K in Phi Kap, 137.7, is unrostered)
  and bench bodies such as Kaelon Black (79.3 vs the best free RB at 95.0).
- **H2.** Redraft verdict is `KT.redraftVerdict`: each side's starting-lineup change from
  `tradeLineupImpact`, plus 2026 title odds once run. A side left with an empty starting slot
  loses outright. Title odds count only outside their noise band; bands live in `SIM`.
- **H3.** `startingStrength` is the one strength path (Post-Trade Δ and the dynasty year rows);
  `lineupStrengthFrom` and its top-K are deleted. Redraft strength is `redraftLineup`: fillLineup
  on rest-of-season points, K and DEF included, points over replacement, and an empty slot scores
  0, so a roster with no QB cannot gain.
- **H4 / M1 / M2.** `titleOddsByYear` prices one season in redraft; `rosterOwnedPicks` returns no
  picks in redraft; `championshipOdds` seeds the season in progress from real records and
  points-for, simulates only the remaining weeks on the real `FANTASY_SCHEDULE`, and plays the
  weekly median in median leagues. Records seed only when they add up to the weeks played.

Mediums and lows: M3 fixed for value, lineup and search (K/DEF count, "McPherson" and "Seahawks"
now match), not inside the title simulator, whose projection feed has no K or DEF. M4 fixed: every
title cell prints a ±2 SE band and paints grey inside it (the bench swap is now +0.8 ±0.8, grey,
FAIR). M5 fixed (Jeanty RB13 and Kyren Williams RB19 now top their rows; King Henry is the TE need
at value 9). M6 fixed (a redraft finder proposes 1-for-1s that raise both rest-of-season lineups;
Phi Kap gets Goff for Davante Adams, +5 / +6). M7 fixed (pile chip uses the value's basis: Kraft
VOR +56 = 30.7 value). L1, L2, L4 and L5 fixed. L3 left: rest-of-season still sums through NFL week
18, about one week of inflation spread over every player, because `rosPointsByPid` is league-agnostic.

Dynasty numbers that moved, all genuine shared bugs: Post-Trade Strength Δ and the Year-by-Year
sub-lines now go through `startingStrength` (legal lineup, taxi/IR and Out/Doubtful benched at
year 0), e.g. The League top-for-top swap +2.0 / -2.0 became +37.2 / -43.2 because Caleb Williams
is Doubtful; current-season title odds now start from real records on the real schedule with
median games (taco top-for-top: 2026 A 8.7% → 10.3% baseline became 9.9% → 12.8%); a 0 vs 0 trade
reads FAIR instead of WIN FOR B. Total Value, fairness %, and the lineup row are unchanged in
dynasty.

---

## Verification (2026-09-25, independent adversarial pass)

**Bottom line: redraft verdicts still cannot be trusted.** Every number the fixer reported
reproduces, and 13 of the 16 audit defects now behave as specified. But the redraft verdict has no
waiver wire, so shipping a kicker or defense that is WORSE than the best free one reads as an
automatic loss (verdict inverted), and once "Run title odds" is clicked the verdict follows a second
projection the page never shows, which flips even swaps and prices an injured star at about half his
rest-of-season line. Findings: **2 high, 3 medium, 5 low.**

### Method and provenance

- Main checkout `site/` served on `127.0.0.1:8853` (8851 was already bound by another
  `http.server` serving byte-identical files; a separate port kept a mid-run swap from changing what
  was tested). Python Playwright, Chromium headless, clicks on real pool rows. `app.js` was patched
  IN MEMORY only (Playwright route) to expose internals on `window.__app`. No repo file other than
  this section was touched; no commit.
- **Two code versions.** First pass on `913c093` (the fix merge, app.js md5 `fa42644d...`). Main then
  moved to `8a88109` (Trade Finder merge, `1745490` pairs the simulator's draws; app.js md5
  `59d2a71d...`). Everything below was re-run on `8a88109`, and **every number in this section is
  from `8a88109` unless marked "old code"**. On both versions each case ran in two separate
  browser sessions with identical output (21 Phi Kap cases, 18 dynasty cases, all SAME).
- `node --check` and every `site/js/*.test.js` pass on both versions.

### Audit repros (high and medium), re-run

| Defect | Result on 8a88109 |
|---|---|
| H1 | PASS. 62 of 210 read 0 (every rostered K, sub-waiver bodies). Black for Hall: 0.0 ⇄ 68.0, WIN FOR A, lineup +69 / -72. Rice for E. Wilson: WIN FOR B |
| H2 A | PASS. Goff + Shough for Warren: WIN FOR B, A 5.2% → 0.9% |
| H2 B | PASS as specified (WIN FOR A, "Side B is left with an empty starting slot"), but see V1: the best free QB is 256.0 pts |
| H2 C | PASS. Kraft + Downs for Lamb: CLOSE (lineup edge 24), WIN FOR A after odds. **FAIL with NYG in place of Downs**: see V1 |
| H3 | PASS in redraft (-145.0 / -88.2). Dynasty still lets an emptied slot gain: V5 |
| H4 | PASS. One 2026 row, no Year-by-Year block. CMC for E. Wilson: WIN FOR B, A 5.2% → 1.9% ±0.6 |
| M1 | PASS. `rosterOwnedPicks(7, Phi Kap)` = 0 |
| M2 | PASS. Mr immortals (2-0) 5.5% title / 47.1% playoff; UncWill (0-2) lowest at 4.2% / 25.5% |
| M3 | Value, lineup, search PASS ("Seahawks", "Aubrey", "McPherson" match). **Verdict FAIL**: V1 |
| M4 | PASS. E. Johnson for E. Wilson: +0.0 ±0.7 / -0.1 ±0.8, grey, FAIR |
| M5 | PASS. Jeanty RB13, Kyren Williams RB19, Drake London WR24 top their cells; redraft ranks |
| M6 | Not verifiable: the rebuilt finder (8a88109) returns "0 trades from 12,178 packages" in Phi Kap by its own gates |
| M7 | PASS. Kraft VOR +56 beside 30.7 (56 x 0.55) |

Lows L1, L2, L4, L5 also pass (0 vs 0 reads FAIR; ROS lineup basis; "players" copy, no tier letters,
pools sorted on ROS; "DJ Moore" found). L3 is the fixer's own open item.

### HIGH

**V1. An emptied slot loses outright even when the waiver wire has a better player; K and DEF
trades invert.**
- Repro: `#trade/1389722402430136320/1`, Side A Evan McPherson + Kaelon Black, Side B Breece Hall,
  Run title odds. Same with New York Giants in place of McPherson, and on `/8` Tucker Kraft + New
  York Giants for CeeDee Lamb (the fixer's own "with NYG: WIN FOR B" row).
- Shows: **WIN FOR B, "Side A is left with an empty starting slot."** Same panel: 2026 title odds
  A **+3.3** (5.2% → 8.4% ±0.8, green), B **-2.5** (6.6% → 4.1% ±0.7, red); lineup A -51, B -72
  (lineup edge also favors A). Kraft + NYG for Lamb: WIN FOR B while title odds read A +2.5, B -4.1.
  McPherson + NYG for E. Wilson: WIN FOR B, lineup 1858 → 1642 (-217), title +0.0 / +0.0 (the
  simulator has no K or DEF: `simPool` gets no projection for either).
- Should: the best free K in Phi Kap scores 137.7 rest of season, more than McPherson (119.5) or any
  rostered kicker; best free DEF 106.8 beats NYG (97.0). The page's own value column prices every
  rostered K at 0 for exactly that reason. A manager who ships his kicker adds a better one, so the
  cost of an emptied slot is (player pts minus best free pts), floored at 0, never "loses outright".
  Every fantasy player calls Hall for Kaelon Black plus a kicker a win for A. The same waiver
  blindness overstates QB holes (best free QB 256.0 vs Goff 274.1) and TE holes (122.6).
- Likely: `KT.redraftVerdict` (the `holeA !== holeB` early return), `redraftLineup` (an empty slot
  scores 0 points instead of the free level it already reads as `base`), redraft branch of
  `tradeLineupImpact`. The new finder's `finderWaiverAdds` exists but the Lab does not use it, and
  it skips K/DEF.

**V2. After "Run title odds" the redraft verdict follows a projection the page never shows; even
swaps flip and an injured star is priced at about half his line.**
- Repro A, `#trade/1389722402430136320/8`: Luther Burden for Matthew Golden. Before odds: FAIR,
  "Lineup edge 13 pts, even" (189.5 vs 176.7 ROS). After: **WIN FOR B**, A -1.6 (5.2% → 3.6%),
  B +2.7 (9.6% → 12.3%).
- Repro B, `/2`: A.J. Brown (IR) for DK Metcalf. Before: FAIR, lineup +3 / -3 (ROS 149.8 vs 152.4).
  After: **WIN FOR A**, A +1.0 (5.2% → 6.1%), B -1.1 (11.6% → 10.5%).
- Not noise: over five seeds (20260807, 11, 777001, 424242, 90210) the title edge is -1.85 to -2.3
  for Burden/Golden and +0.9 to +1.1 for Brown/Metcalf, every seed on the same side.
- Cause: lineup and value use Sleeper weekly ROS (`rosPointsByPid`); `championshipOdds` pools use
  `projections.js` blend season / 17 (`simPool`). They disagree by up to 45% per player: Golden
  11.78 vs 8.01 per game, Kraft 11.89 vs 8.29, Rice 14.61 vs 11.29. For an injured player the
  simulator double-counts: A.J. Brown's blend 167 already excludes his missed games, `simPool`
  spreads it over 17 weeks (9.82 a week vs his 14.98 per game when active) and then holds him out 6
  more weeks (`designationWeeksOut.IR`). Once a change clears its band, `redraftVerdict` lets title
  odds set direction and grade. The audit's injured-star test ("season points must drive it")
  fails.
- Should: put the simulator on the same rest-of-season basis (weekly lines, no second injury
  discount) before the verdict leans on it, or keep the verdict on the lineup and show title odds
  beside it.
- Old code only: Rice for Tee Higgins (identical ROS) flipped FAIR → CLOSE and Kraft for Kelce
  FAIR → WIN FOR B on one seed's outlier (B +1.7 and +2.0; the other four seeds -0.1 to +0.8). The paired
  draws in `1745490` fixed both: now FAIR and FAIR.

### MEDIUM

**V3. `node site/js/trade-sim.js` now prices 2026 differently from the Trade Lab in both dynasty
leagues.** The CLI loads leagues, projections, players and ktc but not `data/schedule.js`, so
`medianScoring` is unknown, the record check (40 results vs 20 expected at week 3) fails, and it
replays 2026 from 0-0 on random pairings with no median games. Same slice of app.js, 2500 sims,
seed 20260807 (title% / playoff%): taco Boutte Hunter 4-0 CLI 9.2 / 79 vs Lab 10.2 / 89; Karl Havoc
0-4 23.1 / 95 vs 19.7 / 94; The League CeeDeez 4-0 11.7 / 70 vs 13.8 / 84; World of Tanks 0-4 11.5 /
76 vs 8.8 / 63. The CLI's own run: Stand pat 80.6% playoff. CLAUDE.md sends "should I make this
trade" to the CLI. Likely: the data-file list at the top of `trade-sim.js`.

**V4. The Trade Finder can surface a deal the partner loses (coordinator's added check).** Lab title
deltas are stable: three loads of each of six finder deals (finder-row click plus two reloads)
gave identical numbers. The finder's number is exactly the first 800 draws of the Lab's run
(checked: the 800-sim champions list is a prefix of the 7500 / 2500 run), so the two agree within
the finder's ±1 SE on 6 of 12 numbers and within ±2 SE on 12 of 12. But Washington (redraft),
Jaylen Warren for Jameson Williams with Seirin High School: finder "them +0.1 ±0.9", Lab at 7500
sims **-1.2** (7.2% → 6.0%; paired SE 0.29). The partner gate is `their.delta > 0` on an 800-sim
point estimate with no SE bar (my side needs 2 SE, his needs none). The League, JoeysYIDS: finder
+0.0 ±0.3, Lab -0.3. Likely: `findTrades` (`wants`).

**V5. Dynasty Post-Trade Strength Δ rises for a side left with no QB.** Taco `#trade/.../6`: Josh
Allen + Caleb Williams + Jordan Love for Ja'Marr Chase + Brock Bowers. Shows strength **A +15.9**,
beside lineup 2067 → 1926 (-140) and 2026 title A 10.2% → 5.6%. The dynasty branch of
`startingStrength` charges nothing for an empty slot, so the fixer's "no roster with no QB can gain"
holds in redraft only. Verdict FAIR 97% (KTC), defensible since both sides lose title odds.

### LOW

- **V6. Doubtful tag drives dynasty strength.** The League `/2`, Caleb Williams (Doubtful) for Drake
  Maye: FAIR 100% (85.5 vs 85.1) beside strength +34.8 / -30.4 and lineup +87 / -100. Consistent
  with CLAUDE.md (`isSidelined` benches Doubtful at PV), but a one-week tag is the loudest number on a
  dynasty swap.
- **V7. IR-slot asymmetry in the simulator.** `championshipOdds` drops an IR-slot player from his
  owner's baseline, while a what-if hands him to the receiver with a 6-week designation. Taco,
  Christian Watson for A.J. Brown (Karl Havoc's IR slot): Karl Havoc 2026 +1.8 for giving him up.
  The new finder excludes IR-slot players for this reason (comment in `finderAssets`); the Lab does
  not. Redraft counts IR-slot players in the lineup, so the two bases disagree there too.
- **V8. Search "+ For" routes any non-mine player to Side B.** `/1`, Kaelon Black, search "Jahmyr
  Gibbs" (The Infirmary): he lands on Runnin A-Love-chane's pile; WIN FOR A, lineup +179 / +0 for a
  trade B cannot make. Free agents too ("Baker Mayfield · free agent · + For"). Pre-existing;
  `buildTradeSearch`.
- **V9. Two ± conventions for one number.** The Lab still prints 2 x the unpaired SE (±0.8 at 7500
  sims where the paired SE is 0.27; dynasty ±1.9 where the paired SE at the same 2500 sims is 0.67),
  the finder prints 1 paired SE.
  The Lab is now conservative (real changes can paint grey).
- **V10. Console.** Zero errors, NaN, undefined or blanks in the three target leagues on 8a88109.
  Washington (ESPN) logs a 404 to `api.sleeper.app/v1/league/1532688686` on every load. One
  transient `ERR_CONNECTION_REFUSED` on an external resource (taco, old code, not reproduced).

### Sanity trades (8a88109; 2026 title odds before → after, A = Trevor)

| League | Trade | Verdict | A | B | Agree? |
|---|---|---|---|---|---|
| Phi Kap | CMC for Malachi Fields (/1) | WIN FOR B | 5.2 → 2.0 | 6.6 → 11.6 | Yes |
| Phi Kap | Rashee Rice for Tee Higgins (/8) | FAIR | 5.2 → 5.1 | 9.6 → 9.9 | Yes (old code: CLOSE) |
| Phi Kap | Burden for M. Golden (/8) | WIN FOR B | 5.2 → 3.6 | 9.6 → 12.3 | No, a 13-pt gap (V2) |
| Phi Kap | Burden + Corum for Lamb (/8) | WIN FOR A | 5.2 → 6.3 | 9.6 → 8.1 | Yes |
| Phi Kap | McPherson + Black for Hall (/1) | WIN FOR B | 5.2 → 8.4 | 6.6 → 4.1 | No, inverted (V1) |
| Phi Kap | Kraft + T. Ferguson for Golden, no TE left (/8) | WIN FOR B | 5.2 → 2.5 | 9.6 → 10.3 | Yes |
| Phi Kap | A.J. Brown (IR) for DK Metcalf (/2) | WIN FOR A | 5.2 → 6.1 | 11.6 → 10.5 | No, even on ROS (V2) |
| Phi Kap | Goff for Caleb Williams, Doubtful (/5) | FAIR | 5.2 → 5.0 | 8.3 → 8.0 | Yes |
| Phi Kap | Goff for Davante Adams, both lineups +5 / +6 (/12) | FAIR | 5.2 → 4.6 | 15.0 → 13.5 | Partly, both odds fall |
| taco | Josh Allen for Tutu Atwell (/3) | WIN FOR B 22% | 10.2 → 7.8 | 0.0 → 0.0 | Yes |
| taco | Waddle for Tee Higgins (/1) | FAIR 99% | 10.2 → 8.6 | 25.7 → 28.5 | Yes |
| taco | Waddle + Downs for Ja'Marr Chase (/6) | FAIR 98% | 10.2 → 10.6 | 19.7 → 19.0 | Yes |
| taco | Allen + Caleb + J. Love for Chase + Bowers, no QB left (/6) | FAIR 97% | 10.2 → 5.6 | 19.7 → 15.4 | Partly (V5) |
| taco | Watson for A.J. Brown, IR slot (/6) | FAIR 97% | 10.2 → 9.0 | 19.7 → 21.5 | Yes (B gain part phantom, V7) |
| taco | Jeremiyah Love (21) for Derrick Henry (32) (/1) | CLOSE 79% | 10.2 → 10.7 | 25.7 → 25.6 | Yes |
| taco | Jordan Love for Davante Adams (/9) | FAIR 96% | 10.2 → 11.8 | 2.8 → 1.8 | Yes |
| The League | Achane for Ja'Tavion Sanders (/1) | WIN FOR B 29% | 8.8 → 5.3 | 13.8 → 18.3 | Yes |
| The League | DeVonta Smith for Garrett Wilson (/9) | FAIR 99% | 8.8 → 7.8 | 15.5 → 17.6 | Yes |
| The League | Kyler Murray + Waddle for Drake Maye (/2) | CLOSE 81% | 8.8 → 7.2 | 30.3 → 33.6 | Yes |
| The League | Kyler + Bryce Young for Jefferson, only Doubtful/Out QBs left (/2) | CLOSE 77% | 8.8 → 5.2 | 30.3 → 32.6 | Partly, should favor B |
| The League | Caleb (Doubtful) for Drake Maye (/2) | FAIR 100% | 8.8 → 10.4 | 30.3 → 30.0 | Yes (strength row V6) |
| The League | Nabers (23) for Davante Adams (33) (/2) | WIN FOR B 63% | 8.8 → 9.9 | 30.3 → 30.6 | Yes |
| The League | Josh Downs for Baker Mayfield, lineups +26 / +44 (/10) | CLOSE 79% | 8.8 → 9.7 | 6.4 → 6.2 | Yes |

### Dynasty regressions

- 2026 odds start from real records on the real schedule in both median leagues (4 results per
  team at week 3 passes the check); two-sided `whatIf`, 6-team bracket: consistent with CLAUDE.md.
  The CLI does not follow (V3).
- Strength deltas bench Doubtful/Out at year 0: consistent with CLAUDE.md's `isSidelined` rule
  (V6 is presentation, not a rule break). An emptied slot is free in dynasty strength (V5).
- Long-horizon trades still weigh future value: Love for Henry reads CLOSE 79% with 3-season title
  A -4.0 / B +5.1 and Year-by-Year A -15.6 today to -76.5 at +5; Nabers for Adams WIN FOR B 63%,
  A -4.5 / B +6.7 over 3 seasons, -26.6 to -70.9.

### Determinism

Kaelon Black for Breece Hall (Phi Kap) and Jeremiyah Love for Derrick Henry (taco): three fresh
sessions, a second "Run title odds" on the same page, and reversed click order all identical, on
both code versions. All six finder deals identical across three loads.

---

## Fixed, round 2 (2026-09-25, branch fix-tradelab-r2)

**Bottom line: the redraft verdict now reads the waiver wire and one projection, the simulator
agrees with it, and the Trade Finder shows only what the Trade Lab will show.** Both highs and all
three mediums are fixed at the shared source, and the five lows are fixed. Two results are not the
"no change" a reader might expect, and both are the simulator being right on one basis: Burden for
Golden sharpens FAIR to CLOSE after the odds run (same side as the lineup), and A.J. Brown for DK
Metcalf now flips to WIN FOR B, because Brown's ten games include all three playoff weeks.

Re-run on `python -m http.server 8871` serving this worktree's `site/`, Python Playwright,
Chromium headless, clicks on real pool rows, `app.js` patched in memory only to expose internals.
Before = `aec3928`, after = this branch. Zero console errors in every run, Washington included.

| Defect | Repro | Before | After |
|---|---|---|---|
| V1 (H) | Phi Kap `/1`, McPherson + Kaelon Black for Breece Hall | WIN FOR B, "Side A is left with an empty starting slot"; lineup -51 / -72; odds A +3.3, B -2.5 | WIN FOR A, lineup edge 70; lineup 1886 → 1955 (+69) / -72; odds A +2.6 (5.4% → 8.0% ±0.5), B -1.8; still WIN FOR A after the odds run |
| V1 (H) | same, New York Giants in place of McPherson | WIN FOR B, empty slot | WIN FOR A, identical numbers (NYG 97.0 < best free DEF 106.8) |
| V1 (H) | `/8`, Tucker Kraft + NYG for CeeDee Lamb | WIN FOR B, empty slot; odds A +2.5, B -4.1 | WIN FOR A, lineup edge 59; odds A +1.8, B -2.3 |
| V1 (H) | `/1`, McPherson + NYG for Emanuel Wilson | WIN FOR B, lineup -217 | FAIR, lineup +0 / +0, odds +0.0 / +0.0 |
| V2 (H) | `/8`, Luther Burden for Matthew Golden | FAIR, then WIN FOR B after odds (A -1.6, B +2.7) | FAIR, then CLOSE after odds (A -0.2 ±0.5 grey, B +0.8 ±0.6): edge 0.5 to B, the lineup's side |
| V2 (H) | `/2`, A.J. Brown (IR) for DK Metcalf | FAIR, then WIN FOR A (A +1.0, B -1.1) | FAIR, then WIN FOR B (A -1.2 ±0.5, B +1.1 ±0.5) |
| V2 (H) | simulator's A.J. Brown | 9.82 a week (167 / 17), then 6 more weeks out | 14.98 a game, out weeks 3 to 7 (his own null lines) |
| V3 (M) | `node site/js/trade-sim.js` 2026, 2500 sims, seed 20260807 (title / playoff) | taco Boutte Hunter 9.2 / 79, Karl Havoc 23.1 / 95; The League CeeDeez 11.7 / 70, World of Tanks 11.5 / 76 | 10.2 / 89, 19.7 / 94; 13.8 / 84, 8.8 / 63: the Lab's numbers exactly |
| V3 (M) | CLI "Stand pat", seed 20260912, 1 season | 8.96% title, 80.1% playoff | 9.92%, 89.2% |
| V4 (M) | Washington, Jaylen Warren for Jameson Williams (Seirin) | finder them +0.1 ±0.9, Lab -1.2 | not shown: at the Lab's 7,500 sims my side reads -0.7 ±0.5 (6.7% → 5.9%) |
| V4 (M) | Washington's shown row, Kenneth Walker for Trey McBride + Brock Purdy | (not offered) | finder +3.5 ±0.8 / +0.6 ±0.7, Lab +3.5 ±0.8 / +0.6 ±0.7, exact |
| V4 (M) | The League, JoeysYIDS | finder +0.0 ±0.3, Lab -0.3 | finder -0.3 ±0.3 = Lab -0.3 ±0.3 (a rebuilder, shown on FV +45) |
| V5 (M) | taco `/6`, Allen + Caleb Williams + Jordan Love for Ja'Marr Chase + Brock Bowers | strength A +15.9; lineup 2067 → 1926 (-140); odds A -4.6, B -4.3 | strength A +0.0; lineup 2067 → 2070 (+4, Jacoby Brissett claimed); odds A +0.1 ±1.4 (grey), B -6.2 |

What changed, at the shared source:

- **V1.** One free-agent pool per league (`freeAgents`, `waiverIds`): rest-of-season lines in
  redraft (K and DEF included), the league-scored blend in dynasty. `redraftLineup`, the dynasty
  branch of `tradeLineupImpact`, `finderLineup` and the dynasty Present Value strength put the best
  free bodies in the pool before AND after the trade, so an emptied slot costs the player's points
  minus the free agent's, floored at 0. The simulator's what-if (`tradeTitleWhatIf(..., lg)`, used
  by both the Lab and the Finder) claims the free agents a manager would (`waiverAdds`, the old
  `finderWaiverAdds`), for both sides, one free agent per team. "Loses outright" is left only for a
  slot not even the waiver wire can fill.
- **V2.** `championshipOdds` defaults to the league's own basis: redraft simulates the same weekly
  rest-of-season lines the lineup and verdict read (`src: 'ros'`), with each player's absence taken
  from his null weeks, not a season total over 17 plus a designation. The verdict logic is unchanged;
  it now reads one projection before and after. The two repros still move after the odds run on
  that one basis: Burden's +13 for the partner, a 9.1% contender, clears his band; Brown's lines
  are 14.6 / 15.9 / 13.3 in weeks 15 to 17 against Metcalf's 10.0 / 10.1 / 11.4, so the side that
  keeps Brown wins the playoffs more often although the season totals tie. Dynasty keeps its
  league-scored season blend (7 of the 9 IR players checked have preseason season totals that never priced the
  absence, so the designation counts once there).
- **V3.** `trade-sim.js` loads `schedule.js` and `weekly-rankings.js` and slices `isDynastyLeague`
  and `rosPointsByPid`, so the CLI replays the season in progress from the real records on the real
  schedule, like the Lab.
- **V4.** `findTrades` keeps its 800-sim screen, then re-runs every row it would show at the Lab's
  count (`SIM.tradeSimBudget` over the horizon: 7,500 redraft, 2,500 dynasty), same seed and same
  what-if, and drops any where the partner's objective is not positive or my gain is under 2 SE.
  The row prints those numbers, so it reads what the Lab reads.
- **V5.** `simulateRosterStrength` builds both lineups with the waiver wire, and in dynasty a trade
  that hands a starting slot a rostered player held to a free agent cannot read as a gain: KTC calls
  a 1QB quarterback replaceable (Allen 77.6), and his lineup says otherwise (354.6 pts against the
  best free QB's 158.8).

Lows: **V6** the dynasty strength row names a moved player whom `isSidelined` benches ("Benched this
week: Caleb Williams (Doubtful)"); the rule itself stands per CLAUDE.md. **V7** in dynasty an IR-slot
player sits out of the receiver's simulated season as he sits out of his owner's (taco, Watson for
A.J. Brown: A -1.2 → -1.8, Karl Havoc +1.8 → +1.7, now matching the lineup row's -27 / +0); redraft
keeps him on both books because his lines price the weeks out. **V8** search "+ For" on a third
team's player makes that team the partner (Kaelon Black, then "Jahmyr Gibbs": Side B becomes The
Infirmary, `#trade/.../5`); a free agent gets a disabled "Free agent" button. **V9** the Lab and the
Finder both print ±2 paired standard errors (E. Johnson for E. Wilson: ±0.7 / ±0.8 → ±0.1).
**V10** the ESPN 404 came from the Trade Lab's partners strip; it no longer asks Sleeper for an ESPN
league id. L3 (week 18) stays open.

Sanity re-runs (after odds): CMC for Emanuel Wilson WIN FOR B (A 5.4% → 2.2%, B 4.6% → 8.5%); Rice
for Tee Higgins FAIR; Kraft + Downs for Lamb WIN FOR A (lineup edge 54, odds A +0.6, B -0.9); Goff +
Shough for Tyler Warren, before WIN FOR B (A 5.2% → 0.9%), now CLOSE by lineup (-8 / -38, the best
free QB scores 256.0) and FAIR after odds (A +0.9, B +1.2: Mahomes is Side B's only QB, so two
backups cover his bye); taco Jeremiyah Love for Derrick Henry unchanged, CLOSE 79%.

Trade Finder for tdub1329, new top 3 (2026 title odds, mine then theirs, ±2 SE; each loaded row
checked in the Lab and identical):

- **Password is taco** (2 rows, 10.9 s): Caleb Williams + 2027 R2 (Wood Grain Grippers) for Chase
  Brown + Jameson Williams, Captain Insano, +5.8 ±1.3 / -2.6 (rebuilder, FV +14), 89%; same for
  Rashee Rice + Jameson Williams, +4.6 ±1.2 / -2.1, 98%.
- **Phi Kap Fantasy**: none (12,178 packages, 2 simulated, none clears the gates).
- **The League** (8 rows, 22.8 s): Jadarian Price + Michael Mayer for Jameson Williams + Mike
  Evans, 6am Tarp Pull, +5.9 ±1.3, 96%; 2027 R1 (Mother Shough'ers) + Bryce Young for Javonte
  Williams + Jared Goff, JoeysYIDS, +5.2 ±1.2, 99%; that 2027 R1 + my 2027 R1 for Sam Darnold + Kyle
  Pitts, My Chubb is Limp, +4.8 ±1.1, 84%.
- **yuH** (8 rows, 16.2 s): 2027 R1 (MT EVEREST) + 2027 R1 (Wake N Baker) for Chase Brown + Derrick
  Henry, mUrK yUh aHa, +9.6 ±1.6, 93%; the same two firsts for Christian McCaffrey + Davante Adams,
  MT EVEREST, +9.2 ±1.6, 80%; Parker Washington + KC Concepcion for McCaffrey + Adams, MT EVEREST,
  +7.3 ±1.6, 96%.

Dynasty numbers that moved: Post-Trade Strength Δ (both lineups claim from waivers, and the V5 cap:
+15.9 → +0.0); the dynasty lineup row (V5 A -140 → +4); Lab title odds, whose what-ifs now claim
free agents and drop IR-slot adds (V5 A -4.6 → +0.1, V7 A -1.2 → -1.8) and whose bands are 2 paired
SE (V7 ±1.7 → ±0.8); the Finder's dynasty rows, now priced at 2,500 sims; and the CLI, now equal to
the Lab. Dynasty baselines (taco 10.2%), Total Value, fairness %, the Year-by-Year rows and the
standings are unchanged. In redraft the lineup and strength numbers now include the waiver wire
(Phi Kap, mine: 1858 → 1886, the free K and DEF), which moves standings strength by the same rule.

Gates: `verify-app.py` 64/64 (63 plus `trade-lab-redraft-waiver-fill`); `check-mobile-layout.py`
390 and 360 MOBILE LAYOUT OK; `node --check site/js/app.js`; 33/33 `site/js/*.test.js` pass. New
`site/js/trade-lab-r2.test.js`: each of its five blocks fails on `aec3928` (kicker costs 45 instead
of 0; even swap FAIR → WIN FOR B, A -7.6, B +8.9; a Finder row the partner loses, +0.50 shown, -0.65
at the Lab's count; no-QB strength 120 → 150; CLI and Lab disagree on every roster) and passes here.

---

## Verification round 2 (2026-09-26, independent adversarial pass on ba619d3)

**Bottom line: dynasty verdicts and the dynasty Trade Finder can be trusted; redraft verdicts still
cannot.** Every round-2 repro behaves as specified, the CLI now equals the Lab, and the Finder prints
exactly what the Lab computes. But the title simulator lets every manager set each week's lineup
knowing how each player's rest of season will turn out, so a second starter at a one-slot position
is priced like a weekly hedge. The side that receives more bodies gains 1 to 3 title points its
lineup does not show, and the redraft verdict follows those odds once they clear the band. A
win-win 2-for-1 reads WIN FOR A, a worthless throw-in flips my own title change from -0.3 to +0.7,
and the redraft Finder returns nothing for any Phi Kap roster tried. Findings: **1 high, 1 medium,
6 low.**

### Method and provenance

- Main checkout at `ba619d3`, `site/js/app.js` md5 `fbf3d400...`. `site/` served on `127.0.0.1:8881`,
  Python Playwright, Chromium headless, clicks on real pool rows. `app.js` patched IN MEMORY only to
  expose internals; one diagnostic variant (below) also re-sorts the simulator's lineup order in
  memory. No repo file other than this section was touched; no commit.
- Every case ran in two separate browser sessions with identical output: 21 audit and sanity cases
  in Phi Kap, 7 new Phi Kap cases, 18 dynasty cases, both Finder lists, and each finding below.
- Four browsers in parallel overloaded `http.server` (connection refused on data files). Those
  runs were discarded and re-run one or two at a time; see L6.
- Scripts and raw outputs: session scratchpad `tl3/`.

### Round-2 and audit repros, re-run

| Defect | Result on ba619d3 |
|---|---|
| V1 (H) | PASS. McPherson + Kaelon Black for Breece Hall: WIN FOR A, lineup +69 / -72, odds A 5.4% → 8.0% ±0.5, B 4.6% → 2.8%. NYG in place of McPherson identical. Kraft + NYG for Lamb (/8): WIN FOR A, A +1.8, B -2.3. McPherson + NYG for E. Wilson: FAIR, +0 / +0 |
| V2 (H) | Basis PASS: the simulator reads the rest-of-season lines, A.J. Brown at 14.98 a game from week 8. Burden for Golden FAIR, then CLOSE 0.5 to B (the lineup's side). Brown for Metcalf WIN FOR B (A -1.2, B +1.1). **The flip class survives by another route: R2-1** |
| V3 (M) | PASS. trade-sim.js's own data list and slices vs the page, 2,500 sims, seed 20260807: 32 of 32 rosters identical (title and playoff) across the three leagues. CMC for E. Wilson at 7,500: CLI -3.17 / +3.89, Lab -3.2 / +3.9 |
| V4 (M) | PASS. Four Finder rows re-run in the Lab (row click plus two reloads): identical numbers and bands. Each partner's objective rises on the site's measure: FV 461 → 475 (twice), 478 → 496, 489 → 534, and the Lab's +4 yr sub-line equals the Finder's "to" value |
| V5 (M) | PASS. taco /6, Allen + Caleb + Jordan Love for Chase + Bowers: strength A +0.0, lineup 2067 → 2070 (+4, Brissett claimed), A +0.1 ±1.4 grey, B -6.2 |
| H1 | PASS. Black for Hall 0.0 ⇄ 68.0, WIN FOR A. Rice for E. Wilson, WIN FOR B |
| H2 A | Goff + Shough for Warren: CLOSE by lineup (-8 / -38, Baker 256.0 is free), FAIR after odds (A +0.9, B +1.2). B's +1.2 is R2-1 |
| H2 B / C | Kraft for Warren + Mahomes: CLOSE 0.6 to A. Kraft + Downs for Lamb: WIN FOR A, lineup edge 54. PASS |
| H3 / H4 / M1 | PASS. One 2026 row, no Year-by-Year block, `rosterOwnedPicks` = 0 in Phi Kap. CMC for E. Wilson WIN FOR B (A 5.4% → 2.2%, B 4.6% → 8.5%) |
| M2 | PASS. Season in progress seeded from records on the real schedule (CLI parity above) |
| M3 | Value, lineup, search PASS. McPherson for Fairbairn FAIR (both below the free 137.7); NYG for Seattle CLOSE, lineup edge 16 to A. K and DEF still absent from the simulator (queued) |
| M4 | PASS. E. Johnson for E. Wilson: +0.1 ±0.1 / +0.0 ±0.1, grey, FAIR |
| M5 / M7 | PASS. King Henry TE need, value 9. Kraft VOR +56 beside 30.7 |
| M6 | Redraft Finder: 0 trades. See R2-1 |

### HIGH

**R2-1. Title odds price depth with hindsight, the redraft verdict follows them, and the redraft
Finder finds nothing.**
- Repro A, `#trade/1389722402430136320/9`: Rashee Rice for Jaylen Waddle + Brock Purdy. Lineups
  **+14 / +17**, both sides better. After Run title odds: **WIN FOR A, "2026 title odds edge 1.4 pts
  to Side A"**, A 5.4% → 6.9% ±0.6, B 14.8% → 13.6% ±0.8 (red). Brown Boys keep Trevor Lawrence (314
  rest of season) and Baker Mayfield (256.0) is free, so losing QB2 Purdy costs them almost nothing
  on the field. Every fantasy player calls this a win-win, FAIR.
- Repro B, `/8`: Tucker Kraft for Matthew Golden reads CLOSE 15 to B (lineup -29 / +2, odds A -0.3,
  grey). Add Terrance Ferguson (TE2, 61.7, never starts) to Side A: lineup identical, but A becomes
  **+0.7 ±0.5 (green)** and the verdict **FAIR**. A worthless throw-in improves my side.
- Repro C, `/1`: Goff + Shough for Tyler Warren, lineup -8 / -38, reads FAIR after odds because Side
  B gains +1.2 from two backup QBs it has no slot for.
- Cause: `rollSeason` draws each player's season multiplier (`projectionSigma` 0.35) and sorts the
  pool on `v = mean * mult`; `simWeek` fills the lineup in that order. From week 3 on, every
  simulated manager knows which of his two QBs will finish better, so QB2 is worth a full hedge:
  swapping Brown Boys' Purdy for the free Baker, no trade, costs them 1.07 title pts. The lineup,
  the value and the verdict's first half never see this. The trade what-if also claims free agents
  the baseline never gets (`waiverAdds` on the after side only), which is how the throw-in in
  Repro B buys A a second waiver TE (L1).
- Isolated: the same code with the lineup set on the projection (`b.mean - a.mean` in
  `rollSeason`'s sort, patched in memory) reads Repro A **FAIR** (A +0.6, B -0.1, both grey), Repro
  C **CLOSE 15 to A** (B -0.7) and Repro B's throw-in version **CLOSE 15 to B** (A -0.6). Every one
  is what a knowledgeable player says. It also moves baselines: mine 5.4% → 5.8%, Brown Boys 14.8%
  → 13.2%.
- Finder: "0 trades from 12,178 packages, 2 simulated" for tdub1329 (three runs), and 0 for R2,
  R9, R12 and R4 with `is_me` flipped in memory (2, 5, 12 and 1 simulated). Of the 19 candidates
  simulated as R7, R12 and R9, all with my lineup +12 or better and the partner's +0 or better, the
  partner's title odds fall in 10 at the Lab's 7,500 sims (Rice for Waddle + Purdy: them -1.23 ±0.83
  on a +17 lineup), and none passes. With the hindsight removed, two pass at 7,500 but still die at
  the 800-sim screen, whose 2 SE bar was 2.3 and 2.7 pts on those two (Zay Flowers for Parker
  Washington + Trevor Lawrence, as R12: +2.00 ±2.71 at 800, +2.31 ±0.93 at 7,500), so the screen
  needs the same look once the simulator is fixed.
- Should: set simulated lineups on what the manager can know (the projection, or a multiplier
  revealed over the weeks), claim free agents in the baseline as the lineup already does, then
  re-check that win-win swaps read FAIR.

### MEDIUM

**R2-2. Dynasty title odds count an IR-slot star as out for all of 2026.** taco `/6`, Christian
Watson for A.J. Brown (Karl Havoc's IR slot): 2026 A 10.2% → 8.4% (-1.8), B +1.7, lineup -27 / +0.
Brown's own Sleeper lines (the ones redraft uses) have him back in week 8 at about 15 a game,
through the fantasy playoffs, which is exactly why a 4-0 contender buys him. The V7 fix removes him
from both books (`reserve` filter in `championshipOdds`, `startableIds` without stash). Verdict is
KTC FAIR 97% and unaffected, and the Finder excludes IR-slot players, but the title row, the number
CLAUDE.md sends "should I make this trade" to, reads a playoff rental as a loss.

### LOW

- **L1. The simulator's baseline never claims free agents; a trade's what-if does.** Ferguson for E.
  Wilson (`/1`, two players who never start, lineup +0 / +0): A +0.5 ±0.3 green. Dropping Ferguson
  for Darren Waller with no trade at all: A +0.53. Mostly an amplifier of R2-1: with lineups set on
  the projection the same swap reads +0.1, grey.
- **L2. Two "strength Δ" readings disagree on the dynasty page.** taco `/3`, Allen for Tutu Atwell:
  Post-Trade Strength Δ -34.4, Year-by-Year "Today" -60.6. The League `/2`, Kyler + Waddle for Drake
  Maye: Post-Trade +18.2, "Today" -22.3 (lineup -36). The Today cell is the summed value of the
  pieces (`projectSideValue`), while its note says "On-field strength change in each season".
- **L3. The Finder calls a 4-0 team "rebuilding (tank)".** The League, JoeysYIDS (4-0): stance comes
  from lineup-strength quintile only. The deal itself is defensible (their simulated title odds are
  0.4%), the label reads wrong.
- **L4. Dynasty verdict is value only when a trade empties QB in superflex.** The League `/2`, Kyler +
  Bryce Young for Justin Jefferson (Caleb Doubtful, Dart on IR): CLOSE 77%, the value gap alone,
  beside lineup -247 this week and -12.0 title pts over 3 seasons. By design (KTC is the verdict);
  the title rows carry the cost.
- **L5. The CLI does not claim free agents; the Lab does.** `trade-sim.js` slices no
  `tradeTitleWhatIf` / `waiverAdds`, and its header and CLAUDE.md still say to `add` the free agent
  by hand, so a CLI scenario that empties a position prices differently from the Lab unless it does.
- **L6. A failed data file reads as a clean FAIR.** With `weekly-rankings.js` refused by the
  overloaded server, Phi Kap McPherson for Fairbairn showed lineup 0 → 0, 0.0% → 0.0% title odds and
  FAIR, no warning. A flaky phone connection can do the same.
- Note: the round-2 explanation of A.J. Brown for Metcalf cites his week 15 to 17 lines, but
  `simPool` uses a flat per-game rate (`pts / games`); his 14.98 a game against Metcalf's ~10.2 in
  the playoff weeks is the real reason. The verdict stands.

### Sanity trades (2026 title odds before → after, A = Trevor)

| League | Trade | Verdict | A | B | Agree? |
|---|---|---|---|---|---|
| Phi Kap | CMC for Malachi Fields (/1) | WIN FOR B | 5.4 → 2.3 | 4.6 → 8.4 | Yes |
| Phi Kap | Rice for Tee Higgins (/8) | FAIR | 5.4 → 5.7 | 9.1 → 9.0 | Yes |
| Phi Kap | Burden for M. Golden (/8) | CLOSE 0.5 to B | 5.4 → 5.2 | 9.1 → 9.9 | Yes |
| Phi Kap | Burden + Corum for Lamb (/8) | WIN FOR A | 5.4 → 6.5 | 9.1 → 8.0 | Yes |
| Phi Kap | Rice for Waddle + Purdy (/9), lineups +14 / +17 | WIN FOR A | 5.4 → 6.9 | 14.8 → 13.6 | No, FAIR (R2-1) |
| Phi Kap | Kraft + Ferguson for Golden, TE emptied (/8) | FAIR | 5.4 → 6.1 | 9.1 → 9.1 | No, CLOSE to B (R2-1) |
| Phi Kap | McPherson + Black for Hall, K emptied (/1) | WIN FOR A | 5.4 → 8.0 | 4.6 → 2.8 | Yes |
| Phi Kap | Goff + Shough for Warren, QB emptied (/1) | FAIR | 5.4 → 6.3 | 4.6 → 5.7 | Partly, lean A (R2-1) |
| Phi Kap | A.J. Brown (IR) for DK Metcalf (/2) | WIN FOR B | 5.4 → 4.2 | 6.6 → 7.7 | Yes |
| Phi Kap | Shough + Downs for Jayden Daniels (Out, IR slot) (/6) | WIN FOR B | 5.4 → 4.4 | 7.2 → 8.3 | Yes |
| Phi Kap | McPherson for Fairbairn, K swap (/4) | FAIR | 5.4 → 5.4 | 7.4 → 7.4 | Yes |
| Phi Kap | NYG for Seattle, DEF swap (/4) | CLOSE 16 to A | 5.4 → 5.4 | 7.4 → 7.4 | Yes |
| taco | Josh Allen for Tutu Atwell (/3) | WIN FOR B 22% | 10.2 → 7.8 | 0.0 → 0.0 | Yes |
| taco | Waddle for Tee Higgins (/1) | FAIR 99% | 10.2 → 8.6 | 25.7 → 28.5 | Yes |
| taco | Waddle + Downs for Ja'Marr Chase (/6) | FAIR 98% | 10.2 → 10.6 | 19.7 → 19.0 | Yes |
| taco | Allen + Caleb + J. Love for Chase + Bowers, QB emptied (/6) | FAIR 97% | 10.2 → 10.3 | 19.7 → 13.5 | Yes (Brissett fills a 1QB slot) |
| taco | Watson for A.J. Brown, IR slot (/6) | FAIR 97% | 10.2 → 8.4 | 19.7 → 21.4 | Verdict yes, title row no (R2-2) |
| taco | Caleb (Doubtful) for Drake Maye (/6) | FAIR 100% | 10.2 → 10.5 | 19.7 → 19.0 | Yes |
| taco | Jeremiyah Love for Derrick Henry (/1) | CLOSE 79% | 10.2 → 10.7 | 25.7 → 25.6 | Yes |
| The League | Achane for Ja'Tavion Sanders (/1) | WIN FOR B 29% | 8.8 → 5.3 | 13.8 → 18.3 | Yes |
| The League | DeVonta Smith for Garrett Wilson (/9) | FAIR 99% | 8.8 → 7.8 | 15.5 → 17.6 | Yes |
| The League | Kyler + Waddle for Drake Maye (/2) | CLOSE 81% | 8.8 → 7.2 | 30.3 → 33.6 | Yes |
| The League | Kyler + Bryce Young for Jefferson, no healthy QB (/2) | CLOSE 77% | 8.8 → 5.3 | 30.3 → 32.6 | Partly (L4) |
| The League | Jaxson Dart (Out, IR slot) for Cam Ward (/2) | CLOSE 82% | 8.8 → 10.7 | 30.3 → 28.8 | Yes |
| The League | Caleb (Doubtful) for Drake Maye (/2) | FAIR 100% | 8.8 → 10.4 | 30.3 → 30.0 | Yes |
| The League | Nabers for Davante Adams (/2) | WIN FOR B 63% | 8.8 → 9.9 | 30.3 → 30.6 | Yes |

taco and The League start no K or DEF, and none appears in their pools, so the K/DEF case applies
to Phi Kap only.

### Trade Finder vs Trade Lab

- **Phi Kap**: 0 trades (R2-1), three runs.
- **Password is taco** (2 rows, 90,002 packages, 12 simulated, ~19 s): Caleb Williams + 2027 R2 (Wood
  Grain Grippers) for Chase Brown + Jameson Williams, Captain Insano, finder +5.8 ±1.3 / -2.6 ±0.7,
  their FV 461 → 475; Lab identical on row click and two reloads, CLOSE 89%, lineup +138 / -161.
  Same pieces for Rashee Rice + Jameson Williams: +4.6 ±1.2 / -2.1 ±0.7, Lab identical, FAIR 98%.
- **The League** (8 rows, 184,063 packages, 20 simulated, ~40 s): Jadarian Price + Michael Mayer for
  Jameson Williams + Mike Evans, 6am Tarp Pull, +5.9 ±1.3 / -3.2 ±0.9, FV 478 → 496, Lab identical,
  FAIR 96%. 2027 R1 (Mother Shough'ers) + Bryce Young for Javonte Williams + Jared Goff, JoeysYIDS,
  +5.2 ±1.2 / -0.3 ±0.3, FV 489 → 534, Lab identical, FAIR 99% (L3).
- Both lists identical across two Finder runs. Every partner shown is a rebuilder, so each is gated
  on FV, and FV rises by the site's own measure in all four.

### Determinism

Kaelon Black for Breece Hall (Phi Kap) and Jeremiyah Love for Derrick Henry (taco): three fresh
sessions, a second Run title odds on the same page, and reversed click order, all identical. Rice
for Waddle + Purdy identical in two sessions and in the direct simulator call.

### Console, NaN, blanks

Single-browser runs in all three leagues (trade, odds, Finder): zero console errors, no NaN,
undefined, Infinity or null in the page text, no blank title, lineup or year cells. The only errors
all session were `ERR_CONNECTION_REFUSED` from the overloaded local server (L6).

---

## Fixed, round 3 (2026-09-26, branch fix-tradelab-r3)

**Bottom line: the title simulator now sets every simulated week's lineup on the projection, then
draws that week's outcomes for the starters only, so a bench body is worth the weeks he fills in and
nothing more.** Rice for Waddle + Purdy reads FAIR, the Kraft throw-in no longer moves the verdict,
and Goff + Shough for Warren reads CLOSE to A. A dynasty IR-slot player now counts from the week his
lines resume, on his owner's book and a receiver's. The redraft Finder still shows nothing for
tdub1329, now for the right reason: both deals that reach the simulation lower the partner's odds.

Re-run on `python -m http.server 8891` serving this worktree's `site/`, Python Playwright, Chromium
headless, clicks on real pool rows, `app.js` patched in memory only to expose internals. Before =
`0614484` (app.js md5 `fbf3d400...`, the file the round-2 verifier tested), served from a saved copy;
after = this branch. Every before number below reproduces the verifier's. Zero console errors in
every run.

| Finding | Repro (A = Trevor, after Run title odds) | Before | After |
|---|---|---|---|
| R2-1 (H) | Phi Kap `/9`, Rashee Rice for Jaylen Waddle + Brock Purdy, lineups +14 / +17 | WIN FOR A, edge 1.4 to A; A 5.4% → 6.9% (+1.5 ±0.6), B 14.8% → 13.6% (-1.2 ±0.8) | **FAIR**, lineup edge 1, even; A 5.8% → 6.4% (+0.6 ±0.6, grey), B 13.2% → 13.1% (-0.1 ±0.8, grey) |
| R2-1 (H) | `/8`, Tucker Kraft for Matthew Golden | CLOSE 15 to B; A -0.3 ±0.5, B +0.4 ±0.6 | CLOSE 0.6 to B; A -1.2 ±0.5 (5.8% → 4.6%), B +0.0 ±0.6 |
| R2-1 (H) | same, plus Terrance Ferguson (never starts) on Side A | **FAIR**; A +0.7 ±0.5 (green), B +0.0 | **CLOSE 15 to B**; A -0.6 ±0.6 (grey), B +0.1 ±0.6 |
| R2-1 (H) | `/1`, Jared Goff + Tyler Shough for Tyler Warren, lineups -8 / -38 | FAIR; A +0.9 ±0.6, B +1.2 ±0.5 (both green) | **CLOSE 15 to A**; A +0.1 ±0.6 (grey), B -0.7 ±0.5 (red) |
| L1 | `/1`, Terrance Ferguson for Emanuel Wilson, lineups +0 / +0 | A +0.5 ±0.3 (green) | A +0.1 ±0.3, B +0.2 ±0.2 (both grey), FAIR |
| R2-2 (M) | taco `/6`, Christian Watson for A.J. Brown (IR slot, back week 8) | 2026 A 10.2% → 8.4% (-1.8 ±0.8, red), B +1.7 ±1.1; 3 seasons -2.8 / +2.6 | 2026 A 10.8% → 10.8% (-0.0 ±1.0, grey), B +1.0 ±1.2 (grey); 3 seasons -2.0 / +2.3 |
| R2-1 (H) | Redraft Finder, tdub1329 | 0 trades, 2 simulated | 0 trades, 2 simulated (below) |
| R2-1 (H) | Redraft Finder as R2, R9, R12, R4 (`is_me` flipped in memory) | 0, 0, 0, 0 | 0, 0, **1**, 0: R12 gets Zay Flowers for Parker Washington + Trevor Lawrence, +2.3 ±0.9 / +0.0 ±0.9 |

The throw-in still moves my own number by +0.6, inside its band, and the verdict with it no longer
moves. What is left is L1, not hindsight: shipping Ferguson too lets Side A claim a second free TE who
projects above him, a claim the baseline never makes.

Why tdub1329 still gets no Phi Kap deal: both candidates that reach the simulation are with Brown
Boys, and at the Lab's 7,500 sims the partner loses on each. Rice for Waddle + Purdy: me +0.64 (SE
0.32), them -0.09 (0.38). Christian McCaffrey for James Cook + Trevor Lawrence (lineups +12 / +20):
me +0.75 (0.35), them -0.80 (0.44). The partner gate is right to refuse both.

Sanity re-runs (after odds): CMC for Emanuel Wilson WIN FOR B (A 5.8% → 2.1%, B 5.9% → 9.9%);
McPherson + Kaelon Black for Breece Hall WIN FOR A (A +2.9, B -2.3, the waiver-fill case); Burden for
Golden CLOSE 0.7 to B (A -0.6, B +0.7); A.J. Brown for DK Metcalf WIN FOR B (A -1.7, B +1.6); Rice for
Tee Higgins FAIR (A -0.4, B -0.0, grey); taco Waddle for Tee Higgins FAIR 99% (2026 A -1.0 grey, B +1.8).

### Baseline title odds moved (expected)

The Lab's own baseline run for tdub1329, seed 20260807, 7,500 sims redraft, 2,500 a season dynasty:

| League | 2026 before → after | Later seasons |
|---|---|---|
| Phi Kap | 5.40% → 5.79% (+0.4) | none (redraft) |
| Password is taco | 10.20% → 10.80% (+0.6) | 2027 8.48 → 9.08, 2028 8.96 → 9.00 |
| The League | 8.76% → 8.28% (-0.5) | 2027 19.16 → 18.80, 2028 22.60 → 22.28 |
| yuH | 17.32% → 24.04% (+6.7) | 2027 31.60 → 29.00, 2028 32.36 → 32.68 |

Two causes, split with a lineup-fix-only build. The hindsight lineup inflated deep benches: The
League's 49ers 30.3% → 25.0%, taco's Scrote Squad 25.7% → 21.4%, Phi Kap's Brown Boys 14.8% → 13.2%,
while others gain (NatePackard12 15.5% → 20.8%). That alone moves my four leagues +0.4, +1.3,
-0.3 and +0.6. The IR-slot fix is the rest, and it is nearly all of yuH: my IR slots hold Puka Nacua
(Questionable, lines every week from week 3), Jayden Reed and Alec Pierce (Out, back in weeks 5 and 4), all
of whom the old code left out of 2026. Wake N Baker gains the same way, 7.9% → 13.3% (Nico Collins and
Zay Flowers in IR slots).

### Trade Finder, tdub1329, top 3 (2026 title odds, mine then theirs, ±2 SE)

Row 1 of each league was loaded into the Lab and run: identical numbers and bands.

- **Phi Kap Fantasy**: 0 trades from 12,178 packages, 2 simulated (above).
- **Password is taco** (5 rows, 90,002 packages, 15 simulated, 22.1 s): Caleb Williams + 2027 R2 (Wood
  Grain Grippers) for Chase Brown + Jameson Williams, Captain Insano, +7.6 ±1.4 / -2.5 ±0.7, 89%;
  same for Rashee Rice + Jameson Williams, +5.0 ±1.3 / -2.0 ±0.8, 98%; Caleb Williams for Sam LaPorta,
  Pre bobby Mud Dogs, +2.1 ±1.0 / +0.0, 84%.
- **The League** (7 rows, 184,063 packages, 19 simulated, 31.7 s): Jadarian Price + Michael Mayer for
  Jameson Williams + Mike Evans, 6am Tarp Pull, +6.2 ±1.3 / -2.2 ±0.9, 96%; 2027 R1 (Mother
  Shough'ers) + Jadarian Price for Breece Hall + DK Metcalf, Mother Shough'ers, +4.9 ±1.2 / -1.6 ±0.7,
  84%; 2027 R1 (Mother Shough'ers) + Bryce Young for Javonte Williams + Jared Goff, JoeysYIDS, +3.6
  ±1.2 / -0.5 ±0.3, 99%.
- **yuH** (7 rows, 124,060 packages, 21 simulated, 22.4 s): Parker Washington + KC Concepcion for
  Chase Brown + Derrick Henry, mUrK yUh aHa, +5.9 ±1.7 / -1.8 ±0.7, 92%; same for Derrick Henry + Sam
  LaPorta, +5.8 ±1.7 / -1.4 ±0.7, 98%; same for Christian McCaffrey + Davante Adams, MT EVEREST, +5.3
  ±1.7 / -4.7 ±1.0, 96%. My yuH baseline is now 24.0%, so every gain reads smaller than round 2's.
- Washington (redraft, the verify-app league): 2 rows, Kenneth Walker for Trey McBride + Brock Purdy
  with Carter's Competitive Team, +2.0 ±0.7 / +1.6 ±0.7.

### What changed, at the shared source

- **R2-1.** `rollSeason` no longer sorts the pool on `v = mean x mult`; the pool stays in `simPool`'s
  order, the projection, and `simWeek` fills each week's lineup from it through `fillLineup` after
  byes, injuries and designations (absence from the weekly lines in redraft) take their players out.
  Only the starters' outcomes are drawn and summed. The QB stack partner is also picked on the
  projection. Common random numbers are untouched: every draw is still keyed on (player, season, slot),
  so a bench body who never starts leaves every simulated season exactly as it was.
- **Finder screen.** The 800-sim screen now asks my gain to clear 1 SE (`SIM.finderScreenSeMult`); the
  re-run at the Lab's count still asks 2 SE, so a shown row reads what the Lab reads. At 2 SE the
  screen was killing real +2 deals.
- **R2-2.** In dynasty, `championshipOdds` keeps IR-slot players on both books and `simPool` starts
  one when his weekly lines resume (`line.out`), or leaves him out when no line is left this season.
  His rate stays the league-scored season blend / 17, per the dynasty ponytail. A.J. Brown is one of
  the minority whose blend (167) already left out the missed games, so his dynasty rate reads 9.8 a
  week against 15 on his lines. Moving dynasty onto the lines is the ponytail's upgrade path.

Lows: **L2** the Year-by-Year note now says what the cells are (value received minus sent, not the
lineup change). **L3** the Finder no longer calls a low-lineup partner "rebuilding"; it says his lineup
ranks low and he is priced on the future. **L6** a redraft verdict reads INCOMPLETE, "Weekly
projections did not load", when the weekly lines are missing, instead of a clean FAIR. **L4** is by
design. **L1** (the baseline never claims free agents) and **L5** (the CLI claims none) are left: the
fix is a waiver pool inside `championshipOdds` for every roster, which moves every baseline and needs
new slices in `trade-sim.js` and three test harnesses. After R2-1 its effect sits inside the band (L1
repro +0.1, the throw-in +0.6).

Tests: new `site/js/trade-lab-r3.test.js`, each block fails on `0614484`: a TE2 who never starts moved
his side's title odds +2.27 (now exactly 0, every simulated champion identical); a trade that gains
both lineups read WIN FOR A (+4.2 / -2.2; now FAIR); an IR-slot WR back in week 6 added nothing
(281.7 → 281.7 expected points; now counts from week 6, a week-9 returner adds nothing to the regular
season but counts in the final, and a receiver books him too). `site/js/trade-finder.test.js` (a)
pinned "w1 for t2 + r10", whose title gain was mostly r10's hindsight hedge from T2's bench (+3.9 at
the Lab's count before, +1.8 now), and two better packages with T2 now outrank it under the per-partner
cap; it now asserts a multi-piece package for a TE with T2 (the finder offers w1 + w3 for r3 + t3,
+5.2). No feature-map assertion encoded the old behavior and none changed.

Gates: `verify-app.py` 64/64 VERIFIED; `check-mobile-layout.py` 390 and 360 MOBILE LAYOUT OK;
`node --check site/js/app.js` clean; 34/34 `site/js/*.test.js` pass (33 plus `trade-lab-r3.test.js`).
