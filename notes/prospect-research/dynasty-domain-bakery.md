# Dynasty Domain "Bakery" prospect model: reverse-engineering notes

Compiled 2026-09-26. Goal: understand TheBakery well enough to rebuild something like it in our Fantasy Football app.

**Legend.** `[S]` = stated by Dynasty Domain (hosts Avery and Nathan) or by the model's creator Ryan Bread (@FFRybread). `[I]` = my inference from their numbers or screenshots, not something they said. Quotes are approximate because the transcripts are YouTube auto-captions (names are garbled in the source: "Mai Lemon" / "McKay Lemon" = Makai Lemon, "Jahmyr Gibbs and Price" = Jadarian Price, "Conpsion" = KC Concepcion, "Serat" = Elijah Sarratt, "Hiden Reich" = Eli Heidenreich, "Kron Allen" = Kaytron Allen).

Sources: the 7 named transcripts, the two Dynasty Domain transcripts at the project root, 4 more Dynasty Domain videos I pulled as captions (now saved in `transcripts/`), and Ryan Bread's public X posts plus the screenshots attached to them (read via the workspace X CLI and the public pbs.twimg.com image CDN; no new accounts, no API keys). Full index at the end.

---

## 0. The three things that matter most

1. **It is a per-position regression over graded college stats, with draft capital as a heavily weighted input, and no film.** `[S]` "a series of analytics based prospect evaluation models ... Using a combination of linear regression, a proprietary formula and weighted metrics, each position is graded independently" (X 1998860512743092429). "There's no film grade involved" (S-XZuFrvXMI). "Bakery Grades/Rankings are Landing Spot/Team Situation agnostic" (X 2048434996147368242). "TheBakery weighs draft capital decently heavily (not necessarily significant)" (X 2062236768876048796).
2. **Each stat is converted to a 0-10 component grade (with a letter grade), the components roll up to a position grade (roughly 3 to 15), and fixed position-specific tiers carry historical hit rates.** `[S]` from the report-card screenshots and the tier tables (Section 3). Tiers, top to bottom: Cornerstone, Elite (WR later split into Elite+ and Elite Lite), Elite Upside, Upside, Upside Lite, Outlier, then two unnamed bottom tiers the hosts call "purgatory".
3. **Draft capital is a placeholder until the draft, then it is swapped for the real pick and the grade moves.** `[S]` "The only variable in the score calc that is TBD is Draft Capital. The projected DC used was from a 7 Round Mock by TheAthletic" (X 1783589857001931102, 2024); 2026 used "updated Draft Capital from @_mockdrafts" (X 2033590300489216482). Observed post-draft moves are about +0.7 grade for a player who went a round earlier than projected and about -0.8 for a round later (Section 2.3, `[I]`).

---

## 1. What it is and who runs it

| Fact | Tag | Source |
|---|---|---|
| Creator: Ryan Bread, "Creator of TheBakery / Lead Prospect Analyst @domainfantasy" | S | X profile @FFRybread |
| RB model v1.0 shipped Jan 2023 ("Just wrapped up version 1.0 of my RB Prospect Model") | S | X 1617331005630648322 |
| WR model is "the OG bakery"; QB Bakery v1.0 debuted fall 2025 ("his passion project this offseason ... version 1.0") | S | Y038jwveVMU; 4w8QYgX0gUs |
| Covers QB, RB, WR, TE; each graded independently | S | X 1998860512743092429 |
| "Not inherently predictive (not designed to predict fantasy PPG), the prospect grades do tend to have solid hit rates" | S | X 1998860515439947881 |
| Paywalled: "the full bakery database" comes with the flockfantasy.com/domain annual tier, alongside a "rookie draft analyzer" (hit rates by draft capital combos, "value fallers, hit rate fallers, bakery fallers", "who's the archetype hit") | S | J0GUfLrB4d4; transcript-rookie-rankings-2026.txt (CwBKU26DVQY) |
| "Ever evolving product ... As new metrics and weights are added and tested, players will move up and down in both grade and ranking" | S | X 1998860551397712096 |
| Hosts use it as one input and blend with film: "analytics ... predictive bakery stuff ... We use film and we try to mesh those two together" | S | DYKsOZo9Y7Q |
| Their post-draft rankings are market-value rankings, not Bakery order: "we're going to rank them based on market value" | S | DYKsOZo9Y7Q |

---

## 2. Inputs

### 2.1 Component stats by position (current version, from Bakery report-card screenshots, Jul-Aug 2026)

Every stat is shown as a 0-10 grade plus a letter grade. `[S]`

| Position | Scored components | Profile fields shown (not obviously scored) | Source |
|---|---|---|---|
| WR | Dominator, Breakout Age, Y/RR, YAC/R, HaSS, Separator, Ball Skills | Draft Age, Height, Weight, 40, Draft Round, Draft Pick, Type (Wide / Hybrid / Slot), Archetype (PROTO X, PROTO Z, BALL HOG, RAT, SLOB), Separator label (Elite Earner, Elite Separator, Poor Earner, Poor Separator) | Nick Marsh card, X 2092720657603907742; WR history sheet, X 1998860509219860691 |
| RB | Dominator, Receiving Dominator, Breakout Age, Speed Score, MTF/A, YPC, YCO/A, Elusiveness | Build (FREAK, BELL COW, BELL CALF, DYNAMIC, JITTERBUG, BRUISER), Archetype (HORSE, 3DOWN, SLASHER, +RECEIVER) | Keyjuan Brown card, X 2079983346650587433; RB history sheet |
| TE | Dominator, Breakout Age, Y/RR, Y/REC, YAC/R, HaSS | Type (Inline / Hybrid / Slot), Archetype (Traditional, Move, Big Slot, Blocker) | Jamari Johnson card, X 2089775393578311846 |
| QB | Pass Grade = Breakout Age, "YPC", ADJ% (adjusted completion), BTT% (big time throw), TWP% (turnover-worthy play), DAA% (deep adjusted accuracy). Rush Grade = RDOM (rushing dominator), YPA, MTF/A, YCO/A | Archetype (Dual Threat, Mobile Passer, Pocket Passer, Distributor, Game Manager, Run First), Build (Golden Boy, Scooter, Mid Size, Tank, Little Guy) | Sam Leavitt card, X 2082575892342243478 |

