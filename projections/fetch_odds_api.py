"""Pull actual NFL game lines (spreads + totals) from The Odds API and write them for
build_sos.py to use as real per-game Vegas over the projected weeks.

WHERE TO ENTER YOUR KEY (any one of these; checked in this order):
  1. paste it into a file:  projections/odds-api.key   (one line, just the key)
     -> this filename matches *.key in .gitignore, so it is NEVER committed.
  2. environment variable:   ODDS_API_KEY=xxximport... (set in your shell)
  3. command line:           python fetch_odds_api.py --key xxximport...

Get a free key at https://the-odds-api.com (free tier ~500 req/mo). Output:
odds-api-lines.json keyed by "AWAY@HOME" with median total + home spread + implied pts.
Then re-run build_sos.py; posted Odds-API games override the projected weeks.
"""
import json, os, sys, argparse, urllib.request, urllib.error, statistics, pathlib

# Corporate TLS inspection re-signs certs with a root that Windows trusts but Python's
# bundled CA set does not, so urlopen dies with CERTIFICATE_VERIFY_FAILED. truststore
# points ssl at the OS store instead. Verification stays ON either way -- if truststore
# is missing (pip install truststore) we fall back to the bundled CAs, never to no check.
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

HERE = pathlib.Path(__file__).parent
KEYFILE = HERE / "odds-api.key"
NAME_TO_ABBR = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}

def get_key(cli):
    if cli: return cli.strip()
    if os.environ.get("ODDS_API_KEY"): return os.environ["ODDS_API_KEY"].strip()
    if KEYFILE.exists():
        k = KEYFILE.read_text(encoding="utf-8").strip()
        if k: return k
    print(__doc__)
    print(f"\nNo key found. Easiest: create {KEYFILE} containing just your key, then re-run.")
    sys.exit(2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key")
    args = ap.parse_args()
    key = get_key(args.key)
    url = ("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds"
           f"?apiKey={key}&regions=us&markets=spreads,totals&oddsFormat=american")
    try:
        with urllib.request.urlopen(url, timeout=45) as r:
            events = json.load(r)
            print(f"requests remaining this month: {r.headers.get('x-requests-remaining')}")
    except urllib.error.HTTPError as e:
        print(f"Odds API HTTP {e.code}: {e.read().decode()[:200]}"); sys.exit(1)
    except urllib.error.URLError as e:
        hint = " (TLS chain rejected: pip install truststore)" if "CERTIFICATE_VERIFY" in str(e.reason) else ""
        print(f"Odds API unreachable: {e.reason}{hint}"); sys.exit(1)

    lines = {}
    for ev in events:
        home = NAME_TO_ABBR.get(ev.get("home_team")); away = NAME_TO_ABBR.get(ev.get("away_team"))
        if not home or not away: continue
        totals, home_spreads = [], []
        for bk in ev.get("bookmakers", []):
            for mk in bk.get("markets", []):
                if mk["key"] == "totals":
                    pts = [o["point"] for o in mk["outcomes"] if o.get("point") is not None]
                    if pts: totals.append(pts[0])
                elif mk["key"] == "spreads":
                    for o in mk["outcomes"]:
                        if NAME_TO_ABBR.get(o.get("name")) == home and o.get("point") is not None:
                            home_spreads.append(o["point"])
        if not totals or not home_spreads: continue
        total = round(statistics.median(totals), 1)
        home_line = round(statistics.median(home_spreads), 1)   # negative = home favored
        lines[f"{away}@{home}"] = {
            "home": home, "away": away, "total": total, "home_line": home_line,
            "implied_home": round(total / 2 - home_line / 2, 2),
            "implied_away": round(total / 2 + home_line / 2, 2),
            "commence": ev.get("commence_time"),
        }
    (HERE / "odds-api-lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote odds-api-lines.json: {len(lines)} games with posted spreads+totals")
    for k in list(lines)[:6]:
        g = lines[k]; print(f"  {k}: total {g['total']} home_line {g['home_line']} -> {g['implied_home']} / {g['implied_away']}")
    if not lines:
        print("(0 games — The Odds API only returns games with OPEN markets; more appear closer to kickoff.)")

if __name__ == "__main__":
    main()
