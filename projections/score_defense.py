"""Score IDP projections per SOURCE (xStats / Clay / Sleeper) independently, each
completed with the same best-estimate fills (PD, QB-hit, return yds; TFL for Sleeper,
fum-rec for Clay), so all four (xstats/blend/clay/sleeper) are directly comparable under
yuH IDP scoring. Then emit the combined site file site/data/projections.js (offense + defense)."""
import argparse
import json
import pathlib

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SITE = ROOT / "site" / "data"

YUH = {"solo": 1.0, "ast": 0.5, "sack": 3.0, "tfl": 1.0, "int": 5.0, "ff": 3.0,
       "fum_rec": 3.0, "pass_def": 3.0, "qb_hit": 1.0, "def_td": 6.0,
       "safe": 3.0, "blk_kick": 3.0,
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
    pts = round(sum(scoring_line.get(k, 0.0) * w for k, w in YUH.items()), 1)
    display = {"solo": round(solo, 1), "ast": round(ast, 1), "sack": round(sack, 1), "tfl": round(tfl, 1),
               "int": round(intc, 1), "ff": round(ff, 1), "pass_def": pd, "qb_hit": qbh, "fum_rec": round(fr, 1),
               "sack_yd": round(sack * 6.5, 1), "int_ret_yd": round(intc * 12, 1), "fum_ret_yd": round(fr * 6, 1)}
    return pts, display

def load(n): return {p["sleeper_id"]: p for p in json.load(open(HERE / n, encoding="utf-8"))["players"] if p.get("sleeper_id")}


def load_xstats():
    p = SITE / "idp-xstats.js"
    if not p.exists():
        return {}
    txt = p.read_text(encoding="utf-8")
    return json.loads(txt[txt.index("{"):txt.rindex("}") + 1]).get("players", {})


def xstats_season_entry(rec):
    xstats_pts = round(float(rec["xNeut"]) * 17.0, 1)
    xstats_line = {
        "solo": round(float(rec["xSolo"]) * 17.0, 2),
        "ast": round(float(rec["xAst"]) * 17.0, 2),
        "sack": round(float(rec["xSk"]) * 17.0, 2),
        "tfl": round(float(rec["xTFL"]) * 17.0, 2),
        "int": round(float(rec["xINT"]) * 17.0, 2),
        "ff": round(float(rec["xFF"]) * 17.0, 2),
        "pass_def": round(float(rec["xPBU"]) * 17.0, 2),
        "qb_hit": round(float(rec["xQBH"]) * 17.0, 2),
        "fum_rec": round(float(rec["xFR"]) * 17.0, 2),
        "sack_yd": round(float(rec["xSkYd"]) * 17.0, 2),
        "int_ret_yd": round(float(rec["xINTYd"]) * 17.0, 2),
        "fum_ret_yd": round(float(rec["xFRYd"]) * 17.0, 2),
        "def_td": round(float(rec.get("xTD") or 0.0) * 17.0, 2),
        "safe": round(float(rec.get("xSafe") or 0.0) * 17.0, 2),
        "blk_kick": round(float(rec.get("xBlk") or 0.0) * 17.0, 2),
    }
    return xstats_pts, xstats_line


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    clay = load("clay-2026-idp-projections.json")
    slp = load("sleeper-2026-idp-projections.json")
    xstats = load_xstats()
    DKEYS = ["solo", "ast", "sack", "tfl", "int", "ff", "pass_def", "qb_hit", "fum_rec"]
    def blend_line(a, b):
        a, b = a or {}, b or {}
        return {k: round(sum(v)/len(v), 1) for k in sorted(set(a) | set(b))
                if (v := [x[k] for x in (a, b) if k in x and x[k] is not None])}
    out = []
    for pid in sorted(set(clay) | set(slp) | set(xstats)):
        c, s, x = clay.get(pid), slp.get(pid), xstats.get(pid)
        pos = (c or {}).get("pos") or (s or {}).get("pos") or (x or {}).get("p") or "LB"
        name = (c or s)["name"] if (c or s) else x["n"]
        team = (c or {}).get("team") or (s or {}).get("team") or (x or {}).get("t")
        clay_pts, clay_line = complete_score(c, pos) if c else (None, {})
        slp_pts, slp_line = complete_score(s, pos) if s else (None, {})
        xstats_pts, xstats_line = xstats_season_entry(x) if x else (None, {})
        vals = [v for v in (clay_pts, slp_pts) if v is not None]
        blend = round(sum(vals) / len(vals), 1) if vals else None
        if blend is None and xstats_pts is None:
            continue
        stats_map = {}
        if xstats_line:
            stats_map["xstats"] = xstats_line
        if clay_line:
            stats_map["clay"] = clay_line
        if slp_line:
            stats_map["sleeper"] = slp_line
        b_line = blend_line(clay_line, slp_line)
        if b_line:
            stats_map["blend"] = b_line
        out.append({"id": pid, "name": name, "pos": pos, "team": team,
                    "xstats": xstats_pts, "clay": clay_pts, "sleeper": slp_pts, "blend": blend,
                    "stats": stats_map})
    out.sort(key=lambda r: (-(r["xstats"] or r["blend"] or 0), str(r["id"])))
    (HERE / "defense-projections.json").write_text(
        json.dumps({"scoring": "yuH IDP, per-source best-est completion + yuh-idp-xstats-v1", "count": len(out),
                    "sources": ["xstats", "blend", "clay", "sleeper"], "default": "xstats", "stat_keys": DKEYS, "players": out},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    # combine offense + defense into the site file (with per-source stat lines)
    off = json.loads((HERE / "offense-projections.json").read_text(encoding="utf-8"))["players"]
    off_slim = [{"id": p["id"], "name": p["name"], "pos": p["pos"], "team": p["team"],
                 "pp": p["pp"], "sleeper": p["sleeper"], "blend": p["blend"], "stats": p.get("stats", {}),
                 "pp_partial": bool(p.get("pp_borrowed"))} for p in off]
    def_slim = [{"id": p["id"], "name": p["name"], "pos": p["pos"], "team": p["team"],
                 "xstats": p["xstats"], "clay": p["clay"], "sleeper": p["sleeper"], "blend": p["blend"], "stats": p["stats"]} for p in out]
    payload = {
        "offense": {"default": "pp", "sources": ["blend", "pp", "sleeper"],
                    "stat_keys": ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td"],
                    "players": off_slim},
        "defense": {"default": "xstats", "sources": ["xstats", "blend", "clay", "sleeper"],
                    "stat_keys": ["solo", "ast", "sack", "tfl", "int", "ff", "pass_def", "qb_hit", "fum_rec"],
                    "players": def_slim},
    }
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "projections.js").write_text(
        "window.OFFENSE_PROJ = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n",
        encoding="utf-8")
    if args.self_check:
        assert payload["defense"]["default"] == "xstats"
        assert payload["defense"]["sources"] == ["xstats", "blend", "clay", "sleeper"]
        names = {p["name"] for p in def_slim}
        for req_nm in ("Blake Cashman", "Kamari Lassiter"):
            assert req_nm in names, f"Missing expected IDP {req_nm}"
        assert any("Reese" in n for n in names), "Missing Arvell Reese from xstats defense pool"
        x_signed = [
            p["xstats"] - sum(p["stats"]["xstats"].get(k, 0.0) * w for k, w in YUH.items())
            for p in def_slim if p.get("xstats") is not None and (p.get("stats") or {}).get("xstats")
        ]
        x_diffs = [abs(d) for d in x_signed]
        assert x_diffs and max(x_diffs) <= 0.60, f"xstats scoring parity drift: max_diff={max(x_diffs):.4f}"
        mean_bias = sum(x_signed) / len(x_signed)
        assert abs(mean_bias) <= 0.05, f"xstats systematic bias drift: mean_diff={mean_bias:.4f}"
        print(f"score_defense self-check ok (xstats parity max_diff={max(x_diffs):.3f}, mean_diff={mean_bias:+.4f})")
    print(f"defense: {len(out)} IDP scored -> defense-projections.json; site file offense={len(off_slim)} defense={len(def_slim)}")
    print("\nTop 10 IDP by xStats (default):")
    for i, p in enumerate(sorted(out, key=lambda x: -(x["xstats"] or 0))[:10], 1):
        print(f"{i:2d}. {p['name']:22s} {p['team'] or '?':3s} {p['pos']:4s}  xStats {p['xstats']}  Clay {p['clay']}  Sleeper {p['sleeper']}  Blend {p['blend']}")

if __name__ == "__main__":
    main()