Component definitions that were stated:
- **Separation score** `[S]`: "It's a combination of YPRR, Contested/Uncontested Target % and Contested/Uncontested Targets per Route Run" (X 2021591668693045755). Marsh's 98th percentile separation is backed by "Contested Targets per Route Run below 4% and Uncontested Targets per RR above 22%" (X 2092720657603907742). Added Feb 2026.
- **Ball Skills** `[S]` added Feb 2026 (X 2019898563535552871). Inputs not published; contested catch rate clearly feeds it: "His 91st Percentile Ball Skills is thanks to his 53.3% Contested Catch Rate" (X 2087232075178872931).
- **HaSS** = height-adjusted speed score, "High adjusted size speed 10 out of 10" (S-XZuFrvXMI). `[I]` Probably the standard Siegele formula (Speed Score times a height factor); Ryan quoted a raw HaSS of 117.03 for Dont'e Thornton (X 1878880205621620947).
- **Dominator / yards share** `[S]`: RB cards cite "+20% Offensive Yards Share (incl. 5% of Receiving Yardage)" and "+30% game adjusted Yards Share"; WR cards cite "28% Adjusted Yards Share" and "Dominator Rating above 20%" (X 2079983346650587433, 2082168749579190556, 2088330428369256545, 2093059990994956526).
- **Percentile base** `[S]`: stats are compared against prospects "since 2015" (e.g., "YAC/R is in the 3rd Percentile of WRs since 2015 (670th/700)", X 2087232075178872931). Older videos said the WR database started in 2017 with 506 WRs (S-XZuFrvXMI).

Earlier (Feb 2025) version, per the hosts: Dominator rating ("all production based"), breakout age, efficiency (YPRR, "YAC per route"), 40 time, "High adjusted size speed", draft capital; for RB "Dominator rating is a seven, the receiving Dominator is a nine ... the breakout like Nathan mentioned is a 10" (S-XZuFrvXMI). Separation and Ball Skills are the "two new metrics" added later (X 2089683860409729332).

### 2.2 How the hosts describe the weighting
- `[S]` "40 time is really important. Size and ... height and weight is very important. Like it's all weighted but not as much as production. Production is always king" (WrWwqI-AHjc).
- `[S]` Early and consistent breakout is rewarded, late breakout is punished hard: "the bakery is very friendly to players that break out earlier than what's normal and are consistent" (Devin Neal); "there is a reason that the bakery ranks the breakout players who broke out their fourth year so low ... the hit rate is pretty much zero" (Brashard Smith, RJ Harvey) (S-XZuFrvXMI).
- `[S]` Early declare helps: Kaleb Johnson "ranked over TreVeyon Henderson even with going later ... because he was an early declare. He was an early breakout. He had a top-notch dominator rating" (mSwF-WTnnz0).
- `[S]` Age: Ryan's 2023 "Ageism" thread: WRs drafted at 23+ since 2017 hit 7 of 40 (17.5%) (X 1628542542554832898). Hosts on 25-year-old RBs: "their ceiling is just going to be capped because of that the analytics the age" (DYKsOZo9Y7Q).
- `[S]` Missing combine numbers are filled with guesses: Sarratt "We have him written in there as a 4.6 flat" (WrWwqI-AHjc); Neal "we have him down for a 4.5 ... being conservative" (S-XZuFrvXMI).
- `[I]` The history sheets include a "Conf Rk" column (1 to 11). Likely a conference-strength or schedule input, but never explained.

### 2.3 Draft capital: before and after the draft
- `[S]` Pre-draft DC comes from mocks (TheAthletic 7-round mock in 2024, @_mockdrafts in 2026) and is "approximated conservatively until we have official numbers" (X 1894841941986287779). Hosts: "we're going to always favor the conservative side of draft capital projection" (S-XZuFrvXMI).
- `[S]` Post-draft the actual pick replaces it and the Bakery is re-published ("Another NFL Draft has come and gone and with that comes an updated Bakery!", X 2048434996147368242). Hosts: "This is late first round or mid first round draft capital included, he still grades out as the highest wide receiver" (Lemon, J0GUfLrB4d4).
- `[S]` A grade can be computed with zero draft capital: Thornton "WR10 in The Bakery with 0 Draft Capital" (X 1883991303895351371).
- `[S]` Each card also shows a **Pre-Draft Score** and a **Pre-Draft Grade expressed as a draft round** (Marsh 9.14 -> "1st Round"; Jamari Johnson 10.16 -> "2nd Round"; Keyjuan Brown 7.58 -> "3rd Round"; Leavitt 5.38 -> "2nd Round"). Ryan talks in these terms: "TheBakery has a 1st Round Grade on Arch and 3rd Round Grade on Sorsby" (X 2062212378809282681), and Tate is "analytically ... a late 2nd/early 3rd round contested catch WR" (X 2008625469223002504).
  - `[I]` The Pre-Draft Score is the talent-only score (no DC), and the Pre-Draft Grade maps it to the round a player "deserves". The main Grade then adds the DC term. That is also how they flag reaches: Stribling and Brenen Thompson were "among the biggest reaches in this draft compared to Pre Draft Bakery Grades" (X 2050622555346583841).
- `[S]` Sensitivity differs by player: Neal is "RB6 with fourth round draft Capital ... second round ... RB5 ... fifth round ... RB9"; Trey Harris "has pretty much a buffer of like three different tiers ... pending draft Capital" (S-XZuFrvXMI). Heidenreich: "draft capital tbd and is a GIANT factor in his profile" (X 2027909753406443603).
- `[S]` There is also an **Adjusted Bakery Grade** for landing spot, described as "basic": "Following the AJ Brown trade, Makai Lemon is back to WR1 for 2026 based on Adjusted Bakery Grade" (X 2061564189265605042). The base grade stays landing-spot agnostic.

**Observed pre-draft (projected DC) to post-draft (actual DC) moves, 2026 class** `[I]` computed from Ryan's Apr 6 RB and Apr 10 WR charts vs the Apr 26 post-draft table:

| Player | Pre-draft grade (tier) | Post-draft grade (tier) | Change | Actual pick |
|---|---|---|---|---|
| Jadarian Price RB | 10.19 (Upside) | 10.92 (Elite Upside) | +0.73 | 32nd overall |
| Carnell Tate WR | 11.50 (Elite Lite) | 11.59 (Elite Lite) | +0.09 | 4th overall |
| Jordyn Tyson WR | 11.42 (Elite Upside) | 11.47 (Elite Upside) | +0.05 | Rd 1 |
| Makai Lemon WR | 11.67 | 11.67 | 0 | ~20th |
| KC Concepcion WR | 10.89 | 10.89 | 0 | Rd 1 |
| Omar Cooper WR | 10.93 | 10.79 | -0.14 | Rd 1 (trade up) |
| Chris Brazzell WR | 10.27 | 10.13 | -0.14 | Day 2 |
| Antonio Williams WR | 10.22 | 10.08 | -0.14 | Rd 3 |
| Denzel Boston WR | 10.53 | 10.32 | -0.21 | Early Rd 2 |
| Jonah Coleman RB | 9.59 | 9.32 | -0.27 | Early Rd 4 |
| Chris Bell WR | 10.32 | 10.03 | -0.29 | Rd 3 |
| Elijah Sarratt WR | 9.98 (Upside) | 9.16 (Upside Lite) | -0.82 | Rd 4 |

`[I]` Rough rule: about 0.7 to 0.8 grade points per round of DC surprise in rounds 1 to 4. Tate is the cleanest DC example: his talent-only read was a late 2nd/early 3rd, yet with a top-5 pick his grade sits in Elite Lite. Ryan still ranks him "11th of 17 WRs taken Top10 since 2015" (X 2062236768876048796).

---

## 3. Outputs, scale, tiers, cutoffs, hit rates

### 3.1 Fields on every player `[S]` (report cards + tables)
- **Grade**: position-specific score. Observed range about 2.8 to 15.3 (Bijan 15.17, Jayden Daniels QB 15.28, Brock Bowers TE 15.12, MHJ WR 12.79 to 13.00; worst listed 2025 RB 2.81).
- **Overall**: `[I]` percentile within the position's database. Keyjuan Brown is RB87 at 77.30 (about 380 RBs); Marsh is WR24 at 96.50 (about 690 WRs, which matches "670th/700").
- **Z-Score**: used for cross-position boards: "Combined Top48 Rankings based on Z-Scores" (X 2014429287172956416). `[I]` It is position-normalized: WR MHJ 13.00 and RB Love 15.11 both land near 1.72 to 1.73.
- **Class Tier**: 1 to 14 within a draft class, cross-position (post-draft table). `[I]` Gap-based clustering on z-score.
- **Tier** (position tier) with its **Tier Hit Rate** printed next to it.
- **Statistical Comps**: nearest profiles (Marsh: Nabers, Amari Cooper, Jefferson, London, Cam Coleman, Olave). `[I]` The number next to each comp is that comp's own Overall percentile, not a similarity score (Javonte Williams shows 95.30 in both of Keyjuan's comp lists).
- **Archetype Comps**: High, Mid and Low end players sharing the same Build + Archetype (Keyjuan, BELL CALF + 3DOWN: high end Javonte Williams, Kareem Hunt; low end Frank Gore Jr.).
- **Radar chart** of the component grades.
- **Letter grades** `[I]` map roughly 0 F, 1 D, 2 D+, 3 C-, 4 C, 5 C+, 6 B-, 7 B, 8 B+, 9 A (sometimes B+), 10 A+. `[I]` Component grades look like percentile deciles (10 = top decile).

### 3.2 Tier ladder `[S]` with colors
| # | Name | Color |
|---|---|---|
| 1 | Cornerstone | purple |
| 2 | Elite (WR split into "Elite+" and "Elite Lite" by Feb 2026) | blue / light blue |
| 3 | Elite Upside | green |
| 4 | Upside | yellow |
| 5 | Upside Lite | orange/peach |
| 6 | Outlier | pink |
| 7-8 | unnamed ("purgatory", "0% hit rates" per hosts) | greys |

Sources: X 1998860521228181952 to 1998860542627156189 (tier names 1-4), Apr 2026 charts (Upside Lite, Outlier, Elite+, Elite Lite), hosts: "the revered purple tier" (4w8QYgX0gUs), "the top of that upside tier, that yellow tier" (J0GUfLrB4d4), Price "in now that greens tier" = "elite upside tier" (oxg8bYwAZWw; transcript-rookie-rankings-2026.txt), Claiborne "in purgatory" (oxg8bYwAZWw). Hosts also say tiers form "pretty much automatically based on how close they are and the gaps between" scores (S-XZuFrvXMI). `[I]` In the published sheets the tiers behave like fixed grade bands per model version.

### 3.3 Observed grade cutoffs `[I]` (read off the sheets; they shift between versions)
| Position | Cornerstone | Elite | Elite Upside | Upside | Upside Lite | Outlier |
|---|---|---|---|---|---|---|
| WR, Dec 2025 | >= 12.51 | 12.02 to 12.25 | 11.04 to 11.96 | top 10.90 | | |
| WR, Apr 2026 | 12.81 to 13.00 | Elite+ 12.16 to 12.47; Elite Lite 11.50 to 11.84 | 11.29 to 11.47 | 9.72 to 10.93 | 8.69 to 9.37 | |
| RB, Dec 2025 | >= 13.14 | 12.12 to 12.96 | 11.02 to 11.91 | top 10.91 | | |
| RB, Apr 2026 | 14.52 to 15.11 | 12.34 to 12.48 | 10.92 to 11.98 | 9.32 to 10.29 | 7.02 to 8.88 (8.92 on a Jul card) | 6.35 to 6.92 |
| TE, Dec 2025 | >= 15.00 | 14.04 (Hockenson only) | 11.26 to 13.88 | top 10.94 | (Joly 8.98 in Apr 2026) | |
| QB, Dec 2025 | >= 13.34 | 11.64 to 12.85 | 9.98 to 11.22 | top 9.46 | (Allar 5.97 in Apr 2026) | |

Position scales are not comparable: Mendoza, the 1st overall pick, is only 10.34 yet Elite Upside; Sadiq TE is 12.22 and also only Elite Upside.

### 3.4 Official tier hit rates (Dec 2025 introduction thread) `[S]`
"Hit" = at least one season at that finish level (`[I]` presumably top-12/24/36 for WR1/2/3 and RB1/2/3; TE uses Top 4, Top 6, TE1; QB uses QB1). Source: X 1998860521228181952 to 1998860542627156189 and attached tables.

