"""Build position SOS from schedule plus defense-vs-position results.

The prior season remains the stable baseline. Completed current-season games are
pooled into it by real fantasy points and real games played. The current Sleeper
week defines the cutoff, so a Thursday game never leaks into a week that is still
being played.

Inputs:
  historical/derived/def_vs_pos.csv
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


def aggregate_current(rows, season, through_week):
    totals = defaultdict(float)
    games = defaultdict(set)
    team_games = set()
    for row in rows:
        try:
            row_season = int(row.get("season") or 0)
            week = int(row.get("week") or 0)
        except ValueError:
            continue
        pos = (row.get("position") or "").upper()
        defense = row.get("opponent_team")
        if (row.get("season_type") != "REG" or row_season != season
                or not 1 <= week <= through_week or pos not in POSITIONS
                or not defense):
            continue
        key = (defense, pos)
        totals[key] += offense_points_ppr(row)
        games[key].add((season, week))
        team_games.add((defense, week))
    return {
        key: {"total": total, "games": len(games[key])}
        for key, total in totals.items()
    }, len(team_games)


def pooled_dvp(history_rows, live_rows, season, through_week):
    prior_years = sorted({
        int(row["season"]) for row in history_rows
        if row.get("season", "").isdigit() and int(row["season"]) < season
    })
    if not prior_years:
        raise ValueError(f"no completed DvP season before {season}")
    prior_season = prior_years[-1]
    samples = {}
    for row in history_rows:
        if int(row["season"]) != prior_season or row["opp_pos"] not in POSITIONS:
            continue
        samples[(row["def_team"], row["opp_pos"])] = {
            "total": float(row["fp_ppr_total"]),
            "games": int(row["games"]),
        }

    current, current_team_games = aggregate_current(live_rows, season, through_week)
    for key, sample in current.items():
        pooled = samples.setdefault(key, {"total": 0.0, "games": 0})
        pooled["total"] += sample["total"]
        pooled["games"] += sample["games"]

    fpa = {
        key: sample["total"] / sample["games"]
        for key, sample in samples.items() if sample["games"]
    }
    return fpa, prior_season, current_team_games


def build_payload(schedule, history_rows, live_rows, season, through_week, source):
    fpa, prior_season, current_team_games = pooled_dvp(
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
        return rank.get((code, pos)), fpa.get((code, pos))

    teams_sorted = sorted(schedule)
    grid = {pos: {} for pos in POSITIONS}
    for pos in POSITIONS:
        for team in teams_sorted:
            games = []
            for game in schedule[team]["schedule"]:
                number, allowed = dvp(game["opp"], pos)
                games.append({
                    "week": game["week"], "opp": game["opp"], "home": game["home"],
                    "rank": number,
                    "fpa": round(allowed, 1) if allowed is not None else None,
                })
            grid[pos][team] = games

    has_current = current_team_games > 0
    if has_current:
        week_label = f"W1-{through_week}" if through_week > 1 else "W1"
        season_label = f"{prior_season} + {season} {week_label}"
        note = (
            f"opponent defense-vs-position: {prior_season} plus completed {season} "
            f"games through Week {through_week}, pooled by games (1 = fewest allowed = "
            f"toughest matchup, {n_def} = easiest)"
        )
    else:
        season_label = str(prior_season)
        note = (
            f"opponent defense-vs-position: {prior_season} PPR allowed, ranked "
            f"(1 = fewest allowed = toughest matchup, {n_def} = easiest)"
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
            "method": "pooled fantasy points divided by pooled games",
        },
        "teams": teams_sorted,
        "grid": grid,
    }


def self_check():
    history = []
    for team, base in (("AAA", 10), ("BBB", 20)):
        for pos in POSITIONS:
            history.append({
                "season": "2025", "def_team": team, "opp_pos": pos,
                "games": "2", "fp_ppr_total": str(base * 2),
            })
    current = [
        {"season": "2026", "week": "1", "season_type": "REG", "position": "RB",
         "opponent_team": "AAA", "rushing_yards": "100"},
        {"season": "2026", "week": "2", "season_type": "REG", "position": "RB",
         "opponent_team": "AAA", "rushing_yards": "900"},
    ]
    fpa, prior, team_games = pooled_dvp(history, current, 2026, 1)
    assert prior == 2025
    assert team_games == 1
    assert round(fpa[("AAA", "RB")], 2) == 10.0, fpa[("AAA", "RB")]
    assert fpa[("BBB", "RB")] == 20.0
    _, _, no_games = pooled_dvp(history, current, 2026, 0)
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
