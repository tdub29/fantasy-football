"""Build site/data/leagues.js + players.js + sleeper-market.js from cached + live API."""
import json, pathlib, re, urllib.request, sys

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

LEAGUES = [
    ("Password is taco", "1341184676601028608"),
    ("The League",       "1314860638501076992"),
    ("yuH",              "1312276370583220224"),
]

with open(ROOT / "players-nfl.json", "r", encoding="utf-8") as f:
    PLAYERS = json.load(f)

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
        "college": p.get("college"),
        "depth": p.get("depth_chart_order"),
        "owned":   r.get("owned"),
        "started": r.get("started"),
    }

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
for name, lid in LEAGUES:
    folder = LEAGUES_DIR / name
    league   = json.loads((folder / "league.json").read_text())
    users    = json.loads((folder / "users.json").read_text())
    rosters  = json.loads((folder / "rosters.json").read_text())
    drafts   = json.loads((folder / "drafts.json").read_text())
    picks    = json.loads((folder / "traded_picks.json").read_text())

    user_by_id = {u["user_id"]: u for u in users}

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
            "starters": r.get("starters") or [],
            "players":  r.get("players")  or [],
            "taxi":     r.get("taxi")     or [],
            "reserve":  r.get("reserve")  or [],
            "wins":   s.get("wins", 0),
            "losses": s.get("losses", 0),
            "ties":   s.get("ties", 0),
            "fpts":   s.get("fpts", 0) + (s.get("fpts_decimal", 0)/100.0),
            "fpts_against": s.get("fpts_against", 0) + (s.get("fpts_against_decimal", 0)/100.0),
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
        "season": league.get("season"),
        "status": league.get("status"),
        "total_rosters": league.get("total_rosters"),
        "roster_positions": league.get("roster_positions", []),
        "scoring": league.get("scoring_settings", {}),
        "is_superflex": "SUPER_FLEX" in (league.get("roster_positions") or []),
        "is_idp": any(p.startswith("IDP") or p in ("LB","DB","DL","DEF") for p in (league.get("roster_positions") or [])),
        "type": settings.get("type"),
        "playoff_teams": settings.get("playoff_teams"),
        "trade_deadline": settings.get("trade_deadline"),
        "rosters": out_rosters,
        "users": [{"user_id": u["user_id"], "display_name": u.get("display_name"), "team_name": (u.get("metadata") or {}).get("team_name")} for u in users],
        "drafts": [{"draft_id": d["draft_id"], "type": d.get("type"), "status": d.get("status"), "season": d.get("season"), "start_time": d.get("start_time"), "draft_order": d.get("draft_order", {}), "settings": d.get("settings", {})} for d in drafts],
        "traded_picks": picks,
    }
    leagues_out.append(league_out)

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