| Tier | WR1 | WR2 | WR3 | RB1 | RB2 | RB3 | TE Top4 | TE Top6 | TE1 | QB1 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 Cornerstone | 5/6 83% | 5/6 83% | 6/6 100% | 6/6 100% | 6/6 | 6/6 | 1/2 50% | 2/2 | 2/2 | 2/2 100% |
| 2 Elite | 5/5 100% | 5/5 | 5/5 | 7/7 100% | 7/7 | 7/7 | 1/1 | 1/1 | 1/1 | 7/7 100% |
| 3 Elite Upside | 9/23 39% | 16/23 70% | 19/23 83% | 3/8 38% | 6/8 75% | 6/8 75% | 5/14 36% | 6/14 43% | 12/14 86% | 11/16 69% |
| 4 Upside | 7/36 19% | 10/36 28% | 18/36 50% | 13/40 33% | 24/40 60% | 31/40 78% | 1/25 4% | 1/25 4% | 6/25 24% | 4/19 21% |
| 5 Upside Lite | 6/72 8% | 11/72 15% | 14/72 19% | 4/47 9% | 9/47 19% | 15/47 32% | 0/16 | 2/16 13% | 3/16 19% | 0/23 |
| 6 Outlier | 1/67 1% | 2/67 3% | 5/67 7% | 2/42 5% | 5/42 12% | 9/42 21% | 0/34 | 0/34 | 0/34 | 0/26 |
| 7 | 0/80 | 0/80 | 3/80 4% | 1/35 3% | 4/35 11% | 6/35 17% | 0/23 | 0/23 | 0/23 | 0/24 |
| 8 | 1/195 1% | 3/195 2% | 3/195 2% | 1/78 1% | 5/78 6% | 9/78 12% | 1/56 2% | 1/56 | 1/56 | 0/32 |

Ryan's summary: after Elite Upside "we hit the WR Cliff as we've moved out of the talented 1st Rounders into the over-drafted WRs and elite mid/late round prospects (s/o ARSB & Puka)"; the QB Upside tier "is full of over-drafted developmental failures (Paxton Lynch and AR) and late round QBs that far exceeded expectations (s/o Purdy & Dak)".

Later versions print slightly different rates on the cards (Jul-Aug 2026): Elite Lite WR 62.5% WR1 / 75% WR2 / 75% WR3; Upside Lite RB 5.66% / 18.87% / 32.08%; Elite Upside TE 20% Top4 / 30% Top6 / 80% TE1; Upside QB1 31.82% (cards cited in 2.1).

### 3.5 Tier x draft round hit rates quoted in 2026 videos `[S]` (the "rookie draft analyzer")
- Elite Lite WRs taken in round 1: "you've seen six of them, five of them have been wide receiver twos and three of them have been wide receiver ones ... a 50% wide receiver one rate for elite light versus a 25% ... for elite upside" (J0GUfLrB4d4). A March version: "only been eight guys ... Four of them have been wide receiver ones, six ... twos and threes" (WrWwqI-AHjc).
- Elite Upside WRs: "nine out of 12 guys have been wide receiver threes. Seven ... twos and three ... wide receiver 1" (J0GUfLrB4d4).
- Upside tier, round-3 WRs: "there's been nine of them ... four of them have been wide receiver threes, three of them wide receiver twos, and two of them wide receiver ones" (J0GUfLrB4d4).
- Upside Lite, round-4 WRs: "There's been 14 of them and approximately none of them have hit. There's been one wide receiver [three] season" (J0GUfLrB4d4).
- Upside tier, round 3 or 4 RBs: "there's been eight of them ... three ... running back threes, two ... twos, and one ... running back one season" (oxg8bYwAZWw).
- Upside tier, round-5 RBs: "There's been 15 ... Five ... running back three ... Four ... running back two and two ... running back one" (oxg8bYwAZWw).
- Elite Upside TEs taken in round 2: "none of them have been top six tight ends ... but three out of five of them have had tight end one seasons" (transcript-rookie-rankings-2026.txt).
- Elite Upside RB with round-1 capital: only Josh Jacobs, "an extremely small sample size" (transcript-rookie-rankings-2026.txt).

2025 videos used an older model and older tiers: WR green tier 88% WR3 / 81% WR2 / 31% WR1 and "100% in both the top two tiers"; WR yellow 43% / 20% / 17%; Jack Bech's tier 29% / 24% / 12% (Y038jwveVMU). RB third tier "89% running back three, 89% running back two, and 50% running back one"; yellow RB tier 87% / 61% / 40%; Hampton's blue tier "a 100% hit rate from a value perspective" (mSwF-WTnnz0). Savion Williams' 2025 tier 7 hit rate "dating back to the 2017 class is 7%" (X 1892657872527327499).

---

## 4. Every player with a Bakery grade or tier I could find

### 4.1 2026 class
Post-draft grades are from Ryan's official post-draft table (X 2048434996147368242) unless noted. "Pre" = pre-draft chart (Apr 6 RB, Apr 10 WR).

