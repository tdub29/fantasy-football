# De'Von Achane's ACL: what it does to the 2026 title odds, 2026-09-29

**Answer first.** The injury costs about 4 to 5 points of title odds in Password is taco and 2 to 3 in
The League, and the waiver wire gives back essentially none of it in either league. In taco, where you
are 5-1 and a near-lock for the playoffs, one trade gets it all back: **Caleb Williams for Chase Brown**
from 0-6 Captain Insano measures +4.2 points of title odds, which is 96% of what the injury took. In The
League, at 0-6, 2026 is not the season that matters. The roster projects as the #1 or #2 lineup from 2027
on, the tested Henry buy and Murray sale flip sign under the pick-value stress test, so the
provisional move is to hold and keep Achane. The draft-order correction below
qualifies the pick-sensitive simulations and the projected 2027 window.

| | Title now | Title if healthy | Title with best waiver RB | Playoff now / healthy | vs 7th place (first out): today / projected end | Phase | Best move |
|---|---|---|---|---|---|---|---|
| Password is taco (5-1) | 5.3% | 9.7% | 5.5% | 83% / 91% | +4 wins / +5 | Win-now capable, W = 4 | Caleb Williams for Chase Brown: 9.5% title, 92% playoff |
| The League (0-6) | 4.6% | 7.3% | 4.5% | 40% / 52% | -2 wins / -1 | Retool, already rebuilt, W = 6 | Hold. No claim, no buy, no sell. |

Those are the app's default basis (season projection). The rest-of-season weekly-line basis, which sees
this week's roles, reads taco 6.6% now, 12.1% healthy, and The League 1.6% now, 3.2% healthy. Both bases
agree on every direction in this note; they disagree on levels, and the weekly-line basis is harsher on
The League.

## Draft-order correction, 2026-09-30

Trevor confirmed: **The League orders picks by lowest Max PF first; Password is taco
uses a 40% / 30% / 20% / 10% lottery drawing all four slots for the bottom four teams.** These rules replace
the reverse-standings speculation below. The original simulations were not re-run.

**The League: injury has a second channel through your retained picks.** Record and
actual points for decide the playoff race; Max PF decides draft priority in the
applicable draft-order pool. A 0-6 start does not establish an early first. Project
final cumulative Max PF from accrued Max PF plus remaining weekly optimal scoring
under league rules, including eligible bench production. Benching a healthy scorer
does not reduce potential scoring. Achane's absence can reduce remaining Max PF
and improve your own 2027 first, but only if it changes your rank against other
eligible teams. No measured slot gain is established here.

Keep Achane remains a reasonable provisional stance: his absent 2026 production
and potential 2027 return fit the retool. Buying Henry can cost both the pick sent
and value in retained picks if his production changes Max PF rank. Selling Murray
can have the opposite effect if he contributes to optimal weekly scoring. That
does not justify a cheap sale: compare lost production, return, future value and
retained-pick changes together. Your own and Mother Shough'ers' 2027 firsts follow
their respective origin teams, regardless of who holds them. Better pick priority
benefits you only for picks you still own.

**Taco: bottom-four status creates lottery exposure, not a known slot.** Separate
chance of entering that group from conditional chance of winning the lottery.
All four slots are drawn; each eligible origin team can land 1.01 through 1.04.
At the 40% weight, the team still has a 60% chance of missing 1.01, if these are
the first-pick probabilities. Rank-to-weight assignment, reweighting between draws
and later-round treatment remain unconfirmed. Do not
invent those mechanics or calculate a full slot distribution from four weights
alone. For uncertain slots, value the probability-weighted KTC outcomes,
`sum(P(slot) * KTC(slot))`, rather than KTC at an average slot.

You own no taco 2027 or 2028 first, so a worse finish cannot improve a retained
first in those years. It may benefit that first's current owner; later-round
effects depend on the actual rules. Caleb for Brown still addresses the immediate
lineup gap without spending a first. Captain Insano's 0-6 record alone neither
establishes a guaranteed early pick nor proves they want to sell. Model their
playoff outlook and lottery incentives before treating them as a motivated seller.

