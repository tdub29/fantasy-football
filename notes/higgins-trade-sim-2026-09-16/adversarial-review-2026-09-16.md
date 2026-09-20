# Adversarial review: `docs/TRADE-DECISION-2026-09-djcomstock-higgins.md`

Read-only. Every number below was re-derived from the repo on 2026-09-16, either by running the
cited script or by calling the site's own functions through `site/js/trade-sim.js` exports.

---

## (a) "Identical +57.5 for every package" hides a depth cost

**REFUTED.**

The arithmetic is right and the claim built on it is wrong. `optimalOffense` (`site/js/app.js:9192-9207`)
is a one-shot season-total fill. It has no week dimension, no byes, no injury process, so it cannot
price depth by construction. Re-ran `node site/js/_lineup-cost.js`: base 2,237.2, every package 2,294.7,
so +57.5 is reproducible. That number is a healthy-all-season, full-strength number.

Three independent checks say the packages are not identical.

**1. The repo's own depth script, which the md never cites.** `site/js/_depth-cost.js` exists
(created 19:22 the same session) and the sibling HTML brief prints its output. Knock out each of
the ten starters in turn and average the best legal lineup:

| Package | Depth cost |
|---|---:|
| A / B (Lance leaves) | **0.0** |
| D (Jordan Love + Lance leave) | **0.0** |
| C (Caleb leaves) | **-2.5** |
| E (Johnston + Lance leave) | **-12.7** |

E, the package the md says to lead with, is the only one with a real depth bill. The mechanism is
first-man-off-the-bench: I dumped the post-trade benches directly.

```
base bench:  QB Caleb 281.8 | QB J.Love 257.5 | WR Q.Johnston 160.7 | TE Okonkwo 139.6 | TE J.Johnson 138.2 | WR Boutte 125.2
after A/B:   QB Caleb 281.8 | QB J.Love 257.5 | WR Q.Johnston 160.7 | TE Okonkwo 139.6 | ...
after E:     QB Caleb 281.8 | QB J.Love 257.5 | TE Okonkwo   139.6 | TE J.Johnson 138.2 | WR Boutte 125.2 | ...
```

**2. The bye-and-injury-aware simulator disagrees.** `rollSeason` models byes (`app.js:8805`
`byeWeeks: [5,14]`, `app.js:8909`) and an injury process. I ran `titleEquity` at YEARS=1,
SIMS=9,000, over **8 paired seeds** (20260912, 777001, 424242, 131313, 909090, 616161, 242424,
505050), both sides of every trade modelled:

```
paired delta in 2026 title odds vs A/B (pp)
  D  Jordan Love + Lance   -0.43   7 of 8 seeds negative
  C  Caleb out             -0.81   7 of 8 seeds negative
  E  Q.Johnston + Lance    -0.96   8 of 8 seeds negative
delta vs stand pat:  A/B +2.84,  D +2.30,  C +1.91,  E +1.66
```

E is 8 for 8 negative, mean -0.96pp, against a total trade gain of +2.84pp. That is about a third
of the whole purchase, lost to the axis the season-total number cannot see. The ordering
A/B > D > C > E maps exactly onto how much startable depth each package ships: QB3 (zero cover)
< QB2 (one slot) < Johnston (cover for 9 non-QB slots).

**3. The "no depth problem" claim is a miscount.** `_shape-check.js:31` counts any non-taxi,
non-IR body over 136 season points. Three of the 14 are quarterbacks in a **1QB** league. Real
coverage is 11 non-QB bodies for 9 non-QB slots. Counter E takes that to 10 for 9. The doc's own
target ("10 starters plus 3") is 13, not 14.

The prompt's specific worry checks out in today's pull: Ricky Pearsall is on IR right now, and
Nico Collins, Chig Okonkwo, Juwan Johnson and Cooper Kupp are all `Questionable` (which
`isSidelined` starts). Mike Evans is 33 and is a starter at 207.1.

---

## (b) Is the 2029-first price of 4,330 defensible

**PARTIAL. The anchor verdict flips inside the band the code itself cites.**

`DECAY = 0.88` (`trade-sim-higgins-counters.js:14`) is above **every** measured 2027-to-2028
first-round step in the live KTC scrape:

```
2027 -> 2028, round 1:   early 0.8204   mid 0.8400   late 0.8578   (mean 0.8394)
2027 -> 2028, round 2:   0.8559 / 0.8906 / 0.8770
2027 -> 2028, round 3:   0.8854 / 0.8972 / 0.8776
```

