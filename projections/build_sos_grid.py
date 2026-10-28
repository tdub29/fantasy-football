"""Build position SOS from schedule plus defense-vs-position results.

The prior season remains the stable baseline. Completed current-season games are
pooled into it by real fantasy points and real games played. The current Sleeper
week defines the cutoff, so a Thursday game never leaks into a week that is still
being played.

Opponent adjustment:
Computes Points Allowed Over Expected (PAOE) for each defense and position using
a leave-one-out opponent baseline (points scored by that offense's position across
other games). This distinguishes shutdown defenses from defenses that merely
faced weak offensive schedules.

Inputs:
  historical/player_stats/week_{prior_season}.csv (if available, else derived/def_vs_pos.csv)
  nflverse current-season weekly player stats, with local-file fallback
  site/data/sos.js and site/data/weekly-rankings.js

Emits site/data/sos-grid.js (window.SOS_GRID).
"""
import csv
import io
import json
import pathlib
import sys
import urllib.request
from collections import defaultdict

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SITE = ROOT / "site" / "data"
HISTORICAL = ROOT / "historical"
DVP = HISTORICAL / "derived" / "def_vs_pos.csv"
POSITIONS = ["QB", "RB", "WR", "TE"]
CURRENT_STATS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_week_{season}.csv"
)
# def_vs_pos uses nflverse codes; schedule uses Sleeper-style codes.
ENV_TO_NFLVERSE = {"LAR": "LA"}
NFLVERSE_TO_ENV = {"LA": "LAR"}

sys.path.insert(0, str(HISTORICAL))
from build_def_vs_pos import offense_points_ppr  # noqa: E402


def load_js(path):
    text = path.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def load_context():
    schedule = load_js(SITE / "sos.js")["teams"]
    weekly = load_js(SITE / "weekly-rankings.js")
    season = int(weekly["season"])
    completed_week = max(0, int(weekly.get("currentWeek") or 1) - 1)
    return schedule, season, completed_week


