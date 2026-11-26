"""Build weekly D/ST Vegas context and strictly causal YTD defense rates -> site/data/defense-weekly.js.

Replaces the legacy Week-10-hardcoded Poisson script with verified Vegas implied
opponent totals (`spread_line` > 0 = home team favored) and strictly `< target_week`
nflverse PBP defense rates (`pressure_rate`, `sack_rate`, `sacks_pg`, `to_pg`).

Usage:
    python projections/build_defense_model.py
    python projections/build_defense_model.py --week 12 --self-check
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import pathlib
import re
import urllib.request
from typing import Any

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SITE_DATA = ROOT / "site" / "data"
OUT_PATH = SITE_DATA / "defense-weekly.js"
LIVE_GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
TEAM_ALIASES = {"JAC": "JAX", "LA": "LAR", "WSH": "WAS", "OAK": "LV", "STL": "LAR", "SD": "LAC"}


def norm_team(team: Any) -> str:
    s = str(team or "").strip().upper()
    return TEAM_ALIASES.get(s, s)


def detect_season_week() -> tuple[int, int]:
    wr_path = SITE_DATA / "weekly-rankings.js"
    if wr_path.exists():
        head = wr_path.read_text(encoding="utf-8")[:600]
        m_s = re.search(r'"season"\s*:\s*(\d+)', head)
        m_w = re.search(r'"currentWeek"\s*:\s*(\d+)', head)
        if m_s and m_w:
            return int(m_s.group(1)), int(m_w.group(1))
    return 2026, 12


def load_week_games(season: int, week: int, cache_dir: pathlib.Path) -> pd.DataFrame:
    """Load target-week Vegas lines, preferring live nflverse games.csv over cached."""
    frames: list[pd.DataFrame] = []
    try:
        req = urllib.request.Request(LIVE_GAMES_URL, headers={"User-Agent": "Mozilla/5.0 FantasyHub/1.0"})
        txt = urllib.request.urlopen(req, timeout=20).read().decode("utf-8")
        g_live = pd.read_csv(io.StringIO(txt))
        g_live = g_live[(g_live["season"] == season) & (g_live["game_type"] == "REG") & (g_live["week"] == week)].copy()
        if len(g_live) and int(g_live["spread_line"].isna().sum()) == 0 and int(g_live["total_line"].isna().sum()) == 0:
            frames.append(g_live)
    except Exception:
        pass

    if not frames:
        cached = cache_dir / "games.csv"
        if cached.exists():
            g_loc = pd.read_csv(cached)
            g_loc = g_loc[(g_loc["season"] == season) & (g_loc["game_type"] == "REG") & (g_loc["week"] == week)].copy()
            if len(g_loc):
                frames.append(g_loc)

    if not frames:
        raise RuntimeError(f"No games found for season={season} week={week}")

    g_wk = frames[0].copy()
    assert int(g_wk["spread_line"].isna().sum()) == 0, f"Missing spread_line for {season} W{week}"
    assert int(g_wk["total_line"].isna().sum()) == 0, f"Missing total_line for {season} W{week}"
    return g_wk


def compute_ytd_defense_rates(season: int, target_week: int, cache_dir: pathlib.Path) -> tuple[dict[str, dict[str, float]], int, int]:
    """Compute strictly < target_week defense rates; returns (by_team, pbp_season, through_week)."""
    pbp_cols = ["season", "week", "season_type", "game_id", "defteam", "pass_attempt", "sack", "qb_hit", "interception", "fumble_lost"]
    cur_path = cache_dir / f"play_by_play_{season}.parquet"
    pbp_season = season
    pbp = pd.read_parquet(cur_path, columns=pbp_cols) if cur_path.exists() else pd.DataFrame(columns=pbp_cols)
    pbp = pbp[(pbp["season_type"] == "REG") & (pbp["week"] < target_week) & pbp["defteam"].notna()].copy()

    if len(pbp) == 0:
        prev_path = cache_dir / f"play_by_play_{season - 1}.parquet"
        if not prev_path.exists():
            raise RuntimeError(f"No PBP parquet found for {season} (< W{target_week}) or {season - 1}")
        pbp_season = season - 1
        pbp = pd.read_parquet(prev_path, columns=pbp_cols)
        pbp = pbp[(pbp["season_type"] == "REG") & pbp["defteam"].notna()].copy()

    through_week = int(pbp["week"].max())
    if pbp_season == season:
        assert through_week < target_week, f"Leakage: max PBP week {through_week} >= target W{target_week}"

    pbp["team"] = pbp["defteam"].map(norm_team)
    pbp["is_dropback"] = ((pbp["pass_attempt"] == 1) | (pbp["sack"] == 1)).astype(float)
    pbp["sacks"] = pbp["sack"].fillna(0).astype(float)
    pbp["qbh"] = pbp["qb_hit"].fillna(0).astype(float)
    pbp["ints"] = pbp["interception"].fillna(0).astype(float)
    pbp["fr"] = pbp["fumble_lost"].fillna(0).astype(float)

    agg = pbp.groupby("team", as_index=False).agg(
        games=("game_id", "nunique"),
        opp_db=("is_dropback", "sum"),
        sacks=("sacks", "sum"),
        qbh=("qbh", "sum"),
        ints=("ints", "sum"),
        fr=("fr", "sum"),
    )
    by_team: dict[str, dict[str, float]] = {}
    for r in agg.itertuples(index=False):
        g = max(int(r.games), 1)
        db = max(float(r.opp_db), 1.0)
        by_team[str(r.team)] = {
            "games": int(r.games),
            "pressure_rate": round((float(r.sacks) + float(r.qbh)) / db, 4),
            "sack_rate": round(float(r.sacks) / db, 4),
            "sacks_pg": round(float(r.sacks) / g, 2),
            "to_pg": round((float(r.ints) + float(r.fr)) / g, 2),
        }
    return by_team, pbp_season, through_week


def build(season: int, week: int, cache_dir: pathlib.Path, self_check: bool = False) -> dict[str, Any]:
    g_wk = load_week_games(season, week, cache_dir)
    rates, pbp_season, through_week = compute_ytd_defense_rates(season, week, cache_dir)

    defenses: list[dict[str, Any]] = []
    for g in g_wk.itertuples(index=False):
        ht = norm_team(g.home_team)
        at = norm_team(g.away_team)
        sp = float(g.spread_line)
        tot = float(g.total_line)
        # nflverse spread_line > 0 means home team is favored by sp points.
        for tm, opp, is_home, def_spread in ((ht, at, 1, sp), (at, ht, 0, -sp)):
            opp_imp = round((tot - def_spread) / 2.0, 1)
            tm_imp = round((tot + def_spread) / 2.0, 1)
            assert abs((tm_imp + opp_imp) - tot) <= 0.2, f"Implied total mismatch for {tm}: {tm_imp}+{opp_imp} vs {tot}"
            if sp > 0 and is_home == 1:
                assert tm_imp > opp_imp, f"Home favorite orientation broken on {tm} vs {opp} (sp={sp})"
            st = rates.get(tm)
            if st is None:
                raise RuntimeError(f"Missing YTD defense PBP stats for {tm}")
            defenses.append({
                "team": tm,
                "opp": opp,
                "home": is_home,
                "opp_implied": opp_imp,
                "team_implied": tm_imp,
                "games": st["games"],
                "pressure_rate": st["pressure_rate"],
                "sack_rate": st["sack_rate"],
                "sacks_pg": st["sacks_pg"],
                "to_pg": st["to_pg"],
            })

    defenses.sort(key=lambda d: (d["opp_implied"], d["team"]))
    payload = {
        "season": int(season),
        "week": int(week),
        "throughWeek": int(through_week),
        "pbpSeason": int(pbp_season),
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": f"nflverse Vegas spread/total + YTD < W{week} defense PBP rates",
        "defenses": defenses,
    }

    if self_check:
        assert payload["week"] == week
        assert 26 <= len(defenses) <= 32, f"Expected 26..32 teams, got {len(defenses)}"
        if week == 12 and season == 2026:
            assert len(defenses) == 32, f"Expected 32 teams in 2026 W12, got {len(defenses)}"
        assert pbp_season < season or through_week < week
        for d in defenses:
            for k in ("opp_implied", "team_implied", "pressure_rate", "sack_rate", "sacks_pg", "to_pg"):
                assert d[k] is not None and pd.notna(d[k]), f"NaN {k} on {d['team']}"
        print(f"build_defense_model self-check ok: {len(defenses)} teams, season={season} W{week}, throughWeek={through_week}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("window.DEFENSE_WEEKLY = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH.relative_to(ROOT)} ({len(defenses)} teams, season={season} W{week}, throughWeek={through_week})")
    return payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int, default=None)
    ap.add_argument("--cache", type=pathlib.Path, default=HERE / "nflverse-cache")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    season, week = detect_season_week()
    if args.week is not None:
        week = int(args.week)
    build(season, week, args.cache, self_check=args.self_check)


if __name__ == "__main__":
    main()
