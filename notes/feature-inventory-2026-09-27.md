# Fantasy Football feature inventory, ranked for the portfolio (2026-09-27)

Source of truth: the 14 sidebar views in `site/js/app.js` (nav list near line 1015), the 87
features in `.agents/feature-map.json`, and the model builders under `projections/` and
`site/data/`. Ranked on four things a portfolio reader can see: validated result, technical
depth, originality, and how well it reads as one screen.

| Rank | Feature | Where | Why it ranks here |
|---|---|---|---|
| 1 | Trade Finder + title-odds simulation | `#trade`, Trade Lab | Scores thousands of 1-for-1 to 2-for-2 packages per league (4,619 in the ESPN league), simulates both teams' title odds with paired error, and keeps only deals both sides win. Nobody else ships a both-sides-must-win finder. |
| 2 | Kicker model | League Players, K view; What to Look For | Two-stage Poisson counts convolved through the scoring rule; board ordered by a ridge on 16 pre-kickoff features. Beats Vegas implied total alone by 0.072 pts/week (p = 0.015) and career average by 0.273; P(15+) calibrated within half a percent. The most rigorously validated model in the app. |
| 3 | Stats Lab | `#stats` | Route trees and two-player compare, man vs zone coverage, on/off, situation and week-range splits, chart builder, CSV export, all from free nflverse play-by-play. Broadest, most visual screen. |
| 4 | League hub | `#dashboard` | Every Sleeper and ESPN league in one place with strength rankings, 5-year value trajectory, market and cornerstones. The platform explanation slide. |
| 5 | College prospect model | `#prospects`, player card | Talent and hit-probability model validated leave-one-draft-class-out. Beats draft capital alone for WR and RB (log loss 0.355 to 0.344, 0.465 to 0.458), draft-only for QB and TE. Honest but modest lift. |
| 6 | Custom ranking sets + expert boards | `#rankings`, `#experts` | Your own order beside KTC, FantasyPros experts and Gibbs; half-PPR boards converted to PPR and marked. |
| 7 | Game pages | `#games`, `#game/:id` | Pregame and postgame for every game: both units side by side, five edges, rosters. |
| 8 | What to Look For | `#watch` | Weekly watch board weighted by each league's buy-in; rooting-for vs hate-watch. Clever, niche. |
| 9 | Player card | any player | Headshot, career chart, location maps, advanced game log, injury history 2009 to 2026, team context, prospect profile. |
| 10 | FAAB archetypes | League FAAB tab | Bid-archetype cost analysis from league waiver history. |
| 11 | Strength of schedule grid | `#sos` | Fantasy SOS by position and week. |
| 12 | Action Center | `#action` | Lineup and roster to-dos across leagues. |
| 13 | Draft Room | `#draft` | Live draft board. |
| 14 | xFP model | card, Stats Lab | Expected points; +0.007 next-week correlation at RB and WR (CI +0.001 to +0.013). Real but small. |
| 15 | IDP tools | IDP league | IDP matchup grid, DvP, IDP projections. |
| 16 | Framework, Sources, About | `#strategy`, `#sources`, `#about` | Documentation pages. |
| 17 | Infra | everywhere | Command palette, mobile layout, field art, 80+ scripted browser checks. Useful, not a portfolio screen. |

**Slide set:** 1 League hub, 2 Trade Finder, 3 Stats Lab, 4 Kicker model. The prospect model is
the runner-up for slide 4; the kicker model wins on evidence (a significant win over the
Vegas baseline and a calibrated distribution).
