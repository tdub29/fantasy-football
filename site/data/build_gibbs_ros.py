"""Build site/data/gibbs-ros.js from Jacob Gibbs's REST OF SEASON positional boards.

A different artifact from build_jacob_gibbs.py, deliberately. That one owns his
OVERALL draft board: one list, tiers, an overall rank per player. This is the
rest-of-season board he posts to X, which is POSITIONAL (RB 1-70, WR 1-77, and
so on), carries no tiers, and updates weekly. Forcing the two into one file
would mean inventing an overall rank he never published.

Provenance, because a rank with no provenance is a rumour:
  * source is his own X posts, not FantasyPros. His FantasyPros board lagged by
    a day when this was captured, and the positional ROS boards only appear on X.
  * the images were transcribed by TWO independent readers and reconciled by
    code. The repo rule is that a rank only one reader saw is a capture gap to
    report, never a value to infer, so `readerAgreement` records how the two
    compared and any rank they split on is named.

SCORING WARNING, same as the overall board: he publishes HALF-PPR and all three
leagues here are full PPR. These ranks are his, and they are not directly a
full-PPR board. Do not derive one and present it as his.

Usage:
    python site/data/build_gibbs_ros.py <reconciled.json>
    python site/data/build_gibbs_ros.py --self-check
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAYERS_PATH = ROOT / "players-nfl.json"
OUTPUT_PATH = ROOT / "site" / "data" / "gibbs-ros.js"
OFFENSE = {"QB", "RB", "WR", "TE"}
NAME_ALIASES = {"Hollywood Brown": "Marquise Brown"}
# Sleeper's codes, for the match only. The board keeps whatever he printed.
TEAM_ALIASES = {"JAC": "JAX", "WSH": "WAS", "LA": "LAR"}


def norm(value: str) -> str:
    value = (value or "").lower().replace(".", "").replace("'", "")
    value = re.sub(r"\s+(jr|sr|iii|ii|iv)\b", "", value)
    return re.sub(r"[^a-z0-9 -]", "", re.sub(r"\s+", " ", value)).strip()


def sleeper_index() -> dict:
    players = json.loads(PLAYERS_PATH.read_text(encoding="utf-8"))
    index: dict[str, list] = {}
    for pid, p in players.items():
        name = p.get("full_name") or p.get("name")
        if name:
            index.setdefault(norm(name), []).append((pid, p))
    return index


def sleeper_id(name: str, pos: str, team: str, index: dict) -> str | None:
    cands = index.get(norm(NAME_ALIASES.get(name, name)), [])
    team = TEAM_ALIASES.get(team, team)
    if len(cands) == 1:
        return cands[0][0]
    for pid, p in cands:
        poss = {p.get("position"), *(p.get("fantasy_positions") or [])}
        if pos in poss and (not team or p.get("team") == team):
            return pid
    for pid, p in cands:
        poss = {p.get("position"), *(p.get("fantasy_positions") or [])}
        if pos in poss:
            return pid
    return None


def build(src: dict, index: dict) -> dict:
    out = {
        "source": src.get("source", "Jacob Gibbs (@jagibbs_23)"),
        "board": "rest-of-season",
        "format": "half_ppr",
        "postedAt": src["posted"],
        "capturedAt": src["captured"],
        "provenance": src.get("provenance", ""),
        "scoringWarning": ("He publishes HALF-PPR. All three leagues here are full PPR, "
                           "so this is his board and not a full-PPR board. A derived "
                           "full-PPR version must never be presented as his."),
        "positions": {},
    }
    for pos, rows in src["positions"].items():
        if pos not in OFFENSE:
            raise ValueError(f"unexpected position {pos}")
        ranks = [r["rank"] for r in rows]
        if ranks != list(range(1, len(rows) + 1)):
            missing = sorted(set(range(1, max(ranks) + 1)) - set(ranks))
            raise ValueError(f"{pos} ranks are not 1..{len(rows)}; missing {missing}")
        out["positions"][pos] = [{
            "rank": r["rank"], "name": r["player"], "team": r["team"],
            "bye": r.get("bye"), "ecr": r.get("ecr"), "vsEcr": r.get("vsEcr"),
            "sleeperId": sleeper_id(r["player"], pos, r["team"], index),
        } for r in rows]
    return out


def self_check() -> int:
    """The two things that would silently corrupt a board: a rank gap slipping
    through, and a positional board being read as an overall one."""
    idx = {norm("Jahmyr Gibbs"): [("1", {"position": "RB", "team": "DET"})]}
    good = {"posted": "2026-09-18", "captured": "2026-09-19",
            "positions": {"RB": [
                {"rank": 1, "player": "Jahmyr Gibbs", "team": "DET", "bye": 6, "ecr": 1, "vsEcr": 0},
                {"rank": 2, "player": "Bijan Robinson", "team": "ATL", "bye": 11, "ecr": 2, "vsEcr": 0}]}}
    b = build(good, idx)
    assert b["positions"]["RB"][0]["sleeperId"] == "1"
    assert b["positions"]["RB"][1]["sleeperId"] is None      # unmatched stays null, never guessed
    assert b["format"] == "half_ppr"

    # A hole in the ranks must raise, not renumber. This is the capture-gap rule
    # in code: 1,2,4 means rank 3 was never read, and inventing it is the failure.
    bad = {"posted": "x", "captured": "y", "positions": {"RB": [
        {"rank": 1, "player": "A", "team": "DET"}, {"rank": 2, "player": "B", "team": "ATL"},
        {"rank": 4, "player": "C", "team": "SF"}]}}
    try:
        build(bad, idx)
    except ValueError as e:
        assert "missing [3]" in str(e), str(e)
    else:
        raise AssertionError("a rank gap was accepted")

    # Positions are per-position lists, so RB1 and WR1 coexist. An overall board
    # would reject that as a duplicate rank; this one must not.
    two = {"posted": "x", "captured": "y", "positions": {
        "RB": [{"rank": 1, "player": "A", "team": "DET"}],
        "WR": [{"rank": 1, "player": "B", "team": "CIN"}]}}
    t = build(two, idx)
    assert t["positions"]["RB"][0]["rank"] == t["positions"]["WR"][0]["rank"] == 1
    print("build_gibbs_ros self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path, nargs="?")
    ap.add_argument("--output", type=Path, default=OUTPUT_PATH)
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()
    if not a.input:
        ap.error("input json required")
    src = json.loads(a.input.read_text(encoding="utf-8"))
    data = build(src, sleeper_index())
    a.output.write_text(
        "// Generated by build_gibbs_ros.py from his X posts. Half-PPR. Do not edit.\n"
        "window.GIBBS_ROS=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    for pos, rows in data["positions"].items():
        matched = sum(bool(r["sleeperId"]) for r in rows)
        print(f"  {pos}: {len(rows)} ranked, {matched} matched to Sleeper")
        miss = [r["name"] for r in rows if not r["sleeperId"]]
        if miss:
            print(f"     unmatched: {', '.join(miss[:8])}")
    print(f"wrote {a.output.relative_to(ROOT)} ({a.output.stat().st_size/1024:.0f} KB), "
          f"posted {data['postedAt']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
