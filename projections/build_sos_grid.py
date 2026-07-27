"""SOS grid data: for each position (QB/RB/WR/TE), each team's week-by-week schedule
with the OPPONENT's defense-vs-that-position strength (last season's PPR points
allowed to the position, ranked). Powers the Tools -> SOS page (teams as rows, weeks
as columns). Rank 1 = allows FEWEST to the position (toughest matchup).

Inputs: historical/derived/def_vs_pos.csv (DvP) + site/data/sos.js schedule.
Emits site/data/sos-grid.js (window.SOS_GRID)."""
import json, csv, pathlib, re

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SITE = ROOT / "site" / "data"
DVP = ROOT / "historical" / "derived" / "def_vs_pos.csv"
POSITIONS = ["QB", "RB", "WR", "TE"]
# def_vs_pos uses nflverse codes; our schedule uses Sleeper-ish env codes.
ENV_TO_NFLVERSE = {"LAR": "LA"}

def load_sched():
    txt = (SITE / "sos.js").read_text(encoding="utf-8")
    obj = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])
    return obj["teams"]  # {abbr: {schedule:[{week,opp,home}], ...}}

def main():
    rows = list(csv.DictReader(open(DVP, encoding="utf-8")))
    latest = max(r["season"] for r in rows)
    fpa = {}  # (team,pos) -> ppr/g allowed
    for r in rows:
        if r["season"] == latest and r["opp_pos"] in POSITIONS:
            fpa[(r["def_team"], r["opp_pos"])] = float(r["fp_ppr_per_g"])
    # rank per position: 1 = allows fewest (toughest D vs that pos)
    rank = {}
    for pos in POSITIONS:
        teams = sorted({t for (t, p) in fpa if p == pos}, key=lambda t: fpa[(t, pos)])
        for i, t in enumerate(teams):
            rank[(t, pos)] = i + 1
    n_def = len({t for (t, p) in fpa if p == "RB"})

    def dvp(env_abbr, pos):
        code = ENV_TO_NFLVERSE.get(env_abbr, env_abbr)
        return rank.get((code, pos)), fpa.get((code, pos))

    sched = load_sched()
    teams_sorted = sorted(sched.keys())
    grid = {pos: {} for pos in POSITIONS}
    for pos in POSITIONS:
        for t in teams_sorted:
            games = []
            for g in sched[t]["schedule"]:
                r, f = dvp(g["opp"], pos)
                games.append({"week": g["week"], "opp": g["opp"], "home": g["home"],
                              "rank": r, "fpa": round(f, 1) if f is not None else None})
            grid[pos][t] = games

    payload = {"season": latest, "positions": POSITIONS, "n_def": n_def,
               "note": "opponent defense-vs-position: last-season PPR allowed to the position, ranked (1 = fewest allowed = toughest matchup, %d = easiest)" % n_def,
               "teams": teams_sorted, "grid": grid}
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "sos-grid.js").write_text("window.SOS_GRID = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"wrote sos-grid.js: {len(teams_sorted)} teams x {POSITIONS} using {latest} DvP")
    # sanity: toughest & easiest RB matchups by rank
    rb = sorted([(t, rank[(t, 'RB')], fpa[(t, 'RB')]) for (t, p) in fpa if p == 'RB'], key=lambda x: x[1])
    print("toughest vs RB:", [(t, round(f, 1)) for t, _, f in rb[:3]], "| easiest:", [(t, round(f, 1)) for t, _, f in rb[-3:]])

if __name__ == "__main__":
    main()
