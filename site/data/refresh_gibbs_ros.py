"""Keep his rest-of-season board current from his own X posts, no OCR.

FantasyPros does NOT carry a rest-of-season board for him. Only five experts
file one there and he is not among them (he files weekly, expert 1576), and CBS
has no ROS board for him either: ?period=ros and the top200 URL both serve the
identical weekly list. So the ROS column has exactly one source, his X posts,
and between full-board posts it goes stale silently.

It does not have to. His "Beyond the Box Score" posts carry the new rank in
PLAIN TEXT, one player at a time:

    Beyond the Box Score - Week 2
    De'Von Achane, Miami Dolphins
    RB Archetype - RB1 BELL-COW
    Rest of season Fantasy Football rank - RB12

That is parseable with no transcription and no second reader, because nothing
was read off an image. Measured 2026-09-22 against a 2026-09-18 board: 9 of 11
named backs had moved, one of them by 7 spots.

A rank is a POSITION IN AN ORDER, not a field. Writing RB2 onto a player who
was RB5 without moving anyone else produces two RB2s and no RB5. So the board
is rebuilt: pull the named players out of the sequence, re-insert each at the
rank he stated (ascending, so earlier insertions do not shift later targets),
renumber, then assert every stated rank actually landed.

    python site/data/refresh_gibbs_ros.py
    python site/data/refresh_gibbs_ros.py --posts cached.json
    python site/data/refresh_gibbs_ros.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKSPACE = ROOT.parent
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_gibbs_ros import norm  # noqa: E402

BOARD = ROOT / "site" / "data" / "gibbs-ros.js"
XSCRIPT = WORKSPACE / ".agents" / "scripts" / "x.ps1"
HANDLE = "@jagibbs_23"
POSTS = 40

RANK_RE = re.compile(
    r"Rest of season Fantasy Football rank\s*[-–—]\s*([A-Z]{2})(\d+)")
ARCHETYPE_RE = re.compile(r"Archetype\s*[-–—]\s*(.+)")


def fetch_posts(n: int = POSTS) -> list[dict]:
    """His recent posts via the workspace X helper. Key-free, no browser."""
    out = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         str(XSCRIPT), "user-posts", HANDLE, "-n", str(n), "--json"],
        capture_output=True, text=True, timeout=300, cwd=str(WORKSPACE))
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:300] or "x.ps1 failed")
    return json.loads(out.stdout)["data"]


def updates_from(posts: list[dict]) -> list[dict]:
    """One update per post that states a rest-of-season rank."""
    found = []
    for post in posts:
        text = post.get("text") or ""
        m = RANK_RE.search(text)
        if not m:
            continue
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        # Line 1 is the "Beyond the Box Score" header, line 2 is
        # "Player Name, Team". Take the name before the comma.
        name = next((ln.split(",")[0].strip() for ln in lines[1:]
                     if "," in ln and "rank" not in ln.lower()), None)
        if not name:
            continue
        arch = ARCHETYPE_RE.search(text)
        found.append({
            "player": name,
            "pos": m.group(1),
            "rank": int(m.group(2)),
            "at": post.get("createdAtISO") or post.get("createdAtLocal"),
            "archetype": arch.group(1).strip() if arch else None,
            "postId": post.get("id"),
        })
    # Newest wins if he restated a player. Sorting oldest-first and letting a
    # later entry overwrite is how "moved ahead of Skattebo after MNF" lands.
    found.sort(key=lambda u: (u["at"] or ""))
    latest: dict[tuple[str, str], dict] = {}
    for u in found:
        latest[(u["pos"], norm(u["player"]))] = u
    return sorted(latest.values(), key=lambda u: (u["pos"], u["rank"]))


def reorder(rows: list[dict], moves: list[dict]) -> tuple[list[dict], list[str]]:
    """Re-seat the named players at their stated ranks and renumber.

    Ascending target order matters: inserting RB2 before RB10 keeps RB10's
    target meaningful, because the earlier insertion has already shifted the
    tail exactly once.
    """
    by_key = {norm(r["name"]): r for r in rows}
    unknown = [m["player"] for m in moves if norm(m["player"]) not in by_key]
    named = {norm(m["player"]) for m in moves}
    rest = [r for r in rows if norm(r["name"]) not in named]
    for m in sorted((m for m in moves if norm(m["player"]) in by_key),
                    key=lambda m: m["rank"]):
        row = dict(by_key[norm(m["player"])])
        row["rosAsOf"] = m["at"]
        if m.get("archetype"):
            row["archetype"] = m["archetype"]
        # A stated rank past the end of the list appends rather than erroring:
        # he can rank a player below everyone currently carried.
        rest.insert(min(m["rank"] - 1, len(rest)), row)
    for i, r in enumerate(rest, 1):
        r["rank"] = i
        # vsEcr was computed against the OLD rank. Recomputing it here would
        # invent a consensus comparison he never published, so it is dropped
        # for any row that moved and kept for every row that did not.
        if norm(r["name"]) in named:
            r["ecr"] = None
            r["vsEcr"] = None
    return rest, unknown


def apply(board: dict, updates: list[dict]) -> dict:
    changed = {}
    for pos, rows in board["positions"].items():
        moves = [u for u in updates if u["pos"] == pos]
        if not moves:
            continue
        before = {norm(r["name"]): r["rank"] for r in rows}
        new_rows, unknown = reorder(rows, moves)
        board["positions"][pos] = new_rows
        after = {norm(r["name"]): r["rank"] for r in new_rows}

        # The point of the whole exercise: every rank he stated must be the
        # rank he now holds. If insertion arithmetic is off by one, this is
        # what says so instead of shipping a plausible wrong order.
        for m in moves:
            k = norm(m["player"])
            if k in after and after[k] != m["rank"]:
                raise SystemExit(
                    f"{pos}: {m['player']} was set to {m['rank']} but landed at "
                    f"{after[k]}; the reinsertion is wrong, do not ship this board")
        ranks = [r["rank"] for r in new_rows]
        if ranks != list(range(1, len(new_rows) + 1)):
            raise SystemExit(f"{pos}: ranks are not 1..{len(new_rows)} after reorder")
        moved = [(r["name"], before[norm(r["name"])], r["rank"])
                 for r in new_rows
                 if norm(r["name"]) in before and before[norm(r["name"])] != r["rank"]]
        changed[pos] = {"stated": len(moves), "shifted": len(moved),
                        "unknown": unknown, "moved": moved}
    return changed


def self_check() -> int:
    rows = [{"name": n, "rank": i + 1} for i, n in enumerate("ABCDE")]

    # A promotion must push the men it passed DOWN, not duplicate a rank.
    out, unknown = reorder([dict(r) for r in rows],
                           [{"player": "D", "rank": 2, "at": "t"}])
    assert [r["name"] for r in out] == list("ADBCE"), [r["name"] for r in out]
    assert [r["rank"] for r in out] == [1, 2, 3, 4, 5]
    assert not unknown

    # Two moves at once, applied in ascending target order.
    out2, _ = reorder([dict(r) for r in rows],
                      [{"player": "E", "rank": 1, "at": "t"},
                       {"player": "D", "rank": 3, "at": "t"}])
    names = [r["name"] for r in out2]
    assert names.index("E") == 0 and names.index("D") == 2, names
    assert [r["rank"] for r in out2] == [1, 2, 3, 4, 5]

    # A rank past the end appends instead of raising.
    out3, _ = reorder([dict(r) for r in rows], [{"player": "A", "rank": 99, "at": "t"}])
    assert out3[-1]["name"] == "A", [r["name"] for r in out3]

    # A player not on the board is reported, never silently inserted.
    out4, unk = reorder([dict(r) for r in rows], [{"player": "Zed", "rank": 1, "at": "t"}])
    assert unk == ["Zed"] and len(out4) == 5, (unk, len(out4))

    # A stale vsEcr must not survive a move: it was computed against the old
    # rank and keeping it would state a consensus gap he never published.
    rows2 = [{"name": "A", "rank": 1, "ecr": 1, "vsEcr": 0},
             {"name": "B", "rank": 2, "ecr": 5, "vsEcr": 3}]
    out5, _ = reorder(rows2, [{"player": "B", "rank": 1, "at": "t"}])
    b = next(r for r in out5 if r["name"] == "B")
    assert b["vsEcr"] is None and b["ecr"] is None, b
    a = next(r for r in out5 if r["name"] == "A")
    assert a["vsEcr"] == 0, a               # untouched row keeps its comparison

    # Parsing: the rank is plain text, and the newest statement wins.
    posts = [
        {"id": "1", "createdAtISO": "2026-09-20T10:00:00+00:00",
         "text": "Beyond the Box Score - Week 2\n\nBreece Hall, New York Jets\n\n"
                 "RB Archetype - SPLIT BACKFIELD\n"
                 "Rest of season Fantasy Football rank - RB30"},
        {"id": "2", "createdAtISO": "2026-09-22T04:25:00+00:00",
         "text": "Beyond the Box Score - Week 2\n\nBreece Hall, New York Jets\n\n"
                 "RB Archetype - SPLIT BACKFIELD\n"
                 "Rest of season Fantasy Football rank - RB21 (moved ahead of "
                 "Cam Skattebo after MNF)"},
        {"id": "3", "createdAtISO": "2026-09-22T05:00:00+00:00",
         "text": "just a normal post with no ranking in it"},
    ]
    ups = updates_from(posts)
    assert len(ups) == 1, ups
    assert ups[0]["player"] == "Breece Hall" and ups[0]["rank"] == 21, ups[0]
    assert ups[0]["archetype"] == "SPLIT BACKFIELD", ups[0]
    print("refresh_gibbs_ros self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", type=pathlib.Path, default=BOARD)
    ap.add_argument("--posts", type=pathlib.Path, help="cached x.ps1 json")
    ap.add_argument("-n", type=int, default=POSTS)
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()

    if a.posts:
        posts = json.loads(a.posts.read_text(encoding="utf-8"))["data"]
    else:
        try:
            posts = fetch_posts(a.n)
        except Exception as exc:
            # A board that is four days old still beats no board, and saying
            # so beats a silent no-op that reads like "nothing changed".
            print(f"could not read his posts ({exc}); leaving the board as it is")
            return 0

    updates = updates_from(posts)
    if not updates:
        print(f"no rest-of-season rank statements in his last {len(posts)} posts; "
              f"board unchanged")
        return 0

    raw = a.board.read_text(encoding="utf-8")
    board = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    changed = apply(board, updates)
    if not changed:
        print(f"{len(updates)} update(s) found, none for a position this board "
              f"carries ({', '.join(board['positions'])}); unchanged")
        return 0

    newest = max(u["at"] or "" for u in updates)[:10]
    board["capturedAt"] = dt.date.today().isoformat()
    board["rosUpdatedThrough"] = newest
    board["provenance"] = (
        (board.get("provenance", "").rstrip() + " ")
        + f"Per-player rest-of-season updates were then applied from the plain "
          f"text of his \"Beyond the Box Score\" posts through {newest}: "
          f"{len(updates)} player(s) restated, no image and no transcription "
          f"involved. FantasyPros does not carry a rest-of-season board for him "
          f"and neither does CBS, so these posts are the only way this column "
          f"moves between full-board posts. Each restated player's ECR "
          f"comparison was dropped rather than recomputed against his new rank, "
          f"because that comparison is something he published, not something to "
          f"derive.").strip()

    for pos, c in changed.items():
        print(f"  {pos}: {c['stated']} restated, {c['shifted']} row(s) changed rank")
        for name, old, new in c["moved"][:10]:
            print(f"     {name}: {pos}{old} -> {pos}{new} ({new - old:+d})")
        for u in c["unknown"]:
            print(f"     {u}: restated but not on this board, so not inserted")

    body = json.dumps(board, ensure_ascii=False, separators=(",", ":"))
    a.board.write_text(
        "// Generated by build_gibbs_ros.py, refreshed by refresh_gibbs_ros.py "
        "from his X posts. Do not edit.\n"
        f"window.GIBBS_ROS={body};\n", encoding="utf-8")
    print(f"wrote {a.board.name}, rest-of-season current through {newest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
