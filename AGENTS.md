# AGENTS.md

Project context for Codex CLI, Cursor, and other agentic tools (Claude Code reads `CLAUDE.md`).

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
- **Breadth gets workers.** Three or more independent shards (files, sources, claims, candidates, or skills to import, each carrying its own proof and verification): one worker per shard, then deterministic code decides what survives. Count shards by the work, not the items: three skills to install is twelve shards once gap-proof, bundle fetch, four-tree mirror and lockfile hash each count.
- **None of this licenses spawning for trivial work.** A one-file mechanical edit stays solo and self-inspected; the cost gate still applies and over-orchestration is its own failure. The line is judgement and breadth, not effort.

**Here:** Fan out player and stat analysis; rank trade offers as a **tournament**, not by absolute score, and remember a dynasty trade is anchored by its biggest single asset (a pile of small pieces does not substitute even at equal KTC total). **Solo** for site edits -- it is vanilla JS with no build step.
<!-- ORCHESTRATION-DEPTH:END -->


## Purpose

A dynasty fantasy football tool for tdub1329 (Sleeper). It overlays curated tier rankings and
the Dynasty Domain framework onto three live Sleeper rosters: *Password is taco* (10-team, 1QB),
*The League* (superflex), *yuH* (IDP). KTC is the source of truth for player and pick value;
analyst boards are season-production context beside it, never the value model.

## Draft-order mental model (Trevor confirmed)

- **The League:** lowest Max PF first. Record and actual PF do not establish pick
  priority; eligible bench production can count in optimal weekly scoring.
- **Password is taco:** bottom-four 40/30/20/10 lottery drawing all four slots.
  Each eligible team can land 1.01 through 1.04. Entry and conditional draw
  odds are separate; no guaranteed 1.01. Weight assignment, reweighting procedure and
  later-round treatment remain unconfirmed.
- Reprice origin-team outcomes after trades; compensation from improved draft
  priority benefits only picks still owned. Current `originSlot` uses starter-strength
  rank, not these rules. Treat pick-sensitive multi-year outputs as proxy-dependent.
  Full policy: [docs/FRAMEWORKS.md](docs/FRAMEWORKS.md), league-specific draft order.

## Stack

Vanilla ES in one file (`site/js/app.js`), hash router, no framework, no npm, no build step.
Data is generated to `site/data/*.js` as `window.NAME = {...}` globals by Python builders.
Tests are plain `node script.test.js` asserts. The site is served as static files and ships
inside the `trevor-apps` Cloudflare Pages bundle as `ff/`.

## Layout

```
site/            # the app: index.html, js/app.js, css/, data/
site/data/       # generated data + the Python builders that write it
site/data/_sources/  # hand-fed inputs (analyst boards) and their transcription tooling
projections/     # build_all.py, the pipeline that runs the builders in dependency order
docs/            # FRAMEWORKS.md, ARCHITECTURE.md, USER.md, SESSION_LOG.md
historical/      # superseded builders and data kept for provenance
Leagues/         # per-league notes
```

## Commands

```
node --check site/js/app.js
node site/js/dynasty-claims.test.js          # one of 11 suites; full list in CLAUDE.md
python projections/build_all.py              # "refresh the data" = the FULL run, not --core
python projections/build_all.py --stamp-only # re-stamp build-info.js from real mtimes
python -m http.server 8765                   # from site/, then open http://localhost:8765
powershell -NoProfile -ExecutionPolicy Bypass -File ..\.agents\scripts\deploy-phone-apps.ps1 -Deploy
```

Two data sources `build_all.py` cannot run because they need a hand-fed input:
`site/data/build_jacob_gibbs.py` (analyst board CSV) and `site/data/build_expert_rankings.py`
(edits to `_expert_sources.json`). A new Gibbs board is three commands, not one: rebuild
`jacob-gibbs.js` for the rank column, `build_gibbs_fullppr.py` for the derived full-PPR board
(all three leagues are full PPR, he publishes half), then
`python site/data/_sources/build_gibbs_brief.py` for `site/gibbs-tiers.html`. Skip the last and
the column moves while the tier board lies.

His weekly and ROS boards are NOT hand-fed and need no browser: `python site/data/build_gibbs_ros_fp.py
--board week`, `python site/data/build_gibbs_ros_fp.py`, then `python site/data/build_gibbs_ppr.py`
read FantasyPros' public JSON API with a plain GET. If fantasypros.com looks unreachable, the
sandbox has no network; ask for network access, not a browser.

## Working norms

- Make narrow, evidence-based changes (see workspace `../AGENTS.md`), but treat requested improvements as action scope. If Trevor asks to add, apply, install, wire, improve, or make something work in this project, implement the durable project change after reading local context.
- Ask only for destructive/outward-facing actions, credentials, frozen snapshots, or genuinely ambiguous targets.
- Skills live in `../.agents/skills/` (shared) and `./.claude/skills/`, `./.cursor/skills/`, `./.codex/skills/` (per-harness overrides).
- MCP servers are configured in `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor). Codex reads its own user-level config; see workspace `AGENTS.md` for the standard list.

## Secrets

Per-project keys for keyed MCP servers (`fal`, `slack`, `browserbase`) live in `.env` (gitignored). See `.env.example` for the full list.
## Lean Runtime

Caveman + Ponytail are active by default in this project through local skills, hooks, Cursor rules, and MCP entries. Keep communication terse, preserve exact technical details, and choose the smallest correct implementation: existing code, stdlib, native platform, installed dependency, then minimum new code. Full rule: `.agents/rules/lean-token-and-yagni.md`.
