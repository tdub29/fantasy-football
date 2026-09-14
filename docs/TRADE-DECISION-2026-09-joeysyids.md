# JoeysYIDS: Watson + Johnston for three picks

Decision doc for tdub1329, Password is taco (10-team, 1QB, 4 FLEX, PPR). Written 2026-09-12
off the morning Sleeper pull, corrected the same evening off the 22:00 pull.

> **BOTH TRADES ARE DONE, and one recommendation in here was backwards.** Roster 10 now
> holds Collins, Waddle, Downs, Watson and Johnston, and no first-round pick before 2029.
> Trevor sent his OWN 2027 2nd and 3rd and kept the ones he had acquired, which is the
> opposite of what the "edit to make" section below told him, and he was right. The
> correction is in [Why the pick advice was backwards](#why-the-pick-advice-was-backwards);
> the KTC ledger below is left as written so the error is legible, with the real numbers
> beside it.

**The trade.** You receive Christian Watson (WR, GB), Quentin Johnston (WR, LAC) and Joey's
2028 4th. You send a 2027 2nd, your 2028 1st and a 2027 3rd.

**Verdict as given: send it only as half of a pair.** It is clearly good for 2026 and its
cost lands in years five through seven, where it is worth +1.5 equity at the model's
calibration and turns negative if rookie picks convert just 7% better than that. It does not
move you past the playoff line by itself. Deal A does. That part held, and both went through.

---

## Why the pick advice was backwards

**A pick's price is endogenous to the trade that moves it.** Every pick figure in the ledger
below was slotted off the rosters as they stood *before* the deals. That is the wrong world.
The instant you add five starting receivers, your own projected finish moves from third worst
to third best, and your own picks stop being early picks. The picks you acquired from other
teams do not move with you, and the team you bought from moves the other way.

Measured on the 22:00 pull, pre-trade slotting against post-trade reality:

| The same-round choice | Priced pre-trade | Actually worth | Verdict |
|---|---:|---:|---|
| Your own 2027 2nd | 4,410 | **4,000** | send this one |
| Acquired 2027 2nd (Wood Grain Grippers) | 4,070 | **4,150** | keep this one |
| Your own 2027 3rd | 3,010 | **2,840** | send this one |
| Acquired 2027 3rd (Breece's) | 2,980 | **3,040** | keep this one |

Pre-trade the two columns rank one way, post-trade they rank the other, and the flip is the
trade itself. You sent your own and kept the acquired ones, which was right by about 150 KTC
on the 2nd and 200 on the 3rd.

The same correction runs through the whole bill:

| Pick you sent | Priced pre-trade | Actually worth | Diff |
|---|---:|---:|---:|
| 2027 1st, your own | 6,700 | 5,790 | -910 |
| 2027 1st, from Breece's | 6,470 | 6,930 | +460 |
| 2027 2nd, your own | 4,410 | 4,000 | -410 |
| 2027 3rd, your own | 3,010 | 2,840 | -170 |
| 2028 1st, your own | 5,550 | 4,920 | -630 |
| **Total** | **26,140** | **24,480** | **-1,660** |

**You paid about 1,660 KTC less than the ledger said**, because four of the five picks were
your own and buying starters made all four cheaper as they left. The one that moved against
you is Breece's 2027 first: selling Collins, Waddle and Downs made him the worst team in the
league, so the pick you took from him is now an early first worth 6,930 instead of 6,470.
That is the same mechanism working in your favour.

**The title-odds half of this doc was never affected.** `projectLeagueForward` slots each
converted pick off the previous simulated season's finish with the what-if already applied,
so every number in the one table came from post-trade rosters. Only the hand-built KTC ledger
used the pre-trade world. `site/js/trade-sim.js` now takes a what-if in `pv()` and there is a
test that fails if a buyer's own pick does not get cheaper when the trade lands.

---

## The one table

Every row is the same engine the August doc used: `championshipOdds` / `titleEquity` from
`site/js/app.js`, 7 seasons, 2500 sims, two paired seeds reported as `A / B`.

| | 2026 title | 2026 playoff | Starter rank | 7-yr equity |
|---|---|---|---|---|
| Do nothing | 0.80 / 0.84% | 22.6 / 23.7% | 8th | 27.0 / 26.0 |
| JoeysYIDS alone | 2.40 / 2.32% | 39.6 / 39.4% | 8th | 29.5 / 28.7 |
| Deal A alone | 5.52 / 4.56% | 60.9 / 61.7% | 5th | 33.0 / 30.6 |
| **Both (what happened)** | **8.04 / 7.84%** | **73.4 / 72.6%** | **5th** | **37.4 / 35.7** |

Every sign is identical across the two seeds. The widest disagreement is Deal A's 2026 title
number, 5.52 against 4.56, so read that one as "about five percent" and nothing finer.

**They stack.** This trade spends the 2027 2nd, the 2028 1st and a 2027 3rd. Deal A spends
the two 2027 **firsts**, which you still hold (your own 1.10 and Breece's 1.08). Doing one
does not price you out of the other, and together they are a 10x move on your title odds.

**Say the cost out loud before you do both.** Today you hold 7 picks in 2027 and 5 in 2028.
Do both trades and you hold three in 2027 (a 2nd, a 3rd, a 4th), five in 2028 with no first,
and **your next first-round pick is 2029**. The model already charges you for that, which is
part of why "Both" lands at 37 equity rather than the 60 the 2026 column would suggest. It is
still the best number on the board, but that is the shape of the bet: 2026 through 2028 with
a 24 to 27 year old receiving corps, and a reload that starts in 2029.

## Why it is worth sending even though you lose the value trade

You are paying over market. The KTC ledger, priced through the site's own slot interpolation:

| Out | KTC | In | KTC |
|---|---:|---|---:|
| 2027 2nd (your own, slot 3) | 4,406 | Christian Watson | 4,896 |
| 2028 1st (your own, slot 3) | 5,545 | Quentin Johnston | 4,480 |
| 2027 3rd (your own, slot 3) | 3,009 | 2028 4th (Joey's, slot 1) | 2,031 |
| **Total** | **12,960** | **Total** | **11,407** |

That is **1,553 light, or 12%**, and the single biggest asset in the deal is leaving your
side, which is the wrong side of the Headliner Rule in [FRAMEWORKS.md](FRAMEWORKS.md).

Two things outweigh it.

**Your picks are expensive because your team is bad.** `originSlot` ranks projected draft
order by starting-lineup KTC, weakest first, and you sit at **slot 3 of 10**. Your own 2028
1st is therefore an *early* first at 5,545, not the 4,748 a late one fetches. You are selling
your picks at the top of their price range, which is the same fact that makes them expensive
to keep: a pick that valuable means the roster producing it is losing.

**You own a lot and field almost none of it.** Your dynasty value share is 11.44%, second in
the league behind Karl Havoc. Your starting lineup projects **8th of 10**. That is the
production-share lag the framework names, and the only cure is converting paper into
starters. 30.1% of your value sits in picks, inside the amber band.

## What the trade does not buy

**It does not get you into the playoffs.** 109.9 to 118.3 starter points per game, and the
sixth-place line is 122.5. You end 8th either way, four points short. That holds under every
projection source, which is the strongest confidence available here:

| Source | Now | After | Rank |
|---|---:|---:|---|
| Blend | 109.9 | 118.3 | 8th |
| Market props only | 107.9 | 114.9 | 8th |
| Sleeper only | 111.8 | 121.7 | 8th |

The playoff odds still climb 17 points because 22.6% was never about points alone, but do not
expect this to make you a contender. It makes you a live 8th seed chasing a 6-team field.

**It does not fix the WR room, it patches it.** Watson slots in at WR2 behind Mike Evans,
who is 33 and played eight games last year at 10.6 per game. Both sources have him back
near 12 per game over a full season (market 189.8, Sleeper 222.2), so the 206 is an
availability bet, not a bounce-back bet. If Evans misses time again, Watson stops being
depth and becomes the WR1.

Two of your ten projected starters carry **no market line at all**: Jauan Jennings (105.7)
and Cooper Kupp (86.4) are Sleeper-only. That is the same soft spot the August doc named,
and it cuts both ways, because they are also the two the trade displaces.

## The two risks worth pricing

**Watson has played 47 of a possible 68 games.** Four seasons, never more than 14 in one, and
his career high of 164.1 PPR sits below the 189.2 this model projects. The simulator uses a
generic positional injury hazard, so it does not know any of that. Haircut him to his own
career availability and the gain shrinks hard:

| Watson availability | Starter ppg | Gain |
|---|---:|---:|
| Full 17 games | 118.3 | +8.4 |
| 85% | 116.6 | +6.8 |
| 76% | 115.6 | +5.8 |
| 69% (his career rate) | 114.8 | +5.0 |

**Johnston is the quieter half and the better bet.** 174.7 PPR in 2024, 171.2 in 13 games in
2025 at 13.17 per game, and this model projects him *down* to 156.9. Gibbs has him WR34 to
Watson's WR23, but Watson is the one the market flagged as overpriced on 2026-08-30: ADP WR30
against a market projection of WR36.

## The edit to make before you send (WRONG, kept for the record)

> Superseded by [Why the pick advice was backwards](#why-the-pick-advice-was-backwards).
> Both numbers below are pre-trade slottings of picks that were about to move in a trade
> that changed the slotting. Post-trade the ranking inverts and sending your own is correct.

~~**Send the acquired 2027 2nd and 3rd, not your own.** You hold Wood Grain Grippers' 2027
2nd (slot 7, worth 4,071) and Breece's 2027 3rd (slot 4, worth 2,978). Your own are worth
4,406 and 3,009 because your team is projected worse.~~ The 1.5 points of extra seven-year
equity attributed to this swap came from the same mispricing and does not survive it.

## Counters I priced and rejected

The instinct is to pay with the two quarterbacks you cannot start. You roster Josh Allen (354),
Caleb Williams (295) and Jordan Love (270) in a **one-QB** league, roughly 10,400 KTC of
bench. Every version of that scores worse:

| Counter | 2026 title | 7-yr equity |
|---|---|---|
| The proposed trade | 2.40 / 2.32% | 29.5 / 28.7 |
| Caleb + Love, no picks (waiver QB claimed) | 1.60 / 1.28% | 24.4 / 24.7 |
| Caleb + Juwan Johnson, keeps Love | 1.84 / 1.68% | 27.7 / 28.3 |
| Caleb + the acquired 2027 2nd | 1.64 / 2.16% | 27.6 / 27.7 |
| Ship both backup QBs for nothing (control) | 0.52 / 0.72% | 22.0 / 20.5 |

The reason is replacement level, and it moved against you. The August doc priced the best free
agent QB at 196 points. Today every team in the league rosters two or three and the best
unrostered arm is **Jacoby Brissett at 158.8**. Caleb Williams is not dead weight, he is a
136-point swing behind a quarterback who plays a bye week and gets hurt like everyone else.
Selling him to save a pick is selling the wrong asset.

That run already includes Brissett being claimed. Without that patch the model charges an
empty QB slot, because `simPool` has no waiver pool at all.

## What this means about the August call

The August doc said do Deal A. **It never happened.** Breece's Pieces still rosters Nico
Collins (247.6), Jaylen Waddle (209.1) and Josh Downs (174.6), and you still hold both 2027
firsts. Re-run on today's data, that deal is worth +17.4 starter points, moves you from 8th to
5th, clears the playoff line, and is the rare trade where you *win* the value ledger:
16,549 KTC in against 13,156 out, a 26% margin.

The August doc also said Deal B, more picks for more mid-tier receivers, was neutral. This
trade is shaped like Deal B and prices better than Deal B did, because your receiving corps has
degraded since then. It is still the small move. Do not spend the month congratulating yourself
on it while the big one sits there.

## What is left, now that both are done

Steps 1 and 2 are executed. What remains:

1. **Sell the third quarterback.** Allen, Caleb Williams (5,964) and Jordan Love (4,426) in a
   one-QB league is about 10,400 KTC that cannot start. Keep two. Brissett at 158.8 is the
   best free agent arm in the league, so the last QB is worth roughly its gap over him, not
   its sticker.
2. **You have no first-round pick before 2029.** Three picks in 2027, four in 2028, none of
   them a first. That is the bill for the pair and it was priced in, but it means every
   further "buy now" move comes out of players from here.
3. **The TE room is the next surplus.** Six rostered, two started. McBride is untouchable;
   Okonkwo, Juwan Johnson, Mayer and Arroyo are about 8,800 KTC of bench that could become
   the 2029 pick capital you just spent.
4. **Mike Evans is 33 and projects 206.** He is a starter today and the sell window closes
   fast at that age. Trade-deadline decision, not a today decision.

## Limits of this analysis

1. **No waiver pool and no trade market in the simulator.** Depth is worth strictly more in
   the model than in the league, which is why the QB counters look worse than instinct says.
   The Brissett patch corrects the worst of it; it does not correct all of it.
2. **Generic injury hazard.** The model does not know Watson's history. The availability table
   above is the sensitivity, not a rerun.
3. **Week 1 data only.** Every roster in the pull is 0-0, so all of this is projection, with
   none of the season's information in it yet.
4. **Out-years are directional.** Trust 2026 through 2028. The 2031 and 2032 columns oscillate
   by more than their differences.
5. **Slot estimates move.** Your 2028 1st is worth 5,545 because you project 3rd worst. Win
   five games and it is worth closer to 4,800, which is the ordinary way a pick you kept gets
   cheaper.

## The Deal A message, if you want it

Written for you to send, not sent. Breece's Pieces is `djcomstock`. Keep it short; the
offer does the arguing.

> Sending you both 2027 firsts for Collins, Waddle and Downs. Mine is going to be an
> early pick, my starting lineup is 8th right now, and yours is a contender's first, so
> that is two real bites at 2027 for three receivers you are deep at. Open to reshaping
> which three if Downs is the holdup.

If he says no, the fallback is Collins plus Downs for one first and the 2028 1st, which
keeps the second 2027 first back. Do not add a fourth piece to chase it. Every version
where you pile on smalls to close a gap is the counter shape you have said you hate, and
the model does not pay you for it either.

## The one assumption that decides it

Everything long-run here rests on `pickRookiePoints`, which turns a pick into the points its
rookie scores. It prices your 2028 first at about 143 points in its rookie year and a fourth
at about 45. Scale that relation up for **every** roster, so nobody gets an unfair edge, and
the seven-year answer inverts:

| Pick conversion | This trade vs holding | Deal A vs holding |
|---|---:|---:|
| As calibrated (1.0x) | **+1.5** | **+5.7** |
| 1.3x | -4.8 | -9.1 |
| 1.6x | -12.0 | -22.0 |
| 2.0x | -23.5 | -32.2 |

The sign flips at about **1.07x**. Seven percent.

Three things keep this from being a reason to refuse the trade.

1. **The 2026 column does not move at all.** 0.85% title and 23.4% playoff without the trade,
   2.50% and 38.9% with it, identical at every scale, because a pick that has not converted
   cannot play this season. The win-now half of the case is not an assumption, it is arithmetic
   on the lineup.
2. **1.3x is probably too generous, not too conservative.** At that scale every fourth-rounder
   becomes a 60-point rookie, against a documented hit rate of roughly 8% for third rounders
   and later. The shipped calibration is fitted to this repo's own rookie data; the scale test
   is a stress test, not a rival estimate.
3. **You are pick-rich, which is exactly why this is sensitive.** Thirty percent of your value
   sits in picks and you hold seven in 2027, so any upward revision to what picks are worth
   helps you more than it helps the field. That is the same fact as "your picks are expensive
   because your team is bad", seen from the other side.

What it does mean: **do not send this one as a standalone.** A trade that leaves you 8th,
costs an early first, and needs a calibration to hold within seven percent is not a move that
stands by itself. Paired with Deal A it is a contender's move and the arithmetic is no longer
close.

## How these numbers were checked

No second agent reviewed this, so take the checks below as what stands behind it rather
than an independent sign-off.

1. **Two independent implementations of the lineup.** The points figures come from a
   python fill written against the league's own `roster_positions`, not from `app.js`.
   It reproduces the site's slot rules from scratch and agrees with the simulator on
   direction and on who starts.
2. **Paired seeds on every simulated row.** Both seeds are reported. No delta is claimed
   where the seeds disagree on sign, and the one number that moved materially between
   them is rounded to one figure in the text.
3. **Three projection sources.** Blend, market props only, and Sleeper only all land on
   the same rank, so the conclusion does not rest on a source choice.
4. **A leak check on the pick model.** Two scenarios that differ only in which future
   picks are spent return identical 2026 numbers and diverge only from 2027, which is
   what should happen when the current season cannot see a pick that has not converted.
   The scale sweep above is the same check from the other direction: 2026 is byte-identical
   at 1.0x and 2.0x pick value, which is what proves the win-now half is assumption-free.
5. **A sensitivity on the assumption that decides the answer**, reported even though it
   weakens the recommendation. That is the section above.

**And one thing none of it caught.** Every check above tested the simulator, which was right.
The KTC ledger was hand-built beside it and nobody tested that the two agreed about what a
pick is worth. They did not, and the disagreement is the whole error: the simulator prices
picks post-trade and the ledger priced them pre-trade. A cross-check between the two numbers
that reach the reader would have caught it; four checks on one of them did not.

**Reproduce:** `site/js/trade-sim.js` carries the three scenarios in the first table and
prices any what-if in title odds from the command line. It slices `app.js` the way
`site/js/title-odds.test.js` does and recomputes the projected draft order itself, so it
does not go stale as rosters move.

```
YEARS=7 SIMS=2500 SEED=20260912 node site/js/trade-sim.js
SEED=777001 node site/js/trade-sim.js
```

Refresh the inputs first with
`python site/data/fetch_sleeper.py && python site/data/build_site_data.py`. Pick values
there round to the site's one-decimal scale, so 4,406 prints as 4,410 and so on.
