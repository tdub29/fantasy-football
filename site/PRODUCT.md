# Product

## Register

product

## Users

Dynasty fantasy football managers who run multiple leagues at once and currently triangulate between the Sleeper app, YouTube analyst rankings, and personal spreadsheets. Initial user is the maintainer (tdub1329, 3 dynasty leagues including a superflex and an IDP); the design must scale to any Sleeper user who plugs in their username, without losing the opinionated, expert-tool feel.

The user opens this on a desktop, mid-week, while a trade offer or a startup draft is sitting in another tab. They are not browsing; they are checking a specific roster against a specific framework and they want the answer in one screen.

## Product Purpose

A single source of truth that overlays a curated dynasty framework (Cornerstone / Foundational / Upside Premier categories, S–D tier list) on top of live Sleeper rosters across every league the user runs. It exists so the manager never has to bounce between Sleeper, YouTuber tier sheets, and a personal spreadsheet to answer: "is this trade good?", "which of my rosters is contending vs. rebuilding?", "where is each team weakest?".

Success is the user closing every other tab. Spreadsheets retired, app-tab forgotten, YouTuber CSVs pasted in once and trusted. Trade decisions get faster, tier mismatches get caught earlier, and roster archetypes (Win-Now / Balanced / Future Value) become legible at a glance instead of guessed at.

## Brand Personality

Expert-tool confidence. Three words: **precise, dense, opinionated**. The voice is a knowledgeable friend who already did the work, not a sportsbook hype-man and not a cheerful onboarding wizard. Surfaces feel like Linear meeting Raycast: keyboard-first, fast, tight, restrained color, monospace where numbers earn it. Cmd+K is treated as the front door, not an afterthought. Any flourish has to either reinforce data legibility or signal a tier/category — never both, never decoration.

## Anti-references

- **Sleeper itself.** Avoid mobile-first cartoon mascots, neon-on-charcoal energy, and emoji-heavy chrome. This is a desk tool, not a phone toy.
- **ESPN / Yahoo Fantasy.** No ad-shaped containers, no ticker-tape clutter, no generic-sports-portal density-without-purpose.
- **Generic SaaS purple.** Purple is a category color (Cornerstone), not a gradient hero accent. No purple-to-blue marketing gradients, no "Linear clone" landing-page aesthetic.

## Design Principles

1. **Color is meaning, not decoration.** Every accent hue is load-bearing: purple = Cornerstone, blue = Foundational, green = Upside Premier, amber = S-tier / top, red = depreciating / sell. If a color appears that doesn't map to a category or tier, it's a bug.
2. **Show the data, hide the chrome.** Borders, shadows, and containers earn their place by separating real things. Cards are not the default answer; nested cards never are. Dense tables beat decorated tiles.
3. **Keyboard is first-class.** Cmd+K already exists; the rest of the UI should respect that. Every primary action reachable without a mouse, focus rings visible, no hover-only affordances for state that matters.
4. **Opinionated over friendly.** This tool aggregates a specific curated dynasty tiering framework. Don't soften it into a neutral platform. The point of view is the value.
5. **Public-ready, not generic.** When the username field opens up to other users, the design should still feel like an expert's personal tool — just one that any expert could pick up — rather than collapsing into anonymous-SaaS calm.

## Accessibility & Inclusion

- **WCAG AA** for body text and small text on every surface. Tier badges and table cells are the highest-risk surfaces.
- **Color-blind safe**: tier and category cannot rely on hue alone. Tiers carry the letter (S/A/B/C/D) at full opacity; categories pair their color with an icon or short label so a deuteranope still gets the signal.
- **Reduced motion**: any non-essential transition (hover lifts, page transitions, tier-glow effects) must respect `prefers-reduced-motion: reduce` and degrade to instant.
- **Keyboard-first**: every action reachable via keyboard, focus visible at all times, Cmd+K is the canonical entry point and must announce itself to screen readers correctly.
