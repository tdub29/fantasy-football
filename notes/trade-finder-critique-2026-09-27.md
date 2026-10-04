# Trade Finder result row: impeccable critique (2026-09-27)

Target: `#trade/<league>` Trade Finder section, the found-trade row (`site/js/app.js` 7234 to 7298,
`site/css/styles.css` 1872 to 1957). Two independent assessments: an LLM design review against
Nielsen and the cognitive-load checklist, and the impeccable 4.1.0 detector (CLI on
`index.html`, browser injection at 1280 and 390px). Register: product. System: Backyard.

## Design health: 19/40 (poor, top of the band)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | Good live progress; the final 7,500-sim check runs ~12 s silent, button still says "Find trades" |
| 2 | Match real world | 2 | "±0.7" unexplained, 88% unlabeled, "pts" means title-odds points here and fantasy points one line down |
| 3 | User control | 2 | No cancel on a 20 to 30 s search; loading a row silently overwrites a hand-built Lab trade |
| 4 | Consistency | 2 | Lab greys in-band changes, Finder does not; Lab says FAIR (green) for the same trade the Finder paints 88% amber |
| 5 | Error prevention | 2 | You must beat 2 SE, the partner only needs delta > 0, so a noise-level "helps both" can show |
| 6 | Recognition | 2 | Meaning of ±, 88% and the FAIR line all live in memory |
| 7 | Efficiency | 2 | Numbers inside prose, so rows cannot be compared; no sort |
| 8 | Minimalist design | 1 | The answer is 11.4px, same weight as everything; loudest pixels are chips and the orphan 88% |
| 9 | Error recovery | 2 | Generic failure copy |
| 10 | Help | 1 | Nothing on the row explains ±, 88% or the verdict |

Cognitive load: 5 of 8 fail (critical): chunking (8 numbers in one run), grouping (partner odds
printed twice), hierarchy, one-thing-at-a-time (no verdict), working memory.

## Anti-patterns verdict

Not AI slop: the Backyard vocabulary is specific. The failure is an engineer's log line where a
verdict should be. Both assessments agree on the small type: detector flags `.tf-tag` at 9px
(real), `.tf-why` at 10.8px (real), `.trade-finder-note` at ~145 characters a line (real).
Detector false positives: the gold "TRADE FINDER" contrast (it has a 2px ink outline the
detector does not measure), the sidebar divider, the status-dot glow, the yardline textures.
Drift the detector caught that the review did not: DESIGN.md still lists the system font stack
while the site ships Nunito and Baloo 2; bounce easing on `.trade-middle-card`.

## Priority issues

1. **[P1] No headline.** Split the row: deal on the left, verdict on the right (stacked, verdict
   first, on phone). Verdict = a stamp in the Lab's `.verdict` voice ("BOTH GAIN", or "YOU GAIN,
   THEIRS IS NOISE") over two equal cells, YOU and the partner, each with the delta as the big
   number, "6.6% → 7.5%" beneath, and a confidence word. One quiet "2026 title odds" label.
2. **[P1] The unlabeled 88% sits where the answer should be, in tier-S amber.** It is market
   fairness, already a filter (under 75 never shows). Move it to the secondary line in neutral
   text using the Lab's words: "Value 72.5 out, 82.9 in (close, 88%)". Never amber.
3. **[P1] Uncertainty is a bare "±0.7" and the partner is not held to the band.** Word from
   z = delta / SE: SOLID (z ≥ 3), LIKELY (2 to 3), INSIDE NOISE (< 2). Green only outside the
   band, the Lab's rule, always paired with the word. The stamp drops to "THEIRS IS NOISE" when
   the partner is inside the band, so "helps both" is never claimed on noise.
4. **[P1] Screen readers hear only the partner name** (`aria-label` replaces the row's content).
   Build the label from the verdict.
5. **[P2] Row predates the Backyard plate spec.** 1px border and flat fill instead of plate edge,
   panel gradient and bevel; alpha-tinted 9px OUT/IN tags; a gold hover edge (a third
   "selected" signal); partner name truncated to 140px while half the line is empty.

Minor: lead the status line with the claim ("1 trade raises both teams' odds") and demote the
telemetry; "Searching..." on the button while running; the partner's odds are printed twice,
while your own lineup change is computed but never shown; "→" not "to"; seed the Lab's title
odds with the Finder's result instead of re-running.

## Decision taken

Fix 1 to 5 plus the minor copy items, keep every trade the Finder finds today, and label a
partner gain inside the noise honestly rather than hiding the row.
