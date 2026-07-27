"""Score offense components 3 ways (PP / Sleeper / Blend) and emit:
  - offense-projections.json  (analysis)
  - ../site/data/projections.js  (window.OFFENSE_PROJ for the site source-selector)
Standard scoring = 1 PPR, 4pt pass TD, pass yd/25, rush+rec yd/10, TD 6, INT -1,
fum lost -2 (matches yuH & The League; Password-is-taco differs only by INT -2, a
sub-1pt swing on QBs). Site can rescore per league from the stored components."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
SITE = HERE.parent / "site" / "data"

def score(st, int_pen=-1.0):
    if not st:
        return None
    g = lambda k: st.get(k, 0) or 0
    return round(g("pass_yd") * 0.04 + g("pass_td") * 4 + g("pass_int") * int_pen
                 + g("rush_yd") * 0.1 + g("rush_td") * 6
                 + g("rec") * 1.0 + g("rec_yd") * 0.1 + g("rec_td") * 6
                 + g("fum_lost") * -2 + (g("pass_2pt") + g("rush_2pt") + g("rec_2pt")) * 2, 1)

def main():
    comp = json.loads((HERE / "offense-components.json").read_text(encoding="utf-8"))["players"]
    STAT_KEYS = ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td"]
    def blend_stats(a, b):
        a, b = a or {}, b or {}
        keys = set(a) | set(b)
        out = {}
        for k in keys:
            vals = [x[k] for x in (a, b) if k in x and x[k] is not None]
            if vals:
                out[k] = round(sum(vals) / len(vals), 1)
        return out
    out = []
    for p in comp:
        pp = score(p.get("pp_stats"))
        slp = score(p.get("sleeper_stats"))
        vals = [v for v in (pp, slp) if v is not None]
        blend = round(sum(vals) / len(vals), 1) if vals else None
        if blend is None:
            continue
        bs = blend_stats(p.get("pp_stats"), p.get("sleeper_stats"))
        out.append({
            "id": p.get("sleeper_id"), "name": p["name"], "pos": p["pos"], "team": p["team"],
            "pp": pp, "sleeper": slp, "blend": blend,
            "pp_borrowed": p.get("pp_borrowed") or [],
            "stats": {"pp": p.get("pp_stats") or {}, "sleeper": p.get("sleeper_stats") or {}, "blend": bs},
        })
    out.sort(key=lambda x: -(x["blend"] or 0))
    (HERE / "offense-projections.json").write_text(
        json.dumps({"scoring": "1PPR, 4pt passTD, passyd/25, rush+rec yd/10, TD6, INT-1, fumlost-2",
                    "sources": ["pp", "sleeper", "blend"], "default": "pp", "stat_keys": STAT_KEYS,
                    "count": len(out), "players": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"scored {len(out)} offense players -> offense-projections.json (site file emitted by score_defense.py)")
    print("\nTop 12 by PP (default) season fantasy pts:")
    for i, p in enumerate(sorted(out, key=lambda x: -(x["pp"] or 0))[:12], 1):
        print(f"{i:2d}. {p['name']:22s} {p['team'] or '?':3s} {p['pos']:3s}  PP {p['pp']}  Sleeper {p['sleeper']}  Blend {p['blend']}")

if __name__ == "__main__":
    main()