| Player | Pos | Grade / tier | Rank | Comps and notes | Source |
|---|---|---|---|---|---|
| Jeremiyah Love | RB | 15.11 Cornerstone (Jan: 14.41) | RB1, #1 overall | "the second highest ... in the bakery ever" behind Bijan; purple tier with Bijan, Gurley, Jeanty, Barkley, Gibbs, Elliott, CMC | DYKsOZo9Y7Q; 4w8QYgX0gUs; oxg8bYwAZWw |
| Makai Lemon | WR | 11.67 Elite Lite; Adjusted 12.50 after AJ Brown trade | WR1, #2 | "grades out as the highest bakery score in the class"; profile-adjacent to Burden, Pickens, Egbuka; RP 75th man / 79th zone / 60th press; ceiling comp Amon-Ra (film) | J0GUfLrB4d4; WrWwqI-AHjc; m0m-HCp3Gkg; X 2061564189265605042 |
| Carnell Tate | WR | 11.59 Elite Lite (Jan 11.22 Elite Upside) | WR2, #3 | "his analytical profile is not that of a typical top five wide receiver"; slow small X: "there's nobody there"; talent-only read late 2nd/early 3rd; 11th of 17 top-10 WRs since 2015 | WrWwqI-AHjc; X 2008625469223002504, 2062236768876048796 |
| Jordyn Tyson | WR | 11.47 Elite Upside (Feb 11.61 Elite Lite, Jan 11.86) | WR3, #4 | early blue tier "by guys like Garrett Wilson, AJ Brown, Drake London, JSN"; 80+ Separation and 80+ Ball Skills with Lemon | 4w8QYgX0gUs; J0GUfLrB4d4; X 2021354148235706474 |
| Kenyon Sadiq | TE | 12.22 Elite Upside | TE1, #5 | post-combine "blue tier ... with Evan Engram and Njoku, Warren, LaPorta, Loveland, McBride, and Fant" | WrWwqI-AHjc |
| KC Concepcion | WR | 10.89 Upside | WR4, #6 | top of Upside, "pretty close to getting up a tier"; pre-draft green, ahead of Tate; RP 92nd man / 81st zone / 87th press; "analytically ... a better prospect than Pearsall" | J0GUfLrB4d4; WrWwqI-AHjc; m0m-HCp3Gkg; kC9PxBi7-RU |
| Omar Cooper Jr. | WR | 10.79 Upside | WR5, #7 | "separated by a tenth of a point" from Concepcion; needed a 4.41 for green, ran 4.42 | J0GUfLrB4d4; WrWwqI-AHjc |
| Jadarian Price | RB | 10.92 Elite Upside (pre 10.19 Upside) | RB2, #8 | "comps to like a Josh Jacobs"; "good, not great" | oxg8bYwAZWw; transcript-rookie-rankings-2026.txt |
| Fernando Mendoza | QB | 10.34 Elite Upside | QB1, #9 | preseason QB Bakery v1.0 #1, "a clear tier above everybody" | 4w8QYgX0gUs |
| Max Klare | TE | 11.90 Elite Upside | TE2, #10 | "ahead of Eli Stowers from a bakery analytics standpoint" | transcript-rookie-rankings-2026.txt |
| Denzel Boston | WR | 10.32 Upside | WR6, #11 | "about 4/10ths of a point behind Omar Cooper"; early green tier above Tate | J0GUfLrB4d4; 4w8QYgX0gUs |
| Eli Stowers | TE | 11.59 Elite Upside | TE3, #12 | the only green TE in the Sep 2025 look | 4w8QYgX0gUs |
| Chris Brazzell II | WR | 10.13 Upside | WR7 | "very good analytical profile"; graded above Antonio Williams | J0GUfLrB4d4; WrWwqI-AHjc |
| Antonio Williams | WR | 10.08 Upside | WR8 | the round-3 Upside cohort above; flagged on Ryan's Separation vs Ball Skills chart | J0GUfLrB4d4; X 2070514417934926094 |
| Chris Bell | WR | 10.03 Upside | WR9 | "so much noise in his analytical profile" (ACL year) | DYKsOZo9Y7Q |
| Germie Bernard | WR | 9.72 Upside | WR10 | lower than Bell and Williams even with round-2 capital; earlier in "orange tier down with Jacobe Lane, Ted Hurst and Bryce Lance" | J0GUfLrB4d4; WrWwqI-AHjc |
| Ty Simpson | QB | 7.67 Upside | QB2 | "The tier he is in ... (yellow) has a QB1 hit rate of 21%" | X 1997494602190741858 |
| Ja'Kobi Lane | WR | 9.37 Upside Lite | WR11 | "a Jalen Hyatt and he's not as good as Jalen Hyatt was as a prospect" | WrWwqI-AHjc |
| Caleb Douglas | WR | 9.26 Upside Lite | WR12 | | |
| Jonah Coleman | RB | 9.32 Upside (pre 9.59) | RB3 | "fifth highest graded day three running back in the bakery"; top day-3 RBs ever: Skattebo, Braelon Allen, Bucky Irving, Bhayshul Tuten, Coleman | oxg8bYwAZWw |
| Eli Raridon | TE | 9.02 Upside | TE4 | | |
| Justin Joly | TE | 8.98 Upside Lite | TE5 | | |
| Elijah Sarratt | WR | 9.16 Upside Lite (pre 9.98 Upside) | WR13 | "technically a poor separator according to the bakery"; RP 17th man / 14th press; Keenan Allen / Michael Pittman comps (film) | m0m-HCp3Gkg; J0GUfLrB4d4 |
| Drew Allar | QB | 5.97 Upside Lite | QB3 | | |
| Nicholas Singleton | RB | pre 8.53 Upside Lite; post "round five upside tier" | RB4 | fifth highest 5th-round RB; Giddens, Aaron Jones, Jordan Howard above; Chase Brown just below | oxg8bYwAZWw |
| Emmett Johnson | RB | pre 8.35 Upside Lite | | "Analytically, it ain't anything pretty" | oxg8bYwAZWw |
| Mike Washington | RB | pre 8.69 Upside Lite; orange tier | | "athleticism is eye popping 100th percentile" but profile "not great" | WrWwqI-AHjc |
| Kaytron Allen | RB | pre 7.63 Upside Lite | | "bottom of that orange tier below Mike Washington" | oxg8bYwAZWw |
| Kaelon Black | RB | small tier | | only other round-3 RBs in his tier: Alexander Mattison, Darren Evans | oxg8bYwAZWw |
| Desmond Reid | RB | pre 6.63 Outlier | | "Love his analytics. He's so small" | WrWwqI-AHjc |
| Eli Heidenreich | RB | pre 6.45 Outlier as RB; RB8 with 6th-round DC | | "graded out much better as a wide receiver than he did a running back" | m0m-HCp3Gkg; oxg8bYwAZWw |
| Demond Claiborne | RB | purgatory | | "when you're looking at his bakery score, he's in purgatory" | oxg8bYwAZWw |
| Ted Hurst | WR | pre 8.71 Upside Lite | | non-D1: "you kind of have to throw the analytics out the window" | WrWwqI-AHjc |
| De'Zhaun Stribling | WR | bottom of an "abysmal" tier despite pick 33 | | one of the "biggest reaches" vs pre-draft grade | transcript-rookie-rankings-2026.txt; X 2050622555346583841 |
| Malachi Fields | WR | very low | | "second lowest bakery grade with second round draft capital ever" (projected) | WrWwqI-AHjc |
| Zachariah Branch | WR | low tier | | Stribling "just made it into that tier above where Branch is" | J0GUfLrB4d4 |
| Deion Burks | WR | very low | | "His analytical profile is in the dirt" | WrWwqI-AHjc |
| Terion Stewart | RB | with top-4-round DC, just behind the Washington/Singleton/Johnson/Allen tier | | Kaelon Black and Seth McGowan "in the same analytical tier" | DYKsOZo9Y7Q |
| Trinidad Chambliss | QB | Jan: class tier 5 | | Build "Little Guy ... not a category with a lot of success" | X 2033590300489216482, 2084126128533381498 |

