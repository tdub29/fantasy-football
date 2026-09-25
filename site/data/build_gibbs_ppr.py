"""Derived full-PPR version of Jacob Gibbs's rest-of-season board.

ROS only since 2026-09-24: he posted his week board himself titled PPR
("Week 3 - FLEX Top-100 ... (PPR)"), so re-ranking it would add PPR twice.
His ROS cards say HALF-PPR outright, so that one still gets derived.

DERIVED BY US, NOT PUBLISHED BY HIM. He maintains half-PPR boards; every league
here is full PPR. Checked 2026-09-24: his X cards and his FantasyPros HALF
board agree, while his FantasyPros PPR board is internally
inconsistent (WR shifts track catches, r = +0.51, but Brock Bowers goes TE4 in
half to TE21 in PPR, r = -0.01 at TE), so it is not used.

Method, the same one _sources/build_gibbs_fullppr.py uses for his preseason
board, applied per position:

    slot value  the k-th largest half-PPR projection among the players he
                ranked goes to his k-th player, so he decides the order and the
                board keeps its real value spread
    PPR score   slot value + 0.5 x projected receptions
    new board   re-sort by score; ties keep his order

A player who catches nothing never rises on his own; he only falls when pass
catchers around him rise, which is the real full-PPR effect. A ranked player
with no projection holds the slot Gibbs gave him and is flagged.

Projections: the season blend in projections.js (a common scale factor for
remaining games cancels out of the ordering; bye weeks are not netted out,
ponytail: do that if a bye ever flips an adjacent pair).

    python site/data/build_gibbs_ppr.py
    python site/data/build_gibbs_ppr.py --self-check
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

DATA = pathlib.Path(__file__).resolve().parent
OUT = DATA / "gibbs-ppr.js"
POSITIONS = ("RB", "WR", "TE")   # QBs catch nothing; PPR leaves their order alone


def load(name: str, var: str | None = None) -> dict:
    text = (DATA / name).read_text(encoding="utf-8")
    if var:
        i = text.index(f"window.{var}")
        text = text[i:]
    body = text[text.index("{"):]
    depth, end = 0, 0
    for k, ch in enumerate(body):
        depth += ch == "{"
        depth -= ch == "}"
        if depth == 0:
            end = k + 1
            break
    return json.loads(body[:end])


def rederive(rows: list[dict], proj: dict[str, tuple[float, float]]) -> list[dict]:
    """rows: his board for one position, his order. proj: sid -> (full PPR, rec)."""
    board = []
    for r in sorted(rows, key=lambda r: r["rank"]):
        full, rec = proj.get(str(r.get("sleeperId")), (None, 0.0))
        board.append({**r, "rec": rec, "half": None if full is None else full - 0.5 * rec,
                      "noProjection": full is None})
    known = [(i, b["half"]) for i, b in enumerate(board) if b["half"] is not None]
    if not known:
        return []
    for i, b in enumerate(board):
        if b["half"] is None:   # hold his slot: neighbours' value, no PPR bonus
            near = sorted(known, key=lambda kv: abs(kv[0] - i))[:2]
            b["half"] = sum(v for _, v in near) / len(near)
    values = sorted((b["half"] for b in board), reverse=True)
    for slot, b in enumerate(board):
        b["score"] = values[slot] + 0.5 * b["rec"]
    order = sorted(board, key=lambda b: (-b["score"], b["rank"]))
    out = []
    for new_rank, b in enumerate(order, 1):
        out.append({"rank": new_rank, "halfRank": b["rank"], "name": b["name"],
                    "team": b.get("team"), "sleeperId": b.get("sleeperId"),
                    "rec": round(b["rec"], 2), "move": b["rank"] - new_rank,
                    "noProjection": b["noProjection"] or None})
    return out


def season_proj() -> dict[str, tuple[float, float]]:
    off = load("projections.js", "OFFENSE_PROJ")["offense"]["players"]
    out = {}
    for p in off:
        for src in ("blend", "pp", "sleeper"):
            pts, st = p.get(src), (p.get("stats") or {}).get(src)
            if pts is not None and st:
                out[str(p["id"])] = (float(pts), float(st.get("rec") or 0.0))
                break
    return out


def self_check() -> int:
    # Two WRs he ranks 1 and 2 on equal half value; the catcher must pass the
    # non-catcher only because of the reception bonus.
    rows = [{"rank": 1, "name": "A", "sleeperId": "a"}, {"rank": 2, "name": "B", "sleeperId": "b"},
            {"rank": 3, "name": "C", "sleeperId": "c"}]
    proj = {"a": (15.0, 1.0), "b": (15.0 + 0.5 * 9 - 0.5 * 1, 9.0), "c": (5.0, 0.0)}
    out = rederive(rows, proj)
    assert [r["name"] for r in out] == ["B", "A", "C"], out
    assert out[0]["move"] == 1 and out[1]["move"] == -1
    # A 0-reception player never climbs on his own.
    rows2 = [{"rank": 1, "name": "X", "sleeperId": "x"}, {"rank": 2, "name": "Y", "sleeperId": "y"}]
    out2 = rederive(rows2, {"x": (10.0, 3.0), "y": (20.0, 0.0)})
    assert [r["name"] for r in out2] == ["X", "Y"], out2
    # No projection: holds his slot, flagged.
    out3 = rederive(rows, {"a": (15.0, 1.0), "c": (5.0, 0.0)})
    b = next(r for r in out3 if r["name"] == "B")
    assert b["noProjection"] and b["rank"] == 2, out3
    assert [r["rank"] for r in out] == [1, 2, 3]
    print("build_gibbs_ppr self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()
    season = season_proj()
    ros_board = load("gibbs-ros.js")
    note = ("DERIVED by this site from Jacob Gibbs's half-PPR {which} board: his order sets "
            "the value slots, +0.5 per projected catch, re-sorted. Not published by him.")
    payload = {}
    for key, board, proj, which in (("GIBBS_PPR_ROS", ros_board, season, "rest-of-season"),):
        positions = {pos: rederive(board["positions"].get(pos, []), proj) for pos in POSITIONS}
        payload[key] = {"derived": True, "note": note.format(which=which),
                        "fromPostedAt": board.get("postedAt"), "positions": positions}
    js = "// Generated by build_gibbs_ppr.py. DERIVED full-PPR re-rank of his half-PPR boards.\n"
    for key, obj in payload.items():
        js += f"window.{key}={json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)};\n"
    OUT.write_text(js, encoding="utf-8")
    for key, obj in payload.items():
        for pos, rows in obj["positions"].items():
            flagged = sum(1 for r in rows if r.get("noProjection"))
            print(f"{key} {pos}: {len(rows)} ranked, {flagged} without a projection")
    for key in payload:
        rows = payload[key]["positions"]["WR"] + payload[key]["positions"]["TE"]
        for n in ("Rashee Rice", "Brock Bowers", "Puka Nacua"):
            r = next((x for x in rows if x["name"] == n), None)
            if r:
                print(f"  {key} {n}: half {r['halfRank']} -> PPR {r['rank']} ({r['rec']} rec)")
    print(f"wrote {OUT.name} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
