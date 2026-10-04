"""Flag glaring problems in Trevor's starting lineups for the current week.

Reads what the build already pulled (leagues.js, weekly-rankings.js,
fantasypros-experts.js, kickers.js) and a live Sleeper read for this week's
projections and injury tags, then checks every league where Trevor has a team:

  EMPTY     a starting slot with nobody in it
  OUT       a starter tagged Out / Doubtful / IR / PUP / suspended
  BYE       a starter whose team does not play this week
  ZERO      a healthy starter Sleeper projects for 0 (inactive or buried)
  UPGRADE   a bench player who beats a starter on most sources AND by points
  WATCH     a Questionable starter, with the best bench pivot if he sits

Games that have kicked off are locked and skipped. Every rank source is
positional, so a cross-position FLEX swap is judged on points only.

  python projections/lineup_check.py               refresh rosters, then check
  python projections/lineup_check.py --rankings    also rebuild the week's rankings
  python projections/lineup_check.py --no-refresh  check what is on disk
  python projections/lineup_check.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"

SLOT_TAKES = {
    "QB": {"QB"}, "RB": {"RB"}, "WR": {"WR"}, "TE": {"TE"}, "K": {"K"}, "DEF": {"DEF"},
    "FLEX": {"RB", "WR", "TE"}, "WRRB_FLEX": {"RB", "WR"}, "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
    "IDP_FLEX": {"LB", "DB", "DL"}, "LB": {"LB"}, "DB": {"DB"}, "DL": {"DL"},
}
NOT_STARTING = {"BN", "IR", "TAXI"}
IDP_POS = {"LB", "DB", "DL"}
OUT_TAGS = {"Out", "Doubtful", "IR", "PUP", "Sus", "NA", "COV"}

# A swap is glaring only when the sources agree AND the gap is real points.
MIN_AGREE = 0.75      # share of comparable sources that prefer the bench player
MIN_SOURCES = 3       # same-position swaps; cross-position (points only) needs both
MIN_GAP = 2.0         # projected points, Sleeper and Vegas averaged when both exist
FLEX_MIN_GAP = 3.0    # cross-position swaps have no rank sources, so ask for more


def load_js(name: str, var: str):
    """The JSON literal assigned to window.VAR (a file can hold several)."""
    text = (DATA / name).read_text(encoding="utf-8")
    at = text.index("=", text.index(f"window.{var}")) + 1
    return json.JSONDecoder().raw_decode(text, len(text[:at]) + len(text[at:]) - len(text[at:].lstrip()))[0]


def get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def live_sleeper(season: int, week: int) -> dict:
    """pid -> {pts, inj} from Sleeper's weekly projections; {} if unreachable."""
    pos = "&".join(f"position%5B%5D={p}" for p in ("QB", "RB", "WR", "TE", "K", "DEF", "LB", "DB", "DL"))
    try:
        rows = get_json(f"https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&{pos}")
    except Exception as e:  # noqa: BLE001 - a dead feed falls back to the build
        print(f"(live Sleeper read failed, using the build's numbers: {e})")
        return {}
    out = {}
    for row in rows or []:
        pid, stats = str(row.get("player_id") or ""), row.get("stats") or {}
        if pid:
            out[pid] = {"pts": stats.get("pts_ppr"), "inj": (row.get("player") or {}).get("injury_status"),
                        "idp": {k: v for k, v in stats.items() if k.startswith("idp_")}}
    return out


def can_fill(slots: list[str], positions: list[str]) -> bool:
    """True when every player in `positions` can sit in a distinct slot."""
    match: dict[int, int] = {}

    def place(i: int, seen: set) -> bool:
        for j, slot in enumerate(slots):
            if positions[i] in SLOT_TAKES.get(slot, set()) and j not in seen:
                seen.add(j)
                if j not in match or place(match[j], seen):
                    match[j] = i
                    return True
        return False

    return all(place(i, set()) for i in range(len(positions)))