**Numerical limit:** `originSlotOrder` in the current app ranks projected starters
by dynasty strength. That is neither cumulative Max PF nor a lottery model.
The original multi-year title odds, pick shares and trade-equity deltas therefore
remain outputs of that proxy, not validated estimates under these confirmed rules.
`SCALE=1.3` tests conversion calibration; it does not repair draft-order mechanics.
Single-season title deltas do not use rookie draft order and retain their original
assumptions. The 2027 window is plausible, but two firsts are uncertain rookie
outcomes, not two guaranteed starters. Reprice origin teams after each proposed
trade using the actual rule before making a pick-sensitive decision.

Still to confirm: The League's eligible Max PF pool, scoring cutoff, ties and
IR/taxi treatment; taco's weight assignment, reweighting procedure and round treatment.
Until confirmed, use conditional ranges instead of exact slots. Going-forward
policy lives in `docs/FRAMEWORKS.md` under league-specific draft order.

## How it was measured

- **Data**: the full refresh that finished at 11:30 today (`projections/build_all.py`, 46 of 50 steps ok).
  Of the four failures, three (Gibbs weekly board and its check, kicker board) feed neither simulation basis
  used here, and neither league starts a kicker. The PrizePicks failure leaves the previous PrizePicks dump
  underneath the season props, which did refresh (BettingPros 9-book consensus merged over it). The weekly
  basis reads only Sleeper's weekly lines.
- **Simulator**: `championshipOdds` from `site/js/app.js`, sliced into node exactly as
  `site/js/trade-sim.js` does it. The one in-memory change is a hook that records each simulated season's
  playoff field and win totals, so playoff and bye deltas get paired standard errors the same way title
  deltas do. Nothing was written to the project.
- **Sims**: 2 seeds (20260807, the app default, and 777001) x 20,000 seasons = 40,000 per scenario. Every
  delta below is paired on common random numbers (the counter-based draws keyed on player id) and pooled
  over both seeds, reported as delta ± 1 SE in percentage points. The two seeds agree on every sign.
- **Playoff rule, checked against Sleeper's own settings** (`Leagues/<league>/league.json`, fetched
  11:24 today): both leagues have `playoff_teams` 6, `playoff_week_start` 15, `playoff_round_type` 0 (one
  week per round) and `league_average_match` 1 (median game on), with no divisions. The simulator matches
  all of that: 6 seeds, byes for seeds 1 and 2, seeding by wins including median wins, ties broken by
  points for (actual points to date plus simulated), rounds in weeks 15, 16 and 17. One difference I could
  not settle: after round 1 the sim re-seeds (seed 1 meets the lowest seed left), and `playoff_seed_type` is
  0 in both leagues. If 0 is Sleeper's fixed bracket, and I have not confirmed that, the sim differs only
  in who meets whom after round 1. That changes how title odds split among playoff teams, never who gets
  in. Taco also carries `playoff_type` 1 where The League has 0; I did not find what that field controls.
- **Counterfactuals**, all on in-memory copies:
  - *Now*: Achane removed from Trevor's pool for the season.
  - *Healthy*: his pre-injury projection restored from commit 42e434f (season blend 227.3, weekly lines
    for weeks 4 to 17 averaging about 18 a game) and his IR tag cleared.
  - *Replacement*: the best free RB by the app's own logic (`freeAgents`: unrostered, not sidelined, ranked
    on the league-scored blend; on the weekly basis the `rosBoard` free level), plus the roster cut it forces.
    Both rosters are full and both IR slots are taken, so a claim costs a body: Bryce Lance in taco (1.8 a
    game), Tyrone Tracy in The League (0.7 a game).
  - *Trades* model both rosters.
- **Multi-year**: the `titleEquity` loop through `trade-sim.js`'s harness (every roster ages, every pick
  converts), 8 seasons, 2 seeds x 2,500 sims per season, Achane placed in the IR slot of the in-memory
  league so he is out for 2026 and back in 2027. Discount 0.88 with 0.80 and 0.92 as the sweep, terminal
  value at lambda 0.5. Any verdict with a pick in it was re-run at `SCALE=1.3`, as CLAUDE.md requires.

