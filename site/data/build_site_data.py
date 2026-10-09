"""Build site/data/leagues.js + players.js + sleeper-market.js from cached + live API."""
import json, pathlib, re, urllib.request, sys, unicodedata

ROOT = pathlib.Path(__file__).parent.parent.parent  # Fantasy Football/
SITE_DATA = ROOT / "site" / "data"
LEAGUES_DIR = ROOT / "Leagues"
USER_ID = "726629031964975104"
USERNAME = "tdub1329"
SEASON = "2026"

def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 DynastyDomain/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def current_nfl_week():
    """Sleeper's own idea of the live week. The What to Look For board needs the
    week to ask who each roster is playing; guessing it from the calendar drifts
    every bye and every Thursday flip."""
    try:
        state = fetch_json("https://api.sleeper.app/v1/state/nfl")
        return int(state.get("week") or state.get("display_week") or 1)
    except Exception as e:
        print(f"  nfl state fetch failed ({e}), defaulting to week 1")
        return 1

def sleeper_opponents(league_id, week):
    """roster_id -> opposing roster_id for this week. Empty when the league has
    no matchups posted yet (offseason, or a week Sleeper has not built)."""
    try:
        rows = fetch_json(f"https://api.sleeper.app/v1/league/{league_id}/matchups/{week}")
    except Exception as e:
        print(f"  matchups fetch failed for {league_id}: {e}")
        return {}
    by_matchup = {}
    for row in rows or []:
        mid, rid = row.get("matchup_id"), row.get("roster_id")
        if mid is None or rid is None:
            continue
        by_matchup.setdefault(mid, []).append(rid)
    out = {}
    for sides in by_matchup.values():
        # A matchup is a pair. Anything else (a bye, a 3-way consolation bracket)
        # has no single opponent, so those rosters stay unmapped rather than
        # picking one arbitrarily.
        if len(sides) == 2:
            out[sides[0]], out[sides[1]] = sides[1], sides[0]
    return out

NFL_WEEK = current_nfl_week()

# (folder name, sleeper league id, buy-in in dollars). The buy-in is what the
# What to Look For board weights by: a player on the line in The League is worth
# five times one in the Washington league, so a flat per-league sum would rank
# the wrong names to the top.
LEAGUES = [
    ("Password is taco", "1341184676601028608", 100),
    ("Phi Kap Fantasy",  "1389722402430136320", 100),
    ("The League",       "1314860638501076992", 150),
    ("yuH",              "1312276370583220224", 50),
]
ESPN_LEAGUES = [
    {"league_id": "1532688686", "team_id": 9, "season": 2026, "buy_in": 30},
]

ESPN_SLOT_NAMES = {
    0: "QB", 2: "RB", 4: "WR", 6: "TE", 7: "SUPER_FLEX",
    16: "DEF", 17: "K", 20: "BN", 21: "IR", 23: "FLEX",
}
ESPN_PRO_TEAMS = {
    1:"ATL", 2:"BUF", 3:"CHI", 4:"CIN", 5:"CLE", 6:"DAL", 7:"DEN", 8:"DET",
    9:"GB", 10:"TEN", 11:"IND", 12:"KC", 13:"LV", 14:"LAR", 15:"MIA", 16:"MIN",
    17:"NE", 18:"NO", 19:"NYG", 20:"NYJ", 21:"PHI", 22:"ARI", 23:"PIT", 24:"LAC",
    25:"SF", 26:"SEA", 27:"TB", 28:"WAS", 29:"CAR", 30:"JAX", 33:"BAL", 34:"HOU",
}
ESPN_SCORING = {
    3:"pass_yd", 4:"pass_td", 20:"pass_int", 24:"rush_yd", 25:"rush_td",
    42:"rec_yd", 43:"rec_td", 53:"rec", 68:"fum_lost",
}
ESPN_POSITIONS = {1:"QB", 2:"RB", 3:"WR", 4:"TE", 5:"K", 16:"DEF"}

with open(ROOT / "players-nfl.json", "r", encoding="utf-8") as f:
    PLAYERS = json.load(f)

def norm_player_name(value):
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    value = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", value, flags=re.I)
    return re.sub(r"[^a-z0-9]", "", value.lower())

