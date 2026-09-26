# Data Suite 2.0 video walkthrough: what the tools do and how we would build them

Researched 2026-09-26. Companion to [data-suite-gaps.md](data-suite-gaps.md), which graded the site
against the Data Suite 2.0 launch article. This note works from video instead: what the UI actually
shows on screen, frame by frame.

## The video

**"WIN your fantasy football league with evidence-based analysis I 18 players who actually matter"**
Fantasy Football Today Beyond the Box Score (CBS), uploaded 2026-09-25, 74:14.
https://www.youtube.com/watch?v=NmHLN_KMABE

This is the weekly "league winners" episode Ryan Heath co-hosts with Jacob Gibbs. There is no
YouTube channel called League Winners for this show; `@LeagueWinners` is an unrelated dormant
podcast. The Data Suite demo is the segment the description labels "23:36 Ryan Heath has something
exciting for us!" and it runs about 23:31 to 30:05. Heath screen-shares
`fantasypointsdata.com/chart-builder` and demos the **Chart Builder** (scatter), the **Route Tree**
with side-by-side tiles (player vs player and season vs season), and the per-route metric switcher
(separation, route share, YPRR, win rate).

Because Heath's segment is seven minutes and only opens two of the nine chart types, the specs below
also use the fullest runner-up, which demos the rest of the builder and the standalone Player
Comparison page. Anything taken from that video is marked **(Sept 8 demo)**.

Runners-up, newest first:

| Date | Video | Why it is not the pick |
|---|---|---|
| 2026-09-08 | [Your Fantasy Football Team Just Got a HUGE Upgrade with This AMAZING Data Product!](https://www.youtube.com/watch?v=338sLWHO9nE) (Fantasy Points channel, 71 min) | The fullest Data Suite 2.0 demo (Chart Builder 52:07, Route Trees 54:48, Player Comparison about 58:30), but hosted by Brett Whitefield, Scott Barrett and Chris Wecht, not Heath |
| 2024-08-02 | [How To Use Fantasy Football Data To Win Leagues, Fantasy Points Data 101](https://www.youtube.com/watch?v=t4zFSpMOWIc) (15 min) | Heath walks through Data Suite 1.0 tables; no chart builder, route tree or comparison existed yet |
| 2023-10-05 | [Fantasy Points Data Suite Walkthrough w/ Chris Wecht and Jake Tribbey](https://www.youtube.com/watch?v=D89-XruhbEc) (52 min) | Data Suite 1.0, not Heath |

Source files (outside the repo, session scratchpad
`C:\Users\TREVOR~1\AppData\Local\Temp\claude\c--Users-TrevorWhite-Downloads-Big-Projects\90f10e73-e81f-419e-a910-b324e7252f6d\scratchpad\`):

- `video-frames\full\f23m52s.png` to `f29m35s.png`: 17 full-res frames from Heath's segment
- `video-frames\sept8\s0h52m15s.png` to `s1h01m00s.png`: 16 frames from the Sept 8 demo
- `video-frames\crop_*.png`: upscaled crops (Rice YPRR trees, comparison card, field map)
- `vid\seg\btbs_full.txt` and `.srt`: Whisper `small` transcript of 23:00 to 31:30 (YouTube auto-subs
  returned HTTP 429, so the transcript is local faster-whisper)

## Timestamped outline

Episode chapters come from the YouTube description. Times inside the demo come from the transcript
and frames.

| Time | What happens |
|---|---|
| 0:00 | The 18 players who matter in 2026 |
| 2:12 | Drake London |
| 6:47 | Malik Nabers concerns |
| 11:30 | Ladd McConkey concerns |
| 12:49 | Movers: Bucky Irving, Amon-Ra St. Brown, Jaxon Smith-Njigba |
| 14:05 | Christian Watson and Matthew Golden |
| **23:31** | Gibbs hands off: "what are you going to share from Data Suite 2.0?" |
| 23:46 | Heath's pitch: every chart he posts draws "where is this player?" replies; now anyone can build the chart and lower the minimum |
| 23:52 | Chart Builder default: QB scatter, EPA per dropback vs CPOE, 2026, min 24 dropbacks |
| 24:33 | Switches to WR+TE and searches the stat picker for "first": plots 1D/RR (first downs per route run) vs 1READ % (share of team first-read targets) |
| 24:57 | Hover tooltip (Demarcus Robinson); Parker Washington top right; JSN off the chart |
| 25:17 | "There's a million options"; switches chart type to Route Tree |
| 25:26 | Drops the route minimum from 200 to 15 |
| 25:35 | Matthew Golden 2026 separation score on every route; mentions win rate |
| 25:57 | Switches metric to route share: Golden runs corners 15.2% of the time (90th percentile), rare league-wide |
| 26:12 | Adds a second tile and searches Christian Watson |
| 26:14 | Gibbs asks for Golden 2025 vs 2026; Heath flips the second tile to Golden 2025 |
| 26:31 | Route share 2026 vs 2025: more slants and corners, fewer horizontal breakers |
| 26:58 | Over 50% of Golden's routes are Go, Post, Corner: "hard to get targets in that role if it sticks" |
| 27:10 | Watson 2026 vs 2025: also downfield plus slants ("layups and three pointers") |
| 27:42 | Metric switch to YPRR by route ("small sample two weeks in") |
| 28:05 | Gibbs recounts a Rashee Rice find: lots of out routes, high target rate on them, 4th-percentile YPRR |
| 28:37 | Rice 2026 separation on outs is zero or negative across the board |
| 29:05 | Rice route win rate 2026: 11.1% on outs (51st percentile) |
| 29:32 | Compares to Rice 2025 separation: better on outs and crossers last year |
| 29:58 | "Go sell Rashee Rice"; segment ends about 30:05 |
| 30:56 | Josh Allen and Dalton Kincaid |
| 39:30 | Jalen Coker |
| 44:04 | Parker Washington |
| 47:05 | DeVonta Smith |
| 55:30 | Bhayshul Tuten |

The rest of the episode uses a TierMaker board, X posts and FantasyPros ranks; no other Data Suite
screens appear.

## Shared shell (what every tool sits in)

- **Top nav** (dark, `DATA SUITE 2.0` wordmark with a red "2.0"): Dashboard, Passing, Rushing,
  Receiving, Team, Defense, Matchups, Players, Tools, Weekly Reports. Chart Builder lives under Tools;
  Player Comparison under Players. Right side: player search, "What's New", help.
- **Left rail**, about 150 px, near-black, stacked sections with small grey uppercase labels:
  `CHART TYPE` (a 2-column grid of 9 toggle buttons, active one is white), `Start from a preset`,
  `CONFIGURE` (the chart-specific pickers, active pickers get a red outline), `FOR` (population and
  filters). Pinned to the bottom: `Views` (saved configurations) and a red `Export` button.
- **Canvas**: a white rounded card on the dark page. Top right of the card: a marker toggle
  (`Logos` / `Dots`, or `Vert` / `Horiz` on bars, `Week` / `Cumulative` on lines) and a `Display`
  dropdown. Bottom right: a small FPTS watermark and a source line such as
  `Data: @FantasyPtsData | min 24 routes`.
- **Tile layouts** (route tree, field map, run gap, cheatsheet): a `1 col` / `2 col` / `4 col` pill
  group above the canvas (cheatsheet: 2/3/4). Each tile carries its own player, metric and season
  pickers and a close X; `+ Add tile` in the rail appends one.
- **Minimum qualifier** is one rail chip, `min 24 DB` / `min 24 RTE` / `min 40 Car`. Clicking it opens
  a popover: a unit select (Routes, Dropbacks, Carries) and a number input. The unit follows the
  position: QBs use dropbacks, WR+TE use routes, RBs use carries.
- **Empty state** in the canvas: "No data matches the current filters. Try adjusting the season,
  weeks, or minimum dropbacks."

## Tool specs

### 1. Chart Builder: scatter (shown by Heath)

**Purpose:** plot any two stats against each other for a filtered population, so a reader can find
any player instead of asking the author.

**Inputs (rail):**

| Control | Values seen |
|---|---|
| Chart type | Scatter, Bar, Line, Dumbbell, Field Map, Cheatsheet, Route Tree, Route Cmp, Run Gap |
| PLOT | Y-axis stat, e.g. `EPA/DB`, `1D/RR` |
| VS | X-axis stat, e.g. `CPOE`, `1READ %` |
| Swap axes | Button under the two stat pickers |
| FOR: entity | `Players` (Teams also exists per the presets) |
| FOR: position | `QBs`, `WR + TE` (also RBs, WRs) |
| FOR: season | `2026` (dropdown; 2021 onward) |
| FOR: weeks | `Weeks 1-18` |
| FOR: minimum | `min 24 DB`, `min 24 RTE` |
| FOR: aggregation | `Totals` (per-game and similar options implied) |

**Stat picker:** a searchable popover. Typing "first" returns grouped hits, each row showing the
short code in bold, a short name, then a full definition. Groups seen: PASSING (`1ST RD %`,
first-read throw rate), RUSHING (`Rush 1D`, `STUFF %` with a long definition), RECEIVING: ADVANCED
(`1READ` first-read targets, `1READ %` the player's share of the team's first-read targets). The
definitions are the product's glossary inline; we should reuse our column `desc` strings the same way.

**Output:**

- Title auto-built from the two stat names plus season: "EPA per Dropback & Completion % Over
  Expected - 2026", "First Downs per Route Run & 1READ % - 2026".
- Each player is a team-logo marker (Dots mode drops the logo) with a label `B. Purdy`.
- Dashed crosshair at the pool average on both axes, each labeled "Average".
- A solid least-squares trend line across the pool.
- Axis ticks at 5 even steps (0.000 / 0.070 / ... / 0.280), axis titles as the stat short codes.
- Players past the axis range are pinned to the edge (JSN sits at the right border).
- Hover tooltip: logo, full name, team, X value, Y value, and the sample (`Routes: 26`).
- Footer: `Data: @FantasyPtsData | min 24 dropbacks`.

**Starter charts (preset menu, Sept 8 demo):** a popover titled STARTER CHARTS, "One-click setups,
player and team charts per type. Loading one replaces your current configuration; tweak any chip
after." Grouped by chart type, for example:

- Scatter: Offense Pass vs Run EPA; Defense Man Rate vs EPA/DB
- Line: WR Target Share by Week (top 5); QB EPA/DB Race (Cumulative) with league-average line; RB
  Fantasy Points Race; Defense EPA/DB Allowed (Cumulative)
- Dumbbell: QB vs the Blitz; QB Clean vs Pressured; WR vs Man & Zone (YPRR); Offense Play Action Boost
- Cheatsheet: QB Pressure & Play Action; WR Red Zone & Deep; RB Run Concepts; Defense Coverage Splits
- Bar: Defense Blitz Rate

### 2. Chart Builder: the other chart types (Sept 8 demo)

- **Bar:** one stat, ranked. `Vert` / `Horiz` toggle. Horizontal shows every qualifier (a scrolling
  card): name at left, a bar filled in the team's primary color, team logo at the bar's end, value
  label past it, and a dashed vertical line at the league average. Title "EPA per Dropback - 2025".
- **Line:** one stat by week, `Week` / `Cumulative` toggle, rail adds `Top 10` (how many players).
  Each player is a colored line with point markers and a circular headshot at the line's end; a
  dashed grey "League Average" line; a legend of `Name (TEAM)` across the top in each line's color.
  Title "EPA per Dropback (Cumulative) by Week".
- **Dumbbell:** rail `COMPARE` (stat) plus `IN VS OUT OF` (a situation, e.g. `Blitz`). Each row is a
  player (name plus logo) with two dots joined by a grey bar: navy dot = out of the situation,
  orange dot = in it. Sorted by the gap. Footer "EPA/DB - In (Blitzed) vs Out (No Blitz), sorted by
  gap - min 204 DB".
- **Cheatsheet:** rail `RANK` (stat), `IN` (situation multi-select, e.g. "4 situations"), `Top 5`.
  Renders one mini leaderboard per situation in a 2/3/4 column grid; each card has its own `Min DB`
  input and columns `#, PLAYER, TM, POS, EPA/DB`. The situation picker has chips with X, a search,
  and collapsible groups with counts: DOWN & DISTANCE, FIELD POSITION, PRE-SNAP, PERSONNEL,
  PRESSURE, COVERAGE, TARGET DEPTH, TARGETING, TIMING, GAME STATE. Title "Cheatsheet - EPA/DB
  (4 situations)".
- **Field Map:** per-QB tile (player select plus season chips 2021-2025), rail `SHOW` metric
  (`SUCC %`), `+ compare tile`, season, `min 200 DB`. Dark card titled "MATTHEW STAFFORD, SUCCESS
  RATE MAP, 2025". A 3 x 3 grid: columns LEFT / MIDDLE / RIGHT, rows deep / intermediate / short
  with yard markers at LOS, 10 and 20. Each cell: big value, a colored underline and glow, and
  "82ND - 39 ATT" (percentile vs qualified QBs in that zone, attempts). A right-hand ALL column gives
  row totals (DEEP 47.0%, INT 56.9%, SHORT 63.2%). Two footer boxes: VS MAN 52.7%, VS ZONE 59.4%.
  Legend: "NNth = percentile vs qualified QBs in that zone (higher = better, drives the color). ATT =
  attempts to the zone (min 4 to color)." Colors: red low, yellow mid, green high, blue elite (97th).
- **Run Gap:** tile with `Player` / `Off` / `Def` toggle, player select, metric (`EPA/Rush`), season
  chips, `Concepts` and `Modifiers` dropdowns. Dark card "DERRICK HENRY - EPA/RUSH BY GAP - 2025"
  with a stat line (307 CAR, 1595 YDS, 5.2 YPC, +0.03 EPA/Rush, 16 TD, 13.4% EXP). Seven arrows fan
  out of an RB dot through the OL positions (LT, LG, C, RG, RT) to the seven gaps; value printed
  above each arrow, carries below; green = favorable, red = unfavorable, arrow width = carries.
  Footer "Charted: 307/307 carries".

### 3. Route Tree customizer (shown by Heath)

**Purpose:** a receiver's route-by-route profile on a stylized field, one player-season per tile,
compared side by side.

**Rail inputs:** `+ Add tile`; `SHOW`: tree type (`Receiver tree`) and a default metric (`SEP`);
`BY ROUTE`: coverage filter (`All coverage`) and alignment filter (`Any alignment`); `FOR`:
position group (`WR + TE`), season, `Weeks 1-18`, `min 15 RTE`.

**Tile header:** player select (searchable, each row shows the player's route count, e.g.
"Christian Watson 62"), metric select, season chips 2021 to 2026 (active chip red), season type
(`Regular`), close X. Metrics seen: `SEP` (Average Separation Score), `Route %` (Route Share),
`YPRR`, `Win Rate` (Route Win Rate).

**Tile body (a dark square card, about 460 px):**

- Header: square headshot with team logo badge, player name large and bold, `WR, GB` under it,
  metric title and season centered ("Route Share 2026"), Fantasy Points logo at right.
- Background: a dark, desaturated photo of turf with yard lines and a faint "50".
- A white vertical stem from a bottom node up to a center node; route arrows radiate from the center
  node. Eight routes in fixed positions, drawn as if the receiver is split left and the ball is to
  his right (a `BALL ---->` label at the bottom): **Go** straight up; **Post** up and inside at 45
  degrees; **Corner** up and outside at 45 degrees; **In** flat inside; **Out** flat outside;
  **Hitch** short, angled back down and inside; **Crosser** a curve leaving the lower stem toward
  the inside; **Slant** a shorter curve from the lower stem up and inside.
- Each route label shows the route name, the value in bold (`15.2%`, `-0.062`, `5.75`), and a
  caption: "90th Percentile" or "Did Not Qualify".
- Arrow color is a percentile band: red (roughly under 33rd), yellow (33rd to 66th), green (67th
  to 89th), purple (90th and up). In SEP, Route % and Win Rate mode the printed percentile matched
  this band on every arrow checked; in YPRR mode a few did not (an 89th-percentile slant drawn red),
  so their color pool likely differs from the printed one. Use the printed percentile.
- Routes with no data show a dash and a dim red ghost arrow.

**Comparison workflow shown:** 2-col layout, tile A = Golden 2026, tile B = Watson 2026, then tile B
switched to Golden 2025 for a same-player year-over-year read, then metrics flipped per tile (Rice
2026 Win Rate next to Rice 2026 Route %, Rice 2026 YPRR next to Rice 2025 YPRR). Tiles are fully
independent; nothing forces both tiles to the same metric.

Example values on screen (useful as fixtures for a build): Golden 2026 route share Go 24.2% (83rd),
Corner 15.2% (90th), Post 13.6% (83rd), Hitch 13.6% (32nd), Slant 10.6% (67th), In 7.6% (35th),
Crosser 6.1% and Out 4.5% (both DNQ). Golden 2025 Go 19.0%, Post 10.5%, In 15.2%, Out 11.4%,
Crosser 11.4%, Hitch 13.9%, Corner 8.4%, Slant 3.4%.

### 4. Route Cmp (Sept 8 demo)

Two-player route comparison on one card. Header: `1P` / `2P` toggle; row A and row B each with a
player select and season chips; one metric select (`Win Rate`). Body: player A name, team, position
and season at left, player B at right, overall metric in large type between them ("14.4% vs 14.0%,
OVR WIN RATE"). Under "WIN RATE BY ROUTE", one row per route (GO, POST, CORNER, IN/DIG, OUT, HITCH,
CROSSERS, SLANT), each with a caption of both players' route counts ("108 - 71 RTE"). Player A's bar
extends left in red, player B's right in grey, each with a black tick at the league average for that
route and the value at the bar's tip. Footer: "ABOVE LEAGUE BASELINE: Michael Wilson 6 of 8, Marvin
Harrison 5 of 8", a legend (Player A dot, Player B dot, tick = league avg per route, min 100 routes)
and the FANTASY POINTS wordmark. Rail: `COMPARE ROUTES` coverage and alignment filters, `FOR` WRs,
season, weeks, `min 100 RTE`, `+ Add comparison`.

### 5. Player Comparison page (Sept 8 demo)

Separate page under Players. Subtitle: "Up to 3 players, pick any timeframe per column, download or
copy to share."

- **Top bar:** `SCORING` PPR / Standard / Half-PPR; `SOURCE` Model / FantasyPts (which xFP model);
  `POSITION WR` (locked to the first player's position).
- **Left panel:** `APPLY TO` chips (`All`, `1-Lamb`, `2-Pickens`) so a filter can hit every column
  or one; `Filters` with a search box ("Search filters or values (e.g. Coverage, ...)"); tabs
  `Match` / `Play` / `Stats`. Match tab groups: GAME (Result, Location, Conference Game, Division
  Game, International Game, Neutral Site, Started Game, each an `Any` select) and TEAM (Conference,
  Division, Team, Points Scored ...).
- **Right panel, ROSTER:** one card per player (headshot, name, team, remove X) with a `WEEK(S)`
  row: season select plus a week picker (`8 reg`). The week picker popover has PRESETS (All, None,
  Regular Season, Postseason, Invert), a REGULAR grid of week buttons 1 to 18 (selected weeks red,
  drag to select, hold Shift to force), and POSTSEASON (Wild Card, Divisional, Conf Champ, Super
  Bowl). Then `Add a WR...`, a green `Download` button and a `Copy card` button.
- **Center, the card (the shareable image):** dark, "PLAYER COMPARISON" header, meta at right
  (position, scoring, season, week span). One column per player with a round headshot, name and team.
  A category tally chip at left (who led more rows). Sections with a dark red band label:
  FANTASY (FP/G, xFP/G), RECEIVING (RTE %, TGT %, TPRR, YPRR, aDOT, 1st-Read %, 1D/RR), UPCOMING
  MATCHUP (vs Defense, Def FP Allowed/G). The row leader's value is green; under every value is a
  thin bar whose length is its share of the best value in that row. Footer legend: "GREEN = CATEGORY
  LEADER, BAR = SHARE OF BEST, DATA SUITE 2.0". An "Updating..." pill shows while it recomputes.

### 6. Table engine glimpse (Sept 8 demo, Bell Cow Report)

Not a new tool, but it shows the table features the gaps note already lists: `Totals` / `Per Game`
/ `Percentile` / `Rank` value modes, a `Light` theme toggle, `Views`, season and week selects,
position chips, "Remove scrambles", scoring system, xFP version, a HIGHLIGHT box separate from
SEARCH, LEAGUE AVG `Hide`, `Reset Table`, a red "League Avg" first row, row checkboxes, grouped
column headers (PLAYER DETAILS, SNAPS, RUSHING), paging ("141 rows, page 1 of 3") and a left icon rail
(filter with a count badge, download).

## Mapping to our site and to public data

Our starting point: Stats Lab (`viewStats` in `site/js/app.js`) is a set of sortable tables built by
`statsTable` over `window.ADVANCED` (one season at a time from 3, fixed `Min snap%`, stat-group
toggles, percentile tint). There is no chart in Stats Lab and no player-vs-player compare; the only
charts on the site are `careerChartOne`, `sparkline` and `ktcValueChart`. The gaps note puts all of
this in Cluster D (task `t-1790320041505`), with split and on/off work in B, C and E.

| Tool | What we have now | Public data that powers it | Needs proprietary data |
|---|---|---|---|
| Scatter | Nothing charted, but both demo charts are plottable today: `db_epa` vs `cpoe` (QB) and `fprr_est` vs `first_read_share` (WR/TE) are already `window.ADVANCED` columns, as are `targets`, `dropbacks`, `carries` for the minimum and the tooltip sample | Existing Stats Lab data, no builder change | No, but `fprr_est`, `tprr_est`, `yprr_est` stay estimates for 2026; participation `offense_players` on dropbacks gives true routes 2020-2025 |
| Bar | Sorted tables only | Same columns | No |
| Line (by week, cumulative) | `USAGE_WEEKLY` has snap%, route% (est), target share, first-read share, rush share, RZ share, PPR by week | pbp + `stats_player_week` for weekly EPA/DB, CPOE, fantasy points (2023-2026 downloaded) | No |
| Dumbbell (in vs out of a situation) | Nothing | Blitz: FTN `n_blitzers` (2022-2026). Play action: FTN `is_play_action`. Pressure: participation `was_pressure` 2020-2025, 2026 proxy from pbp `qb_hit`/`sack` + FTN `is_qb_out_of_pocket`. Man vs zone: participation `defense_man_zone_type` (populated on about 19k to 23k dropbacks a season, 2020-2025 in our CSVs) | Disguised coverage, press, alignment |
| Cheatsheet | Nothing | Down and distance, field position, game state: pbp. Pre-snap: FTN `is_motion`, pbp `shotgun`. Personnel: participation. Target depth: pbp `air_yards`. Timing: participation `time_to_throw` 2020-2025 | Run concepts, disguise, press |
| Field Map | Season `cpoe`, `bad_throw_rate`, `catchable_throw_rate` with no location | pbp `pass_location` x `air_yards` bands (short under 10, intermediate 10-19, deep 20+) with `success`, `epa`, completion, YPA, 2023-2026 including this season; FTN `is_catchable_ball`; vs man / vs zone from participation 2020-2025 only | No |
| Run Gap | Nothing | pbp `run_location` x `run_gap` gives exactly seven gaps (left end, left tackle, left guard, middle, right guard, right tackle, right end), 2023-2026; modifiers from FTN `n_defense_box`, `qb_location`, pbp `shotgun`, participation personnel | `Concepts` (inside zone, gap/power, counter) is not public |
| Route Tree | Nothing | Participation `route` 2020-2025: the targeted receiver's route on about 18.9k targets a season, 13 labels. Map to the 8 spokes: GO, POST, CORNER, IN/DIG, QUICK OUT + DEEP OUT to Out, HITCH/CURL, SHALLOW CROSS/DRAG to Crosser, SLANT (SCREEN, SWING, WHEEL, TEXAS/ANGLE go to an "other" footnote). Honest metrics: share of the player's targets by route, yards per target, catch rate, EPA per target, first-down rate, with percentiles vs players with N+ targets on that route | Route share of all routes run, separation score, win rate, and per-route TPRR/YPRR all need every route charted, which only paid vendors do. No 2026 until nflverse posts `pbp_participation_2026` |
| Route Cmp | Nothing | Same as Route Tree; league-average tick per route computed over the qualified pool | Same |
| Player Comparison | Player card only; Compare Rosters compares teams, not players | FP/G, targets share, aDOT, first-read %, YPRR (est) are in `window.ADVANCED`; per-column week ranges need the per-week numerator/denominator builder from Cluster B; game filters (result, home/away, division, conference, started) come from nflverse schedules + pbp; "Def FP allowed/G" from `window.DEFENSE`; the PNG download is an SVG/canvas render client side | Model xFP is ours already (`xfp_pg`); FP's own charted RTE % is not public, ours stays an estimate for 2026 |

## What to build first

1. **Scatter and bar builder in Stats Lab** over the columns already in `window.ADVANCED`. Two stat
   pickers with the column `desc` as inline help, swap axes, position, season, minimum on any count
   column, team-logo markers, average crosshair, trend line, tooltip with the sample size, source
   footer and a PNG export. No new data, and it reproduces both charts Heath demoed. Vanilla SVG in
   the `careerChartOne` style.
2. **Tile compare with Field Map and Run Gap.** The tile shell (1/2/4 columns, each tile picks
   player, season, metric) is the one pattern behind route trees, field maps and run gaps. Field map
   and run gap are fully public from pbp, including 2026, so they ship with live data this season.
3. **Target tree and Route Cmp from participation `route` (2020-2025)**, labeled as targets-only,
   with the same field art, eight fixed spokes and percentile-banded arrows. It answers "what routes
   does he get fed and how good is he on them", lights up for 2026 when nflverse posts participation,
   and keeps separation and win rate off the screen instead of faking them.

Next after those: the Player Comparison card (it rides on the Cluster B week-range builder) and the
Dumbbell/Cheatsheet pair (they ride on the Cluster B and C situation buckets).
