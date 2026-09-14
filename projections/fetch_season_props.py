"""Pull NFL SEASON-LONG player stat props from BettingPros (FantasyPros) -- real
sportsbook lines, both sides priced, no key, no browser dump.

Why this exists: fetch_prizepicks.py is dead from a script (DataDome), and PrizePicks
posts a number with no price, so you can never devig it. BettingPros scouts ~9 books
for the season board -- PrizePicks (37), Caesars (13), DraftKings (12), Kalshi (68),
BetMGM (19), Hard Rock (49), theScore (33), Underdog (36), BetRivers (18) -- and hands
back consensus line + consensus odds + which book has the best number on each side.
PrizePicks is INSIDE this feed, so the manual dump is no longer the only path to it.

Verified 2026-08-14: 396 season props / 167 players (QB 95, RB 113, WR 138, TE 50)
across 6 live markets. Receptions (330) and INTs (303) exist as market ids but are
empty right now -- books post them later, and PrizePicks' own NFLSZN board is the
only place carrying season receptions today. So --merge-prizepicks stays supported:
BettingPros wins on price, the PP dump wins on breadth and on receptions.

The x-api-key below is the public constant baked into bettingpros.com's own JS. No
account, no signup, no per-user quota.

Usage (plain `python`, stdlib only):
  python fetch_season_props.py
  python fetch_season_props.py --merge-prizepicks prizepicks-nfl-season-lines.json
  python fetch_season_props.py --self-check      # offline parser test

Output season-props.json, same shape build_offense_components.py already reads:
  {"players": [{"player","team","pos","lines":{<PrizePicks stat name>: line}}], "rows":[...]}
Rows additionally carry consensus_odds / best books / source so a devig or a
line-shopping view can be built later without a re-fetch.
"""
import json, argparse, urllib.request, pathlib, time
import devig

HERE = pathlib.Path(__file__).parent
API = "https://api.bettingpros.com/v3"
KEY = "CHi8Hy5CEE4khd46XNYL23dCFX96oUdw6qOt1Dnh"  # public constant from bettingpros.com JS
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0 Safari/537.36",
           "Accept": "application/json", "x-api-key": KEY}

# BettingPros market id -> the PrizePicks stat name build_offense_components.py maps on.
MARKETS = {
    300: ("Pass Yards", "pass_yd"), 304: ("Pass TDs", "pass_td"), 303: ("Pass INTs", "pass_int"),
    301: ("Rush Yards", "rush_yd"), 305: ("Rush TDs", "rush_td"),
    302: ("Receiving Yards", "rec_yd"), 306: ("Rec TDs", "rec_td"), 330: ("Receptions", "rec"),
}