Ryan's pre-draft ideal round 1, "Factoring in Expected Pick Ranges/Positional Value and 'Break Even' Hit Rates": Love, Lemon, Tate, Mendoza, Tyson, Sadiq, Cooper, Concepcion, Stowers, Price, Boston, Bell (X 2043803621188383219).

### 4.2 2025 class (and grade drift across versions)
| Player | Pos | Grades seen | Notes | Source |
|---|---|---|---|---|
| Ashton Jeanty | RB | 14.28 (Apr 25) -> 14.39 (Dec) -> 14.52 (Apr 26), Cornerstone | "second overall prospect in the bakery of all time", above Saquon at the time | mSwF-WTnnz0 |
| Omarion Hampton | RB | 12.57 -> 12.79 -> 12.48, Elite | blue tier with JT, Gibbs, Etienne, "100% hit rate from a value perspective" | mSwF-WTnnz0 |
| TreVeyon Henderson | RB | 11.37 -> 11.65 -> 12.34 | | |
| Kaleb Johnson | RB | 11.38 -> 11.47 -> 11.24 | early declare, early breakout; "the biggest like disappointment so far" in his tier | mSwF-WTnnz0; 4w8QYgX0gUs |
| Quinshon Judkins | RB | 10.42 -> 11.53 -> 11.98 | "analytical profile leaves a little bit to be desired" (2025) | mSwF-WTnnz0 |
| Cam Skattebo, Bhayshul Tuten | RB | 9.57 and 9.68 -> 10.29 and 9.81 | "the highest graded fourth round running backs in the bakery ever" | mSwF-WTnnz0 |
| Jacory Croskey-Merritt | RB | 6.36 (Apr 25) -> 9.57 Upside (Apr 26) | biggest retune I found; RBs under 5% receiving yards share since 2015 are "bleak" | X 1948759769629540434 |
| Woody Marks | RB | 6.05 -> 7.02 | "last in the bakery" among drafted RBs; of 39 in his tier only Kyren Williams hit | mSwF-WTnnz0; S-XZuFrvXMI |
| Devin Neal | RB | 7.99 -> 8.88 | Dominator 7, Receiving Dominator 9, Breakout 10; barely moves with DC | S-XZuFrvXMI |
| Brashard Smith | RB | 5.08 | 4th-year breakout; "RB23 in this stacked class" | X 1882155348078788846 |
| Tetairoa McMillan | WR | 11.57 to 11.78, Elite Upside / Elite Lite | pre-draft top-10 all-time with projected DC: "Dominator rating ... 10 out of 10 ... breakout age is fine the efficiency is average ... High adjusted size speed 10 out of 10"; post-draft green tier | S-XZuFrvXMI; Y038jwveVMU |
| Emeka Egbuka, Luther Burden | WR | 11.22 to 11.68, 11.33 to 11.58 | Burden "dropped" a tier with round-2 capital | Y038jwveVMU |
| Travis Hunter | WR | 11.07 to 11.29 | post-draft WR2 in a 16% WR1 tier, later WR4 in a 31% tier after two new metrics | X 2089683860409729332 |
| Matthew Golden | WR | 10.00 Upside | "never had a 1st Round Pick worthy profile analytically" | X 2002773146688995769 |
| Jack Bech | WR | WR17 with round-2 DC | tier with Roman Wilson, Polk, Trey Palmer; 12% WR1 | Y038jwveVMU |
| Dont'e Thornton | WR | 8.69 Upside Lite | "WR10 ... with 0 Draft Capital"; round-2 DC would have put him in green | X 1883991303895351371; Y038jwveVMU |
| Xavier Restrepo | WR | capped | "the highest he can get ... is the wide receiver 16" even with round-2 DC and a 4.41 | S-XZuFrvXMI |
| Jaxson Dart | QB | 12.45 Elite | | X 2017361818050576623 |

### 4.3 All-time anchors (Dec 2025 sheets) `[S]`
- WR Cornerstone: MHJ 12.79, Chase 12.77, Nabers 12.67, Jefferson 12.61, Amari Cooper 12.53, Lamb 12.51. Elite: JSN 12.25, London 12.22, DJ Moore 12.22, AJ Brown 12.19, Garrett Wilson 12.02.
- RB Cornerstone: Bijan 15.17, Gurley 14.39, Jeanty 14.39, Barkley 14.38, Gibbs 13.98, Elliott 13.94, CMC 13.14.
- TE Cornerstone: Bowers 15.12, Pitts 15.00. Elite: Hockenson 14.04.
- QB Cornerstone: Jayden Daniels 15.28, Burrow 13.34. Elite: Lawrence, Mayfield, Dart, Maye, Murray, Caleb Williams, Fields, Tua.
- 2027 preseason: Jeremiah Smith is "the best WR in the history of TheBakery. He's the best PROSPECT in the history of TheBakery" (X 2093449739081818369); Dante Moore is "TheBakery's QB1 for 2027 and the 12th highest graded QB Prospect since 2015" (X 2091991277533298906); Nick Marsh 11.71 Elite Lite with a 98th percentile separation score (X 2092720657603907742).

---

## 5. Position differences

- **WR** `[S]`: the most trusted model. "Wide receivers you can nail down a little bit more of a science than you can with running backs" (S-XZuFrvXMI). Seven components, including the only two custom composites (Separation, Ball Skills). Archetypes (PROTO X, PROTO Z, BALL HOG, RAT, SLOB) and separator labels are used as filters ("prototypical X's in the bakery that have run that slow and been that small, there's nobody there", WrWwqI-AHjc). Hit rates fall off a cliff after Elite Upside.
- **RB** `[S]`: "less of an exact science. Running backs are ... a lot harder to actually nail down" (S-XZuFrvXMI). Weighted toward rushing efficiency (MTF/A, YCO/A, YPC, Elusiveness) plus two production shares and breakout age. Widest grade range. Unlike WR, tier 4 (Upside) still hits 33% RB1 / 60% RB2, so the hosts keep preferring day-3 RBs over day-2/3 WRs late in rookie drafts ("we're almost always going to give the nod to running backs over wide receivers in this range", DYKsOZo9Y7Q).
- **TE** `[S]`: six components (no separation or ball skills; adds Y/REC). Hit ladder is Top 4 / Top 6 / TE1. Cliff after Elite Upside (tier 4 TE1 rate 24%). The hosts add a market rule on top: first- and second-round TEs "hold their value well" year one to year two (DYKsOZo9Y7Q; kC9PxBi7-RU).
- **QB** `[S]`: separate pass and rush sub-grades built from PFF-style advanced metrics, v1.0 only since fall 2025. Grades run lower than other positions. Top three tiers hit QB1 at 69 to 100%, Upside 21%. Hosts: "the dynasty community has shown time and time again ... that we really aren't very good at evaluating quarterbacks" (DYKsOZo9Y7Q).
- **Cross-position** `[S]`: combined boards use z-scores ("Combined Top48 Rankings based on Z-Scores") plus a Class Tier column.

