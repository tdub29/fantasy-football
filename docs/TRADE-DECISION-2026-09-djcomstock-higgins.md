# djcomstock: Tee Higgins, and which version to send

Decision doc for tdub1329 ("Boutte Hunter"), Password is taco (10-team, 1QB, 4 FLEX, PPR).
Written 2026-09-16 off a same-day Sleeper pull and a same-day KeepTradeCut scrape.

**The two things he asked.** Version B, in text: Bryce Lance + his own 2029 1st for Tee Higgins,
yes or no. Version A, composed on the Sleeper screen: Bryce Lance + the 2027 3rd and the 2028
2nd that both came from djcomstock, for Tee Higgins.

**Verdict: yes to B, and B beats A. Change the offer before sending it, and keep A in your
pocket as the fallback.** B leads in **seven of seven** simulator runs, including a 16,000-sim
pair run specifically to settle it, and it keeps a pick. A is still a clear yes if B gets
refused. The trade itself is worth about **+2.8 points of 2026 title odds, 7.8% to 10.6%**.

> **This doc reversed itself mid-session and the reversal is the point.** The KTC ledger says
> the cheapest packages are the ones paid out of the quarterback room. The simulator ranks those
> LAST, in every seed and under both required sensitivities.
> [Why the ledger and the simulator disagree](#why-the-ledger-and-the-simulator-disagree) is the
> load-bearing section; the ledger is left in so the disagreement is legible. The two lenses
> agree about A against B, which is the part the recommendation rests on.

---

## The one table

`titleEquity` from `site/js/app.js`, 7 seasons, 4,000 sims, both sides of every trade modelled,
three paired seeds reported in order 20260912 / 777001 / 424242. Picks are slotted *after* the
deal, because a pick's price is endogenous to the trade that moves it.

| Package | 2026 title | 7-yr equity delta | Mean | KTC out | vs 5,779 |
|---|---|---|---:|---:|---:|
| Stand pat | 7.65 / 7.20 / 8.70% | 0 | 0 | | |
| **B. Lance + own 2029 1st** | 11.20 / 10.72 / 9.83% | **+10.34 / +9.67 / +7.53** | **+9.18** | 6,792 | +18% |
| A. Lance + 2027 3rd + 2028 2nd | 11.20 / 10.72 / 9.83% | +8.57 / +8.94 / +6.99 | +8.17 | 9,482 | +64% |
| H. Jordan Love + own 2029 2nd | 10.42 / 9.83 / 10.35% | +6.67 / +7.94 / +5.50 | +6.70 | 7,519 | +30% |
| D. Jordan Love + Lance | 10.08 / 9.93 / 9.15% | +7.66 / +6.47 / +5.13 | +6.42 | 6,875 | +19% |
| E. Quentin Johnston + Lance | 10.42 / 9.45 / 8.67% | +7.23 / +6.48 / +1.85 | +5.19 | 6,844 | +18% |
| F. Josh Downs + Lance | 9.45 / 9.53 / 9.47% | +3.09 / +5.83 / +3.91 | +4.28 | 6,821 | +18% |
| G. Christian Watson straight up | 7.80 / 8.22 / 8.85% | +2.90 / +2.63 / +1.98 | +2.50 | 5,033 | -13% |
| C+. Caleb Williams, waiver QB claimed | 9.28 / 9.40 / 9.85% | +1.63 / +2.56 / +1.24 | +1.81 | 5,998 | +4% |
| C. Caleb Williams straight up | 10.00 / 9.03 / 10.55% | +1.49 / +0.80 / +0.77 | +1.02 | 5,998 | +4% |

**B is first in all three seeds and B is first under both sensitivities.** At `SCALE=1.3` the
order is B +5.79, A +4.99, E +4.92, H +4.39, D +4.17. At a 2029 pick decay of 0.80 instead of
0.88 it is B +9.98, A +8.19, D +6.81, E +6.64, H +5.97. Five runs, one winner, no sign flip.

**Read the 2026 column at 4,000 sims as noise.** The standard error of a two-path difference is
about 0.67pp there, and A and B post an identical 11.20% against a 10.00% "Higgins for free"
control that should bound them from above. The equity column has the same problem in the other
direction: at seed 20260912, B reads +10.34 against the free control at +9.43, and you cannot
beat free. **So the noise on these figures is about a point, which is the size of the B over A
gap itself.** That gap was not safe to quote from the 4,000-sim table.

**Re-run to settle it: 16,000 sims, both paired seeds, A and B only.**

| | Stand pat | A | B | B minus A |
|---|---:|---:|---:|---:|
| seed 20260912 | 7.83% title26, 37.15 equity | +7.04 | **+7.90** | +0.86 |
| seed 777001 | 7.66% title26, 36.85 equity | +7.79 | **+8.17** | +0.38 |

At 16,000 the standard error of the difference is about 0.34pp, so 0.86 clears it comfortably and
0.38 is about one standard error. **B leads in seven of seven runs now**, which is what carries
the call, not any single margin. 2026 title odds land at **7.83% to 10.56% and 7.66% to 10.51%**,
identical for A and B as they must be, and that is the tightest read of what the trade is worth
this season: about **+2.8 points, a 1.35x lift**.

A caveat that changes no number: these two runs were launched before the taxi-squad fix below
landed in `startingKtc`. Re-derived after the fix, the projected slot order and every pick price
in this doc are unchanged, so the runs stand.

---

## Why every version buys the same thing this season

Higgins enters the fourth FLEX and pushes Quentin Johnston out. That is true whatever leaves,
because nothing else he would send is in his lineup.

| Package | Who leaves | 2026 starting-lineup gain |
|---|---|---:|
| A, B | Bryce Lance, below replacement | **+57.5** |
| C | Caleb Williams, QB2, never starts | **+57.5** |
| D, H | Jordan Love, QB3, never starts | **+57.5** |
| E | Quentin Johnston, the man Higgins displaces | **+57.5** |
| F | Josh Downs, a starter | +43.8 |
| G | Christian Watson, a starter | +23.4 |

`site/js/_lineup-cost.js`, the site's own `optimalOffense` / `fillLineup` over the 2026-09-16
blend projections. Base lineup 2,237.2 season points, so +57.5 is +2.6%, about +4.1 points a
week across a 14-week regular season. So the 2026 half of this question is settled and the
entire decision is about what the package costs in the other six years.

---

## The KTC ledger, which says the opposite

KTC 1QB, scraped 2026-09-16, picks slotted through the site's own interpolation, post-trade.

| Package | Out | KTC out | In | Over |
|---|---|---:|---|---:|
| A | Lance 2,462 + 2027 3rd 3,080 + 2028 2nd 3,940 | **9,482** | Higgins 5,779 | **+64%** |
| B | Lance 2,462 + 2029 1st 4,330 | **6,792** | Higgins 5,779 | +18% |
| C | Caleb Williams | **5,998** | Higgins 5,779 | +4% |
| D | Jordan Love 4,413 + Lance 2,462 | **6,875** | Higgins 5,779 | +19% |
| E | Quentin Johnston 4,382 + Lance 2,462 | **6,844** | Higgins 5,779 | +18% |

And the anchor band, the headliner rule from [FRAMEWORKS.md](FRAMEWORKS.md): the biggest single
asset leaving must land in 70 to 100% of the biggest single asset arriving.

| Package | Biggest asset out | vs Higgins 5,779 | Site Trade Lab |
|---|---:|---:|---|
| **A** | 2028 2nd, 3,940 | **68%, below the floor** | 63% fairness, WIN FOR DJCOMSTOCK |
| B | 2029 1st, 4,330 (4,420 before the deal lands) | 75% | 85% fairness, CLOSE |
| C | Caleb Williams, 5,998 | he is the headliner | 96% fairness, FAIR |
| D | Jordan Love, 4,413 | 76% | 85% fairness, CLOSE |
| E | Quentin Johnston, 4,382 | 76% | 85% fairness, CLOSE |

On this table alone the answer is: decline A outright, and pay with Caleb Williams. The
simulator ranks Caleb **last of nine**.

---

## Why the ledger and the simulator disagree

They disagree about the quarterbacks. **On A against B they agree**, and the reason is worth
getting right, because the obvious version of it is wrong.

**His own first converts to less than a waiver body; djcomstock's picks convert to more.** The
chain `projectLeagueForward` actually runs is `pickRookiePoints(pickValueBySlot(value,
originRank))`, and that middle step prices the pick off **its origin team's** projected finish,
not the holder's. Measured with `site/js/_pick-to-points.js`, against a replacement-level FLEX of
**104.9** (Mike Gesicki, unrostered):

| Pick | KTC face | After the origin-slot step | Converts to |
|---|---:|---:|---:|
| His own 2029 1st | 4,410 | 4,013 | **100.9 points**, under replacement |
| djcomstock's 2027 3rd | 3,080 | 3,912 | 98.0 points, under replacement |
| djcomstock's 2028 2nd | 3,940 | **5,004** | **128.4 points**, over replacement |

He is the 4th strongest roster of ten, so his own first is marked **down** 9%. djcomstock is the
weakest, so the two picks that came from djcomstock are marked **up** 27%, and his 2028 second
lands comfortably above replacement. **It is a real asset, not a throw-in.** That is the whole of
why A costs about a point of equity more than B, and it is the same fact the KTC ledger is
reporting when it calls A a 64% overpay. The two lenses agree here.

A second correction while it is being got right: the aging term is `productionRetention('WR',
22, held)` and for a 22-year-old receiver it is **greater than 1**. A held pick converts higher,
not lower. His own 2029 first reaches 123.6 by the time it is three years held. Nothing in the
verdict turns on it, but "the picks decay while you hold them" is the opposite of what the model
does.

**The backup quarterbacks are not surplus over seven years, they are the succession.** Josh
Allen is 30 and the model ages him to 36 by 2032. The best unrostered quarterback in this league
is **Jacoby Brissett at 148.8** (`_replacement-qb.js`, 296 players rostered across ten teams),
and the QB slot is his highest-scoring lineup slot at 343.9. `dynasty-trade-construction` calls
QB3 "a strict zero," and that is correct *about this season's lineup* and wrong about a
seven-year horizon in a one-QB league with no waiver quarterback worth starting. Caleb Williams
at 24 is what the lineup looks like in 2030. That is why C scores +1.02 mean against B's +9.18,
and why at `SCALE=1.3` C goes **negative at -0.23**, worse than standing pat.

This is not a new finding, it is the 2026-09-12 finding holding up. That doc tested
**Caleb + Juwan Johnson, keeps Love** (1.84 / 1.68%) and **Caleb + the acquired 2027 2nd**
(1.64 / 2.16%) against the proposed trade at 2.40 / 2.32%, so it priced single-quarterback
counters, not only the both-backups version, and both lost. Its conclusion was "selling him to
save a pick is selling the wrong asset." Replacement QB has since fallen from **158.8 to 148.8**,
which makes that objection stronger, not weaker.

**Where the simulator is blind, and it matters.** It can only turn a pick into a rookie. It
cannot turn a pick into a trade. Those two picks in version A are 7,020 KTC, more than Higgins
costs, and on 2026-09-12 he converted five picks into five starting receivers, so flipping picks
for starters is demonstrably something he does. If he plans to spend the 2027 3rd and the 2028
2nd on another player rather than on a rookie, the ledger is the right lens and version A is the
64% overpay it looks like. **That is the strongest argument for sending B rather than A, and it
points the same way the simulator does.**

---

## What to actually do

1. **Rebuild the offer as B before you send it.** Take the 2027 3rd and the 2028 2nd off your
   side and put your own 2029 1st on instead. Same Higgins, one pick cheaper, and it wins every
   run.
2. **If he refuses B, send A.** A is still +8.17 mean equity against standing pat and it is the
   version he is likelier to take, because it hands him 7,020 KTC of picks against 4,330 and two
   of them are his own. Refusing to upgrade a 2-0 roster over a 0.54 to 1.79 equity difference
   would be the wrong kind of discipline.
3. **Do not pay with Caleb Williams or Jordan Love.** They read cheaper on KTC and score worst
   in the model, for the reason above.
4. **Do not pay with Quentin Johnston** unless both pick versions fail. It costs 12.7 points of
   bench robustness (below) and scores behind both.

---

## The site cannot check this one, and that is a tool limit rather than a verdict

The Trade Lab builds its pick tray from `rosterOwnedPicks(rosterId, league)` at the default
horizon of two classes, so it offers 2027 and 2028 and stops. **His 2029 first is not in the
picker and version B cannot be assembled in the browser at all.** Worth saying out loud, because
a recommendation he cannot reproduce in his own tool reads as a mistake in the tool.

It is not a pricing gap. The five-year FV curve does reach 2029, through callers that pass
`Math.max(2, yearsOut + 1)`, and lands on the legacy `strategy.js::pick_values_1qb`
`future_1.mid` of 4,500 for a slot-8 owner. That is within 4% of the 4,330 this doc uses, so the
two paths agree. What is missing is only the ability to *select* the pick in the Trade Lab UI.
`node site/js/trade-sim-higgins-counters.js` is the path that priced it, and `pv()` in
`trade-sim.js` now synthesizes any class past KTC's last published one.

---

## The note to send with it, if he wants one

Not sent, and Sleeper does not need one. If he wants to nudge it, in his own voice:

> hey man would you do tee higgins for bryce lance and my 2029 1st? i know you want picks back
> and i dont have a 27 or 28 first anymore, but the 29 is a real one. if you'd rather have your
> own 27 3rd and 28 2nd back instead i can do that version too, just let me know

That second sentence is the fallback offer made in advance, which costs nothing because both
versions are ones he is willing to do.

---

## The depth check

A season total hides what thinning the bench costs, because that cost only appears in the weeks
a starter is out. `site/js/_depth-cost.js` knocks out each of the ten starters in turn and
averages what the best legal lineup falls to:

| Package | Full lineup | Average after losing one starter | Depth cost |
|---|---:|---:|---:|
| Today | 2,237.2 | 2,158.8 | |
| A / B, Lance leaves | 2,294.7 | 2,223.2 | baseline |
| D, Love + Lance leave | 2,294.7 | 2,223.2 | 0.0 |
| C, Caleb leaves | 2,294.7 | 2,220.7 | -2.5 |
| E, Johnston + Lance leave | 2,294.7 | 2,210.5 | -12.7 |

A and B cost nothing here either, because Bryce Lance projects 38.7 against a 104.9
replacement-level FLEX and is below replacement. That is a third independent reason they win.

---

## What the roster shape says

Measured 2026-09-16 with `site/js/_shape-check.js`:

- **Top-3 share 17.9%.** Josh Allen 7,477, Trey McBride 7,447, Jeremiyah Love 7,429. Under 20%
  is the band the doctrine calls "no headliner, consolidate upward." Higgins at 5,779 would be
  his **sixth** most valuable asset, so this trade does not move it at all.
- **Player-value share 11.57%, second of ten**, against a 10.00% baseline and a 12.40% contender
  lock. Above average, not locked.
- **14 startable bodies, and the headline number is the wrong one.** Three of the fourteen are
  quarterbacks in a **1QB** league. Counted by slot instead of by head it is **11 non-QB bodies
  for 9 non-QB slots**, and the two spare arms cover none of them. That is thinner than "14
  against a 13 to 14 target" reads, and it is the number that should decide any package which
  ships a receiver. It is still adequate for A and B, which ship a below-replacement body.
- **The WR room is 13 fieldable bodies and 48,511 KTC, 39% of his player value**, six of them
  aged 25 to 28. Higgins is another 27. Ricky Pearsall is a 14th, on IR, and is excluded because
  a man on IR is not part of an age profile you can field.

None of that argues against the trade. It says this is a FLEX upgrade of about four points a
week, correctly priced near 5,800 KTC, and that the right currency is the asset class his lineup
cannot use.

> The first version of this section read "14 startable bodies, no depth problem to solve" and
> "the WR room is 14 bodies, seven aged 25 to 28." Both came from `_shape-check.js` counting
> every quarterback in a one-quarterback league and counting a man on IR. Both are fixed in the
> script, which now prints the slot-aware split and names the excluded IR body.

---

## The two things that could still make this wrong

An adversarial pass over this doc found both. Neither flips the recommendation, and saying so
without saying what they are would be the dishonest version.

**1. B clears the anchor band on an assumption, not on a measurement.** The 70% floor is
0.70 x 5,779 = **4,045**. The 2029 first is `pv('2028', 1, ME, dealB)` = 4,920 times the decay,
so the floor is crossed at **DECAY = 0.8222**. Every measured 2027-to-2028 first-round step in
the live KTC scrape sits at or below that on the early anchor:

| Decay | 2029 1st | vs Higgins | Anchor |
|---:|---:|---:|---|
| 0.88, used here | 4,330 | 74.9% | inside |
| 0.8578, late-1st step | 4,220 | 73.0% | inside |
| 0.8394, round-1 mean | 4,131 | 71.5% | inside |
| **0.8222** | **4,045** | **70.0%** | **the floor** |
| 0.8204, early-1st step | 4,036 | 69.8% | **below, B declines like A** |

The defence is real and it is why 0.88 was chosen: the 2027 class carries a documented Jeremiah
Smith premium (`strategy.js::pick_class_premium`, +38.5 / +17.5 / +11%), so a 2027-to-2028 step
is premium unwind *plus* time decay and overstates a pure one-year discount. There is no clean
one-year step measurable in this data at all, because 2026-to-2027 runs the other way at 1.179.
**So 0.88 is a calibration bet and the anchor half of the verdict rests on it.** What does not
rest on it is the title-odds half: at DECAY 0.80, below the entire measured band, B still reads
+9.98 equity and still finishes first.

**2. `dynasty-league-format-leverage` hard-rejects this trade and was not consulted.** Its rule:
*"Any win-now trade that raises projected weekly starter points by less than 5 is rejected on
structural grounds ... which never justifies a first in a 10-team league where firsts average
roughly the 5.5th player off the board."* This trade is **+4.1 a week**. Under the floor.

Two reasons the rule does not decide it here, both of which should be visible rather than
assumed away:

- **Its convexity table is anchored on a generic projected-8th roster**, where +5 buys 2.5% to
  4.4% title odds, a 1.25x multiplier it calls insufficient. This roster is 2-0 with 73% playoff
  odds, and the measured lift is **7.65% to 10.6%, about 1.37x**, above the multiplier the rule
  is rejecting.
- **The clause is specifically about justifying a first, and this is not that first.** It assumes
  a first is "roughly the 5.5th player off the board." A late 2029 first from a contender, three
  years out with no class visible, converts to **100.9 rookie points against a 104.9 replacement
  FLEX** on the repo's own conversion. The rule's premise about what is being spent does not hold.

If Trevor wants the conservative read, the rule says decline and keep the pick. The model says
take it. The gap between them is entirely about whether his 2029 first is a real first, and on
every measurement in this repo it is not.

---

## The cost to say out loud

After 2026-09-12 he holds **no first-round pick before 2029**. Send B and he holds none before
**2030**. The model already charges him for that, which is why B lands at +9.18 rather than the
+20 the 2026 column alone would suggest, and B still wins. But the shape of the bet is now
explicit: 2026 through 2029 with a receiving corps aged 25 to 33 and a 30-year-old quarterback,
and the first reload pick arriving in 2030.

Two backup quarterbacks worth 10,411 KTC stay on the bench under this recommendation, and they
are the reason that bet is survivable. Selling one to save a pick reverses the trade he is
actually making.
