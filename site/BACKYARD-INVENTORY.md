# Backyard Football: component and style inventory

Teardown of six reference screens from Backyard Football (Humongous Entertainment, PS2/GameCube
and PC era) for the retro refactor of this site. Source images: `bfinspo.jpg` through
`bfinspo6.jpg`.

This is a **vocabulary** document, not an asset list. Read the IP boundary before building.

## IP boundary, read first

Backyard Football, the BFU mark, the kid characters, the NFL shield, and every team logo in these
screens are owned marks. None of them gets copied, traced, or approximated.

What is takeable is the *grammar*: thick-outlined plates, gold-selected states, discrete rating
tracks, folder tabs, LED ticker chrome, halftone and watermark texture, arced outlined display
type. That grammar is generic late-90s game-UI convention and it is what actually produces the
feeling. Verify the result with `audit-reference-originality` before shipping, and treat any
one-to-one lift of a logo, character, wordmark, or the "BACKYARD FOOTBALL" italic strip as a
failure of the pass, not a stylistic choice.

## Screen 1: Main Menu (`bfinspo.jpg`)

| Element | Detail |
|---|---|
| Ground | Full-bleed field render. Purple end zone carrying a dense halftone dot mesh, kelly turf below it |
| Yard markers | White chunky outlined numerals `20 30 40 50 40`, each flanked by a solid triangular chevron pointing toward its goal line |
| Watermark | Oversize ghosted football outline inside a dark circular vignette, left third, ~12% opacity |
| Title plaque | Horizontal lozenge, brushed-silver vertical gradient, 3px near-black outline, left end clipped by a circular badge that overlaps the plaque edge |
| Title type | Two lines, two treatments: `MAIN` in blue outlined caps, `Menu` in heavy red italic with a white outer stroke. Slight arc, slight rotation. Never one flat weight |
| Menu list | Seven rounded-rect buttons, single column, tight 4px gutters |
| Button, rest | Blue vertical gradient (light top, dark bottom), 2px navy outline, white bold centered caps, 1px inner top highlight |
| Button, selected | Gold vertical gradient, black text, heavier outline. The state change is a full fill swap, not a tint |
| Footer | Green circular `A` glyph plus the white word `Accept`, bottom right |

## Screen 2: Play call HUD (`bfinspo2.jpg`)

The densest screen and the closest analogue to our data views.

| Element | Detail |
|---|---|
| Layout | 3x2 grid of play cards with a scoreboard slab punched through the middle row |
| Play card | Dark title bar with centered white small-caps name, body is a mini field diagram |
| Diagram language | Dashed white yardline hashes, yellow route polylines, blue and red terminal arrows, white triangle player markers, a `P` origin label |
| Scoreboard slab | Team name plates (`GIANTS` red on silver, `COLTS` blue on silver) beside large score boxes in blue-gray |
| Micro table | Three labeled columns `down / to go / ball on` over their values `1st / 20 / 9 <`. Label row is smaller and lighter than the value row, and the value row is the loud one |
| Second micro table | Right column, stacked label-value pairs `quarter 1st`, `game 0:57`, `play 29` |
| Alert panel | Black box, `CHARGE!` in extra-bold white italic with a red outer stroke, arced |
| Left rail | `CPU` pill, team badge, a secondary `PI` label |
| Right rail | Vertical stack of small square chips `1 2 3 4 K` plus a gold active chip |
| Bottom bar | Lettered circular controller glyphs (red `B`, green `A`, gray) with word labels, and a physical toggle-switch graphic beside `Pause` |
| Frame | The whole HUD floats on a blue-gray brushed-metal panel with a hard bevel, over the field |

## Screen 3: Roster and playbook, PC build (`bfinspo3.jpg`)

