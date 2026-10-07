"""Cross-reference his week board (FantasyPros, was CBS until 2026-09-24) against his own X posts.

Two independent publications of the same person's rankings. If they agree, the
scrape is pointed at the right analyst and the right week. If they diverge, one
of four things happened and all of them matter:

  * the source now resolves to a different analyst (CBS until 2026-09-24,
    his FantasyPros board since);
  * the page is serving a stale or a future week;
  * the parser is mis-reading the positional-rank column;
  * he genuinely revised between posting the card and updating the board.

Only the last is benign, and it shows up as a small number of adjacent-rank
moves rather than as wholesale disagreement. That is why this reports the shape
of the disagreement instead of a single pass/fail number.

Scope note: it compares the overlap only, and QB only when a capture has one.

Scoring note: his early-look cards say HALF-PPR and his flex post says PPR, yet
both match the same FantasyPros board, so a move here is a revision or a wrong
board, never scoring. The tolerance below is about catching a WRONG BOARD, not
about policing his opinion.

    python site/data/check_gibbs_sources.py
    python site/data/check_gibbs_sources.py --self-check
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_gibbs_ros import norm  # noqa: E402

BOARD = ROOT / "site" / "data" / "gibbs-week.js"
CAPTURES = ROOT / "site" / "data" / "gibbs-x-captures"
# How far a player may move between the two publications before it stops
# looking like half-PPR versus PPR and starts looking like the wrong board.
MAX_MOVE = 4
# And how much of the overlap may move at all. One or two revisions is normal;
# most of the list shifting means the sources are not the same rankings.
MAX_MOVED_SHARE = 0.34
# Below this the share is noise, not a signal. His cards are a top 12.
MIN_SHARE_SAMPLE = 8


def load_board(path: pathlib.Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("{"):raw.rindex("}") + 1])


def newest_capture(folder: pathlib.Path) -> pathlib.Path | None:
    files = sorted(p for p in folder.glob("*.json")
                   if not re.search(r"\.(reader\d+|overlay)\.json$", p.name))
    return files[-1] if files else None


def compare(board: dict, capture: dict) -> dict:
    """Per position: agreement on the overlap, and every row that moved."""
    out = {}
    for pos, card_rows in (capture.get("positions") or {}).items():
        live = (board.get("positions") or {}).get(pos) or []
        if not live:
            out[pos] = {"skipped": "not on the scraped board"}
            continue
        # Compare by PLAYER, not by rank slot: "who does he have at RB3" and
        # "where does he have Bijan" fail differently, and the second is the
        # one that tells you the board is wrong.
        live_rank = {norm(r["name"]): r["rank"] for r in live}
        depth = len(card_rows)
        moves, missing = [], []
        for row in card_rows:
            key = norm(row["player"])
            if key not in live_rank:
                missing.append(row["player"])
                continue
            delta = live_rank[key] - row["rank"]
            if delta:
                moves.append((row["player"], row["rank"], live_rank[key], delta))
        out[pos] = {
            "compared": depth - len(missing),
            "depth": depth,
            "missing": missing,
            "moves": sorted(moves, key=lambda m: -abs(m[3])),
            "exact": depth - len(missing) - len(moves),
        }
    return out


def report(result: dict, board_newer: bool = False) -> int:
    """board_newer: the board was stamped after the card was posted, so moves are
    his own later edits (news, injuries), not a mis-pointed scrape. Moves then
    warn; a card player missing from the board still fails."""
    bad = 0
    level = "WARN" if board_newer else "FAIL"
    for pos, r in sorted(result.items()):
        if "skipped" in r:
            print(f"  {pos}: skipped, {r['skipped']}")
            continue
        n = r["compared"]
        print(f"  {pos}: {r['exact']}/{n} identical"
              + (f", {len(r['moves'])} moved" if r["moves"] else "")
              + (f", {len(r['missing'])} not on the scraped board" if r["missing"] else ""))
        for name, card, live, d in r["moves"][:6]:
            flag = "  <-- beyond tolerance" if abs(d) > MAX_MOVE else ""
            print(f"       {name}: card {pos}{card} -> board {pos}{live} ({d:+d}){flag}")
        for name in r["missing"][:6]:
            print(f"       {name}: on his card, absent from the scrape")
        far = [m for m in r["moves"] if abs(m[3]) > MAX_MOVE]
        if far:
            print(f"     {level} {pos}: {len(far)} player(s) moved more than {MAX_MOVE} spots")
            bad += not board_newer
        # A share ceiling needs a sample. On three rows a single adjacent swap
        # is 67% "moved" and means nothing; the real overlap is a top 12.
        if n >= MIN_SHARE_SAMPLE and len(r["moves"]) / n > MAX_MOVED_SHARE:
            print(f"     {level} {pos}: {len(r['moves'])}/{n} of the overlap moved, "
                  f"over the {MAX_MOVED_SHARE:.0%} ceiling")
            bad += not board_newer
        if r["missing"]:
            print(f"     FAIL {pos}: a player he ranked top-{r['depth']} is not on "
                  f"the scraped board at all")
            bad += 1
    return bad


def self_check() -> int:
    card = {"positions": {"RB": [
        {"rank": 1, "player": "Jahmyr Gibbs", "team": "DET"},
        {"rank": 2, "player": "Bijan Robinson", "team": "ATL"},
        {"rank": 3, "player": "Derrick Henry", "team": "BAL"}]}}

    same = {"positions": {"RB": [
        {"rank": 1, "name": "Jahmyr Gibbs"}, {"rank": 2, "name": "Bijan Robinson"},
        {"rank": 3, "name": "Derrick Henry"}]}}
    r = compare(same, card)["RB"]
    assert r["exact"] == 3 and not r["moves"] and not r["missing"], r

    # A one-spot swap is the half-PPR versus PPR case and must pass.
    swap = {"positions": {"RB": [
        {"rank": 1, "name": "Bijan Robinson"}, {"rank": 2, "name": "Jahmyr Gibbs"},
        {"rank": 3, "name": "Derrick Henry"}]}}
    assert report(compare(swap, card)) == 0

    # A player he ranks top-3 being absent means the scrape is not his board.
    gone = {"positions": {"RB": [
        {"rank": 1, "name": "Jahmyr Gibbs"}, {"rank": 2, "name": "Bijan Robinson"},
        {"rank": 3, "name": "Someone Else"}]}}
    assert report(compare(gone, card)) > 0

    # A big move is the wrong-analyst signature.
    far = {"positions": {"RB": [{"rank": 1, "name": "Jahmyr Gibbs"},
                                {"rank": 2, "name": "Bijan Robinson"},
                                {"rank": 30, "name": "Derrick Henry"}]}}
    assert report(compare(far, card)) > 0
    # ...unless the board is newer than the card: then it is his own later edit.
    assert report(compare(far, card), board_newer=True) == 0
    assert report(compare(gone, card), board_newer=True) > 0

    # A position the scrape does not carry is skipped, never counted as a pass.
    qb = {"positions": {"QB": [{"rank": 1, "player": "Josh Allen", "team": "BUF"}]}}
    assert "skipped" in compare({"positions": {}}, qb)["QB"]
    print("check_gibbs_sources self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", type=pathlib.Path, default=BOARD)
    ap.add_argument("--capture", type=pathlib.Path)
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()

    cap_path = a.capture or newest_capture(CAPTURES)
    if not cap_path:
        print(f"no archived X capture in {CAPTURES.relative_to(ROOT)}; "
              f"nothing to cross-reference against. Not a failure, but the "
              f"scrape is then trusting one source.")
        return 0
    board = load_board(a.board)
    capture = json.loads(cap_path.read_text(encoding="utf-8"))
    # A card from another week is a different ranking, not a wrong board.
    cap_week = re.search(r"week-?(\d+)", str(capture.get("board") or cap_path.name))
    if cap_week and board.get("week") and int(cap_week.group(1)) != int(board["week"]):
        print(f"newest X capture ({cap_path.name}) is week {cap_week.group(1)}, board is "
              f"week {board['week']}; no same-week card to cross-reference. Not a "
              f"failure; archive his week {board['week']} card to re-arm the check.")
        return 0
    print(f"Week board ({board.get('board')}, {board.get('updatedLabel')}) "
          f"vs his X cards ({cap_path.name}, {capture.get('posted')})")
    stamp = re.search(r"\d{4}-\d{2}-\d{2}", str(board.get("updatedLabel") or ""))
    board_newer = bool(stamp and capture.get("posted") and stamp.group(0) > capture["posted"])
    if board_newer:
        print(f"  board stamped {stamp.group(0)}, after the card; moves are his later edits")
    bad = report(compare(board, capture), board_newer)
    print("\n" + ("SOURCES AGREE" if not bad else
                  f"{bad} position(s) disagree beyond tolerance; the scrape may "
                  f"be pointed at the wrong analyst, week, or column"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
