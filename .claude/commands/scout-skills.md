---
description: Spawn a subagent to find skills relevant to the task before starting. First token sets search extent — mid (default) | high | max.
argument-hint: "[mid|high|max] [task description — defaults to the current task in context]"
---

Before doing anything else, spawn a subagent to identify which available skills apply to this task. Do this **immediately** — do not start the task itself first.

**Raw input:** $ARGUMENTS

## Step 1 — Parse the search extent (first token of the raw input)

Read the **first whitespace-delimited token** of the raw input and map it to a search extent. Everything after that token is the task. If the first token is **not** one of the extent keywords below, the extent defaults to **mid** and the *entire* raw input is the task.

| First token | Extent | What the scout should return |
|---|---|---|
| `mid` / `med` *(or omitted — default)* | **MID** | Only skills that are **definitely applicable**. Tight, high-precision shortlist — err on the side of fewer. Prefer 3–7; drop anything uncertain. |
| `high` / `hi` | **HIGH** | **As many relevant skills as possible** — include plausible, secondary, and adjacent matches. Breadth over precision. |
| `max` | **MAX** | Everything HIGH returns, **and immediately invoke the `find-skills` skill** to search for *installable* skills covering any capability gap — don't just flag the gap, actually look. |

(If the task is empty after removing the extent token, use the task currently in conversation context.)

## Step 2 — Spawn the subagent

Use the `Agent` tool with `subagent_type: "Explore"` (fall back to `general-purpose` if Explore is unavailable). Give it a prompt along these lines:

> Your only job is to find which available skills are relevant to this task. Do NOT attempt the task.
>
> **Task:** <the parsed task>
> **Search extent:** <MID | HIGH | MAX>
>
> 1. Review the full list of available skills in your system context (the "available skills" / Skill-tool list).
> 2. Match them against the task **at the requested extent**:
>    - **MID** — return only skills that *definitely* apply. High precision, err toward fewer (≈3–7). Drop anything you're unsure about.
>    - **HIGH** — return as many relevant skills as possible, including secondary/adjacent ones that *might* help. Favor breadth.
>    - **MAX** — do everything HIGH does, **and additionally invoke `find-skills`** to look for installable skills covering any gap; report what it finds.
> 3. Return a ranked shortlist (most → least relevant). For each: **skill name** — one line on why it applies — how it should be used for this task.
> 4. Flag any capability gap where no installed skill fits. At MID/HIGH, note whether `find-skills` should be run. At MAX, actually run `find-skills` and report results.
> 5. If this task plausibly touches GOOD360 work, also read the persistent `MEMORY.md` index and note any memory file relevant to the task.
>
> Keep it tight — names and reasons, not file dumps.

## Step 3 — After the subagent reports

1. Relay the shortlist to me (skill names + one-line reasons), and state which extent was used.
2. Then proceed with the task, invoking the recommended skills via the `Skill` tool as you go.
3. Only invoke skills that actually appear in the available-skills list — never guess a name.
