"""Per-manager trade tendency profile: where each manager sits, min to max, on the asset
archetypes they actually trade for or away. Built from every completed trade in each
Sleeper league's history (not just Trevor's), valued on today's KTC 1QB board.

It describes past behaviour. It is not a prediction of what a manager will accept.

    python site/data/build_trade_tendency.py            # writes site/data/trade-tendency.js
    python site/data/build_trade_tendency.py --self-check
"""
from __future__ import annotations

import datetime
import json
import math
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_trade_history as th  # noqa: E402  (same cache, chains and fetch helpers)

ROOT = th.ROOT
OUT = ROOT / "site" / "data" / "trade-tendency.js"
KTC = ROOT / "site" / "data" / "ktc.js"
PLAYERS = ROOT / "players-nfl.json"

# Each archetype is a share of value (or a count) on the side a manager RECEIVED minus the
# same share on the side they SENT, so +1 means the trade was all-in on it, -1 all-out.
ARCHETYPES = [
    ("picks", "Draft picks", "Players now", "Picks later"),
    ("youth", "Youth", "Veterans (27+)", "Youth (24 and under)"),
    ("rb", "RB vs WR", "WRs", "RBs"),
    ("consolidate", "Consolidation", "Splits one asset into several", "Packages several into one"),
]


def norm(s: str) -> str:
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)\.?$", "", str(s or "").lower())
    return re.sub(r"[^a-z]", "", s)


def load_ktc():
    src = KTC.read_text(encoding="utf-8")
    data, _ = json.JSONDecoder().raw_decode(src[src.index("{"):])
    board = next(r for r in data["rankings"] if r["id"] == "ktc-oneqb")
    players = {norm(p["name"]) + p["pos"]: p["ktcValue"] for p in board["players"]}
    picks = {(int(p["season"]), int(p["round"])): [] for p in board.get("picks", [])}
    for p in board.get("picks", []):
        picks[(int(p["season"]), int(p["round"]))].append(p["ktcValue"])
    picks = {k: sum(v) / len(v) for k, v in picks.items()}
    return players, picks


def pick_value(picks, season, rnd):
    if (season, rnd) in picks:
        return picks[(season, rnd)]
    seasons = sorted({s for s, r in picks if r == rnd})
    # A used or far-future pick takes the nearest season KTC still prices at that round.
    return picks[(min(seasons, key=lambda s: abs(s - season)), rnd)] if seasons else 0


def tilt(got: float, sent: float) -> float | None:
    total = got + sent
    return None if total <= 0 else (got - sent) / total


def side_features(players, picks):
    """players: [(value, pos, age)], picks: [value]. Returns the shares one side carries."""
    pv = sum(v for v, _, _ in players)
    kv = sum(picks)
    total = pv + kv
    rb = sum(v for v, pos, _ in players if pos == "RB")
    wr = sum(v for v, pos, _ in players if pos == "WR")
    young = sum(v for v, _, a in players if a is not None and a <= 24)
    old = sum(v for v, _, a in players if a is not None and a >= 27)
    return {"total": total, "picks": kv, "rb": rb, "wr": wr, "young": young, "old": old,
            "n": len(players) + len(picks), "top": max([v for v, _, _ in players] + picks + [0])}


def trade_tilts(g, s):
    """Signed tilt per archetype for the manager who received side g and sent side s."""
    out = {}
    if g["total"] + s["total"] > 0:
        out["picks"] = tilt(g["picks"] / max(g["total"], 1), s["picks"] / max(s["total"], 1))
    yg, ys = g["young"] - g["old"], s["young"] - s["old"]
    if g["young"] + g["old"] + s["young"] + s["old"] > 0:
        out["youth"] = (yg - ys) / (g["young"] + g["old"] + s["young"] + s["old"])
    if g["rb"] + g["wr"] + s["rb"] + s["wr"] > 0:
        out["rb"] = ((g["rb"] - g["wr"]) - (s["rb"] - s["wr"])) / (g["rb"] + g["wr"] + s["rb"] + s["wr"])
    if g["n"] and s["n"]:
        out["consolidate"] = (s["n"] - g["n"]) / (s["n"] + g["n"])
    return {k: v for k, v in out.items() if v is not None}