### A bug in the app's current number

The site's title odds are **overstating** you right now. Achane sits on your active roster in both leagues,
not in Sleeper's IR slot (both slots are full: Pearsall and Pacheco in taco, Dart and Tank Dell in The
League). `simPool` only reads the "no weekly line left" signal for IR-slot players, so for everyone else it
falls back to `SIM.designationWeeksOut.IR = 6` and brings him back in week 10 at 9.2 a game. That phantom
return is worth **+2.02 ± 0.08** points of title odds in taco (7.3% shown against 5.3% real) and
**+0.61 ± 0.07** in The League, on the default basis. Not fixed here (read-only task). The fix is to treat
an IR designation with no weekly line left as season-ending wherever the player is rostered.

## Password is taco: 10 teams, 1QB, median scoring, 5-1

### Where you stand

| Team | Record | Title | Playoff | Bye | Rest-of-season pts/wk |
|---|---|---|---|---|---|
| Mahomies | 6-0 | 25.5% | 99.2% | 61.2% | 123.1 |
| Scrote Squad | 6-0 | 23.4% | 99.3% | 63.9% | 123.0 |
| Wood Grain Grippers | 5-1 | 19.8% | 98.4% | 44.9% | 121.4 |
| Karl Havoc | 2-4 | 18.8% | 94.7% | 16.9% | 124.4 |
| **Boutte Hunter (you)** | **5-1** | **5.3%** | **83.0%** | **9.6%** | **103.0** |
| Santa Cruz Brockies | 3-3 | 3.5% | 62.5% | 2.6% | 100.5 |
| Captain Insano | 0-6 | 3.2% | 48.5% | 0.7% | 104.1 |
| Give Rome Dome | 1-5 | 0.5% | 13.9% | 0.1% | 90.3 |
| Pre bobby Mud Dogs | 1-5 | 0.0% | 0.3% | 0.0% | 65.5 |
| Breece's Pieces | 1-5 | 0.0% | 0.3% | 0.0% | 64.6 |

Default basis, Achane out. On the weekly basis the order at the top changes (Scrote Squad 35.2%, Mahomies
20.2%, Karl Havoc 17.9%, Wood Grain 13.4%) and you read 6.6% / 87.1% / 13.4%.

The record is doing a lot of work. You are 3rd in points for (453) but 5th in projected lineup strength:
112.5 a week on the season basis against 127 to 136 for the top four, a gap of about 15 a week to 4th.
With a healthy Achane you were 121.6, still 5th on that basis, 4th on the weekly basis.

### The injury, and what the waiver wire gives back

| Change (paired, vs now) | Title | Playoff | Bye |
|---|---|---|---|
| Achane healthy | **+4.35 ± 0.12** | +8.46 ± 0.14 | +8.79 ± 0.14 |
| Best waiver RB (Isaiah Davis for Bryce Lance) | +0.16 ± 0.03 | +0.67 ± 0.04 | +0.41 ± 0.03 |
| *weekly basis:* Achane healthy | **+5.52 ± 0.13** | +7.42 ± 0.13 | +11.88 ± 0.16 |
| *weekly basis:* best waiver RB (Chris Brooks) | +0.18 ± 0.04 | +0.72 ± 0.05 | +0.58 ± 0.05 |

The waiver wire is empty at RB. Isaiah Davis projects 60.5 for the season and 1.2 a game on his weekly
lines; Chris Brooks is the best weekly line at 3.6. Neither beats Keaton Mitchell (4.1 to 5.9 a game), who is
now your RB2. The whole Achane loss lands in one slot: the RB2 spot drops from about 13 (season basis) or
18 (weekly basis) a game to about 4 to 6. Do not spend any of the $69 FAAB you have left on a running back this week.

### Playoff line and schedule

Six teams get in, so the line is the 7th-place team, the first one out. Wins include the median game;
ties go to points for.

