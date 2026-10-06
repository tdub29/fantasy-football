# Lane `overall`: preregistration (coordinator, 2026-10-05, written before any scoring)

Requirement source: `Fantasy Football/notes/prospect-model-critique-2026-10-05.md` (main checkout).
Trevor wants one 0-100 overall fantasy prospect rating, comparable across positions, with history
anchored tiers, validated against draft-capital and timestamped-consensus baselines, and a named
sanity panel including Jeremiyah Love. Nothing here is tuned on the panel.

## 1. Common target (fixed before scoring)

Population: QB/RB/WR/TE drafted 2008-2023 (UDFAs in nflverse with a college record are kept as
pick 262 so the capital curve has a floor; report results with and without them).

Season value: full-PPR fantasy points from nflverse weekly stats, regular season, per the site's
scoring (`leagueScorePoints` rules where the raw stat line allows; else nflverse `fantasy_points_ppr`,
stated). Season VOR = max(0, points - replacement[pos, season, format]).

Replacement level: per season, greedily fill every lineup slot of a 10-team league from that
season's realized point totals (dedicated slots first, then FLEX from best remaining RB/WR/TE, then
SUPER_FLEX from best remaining QB/RB/WR/TE). Replacement at a position = best player at that position
not started. Formats (Sleeper `roster_positions`, `site/data/leagues.js`):
- **F1 (primary): Password is taco**, 1QB, QB RB RB WR WR TE + 4 FLEX.
- **F2: The League**, same plus SUPER_FLEX. Team count read from the league file, not assumed.
- **F3: TE premium sensitivity**, F1 with +0.5 per TE reception.

Primary target **VOR3** = sum of season VOR over NFL seasons 1-3 (every class 2008-2023 is fully
observed through 2025). Secondary: VOR4 (classes 2008-2022) and peak single-season VOR in years 1-3.
No target, format or window changes after results are seen.

## 2. Forecasts compared (expanding window by draft year: class Y trained only on classes < Y)

- **C0 capital baseline**: E[VOR3 | log pick, position], monotone in pick within position.
- **K0 consensus baseline** (classes 2019-2023, evaluation only, never a training feature, never
  republished): FantasyPros dynasty rookie ECR via DynastyProcess `db_fpecr` (+2018-2020 archives).
  Two snapshots per class where dated: last pre-draft (no capital) and first post-draft (with capital).
  Licence for the FantasyPros numbers is unverified, so it stays local and only aggregate metrics leave.
- **M1 overall model**: capital plus the existing college profile features from the store
  (`model_feature`, the same inputs the shipped talent and profile models use: production share,
  age/declare, athletic where present, missingness flags), fit to E[VOR3] per position with a simple
  regularized model. Weights come from the expanding-window fit, never from a hand blend.
- **P1 pre-draft variant**: M1 without capital. No licensed timestamped projected-capital source
  exists (NFL Mock Draft Database is restricted), so pre-draft capital is NOT modeled; P1 is reported
  against K0 pre-draft as an honest profile-only forecast.

## 3. Metrics (out of sample, per class, then bootstrap over classes)

Within-class Spearman of forecast vs realized VOR3, pooled across positions (the overall-rank use)
and per position; NDCG@24 per class; precision of the forecast top 24 at producing VOR3 above the
historical 75th percentile; MAE of VOR3. Unrounded values with 90% intervals from 2000 class
resamples. Paired differences M1-C0, M1-K0(post), P1-K0(pre).

## 4. Gates (fixed)

- M1 ships as the overall rating only if it beats C0 on pooled within-class Spearman in >= 90% of
  class resamples AND is not worse than K0-post by more than 0.05 Spearman on 2019-2023.
- If M1 fails, the published overall rating is the capital baseline C0 (post-draft) with the
  profile shown as a secondary component, stated as such.
- Pre-draft (2027, 2028 classes): P1 may be shown as a rating only if it beats K0-pre or is within
  0.05 Spearman of it; otherwise the upcoming board keeps position-specific profile grades and no
  cross-position overall number.

## 5. Rating scale and tiers

Rating = 100 x percentile of the player's expected VOR3 within the pooled reference distribution of
out-of-sample expected VOR3 for all drafted QB/RB/WR/TE 2008-2023. The reference is fixed history, not
the current class, so a weak class cannot make an ordinary prospect look elite. Tiers on the rating:
Elite >= 95, Strong 85-95, Solid 65-85, Dart 35-65, Long shot < 35. Each tier reports the realized
VOR3 distribution of historical players in it (median, share above the 75th percentile).

## 6. Sanity panel (chosen before any rating exists; never used to set weights)

Elite successes: Christian McCaffrey 2017, Saquon Barkley 2018, Justin Jefferson 2020, CeeDee Lamb
2020, Jonathan Taylor 2020, Ja'Marr Chase 2021, Bijan Robinson 2023.
Elite capital, poor outcome: Trent Richardson 2012, Corey Davis 2017, John Ross 2017, N'Keal Harry
2019, Jalen Reagor 2020, Kadarius Toney 2021, Zach Wilson 2021, Eric Ebron 2014.
Late breakouts: Tyreek Hill 2016, Cooper Kupp 2017, George Kittle 2017, Austin Ekeler 2017 (UDFA),
Mark Andrews 2018, Amon-Ra St. Brown 2021, Kyren Williams 2022, Brock Purdy 2022, Puka Nacua 2023.
Ordinary: Tyler Boyd 2016, Devin Singletary 2019, Darrell Henderson 2019, Michael Pittman 2020,
Cole Kmet 2020.
QB format cases: Patrick Mahomes 2017, Josh Allen 2018, Lamar Jackson 2018, Justin Fields 2021.
Current: **Jeremiyah Love** (2026, RB, pick 3), Eli Stowers (2026, TE, pick 54), Kenyon Sadiq (2026,
TE, pick 16), plus the top five of each upcoming class under P1.

Expectation stated in advance: under F1 a top-5-pick RB with a strong profile should rate Elite; if
Love does not, diagnose coverage, age, production normalization, positional scale, capital and
uncertainty before anything is published. Stowers is not expected near the top under F1. A panel
miss is reported, not tuned away; passing the panel certifies nothing on its own.
