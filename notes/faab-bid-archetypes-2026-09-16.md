# What a waiver archetype costs in FAAB - Sleeper, 2022 to 2026, 2026-09-16

**Read this first: the market pays for news, not for role.** Across 568 priced dynasty claims the two
most expensive well-sampled situations are a player who just posted a spike game (median $20, n=25) and a
player whose starter went down for three weeks or more (median $16, n=86). The cheapest are the two
situations with no headline attached: the quiet usage takeover, a man whose snap share has climbed past
55% without a big box score (median $6, n=22), and the entrenched NFL starter who simply was not rostered
(median $8.50, n=104, and the largest bucket in the whole dataset). A visible event costs about twice what
an existing full-time job costs. Sixteen situations show up in dynasty and twelve in redraft, and the full
ranking is in the tables below; the cheapest bucket of all is the speculative stash at a median $3.50, on
only ten priced claims.

And the spend does not buy points. Dynasty medians are $11 for the claims that turned into upside plays,
$10 for floor plays and $10 for the claims that never returned a startable week. In redraft it inverts:
$4 for the upside plays against $8 for the ones that produced nothing.

**Second thing to know: dynasty and redraft are not the same market, and the difference is not the
price.** The median priced claim is 5.0% of budget in dynasty and 5.5% in redraft, which is the same
number. What differs is *when* the money moves. 27% of dynasty priced claims (155 of 568) happen in the
offseason or preseason, on rookies and on veterans who changed teams, and that whole market does not
exist in redraft, where every single claim is in-season. Dynasty is buying next year. Redraft is buying
Sunday. The top of the market differs too: the biggest dynasty claim was 99.5% of a season budget
(Darren Waller for $200 of 201 in 2025), against 80% in redraft.

## Where the numbers come from

Sleeper's public API, no key. `GET https://api.sleeper.app/v1/league/{id}/transactions/{week}` for weeks
0 through 18 of every league-season, filtered to `type == "waiver"` with a non-null
`settings.waiver_bid`. The request needs a browser `User-Agent` or Sleeper answers 403. Season chains
are walked through `previous_league_id` on every run and the script exits if the walk disagrees with the
hardcoded ids.

| League | Format (`settings.type`) | Seasons | Budget | Priced claims |
|---|---|---|---:|---:|
| Password is taco | dynasty (2) | 2022 - 2026 | 200, 201 in 2025 | see chart |
| The League | dynasty (2) | 2023 - 2026 | 200 | see chart |
| yuH (IDP) | dynasty (2) | 2023 - 2026 | 150 | see chart |
| Phi Kap Fantasy | redraft (0) | 2024 - 2026 | 100 | 110 |

**Washington Football League is excluded, and that is a data limit, not a choice.** It runs on ESPN.
ESPN is not on `api.sleeper.app` and exposes no key-free waiver-bid endpoint, so not one ESPN claim
appears in any number in this note or in the chart. Every dynasty and redraft figure here is Sleeper
only.

**Budgets differ, so dollars are not comparable across formats.** Dynasty budgets are 200, 200 and 150;
redraft is 100. The chart carries the situation dimension twice for that reason, once in dollars and once
as a percent of that league-season's budget, and the percent view is the apples-to-apples one. The tables
are in dollars because that is the unit the leagues actually bid in.

Player position and rookie year come from `https://api.sleeper.app/v1/players/nfl`, which is about
15 MB and grows through the season, so it is pulled once and cached.
Weekly snaps, starts, NFL team and PPR points come from
`https://api.sleeper.app/stats/nfl/{season}/{week}?season_type=regular&position[]=...`, which is the
endpoint that carries the **historical** team; `players/nfl` only knows today's team, and using it would
have put Keaton Mitchell on the Chargers in 2023 instead of the Ravens.

## Reproducing it

```powershell
# plain python on PATH, never a project venv
python notes\faab_extract.py             # uses notes\faab-cache\, ~90s
python notes\faab_extract.py --refresh   # re-pull everything from Sleeper
```

The script asserts the baseline named in the brief before it classifies anything: Password is taco 2023
must return 200 claims with a non-null bid, a max of 57, and 96 of them at $0. If Sleeper's history ever
moves, the run fails instead of quietly reporting a different number.

```powershell
python notes\faab_extract_test.py        # 13 checks, exits 1 on any mismatch
```

