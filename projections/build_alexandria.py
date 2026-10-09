"""Build site/data/alexandria.js: this week's QB/RB/WR/TE ranks and projected
points from the six sources Firecrawl's Alexandria board aggregates (Draft
Sharks, CBS Sports, FFToday, Fantasy Football Calculator, StartWho props,
FantasyData), keyed to Sleeper ids, with the rank spread across sources.

The spread (max rank minus min rank) is the point: two sources a dozen spots
apart on the same man is a disagreement worth reading before Sunday.

Source facts, probed 2026-10-07:
  * https://www.firecrawl.dev/alexandria/fantasy?position=RB&scoring=PPR is a
    key-free public page (robots.txt allows /alexandria; it disallows /api/, so
    the per-player API is never called here). The board is NOT in a JSON script
    tag: it is inside the Next.js flight payload, self.__next_f.push([1,"..."]).
  * scoring=PPR is passed explicitly. Every source moved its points under HALF
    (CBS answered "unsupported" and dropped out), and CBS's PPR points sit within
    a median 0.6 of the other PPR boards, so all six columns are full PPR. No
    column is half-PPR converted, so none carries a *.
  * Each source's rank is its own positional rank (Draft Sharks ranks are its
    rankings, not a sort of its points). A source missing from a row did not
    rank him; depth varies (StartWho ~42 RBs), so absent is not "low".
  * Undocumented endpoint, cached ~15 min, current week only. Zero rows for any
    position fails the build rather than shipping an empty board.

Usage:
    python projections/build_alexandria.py
    python projections/build_alexandria.py --self-check   # parser vs saved fixture
"""
import argparse
import datetime
import json
import pathlib
import re
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_fantasypros_experts import NAME_ALIASES, site_players  # noqa: E402
from build_weekly_rankings import (  # noqa: E402
    NFL_TEAM_ALIASES, player_name_index, resolve_player,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "alexandria.js"
FIXTURE = pathlib.Path(__file__).resolve().parent / "_fixtures" / "alexandria-rb-sample.html"
POSITIONS = ("QB", "RB", "WR", "TE")
BOARD_URL = "https://www.firecrawl.dev/alexandria/fantasy?position={pos}&scoring=PPR"

PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
SEASON_LABEL = re.compile(r"(\d{4}) season, Week (\d+) of \d+")
# Alexandria's spelling -> Sleeper's, measured on the 2026 wk5 run.
ALIASES = {**NAME_ALIASES, "Kenneth Gainwell": "Kenny Gainwell", "Josh Palmer": "Joshua Palmer",
           "Chigoziem Okonkwo": "Chig Okonkwo", "Matthew Hibner": "Matt Hibner",
           "Andrew Ogletree": "Drew Ogletree"}


def fetch(pos):
    req = urllib.request.Request(BOARD_URL.format(pos=pos),
                                 headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "ignore")


def parse_board(page):
    """(board dict, season or None) from one Alexandria page."""
    flight = "".join(json.loads(s) for s in PUSH.findall(page))
    i = flight.find('{"board":')
    if i < 0:
        raise ValueError("no board object in the flight payload")
    board = json.JSONDecoder().raw_decode(flight, i)[0]["board"]
    # Season only appears in an aria-label; the board carries the week alone.
    m = SEASON_LABEL.search(page) or SEASON_LABEL.search(flight)
    if m and int(m.group(2)) != int(board["week"]):
        raise ValueError(f"page label says week {m.group(2)}, board says {board['week']}")
    return board, (int(m.group(1)) if m else None)


def spread(ranks):
    vals = [r for r in ranks if r is not None]
    return max(vals) - min(vals) if len(vals) >= 2 else None


def mean(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def main():
    players = site_players()
    index = player_name_index(players)
    fetched = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    providers, out, unmatched, seasons, weeks, counts = None, {}, [], set(), set(), {}
    for pos in POSITIONS:
        board, season = parse_board(fetch(pos))
        rows = board.get("rows") or []
        if not rows:
            raise SystemExit(f"Alexandria {pos} board parsed to 0 rows; the page shape changed")
        weeks.add(int(board["week"]))
        if season is None:
            raise SystemExit(f"Alexandria {pos} season is missing; refusing an undated board")
        seasons.add(season)
        ids = [p["id"] for p in board["providers"]]
        if providers is None:
            providers = [{"id": p["id"], "name": p["name"], "site": p["site"],
                          "label": p.get("label"), "depth": {}, "status": {}}
                         for p in board["providers"]]
        elif ids != [p["id"] for p in providers]:
            raise SystemExit(f"{pos} provider order {ids} differs from QB's; refusing to misalign")
        for meta, p in zip(providers, board["providers"]):
            meta["depth"][pos] = p.get("count")
            meta["status"][pos] = p.get("status")
        matched = merged = 0
        for r in rows:
            name, team = r["name"], NFL_TEAM_ALIASES.get(r.get("team"), r.get("team"))
            pid = resolve_player(index, players, ALIASES.get(name, name), pos=pos, team=team)
            ranks = [r["ranks"].get(i) for i in ids]
            if pid is None:
                unmatched.append({"key": r["key"], "name": name, "pos": pos, "team": team})
                continue
            matched += 1
            pts = [r["points"].get(i) for i in ids]
            prev = out.get(pid)
            if prev:
                # The board splits one man into two rows when sources spell him
                # differently (Kenneth/Kenny Gainwell); each row holds the other's
                # missing sources, so fill the gaps rather than overwrite.
                ranks = [a if a is not None else b for a, b in zip(prev["r"], ranks)]
                pts = [a if a is not None else b for a, b in zip(prev["p"], pts)]
                merged += 1
            out[pid] = {
                "name": players[pid]["name"], "pos": pos, "team": team, "opp": r.get("opponent") or (prev or {}).get("opp"),
                "r": ranks, "p": pts, "spread": spread(ranks),
                "avgRank": mean(ranks), "avgPts": mean(pts),
            }
        counts[pos] = (len(rows), matched, merged)

    if len(weeks) != 1:
        raise SystemExit(f"positions disagree on the week: {sorted(weeks)}")
    if len(seasons) != 1:
        raise SystemExit(f"missing or inconsistent season: {sorted(seasons)}")
    payload = {
        "season": seasons.pop() if seasons else None,
        "week": weeks.pop(), "scoring": "PPR", "fetched": fetched,
        "source": "Firecrawl Alexandria fantasy board",
        "url": BOARD_URL.format(pos="RB"),
        "providers": providers, "players": out, "unmatched": unmatched,
    }
    OUT.write_text("window.ALEXANDRIA = "
                   + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                   + ";\n", encoding="utf-8")
    print(f"Alexandria PPR, {payload['season']} week {payload['week']}: "
          f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
    for pos, (n, m, d) in counts.items():
        print(f"  {pos}: {n} rows, {m} matched to Sleeper ({m / n:.0%}), {d} split rows merged")
    if unmatched:
        print(f"  {len(unmatched)} unmatched: "
              + ", ".join(f"{u['name']} {u['pos']} {u['team']}" for u in unmatched))
    return 0


def self_check():
    """Parser against a saved slice of the real RB page (split across two flight
    chunks, as the live page splits it), plus the spread rule."""
    board, season = parse_board(FIXTURE.read_text(encoding="utf-8"))
    assert season == 2026 and board["week"] == 5, (season, board["week"])
    assert [p["id"] for p in board["providers"]][0] == "draftsharks-com"
    assert len(board["providers"]) == 6
    rows = {r["key"]: r for r in board["rows"]}
    ship = rows["will-shipley:RB"]
    assert ship["ranks"]["draftsharks-com"] == 26 and "startwho-com" not in ship["ranks"]
    ids = [p["id"] for p in board["providers"]]
    assert spread([ship["ranks"].get(i) for i in ids]) == ship["maxRank"] - ship["minRank"] == 6
    assert spread([None, 4, None]) is None and spread([]) is None
    assert mean([None, 26, 32, 27, 32, 32]) == ship["avgRank"] == 29.8 and mean([None]) is None
    try:
        parse_board("<html>no board</html>")
        raise AssertionError("an empty page must not parse")
    except ValueError:
        pass
    print("build_alexandria self-check ok")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    sys.exit(self_check() if ap.parse_args().self_check else main())