class Board:
    """Every number the build pulled for this week, keyed by Sleeper id."""

    def __init__(self, weekly: dict, fp: dict | None, kickers: dict | None, live: dict):
        self.week = weekly.get("currentWeek")
        self.games = weekly.get("games") or {}
        self.rows = {str(p["id"]): p for p in weekly.get("players") or []}
        self.live = live
        self.fp = {}  # (pos, pid) -> {expert id: rank}
        if fp and fp.get("week") == self.week:
            for pos, b in (fp.get("boards") or {}).items():
                for i, pid in enumerate(b.get("sleeperIds") or []):
                    if pid is None:
                        continue
                    ranks = {eid: r[i] for eid, r in (b.get("ranks") or {}).items() if i < len(r) and r[i] is not None}
                    self.fp[(pos, str(pid))] = ranks
        self.kick = {}
        if kickers and kickers.get("week") == self.week:
            self.kick = {k["team"]: k.get("exp") for k in kickers.get("kickers") or []}

    def points(self, pid: str, pos: str, team: str, scoring: dict | None = None) -> dict:
        row = self.rows.get(pid) or {}
        wk = (row.get("sleeper") or [None] * 18)[self.week - 1] if self.week else None
        live = self.live.get(pid, {}).get("pts")
        idp = self.live.get(pid, {}).get("idp")
        if pos in IDP_POS and idp and scoring:
            # pts_ppr ignores defensive stats, so an IDP line is scored with the league's own rules.
            live = wk = round(sum(v * scoring.get(k, 0) for k, v in idp.items()), 1)
        out = {"sleeper": live if live is not None else wk, "vegas": row.get("vegas")}
        if pos == "K":
            out["kicker model"] = self.kick.get(team)
        return {k: v for k, v in out.items() if v is not None}

    def ranks(self, pid: str, pos: str) -> dict:
        row = self.rows.get(pid) or {}
        out = {"FP ECR": row.get("ecr"), "Gibbs": row.get("gibbs")}
        out.update({f"fp:{eid}": r for eid, r in self.fp.get((pos, pid), {}).items()})
        return {k: v for k, v in out.items() if v is not None}

    def injury(self, pid: str, players: dict) -> str | None:
        live = self.live.get(pid)
        return live["inj"] if live and "inj" in live else (players.get(pid) or {}).get("injury_status")


def compare(board: Board, a: dict, b: dict, scoring: dict | None = None) -> dict:
    """How strongly bench player `b` beats starter `a`. Higher points win, lower ranks win."""
    pa = board.points(a["id"], a["pos"], a["team"], scoring)
    pb = board.points(b["id"], b["pos"], b["team"], scoring)
    votes, total = 0, 0
    for k in pa.keys() & pb.keys():
        if pa[k] != pb[k]:
            total += 1
            votes += pb[k] > pa[k]
    if a["pos"] == b["pos"]:
        ra, rb = board.ranks(a["id"], a["pos"]), board.ranks(b["id"], b["pos"])
        for k in ra.keys() | rb.keys():
            x, y = ra.get(k), rb.get(k)
            if x == y:
                continue
            total += 1
            # Unranked by a source means below that source's list.
            votes += y is not None and (x is None or y < x)
    gaps = [pb[k] - pa[k] for k in ("sleeper", "vegas", "kicker model") if k in pa and k in pb]
    gap = sum(gaps) / len(gaps) if gaps else None
    return {"votes": votes, "total": total, "gap": gap,
            "a_pts": pa.get("sleeper"), "b_pts": pb.get("sleeper")}


def glaring(c: dict, same_pos: bool) -> bool:
    if c["gap"] is None or not c["total"]:
        return False
    need = MIN_SOURCES if same_pos else 2
    return (c["total"] >= need and c["votes"] / c["total"] >= MIN_AGREE
            and c["gap"] >= (MIN_GAP if same_pos else FLEX_MIN_GAP))


