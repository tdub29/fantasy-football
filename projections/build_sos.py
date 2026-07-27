"""Game-by-game Vegas strength-of-schedule (the way Fantasy Environment Score is
derived). For each 2026 game we take the actual Vegas spread + total and split into
implied points per team: implied_home=(total+spread)/2, implied_away=(total-spread)/2
(nflverse spread_line: + = home favored). Lines exist only for weeks already posted;
for unposted weeks we fall back to each opponent's full-season implied PF/PA (from the
environment article) so every team has a complete-season SOS now, sharpening weekly as
real lines drop. Grain: one row per team-game; rolled up to team-season PF/PA + SOS.

Emits site/data/sos.js (window.TEAM_SOS)."""
import json, pathlib, urllib.request, csv, io

HERE = pathlib.Path(__file__).parent
SITE = HERE.parent / "site" / "data"
GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
NFLVERSE_TO_ENV = {"LA": "LAR"}  # nflverse Rams code -> our env/Sleeper abbrev

def env_map():
    d = json.loads((HERE / "team-environment.json").read_text(encoding="utf-8"))
    return d["teams"]

def fetch_games():
    req = urllib.request.Request(GAMES_URL, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")
    return [r for r in csv.DictReader(io.StringIO(data)) if r.get("season") == "2026"]

def num(v):
    v = (v or "").strip()
    try: return float(v)
    except: return None

def main():
    env = env_map()
    ab = lambda t: NFLVERSE_TO_ENV.get(t, t)
    # league-average implied points allowed, for matchup-adjusting unposted games
    avg_pa = sum(e["implied_pa"] for e in env.values()) / len(env)
    # Vegas-derived implied points for a matchup when no retail line is posted yet:
    # offense's season baseline shifted by how much this defense allows vs average.
    def matchup(off, deff):
        o, d = env.get(off), env.get(deff)
        if not o or not d: return None
        return round(o["implied_pf"] + (d["implied_pa"] - avg_pa), 2)
    games = fetch_games()
    # optional: actual lines from The Odds API (fetch_odds_api.py) override everything
    odds_path = HERE / "odds-api-lines.json"
    odds = json.loads(odds_path.read_text(encoding="utf-8")) if odds_path.exists() else {}
    # per-team schedule of {week, opp, home, posted, implied_pf, implied_pa}
    sched = {t: [] for t in env}
    posted_weeks = set()
    for g in games:
        home, away = ab(g["home_team"]), ab(g["away_team"])
        wk = int(g["week"]); spread = num(g.get("spread_line")); total = num(g.get("total_line"))
        ok = odds.get(f"{away}@{home}")
        if ok:                                   # 1) real Odds-API line (any week)
            imp_home, imp_away, posted = ok["implied_home"], ok["implied_away"], True
        elif spread is not None and total is not None:  # 2) nflverse posted line
            imp_home, imp_away, posted = (total + spread) / 2, (total - spread) / 2, True
        else:                                    # 3) matchup-adjusted projection
            imp_home, imp_away, posted = matchup(home, away), matchup(away, home), False
        if posted: posted_weeks.add(wk)
        if home in sched:
            sched[home].append({"week": wk, "opp": away, "home": True, "posted": posted,
                                "implied_pf": round(imp_home, 2) if imp_home else None,
                                "implied_pa": round(imp_away, 2) if imp_away else None})
        if away in sched:
            sched[away].append({"week": wk, "opp": home, "home": False, "posted": posted,
                                "implied_pf": round(imp_away, 2) if imp_away else None,
                                "implied_pa": round(imp_home, 2) if imp_home else None})

    # SOS = based on OPPONENTS faced (schedule difficulty), independent of own line:
    #   off_sos  = avg opponent implied points ALLOWED (opp defense) -> higher = easier offense
    #   def_sos  = avg opponent implied points SCORED  (opp offense) -> higher = harder defense
    teams = {}
    for t, gl in sched.items():
        gl.sort(key=lambda x: x["week"])
        opp_pa = [env[o["opp"]]["implied_pa"] for o in gl if o["opp"] in env]
        opp_pf = [env[o["opp"]]["implied_pf"] for o in gl if o["opp"] in env]
        # actual-line implied PF/PA for this team over posted games only
        act_pf = [o["implied_pf"] for o in gl if o["posted"] and o["implied_pf"] is not None]
        act_pa = [o["implied_pa"] for o in gl if o["posted"] and o["implied_pa"] is not None]
        teams[t] = {
            "team": env[t]["team"], "abbr": t, "games": len(gl),
            "off_sos": round(sum(opp_pa) / len(opp_pa), 2) if opp_pa else None,
            "def_sos": round(sum(opp_pf) / len(opp_pf), 2) if opp_pf else None,
            "actual_pf": round(sum(act_pf) / len(act_pf), 2) if act_pf else None,
            "actual_pa": round(sum(act_pa) / len(act_pa), 2) if act_pa else None,
            "posted_games": len(act_pf),
            "schedule": gl,
        }
    # ranks: off_sos desc = easiest offensive schedule = rank 1
    def rank(key, desc=True):
        order = sorted([t for t in teams if teams[t][key] is not None],
                       key=lambda t: teams[t][key], reverse=desc)
        for i, t in enumerate(order): teams[t][key + "_rank"] = i + 1
    rank("off_sos", desc=True)   # rank 1 = softest defenses faced
    rank("def_sos", desc=False)  # rank 1 = weakest offenses faced (easiest for defense/IDP)

    payload = {
        "source": "nflverse game lines (actual Vegas spread+total) + environment fallback for unposted weeks",
        "definition": "off_sos = avg opponent implied points allowed (higher=easier to score). def_sos = avg opponent implied points scored (lower=easier for your defense/IDP).",
        "lines_through_week": max(posted_weeks) if posted_weeks else 0,
        "posted_weeks": sorted(posted_weeks),
        "teams": teams,
    }
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "sos.js").write_text("window.TEAM_SOS = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    (HERE / "sos.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote sos.js: {len(teams)} teams, actual Vegas lines through week {payload['lines_through_week']} ({len(payload['posted_weeks'])} weeks posted)")
    easi = sorted([t for t in teams if teams[t]['off_sos']], key=lambda t: -teams[t]['off_sos'])[:5]
    hard = sorted([t for t in teams if teams[t]['off_sos']], key=lambda t: teams[t]['off_sos'])[:5]
    print("easiest offensive SOS:", [(teams[t]['team'], teams[t]['off_sos']) for t in easi])
    print("hardest offensive SOS:", [(teams[t]['team'], teams[t]['off_sos']) for t in hard])

if __name__ == "__main__":
    main()
