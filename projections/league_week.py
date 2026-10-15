"""League week digest: the facts the league-week skill writes from.

    python projections/league_week.py recap   [--league NAME] [--week N]
    python projections/league_week.py matchup [--league NAME]
    python projections/league_week.py moves   [--league NAME] [--days 2]

recap   results, closest game, blowout, standings and completed moves for a finished week
        (default: the latest week whose NFL games are all final).
matchup Trevor's live matchup per league: score, every starter's points and game state,
        and Sleeper's projection for starters who have not played yet.
moves   completed adds, drops, waiver bids and trades in the last N days, by team.

Reads live Sleeper and ESPN's public scoreboard, no keys. Player names come from
site/data/players.js. Sleeper leagues only: the ESPN league is listed as skipped.
Prints facts only; anything a source did not return is printed as unknown.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from collections import defaultdict

from lineup_check import get_json, live_sleeper, load_js

SLEEPER = "https://api.sleeper.app/v1"
ESPN_ALIASES = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR"}


def team_names(league_id: str) -> tuple[dict, list]:
    users = {u["user_id"]: u for u in get_json(f"{SLEEPER}/league/{league_id}/users")}
    rosters = get_json(f"{SLEEPER}/league/{league_id}/rosters")
    names = {}
    for r in rosters:
        u = users.get(r.get("owner_id")) or {}
        names[r["roster_id"]] = ((u.get("metadata") or {}).get("team_name") or u.get("display_name") or f"Team {r['roster_id']}").strip()
    return names, rosters


def pair_results(matchups: list, names: dict) -> list[dict]:
    """Head-to-head games, winner first, sorted by margin (closest first)."""
    by_id = defaultdict(list)
    for m in matchups:
        if m.get("matchup_id") is not None:
            by_id[m["matchup_id"]].append(m)
    games = []
    for side in by_id.values():
        if len(side) != 2:
            continue
        a, b = sorted(side, key=lambda m: m.get("points") or 0, reverse=True)
        games.append({"win": names[a["roster_id"]], "lose": names[b["roster_id"]],
                      "ws": a.get("points") or 0, "ls": b.get("points") or 0,
                      "tie": (a.get("points") or 0) == (b.get("points") or 0)})
    return sorted(games, key=lambda g: g["ws"] - g["ls"])


def week_state(season: str, week: int) -> dict:
    """NFL team -> 'pre' | 'in' | 'post' for one week; {} when ESPN is unreachable."""
    try:
        sb = get_json(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week={week}&dates={season}")
    except Exception:
        return {}
    out = {}
    for ev in sb.get("events") or []:
        state = ev["status"]["type"]["state"]
        for c in ev["competitions"][0]["competitors"]:
            ab = c["team"]["abbreviation"]
            out[ESPN_ALIASES.get(ab, ab)] = state
    return out


def describe_move(tx: dict, names: dict, players: dict) -> list[tuple[int, str]]:
    """(roster_id, line) per team touched by one completed transaction."""
    pname = lambda pid: (players.get(str(pid)) or {}).get("name") or str(pid)
    adds, drops = tx.get("adds") or {}, tx.get("drops") or {}
    lines = []
    if tx["type"] == "trade":
        for rid in tx.get("roster_ids") or []:
            got = [pname(p) for p, r in adds.items() if r == rid]
            got += [f"{pk['season']} round {pk['round']} pick (originally {names.get(pk['roster_id'], '?')})"
                    for pk in tx.get("draft_picks") or [] if pk.get("owner_id") == rid]
            got += [f"${w['amount']} FAAB" for w in tx.get("waiver_budget") or [] if w.get("receiver") == rid]
            lines.append((rid, "TRADE got " + (", ".join(got) or "nothing listed")))
        return lines
    bid = (tx.get("settings") or {}).get("waiver_bid")
    for rid in tx.get("roster_ids") or []:
        a = [pname(p) for p, r in adds.items() if r == rid]
        d = [pname(p) for p, r in drops.items() if r == rid]
        kind = "WAIVER" if tx["type"] == "waiver" else "FREE AGENT"
        parts = ([f"added {', '.join(a)}" + (f" (${bid})" if bid is not None and tx["type"] == "waiver" else "")] if a else []) \
            + ([f"dropped {', '.join(d)}"] if d else [])
        lines.append((rid, f"{kind} " + "; ".join(parts)))
    return lines


def completed(txs: list) -> list:
    return [t for t in txs if t.get("status") == "complete"]


def recap(lg: dict, week: int, players: dict) -> None:
    names, rosters = team_names(lg["id"])
    games = pair_results(get_json(f"{SLEEPER}/league/{lg['id']}/matchups/{week}"), names)
    print(f"Results, week {week} (closest first):")
    for g in games:
        print(f"  {g['win']} {g['ws']:.2f} {'tied' if g['tie'] else 'beat'} {g['lose']} {g['ls']:.2f}  (margin {g['ws'] - g['ls']:.2f})")
    if games:
        print(f"  closest: {games[0]['win']} over {games[0]['lose']}; biggest blowout: {games[-1]['win']} over {games[-1]['lose']}")
    if lg.get("league_average_match"):
        print("  this league also plays the weekly median, so records count two results a week")
    table = sorted(rosters, key=lambda r: (-(r["settings"].get("wins") or 0),
                                          -((r["settings"].get("fpts") or 0) + (r["settings"].get("fpts_decimal") or 0) / 100)))
    print(f"Standings (wins, then points for; top {lg.get('playoff_teams') or '?'} make the playoffs):")
    for i, r in enumerate(table, 1):
        s = r["settings"]
        pf = (s.get("fpts") or 0) + (s.get("fpts_decimal") or 0) / 100
        print(f"  {i}. {names[r['roster_id']]} {s.get('wins', 0)}-{s.get('losses', 0)}" + (f"-{s['ties']}" if s.get("ties") else "") + f"  PF {pf:.2f}")
    moves(lg, completed(get_json(f"{SLEEPER}/league/{lg['id']}/transactions/{week}")), names, players, f"Moves, week {week}")


def moves(lg: dict, txs: list, names: dict, players: dict, title: str) -> None:
    by_team = defaultdict(list)
    for tx in sorted(txs, key=lambda t: t.get("status_updated") or 0):
        when = dt.datetime.fromtimestamp((tx.get("status_updated") or tx["created"]) / 1000).strftime("%a %b %d %I:%M %p")
        for rid, line in describe_move(tx, names, players):
            by_team[rid].append(f"{when}  {line}")
    print(f"{title}:" + ("" if by_team else " none completed"))
    for rid, lines in by_team.items():
        print(f"  {names.get(rid, rid)}")
        for line in lines:
            print(f"    {line}")


def recent_moves(lg: dict, week: int, days: int, players: dict) -> None:
    names, _ = team_names(lg["id"])
    cutoff = (dt.datetime.now() - dt.timedelta(days=days)).timestamp() * 1000
    txs = [t for w in {week, max(week - 1, 1)} for t in get_json(f"{SLEEPER}/league/{lg['id']}/transactions/{w}")]
    moves(lg, [t for t in completed(txs) if (t.get("status_updated") or t["created"]) >= cutoff], names, players,
          f"Completed moves, last {days} day(s)")


def matchup(lg: dict, season: str, week: int, players: dict, state: dict, proj: dict) -> None:
    names, _ = team_names(lg["id"])
    me = next((r for r in lg.get("rosters") or [] if r.get("is_me")), None)
    rows = get_json(f"{SLEEPER}/league/{lg['id']}/matchups/{week}")
    mine = next((m for m in rows if me and m["roster_id"] == me["roster_id"]), None)
    if not mine:
        print("  no matchup for Trevor this week")
        return
    opp = next((m for m in rows if m["matchup_id"] == mine["matchup_id"] and m is not mine), None)
    for side in (mine, opp):
        if not side:
            print("  opponent unknown (bye or median-only week)")
            continue
        left = 0.0
        print(f"  {names[side['roster_id']]}: {side.get('points') or 0:.2f}")
        for pid, pts in zip(side.get("starters") or [], side.get("starters_points") or []):
            p = players.get(str(pid)) or {}
            team = p.get("team") or ""
            st = {"pre": "yet to play", "in": "playing now", "post": "done"}.get(state.get(team), "game state unknown")
            if st == "yet to play" and str(pid) in proj:
                left += proj[str(pid)].get("pts") or 0
                st += f", projected {proj[str(pid)].get('pts') or 0:.1f}"
            print(f"    {p.get('pos', '?'):<4}{p.get('name') or pid} ({team or '?'}) {pts:.2f}  {st}")
        print(f"    Sleeper projection for starters yet to play: {left:.1f}")


def self_check() -> None:
    names = {1: "A", 2: "B", 3: "C", 4: "D"}
    games = pair_results([{"matchup_id": 1, "roster_id": 1, "points": 90}, {"matchup_id": 1, "roster_id": 2, "points": 140},
                          {"matchup_id": 2, "roster_id": 3, "points": 101}, {"matchup_id": 2, "roster_id": 4, "points": 100},
                          {"matchup_id": None, "roster_id": 9, "points": 50}], names)
    assert [(g["win"], g["lose"]) for g in games] == [("C", "D"), ("B", "A")], games
    trade = {"type": "trade", "roster_ids": [1, 2], "adds": {"10": 1, "20": 2},
             "draft_picks": [{"season": "2027", "round": 1, "roster_id": 2, "owner_id": 1}],
             "waiver_budget": [{"sender": 1, "receiver": 2, "amount": 5}]}
    lines = dict(describe_move(trade, names, {"10": {"name": "X"}, "20": {"name": "Y"}}))
    assert lines[1] == "TRADE got X, 2027 round 1 pick (originally B)" and lines[2] == "TRADE got Y, $5 FAAB", lines
    claim = {"type": "waiver", "roster_ids": [3], "adds": {"10": 3}, "drops": {"20": 3}, "settings": {"waiver_bid": 7}}
    assert describe_move(claim, names, {"10": {"name": "X"}, "20": {"name": "Y"}}) == [(3, "WAIVER added X ($7); dropped Y")]
    print("league_week self-check ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["recap", "matchup", "moves", "self-check"])
    ap.add_argument("--league", default="", help="part of a league name; default every Sleeper league")
    ap.add_argument("--week", type=int)
    ap.add_argument("--days", type=int, default=2)
    args = ap.parse_args()
    if args.mode == "self-check":
        return self_check()

    nfl = get_json(f"{SLEEPER}/state/nfl")
    season, week = nfl["season"], int(nfl["week"])
    state = week_state(season, week)
    players = load_js("players.js", "PLAYERS")
    if args.mode == "recap" and args.week is None:
        week = week if state and all(s == "post" for s in state.values()) else max(week - 1, 1)
    week = args.week or week
    proj = live_sleeper(int(season), week) if args.mode == "matchup" else {}
    if args.mode == "matchup" and not state:
        print("ESPN scoreboard unreachable: game states unknown")

    for lg in load_js("leagues.js", "LEAGUES"):
        name = lg.get("name", "").strip()
        if args.league.lower() not in name.lower():
            continue
        print(f"\n== {name} ==")
        if not str(lg.get("id", "")).isdigit() or len(str(lg["id"])) < 15:
            print("  skipped: ESPN league, this digest reads Sleeper only")
            continue
        if args.mode == "recap":
            recap(lg, week, players)
        elif args.mode == "matchup":
            matchup(lg, season, week, players, state, proj)
        else:
            recent_moves(lg, week, args.days, players)


if __name__ == "__main__":
    sys.exit(main())
