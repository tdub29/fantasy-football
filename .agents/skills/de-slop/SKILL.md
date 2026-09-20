---
name: de-slop
description: "Strip AI artifacts from CODE before a PR"
---

# De-Slop

Before a PR, remove obvious AI artifacts and cleanup noise.

## Checklist

- Delete pointless scratch markdown (NOTES/PLAN/IDEAS/TODO) unless it's real docs
- Remove redundant comments and filler docstrings
- Replace mock-heavy tests with real assertions where possible
- Remove fake/uncited metrics

## Flow

1. **Dry run**: Show a list of issues found (file + line).
2. **Confirm**: Ask what to fix. User may reply with:
   - Item numbers: `1 3 4`
   - Range: `1-5`
   - `all` — apply all fixes
   - `none` — skip
3. **Apply**: Apply selected edits and summarize.

## Safety

Do not delete `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, or `docs/**` without explicit confirmation.