- **Today: 4 wins clear.** You are 5-1; 7th place is Breece's Pieces at 1-5 (311 points for, ahead of the
  other 1-5 teams on the tiebreak). Breece's Pieces is a 65-a-week team, though, so the real race for 6th
  and 7th is Santa Cruz (3-3, 2 behind you) and Captain Insano (0-6, 5 behind you).
- **At season's end**, the 7th-place team finishes with 11 wins of 28 (10th to 90th percentile 8 to 14).
  You project 16 (11 to 21), so your median cushion over the first team out is **+5 wins** (10th to 90th
  percentile -2 to +11; weekly basis +6). Healthy it was +7; with Chase Brown it is +7 again.
- P(playoff) by your final total: 12 wins 47 to 49%, 13 wins 69%, 14 wins 84 to 86%, 15 wins 95 to 96%.
  You need 8 or 9 more of the remaining 22 (a .36 to .41 clip) to be 70 to 85% safe, so getting in is not
  the question.
- The bye is. Scrote Squad and Mahomies are 6-0 with the two best rosters and 61 to 64% bye odds each.
  You sit at 9.6%. The bye is worth 2x title odds structurally in this bracket.
- Schedule left is slightly harder than average: opponents average 112.3 a week against 109.7 for the league
  (weekly basis 140.1 vs 137.3). Three games against the 6-0 teams (Mahomies weeks 4 and 13, Scrote week
  12) and Karl Havoc week 10, against three weak opponents (Give Rome Dome week 7 at 90 a week, Breece's
  Pieces week 8 and Pre bobby week 11 at about 65). The median game halves any schedule effect.

### Phase: win-now capable, unconverted, W = 4

- titleOdds_now 5.3% = **0.53x** fair share (weekly 6.6%, 0.66x).
- titleOdds_reachable 9.5% = **0.95x** with the Brown trade below, both sides modeled (weekly 11.9%, 1.19x).
  Conversion gap 1.8x.
- Lineup rank 5th of 10 on both bases. Value share 10.6% (league average), pick share 15.1% and no
  first-round pick in 2027 or 2028, top-3 concentration 15.8%, value-weighted core age 25.7 (Allen 30,
  McBride 26, Jeremiyah Love 21, Collins 27, Achane 24), VPP 1,292 against a league average of 1,310.
- Window: production retention on the healthy lineup runs 0.99, 0.95, 0.91, 0.83 over the next four years,
  so **W = 4**.
- Retool gate 3 of 4. It misses (a) narrowly: Jeremiyah Love is #14 overall on KTC 1QB, McBride #9 but 26.
  Moot here, because the reachable number puts the roster in the win-now band.
- Risk posture: under 10% title odds, so buy ceiling, not insurance.

**Read**: a playoff team whose title odds sit at half of fair share because the lineup is 5th. It is holding
the currency to fix that: a QB2 that contributes nothing in a 1QB league.

### What to do this week: Caleb Williams for Chase Brown

| Move (paired, vs now) | Title | Playoff | Bye | Pts/wk added |
|---|---|---|---|---|
| **Caleb Williams to Captain Insano for Chase Brown** | **+4.16 ± 0.13** | +8.91 ± 0.16 | +7.78 ± 0.15 | +6.5 |
| Jordan Love to Give Rome Dome for Kyle Monangai | +1.85 ± 0.09 | +4.52 ± 0.12 | +2.92 ± 0.11 | +2.9 |
| Jaylen Wright from Give Rome Dome for Bryce Lance | +0.11 ± 0.02 | +0.57 ± 0.04 | +0.28 ± 0.03 | +0.3 |
| *weekly basis:* Caleb for Brown | **+5.31 ± 0.14** | +8.00 ± 0.15 | +10.28 ± 0.16 | +9.6 |
| *weekly basis:* Love for Monangai | +1.06 ± 0.09 | +2.24 ± 0.10 | +2.02 ± 0.10 | +2.2 |
| *weekly basis:* Wright for Lance | +0.94 ± 0.08 | +2.54 ± 0.10 | +2.29 ± 0.10 | +2.6 |

