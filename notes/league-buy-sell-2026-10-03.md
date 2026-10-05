# The League: buy or sell, 2026-10-03

**Answer: buy nothing, hold the core, and make one sale only if the first coming back projects top five
under Max PF.** The one sale worth pitching is **Jaylen Waddle to JoeysYIDS for their own 2027 1st**
(fallback: DeVonta Smith for the same pick; Man, I Love Football's own 1st is the second buyer). Do not
sell Waddle or Smith to a contender for a late 1st or a 2nd: that loses on every seed and calibration.

**One rule decides the headline, and only you know it:** does The League order all ten teams by Max PF,
or do non-playoff teams pick first? JoeysYIDS is 5-1. Under an all-ten Max PF order their pick projects
about 4th lowest whatever their record, and the deal is a clear win. If playoff teams pick last and they
make it, the same pick lands 7th to 10th and the deal becomes the losing "Waddle for a late 1st" row.

| Move (vs stand pat, paired, seeds 20260807 / 777001) | 2026 title | 8-yr DCE at 0.88, SCALE 1.0 | Same, SCALE 1.3 |
|---|---|---|---|
| Waddle to JoeysYIDS for their 2027 1st (proxy slots it 3rd) | -1.8 / -2.0 | +20.0 / +17.7 | +29.9 / +25.9 |
| Waddle for a mid 1st (Man, I Love Football's own) | -2.1 / -2.2 | +3.0 / -0.1 | +11.4 / +7.3 |
| Waddle for a late 1st (the 49ers' 1st, via CeeDeez) | -2.6 / -2.1 | -10.0 / -10.5 | +0.3 / -3.1 |
| Smith to JoeysYIDS for their 2027 1st | -1.9 / -2.4 | +15.8 / +16.4 | +28.3 / +26.8 |
| Smith to CeeDeez for the 49ers' 2027 1st | -2.0 / -2.4 | -12.5 / -11.4 | -0.7 / -2.6 |
| Waddle to 6am Tarp Pull for their 2027 2nd | -2.3 / -1.9 | -7.7 / -6.9 | -0.8 / -1.1 |
| Murray to JoeysYIDS for their 2027 2nd | -1.4 / -1.7 | -5.7 / -4.0 | +1.4 / -1.1 |

Stand pat: 4.7% title this year, then 18.6%, 21.0%, 22.8% in 2027 to 2029. The first three rows run with
every class drafted through 2033 (`HORIZON=7`) and the pick priced at its post-trade slot; the others use
the default two-class horizon, which moved the Waddle-to-JoeysYIDS row by under 1 point.

**Read the first three rows as one curve, not three trades.** The sim's draft proxy ranks teams by starter
strength and puts JoeysYIDS 1st, which flatters their pick. Under Max PF they project about 4th and Man,
I Love Football about 5th, so the honest estimate for Waddle-for-JoeysYIDS-1st sits between rows 1 and 2:
modestly positive at SCALE 1.0, clearly positive at 1.3. The late-pick row is the downside.

## What the simulator does not credit: your own first

Lowest Max PF picks first. Accrued Max PF plus each team's optimal lineup from Sleeper's weekly lines,
weeks 4 to 14:

| Team | Now | Projected end, stand pat | After Waddle to JoeysYIDS |
|---|---|---|---|
| My Chubb is Limp (1-5) | 419 | 1,867 | 1,867 |
| JoeysYIDS (5-1) | 511 | 2,026 | 2,089 |
| Mother Shough'ers (1-5, your pick) | 512 | 2,070 | 2,070 |
| World of Tanks (you, 0-6) | 512 | 2,099 | 2,056 |
| Man, I Love Football (2-4) | 528 | 2,190 | 2,190 |

Waddle leaves your optimal lineup (-43) and joins theirs (+63). Only Chubb at the bottom is safe to call; the
2nd to 4th gaps are 14 to 63 points over 11 weeks, inside weekly noise, and projected lineups run below
realized Max PF. Read it as: your own 1st and Mother Shough'ers' both project in the 2 to 5 range, and
selling a starter nudges your own earlier. The sim prices your own 1st as a mid pick regardless.

## The ask, by the headliner rule

KTC superflex: Waddle 4,670, Smith 5,683; 2027 1st early 7,046, mid 5,912, late 4,997. Waddle is 79% of
a mid 1st and 93% of a late one, inside the 70 to 100% band. A buyer who sees his pick as late will say
yes; one who sees it as early (7,046, Waddle at 66%) will not, and Smith (96% of a mid) is the honest
counter, not a pile. Smith is Questionable (hamstring) this week, so pitch him once he plays.
JoeysYIDS needs it most: weakest roster in the league (72,063 KTC) at 5-1, WR2 Pittman 9.9 a week,
FLEX starters 7.6 to 9.7. Man, I Love Football (2-4, own 1st) starts receivers at 8.1 to 11.9.

## Everything else

- **Hold Murray.** QB3 in superflex with Dart out for the season (meniscus) and Caleb Doubtful
  (hamstring). His sale is negative at SCALE 1.0. Mariota (32, KTC 2,241) is a free throw-in.
- **Buy nothing.** 4.7% title at 0-6 is not reachable at a sane price, and every 2026 buy raises your Max
  PF and pushes your own first back. Henry for your 2028 1st already flipped sign under SCALE 1.3.
- **Hold the core:** Bowers, Caleb, Nabers, Dart, Bryce Young, Achane, Skattebo, Price, both 2027 firsts.

## Limits

- Max PF pool, cutoff and ties are unconfirmed; see the rule question at the top.
- Multi-year numbers use the sim's strength-rank draft proxy, and `projectLeagueForward` applies a second
  slot adjustment from simulated finish, so pick slot effects are counted twice. 2026 title deltas do
  not depend on either.
- Independent review (one adversarial pass) rated the original headline PLAUSIBLE, not confirmed, for the
  slot reason above. This version incorporates its findings.
- Data: Sleeper rosters and Max PF pulled 2026-10-03 09:20; KTC and weekly lines from the 2026-10-02 build.

## Reproduce

Job scratch scripts, not in the repo: `runsc.js`, `runpost.js`, `runh7.js` (scenarios through
`site/js/trade-sim.js`, `LEAGUE='The League'`, 8 seasons, 2,500 sims, two seeds, SCALE 1.0 and 1.3),
`maxpf.js` (Max PF projection), `agg.js` (paired deltas, discount 0.80 / 0.88 / 0.92).
