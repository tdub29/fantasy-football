"""Resolve fuzzy transcript names to verified player names.

Looks up against:
1. KTC top-500 player list (current dynasty-relevant)
2. Sleeper full player dictionary (9000+ players)

Returns the best match for a guess, optionally constrained by position.
"""
import json, re, difflib, pathlib

ROOT = pathlib.Path(__file__).parent.parent.parent
PLAYERS_PATH = ROOT / "players-nfl.json"

def norm(s):
    if not s: return ""
    s = s.lower()
    s = re.sub(r"[\.\']", "", s)
    s = re.sub(r"\s+jr\b|\s+sr\b|\s+iii\b|\s+ii\b|\s+iv\b", "", s)
    s = re.sub(r"[^a-z0-9 -]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

# Build candidate pool from Sleeper (active players only). Also augment with
# any extra rookies pulled from KTC that might not be in Sleeper yet.
def load_pool():
    with open(PLAYERS_PATH, encoding="utf-8") as f:
        sleeper = json.load(f)
    pool = []
    for pid, p in sleeper.items():
        pos = p.get("position")
        if pos not in ("QB","RB","WR","TE","K","DEF","FB","LB","DB","DL","CB","S","DT","DE","NT"):
            continue
        full = p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip()
        if not full: continue
        if p.get("status") in ("Inactive","Retired",None) and not p.get("team"):
            continue
        pool.append({
            "name": full,
            "pos": pos,
            "team": p.get("team") or "FA",
            "age": p.get("age"),
            "first": p.get("first_name") or "",
            "last": p.get("last_name") or "",
            "norm": norm(full),
            "norm_last": norm(p.get("last_name") or ""),
            "norm_first": norm(p.get("first_name") or ""),
            "id": pid,
            "src": "sleeper",
        })
    # Augment with 2026 rookies from KTC (handles cases where Sleeper hasn't synced yet)
    ktc_path = ROOT / "site" / "data" / "ktc.js"
    if ktc_path.exists():
        ktc_text = ktc_path.read_text(encoding="utf-8")
        m = re.search(r"window\.RANKINGS_SOURCES.*?\.push\(\s*(\{.*\})\s*\);", ktc_text, re.DOTALL)
        if m:
            try:
                ktc = json.loads(m.group(1))
                seen_norms = {p["norm"] for p in pool}
                for ranking in ktc.get("rankings", []):
                    for p in ranking.get("players", []):
                        n = norm(p["name"])
                        if n in seen_norms: continue
                        parts = p["name"].split()
                        first = parts[0] if parts else ""
                        last = parts[-1] if len(parts) >= 2 else ""
                        pool.append({
                            "name": p["name"],
                            "pos": p["pos"],
                            "team": p.get("team", "FA"),
                            "age": p.get("age"),
                            "first": first, "last": last,
                            "norm": n,
                            "norm_last": norm(last),
                            "norm_first": norm(first),
                            "id": None,
                            "src": "ktc",
                        })
                        seen_norms.add(n)
            except Exception as e:
                print("KTC augment failed:", e)
    return pool

def resolve(guess, pool, pos=None, team_hint=None):
    """Resolve a fuzzy name guess to a verified player.

    Strategy:
      1. Exact normalized match
      2. Last-name + position match (handles "Chigoziem Okonkwo" vs "Chig Okonkwo")
      3. Substring of last name (handles "Lemon" -> "MyKel Williams" etc)
      4. difflib best match on full name
    Returns: (best_name, score, debug_reason) or (None, 0, reason)
    """
    g = norm(guess)
    candidates = pool
    if pos:
        candidates = [c for c in pool if c["pos"] == pos]

    # 1. Exact normalized match
    for c in candidates:
        if c["norm"] == g:
            return (c["name"], 100, "exact")

    # 2. Last-name match within position
    last_g = g.split()[-1] if g else ""
    if last_g and len(last_g) >= 3:
        last_matches = [c for c in candidates if c["norm_last"] == last_g]
        if len(last_matches) == 1:
            return (last_matches[0]["name"], 95, f"last-name unique in pos")
        if len(last_matches) > 1 and team_hint:
            for c in last_matches:
                if c["team"] == team_hint:
                    return (c["name"], 90, f"last-name + team match")

    # 3. Substring of last name (handles transcript garble like "Lemon" -> partial)
    if last_g and len(last_g) >= 3:
        sub_matches = [c for c in candidates if last_g in c["norm_last"] or c["norm_last"] in last_g]
        if len(sub_matches) == 1:
            return (sub_matches[0]["name"], 85, "last-name substring")
        if team_hint:
            sub_matches = [c for c in sub_matches if c["team"] == team_hint]
            if len(sub_matches) == 1:
                return (sub_matches[0]["name"], 80, "last-name substring + team")

    # 4. difflib closest on full normalized name
    names = [c["norm"] for c in candidates]
    best = difflib.get_close_matches(g, names, n=1, cutoff=0.7)
    if best:
        idx = names.index(best[0])
        return (candidates[idx]["name"], int(difflib.SequenceMatcher(None, g, best[0]).ratio() * 100), "difflib")

    # 5. Try first-name + last-name swap (transcript sometimes flips them)
    parts = g.split()
    if len(parts) >= 2:
        flipped = parts[-1] + " " + " ".join(parts[:-1])
        best = difflib.get_close_matches(flipped, names, n=1, cutoff=0.7)
        if best:
            idx = names.index(best[0])
            return (candidates[idx]["name"], int(difflib.SequenceMatcher(None, flipped, best[0]).ratio() * 100), "difflib-flipped")

    return (None, 0, "no match")


if __name__ == "__main__":
    import sys
    pool = load_pool()
    print(f"Loaded pool: {len(pool)} players")
    # Test the previously uncertain names
    tests = [
        ("Mai Lemon", "WR", "PIT"),
        ("Casey Conpsion", "WR", None),
        ("Eli Sters", "TE", "PHI"),
        ("Tai Simpson", "WR", "LAR"),
        ("Max Claire", "TE", "LAR"),
        ("Kenyan Sadiq", "WR", "NYJ"),
        ("Carson Beck", "QB", "ARI"),
        ("Drew Aller", "QB", "PIT"),
        ("Jeremy Bernard", "WR", "PIT"),
        ("Nick Singleton", "RB", "WAS"),
        ("Kron Allen", "RB", "WAS"),
        ("Chigoziem Okonkwo", "TE", None),
        ("Chig Okonkwo", "TE", None),
        ("Jadarian Price", "RB", "SEA"),
        ("Omar Cooper Jr", "WR", "NYJ"),
        ("Denzel Boston", "WR", "CLE"),
        ("Jeremiah Love", "RB", "ARI"),
        ("Jeremiyah Love", "RB", "ARI"),
        ("Tre Harris", "WR", None),
        ("Tetairoa McMillan", "WR", "CAR"),
        ("Bhayshul Tuten", "RB", None),
        ("Kaleb Johnson", "RB", "PIT"),
        ("Kyle McCord", "QB", None),
        ("Tahj Brooks", "RB", None),
    ]
    for name, pos, team in tests:
        r = resolve(name, pool, pos, team)
        flag = "OK" if r[1] >= 85 else ("?" if r[1] >= 70 else "X")
        print(f"  [{flag}] {name:<25} {pos:<3} {team or '   ':<3} -> {(r[0] or '(NO MATCH)'):<30} ({r[1]:>3}, {r[2]})")