def get(path):
    req = urllib.request.Request(API + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def fetch(season):
    """One page per 200 props. Returns raw BettingPros prop dicts."""
    props, page = [], 1
    while True:
        d = get(f"/props?sport=NFL&season={season}&limit=200&page={page}")
        props += d.get("props", [])
        pag = d.get("_pagination") or {}
        if page >= (pag.get("total_pages") or 1):
            break
        page += 1
        time.sleep(0.5)
    return props


def parse(props, books):
    """BettingPros props -> flat rows carrying the market's MEAN, not just its line.

    Line: consensus, never a single book's own number -- one shop with a stale line is
    not the market.

    Price: only the consensus pair is devig-able. `over.odds` / `under.odds` are the best
    price on each side FROM DIFFERENT BOOKS AT DIFFERENT LINES (97 of 107 rec-yard props
    disagree), so they are kept for line-shopping and deliberately never devigged. Each
    is stored next to the line it actually belongs to so nobody pairs them by accident.
    """
    rows, dropped = [], []
    for x in props:
        m = MARKETS.get(x.get("market_id"))
        if not m:
            continue
        stat, key = m
        pl = ((x.get("participant") or {}).get("player")) or {}
        over, under = x.get("over") or {}, x.get("under") or {}
        line = over.get("consensus_line") or under.get("consensus_line") or over.get("line")
        if line is None:
            continue
        mean, p_over, method = devig.market_mean(
            key, line, over.get("consensus_odds"), under.get("consensus_odds"))
        if mean is None:
            # alt rung, not a market median. Leave the slot empty so Sleeper's
            # projection fills it with a visible borrow flag.
            dropped.append((x["participant"]["name"], stat, line, p_over))
            continue
        rows.append({
            "player": (x.get("participant") or {}).get("name"),
            "team": pl.get("team"), "pos": pl.get("position"),
            "stat_type": stat, "stat_key": key,
            "line": mean,            # price-adjusted mean: what the projection should use
            "posted_line": line,     # the consensus number as posted
            "fair_prob_over": None if p_over is None else round(p_over, 4),
            "devig_method": method,
            "consensus_over_odds": over.get("consensus_odds"),
            "consensus_under_odds": under.get("consensus_odds"),
            # best price per side -- each with ITS OWN line. Never devig these together.
            "best_over": {"odds": over.get("odds"), "line": over.get("line"),
                          "book": books.get(over.get("book"))},
            "best_under": {"odds": under.get("odds"), "line": under.get("line"),
                           "book": books.get(under.get("book"))},
            "source": "bettingpros",
        })
    if dropped:
        print(f"dropped {len(dropped)} alt-rung yardage props (price says the posted "
              f"line is not the median):")
        for n, st_, ln, p in dropped[:6]:
            print(f"    {n:22s} {st_:16s} {ln} @ p(over) {p:.3f}")
    return rows


def pivot(rows):
    out = {}
    for r in rows:
        if not r["player"] or r["line"] is None:
            continue
        k = r["player"]
        p = out.setdefault(k, {"player": r["player"], "team": r["team"], "pos": r["pos"], "lines": {}})
        p["lines"][r["stat_type"]] = r["line"]
        # a real book price beats a pick'em number for the same stat
        if r.get("source") == "bettingpros":
            p["team"] = r["team"] or p["team"]
            p["pos"] = r["pos"] or p["pos"]
    return out


def prizepicks_rows(path):
    """PrizePicks dump rows, for breadth (deep players + season receptions)."""
    d = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    return [{**r, "source": "prizepicks"} for r in d.get("rows", [])
            if r.get("player") and r.get("line") is not None
            and r.get("odds_type") in (None, "standard")]


def self_check():
    # the real shape: best-over sits at a DIFFERENT line than the consensus, which is
    # exactly the trap. 999.5 @ -140 is theScore's own line, not the market's number.
    props = [{"market_id": 302,
              "participant": {"name": "Test WR", "player": {"team": "SEA", "position": "WR"}},
              "over": {"line": 999.5, "odds": -140, "book": 33,
                       "consensus_line": 1050.5, "consensus_odds": -110},
              "under": {"line": 1050.5, "odds": -115, "book": 13,
                        "consensus_line": 1050.5, "consensus_odds": -110}}]
    rows = parse(props, {33: "theScore Bet", 13: "Caesars"})
    assert len(rows) == 1, rows
    r = rows[0]
    assert r["posted_line"] == 1050.5, "consensus must win over a single book's own line"
    assert r["line"] == 1050.5, "a -110/-110 price must not move the line"
    assert abs(r["fair_prob_over"] - 0.5) < 1e-6, r["fair_prob_over"]
    # the best prices stay attached to their own lines and out of the devig
    assert r["best_over"] == {"odds": -140, "line": 999.5, "book": "theScore Bet"}
    assert r["best_under"]["line"] == 1050.5
    assert "over_odds" not in r and "consensus_odds" not in r, "no ambiguous odds field"

    # a priced TD lean must move the number the projection consumes
    td = [{"market_id": 305,
           "participant": {"name": "Test RB", "player": {"team": "SEA", "position": "RB"}},
           "over": {"consensus_line": 5.5, "consensus_odds": -150},
           "under": {"consensus_line": 5.5, "consensus_odds": 120}}]
    trow = parse(td, {})[0]
    assert trow["posted_line"] == 5.5 and trow["line"] > 5.5, trow
    assert trow["devig_method"].startswith("poisson"), trow["devig_method"]

    # unpriced side: line passes through untouched, no invented lean
    bare = [{"market_id": 302,
             "participant": {"name": "Test WR2", "player": {"team": "SF", "position": "WR"}},
             "over": {"consensus_line": 900.5, "consensus_odds": -140},
             "under": {"consensus_line": 900.5}}]
    brow = parse(bare, {})[0]
    assert brow["line"] == 900.5 and brow["fair_prob_over"] is None, brow

    # PrizePicks-only stat must survive the merge; BettingPros must win a shared stat
    merged = pivot(prizepicks_like() + rows)
    assert merged["Test WR"]["lines"]["Receptions"] == 88.5
    assert merged["Test WR"]["lines"]["Receiving Yards"] == 1050.5
    assert parse([{"market_id": 999, "participant": {}}], {}) == []
    devig.demo()
    print("self-check ok")


def prizepicks_like():
    return [{"player": "Test WR", "team": "SEA", "pos": "WR", "stat_type": "Receptions",
             "line": 88.5, "source": "prizepicks"},
            {"player": "Test WR", "team": "SEA", "pos": "WR", "stat_type": "Receiving Yards",
             "line": 775.5, "source": "prizepicks"}]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2026")
    ap.add_argument("--merge-prizepicks", metavar="FILE", nargs="?",
                    const="prizepicks-nfl-season-lines.json",
                    default="prizepicks-nfl-season-lines.json",
                    help="fold in a PrizePicks season dump for breadth (BettingPros wins ties). "
                         "Default on when the file exists; pass '' to skip.")
    ap.add_argument("--out", default="season-props.json")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()

    books = {b["id"]: b["name"] for b in get("/books?sport=NFL")["books"]}
    rows = parse(fetch(a.season), books)
    pp = []
    if a.merge_prizepicks:
        f = pathlib.Path(a.merge_prizepicks)
        if not f.is_absolute():
            f = HERE / f
        if f.exists():
            pp = prizepicks_rows(f)
        else:
            print(f"warn: {f} missing, BettingPros only")
    # PrizePicks first so BettingPros overwrites any shared stat in the pivot
    players = pivot(pp + rows)

    (HERE / a.out).write_text(json.dumps(
        {"season": a.season, "fetched": time.strftime("%Y-%m-%dT%H:%M:%S"),
         "count": len(rows) + len(pp), "rows": pp + rows,
         "players": list(players.values())}, ensure_ascii=False, indent=1), encoding="utf-8")

    stats = sorted({r["stat_type"] for r in rows})
    print(f"bettingpros {len(rows)} lines, prizepicks {len(pp)} -> {len(players)} players -> {a.out}")
    print("stats:", ", ".join(stats))
    moved = [r for r in rows if r["line"] != r["posted_line"]]
    print(f"price moved the line on {len(moved)} of {len(rows)}")
    for r in rows[:8]:
        arrow = "" if r["line"] == r["posted_line"] else f" <- {r['posted_line']}"
        print(f"  {r['player']:22s} {r['team'] or '?':3s} {r['stat_type']:18s} "
              f"{r['line']:>7}{arrow:>12}  p(over) {r['fair_prob_over']} [{r['devig_method']}]")


if __name__ == "__main__":
    main()
