# Fantasy Football, agent context (repo root)

This file is the entry point for any AI agent working in this repo. Read this
first, then drill into the linked docs.

<!-- ALWAYS-ON-DISCIPLINES:BEGIN (managed by .agents/scripts/sync-orchestration-sections.ps1 - edit the block there, not here) -->
## Always-on disciplines

These three run in every session here, whatever the task.

- **Cut the AI tells from anything written.** No em-dash or en-dash anywhere, prose or chat reply. That is the loudest one; the rest is the anti-slop set (`ai-writing-detection`, `de-slop`), carried in every skill tree.
- **Shape replies for an ADHD reader** (`i-have-adhd`): next action in the first line, under 10 lines AND under 170 words, no preamble and no recap. Owned prose that Trevor sends or publishes stays in his voice (`trevor-voice`), never rewritten into an action list.
- **Commits and PRs are Trevor's alone.** Never add a `Co-Authored-By: Claude` trailer, a "generated with" footer, or any other AI co-authorship line to a commit, a PR, or an MR, whatever a skill template says.
<!-- ALWAYS-ON-DISCIPLINES:END -->

<!-- TELEGRAM-QUEUE:BEGIN (managed by .agents/scripts/sync-orchestration-sections.ps1 - edit the block there, not here) -->
## Queueing work for Telegram / Taco