`pv('2028',1,ME, dealB)` = 4,920 post-trade, so the 2029 first is 4,920 x DECAY. The anchor floor
is 0.70 x 5,779 = 4,045. Solving: **the floor is crossed at DECAY = 0.8222.**

| DECAY | 2029 1st | vs Higgins | anchor |
|---:|---:|---:|---|
| 0.88 (used) | 4,330 | 74.9% | inside |
| 0.8578 (late-1st step) | 4,220 | 73.0% | inside |
| 0.8394 (round-1 mean) | 4,131 | 71.5% | inside |
| **0.8222** | **4,045** | **70.0%** | **floor** |
| 0.8204 (early-1st step) | 4,036 | 69.8% | **below, B becomes a decline like A** |

So the doc's "B clears the anchor band at 75%, reluctant yes" survives only on a decay above the
whole measured range. The comment in `trade-sim-higgins.js:13-14` names the band as "0.82-0.86"
and the bottom of that band breaks the verdict.

The defence is real and the doc never makes it: the 2027 class carries a documented Jeremiah Smith
premium (`strategy.js:56-64`, +38.5 / +17.5 / +11%), so 2027-to-2028 is premium unwind plus decay
and overstates a pure one-year step. Fair. But there is no clean one-year decay measurable in this
data at all (2026-to-2027 runs the other way, 7,164/6,077 = 1.179), so 0.88 is an assumption
presented as a number, with no band and no "which half is a calibration bet" statement that
`CLAUDE.md` requires.

Compounding error the doc does not flag: `pv()` slots **every** future class off TODAY's lineup.
Its own comment (`trade-sim.js`, the `slotsUnder` ponytail note) says that was validated "within
~5%" against an aged build for 2027/2028. This is a 2029 pick, one year past the validation.
Plus-or-minus 5% on the 4,920 base alone puts the headliner at 71.2% to 78.6% before DECAY
uncertainty is applied.

What does survive: the title-odds sign. `.sim-out/c_20260912_d80.txt` ran DECAY=0.80 and B still
reads +9.98 equity. It is the **anchor-band** half that is fragile, and the anchor band is the
exact instrument the doc uses to decline A and admit B.

---

## (c) Is the pick slotting right, and was it done post-trade

**SURVIVES on the numbers. One latent bug that does not bite here.**

Re-derived through the site's own `startingKtc` / `slotsUnder` / `pv`:

```
slot 1  R 8  39378  djcomstock        <- weakest starting lineup, confirmed
slot 2  R 3  40779  JoeysYIDS
slot 3  R 7  49130  mhickie24
...
slot 7  R10  59381  tdub1329
...
slot 10 R 2  69185  NatePackard12

DJ 2027 R3   pre 3080   post-deal 3080      (KTC 2027 Early 3rd anchor = 3081)
DJ 2028 R2   pre 3940   post-deal 3940      (KTC 2028 Early 2nd anchor = 3937)
ME 2029 R1   pre 4418   post-deal 4330      (ME slot 7 -> 8)
```

Every figure in the doc's ledger reproduces, and the 4,418-to-4,330 move confirms post-trade
slotting was applied. Endogeneity has no bite on DJ's side because he is slot 1 before and after
(selling Higgins makes him worse, not better), which the doc does not say but which is why the
numbers are stable.

**The latent bug.** `startingKtc` (`trade-sim.js`) filters only `BENCHED` injury statuses and does
**not** exclude taxi-squad players, violating `CLAUDE.md`'s "`startableIds(roster)` before any
lineup" rule. Taxi bodies currently counted inside a starting lineup:

```
R 3 JoeysYIDS   Nicholas Singleton 3372, Demond Claiborne 2813
R 7 mhickie24   Chris Bell 3990
R 8 djcomstock  Cyrus Allen 3463, Pat Bryant 3290
```

I recomputed with taxi excluded: DJ 38,142, JoeysYIDS 39,773, mhickie24 48,751. **Slot order
unchanged, every pick price above unchanged.** So this verdict is unaffected, but a closer call
would be wrong, and DJ's "weakest starting lineup" number in the doc (39,378) is overstated by
6,753 of bodies that cannot start.

**Minor, and it is the trap FRAMEWORKS.md:213 names.** The doc quotes B at "86% fairness"
(line 84). The site's own Trade Lab output in `.sim-out/c_20260912_sc1.txt` reads **85%**, because
that block prices with pre-trade `pv()` (`trade-sim-higgins-counters.js:93`, no whatIf) while the
doc's ledger uses post-trade. Two numbers for the same thing reach the reader.

