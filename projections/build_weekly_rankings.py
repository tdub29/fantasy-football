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
# K and DEF are here because two leagues START them (Washington and Phi Kap
# both roster a K and a DEF slot), and Sleeper projects both: measured
# 2026-09-16, week 3 carried 34 kickers and 32 defenses with pts_ppr. Leaving
# them out priced 2 of 10 starting slots at zero in those leagues.
# IDP is here for the same reason K and DEF are: yuH starts two IDP_FLEX
# slots, and without these positions in the weekly file the whole IDP half of
# that roster had no rest-of-season value at all. Sleeper projects them
# (week 3 carried LB 110, DB 127, DL 63, DT 60, DE 35, CB 36).
OFF_POS = {"QB", "RB", "WR", "TE", "K", "DEF",
           "LB", "DB", "DL", "CB", "S", "DT", "DE", "NT", "EDGE", "IDL"}
WEEKS = range(1, 19)
SCORE_KEYS = ("pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td",
              "rec", "rec_yd", "rec_td", "fum_lost", "pass_2pt", "rush_2pt", "rec_2pt")

BETTINGPROS_API = "https://api.bettingpros.com/v3"
BETTINGPROS_MARKETS = {
    101: "pass_int", 102: "pass_td", 103: "pass_yd", 104: "rec",
    105: "rec_yd", 107: "rush_yd",
}
GIBBS_EXPERT_ID = 1576
# The analysts whose own board gets a column, kept separate from the consensus.
# ECR is an average and an average cannot disagree with itself; these can. Add one
# by appending a row here, nothing in the site needs editing: the table renders a
# column per entry off payload["trackedExperts"]. IDs come from the Experts view
# (#experts) or the directory embedded in the FantasyPros rankings page.
# `ros` asks for his rest-of-season board too, which most of them do not publish.
# `scoring` is "PPR" unless the entry says otherwise. "auto" probes each scoring and
# takes whichever board he submitted most recently, because the same expert id serves
# one board per scoring and an analyst only keeps his own format current.
TRACKED_EXPERTS = [
    {"key": "gibbs",  "id": GIBBS_EXPERT_ID, "name": "Jacob Gibbs",  "label": "J. Gibbs", "ros": True,
     "scoring": "auto"},
    {"key": "winks",  "id": 7666,            "name": "Hayden Winks", "label": "Winks"},
    {"key": "harmon", "id": 747,             "name": "Matt Harmon",  "label": "Harmon"},
    {"key": "mader",  "id": 3468,            "name": "Daniel Mader", "label": "Mader"},
]

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


# PrizePicks weekly singles. A flat pick-em line with no price, so there is no vig
# to remove and market_mean does not apply: the line IS the mean, shaded a few
# percent toward the house. That makes it strictly worse than a devigged
# BettingPros consensus and strictly better than a Sleeper model number, so it
# sits between them. Never devig one of these against anything.
PRIZEPICKS_WEEKLY = pathlib.Path(__file__).parent / "prizepicks-nfl-weekly-lines.json"
PRIZEPICKS_MARKETS = {
    "Pass Yards": "pass_yd", "Pass TDs": "pass_td", "INT": "pass_int",
    "Rush Yards": "rush_yd", "Rush TDs": "rush_td",
    "Receiving Yards": "rec_yd", "Rec TDs": "rec_td", "Receptions": "rec",
}


def prizepicks_stats(players):
    """pid -> {stat: line} from the PrizePicks weekly board, offense singles only."""
    if not PRIZEPICKS_WEEKLY.exists():
        return {}
    rows = json.loads(PRIZEPICKS_WEEKLY.read_text(encoding="utf-8")).get("players") or []
    index = player_name_index(players)
    out = {}
    for row in rows:
        name = row.get("player") or ""
        # A combo prop names two players and prices neither one alone.
        if "+" in name:
            continue
        pid = resolve_player(index, players, name, row.get("pos"), row.get("team"))
        if not pid:
            continue
        stats = {PRIZEPICKS_MARKETS[k]: v for k, v in (row.get("lines") or {}).items()
                 if k in PRIZEPICKS_MARKETS and v is not None}
        if stats:
            out.setdefault(pid, {}).update(stats)
    return out