| Element | Detail |
|---|---|
| Banner | Team logo inside a dark lens-shaped plate, then the team name in two weights: letterspaced small caps (`Detroit`) beside huge caps (`LIONS`), over a navy gradient with a ghosted title watermark |
| Tabs | Two angular tab chips top right, `PLAYER 1 ROSTER` active and lighter |
| Chrome | Periwinkle panel, thick dark outline, softly rounded corners |
| List header | `OFFENSIVE` in gold caps on black, flanked by circular arrow buttons |
| Roster row | Circular position badge (`QB`, `RB`, `WR`) plus player name in amber caps on black, then a segmented green meter bar on black at the right |
| Divider row | `RESERVES` as a full-width label band, reserves listed below it without meters |
| Buttons | `CHANGE PLAYBOOK`, `ICON` as small blue rounded rects with white caps |
| Preview panel | Dark blue header carrying two labels (`RUN`, `OUTSIDE HANDOFF`) each flanked by arrow chips, body is a field diagram |
| Bottom chrome | Black message ticker flanked by two green LED dot-matrix panels, plus stacked icon buttons |

## Screen 4: Meet the Players (`bfinspo4.jpg`)

The player-detail archetype.

| Element | Detail |
|---|---|
| Ground | Flat kelly green tiled with a repeating ghosted logo watermark |
| Header plaque | Cream-bordered plate with a leading card icon, title in gold bold with a black outline and a hard drop shadow, arced |
| Portrait card | Thick cream border inside a dark outline, subject on a field ground, bottom strip carrying a badge chip and an italic caps label on red |
| Bio card | Periwinkle panel, white border. Name in oversize blue-violet outlined caps, then small-caps metadata rows (`BIRTHDAY: 7/16`, nickname), then a body paragraph in a comic sans-serif |
| Rating rows | Five attribute rows in white bold caps on alternating lavender and blue bands. Each row carries a five-slot icon track: filled slots are solid, empty slots are pale outlines |
| Carousel | Seven face thumbnails in rounded squares with wood-tone frames, active one ringed in gold, oversize gold chevrons at both ends |
| Ornaments | A stump icon with red script label bottom left, a mailbox icon bottom center. Decoration with no function |

**The rating track is the single most transferable idea here.** Five discrete icons beat a
percentage and beat a smooth bar: it is instantly countable and it refuses false precision.

## Screen 5: Game Summary (`bfinspo5.jpg`)

The stat-table archetype, and the most directly reusable screen for our tables.

| Element | Detail |
|---|---|
| Ground | Painted stadium bleachers with a cartoon crowd, blurred behind the panel |
| Header plaque | Green rounded bar, white outline, two helmet icons, title in gold bold caps with a black outline |
| Table shell | Periwinkle panel with a thick white outline. Three columns: team, label, team |
| Column heads | Team badge plus name in white caps on a darker blue-gray; the center head is `FINAL` in oversize white bold caps |
| Row label | Center column, dark navy bold, sentence case, deliberately plain (`total points`, `pass yards`, `3rd. down conv. %`) |
| Row values | Dark navy, centered, chunky. Negative values carry a plain minus, no color coding |
| Gridlines | 2 to 3px **white** separators, not hairlines. Alternating lavender and white row fills. The table reads as stitched plates, not as a spreadsheet |
| Footer | A script-labeled icon and a clipboard icon, both decorative entry points |

## Screen 6: Season hub (`bfinspo6.jpg`)

The navigation archetype.

| Element | Detail |
|---|---|
| Banner | Bronze gradient, logo in a dark lens plate, team name in mixed weights, a letterspaced subtitle line (`COACH DRACOSAMM`), ghosted title watermark |
| Tab bar | Seven angular tabs: `PLAYERS`, `STATISTICS`, `TROPHY CASE`, `SCHEDULE`, `STANDINGS`, `LEAGUE LEADERS`, `OPTIONS`. Tiny dark caps on lavender chips, active tab lighter and border-joined to the panel below it |
| Panel | Lavender, thick outline, split into a left portrait card and a right group photo panel with a white border |
| Progress dots | A row of small gold dots under the portrait card, a discrete step indicator |
| Buttons | `INFO` as a blue rounded rect with a leading chevron, plus circular arrow chips |
| Bottom chrome | The same black ticker and twin LED dot-matrix panels as screen 3, so it is a persistent shell, not a per-screen flourish |

## The cross-cutting style system

Nine laws that hold across all six screens. These, not any single screenshot, are what to build to.

