# Data table layout audit, 2026-09-17

All 25 `table.data` instances walked at 1500px, 390px and 320px. Twelve got a sizing
contract, ten of the flagged sprawl cases are gone, and nothing regressed on the phone.

Re-run the measurement any time with:

```bash
cd "C:\Users\TrevorWhite\Downloads\Big Projects\Fantasy Football\site"
python _table_audit.py              # 1500 and 390
python _table_audit.py --width 320  # the WCAG reflow width
python _table_shots.py              # look at it, numbers do not catch stranding
```

## Two corrections to the brief

**There are 25 tables, not 24.** The brief's count came from `grep "class:.data"`, which
also matches the four `data-fresh*` classes on the sidebar freshness chip, and misses the
five tables written `class: 'data'` with a space after the colon. The reliable census is
`grep -c "h('table'" site/js/app.js`.

**The a11y pass the brief names does not exist in this repo.** There is no axe-core, no
`axe_playwright_python`, and no a11y script under `site/` or `.agents/scripts/`, so "stays
at zero violations" could not be re-run as written. What was checked instead is the one
success criterion this change could plausibly break, WCAG 2.2 **1.4.10 Reflow**: no route
requires horizontal page scroll at 320px CSS width. It does not, on any of the 33 mapped
features. Colors and row heights were not touched, so contrast and target size are
unchanged by construction.

## What was actually wrong

`table.data` is `width:100%` with no column sizing. That is correct for the 14-to-25
column boards and wrong for every small one, because a table stretched past its content
width puts dead space between a label and its own number. The header-alignment fix that
landed before this task was real but separate: the numeric headers were already over the
right columns, just 300px away from the values.

Measured stretch is `rendered width / content width`, where content width comes from a
hidden `width:max-content` clone of the real table rather than a guess about text length.

| Table | app.js owner | cols | content | rendered | stretch | verdict |
|---|---|---|---|---|---|---|
| Rookie Pick Values (1QB) | `viewStrategy` | 4 | 374 | 1192 | **3.19x** | snug |
| Data Freshness | `viewAbout` | 3 | 383 | 1164 | **3.04x** | fill-last |
| Player card schedule strip | `scheduleStrip` | 5 | 287 | 634 | **2.21x** | snug |
| Player card season history | `historyBlock` | 7 | 362 | 666 | **1.84x** | snug-center |
| Team offense best lineup | `viewProjections` | 4 | 692 | 1164 | **1.68x** | fill-last |
| Position Age Curves | `viewStrategy` | 5 | 717 | 1192 | **1.66x** | snug |
| Dashboard cornerstones | `viewDashboard` | 6 | 739 | 1164 | **1.58x** | snug |
| Player card efficiency | `contextBlock` | 7 | 412 | 636 | **1.54x** | snug-center |
| My Leagues | `viewLeagues` | 8 | 798 | 1192 | 1.49x | snug |
| Dashboard trajectory / watch | `viewDashboard` | 7 | 807 | 1192 | 1.48x | snug |
| Trade calculator team needs | `buildTeamNeeds` | 6 | 866 | 1192 | 1.38x | snug |
| Ideal Trade Partners | `viewRoster` | 5 | 920 | 1192 | 1.30x | snug |
| Player card ownership | `playerModal` | 5 | 542 | 666 | 1.23x | left fluid |
| Roster sections (x4) | `viewRoster` | 14 | ~1060 | 1192 | 1.11x | left fluid |
| SOS grid | `viewSosGrid` | 21 | 1176 | 1196 | 1.02x | left fluid |
| Weekly rankings | `renderLeaguePlayers` | 20 | 1512 | 1507 | 1.00x | left fluid |
| Sleeper weeks | `renderLeaguePlayers` | 23 | 1492 | 1492 | 1.00x | left fluid |
| ROS rankings | `renderLeaguePlayers` | 20 | 1498 | 1498 | 1.00x | left fluid |
| Projections players | `viewProjections` | 21 | 1444 | 1384 | 0.96x | left fluid |
| League players | `renderLeaguePlayers` | 25 | 1808 | 1689 | 0.93x | left fluid |
| My Rankings | `viewRankings` | 15 | 1660 | 1333 | 0.80x | left fluid |