The last of those 13 is the one that matters for trusting this page. It parses every table row out
of the markdown below, recomputes n, median, IQR, Q1, Q3, max and the $0 count for that archetype
straight from `faab-bids-2026-09-16.csv`, and fails on any disagreement. 69 rows, 69 matches. A
table that disagrees with its own data is the failure mode this note was most at risk of, so it is
a test now and not a promise.

Outputs, all under `notes/`:

| File | What it is |
|---|---|
| `faab_extract.py` | the extraction and classification script, caches every API pull |
| `faab_chart.py` | renders the HTML, called by the above |
| `faab_audit_taco2023.py` | the week-by-week evidence dump behind the taxonomy |
| `faab_extract_test.py` | 11 pinned classification cases, a label-drift check, and a read-back that recomputes all 69 table rows from the CSV. Run it after touching any rule |
| `faab-bids-2026-09-16.csv` | 1,548 raw claims, one row per added player, every dimension and the evidence JSON |
| `faab-bid-archetypes-2026-09-16.html` | box plots plus the n / median / IQR / max tables |
| `faab-archetype-stats.json` | the same statistics as data |
| `faab-cache/` | cached API responses and `audit-taco-2023.txt` |

## The two counting decisions

**$0 claims are excluded from every box and reported as their own count.** 342 of 910 completed dynasty
claims (37.6%) and 42 of 152 redraft claims (27.6%) were won at $0. A $0 waiver win is not a price. It is
a free-agent pickup that happened to route through the waiver queue because nobody else wanted the player
that week, and Sleeper records it with `waiver_bid: 0` rather than as a free-agent move. Folding them into
the boxes would drag most medians toward zero and answer a different question than "what does this
archetype cost". They are not thrown away: every table carries a `$0 claims` column and a `$0 share`
column per archetype, which is the more useful form anyway, because the share of an archetype that goes
for nothing is itself a price signal. Speculative stashes are 58% free and handcuffs are 42% free, while
a starter going down long-term is free only 27% of the time.

**Failed claims are kept in the CSV and kept out of the charts.** 486 of the 1,548 claims failed. A losing
bid is a real stated price, but several rosters bid on the same player in the same week, so charting them
counts one vacancy many times over and inflates the popular archetypes. The charts use completed claims,
which are the prices that actually cleared. The CSV has a `status` column for anyone who wants the losing
side.

## How the archetypes were compiled

The four named situations in the brief were treated as a hypothesis, not as the answer. The method was to
dump one full season of waiver wires week by week, in claim order, with the evidence a human needs to name
the situation: the player, his NFL team that week, his snap share and PPR points in the three weeks either
side, and the same series for the two highest-snap teammates at his position. That dump is
`notes/faab-cache/audit-taco-2023.txt`, produced by `faab_audit_taco2023.py`, and Password is taco 2023 was
the season because the brief supplies a measured baseline for it.

Reading all 209 of that season's claims turned up five things the four named situations do not cover, and
each became its own label:

1. **An entrenched NFL starter who simply was not rostered.** The single largest bucket in both formats
   (104 priced dynasty claims, 34 redraft). Sam Howell at 100% of Washington's snaps for $0. Baker Mayfield
   at 100% of Tampa's for $5. Hunter Henry at 79% and 92% of New England's for $35. Nothing emerged; the
   fantasy league had just not drafted a man who already had the job.
2. **Offseason and preseason claims.** Sleeper stamps `leg: 1` on every move made before week 2, so the
   transaction's own week field files a May dynasty stash as a week-1 in-season pickup. 275 dynasty claims
   were made before August 1 and 142 more in August. The script resolves the real week from the claim's
   wall-clock time against the first kickoff of each NFL week, taken from the game dates in the stat rows.
3. **Kicker and team-defense churn.** 53 priced dynasty claims and 23 redraft. A different market with a
   different shape, and folding it into "streaming" hid that a top defense still goes for real money
   (the 2022 Ravens went for $143).
4. **The rotational piece.** A player at 15% to 55% of his team's snaps with no injury behind him and no
   spike game: most of a modern split backfield, plus the TE2 and WR3 bodies at half of their team's snaps.
5. **A starter who left the team rather than got hurt.** Melvin Gordon was released by Denver and signed in
   Kansas City, which is why Latavius Murray cost $100 in week 12 of 2022. Same vacancy, different cause.

