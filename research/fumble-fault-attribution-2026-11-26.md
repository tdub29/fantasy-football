# Fumble Fault Attribution & RB Fluke-vs-Trend Guide (2026-11-26)

**Bottom line.** When an RB starts fumbling mid-season, your default reaction should be **do not panic-sell or bake a single-year fumble spike into projections** unless **2-to-3-season volume (`>=250` touches)** shows a persistently elevated rate (`>=1.25%`) or his snaps drop immediately after the mistakes. Across `2020-2026` REG (`4,065` fumble plays), **93.5% to 95.8%** of RB scrimmage fumbles are marked `fumble_forced == 1` by official scorers (`unforced_rate` has `r = -0.062` YOY signal), recovery is a coin flip (**56.5% lost**, `r = +0.004` YOY), and real RB ball-security separation only emerges over **2+ pooled seasons (`r = +0.292`, `p = 0.001`)**.

---

## 1. The RB Fumble Reaction Playbook (Fluke vs Trend)

Check these four steps on an RB's **Ball Security** card (built by `projections/build_fumbles.py` -> `site/data/fumbles.js`) before trading away or benching him:

1. **Check 3-year touches (`pool3.t`) first.** At the NFL baseline of **0.799%** (`1` fumble per `125.2` touches), separating a `0.80%` RB from a `1.60%` (`2x`) RB at 80% power takes **2,912 touches per group**. Over just `100` touches, `1` fumble gives a 95% Wilson CI of **`[0.18%, 5.45%]`**. Below `250` career/3-yr touches (`Small Sample`), a 2-to-3 fumble stretch is statistically indistinguishable from bad luck unless the depth chart reacts.
2. **Never excuse `forced == 1` fumbles as "not on the RB."** Scorers credit **93.5%** (`2020-2025`: `637 / 681`) and **95.8%** (`2026 W1-11`: `92 / 96`) of RB scrimmage fumbles as forced. Multi-year high-rate RBs (`Rhamondre Stevenson` `19 / 1,157` = `1.64%`, `Aaron Jones` `21 / 1,533` = `1.37%`, `James Cook` `16 / 1,195` = `1.34%` from `2020-2026`) all carry `0` or near-`0` unforced fumbles. True ball-security risk lives inside pooled **forced+total fumble rate**, while `unforced` only flags non-contact drops and aborted snaps/handoffs.
3. **Separate fumble rate from recovery bounces (`56.5% lost`).** Fantasy box scores dock `-2` pts per lost fumble, yet `fumble_lost / fumbles` has **zero year-over-year persistence** (`r = +0.004, p = 0.968`). Compare **Actual Lost** vs **Expected Lost** (`-1.13` pts per fumble = `-2 * 0.565`):
   - *Unlucky 1-Yr Spike (hold/buy):* `Jonathan Taylor` (`2026`: `5 / 220` = `2.27%`, `4 lost` vs `2.82` exp lost; `3-yr`: `11 / 910` = `1.21%`) and `Bucky Irving` (`2026`: `4 / 210` = `1.90%`, `4 forced / 0 unforced`, W7 punched by `Will Lee III` at `7.28 BC FF/1k`; `3-yr`: `7 / 667` = `1.05%`).
   - *Multi-Yr Trend (real carry-risk tax):* `Cam Skattebo` (`2026`: `5 / 147` = `3.40%`, `3-yr`: `6 / 272` = `2.21%`) and `Rhamondre Stevenson` (`3-yr`: `12 / 537` = `2.23%`, `12/12` forced).
   - *Lucky clean box score masking risk bounces:* `Bijan Robinson` (`2026`: `3 / 220` = `1.36%`, `0 lost` vs `1.69` exp lost; `3-yr`: `8 / 951` = `0.84%`).
4. **Price reception vs carry mix and matchup strips.** RBs fumble **1.60x more often on receptions (`1.133%`, `170 / 15,002`) than on rushes (`0.706%`, `496 / 70,273`)**, and non-sack strip specialists (`Ball-Carrier FF / 1k snaps`, `YOY r = +0.180`) explain isolated punch-outs without condemning the carrier.

---

## 2. Empirical Validation (`2020-2026 REG`, `299,806` Plays / `4,065` Fumbles)

### 2.1 Public PBP Technique Limit (`desc` Regex Negative Result)
Across all **2,769 forced fumbles (2020-2026 REG)** and **761 RB forced fumbles**, **0 (0.00%)** official GSIS play descriptions contain punch/strip verbs (`punch`, `peanut`, `strip`, `poke`, `knock`, `jar`, `slap`, `rake`, `swat`). PBP uses a fixed template (`FUMBLES (28-A.Wingard)`). What structured PBP cleanly isolates instead:

| Forced Fumble Context (`2020-2026 REG`, `n = 2,769`) | Count | Share | Lost % | Defender Position Split |
|---|---:|---:|---:|---|
| QB Strip-Sack (`sack == 1`) | 965 | 34.9% | 53.7% | 478 DL / 408 LB / 78 DB / 1 Other |
| RB Ball-Carrier (`sack == 0`, scrimmage) | 721 | 26.0% | 57.0% | 182 DL / 263 LB / 276 DB |
| WR/TE Ball-Carrier (`sack == 0`, scrimmage) | 636 | 23.0% | 57.4% | 29 DL / 190 LB / 417 DB |
| Special Teams (`kickoff/punt/FG/XP`) | 235 | 8.5% | 46.0% | 5 DL / 87 LB / 92 DB / 51 Other |
| QB Scramble / Non-Sack (`sack == 0`) | 171 | 6.2% | 49.7% | 49 DL / 64 LB / 58 DB |
| Other | 41 | 1.5% | 39.0% | 0 DL / 5 LB / 6 DB / 30 Other |