1. **Every surface is a physical plate, and plates come in two kinds.** Rounded rect, 2 to 4px
   near-black outline, a light inner ring on ALL FOUR sides, a hard bevel. RAISED plates hold
   content; recessed WELLS are punched into them, which the first pass missed entirely: the score
   boxes and the CHARGE panel (2), the black roster list and ticker (3), the logo wells above each
   team column (5), the photo panel (6). No soft shadows, no borderless surfaces.
2. **Nothing is flat.** Every fill is a vertical gradient, a texture, or a watermark. Flat color
   appears only as a backdrop for a texture.
3. **Selection is a fill swap, and gold is its loud form.** Gold plus black text selects the menu
   row (1), the carousel frame (4) and the numbered chip (2). FOLDER TABS ARE THE EXCEPTION: the
   active roster tab (3) and the active PLAYERS tab (6) select by lightening the same lavender.
   Either way it is a fill swap. No opacity tints, no underlines, no left-border accents.
4. **Ratings are discrete and countable.** The observably discrete readouts are the five-football
   attribute tracks (4) and the LED dot-matrix panels (3, 6). The green roster meters (3) read as
   CONTINUOUS bars with a top highlight at this resolution, so calling them segmented is a
   derivation rather than an observation. Worth keeping, worth labeling honestly.
5. **Labels are small caps, values are chunky.** Every micro table separates a quiet label row
   from a loud value row. The label never competes.
