# Eagles Eric "Two-Point Conversions" video: design study for the Backyard site

Read-only research. No repo code was edited. Everything below comes from frames I extracted and
looked at; where a claim is inferred rather than seen, it says so.

## 1. Source

| Field | Value |
|---|---|
| Author | Eagles Eric, `@EaglesXsandOs` (verified) |
| Tweet id | `2104904020053602540` |
| URL | https://x.com/EaglesXsandOs/status/2104904020053602540 |
| Posted | 2026-09-29 12:00 UTC (05:00 PT) |
| Text (complete) | "NFL Coaches Are Getting Two-Point Conversions Completely Wrong https://t.co/s1IG7bHMaH" (the t.co is the attached video) |
| Metrics at 2026-09-30 export | 116,123 views, 2,427 likes, 768 bookmarks, 129 reposts, 71 replies |
| Bookmark position | Index 0 of a live read-only bookmark fetch on 2026-10-04, i.e. Trevor's newest bookmark overall, not just newest from this account |

How it was found: the newest export `twitter-bookmarks/output/bookmarks-20260930T145539Z.json` had it
at index 0; I then confirmed with a live read-only fetch (`bookmarks.get_client()` +
`fetch_bookmarks(client, 40)`, no files written) that nothing newer had been bookmarked since.

What failed along the way:
- First live fetch: `curl (35) Connection was reset` inside the sandbox; plain curl also hit
  `CRYPT_E_REVOCATION_OFFLINE`. Re-ran with the sandbox off and it worked.
- `.agents/scripts/x-cli.py tweet <id> --full-text` returned `not_authenticated` (no
  `TWITTER_AUTH_TOKEN`/`TWITTER_CT0` in env, browser cookie extraction failed). Not needed: the
  bookmark payload already carries the full, untruncated text.
- The 46.8 MB video download timed out/reset several times; a resume loop (`curl -C -`) finished it.
  Size matches the server's Content-Length exactly (46,766,887 bytes).

### Video

| Field | Value |
|---|---|
| Source | `https://video.twimg.com/amplify_video/2104717069908348928/vid/avc1/1920x1080/ZtnNwPaYCWY0HDO1.mp4?tag=29` |
| Local copy | not kept (16 MB); re-download from the tweet with yt-dlp |
| Format | H.264 1920x1080, 23.976 fps, with an audio track |
| Length | 167.4 s (2:47) |
| Transcribed? | No. The graphics carry the argument on their own, so nothing below is drawn from the narration. |

## 2. Frames used

All in `eagles-eric-frames/` beside this note.
Even-interval frames were taken every 9 s; I matched each one back to its source time (frame N is at
about `(N-1)*9 + 4.5` s, checked by pixel difference against re-extracted candidates).

| File | Time | Shows |
|---|---|---|
| `even_01.jpg`, `t_4.jpg` | 4.5 s, 4 s | Cold open: a field strip assembling from stepped pixel blocks |
| `even_02.jpg`, `t_12.jpg` | 13.5 s | "GO FOR 2" lower-third plate over an overhead field, "2 YDS" marker |
| `t_20.1.jpg` | 20.1 s | CRT power-on transition (horizontal scanline band) |
| `even_03.jpg` | 22.5 s | "FILM ROOM" tag, giant "1999 / SEASONS" counter |
| `even_04.jpg` | 31.5 s | Cloud of 2,072 unit cells (one per play), yellow = run |
| `even_05.jpg` | 40.5 s | Cells sorted into PASS and RUN blocks, colored by outcome, "76% / 24% OF CALLS" |
| `t_46.3.jpg` | 46.3 s | Same blocks with a dashed threshold line, "CONVERTED 45.2% / 57.0%" |
| `t_48.4.jpg` | 48.4 s | Block-dissolve transition (grid breaks into 2x2 tiles) |
| `even_06.jpg`, `even_07.jpg`, `even_08.jpg` | 49.5, 58.5, 67.5 s | "HOW SURE ARE WE?" confidence-range chart building up |
| `even_09.jpg`, `even_10.jpg` | 76.5, 85.5 s | "RUN MINUS PASS" effect-size chart, "NO EDGE" zero line, "NEVER ZERO" |
| `even_11.jpg`, `even_12.jpg` | 94.5, 103.5 s | "WHAT'S A TRY WORTH?" segmented bars vs a dashed "KICK LINE" |
| `t_105.0.jpg`, `sheet_push_104.jpg` | 104.6 to 105.6 s | RGB-stripe push transition |
| `even_13.jpg`, `crop_texture_117.jpg` | 112.5, 117 s | "4 ERAS. SAME RESULT." small-multiple cards; full-res crop shows the CRT mask |
| `t_118.7.jpg` | 118.7 s | Dip to black |
| `even_14.jpg` | 121.5 s | "BONUS STAGE: 4TH-AND-2" banner with RGB rules |
| `even_15.jpg`, `even_16.jpg`, `sheet_dissolve_138.jpg` | 130.5 to 141.6 s | Two stacked field diagrams, "CATCH!" vs "OUT OF ROOM!" |
| `t_141.0.jpg` | 141.0 s | Colored block-scatter dissolve |
| `t_144.9.jpg`, `even_17.jpg` | 144.9, 148.5 s | "WARNING! 2024 41%" caution plate, before and after the color swap |
| `even_18.jpg` | 157.5 s | PASS vs RUN summary cards with segmented meters |
| `t_162.7.jpg`, `even_19.jpg` | 162.7, 166.5 s | "RUN THE BALL." outro, sprite runner, "+2", disclaimer footer |
| `sheet_cloud_22.jpg` | about 22 to 34 s | Six-frame contact sheet of the counter and unit-sort sequence |