After: **every table sits at 1.00x on its own contract, at 1500px, 390px and 320px.**

## Three contracts, because one rule was wrong twice

The first attempt put `width: fit-content` on every narrow table. That fixed the stretch
number everywhere and looked broken in two distinct ways, which is why there are three
classes instead of one. Numbers alone would have shipped it.

**`snug`** (8 tables): `width: fit-content; max-width: 100%`, plus a `:has()` rule that
lets the wrapping `.tbl-scroll` and `.card` shrink with it. Use when the table IS the
card's content. The card ends up 4px wider than the table, which is the border, and the
plate hugs the table the way the Backyard standard wants.

**`fill-last`** (2 tables): the table stays full width and the *columns* tighten, with all
the slack landing in the one column left unconstrained. Use when the card has its own
full-width chrome that the table cannot shrink away from. The About card has a heading and
a paragraph; the projections card has a title bar and a footnote. A 692px table under a
993px title bar reads as a table that failed to draw its right half, and `snug` produced
exactly that. Pick a last column that genuinely wants the room: here "Built" (a timestamp)
and "Core" (a list of player names). Team offense now renders `#` 40px, `Team` 224px,
`Proj Pts` 73px, `Core` 827px, so every number is against its header and the slack is
useful.

**`snug-center`** (2 tables): `fit-content` plus `margin-inline: auto`, and the card stays
full width. Use when the card has full-width chrome AND the last column is a number too,
so `fill-last` would just move the gap inside the data. Both player-card stat tables are
all-numeric, so they centre under their title bar instead.

The remaining 11 tables were left alone deliberately. Nine are 14-to-25 column boards at
0.80x to 1.11x, already using their width. Two are mild (1.11x, 1.23x) and sit under
full-width chrome, so any cap costs more than it buys.

## Traps worth keeping

**`fit-content` is poison on the wide boards.** It resolves against the AVAILABLE width,
so on a 25-column table inside a scroll wrapper it shrinks toward min-content and crushes
the very columns `.tbl-scroll` and the `min-width` on `.weekly-rankings-table` /
`.sleeper-weeks-table` exist to keep scrollable at full size. All three classes are opt-in
for this reason; never move one to the `table.data` base rule.

**The clipping half of the brief was already solved.** `wrapDataTables()` runs on every
route and wraps every `table.data` in `.tbl-scroll`, which defeats the `overflow:hidden`
on the cards. Nothing measured as clipped and no route scrolls horizontally at 320px. Do
not add another scroll wrapper.

**A stretch metric lies about a `fill-last` table.** It is *supposed* to be full width, so
scoring the whole table reports 1.68x on a table that is already right. `_table_audit.py`
reads the table's own class and scores `fill-last` on its non-last columns only. Without
that the tool sends the next reader off to "fix" correct code.

**`silencedetect`-class mistake, the local version:** the audit measures content width from
a `visibility:hidden` clone, not `display:none`. A `display:none` clone lays out at zero
and every table scores as infinitely sprawling.

## Not reachable, so not measured

Five of the 25 could not be rendered, and none was changed:

- `viewAllPlayers` (6 cols) is **dead code**. `route()` maps `case 'players'` to
  `navigate('#dashboard')` with the comment that the per-league Players tab covers it, so
  nothing can reach this table. A candidate for deletion, not for a width class.
- Three `renderDraftBoard` tables (6, ~11 and 4 cols) need a live Sleeper draft. `#draft`
  answers `Could not load draft ...: Sleeper returned 4xx` out of season. Check these
  during the next real draft; the 4-column needs table is the same shape as the 3.19x case
  and probably wants `snug`.
- One `renderLeaguePlayers` sticky table (11px) did not appear on any Players sub-tab.

Also noted while walking the routes, and NOT a bug: the roster view renders only Slot
Grades and Lineup Composition unless you are on your OWN roster's `strategy` sub-tab. That
is the `if (r.is_me && tab === 'strategy')` gate at `viewRoster`, and it is deliberate,
since telling someone else's team to sell its own players is noise. Reaching those tables
means `#roster/<leagueId>/<yourRosterId>/strategy`.

