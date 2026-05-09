---
name: Tier Sheet
description: A dynasty fantasy football tier sheet, live and overlaid on every league you run.
colors:
  cornerstone-violet: "#a78bfa"
  cornerstone-violet-bright: "#c4b5fd"
  cornerstone-violet-deep: "#5b21b6"
  foundational-sky: "#60a5fa"
  upside-mint: "#34d399"
  tier-s-amber: "#fbbf24"
  vet-orange: "#fb923c"
  depreciating-red: "#f87171"
  obsidian: "#0b0d12"
  graphite: "#11141b"
  slate: "#161a23"
  pewter: "#1e2330"
  edge: "#262d3d"
  edge-hot: "#3a4258"
  porcelain: "#f3f4f6"
  bone: "#d4d8e0"
  fog: "#9ca3af"
  ash: "#6b7280"
typography:
  page-title:
    fontFamily: "ui-sans-serif, -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  card-title:
    fontFamily: "ui-sans-serif, -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.94rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "'ss01', 'cv11'"
  numeric:
    fontFamily: "ui-sans-serif, -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  micro-label:
    fontFamily: "ui-sans-serif, -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
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
    backgroundColor: "{colors.cornerstone-violet-deep}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.cornerstone-violet-deep}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-default:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "{colors.obsidian}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  pill-cornerstone:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.cornerstone-violet}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-foundational:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.foundational-sky}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-upside:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.upside-mint}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  tier-chip-s:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.tier-s-amber}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-a:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.cornerstone-violet}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-b:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.foundational-sky}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-c:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.upside-mint}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
  tier-chip-d:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.fog}"
    rounded: "{rounded.sm}"
    padding: "0"
    width: "22px"
    height: "22px"
---

# Design System: Tier Sheet

## 1. Overview

**Creative North Star: "The Tier Sheet, Live"**

This is what a printed dynasty tier sheet would become if you let it watch your rosters. Surfaces stay close to the page (graphite-on-obsidian, no glassy noise, no decorative gradient), category color is the only flourish, and the only thing that ever moves is data. The reader is an analyst at a console mid-week, not a fan scrolling on the couch. Every screen is a working document; nothing performs.

The aesthetic explicitly rejects three things: Sleeper's mobile-first cartoon-mascot energy, ESPN/Yahoo's ad-shaped portal clutter, and the generic SaaS purple-gradient hero that signals "AI-tool landing page." Cornerstone Violet is a category, not a marketing accent. We do not paint it onto buttons for personality.

**Key Characteristics:**
- Dark by default. The user is at a desk, mid-week, often at night.
- Color is meaning. Every accent maps to a tier or a category. None are decoration.
- Density over generosity. Tight rows, compact pills, monospace numbers, no card padding theatre.
- Chrome disappears. Borders, shadows, and containers earn their place by separating real things.
- Keyboard is the front door. Cmd+K is canonical, not an afterthought.

## 2. Colors: The Tier Sheet Palette

A four-temperature system: cool obsidian as the page; the **three-pillar accent triad** (Cornerstone / Foundational / Upside) as category meaning; **tier-amber** and **vet-orange** as warm callouts; **depreciating-red** as a warning. Saturation stays mid-range — never neon, never washed out — because tier sheets are read for hours.

### Primary

