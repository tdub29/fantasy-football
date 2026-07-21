---
name: getting-to-yes
description: Apply Fisher, Ury & Patton's principled-negotiation method (Getting to Yes) to negotiate on the merits instead of haggling over positions. Triggers on negotiation, negotiating a job offer / comp / salary / base / level / scope / equity / sign-on, "how do I counter this offer", "should I accept", win-win, mutual gains, interests vs positions, separate the people from the problem, invent options, objective criteria / fair standards / market benchmark, BATNA / best alternative / walk-away / reservation point, "what if they're more powerful", dealing with a hardball or aggressive or stubborn counterpart, negotiation jujitsu, dirty tricks / lowball / take-it-or-leave-it / good-cop-bad-cop, one-text procedure, mediation, multi-party deals, and any high-stakes work conversation framed as a deal. Also fires when the user is preparing for a negotiation, deciding whether to negotiate at all, computing their walk-away, or trying to turn a positional fight into joint problem-solving. Output is always an artifact — an interests map, an options list, a BATNA worksheet, a criteria table, a triage of tactics, or a reframe script — never a book summary. DO NOT TRIGGER FOR: the live tactical phone/verbal counter, emotional labeling, or in-the-moment "what do I literally say back" — defer to `difficult-conversation` (Voss/Wheeler); and the structured job-offer comp worksheet with market-data lookup — defer to `salary-negotiation-prep`. This skill owns the principled-negotiation method (4 principles) + the BATNA framework.
---

# getting-to-yes

Book provenance: **Roger Fisher, William Ury & Bruce Patton — *Getting to Yes: Negotiating Agreement Without Giving In*, 3rd ed. (Penguin, 2011).** Load the matching `references/*.md` file when a specific element of the method is needed.

## When to use

Use this hub when someone is **negotiating on the merits** rather than asking what to literally say in the moment. The canonical moments:

- Preparing for a job-offer close (base, level, scope, equity, sign-on) and wanting a method, not just a number.
- Stuck in positional haggling ("they said X, I said Y, now what?") and wanting to break the deadlock.
- Facing a counterpart who is more powerful, stubborn, or playing hardball.
- Deciding whether to negotiate at all, or whether to accept / walk away.
- Any high-stakes work conversation that has become a contest of wills.

The whole method rests on one shift: **don't bargain over positions.** Positional bargaining produces unwise agreements, is inefficient, and damages relationships. Decide issues on their merits.

## The method at a glance

**The four principles** (the heart of the book — Chapters 2–5):

1. **Separate the people from the problem.** Be soft on the people, hard on the problem.
2. **Focus on interests, not positions.** A position is what you decided; interests are *why*.
3. **Invent options for mutual gain.** Expand the pie before dividing it.
4. **Insist on using objective criteria.** Anchor on fair standards, not willpower.

**Plus the safety net — BATNA** (Chapter 6): your Best Alternative To a Negotiated Agreement. It is the standard every offer is measured against and the true source of your power. **This is the single most important artifact** — compute it before anything else when leverage is in question.

**Plus the "yes, but" toolkit** (Chapters 7–8): negotiation jujitsu and the one-text procedure for when they won't play; recognizing and defusing dirty tricks.

## Quick routing

| User cue (examples) | Reference |
|---|---|
| It got personal; emotions/perceptions/communication are in the way; "they're attacking me" | `references/separate-people-from-problem.md` |
| "Why do they even want that?"; surface what's behind a stated position; build the interests map | `references/focus-on-interests-not-positions.md` |
| "There's no way to split this"; expand the pie; brainstorm without committing; fixed-pie thinking | `references/invent-options-for-mutual-gain.md` |
| Anchor on fair standards; "what's a fair number"; market benchmark; comp data; "company policy" | `references/insist-on-objective-criteria.md` |
| "What if they're more powerful?"; walk-away; reservation point; should I accept; should I negotiate | `references/batna-best-alternative.md` |
| "They won't play"; hardball; stubborn; one-text; dirty tricks; lowball; take-it-or-leave-it; good-cop | `references/when-they-wont-play.md` |

## How to apply

1. Match the user's request to a row in **Quick routing** (or a description trigger).
2. Read the corresponding `references/` file fully.
3. **Default first move when comp/level/scope leverage is in question: route to `batna-best-alternative.md`.** Almost every "how do I counter" question is unanswerable until the BATNA and reservation point exist.
4. Follow that reference's **Produce** line — return the artifact, not a summary.
5. Use the reference's **"Apply to Trevor's offer close"** subsection to tie the method to the live comp/level/scope/equity negotiation.

A full prep usually combines references in this order: BATNA → interests → options → objective criteria → people, with the "yes, but" toolkit held in reserve.

## Common failure modes (hub-level)

- **Summarizing instead of producing.** Every reference ends in an artifact. If the answer is prose about the book, the skill failed.
- **Skipping the BATNA.** "How should I counter?" without a computed BATNA and reservation point is negotiating with your eyes closed. Build it first.
- **Confusing positions with interests.** "I want $200k" is a position. "I need to feel paid at market and have runway" are interests. Stay disciplined.
- **Treating principled negotiation as "being nice."** It is hard on the merits, soft on the people. Soft-on-both is the soft-bargaining trap the book warns against.
- **Drifting into tactical scripting.** In-the-moment verbal counters and emotional labeling belong to `difficult-conversation`. Keep this skill at the method/strategy altitude.
- **Inventing market numbers.** Objective-criteria work needs real standards. Route comp benchmarking to `salary-negotiation-prep`; don't fabricate "market rate."

## References

- [references/separate-people-from-problem.md](references/separate-people-from-problem.md)
- [references/focus-on-interests-not-positions.md](references/focus-on-interests-not-positions.md)
- [references/invent-options-for-mutual-gain.md](references/invent-options-for-mutual-gain.md)
- [references/insist-on-objective-criteria.md](references/insist-on-objective-criteria.md)
- [references/batna-best-alternative.md](references/batna-best-alternative.md)
- [references/when-they-wont-play.md](references/when-they-wont-play.md)

**Sibling / related skills:**
- `salary-negotiation-prep` — the job-offer-specific comp worksheet + market-data lookup; this skill supplies the *method*, that one supplies the *numbers*.
- `difficult-conversation` (Voss/Wheeler) — live tactical counters, emotional labeling, the verbal in-the-moment moves.
- `game-theory` — when the structure is a formal strategic game (BATNAs as payoffs, commitment/lock-in as moves).
- Repo doc: `strategy/negotiation-playbook.md` — the workspace's standing negotiation playbook; cross-link prep artifacts there.

- **Book:** Fisher, Ury & Patton, *Getting to Yes*, 3rd ed. (Penguin, 2011).
