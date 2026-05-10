"""Build sleeper-idp.js: IDP rankings derived from Sleeper started% (an
ADP-equivalent for IDPs since KTC's value model is offense-only).

The site needs IDP rankings to grade yuH-style IDP leagues. KTC has none.
Sleeper's `/research/regular/{season}` endpoint returns owned% and started%
for every player including IDPs, so we use within-position started% as the
ADP signal: a player started in 80%+ of leagues is a consensus weekly starter.

Output: sleeper-idp.js as a single ranking under a new "Sleeper IDP" source.
"""
import json, pathlib, urllib.request, datetime

ROOT = pathlib.Path(__file__).parent.parent.parent
PLAYERS_PATH = ROOT / "players-nfl.json"
SITE_DATA = pathlib.Path(__file__).parent
OUT = SITE_DATA / "sleeper-idp.js"
SEASON = "2026"

IDP_POS = ("LB", "DB", "DL", "CB", "S", "DT", "DE", "NT")


def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 DynastyDomain/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def map_tier(started_pct, pos_rank):
    """Map started% + positional rank to (category, tier).

    Started% is the dominant signal because it directly measures fantasy
    relevance. Positional rank breaks ties.
    """
    s = started_pct or 0
    r = pos_rank
    # Cornerstone IDP: top 6 + heavily started
    if r <= 4 and s >= 85: return ("cornerstone", "S")
    if r <= 8 and s >= 75: return ("cornerstone", "A")
    if r <= 12 and s >= 60: return ("cornerstone", "B")
    if r <= 18 and s >= 45: return ("cornerstone", "C")
    # Foundational: weekly starter with some questions
    if r <= 24 and s >= 30: return ("foundational", "S")
    if r <= 32 and s >= 20: return ("foundational", "A")
    if r <= 40 and s >= 15: return ("foundational", "B")
    if r <= 50 and s >= 10: return ("foundational", "C")
    if s >= 5:              return ("foundational", "D")
    if s >= 2:              return ("upside_premier", "B")
    return ("mainstay", "S")


def main():
    print("Fetching Sleeper research for IDP started%")
    research = fetch_json(f"https://api.sleeper.com/players/nfl/research/regular/{SEASON}")
    players = json.loads(PLAYERS_PATH.read_text(encoding="utf-8"))

    # Collect IDP players with started% and per-position bucket
    by_pos = {}
    for pid, info in research.items():
        sp = players.get(pid)
        if not sp: continue
        pos = sp.get("position")
        if pos not in IDP_POS: continue
        if not sp.get("team"): continue  # skip free agents
        started = info.get("started")
        if started is None: started = 0
        owned = info.get("owned", 0)
        # Group sub-positions under primary IDP slots
        bucket = pos
        if pos in ("CB", "S"): bucket = "DB"
        if pos in ("DT", "DE", "NT"): bucket = "DL"
        by_pos.setdefault(bucket, []).append({
            "pid": pid,
            "name": sp.get("full_name") or f"{sp.get('first_name','')} {sp.get('last_name','')}".strip(),
            "pos": bucket,        # site uses LB / DB / DL
            "raw_pos": pos,
            "team": sp.get("team"),
            "age": sp.get("age"),
            "started": started,
            "owned": owned,
        })

    # Sort each bucket by started% desc, then owned% as tiebreaker
    out_players = []
    for bucket, arr in by_pos.items():
        arr.sort(key=lambda x: (-x["started"], -x.get("owned", 0)))
        for i, p in enumerate(arr[:60]):  # cap each IDP position at top 60
            cat, tier = map_tier(p["started"], i + 1)
            out_players.append({
                "name": p["name"],
                "pos": p["pos"],
                "team": p["team"] or "FA",
                "age": int(p["age"]) if p.get("age") else None,
                "category": cat,
                "tier": tier,
                "ktcValue": int(round(p["started"] * 80)),  # synth value scaled to comparable range
                "ktcAdp": None,
                "note": f"Sleeper: started {p['started']}%, owned {p['owned']}%. {p['raw_pos']}{i+1} by usage.",
            })

    # Sort flat list by tier value desc (so the source has a sane overall order)
    def tier_value(p):
        cat = p["category"]; t = p["tier"]
        weights = {
            ("cornerstone","S"): 100, ("cornerstone","A"): 85,
            ("cornerstone","B"): 72,  ("cornerstone","C"): 60,
            ("foundational","S"): 55, ("foundational","A"): 50,
            ("foundational","B"): 44, ("foundational","C"): 38,
            ("foundational","D"): 33,
            ("upside_premier","S"): 28, ("upside_premier","A"): 22,
            ("upside_premier","B"): 17,
            ("mainstay","S"): 18, ("mainstay","A"): 14, ("mainstay","B"): 10,
        }
        return weights.get((cat,t), 5)
    out_players.sort(key=lambda p: (-tier_value(p), -p["ktcValue"]))

    source = {
        "id": "sleeper-idp",
        "name": "Sleeper IDP",
        "handle": "sleeper.com/research",
        "url": "https://sleeper.com",
        "color": "#60a5fa",
        "description": "IDP rankings synthesized from real Sleeper league usage (started%). KTC is offense-only, so this is the ADP-equivalent for LB/DB/DL.",
        "rankings": [{
            "id": "sleeper-idp-2026",
            "title": f"Sleeper IDP Usage Rankings ({SEASON})",
            "url": "https://sleeper.com/research",
            "publishedAt": datetime.date.today().isoformat(),
            "format": "idp",
            "defaultEnabled": True,
            "players": out_players,
        }],
    }
    out = "// Generated by build_idp.py from Sleeper research data\n"
    out += "// Run again any time to refresh\n"
    out += "(window.RANKINGS_SOURCES = window.RANKINGS_SOURCES || []).push(\n"
    out += json.dumps(source, indent=2)
    out += "\n);\n"
    OUT.write_text(out, encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes), {len(out_players)} IDP players")


if __name__ == "__main__":
    main()