---

## 6. What it gets wrong, and its stated limits

Stated by Dynasty Domain or Ryan:
1. **Not gospel, no film.** "I'm not a computer, nor am I perfect, so you won't see me refer to this as gospel" (X 1998860545936732265). "Numbers do sometimes lie ... Caleb Johnson, Ashton Jeanty mathematically they're in the same tier. They're clearly not" (S-XZuFrvXMI).
2. **Context blindness.** Cooper "is being drug down analytically because he was poor from a production perspective under the Tom Allen era" (WrWwqI-AHjc). Price had "such little sample size ... he the backup running back to Jeremiah Love" (oxg8bYwAZWw). Hurst: "throw the analytics out the window ... he wasn't even playing D1 football" (WrWwqI-AHjc). Heidenreich's split WR/RB role "capped the ceiling of both" (WrWwqI-AHjc). Bell: "so much noise in his analytical profile" from the injury year (DYKsOZo9Y7Q). Separation scores are "low due to their usage in CFB" for some players (X 2021591668693045755).
3. **Draft-capital dependence.** Pre-draft grades can swing three tiers on DC alone (Trey Harris, S-XZuFrvXMI). Ryan argues against DC-heavy "predictive" models ("At that point, just draft players in the order they were taken", X 2062230838209819039) while admitting the Bakery "weighs draft capital decently heavily" (X 2062236768876048796). He also wrote "Organization/Landing Spot > Draft Capital" after missing Jalen McMillan over Ja'Lynn Polk (X 1876006148727517530).
4. **The NFL disagreed a lot in 2026.** "The NFL is drafting these guys like they know something. The bakery or any of our models ... is saying something different on a very large number of these guys" (J0GUfLrB4d4). Hosts bet against their own model on Tate: "We're going to say we think we know better than the analytics at this point" (WrWwqI-AHjc).
5. **Small tier samples.** TE Cornerstone n=2, TE Elite n=1 (Hockenson), RB tier 3 n=8, Price's cohort n=1 (Josh Jacobs), Kaelon Black n=2. Elite Lite is "kind of a little baby tier" (WrWwqI-AHjc).
6. **Model churn.** Grades change between versions (Croskey-Merritt 6.36 -> 9.57, Judkins 10.42 -> 11.98, Love 14.41 -> 15.11). "Brillan Allen and Bucky Irving now are moved up a little bit with some tweaks we made to the bakery" (oxg8bYwAZWw). Hunter moved tiers when "I've added two new metrics" (X 2089683860409729332).
7. **Missing inputs are guessed.** 40 times for non-runners are filled in (Sarratt 4.60, Restrepo 4.45, Neal 4.5).
8. **Composite metrics are not predictive alone.** Ball Skills: "Jack Bech, N'Keal Harry, Pat Bryant and Isaac TeSlaa all have 95+ Percentile Ball Skills and aren't productive. Ladd McConkey and Brandon Aiyuk are both sub-40th Percentile" (X 2070563843240022297).
9. **Visible misses they acknowledge.** Kaleb Johnson (green tier, "the biggest disappointment so far"), Cornerstone MHJ ("83% WR1 Rate (cmon MHJ)"), Chris Olave "technically ... not hit yet" in the old blue tier (S-XZuFrvXMI).

My inferences:
- `[I]` **The hit rates are in-sample.** The tiers and hit tables are built on the same history the weights are tuned on, and the weights keep being retuned after outcomes arrive. Treat the printed percentages as optimistic.
- `[I]` **Survivorship in "hit" counting.** Recent classes (2024, 2025) are included in totals before they have had time to hit; the QB table shows a separate "w/o 2024" column, which confirms this is a known issue.
- `[I]` **Scale drift across positions.** Grades are only comparable within a position and version; cross-position use needs the z-score.
- `[I]` **Landing spot is kept out on purpose**, so the grade alone is a talent prior, not a dynasty value.

---

## 7. Dynasty Domain's own draft-capital priors (separate from the Bakery) `[S]`
Useful as fallbacks when a player lacks a Bakery-style grade.
- Top-10 NFL pick RBs: "absolutely sky-high. I don't ever think there has been one that has missed" (transcript-rookie-rankings-2026.txt).
- Round-1 RBs picked 11 to 32 over the last 5-6 classes (Etienne, Najee Harris, Gibbs, CEH, Hampton): all startable, 3 of 4 elite at some point (same source).
- WRs keeping or gaining dynasty value from year 1 to year 2: round 1 "somewhere in the ... 70 to 80% range", round 2 "down to like the 30s" (DYKsOZo9Y7Q).
- Round-2 WRs taken 1.11 to 2.12 in rookie drafts: "seven out of 18 of these guys have been startable" (transcript-rookie-rankings-2026.txt).
- Round-3 WRs taken 1.01 to 2.12 since 2020: 8 total, "one of them has ever been startable and it's been Josh Downs" (same source).
- Round-2 TEs who went in the 2nd round of rookie drafts: Mayer, McBride, LaPorta, Mason Taylor, two of them elite (same source).
- Pick hit rates: "your mid first being about a 50-50 hit rate ... early first if they're not a running back, not even ... upwards of 80%" (ZK5VpWQQveE).
- Class strength via Bakery scores: 2026 top 3 ranked 10th since 2015, top 6 11th, top 12 9th, top 24/36/48 10th (WrWwqI-AHjc); post-draft "probably analytically the worst class on paper ... in the last 10 years" (transcript-rookie-rankings-2026.txt). 2025 WRs had "nobody in the top two tiers" (Y038jwveVMU).

---

