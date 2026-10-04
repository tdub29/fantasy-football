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
