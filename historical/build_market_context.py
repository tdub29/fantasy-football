"""Build market-derived game/team context.

Inputs:
  schedules/games.csv          full schedule history + Vegas lines
  pbp/{year}.csv.gz            for pace + PROE

Outputs (derived/):
  game_team_context.csv        per (game_id, team): implied_total, spread_for_team,
                                total_line, is_home, opp, weather (temp, wind, roof, surface)
  team_season_market.csv       per (team, season): avg_implied_total,
                                pass_rate, pass_rate_over_expected (PROE),
                                plays_per_game, seconds_per_play, neutral_pass_rate,
                                wins, losses
"""
from __future__ import annotations

import csv
import gzip
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "derived"
OUT.mkdir(exist_ok=True)


def to_f(x) -> float:
    try:
        if x in (None, "", "NA"):
            return 0.0
        return float(x)
    except Exception:
        return 0.0


def to_i(x) -> int:
    try:
        if x in (None, "", "NA"):
            return 0
        return int(float(x))
    except Exception:
        return 0


# ============================================================
# 1. game_team_context.csv
# ============================================================
def build_game_team_context() -> dict[tuple, dict]:
    rows: list[dict] = []
    by_team_season: dict[tuple, list[float]] = defaultdict(list)
    with open(ROOT / "schedules/games.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                season = int(r["season"])
            except (KeyError, ValueError):
                continue
            if season < 2010:
                continue
            game_id = r["game_id"]
            home, away = r["home_team"], r["away_team"]
            total = to_f(r.get("total_line"))
            spread = to_f(r.get("spread_line"))  # negative = home favored
            # implied totals: total/2 minus half the spread for the favorite
            # spread_line: home minus away expected diff; positive = home favored
            implied_home = (total / 2 + spread / 2) if total else 0
            implied_away = (total / 2 - spread / 2) if total else 0
            roof = r.get("roof") or ""
            temp = to_f(r.get("temp"))
            wind = to_f(r.get("wind"))
            surface = r.get("surface") or ""
            week = to_i(r.get("week"))

            for team, opp, is_home, implied, spread_for in [
                (home, away, True, implied_home, spread),
                (away, home, False, implied_away, -spread),
            ]:
                rows.append({
                    "game_id": game_id, "season": season, "week": week,
                    "team": team, "opp": opp, "is_home": int(is_home),
                    "total_line": total, "spread_for_team": spread_for,
                    "implied_total": round(implied, 2),
                    "roof": roof, "temp": temp, "wind": wind, "surface": surface,
                })
                if total:
                    by_team_season[(team, season)].append(implied)

    out = OUT / "game_team_context.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"wrote {out}: {len(rows)} rows")

    return by_team_season


# ============================================================
# 2. team_season_market.csv — pace + PROE from PBP
# ============================================================
def build_team_season_market(by_team_season: dict[tuple, list[float]]) -> None:
    # Pace/PROE: only from PBP files we have (2020-2025)
    team_plays: dict[tuple, int] = defaultdict(int)
    team_pass_atts: dict[tuple, int] = defaultdict(int)
    team_secs: dict[tuple, float] = defaultdict(float)
    team_games: dict[tuple, set] = defaultdict(set)
    # Neutral = win prob 20-80%, score within 7, Q1-Q3
    team_neutral_plays: dict[tuple, int] = defaultdict(int)
    team_neutral_pass: dict[tuple, int] = defaultdict(int)
    # Expected pass rate: simple league-average baseline per down × distance × wp bucket
    # We'll compute league avg then subtract realized.
    league_pass_by_situation: dict[tuple, list[int]] = defaultdict(lambda: [0, 0])  # [pass, total]

    for yr in range(2020, 2026):
        f = ROOT / "pbp" / f"{yr}.csv.gz"
        if not f.exists():
            continue
        with gzip.open(f, "rt", encoding="utf-8", errors="replace") as fin:
            reader = csv.DictReader(fin)
            for r in reader:
                if r.get("season_type") != "REG":
                    continue
                posteam = r.get("posteam")
                if not posteam:
                    continue
                # Skip non-play rows
                if r.get("play_type") not in ("pass", "run", "qb_kneel", "qb_spike"):
                    continue
                season = int(r.get("season") or yr)
                gid = r.get("game_id")
                key = (posteam, season)
                team_plays[key] += 1
                team_games[key].add(gid)
                is_pass = 1 if r.get("pass_attempt") == "1" else 0
                team_pass_atts[key] += is_pass

                # Pace: seconds elapsed between consecutive snaps (approx via game_seconds_remaining diff)
                # Cheaper proxy: count plays and games
                try:
                    down = int(r.get("down") or 0)
                    ydstogo = to_i(r.get("ydstogo"))
                    qtr = int(r.get("qtr") or 0)
                    score_diff = abs(to_i(r.get("score_differential")))
                    wp = to_f(r.get("wp"))
                except (TypeError, ValueError):
                    down = 0; ydstogo = 0; qtr = 0; score_diff = 99; wp = 0.5
                neutral = (0.2 <= wp <= 0.8) and score_diff <= 7 and 1 <= qtr <= 3
                if neutral:
                    team_neutral_plays[key] += 1
                    team_neutral_pass[key] += is_pass

                # League situation baseline buckets: down × ydstogo group × qtr
                ytg_group = "short" if ydstogo <= 3 else ("med" if ydstogo <= 7 else "long")
                sit_key = (down, ytg_group, qtr)
                league_pass_by_situation[sit_key][0] += is_pass
                league_pass_by_situation[sit_key][1] += 1

    # Compute team PROE = sum of (realized - league_expected_for_situation) / total plays
    team_proe_num: dict[tuple, float] = defaultdict(float)
    team_proe_den: dict[tuple, int] = defaultdict(int)
    league_rates = {k: (v[0] / v[1]) if v[1] else 0 for k, v in league_pass_by_situation.items()}

    for yr in range(2020, 2026):
        f = ROOT / "pbp" / f"{yr}.csv.gz"
        if not f.exists():
            continue
        with gzip.open(f, "rt", encoding="utf-8", errors="replace") as fin:
            for r in csv.DictReader(fin):
                if r.get("season_type") != "REG":
                    continue
                posteam = r.get("posteam")
                if not posteam:
                    continue
                if r.get("play_type") not in ("pass", "run"):
                    continue
                season = int(r.get("season") or yr)
                try:
                    down = int(r.get("down") or 0)
                    ydstogo = to_i(r.get("ydstogo"))
                    qtr = int(r.get("qtr") or 0)
                except ValueError:
                    continue
                ytg_group = "short" if ydstogo <= 3 else ("med" if ydstogo <= 7 else "long")
                sit_key = (down, ytg_group, qtr)
                exp = league_rates.get(sit_key, 0)
                realized = 1 if r.get("pass_attempt") == "1" else 0
                team_proe_num[(posteam, season)] += (realized - exp)
                team_proe_den[(posteam, season)] += 1

    # ---- Wins/losses from schedules
    wl: dict[tuple, dict[str, int]] = defaultdict(lambda: {"wins": 0, "losses": 0, "ties": 0})
    with open(ROOT / "schedules/games.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                s = int(r["season"])
            except (KeyError, ValueError):
                continue
            if r.get("game_type") != "REG":
                continue
            hs = to_i(r.get("home_score"))
            as_ = to_i(r.get("away_score"))
            home, away = r["home_team"], r["away_team"]
            if hs == 0 and as_ == 0 and not r.get("result"):
                continue
            if hs > as_:
                wl[(home, s)]["wins"] += 1; wl[(away, s)]["losses"] += 1
            elif as_ > hs:
                wl[(away, s)]["wins"] += 1; wl[(home, s)]["losses"] += 1
            else:
                wl[(home, s)]["ties"] += 1; wl[(away, s)]["ties"] += 1

    # ---- Write team_season_market.csv ----
    all_keys = set(by_team_season) | set(team_plays) | set(wl)
    rows: list[dict] = []
    for (team, season) in sorted(all_keys):
        implieds = by_team_season.get((team, season), [])
        avg_implied = round(sum(implieds) / len(implieds), 2) if implieds else 0
        games = len(team_games.get((team, season), set())) or 1
        plays = team_plays.get((team, season), 0)
        passes = team_pass_atts.get((team, season), 0)
        n_neut = team_neutral_plays.get((team, season), 0)
        np_pass = team_neutral_pass.get((team, season), 0)
        proe_n = team_proe_num.get((team, season), 0)
        proe_d = team_proe_den.get((team, season), 0)
        w = wl.get((team, season), {})
        rows.append({
            "team": team, "season": season,
            "avg_implied_total": avg_implied,
            "plays": plays,
            "plays_per_game": round(plays / games, 2) if games else 0,
            "pass_rate": round(passes / plays, 4) if plays else 0,
            "neutral_pass_rate": round(np_pass / n_neut, 4) if n_neut else 0,
            "proe": round(proe_n / proe_d, 4) if proe_d else 0,
            "wins": w.get("wins", 0),
            "losses": w.get("losses", 0),
            "ties": w.get("ties", 0),
        })
    out = OUT / "team_season_market.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        for r in rows:
            wr.writerow(r)
    print(f"wrote {out}: {len(rows)} rows")


def main() -> int:
    print("Building game_team_context...")
    by_ts = build_game_team_context()
    print("Building team_season_market (pace + PROE)...")
    build_team_season_market(by_ts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
