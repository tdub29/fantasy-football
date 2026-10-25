"""Major injuries per player, for the value chart under each historical trade.

A major injury is an absence of 4+ team games (playoffs and later seasons count)
that starts at a game he played, with a body part on an injury report within three
weeks of that game. Neither source says this alone. A player on IR drops off the
weekly report, so Tank Dell's 2023 broken fibula shows up as a single "Questionable,
Calf" line before the game he broke it in. Snap counts say when he stopped playing;
the report says it was an injury and not a benching, a cut or a suspension.

The body part is named only from a listing AFTER that last game. A listing from the
week of the game was written before it was played (Dell's calf), so it proves an
injury but not which one, and the chart then says "Injury" rather than guess.

Output, lazy-loaded by the trade chart:
  window.MAJOR_INJURIES = {generated, players: {sleeper_id: [[YYYYMMDD, missed, part, out], ...]}}
  YYYYMMDD is the last game he played before the absence, missed the team games he sat,
  part a body part or "", out 1 when he has not played since.

    python projections/build_major_injuries.py
    python projections/build_major_injuries.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys

import pandas as pd

from build_injury_history import CACHE, INJ, ROOT, body_part, season_now

OUT = ROOT / "site" / "data" / "major-injuries.js"
FIRST = 2023  # first season with snap counts in the cache; KTC history starts 2023-03 too
MIN_MISSED = 4
EVIDENCE_WEEKS = 3
# The weekly report only names a body part. Where verified reporting names the injury
# itself, that wins, keyed (sleeper_id, last game YYYYMMDD). Cite the source per row.
NAMED = {
    # Report lists "Shoulder"; LaFleur confirmed a broken collarbone on the nullified TD
    # catch, surgery Sep 16 with the foot (SI, CBS, Pro Football Rumors, Sep 2025).
    ("10222", 20250911): "Broken collarbone",
}


def load_snaps() -> pd.DataFrame:
    parts = [pd.read_parquet(p, columns=["game_id", "pfr_game_id", "season", "week", "pfr_player_id", "team"])
             for y in range(FIRST, season_now() + 1) if (p := CACHE / f"snap_counts_{y}.parquet").exists()]
    if not parts:
        raise SystemExit(f"no snap_counts_YYYY.parquet in {CACHE}")
    d = pd.concat(parts, ignore_index=True).dropna(subset=["pfr_player_id"])
    d["date"] = d["pfr_game_id"].str[:8].astype(int)
    return d


def load_reports() -> dict:
    """(gsis_id, season) -> {week: (body parts...) or None}, for any listing at all."""
    cols = ["season", "week", "gsis_id", "report_primary_injury", "report_secondary_injury",
            "practice_primary_injury", "practice_secondary_injury"]
    parts = []
    for y in range(FIRST, season_now() + 1):
        pq, csv = CACHE / f"injuries_{y}.parquet", INJ / f"{y}.csv"
        if pq.exists():
            parts.append(pd.read_parquet(pq, columns=cols))
        elif csv.exists():
            parts.append(pd.read_csv(csv, usecols=cols, dtype=str))
    out: dict = {}
    for r in pd.concat(parts, ignore_index=True).dropna(subset=["gsis_id"]).itertuples(index=False):
        found = [body_part(x) for x in (r.report_primary_injury, r.report_secondary_injury,
                                         r.practice_primary_injury, r.practice_secondary_injury)]
        parts_ = tuple(dict.fromkeys(x for x in found if x))
        out.setdefault((r.gsis_id, int(r.season)), {})[int(float(r.week))] = parts_ or None
    return out


def load_ids() -> dict:
    """pfr_id -> (gsis_id, sleeper_id), newest roster wins."""
    ids = {}
    for y in range(FIRST, season_now() + 1):
        rp = CACHE / f"roster_{y}.parquet"
        if rp.exists():
            r = pd.read_parquet(rp, columns=["pfr_id", "gsis_id", "sleeper_id"]).dropna()
            for p, g, s in zip(r["pfr_id"], r["gsis_id"], r["sleeper_id"]):
                ids[p] = (g, str(s).split(".")[0])
    return ids


def injury_part(listings: dict, week: int):
    """(evidence, part): any body-part listing in the window proves an injury; only a
    listing after the game names it. A part he was already listed with going into the
    game is an old injury he played through, so a part new after the game wins: Jayden
    Reed, 2025 week 2, was listed Foot before and Foot plus Shoulder (the broken
    collarbone) after, and the absence is the shoulder's."""
    norm = lambda p: (p,) if isinstance(p, str) else tuple(p or ())
    window = {w: norm(p) for w, p in listings.items() if week <= w <= week + EVIDENCE_WEEKS and p}
    before = {x for w, p in listings.items() if week - EVIDENCE_WEEKS <= w <= week for x in norm(p)}
    after = [window[w] for w in sorted(window) if w > week]
    if not after:
        return bool(window), ""
    new = [x for x in after[0] if x not in before]
    return True, (new or after[0])[0]