## 8. Other prospect-modeling claims from the non-Dynasty-Domain transcripts
- **JJ Zachariason's ZAP model** (Q_K7MUGcWZo): target is B2S, "the first 3 years of a player's NFL career ... the best two seasons in PPR points per game, averages those together"; sample = RB/WR/TE who went to the combine or were drafted since 2011; uses draft capital "as sort of a baseline" and tells you "when to stray away"; labels the top and bottom ~15% vs draft slot as low-risk / high-risk. WR **breakout score** = "age and schedule adjusted receiving yards per team pass attempt", prorated, minimum six games, "just as predictive for top 100 picks as draft capital itself"; day 3 is "the wild west". Early declares get a bump. TE model = "draft capital, athleticism, and age adjusted production". RB model "is very receiving base[d]"; reception share gains signal only when layered on draft capital. Hunter Henry vs Michael Mayer: same slot and production, Mayer more athletic, model still prefers Henry because DC captures information the stats miss. He tests only players with 3 NFL seasons, and says straying from the model "75% of the time it burns me".
- **Strength of schedule and age**: "it's not very fair to compare Bryce Lance's career yards per route run ... at a smaller school when he's 24 years old versus Casey Concepcion" (Q_K7MUGcWZo).
- **Ethan Gilworth's WR model**: two of the most important NFL predictors are a "catching composite score and best two seasons contested catch rate"; data since 2017 (9PIPsiPe_-A).
- **TE breakout age**: only Bowers and Fannin broke out at 19; Pitts and Loveland at 20 (wQaC75xPEgo).
- **RB BMI**: backs under about 27 BMI since 2000 have hit only as Chris Johnson and CJ Spiller (per Brian Heath, cited in `_beyond_box_score_rookie_rankings.md`).
- **Reception Perception thresholds**: WRs who clear success-rate bars vs man, zone and press are the ones who reach 25 to 30% target shares (KZhFFaliZCA; RmqQlGSHsHI).
- **Low-volume YPRR is inflated**: Dynasty Domain on Luther Burden, "Luther Burden had 60 targets in his first year ... do it on that target volume and then come back" (Ve5iZKAjn4Y).

---

## 9. Rebuild blueprint for our app `[I]` (all inference)
1. **Data**: college seasons since 2015 for QB/RB/WR/TE (PFF-style route, target, contested, MTF, YCO, accuracy stats), combine or pro day (fill missing 40s with a position/weight prior and flag it), birth dates, early-declare flag, conference, and NFL pick. Outcome labels: best finish in years 1 to 3 (WR1/2/3, RB1/2/3, TE Top4/Top6/TE1, QB1).
2. **Components**: compute each stat's percentile vs same-position prospects, convert to 0-10 (decile), keep the letter map from 3.1. Build the two WR composites: Separation from YPRR plus contested and uncontested target rates per route; Ball Skills from contested catch rate plus drop rate.
3. **Grade**: fit one linear model per position (outcome ~ components + DC term, e.g., log of pick number). Store two outputs: talent-only (DC term removed, mapped to an implied round) and full grade. Rescale so the best-ever prospect lands near 15.
4. **Tiers**: fixed per-position grade bands (use Section 3.3 as a starting point), each with its historical hit table (3.4). Also store tier x draft-round hit rates, since that is what Dynasty Domain quotes most.
5. **Cross-position**: z-score within position, then cluster a draft class on gaps for "Class Tier".
6. **Comps**: nearest neighbors on the component vector; archetype comps inside the same build/archetype label.
7. **Validation we should do that they do not show**: leave-one-class-out cross-validation, only score classes with 3 NFL seasons, and report out-of-sample tier hit rates next to in-sample ones.
8. **Landing spot** as a separate "adjusted" grade, never mixed into the base grade.

---

## 10. Source index
Local transcripts (all in `Fantasy Football/transcripts/` unless noted):
- DYKsOZo9Y7Q "Our Final Dynasty Rookie Rankings (Shots Called)"
- J0GUfLrB4d4 "NEW 2026 Dynasty Rookie WR Rankings (Final Bakery Scores)"
- WrWwqI-AHjc "NEW 2026 Dynasty Rookie Rankings + Updated Bakery Scores" (post-combine, Mar 2026)
- ZK5VpWQQveE "Jeremiah Smith is ruining Dynasty Leagues" (pick strategy)
- kC9PxBi7-RU "What To Do With EVERY Rookie Pick In Dynasty (1.01-2.12)"
- m0m-HCp3Gkg "We Are Taking These Rookies EVERYWHERE In 2026 (Flag Plants)"
- oxg8bYwAZWw "NEW 2026 Dynasty Rookie RB Rankings (Final Bakery Scores)"
- `Fantasy Football/transcript-rookie-rankings-2026.txt` (CwBKU26DVQY, post-draft rankings) and `transcript-cornerstones-2026.txt` (-HGAWo8v8dY, player categories; Bakery only mentioned as a paid database)
- Pulled 2026-09-26 and saved: 4w8QYgX0gUs "The First Look - 2026 Dynasty Rookie Rankings + Bakery Scores" (Sep 2025), S-XZuFrvXMI "Data Says These Rookies Will SHOCK Dynasty" (Feb 2025, the only on-air methodology explanation), mSwF-WTnnz0 (2025 RB Bakery), Y038jwveVMU (2025 WR Bakery)
- Non-Bakery context: Q_K7MUGcWZo (JJ Zachariason), 9PIPsiPe_-A, wQaC75xPEgo, KZhFFaliZCA, RmqQlGSHsHI, Ve5iZKAjn4Y, `_beyond_box_score_rookie_rankings.md`. `beyond-the-box-score-takeaways.json` had no prospect-model content.

Ryan Bread on X (https://x.com/FFRybread/status/ID):
- 1998860509219860691 (Dec 10 2025 introduction thread, tier tables and all-time sheets for all four positions)
- 2048434996147368242 (Apr 26 2026 post-draft Top 24 with Grade / Overall / Z / Class Tier)
- 2041264689145885071, 2042671502491787273 (combined 2025+2026 RB and WR sheets, pre-draft)
- 2017361818050576623, 2033590300489216482, 2014429267501719807 (Jan to Mar 2026 cross-position boards)
- 2021354148235706474, 2019898563535552871, 2021591668693045755 (Separation and Ball Skills metrics)
- 2061564189265605042 (Adjusted Bakery Grade)
- 2062230838209819039, 2062236768876048796 (draft-capital weighting debate)
- 2079983346650587433, 2082575892342243478, 2089775393578311846, 2092720657603907742 (report cards showing every component)
- 1783589857001931102, 1894841941986287779 (projected-DC method), 1628542542554832898 (age), 1948759769629540434 (RB receiving share), 2089683860409729332 (Hunter tier change)

No public methodology page exists on the web; YouTube descriptions only link the paywalled flockfantasy.com/domain.
