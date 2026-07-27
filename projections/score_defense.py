"""Score IDP projections per SOURCE (Clay / Sleeper) independently, each completed
with the same best-estimate fills (PD, QB-hit, return yds; TFL for Sleeper, fum-rec
for Clay), so all three (clay/sleeper/blend) are directly comparable. yuH IDP scoring.
Then emit the combined site file site/data/projections.js (offense + defense)."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
SITE = HERE.parent / "site" / "data"

YUH = {"solo": 1.0, "ast": 0.5, "sack": 3.0, "tfl": 1.0, "int": 5.0, "ff": 3.0,
       "fum_rec": 3.0, "pass_def": 3.0, "qb_hit": 1.0,
       "sack_yd": 0.1, "int_ret_yd": 0.1, "fum_ret_yd": 0.1}
PD_BASE = {"CB": 12, "S": 7, "DB": 9, "LB": 4.5, "EDGE": 2, "DE": 2, "DL": 1.5, "DT": 1.2, "IDL": 1.2, "NT": 1.0}
QBHIT = {"DL": 2.0, "DE": 2.0, "DT": 2.0, "NT": 2.0, "IDL": 2.0, "EDGE": 2.0, "LB": 0.6, "CB": 0.3, "S": 0.3, "DB": 0.3}
TKL_BASE = {"LB": 95, "DB": 62, "CB": 60, "S": 64, "EDGE": 32, "DE": 32, "DL": 33, "DT": 33, "IDL": 33, "NT": 30}

def complete_score(st, pos):
    """st: {solos,assists,sack,int,ff, tfl?, fum_rec?}. Fills gaps + scores yuH.
    Returns (pts, display_line) where display_line holds the count stats."""
    solo = st.get("solos") or 0; ast = st.get("assists") or 0
    sack = st.get("sack") or 0; intc = st.get("int") or 0; ff = st.get("ff") or 0
    tkl_pts = solo + 0.5 * ast
    role = max(0.25, min(1.4, tkl_pts / TKL_BASE.get(pos, 60)))
    tfl = st["tfl"] if st.get("tfl") is not None else round(sack * 1.3 + 1.0, 1)
    fr = st["fum_rec"] if st.get("fum_rec") is not None else round(0.4 * role + 0.3, 1)
    pd = round(PD_BASE.get(pos, 4) * role, 1)
    qbh = round(QBHIT.get(pos, 0.5) * sack, 1)
    scoring_line = {"solo": solo, "ast": ast, "sack": sack, "tfl": tfl, "int": intc, "ff": ff,
                    "fum_rec": fr, "pass_def": pd, "qb_hit": qbh,
                    "sack_yd": round(sack * 6.5, 1), "int_ret_yd": round(intc * 12, 1), "fum_ret_yd": round(fr * 6, 1)}
    pts = round(sum(scoring_line[k] * w for k, w in YUH.items()), 1)
    display = {"solo": round(solo, 1), "ast": round(ast, 1), "sack": round(sack, 1), "tfl": round(tfl, 1),
               "int": round(intc, 1), "ff": round(ff, 1), "pass_def": pd, "qb_hit": qbh, "fum_rec": round(fr, 1)}
    return pts, display

def load(n): return {p["sleeper_id"]: p for p in json.load(open(HERE / n, encoding="utf-8"))["players"] if p.get("sleeper_id")}

def main():
    clay = load("clay-2026-idp-projections.json")
    slp = load("sleeper-2026-idp-projections.json")
    DKEYS = ["solo", "ast", "sack", "tfl", "int", "ff", "pass_def", "qb_hit", "fum_rec"]
    def blend_line(a, b):
        a, b = a or {}, b or {}
        return {k: round(sum(v)/len(v), 1) for k in (set(a) | set(b))
                if (v := [x[k] for x in (a, b) if k in x and x[k] is not None])}
    out = []
    for pid in set(clay) | set(slp):
        c, s = clay.get(pid), slp.get(pid)
        pos = (c or {}).get("pos") or (s or {}).get("pos") or "LB"
        name = (c or s)["name"]; team = (c or {}).get("team") or (s or {}).get("team")
        clay_pts, clay_line = complete_score(c, pos) if c else (None, {})
        slp_pts, slp_line = complete_score(s, pos) if s else (None, {})
        vals = [v for v in (clay_pts, slp_pts) if v is not None]
        blend = round(sum(vals) / len(vals), 1) if vals else None
        if blend is None:
            continue
        out.append({"id": pid, "name": name, "pos": pos, "team": team,
                    "clay": clay_pts, "sleeper": slp_pts, "blend": blend,
                    "stats": {"clay": clay_line, "sleeper": slp_line, "blend": blend_line(clay_line, slp_line)}})
    out.sort(key=lambda x: -(x["blend"] or 0))
    (HERE / "defense-projections.json").write_text(
        json.dumps({"scoring": "yuH IDP, per-source best-est completion", "count": len(out),
                    "sources": ["blend", "clay", "sleeper"], "default": "clay", "stat_keys": DKEYS, "players": out},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    # combine offense + defense into the site file (with per-source stat lines)
    off = json.loads((HERE / "offense-projections.json").read_text(encoding="utf-8"))["players"]
    off_slim = [{"id": p["id"], "name": p["name"], "pos": p["pos"], "team": p["team"],
                 "pp": p["pp"], "sleeper": p["sleeper"], "blend": p["blend"], "stats": p.get("stats", {}),
                 "pp_partial": bool(p.get("pp_borrowed"))} for p in off]
    def_slim = [{"id": p["id"], "name": p["name"], "pos": p["pos"], "team": p["team"],
                 "clay": p["clay"], "sleeper": p["sleeper"], "blend": p["blend"], "stats": p["stats"]} for p in out]
    payload = {
        "offense": {"default": "pp", "sources": ["blend", "pp", "sleeper"],
                    "stat_keys": ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td"],
                    "players": off_slim},
        "defense": {"default": "clay", "sources": ["blend", "clay", "sleeper"],
                    "stat_keys": ["solo", "ast", "sack", "tfl", "int", "ff", "pass_def", "qb_hit", "fum_rec"],
                    "players": def_slim},
    }
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "projections.js").write_text(
        "window.OFFENSE_PROJ = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"defense: {len(out)} IDP scored -> defense-projections.json; site file offense={len(off_slim)} defense={len(def_slim)}")
    print("\nTop 10 IDP by Clay (default):")
    for i, p in enumerate(sorted(out, key=lambda x: -(x["clay"] or 0))[:10], 1):
        print(f"{i:2d}. {p['name']:22s} {p['team'] or '?':3s} {p['pos']:4s}  Clay {p['clay']}  Sleeper {p['sleeper']}  Blend {p['blend']}")

if __name__ == "__main__":
    main()
