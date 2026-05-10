"""Fetch KeepTradeCut dynasty rankings (public perception) and emit ktc.js for the site.

Produces a single source "KeepTradeCut" with two rankings inside:
- KTC Dynasty Superflex
- KTC Dynasty 1QB

Each player is mapped to the site's (category, tier) system using KTC's `overallTier`
field, which clusters players naturally. Source list order = KTC overall rank, so the
site's aggregation picks up KTC's exact ordering.

Run:
    python site/data/build_ktc.py
"""
import json, pathlib, re, urllib.request, sys, datetime

URL = "https://keeptradecut.com/dynasty-rankings"
SITE_DATA = pathlib.Path(__file__).parent
OUT = SITE_DATA / "ktc.js"

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
def map_tier(ktc_tier, ktc_rank, ktc_adp=None):
    # Use ADP as the dominant signal whenever it's lower (better) than the
    # algorithmic rank. Cap the ADP advantage at no more than ~30 ranks of
    # promotion so genuine fallers don't get mis-categorized.
    r = ktc_rank
    if ktc_adp and ktc_adp > 0 and ktc_adp < ktc_rank:
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
    m = re.search(r"playersArray\s*=\s*(\[.*?\]);", html, re.DOTALL)
    if not m:
        sys.exit("playersArray not found in KTC HTML")
    return json.loads(m.group(1))


def build_ranking(players, key, label, format_str, default_enabled, max_n=350):
    # Sort by rank ascending in the chosen key block
    rows = []
    for p in players:
        v = p.get(key) or {}
        if not v: continue
        rank = v.get("rank")
        tier = v.get("overallTier")
        if rank is None: continue
        rows.append((rank, p, v, tier))
    # Sort by EFFECTIVE rank (market-aware), not just algorithmic rank. ADP
    # outranks KTC's algorithm when the market disagrees with the value model.
    def effective_rank(row):
        rank = row[0]
        adp = (row[2] or {}).get("startupAdp")
        if adp and adp > 0 and adp < rank:
            return max(int(adp), rank - 60)
        return rank
    rows.sort(key=effective_rank)
    rows = rows[:max_n]
    out_players = []
    for rank, p, v, ktc_tier in rows:
        cat, t = map_tier(ktc_tier, rank, v.get("startupAdp"))
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
                + (
                    f" Tier driven by ADP (market consensus runs ahead of KTC's algorithmic rank)."
                    if v.get('startupAdp') and v.get('startupAdp') > 0 and v.get('startupAdp') < rank
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
    }


def main():
    print("Fetching", URL)
    html = fetch_html()
    players = extract_players(html)
    print(f"Got {len(players)} KTC players")
    # Default: 1QB on (user has 2 1QB leagues). SF off so the user opts in to
    # avoid mixing formats and producing weird Josh-Allen averages across rankings.
    sf  = build_ranking(players, "superflexValues", "Superflex", "dynasty_sf",  default_enabled=False)
    one = build_ranking(players, "oneQBValues",     "1QB",       "dynasty_1qb", default_enabled=True)
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
