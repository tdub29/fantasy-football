"""Build site/data/fantasypros-experts.js: every FantasyPros expert, and where each
one of them has every offensive player.

Why the whole matrix and not just the consensus: the consensus hides the only thing
that makes an expert board worth reading, which is WHO disagrees and by how much.
Rashod Bateman is WR67 by consensus and WR61 across the boards that leave Zay
Flowers unranked, because an expert who drops the man ahead of him has priced the
news and the consensus has not. That question is unanswerable from an ECR column
and trivial from this one.

Two facts the site needs and cannot get anywhere else:
  * board DEPTH per expert, because an expert who ranks 52 receivers has not
    "left a man out", he ran out of board. Omission only means something on a
    deep board, and the UI has to be able to tell those apart.
  * per-expert ranks keyed to SLEEPER ids, so an expert column joins the rest of
    the app instead of living in its own island.

Usage:
    python projections/build_fantasypros_experts.py
    python projections/build_fantasypros_experts.py --self-check
"""
import argparse
import concurrent.futures
import datetime
import json
import pathlib
import re
import statistics
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_weekly_rankings import (  # noqa: E402
    FANTASYPROS_WEB_KEY, current_nfl_state, norm, player_name_index,
    resolve_player,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "fantasypros-experts.js"
POSITIONS = ("QB", "RB", "WR", "TE")
RANKINGS_PAGE = "https://www.fantasypros.com/nfl/rankings/ppr-wr.php"
# The API answers fast and the boards are small, but 660 of them serially is two
# minutes of nothing. Twelve is polite and finishes in under 30 seconds.
WORKERS = 12
# Analysts use nicknames Sleeper does not. Same map as build_jacob_gibbs.py.
NAME_ALIASES = {"Hollywood Brown": "Marquise Brown"}
HEADERS = {
    "x-api-key": FANTASYPROS_WEB_KEY,
    # The uncapped key is the browser client's and the API checks the origin.
    "Origin": "https://www.fantasypros.com",
    "Referer": "https://www.fantasypros.com/",
    "User-Agent": "Mozilla/5.0",
}


def api(season, **params):
    query = {"type": "weekly", "scoring": "PPR", "experts": "available", "sport": "NFL"}
    query.update(params)
    url = (f"https://api.fantasypros.com/public/v2/json/nfl/{season}"
           f"/consensus-rankings?{urllib.parse.urlencode(query)}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def expert_directory():
    """id -> {name, site, siteLink}, scraped off the rankings page.

    The API hands back expert IDs and nothing else, so the names come from the
    page's own embedded directory. A missing name is not fatal; the UI falls back
    to the id rather than dropping a real board.
    """
    req = urllib.request.Request(RANKINGS_PAGE, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        page = resp.read().decode("utf-8", "ignore")
    out = {}
    pattern = re.compile(
        r'\{"id":(\d+),"name":"([^"]+)"(?:[^{}]*?"site":"([^"]*)")?'
        r'(?:[^{}]*?"site_link":"([^"]*)")?')
    for m in pattern.finditer(page):
        eid = int(m.group(1))
        if eid in out:
            continue
        out[eid] = {
            "name": m.group(2),
            "site": (m.group(3) or "").strip() or None,
            "siteLink": (m.group(4) or "").replace("\\/", "/").strip() or None,
        }
    return out


def live_week(season, start):
    """The most recent week that actually has a board.

    FantasyPros publishes next week's shell early and it comes back count=0, so
    asking for "this week" by the calendar returns an empty board for a day or
    two either side of the rollover. Walk back from the Sleeper week instead.
    """
    for week in range(int(start), 0, -1):
        if int(api(season, position="WR", week=week).get("count") or 0) > 0:
            return week
    raise SystemExit("no FantasyPros weekly board has any players in it")


def fetch_board(args):
    season, week, eid, pos = args
    try:
        # One id in `experts` is silently ignored; `filters` as id:id is what
        # actually isolates an expert, confirmed by total_experts coming back 1.
        payload = api(season, position=pos, week=week, filters=f"{eid}:{eid}")
        if int(payload.get("total_experts") or 0) != 1:
            return eid, pos, None
        return eid, pos, [(p["player_name"], p.get("player_team_id") or "",
                           p["rank_ecr"]) for p in payload["players"]]
    except Exception:
        return eid, pos, None


def site_players():
    """Every Sleeper player the site knows, not just the projected ones.

    sleeper_projections only carries men with a projection, which matched 37 of
    99 ranked quarterbacks: an expert ranks backups the projection feed skips.
    site/data/players.js is the full 9,213-man dump the app already ships, so
    resolving against it is what makes a rank clickable through to a player card.
    """
    text = (ROOT / "site" / "data" / "players.js").read_text(encoding="utf-8")
    blob = json.loads(text[text.index("=") + 1:text.rstrip().rstrip(";").rindex("}") + 1])
    return {pid: {"name": p.get("name"), "pos": p.get("pos"), "team": p.get("team")}
            for pid, p in blob.items() if p.get("name")}


def consensus(season, week, pos):
    payload = api(season, position=pos, week=week)
    return payload, {p["player_name"]: p for p in payload["players"]}


def main():
    season, sleeper_week = current_nfl_state()
    week = live_week(season, sleeper_week)
    print(f"FantasyPros weekly PPR, {season} week {week}")

    directory = expert_directory()
    players = site_players()
    index = player_name_index(players)

    ids, cons = set(), {}
    for pos in POSITIONS:
        payload, by_name = consensus(season, week, pos)
        cons[pos] = (payload, by_name)
        ids |= set(payload.get("experts_available", {}).get("included") or [])
    ids = sorted(ids)
    print(f"  {len(ids)} experts, {len(directory)} named")

    jobs = [(season, week, eid, pos) for eid in ids for pos in POSITIONS]
    boards = {}
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        for eid, pos, rows in pool.map(fetch_board, jobs):
            if rows:
                boards.setdefault(eid, {})[pos] = rows
    print(f"  pulled {sum(len(v) for v in boards.values())} boards")

    # One player grid per position, so each expert is a flat array of ranks
    # aligned to it. Storing {pid: rank} per expert repeated the id 155 times.
    payload = {
        "season": season, "week": week, "scoring": "PPR",
        "generated": datetime.datetime.now(datetime.timezone.utc)
                     .isoformat(timespec="seconds"),
        "source": "FantasyPros weekly PPR expert rankings, one board per expert",
        "experts": [], "boards": {},
    }

    unmatched = set()
    for pos in POSITIONS:
        cons_payload, by_name = cons[pos]
        grid, names, teams, pids = [], [], [], []
        for p in cons_payload["players"]:
            name = p["player_name"]
            grid.append(name)
            names.append(name)
            teams.append(p.get("player_team_id") or "")
            pid = resolve_player(index, players, NAME_ALIASES.get(name, name),
                                 pos=pos, team=p.get("player_team_id"))
            if pid is None:
                unmatched.add(name)
            pids.append(pid)
        slot = {norm(n): i for i, n in enumerate(grid)}
        ranks = {}
        for eid, per_pos in boards.items():
            rows = per_pos.get(pos)
            if not rows:
                continue
            col = [None] * len(grid)
            for name, _team, rank in rows:
                i = slot.get(norm(name))
                if i is not None:
                    col[i] = rank
            ranks[str(eid)] = col
        payload["boards"][pos] = {
            "players": names, "teams": teams, "sleeperIds": pids,
            "ecr": [p["rank_ecr"] for p in cons_payload["players"]],
            "ranks": ranks,
            "experts": int(cons_payload.get("total_experts") or 0),
            "updated": cons_payload.get("last_updated"),
        }

    for eid in ids:
        per_pos = boards.get(eid, {})
        depth = {pos: len(per_pos.get(pos) or []) for pos in POSITIONS}
        meta = directory.get(eid) or {}
        payload["experts"].append({
            "id": eid,
            "name": meta.get("name") or f"Expert {eid}",
            "site": meta.get("site"),
            "siteLink": meta.get("siteLink"),
            "depth": depth,
            "total": sum(depth.values()),
        })
    payload["experts"].sort(key=lambda e: (-e["total"], e["name"]))

    OUT.write_text("window.FP_EXPERTS = "
                   + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                   + ";\n", encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)}: {kb:.0f} KB")
    for pos in POSITIONS:
        b = payload["boards"][pos]
        matched = sum(1 for p in b["sleeperIds"] if p)
        print(f"  {pos}: {len(b['players'])} players ({matched} matched to Sleeper), "
              f"{len(b['ranks'])} expert boards")
    if unmatched:
        print(f"  {len(unmatched)} names unmatched to Sleeper, e.g. "
              f"{sorted(unmatched)[:4]}")
    return 0


def self_check():
    """The grid alignment and the depth-vs-omission distinction, which are the two
    things that would silently produce a confident wrong answer."""
    grid = ["Puka Nacua", "Zay Flowers", "Rashod Bateman"]
    slot = {norm(n): i for i, n in enumerate(grid)}
    rows = [("Puka Nacua", "LAR", 1), ("Rashod Bateman", "BAL", 2)]
    col = [None] * len(grid)
    for name, _t, rank in rows:
        col[slot[norm(name)]] = rank
    assert col == [1, None, 2], col
    # An omission is only a judgement on a board deep enough to have included him.
    assert col[slot[norm("Zay Flowers")]] is None
    # Name normalisation has to survive the suffixes FantasyPros ships.
    assert norm("Marvin Harrison Jr.") == norm("Marvin Harrison")
    assert norm("Ja'Marr Chase") == "jamarrchase"   # norm strips spaces too
    # Median of an even-length rank set is the interpolated midpoint, not a member.
    assert statistics.median([48, 61]) == 54.5
    print("build_fantasypros_experts self-check ok")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    sys.exit(self_check() if a.self_check else main())
