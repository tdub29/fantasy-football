# Product

<!-- impeccable:product-schema 1 -->

Who this is for, what it is for, and what it may truthfully claim. Visuals live in
[DESIGN.md](DESIGN.md). On any conflict between this file, DESIGN.md and an agent summary
(`CLAUDE.md`, `AGENTS.md`), see "Which file wins" at the top of DESIGN.md.

## Platform

web

## Users

Dynasty fantasy football managers who run several leagues at once and would otherwise triangulate
between the league apps, analyst rankings and a personal spreadsheet. The working user is the
maintainer (tdub1329): five leagues with real buy-ins (Phi Kap Fantasy, Password is taco, The
League, yuH, Washington Football League), mostly Sleeper, with ESPN leagues shown where linked.
Anyone can sign in with their own Sleeper username and get the same overlay on their own leagues,
without the tool losing its opinionated, expert feel.

## Product Purpose

One place that overlays a curated dynasty framework (Cornerstone, Foundational and Upside Premier
categories, an S to D tier list, age curves) on the live rosters of every league the user runs. It
answers the questions a manager otherwise answers with five tabs: is this trade good, which roster
is contending and which is rebuilding, where is each team weakest, who matters to me this week.

Success is the user closing the other tabs: the spreadsheet retired, trade calls made faster, tier
mismatches caught earlier, and each roster's archetype readable at a glance.

## Positioning

A personal expert's framework applied live across every league at once, with buy-in weighting and
models that state their own limits. League apps show one league at a time with no point of view;
ranking sites have a point of view but never see your rosters.

## Operating Context

Two sittings, both real, and a view that only works in one of them is unfinished:

- **Phone, most often.** Mid-week or on game day, one answer at a time: who am I rooting for across
  every league, is this offer good, how did the waiver run go. One thumb, often outdoors in daylight.
- **Desktop, for deep work.** A trade offer or a startup draft in another tab, the Stats Lab, the
  Prospects board, the framework pages. Keyboard and Cmd+K are first-class here.

Data refreshes by script (`refresh.ps1`) and the site deploys as static files; freshness is shown
in the app.

## Capabilities and Constraints

Routes today: Dashboard, Action Center, What to Look For (every starter across every league,
weighted by buy-in, split into rooting for, good and bad, and hate watching), Trade Calculator,
Strength of Schedule, Games, Stats Lab, Draft Room, Prospects, My Rankings, Experts, Framework,
Sources, About.

Truthful scope. The models say what they can and cannot do, on the page, in plain words:

- **Prospects** gives one 0 to 100 score from draft pick plus college profile: a player's chance of
  a top fantasy season early in his career, as a percentile of every drafted player at his position
  since 2008. It is one fit on every class since 2008, so drafted rows include their own result and
  are not blind forecasts. Next-class college rows use a stand-in pick (the mock-draft consensus,
  or the last pick when he is in no mock), and that is an assumption, not a finding; later classes
  not yet mocked are scored on college profile alone. Inputs are offense only.
- **Kicker and weekly projections** state their measured limits. Where a backtest showed an input
  has no out-of-sample signal, the page says so instead of hiding it.
- A model never claims more precision than it has.

Constraints: vanilla JS, no build step. PFF and NFLMDD are excluded data sources.

## Brand Commitments

The late-90s sports-game identity (Backyard) is binding and stays: turf ground, outlined plates,
gold selection, pixel scoreboard numerals. It is hardware and stationery, never a cartoon
character. Backyard Football's own marks, characters and logos are never copied; see
[BACKYARD-INVENTORY.md](BACKYARD-INVENTORY.md). Voice: a knowledgeable friend who already did the
work. Precise, dense, opinionated; not a sportsbook hype-man and not an onboarding wizard.

Anti-references: Sleeper's mascot energy, ESPN and Yahoo's ad-shaped clutter, generic SaaS
gradients.

## Evidence on Hand

Real league data for the maintainer's five leagues, the curated tier framework, expert rankings
under `#experts` and `#sources`, and the 2008-onward drafted-class history behind Prospects. There
are no testimonials, outside users or usage numbers; never invent them.

## Product Principles

1. **The answer fits the first screen.** Dense summary first, detail one tap away.
2. **Explain without burying.** Caveats and what a chart's axes and lines mean stay visible; full
   methodology is one expand away, never a wall above the data.
3. **Keyboard and touch are both first-class.** No hover-only affordance for state that matters.
4. **Opinionated over friendly.** The framework is the value. Don't soften it into a neutral
   platform, and don't let a new user's sign-in collapse it into anonymous SaaS calm.
5. **Honest scope beats confident numbers.** If a model can't support a claim, the page says so.

## Accessibility & Inclusion

- **WCAG AA** for body and small text on every surface, including text on colored plates.
- **Never color alone.** Tiers carry their letter, categories a label, panels a title, league colors
  sit beside the league name.
- **Reduced motion.** Non-essential animation respects `prefers-reduced-motion: reduce`.
- **Keyboard and screen reader.** Every action reachable by keyboard, focus visible everywhere, Cmd+K
  announced correctly; gesture surfaces (zoom, pan, swipe) keep a button way in.
- **Portrait phone.** Every page works at 390px wide with no sideways page scroll; the field runs
  vertically, and any sideways motion is an intentional, labeled strip.