---

## (d) Is trading Caleb Williams actually free

**REFUTED. The prior finding was misdescribed, not superseded.**

The doc, lines 132-133: *"The 2026-09-12 doc priced QB-surplus counters and rejected them. That run
shipped **both** backup quarterbacks and left the roster on a waiver arm."*

That is false about half of the prior table. `docs/TRADE-DECISION-2026-09-joeysyids.md`:

```
line 187  | Caleb + Love, no picks (waiver QB claimed)  | 1.60 / 1.28% | 24.4 / 24.7 |
line 188  | Caleb + Juwan Johnson, keeps Love           | 1.84 / 1.68% | 27.7 / 28.3 |
line 189  | Caleb + the acquired 2027 2nd               | 1.64 / 2.16% | 27.6 / 27.7 |
line 186  | The proposed trade                          | 2.40 / 2.32% | 29.5 / 28.7 |
```

Lines 188 and 189 ship **exactly one** backup quarterback and keep Jordan Love. Both lost, on both
seeds and on 7-year equity. The prior doc's stated conclusion (lines 194-196) is *"Caleb Williams
is not dead weight, he is a 136-point swing behind a quarterback who plays a bye week and gets hurt
like everyone else. **Selling him to save a pick is selling the wrong asset.**"* That is precisely
what counter C does, and the new doc reverses it with zero title-odds evidence.

Two things make the objection stronger, not weaker, than it was on 09-12:

- Replacement QB **fell**: 158.8 then, **148.8 today** (`node site/js/_replacement-qb.js`, Jacoby
  Brissett, 296 rostered). QB2 insurance got more valuable, not less.
- The current run confirms it. `.sim-out/c_20260912_sc1.txt`, 7 seasons, 4,000 sims, both sides:

```
B  Lance + own 2029 1st            +10.34 equity   (best)
A  Lance + 27 3rd + 28 2nd          +8.57
D  Jordan Love + Lance              +7.66
E  Quentin Johnston + Lance         +7.23
C  Caleb Williams straight up       +1.49          (worst of nine)
```

and under the mandatory sensitivity, `.sim-out/c_20260912_sc1.3.txt`, **C goes negative: -0.23.**
Worse than standing pat. The md's second recommendation is the single worst package in the set on
the repo's own model, in both the base case and the stress case.

---

## (e) Would djcomstock actually accept counter E

**PARTIAL. The mechanism is true, the acceptance argument contradicts itself.**

The narrow claim reproduces. DJ's lineup before and after E:

```
DJ base:     ... WR Tee Higgins 218.2 | WR Keenan Allen 106.8 ...   total 1691.3
DJ after E:  ... WR Q.Johnston 160.7 | WR Keenan Allen 106.8 ...    total 1633.8   (-57.5)
DJ for Caleb: ... WR Keenan Allen 106.8 | WR Tyquan Thornton 62.6   total 1535.7   (-155.6)
```

Johnston does step into the hole. The reason is a positional hole the doc never names: DJ rosters
**9 TEs and only 6 non-taxi WRs** (Ayomanor, Keenan Allen 34, Kalif Raymond 32, Higgins, Burks,
Thornton). The -155.6 is a WR-slot collapse, not a value gap.

**The -155.6 is inflated by the repo's own named trap.** `simPool` has no waiver pool
(`trade-sim.js` header, trap 1). The scenario charges DJ Tyquan Thornton at 62.6 instead of the
claim he would actually make. Best unrostered WR is **Kendrick Bourne 77.4**, so the real cost is
about 140.8, and the E-versus-C gap narrows from 98.1 to 83.3. The counters script patches this on
Trevor's side (`C+ Caleb, claim a waiver QB2`, line 39) and never on DJ's. Direction holds, size
does not.

**The acceptance argument cannot be true alongside the pricing argument.** The doc prices DJ's
picks at the **early** anchors precisely because the model projects him to finish **last**
(slot 1 of 10, 39,378 starting KTC). It then sells counter C on the ground that he is "a rebuilder
holding six 2027 firsts" who wants "a 24-year-old starting quarterback." Both cannot hold. A team
modelled as finishing last, holding six 2027 firsts including his own at 7,160 (his single most
valuable asset, verified from `PICKS[8]`), is not choosing between offers on 2026 starting points.
Every point he adds in 2026 devalues the 1.01 he is sitting on. The doc offers no evidence about
DJ's preferences beyond the points table.

And on the one axis it does name, E is not even the best offer: **D banks him 1,096 KTC
(6,875 - 5,779) against E's 1,065.**

