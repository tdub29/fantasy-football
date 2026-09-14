# CHECKPOINT: JoeysYIDS trade evaluation, 2026-09-12 (COMPLETE, one finding corrected)

> **Corrected 22:20 the same day.** Both trades executed. Trevor caught that pick values
> change AFTER the trades, which made the "send the acquired 2027 2nd and 3rd" advice
> backwards. His own picks got cheaper the moment five starting receivers landed; he sent
> his own and kept the acquired ones, which was right. Fix is in `pv(..., whatIf)` in
> `site/js/trade-sim.js`, a mutation-verified test, `CLAUDE.md` and `docs/FRAMEWORKS.md`.
> The title-odds numbers were never affected; `projectLeagueForward` already slotted picks
> post-trade. Only the hand-built KTC ledger used the pre-trade world.

**The ask (Telegram job ej-1789259849822):** evaluate the trade in the screenshot against
what this repo already documented, and say whether to send it.

**The trade.** Password is taco, 10-team 1QB PPR. tdub1329 (roster 10, Boutte Hunter)
receives Christian Watson + Quentin Johnston + Joey's 2028 4th; sends his 2027 2nd,
his 2028 1st and his 2027 3rd to JoeysYIDS (roster 3, Pre bobby Mud Dogs).

**Verdict:** send it only as half of a pair, swapping the two 2027 picks for the ones
acquired from better teams, alongside going after Deal A, which is still unexecuted and does
not compete for the same assets. Standalone it is close to a coin flip: +1.5 seven-year equity
at the model's pick calibration, negative if picks convert 7% better, and it leaves him 8th.

## Done

- League identified (JoeysYIDS sits in both Password is taco and The League; only the
  Password is taco roster holds both Watson and Johnston).
- Pick ownership reconstructed from `traded_picks.json`: tdub holds 7 picks in 2027,
  5 in 2028, 4 in 2029.
- Projected draft slot computed the way `originSlot` does it (KTC starting-lineup
  strength, weakest first). tdub projects **slot 3**, so his own 2028 1st interpolates
  to **5,545 KTC, an early 1st**, not a late one.
- KTC ledger, lineup-points delta, value share and pick liquidity computed.
- Title odds run through the repo's own `championshipOdds` / `titleEquity` in node,
  7 years, 2500 sims, two paired seeds, across 13 scenarios.
- Found and corrected a model artifact: the simulator has no waiver pool, so any
  scenario shipping both backup QBs is charged an empty QB slot. Re-run with the real
  replacement (Jacoby Brissett, 158.8, best unrostered QB in the league).
- Found that Deal A from the August doc was never executed and is still available.
- Canonical decision doc: `docs/TRADE-DECISION-2026-09-joeysyids.md`
- Phone brief: `docs/trade-brief-joeysyids-2026-09-12.html`, rendered and checked at
  390px with no horizontal overflow anywhere on the page.
- August doc banner-stamped as NOT EXECUTED with the corrected replacement-QB figure.
- `docs/SESSION_LOG.md` entry appended; accomplishment row logged to job-search.
- Harness kept in the repo as `site/js/trade-sim.js` (recomputes projected draft order
  itself so it does not go stale) with `site/js/trade-sim.test.js` pinning the invariants.
  The test catches the silent failure: a `spendPicks` label typo leaves the pick on the
  roster and the trade reads as free. Mutation-tested, it fires.
- **Pick-conversion sensitivity, which changed the verdict.** Scaling `pickRookiePoints`
  for every roster flips the seven-year sign at about 1.07x: +1.5 as calibrated, -4.8 at
  1.3x, -23.5 at 2.0x; Deal A moves the same way harder. The 2026 column is identical across
  the whole sweep, proving the win-now half carries no pick assumption. Folded into the
  harness as `SCALE=`, and into `CLAUDE.md` as a standing gate on any multi-year verdict.
- `node --check site/js/app.js` clean, all 13 tests in `site/js/*.test.js` pass (the new one
  also passes under `SCALE=1.3`), `doc-lint.ps1` 0 FAIL.

## Corrected after the fact

- Pick pricing is endogenous to the trade: slot off post-trade rosters, never pre-trade.
  Pre-trade said own 2027 2nd 4,410 vs acquired 4,070; post-trade it is 4,000 vs 4,150.
  Across the five picks sent, pre-trade slotting overstated the bill by 1,660 KTC.
- Root cause of the miss: four verification passes all tested the simulator, which was
  right, and none cross-checked it against the hand-built ledger, which was wrong.

## Nothing owed

## Reproduce

`site/js/trade-sim.js` is the harness, kept in the repo. It slices `app.js` the way
`site/js/title-odds.test.js` does and recomputes the projected draft order itself.

```
YEARS=7 SIMS=2500 SEED=20260912 node site/js/trade-sim.js
SEED=777001 node site/js/trade-sim.js
```

Refresh inputs first with
`python site/data/fetch_sleeper.py && python site/data/build_site_data.py`.