Plus three smaller ones: a player returning from his own absence, a player stashed *while* unavailable and
who never came back, and a player who changed NFL teams mid-season.

**Clustering was not needed.** The hand-compiled list leaves **nothing** in the residual bucket: every one
of the 1,548 claims carries a named situation, because the snap-share bands partition the whole range. There
was no unexplained remainder for k-means or a hierarchical cut to work on. The brief allowed clustering only
if the hand list left bids unexplained, and it did not.

**The rules were then tested, not just written.** `notes/faab_extract_test.py` pins eleven hand-verified
cases, checks that the CSV carries no situation label this note does not document, and recomputes every
table row from the CSV. Most of the eleven guard the ORDER of two rules rather than a single rule, because
the order is where a classifier can be wrong while still looking right.

Writing that test found five real bugs, which is the argument for writing it:

- Sleeper's `leg` was filing every claim in the season-in-progress as a week-1 claim, which gave each one
  an empty snap history and labelled entrenched starters as speculative stashes.
- Baltimore's third-string back was being credited to J.K. Dobbins' season-ending injury, on nothing more
  than Dobbins having more snaps than a man with zero.
- A 40% starter floor on the vacancy rule was dropping Javonte Williams, a real lead back in a split
  Denver backfield who averaged 37%.
- A redundant gate on the handcuff rule was dumping Jordan Mason into the residual bucket.
- The rotational band required two played weeks, so a man with one 54%-snap week fell through every rule
  and landed in the residual.

## The classification rules

Four dimensions per claim. Every rule below reads only from the cached Sleeper responses, so the labels are
reproducible from the script and nothing is hand-assigned.

### Dimension 1: NFL years of experience at the pickup

`exp = pickup season - int(player.metadata.rookie_year)`. `rookie_year` is the anchor because
`players/nfl.years_exp` is as-of-today and freezes when a player retires, which would have made every
retired player's 2022 experience wrong. `years_exp` is used as a fallback only for players still flagged
`active`, and anything else is left unknown rather than guessed. Tiers: **NFL year 1 (rookie)** for exp 0,
**years 2-3** for exp 1 to 2, **years 4-7** for exp 3 to 6, **years 8+** for exp 7 and up. Team defenses
have no rookie year and are labelled **n/a (team defense)**, which is a known non-player, not a gap.

Resolved for 100% of real players in both formats.

### Dimension 2: situation of emergence

**First matching rule wins, and the order is the design.** A real vacancy outranks a hot box score, which
outranks a speculative stash. Five thresholds, all on share of team snaps: a full-time role at 60%, a
single-week takeover at 55%, a backup's ceiling at 40%, an actual starter at 30%, and effectively-no-role
at 15%. An absence is long-term at three missed games.

The effective week of a claim is resolved from its `created` timestamp against the first kickoff of each
NFL week, not from Sleeper's `leg`. A claim placed after the last kickoff on record belongs to the next
week, which matters for the season in progress: on 2026-09-16 only week 1 had been played, and treating
those claims as week-1 claims gave every one of them an empty snap history and filed entrenched starters
as speculative stashes.

1. **offseason rookie claim** / **offseason veteran claim** - the claim was created before August 1 of the
   season. Split by whether `rookie_year` equals the pickup season. There is no in-season context to read.
2. **preseason claim** - created after August 1 but before the first kickoff of week 1.
3. **kicker or team defense** - position is K or DEF. Priced as a churn market, not as an emergence story.
4. **changed NFL teams** - the player's NFL team in the pickup week differs from his team the week before.
   A seventeenth label, **no NFL snaps that season**, fires when the player has no stat row anywhere in that
   NFL season, so there is no team to reason from at all.
5. **returning starter from own absence** - he missed at least one non-bye week, was at 50% or more of
   snaps in his last game before the gap, and plays again within two weeks of the claim. A missing stat row
   counts as a miss, because IR and inactive both drop the row; only the NFL team's bye is excused.
6. **injured or unavailable stash** - he missed two or more weeks and does not play within two weeks of the
   claim. A dynasty buy on a body that is not on the field.