def vegas_projection(props, players, sleeper_stats, week, pp_stats=None):
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

    # A player PrizePicks prices and BettingPros does not still gets a market read.
    # Measured 2026-09-16, week 2: 196 projections against 187 from consensus alone,
    # so the board is mostly overlap and its real contribution is per-stat fills on
    # players both sources carry, not new names.
    for pid in (pp_stats or {}):
        market_stats.setdefault(pid, {})

    # Every market projection borrows something, so a bare "this row borrows"
    # flag marks all 247 of them and says nothing. What matters is how much of
    # the projected total came from Sleeper rather than from a real line: a QB
    # borrowing two-point conversions is still a market read, a WR borrowing
    # rec_td is Sleeper wearing a market label.
    projections, borrowed, borrowed_share, components = {}, {}, {}, {}
    for pid, stats in market_stats.items():
        filled = dict(stats)
        fills = []
        pp = (pp_stats or {}).get(pid) or {}
        for key in SCORE_KEYS:
            if key not in filled and pp.get(key) is not None:
                filled[key] = pp[key]
        sleeper = sleeper_stats.get((pid, week)) or {}
        for key in SCORE_KEYS:
            if key not in filled and sleeper.get(key) is not None:
                filled[key] = sleeper[key]
                fills.append(key)
        points = ppr_score(filled)
        if points is not None:
            # Market half of the total is consensus plus PrizePicks. Counting a
            # PrizePicks line as a Sleeper borrow would understate real market
            # coverage, which is the number the table uses to flag a soft row.
            market_only = ppr_score({k: v for k, v in filled.items() if k not in fills}) or 0.0
            projections[pid] = points
            borrowed[pid] = fills
            borrowed_share[pid] = round(max(0.0, points - market_only) / points, 3) if points else 0.0
            # The stat line the total was built from. Without it the Vegas column
            # is a number with no way to audit which market produced it, so a bad
            # line and a real edge look identical.
            components[pid] = {k: round(v, 2) for k, v in filled.items() if v}
    return projections, borrowed, borrowed_share, components


def board_stamp(season, week, expert_id, rank_type, scoring, api_key=FANTASYPROS_WEB_KEY,
                position="RB"):
    """When that expert last submitted this board, or None if he has no such board.

    One cheap probe of a single position. FantasyPros stamps every position of a
    submission within seconds of each other, so RB answers "when did he last
    touch this board" for the whole board.
    """
    params = {"position": position, "type": rank_type, "scoring": scoring,
              "week": 0 if rank_type == "ros" else week, "experts": "available",
              "sport": "NFL", "filters": f"{expert_id}:{expert_id}"}
    url = (f"https://api.fantasypros.com/public/v2/json/nfl/{season}"
           f"/consensus-rankings?{urllib.parse.urlencode(params)}")
    try:
        payload = get_json(url, headers={
            "x-api-key": api_key, "Origin": "https://www.fantasypros.com",
            "Referer": "https://www.fantasypros.com/"})
    except Exception:
        return None
    if int(payload.get("total_experts") or 0) != 1 or not (payload.get("players") or []):
        return None
    return payload.get("last_updated_ts")


def freshest_scoring(season, week, expert_id, rank_type, options=("PPR", "HALF")):
    """Which scoring holds this expert's LIVE board, with the stamps that decided it.

    The same expert id serves a separate board per scoring and an analyst only
    keeps the one his outlet publishes current. Jacob Gibbs publishes half-PPR
    (CBS/SportsLine), so his PPR mirror lags: measured 2026-09-19, his ROS PPR
    board was stamped 9/15 and carried Bijan RB1 / Gibbs RB2 / Jacobs RB12, while
    his half board was stamped 9/18 and carried Gibbs RB1 / Jacobs RB51. Pulling
    PPR because the league is PPR quietly bought a three-day-old board and the
    wrong RB1. Probing is one request per scoring and it self-corrects the week
    he switches, which hardcoding HALF would not.
    """
    stamps = {s: board_stamp(season, week, expert_id, rank_type, s) for s in options}
    dated = {s: ts for s, ts in stamps.items() if ts}
    if not dated:
        return options[0], stamps
    return max(dated, key=dated.get), stamps