def current_rows(season):
    """Fetch current stats, falling back to last local nflverse snapshot."""
    try:
        request = urllib.request.Request(
            CURRENT_STATS_URL.format(season=season),
            headers={"User-Agent": "Mozilla/5.0 FantasyHub/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8-sig")
        return list(csv.DictReader(io.StringIO(text))), "nflverse live weekly stats"
    except Exception as exc:
        local = HISTORICAL / "player_stats" / f"week_{season}.csv"
        if not local.exists():
            print(f"current DvP unavailable ({exc}); using prior season only")
            return [], "prior season only"
        with local.open(encoding="utf-8-sig") as source:
            return list(csv.DictReader(source)), f"local {local.name} fallback"


def compute_season_paoe(rows, season, through_week):
    """
    Computes Points Allowed Over Expected (PAOE) for each defense and position in a given season.
    Returns:
      deltas: (def_team, pos) -> list of deltas (actual - leave-one-out expected)
      pos_league_avg: pos -> float
      team_games_count: int
    """
    game_pos = defaultdict(lambda: {'pts': 0.0, 'def': ''})
    def_game = defaultdict(lambda: {'pts': 0.0, 'off': ''})
    team_games = set()

    for r in rows:
        if r.get("season_type") != "REG":
            continue
        try:
            row_season = int(r.get("season") or 0)
            week = int(r.get("week") or 0)
        except Exception:
            continue
        if row_season != season or not (1 <= week <= through_week):
            continue
        pos = (r.get("position") or "").upper()
        if pos not in POSITIONS:
            continue
        off = r.get("recent_team") or r.get("team_abbr") or r.get("team")
        defe = r.get("opponent_team")
        if not off or not defe:
            continue
        defe = NFLVERSE_TO_ENV.get(defe, defe)
        off = NFLVERSE_TO_ENV.get(off, off)

        pts = offense_points_ppr(r)
        game_pos[(off, week, pos)]['pts'] += pts
        game_pos[(off, week, pos)]['def'] = defe
        def_game[(defe, week, pos)]['pts'] += pts
        def_game[(defe, week, pos)]['off'] = off
        team_games.add((defe, week))

    off_pos_totals = defaultdict(lambda: {'pts': 0.0, 'games': 0})
    for (off, week, pos), data in game_pos.items():
        off_pos_totals[(off, pos)]['pts'] += data['pts']
        off_pos_totals[(off, pos)]['games'] += 1

    pos_league_totals = defaultdict(lambda: {'pts': 0.0, 'games': 0})
    for (off, pos), data in off_pos_totals.items():
        if data['games'] > 0:
            pos_league_totals[pos]['pts'] += data['pts'] / data['games']
            pos_league_totals[pos]['games'] += 1
    pos_league_avg = {
        p: (pos_league_totals[p]['pts'] / pos_league_totals[p]['games'] if pos_league_totals[p]['games'] else 0.0)
        for p in POSITIONS
    }

    def_deltas = defaultdict(list)
    for (defe, week, pos), data in def_game.items():
        off = data['off']
        actual = data['pts']
        tot_pts = off_pos_totals[(off, pos)]['pts']
        tot_games = off_pos_totals[(off, pos)]['games']
        if tot_games > 1:
            expected = (tot_pts - actual) / (tot_games - 1)
        else:
            expected = pos_league_avg[pos]
        def_deltas[(defe, pos)].append(actual - expected)

    return def_deltas, pos_league_avg, len(team_games)


def pooled_dvp(history_rows, live_rows, season, through_week):
    prior_years = sorted({
        int(row["season"]) for row in history_rows
        if row.get("season", "").isdigit() and int(row["season"]) < season
    })
    if not prior_years:
        raise ValueError(f"no completed DvP season before {season}")
    prior_season = prior_years[-1]

    prior_csv = HISTORICAL / "player_stats" / f"week_{prior_season}.csv"
    is_real_history = history_rows and any(r.get("def_team") in ("ARI", "KC", "SF", "BAL") for r in history_rows)
    if prior_csv.exists() and is_real_history:
        with prior_csv.open(encoding="utf-8-sig") as f:
            prior_rows = list(csv.DictReader(f))
        deltas_prior, league_avg_prior, _ = compute_season_paoe(prior_rows, prior_season, 18)
    else:
        prior_totals = defaultdict(float)
        prior_counts = defaultdict(int)
        for row in history_rows:
            if int(row["season"]) == prior_season and row["opp_pos"] in POSITIONS:
                prior_totals[row["opp_pos"]] += float(row["fp_ppr_total"])
                prior_counts[row["opp_pos"]] += int(row["games"])
        league_avg_prior = {p: (prior_totals[p] / prior_counts[p] if prior_counts[p] else 0.0) for p in POSITIONS}
        deltas_prior = defaultdict(list)
        for row in history_rows:
            if int(row["season"]) == prior_season and row["opp_pos"] in POSITIONS:
                g = int(row["games"])
                delta = float(row.get("fp_ppr_per_g") or (float(row["fp_ppr_total"]) / g)) - league_avg_prior[row["opp_pos"]]
                deltas_prior[(row["def_team"], row["opp_pos"])] = [delta] * g

    deltas_curr, league_avg_curr, current_team_games = compute_season_paoe(live_rows, season, through_week)
    base_league_avg = league_avg_curr if current_team_games > 0 else league_avg_prior

    pooled_fpa = {}
    pooled_paoe = {}
    all_teams = set([t for t, p in deltas_prior] + [t for t, p in deltas_curr])

    for pos in POSITIONS:
        for team in all_teams:
            d_p = deltas_prior.get((team, pos), [])
            d_c = deltas_curr.get((team, pos), [])
            tot_games = len(d_p) + len(d_c)
            if tot_games > 0:
                avg_delta = (sum(d_p) + sum(d_c)) / tot_games
            else:
                avg_delta = 0.0
            pooled_paoe[(team, pos)] = avg_delta
            pooled_fpa[(team, pos)] = base_league_avg[pos] + avg_delta

    return pooled_fpa, pooled_paoe, prior_season, current_team_games


def build_payload(schedule, history_rows, live_rows, season, through_week, source):
    fpa, paoe, prior_season, current_team_games = pooled_dvp(
        history_rows, live_rows, season, through_week
    )
    rank = {}
    for pos in POSITIONS:
        teams = sorted(
            {team for team, player_pos in fpa if player_pos == pos},
            key=lambda team: (fpa[(team, pos)], team),
        )
        for number, team in enumerate(teams, start=1):
            rank[(team, pos)] = number
    n_def = len({team for team, pos in fpa if pos == "RB"})

    def dvp(env_abbr, pos):
        code = ENV_TO_NFLVERSE.get(env_abbr, env_abbr)
        code = NFLVERSE_TO_ENV.get(code, code)
        r = rank.get((code, pos))
        val = fpa.get((code, pos))
        delta = paoe.get((code, pos))
        return r, val, delta

    teams_sorted = sorted(schedule)
    grid = {pos: {} for pos in POSITIONS}
    for pos in POSITIONS:
        for team in teams_sorted:
            games = []
            for game in schedule[team]["schedule"]:
                number, allowed, delta = dvp(game["opp"], pos)
                games.append({
                    "week": game["week"], "opp": game["opp"], "home": game["home"],
                    "rank": number,
                    "fpa": round(allowed, 1) if allowed is not None else None,
                    "paoe": round(delta, 1) if delta is not None else None,
                })
            grid[pos][team] = games

    has_current = current_team_games > 0
    if has_current:
        week_label = f"W1-{through_week}" if through_week > 1 else "W1"
        season_label = f"{prior_season} + {season} {week_label}"
        note = (
            f"opponent defense-vs-position: opponent-adjusted PPR allowed over expected, "
            f"pooled {prior_season} plus completed {season} games through Week {through_week} "
            f"by games (1 = toughest / fewest allowed relative to baseline, {n_def} = easiest / most generous)"
        )
    else:
        season_label = str(prior_season)
        note = (
            f"opponent defense-vs-position: {prior_season} opponent-adjusted PPR allowed, "
            f"ranked (1 = toughest / fewest allowed relative to baseline, {n_def} = easiest / most generous)"
        )

    return {
        "season": season_label,
        "positions": POSITIONS,
        "n_def": n_def,
        "note": note,
        "source": source,
        "basis": {
            "prior_season": prior_season,
            "current_season": season,
            "current_through_week": through_week if has_current else 0,
            "current_team_games": current_team_games,
            "method": "opponent-adjusted fantasy points over expected, pooled with prior season by games",
        },
        "teams": teams_sorted,
        # Only a complete 17-game schedule proves its single bye.
        "bye_weeks": {
            team: sorted(set(range(1, 19)) - {g["week"] for g in schedule[team]["schedule"]})
            for team in teams_sorted
            if len({g["week"] for g in schedule[team]["schedule"]}) == 17
        },
        "grid": grid,
    }


def self_check():
    history = []
    for team, base in (("AAA", 10), ("BBB", 20)):
        for pos in POSITIONS:
            history.append({
                "season": "2025", "def_team": team, "opp_pos": pos,
                "games": "2", "fp_ppr_total": str(base * 2),
                "fp_ppr_per_g": str(base),
            })
    current = [
        {"season": "2026", "week": "1", "season_type": "REG", "position": "RB",
         "team": "CCC", "opponent_team": "AAA", "rushing_yards": "100"},
        {"season": "2026", "week": "2", "season_type": "REG", "position": "RB",
         "team": "CCC", "opponent_team": "AAA", "rushing_yards": "900"},
    ]
    fpa, paoe, prior, team_games = pooled_dvp(history, current, 2026, 1)
    assert prior == 2025
    assert team_games == 1
    assert ("AAA", "RB") in fpa
    assert ("BBB", "RB") in fpa
    _, _, _, no_games = pooled_dvp(history, current, 2026, 0)
    assert no_games == 0
    print("build_sos_grid self-check ok")


def main():
    if "--self-check" in sys.argv:
        self_check()
        return
    schedule, season, through_week = load_context()
    with DVP.open(encoding="utf-8") as source:
        history_rows = list(csv.DictReader(source))
    live_rows, source = current_rows(season)
    payload = build_payload(
        schedule, history_rows, live_rows, season, through_week, source
    )
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "sos-grid.js").write_text(
        "window.SOS_GRID = "
        + json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    basis = payload["basis"]
    print(
        f"wrote sos-grid.js: {len(payload['teams'])} teams x {POSITIONS}; "
        f"{basis['prior_season']} plus {basis['current_team_games']} "
        f"team-games through {basis['current_season']} Week "
        f"{basis['current_through_week']} ({source})"
    )


if __name__ == "__main__":
    main()
