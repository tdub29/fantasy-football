---
name: decision-making
description: Router hub for judgment, decision-making, and behavioral-science frameworks drawn from seven books. Kahneman's Thinking, Fast and Slow (System 1/2, anchoring, availability, substitution, WYSIATI, representativeness & base rates, conjunction fallacy, prospect theory, framing, mental accounting, regression to the mean, peak-end rule, focusing illusion, outside view, taming intuitive predictions, cognitive ease). Ariely's Predictably Irrational (relativity/decoy, arbitrary coherence, zero-price effect, market vs. social norms, price placebo, expectations/framing, endowment/ownership, hot/cold states, procrastination/precommitment, keeping doors open, the fudge factor, cash distance). Kahneman/Sibony/Sunstein's Noise (noise vs. bias, noise types, decision hygiene, mediating assessments protocol, structured hiring, independent aggregation, groups amplify noise, scale design, rules vs. standards, optimal noise reduction, noise audits). Annie Duke's Thinking in Bets (resulting audits, scenario premortems, tilt/ticker guards, Ulysses precommitted trade rules, "wanna bet?" belief vetting). Chip & Dan Heath's Decisive (multitracking options, narrow-frame audits, ooch tests, option sourcing, outside view, tripwires, "what would have to be true?"). Julia Galef's The Scout Mindset (bias thought experiments, escaping echo chambers, holding identity lightly, incremental updating, influence without overconfidence, leaning into confusion, scout behavior audits, what the soldier protects, soldier vs. scout lens). Thaler & Sunstein's Nudge (automatic enrollment defaults, debt payoff order, default architecture, error-forgiving UX, fraught-choice audits, insurance/deductible audits, Save More Tomorrow escalation, sludge audits, smart disclosure). Use when the user wants to recognize/debias/exploit a cognitive bias or heuristic; estimate numbers, costs, durations, probabilities, or risk; review a decision's quality apart from its outcome; size or stress-test a bet; widen options or break a yes/no frame; reduce variability/noise in recurring judgments, ratings, hiring, or forecasts; design choice architecture, defaults, nudges, or remove sludge; update beliefs or escape an echo chamber; or apply behavioral science to investing, portfolio, SMB-acquisition, product, and personal-finance decisions. Each of the 69 sub-frameworks is routed individually below so per-framework discoverability is preserved. Do NOT trigger for raw ticker research or factual data gathering (use stock-review / stock-analysis), conflict-conversation/negotiation interpersonal frameworks, or unrelated coding/strategy work unless the user explicitly invokes one of these decision frameworks.
---

# decision-making

This hub collapses 69 atomic decision-science skills into one router plus references. Route by user cue, read the referenced file(s) in full, and apply that framework exactly. Seven families: Kahneman *Thinking, Fast and Slow* (`kahneman-*`, 16), Ariely *Predictably Irrational* (`ariely-*`, 12), Kahneman/Sibony/Sunstein *Noise* (`noise-*`, 11), Duke *Thinking in Bets* (`duke-*`, 5), Heath & Heath *Decisive* (`decisive-*`, 7), Galef *The Scout Mindset* (`galef-*`, 9), Thaler & Sunstein *Nudge* (`nudge-*`, 9).

## When to use

Use this hub when the user wants to:

- Recognize, debias, or deliberately exploit a cognitive bias or heuristic.
- Estimate a number, cost, duration, probability, or risk and worries it is distorted.
- Judge a decision's *quality* separately from its *outcome*, size a bet, or stress-test a thesis.
- Widen options, break a false yes/no frame, source alternatives, or test before leaping.
- Reduce unwanted variability (noise) in recurring judgments — ratings, scores, hiring, reviews, forecasts.
- Design choice architecture — defaults, enrollment, disclosure, error-forgiving UX — or remove sludge.
- Update a belief incrementally, escape an echo chamber, or hold an identity lightly.
- Apply behavioral science to investing, portfolio, SMB-acquisition, product, or personal-finance decisions.

## Guardrails

