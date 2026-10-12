---
name: Backyard
description: A dynasty fantasy football tier sheet, live and overlaid on every league you run.
colors:
  gold: "#ffd42a"
  gold-deep: "#e0a915"
  ink: "#12131f"
  band: "#7b7bc4"
  band-deep: "#4f4f96"
  panel: "#e9e9fa"
  panel-alt: "#d5d5f0"
  periwinkle: "#b9b9e4"
  turf: "#3f9f43"
  turf-deep: "#2c7a31"
  endzone: "#3a2a7a"
  chalk: "#ffffff"
  navy: "#1f2450"
  navy-soft: "#343a6b"
  label: "#4d5488"
  caption: "#5f669b"
  cornerstone-teal: "#0d767c"
  foundational-blue: "#2842b0"
  upside-green: "#1a7a54"
  tier-s-amber: "#966a10"
  vet-orange: "#9e5418"
  depreciating-red: "#a82a22"
  led: "#4dff6a"
  led-bg: "#0a1a0e"
  wood: "#7a5a2e"
  metal: "#c6ced9"
typography:
  page-title:
    fontFamily: "'Baloo 2', 'Arial Rounded MT Bold', ui-rounded, 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  card-title:
    fontFamily: "'Baloo 2', 'Arial Rounded MT Bold', ui-rounded, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.09em"
  body:
    fontFamily: "Nunito, ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.94rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "'ss01', 'cv11'"
  numeric:
    fontFamily: "Nunito, ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  micro-label:
    fontFamily: "Nunito, ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.07em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gold-deep}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.gold-deep}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-default:
    backgroundColor: "{colors.panel-alt}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "{colors.turf}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.navy}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.panel-alt}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  pill-cornerstone:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.cornerstone-teal}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-foundational:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.foundational-blue}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-upside:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.upside-green}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  tier-chip-s:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.tier-s-amber}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-a:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.cornerstone-teal}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-b:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.foundational-blue}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-c:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.upside-green}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-d:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.label}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
---

# Design System: Backyard

## 1. Overview

**Creative North Star: "The Backyard Tier Sheet"**

A dynasty tier sheet rebuilt as a late-90s sports-game interface. Every surface is a physical plate
stamped with a near-black outline, the ground is turf rather than a page, and selection is a gold
fill you can see across a room. The reader is still an analyst mid-week, but the console he is
sitting at is a Dreamcast, not a terminal.

### Which file wins

1. **`css/styles.css`** is the source of truth for every value: colors, gradients, shadows, radii,
   breakpoints, motion. If this file and the CSS disagree on a value, the CSS is right and this file
   gets fixed.
2. **This file (`DESIGN.md`)** is the standard: the rules, the named patterns, and which exceptions
   are allowed. It wins over everything below it.
3. **[PRODUCT.md](PRODUCT.md)** owns who the users are, what the product is for and its truthful
   scope. It wins on purpose and audience; this file wins on visuals.
4. **`.impeccable/design.json`** is generated from this file and the CSS for the Impeccable panel.
   Regenerate it when either changes; never hand-edit it into disagreement.
5. **`CLAUDE.md` and `AGENTS.md`** carry short summaries for agents. They are subordinate: where a
   summary disagrees with this file, the summary is stale. Old names in them (Cornerstone Violet,
   Obsidian, Flat-By-Default) describe the retired theme.

The reference world is inventoried screen by screen in
[BACKYARD-INVENTORY.md](BACKYARD-INVENTORY.md), including the IP boundary. Read that file before
adding a component. This file is the standard; that file is the evidence behind it.

This replaced the previous "Tier Sheet, Live" standard on 2026-09-15, which called for
graphite-on-obsidian surfaces, flat-by-default elevation, and no decorative gradients. Those three
rules are now reversed on purpose. Anything in the repo still asserting them is stale.

The aesthetic still rejects three things, and the list has not changed: Sleeper's mobile-first
mascot energy, ESPN and Yahoo's ad-shaped portal clutter, and the generic SaaS gradient hero. The
retro direction is a specific historical register, not a licence for decoration in general. A
plate, a bevel and a gold selection are the vocabulary. A purple marketing gradient is still wrong.