## 3. The piece in one paragraph

A 2:47 data essay styled as an 8/16-bit console game. It opens on a pixel field, frames the
question ("GO FOR 2"), then runs a chain of screens that each ask one question in the title and
answer it with one chart: share of calls, conversion rate, confidence range, adjusted effect size,
expected points vs the kick, stability across four eras, a "bonus stage" geometry explainer, a
2024 warning stat, a two-card summary, and an outro ("RUN THE BALL.") with a data and causality
disclaimer. One font, about five colors, one ground, and the same meaning for each color for the
whole runtime.

## 4. Design breakdown

### Layout and grid

- 16:9 with roughly 6% side margins (content starts about x=80 on a 1280-wide frame) and the
  title band centered at the top (cap line around y=70).
- **Persistent chrome** on data screens: a yellow section tag top-left ("FILM ROOM") and a sample
  counter top-right, numeral stacked over a small label ("2072 / PLAYS"), right-aligned.
- **Label rail plus plot area.** Interval charts put row labels in a left column ("PASS" big,
  "1,567 PLAYS" small under it) and the plot to the right with dashed vertical gridlines and a
  tick axis underneath. It is a table row header married to a chart.
- **One idea per screen.** Large negative space; the chart sits in the middle 60% band.
- **Small multiples**: four equal cards in a row with about 30 px gutters (at 1280), same y-scale
  in each card. Summary screen uses two equal cards side by side.
- **Footers** in dim small caps bottom-left ("SIMPLIFIED VIEW: QB, WR, CB ONLY") or a full-width
  disclaimer strip ("DATA: NFLVERSE 1999-2025. OBSERVATIONAL: ASSOCIATIONS, NOT PROOF.").

### Card and graphic structure