PLAYER_IDS_BY_NAME = {}
for pid, player in PLAYERS.items():
    full_name = player.get("full_name") or f"{player.get('first_name') or ''} {player.get('last_name') or ''}".strip()
    key = norm_player_name(full_name)
    if key:
        PLAYER_IDS_BY_NAME.setdefault(key, []).append(pid)

def espn_player_id(player):
    if player.get("defaultPositionId") == 16:
        return ESPN_PRO_TEAMS.get(player.get("proTeamId"))
    candidates = PLAYER_IDS_BY_NAME.get(norm_player_name(player.get("fullName"))) or []
    expected_pos = ESPN_POSITIONS.get(player.get("defaultPositionId"))
    expected_team = ESPN_PRO_TEAMS.get(player.get("proTeamId"))
    for pid in candidates:
        sleeper = PLAYERS[pid]
        positions = set(sleeper.get("fantasy_positions") or []) | {sleeper.get("position")}
        if expected_pos in positions and sleeper.get("team") == expected_team:
            return pid
    for pid in candidates:
        sleeper = PLAYERS[pid]
        if expected_pos in (set(sleeper.get("fantasy_positions") or []) | {sleeper.get("position")}):
            return pid
    return None

def build_espn_league(config):
    league_id, season = config["league_id"], config["season"]
    url = (f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}"
           f"/segments/0/leagues/{league_id}?view=mSettings&view=mTeam&view=mRoster&view=mStandings&view=mMatchup")
    raw = fetch_json(url, timeout=40)

    settings = raw.get("settings") or {}
    roster_settings = settings.get("rosterSettings") or {}
    slot_counts = {int(key): int(value) for key, value in (roster_settings.get("lineupSlotCounts") or {}).items()}
    roster_positions = []
    for slot_id, label in ESPN_SLOT_NAMES.items():
        roster_positions.extend([label] * slot_counts.get(slot_id, 0))

    members = {member.get("id"): member for member in raw.get("members") or []}
    # ESPN posts the whole season's schedule in one array; take only the live
    # matchup period. team_id is the roster_id on this platform, so the map keys
    # line up with the Sleeper side without translation.
    espn_period = ((raw.get("status") or {}).get("currentMatchupPeriod")) or 1
    espn_opponents = {}
    for game in raw.get("schedule") or []:
        if game.get("matchupPeriodId") != espn_period:
            continue
        home = (game.get("home") or {}).get("teamId")
        away = (game.get("away") or {}).get("teamId")
        if home is not None and away is not None:
            espn_opponents[home], espn_opponents[away] = away, home
    out_rosters, unmatched = [], []
    for team in sorted(raw.get("teams") or [], key=lambda item: item.get("id", 0)):
        member_id = team.get("primaryOwner") or ((team.get("owners") or [None])[0])
        owner = members.get(member_id) or {}
        owner_id = f"espn-team-{team.get('id')}"
        players, starters, reserve = [], [], []
        for entry in ((team.get("roster") or {}).get("entries") or []):
            espn_player = ((entry.get("playerPoolEntry") or {}).get("player") or {})
            pid = espn_player_id(espn_player)
            if not pid:
                unmatched.append(espn_player.get("fullName") or str(entry.get("playerId")))
                continue
            players.append(pid)
            slot_id = entry.get("lineupSlotId")
            if slot_id == 21:
                reserve.append(pid)
            elif slot_id != 20:
                starters.append(pid)
        record = ((team.get("record") or {}).get("overall") or {})
        out_rosters.append({
            "roster_id": team.get("id"), "owner_id": owner_id,
            "owner_name": owner.get("displayName") or owner.get("firstName") or "ESPN owner",
            "team_name": team.get("name") or team.get("abbrev") or f"Team {team.get('id')}",
            "is_me": team.get("id") == config["team_id"],
            "opponent_roster_id": espn_opponents.get(team.get("id")),
            "starters": starters, "players": players, "taxi": [], "reserve": reserve,
            "wins": record.get("wins", 0), "losses": record.get("losses", 0),
            "ties": record.get("ties", 0), "fpts": record.get("pointsFor", 0),
            "fpts_against": record.get("pointsAgainst", 0),
        })

    scoring = {}
    for item in ((settings.get("scoringSettings") or {}).get("scoringItems") or []):
        key = ESPN_SCORING.get(item.get("statId"))
        if key and item.get("points") is not None:
            scoring[key] = item["points"]
    schedule_settings = settings.get("scheduleSettings") or {}
    acquisition = settings.get("acquisitionSettings") or {}
    status = raw.get("status") or {}
    users = [{
        "user_id": team["owner_id"], "display_name": team["owner_name"],
        "team_name": team["team_name"],
    } for team in out_rosters]
    print(f"  ESPN {settings.get('name')}: {len(out_rosters)} teams, "
          f"{sum(len(team['players']) for team in out_rosters)} players, {len(unmatched)} unmatched")
    if unmatched:
        print("    unmatched:", ", ".join(sorted(set(unmatched))))
    return {
        "id": league_id, "name": settings.get("name") or f"ESPN {league_id}",
        "short_name": settings.get("name") or "ESPN", "season": str(season),
        "buy_in": config.get("buy_in"), "week": espn_period,
        "status": "in_season" if status.get("isActive") else "pre_draft",
        "total_rosters": len(out_rosters), "roster_positions": roster_positions,
        "scoring": scoring, "is_superflex": slot_counts.get(7, 0) > 0, "is_idp": False,
        # ESPN carries no Sleeper settings block, so the redraft flag is set here
        # explicitly rather than derived. Both ESPN leagues Trevor runs are redraft.
        "type": 0, "is_dynasty": False, "platform": "espn", "my_team_id": config["team_id"],
        "external_url": f"https://fantasy.espn.com/football/league?leagueId={league_id}&seasonId={season}",
        "playoff_teams": schedule_settings.get("playoffTeamCount"),
        "trade_deadline": None, "taxi_slots": 0, "reserve_slots": slot_counts.get(21, 0),
        "waiver_type": acquisition.get("acquisitionType"),
        "waiver_budget": acquisition.get("acquisitionBudget"),
        "rosters": out_rosters, "users": users, "drafts": [], "traded_picks": [],
        "import_unmatched": unmatched,
    }

