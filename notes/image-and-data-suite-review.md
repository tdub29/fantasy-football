# Image and screen review, 2026-09-25

Scope: Pass 1 (every image file and every runtime image) and Pass 2 (every route and tab at 1700px
and 390px). The Fantasy Points Data Suite 2.0 gap check moved to a separate agent and lives in
`notes/data-suite-gaps.md`. xFP was out of scope (rebuild in flight, t-1790284025204), so nothing
here touches `projections/build_nflverse_suite.py` or `site/data/advanced*.js`.

Method: local copy served on 127.0.0.1:8801, local Playwright (key-free), 106 view captures plus
full-height player cards, a DOM clip probe on every view, and a cross-check of every Team and Owner
cell in 7 Players tables against `site/data/players.js` and `site/data/leagues.js`. Screenshots sit
outside the repo in the session scratchpad (`review-shots/`).

Baseline at review time: `verify-app.py` 58/58 pass and `check-mobile-layout.py 390` prints MOBILE
LAYOUT OK. Both are green while every HIGH row below is live, so each fix task also extends a check.

Not flagged, by the house rules: full-PPR headers with no scoring tag, `*` on half-PPR-converted
columns, headers that do not repeat the view name, `·` as the missing-value mark, no team logos
(the IP boundary in `site/DESIGN.md` forbids them).

## Pass 1: images

What the site actually shows at runtime is small: `img/logo-192.png` (sidebar 44px, phone nav
button 32px), `img/logo-512.png` (midfield watermark, manifest), `img/apple-touch-icon.png`,
`favicon.ico` (16/32/48/64), and two inline SVG data-URI turf layers in `css/styles.css`. There are
no player headshots and no team logos anywhere. Across all 106 captures: 0 broken images, 0 HTTP
errors, and both `<img>` tags carry a correct decorative `alt=""` (each sits beside a text label or
inside an `aria-label` button).

On disk under the three folders: 227 files, 112 MB.

| Folder | Files | MB | Used at runtime | Referenced by name anywhere | Notes |
|---|---|---|---|---|---|
| `site/img` | 3 | 0.34 | 3 | 3 | all load, sharp |
| `site/_shots` | 37 | 13.9 | 0 | 0 | gitignored, not deployed; 33 of 37 predate the 2026-09-15 Backyard redesign |
| `site/_shots/tables` | 89 | 37.6 | 0 | 0 | gitignored; before/after captures from the 2026-09-17 table audit |
| `site/data/_shots` | 6 | 1.3 | 0 | 2 | Gibbs board source captures, tracked in git |
| `site/data/_shots/_crop` | 92 | 59.2 | 0 | 0 | one-day OCR crops from 2026-08-22, tracked in git |

| # | Problem | Severity | Fix |
|---|---|---|---|
| I1 | `site/data/_shots/_crop/` (92 PNGs, 59.2 MB, largest `p1-full.png` 7.1 MB) is committed to git, referenced by nothing, and is scratch from one OCR session | Medium | `git rm -r --cached site/data/_shots/_crop`, add it to `.gitignore`, leave the change uncommitted for Trevor |
| I2 | `site/_shots/` (126 files, 51.5 MB) lives inside the deploy root; only the deploy allowlist keeps it off the public host, and 33 of the top-level 37 show the pre-Backyard UI, so they mislead anyone who opens them as reference | Low | move the folder out of `site/` (for example `Fantasy Football/notes/_shots/`) or delete the pre-2026-09-15 ones; update the comment in `deploy-phone-apps.ps1` that cites it |
| I3 | 4 of 6 Gibbs source captures in `site/data/_shots` (08-16 and 08-30) are named nowhere in the repo | Low | record which capture fed which board in `site/data/_sources/` or the Gibbs checkpoint, or drop the superseded 08-16 pair |
| I4 | Manifest reuses `logo-512.png` for `purpose: maskable`; its art reaches 26px from the top edge (opaque bbox 40..472 x 26..486) and 35% of the canvas is transparent, so Android launchers crop the uprights and fill the corners | Low | add `img/logo-maskable-512.png` with the mark at about 72% on a solid `#3a2a7a` slab, point the maskable entry at it |
| I5 | `apple-touch-icon.png` (180x180) has transparent corners (34.5% transparent); iOS renders them black on the home screen | Low | flatten onto the same solid slab |
| I6 | `manifest.webmanifest` name is "The Fantasy Hub", the JSON escape for an em dash (backslash u2014), then "tdub1329", so the install dialog and app switcher show an em dash | Low | "The Fantasy Hub, tdub1329", matching `<title>` |
| I7 | The midfield watermark (`body::after`) draws the 512px logo at up to 520 CSS px, which is a 2x upscale on a retina screen | Low | ship a 1024px copy for the watermark, or cap the size at 512px |

