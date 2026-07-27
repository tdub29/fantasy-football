"""Fetch Sleeper's own season-long IDP projections (2026) and score them under yuH
rules. Sleeper ships per-company stat lines with the exact idp_* keys yuH uses,
so we apply the yuH scoring map directly. Saves + compares to the Clay source."""
import json, urllib.request, pathlib

ROOT = pathlib.Path(__file__).parent.parent
HERE = pathlib.Path(__file__).parent
OUT = HERE / "sleeper-2026-idp-projections.json"
CLAY = HERE / "clay-2026-idp-projections.json"

# yuH IDP scoring map (idp_tkl combined = 0.0, excluded). Yardage keys need
# projected yards Sleeper doesn't give at season level, so weight-only counts.
YUH_IDP = {
    "idp_tkl_solo": 1.0, "idp_tkl_ast": 0.5, "idp_sack": 3.0, "idp_tkl_loss": 1.0,
    "idp_int": 5.0, "idp_ff": 3.0, "idp_fum_rec": 3.0, "idp_pass_def": 3.0,
    "idp_qb_hit": 1.0, "idp_def_td": 6.0, "idp_safe": 3.0, "idp_blk_kick": 3.0,
}
COMPANY_PRIORITY = ["rotowire", "sportradar", "statmuse", "pff"]

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)

def yuh(stats):
    return round(sum(stats.get(k, 0) * w for k, w in YUH_IDP.items()), 1)

def main():
    rows = []
    for pos in ("LB", "DB", "DL"):
        rows += fetch(f"https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]={pos}")
    # keep season rows (week None) that actually project tackles; dedupe by player,
    # preferring the company that best populates IDP.
    best = {}
    for x in rows:
        if x.get("week") is not None:
            continue
        st = x.get("stats") or {}
        if "idp_tkl_solo" not in st and "idp_tkl" not in st:
            continue
        pid = x.get("player_id")
        p = x.get("player") or {}
        rank = COMPANY_PRIORITY.index(x["company"]) if x.get("company") in COMPANY_PRIORITY else 99
        cur = best.get(pid)
        if cur is None or rank < cur["_rank"]:
            best[pid] = {
                "sleeper_id": pid,
                "name": f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
                "team": x.get("team"), "pos": (p.get("position") or ""),
                "company": x.get("company"), "gp": st.get("gp"),
                "solos": st.get("idp_tkl_solo"), "assists": st.get("idp_tkl_ast"),
                "tot_tkl": st.get("idp_tkl"), "sack": st.get("idp_sack"),
                "tfl": st.get("idp_tkl_loss"), "int": st.get("idp_int"),
                "ff": st.get("idp_ff"), "fum_rec": st.get("idp_fum_rec"),
                "pass_def": st.get("idp_pass_def"), "qb_hit": st.get("idp_qb_hit"),
                "sleeper_pts_ppr": st.get("pts_ppr"),
                "yuh_pts": yuh(st), "_rank": rank,
            }
    players = sorted(best.values(), key=lambda x: -x["yuh_pts"])
    for x in players:
        x.pop("_rank", None)
    OUT.write_text(json.dumps({
        "source": "Sleeper season projections 2026 (rotowire-preferred)",
        "scoring": "yuH IDP scoring map applied to projected idp_* stats",
        "count": len(players), "players": players,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Sleeper IDP: {len(players)} players scored -> {OUT.name}")
    print("\nTop 20 by yuH projected points (Sleeper source):")
    for i, s in enumerate(players[:20], 1):
        print(f"{i:2d}. {s['name']:22s} {s['team'] or '?':3s} {s['pos']:3s} {s['yuh_pts']:6.1f}  "
              f"(solo {s['solos']}, ast {s['assists']}, sk {s['sack']}, int {s['int']}, ff {s['ff']}, fr {s['fum_rec']})")

    # compare vs Clay for overlapping players
    if CLAY.exists():
        clay = {c["sleeper_id"]: c for c in json.loads(CLAY.read_text(encoding="utf-8"))["players"] if c.get("sleeper_id")}
        both = [(s, clay[s["sleeper_id"]]) for s in players if s["sleeper_id"] in clay]
        print(f"\nOverlap with Clay: {len(both)} players. Biggest source disagreements (|Δ yuH pts|):")
        both.sort(key=lambda t: -abs(t[0]["yuh_pts"] - t[1]["yuh_pts"]))
        for s, c in both[:12]:
            print(f"  {s['name']:22s} Sleeper {s['yuh_pts']:6.1f}  vs  Clay {c['yuh_pts']:6.1f}  (Δ {s['yuh_pts']-c['yuh_pts']:+.1f})")

if __name__ == "__main__":
    main()