# ---- Sleeper Market: rostership + trending adds/drops ----
print("Fetching Sleeper rostership and trending data...")
try:
    research = fetch_json(f"https://api.sleeper.com/players/nfl/research/regular/{SEASON}")
    print(f"  research: {len(research)} player rostership rows")
except Exception as e:
    research = {}; print("  research failed:", e)
try:
    trending_add  = fetch_json("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=168&limit=60")
    trending_drop = fetch_json("https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=168&limit=60")
    print(f"  trending: +{len(trending_add)} adds, -{len(trending_drop)} drops (7-day window)")
except Exception as e:
    trending_add, trending_drop = [], []; print("  trending failed:", e)

# ---- Build slim player dict: only NFL-active or recently-active offensive/IDP positions
KEEP_POS = {"QB","RB","WR","TE","K","DEF","LB","DB","DL","CB","S","DT","DE","NT","FB"}
slim_players = {}
for pid, p in PLAYERS.items():
    pos = p.get("position")
    if pos not in KEEP_POS: continue
    status = p.get("status")
    team = p.get("team")
    fname = p.get("first_name") or ""
    lname = p.get("last_name") or ""
    full = p.get("full_name") or f"{fname} {lname}".strip()
    if not full: continue
    r = research.get(pid) or {}
    slim_players[pid] = {
        "id": pid,
        "name": full,
        "first": fname,
        "last": lname,
        "pos": pos,
        "team": team or "FA",
        "age": p.get("age"),
        "birth_date": p.get("birth_date"),
        "exp": p.get("years_exp"),
        "status": status,
        # Injury fields. The site benches Out/Doubtful/IR/PUP when it builds a
        # starting lineup, so dropping these (as this file used to) meant a
        # sidelined player silently kept counting as a starter.
        "injury_status": p.get("injury_status"),
        "injury_body_part": p.get("injury_body_part"),
        "injury_start_date": p.get("injury_start_date"),
        "injury_notes": p.get("injury_notes"),
        "practice": p.get("practice_participation"),
        "college": p.get("college"),
        "depth": p.get("depth_chart_order"),
        "owned":   r.get("owned"),
        "started": r.get("started"),
    }
    # Only multi-slot players (Travis Hunter: DB and WR) need this; the site maps
    # single sub-positions (DE, CB) to their slot itself. KTC ranks Hunter as a
    # WR, and without it his row never matched his DB Sleeper id and read FA.
    fp = p.get("fantasy_positions") or []
    if len(fp) > 1:
        slim_players[pid]["fantasy_positions"] = fp

