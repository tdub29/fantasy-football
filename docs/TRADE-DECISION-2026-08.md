# Deal A: do it or don't

> **Status, 2026-09-12: NOT EXECUTED.** Breece's Pieces still rosters Collins, Waddle
> and Downs, and both 2027 firsts are still on roster 10. Re-run on 2026-09-12 data the
> deal is worth +17.4 starter ppg, 8th to 5th, and clears the playoff line. See
> [TRADE-DECISION-2026-09-joeysyids.md](TRADE-DECISION-2026-09-joeysyids.md), which also
> corrects the free-agent QB figure below: the best unrostered arm is now 158.8, not 196.

Decision doc for tdub1329, Password is taco, 2026 season. Generated 2026-08-12.

**The trade:** your two 2027 firsts to Breece's Pieces for Nico Collins, Jaylen Waddle
and Josh Downs.

**Verdict: do it.** Every number below is measured, both sides of the trade modeled,
6000 simulated seasons per cell.

---

## The one table

| | Don't trade | Do Deal A | Change |
|---|---|---|---|
| Starter points per game | 107.6 | **126.6** | +19.0 |
| Rank in points | 8th of 10 | **5th** | +3 |
| Expected wins (14 games) | 5.0 | **7.2** | +2.2 |
| Make playoffs | 28% | **68%** | +40pp |
| First-round bye | 2% | **12%** | +10pp |
| Reach the final | 2.9% | **14.4%** | 5x |
| **Win the title** | **0.9%** | **6.1%** | **6.8x** |
| Win it *given* you make the playoffs | 3.2% | **9.0%** | 2.8x |

---

## The four numbers that should convince you

### 1. Expected wins: 5.0 → 7.2

7-7 makes the playoffs 87% of the time in this league. 5-9 makes it 4%. You are
currently projected to miss, and the trade projects you in.

### 2. Make-playoffs: 28% → 68%

6 of 10 qualify. The 6/7 boundary is worth 12.5 structural points of title equity and
it is one of only two cliffs in the entire format. You are on the wrong side of it and
this moves you to the right side.

### 3. P(title given you make the playoffs): 3.2% → 9.0%

**This is the number nobody quotes and it is the most important one here.** Making
the playoffs badly is nearly worthless. Three single-week rounds against better teams
is a 3% proposition. The trade nearly triples your odds *conditional on getting in*,
because it raises the lineup you bring, not just your record.

For reference, an equal-strength non-bye seed converts at 12.5%. You go from a quarter
of that to three-quarters of it.

### 4. Byes are weeks 5-14. Playoffs are 15/16/17.

Zero byes land in a playoff week, so your playoff lineup is your full best ten. Bye
weeks tax your seeding, never your title run. That means points-per-game understates
playoff strength for a team with awkward byes, and the 126.6 figure is what you
actually field in weeks 15-17.

---

## What the trade does NOT buy

Be clear-eyed about this or the first bad week will feel like the trade failed.

- **You do not become a favorite.** 6.1% against Karl Havoc 28.9%, Mahomies 20.9%,
  Scrote Squad 23.2%. You become the 5th-best team with a real ticket.
- **You do not get a bye.** 12%, up from 2%. The bye needs roughly 10 wins and about
  +25 ppg over league average, which is not purchasable from here.
- **You are still 5.1 ppg behind Wood Grain Grippers** and 12.7 behind Scrote Squad.
  The top three are a separate tier at 139-147 ppg.

## Deal B is optional, and roughly neutral

Adding DJ Moore and Michael Pittman on top (spending more picks, selling QB2 and QB3):

| | Deal A only | Deal A + Deal B |
|---|---|---|
| Points per game | 126.6 | 130.9 |
| Make playoffs | 68% | 68% |
| Title | 6.1% | 5.9% |

+4.3 ppg and **no title gain.** The 0.2pp difference is inside the noise floor
(standard error ~0.3pp at 6000 sims). This corrects an earlier estimate that had Deal
B as clearly additive; with both sides of every trade modeled and the QB surplus
actually leaving, it washes.

**Do Deal A. Treat Deal B as a separate decision on its own merits, not as a
continuation.**

---

## What would have to be true for this to be wrong

The honest falsification list. If you can rule these out, you have your certainty.

