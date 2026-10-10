# 2027 mock-draft consensus: sources and method

Built 2026-10-09 by `site/data/build_mock_consensus.py`, which writes `site/data/mock-consensus.js`.
Every source is a plain GET of a public page: no key, no account, no login. NFL Mock Draft Database
and PFF are excluded by rule. A source that fails to load or parse contributes nothing; no pick is
ever filled in.

## Method

- **Mocks only.** A big-board rank is not a pick slot, so boards are not mixed in even where they
  loaded.
- **Freshness cutoff: 60 days.** A mock dated more than 60 days before the build is recorded as
  stale and dropped.
- **Match:** normalized name AND normalized school against `PROSPECT_MODEL.college` rows with
  `cls == 2027`. Names drop accents, punctuation and Jr/Sr/II-V; schools apply a small alias map
  (Miami (Fla.) to Miami, Ohio St. to Ohio State, and so on).
- **Per player:** median pick, min and max pick, source count, newest source date, and the
  source/pick list.
- **Card:** projected round is `ceil(median / 32)`, capped at 7. It ignores compensatory picks.
- **Capital:** `projections/build_capital_ratings.py` scores the median pick through the same
  isotonic per-position model as drafted players (trained through 2024, the 3-year embargo) and
  writes it under a separate `projected` key with `projected: true` on every entry.

## Sources that worked (build of 2026-10-09)

| Source | Dated | Picks parsed | Matched to 2027 rows |
|---|---|---|---|
| Tankathon mock | 2026-10-04 | 101 | 28 |
| WalterFootball, Walt (R1) | 2026-10-07 | 32 | 12 |
| WalterFootball, Charlie Campbell (R1) | 2026-10-09 | 32 | 15 |
| Drafttek (rounds 1, 2, 4, 6 pages) | 2026-10-07 | 256 | 72 |
| CBS Sports, Ryan Wilson (R1) | 2026-10-06 | 32 | 12 |
| CBS Sports, Mike Renner (R1) | 2026-10-06 | 32 | 9 |
| CBS Sports, Josh Edwards (R1) | 2026-10-06 | 32 | 10 |
| Pro Football Network, Jacob Infante (3 rounds) | 2026-08-22 | 99 | 27 |

Result: 73 prospects in the 2027 class with a consensus pick; 39 of them rest on one mock.

## Sources that failed or were not used

Failed on a plain GET:

- ESPN mock pages: HTTP 202 bot challenge, no content.
- NFL.com, Yahoo, The Draft Network, Fox Sports, Sporting News, Sports Illustrated, Draft Ace,
  Underdog, DK Network, Sportskeeda, NBC Sports: 404 on the 2027 mock URLs tried.
- PFN big board: 404.
- USA Today Draft Wire: HTTP 402.
- College Football News: HTTP 403.
- nfldraftbuzz: HTTP 403 (Cloudflare).
- draftcountdown: HTTP 403.
- draftscout, draftsite: no connection.
- Bleacher Report: the 2027 mock URL redirected to an unrelated article.

Reachable but not used:

- Sharp Football mock: dated 2026-04-30, past the 60-day cutoff.
- The Ringer: its board is the 2026 class.
- The 33rd Team: 2026 mocks only.
- Fantasy Nerds: an aggregate of other mocks, so it would double count them.
- WalterFootball rounds 2 and later: paywalled.
- Big boards from Tankathon, WalterFootball, CBS and Drafttek: boards, not mocks.

## Known ceilings

- WalterFootball and CBS publish round 1 only. A borderline first-rounder therefore gets votes
  only from mocks that put him in round 1, which pulls his median early. Drafttek, Tankathon and
  PFN go deeper and partly offset it.
- 39 of 73 players are single-source, so their range is one pick. The card shows the mock count
  next to the range for that reason.
- Strict school matching misses transfers when a mock and the model disagree on the school. Two
  name matches were dropped this way: Drake Lindsey (LSU in the mock, Minnesota in the model) and
  Omarion Miller (Iowa in one mock, Arizona State in the model).
- The projected capital rating is in `capital-ratings.js` but not shown on the card yet; the card
  shows only the projected round and pick range.

## Capital ratings: drafted classes unchanged

`site/data/capital-ratings.js` was snapshotted before the change. The unmodified builder reproduced
the snapshot byte for byte. After the change, the old file minus its closing `};` line is a byte
prefix of the new file: every drafted player is identical and the only addition is the trailing
`projected` block (73 entries, class 2027, none overlapping a drafted id).