---

## (f) Everything else

1. **The verdict contradicts its own sibling deliverable, written 8 seconds later from the same
   data.** `docs/trade-brief-djcomstock-higgins-2026-09-16.html` (mtime 19:46:49; the md is
   19:46:41) opens *"Yes. Send Bryce Lance plus your own 2029 first."*, ranks B first of nine and A
   second, ranks E fifth and C last, and closes *"Do not counter with Caleb Williams or Jordan
   Love. They read cheaper on KTC and score worst in the model."* The md opens *"A is a no, B is a
   reluctant yes, and neither is the trade to send"* and recommends E, then C, then D: the
   simulator's 4th, 9th and 3rd. The HTML even cites the md as "Full reasoning." Two artifacts
   reach Trevor and they say opposite things.

2. **The md answers a "should I make this trade" question with points alone.** `CLAUDE.md`: *"Never
   answer a 'should I make this trade' question with points alone."* There is no title-odds number
   anywhere in the md. The runs existed when it was written: `.sim-out/c_20260912_sc1.txt` finished
   19:25:16, the md was written 19:46:41.

3. **The mandatory SCALE=1.3 sensitivity was run and left out of the md.** `CLAUDE.md`: *"A
   multi-year picks-for-players verdict is not done until you run `SCALE=1.3`."* A and B are
   picks-for-players. `.sim-out/c_20260912_sc1.3.txt` exists and is the thing that turns counter C
   negative.

4. **The repo's own hard-reject rule fires on the whole trade and is never invoked.**
   `.agents/skills/dynasty-league-format-leverage/SKILL.md:68`: *"**Hard reject rule.** Any win-now
   trade that raises projected weekly starter points by less than 5 is rejected on structural
   grounds ... which never justifies a first in a 10-team league."* The md's own headline (line 34)
   is *"about **+4.1 points a week**."* 4.1 is under 5. `CLAUDE.md` requires loading this skill
   family before any trade question; the md cites `dynasty-trade-construction` and never this one.
   Honest caveat: the simulator disagrees with the rule here (+2.84pp of 2026 title odds on a 7.65%
   base is not nothing), so one of the two is miscalibrated. Either way the md resolved the
   conflict by not noticing it.

5. **Noise-floor violation in the run the md declined to cite.** At seed 20260912, SCALE=1, B reads
   **+10.34** against the "Higgins for free" control at **+9.43**. You cannot beat free. That puts
   the noise on these equity figures at roughly 1 point, which is the same size as the 1.01 B-over-A
   gap the HTML uses for its headline. FRAMEWORKS.md: *"refuse any delta under your own noise
   floor."* What clears the floor is the large gaps: C at +1.49 and E at +7.23 against B at +10.34.

6. **"14 startable bodies ... There is no depth problem to solve"** is the miscount in (a):
   `_shape-check.js:31` includes all three QBs in a 1QB league.

7. **Shape doctrine and recommendation point opposite ways.** Top-3 share 17.9% is the
   "consolidate upward" band; Higgins lands 6th; counter E consolidates **downward** in total value
   (6,844 out for 5,779 in, -1,065 KTC) and leaves top-3 share at 17.9%.

8. **The WR-age table counts a man on IR.** `_shape-check.js:44` filters `!r.taxi` but not `!r.ir`,
   so Ricky Pearsall (IR, 26) is one of the "seven aged 25 to 28."

9. **E is not cheaper than B on the ledger the doc used to condemn A.** E costs 6,844 (+18.4%), B
   costs 6,792 (+17.5%). The doc calls B "18% over ... a reluctant yes" (line 167) and E's "real
   cost is zero" (line 143), one page apart, on two different yardsticks.

---

OVERALL: the verdict must change, because the repo's own simulator, already run and sitting in
`.sim-out/` when the doc was written, ranks the doc's three recommended counters 4th, 9th and 3rd
of nine (E +7.23, C +1.49 going to -0.23 at SCALE=1.3, D +7.66) against the two the doc declines
(B +10.34, A +8.57); the "identical +57.5" that the whole memo rests on is falsified by the repo's
own `_depth-cost.js` at -12.7 for counter E and by an 8-of-8-seed paired-seed loss of -0.96pp; the
prior 09-12 rejection of the Caleb counter was misdescribed rather than superseded; and the one
verdict that does survive on points, "B clears the anchor band at 75%," flips to a decline at
DECAY 0.8222, inside the 0.82-0.86 band the code's own comment cites.