def fantasypros_rankings(season, week, players, expert_id=None, api_key=None,
                         rank_type="weekly", allow_empty=False, scoring="PPR"):
    """Weekly or rest-of-season ECR, or one expert's board when expert_id is given.

    Tries the site's own uncapped key first and falls back to the personal
    public-tier key, which returns the top 10 per position and nothing else.

    rank_type "ros" is the rest-of-season board. It is a DIFFERENT and much
    smaller expert pool than the weekly one (4 of 11 available experts publish
    one, measured 2026-09-15) and it is not rebuilt daily, so the returned meta
    carries the board's own timestamp. A rest-of-season rank quietly two weeks
    old outranks nothing; read `staleDays` before trusting it.

    allow_empty is for a board that is legitimately absent rather than broken:
    Jacob Gibbs publishes a weekly board and no rest-of-season one, so his ROS
    column is expected to be empty and must not fail the build. It lights up on
    its own the week he starts publishing.
    """
    if api_key is None:
        last_error = "FANTASYPROS_API_KEY is not set"
        for candidate in (FANTASYPROS_WEB_KEY, os.environ.get("FANTASYPROS_API_KEY")):
            if not candidate:
                continue
            try:
                return fantasypros_rankings(season, week, players, expert_id, api_key=candidate,
                                            rank_type=rank_type, allow_empty=allow_empty,
                                            scoring=scoring)
            except Exception as exc:
                last_error = f"key ending {candidate[-4:]}: {exc}"
                print(f"  fantasypros: {last_error}, trying the next one")
        return {}, {"available": False, "reason": str(last_error), "unmatched": 0,
                    "rankType": rank_type, "scoring": scoring}
    index = player_name_index(players)
    rankings = {}
    unmatched = 0
    limit_per_position = None
    api_limited = False
    # The board is only as fresh as its STALEST position, so keep both ends.
    stamps = []
    expert_counts = []
    headers = {
        "x-api-key": api_key,
        # The uncapped key is the browser client's, and the API checks the origin.
        "Origin": "https://www.fantasypros.com",
        "Referer": "https://www.fantasypros.com/",
    }
    for pos in ("QB", "RB", "WR", "TE"):
        params = {"position": pos, "type": rank_type, "scoring": scoring,
                  # The rest-of-season board is not a week, and FantasyPros
                  # answers it as week 0.
                  "week": 0 if rank_type == "ros" else week,
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
            if allow_empty and int(payload.get("total_experts") or 0) == 0:
                # He has no board of this type. Not a failure, just nothing to show.
                continue
            if int(payload.get("total_experts") or 0) != 1 or returned_ids != {str(expert_id)}:
                raise RuntimeError(f"FantasyPros did not isolate expert {expert_id}")
        if payload.get("total_experts") is not None:
            expert_counts.append(int(payload["total_experts"]))
        if payload.get("last_updated_ts"):
            stamps.append(int(payload["last_updated_ts"]))
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
        if allow_empty:
            return {}, {"available": False, "rankType": rank_type, "expertId": expert_id,
                        "scoring": scoring, "unmatched": 0,
                        "reason": f"no {rank_type} {scoring} board published"}
        # An empty board is how a rejected key looks once the HTTP layer is happy,
        # so raise rather than let the caller record honest-looking zero coverage.
        raise RuntimeError(f"FantasyPros returned no ranked players for {rank_type} week {week}")
    oldest = min(stamps) if stamps else None
    return rankings, {
        "available": True, "limited": api_limited, "rankType": rank_type,
        # Which scoring this board came from. A half-PPR board in a PPR table is
        # readable, but only if the column says so.
        "scoring": scoring,
        "limitPerPosition": limit_per_position, "unmatched": unmatched,
        "expertId": expert_id, "keySource": "web" if api_key == FANTASYPROS_WEB_KEY else "personal",
        # Timestamps are the board's, not ours. A fresh pipeline run does not
        # make a two-week-old rest-of-season board current.
        "updatedTs": oldest,
        "updated": datetime.datetime.fromtimestamp(oldest).date().isoformat() if oldest else None,
        "newestTs": max(stamps) if stamps else None,
        "staleDays": round((time.time() - oldest) / 86400, 1) if oldest else None,
        # The ROS consensus is 4 experts deep against roughly 30 on the weekly
        # board, so the same "ECR" label hides a much thinner sample.
        "experts": min(expert_counts) if expert_counts else None,
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
    # A PrizePicks line outranks the Sleeper fill for the same stat and does not
    # count against market coverage; consensus still outranks PrizePicks.
    _, borrowed2, share2, parts2 = vegas_projection(
        fake_prop, fake_players, sleeper, 1, {"1": {"rec_td": 0.9, "rec_yd": 10.0}})
    assert parts2["1"]["rec_td"] == 0.9, parts2["1"]
    assert parts2["1"]["rec_yd"] == 69.5, "consensus must win over a PrizePicks line"
    assert set(borrowed2["1"]) == {"rec"}, borrowed2["1"]
    assert share2["1"] < share["1"], (share2["1"], share["1"])
    # 69.5 receiving yards is the only real line, worth 7.0 of 14.3 points once
    # ppr_score rounds. The rest, 5 receptions plus 0.4 receiving TDs, is
    # borrowed, so just over half this "market" projection is actually Sleeper.
    assert abs(share["1"] - 0.510) < 0.002, share["1"]
    # The uncapped key has to stay the first one tried or the cap comes straight back.
    assert FANTASYPROS_WEB_KEY and len(FANTASYPROS_WEB_KEY) == 40
    # ROS is week 0 on their side. Sending the real week silently returns the
    # WEEKLY board under a ros label, which is the failure that looks fine.
    for rank_type, week, expected in (("ros", 7, 0), ("weekly", 7, 7)):
        assert (0 if rank_type == "ros" else week) == expected
    # An expert's board exists once per scoring and only one of them is kept
    # current, so "freshest wins" has to survive a tie, a missing board, and the
    # case where the DEFAULT scoring is the stale one. That last case is the real
    # bug: Gibbs' PPR mirror answers happily and is three days behind.
    real = globals()["board_stamp"]
    try:
        stamps = {("PPR", 1789501542), ("HALF", 1789763629)}
        globals()["board_stamp"] = lambda *a, **k: dict(stamps)[a[4] if len(a) > 4 else k["scoring"]]
        assert freshest_scoring(2026, 0, 1576, "ros")[0] == "HALF"
        globals()["board_stamp"] = lambda *a, **k: {"PPR": 2, "HALF": None}[a[4] if len(a) > 4 else k["scoring"]]
        assert freshest_scoring(2026, 0, 1576, "ros")[0] == "PPR"
        globals()["board_stamp"] = lambda *a, **k: None
        # Nobody published anything: fall back to the first option rather than
        # crashing a build over a column.
        assert freshest_scoring(2026, 0, 1576, "ros")[0] == "PPR"
    finally:
        globals()["board_stamp"] = real
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
    pp_stats = prizepicks_stats(players)
    vegas, vegas_borrowed, vegas_borrowed_share, vegas_components = vegas_projection(
        props, players, stats, current_week, pp_stats)
    print(f"  {len(props)} props, {len(pp_stats)} players on the PrizePicks board, "
          f"{len(vegas)} player point projections")

    try:
        ecr, ecr_meta = fantasypros_rankings(season, current_week, players)
    except Exception as exc:
        print(f"  FantasyPros unavailable: {exc}")
        ecr, ecr_meta = {}, {"available": False, "reason": str(exc)[:160], "unmatched": 0}

    # One board per tracked analyst. A single one failing is his column going
    # blank, not the build dying and taking the other three with it.
    tracked, tracked_meta, tracked_scoring = {}, {}, {}
    for spec in TRACKED_EXPERTS:
        scoring = spec.get("scoring", "PPR")
        if scoring == "auto":
            scoring, stamps = freshest_scoring(season, current_week, spec["id"], "weekly")
            print(f"  {spec['name']} weekly: {scoring} is his live board "
                  + ", ".join(f"{s}={datetime.date.fromtimestamp(ts).isoformat() if ts else 'none'}"
                              for s, ts in stamps.items()))
        tracked_scoring[spec["key"]] = scoring
        try:
            tracked[spec["key"]], tracked_meta[spec["key"]] = fantasypros_rankings(
                season, current_week, players, spec["id"], allow_empty=True, scoring=scoring)
        except Exception as exc:
            print(f"  FantasyPros {spec['name']} unavailable: {exc}")
            tracked[spec["key"]] = {}
            tracked_meta[spec["key"]] = {"available": False, "reason": str(exc)[:160],
                                         "unmatched": 0, "expertId": spec["id"],
                                         "scoring": scoring}
    gibbs, gibbs_meta = tracked.get("gibbs", {}), tracked_meta.get("gibbs", {})

    # Rest of season. A separate board, a separate expert pool, and its own
    # staleness: it answers "who do I want for the remaining weeks", which is the
    # question every trade and every start/sit past this Sunday actually asks.
    try:
        ros, ros_meta = fantasypros_rankings(season, 0, players, rank_type="ros")
    except Exception as exc:
        print(f"  FantasyPros ROS unavailable: {exc}")
        ros, ros_meta = {}, {"available": False, "reason": str(exc)[:160], "unmatched": 0,
                             "rankType": "ros"}
    # He started publishing a rest-of-season board in week 2. allow_empty keeps a
    # missing one a blank column instead of a failed build, and the scoring probe
    # is what stops the column from quietly showing his abandoned PPR mirror
    # instead of the half-PPR board he actually maintains.
    gibbs_ros_scoring, gibbs_ros_stamps = freshest_scoring(season, 0, GIBBS_EXPERT_ID, "ros")
    print(f"  Jacob Gibbs ROS: {gibbs_ros_scoring} is his live board, "
          + ", ".join(f"{s}={datetime.date.fromtimestamp(ts).isoformat() if ts else 'none'}"
                      for s, ts in gibbs_ros_stamps.items()))
    try:
        gibbs_ros, gibbs_ros_meta = fantasypros_rankings(
            season, 0, players, GIBBS_EXPERT_ID, rank_type="ros", allow_empty=True,
            scoring=gibbs_ros_scoring)
    except Exception as exc:
        print(f"  FantasyPros Gibbs ROS unavailable: {exc}")
        gibbs_ros, gibbs_ros_meta = {}, {"available": False, "reason": str(exc)[:160],
                                         "unmatched": 0, "rankType": "ros",
                                         "expertId": GIBBS_EXPERT_ID,
                                         "scoring": gibbs_ros_scoring}
    # Both stamps, so the site can say WHY it is showing a half-PPR board in a PPR
    # table rather than leaving that as a mystery to re-derive by hand.
    gibbs_ros_meta["scoringStamps"] = {
        s: (datetime.date.fromtimestamp(ts).isoformat() if ts else None)
        for s, ts in gibbs_ros_stamps.items()}

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
        # Per-analyst ranks. `gibbs` stays a top-level alias because the sort
        # keys and the player card already read it by that name.
        row["experts"] = {k: v.get(pid) for k, v in tracked.items() if v.get(pid) is not None}
        row["gibbs"] = gibbs.get(pid)
        row["ros"] = ros.get(pid)
        row["gibbsRos"] = gibbs_ros.get(pid)
        output_players.append(row)
    output_players.sort(key=lambda p: (p["pos"], -(p["sleeper"][current_week - 1] or -999), p["name"]))

    payload = {
        "season": season,
        "currentWeek": current_week,
        "scoring": "PPR",
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "vegas": "BettingPros consensus player props, price-adjusted; gaps filled from the PrizePicks weekly board (flat line, no vig to remove), then from Sleeper",
            "sleeper": "Sleeper weekly pts_ppr",
            "ecr": "FantasyPros weekly expert consensus rankings",
            "gibbs": f"FantasyPros weekly {tracked_scoring.get('gibbs', 'PPR')} ranking for Jacob Gibbs, expert {GIBBS_EXPERT_ID}",
            "experts": "FantasyPros weekly ranking, one isolated analyst board per tracked expert, each in the scoring that analyst keeps current",
            "ros": "FantasyPros rest-of-season PPR expert consensus rankings",
            "gibbsRos": f"FantasyPros rest-of-season {gibbs_ros_scoring} ranking for Jacob Gibbs, expert {GIBBS_EXPERT_ID}, when he publishes one",
        },
        "coverage": {
            "sleeperPlayers": len(output_players), "bettingProsProps": len(props),
            "vegasPlayers": len(vegas), "prizePicksPlayers": len(pp_stats),
            "ecrPlayers": len(ecr), "gibbsPlayers": len(gibbs),
            "rosPlayers": len(ros), "gibbsRosPlayers": len(gibbs_ros),
            "ecr": ecr_meta, "gibbs": gibbs_meta, "ros": ros_meta, "gibbsRos": gibbs_ros_meta,
        },
        # What the table renders a column for, so adding an analyst is a builder
        # change and not a site change.
        "trackedExperts": [
            {**{k: spec[k] for k in ("key", "id", "name", "label")},
             "scoring": tracked_scoring.get(spec["key"], "PPR"),
             "players": len(tracked.get(spec["key"]) or {}),
             "meta": tracked_meta.get(spec["key"]) or {}}
            for spec in TRACKED_EXPERTS
        ],
        "players": output_players,
    }
    OUT.write_text("window.WEEKLY_RANKINGS = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"  FantasyPros ECR {len(ecr)}; "
          + ", ".join(f"{spec['name']} {len(tracked.get(spec['key']) or {})}"
                      for spec in TRACKED_EXPERTS))
    print(f"  FantasyPros ROS {len(ros)} (as of {ros_meta.get('updated')}, "
          f"{ros_meta.get('staleDays')}d old, {ros_meta.get('experts')} experts), "
          f"Gibbs ROS {len(gibbs_ros)} ({gibbs_ros_scoring}, as of "
          f"{gibbs_ros_meta.get('updated')})")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