| Risk | Why it matters | How to check |
|---|---|---|
| **The projections are wrong on the three incoming WRs** | The entire +19 ppg rests on Collins 235, Waddle 207, Downs 179 | All three carry both a PrizePicks market line and a Sleeper model line. That is the strongest coverage available in this dataset. |
| **Your own weak slots are underrated** | If Jennings and Travis Hunter are better than projected, the trade adds less because it displaces more | Both are **Sleeper-only, no market line.** This is the softest input in the whole analysis. |
| **The price rises** | Breece's Pieces drops from 4.6% to 0.8% giving these three up | They may reprice once they see it. This is the only item with a clock. |
| **You are leaving 2029+ short** | Five firsts to two | Collins 27, Waddle 27, Downs 24. All three are still starters in 2030. Measured: your lineup value rank holds at #3 in both 2027 and 2029. |
| **Simulator error** | Everything above comes from one model | 12-way sensitivity sweep (projection error x team variance x injury rate) agrees on direction in every cell. Noise floor is ~0.3pp; every delta above is 5-40x that. |

## The verdict does not depend on which projection source you trust

Tested all four policies. PP-only, Sleeper-only, the blend, and "take PrizePicks
wherever it is higher."

| Policy | Today | After Deal A | Title, no trade | Title, Deal A |
|---|---|---|---|---|
| Sleeper only | 110.1 ppg (#9) | 130.9 (#5) | 0.81% | 5.49% |
| Blend (used above) | 107.6 (#8) | 126.6 (#5) | 0.85% | 5.61% |
| PrizePicks only | 105.3 (#8) | 122.4 (#5) | 1.28% | 5.65% |
| Max, PP where higher | 110.4 (#9) | 131.2 (#5) | 0.89% | 5.48% |

**Same rank (#5) and the same ~+4.5pp title gain under every policy.** The trade is
source-invariant, which is the strongest form of confidence available here.

Three things worth knowing:

1. **PrizePicks is the CONSERVATIVE source, not the optimistic one.** PP-only reads
   105.3 ppg against Sleeper's 110.1. The market sets season props below the model,
   which is what you would expect from a book carrying vig.
2. **PP was higher on only 28 of 155 dual-covered players (18%),** and 404 of 560
   players have no PP line at all. So "max" lands within 0.3 ppg of Sleeper-only.
3. **Raising projections does not raise your RANK, because it raises the field too.**
   Under max you gain 2.8 ppg and your current standing gets marginally *worse*
   (#8 to #9). This is a relative game. Cherry-picking the higher source is not an
   edge; it is a rescaling.

## Known limits of this analysis

State these rather than pretend they are handled.

1. **Only 156 of 560 projected players carry a Vegas market line.** For everyone else
   the projection is Sleeper alone. Two of your ten current starters are in that group.
2. **No player-evaluation layer.** The model knows age, market value and projected
   points. It does not know target share, snap share, depth chart, scheme or draft
   capital. It can price these three WRs; it cannot tell you Waddle's role in Denver.
3. **Out-year numbers are directional only.** Past three seasons the model does not
   carry roster evolution forward, and the draft-pick feedback loop oscillates. Trust
   2026-2028; read 2029+ as a trend, never as a forecast.
4. **Real playoff schedule is not modeled.** Weekly opponents are randomized. Over 14
   weeks this converges for seeding purposes, but it means no strength-of-schedule read.

---

## Decision rule

**Do Deal A now.** It is worth 6.8x on your title odds, 2.8x on your conditional
odds once you are in, and it costs you nothing in 2029 because the players are 24-27.

Then, separately and with no urgency:

1. Sell Jordan Love and Caleb Williams for one startable WR. Zero lineup cost, real
   trade value, and the best free-agent QB in the league projects 196 points if Allen
   goes down.
2. Hold Mike Evans. Selling him costs 2.8pp, the largest self-inflicted loss on the
   roster.
3. Hold Achane through 2026. Sell at the 2027 deadline when his value peaks at 25.
4. Ricky Pearsall is on IR with a PCL knee. He is not in any of these numbers.

**Reproduce any figure here:** `node site/js/dynasty-claims.test.js` re-derives the
measured inputs from the data files. Re-run
`python site/data/fetch_sleeper.py && python site/data/build_site_data.py` first if
more than a few days have passed, because injury status goes stale fast.
