"""Build his rest-of-season (default) or weekly board from FantasyPros.

`--board week` writes gibbs-week.js from his weekly board. That replaced the CBS
scrape on 2026-09-24: his "Week 3 - FLEX Top-100 Fantasy Football Rankings
(PPR)" post on X that afternoon matched this board 94 of 100 exact (the other
six are edits he made after posting, per the FantasyPros stamp), while the CBS
page, stamped "Updated 1m ago", sat a mean 11 flex spots off it (Saquon Barkley
RB11 on his post, RB39 on CBS). CBS lags; this does not.

FantasyPros DOES carry a rest-of-season board for him, which is easy to
conclude it does not. Two traps:

  * `experts_available.included` on the ROS endpoint lists five experts and he
    is not one of them. That list is not the answer to "does he have a board".
  * `filters=1576` is SILENTLY IGNORED on this API. A nonexistent expert id
    returns a byte-identical board, so a naive filtered call hands back the
    CONSENSUS and it looks exactly like a personal board. `filters=1576:1576`
    is the form that works, and `total_experts == 1` coming back is the proof
    it was honored. That check is not optional: without it this script would
    publish consensus ranks under his name.

Verified his: the half-PPR ROS board matched a two-reader transcription of his
own 2026-09-18 X board 25 of 25 on the top 25 RBs.

SCORING. He maintains the HALF-PPR board. The PPR one lags (RB stamped 9/15
against half-PPR's 9/18) and diverges materially, having Kenneth Walker RB10
where he himself was saying RB2, so it is not "his board in PPR" and is not
used. Every league here is full PPR, so the column still carries a caveat; it
is his opinion in his scoring, not a rescored board.

FRESHNESS. Even the half-PPR board trails his own per-player posts, which is
why refresh_gibbs_ros.py runs after this and layers those on top. Order
matters: fetch the deep board, then apply the newer statements.

    python site/data/build_gibbs_ros_fp.py
    python site/data/build_gibbs_ros_fp.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "projections"))
from build_gibbs_ros import build, sleeper_index  # noqa: E402

EXPERT_ID = 1576
SEASON = 2026
SCORING = "HALF"
POSITIONS = ("QB", "RB", "WR", "TE")
OUTPUT = ROOT / "site" / "data" / "gibbs-ros.js"
WEEK_OUTPUT = ROOT / "site" / "data" / "gibbs-week.js"
HEADERS = {
    "x-api-key": "zjxN52G3lP4fORpHRftGI2mTU8cTwxVNvkjByM3j",
    "Origin": "https://www.fantasypros.com",
    "Referer": "https://www.fantasypros.com/",
    "User-Agent": "Mozilla/5.0",
}
# His board runs 35 to 104 a position. Well under this and something is wrong.
MIN_ROWS = 20


def api(position: str, scoring: str = SCORING, week: int = 0) -> dict:
    query = {
        "type": "weekly" if week else "ros", "scoring": scoring,
        "position": position, "week": week,
        "sport": "NFL", "experts": "available",
        # id:id, not id. See the module docstring: the bare form is ignored.
        "filters": f"{EXPERT_ID}:{EXPERT_ID}",
    }
    url = (f"https://api.fantasypros.com/public/v2/json/nfl/{SEASON}"
           f"/consensus-rankings?{urllib.parse.urlencode(query)}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def one_expert(payload: dict, position: str) -> list[dict]:
    """Rows for a single expert, or refuse. Never fall back to consensus."""
    total = int(payload.get("total_experts") or 0)
    if total != 1:
        raise SystemExit(
            f"{position}: FantasyPros returned total_experts={total}, so the "
            f"expert filter was not honored and these are CONSENSUS ranks, not "
            f"his. Refusing to write them under his name.")
    rows = payload.get("players") or []
    if len(rows) < MIN_ROWS:
        raise SystemExit(f"{position}: only {len(rows)} rows, expected "
                         f"{MIN_ROWS}+; the feed or the filter changed.")
    return [{
        "rank": int(p["rank_ecr"]),
        "player": p["player_name"],
        "team": p.get("player_team_id") or "",
        "bye": int(p["player_bye_week"]) if str(p.get("player_bye_week") or "").isdigit() else None,
        # "at WAS" / "vs. NYJ" -> "@WAS" / "NYJ", the form the week column shows.
        "opp": opp_code(p.get("player_opponent")),
    } for p in rows]


def opp_code(text: str | None) -> str | None:
    if not text:
        return None
    team = text.split()[-1]
    return f"@{team}" if text.lower().startswith("at") else team


def collect(week: int = 0) -> tuple[dict, dict, str | None]:
    """Rows and FantasyPros "M/DD" stamps per position, plus the newest stamp as
    an ISO date from last_updated_ts (a text max() on "M/DD" puts 9/30 after
    10/01)."""
    positions, stamps, newest_ts = {}, {}, 0
    for pos in POSITIONS:
        payload = api(pos, week=week)
        rows = one_expert(payload, pos)
        rows.sort(key=lambda r: r["rank"])
        # The API's rank_ecr is his rank and should already be 1..n. Renumber
        # only to close a gap the feed leaves, never to reorder.
        for i, r in enumerate(rows, 1):
            r["rank"] = i
        positions[pos] = rows
        stamps[pos] = payload.get("last_updated")
        newest_ts = max(newest_ts, int(payload.get("last_updated_ts") or 0))
        print(f"  {pos}: {len(rows)} ranked, FantasyPros stamp {stamps[pos]}")
    newest = (dt.datetime.fromtimestamp(newest_ts, dt.timezone.utc).date().isoformat()
              if newest_ts else None)
    return positions, stamps, newest


def self_check() -> int:
    """The one guard that matters: a consensus payload must be refused."""
    good = {"total_experts": 1, "players": [
        {"rank_ecr": i + 1, "player_name": f"P{i}", "player_team_id": "DET",
         "player_bye_week": "6"} for i in range(MIN_ROWS)]}
    rows = one_expert(good, "RB")
    assert len(rows) == MIN_ROWS and rows[0]["bye"] == 6, rows[0]

    # total_experts > 1 means the filter was ignored and the payload is the
    # consensus. Publishing that under his name is the failure this prevents.
    for bad_total in (0, 2, 177):
        try:
            one_expert({"total_experts": bad_total, "players": good["players"]}, "RB")
        except SystemExit as e:
            assert "CONSENSUS" in str(e), e
        else:
            raise AssertionError(f"total_experts={bad_total} was accepted")

    # A suspiciously short board is refused rather than shipped.
    try:
        one_expert({"total_experts": 1, "players": good["players"][:3]}, "RB")
    except SystemExit as e:
        assert "expected" in str(e), e
    else:
        raise AssertionError("a 3-row board was accepted")

    # A non-numeric bye must not crash or become 0.
    odd = one_expert({"total_experts": 1, "players": [
        dict(p, player_bye_week="") for p in good["players"]]}, "RB")
    assert odd[0]["bye"] is None, odd[0]
    assert opp_code("at WAS") == "@WAS" and opp_code("vs. NYJ") == "NYJ"
    assert opp_code(None) is None
    print("build_gibbs_ros_fp self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", choices=("ros", "week"), default="ros")
    ap.add_argument("--output", type=pathlib.Path)
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()
    if a.board == "week":
        return main_week(a.output or WEEK_OUTPUT)
    a.output = a.output or OUTPUT

    print(f"Jacob Gibbs (expert {EXPERT_ID}) rest-of-season, {SCORING}-PPR")
    positions, stamps, newest = collect()

    src = {
        "source": "Jacob Gibbs (@jagibbs_23)",
        "board": "rest-of-season",
        "posted": newest or dt.date.today().isoformat(),
        "captured": dt.date.today().isoformat(),
        "scoringByPosition": {p: "half_ppr" for p in positions},
        "provenance": (
            f"His own rest-of-season board on FantasyPros (expert {EXPERT_ID}), "
            f"pulled per position with filters={EXPERT_ID}:{EXPERT_ID} and "
            f"accepted only when the response came back total_experts=1. That "
            f"check is the point: the bare filters={EXPERT_ID} form is silently "
            f"ignored by this API and returns the CONSENSUS board, which is "
            f"indistinguishable from a personal one by eye. Validated against a "
            f"two-reader transcription of his 2026-09-18 X board: the top 25 RBs "
            f"matched 25 of 25. HALF-PPR because that is the board he maintains; "
            f"his PPR rest-of-season board lags it and disagrees with his own "
            f"posts, so it is not used. Position stamps: "
            + ", ".join(f"{p} {s}" for p, s in stamps.items() if s) + "."),
        "positions": positions,
    }
    data = build(src, sleeper_index())
    data["fpStamps"] = stamps
    data["fpScoring"] = SCORING

    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    a.output.write_text(
        "// Generated by build_gibbs_ros_fp.py from his FantasyPros board. Do not edit.\n"
        f"window.GIBBS_ROS={body};\n", encoding="utf-8")
    for pos, rows in data["positions"].items():
        matched = sum(bool(r["sleeperId"]) for r in rows)
        print(f"  {pos}: {len(rows)} ranked, {matched} matched to Sleeper")
        miss = [r["name"] for r in rows if not r["sleeperId"]]
        if miss:
            print(f"     unmatched: {', '.join(miss[:8])}")
    if data.get("teamMismatches"):
        print(f"  {len(data['teamMismatches'])} team code(s) differ from Sleeper:")
        for m in data["teamMismatches"][:6]:
            print(f"     {m}")
    print(f"wrote {a.output.name} ({a.output.stat().st_size / 1024:.0f} KB)")
    return 0


def current_week() -> int:
    raw = (ROOT / "site" / "data" / "weekly-rankings.js").read_text(encoding="utf-8")
    import re
    return int(re.search(r'"currentWeek":\s*(\d+)', raw).group(1))


def main_week(output: pathlib.Path) -> int:
    week = current_week()
    print(f"Jacob Gibbs (expert {EXPERT_ID}) week {week}, FantasyPros {SCORING} board")
    positions, stamps, newest = collect(week)
    # The flex board is the one he posts; it gives the cross-position order.
    flex = one_expert(api("FLX", week=week), "FLX")
    flex_rank = {(r["player"], r["team"]): i for i, r in
                 enumerate(sorted(flex, key=lambda r: r["rank"]), 1)}
    # Scoring, re-audited 2026-10-08: RB, WR and TE are HALF-PPR. His week 4
    # cards are headed half-PPR, and his week 5 X cards (no header) match this
    # HALF board exactly (RB 22/22, WR 20/20) and his separate FantasyPros PPR
    # board only 4/22 and 7/20. That PPR board is his too, but it is a separate
    # opinion, not a stale copy (TE PPR and HALF saved in the same second still
    # agree on only 15 of 34), and his cards follow HALF, so it is not used;
    # build_gibbs_ppr.py converts this
    # one and the site stars it. QB: HALF and PPR are the same 32 in the same
    # order under one stamp, and QBs catch nothing, so QB is labelled PPR.
    scoring = {p: ("ppr" if p == "QB" else "half_ppr") for p in positions}
    src = {
        "source": "Jacob Gibbs (@jagibbs_23)",
        "board": "week",
        "posted": dt.date.today().isoformat(),
        "captured": dt.date.today().isoformat(),
        "scoringByPosition": scoring,
        "provenance": (
            f"His own week {week} board on FantasyPros (expert {EXPERT_ID}), "
            f"pulled per position with filters={EXPERT_ID}:{EXPERT_ID} and "
            f"accepted only when total_experts=1. It is the board he posts: his "
            f"week 5 X cards (2026-10-08) matched it exactly. RB, WR and TE are "
            f"his HALF-PPR ranks (FantasyPros files them as half-PPR and his "
            f"week 4 cards say half-PPR); the site shows a PPR conversion. QB "
            f"is identical on his PPR board. Superseded claim: his 9/24 flex "
            f"post titled PPR matched it 94 of 100, but his separate PPR board "
            f"now differs. Position stamps: "
            + ", ".join(f"{p} {s}" for p, s in stamps.items() if s) + "."),
        "positions": positions,
    }
    data = build(src, sleeper_index())
    for pos, built in data["positions"].items():
        for row in built:
            row["flexRank"] = flex_rank.get((row["name"], row["team"]))
    data["fpStamps"] = stamps
    data["fpScoring"] = SCORING
    # The site hides this column when this is not its current week, so a
    # failed Tuesday refresh cannot show week 3 ranks beside week 4 numbers.
    data["week"] = week
    data["updatedLabel"] = f"FantasyPros stamp {newest}" if newest else None
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    output.write_text(
        "// Generated by build_gibbs_ros_fp.py --board week from his FantasyPros board. Do not edit.\n"
        f"window.GIBBS_WEEK={body};\n", encoding="utf-8")
    for pos, rows in data["positions"].items():
        matched = sum(bool(r["sleeperId"]) for r in rows)
        print(f"  {pos}: {len(rows)} ranked, {matched} matched to Sleeper ({scoring[pos]})")
    print(f"wrote {output.name} ({output.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
