"""Authoritative yuH IDP projection: merge Clay + Sleeper, complete each stat line
with best-estimates for components NEITHER source projects (pass-defended, QB hit)
or only one does (TFL=Clay, fum-rec=Sleeper), then score with the full yuH map.
Every estimated field is flagged for transparency."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
def load(n): return {p["sleeper_id"]: p for p in json.load(open(HERE / n, encoding="utf-8"))["players"] if p.get("sleeper_id")}

YUH = {  # full yuH IDP scoring
    "solo": 1.0, "ast": 0.5, "sack": 3.0, "tfl": 1.0, "int": 5.0, "ff": 3.0,
    "fum_rec": 3.0, "pass_def": 3.0, "qb_hit": 1.0,
    "sack_yd": 0.1, "int_ret_yd": 0.1, "fum_ret_yd": 0.1,
}
# season pass-defended baseline for a full-time starter, by position
PD_BASE = {"CB": 12, "S": 7, "DB": 9, "LB": 4.5, "EDGE": 2, "DE": 2, "DL": 1.5, "DT": 1.2, "IDL": 1.2, "NT": 1.0}
QBHIT_MULT = {"DL": 2.0, "DE": 2.0, "DT": 2.0, "NT": 2.0, "IDL": 2.0, "EDGE": 2.0, "LB": 0.6, "CB": 0.3, "S": 0.3, "DB": 0.3}
TKL_BASE = {"LB": 95, "DB": 62, "CB": 60, "S": 64, "EDGE": 32, "DE": 32, "DL": 33, "DT": 33, "IDL": 33, "NT": 30}

def mean(*vals):
    v = [x for x in vals if x is not None]
    return sum(v) / len(v) if v else 0.0

def main():
    clay, slp = load("clay-2026-idp-projections.json"), load("sleeper-2026-idp-projections.json")
    out = []
    for pid in set(clay) | set(slp):
        c, s = clay.get(pid), slp.get(pid)
        pos = (c or {}).get("pos") or (s or {}).get("pos") or "LB"
        name = (c or s)["name"]; team = (c or {}).get("team") or (s or {}).get("team")
        solo = mean((c or {}).get("solos"), (s or {}).get("solos"))
        ast = mean((c or {}).get("assists"), (s or {}).get("assists"))
        sack = mean((c or {}).get("sack"), (s or {}).get("sack"))
        intc = mean((c or {}).get("int"), (s or {}).get("int"))
        ff = mean((c or {}).get("ff"), (s or {}).get("ff"))
        est = []
        # TFL: Clay-sourced; estimate for Sleeper-only players
        if c and c.get("tfl") is not None:
            tfl = float(c["tfl"])
        else:
            tfl = round(sack * 1.3 + 1.0, 1); est.append("tfl")
        # fum_rec: Sleeper-sourced; estimate otherwise
        if s and s.get("fum_rec") is not None:
            fr = float(s["fum_rec"])
        else:
            fr = round(0.4 * min(1.4, (solo + 0.5 * ast) / TKL_BASE.get(pos, 60)) + 0.3, 1); est.append("fum_rec")
        # role factor scales position baselines by projected playing time
        role = max(0.25, min(1.4, (solo + 0.5 * ast) / TKL_BASE.get(pos, 60)))
        pass_def = round(PD_BASE.get(pos, 4) * role, 1); est.append("pass_def")
        qb_hit = round(QBHIT_MULT.get(pos, 0.5) * sack, 1); est.append("qb_hit")
        # best-est return yards (0.1/yd)
        sack_yd = round(sack * 6.5, 1); int_ret_yd = round(intc * 12, 1); fum_ret_yd = round(fr * 6, 1)
        est += ["sack_yd", "int_ret_yd", "fum_ret_yd"]

        line = {"solo": solo, "ast": ast, "sack": sack, "tfl": tfl, "int": intc, "ff": ff,
                "fum_rec": fr, "pass_def": pass_def, "qb_hit": qb_hit,
                "sack_yd": sack_yd, "int_ret_yd": int_ret_yd, "fum_ret_yd": fum_ret_yd}
        pts = round(sum(line[k] * w for k, w in YUH.items()), 1)
        out.append({
            "sleeper_id": pid, "name": name, "team": team, "pos": pos,
            "yuh_pts": pts,
            "clay_pts": (c or {}).get("yuh_pts"), "sleeper_pts": (s or {}).get("yuh_pts"),
            "sources": (["clay"] if c else []) + (["sleeper"] if s else []),
            "estimated": est,
            "line": {k: round(v, 1) for k, v in line.items()},
        })
    out.sort(key=lambda x: -x["yuh_pts"])
    (HERE / "yuh-idp-scored.json").write_text(
        json.dumps({"scoring": "full yuH IDP with best-est PD/QBhit/return-yds; TFL=Clay, FR=Sleeper",
                    "count": len(out), "players": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"scored {len(out)} IDP with completed lines -> yuh-idp-scored.json")
    print("\nTop 15 (full yuH scoring, gaps best-estimated):")
    for i, p in enumerate(out[:15], 1):
        l = p["line"]
        print(f"{i:2d}. {p['name']:22s} {p['team'] or '?':3s} {p['pos']:4s} {p['yuh_pts']:6.1f}  "
              f"(solo {l['solo']:.0f} ast {l['ast']:.0f} sk {l['sack']:.1f} tfl {l['tfl']:.0f} "
              f"int {l['int']:.1f} pd~{l['pass_def']:.0f} ff {l['ff']:.1f})")

if __name__ == "__main__":
    main()
