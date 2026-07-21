# AGENTS.md

Project context for Codex CLI, Cursor, and other agentic tools (Claude Code reads `CLAUDE.md`).

## Purpose

<!-- Single paragraph: what this project does and who works on it. -->

## Stack

<!-- e.g. Next.js 16, Postgres (Neon), TypeScript -->

## Layout

<!-- e.g.
src/         # app code
docs/        # decisions, runbooks
scripts/     # one-off tooling
-->

## Working norms

- Make narrow, evidence-based changes (see workspace `../AGENTS.md`), but treat requested improvements as action scope. If Trevor asks to add, apply, install, wire, improve, or make something work in this project, implement the durable project change after reading local context.
- Ask only for destructive/outward-facing actions, credentials, frozen snapshots, or genuinely ambiguous targets.
- Skills live in `../.agents/skills/` (shared) and `./.claude/skills/`, `./.cursor/skills/`, `./.codex/skills/` (per-harness overrides).
- MCP servers are configured in `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor). Codex reads its own user-level config; see workspace `AGENTS.md` for the standard list.

## Secrets

Per-project keys for keyed MCP servers (`fal`, `slack`, `browserbase`) live in `.env` (gitignored). See `.env.example` for the full list.
## Lean Runtime

Caveman + Ponytail are active by default in this project through local skills, hooks, Cursor rules, and MCP entries. Keep communication terse, preserve exact technical details, and choose the smallest correct implementation: existing code, stdlib, native platform, installed dependency, then minimum new code. Full rule: `.agents/rules/lean-token-and-yagni.md`.