6. **Display type is outlined, multi-weight, rounded, and it sits on something.** The face is
   heavy rounded geometric on every screen. A title is two treatments in one lockup (small caps
   beside huge caps, or blue outline above red italic) resting on a plaque (1, 4, 5) or a full
   team banner (3, 6), never floating. Three corrections to the obvious reading: only "Menu" (1)
   is arced and the rest sit on straight baselines; titles are TITLE CASE ("Main Menu", "Meet the
   Players", "Game Summary") with all caps reserved for team wordmarks (3, 6); and the stroke is
   not universal, since FINAL (5) is plain white bold.
7. **Navigation is physical.** Folder tabs joined to their panel, circular arrow chips, numbered
   square chips, carousels with oversize chevrons. The metaphor is hardware and stationery.
8. **Scoreboard chrome is a persistent shell.** Black ticker bar, green LED dot-matrix panels,
   helmet icons, yardline numerals with chevrons. It frames the app rather than decorating a page.
9. **Decoration is allowed to be useless.** The stump, the mailbox, the clipboard. A retro UI
   earns its character partly from ornament that does nothing, which is exactly what our previous
   system forbade.

Two notes on texture and palette that the laws above would otherwise overstate. The halftone dot
mesh lives on the PURPLE bands and the chalk lines on the turf (1); they are not one all-over page
texture. And teal appears in none of the six images: `--accent` keeps it because Cornerstone Teal
is a category in our own framework, not because the reference has it.

**Inventoried and not yet built**, listed so the next pass does not rediscover them as new: the
team-colored banner with a logo lens, a letterspaced subtitle and a ghosted watermark (3, 6); the
twin green dot-matrix panels flanking a black message ticker as one three-part strip (3, 6), where
the build currently has a single panel; circular arrow chips flanking a header, plus the oversize
gold chevrons and the gold progress-dot row (3, 4, 6); brushed metal, whose `--grad-metal` and
`--endzone` tokens exist and are referenced by nothing; and bounds-breaking overhang, where a badge
or a name overflows its own plate edge (1, 4).

## Palette extracted

| Role | Reference value | Notes |
|---|---|---|
| Panel | `#8f8fd0` to `#a5a5dd` periwinkle | The signature chrome color across four of six screens |
| Panel alt row | `#e8e8f6` near-white lavender | Table row alternation |
| Turf | `#2f8f2f` to `#49b049` kelly | Ground and diagram bodies |
| End zone | `#3a2a7a` purple | Menu ground, carries the halftone |
| Selected | `#ffd42a` gold | Selection, titles, chevrons, progress dots |
| Alert / brand | `#d81f26` red | `CHARGE!`, script labels, badge strips |
| Route / accent | `#f5e050` yellow | Diagram polylines |
| Text on panel | `#1a1f4d` deep navy | Table values, body copy |
| Outline | `#0d0f1a` near-black | The 2 to 4px plate outline, on everything |
| Metal | `#8d97a8` to `#c6ced9` | Brushed slab gradients |
| Wood | `#6b4423` to `#8f6b3f` | Carousel frames |
| LED | `#4dff4d` on `#0a1a0a` | Dot-matrix panels |

## Mapping to our components

Our current system is documented in [DESIGN.md](DESIGN.md) as "Tier Sheet": dark obsidian ground,
teal accent, flat by default, color carries meaning. The table below is the translation, component
by component, using the section names from DESIGN.md section 5.

| Our component | Backyard motif | Change required |
|---|---|---|
| Buttons | Menu row buttons, `CHANGE PLAYBOOK` | Vertical gradient, 2px outline, inner top highlight. Selected and primary become gold with black text |
| Pills (category badges) | Circular position badges | Circular badge with an outline, not a soft rounded pill |
| Tier Chips | Numbered `1 2 3 4 K` chips | Square chips with a hard outline, gold when active |
| Cards / Containers | Every lavender panel | Thick outline plus an inner border, hard bevel, retire `--shadow-2` on cards |
| Data Tables | Game Summary table | The big one. 2 to 3px light gridlines, alternating row fills, quiet small-caps header row, chunky centered values |
| Strength Bar (signature) | Segmented green meter | Convert from continuous to segmented. Keeps the signature and gains the retro read |
| Sidebar Navigation | Season hub folder tabs | Tabs border-joined to the panel, active tab lighter and connected |
| Inputs / Fields | Play-call micro tables | Label above value, label small caps and quiet |
| Cmd+K Palette | Main Menu list | Gold selected row with black text, replacing the current hover tint |
| (new) App shell | Black ticker plus LED panels | A persistent bottom chrome strip. This is where the build-info stamp and the freshness badge belong |
| (new) Rating track | Five-football attribute rows | Discrete countable tracks for anything currently shown as a 0 to 100 score |
| (new) Ground texture | Halftone plus tiled watermark | One texture layer on the page ground, not on every panel |

## Conflicts to resolve before building

The reference contradicts four standing rules in DESIGN.md and one in the repo `CLAUDE.md`. These
are not oversights in the reference, they are the aesthetic. Each needs an explicit decision, and
DESIGN.md has to be rewritten in the same change as the code, or the next session will revert the
work to the old standard.

1. **"No decorative gradients"** versus law 2, where nothing is flat. The reference cannot be
   built without gradients.
2. **"Flat by default"** versus law 1, where every surface is an outlined plate.
3. **"Color carries meaning"** versus gold-as-selection and periwinkle-as-chrome, which are
   decorative uses of strong color.
4. **Dark obsidian ground** versus a light periwinkle and green ground. This is the largest single
   decision in the refactor and everything else follows from it.
5. The repo `CLAUDE.md` house style repeats "flat-by-default, no decorative gradients" under
   "House style for code", so that block needs the same edit.

A middle path exists and is worth considering first: keep the dark ground and the teal accent,
adopt laws 1, 3, 4, 5, 7 and 8 (plates, gold selection, discrete ratings, label hierarchy,
physical navigation, ticker chrome), and skip the periwinkle palette entirely. That gets most of
the retro character without a full palette inversion, and it keeps every existing contrast ratio
intact.

## Suggested refactor order

Each step is independently shippable and each one ends with the same gate.

1. Tokens. Add the plate, gradient, outline, and gold-selection tokens to `css/styles.css` beside
   the existing oklch set. Change nothing else.
2. Primitives. Buttons, chips, badges, cards. Highest visual return per line changed.
3. Tables. The Game Summary treatment on `table.data`. This is the screen Trevor looks at most.
4. Strength bar to segmented, and add the rating track for score-style numbers.
5. Navigation. Folder tabs and the persistent bottom ticker chrome.
6. Ground texture and the display-type lockup for page titles.
7. Rewrite DESIGN.md section 6 and the `CLAUDE.md` house-style block to match what shipped.

Gate for every step, from the repo `CLAUDE.md`:

```
node --check site/js/app.js
python ../.agents/scripts/verify-app.py "Fantasy Football"
```

A visual refactor that trips a feature assertion or a console error is not done, and the 26 mapped
features are the only thing standing between a restyle and a broken view.
