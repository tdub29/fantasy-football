# Mispriced against the Vegas board - Sleeper PPR ADP, 2026-08-30

**Read this first: the gap is positional, not overall.** A player's projected points are compared
with everyone at his own position, and his ADP is ranked the same way, so a +13 means the market
projects him thirteen spots better at his position than the room is drafting him. Comparing raw
points across positions would just say "take quarterbacks", which is not a draft decision.

**Where the numbers come from.** Points are the `pp` column of `site/data/projections.js`, which is
the nine-book season-props board pulled today by `projections/fetch_season_props.py` (BettingPros
public API, no key). ADP is `adp_ppr` from `api.sleeper.app/v1/projections/nfl/regular/2026`, live,
also pulled today. Both refreshed 2026-08-30.

## Underpriced: the market projects better than the room drafts

| Player | Pos | Team | Sleeper ADP | ADP pos rank | Market proj pts | Proj pos rank | Gap |
|---|---|---|---:|---:|---:|---:|---:|
| Josh Downs | WR | IND | 110.7 | WR44 | 175.3 | WR31 | +13 |
| Alec Pierce | WR | IND | 99.0 | WR40 | 177.6 | WR28 | +12 |
| Jayden Reed | WR | GB | 111.0 | WR45 | 173.6 | WR34 | +11 |
| Xavier Worthy | WR | KC | 140.5 | WR54 | 159.4 | WR44 | +10 |
| Deebo Samuel | WR | SF | 129.0 | WR51 | 163.9 | WR41 | +10 |
| Kenny Gainwell | RB | TB | 111.4 | RB36 | 163.1 | RB27 | +9 |
| Trevor Lawrence | QB | JAX | 101.6 | QB12 | 299.0 | QB4 | +8 |
| Brock Purdy | QB | SF | 123.2 | QB15 | 297.4 | QB7 | +8 |
| Rico Dowdle | RB | PIT | 85.0 | RB31 | 174.1 | RB24 | +7 |
| Wan'Dale Robinson | WR | TEN | 116.6 | WR47 | 164.3 | WR40 | +7 |
| Michael Pittman | WR | PIT | 103.6 | WR41 | 172.4 | WR35 | +6 |
| Stefon Diggs | WR | WAS | 109.7 | WR43 | 168.4 | WR37 | +6 |

## Overpriced: drafted ahead of what the market projects

| Player | Pos | Team | Sleeper ADP | ADP pos rank | Market proj pts | Proj pos rank | Gap |
|---|---|---|---:|---:|---:|---:|---:|
| Makai Lemon | WR | PHI | 89.4 | WR37 | 141.1 | WR55 | -18 |
| Carnell Tate | WR | TEN | 66.3 | WR29 | 163.8 | WR42 | -13 |
| Brian Thomas | WR | JAX | 73.5 | WR31 | 160.7 | WR43 | -12 |
| Jordyn Tyson | WR | NO | 93.3 | WR38 | 145.8 | WR50 | -12 |
| Michael Wilson | WR | ARI | 83.9 | WR36 | 150.6 | WR47 | -11 |
| Jordan Addison | WR | MIN | 103.9 | WR42 | 145.3 | WR51 | -9 |
| Dalton Kincaid | TE | BUF | 87.0 | TE10 | 128.6 | TE18 | -8 |
| Chuba Hubbard | RB | CAR | 78.6 | RB28 | 138.8 | RB35 | -7 |
| Kenyon Sadiq | TE | NYJ | 164.4 | TE20 | 105.8 | TE27 | -7 |
| Matthew Stafford | QB | LAR | 96.0 | QB11 | 269.2 | QB17 | -6 |
| Christian Watson | WR | GB | 70.0 | WR30 | 168.6 | WR36 | -6 |
| Blake Corum | RB | LAR | 102.5 | RB34 | 127.3 | RB40 | -6 |

## What this does NOT account for

- **Only players with a posted season prop are here.** 143 of the 143 drafted players inside ADP 180
  carry one. A rookie or a committee back with no book line cannot be mispriced by this method, he
  is simply absent, so absence here is not an opinion.
- **No injury, suspension or camp-news adjustment.** The books price those in; this table does not
  re-price them a second time, and a player whose ADP is falling for a reason will look underpriced.
- **No replacement level.** The gap is a rank distance at one position, not value over a waiver
  baseline, so a +8 at QB is worth less in a one-quarterback league than a +8 at RB.
- **ADP is a moving target in August.** Sleeper's board shifts daily; this is a snapshot, not a
  standing verdict, and it is worth re-pulling before an actual draft.
- **The PrizePicks scrape is currently blocked** (DataDome captcha, 403), so the PrizePicks-only
  players that usually gap-fill the board are missing from today's run. The nine-book market board
  succeeded, which is the source used here.

Regenerate: `python projections/build_all.py` for the market board, then re-run this join.