7. **starter left the team (cut or traded)** / **starter long-term injury** / **starter short-term injury** -
   a man *ahead* of him stopped playing. Four conditions, and each one exists because a real case broke
   without it:
   - The added player must have an NFL role himself: cumulative snaps above zero, or 15% of snaps in the
     prior window. J.K. Dobbins really was out for all of 2023, but Baltimore's third-string back with
     zero snaps was not inheriting his job, he was a lottery ticket, and he belongs in the stash bucket.
   - Candidates are the top four teammates at the same position group by cumulative snaps before the
     pickup, each of whom must have played and started at least once.
   - A candidate must have **more cumulative snaps than the added player** and must have averaged **30% of
     team snaps** in the games he played. The snap gate keeps a full-time player from being credited to a
     rotational teammate's absence: Robert Woods at 86% of Houston's snaps did not emerge because Noah
     Brown got hurt behind him. The 30% floor keeps a third-stringer from being mistaken for the starter.
     It is 30 and not 40 because 40 drops Javonte Williams, a genuine lead back who averaged 37% in a split
     Denver backfield.
   - Among qualifying candidates the **largest vacancy wins**, longest absence first, ties broken by snaps.
     Jacksonville, week 9 of 2024, is the case that forced it: Gabe Davis had more snaps than Christian
     Kirk and missed one week, Kirk missed the rest of the season, and the $125 claim on Parker Washington
     was about Kirk.

   "Left the team" fires when the absent man shows up for another NFL team later that season; long-term at
   three or more missed non-bye weeks; short-term at one or two. When a spike game and a vacancy are both
   present the vacancy wins, which is the deliberate call: a spike with the starter healthy is a bet on a
   role change, a spike with the starter out is a one-week rental, and the two are not the same buy.
8. **entrenched NFL starter, unrostered** - his own snap share was already 60% or more in at least two of
   his last three played weeks (or in his single played week, if he started it). He had the job before the
   claim.
9. **breakout game** - his best PPR game in the three weeks before the claim reaches the 80th percentile of
   that position-season's starter weeks. "Starter weeks" means every week logged by a player at 40% of snaps
   or more, so the bar is set by that season's actual starters at that position rather than by a fixed number.
10. **usage takeover, no big box score** - snap share hit 55% in one of the prior three weeks without a
    percentile-80 game attached.
11. **healthy handcuff / backup stash** - RB or QB, the highest-snap teammate at his position played, and
    the added player was between 15% and 40% of snaps. The floor matters as much as the ceiling: a man with
    no snaps at all is a stash, not a backup.
12. **rookie ramping into a role** - `rookie_year` equals the pickup season and he is on the field for at
    least 15% of snaps.
13. **one-week stream / roster filler** - the same roster dropped him within one week of adding him, read
    from that league's own completed add and drop log.
14. **speculative stash, minimal NFL role** - never played, or under 15% of snaps.
15. **rotational piece, no role change** - a peak share between 15% and 55% with nothing above firing.
    Mostly split-backfield running backs, plus the TE2 and WR3 types at half of their team's snaps.
16. **unclassified, no signal in the data** - a guard, not a bucket. The snap-share bands in rules 8
    through 15 partition the whole 0-to-100% range, so nothing reaches this label; it exists so a future
    edit that opens a hole shows up as an unclassified row instead of silently landing in the wrong one.

### Dimension 3: position

`players/nfl.position`, with FB folded into RB and every IDP position (DL, DE, DT, LB, ILB, OLB, DB, CB, S,
FS, SS, NT) folded into one IDP group, because only yuH is an IDP league and splitting six IDP claims across
nine positions says nothing. Resolved for 100% of claims.

### Dimension 4: point-production profile

**This dimension is hindsight, and the honest thing is to say so.** No key-free source carries the bidder's
forward view of a player's variance at the moment he bid, so the profile is measured from what the player
actually did after the pickup:

- Take his weekly PPR scores from the pickup week to the end of that season, games played only.
- Fewer than three such games means **unknown (under 3 games after pickup)**, not a guess. This is the one
  dimension with a real gap: 21.4% of dynasty claims and 6.8% of redraft claims. It concentrates in week-16
  and later claims and in 2026, which had exactly one week in the books on 2026-09-16.
- `boom_rate` is the share of those weeks at or above the position-season 80th-percentile starter week.
  `startable_rate` is the share at or above the median starter week.
- **upside play** if `boom_rate >= 0.25`, so one week in four is a spike.
- **floor play** if it does not spike but `startable_rate >= 0.50`, so it usually gives you a median
  starter week.