Caleb for Brown takes you from 5.3% to 9.5% title, 83% to 92% playoff, and nearly doubles the bye (9.6% to
17.4%). It clears the format's +5 points a week bar on both bases. Run on a healthy Achane it is still
+3.91 ± 0.14, so it is a good trade on its own, not an injury patch.

Why this shape:

- **It spends a zero.** Caleb is a QB2 in a 1QB league (and Out this week with a hamstring). Allen starts,
  and Jordan Love (269.8 projected, 17.4 a game) stays as the insurance Allen's Questionable tag says to keep.
- **Anchor holds.** Caleb 6,135 against Brown 6,344 on KTC 1QB is 97% of the bigger asset, inside the
  70 to 100% band, 1-for-1, no consolidation premium owed.
- **Captain Insano is the natural seller.** 0-6, and Brown is 26, the last year of the RB hold curve. The
  pitch is a 24-year-old QB for a running back about to start losing value. Their side, modeled: title 3.2%
  to 1.9%, playoff 48.5% to 36.5%. They are the 7th team, so the trade also widens your gap to the cut.
- **Fallback** if they say no: Jordan Love for Monangai is worth about 40% of the Brown deal and only makes
  sense once Caleb is healthy, because it sells the QB2 insurance. Jaylen Wright is the cheap add on the
  weekly basis (Miami's RB2 behind Ollie Gordon, Out this week with a foot injury, about 7.6 a game on his
  lines from week 5); the season basis cannot see his new role.

**Over more than one season** (8 years, 2 seeds x 2,500): the Brown trade is ahead every year through 2029
(+4.3, +2.8, +1.3, +0.5) and behind from 2030 on (-0.8, -1.4, -0.6, -2.5). Discounted championship equity:
+5.1 at delta 0.80, **+1.8 ± 0.7 at 0.88**, -3.0 at 0.92. Break-even discount is about 0.895, inside the
0.80 to 0.95 band, so this is discount-sensitive: if you do not expect to be in this league for the long
haul, it is a clear yes; if you plan to play it indefinitely (0.92), the long tail narrowly favors keeping
Caleb. The late cost is Caleb as Allen's successor (Allen is 34 in 2030), priced on a
frozen roster that never replaces him, which is the simulator's known out-year bias. In a 1QB league a
starting QB is the cheapest thing to find later. P(at least one title in 8 years) rises from 25.0% to 29.5%.

## The League: 10 teams, superflex, median scoring, 0-6

### Where you stand

| Team | Record | Title | Playoff | Bye | Rest-of-season pts/wk |
|---|---|---|---|---|---|
| The San Francisco 49ers | 4-2 | 26.9% | 96.2% | 57.8% | 136.2 |
| NatePackard12 | 5-1 | 22.8% | 94.5% | 52.4% | 130.7 |
| CeeDeez TDs | 5-1 | 17.0% | 90.6% | 40.3% | 126.0 |
| ganderson09 | 3-3 | 13.4% | 83.0% | 23.6% | 126.3 |
| 6am Tarp Pull | 4-2 | 6.2% | 68.4% | 12.3% | 115.7 |
| **World of Tanks (you)** | **0-6** | **4.6%** | **40.4%** | **3.0%** | **119.4** |
| Man, I Love Football | 2-4 | 4.6% | 52.3% | 6.0% | 115.6 |
| Mother Shough'ers | 1-5 | 2.5% | 30.5% | 1.9% | 111.8 |
| My Chubb is Limp | 1-5 | 1.5% | 19.5% | 1.0% | 105.5 |
| JoeysYIDS | 5-1 | 0.7% | 24.5% | 1.6% | 95.2 |

Default basis, Achane out. The weekly basis is harsher on you: 1.6% title, 24.9% playoff, 7th-best lineup.

0-6 is mostly bad luck: 9th in points for (361) with 475 against. On strength you are a middle team, 5th in
lineup on the season basis (128.7 a week against 141 to 150 for the top three) and 7th on the weekly basis.

### The injury, and what the waiver wire gives back