- Do **not** answer from router memory alone; load the selected reference file(s) before applying a framework.
- Keep routing tight: start with the 1-2 closest references; expand only when the user asks for a combined method.
- Do **not** do raw ticker/factual research here — that belongs to `stock-review` / `stock-analysis`. This hub structures the *judgment*, not the data gathering.
- Sequence matters: vet a belief before sizing it (`duke-wanna-bet-belief-vet` → `duke-scenario-premortem`); widen options before sizing one (`decisive-narrow-frame-audit` → `decisive-multitrack-options`); pause tilt before planning (`duke-tilt-ticker-guard` first).
- Review outcomes only after they are known (`duke-resulting-audit`); do not "result" a decision that hasn't resolved.
- Prefer structural defenses (precommitment, blind procedures, independent aggregation, tripwires) over willpower/introspection.

## Quick routing table

| User cue (examples) | Route to reference(s) |
|---|---|
| fast/intuitive vs. slow/deliberate thinking, dual-process diagnosis | `references/kahneman-system-1-system-2.md` |
| a number is dragging an estimate, set/refuse a first offer, negotiate price/salary/deadline | `references/kahneman-anchoring.md` |
| estimating frequency/risk from how easily examples come to mind, media-driven risk distortion | `references/kahneman-availability-heuristic.md` |
| fast confident answer to a hard question — suspect an easier question was substituted | `references/kahneman-substitution.md` |
| confident after a thin briefing, only heard one side, "what am I missing?" | `references/kahneman-wysiati.md` |
| predicting from a stereotype-fitting description while ignoring base rates; law of small numbers | `references/kahneman-representativeness-base-rate.md` |
| vivid specific scenario ranked likelier than its broader category (Linda problem) | `references/kahneman-conjunction-fallacy.md` |
| choices over gains/losses/risk, loss aversion ~2:1, fourfold pattern, refusing fair bets | `references/kahneman-prospect-theory.md` |
| same facts in gain vs. loss frame flip the decision, choice architecture, "have I been framed?" | `references/kahneman-framing-effects.md` |
| money treated non-fungibly by account/source/label, budget envelopes, house money, windfalls | `references/kahneman-mental-accounting.md` |
| extreme result followed by a milder one — don't credit a cause; punishment-vs-praise illusion | `references/kahneman-regression-to-the-mean.md` |
| designing/evaluating an experience; memory dominated by peak + ending, duration neglect | `references/kahneman-peak-end-rule.md` |
| forecasting how a life change affects happiness; focusing-illusion overestimate | `references/kahneman-focusing-illusion.md` |
| project cost/duration/outcome, planning fallacy, reference-class forecasting | `references/kahneman-outside-view.md` |
| 4-step debiasing of an intuitive prediction (base rate → impression → correlation → regress) | `references/kahneman-taming-intuitive-predictions.md` |
| something feels true/familiar/right — check fluency vs. truth; tune processing strain | `references/kahneman-cognitive-ease.md` |
| comparing options, adding an inferior decoy to make the target look better, pricing tiers | `references/ariely-relativity-decoy.md` |
| first price for a category imprints; "sense of value" anchored on a once-seen number | `references/ariely-arbitrary-coherence.md` |
| evaluating a "FREE!" offer; $0 is a category shift, not a small discount | `references/ariely-zero-price-effect.md` |
| mixing money into a favor/relationship, paid vs. gift behavior, poisoning social norms | `references/ariely-market-vs-social-norms.md` |
| higher price causing higher perceived/actual quality, premium positioning, price-corrupted judgment | `references/ariely-price-placebo.md` |
| labels/onboarding/brand cues priming experience before evaluation | `references/ariely-expectations-framing.md` |
| overvaluing what you already own, cancellation friction, trial attachment, buyer/seller gap | `references/ariely-endowment-ownership.md` |
| cold-state predictions underestimate hot-state behavior, "I would never do X" | `references/ariely-hot-cold-state.md` |
| binding the future self with deadlines/structures because later-self underdelivers | `references/ariely-procrastination-precommitment.md` |
| agonizing to keep options open; hidden cost of unrealized optionality; close doors | `references/ariely-keeping-doors-open.md` |
| people cheat "just a little," rationalized small dishonesty, moral reminders, controls | `references/ariely-fudge-factor.md` |
| points/credits/gift cards/miles weaken honesty and spending discipline; dollarize balances | `references/ariely-cash-distance.md` |
| total error = bias² + noise²; is the problem noise, bias, or both? | `references/noise-vs-bias.md` |
| level vs. pattern vs. occasion noise; "train the judges better" is failing | `references/noise-types-system-occasion.md` |
| six decision-hygiene principles, reduce noise without a specific case | `references/noise-decision-hygiene.md` |
| high-stakes call (M&A, exec hire) — independent sub-assessments scored before discussion (MAP) | `references/noise-mediating-assessments-protocol.md` |
| hiring/promotion/review: decomposition + independence + delayed holistic judgment | `references/noise-structured-hiring.md` |
| need a group's best estimate — collect independent judgments first, then average | `references/noise-aggregation.md` |
| group discussion amplifying noise via cascades, polarization, social influence | `references/noise-groups-amplify.md` |
| inconsistent 1-5 / red-yellow-green / high-med-low ratings, anchor definitions, rank vs. rate | `references/noise-scales.md` |
| strict rule vs. flexible standard vs. guideline vs. algorithm? | `references/noise-rules-vs-standards.md` |
| is reducing noise worth it here? overengineering low-stakes calls, process theater | `references/noise-optimal-reduction.md` |
| measure hidden disagreement across reviewers on the same cases; design a noise audit | `references/noise-audit.md` |
| was a trade/decision good or bad because it worked? post-mortem, luck vs. skill, "I was wrong" | `references/duke-resulting-audit.md` |
| size or stress-test a bet, map scenarios, assign probabilities/EV, premortem failure | `references/duke-scenario-premortem.md` |
| on tilt, revenge trade, panic sell, can't-believe-I-missed-it, cooling-off before acting | `references/duke-tilt-ticker-guard.md` |
| write precommitted buy/sell/hold/trim rules and kill switches before volatility hits | `references/duke-ulysses-trade-rules.md` |
| sounds certain / high conviction — turn a thesis into an explicit bet, what would change my mind | `references/duke-wanna-bet-belief-vet.md` |
| only one favored path/deal/vendor — develop multiple meaningfully distinct options at once | `references/decisive-multitrack-options.md` |
| stuck in a yes/no or A/B frame — widen it, opportunity-cost & vanishing-options test | `references/decisive-narrow-frame-audit.md` |
| can we test this first? pilot, starter position, small cheap experiment before committing | `references/decisive-ooch.md` |
| "I don't know what options exist" — find bright spots, benchmarks, playlists, analogies | `references/decisive-option-sourcing.md` |
| "what usually happens / what are the odds / am I special?" base rates + zoom-in evidence | `references/decisive-outside-view.md` |
| decision likely to drift on autopilot — set a revisit trigger/deadline/stage gate | `references/decisive-tripwire.md` |
| team debating options/defending a favorite — turn advocacy into testable truth conditions | `references/decisive-what-would-have-to-be-true.md` |
| am I biased here? flip the situation — double-standard, outsider, conformity, status-quo tests | `references/galef-bias-thought-experiments.md` |
| need a serious bear case / reasonable dissent without rage-bait, escape the echo chamber | `references/galef-escape-echo-chamber.md` |
| a belief has become identity ("I'm a bull/value investor") and is blocking updates | `references/galef-hold-identity-lightly.md` |
| update a thesis a little at a time, "am I wrong or early?", document a confidence change | `references/galef-incremental-updating.md` |
| communicate uncertainty in an update/memo without fake certainty or weak hedging | `references/galef-influence-without-overconfidence.md` |
| preserve an anomaly/contradiction instead of explaining it away ("this doesn't make sense") | `references/galef-lean-in-confusion.md` |
| audit whether my process is truth-seeking — do I welcome criticism, name times I was wrong? | `references/galef-scout-behavior-audit.md` |
| why am I resisting a painful truth? what is the soldier protecting (ego, image, belonging)? | `references/galef-soldier-protects-audit.md` |
| am I defending territory or mapping reality? soldier vs. scout diagnosis | `references/galef-soldier-scout-lens.md` |
| design auto-enroll / negative-election defaults for savings, retirement, transfers | `references/nudge-automatic-enrollment-defaults.md` |
| which debt to pay first, how to split extra payments, balance-matching error | `references/nudge-debt-payoff-order.md` |
| what should the default be? opt-in vs. opt-out, status quo vs. back-to-zero, active choice | `references/nudge-default-architecture.md` |
| design flows that prevent/catch/recover predictable user mistakes (expect error) | `references/nudge-error-forgiving-ux.md` |
| does this screen need a nudge? is the choice hard/rare/high-stakes/delayed-feedback? | `references/nudge-fraught-choice-audit.md` |
| deductible too low? extended warranty? dominated health plan? don't insure the small stuff | `references/nudge-insurance-deductible-audit.md` |
| auto-escalate future savings tied to raises/dates/milestones (Save More Tomorrow) | `references/nudge-save-more-tomorrow-escalation.md` |
| too much friction — asymmetric cancel/subscribe, hidden steps, dark patterns; remove sludge | `references/nudge-sludge-audit.md` |
| design user-owned, machine-readable, comparable disclosures (smart disclosure) | `references/nudge-smart-disclosure-spec.md` |

