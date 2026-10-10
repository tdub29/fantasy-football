# College production grades on the prospect card

Built 2026-10-09 for task t-1791534753751: per-metric grades on the prospect card, in the style of
Dynasty Domain's Bakery report cards (`dynasty-domain-bakery.md`). Builder:
`projections/build_production_grades.py`, output `site/data/production-grades.js`, rendering in
`collegeProspectBlock` and `prospectModelBlock` (`site/js/app.js`), test
`site/js/production-grades.test.js`.

## What ships and what is hidden

Of the ten metrics on a Bakery card, three can be computed from key-free public data. The other
seven need charting that only PFF (or Sports Info Solutions) sells; PFF is excluded and no
key-free source carries them, so they are **hidden on the card, never shown as zero**.

`n` is the size of the reference: players drafted 2010-2026 at the position whose college career
is on file.

| Metric | Position | Source | Available | n |
|---|---|---|---|---|
| Dominator (best season: mean of yards share and TD share) | WR, TE (receiving), RB (scrimmage) | sportsdataverse `espn_cfb_receiving` + `espn_cfb_rushing`, team totals summed from the same files | y | WR 508, TE 235, RB 336 |
| Breakout age (first qualifying season at the dominator line, team throwing 15+ a game) | WR, TE, RB | same files, plus the first-season age proxy from rosters and recruit classes | y | WR 508, TE 235, RB 336 |
| YPC (career rush yards per carry, 100+ carries) | RB | `espn_cfb_rushing` (`plays`, `yards`) | y | RB 320 |
| YPRR (yards per route run) | WR, TE, RB | PFF route charting; ESPN play-by-play has no routes | n | 0 |
| YAC/rec | WR, TE, RB | PFF; ESPN play-by-play has no air yards or catch point, so yards after the catch cannot be split out | n | 0 |
| YCO/att (yards after contact) | RB | PFF contact charting | n | 0 |
| MTF/att (missed tackles forced) | RB | PFF charting | n | 0 |
| BTT% (big-time throws) | QB | PFF throw grading | n | 0 |
| TWP% (turnover-worthy plays) | QB | PFF throw grading | n | 0 |
| Adj comp% (drops, throwaways, spikes, batted balls removed) | QB | PFF charting | n | 0 |

**QB cards carry no grade.** Raw completion % and interception rate are on the file, but they are not
adjusted completion % or TWP% and are not shown as if they were. The QB card keeps its existing
Comp %, AY/A and rushing tiles, ungraded.

## How a grade is made

- **Reference.** Every QB, RB, WR and TE drafted 2010 on whose college line links (the join misses
  7.3% of drafted players, mostly FCS; `data-sources.md`), built by `build_prospect_model.prepare()` with the same
  feature code the card's own values come from, rounded the way `prospect-model.js` carries them
  (dominator 2 decimals, breakout age 1, YPC 1). The `--self-check` proves every drafted card value
  since 2010 sits in its own reference. A drafted player's card grades him against a pool that
  includes him.
- **Percentile.** One function, `pmPctile(vals, v, lower)` in `site/js/app.js`: mid-rank, so ties
  split evenly, and `lower` flips the direction for breakout age (younger is better). The card
  header's size and archetype percentiles go through the same function.
- **Letter.** `PM_GRADE` in `site/js/app.js`: Dynasty Domain's letter map on the rounded decile
  (`dynasty-domain-bakery.md` 3.1, inferred from their report cards): A+ 95+, A 85+, B+ 75+, B 65+,
  B- 55+, C+ 45+, C 35+, C- 25+, D+ 15+, D 5+, F below 5.
- **On the card.** The Dominator, Breakout age and YPC tiles keep the stat as posted and add a line
  under it: letter, percentile, `n=`. The tooltip names the reference and the bands. A tile with no
  value is not drawn, so a missing value never becomes a grade.

## Caveats

- **Grades describe, they do not predict.** They rank production among drafted players. Which of
  these actually predicts an NFL hit is the model card's question; breakout age, for one, is in no
  shipped model.
- **Never broke out.** A drafted player who never reached the line carries his final college age
  plus one, so he sits at the old end of the reference. A current player with no breakout yet is
  censored, not late: no value, no grade.
- **Current players include the live season.** Their dominator counts the 2026 season once it
  qualifies (half of a full season), and YPC counts every carry so far. The reference is final careers.
- **Coverage.** FBS seasons only, 2004 on. 2004 is thin and 2005-2007 miss some games, which only
  touches the oldest careers in a 2010 class. Ages are estimated from the first season on file
  (roster birth dates are mostly gone).
- **Breakout age tops out at A for RB and WR.** Class-year ages come in whole-year steps, so the
  youngest possible breakout (18.7) is a tie shared by many drafted players and its mid-rank
  percentile tops out at 89 for RB and 93 for WR: an A, even though an A+ band exists. TE reaches 97.
- **Small YPC samples are hidden.** Under 100 career carries there is no YPC tile.

## Rebuild

Needs the prospect store (`projections/prospect-db/prospect.sqlite`); the builder copies it to a
temp folder and reads the copy. `build_all.py` runs it after the prospect model.

    python projections/build_production_grades.py
    python projections/build_production_grades.py --self-check
    node site/js/production-grades.test.js
