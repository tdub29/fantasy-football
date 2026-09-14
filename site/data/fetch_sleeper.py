"""Refresh raw Sleeper data: NFL player dump + each league's roster/user/draft/pick
files. Run build_site_data.py + build_idp.py + build_player_info.py after this to
regenerate the site data. Sleeper API is public, no auth."""
import json, pathlib, urllib.request, time

ROOT = pathlib.Path(__file__).parent.parent.parent  # Fantasy Football/
LEAGUES = [
    ("Password is taco", "1341184676601028608"),
    ("Phi Kap Fantasy",  "1389722402430136320"),
    ("The League",       "1314860638501076992"),
    ("yuH",              "1312276370583220224"),
]

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 DynastyDomain/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 2:
                raise
            print(f"  retry {url.rsplit('/',2)[-2:]}: {e}")
            time.sleep(2)

def write(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")
    return path.stat().st_size

# 1) full NFL player dump (~5MB, keyed by player_id)
print("Fetching NFL player dump...")
dump = fetch("https://api.sleeper.app/v1/players/nfl")
n = write(ROOT / "players-nfl.json", dump)
print(f"  players-nfl.json: {len(dump)} players, {n:,} bytes")

# 2) per-league files
EP = {  # filename -> API path suffix
    "league.json": "",
    "users.json": "/users",
    "rosters.json": "/rosters",
    "drafts.json": "/drafts",
    "traded_picks.json": "/traded_picks",
}
for name, lid in LEAGUES:
    folder = ROOT / "Leagues" / name
    folder.mkdir(parents=True, exist_ok=True)
    counts = {}
    for fname, suffix in EP.items():
        data = fetch(f"https://api.sleeper.app/v1/league/{lid}{suffix}")
        write(folder / fname, data)
        counts[fname] = len(data) if isinstance(data, list) else 1
    print(f"  {name}: rosters={counts['rosters.json']} users={counts['users.json']} "
          f"drafts={counts['drafts.json']} traded_picks={counts['traded_picks.json']}")
print("done. now run: build_site_data.py, build_idp.py, build_player_info.py")