def absences(played: list, team_games: dict) -> list:
    """played: [(date, team, season, week)] sorted. Yields (game, missed, out) per gap.
    ponytail: a gap is counted on the team he last played for, so a mid-absence trade
    or signing undercounts; fine for a chart marker, not for a games-missed stat."""
    out = []
    for i, (date, team, season, week) in enumerate(played):
        nxt = played[i + 1][0] if i + 1 < len(played) else None
        missed = sum(1 for g in team_games[team] if g > date and (nxt is None or g < nxt))
        out.append(((date, team, season, week), missed, nxt is None))
    return out


def build() -> dict:
    snaps, reports, ids = load_snaps(), load_reports(), load_ids()
    team_games = {t: sorted(g["date"].unique()) for t, g in snaps.drop_duplicates(["game_id", "team"]).groupby("team")}
    players = {}
    for pfr, g in snaps.groupby("pfr_player_id"):
        if pfr not in ids:
            continue
        gsis, sid = ids[pfr]
        played = sorted(set(zip(g["date"], g["team"], g["season"], g["week"])))
        rows = []
        for (date, team, season, week), missed, out in absences(played, team_games):
            if missed < MIN_MISSED:
                continue
            ok, part = injury_part(reports.get((gsis, int(season)), {}), int(week))
            if ok:
                rows.append([int(date), int(missed), NAMED.get((sid, int(date)), part), int(out)])
        if rows:
            players[sid] = rows
    return {"generated": dt.datetime.now().isoformat(timespec="seconds"), "players": players}


def self_check() -> None:
    games = {"HOU": [20231126, 20231203, 20231210, 20231217, 20231224, 20231231, 20240107]}
    gaps = absences([(20231126, "HOU", 2023, 12), (20231203, "HOU", 2023, 13)], games)
    assert [g[1:] for g in gaps] == [(0, False), (5, True)], gaps
    assert injury_part({13: "Calf"}, 13) == (True, "")            # pre-game listing: injured, part unknown
    assert injury_part({13: "Calf", 17: "Knee"}, 16) == (True, "Knee")
    assert injury_part({13: None}, 13) == (False, "")             # rest day is not an injury
    assert injury_part({20: "Knee"}, 13) == (False, "")           # too late to tie to that game
    assert injury_part({1: ("Foot",), 2: None, 3: ("Foot", "Shoulder")}, 2) == (True, "Shoulder")  # Reed 2025
    assert injury_part({3: ("Foot", "Shoulder")}, 2) == (True, "Foot")  # nothing before: first listed
    print("self-check ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    if ap.parse_args().self_check:
        self_check()
        return
    data = build()
    OUT.write_text("window.MAJOR_INJURIES=" + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    n = sum(len(v) for v in data["players"].values())
    print(f"wrote {OUT.relative_to(ROOT)}: {n} major injuries, {len(data['players'])} players, "
          f"{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    sys.exit(main())
