"""Adapt the Gibbs half-PPR board to full PPR. DERIVED, not published by Gibbs.

Gibbs ranks for half-PPR. Full PPR pays another 0.5 per catch, so a 105-catch
receiver gains ~53 points on a 17-catch back's ~9. This does not re-rank on raw
projections, which would throw his opinion away. It keeps his ordering as the
value scale and moves players only by the reception differential:

    slot value      the k-th largest half-PPR projection among the flex players he
                    ranked, handed to his k-th flex player, so the board keeps its
                    real value distribution and he decides only the order
    fullPPR score   slot value + 0.5 * projected receptions
    new board       re-sort flex by that score into the slots QBs are not holding,
                    keeping his tier sizes exactly

A player with no receptions cannot fall on his own; he falls only because the
pass catchers around him rose, which is the real full-PPR effect.

    python site/data/_sources/build_gibbs_fullppr.py

Writes the derived CSV beside the source board and registers/refreshes the
"gibbs-ppr-2026-08" column in _expert_sources.json.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "site" / "data"
SRC_DIR = Path(__file__).resolve().parent
SOURCES = DATA / "_expert_sources.json"
SOURCE_ID = "gibbs-ppr-2026-08"


def globals_in(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    parts = re.split(r"^window\.(\w+)\s*=\s*", text, flags=re.M)
    return {parts[i]: json.loads(parts[i + 1].strip().rstrip(";").strip())
            for i in range(1, len(parts), 2)}


def projections() -> dict[str, tuple[float, float]]:
    """sleeperId -> (full-PPR points, receptions). The baked totals are 1.0/rec."""
    offense = globals_in(DATA / "projections.js")["OFFENSE_PROJ"]["offense"]
    out = {}
    for p in offense["players"]:
        for src in ("blend", "pp", "sleeper"):
            pts, stats = p.get(src), (p.get("stats") or {}).get(src)
            if pts is None or not stats:
                continue
            out[str(p["id"])] = (float(pts), float(stats.get("rec") or 0.0))
            break
    return out


def assign_values(flex_in_board_order: list[dict]) -> None:
    """Give each flex player the half-PPR value his slot on the board is worth.

    Take the half-PPR projections of the flex players Gibbs ranked, sort them high
    to low, and hand the k-th largest to his k-th flex player. The board keeps its
    own value distribution, so the elite gap at the top stays as steep as it really
    is, and Gibbs decides only who sits in which slot. Smoothing the projections
    into a curve instead flattens the top 10 to within a few points of each other,
    which alone dropped Jahmyr Gibbs from 1 to 11.
    """
    values = sorted((p["half"] for p in flex_in_board_order), reverse=True)
    for slot, p in enumerate(flex_in_board_order):
        p["slotValue"] = values[slot]


def build() -> tuple[list[dict], dict]:
    board = globals_in(DATA / "jacob-gibbs.js")["JACOB_GIBBS_RANKINGS"]
    proj = projections()
    ranked = []
    unprojected = []
    for p in board["players"]:
        full, rec = proj.get(str(p["sleeperId"]), (None, 0.0))
        if full is None:
            # Refusing to build here froze the whole full-PPR column on the previous board
            # while the half-PPR column moved on, which is a worse and quieter lie than a
            # named gap: the two columns then disagree about who is even on the board.
            # He stays, at the slot Gibbs gave him, flagged as not re-scored.
            unprojected.append(p["name"])
            ranked.append({**p, "rec": 0.0, "half": None, "noProjection": True})
            continue
        ranked.append({**p, "rec": rec, "half": full - 0.5 * rec})
    ranked.sort(key=lambda p: p["rank"])
    if unprojected:
        print(f"no season projection for {len(unprojected)}: {', '.join(unprojected)}"
              " - each holds his half-PPR slot and is flagged noProjection")
        # The value curve needs a number to sort on. Take the mean of his nearest projected
        # neighbours on the board rather than a zero, which would bury him, or an invented
        # projection, which would claim knowledge. rec stays 0.0, so he gains nothing from
        # the PPR bonus and cannot climb on it: he only holds the slot Gibbs gave him.
        known = [(i, p["half"]) for i, p in enumerate(ranked) if p["half"] is not None]
        for i, p in enumerate(ranked):
            if p["half"] is not None:
                continue
            near = sorted(known, key=lambda kv: abs(kv[0] - i))[:2]
            p["half"] = sum(v for _, v in near) / len(near)

    flex_order = [p for p in ranked if p["pos"] != "QB"]
    assign_values(flex_order)
    for p in flex_order:
        p["score"] = p["slotValue"] + 0.5 * p["rec"]

    tier_sizes = []
    for p in ranked:
        if not tier_sizes or p["tier"] != ranked[sum(tier_sizes) - 1]["tier"]:
            tier_sizes.append(0)
        tier_sizes[-1] += 1

    # QBs hold their slots. In a 1QB league a quarterback's rank is set by scarcity,
    # not by whether his points are comparable to the flex player beside him, and
    # PPR does not change how many starting QB jobs there are. Re-ranking them on
    # the flex value curve dropped Lamar Jackson 36 spots for catching no passes,
    # which is an artifact of the curve, not a full-PPR effect. Only RB/WR/TE
    # re-sort, and they re-sort into the slots QBs are not holding.
    qb_slots = {p["rank"]: p for p in ranked if p["pos"] == "QB"}
    # Ties break on his original rank, so his opinion still decides a coin flip.
    flex = sorted(flex_order, key=lambda p: (-p["score"], p["rank"]))
    # Walk the ranks the board ACTUALLY carries, not 1..N. The 2026-08-30 board skips 94
    # (that row fell between his two screenshots), and assuming a contiguous range silently
    # shifted every QB slot by one and then ran the flex iterator dry.
    order, feed = [], iter(flex)
    for slot in sorted(p["rank"] for p in ranked):
        order.append(qb_slots[slot] if slot in qb_slots else next(feed))

    pos_n: dict[str, int] = {}
    cuts, at = [], 0
    for size in tier_sizes:
        at += size
        cuts.append(at)
    # Carry the board's OWN rank numbers, not 1..N. This is a re-ordering of his slots, so the
    # set of slots must come out identical; renumbering contiguously over the missing 94 shifted
    # every player after it up one and broke the promise that a QB holds his slot.
    slot_numbers = sorted(p["rank"] for p in ranked)
    for i, p in enumerate(order):
        p["newRank"] = slot_numbers[i]
        # Tier cuts are cumulative COUNTS, so they index by position in the order, not by the
        # slot number. Those two stopped being the same thing once the board carried a gap.
        p["newTier"] = next(t for t, cut in enumerate(cuts, 1) if i + 1 <= cut)
        pos_n[p["pos"]] = pos_n.get(p["pos"], 0) + 1
        p["newPosRank"] = pos_n[p["pos"]]
        p["move"] = p["rank"] - p["newRank"]
    return order, board


def main() -> None:
    # Every label follows the board it was derived from, so a new Gibbs board does
    # not leave a file named after the previous one claiming the previous depth.
    ranked, board = build()
    out_csv = SRC_DIR / f"jacob-gibbs-{board['updatedAt']}-fullppr.csv"
    with out_csv.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["RK", "TIERS", "PLAYER NAME", "TEAM", "POS", "BYE",
                    "HALF_PPR_RK", "MOVE", "PROJ_REC"])
        for p in ranked:
            w.writerow([p["newRank"], p["newTier"], p["name"], p["team"],
                        f'{p["pos"]}{p["newPosRank"]}', p["bye"], p["rank"],
                        f'{p["move"]:+d}', round(p["rec"], 1)])

    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    entry = {
        "id": SOURCE_ID,
        "label": "Gibbs*",
        "expert": "Jacob Gibbs, full-PPR adaptation",
        "title": f"{board['title'].replace(' (Half-PPR)', '')} re-scored for 1.0 PPR"
                 " (derived, not his published board)",
        "url": "https://www.cbssports.com/fantasy/football/news/jacob-gibbs-rankings-fantasy-football-2026-half-ppr/",
        "updatedAt": board["updatedAt"],
        "scope": "overall",
        "dateSuffix": True,
        # On by default: every league here is full PPR, so this is the column that
        # answers the question. His published half-PPR column stays on beside it.
        "defaultEnabled": True,
        "players": [{
            "rank": p["newRank"], "tier": p["newTier"], "name": p["name"],
            "team": p["team"], "pos": p["pos"], "posRank": p["newPosRank"],
            "bye": p["bye"], "halfPprRank": p["rank"], "move": p["move"],
            "projRec": round(p["rec"], 1), "sleeperId": p["sleeperId"],
        } for p in ranked],
    }
    sources = [s for s in sources if s["id"] != SOURCE_ID] + [entry]
    SOURCES.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    moves = sorted(ranked, key=lambda p: -p["move"])
    shifted = [abs(p["move"]) for p in ranked]
    tier_moves = sum(1 for p in ranked if p["newTier"] != p["tier"])
    two_plus = sum(1 for p in ranked if abs(p["newTier"] - p["tier"]) > 1)
    print(f"Wrote {out_csv.name} and registered {SOURCE_ID} ({len(ranked)} players)")
    print(f"median move {sorted(shifted)[len(shifted)//2]}, max {max(shifted)}, "
          f"{sum(1 for m in shifted if m == 0)} unchanged")
    print(f"tier changed for {tier_moves}, moved more than one tier: {two_plus}")
    print("up:   " + ", ".join(f'{p["name"]} {p["rank"]} to {p["newRank"]}' for p in moves[:6]))
    print("down: " + ", ".join(f'{p["name"]} {p["rank"]} to {p["newRank"]}' for p in moves[-6:]))


if __name__ == "__main__":
    main()