- **low output, neither profile** otherwise. This is 295 of 568 priced dynasty claims, and that is the
  finding, not a bug: most waiver money buys a body that never returns a startable week.

### The archetype key

The archetype is the four dimensions joined: `exp_tier | situation | pos_group | production_profile`. Fully
crossed that is hundreds of cells, most with n of 1, so the chart draws only cells with at least 8 priced
claims (10 of them, all dynasty) and the tables carry the four marginal dimensions in full. **Redraft has no
four-dimension cell at n >= 8**; its largest is 7 (team defenses that turned out to be upside plays), which
is what 110 priced claims across four dimensions buys you. Read redraft off the marginals and off the
situation split, not off the crossed cells. Every cell, however thin, is in the CSV.

## The tables

Priced (above $0) completed claims only. IQR is Q3 minus Q1. `$0` is the count of completed claims in that
archetype won at $0 and is not part of the box statistics. **Everything between the two markers below is
written by `faab_extract.py` on every run**, so the numbers here cannot drift from the script that produced
them. Do not hand-edit inside the markers.

<!-- FAAB-TABLES:BEGIN (generated by notes/faab_extract.py - do not hand-edit) -->

### Situation of emergence, dynasty

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| starter left the team (cut or traded) | 4 | 20 | 23.8 | 17.8 | 41.5 | 100 | 4 | 50% |
| breakout game | 26 | 18.5 | 23 | 7 | 30 | 114 | 21 | 44.7% |
| starter long-term injury | 86 | 16 | 23.8 | 7 | 30.8 | 150 | 32 | 27.1% |
| rookie ramping into a role | 4 | 15 | 21.8 | 5.5 | 27.2 | 40 | 4 | 50% |
| one-week stream / roster filler | 9 | 13 | 10 | 7 | 17 | 36 | 5 | 35.7% |
| offseason rookie claim | 61 | 12 | 22 | 3 | 25 | 160 | 35 | 36.5% |
| returning starter from own absence | 3 | 12 | 13.5 | 11 | 24.5 | 37 | 1 | 25% |
| rotational piece, no role change | 18 | 11 | 22 | 3.2 | 25.2 | 95 | 13 | 41.9% |
| healthy handcuff / backup stash | 27 | 11 | 22 | 3 | 25 | 100 | 25 | 48.1% |
| starter short-term injury | 55 | 10 | 19 | 4.5 | 23.5 | 61 | 24 | 30.4% |
| no NFL snaps that season | 1 | 9 | 0 | 9 | 9 | 9 | 1 | 50% |
| entrenched NFL starter, unrostered | 108 | 8.5 | 10 | 5 | 15 | 114 | 59 | 35.3% |
| preseason claim | 56 | 8.5 | 22.5 | 3 | 25.5 | 175 | 47 | 45.6% |
| offseason veteran claim | 39 | 6 | 13 | 2 | 15 | 200 | 42 | 51.9% |
| kicker or team defense | 53 | 6 | 16 | 1 | 17 | 143 | 17 | 24.3% |
| speculative stash, minimal NFL role | 12 | 5 | 18 | 2 | 20 | 91 | 18 | 60% |
| usage takeover, no big box score | 23 | 5 | 9.5 | 1.5 | 11 | 102 | 16 | 41% |

### Situation of emergence, redraft

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| starter long-term injury | 13 | 15 | 20 | 7 | 27 | 80 | 1 | 7.1% |
| starter short-term injury | 10 | 12 | 14 | 4.8 | 18.8 | 84 | 1 | 9.1% |
| usage takeover, no big box score | 3 | 11 | 8 | 7.5 | 15.5 | 20 | 2 | 40% |
| rotational piece, no role change | 2 | 10.5 | 5.5 | 7.8 | 13.2 | 16 | 2 | 50% |
| entrenched NFL starter, unrostered | 39 | 8 | 17 | 3 | 20 | 60 | 12 | 23.5% |
| breakout game | 15 | 8 | 5 | 5 | 10 | 20 | 1 | 6.2% |
| no NFL snaps that season | 1 | 8 | 0 | 8 | 8 | 8 | 0 | 0% |
| starter left the team (cut or traded) | 1 | 6 | 0 | 6 | 6 | 6 | 0 | 0% |
| healthy handcuff / backup stash | 6 | 5 | 18.5 | 2.5 | 21 | 31 | 3 | 33.3% |
| rookie ramping into a role | 4 | 4.5 | 6.8 | 2.5 | 9.2 | 19 | 0 | 0% |
| one-week stream / roster filler | 4 | 3 | 4 | 2.8 | 6.8 | 18 | 0 | 0% |
| kicker or team defense | 24 | 2 | 2.2 | 2 | 4.2 | 16 | 23 | 48.9% |
| returning starter from own absence | 2 | 1 | 0 | 1 | 1 | 1 | 1 | 33.3% |

