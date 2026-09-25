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
