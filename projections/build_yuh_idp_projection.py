"""Project yuH IDP points per roster: blend Clay + Sleeper per-player yuH scores,
attach to each yuH team's defenders, and rank teams by their 2 IDP_FLEX starters."""
import json, pathlib

ROOT = pathlib.Path(__file__).parent.parent
HERE = pathlib.Path(__file__).parent
IDP_POS = {"DL", "DE", "DT", "NT", "LB", "DB", "CB", "S", "EDGE"}
N_IDP_SLOTS = 2  # yuH: 2 IDP_FLEX

def load(name):
    return {p["sleeper_id"]: p for p in json.load(open(HERE / name, encoding="utf-8"))["players"] if p.get("sleeper_id")}

def main():
    scored = load("yuh-idp-scored.json")  # completed lines, full yuH scoring w/ best-est
    proj = {pid: {"clay": p.get("clay_pts"), "sleeper": p.get("sleeper_pts"),
                  "blend": p.get("yuh_pts"), "sources": len(p.get("sources") or [])}
            for pid, p in scored.items()}

    raw = json.loads((ROOT / "players-nfl.json").read_text(encoding="utf-8"))
    rosters = json.loads((ROOT / "Leagues" / "yuH" / "rosters.json").read_text(encoding="utf-8"))
    users = {u["user_id"]: u for u in json.loads((ROOT / "Leagues" / "yuH" / "users.json").read_text(encoding="utf-8"))}
    ME = "726629031964975104"

    teams = []
    for r in rosters:
        owner = users.get(r.get("owner_id") or "", {})
        tname = (owner.get("metadata") or {}).get("team_name") or owner.get("display_name", f"Roster {r['roster_id']}")
        idps = []
        for pid in (r.get("players") or []):
            p = raw.get(pid) or {}
            pos = p.get("position")
            fpos = set(p.get("fantasy_positions") or [])
            if pos not in IDP_POS and not (fpos & IDP_POS):
                continue
            pr = proj.get(pid, {})
            idps.append({
                "name": p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
                "pos": pos, "team": p.get("team"),
                "blend": pr.get("blend"), "clay": pr.get("clay"), "sleeper": pr.get("sleeper"),
            })
        # rank by blended projection (unprojected -> 0 for ordering, shown as None)
        idps.sort(key=lambda x: -(x["blend"] or 0))
        starters = idps[:N_IDP_SLOTS]
        start_pts = round(sum((x["blend"] or 0) for x in starters), 1)
        teams.append({"team": tname, "owner": owner.get("display_name"), "is_me": r.get("owner_id") == ME,
                      "start_pts": start_pts, "starters": starters, "depth": idps})

    teams.sort(key=lambda t: -t["start_pts"])
    (HERE / "yuh-idp-roster-projection.json").write_text(
        json.dumps({"slots": N_IDP_SLOTS, "scoring": "yuH IDP, blend of Clay+Sleeper", "teams": teams},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    print("yuH IDP starting projection (top 2 IDP_FLEX, blended Clay+Sleeper season pts):\n")
    for i, t in enumerate(teams, 1):
        me = " *YOU*" if t["is_me"] else ""
        s = t["starters"]
        line = ", ".join(f"{x['name']} ({x['pos']}) {x['blend']}" for x in s if x["blend"] is not None) or "(no projected IDP)"
        print(f"{i:2d}. {t['team']:20s}{me}  starters {t['start_pts']:6.1f}  | {line}")
    print("\nsaved yuh-idp-roster-projection.json")

if __name__ == "__main__":
    main()
