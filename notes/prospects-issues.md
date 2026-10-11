# Prospects page: Trevor's issue list

Running list, written as Trevor raises them so nothing is lost at compaction. Mark each one
done only once it is deployed.

## Open

7. Breakout: Fr/So/Jr/Sr rejected. Use real birth dates from cfb bio sources (cfbfastR
   espn_cfb_player / ESPN athlete API, ESPN roster date_of_birth, nflverse birth_date for drafted,
   anything else key-free) and show real breakout ages; proxy only where no DOB exists, coverage stated.

## Older, still pending

4. Prospects scatter toggle (x = prospect score, y = NFL PPG over replacement).
5. Refactors: title-odds stance/rank store, Blueprint rank tooltip, valueTrajectory labels, aging
   curve unification.
6. Chat answer: KTC vs production (KTC prices multi-year value; the model target is a top-finish season).

## Done

- 2026-10-11: no ~ before numbers (score, chance %, mock pick); a mock pick shows one decimal only
  when it is not whole.
- 2026-10-11: Tankometer slider on each league page (The League preset 90%). What to Look For counts
  a league at (100 - N)% of its buy-in, both sides; 100% drops it. Fatty Lineup: Trevor hides it.
- 2026-10-11: midfield logo cut to about 12% of the field; kept upright on desktop (horizontal field,
  broadcast orientation).
- 2026-10-11: What to Look For no longer blanks when one league has no buy-in on file.

- 2026-10-11: one 0-100 Prospect score (pick plus profile, percentile vs every drafted player at the
  position since 2008), default sort, beside the two chance columns; also on cards and class rank.
- 2026-10-11: Proj. pick says UFD for a next-class player in no mock; scored as pick 257.
- 2026-10-11: Breakout shows Fr/So/Jr/Sr. Ages were a class-year proxy (no college birth dates
  exist key-free; ESPN returns none), so every value sat on 18.7/19.7/20.7.

- 2026-10-11: one top-finish target on cards and table; QB/TE cuts top-6 and top-12, RB/WR top-12
  and top-24; Proj. pick and NFL pick columns. Deployed.