## Pass 2: screens

Covered: Dashboard (Overview, Trajectory, Market, Cornerstones), Action Center, What to Look For,
Trade Lab (root, league, partner), SOS grid, Stats Lab (QB, RB, WR, TE, Teams, Defense, Trends, IDP,
seasons 2024/2025/2026), Draft Room, My Rankings, Experts, Framework, Sources, About, league
Standings/Players (Stats, Weekly, ROS, Sleeper weeks, SOS)/Transactions/FAAB for the superflex,
IDP, redraft and ESPN leagues, Roster (Snapshot, Strategy/Trade Angles, Roster) for mine and a
rival, the player card on every tab (veteran RB, LB, rookie, QB), Cmd+K, the phone nav drawer,
and both static Gibbs pages.

| # | Screen | Problem | Severity | Fix |
|---|---|---|---|---|
| S1 | Stats Lab QB/RB/WR/TE/Teams/IDP, 1700px | Tables are wider than their column (WR 40 cols, 2823px; QB 35 cols, 2517px; IDP 27 cols, 2099px; Teams 23 cols, 1906px, in a 1336px column). `.tbl-scroll` is `overflow: visible` above 480px and `body` is `overflow: clip`, so every column past CATCHABLE% on WR (the last header, DEPTH, sits at x=3095) can neither be seen nor scrolled to | High | make the Stats Lab table wrapper a horizontal scroller at every width (keep the sticky header working), pin the Player column |
| S2 | yuH Players (Stats), IDP card | DL and DB rows are not matched to their Sleeper id. 7 of 56 DL rows show Owner "FA" while rostered (Myles Garrett, Nick Bosa, Maxx Crosby, Brian Burns, Danielle Hunter, Aaron Donald, DeForest Buckner), so the Free Agent scope offers elite rostered DL. Team is wrong on 6 DL (Garrett FA vs LAR, Danielle Hunter CAR vs HOU, Montez Sweat NYJ vs CHI, Chase Young PHI vs NO, Will McDonald HOU vs NYJ, Jonathan Allen FA vs CIN) and 1 DB (Nate Wiggins FA vs BAL). LB: 0 mismatches, which points at the DE/DT to DL and CB/S to DB position mapping. Travis Hunter shows "FA" in The League (NatePackard12 owns him) and in Password is taco, where he is on Trevor's own roster | High | map Sleeper DE/DT to DL and CB/S to DB (and WR/CB two-way) when resolving ranked players to Sleeper ids, rebuild, re-run the owner/team cross-check to 0 |
| S3 | Roster Strategy (The League), IDP player card | IDP players leak into non-IDP leagues. The League is superflex with no IDP slots, yet Strategy "Buys" lists LB Carson Schwesinger and DL Maxx Crosby (`app.js` ~4322, `topUnowned` has no `is_idp` gate). Jack Campbell's card offers "Target" in 4 non-IDP leagues, shows VOR -19 computed for Password is taco, and a Week 3 projection of 0.5 for the LB1 because it is scored with a non-IDP league's rules | High | gate IDP positions by `lg.is_idp` in buys, `markButton`, `vorForSleeper` and the card's week band; score IDP players against an IDP league |
| S4 | Every league's Players tab, 390px | The View toggle group is 314px wide in a card that ends at 374px, so "SOS" is cut at the card edge; in the IDP league the Pos group is 380px and the DB and DL buttons are off screen and unreachable. `check-mobile-layout.py` has no Players page, which is why it passes | High | wrap (or scroll) toggle groups inside `.filters` on phone; add the dynasty and IDP Players pages, filters opened, to `PAGES` in `site/check-mobile-layout.py` |
| S5 | Player card Context tab, 390px | Team-context blocks (DET 2025 Tendencies, 2026 Staff, 2026 Turnover) render 486px wide in a 374px modal: 112px cut off, 62 elements overflow | Medium | `min-width: 0` and `width: 100%` on `.ctx-block`, wrap `.kpi-row` |
| S6 | Dashboard Trajectory, Dashboard Market | The subtitle span inside `h2.page-title` inherits the 3px ink text-stroke and drop shadow, so "2026 through 2030, projected with position-aware aging curves" (`app.js` 1500) and "7-day adds/drops across Sleeper" (`app.js` 1421) print as dark smears on purple | Medium | move the `.tip` out of the h2, or `.page-title .tip { -webkit-text-stroke: 0; text-shadow: none }` with a paper color |
| S7 | Sources, Transactions, Roster Snapshot | Dark text on the green turf is effectively invisible: the "Open the Gibbs tier board" and "Aug 22 update, ranks 85-200" links (`app.js` 6517, 6522), the Transactions "Refresh" link, and the "STARTERS" / "DEPTH" captions above Slot Grades | Medium | use the on-turf text treatment from `site/DESIGN.md` (paper fill, ink shadow) for any text that sits on the field |
| S8 | My Rankings, Roster Strategy, Players tables | Players with no resolved Sleeper id show KeepTradeCut team codes: Christian McCaffrey "SFO", Kenneth Gainwell "TBB", Mike Washington Jr. "LVR" in the same list as "LV", Kyle Williams "NEP" in 3 leagues. `ktc.js` carries SFO 29, NOS 29, KCC 25, JAC 22, GBP 22, TBB 21, LVR 21, NEP 20 entries | Medium | normalize KTC codes to Sleeper codes in `site/data/build_ktc.py` (and defensively in `teamChip`) |
| S9 | Roster Snapshot vs Dashboard vs Standings | World of Tanks is "#5" on Dashboard My Leagues and League Standings (starting-lineup strength) but "Rank #1 of 10" on its Snapshot (total roster value including 18% picks), with nothing saying which model. The same header reads ELITE, CONTENDER and "REBUILD outlook", and "FUTURE VALUE value" doubles a word | Medium | name the Snapshot rank ("Roster value rank, picks included") and show the lineup rank beside it; reword the outlook line; drop the doubled "value" |
| S10 | Stats Lab Defense | MIN shows BLITZ% 128.7% (impossible). `projections/build_defense_matchups.py:201` divides player-summed `def_times_blitzed` by team dropbacks, so a play with two blitzers counts twice; `pressure_rate` sums hurries, hits and sacks the same way | Medium | compute team rates per dropback without double counting, or rename the column to "blitzers per dropback"; assert every rate lands in 0..1 |
| S11 | Players SOS view | The default list is one team's depth chart: the first 13+ rows are all LAR (Puka Nacua, then QB2 Ty Simpson, Max Klare, Terrance Ferguson, Colby Parkinson), because rows tie on the week column and nothing breaks the tie. The OWN column cuts owners to 6 characters with no ellipsis ("The Sa", "My Chu", "gander") | Medium | tie-break by projection or value, and ellipsize the owner chip with a title |
| S12 | Dashboard Trajectory, 390px | The header row overflows (385px in 356px) and the "2026 to 2030" column label is cut to "2026->203" | Low | let the header wrap or shorten it on phone |
| S13 | League FAAB tab | BID wraps "$0-" onto one line and "7" onto the next at 1700px; VALUE is "·" on every row in The League; the sidebar highlights "Standings" while FAAB is open (there is no FAAB sub-link) | Low | `white-space: nowrap` on BID, hide an all-empty column, add FAAB to the sidebar league sub-nav |
| S14 | League Transactions, both widths | The feed overflows its plate by 14px (1317 in 1303, 339 in 325): the + markers straddle the plate border and "SEPTEMBER 2026" sits on the timeline rule | Low | pad the feed by the marker radius |
| S15 | Roster Snapshot, Roster by position | Status badges touch the name with no gap ("Caleb Williams[D]", "Malik Nabers[Q]", "Tank Dell[IR]"); position headers print unlabeled numbers ("0 5", "0 15", "-1 5"); the WR plate's inner scroller cuts WR13 mid-row with no hint that it scrolls; the slot-bar marker overflows its track (43px in 36px) | Low | margin before the badge, label or title the header numbers, fade the scroller edge, clamp the marker |
| S16 | ESPN league Standings, 390px | The page header overflows by 4px (362 in 358) | Low | allow the badge row to wrap |
| S17 | Draft Room | Status chips print the raw Sleeper enum "pre_draft" | Low | map to "Pre-draft" |
| S18 | `gibbs-tiers.html`, `gibbs-update-2026-08-22.html` | Both pages use the old dark flat theme, not Backyard, and say "all three of your leagues" and "Your three rosters" while there are five leagues | Low | restyle on the site tokens and fix the league count in `site/data/_sources/build_gibbs_brief.py` |
| S19 | My Rankings | Nearly every row is gold (owned in some league), so gold stops meaning selection; owner chips stack three high per row | Low | reserve gold for "on my roster in the active league", show ownership as one compact chip row |
| S20 | Stats Lab, 390px | The subtitle says "hover any header for its definition", which a phone cannot do, and takes 6 lines above the fold | Low | tap-to-define headers (or a legend), shorter subtitle on phone |
| S21 | Dashboard Market | Trending Drops lists "Tampa Bay Buccaneers DEF", a DST in a dynasty market list | Low | filter DEF and K from the market lists |
| S22 | Dashboard My Leagues | The PV column mixes dynasty PV and redraft VOR (a small "vor" suffix), so one column holds two units | Low | split the redraft figure into its own column or label the header per row type |
| S23 | Wide tables in their own scroller at 1700px (Players Stats and Weekly) | The last column is cut mid-glyph ("PAY", "364") with no scroll affordance | Low | edge fade or shadow on scrollable tables |
| S24 | Player card "Owned in your leagues" | The Trade cell wraps "Trade" over the arrow at 1700px; on phone Owner, Slot and Trade scroll off to the right inside the modal | Low | `nowrap` on the Trade cell, drop Slot or Owner on phone |

## Counts

Images: 7 problems (1 medium, 6 low). Screens: 24 problems (4 high, 7 medium, 13 low).

## Fix tasks queued (dashboard, project fantasy-football, owner ops)

| Task id | Title | Rows |
|---|---|---|
| t-1790321740995 | Stats Lab wide tables unreachable on desktop | S1, S23 |
| t-1790321767725 | Fix wrong team and owner cells (IDP DL/DB ids, KTC team codes) | S2, S8 |
| t-1790321788708 | Keep IDP players out of non-IDP leagues (buys, card, VOR) | S3 |
| t-1790321806577 | Phone layout fixes (Players filters, card Context, trajectory) plus check coverage | S4, S5, S12, S14, S16 |
| t-1790321822999 | Make smeared title subtitles and on-turf links readable | S6, S7 |
| t-1790321842708 | Fix contradictory rank labels, 128% blitz rate and stale copy | S9, S10, S17, S18, S20, S21, S22 |
| t-1790321863222 | Table polish (SOS default sort, FAAB, roster badges, rankings gold) | S11, S13, S15, S19, S24 |
| t-1790321883716 | Image asset cleanup and PWA icon fixes | I1 to I7 |
