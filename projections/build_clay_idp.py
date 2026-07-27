"""Extract Clay 2026 defensive (IDP) projections from the DK PDF (pages 46-55) and
score them under yuH league rules. Saves raw stats + yuH projected points.

PDF table cols: Defender Team Rk [ClayPt] Snaps TotTkl Solos Assists TFL Sack INT FF
Position group is by page section (no Pos column populated):
  p46-47 IDL, p48-49 EDGE, p50-51 LB, p52-53 CB, p54-55 S.
Not in the PDF (so NOT scored, understates DBs slightly): pass-defended (yuH 3.0),
QB hit (1.0), fumble rec (3.0), def TD (6.0), return yards.
"""
import json, re, pathlib, unicodedata
from pypdf import PdfReader

PDF = r"C:\Users\TrevorWhite\Downloads\NFLDK2026_CS_ClayProjections2026.pdf"
ROOT = pathlib.Path(__file__).parent.parent
OUT = pathlib.Path(__file__).parent / "clay-2026-idp-projections.json"

# 1-based page -> position group
PAGE_POS = {46: "IDL", 47: "IDL", 48: "EDGE", 49: "EDGE",
            50: "LB", 51: "LB", 52: "CB", 53: "CB", 54: "S", 55: "S"}

# yuH IDP scoring (only the components the PDF actually projects)
def yuh_points(s):
    return round(
        1.0 * s["solos"] + 0.5 * s["assists"] + 3.0 * s["sack"]
        + 1.0 * s["tfl"] + 5.0 * s["int"] + 3.0 * s["ff"], 1)

# line: name... TEAM Rk ClayPt Snaps Tot Solos Assists TFL Sack INT FF
ROW = re.compile(
    r"^(?P<name>.+?)\s+(?P<team>[A-Z]{2,3})\s+(?P<rk>\d+)\s+(?P<clay>\d+)\s+(?P<snaps>\d+)\s+"
    r"(?P<tot>\d+)\s+(?P<solos>\d+)\s+(?P<assists>\d+)\s+(?P<tfl>\d+)\s+"
    r"(?P<sack>[\d.]+)\s+(?P<int>[\d.]+)\s+(?P<ff>[\d.]+)\s*$")

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

def main():
    reader = PdfReader(PDF)
    players = []
    for page1, pos in PAGE_POS.items():
        for line in (reader.pages[page1 - 1].extract_text() or "").splitlines():
            m = ROW.match(line.strip())
            if not m:
                continue
            g = m.groupdict()
            s = {
                "name": g["name"].strip(), "team": g["team"], "pos": pos,
                "clay_rk": int(g["rk"]), "clay_pt": int(g["clay"]), "snaps": int(g["snaps"]),
                "tot_tkl": int(g["tot"]), "solos": int(g["solos"]), "assists": int(g["assists"]),
                "tfl": int(g["tfl"]), "sack": float(g["sack"]), "int": float(g["int"]), "ff": float(g["ff"]),
            }
            s["yuh_pts"] = yuh_points(s)
            players.append(s)

    # match to Sleeper ids (for yuH roster cross-ref + site use)
    raw = json.loads((ROOT / "players-nfl.json").read_text(encoding="utf-8"))
    IDP_POS = {"DL", "DE", "DT", "NT", "LB", "DB", "CB", "S", "EDGE"}
    by_name = {}
    for pid, p in raw.items():
        if (p.get("position") in IDP_POS) or (p.get("fantasy_positions") and set(p["fantasy_positions"]) & IDP_POS):
            nm = norm(p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}")
            if nm:
                by_name.setdefault(nm, []).append(pid)
    matched = 0
    for s in players:
        ids = by_name.get(norm(s["name"]))
        s["sleeper_id"] = ids[0] if ids else None
        if ids:
            matched += 1

    players.sort(key=lambda x: -x["yuh_pts"])
    OUT.write_text(json.dumps({
        "source": "Clay Projections 2026 (DK), pages 46-55",
        "scoring": "yuH IDP (solo 1, ast .5, sack 3, TFL 1, INT 5, FF 3; PD/QBhit/FR/defTD not in source)",
        "count": len(players), "players": players,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"extracted {len(players)} defenders, matched {matched} to Sleeper ids -> {OUT.name}")
    by_pos = {}
    for s in players:
        by_pos.setdefault(s["pos"], 0)
        by_pos[s["pos"]] += 1
    print("by position:", by_pos)
    print("\nTop 20 IDP by yuH projected points:")
    for i, s in enumerate(players[:20], 1):
        print(f"{i:2d}. {s['name']:22s} {s['team']:3s} {s['pos']:4s} {s['yuh_pts']:6.1f}  "
              f"(solo {s['solos']}, ast {s['assists']}, sk {s['sack']}, tfl {s['tfl']}, int {s['int']}, ff {s['ff']})")

if __name__ == "__main__":
    main()
