# User profile — tdub1329 (Trevor)

## Identity

- Sleeper handle: **tdub1329**
- Email: trevor@good360.org
- Manages 3 dynasty leagues for 2026 (see CLAUDE.md at repo root for the
  three names + formats)

## Voice and feedback style

- **Terse, direct.** Short prompts, no preamble. Match the energy back.
- **Trusts judgement.** Often says "do whatever best" — that's a license to
  ship the right answer, not to ask more questions.
- **Critiques rigorously.** Has explicitly asked for self-critique and
  "make sure it's optimal" — surface problems and fix them in the same pass
  rather than declaring done.
- **Wants honesty about gaps.** Asked "is value share incorporated at all"
  expecting a real answer. If a feature is half-built or missing, say so
  before fixing it.
- **Hates pile-of-small-stuff trade counters.** Has explicitly said the
  biggest asset is the headliner; small pieces don't substitute. This is a
  hard rule for any trade advice. See `docs/FRAMEWORKS.md` § Headliner Rule.

## What he cares about

- **Dynasty value building**, not contender chasing for its own sake. Value
  share, hit rates, ceiling vs floor.
- **Editorial restraint** in the UI. "Tier Sheet, Live" aesthetic. NOT
  Sleeper / ESPN / Yahoo / generic SaaS purple. See `site/DESIGN.md`.
- **Speed and density** over generosity / whitespace theatre.
- **Working features** more than docs/comments. Save the prose for when it
  helps a future agent or himself.

## Things he's specifically asked for

- IA restructure — nested tabs over flat sidebar
- Persistent league context in sidebar (active league + sub-shortcuts)
- 3-year outlook on the Trade Calculator
- Picks counted properly in roster strength
- KTC as source of truth (player + pick values)
- Dynasty Domain framework integration (May 2026, Jeremiah Smith video)
- Timeline tab per league (transactions + drafts)
- Player rankings view per league (replaced Cornerstones tab)
- No defensive/DST/K players cluttering dynasty views

## Things he's pushed back on

- Counter-offers that pile small pieces against a single headliner asset
- Jordan Love framed as a Purdy upgrade (Purdy/Love interchangeable to DJ)
- Estimating KTC values from memory instead of looking them up in the file
- Treating the AVG. column as a multi-expert mean when it was actually the
  mean of exactly two source rankings (he caught that math)

## Working pattern that works for him

1. Audit what exists, name the gaps honestly
2. Ship the fix in the same pass
3. Run smoke tests (node --check + a real data run)
4. Tell him what changed, what to look for, and what was deliberately
   skipped
5. End. No "anything else?" — he'll come back if he needs more.