def check_league(lg: dict, board: Board, players: dict, now: dt.datetime) -> list[str]:
    me = next((r for r in lg.get("rosters") or [] if r.get("is_me")), None)
    if not me:
        return []
    slots = [s for s in lg.get("roster_positions") or [] if s not in NOT_STARTING]
    starters = [str(p) for p in me.get("starters") or []]
    held = set(map(str, (me.get("reserve") or []) + (me.get("taxi") or [])))
    bench_ids = [str(p) for p in me.get("players") or [] if str(p) not in held and str(p) not in starters]

    def info(pid: str) -> dict:
        p = players.get(pid) or {}
        team = p.get("team") or ""
        game = board.games.get(team)
        kick = dt.datetime.fromisoformat(game["kickoff"].replace("Z", "+00:00")) if game and game.get("kickoff") else None
        return {"id": pid, "name": p.get("name") or pid, "pos": p.get("pos") or "?", "team": team,
                "game": game, "locked": bool(kick and kick <= now), "inj": board.injury(pid, players)}

    flags = []
    filled = [s for s in starters if s and s != "0"]
    if len(filled) < len(slots):
        flags.append(f"EMPTY    {len(slots) - len(filled)} starting slot(s) open")
    crew = [info(pid) for pid in filled]
    bench = [b for b in map(info, bench_ids)
             if not b["locked"] and b["game"] and b["inj"] not in OUT_TAGS]
    positions = [s["pos"] for s in crew]
    scoring = lg.get("scoring") or {}

    def best_swap(s: dict, i: int):
        best = None
        for b in bench:
            trial = positions[:i] + [b["pos"]] + positions[i + 1:]
            if not can_fill(slots, trial):
                continue
            c = compare(board, s, b, scoring)
            if c["gap"] is not None and (best is None or c["gap"] > best[1]["gap"]):
                best = (b, c)
        return best

    def use(swap, i: int) -> str:
        # A bench player covers one hole: take him out of the pool and into the lineup.
        if not swap:
            return ""
        bench.remove(swap[0])
        positions[i] = swap[0]["pos"]
        return f"; start {swap[0]['name']} ({swap[1]['b_pts']} pts)"

    def tag(s: dict) -> str:
        return f"{s['name']} ({s['pos']}, {s['team'] or 'FA'})"

    # Dead slots first, so the best bench body goes to a hole before an upgrade.
    live_crew = [(i, s) for i, s in enumerate(crew) if not s["locked"]]
    rest = []
    for i, s in live_crew:
        pts = board.points(s["id"], s["pos"], s["team"], scoring).get("sleeper")
        if not s["game"]:
            flags.append(f"BYE      {tag(s)} has no game this week{use(best_swap(s, i), i)}")
        elif s["inj"] in OUT_TAGS:
            flags.append(f"OUT      {tag(s)} is {s['inj']}{use(best_swap(s, i), i)}")
        elif pts == 0:
            flags.append(f"ZERO     {tag(s)} projects 0 (inactive or buried){use(best_swap(s, i), i)}")
        else:
            rest.append((i, s))
    for i, s in rest:
        swap = best_swap(s, i)
        if swap and glaring(swap[1], swap[0]["pos"] == s["pos"]):
            b, c = swap
            use(swap, i)
            flags.append(f"UPGRADE  bench {b['name']} ({b['pos']}) over {tag(s)}: "
                         f"{c['votes']}/{c['total']} sources prefer him, +{c['gap']:.1f} pts "
                         f"({c['a_pts']} vs {c['b_pts']} Sleeper)")
        elif s["inj"] == "Questionable":
            pivot = f"; pivot {swap[0]['name']} ({swap[1]['b_pts']} pts) if he sits" if swap else "; no healthy bench pivot"
            flags.append(f"WATCH    {tag(s)} is Questionable{pivot}")
    return flags


