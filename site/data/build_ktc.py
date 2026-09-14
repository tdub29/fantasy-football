"""Fetch KeepTradeCut dynasty rankings + Sleeper started% and emit ktc.js.

Produces a single source "KeepTradeCut" with two rankings inside:
- KTC Dynasty Superflex
- KTC Dynasty 1QB

Each player is mapped to the site's (category, tier) system using effective
rank: when KTC's startup ADP is better than its algorithmic rank AND Sleeper's
started% confirms the player is actually being started, ADP wins. Otherwise
the algorithmic rank holds. Players propped up by a few optimist drafters but
not actually started in real leagues stay at their honest tier.

Run:
    python site/data/build_ktc.py
"""
import json, pathlib, re, urllib.request, sys, datetime

URL = "https://keeptradecut.com/dynasty-rankings"
SITE_DATA = pathlib.Path(__file__).parent
OUT = SITE_DATA / "ktc.js"
ROOT = SITE_DATA.parent.parent

def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 DynastyDomain/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

# Build name -> Sleeper started% map. Used to gate ADP promotion: if a player
# is rarely started, his ADP is propped up by stragglers, not real consensus.
def load_sleeper_started_pct():
    players_path = ROOT / "players-nfl.json"
    if not players_path.exists():
        return {}
    try:
        research = fetch_json(f"https://api.sleeper.com/players/nfl/research/regular/2026")
    except Exception as e:
        print(f"Sleeper research fetch failed: {e}")
        return {}
    sleeper = json.loads(players_path.read_text(encoding="utf-8"))
    # Build a name -> started_pct lookup, last-name + position fallback.
    by_name = {}
    by_last_pos = {}
    for pid, info in research.items():
        sp = sleeper.get(pid)
        if not sp: continue
        full = (sp.get("full_name") or "").lower().strip()
        if not full: continue
        started = info.get("started")
        if started is None: continue
        by_name[full] = started
        last = (sp.get("last_name") or "").lower().strip()
        pos = sp.get("position")
        if last and pos:
            key = f"{last}|{pos}"
            # Prefer the higher-started entry on collisions (Brad Allen vs Josh Allen)
            if key not in by_last_pos or started > by_last_pos[key]:
                by_last_pos[key] = started
    return {"by_name": by_name, "by_last_pos": by_last_pos}

def started_pct_for(name, pos, lookup):
    if not lookup: return None
    full = name.lower().strip()
    if full in lookup["by_name"]: return lookup["by_name"][full]
    last = full.split()[-1] if full else ""
    return lookup["by_last_pos"].get(f"{last}|{pos}")

# Tier brackets driven by EFFECTIVE rank, where effective = the better (lower)
# of KTC's algorithmic overall rank vs the player's actual startup ADP. ADP
# reflects real market behavior across thousands of human startup drafts; KTC's
# value rank is an algorithm. When the two disagree (Travis Hunter: rank 125,
# ADP 58), the market consensus wins, so Hunter classifies as Foundational A
# instead of Foundational D.
#
# Brackets sized for the typical dynasty market shape:
#   Cornerstones scarce (top ~32),
#   Foundational the deepest tier (next ~50),
#   Upside Premier captures developing players (~50),
#   Mainstay/Vet/Short-term absorb the long tail.
def map_tier(ktc_tier, ktc_rank, ktc_adp=None, started_pct=None):
    # Use ADP as the dominant signal ONLY when started% confirms the player
    # is actually being started in real leagues. ADP propped up by a handful
    # of optimist drafters who never start the player (e.g., Cooper Kupp at
    # ADP 114 but started 4.8% of weeks) doesn't count as real market.
    r = ktc_rank
    adp_eligible = (ktc_adp and ktc_adp > 0 and ktc_adp < ktc_rank
                    and (started_pct is None or started_pct >= 30))
    if adp_eligible:
        r = max(int(ktc_adp), ktc_rank - 60)
    if r <=   7: return ("cornerstone",    "S")
    if r <=  14: return ("cornerstone",    "A")
    if r <=  22: return ("cornerstone",    "B")
    if r <=  32: return ("cornerstone",    "C")
    if r <=  50: return ("foundational",   "S")
    if r <=  68: return ("foundational",   "A")
    if r <=  86: return ("foundational",   "B")
    if r <= 104: return ("foundational",   "C")
    if r <= 125: return ("foundational",   "D")
    if r <= 150: return ("upside_premier", "S")
    if r <= 180: return ("upside_premier", "A")
    if r <= 215: return ("upside_premier", "B")
    if r <= 250: return ("mainstay",       "S")
    if r <= 285: return ("mainstay",       "A")
    if r <= 320: return ("mainstay",       "B")
    if r <= 360: return ("productive_vet", "S")
    if r <= 400: return ("productive_vet", "A")
    if r <= 440: return ("productive_vet", "B")
    return ("short_term", "S")