### 2.2 Multi-Fumble Play-Level Flag Bug (`both == 1`)
Because `fumble_forced` and `fumble_not_forced` sit at the play level (`22` plays in `2020-2026`, `6` involving RBs on scrimmage snaps), joining `fumble_not_forced` onto `fumbled_2_player_id` misattributes teammate drops onto innocent RBs (e.g., `2026 W8`: QB Baker Mayfield unforced drop + lateral to RB Bucky Irving forced out by Jessie Bates; `2022 W9`: Austin Ekeler). `projections/build_fumbles.py` resolves each `(slot 1, slot 2)` fumble against individual `stats_player_week` counts and positional `FUMBLES (...)` clauses in `desc`, reconciling `2026` W1-11 to `96` scrimmage RB fumbles (`95` rush+rec in `stats_player_week` + Jonathan Taylor's W8 `(Aborted)` rush snap).

### 2.3 Year-to-Year Persistence (`2020-2025 REG`)

**Running Backs (1-Season & 2-Year Pooled -> Year 3):**

| Sample Filter | N Pairs | Total `fum_rate` | `forced_rate` | `unforced_rate` | `lost_per_fum` |
|---|---:|---|---|---|---|
| 1-Yr `>= 100` touches both yrs | 181 | `r = +0.107` (`p = .150`) | **`r = +0.169`** (`p = .023`) | `r = -0.062` (`p = .406`) | `r = +0.004` (`N=122, p=.968`) |
| 1-Yr `>= 150` touches both yrs | 131 | `r = +0.115` (`p = .193`) | `r = +0.147` (`p = .094`) | `r = -0.034` (`p = .698`) | `r = +0.023` (`N=97, p=.823`) |
| **2-Yr `>= 250t` -> Yr 3 `>= 100t`** | **125** | **`r = +0.251`** (`p = .005`) | **`r = +0.292`** (`p = .001`) | `r = -0.061` (`p = .496`) | - |
| **2-Yr `>= 350t` -> Yr 3 `>= 150t`** | **83** | **`r = +0.225`** (`p = .041`) | **`r = +0.265`** (`p = .015`) | `r = -0.071` (`p = .524`) | - |

**Defenders (`2020-2025` Consecutive Seasons):**

| Defender Pool | N Pairs | Total `ff/1k` | Strip-Sack `ff_sk/1k` | Ball-Carrier `ff_bc/1k` |
|---|---:|---|---|---|
| All `>= 300` def snaps | 1,594 | `r = +0.193` (`p < .001`) | `r = +0.320` (`p < .001`) | `r = +0.155` (`p < .001`) |
| All `>= 500` def snaps | 1,020 | **`r = +0.243`** (`p < .001`) | **`r = +0.401`** (`p < .001`) | **`r = +0.180`** (`p < .001`) |
| LB `>= 300` def snaps | 414 | `r = +0.142` (`p = .004`) | `r = +0.284` (`p < .001`) | **`r = +0.180`** (`p < .001`, mean `0.73/1k`) |
| DB `>= 300` def snaps | 633 | `r = +0.115` (`p = .004`) | `r = +0.170` (`p < .001`) | **`r = +0.121`** (`p = .002`, mean `0.73/1k`) |
| DL `>= 300` def snaps | 547 | `r = +0.217` (`p < .001`) | `r = +0.228` (`p < .001`) | `r = +0.092` (`p = .032`, mean `0.39/1k`) |

Notice how cleanly splitting `Strip-Sack FF` vs `Ball-Carrier FF` separates off-ball strip artists (`Nate Landman`: `4` BC FF / `0` sack in 2026 = `8.28 / 1k`, `11` BC FF / `0` sack across `2024-2026` = `5.38 / 1k`; `Fred Warner`: `4` BC FF in 2026 = `6.20 / 1k`, `9` BC FF 3-yr = `4.56 / 1k`; `Quincy Williams`: `4` BC FF in 2026 = `6.34 / 1k`, `7` BC FF 3-yr = `2.74 / 1k`) from pass-rush edge strips (`T.J. Watt`: `5` strip-sacks vs `5` BC FF over `2024-2026`; `David Bailey`: `3` strip-sacks + `3` BC FF in 2026).

### 2.4 Empirical Bayes Prior & Scope Guard
Method-of-moments Beta-Binomial shrinkage across `2020-2025` RB seasons (`N = 324 >= 100` touches) gives true between-RB SD `0.100%` (`M = 7,874` touches total fumbles, `M = 2,884` touches forced fumbles; zero excess variance on `fum_unforced`). `site/data/fumbles.js` uses `M = 3,000` touches toward `0.799%` for `EB True%` and keeps everything strictly descriptive on Player Cards (`Production` -> `Ball Sec.`) and Stats Lab (`RB` toggleable `Ball Security` group + `#stats/IDP` `BC FF` / `FF vs RB` / `BC FF/1k` / `Strip-Sk FF`). Nothing touches weekly or dynasty fantasy point projections.

### 2.5 Paywalled Data Note (PFF & NGS)
Public `nflverse` Next Gen Stats tables lack fumble/strip columns, and PFF (`PFF+ $99.99/yr` or `PFF Pro $199.99/yr`, paywalled) groups forced fumbles under `FF` without a public Peanut Punch column (adding mainly RB ball-security grades and missed tackles forced). Public `nflverse` PBP `sack == 0` ball-carrier FF plus 3-year RB pooled rate covers the full fault-attribution question directly.
