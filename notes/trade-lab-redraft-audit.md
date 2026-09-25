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
