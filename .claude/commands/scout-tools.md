---
description: Spawn a subagent to inventory which packages, CLIs, MCP tools, and native features the task needs — and which are already available vs need installing — before starting. First token sets search extent — mid (default) | high | max.
argument-hint: "[mid|high|max] [task description — defaults to the current task in context]"
---

Before doing anything else, spawn a subagent to inventory the tooling this task needs — libraries/packages, CLIs and system binaries, session MCP tools, native platform features, and existing project scripts — and, critically, which are **already available** vs **need installing**. Do this **immediately** — do not start the task itself first. The point is to climb the ponytail ladder before writing a line of code: reuse what's here, add a dependency only when nothing already present covers it.

**Raw input:** $ARGUMENTS

## Step 1 — Parse the search extent (first token of the raw input)

Read the **first whitespace-delimited token** of the raw input and map it to a search extent. Everything after that token is the task. If the first token is **not** one of the extent keywords below, the extent defaults to **mid** and the *entire* raw input is the task.

| First token | Extent | What the scout should return |
|---|---|---|
| `mid` / `med` *(or omitted — default)* | **MID** | Only tooling that is **definitely required**, each marked already-available or needs-install. Tight, high-precision — err on the side of fewer. Prefer 3–7; drop anything speculative. |
| `high` / `hi` | **HIGH** | **As many plausibly-useful tools as possible** — packages, CLIs, MCP tools, native features, adjacent utilities. Breadth over precision. |
| `max` | **MAX** | Everything HIGH returns, **and actually probe real availability** (`--version` / `which` / read the manifests) **and search npm/PyPI/registries for installable options covering any gap** — don't just name a gap, find the package and the exact install command. |

(If the task is empty after removing the extent token, use the task currently in conversation context.)

## Step 2 — Spawn the subagent

Use the `Agent` tool with `subagent_type: "Explore"` (fall back to `general-purpose` if Explore is unavailable). Give it a prompt along these lines:

> Your only job is to inventory the tooling this task needs and what's already available. Do NOT attempt the task.
>
> **Task:** <the parsed task>
> **Search extent:** <MID | HIGH | MAX>
>
> 1. List the concrete tooling *needs* the task implies (e.g. render video, parse PDF, fetch a live page, transcribe audio, draw a chart, sign a request).
> 2. Inventory what's **already available before recommending anything new** — climb the ladder, highest rung that holds wins:
>    - a **native/stdlib/platform feature** that already covers it (no dependency at all)
>    - **binaries on PATH** — probe with `--version` / `which` (node, python, ffmpeg, yt-dlp, imagemagick, gh, docker, …)
>    - **already-installed dependencies** — read `package.json`, `requirements.txt` / `pyproject.toml`, `Gemfile`, global npm (`npm ls -g --depth=0`), and any project `.venv/`
>    - **session MCP tools** (the deferred-tools list surfaced in system-reminders) and existing **`.agents/scripts/`** utilities
> 3. Match to the requested extent (MID = definitely-required only; HIGH = broad; MAX = broad + probe availability + search registries for gaps).
> 4. For each tool return: **name** — `[have | need-install]` — one line why it fits — how to use it here — exact install command if it needs installing.
> 5. Flag any capability gap where nothing present fits. At MAX, actually search npm/PyPI, report the install command plus a rough popularity/maintenance signal, **and whether it needs an API key or account** — Trevor defaults to key-free / local / no-login tooling, so prefer those and clearly flag anything that needs a key or signup.
> 6. If this task plausibly touches GOOD360 work, also read the persistent `MEMORY.md` index and note any memory file relevant to the tooling.
>
> Keep it tight — names, have/need, and one-line reasons, not file dumps or full docs.

## Step 3 — After the subagent reports

1. Relay the inventory to me: the tool list, each marked **have** vs **need-install**, and which extent was used.
2. Prefer the **smallest correct toolset** — reuse what's already installed before adding anything; never add a dependency for what a few lines of stdlib/native code would do. Two options the same size → take the one that's key-free and better-maintained.
3. Confirm with me before installing anything **global**, or any tool that **needs an API key or account**, before proceeding.
4. Then proceed with the task, using the recommended tools.