def build_league(chain, raw, ktc_players, ktc_picks, sleeper):
    names, rows = {}, {}
    now_year = datetime.date.today().year
    for season in chain:
        lid = season["id"]
        rosters = raw.get((lid, "rosters")) or []
        owner_of = {str(r.get("roster_id")): str(r.get("owner_id")) for r in rosters}
        for u in raw.get((lid, "users")) or []:
            names.setdefault(str(u.get("user_id")), str((u.get("metadata") or {}).get("team_name")
                                                         or u.get("display_name") or u.get("user_id")))
        years_back = max(0, now_year - int(season["season"] or now_year))
        for week in range(19):
            for tx in raw.get((lid, "tx", week)) or []:
                if tx.get("type") != "trade" or tx.get("status") != "complete":
                    continue
                sides = {}
                for rid in tx.get("roster_ids") or []:
                    sides[str(rid)] = {"got": ([], []), "sent": ([], [])}
                for pid, rid in (tx.get("adds") or {}).items():
                    p = sleeper.get(str(pid)) or {}
                    v = ktc_players.get(norm(p.get("full_name")) + str(p.get("position")), 0)
                    age = p.get("age")
                    age = age - years_back if isinstance(age, (int, float)) else None
                    sides.setdefault(str(rid), {"got": ([], []), "sent": ([], [])})["got"][0].append((v, p.get("position"), age))
                for pid, rid in (tx.get("drops") or {}).items():
                    p = sleeper.get(str(pid)) or {}
                    v = ktc_players.get(norm(p.get("full_name")) + str(p.get("position")), 0)
                    age = p.get("age")
                    age = age - years_back if isinstance(age, (int, float)) else None
                    sides.setdefault(str(rid), {"got": ([], []), "sent": ([], [])})["sent"][0].append((v, p.get("position"), age))
                for pk in tx.get("draft_picks") or []:
                    v = pick_value(ktc_picks, int(pk.get("season")), int(pk.get("round")))
                    to, frm = str(pk.get("owner_id")), str(pk.get("previous_owner_id"))
                    if to in sides:
                        sides[to]["got"][1].append(v)
                    if frm in sides:
                        sides[frm]["sent"][1].append(v)
                for rid, sd in sides.items():
                    uid = owner_of.get(rid)
                    if not uid:
                        continue
                    g = side_features(*sd["got"])
                    s = side_features(*sd["sent"])
                    if g["total"] + s["total"] <= 0:
                        continue
                    rows.setdefault(uid, []).append(trade_tilts(g, s))
    current = chain[0]["id"]
    current_uids = {str(r.get("owner_id")) for r in raw.get((current, "rosters")) or [] if r.get("owner_id")}
    managers = []
    for uid in current_uids:
        trades = rows.get(uid, [])
        arch = {}
        for key, *_ in ARCHETYPES:
            vals = [t[key] for t in trades if key in t]
            arch[key] = {"raw": round(sum(vals) / len(vals), 3) if vals else None, "n": len(vals)}
        managers.append({"uid": uid, "name": names.get(uid, uid), "n": len(trades), "arch": arch})
    # League-relative 0-100: the league's least and most inclined manager set the ends,
    # so a profile reads against these managers, not an absolute standard.
    for key, *_ in ARCHETYPES:
        vals = [m["arch"][key]["raw"] for m in managers if m["arch"][key]["raw"] is not None]
        lo, hi = (min(vals), max(vals)) if vals else (0, 0)
        for m in managers:
            r = m["arch"][key]["raw"]
            m["arch"][key]["score"] = None if r is None else (50 if hi == lo else round(100 * (r - lo) / (hi - lo)))
    managers.sort(key=lambda m: (-m["n"], m["name"].lower()))
    return {"managers": managers, "trades": sum(m["n"] for m in managers) // 2 or 0,
            "seasons": [s["season"] for s in chain]}


def self_check():
    g = side_features([(5000, "RB", 23)], [])
    s = side_features([(2000, "WR", 29), (2000, "WR", 30)], [3000])
    t = trade_tilts(g, s)
    assert t["picks"] < 0 and t["youth"] > 0 and t["rb"] > 0 and t["consolidate"] > 0, t
    assert abs(trade_tilts(s, g)["consolidate"] + t["consolidate"]) < 1e-9
    print("self-check ok")


def main():
    if "--self-check" in sys.argv:
        return self_check()
    site_leagues = th.load_site_leagues()
    chains = {str(l["id"]): th.chain_for(str(l["id"])) for l in site_leagues}
    raw = th.fetch_specs(th.endpoint_specs(site_leagues, chains))
    ktc_players, ktc_picks = load_ktc()
    dump = json.loads(PLAYERS.read_text(encoding="utf-8"))
    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "archetypes": [{"key": k, "label": a, "low": lo, "high": hi} for k, a, lo, hi in ARCHETYPES],
        "leagues": {lid: build_league(chain, raw, ktc_players, ktc_picks, dump) for lid, chain in chains.items()},
    }
    OUT.write_text("window.TRADE_TENDENCY = " + json.dumps(payload, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"wrote {OUT.name}: {OUT.stat().st_size / 1024:.1f} KB")
    for l in site_leagues:
        d = payload["leagues"][str(l["id"])]
        print(f"  {l['name']}: {len(d['managers'])} managers, {d['trades']} trades")


if __name__ == "__main__":
    main()