Three dynasty situations have no redraft row at all, and that is the format difference: offseason rookie claims, offseason veteran claims and preseason claims are a quarter of the priced dynasty volume and zero of the redraft volume. Phi Kap Fantasy only runs waivers in season.

### Position, dynasty

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| RB | 180 | 13 | 26.2 | 3.8 | 30 | 150 | 100 | 35.7% |
| IDP | 7 | 11 | 15 | 2.5 | 17.5 | 26 | 15 | 68.2% |
| WR | 181 | 10 | 19 | 5 | 24 | 175 | 119 | 39.7% |
| QB | 70 | 10 | 15 | 5 | 20 | 106 | 52 | 42.6% |
| TE | 93 | 9 | 15 | 4 | 19 | 200 | 65 | 41.1% |
| DEF | 23 | 7 | 17 | 3.5 | 20.5 | 143 | 0 | 0% |
| K | 31 | 3 | 8.5 | 1 | 9.5 | 57 | 17 | 35.4% |

### Position, redraft

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| RB | 32 | 10 | 17.8 | 3.8 | 21.5 | 84 | 4 | 11.1% |
| WR | 42 | 9 | 14.5 | 5 | 19.5 | 60 | 10 | 19.2% |
| TE | 17 | 7 | 7 | 3 | 10 | 20 | 3 | 15% |
| QB | 9 | 3 | 8 | 2 | 10 | 27 | 6 | 40% |
| DEF | 16 | 2 | 2.8 | 1.8 | 4.5 | 16 | 13 | 44.8% |
| K | 8 | 2 | 1.5 | 2 | 3.5 | 5 | 10 | 55.6% |

### NFL experience at the pickup, dynasty

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| NFL year 1 (rookie) | 127 | 13 | 26 | 3 | 29 | 175 | 82 | 39.2% |
| NFL years 2-3 | 130 | 11.5 | 20.8 | 4.2 | 25 | 125 | 94 | 42% |
| NFL years 8+ | 101 | 10 | 12 | 5 | 17 | 200 | 82 | 44.8% |
| NFL years 4-7 | 204 | 8 | 17 | 3 | 20 | 150 | 110 | 35% |
| n/a (team defense) | 23 | 7 | 17 | 3.5 | 20.5 | 143 | 0 | 0% |

### NFL experience at the pickup, redraft

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| NFL years 2-3 | 25 | 11 | 16 | 4 | 20 | 84 | 10 | 28.6% |
| NFL year 1 (rookie) | 23 | 8 | 16.5 | 3 | 19.5 | 80 | 2 | 8% |
| NFL years 8+ | 25 | 7 | 12 | 2 | 14 | 27 | 9 | 26.5% |
| NFL years 4-7 | 35 | 6 | 10.5 | 3 | 13.5 | 35 | 12 | 25.5% |
| n/a (team defense) | 16 | 2 | 2.8 | 1.8 | 4.5 | 16 | 13 | 44.8% |

### Point-production profile, dynasty

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| upside play | 90 | 11 | 20 | 5 | 25 | 200 | 48 | 34.8% |
| low output, neither profile | 315 | 10 | 21 | 3 | 24 | 175 | 202 | 39.1% |
| floor play | 69 | 10 | 22 | 5 | 27 | 143 | 26 | 27.4% |
| unknown (under 3 games after pickup) | 111 | 8 | 16 | 2 | 18 | 100 | 92 | 45.3% |

### Point-production profile, redraft

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| unknown (under 3 games after pickup) | 15 | 10 | 14.5 | 3.5 | 18 | 84 | 6 | 28.6% |
| low output, neither profile | 51 | 8 | 12.5 | 3 | 15.5 | 60 | 14 | 21.5% |
| floor play | 24 | 5 | 14.5 | 2 | 16.5 | 27 | 9 | 27.3% |
| upside play | 34 | 3.5 | 5 | 2 | 7 | 80 | 17 | 33.3% |