- **Data card** (`even_13`, `even_18`): deep blue face (about #101243) on the navy ground, a 2 px
  light lavender-gray outline (about #86899f) with a darker inner keyline so it reads as a double
  rule, small corner radius (about 4 px), no drop shadow. Inside, top to bottom: big title word or
  date range, then a quiet small-caps label ("CALLED"), then a segmented meter, then a huge verdict
  word ("MOST", "LEAST") colored by sentiment.
- **Lower-third plate** ("GO FOR 2"): navy fill with dot texture, double outline, yellow pixel
  text with a hard dark shadow. Sits over the field like a broadcast bug.
- **Warning plate** (`even_17`): full-frame. Yellow and black 45-degree caution stripes top and
  bottom, a red beveled frame, inner navy screen, then "WARNING!" (red), year (yellow), a giant
  stat, a one-line caption, and a dim "SOURCE: FOX SPORTS" line.
- **Section banner** ("BONUS STAGE"): full-width dark strip bounded by stacked red, blue and green
  hairlines, yellow title. Paired with a yellow question-block icon.
- **Field diagram** (`even_15/16`): two stacked full-width field strips, each with a small-caps
  label in its corner, sprite dots for players, a measured "ROOM: 50 YDS" line in green vs
  "ROOM: 12 YDS" in red, and exclamation callouts ("CATCH!", "OUT OF ROOM!").

### Typography

- **One bitmap pixel family, all caps, monospaced.** No weight changes at all; hierarchy is made
  only with size and color.
- Size ladder, as share of frame height: hero stat about 20% ("41%"), section counter about 8%
  ("1999"), titles about 5%, row labels about 4%, small labels about 2.5%.
- **Hard, zero-blur drop shadow** under display text, offset down-right in a darker shade
  (visible on "RUN THE BALL.", "PASS", "44%"). Same idea as the site's page-title hard shadow.
- Tracking is wide by construction (monospace pixel cells), word spaces are large.
- **Numerals:** monospaced pixel figures; the % sign is a stair-stepped diagonal. Formatting is
  careful: thousands separators ("1,567"), signed deltas ("+12", "+6", "+18"), a tilde for an
  approximate value ("~0.95"), one decimal where precision matters ("45.2%", "57.0%").
- **Copy voice:** titles are questions ("HOW SURE ARE WE?", "WHAT'S A TRY WORTH?") and get replaced
  by the verdict as a sentence in the verdict color ("THE PASS IS WORTH LESS THAN THE KICK.").
  Terminal periods make statements land ("4 ERAS. SAME RESULT.", "RUN THE BALL.").

### Color

Sampled from the extracted frames (bright-pixel percentile over a region). The CRT mask darkens
everything, so treat these as approximate.

| Role | Approx. hex | Used for |
|---|---|---|
| Ground | #080a23 (edges #05071b) | Near-black navy everywhere, with a vignette |
| Protagonist yellow | #ebde45 fill, #d3c749 text | RUN on every screen, titles, the recommended option |
| Foil lavender | #babfda (kick bar dimmer, #686e96) | PASS on every screen, neutral text and values |
| Good green | #75eb74 | Converted plays, values that clear the bar, a range that never touches zero |
| Bad red | #da2d2f | Failed plays, "NO EDGE", "SHORT", "WARNING!", verdict sentences against the pass |
| Plate blue / empty cell | #101243 / #202578 | Card faces; unlit meter cells |
| Field | turf #2c932e, end zone #6b1cab | Diagrams only, plus a blue LOS line and yellow line-to-gain |

**The key rule:** *identity color never changes and outcome color is a separate channel.* Run is
yellow and pass is lavender for all 167 seconds. Green and red go on the number, the verdict word
or the cell, never on the identity. The one exception is the waffle grid, where each play cell is
recolored by its outcome once the identity has already been established by position.

### Data-display patterns

1. **Unit waffle.** One cell per play (2,072 cells). The cloud sorts into two blocks whose area is
   the call share, then each cell turns green or red by outcome, and a dashed white line marks the
   conversion level. The count and rate are below in big type with a small label ("CONVERTED").
2. **Confidence range.** Whisker bar with white end caps, a square marker colored by verdict, the
   point value above in that color, endpoints below in small type, a bracket annotation
   ("FEWER PLAYS = WIDER") and an axis caption ("95% CONFIDENCE RANGE"). Sample size sits under
   each row label.
3. **Effect vs zero.** A red vertical "NO EDGE" line at 0, the estimate as a yellow square with a
   big "+12", the interval as a green bar, and a red dashed connector from zero to the lower bound
   labeled "NEVER ZERO". It argues with the reader's doubt directly on the chart.
4. **Segmented bars against a reference line.** Bars built from horizontal slices, a dashed yellow
   "KICK LINE" across all of them, values above each bar colored by whether they clear the line,
   and the shortfall at the top of the pass bar painted red and labeled "SHORT".
5. **Small multiples with a winner mark.** Four era cards, two bars each, a pixel star above the
   winner, the winning value green and the losing value white.
6. **Segmented meter with a verdict word.** Small label, a row of cells with lit vs unlit cells so
   capacity is countable, then one huge word ("MOST", "LEAST") colored by sentiment.
7. **Counters.** "1999 SEASONS" ticking upward, "2072 PLAYS" counting up while cells fill.
8. **Hazard callout** for the single most alarming stat, with a source line.
9. **On-data annotation everywhere.** "KICK LINE", "SHORT", "NEVER ZERO", "ROOM: 12 YDS" sit on the
   marks themselves. There is no legend anywhere in the video.

### Motion and transitions

Seen in stills and 6 fps contact sheets. I could not measure easing curves at that sampling rate.

- **Stepped pixel-block build**: the opening field assembles in staircase blocks (`t_4`).
- **CRT power-on**: a gray scanline band expands from the center line (`t_20.1`).
- **Count-up tickers**: seasons and plays counters run while the grid fills column by column
  (`sheet_cloud_22`: 1,070 then 2,072 plays).
- **Sort and recolor**: unit cells recolor by identity, sort into blocks, then recolor by outcome;
  a dashed threshold line draws across (`even_04`, `even_05`, `t_46.3`).
- **Block dissolve**: grids break into 2x2 tiles that scatter (`t_48.4`, `t_141.0`).
- **RGB-stripe push**: the whole frame slides left behind a vertical red/yellow/green/blue stripe
  (`sheet_push_104`).
- **Dip to black** between chapters (`t_118.7`).
- **State swap**: the "41%" is white, then turns red as its caption appears (`t_144.9` vs `even_17`).
- **Sprite action**: a pixel runner with speed lines crosses into the end zone and "+2" pops.
- Star positions differ between frames, so the starfield is very likely animated (inferred).

### Texture and lighting

- **CRT shadow mask** at full resolution (`crop_texture_117`): fills are built from RGB sub-pixel
  dots; the yellow bar visibly resolves into red and green dots.
- Fine **scanlines** and a soft **vignette** (center #080a23, edges #05071b).
- **Starfield**: sparse 1 to 2 px lavender dots with the odd green or orange speck.
- Slight **bloom** on bright text. Fills are otherwise flat; the only gradients are the vignette
  and the alternating mow stripes on the turf.

### What makes it feel premium

1. **Constraint.** One font, about five colors, one ground, held for the full runtime.
2. **Consistent meaning.** Yellow is always run and lavender is always pass, so the eye learns the
   code in ten seconds and never has to re-learn it.
3. **Honesty shown as design.** Sample sizes under every label, confidence ranges, "FEWER PLAYS =
   WIDER", "ASSOCIATIONS, NOT PROOF", a named source. Showing the uncertainty is what makes the
   verdict believable.
4. **Literal units.** One cell is one play, so 2,072 is something you can see rather than read.
5. **Annotation on the data**, never in a legend.
6. **Question, then verdict.** The title asks, the chart answers, then the title becomes the answer.
7. **Texture as one global layer** (mask, scanlines, vignette) over everything, so dozens of
   different charts still look like one product.
8. **Negative space.** One idea per screen, no crowding.

## 5. Recommendations for the fantasy site, prioritized

Each one keeps the Backyard palette and names the token and component it touches. Tokens are from
the `:root` block in `site/css/styles.css` (identical in the main checkout and the `prospect-cards`
worktree).

1. **Split identity hue from verdict hue on the trade calculator.** In `.trade-calc`,
   `.trade-lineup-value` and `.trade-fairness`: your side is always `--grad-gold` with `--ink`
   text (the Gold-Selection Rule already says gold means "yours"), the partner side is always
   `--grad-btn` / `--bg-3`. Only the fairness number and a one-word verdict ("WIN", "SHORT") take
   `--green` or `--red`. Blocker to fix first: `.trade-poschip` currently paints QB `--red`, RB
   `--green`, WR `--blue` and TE `--amber`, which spends the verdict and pillar hues on positions.
   That already breaks the No-Decorative-Hue Rule and will muddy the verdict channel. Move position
   chips to neutral `--bg-3` with the label doing the work.

2. **Reference line plus shortfall on meters (the "KICK LINE").** On `.seg-meter` and
   `.faab-plot`, add an absolutely positioned 2 px dashed `--chalk` line (it reads on the
   `--led-bg` recess) with a micro-label ("FAIR SHARE", "REPLACEMENT", "MEDIAN BID"). The part of
   the bar that falls short gets `--red` and the label "SHORT"; surplus past the line gets
   `--green`. Use it for title odds vs 1/N fair share, player value vs replacement level, and bid
   vs median. Do not draw the line in gold: gold means selected here.

3. **"How sure are we" range bars for odds and projections.** `.faab-range` currently prints the
   range as right-aligned text. Replace or accompany it with a `.ci-bar`: `--bg-2` track with
   `--plate-edge`, 2 px `--ink` whisker caps, a 10 px **square** marker (`--gold` when it is the
   user's, `--fg-0` otherwise), the point value above in the numeric voice and the endpoints below
   in `--fg-3` tabular-nums, plus a caption like "80% RANGE, N=312". The existing
   `.faab-row.is-thin` dimming then has a visible reason: the bar is wide.

4. **Make empty cells visible in `.seg-meter`.** Today the unfilled part is bare `--led-bg`, so
   the total is not countable. Add a background layer of unlit cells (a dim LED such as
   `oklch(30% 0.08 145)`) on the same 6 px cell / 3 px gap rhythm as `.seg-meter > i`. This is the
   video's "CALLED" meter, pure CSS, no reflow, and it strengthens DESIGN.md's "ratings are
   discrete and countable" law.

5. **Verdict-first card titles.** On analysis cards (trade result, roster phase, `.strength-detail`),
   put the conclusion in the `.card-title` band instead of the topic: "YOU WIN BY ONE TIER." rather
   than "Trade analysis", ending in a period. Copy change only; no `-webkit-text-stroke` (that stays
   on `.page-title`).

6. **Sample size and source on every rate.** Add a small `--fg-3` tabular sub-line under rates in
   `.adv-stat` (for example "312 routes") the way the video puts "1,567 PLAYS" under "PASS", and a
   caption-voice footer on model cards: "DATA: NFLVERSE 2026 WK 3. ASSOCIATION, NOT PROOF." The site
   already pulls nflverse, so this costs one line per card and buys trust.

7. **Small multiples for the multi-league view.** One `.league-card` per league, each with the same
   two-bar comparison (your roster strength in `--grad-gold` vs league median in `--grad-btn`) on an
   identical scale across cards, the winning value in `--green`, and a verdict band such as
   "3 LEAGUES. 2 CONTENDERS." Put the cards in a plain grid region so no plate sits inside a plate.
   Skip the star: amber is the tier-S color and would mean something else.

8. **Warning plate for must-act alerts only.** A rare `.alert-plate` for the one thing that needs
   action now (an age-cliff sell window, an injured starter on a contending roster): `--plate-edge`,
   `--grad-panel` face, 8 px caution bands top and bottom from
   `repeating-linear-gradient(45deg, var(--gold) 0 10px, var(--ink) 10px 20px)`, the stat in `--red`
   numeric voice around 2.5rem, then a micro-label and a source caption. One per page at most, or
   it turns into noise.

9. **A scoped "film room" screen.** The dark ground belongs only on recessed screens, the way the
   Freshness Panel already uses `--led-bg`. If a chart well (for example `.cchart-plot`) gets this
   treatment: ink border, `--well` or `--bevel-in`, a scanline overlay
   `repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px)`, and `--chalk` /
   `--led` marks. Turf and lavender stay everywhere else.

10. **Stepped fills and count-ups (needs a DESIGN.md change, so last).** Filling `.seg-meter` cell
    by cell with `steps()` and counting numerals up would capture the video's best motion, but it
    cannot be done inside the current 80 ms linear limit. Only do this if Trevor amends the motion
    rule, and make it instant under `prefers-reduced-motion`.

## 6. Conflicts with DESIGN.md (and PRODUCT.md)

- **Ground.** The video is dark navy with stars; Backyard is "light and loud" turf with lavender
  plates. Do not import the dark ground globally (recommendation 9 scopes it).
- **Font and case.** The video uses one pixel bitmap face in all caps. DESIGN.md mandates the
  system sans stack, and the Uppercase-as-Metadata Rule says player names are never uppercase. A
  pixel face only for LED numerals would add a new web font, which is Trevor's call.
- **Motion.** Block dissolves, CRT power-on, RGB pushes, count-ups and sprite runs all break
  "80 ms linear, no bounce or scale-in". Recommendation 10 is flagged for that reason.
- **Characters and owned shapes.** The pixel running-back sprite is the "mascot energy" DESIGN.md
  rejects, and the yellow "?" block closely resembles Nintendo's question block. Both fall on the
  wrong side of the IP and ornament boundary in BACKYARD-INVENTORY.md and the Don'ts. Do not copy.
- **What yellow means.** In the video yellow is "the recommended option". On the site gold is
  "selected / yours". Never paint the better option gold unless it is the user's.
- **Red and green alone.** The interval markers rely on hue plus position. Keep a word next to
  every verdict color ("SHORT", "WIN"), per PRODUCT.md's color-blind requirement.
- **Flat cards and glow.** The video's cards have no drop shadow or bevel, and its text blooms.
  Keep the site's plate drop, bevel and No-Blur Rule; glow stays limited to LED elements like the
  existing `.data-fresh-dot`.
- **RGB tricolor rules** (the "BONUS STAGE" banner, the push stripe) use the semantic hues as
  decoration, which breaks the No-Decorative-Hue Rule. Leave them out.
- **Caution stripes** use gold as chrome. DESIGN.md allows gold structurally, but the
  Gold-Selection Rule wants gold to mean "this one". This is a judgment call, which is why
  recommendation 8 caps it at one plate per page.

## 7. What I could not verify

- Easing curves and exact transition timings (stills and 6 fps sheets only).
- Anything said in the narration (not transcribed).
- Exact source colors: sampled hexes are approximate because of the CRT mask and video compression.
