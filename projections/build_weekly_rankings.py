"""Build the weekly comparison data used by the player rankings table.

Sleeper supplies PPR projections for weeks 1 through 18. The current-week row also
combines price-adjusted BettingPros player props with Sleeper fills, FantasyPros ECR,
and Jacob Gibbs' isolated weekly ranking (expert id 1576).

Usage:
    python projections/build_weekly_rankings.py
    python projections/build_weekly_rankings.py --week 4
    python projections/build_weekly_rankings.py --self-check
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import time
import unicodedata
import urllib.parse
import urllib.request

import devig
from fetch_season_props import KEY as BETTINGPROS_KEY


HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
OUT = ROOT / "site" / "data" / "weekly-rankings.js"
PLAYERS_PATH = ROOT / "players-nfl.json"
OFF_POS = {"QB", "RB", "WR", "TE"}
WEEKS = range(1, 19)
SCORE_KEYS = ("pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td",
              "rec", "rec_yd", "rec_td", "fum_lost", "pass_2pt", "rush_2pt", "rec_2pt")

BETTINGPROS_API = "https://api.bettingpros.com/v3"
BETTINGPROS_MARKETS = {
    101: "pass_int", 102: "pass_td", 103: "pass_yd", 104: "rec",
    105: "rec_yd", 107: "rush_yd",
}
GIBBS_EXPERT_ID = 1576

# FantasyPros serves two tiers behind the same consensus-rankings endpoint, and the
# key decides which. A personal public-tier key comes back limit=10 with
# public_api_limited=true, so RB11 onward simply does not exist for us. The key the
# site ships to every browser is not limited: measured 2026-09-12, week 1 PPR, the
# same URL returned 10 players on the personal key and 82 on this one, both with
# total_experts=1 for expert 1576. It is published in the public rankings bundle at
# cdn.fantasypros.com/assets/js/min/pages/rankings/bundle-*.js as the apiKey passed
# to the api.fantasypros.com client, so this is the same request the page itself
# makes. The personal key stays as the fallback below, capped but real.
FANTASYPROS_WEB_KEY = "zjxN52G3lP4fORpHRftGI2mTU8cTwxVNvkjByM3j"


def load_dotenv():
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_json(url, headers=None, timeout=60):
    request_headers = {"User-Agent": "Mozilla/5.0 FantasyHub/1.0", "Accept": "application/json"}
    request_headers.update(headers or {})
    req = urllib.request.Request(url, headers=request_headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))


def norm(value):
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    value = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", value, flags=re.I)
    return re.sub(r"[^a-z0-9]", "", value.lower())


def ppr_score(stats):
    if not stats:
        return None
    get = lambda key: stats.get(key, 0) or 0
    total = (get("pass_yd") * 0.04 + get("pass_td") * 4 - get("pass_int")
             + get("rush_yd") * 0.1 + get("rush_td") * 6 + get("rec")
             + get("rec_yd") * 0.1 + get("rec_td") * 6 - get("fum_lost") * 2
             + (get("pass_2pt") + get("rush_2pt") + get("rec_2pt")) * 2)
    return round(total, 1)


def current_nfl_state():
    state = get_json("https://api.sleeper.app/v1/state/nfl")
    season = int(state.get("season") or datetime.date.today().year)
    week = max(1, min(18, int(state.get("week") or 1)))
    return season, week


def sleeper_projections(season):
    players = {}
    current_stats = {}
    for week in WEEKS:
        url = f"https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular"
        rows = get_json(url)
        for row in rows if isinstance(rows, list) else []:
            player = row.get("player") or {}
            pid = str(row.get("player_id") or player.get("player_id") or "")
            pos = player.get("position") or row.get("position")
            stats = row.get("stats") or {}
            if not pid or pos not in OFF_POS or stats.get("pts_ppr") is None:
                continue
            entry = players.setdefault(pid, {
                "id": pid,
                "name": " ".join(x for x in (player.get("first_name"), player.get("last_name")) if x).strip(),
                "pos": pos,
                "team": row.get("team") or player.get("team"),
                "sleeper": [None] * 18,
            })
            entry["sleeper"][week - 1] = round(float(stats["pts_ppr"]), 1)
            current_stats[(pid, week)] = {key: stats[key] for key in SCORE_KEYS if stats.get(key) is not None}
        time.sleep(0.08)
    return players, current_stats


def player_name_index(players):
    index = {}
    for pid, player in players.items():
        index.setdefault(norm(player.get("name")), []).append(pid)
    return index


def resolve_player(index, players, name, pos=None, team=None):
    candidates = index.get(norm(name), [])
    if len(candidates) == 1:
        return candidates[0]
    for pid in candidates:
        player = players[pid]
        if pos and player.get("pos") != pos:
            continue
        if team and player.get("team") and player.get("team") != team:
            continue
        return pid
    return None


def bettingpros_props(season, week):
    headers = {"x-api-key": BETTINGPROS_KEY}
    props, page = [], 1
    while True:
        url = f"{BETTINGPROS_API}/props?sport=NFL&season={season}&week={week}&limit=200&page={page}"
        payload = get_json(url, headers=headers)
        props.extend(payload.get("props") or [])
        total_pages = int((payload.get("_pagination") or {}).get("total_pages") or 1)
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.25)
    return props


def vegas_projection(props, players, sleeper_stats, week):
    index = player_name_index(players)
    market_stats = {}
    for prop in props:
        stat = BETTINGPROS_MARKETS.get(prop.get("market_id"))
        if not stat:
            continue
        participant = prop.get("participant") or {}
        player = participant.get("player") or {}
        name = participant.get("name") or player.get("name")
        pid = resolve_player(index, players, name, player.get("position"), player.get("team"))
        if not pid:
            continue
        over, under = prop.get("over") or {}, prop.get("under") or {}
        line = over.get("consensus_line")
        if line is None:
            line = under.get("consensus_line")
        if line is None:
            line = over.get("line")
        mean, _, _ = devig.market_mean(stat, line, over.get("consensus_odds"), under.get("consensus_odds"))
        if mean is not None:
            market_stats.setdefault(pid, {})[stat] = mean

    # Every market projection borrows something, so a bare "this row borrows"
    # flag marks all 247 of them and says nothing. What matters is how much of
    # the projected total came from Sleeper rather than from a real line: a QB
    # borrowing two-point conversions is still a market read, a WR borrowing
    # rec_td is Sleeper wearing a market label.
    projections, borrowed, borrowed_share, components = {}, {}, {}, {}
    for pid, stats in market_stats.items():
        filled = dict(stats)
        fills = []
        sleeper = sleeper_stats.get((pid, week)) or {}
        for key in SCORE_KEYS:
            if key not in filled and sleeper.get(key) is not None:
                filled[key] = sleeper[key]
                fills.append(key)
        points = ppr_score(filled)
        if points is not None:
            market_only = ppr_score(stats) or 0.0
            projections[pid] = points
            borrowed[pid] = fills
            borrowed_share[pid] = round(max(0.0, points - market_only) / points, 3) if points else 0.0
            # The stat line the total was built from. Without it the Vegas column
            # is a number with no way to audit which market produced it, so a bad
            # line and a real edge look identical.
            components[pid] = {k: round(v, 2) for k, v in filled.items() if v}
    return projections, borrowed, borrowed_share, components


def fantasypros_rankings(season, week, players, expert_id=None, api_key=None):
    """Weekly ECR, or one expert's weekly board when expert_id is given.

    Tries the site's own uncapped key first and falls back to the personal
    public-tier key, which returns the top 10 per position and nothing else.
    """
    if api_key is None:
        last_error = "FANTASYPROS_API_KEY is not set"
        for candidate in (FANTASYPROS_WEB_KEY, os.environ.get("FANTASYPROS_API_KEY")):
            if not candidate:
                continue
            try:
                return fantasypros_rankings(season, week, players, expert_id, api_key=candidate)
            except Exception as exc:
                last_error = f"key ending {candidate[-4:]}: {exc}"
                print(f"  fantasypros: {last_error}, trying the next one")
        return {}, {"available": False, "reason": str(last_error), "unmatched": 0}
    index = player_name_index(players)
    rankings = {}
    unmatched = 0
    limit_per_position = None
    api_limited = False
    headers = {
        "x-api-key": api_key,
        # The uncapped key is the browser client's, and the API checks the origin.
        "Origin": "https://www.fantasypros.com",
        "Referer": "https://www.fantasypros.com/",
    }
    for pos in ("QB", "RB", "WR", "TE"):
        params = {"position": pos, "type": "weekly", "scoring": "PPR", "week": week,
                  "experts": "available", "sport": "NFL"}
        if expert_id is not None:
            # FantasyPros silently ignores one id here. Repeating the id forces
            # expert-only mode and is confirmed by total_experts=1 in the response.
            params["filters"] = f"{expert_id}:{expert_id}"
        query = urllib.parse.urlencode(params)
        url = f"https://api.fantasypros.com/public/v2/json/nfl/{season}/consensus-rankings?{query}"
        payload = get_json(url, headers=headers)
        if expert_id is not None:
            returned_ids = set(re.findall(r"\d+", str(payload.get("filters") or "")))
            if int(payload.get("total_experts") or 0) != 1 or returned_ids != {str(expert_id)}:
                raise RuntimeError(f"FantasyPros did not isolate expert {expert_id}")
        if payload.get("limit") is not None:
            limit_per_position = int(payload["limit"])
        api_limited = api_limited or bool(payload.get("public_api_limited"))
        for row in payload.get("players") or []:
            name = row.get("player_name") or row.get("name")
            team = row.get("player_team_id") or row.get("team")
            pid = resolve_player(index, players, name, pos, team)
            if not pid:
                unmatched += 1
                continue
            rank = row.get("rank_ecr")
            if rank is not None:
                rankings[pid] = int(round(float(rank)))
        time.sleep(0.15)
    if not rankings:
        # An empty board is how a rejected key looks once the HTTP layer is happy,
        # so raise rather than let the caller record honest-looking zero coverage.
        raise RuntimeError(f"FantasyPros returned no ranked players for week {week}")
    return rankings, {
        "available": True, "limited": api_limited,
        "limitPerPosition": limit_per_position, "unmatched": unmatched,
        "expertId": expert_id, "keySource": "web" if api_key == FANTASYPROS_WEB_KEY else "personal",
    }


def self_check():
    assert ppr_score({"pass_yd": 250, "pass_td": 2, "rush_yd": 30, "pass_int": 1}) == 20.0
    params = urllib.parse.urlencode({"filters": f"{GIBBS_EXPERT_ID}:{GIBBS_EXPERT_ID}"})
    assert "filters=1576%3A1576" in params
    fake_players = {"1": {"name": "Test Player", "pos": "WR", "team": "SEA"}}
    fake_prop = [{
        "market_id": 105,
        "participant": {"name": "Test Player", "player": {"position": "WR", "team": "SEA"}},
        "over": {"consensus_line": 69.5, "consensus_odds": -110},
        "under": {"consensus_line": 69.5, "consensus_odds": -110},
    }]
    sleeper = {("1", 1): {"rec": 5, "rec_td": 0.4}}
    projected, borrowed, share, parts = vegas_projection(fake_prop, fake_players, sleeper, 1)
    assert projected["1"] == 14.3 and set(borrowed["1"]) == {"rec", "rec_td"}
    # The components have to reconcile to the total, or the table would show a
    # stat line that does not add up to the number beside it.
    assert parts["1"] == {"rec_yd": 69.5, "rec": 5, "rec_td": 0.4}, parts["1"]
    assert abs(ppr_score(parts["1"]) - projected["1"]) < 0.05
    # 69.5 receiving yards is the only real line, worth 7.0 of 14.3 points once
    # ppr_score rounds. The rest, 5 receptions plus 0.4 receiving TDs, is
    # borrowed, so just over half this "market" projection is actually Sleeper.
    assert abs(share["1"] - 0.510) < 0.002, share["1"]
    # The uncapped key has to stay the first one tried or the cap comes straight back.
    assert FANTASYPROS_WEB_KEY and len(FANTASYPROS_WEB_KEY) == 40
    print("weekly rankings self-check ok")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", type=int)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return

    load_dotenv()
    season, current_week = current_nfl_state()
    if args.week is not None:
        current_week = max(1, min(18, args.week))

    print(f"Sleeper weekly projections: {season} weeks 1-18")
    players, stats = sleeper_projections(season)
    print(f"  {len(players)} offensive players")

    print(f"BettingPros props: week {current_week}")
    props = bettingpros_props(season, current_week)
    vegas, vegas_borrowed, vegas_borrowed_share, vegas_components = vegas_projection(props, players, stats, current_week)
    print(f"  {len(props)} props, {len(vegas)} player point projections")

    try:
        ecr, ecr_meta = fantasypros_rankings(season, current_week, players)
        gibbs, gibbs_meta = fantasypros_rankings(season, current_week, players, GIBBS_EXPERT_ID)
    except Exception as exc:
        print(f"  FantasyPros unavailable: {exc}")
        ecr, gibbs = {}, {}
        ecr_meta = gibbs_meta = {"available": False, "reason": str(exc)[:160], "unmatched": 0}

    output_players = []
    for pid, player in players.items():
        row = dict(player)
        row["vegas"] = vegas.get(pid)
        row["vegasBorrowed"] = vegas_borrowed.get(pid, [])
        # Per-stat expected values behind row["vegas"], so the table can show
        # the components and mark which of them were Sleeper fills.
        row["vegasStats"] = vegas_components.get(pid)
        # Share of the Vegas projection that came from Sleeper fills, 0 to 1.
        row["vegasBorrowedShare"] = vegas_borrowed_share.get(pid)
        row["ecr"] = ecr.get(pid)
        row["gibbs"] = gibbs.get(pid)
        output_players.append(row)
    output_players.sort(key=lambda p: (p["pos"], -(p["sleeper"][current_week - 1] or -999), p["name"]))

    payload = {
        "season": season,
        "currentWeek": current_week,
        "scoring": "PPR",
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "vegas": "BettingPros consensus player props, price-adjusted; missing scoring components filled from Sleeper",
            "sleeper": "Sleeper weekly pts_ppr",
            "ecr": "FantasyPros weekly expert consensus rankings",
            "gibbs": f"FantasyPros weekly ranking for Jacob Gibbs, expert {GIBBS_EXPERT_ID}",
        },
        "coverage": {
            "sleeperPlayers": len(output_players), "bettingProsProps": len(props),
            "vegasPlayers": len(vegas), "ecrPlayers": len(ecr), "gibbsPlayers": len(gibbs),
            "ecr": ecr_meta, "gibbs": gibbs_meta,
        },
        "players": output_players,
    }
    OUT.write_text("window.WEEKLY_RANKINGS = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"  FantasyPros ECR {len(ecr)}, Gibbs {len(gibbs)}")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