### Full four-dimension archetype, dynasty, n >= 8

| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| NFL year 1 (rookie) | offseason rookie claim | RB | low output, neither profile | 17 | 25 | 34 | 10 | 44 | 142 | 7 | 29.2% |
| n/a (team defense) | kicker or team defense | DEF | upside play | 8 | 18 | 16.2 | 12.8 | 29 | 101 | 0 | 0% |
| NFL years 4-7 | starter long-term injury | RB | low output, neither profile | 18 | 17.5 | 27.8 | 8.2 | 36 | 150 | 6 | 25% |
| NFL years 2-3 | healthy handcuff / backup stash | RB | low output, neither profile | 9 | 17 | 35 | 6 | 41 | 52 | 6 | 40% |
| NFL years 4-7 | entrenched NFL starter, unrostered | WR | low output, neither profile | 11 | 10 | 13.5 | 1.5 | 15 | 23 | 5 | 31.2% |
| NFL years 2-3 | preseason claim | RB | low output, neither profile | 9 | 7 | 7 | 2 | 9 | 85 | 5 | 35.7% |
| NFL years 8+ | entrenched NFL starter, unrostered | WR | low output, neither profile | 9 | 7 | 6 | 3 | 9 | 40 | 4 | 30.8% |
| NFL years 4-7 | starter long-term injury | WR | low output, neither profile | 8 | 7 | 8.8 | 5 | 13.8 | 38 | 3 | 27.3% |
| n/a (team defense) | kicker or team defense | DEF | floor play | 9 | 7 | 17 | 4 | 21 | 143 | 0 | 0% |
| NFL year 1 (rookie) | offseason rookie claim | WR | low output, neither profile | 16 | 6.5 | 19.5 | 1.8 | 21.2 | 160 | 13 | 44.8% |

### Full four-dimension archetype, redraft, n >= 8

No cell in this grouping reaches the minimum sample, so there is no table to draw. Read this format off the marginal dimensions instead; every cell, however thin, is in the CSV.

### Counts behind every table above

| | Dynasty | Redraft |
|---|---:|---:|
| claims with a non-null bid | 1392 | 247 |
| completed | 953 | 170 |
| failed | 439 | 77 |
| completed at $0 | 368 | 46 |
| completed above $0 (the boxes) | 585 | 124 |
| $0 share of completed | 38.6% | 27.1% |

### What is unknown, by dimension

| Dimension | Dynasty | Redraft |
|---|---:|---:|
| experience unknown | 0% | 0% |
| experience n/a (team defense) | 2.5% | 16.6% |
| position unknown | 0% | 0% |
| situation unclassified | 0% | 0% |
| production profile unknown | 20.2% | 12.6% |
| any dimension unknown | 20.2% | 12.6% |

The production profile is the only real gap and its cause is structural: it needs three games after the pickup, so week-16-and-later claims and all of 2026 to date cannot have one. Nothing was invented to fill it.
<!-- FAAB-TABLES:END -->

## Traps worth keeping

- **`settings.waiver_bid` can be null.** 9 of Password is taco's 209 waiver transactions in 2023 have no
  bid field. The brief's 200-claim baseline is the non-null count, and dropping the nulls is what makes it
  reconcile.
- **Sleeper's transaction `leg` is 1 for every offseason move.** Trusting it files a May dynasty stash as an
  in-season week-1 pickup and puts 275 offseason dynasty claims into the wrong situation. Resolve the real
  week from `created` against the first kickoff date of each NFL week.
- **`players/nfl` carries today's NFL team, not the team at the pickup.** The per-week stats endpoint carries
  the historical one. Use it.
- **A missing weekly stat row is not the same as a bye.** IR, inactive and released all drop the row, so the
  team's bye has to be derived (no player on that team logged a game that week) before an absence can be
  counted.
- **The highest-snap teammate is not always the vacancy.** Rank the candidates and take the longest absence,
  not the biggest name.
- **The season in progress needs the NEXT week, not the last one on record.** Resolving a claim to the
  last played week gives it an empty pre-pickup snap history, which reads as "no NFL role" and files
  every entrenched starter as a speculative stash. On 2026-09-16 that was every 2026 claim.
- **Any body with one start outranks a man with zero snaps, and that is not a vacancy.** Gate the
  incumbent on a real average snap share, and gate the added player on having a role at all.
