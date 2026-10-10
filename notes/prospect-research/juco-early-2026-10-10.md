# JUCO and FCS transfers in the WR `early` flag (2026-10-10)

Pre-registered before any candidate was scored. Charter: `validation-charter-v2.md`.

## The flaw

`early` is `n_seasons <= 3`, a count of FBS seasons on file. A JUCO or FCS transfer who plays two
FBS seasons reads as an early declare. Four of the 14 top-3% WRs are such players (Gallup,
Westbrook, C. Wilson, R. Matthews).

## The signal that was missing

The sources have no JUCO field, but the recruit table carries one indirectly: a JUCO transfer has
two signing rows, his high-school class and a later JUCO class, both under his FBS school.
`hs_class` already takes the earlier one, so `arrive_gap = first_season - hs_class` (first FBS
season on file, roster or stats) is 2+ for a player who spent two or more years elsewhere. A
redshirt shows as 1. Gallup and Wilson are 2, Westbrook and Matthews 3.

## Seen before registering (disclosed)

Mature WRs, all classes, hit rate by `early` and stats-based arrival gap:
early with gap 0: 158 at 29%; gap 1: 50 at 16%; gap 2+: 18 at 22%. Not early: 237 at about 6%.
So short-career transfers hit like early declares, not like seniors. The prior is that a pure
relabel (E1) does not pass.

## Candidates (against W0 = `ryptpa_career`, `early`, `stars`)

- **E1** relabel: `early_elig` = `early` and `arrive_gap <= 1`.
- **E2** keep `early`, add `draft_age` (the class-year age proxy, DOB where known), so age carries
  the transfer penalty without discarding the short-career signal.
- **E3** `early_elig` plus `draft_age`.

Scored with the WR agent's runner (`prospect_experiments` `oof`, `score`, `decide`), talent and full
model, dev LOCO plus 2020+ walk-forward. Ship only on a charter `ship` verdict for the talent model
with the full model not worse. A pass ships to all three places `early` is computed (training,
`exit_scenario`, the next-season exit search) so training and scoring stay one definition.

## Runs

- bw2ykqomr: failed before fitting, `ModuleNotFoundError: build_prospect_model` (runner's path
  pointed at the removed worktree). No metrics produced.
- bjkt15i78: same contract, path fixed.

## Result

All three are rejected, so nothing ships. Using the roster-and-stats first season, only 8 mature
early WRs have `arrive_gap >= 2` (1 hit): Matthews, Westbrook, Gallup, Wilson, Wims, Fehoko,
Gray and a 2009 North Carolina receiver.

| Candidate | Talent fwd | Talent LOCO | Talent 2020+ | Boot | Full fwd | Full LOCO |
|---|---|---|---|---|---|---|
| base W0 | 0.3935 | 0.3609 | 0.4201 | | 0.3433 | 0.3308 |
| E1 relabel | 0.3923 | 0.3584 | 0.4189 | 80% | 0.3443 | 0.3321 |
| E2 + age | 0.3927 | 0.3627 | 0.4193 | 63% | 0.3441 | 0.3334 |
| E3 both | 0.3921 | 0.3607 | 0.4185 | 68% | 0.3451 | 0.3345 |

E1 lowers talent log loss on all three out-of-sample splits and lifts the top-3% tail from
29/50/50 to 36/64/64 (WR1/2/3, n=14). It misses the 90% bootstrap with only 8 players moved, and
the full model is a hair worse because draft capital already prices those 8. The direction is
right, but the evidence is too thin for the charter. Adding age does not help.

Scorer: `scratchpad/juco/juco.py` on the WR agent's runner, results in `juco_results.json`.

## Shipped anyway (owner call, 2026-10-10)

Trevor approved E1 as a definition correction: "prob do the fix if its right in direction". It ships
outside the charter (80% bootstrap, full model a hair worse), so it is logged here as an override,
not a pass. `build_prospect_model.py` now carries `transfer = first_season - hs_class >= 2` and
`early` requires `transfer == 0` in training (`career_features`), `exit_scenario` and the
next-season exit search, so training and scoring use one definition. Current players get slightly
more transfer detection than history because `hs_class` also reads the ESPN class label, which is
reliable only on 2025+ rosters.