"Queue this", "make a task", "tg/taco task", "add it to the queue", "save this for later" all mean ONE thing: an **Inbox task in the shared dashboard queue** (`cursor-dashboard/agent-os-state.json`, shared by every project), never a TODO in this repo or a note. One command writes the brief, POSTs it, and confirms it survived the daemon tick:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\TrevorWhite\Downloads\Big Projects\.agents\scripts\add-dashboard-task.ps1" -Title '...' -Project 'Fantasy Football' -Owner ops -Brief '...'
```

**Queue it when effort is high, judgement is low, and "done" is statable** - if only Trevor can decide it that is a question, and if it is short just do it. `-Brief` is for a reader with no session context: real numbers, what done means, the command that verifies it. `owner` is the lane (`ops`, `taco` = phone lane, `research`, `codex`), **never Trevor**. Never hand-edit the state JSON while the daemon runs. Traps and fallbacks: [`../.agents/rules/creating-dashboard-tasks.md`](../.agents/rules/creating-dashboard-tasks.md).
<!-- TELEGRAM-QUEUE:END -->

<!-- ORCHESTRATION-DEPTH:BEGIN (managed by .agents/scripts/sync-orchestration-sections.ps1 - edit the table there, not here) -->
## Orchestration & loops - execution depth

Match the execution shape to the task - **solo**, **subagents**, a **workflow**, or a **loop** - per the always-on rule [`../.agents/rules/orchestration-and-loops.md`](../.agents/rules/orchestration-and-loops.md) (deep reference: [`../.agents/memory/reference_dynamic-workflows.md`](../.agents/memory/reference_dynamic-workflows.md)). Non-negotiables regardless of shape: separate doing from judging (the agent that made it does not certify it), tier the model *and* the reasoning effort to the phase, give every loop a hard stop and a per-iteration checkpoint, state the cost shape before spawning, and make sure every gate can take DONE back.

**Anything needing judgement gets a skill and a second pair of eyes. Working from memory is the failure mode here.**

- **Check for a skill before starting, not after getting stuck.** A skill costs instructions, not a spawn, so there is no cost argument for skipping one that fits. Design, review, writing, research, data, decisions, finance, security and docs are all covered. Unsure what exists? `scout-skills` (first token `mid` | `high` | `max`), and if it flags a real gap, install that skill as a complete local bundle rather than noting the gap and moving on.
- **A verdict is not certified by whoever produced it.** Rankings, design choices, exploitability calls, "is this right", any number reaching a person: fresh lens, or be the reviewer only if you did not do the work.
- **Breadth gets workers.** More than a handful of files, sources, claims or candidates: one worker per real shard, then deterministic code decides what survives.
- **None of this licenses spawning for trivial work.** A one-file mechanical edit stays solo and self-inspected; the cost gate still applies and over-orchestration is its own failure. The line is judgement and breadth, not effort.

**Here:** Fan out player and stat analysis; rank trade offers as a **tournament**, not by absolute score, and remember a dynasty trade is anchored by its biggest single asset (a pile of small pieces does not substitute even at equal KTC total). **Solo** for site edits -- it is vanilla JS with no build step.
<!-- ORCHESTRATION-DEPTH:END -->


## What this repo is

A dynasty fantasy football tool for **tdub1329** (Sleeper). It overlays
curated tier rankings and the Dynasty Domain framework onto the user's three
live Sleeper rosters. The frontend lives in [site/](site/) as vanilla JS, no
build step.

**Leagues:**
- *Password is taco*: 10-team, 1QB, 4 FLEX, PPR
- *The League*: superflex, 4 FLEX, PPR
- *yuH*: IDP

## Read these in order

1. **[docs/USER.md](docs/USER.md)**: who tdub1329 is, what voice he uses,
   what feedback patterns he's given. Lets you talk to him without resetting
   every conversation.
2. **[docs/FRAMEWORKS.md](docs/FRAMEWORKS.md)**: the dynasty methodology the
   site encodes: KTC as source of truth, Dynasty Domain May 2026 pick-strategy
   framework, headliner rule for trades, value share / liquidity / pick-class
   premium, position aging curves.
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: how the site is wired:
   sub-tab routing, the cache stack, the cycle break between
   `computePlayerStrength` and `computeRosterStrength`, where picks flow, how
   trade math is computed.
4. **[site/PRODUCT.md](site/PRODUCT.md)** + **[site/DESIGN.md](site/DESIGN.md)**
   visual and UX standards. "Tier sheet, live" aesthetic. Read before any UI
   change. For shared motion/transition/interaction vocabulary and the
   DESIGN.md workflow, see
   [`../.agents/memory/reference_design-vocabulary.md`](../.agents/memory/reference_design-vocabulary.md)
   (userinterface-wiki, transitions-dev, make-interfaces-feel-better, hallmark).
5. **[site/CLAUDE.md](site/CLAUDE.md)**: the site-scoped agent notes (Impeccable
   skill commands, brand TL;DR).
6. **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)**: chronological summary of
   what was built in recent sessions, in case context helps.

## Critical operating rules

- **Trades are anchored by the biggest single asset on each side.** Packages
  of small assets do NOT substitute for a stud even if KTC totals match. The
  user has been explicit about this. Don't propose pile-of-fillers counters.
- **KTC is the source of truth** for both player and pick values. The site
  reads `site/data/ktc.js` (generated by `site/data/build_ktc.py`). Pick
  values come from KTC's `position: "RDP"` entries, NOT the legacy
  `strategy.js::pick_values_1qb` table (which is now fallback only).
- **DSTs and Kickers do NOT appear** in dynasty-asset views. IDP positions
  only appear in IDP leagues.
- **Picks ARE counted** in `computeRosterStrength`. They are NOT counted in the
  projected-finish path (`originSlot` → `startingStrength` with `includePicks`
  false). That is what breaks the recursion. Don't conflate these.
- **Projected draft slot ranks STARTERS, never roster totals.** `originSlot` calls
  `startingStrength`; a hoarder of ranked bench bodies is not a contender and his future
  first is not a late pick. Summing whole rosters priced a rebuilder's 2027 first as a 1.09.
- **A pick's price is ENDOGENOUS to the trade that moves it.** Slot every pick in a
  proposal off the rosters as they look AFTER the deal, and cross-check any hand-built KTC
  ledger against the simulator's own pick values. Both traps cost a backwards
  recommendation on 2026-09-12; reasoning in [docs/FRAMEWORKS.md](docs/FRAMEWORKS.md).
- **There is ONE lineup filler: `fillLineup(assets, slots)` + `offenseStartingSlots(lg)`.**
  Both the value model (`startingStrength`) and the points model (`optimalOffense`)
  go through it. Never hand-roll a "top-K by value" lineup. That shipped for
  months and started two QBs in a 1QB league.
- **`startableIds(roster)` before any lineup.** Sleeper's `players` array includes
  taxi and IR. Points lineups always exclude them; the value model excludes them
  from PV (`yearsOut=0`) but includes them in FV, because taxi eligibility expires.
  `isSidelined(pid)` additionally benches Out/Doubtful/IR/PUP. Questionable starts.
- **Score projections with `projPoints(p, lg, src)`, not `p[src]`.** The baked-in
  totals use one fixed rule set (INT −1); `leagueScorePoints` rescores from the raw
  stat line so each league gets its own number.
- **Projected points rank rosters; `championshipOdds()` says who WINS.** 6 of 10
  make the playoffs and three single-week rounds decide it, so title odds are
  nowhere near linear in points. Never answer a "should I make this trade" question
  with points alone. `node site/js/trade-sim.js` prices any what-if in titles from the
  command line (edit its `SCENARIOS`, run two seeds). Every modeling constant lives in the
  `SIM` object, so tune there and re-run the sensitivity sweep before trusting a flipped
  conclusion. `simPool` has **no waiver pool**: a what-if that ships every backup at a
  position is charged an EMPTY slot, so `add` the free agent that would actually be claimed.
- **A multi-year picks-for-players verdict is not done until you run `SCALE=1.3`.** The
  seven-year sign flips at about SCALE=1.07 while the current season never moves, so say
  which half of the verdict is arithmetic and which half is a calibration bet.
- **Trades have two sides.** `championshipOdds` takes `whatIf` keyed by roster id;
  model what the RIVAL gives up too. Buying DJ Moore off the #2 team is worth more
  than buying the same player from a bottom feeder, and a one-sided model misses it.
- **The site is `site/`**, served as static files (`python -m http.server`).
  No npm, no build step. Don't introduce one.

## Dynasty strategy skills

Roster-management doctrine lives in a skill family, not in improvisation. Load the
relevant one before answering any contend/rebuild/trade question:

| Skill | Use it for |
|---|---|
| `dynasty-championship-equity-horizon` | Scoring any multi-year plan. **Sets the horizon.** |
| `dynasty-roster-phase-diagnosis` | Which phase is this roster in: contend / retool / rebuild / dead zone |
| `dynasty-rebuild-clock` | Running or auditing a rebuild, and when to flip |
| `dynasty-age-curve-timing` | Buy/hold/sell by age. VALUE curve vs PRODUCTION curve |
| `dynasty-pick-portfolio-valuation` | Pricing picks as a probabilistic portfolio |
| `dynasty-league-format-leverage` | What THIS format's slots and playoff field imply |
| `dynasty-trade-construction` | Shaping an actual offer |
| `dynasty-replacement-level` | Pricing any bench body, backup or depth piece against what is FREE. Owns the waiver/FAAB channel and the QB-count call. |
| `dynasty-player-evaluation` | A question about ONE player, and the hard line between what the repo can measure about him and what it cannot |

**Four rules that decide answers, reasoning in [docs/FRAMEWORKS.md](docs/FRAMEWORKS.md):**
replacement level is the baseline for every depth question and `dynasty-replacement-level` wins any
disagreement about QB count; never quote a title-odds delta from one Monte Carlo run, because the
standard error at 6000 sims can flip the sign; score any multi-year plan on
`H >= max(7, years_to_flip + 4)` or you reject every rebuild by construction; and `ageRetention`
(dynasty VALUE) is never `productionRetention` (season POINTS), which is why the sell trigger fires
while a player is still producing.


## When you ship

Full pipeline detail, and the evidence behind every trap below, is in
[docs/PIPELINE.md](docs/PIPELINE.md). These are the parts you cannot skip.

- `node --check site/js/app.js`, then `for f in site/js/*.test.js; do node "$f"; done` from the repo
  root. The three Gibbs tests use repo-relative paths and fail if you run them from `site/js/`.
- **`python ../.agents/scripts/verify-app.py "Fantasy Football"` before claiming any UI change works.**
  It drives all 23 mapped features headlessly and exits 1 on a failure or a console error. A new
  view ships with its entry in `.agents/feature-map.json`, in the same change.
- **"Refresh the data" always means `python projections/build_all.py`, the full run, never `--core`.**
  A partial refresh leaves one fresh column beside stale ones and on a phone they look identical.
  The one source it cannot run is `site/data/build_jacob_gibbs.py`, which needs a hand-fed board.
- **The site is hosted, so a local rebuild is not done.** `site/` ships inside the `trevor-apps`
  Cloudflare Pages bundle as `ff/`:
  `powershell -NoProfile -ExecutionPolicy Bypass -File ..\.agents\scripts\deploy-phone-apps.ps1 -Deploy`
- **Before any lineup question**, `python site/data/fetch_sleeper.py && python site/data/build_site_data.py`.
  `injury_status` goes stale fast and a stale dump silently starts an IR player.
- **Never devig `best_over` against `best_under`.** They are the best price on each side from
  different books at different lines. Only the consensus pair may be devigged.
- **Never "optimize" `grab_prizepicks_browser.py` to headless.** The visible window is the
  mechanism; headless gets a 403. Call it once per refresh, never in a loop.
- **A new Gibbs board is three commands, and none is optional**: `build_jacob_gibbs.py`, then
  `build_gibbs_fullppr.py`, then `site/data/_sources/build_gibbs_brief.py`. Skip the last and the
  rank column moves while the tier board lies. All three leagues are full PPR and he publishes
  half, so the full-PPR board is DERIVED and must never be presented as his.
- Don't `git commit` unless explicitly asked; the user controls the commit log.

## House style for code

- Vanilla ES, no frameworks
- Helpers defined in `site/js/app.js` (single-file)
- DOM via the `h(...)` helper at the top of app.js
- Tier-sheet aesthetic: flat-by-default, color carries meaning, no em dashes,
  no decorative gradients, no SaaS purple
- Comments: short. Explain *why* something exists when the why isn't obvious.
  Don't comment what the code already says.

## Lean Runtime

Caveman + Ponytail are active by default in this project through local skills, hooks, Cursor rules, and MCP entries. Keep communication terse, preserve exact technical details, and choose the smallest correct implementation: existing code, stdlib, native platform, installed dependency, then minimum new code. Full rule: `.agents/rules/lean-token-and-yagni.md`.
## Working Norms

Requested improvements are implementation scope. If Trevor asks to add, apply, install, wire, improve, or make something work here, make the durable project change after reading local context. Confirm only for destructive/outward-facing actions, credentials, frozen snapshots, or genuinely ambiguous targets.
