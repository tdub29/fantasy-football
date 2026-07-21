# Decisive: Option Sourcing

## When to Use

Trigger when the user needs better raw material for options:

- The current choices are weak or uninspired.
- There may be other apps, investors, operators, or teams that solved the same problem.
- A recurring decision needs a reusable playlist.
- Sure product work needs competitor patterns without copying blindly.
- SMB or portfolio decisions need bright spots from past wins.

Don't trigger for: generic competitor research with no decision attached. The output must feed a choice.

## The Framework

### Core Thesis

The Heaths advise looking for someone who has solved your problem. Good options often come from copying, adapting, or laddering from existing solutions rather than inventing from scratch.

### Bright Spots

Look internally first: what has already worked for Trevor, Sure, past trades, past budget passes, or past workflows?

### External Benchmarks

Find comparable people, products, companies, or operators. Use benchmarks for grounding, not as a ceiling.

### Decision Playlists

A playlist is a reusable prompt set for recurring decisions. It is generative, not a checklist of boxes to satisfy.

### Analogy Ladder

Move from local analogies to regional and then distant ones. The farther the analogy, the more creative but risky the transplant.

## How to Apply

1. **Define the problem.** State what decision needs options.
2. **Find internal bright spots.** List past situations where something similar worked.
3. **Find external solvers.** Identify comparable apps, investors, operators, companies, or peers.
4. **Extract mechanisms.** For each solver, name what actually worked.
5. **Build or update a playlist.** Write 5-10 prompts that should be reused next time.
6. **Climb the analogy ladder.** Add local, regional, and distant analogies.
7. **Convert examples to options.** Produce 3-5 options adapted to the user's context.
8. **Choose tests.** Route promising options to `decisive-ooch` or `decisive-multitrack-options`.

## Output Format

```markdown
## Option Sourcing: {decision}

Problem:
Internal bright spots:
External solvers:

| Source | Mechanism worth adapting | Fit | Risk |
|--------|--------------------------|-----|------|

Decision playlist:
Analogy ladder:
Adapted options:
Recommended tests:
```

## Common Failure Modes

- **Benchmark-only thinking.** Copying best practices without asking what mechanism made them work.
- **No internal search.** Ignoring Trevor's own artifacts and past wins.
- **Over-distant analogy.** A clever analogy that does not survive context transfer.
- **Checklist instead of playlist.** The prompts become compliance boxes rather than option generators.
- **Research hoarding.** Examples pile up but never become options to test.

## References

- Chip Heath and Dan Heath, *Decisive: How to Make Better Choices in Life and Work* (2013), chapter 4.
- Source anchors in `sure/.agents/book-to-skill-workspace/decisive/outline/synthesis.md`.
- Sibling carved skills:
  - `decisive-multitrack-options` — turns sourced options into simultaneous tracks.
  - `decisive-ooch` — tests promising options before a large commitment.
