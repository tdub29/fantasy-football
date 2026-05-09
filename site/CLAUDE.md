# Agent Notes

## Design Context

This project uses the **Impeccable** design skill. Before doing any UI work — new screens, component edits, copy tweaks, redesigns — read these two files at the project root:

- [PRODUCT.md](PRODUCT.md) — strategic context: register (product), target users, product purpose, brand personality, anti-references, design principles, accessibility.
- [DESIGN.md](DESIGN.md) — visual system: color palette (with descriptive names like Cornerstone Violet, Foundational Sky, Upside Mint), typography hierarchy, elevation philosophy, component specs, do's and don'ts.

Sidecar tokens (tonal ramps, shadows, motion, full HTML/CSS component snippets) live at [.impeccable/design.json](.impeccable/design.json).

### TL;DR for new agents

- **Register:** product (this is a tool, not a marketing surface).
- **North Star:** *The Tier Sheet, Live* — a printed dynasty tier sheet that watches your rosters. Editorial restraint, not SaaS gloss.
- **Color is meaning.** Every accent maps to a category or tier. No decorative hues, no marketing gradients.
- **Flat-by-default.** Tonal ramp does the elevation work. Shadows are state, not chrome.
- **Keyboard-first.** Cmd+K is the canonical entry point.
- **Anti-references:** do not look like Sleeper, ESPN/Yahoo Fantasy, or a generic SaaS purple-gradient landing page.

### Running Impeccable commands

The skill is installed at `../../.claude/skills/impeccable/`. Common invocations:

- `/impeccable critique [target]` — UX review with heuristic scoring.
- `/impeccable polish [target]` — final quality pass before shipping.
- `/impeccable audit [target]` — technical checks (a11y, perf, responsive).
- `/impeccable craft [feature]` — shape + build a new feature end-to-end.
- `/impeccable live` — visual variant mode in the browser.

Each command auto-loads PRODUCT.md and DESIGN.md, so the context above is always in scope.
