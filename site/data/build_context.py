"""Build site/data/context.js — per-player team/coach/opportunity context.

For each Sleeper-mapped active player, emit:
  current_team_context:
    - team coaching staff for the current/upcoming season (HC, OC, play caller,
      is_new_hc, is_new_oc, is_new_play_caller, play_caller_first_season,
      pc_tenure_yr, scheme, notes)
    - team_turnover_recent: vacated_target_share, vacated_rush_share,
      top_leavers, top_joiners (most recent completed season)

  player_new_team_history:
    - per-season rows where the player joined a new team — with APY, expected vs
      realized target/rush share, prior share (where applicable)

Output keyed by Sleeper id, written to site/data/context.js as window.CONTEXT.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent  # Fantasy Football/
HIST = ROOT / "historical"
DERIVED = HIST / "derived"
SITE_DATA = ROOT / "site" / "data"

CW = HIST / "id_crosswalk.json"
TEAM_COACHES = DERIVED / "team_coaches.csv"
TEAM_TURNOVER = DERIVED / "team_turnover.csv"
PLAYER_NEW_TEAM = DERIVED / "player_new_team.csv"
TEAM_MARKET = DERIVED / "team_season_market.csv"
QB_CHANGES = DERIVED / "qb_changes.csv"
PLAYER_EFFICIENCY = DERIVED / "player_efficiency.csv"
CAREER_HEALTH = DERIVED / "career_health.csv"
SOS = DERIVED / "strength_of_schedule.csv"
DVP_RANKS = DERIVED / "def_vs_pos_ranks.csv"


CURRENT_SEASON = 2026  # the season we are projecting toward


def load_coaches() -> dict[tuple[str, int], dict]:
    """Return (team, season) -> coach dict."""
    out = {}
    with open(TEAM_COACHES, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r["season"] = int(r["season"])
            out[(r["team"], r["season"])] = r
    return out


def load_turnover() -> dict[tuple[str, int], dict]:
    out = {}
    with open(TEAM_TURNOVER, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r["season"] = int(r["season"])
            r["top_leavers"] = json.loads(r["top_leavers"]) if r.get("top_leavers") else []
            r["top_joiners"] = json.loads(r["top_joiners"]) if r.get("top_joiners") else []
            for k in ("vacated_target_share", "vacated_rush_share", "vacated_air_yards_share"):
                r[k] = float(r.get(k, 0) or 0)
            out[(r["team"], r["season"])] = r
    return out


def load_player_new_team() -> dict[str, list[dict]]:
    """gsis_id -> list of new-team rows (most recent first)."""
    out: dict[str, list[dict]] = defaultdict(list)
    with open(PLAYER_NEW_TEAM, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for k in ("apy", "contract_year_signed", "contract_years",
                      "contract_value", "contract_guaranteed",
                      "prior_target_share", "prior_rush_share",
                      "prior_air_yards_share", "prior_targets", "prior_carries",
                      "current_target_share", "current_rush_share",
                      "current_air_yards_share",
                      "expected_target_share", "expected_rush_share"):
                try:
                    r[k] = float(r.get(k, 0) or 0)
                except (TypeError, ValueError):
                    r[k] = 0
            r["season"] = int(r.get("season") or 0)
            r["new_team"] = r.get("new_team", "False") == "True"
            r["signed_new_team_this_year"] = r.get("signed_new_team_this_year", "False") == "True"
            r["is_rookie_or_first_season"] = r.get("is_rookie_or_first_season", "False") == "True"
            out[r["player_id"]].append(r)
    for pid in out:
        out[pid].sort(key=lambda r: -r["season"])
    return out


def compact_coach(c: dict) -> dict | None:
    if not c:
        return None
    return {
        "season": c["season"],
        "hc": c.get("head_coach"),
        "oc": c.get("offensive_coordinator"),
        "play_caller": c.get("play_caller"),
        "pc_role": c.get("play_caller_role"),
        "scheme": c.get("scheme"),
        "notes": c.get("notes"),
        "new_hc": c.get("is_new_hc") == "True",
        "new_oc": c.get("is_new_oc") == "True",
        "new_play_caller": c.get("is_new_play_caller") == "True",
        "play_caller_first_season": c.get("play_caller_first_season") == "True",
        "oc_first_season": c.get("oc_first_season") == "True",
        "oc_tenure_yr": int(c.get("oc_tenure_yr") or 0),
        "pc_tenure_yr": int(c.get("pc_tenure_yr") or 0),
    }


def compact_turnover(t: dict) -> dict | None:
    if not t:
        return None
    return {
        "season": t["season"],
        "vacated_tgt": round(t["vacated_target_share"], 3),
        "vacated_rush": round(t["vacated_rush_share"], 3),
        "vacated_ay": round(t["vacated_air_yards_share"], 3),
        "top_leavers": [
            {"name": l["name"], "pos": l["pos"],
             "tgt": round(l["prev_target_share"], 3),
             "rush": round(l["prev_rush_share"], 3)}
            for l in (t["top_leavers"] or [])[:4]
        ],
        "top_joiners": [
            {"name": j["name"], "pos": j["pos"],
             "tgt": round(j["cur_target_share"], 3),
             "rush": round(j["cur_rush_share"], 3),
             "rookie": j.get("rookie", False)}
            for j in (t["top_joiners"] or [])[:4]
        ],
    }


def compact_new_team_row(r: dict) -> dict:
    return {
        "season": r["season"],
        "team": r.get("team"),
        "prev_team": r.get("prev_team"),
        "new_team": r["new_team"],
        "is_rookie": r["is_rookie_or_first_season"],
        "apy": int(r["apy"]),
        "apy_bucket": r.get("apy_bucket"),
        "contract_signed_this_year": r["signed_new_team_this_year"],
        "contract_years": int(r["contract_years"]),
        "contract_guaranteed": int(r["contract_guaranteed"]),
        "prior_tgt": round(r["prior_target_share"], 3),
        "prior_rush": round(r["prior_rush_share"], 3),
        "cur_tgt": round(r["current_target_share"], 3),
        "cur_rush": round(r["current_rush_share"], 3),
        "expected_tgt": round(r["expected_target_share"], 3),
        "expected_rush": round(r["expected_rush_share"], 3),
    }


def load_market() -> dict[tuple, dict]:
    out = {}
    if not TEAM_MARKET.exists():
        return out
    with open(TEAM_MARKET, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r["season"] = int(r["season"])
            for k in ("avg_implied_total", "plays_per_game", "pass_rate",
                      "neutral_pass_rate", "proe"):
                try:
                    r[k] = float(r.get(k, 0) or 0)
                except (TypeError, ValueError):
                    r[k] = 0
            for k in ("wins", "losses", "ties", "plays"):
                try:
                    r[k] = int(r.get(k, 0) or 0)
                except (TypeError, ValueError):
                    r[k] = 0
            out[(r["team"], r["season"])] = r
    return out


def load_qb_changes() -> dict[tuple, dict]:
    out = {}
    if not QB_CHANGES.exists():
        return out
    with open(QB_CHANGES, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r["season"] = int(r["season"])
            r["is_new_starting_qb"] = r.get("is_new_starting_qb", "False") == "True"
            try:
                r["primary_qb_pct"] = float(r.get("primary_qb_pct") or 0)
                r["qb_continuity_streak"] = int(r.get("qb_continuity_streak") or 0)
            except (TypeError, ValueError):
                pass
            out[(r["team"], r["season"])] = r
    return out


def load_player_efficiency() -> dict[str, list[dict]]:
    """gsis_id -> list of recent-season efficiency rows."""
    out: dict[str, list[dict]] = defaultdict(list)
    if not PLAYER_EFFICIENCY.exists():
        return out
    with open(PLAYER_EFFICIENCY, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for k in ("snap_share", "adot", "ybc_per_rec", "yac_per_rec",
                      "drop_pct", "passer_rating_when_targeted",
                      "tgt_per_g_when_active"):
                try:
                    r[k] = float(r.get(k, 0) or 0)
                except (TypeError, ValueError):
                    r[k] = 0
            for k in ("games", "targets", "carries", "rec_air_yards", "brk_tkl"):
                try:
                    r[k] = int(r.get(k, 0) or 0)
                except (TypeError, ValueError):
                    r[k] = 0
            r["season"] = int(r.get("season") or 0)
            out[r["player_id"]].append(r)
    for pid in out:
        out[pid].sort(key=lambda r: -r["season"])
    return out


def load_career_health() -> dict[str, dict]:
    out = {}
    if not CAREER_HEALTH.exists():
        return out
    with open(CAREER_HEALTH, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                r["availability_pct"] = float(r.get("availability_pct") or 0)
                r["career_games"] = int(r.get("career_games") or 0)
                r["career_potential"] = int(r.get("career_potential") or 0)
                r["seasons_played"] = int(r.get("seasons_played") or 0)
            except (TypeError, ValueError):
                pass
            out[r["player_id"]] = r
    return out


def main() -> int:
    cw = json.loads(CW.read_text(encoding="utf-8"))
    coaches = load_coaches()
    turnover = load_turnover()
    new_team_by_gsis = load_player_new_team()
    market = load_market()
    qb_changes = load_qb_changes()
    efficiency = load_player_efficiency()
    health = load_career_health()

    # latest completed season we have data for (per turnover):
    latest_turnover_season = max((s for (_, s) in turnover), default=CURRENT_SEASON - 1)
    print(f"latest turnover season: {latest_turnover_season}; current target: {CURRENT_SEASON}")

    # Build shared team context once (small ~32 teams)
    teams_out: dict[str, dict] = {}
    all_teams = {team for (team, _) in turnover} | {team for (team, _) in coaches}
    for team in all_teams:
        cur = coaches.get((team, CURRENT_SEASON)) or coaches.get((team, CURRENT_SEASON - 1))
        prev = coaches.get((team, CURRENT_SEASON - 1)) if cur else None
        t = turnover.get((team, latest_turnover_season))
        entry: dict = {}
        if cur:
            entry["coach"] = compact_coach(cur)
        if prev and prev != cur:
            entry["coach_prev"] = compact_coach(prev)
        if t:
            entry["turnover"] = compact_turnover(t)
        # Market context (most recent year with data)
        mkt = market.get((team, latest_turnover_season)) or market.get((team, latest_turnover_season - 1))
        if mkt:
            entry["market"] = {
                "season": mkt["season"],
                "avg_implied": round(mkt["avg_implied_total"], 2),
                "plays_per_game": round(mkt["plays_per_game"], 1),
                "neutral_pass_rate": round(mkt["neutral_pass_rate"], 3),
                "proe": round(mkt["proe"], 3),
                "wins": mkt["wins"], "losses": mkt["losses"],
            }
        # QB context for skill players: latest season's primary QB, change flag
        qb_now = qb_changes.get((team, latest_turnover_season))
        qb_prev = qb_changes.get((team, latest_turnover_season - 1))
        if qb_now:
            entry["qb"] = {
                "season": qb_now["season"],
                "qb_name": qb_now.get("qb_name"),
                "primary_pct": round(qb_now["primary_qb_pct"], 3),
                "is_new_starting_qb": qb_now["is_new_starting_qb"],
                "prev_qb_name": qb_now.get("prev_qb_name") or (qb_prev.get("qb_name") if qb_prev else None),
                "continuity_streak": qb_now.get("qb_continuity_streak", 1),
            }
        if entry:
            teams_out[team] = entry

    # Per-player: only new_team transitions (compact)
    players_out: dict[str, dict] = {}
    matched = 0
    for sid, info in cw["by_sleeper"].items():
        gsis = info.get("gsis_id")
        team = info.get("team")
        if not gsis or gsis not in new_team_by_gsis:
            continue
        rows = new_team_by_gsis[gsis]
        # Only keep new_team transitions (and most-recent season for context)
        new_team_rows = [r for r in rows if r["new_team"]][:6]
        if not new_team_rows and rows:
            # Player never changed teams — keep their most recent contract/APY only
            r = rows[0]
            entry = {
                "team": team or r.get("team"),
                "apy": int(r["apy"]),
                "tenure_team": True,
                "last_season": r["season"],
            }
        else:
            entry = {
                "team": team,
                "transitions": [compact_new_team_row(r) for r in new_team_rows],
            }
        # Player efficiency: most recent 3 season rows
        eff_rows = efficiency.get(gsis, [])[:3]
        if eff_rows:
            entry["efficiency"] = [
                {"season": e["season"], "team": e.get("team"),
                 "snap_share": round(e["snap_share"], 3),
                 "adot": round(e["adot"], 2),
                 "ybc_per_rec": round(e["ybc_per_rec"], 2),
                 "yac_per_rec": round(e["yac_per_rec"], 2),
                 "drop_pct": round(e["drop_pct"], 3),
                 "brk_tkl": e["brk_tkl"],
                 "tgt_per_g": round(e["tgt_per_g_when_active"], 2),
                 "games": e["games"]}
                for e in eff_rows
            ]
        # Career availability
        h = health.get(gsis)
        if h:
            entry["availability"] = {
                "pct": round(h["availability_pct"], 3),
                "games": h["career_games"],
                "potential": h["career_potential"],
                "seasons": h["seasons_played"],
            }
        players_out[sid] = entry
        matched += 1

    out = {"teams": teams_out, "players": players_out, "current_season": CURRENT_SEASON,
           "latest_completed_season": latest_turnover_season}
    out_path = SITE_DATA / "context.js"
    out_path.write_text(
        "window.CONTEXT = " + json.dumps(out, separators=(",", ":")) + ";\n",
        encoding="utf-8"
    )
    print(f"wrote {out_path} — teams={len(teams_out)}, players={len(players_out)}, {out_path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
