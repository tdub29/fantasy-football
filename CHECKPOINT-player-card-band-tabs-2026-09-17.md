# CHECKPOINT: player card number band + VALUE/PRODUCTION/CONTEXT tabs

Task `t-1789673649549`... no: **`t-1789681548094`** (dashboard queue). Ranks 4 and 5 of the
5-agent player-card verdict. Ranks 1-3 already shipped.

Resume with:

```powershell
cd "C:\Users\TrevorWhite\Downloads\Big Projects\Fantasy Football"
node --check site/js/app.js
python ..\.agents\scripts\verify-app.py "Fantasy Football"
```

## Asks in this task (both required)

1. **Rank 4, number band.** Six-cell horizontally scrollable band directly under the
   verdict banner: VALUE (0-110 scale), positional value rank, TIER + category, ROS
   projection + positional proj rank, VOR, age vs the position sell age. Must replace the
   existing chip rows so nothing prints twice.
2. **Rank 5, three tabs.** The reference blocks behind VALUE / PRODUCTION / CONTEXT using
   the existing `.tab-bar` at `css/styles.css:2401`. Promote the KTC value chart out of
   `historyBlock` to be first in the default VALUE tab, with 3mo / 1yr / All range tabs and
   a signed change callout. **No fourth tab** (the judge cut it as over-structure).

## Source of each number (all already computed)

| Cell | Source in app.js |
|---|---|
| VALUE 0-110 | `tierValue(ranked, primaryLeague())` |
| pos value rank | `mispricingIndex().get(id).valRank` |
| TIER + category | `ourTierChip(id)` / `tierChip()`, `ourCatChip(id)` / `pillCategory()` |
| ROS proj + proj rank | `window.OFFENSE_PROJ` record, `mispricingIndex().get(id).projRank` |
| VOR | `vorForPlayer(rec, lg, unit, src)` |
| age vs sell age | `ageOf(id, ...)` vs `window.STRATEGY.age_curve[pos].sell_age` |

## Status

- [x] Read playerModal, projectionBlock, historyBlock, `.tab-bar` CSS, STRATEGY.age_curve
- [ ] numberBand() + CSS
- [ ] remove old chip row + duplicate age
- [ ] ktcChart promoted with range tabs + signed change
- [ ] three-tab shell over the reference blocks
- [ ] feature-map entries
- [ ] gates

## Non-negotiables from the brief

- Vanilla JS, single file `site/js/app.js`, no build step.
- Holds at 390px with **no horizontal page scroll**.
- Must survive an **unowned** player and one with **no KTC history**. The card regressed to
  3 of 11 blocks during rank 1-3 work because a range edit nested the child list inside
  `projectionBlock`, so open a REAL browser for both, not just `node --check`.
- Verify with **Jahmyr Gibbs** (owned) and **Marvin Mims** (unowned).

## Trap already hit this session, applies here

`site/js/app.js` is being rewritten by a concurrent writer: it shifted by +58, -1 and +32
lines during the table-layout task, and `CLAUDE.md` gained a requirement mid-run. A lease is
held and the writer ignores it. **Anchor every edit to matched text or to a table/function's
position in file order, never to a line number**, and re-grep immediately before writing.