| Change (paired, vs now) | Title | Playoff | Bye |
|---|---|---|---|
| Achane healthy | **+2.71 ± 0.10** | +11.30 ± 0.17 | +1.99 ± 0.08 |
| Best waiver RB (Ty Johnson for Tyrone Tracy) | -0.15 ± 0.05 | -0.57 ± 0.09 | -0.10 ± 0.04 |
| *weekly basis:* Achane healthy | **+1.59 ± 0.08** | +12.60 ± 0.18 | +1.02 ± 0.05 |
| *weekly basis:* best waiver RB (Tyler Goodson for Tracy) | 0.00 ± 0.00 | +0.03 ± 0.01 | 0.00 ± 0.00 |

The injury's real cost here is the playoff race (11 to 13 points of playoff odds), not the title. No free RB
would ever start over Skattebo, Price, RJ Harvey or Gainwell; on the season basis the claim is slightly
negative because Tracy projects better than Ty Johnson for the year. Keep the $151.

### Playoff line and schedule

The line is the 7th-place team, the first one out. Wins include the median game; ties go to points for.

- **Today: 2 wins behind.** You are 0-6 and 10th; 7th place is Man, I Love Football at 2-4 (6th is
  ganderson09 at 3-3). You also trail them by 94 points for, so a tie on wins goes against you unless you
  outscore them by that much from here.
- **At season's end**, the 7th-place team finishes with 12 wins of 28 on the season basis (10th to 90th
  percentile 10 to 13) and 11 on the weekly basis (9 to 13). You project 11 on the season basis and 9 on the
  weekly basis, so your median margin over the first team out is **-1 win** (10th to 90th percentile -8 to
  +5), and -3 on the weekly basis. Healthy Achane would have made it 0 (weekly -2). Adding Derrick Henry also
  gets it to 0.
- P(playoff) by final total: 12 wins 41 to 48%, 13 wins 71 to 75%, 14 wins 92%. You need 13 or 14 of the
  remaining 22 (.59 to .64), which is a top-three team's pace.
- Schedule left is harder than average: 132.2 a week against 129.8 (weekly 165.3 vs 161.2), with five games
  against the top three (CeeDeez weeks 4 and 13, the 49ers weeks 5 and 14, NatePackard12 week 8).

### Phase: retool, and in practice already rebuilt, W = 6

- titleOdds_now 4.6% = **0.46x** (weekly 1.6%, 0.16x).
- titleOdds_reachable with the strongest realistic buy (Derrick Henry, below) 7.0% = **0.70x** (weekly 3.2%,
  0.32x). There is no 2026 purchase that gets this roster to fair share.
- Lineup rank 5th (season) / 7th (weekly). **Value share 12.4%, the highest in the league**, pick share
  22.4% (two 2027 firsts, your own and Mother Shough'ers', plus your 2028 first), top-3 concentration 14.7%,
  core age 24.1 (Bowers 23, Caleb 24, Nabers 23, DeVonta Smith 27, Achane 24). VPP 1,188, highest in the
  league against an average of 959: the value is in inventory, not in this year's lineup.
- Window: retention 1.03, 1.05, 1.02, 0.96, 0.90, 0.83, so **W = 6**.
- Retool gate 4 of 4 (Bowers #7 and Caleb #8 overall on KTC superflex, a Bowers / Nabers / Caleb peak overlap
  from 2028, Achane, Dart and the taxi squad sitting at zero starting points, pick share inside 15 to 35%),
  and the young-core shortcut fires on its own (three of the top four starters under their growTo age, pick
  share over 22%).
- **Forward, standing pat**: 2nd-best projected lineup in 2027 and 1st from 2028, with title odds of 17.6%
  (2027), 21.1% (2028) and 22.5% (2029). That is 1.8x to 2.3x fair share. Per the simulator's own caveat,
  read the trend, not a single out-year. PV 5th to 7th with FV 1st to 2nd and core age 24 is the "already
  rebuilt, needs conversion, not a teardown" shape, and the conversion happens by itself next year: two
  firsts become rookies, Achane and Dart come back, the 22 to 24 year olds grow.

### What to do this week: hold

The two committed paths, measured over 8 seasons:

| Path | 2026 title (paired) | 8-year DCE vs hold, delta 0.88 | Same at SCALE=1.3 |
|---|---|---|---|
| Buy Derrick Henry from Man, I Love Football for your 2028 1st | +2.43 ± 0.11 (weekly +1.59 ± 0.08) | **+3.9 ± 0.7** | **-2.5 ± 0.7** |
| Sell Kyler Murray to JoeysYIDS for their 2027 2nd | -1.48 ± 0.10 (weekly +0.01 ± 0.05) | **-3.5 ± 0.9** | **+5.3 ± 0.9** |

Both verdicts flip sign between pick SCALE 1.0 and 1.3. That is the CLAUDE.md trap exactly: the 2026 half of
each is arithmetic, the multi-year half is a calibration bet on what a converted pick is worth, and the bet
is not settled. Henry also adds only +4.5 a week on the season basis, under the format's +5 bar (+6.8 on the
weekly basis). Holding sits between the two paths under both calibrations, so it is the only choice that is
never the worst one.

So: no waiver claim (nothing startable), no buy, no sell of the young core, keep Achane. If Henry can be had
for less than a first, re-run it; the 2026 gain (+2.4) is real, it is the pick price that is uncertain. If a
real first shows up for Murray, re-run that too. Do not send either 2027 first for anything this season;
they are part of the 2027 window. Correction, 2026-09-30: lowest Max PF sets The League's
draft priority, so 0-6 alone does not establish an early own first. Assess both origin teams'
cumulative Max PF and remaining potential scoring. See the draft-order correction above before
using the original multi-year numbers to price a trade.

## Achane's 2027 dynasty outlook

Measured in the repo:

- **Market**: KTC 1QB 6,774 before the injury (commit 42e434f) to 6,073 now, **-10.3%**, #21 to #36
  overall, RB9 to RB12. Superflex 6,397 to 5,617, **-12.2%**, #28 to #42, RB9 to RB11. For scale, a 2027 1QB
  first prices at 7,193 early, 6,200 mid, 5,627 late, so he is now a mid-to-late 2027 first. The IR tag
  appeared between the 9/27 and 9/29 refreshes, so the market has had about two days; injuries reprice in
  days and this one may not be finished.
- **Contract**: 2026 extension, 4 years, $64M through 2030, $17.4M guaranteed. His role in Miami is not in
  question for 2027.
- **Age**: 25 on October 13. On the app's production curve (RB growTo 24, holdTo 26, then -13% a year and
  accelerating) 2027 and 2028 are his last two hold seasons and 2029 is the first decline season. The ACL
  takes most of one of the three prime seasons he had left, and the recovery year is one of the other two.
- **History** (nflverse injury reports): knee listings in 2023 weeks 11 to 13, ankle and a concussion in
  2024, ribs and shoulder in 2025. This is the second knee.
- **What the simulator assumes**: for 2027 it scores him on today's injury-deflated season blend (159) aged
  one year, about 170, roughly 75% of his pre-injury 227. That haircut is an accident of the inputs, not a
  modeled recovery curve, but it sits in a sensible range.

Not measured here: ACL recovery base rates for running backs. The common prior is that a September tear
usually allows a return by the next opener and the first season back runs below the pre-injury level. Treat
that as a prior, not a repo number.

**Verdict: hold in both leagues.** Selling now sells an event-driven dip into a market where the only buyers
are rebuilders, and in neither league is he the right currency. In taco the QB2 buys the same running back
without touching 2027 or 2028. In The League he is part of the 2027 window. The sell window is the 2027
season once he is cleared and producing, and no later than the 2028 offseason, before his age-27 season.

## Reproduce

Scripts are in the session scratchpad, not the repo: `achane/sim.js` (harness), `job.js` (one scenario, one
seed, one basis), `agg.js` (paired deltas and playoff line), `metrics.js` (phase inputs, uses `trade-sim.js`
for picks), `equity.js` and `eqagg.js` (8-season equity). The repo route to the same numbers is
`node site/js/trade-sim.js` with the scenarios above in `SCENARIOS`, two seeds, and Achane moved into the
IR slot of the in-memory league first, or the week-10 phantom return comes back.