**Key characteristics:**
- Light and loud. Turf ground, lavender plates, navy ink, gold selection.
- Every surface is an outlined plate. A 2px near-black edge plus a hard bevel, on everything.
- Nothing is flat. Every fill is a vertical gradient or a texture.
- Selection is a gold fill swap with ink text, with two named exceptions (folder tabs and
  meaning-colored jump tabs, below). Never a tint, never a stripe, never an underline.
- Ratings are discrete and countable. Five pips or a segmented meter, not a percentage.
- Labels are quiet small caps, values are chunky. The label never competes with the number.
- Chrome is physical. Folder tabs, stamped chips, an LED panel for the freshness readout.
- Phone and desktop are both real. Cmd+K is canonical on a keyboard; thumb reach and swipe on a
  phone.

## 2. Colors: the Backyard palette

Four families: **turf** as the ground, **lavender and periwinkle** as the plates and their header
bands, **gold** as selection, and the **six semantic hues** as category and tier meaning.

### Primary

- **Gold** (#ffd42a, deep #e0a915) is the selection color of the entire system. A selected menu
  row, the sorted table column, the active tab, his own team's row, the active nav item, a page
  title fill. If something is chosen, it is gold with ink text. This is the single loudest rule in
  the system and the one that most cheaply produces the reference's feel.
- **Ink** (#12131f) is the outline on every plate and the text on every gold fill. Near-black on
  purpose: a softer outline reads as a modern web card, and the plate is the aesthetic.

### Surfaces

- **Turf** (#3f9f43, deep #2c7a31) is the page ground, drawn as pixel art since 2026-10-04 (after
  the Eagles Eric video, `notes/design/`): four hard vertical bands instead of a blend, a 2px
  checker dither, hard mow stripes, chalk yardlines, and 5x7 bitmap yard numerals with a pixel
  arrow toward the nearer goal line, on the bottom sideline only (the top row sat behind every
  page header). `site/check-field-tile.py` guards the geometry.
- **Panel** (#e9e9fa) is the card and plate face. Light enough that navy ink clears AA on it.
- **Panel Alt** (#d5d5f0) is the even table row and the default button face.
- **Periwinkle** (#b9b9e4) is chip backgrounds.
- **Band** (#7b7bc4, deep #4f4f96) is the header band across a card or a table head, always with
  chalk text on it. Every panel in the reference announces itself with one.
- **Chalk** (#ffffff) is gridlines, yardlines, and text on a band.

### Text

- **Navy** (#1f2450) is primary text, about 11.5:1 on Panel.
- **Navy Soft** (#343a6b) is body text in tables and paragraphs.
- **Label** (#4d5488) is secondary text and captions, about 6.0:1 on Panel.
- **Caption** (#5f669b) is tertiary text and disabled state, about 4.6:1 on Panel.

### Semantic hues

Cornerstone Teal (#0d767c), Foundational Blue (#2842b0), Upside Green (#1a7a54), Tier-S Amber
(#966a10), Vet Orange (#9e5418), Depreciating Red (#a82a22). In the CSS every one sits between 40%
and 45% OKLCH lightness. The old theme ran these at 74% to 84% for a dark ground; at that lightness they are
invisible on lavender, which is why the inversion had to move all six and not just the surfaces.

### Scoreboard hues

LED (#4dff6a on #0a1a0e), Wood (#7a5a2e) for rating pips, Metal (#c6ced9) for brushed slabs. These
are chrome, not meaning. They appear in the freshness panel and the rating tracks only.

### Named rules

**The Gold-Selection Rule.** Gold plus ink text is the selected state for rows, nav, the Cmd+K
result, the sorted column, primary and pressed buttons, and the user's own team. A 6% tint of an
accent hue was the old answer and it was unreadable on a phone in daylight.

Exactly two exceptions, and no others:

- **Folder tabs select by lightening.** `.tab` and `.cchart-tab` go to a lighter lavender face with
  navy text, matching the reference's roster and PLAYERS tabs. The tab is part of the panel below
  it, so it takes the panel's face, not gold. (`CLAUDE.md` says the same; it agrees with this.)
- **Jump tabs over a meaning-colored strip take that meaning's color.** On What to Look For, the
  phone jump bar's active tab fills with its panel's plate color (green, amber or red, below) and
  chalk text, so the tab and the plate it scrolls to read as one thing. The tab label always shows.

A new selected state that is neither of these is gold.

**The Three-Pillar Rule** still holds. Cornerstone Teal, Foundational Blue and Upside Green are the
three category pillars. They appear as a triad or alone with role meaning. Never a fourth.

**The No-Decorative-Hue Rule** still holds for the six semantic hues. Lavender, periwinkle, turf,
gold, chalk and ink are chrome and may be used structurally. Teal, blue, green, amber, orange and
red always mean something: a category, a tier, or, on panels that sort players by whether they help
the user, for (green), mixed (amber) and against (red). League identity colors (`--lg`) are data
labels that always sit beside the league name; they are not part of the palette.

**The Gradient Rule, inverted.** Every fill is a vertical gradient: panels, buttons, bands, gold,
turf. They are defined once as `--grad-panel`, `--grad-btn`, `--grad-band`, `--grad-gold`,
`--grad-metal` and `--grad-turf`, and a component uses one of those rather than writing its own.
The one standing exception is the lightened folder-tab face, which is written in two places
(`.tab.active`, `.cchart-tab.active`) and should become a token the next time either is touched.
A bespoke gradient in a component is the thing to avoid now, not gradients themselves.

## 3. Typography

**Display font:** Baloo 2 (`--font-display`), rounded and heavy, on page titles, card bands and
callouts. **Body font:** Nunito (`--font-body`). Weights run heavy (700 to 800; Baloo 2 loads 600 to 800
only, so a 900 renders as 800). The reference
has no thin type. The frontmatter's system-sans entries above predate both and are fallbacks only.

**Pixel font:** Jersey 10 (`--font-pixel`), and only for the numbers a scoreboard would show: the
strength score, the player card number band, and the LED freshness panel. Never body copy, labels
or dense table cells. It has one weight, so `font-synthesis: none`; it ships tabular figures.

**Numeric font:** whichever face the role uses, with `font-variant-numeric: tabular-nums` enforced.

**Pixel icons:** nav and Cmd+K icons are 9x9 bitmaps drawn as SVG rects at 2px a cell
(`PIXEL_ICONS` in app.js), one grid and one weight for all of them.

**Character:** the personality now lives partly in the type, which is a change. Page titles are
gold, title case, with a 2px ink stroke via `-webkit-text-stroke` and a hard drop shadow, sitting
on a band-gradient pill plaque with a 3px ink border. That is the reference's titles-on-a-plaque,
done with live text so it stays selectable, translatable and responsive.

### Hierarchy

- **Page Title** (800, 1.6rem, 1.25rem on phones, title case, gold fill, 2px ink stroke, hard
  shadow, on a pill plaque): one per route.
- **Card Title** (800, 0.72rem, uppercase, 0.09em tracking, chalk on a band): every card header.
- **Body** (400 to 600, 0.94rem, line-height 1.5): paragraph copy and table cell text.
- **Numeric** (700 to 800, tabular-nums): scores, ranks, percentages, grades.
- **Micro-Label** (700, 0.68rem, uppercase, 0.07em tracking): column headers, stat labels.

### Named rules

**The Tabular Numbers Rule** is unchanged. Anything quantitative renders tabular.

**The Uppercase-as-Metadata Rule** holds. Page titles are title case, like the reference's "Main
Menu" and "Game Summary"; all caps there is reserved for team wordmarks. Player names, team names and body copy are never
uppercase.

**The Stroke-Is-For-Titles Rule.** `-webkit-text-stroke` appears on `.page-title` and
`.section-title` and nowhere else.
Stroked body text is unreadable at small sizes and stroked labels turn a table into a poster.

**The 65 to 75ch Rule** is unchanged for body copy.

**The One-Pixel-Face Rule.** Baloo 2, Nunito and Jersey 10 are the three families, which is the
ceiling. A second pixel face, or pixel type on body copy, breaks it.

## 4. Elevation

**Stamped-by-default.** Every plate carries an outline, a bevel and a hard 2px drop. Depth comes
from the edge treatment rather than from a tonal ramp or a blurred shadow.

The bevel is the load-bearing part: `--bevel` is a 2px white inner rim, a brighter top highlight
and `inset 0 -2px 0 rgba(0,0,0,.16)` on the bottom, so the surface reads as stamped rather than
drawn. Use the token; the exact stops live in the CSS.

### Shadow vocabulary

- **Plate drop** (`0 2px 0 rgba(0,0,0,.28)`, token `--shadow-1`): every card, button and chip.
- **Lifted plate** (`0 4px 0 rgba(0,0,0,.32)`, token `--shadow-2`): modals, and his own team's row.
- **Bevel** (`--bevel`) and **inset bevel** (`--bevel-in`): raised and recessed surfaces. Inputs,
  the LED panel and a pressed button use the inset form.
- **Focus** (`0 0 0 3px var(--gold), 0 0 0 5px var(--ink)`, token `--shadow-glow`): a gold ring
  inside an ink ring. Visible on turf, on lavender and on gold.

### Named rules

**The No-Blur Rule.** Shadow offsets are hard, with zero blur radius. A blurred shadow is the
single tell that gives a retro plate away as a modern card. The only sanctioned blur is the modal
scrim. Known violation to fix, not to copy: the trade preview card
(`.trade-middle.preview .trade-middle-card`) still has a 28px blurred accent glow.

**The Press-Travels Rule.** A pressed button moves `translateY(2px)` and swaps to the inset bevel,
so it looks physically depressed. This replaces the old 1px nudge and it is the only interaction
feel tic in the system. No bounces, no scales, no color flashes.

## 5. Components

### Buttons

- **Shape:** small radius (6px). Never pill-shaped, never sharp-cornered.
- **Default:** `--grad-btn` face, 2px ink border, navy text, bevel plus plate drop, weight 700.
- **Primary, active, and `aria-pressed="true"`:** `--grad-gold` face, ink text, white top
  highlight on the text. These three selectors are deliberately styled as one thing, because
  primary and selected are the same visual idea in this system.
- **Ghost:** transparent, no border, no shadow. On hover it gains a white wash and an ink border.
- **Press:** `translateY(2px)` plus the inset bevel.

### Pills (category badges)

- **Style:** pill radius, 2px ink border, the category hue as the fill, weight 800, 0.68rem.
  Stamped, not tinted: the old 8%-alpha fill does not survive on a light ground.
- **Variants:** one per player category. Hue is never the only signal; the label always shows.

### Tier Chips

- **Style:** square with a 4px radius, 2px ink border, weight 900, single uppercase letter.
- **Behavior:** the letter is non-negotiable. Hue is reinforcement. A color-blind reader sees the
  letter identically.

### Cards / Containers

- **Corners:** medium radius (10px).
- **Face:** `--grad-panel`.
- **Border:** 2px ink, plus the bevel and the plate drop. Not flat at rest; see Elevation.
- **Header:** a `--grad-band` title bar bled 4px past the card padding, chalk text.
- **Padding:** 14px.

### Inputs / Fields

- **Style:** chalk background, 2px ink border, inset bevel, weight 600 text. The recessed
  counterpart to a button's raised plate.
- **Focus:** the gold-in-ink double ring.

### Sidebar Navigation

- **Style:** 240px left rail on `--grad-panel` with a 3px ink right edge.
- **Default link:** navy text, 2px transparent border. Hover adds a white wash and an ink border.
- **Active link:** gold fill, ink text, weight 800. The old 12%-alpha tint plus inset violet
  stripe is gone, and with it the system's one ribbon affordance.

### Data Tables

The signature surface, modeled on the reference's Game Summary panel.

- **Head:** `--grad-band` with chalk text, 3px ink bottom border, uppercase micro-label voice.
- **Sorted column:** gold head with ink text. The color swap is still the sort signal.
- **Rows:** 2px **chalk** bottom borders and alternating panel and panel-alt fills. Thick light
  separators are what make the table read as stitched plates rather than a spreadsheet.
- **"You" row:** a full gold gradient fill with ink text at weight 700.
- **Numeric columns:** tabular-nums, right-aligned where natively numeric.

### Strength Bar (signature component)

Still a 4-column grid: rank, team identity, score, bar. The bar is now the reference's segmented
roster meter (`.seg-meter`): an LED-green fill cut into discrete 6px cells inside an ink-bordered
recessed track. Same geometry as the old continuous gradient bar, so nothing reflows.

### Rating Track (new)

Five pips (`.rating-track`), filled in wood tone, empty in near-white, each with a 1.5px ink
border. This is the reference's five-football attribute row and it is the preferred rendering for
any 0-to-100 score on the face of a card. It is instantly countable and refuses false precision.
A percentage is still fine inside a table cell, where precision is the point.

### Tab Bar

Folder tabs. Each tab is a `--grad-btn` plate with a 2px ink outline and no bottom border, top
corners rounded. The active tab lightens to the panel's own lavender face (the folder exception to
gold), which is what joins it to the panel below. The old 3px ink bar under the row was removed on
purpose: it ran across the turf as a detached black line and forced a scrollbar on a 46px row.

### UI patterns

Shipped patterns that new views reuse rather than reinvent. Each one names where it lives today.

**Dense phone summary.** The page sub is one short line with the count that matters ("Week 6, 5
leagues, weighted by buy-in."). Longer explanation moves into the collapsible key or help block. On
a phone, the first screen shows the answer, not the legend.

**Compact buy-in key.** The league key (league color, name, buy-in, opponent) is a `<details>` box:
open by default above 560px, collapsed on phones to one summary line of colored dots plus "N
leagues, buy-ins and opponents". Weighting notes and what was left out (tanking, unknown buy-in)
live inside it. League colors always sit next to the league name. (`.watch-key-box`)

**Sideways panel strip.** At 760px and below, a set of peer panels becomes one horizontal
scroll-snap strip: panels 88% wide so the next one peeks, each panel's rows scroll on their own
inside a capped height, `overscroll-behavior-x: contain` so the strip never drags the page. A jump
bar above it holds one tab per panel with its row count and a "swipe" cue; tapping scrolls the strip,
scrolling updates the active tab. Wider screens keep the plain grid. (`.watch-panels`,
`.watch-tabs`)

**Meaning-colored panel badges.** When panels sort players by whether they help or hurt the user,
the card-title plate takes that meaning: green for rooting for, amber for good and bad, red for hate
watching. Chalk text, ink outline, and the panel title always present, so color is never the only
signal. (`.watch-root`, `.watch-split`, `.watch-hate`)

**Help that does not bury the data.** Full methodology goes in an expandable help block next to
the view. What a reader needs to read the chart correctly stays visible without a tap: caveats
("drafted rows are not blind forecasts"), what each axis measures, and a key for every reference
line (average, replacement, trend). A line with no legend is unfinished.

**Zoomable headshot scatter.** Charts with many players support pinch and Ctrl+scroll zoom and
drag to pan, and always offer visible buttons (+, minus and Reset view, with aria-labels Zoom in,
Zoom out and Reset zoom), so no gesture is required. Known gap: Reset's spoken name should match its
visible text. Unzoomed, one finger scrolls the page; zoomed, it pans the chart, and a
pinch never zooms the page. Zoomed in, dots become headshots that spread apart to avoid overlap.
(Prospects scatter, `.chart-zoom`)

**Full-bar row highlight.** A highlighted row (a future prospect, the user's own team) fills the
whole row, not one cell or a left stripe, so it reads at arm's length on a phone. The user's own
row is gold. A future-class prospect row gets a full-row slate face with a diagonal hatch, a thick
dashed ink edge and an ink "Future" tag before the school, not a hue, so blue keeps meaning
Foundational and gold stays selection, and the legend line names it. A plain grey wash was tried
first and vanished next to the lavender row stripes. (`tr.prm-future`, `.prm-future-tag`,
`.prm-future-key`)

**Recent-class presets.** Class pickers offer "Last 5 + future" and "Last 10 + future": the latest
N drafted classes anchored on the newest one, plus every future (not yet drafted) class, whose rows
show their stand-in pick in italic. A preset is a filter, not a different model.

**Vertical phone field.** At 720px and below the turf field runs up and down the screen, sized to
at least the viewport height, with the content and midfield logo upright. Never a sideways page
scroll; the only horizontal motion on a phone is a labeled strip like the one above.

### Freshness Panel

The data-freshness footer in the sidebar is the reference's LED dot-matrix panel: an ink-bordered
recessed plate, near-black green ground with a 4px dot mesh, LED-green Jersey 10 pixel text,
and a glowing status dot. Same element and same click target as before.

### Cmd+K Palette

Unchanged in behavior. Visually a 3px-ink-bordered `--grad-panel` plate on a dimmed backdrop, with
the highlighted result row in gold with ink text.

## 6. Do's and Don'ts

### Do:

- **Do** make tabular-nums the default for any column with numbers.
- **Do** use gold plus ink text for every "this one is selected" and "this one is yours" cue. The
  user is the gold thread through the data.
- **Do** put a 2px ink border and a bevel on any new surface. A borderless panel does not belong.
- **Do** pair every tier color with the tier letter at full opacity.
- **Do** use one of the six `--grad-*` tokens rather than writing a new gradient in a component.
- **Do** reach for `.rating-track` or `.seg-meter` before printing a bare 0-to-100 score on a card.
- **Do** keep shadow offsets hard and blur at zero.
- **Do** prefer OKLCH for new colors; the hex frontmatter above is the approximation, and
  `css/styles.css` is the source of truth.
- **Do** keep Cmd+K discoverable on every page.

### Don't:

- **Don't** use a blurred drop shadow on a plate. Hard offsets only.
- **Don't** express selection as an alpha tint, a left stripe, or an underline. Gold fill or
  nothing.
- **Don't** put `-webkit-text-stroke` on anything except `.page-title` and `.section-title`.
- **Don't** introduce a fourth pillar color, or a "warning teal" / "info teal."
- **Don't** apply glassmorphism, backdrop-blur, or frosted panels. A plate is opaque.
- **Don't** add bounce, elastic, spring, or scale-in animations. Interaction feedback (hover,
  press, background swaps) runs 80 to 120ms; a data bar may grow once on load at 240 to 360ms
  ease-out. The reference has snap. Known violations to fix, not to copy: `.br-grade-fill` and
  `.trade-middle-card` use an overshooting cubic-bezier.
- **Don't** use em dashes anywhere. Use commas, colons, or periods.
- **Don't** copy, trace, or approximate anything owned from the reference: the Backyard Football
  and BFU marks, the kid characters, the NFL shield, any team logo, or the italic
  "BACKYARD FOOTBALL" strip. The grammar is takeable, the assets are not. See
  [BACKYARD-INVENTORY.md](BACKYARD-INVENTORY.md).
- **Don't** make this look like Sleeper. Retro game chrome is not mascot energy, and the line is
  that our ornament is hardware and stationery, never a cartoon character.
- **Don't** make this look like ESPN or Yahoo. No ad-shaped containers, no tab-bar overload.
- **Don't** make this look like a generic SaaS landing page.
- **Don't** nest cards inside cards. A plate inside a plate is twice the outline and half the
  clarity; the outer one should be a layout region with no card chrome.
- **Don't** let a restyle move layout. The features mapped in `.agents/feature-map.json` are the
  contract, and `verify-app.py` is how you find out.