def fetch_html():
    req = urllib.request.Request(URL, headers={
        "User-Agent": "Mozilla/5.0 (compatible; DynastyDomain/1.0)"
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8")


def extract_players(html):
    # KTC moved the board out of an inline `playersArray = [...]` literal and into
    # a JSON <script id="ktc-players"> tag that the page parses on load.
    m = re.search(r"<script[^>]*id=[\"']ktc-players[\"'][^>]*>(.*?)</script>", html, re.DOTALL)
    if not m:
        sys.exit("ktc-players JSON script tag not found in KTC HTML")
    return json.loads(m.group(1))


def parse_pick_name(name):
    """Parse 'YYYY Early|Mid|Late Nst|nd|rd|th' into (season, round, slot)."""
    m = re.match(r"(\d{4})\s+(Early|Mid|Late)\s+(\d+)(?:st|nd|rd|th)", name)
    if not m: return None
    return (int(m.group(1)), int(m.group(3)), m.group(2).lower())


def build_picks(players, key, label):
    """Pull KTC's rookie-draft-pick valuations from playersArray entries with
    position 'RDP'. Returns a list of pick assets ready for roster-strength and
    trade-calculator use."""
    out = []
    for p in players:
        if p.get("position") != "RDP":
            continue
        v = p.get(key) or {}
        if not v or v.get("value") is None:
            continue
        parsed = parse_pick_name(p.get("playerName", ""))
        if not parsed:
            continue
        season, rnd, slot = parsed
        out.append({
            "name": p["playerName"],
            "pos": "PICK",
            "season": season,
            "round": rnd,
            "slot": slot,
            "ktcValue": v.get("value"),
            "ktcRank": v.get("rank") or v.get("pickRank"),
            "note": f"KTC {label} pick value {v.get('value')} (rank #{v.get('rank') or v.get('pickRank')}).",
        })
    # Sort by season, round, slot order (early > mid > late)
    slot_order = {"early": 0, "mid": 1, "late": 2}
    out.sort(key=lambda x: (x["season"], x["round"], slot_order.get(x["slot"], 9)))
    return out


def build_ranking(players, key, label, format_str, default_enabled, max_n=350, started_lookup=None):
    # Sort by rank ascending in the chosen key block
    rows = []
    for p in players:
        if p.get("position") == "RDP":
            continue  # picks handled separately by build_picks
        v = p.get(key) or {}
        if not v: continue
        rank = v.get("rank")
        tier = v.get("overallTier")
        if rank is None: continue
        rows.append((rank, p, v, tier))
    # Sort by EFFECTIVE rank (market-aware), gated on Sleeper started%.
    def effective_rank(row):
        rank = row[0]
        adp = (row[2] or {}).get("startupAdp")
        sp = started_pct_for(row[1]["playerName"], row[1].get("position"), started_lookup)
        if adp and adp > 0 and adp < rank and (sp is None or sp >= 30):
            return max(int(adp), rank - 60)
        return rank
    rows.sort(key=effective_rank)
    rows = rows[:max_n]
    out_players = []
    for rank, p, v, ktc_tier in rows:
        sp = started_pct_for(p["playerName"], p.get("position"), started_lookup)
        cat, t = map_tier(ktc_tier, rank, v.get("startupAdp"), sp)
        item = {
            "name": p["playerName"],
            "pos":  p["position"],
            "team": p.get("team") or "FA",
            "age":  int(p["age"]) if p.get("age") else None,
            "category": cat,
            "tier": t,
            "ktcValue": v.get("value"),
            "ktcAdp": v.get("startupAdp"),
            "ktcPosRank": v.get("positionalRank"),
            "note": (
                f"KTC {label} rank #{rank}, value {v.get('value')}, ADP {v.get('startupAdp')}."
                + (f" Started% {sp}." if sp is not None else "")
                + (
                    f" Tier driven by ADP (market runs ahead of KTC's algorithmic rank, started% confirms real consensus)."
                    if (v.get('startupAdp') and v.get('startupAdp') > 0
                        and v.get('startupAdp') < rank and (sp is None or sp >= 30))
                    else ""
                )
            ),
        }
        if p.get("rookie"): item["rookie"] = True
        out_players.append(item)
    return {
        "id": f"ktc-{key.replace('Values','').lower()}",
        "title": f"KeepTradeCut Dynasty {label}",
        "url": "https://keeptradecut.com/dynasty-rankings",
        "publishedAt": datetime.date.today().isoformat(),
        "format": format_str,
        "defaultEnabled": default_enabled,
        "players": out_players,
        "picks": build_picks(players, key, label),
    }


def main():
    print("Fetching", URL)
    html = fetch_html()
    players = extract_players(html)
    print(f"Got {len(players)} KTC players")
    print("Fetching Sleeper started% for tier-promotion gating")
    started_lookup = load_sleeper_started_pct()
    if started_lookup:
        print(f"  built started-pct lookup: {len(started_lookup.get('by_name', {}))} players")
    sf  = build_ranking(players, "superflexValues", "Superflex", "dynasty_sf",  default_enabled=False, started_lookup=started_lookup)
    one = build_ranking(players, "oneQBValues",     "1QB",       "dynasty_1qb", default_enabled=True, started_lookup=started_lookup)
    source = {
        "id": "keeptradecut",
        "name": "KeepTradeCut",
        "handle": "keeptradecut.com",
        "url": "https://keeptradecut.com/dynasty-rankings",
        "color": "#34d399",
        "description": "Crowd-sourced dynasty values from real trades. Public-perception baseline.",
        "rankings": [sf, one],
    }
    out = "// Generated by build_ktc.py from keeptradecut.com\n"
    out += "// Run again any time to refresh\n"
    out += "(window.RANKINGS_SOURCES = window.RANKINGS_SOURCES || []).push(\n"
    out += json.dumps(source, indent=2)
    out += "\n);\n"
    OUT.write_text(out, encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes), {len(sf['players'])} SF + {len(one['players'])} 1QB players")


if __name__ == "__main__":
    main()