# ---- Sleeper market data file: risers/fallers ----
def name_for(pid):
    p = slim_players.get(pid) or PLAYERS.get(pid) or {}
    return p.get("name") or p.get("full_name") or f"[{pid}]"

risers  = [{"player_id": x["player_id"], "count": x["count"], "name": name_for(x["player_id"])} for x in trending_add[:30]]
fallers = [{"player_id": x["player_id"], "count": x["count"], "name": name_for(x["player_id"])} for x in trending_drop[:30]]
import datetime
market = {
    "fetched": datetime.date.today().isoformat(),
    "season": SEASON,
    "risers": risers,
    "fallers": fallers,
}
(SITE_DATA / "sleeper-market.js").write_text(
    "window.SLEEPER_MARKET = " + json.dumps(market, indent=2) + ";\n",
    encoding="utf-8"
)

print(f"slim players: {len(slim_players)}")

# ---- Per-league output
leagues_out = []
for name, lid, buy_in in LEAGUES:
    folder = LEAGUES_DIR / name
    league   = json.loads((folder / "league.json").read_text())
    users    = json.loads((folder / "users.json").read_text())
    rosters  = json.loads((folder / "rosters.json").read_text())
    drafts   = json.loads((folder / "drafts.json").read_text())
    picks    = json.loads((folder / "traded_picks.json").read_text())

    user_by_id = {u["user_id"]: u for u in users}
    opponents = sleeper_opponents(lid, NFL_WEEK)

    out_rosters = []
    for r in sorted(rosters, key=lambda x: x.get("roster_id", 0)):
        owner = user_by_id.get(r.get("owner_id") or "", {})
        team_name = (owner.get("metadata", {}) or {}).get("team_name") or owner.get("display_name", f"Roster {r['roster_id']}")
        s = r.get("settings", {}) or {}
        out_rosters.append({
            "roster_id": r["roster_id"],
            "owner_id": r.get("owner_id"),
            "owner_name": owner.get("display_name", ","),
            "team_name": team_name,
            "is_me": r.get("owner_id") == USER_ID,
            "opponent_roster_id": opponents.get(r["roster_id"]),
            "starters": r.get("starters") or [],
            "players":  r.get("players")  or [],
            "taxi":     r.get("taxi")     or [],
            "reserve":  r.get("reserve")  or [],
            "wins":   s.get("wins", 0),
            "losses": s.get("losses", 0),
            "ties":   s.get("ties", 0),
            "fpts":   s.get("fpts", 0) + (s.get("fpts_decimal", 0)/100.0),
            "fpts_against": s.get("fpts_against", 0) + (s.get("fpts_against_decimal", 0)/100.0),
            # FAAB spent to date. Sleeper reports what was USED, not what is left,
            # so the league budget has to come along too or the number is unreadable.
            # Dropped until 2026-09-17, which is why the waiver panel could show the
            # market but not your own money.
            "waiver_budget_used": s.get("waiver_budget_used", 0),
            "waiver_position": s.get("waiver_position"),
            # Preserve actual division membership; custom seeding is gated in forecasts.
            "division": s.get("division"),
        })

    # Merge in-progress draft picks into rosters. Sleeper only stamps the roster
    # `players` list when the draft completes; while it's still `drafting`,
    # picks live in /draft/:id/picks but the rosters look stale. Fold them in.
    # IMPORTANT: use a different variable name (draft_picks, not picks) to avoid
    # shadowing the traded_picks list that gets serialized below.
    in_progress = [d for d in drafts if d.get("status") == "drafting"]
    if in_progress:
        for d in in_progress:
            try:
                draft_picks = fetch_json(f"https://api.sleeper.app/v1/draft/{d['draft_id']}/picks")
                print(f"  in-progress draft {d['draft_id']}: {len(draft_picks)} picks merged")
                roster_by_id = {r["roster_id"]: r for r in out_rosters}
                for dp in draft_picks:
                    rid = dp.get("roster_id")
                    pid = dp.get("player_id")
                    if not rid or not pid: continue
                    target = roster_by_id.get(rid)
                    if not target: continue
                    if pid not in target["players"]:
                        target["players"].append(pid)
            except Exception as e:
                print(f"  draft fetch failed: {e}")

    settings = league.get("settings", {})
    league_out = {
        "id": lid,
        "name": league.get("name", name),
        "short_name": name,
        "buy_in": buy_in,
        "week": NFL_WEEK,
        "season": league.get("season"),
        "status": league.get("status"),
        "total_rosters": league.get("total_rosters"),
        "roster_positions": league.get("roster_positions", []),
        "scoring": league.get("scoring_settings", {}),
        "is_superflex": "SUPER_FLEX" in (league.get("roster_positions") or []),
        "is_idp": any(p.startswith("IDP") or p in ("LB","DB","DL") for p in (league.get("roster_positions") or [])),
        "type": settings.get("type"),
        # Sleeper settings.type: 2 = dynasty, 1 = keeper, 0 = redraft. The site
        # gates every pick / future-value / age-curve surface on this flag, so a
        # missing type reads as dynasty rather than silently stripping the UI.
        "is_dynasty": settings.get("type") != 0,
        "playoff_teams": settings.get("playoff_teams"),
        # The title simulator's bracket and the rest-of-season sum both end at the
        # title game: playoff_week_start plus one week per round.
        "playoff_week_start": settings.get("playoff_week_start"),
        # Forecast coverage gates read actual completed weeks and league rules.
        "last_scored_leg": settings.get("last_scored_leg"),
        "divisions": settings.get("divisions") or 0,
        "playoff_seed_type": settings.get("playoff_seed_type"),
        "playoff_round_type": settings.get("playoff_round_type"),
        "start_week": settings.get("start_week"),
        "league_average_match": settings.get("league_average_match"),
        "trade_deadline": settings.get("trade_deadline"),
        # Taxi/IR slot counts and the waiver rule gate two dynasty questions the
        # roster arrays alone cannot answer: what a young-asset stash actually
        # costs, and what a free-agent claim costs. waiver_type 2 means FAAB.
        "taxi_slots": settings.get("taxi_slots"),
        "reserve_slots": settings.get("reserve_slots"),
        "waiver_type": settings.get("waiver_type"),
        "waiver_budget": settings.get("waiver_budget"),
        "rosters": out_rosters,
        "users": [{"user_id": u["user_id"], "display_name": u.get("display_name"), "team_name": (u.get("metadata") or {}).get("team_name")} for u in users],
        "drafts": [{"draft_id": d["draft_id"], "type": d.get("type"), "status": d.get("status"), "season": d.get("season"), "start_time": d.get("start_time"), "draft_order": d.get("draft_order", {}), "settings": d.get("settings", {})} for d in drafts],
        "traded_picks": picks,
    }
    leagues_out.append(league_out)

for config in ESPN_LEAGUES:
    leagues_out.append(build_espn_league(config))

(SITE_DATA / "leagues.js").write_text(
    "window.LEAGUES = " + json.dumps(leagues_out, indent=2) + ";\n"
    + f'window.MY_USER_ID = "{USER_ID}";\n'
    + f'window.MY_USERNAME = "{USERNAME}";\n',
    encoding="utf-8"
)
(SITE_DATA / "players.js").write_text(
    "window.PLAYERS = " + json.dumps(slim_players, separators=(",",":")) + ";\n",
    encoding="utf-8"
)
print(f"wrote leagues.js ({(SITE_DATA / 'leagues.js').stat().st_size:,} bytes)")
print(f"wrote players.js ({(SITE_DATA / 'players.js').stat().st_size:,} bytes)")