## Workflow

1. Confirm the intent is decision-science: a bias to spot/exploit, an estimate to debias, a bet to vet/size, options to widen, noise to reduce, choice architecture to design, or a belief to update.
2. Pick the closest row(s) in the routing table.
3. Read those `references/*.md` files completely.
4. Apply the framework's steps, output structure, and failure-mode checks from those references.
5. Chain when appropriate: vet → size → precommit → (after outcome) result; or narrow-frame → multitrack → outside-view → ooch → tripwire.

## References

- [references/ariely-arbitrary-coherence.md](references/ariely-arbitrary-coherence.md)
- [references/ariely-cash-distance.md](references/ariely-cash-distance.md)
- [references/ariely-endowment-ownership.md](references/ariely-endowment-ownership.md)
- [references/ariely-expectations-framing.md](references/ariely-expectations-framing.md)
- [references/ariely-fudge-factor.md](references/ariely-fudge-factor.md)
- [references/ariely-hot-cold-state.md](references/ariely-hot-cold-state.md)
- [references/ariely-keeping-doors-open.md](references/ariely-keeping-doors-open.md)
- [references/ariely-market-vs-social-norms.md](references/ariely-market-vs-social-norms.md)
- [references/ariely-price-placebo.md](references/ariely-price-placebo.md)
- [references/ariely-procrastination-precommitment.md](references/ariely-procrastination-precommitment.md)
- [references/ariely-relativity-decoy.md](references/ariely-relativity-decoy.md)
- [references/ariely-zero-price-effect.md](references/ariely-zero-price-effect.md)
- [references/decisive-multitrack-options.md](references/decisive-multitrack-options.md)
- [references/decisive-narrow-frame-audit.md](references/decisive-narrow-frame-audit.md)
- [references/decisive-ooch.md](references/decisive-ooch.md)
- [references/decisive-option-sourcing.md](references/decisive-option-sourcing.md)
- [references/decisive-outside-view.md](references/decisive-outside-view.md)
- [references/decisive-tripwire.md](references/decisive-tripwire.md)
- [references/decisive-what-would-have-to-be-true.md](references/decisive-what-would-have-to-be-true.md)
- [references/duke-resulting-audit.md](references/duke-resulting-audit.md)
- [references/duke-scenario-premortem.md](references/duke-scenario-premortem.md)
- [references/duke-tilt-ticker-guard.md](references/duke-tilt-ticker-guard.md)
- [references/duke-ulysses-trade-rules.md](references/duke-ulysses-trade-rules.md)
- [references/duke-wanna-bet-belief-vet.md](references/duke-wanna-bet-belief-vet.md)
- [references/galef-bias-thought-experiments.md](references/galef-bias-thought-experiments.md)
- [references/galef-escape-echo-chamber.md](references/galef-escape-echo-chamber.md)
- [references/galef-hold-identity-lightly.md](references/galef-hold-identity-lightly.md)
- [references/galef-incremental-updating.md](references/galef-incremental-updating.md)
- [references/galef-influence-without-overconfidence.md](references/galef-influence-without-overconfidence.md)
- [references/galef-lean-in-confusion.md](references/galef-lean-in-confusion.md)
- [references/galef-scout-behavior-audit.md](references/galef-scout-behavior-audit.md)
- [references/galef-soldier-protects-audit.md](references/galef-soldier-protects-audit.md)
- [references/galef-soldier-scout-lens.md](references/galef-soldier-scout-lens.md)
- [references/kahneman-anchoring.md](references/kahneman-anchoring.md)
- [references/kahneman-availability-heuristic.md](references/kahneman-availability-heuristic.md)
- [references/kahneman-cognitive-ease.md](references/kahneman-cognitive-ease.md)
- [references/kahneman-conjunction-fallacy.md](references/kahneman-conjunction-fallacy.md)
- [references/kahneman-focusing-illusion.md](references/kahneman-focusing-illusion.md)
- [references/kahneman-framing-effects.md](references/kahneman-framing-effects.md)
- [references/kahneman-mental-accounting.md](references/kahneman-mental-accounting.md)
- [references/kahneman-outside-view.md](references/kahneman-outside-view.md)
- [references/kahneman-peak-end-rule.md](references/kahneman-peak-end-rule.md)
- [references/kahneman-prospect-theory.md](references/kahneman-prospect-theory.md)
- [references/kahneman-regression-to-the-mean.md](references/kahneman-regression-to-the-mean.md)
- [references/kahneman-representativeness-base-rate.md](references/kahneman-representativeness-base-rate.md)
- [references/kahneman-substitution.md](references/kahneman-substitution.md)
- [references/kahneman-system-1-system-2.md](references/kahneman-system-1-system-2.md)
- [references/kahneman-taming-intuitive-predictions.md](references/kahneman-taming-intuitive-predictions.md)
- [references/kahneman-wysiati.md](references/kahneman-wysiati.md)
- [references/noise-aggregation.md](references/noise-aggregation.md)
- [references/noise-audit.md](references/noise-audit.md)
- [references/noise-decision-hygiene.md](references/noise-decision-hygiene.md)
- [references/noise-groups-amplify.md](references/noise-groups-amplify.md)
- [references/noise-mediating-assessments-protocol.md](references/noise-mediating-assessments-protocol.md)
- [references/noise-optimal-reduction.md](references/noise-optimal-reduction.md)
- [references/noise-rules-vs-standards.md](references/noise-rules-vs-standards.md)
- [references/noise-scales.md](references/noise-scales.md)
- [references/noise-structured-hiring.md](references/noise-structured-hiring.md)
- [references/noise-types-system-occasion.md](references/noise-types-system-occasion.md)
- [references/noise-vs-bias.md](references/noise-vs-bias.md)
- [references/nudge-automatic-enrollment-defaults.md](references/nudge-automatic-enrollment-defaults.md)
- [references/nudge-debt-payoff-order.md](references/nudge-debt-payoff-order.md)
- [references/nudge-default-architecture.md](references/nudge-default-architecture.md)
- [references/nudge-error-forgiving-ux.md](references/nudge-error-forgiving-ux.md)
- [references/nudge-fraught-choice-audit.md](references/nudge-fraught-choice-audit.md)
- [references/nudge-insurance-deductible-audit.md](references/nudge-insurance-deductible-audit.md)
- [references/nudge-save-more-tomorrow-escalation.md](references/nudge-save-more-tomorrow-escalation.md)
- [references/nudge-sludge-audit.md](references/nudge-sludge-audit.md)
- [references/nudge-smart-disclosure-spec.md](references/nudge-smart-disclosure-spec.md)

## Book provenance

- **Kahneman family (`kahneman-*`)** — Daniel Kahneman, *Thinking, Fast and Slow* (Farrar, Straus and Giroux, 2011).
- **Ariely family (`ariely-*`)** — Dan Ariely, *Predictably Irrational* (HarperCollins, 2008).
- **Noise family (`noise-*`)** — Daniel Kahneman, Olivier Sibony & Cass R. Sunstein, *Noise: A Flaw in Human Judgment* (Little, Brown Spark, 2021).
- **Duke family (`duke-*`)** — Annie Duke, *Thinking in Bets* (Portfolio, 2018).
- **Decisive family (`decisive-*`)** — Chip Heath & Dan Heath, *Decisive: How to Make Better Choices in Life and Work* (Crown Business, 2013).
- **Galef family (`galef-*`)** — Julia Galef, *The Scout Mindset* (Portfolio, 2021).
- **Nudge family (`nudge-*`)** — Richard H. Thaler & Cass R. Sunstein, *Nudge: Improving Decisions About Health, Wealth, and Happiness* (Yale University Press, 2008).
