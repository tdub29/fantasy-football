"""Build per-league folders with roster, league, users, traded picks, drafts."""
import json, os, urllib.request, pathlib

BASE = pathlib.Path(__file__).parent
ROOT = BASE.parent
USER_ID = "726629031964975104"
USERNAME = "tdub1329"

LEAGUES = [
    ("Password is taco", "1341184676601028608"),
    ("The League",       "1314860638501076992"),
    ("yuH",              "1312276370583220224"),
]

def fetch(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)

with open(ROOT / "players-nfl.json", "r", encoding="utf-8") as f:
    PLAYERS = json.load(f)

def player_label(pid):
    p = PLAYERS.get(str(pid))
    if not p:
        return f"[{pid}]"
    name = p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip()
    pos = p.get("position","?")
    team = p.get("team") or "FA"
    age = p.get("age")
    age_str = f", age {age}" if age else ""
    return f"{name} ({pos}, {team}{age_str})"

for name, lid in LEAGUES:
    folder = BASE / name
    folder.mkdir(parents=True, exist_ok=True)
    league   = fetch(f"https://api.sleeper.app/v1/league/{lid}")
    users    = fetch(f"https://api.sleeper.app/v1/league/{lid}/users")
    rosters  = fetch(f"https://api.sleeper.app/v1/league/{lid}/rosters")
    drafts   = fetch(f"https://api.sleeper.app/v1/league/{lid}/drafts")
    picks    = fetch(f"https://api.sleeper.app/v1/league/{lid}/traded_picks")

    (folder / "league.json").write_text(json.dumps(league, indent=2))
    (folder / "users.json").write_text(json.dumps(users, indent=2))
    (folder / "rosters.json").write_text(json.dumps(rosters, indent=2))
    (folder / "drafts.json").write_text(json.dumps(drafts, indent=2))
    (folder / "traded_picks.json").write_text(json.dumps(picks, indent=2))

    user_by_id = {u["user_id"]: u for u in users}
    my_roster = next((r for r in rosters if r.get("owner_id") == USER_ID), None)

    md = []
    md.append(f"# {league['name']} — 2026")
    md.append("")
    if "SUPER_FLEX" in league.get("roster_positions", []):
        md.append("> **⚠️ SUPERFLEX LEAGUE** — a second QB can start in the SUPER_FLEX slot. QBs are dramatically more valuable here than in 1QB leagues; treat top-12 QBs as cornerstone-tier assets and adjust trade/draft valuations accordingly.")
        md.append("")
    md.append(f"- League ID: `{lid}`")
    md.append(f"- Status: {league.get('status')}")
    md.append(f"- Season: {league.get('season')} ({league.get('season_type')})")
    md.append(f"- Teams: {league.get('total_rosters')}")
    md.append(f"- Sport: {league.get('sport')}")
    settings = league.get("settings", {})
    md.append(f"- Type: {settings.get('type')} (0=redraft, 1=keeper, 2=dynasty)")
    md.append(f"- Best ball: {settings.get('best_ball')}")
    md.append(f"- Playoff teams: {settings.get('playoff_teams')}")
    md.append(f"- Trade deadline week: {settings.get('trade_deadline')}")
    md.append(f"- Waiver type: {settings.get('waiver_type')}")
    md.append(f"- Roster positions: {', '.join(league.get('roster_positions', []))}")
    sp = league.get("scoring_settings", {})
    md.append(f"- PPR: rec={sp.get('rec','?')} | bonus_rec_te={sp.get('bonus_rec_te','?')}")
    md.append("")
    md.append("## Teams")
    md.append("")
    md.append("| # | Owner | Team Name |")
    md.append("|---|---|---|")
    for r in sorted(rosters, key=lambda x: x.get("roster_id", 0)):
        owner = user_by_id.get(r.get("owner_id") or "", {})
        team = (owner.get("metadata", {}) or {}).get("team_name") or owner.get("display_name", "—")
        you = "  ⭐" if r.get("owner_id") == USER_ID else ""
        md.append(f"| {r['roster_id']} | {owner.get('display_name','—')}{you} | {team} |")
    md.append("")

    if my_roster:
        md.append("## My Roster (tdub1329)")
        md.append("")
        rid = my_roster["roster_id"]
        md.append(f"- Roster ID: {rid}")
        s = my_roster.get("settings", {})
        md.append(f"- Record: {s.get('wins',0)}-{s.get('losses',0)}-{s.get('ties',0)}  | PF: {s.get('fpts',0)}.{s.get('fpts_decimal',0)}  | PA: {s.get('fpts_against',0)}")
        md.append("")
        md.append("### Players")
        md.append("")
        starters = my_roster.get("starters") or []
        all_players = my_roster.get("players") or []
        bench = [p for p in all_players if p not in starters]
        taxi = my_roster.get("taxi") or []
        ir   = my_roster.get("reserve") or []

        def section(title, ids):
            if not ids: return
            md.append(f"**{title}** ({len(ids)})")
            md.append("")
            for pid in ids:
                md.append(f"- {player_label(pid)}")
            md.append("")

        section("Starters", starters)
        section("Bench",    [p for p in bench if p not in taxi and p not in ir])
        section("Taxi",     taxi)
        section("IR",       ir)

        # Draft picks owned (futures)
        # traded_picks lists ALL traded picks across the league. A pick belongs to roster X
        # if owner_id == X AND roster_id (original owner) is anyone. To know what *I* own:
        # start from "I originally own all my own picks for season, round" and apply trades.
        # Simpler: list picks where owner_id == my roster_id and previous_owner_id != my roster_id (acquired)
        # plus my original picks where owner_id is still me OR not listed (default mine).
        traded_to_me   = [p for p in picks if p.get("owner_id") == rid and p.get("roster_id") != rid]
        traded_from_me = [p for p in picks if p.get("previous_owner_id") == rid and p.get("owner_id") != rid]
        md.append("### Future Draft Picks")
        md.append("")
        if traded_to_me:
            md.append("**Acquired:**")
            for p in traded_to_me:
                from_owner = user_by_id.get(next((u['user_id'] for u in users if any(rr['roster_id']==p['roster_id'] and rr['owner_id']==u['user_id'] for rr in rosters)), ''), {})
                md.append(f"- {p['season']} R{p['round']} (originally roster {p['roster_id']})")
            md.append("")
        if traded_from_me:
            md.append("**Traded away:**")
            for p in traded_from_me:
                md.append(f"- {p['season']} R{p['round']} (now owned by roster {p['owner_id']})")
            md.append("")
        if not traded_to_me and not traded_from_me:
            md.append("_No traded picks involving this roster — you own your default slate._")
            md.append("")

    (folder / "README.md").write_text("\n".join(md), encoding="utf-8")
    print(f"OK: {name}")
print("done")
