"""Build per-player offensive stat components from TWO free sources:
  - PrizePicks season lines (prizepicks-nfl-season-lines.json) -- Vegas-style market
  - Sleeper season projections (fetched live, rotowire) -- projection model
Normalizes both into a common stat dict so a league scorer can convert to fantasy
points and blend. Matches to Sleeper player ids for roster cross-ref."""
import json, re, unicodedata, urllib.request, pathlib

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
OUT = HERE / "offense-components.json"

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

# PrizePicks stat_type -> our stat key. Combos ignored (double-count); kicker/punter
# and defensive lines dropped (no offense/DST slots use them here).
PP_MAP = {
    "Pass Yards": "pass_yd", "Pass TDs": "pass_td", "Pass INTs": "pass_int",
    "Rush Yards": "rush_yd", "Rush TDs": "rush_td",
    "Receiving Yards": "rec_yd", "Rec TDs": "rec_td", "Receptions": "rec",
}
OFF_POS = {"QB", "RB", "WR", "TE"}

def pp_components():
    # season-props.json is fetch_season_props.py's output: BettingPros consensus (9 books,
    # both sides priced, scriptable) merged over the PrizePicks dump. Same shape, so this
    # reader is unchanged. Falls back to the raw PrizePicks dump if that fetch never ran.
    f = HERE / "season-props.json"
    if not f.exists():
        f = HERE / "prizepicks-nfl-season-lines.json"
    d = json.loads(f.read_text(encoding="utf-8"))
    out = {}
    for p in d["players"]:
        pos = (p.get("pos") or "").upper()
        if pos not in OFF_POS:
            continue
        st = {}
        for stat, line in p["lines"].items():
            k = PP_MAP.get(stat)
            if k:
                st[k] = line
        # fill missing individual from combos when possible
        L = p["lines"]
        if "pass_yd" not in st and "Pass+Rush Yds" in L and "rush_yd" in st:
            st["pass_yd"] = round(L["Pass+Rush Yds"] - st["rush_yd"], 1)
        if "rush_yd" not in st and "Rush+Rec Yds" in L and "rec_yd" in st:
            st["rush_yd"] = round(L["Rush+Rec Yds"] - st["rec_yd"], 1)
        out[norm(p["player"])] = {"name": p["player"], "team": p.get("team"), "pos": pos, "stats": st}
    return out

def sleeper_components():
    out = {}
    for pos in ("QB", "RB", "WR", "TE"):
        url = f"https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]={pos}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as r:
            rows = json.load(r)
        for x in rows:
            if x.get("week") is not None:
                continue
            st = x.get("stats") or {}
            if not any(k in st for k in ("pass_yd", "rush_yd", "rec_yd", "rec")):
                continue
            p = x.get("player") or {}
            pid = x.get("player_id")
            keep = {k: st[k] for k in ("pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td",
                                       "rec", "rec_yd", "rec_td", "fum_lost", "pass_2pt", "rush_2pt", "rec_2pt") if k in st}
            out[pid] = {"name": f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
                        "team": x.get("team"), "pos": (p.get("position") or pos), "stats": keep, "sleeper_id": pid}
    return out

def main():
    pp = pp_components()
    slp = sleeper_components()
    raw = json.loads((ROOT / "players-nfl.json").read_text(encoding="utf-8"))
    # name -> candidate offensive players; resolve prefers matching position + active,
    # so a same-name inactive/other-position player (e.g. retired WR Kenneth Walker vs
    # active RB Kenneth Walker III) never steals the id. PP already carries the position.
    cand = {}
    for pid, p in raw.items():
        if p.get("position") in OFF_POS:
            nm = norm(p.get("full_name") or "")
            if nm: cand.setdefault(nm, []).append((pid, p))
    def resolve(nm, pos):
        lst = cand.get(nm, [])
        for pid, p in lst:
            if p.get("position") == pos and p.get("active"): return pid
        for pid, p in lst:
            if p.get("position") == pos: return pid
        for pid, p in lst:
            if p.get("active"): return pid
        return lst[0][0] if lst else None

    # PrizePicks only boards SOME stat props per player (often no receptions/rec-yds
    # for RBs). Pure-PP then undercounts pass-catchers. Fill any missing scoring stat
    # from that player's Sleeper projection so the PP total reflects full usage; track
    # which keys were borrowed.
    SCORE_KEYS = ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td"]
    def fill(pp_st, sl_st):
        if not sl_st:
            return pp_st, []
        out = dict(pp_st); borrowed = []
        for k in SCORE_KEYS:
            if k not in out and sl_st.get(k) is not None:
                out[k] = sl_st[k]; borrowed.append(k)
        return out, borrowed

    players = {}  # sleeper_id -> record
    for pid, rec in slp.items():
        players[pid] = {"sleeper_id": pid, "name": rec["name"], "team": rec["team"],
                        "pos": rec["pos"], "sleeper_stats": rec["stats"], "pp_stats": None, "pp_borrowed": []}
    matched_pp = 0
    for nm, rec in pp.items():
        pid = resolve(nm, rec["pos"])
        if pid and pid in players:
            filled, borrowed = fill(rec["stats"], players[pid]["sleeper_stats"])
            players[pid]["pp_stats"] = filled; players[pid]["pp_borrowed"] = borrowed; matched_pp += 1
        elif pid:
            players[pid] = {"sleeper_id": pid, "name": rec["name"], "team": rec["team"],
                            "pos": rec["pos"], "sleeper_stats": None, "pp_stats": rec["stats"], "pp_borrowed": []}; matched_pp += 1
        else:
            players["ppx_" + nm] = {"sleeper_id": None, "name": rec["name"], "team": rec["team"],
                                    "pos": rec["pos"], "sleeper_stats": None, "pp_stats": rec["stats"], "pp_borrowed": []}
    OUT.write_text(json.dumps({"count": len(players), "players": list(players.values())},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    both = sum(1 for p in players.values() if p["pp_stats"] and p["sleeper_stats"])
    filled_ct = sum(1 for p in players.values() if p["pp_borrowed"])
    print(f"offense components: {len(players)} players | PP-matched {matched_pp} | both sources {both} | PP gap-filled {filled_ct} -> {OUT.name}")
    print("PP-only (no Sleeper match):", sum(1 for p in players.values() if p['pp_stats'] and not p['sleeper_stats']))

if __name__ == "__main__":
    main()
