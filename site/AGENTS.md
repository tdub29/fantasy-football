# Agent Notes

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

**Queue it when effort is high, judgement is low, and "done" is statable** - if only Trevor can decide it that is a question, and if it is short just do it. `-Brief` is for a reader with no session context: real numbers, what done means, the command that verifies it. `owner` is the lane (`ops`, `taco` = phone lane, `research`, `codex`), **never Trevor**. Never hand-edit the state JSON while the daemon runs. Traps and fallbacks: [`../../.agents/rules/creating-dashboard-tasks.md`](../../.agents/rules/creating-dashboard-tasks.md).
<!-- TELEGRAM-QUEUE:END -->

<!-- ORCHESTRATION-DEPTH:BEGIN (managed by .agents/scripts/sync-orchestration-sections.ps1 - edit the table there, not here) -->
## Orchestration & loops - execution depth

Match the execution shape to the task - **solo**, **subagents**, a **workflow**, or a **loop** - per the always-on rule [`../../.agents/rules/orchestration-and-loops.md`](../../.agents/rules/orchestration-and-loops.md) (deep reference: [`../../.agents/memory/reference_dynamic-workflows.md`](../../.agents/memory/reference_dynamic-workflows.md)). Non-negotiables regardless of shape: separate doing from judging (the agent that made it does not certify it), tier the model *and* the reasoning effort to the phase, give every loop a hard stop and a per-iteration checkpoint, state the cost shape before spawning, and make sure every gate can take DONE back.

**Anything needing judgement gets a skill and a second pair of eyes. Working from memory is the failure mode here.**

- **Check for a skill before starting, not after getting stuck.** A skill costs instructions, not a spawn, so there is no cost argument for skipping one that fits. Design, review, writing, research, data, decisions, finance, security and docs are all covered. Unsure what exists? `scout-skills` (first token `mid` | `high` | `max`), and if it flags a real gap, install that skill as a complete local bundle rather than noting the gap and moving on.
- **A verdict is not certified by whoever produced it.** Rankings, design choices, exploitability calls, "is this right", any number reaching a person: fresh lens, or be the reviewer only if you did not do the work.
- **Breadth gets workers.** Three or more independent shards (files, sources, claims, candidates, or skills to import, each carrying its own proof and verification): one worker per shard, then deterministic code decides what survives. Count shards by the work, not the items: three skills to install is twelve shards once gap-proof, bundle fetch, four-tree mirror and lockfile hash each count.
- **None of this licenses spawning for trivial work.** A one-file mechanical edit stays solo and self-inspected; the cost gate still applies and over-orchestration is its own failure. The line is judgement and breadth, not effort.

**Here:** The site itself: vanilla JS, no build step. **Solo** for an edit. Ranking data comes from screenshots transcribed by two independent readers, so a rank that only one reader saw is a capture gap to report, never a value to infer. Rebuild with the build scripts and re-run the tests plus `verify-app.py` before calling anything done.
<!-- ORCHESTRATION-DEPTH:END -->


## Design Context

This project uses the **Impeccable** design skill. Before any UI work (new screens, component edits, copy tweaks, redesigns) read these files at the project root. This section is a summary; where it disagrees with them, it is stale.

- [DESIGN.md](DESIGN.md): **the standard.** Backyard palette (Gold, Ink, Turf, Panel, Band, plus the six semantic hues), typography, plates and bevels, the selection rule, UI patterns, do's and don'ts. Its "Which file wins" section sets precedence: `css/styles.css` for values, then DESIGN.md, then PRODUCT.md for purpose and audience, then the generated sidecar, then this file.
- [PRODUCT.md](PRODUCT.md): users (five buy-in leagues), purpose, positioning, truthful model scope, product principles, accessibility.
- [BACKYARD-INVENTORY.md](BACKYARD-INVENTORY.md): the reference world screen by screen, and the IP boundary. The grammar is takeable; the Backyard Football and NFL marks are not.

Sidecar tokens live at [.impeccable/design.json](.impeccable/design.json), generated from DESIGN.md and the CSS. Regenerate it; never hand-edit it.

### TL;DR for new agents

- **North Star:** *The Backyard Tier Sheet*. A dynasty tier sheet rebuilt as a late-90s sports-game interface.
- **Every surface is an outlined plate.** 2px ink border, `--bevel`, hard zero-blur shadows. Gradients come from the six `--grad-*` tokens, never hand-written.
- **Selection is gold plus ink**, with exactly two exceptions: folder tabs lighten to the panel's lavender face, and What to Look For jump tabs take their panel's meaning color.
- **The six semantic hues mean something.** Teal, blue, green, amber, orange, red map to a category, a tier, or for/mixed/against. Gold, ink, turf, lavender, chalk are chrome.
- **Phone and desktop are both real.** Dense summary first; Cmd+K on a keyboard; vertical field and labeled sideways strips on a phone, never a sideways page scroll.
- **Anti-references:** Sleeper, ESPN/Yahoo Fantasy, generic SaaS gradients.

### Running Impeccable commands

The project pins its own copy at `../.claude/skills/impeccable/` (falls back to `../../.claude/skills/impeccable/`). Run from the repo root; `../.impeccable/config.json` points it at `site`. Common invocations:

- `/impeccable critique [target]`: UX review with heuristic scoring.
- `/impeccable polish [target]`: final quality pass before shipping.
- `/impeccable audit [target]`: technical checks (a11y, perf, responsive).
- `/impeccable craft [feature]`: shape and build a new feature end-to-end.
- `/impeccable live`: visual variant mode in the browser.

Each command auto-loads PRODUCT.md and DESIGN.md.