def refresh(rankings: bool) -> None:
    steps = [DATA / "fetch_sleeper.py", DATA / "build_site_data.py"]
    if rankings:
        steps += [ROOT / "projections" / "build_fantasypros_experts.py",
                  ROOT / "projections" / "build_weekly_rankings.py"]
    for step in steps:
        r = subprocess.run([sys.executable, str(step)], cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=900)
        if r.returncode:
            print(f"refresh step failed, checking what is on disk: {step.name}\n{r.stderr[-400:]}")
            return


def self_check() -> None:
    assert can_fill(["QB", "RB", "FLEX"], ["QB", "RB", "WR"])
    assert not can_fill(["QB", "RB", "FLEX"], ["QB", "WR", "WR"])
    assert can_fill(["SUPER_FLEX", "QB"], ["QB", "QB"])
    weekly = {"currentWeek": 1, "games": {"AAA": {"kickoff": "2099-01-01T00:00:00Z"}},
              "players": [
                  {"id": "1", "pos": "WR", "team": "AAA", "sleeper": [8.0], "vegas": 7.5, "ecr": 40, "gibbs": 38},
                  {"id": "2", "pos": "WR", "team": "AAA", "sleeper": [14.0], "vegas": 13.0, "ecr": 12, "gibbs": 15},
                  {"id": "3", "pos": "WR", "team": "AAA", "sleeper": [9.0], "vegas": 6.0, "ecr": 30, "gibbs": 44},
              ]}
    board = Board(weekly, None, None, {})
    p = lambda i: {"id": i, "pos": "WR", "team": "AAA"}
    assert glaring(compare(board, p("1"), p("2")), True), "clear consensus upgrade must flag"
    assert not glaring(compare(board, p("1"), p("3")), True), "a split, small gap must not flag"
    players = {i: {"name": f"P{i}", "pos": "WR", "team": "AAA"} for i in "123"}
    lg = {"roster_positions": ["WR", "BN", "BN"],
          "rosters": [{"is_me": True, "starters": ["1"], "players": ["1", "2", "3"]}]}
    flags = check_league(lg, board, players, dt.datetime.now(dt.timezone.utc))
    assert len(flags) == 1 and flags[0].startswith("UPGRADE") and "P2" in flags[0], flags
    players["1"]["injury_status"] = "Out"
    assert check_league(lg, board, players, dt.datetime.now(dt.timezone.utc))[0].startswith("OUT")
    print("lineup_check self-check ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-refresh", action="store_true", help="skip the roster refresh")
    ap.add_argument("--rankings", action="store_true", help="also rebuild this week's rankings")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()
    if args.self_check:
        return self_check()
    if not args.no_refresh:
        refresh(args.rankings)

    weekly = load_js("weekly-rankings.js", "WEEKLY_RANKINGS")
    players = load_js("players.js", "PLAYERS")
    leagues = load_js("leagues.js", "LEAGUES")
    fp = load_js("fantasypros-experts.js", "FP_EXPERTS") if (DATA / "fantasypros-experts.js").exists() else None
    kickers = load_js("kickers.js", "KICKER_MODEL") if (DATA / "kickers.js").exists() else None
    live = live_sleeper(int(weekly.get("season") or dt.date.today().year), int(weekly.get("currentWeek") or 1))
    board = Board(weekly, fp, kickers, live)
    now = dt.datetime.now(dt.timezone.utc)

    stale = [] if (fp or {}).get("week") == board.week else ["FantasyPros experts"]
    if (kickers or {}).get("week") != board.week:
        stale.append("kicker model")
    print(f"Week {board.week} lineup check · {now.astimezone():%a %I:%M %p} · "
          f"{len(board.rows)} weekly rows, {len(board.fp)} FP-ranked players, live Sleeper {'on' if live else 'OFF'}"
          + (f" · not this week: {', '.join(stale)}" if stale else ""))
    for lg in leagues:
        flags = check_league(lg, board, players, now)
        if flags is not None and any(r.get("is_me") for r in lg.get("rosters") or []):
            print(f"\n{lg.get('name', '').strip()}: " + ("clean" if not flags else ""))
            for f in flags:
                print(f"  {f}")


if __name__ == "__main__":
    main()