## Gates

- `python _table_audit.py` at 1500 / 390 / 320: **0 flagged**, no horizontal page scroll.
- `node --check site/js/app.js`: clean.
- All **16** `site/js/*.test.js`: pass.
- `python site/check-field-tile.py`: `field ok: 3 layers, 18 numerals clear of chalk`.
- `verify-app.py "Fantasy Football"`: **33/33 features pass** (the map gained a feature
  during this session from concurrent work in the repo; the baseline was 32/32).

A run mid-session reported `33/33 features pass. NOT VERIFIED`, because
`fonts.gstatic.com` failed a woff2 fetch with `net::ERR_NETWORK_IO_SUSPENDED`. The clean
re-run reports `33/33 features pass. VERIFIED`, so that was the machine's network and not
this change. `verify-app.py` fails the whole run on any failed request, including a Google
Fonts CDN blip, so re-run it once before chasing a NOT VERIFIED that names a font.

## Concurrent writer in this repo

`site/js/app.js` was rewritten three times during this session (14:35, 14:40, and again
during the last edit), shifting table line numbers by +58, then -1, then +32, and
`CLAUDE.md` gained a `check-field-tile.py` requirement mid-run. A lease was held on
`styles.css` and `app.js` the whole time, so the writer is not lease-aware.

Because of that, the edits are anchored to each table's **position in file order**, not to
a line number, and each one asserts the exact class string it expects before substituting.
A line-numbered patch written at the start of this session would have landed on the wrong
tables. Use the same approach here until the concurrent writer is identified.

## 2026-09-18: the three draft-board tables, measured without a live draft

The follow-up task said to check these "during the next real draft". That was a wait, not a
gate. `renderDraftBoard`'s only external dependency is two Sleeper endpoints, so stubbing
`window.fetch` for `/v1/draft/<id>` and `/v1/draft/<id>/picks` renders the whole view in
Playwright, out of season, with no network. The fixture and three probes live in
`_table_audit.py` (`DRAFT_FIXTURE_ID`, `fixture_steps`), and `_table_shots.py` reuses them.

The fixture is a 12-team superflex snake, 15 rounds, 9 picks in, `status: 'paused'` so
`setPoll` never starts a live beat mid-measurement. The drawer tab and board mode come from
seeding `localStorage['ff-draft-view::<id>']` rather than clicking the tab bar, whose order
moves.

| Table | app.js owner | cols | content | rendered | stretch | verdict |
|---|---|---|---|---|---|---|
| Draft your-team lineup | `renderDraftBoard` teamPane | 6 | 456 | 1232 | **2.70x** | snug |
| Draft available board | `renderDraftBoard` | 28 | 1814 | 1590 | 0.88x | left fluid |
| Draft SOS grid | `renderDraftBoard` | 23 | 1425 | 1232 | 0.86x | left fluid |

Only the lineup table was wrong, and it was the worst case in the app after the first pass:
`Patrick Mahomes` sat about 350px from his own `KC` chip. `snug` fixes it, and the reason it
does not strand here is that `.draft-pane` is not a `.card`, so neither `:has()` rule fires.
The table shrinks to its content and left-anchors under a `.tip` line that starts at the same
left edge. There is no plate border around it to be left half empty, which is the condition
that made `snug` wrong on the About and projections cards. At 390px `max-width:100%` puts it
back to full width and the names wrap; no horizontal page scroll at 320px.

**Two corrections to the brief.** There is no separate 4-column `Team | Need | Tier` table:
`Need` is a column inside the 28-column available board, which measures 0.88x and wants
nothing. And the census is 28 `h('table'` matches now, not 25, so position indices 22/23/24
from the brief point at the wrong tables. Anchor on the surrounding source text instead
(`teamPane.appendChild(h('table', { class:'data data-sticky' },`), which is unique.

Gates: `_table_audit.py` at 1500 / 390 / 320 with the three new probes, `node --check`, all 16
`site/js/*.test.js`, `check-field-tile.py`, `verify-app.py`.