- **Cornerstone Violet** (#a78bfa) — the anchor accent. Used for the highest-conviction player category, primary buttons (deep variant), the active sidebar nav stripe, the brand logo, focus rings, and "you" highlights in league tables. It is *the* color of the system. Bright (#c4b5fd) is the link/hover hot variant; deep (#5b21b6) is the press-state and primary button surface.

### Secondary

- **Foundational Sky** (#60a5fa) — the second pillar category. Tier B chip color. Used in the strength-bar gradient that pairs Cornerstone → Foundational across team strength visualizations.
- **Upside Mint** (#34d399) — the third pillar category. Tier C chip. Also the *up-arrow / positive delta* color in stat blocks; rookie badges. The only green allowed.

### Tertiary

- **Tier-S Amber** (#fbbf24) — top-of-everything signal. Used for the S tier badge, the Mainstay category, and a rare "this is the best you've got" callout. Never used for ordinary status.
- **Vet Orange** (#fb923c) — productive_vet category only.
- **Depreciating Red** (#f87171) — danger, sell signal, depreciating badge, down-arrow stats. Never used for emphasis on neutral content.

### Neutral

- **Obsidian** (#0b0d12) — the page itself. The bottom of every elevation stack.
- **Graphite** (#11141b) — card and sidebar surface. The first lift off the page.
- **Slate** (#161a23) — input and default-button background. Interactive surfaces sit one tonal step above Graphite.
- **Pewter** (#1e2330) — chip backgrounds; the "this is data, not surface" tone.
- **Edge** (#262d3d) — every divider, every default border.
- **Edge Hot** (#3a4258) — the active/hovered border tier. Reserved for "this thing is live."
- **Porcelain** (#f3f4f6) — primary text. High contrast on every dark surface.
- **Bone** (#d4d8e0) — body text in tables and paragraphs. One step softer than Porcelain.
- **Fog** (#9ca3af) — secondary text, captions, owner names.
- **Ash** (#6b7280) — tertiary text, disabled state, oh-by-the-way labels.

### Named Rules

**The Three-Pillar Rule.** Cornerstone Violet, Foundational Sky, and Upside Mint are not three accents that happen to be close. They are *the* three category pillars. They appear as a triad together (in the strength bar, in the legend, in the category filter group) or they appear alone with role-meaning. Never mix in a fourth pillar color unless you are adding a fourth player category to the framework.

**The No-Decorative-Color Rule.** If a hue appears on screen, it is communicating a category or a tier. There is no "we needed something to break up the gray." Break up the gray with hierarchy and density, not paint.

**The Anti-Gradient Rule.** Two gradients exist in the system: the brand-logo lozenge (Violet → Sky) and the team-strength bar (same). Both encode the pillar pairing. Do not introduce a third. Especially not on a button, never on a hero, never as a text fill.

## 3. Typography

**Display & Body Font:** the system sans stack — `ui-sans-serif, -apple-system, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif`. One family, every weight.

**Numeric Font:** the same stack with `font-variant-numeric: tabular-nums` enforced. Every score, rank, percentage, and grade lines up vertically — that's the whole point of a tier sheet.

**Character:** the body voice is the operating-system voice — neutral, fast, native. Type is not the personality; the data is. Two stylistic features (`ss01`, `cv11`) are turned on globally, which gives the sans a slightly sharper one-storey 'a' and a less-rounded 'g' — small editorial signature inside an otherwise standard stack.

### Hierarchy

- **Page Title** (700, 1.6rem, line-height 1.2, letter-spacing -0.015em): one per page, top-left, defines the route.
- **Card Title** (600, 0.95rem, letter-spacing 0.05em, **uppercase**): every card, every panel header. The constant rhythm element across every screen.
- **Body** (400, 0.94rem, line-height 1.5): paragraph copy and table cell text.
- **Numeric** (700, tabular-nums, letter-spacing -0.02em): scores, ranks, percentages, grades. Always tabular.
- **Micro-Label** (600, 0.75rem, letter-spacing 0.06em, **uppercase**): table column headers, nav-section titles, stat-pill labels. The "this is metadata" signal.

### Named Rules

**The Tabular Numbers Rule.** Anything quantitative renders in tabular-nums. Stats, scores, pick numbers, percentages, grades, ranks, ages. Non-tabular numbers in a tier sheet are visual chaos.

**The Uppercase-as-Metadata Rule.** ALL CAPS is reserved for *labels about the data*, never for the data itself. Card titles, column headers, nav sections, micro-labels — yes. Player names, team names, body copy — never.

**The 65–75ch Rule.** Body copy never exceeds 75 characters per line. Long-form (game notes, blueprint commentary, README-style prose) caps at 65–75ch even if the parent grid is wider.

## 4. Elevation

**Flat-by-default with state-driven lift.** The page is a stack of tonal surfaces (Obsidian → Graphite → Slate → Pewter), and that ramp does almost all of the depth work. Shadows are not the default lift between layers; the tonal step is.

Two specific surfaces use a small, ambient inner-highlight + drop combination, *only because they functionally float*: the sticky table headers (which the user scrolls past) and the brand-logo lozenge (which is structurally a floating mark). One additional shadow exists as a focus-state response: a violet ring + halo on hover/focus of high-conviction interactive elements.

### Shadow Vocabulary

- **Surface lift** (`box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.3)`): sticky surfaces and the brand mark. Functional, never decorative.
- **Hover lift** (`box-shadow: 0 4px 12px rgba(0,0,0,0.4)`): reserved for elements you actively pick up (modal trigger surfaces, draggable trade slots, popover anchors). Not used on rest-state cards.
- **Focus glow** (`box-shadow: 0 0 0 1px var(--cornerstone-violet), 0 0 20px rgba(167,139,250,.18)`): focus-visible state on primary interactive elements. Doubles as keyboard-navigation feedback.

### Named Rules

**The Flat-By-Default Rule.** Cards, rows, and panels at rest have no drop shadow. Their separation is the tonal step (Graphite on Obsidian, Slate on Graphite). If you find yourself reaching for `box-shadow` on a static card, you wanted a tonal step instead.

**The Functional-Shadow Rule.** Every shadow in the system answers a functional question — *am I sticky, am I focused, am I being picked up?* Decorative ambient shadows under cards "just to give them dimension" are forbidden.

## 5. Components

### Buttons

- **Shape:** small radius (6px). Never pill-shaped, never sharp-cornered (0px). Pills are reserved for category badges; sharp corners are a different aesthetic register.
- **Default:** Slate (#161a23) background, Edge border, Porcelain text, 6×12px padding. The neutral utility button.
- **Primary:** Cornerstone-Violet-Deep (#5b21b6) background, Cornerstone-Violet border, Porcelain text. Reserved for the *single primary action per screen* — committing a trade, importing a CSV. Not for "Cancel" / "Apply filter" / "Export."
- **Ghost:** transparent background, no border, Porcelain text. Tertiary actions inside dense rows.
- **Hover:** background lifts one tonal step (Slate → bg-hover #232938), border shifts to Edge-Hot. 120ms transition on background and border-color, 80ms on press translate.
- **Press:** `transform: translateY(1px)`. The only interaction "feel" tic in the system; do not add bounces, scales, or color flashes.

### Pills (category badges)

- **Style:** pill radius (999px), 1px border in the category color at 40% alpha, fill in the same color at 8% alpha, text in the category color at 100%. Tiny: 0.75rem, weight 600, 2×8px padding.
- **Variants:** one per player category — Cornerstone (violet), Foundational (sky), Upside (mint), Mainstay (amber), Productive Vet (orange), Short-Term Win (red).
- **Behavior:** always paired with the category label or icon. Hue is never the only signal. Pills are not buttons; do not give them hover states.

### Tier Chips

- **Style:** 22×22 square, 6px radius, weight 700, single uppercase letter (S/A/B/C/D). Background and border in the tier hue at 10% / 40% alpha; text in the hue at 100%.
- **Behavior:** the letter is non-negotiable. Hue is reinforcement, not the message. A color-blind reader sees "S" or "A" the same way.

### Cards / Containers

- **Corner Style:** medium radius (10px). The single most-used radius in the system.
- **Background:** Graphite (#11141b) on the page. Slate (#161a23) when nested inside a Graphite section (rare; usually a sign the layout should not have nested at all).
- **Shadow Strategy:** flat at rest. See Elevation.
- **Border:** 1px Edge (#262d3d).
- **Internal Padding:** 16px (the lg spacing token).

### Inputs / Fields

- **Style:** Slate background, Edge border, 6px radius, 6×10px padding, Porcelain text.
- **Focus:** border shifts to Cornerstone Violet, plus a 3px ring in violet at 15% alpha. 120ms transition. This is the only place the focus glow appears at rest scale.
- **Error / Disabled:** error border in Depreciating Red; disabled fades text to Ash and lowers background by one tonal step.

### Sidebar Navigation

- **Style:** fixed 240px left rail on Graphite, 16×12px outer padding. Brand mark anchored top-left; nav sections stacked below with a Micro-Label header per section.
- **Default link:** Bone text, Slate hover background, no visible border.
- **Active link:** background tinted with Cornerstone Violet at 12% alpha, text upgraded to Porcelain, **2px inset Cornerstone Violet stripe on the left edge** (`box-shadow: inset 2px 0 0 var(--accent)`). This is the system's one ribbon-style affordance, and it exists *only* on the active nav item.
- **Mobile (<720px):** sidebar collapses inline, full-width.

### Data Tables

- **Style:** sticky thead (Micro-Label voice), Edge bottom border per row, 0.9rem body cells, hover row background bumps to Slate.
- **"You" row:** background tinted Cornerstone Violet at 6% alpha; deepens to 10% on hover. The single emphasized row per league table.
- **Sort affordance:** Header cell turns to Cornerstone-Violet-Bright when active sort. No sort arrows; the color shift is the signal.
- **Numeric columns:** tabular-nums, right-aligned where natively numeric (rank, score, age).

### Strength Bar (signature component)

The team-strength row is the system's defining custom pattern. A 4-column grid: rank number → team identity → score → a 6px gradient bar (Cornerstone Violet → Foundational Sky) sized to the strength percentage. Filled-bar transition: `width 400ms ease-out`. The bar is the only data-driven gradient in the system; it encodes the pillar pairing.

### Cmd+K Palette

The keyboard-first front door. Triggered by `⌘K` / `Ctrl+K` from anywhere; fuzzy-jumps to any league, roster, route, or player. Visually a centered Slate panel on a dimmed Obsidian backdrop, single search input on top (no border, no chrome), result rows below at table density. Result rows show name + path + a Tier Chip if relevant. **Always keep this discoverable** — a small "⌘K" hint chip lives in the top-right of every page header.

## 6. Do's and Don'ts

### Do:

- **Do** make tabular-nums the default for any column with numbers. Scores, ranks, ages, percentages, grades, dollar values all line up vertically.
- **Do** use Cornerstone Violet for "this is yours" cues across league tables and roster views — the "you" row tint, the active nav stripe, the focus ring. The user is the violet thread through the data.
- **Do** pair every tier color with the tier letter (S/A/B/C/D) at full opacity. Color-blind users get the letter; everyone else gets reinforcement.
- **Do** lean on the tonal ramp (Obsidian → Graphite → Slate → Pewter) for elevation before reaching for a shadow. Shadows are state, not chrome.
- **Do** keep the brand-mark gradient and the strength-bar gradient as the *only* gradients in the product. Both encode the Cornerstone+Foundational pillar pairing.
- **Do** prefer OKLCH when introducing *new* colors; the existing hex palette is grandfathered. New additions should be specified in OKLCH and approximated to hex for the frontmatter.
- **Do** make Cmd+K discoverable on every page (the small `⌘K` chip in the page header).

### Don't:

- **Don't** use a colored side-stripe (`border-left` / `border-right` > 1px) as a card or list-item accent. The only inset stripe in the system is the **active sidebar nav item**; that is the *only* allowed exception.
- **Don't** use gradient text (`background-clip: text` over a gradient). Emphasis is weight or size, never a multicolor fill.
- **Don't** apply glassmorphism, backdrop-blur surfaces, or "frosted" panels. The Cmd+K palette is the closest thing to overlay we have, and it uses a flat dimmed backdrop, not a blurred one.
- **Don't** introduce a fourth pillar color or invent a "warning purple" / "info purple" — Cornerstone Violet is one thing.
- **Don't** add a hero metric template (big number + small label + supporting stats + gradient flourish). Stat cards exist, but they stay flat, monochrome, and compact.
- **Don't** add bounce, elastic, spring, or scale-in animations. Ease out exponentially (`ease-out-quart` / `quint`) on entrances if needed; otherwise no motion.
- **Don't** use em dashes anywhere (`—` or `--`). Use commas, colons, or periods.
- **Don't** make this look like Sleeper. No mobile-first layouts forcing themselves onto desktop, no mascot iconography, no neon-on-charcoal accent stacks.
- **Don't** make this look like ESPN/Yahoo. No ad-shaped containers, no ticker-tape strips, no tab-bar overload.
- **Don't** make this look like a generic SaaS landing page. No purple-to-blue marketing gradient hero, no "Linear-clone" aesthetic, no full-bleed accent panels.
- **Don't** wrap every section in a container. Most rows don't need one. The page-title divider does most of the framing work.
- **Don't** nest cards inside cards. If a section feels like it needs a sub-card, the outer card should be a layout region (no card chrome) instead.
