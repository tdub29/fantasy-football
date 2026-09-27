"""Complete injury history for the player card, 2009 to now, keyed to Sleeper id.

Every week a player appeared on an NFL injury report: the game status (Out,
Doubtful, Questionable, Probable), the practice status and the primary injury,
plus a per-season line (weeks listed, weeks Out, most frequent body part).

Sources, read only, nothing downloaded:
  historical/injuries/YYYY.csv           nflverse injuries 2009-2025
  nflverse-cache/injuries_YYYY.parquet   2024-2026; wins for any season it has (fresher)
  nflverse-cache/roster_YYYY.parquet     2024-2026, gsis_id -> sleeper_id

Writes site/data/injury-history.js (window.INJURY_HISTORY). The card loads it
when it opens, never at first paint. Compact layout, strings as indexes into
three tables whose slot 0 is "blank":

  players[sleeper_id] = [[season, weeks_listed, weeks_out, top_part, [wk, status, practice, injury, ...]], ...]

seasons newest first, weeks newest first. wk is the NFL week, or 101-104 for a
Wild Card, Divisional, Conference or Super Bowl game. top_part indexes the
injury table too.

    python projections/build_injury_history.py
    python projections/build_injury_history.py --self-check
    python projections/build_injury_history.py --injuries D:/injuries --cache D:/nflverse-cache
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import pathlib
import re
import sys

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Either input can live outside this checkout (a git worktree reads the main
# checkout's): the flag, then the env var, then the repo-relative default.
INJ = pathlib.Path(os.environ.get("FF_INJURIES_DIR") or ROOT / "historical" / "injuries")
CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
OUT = ROOT / "site" / "data" / "injury-history.js"
FIRST = 2009
POST = {"WC": 101, "DIV": 102, "CON": 103, "SB": 104}
COLS = ["season", "game_type", "week", "gsis_id", "report_status", "practice_status",
        "report_primary_injury", "practice_primary_injury"]

# Listings that are not a body part, kept in the rows but never the season's top part.
NOT_BODY = re.compile(r"not injury|not football|non.?injury|non.?football|rest|personal|illness|covid|coach|"
                      r"suspen|travel|load management|flu\b|reserve|team decision|discipline|^other|^-+$")
PART_FIX = {"knees": "knee", "ankles": "ankle", "hips": "hip", "feet": "foot", "toes": "toe", "hands": "hand",
            "shoulders": "shoulder", "hamstrings": "hamstring", "rib": "ribs", "rib cage": "ribs", "tricep": "triceps",
            "bicep": "biceps", "quad": "quadricep", "quadriceps": "quadricep", "low back": "back", "lower back": "back",
            "back spasms": "back", "core": "core muscle", "core muscle injury": "core muscle", "abdominal": "abdomen",
            "clavicle": "collarbone", "teeth": "tooth", "qblique": "oblique", "pec": "pectoral", "migraines": "migraine"}


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def clean(s):
    """Trim and capitalize; blank, NaN and a lone newline are None."""
    if not isinstance(s, str) or not s.strip():
        return None
    s = " ".join(s.split())
    return s[0].upper() + s[1:]


def body_part(s):
    """The body part a listing names, for the season summary; None for rest, illness and the like."""
    if not isinstance(s, str):
        return None
    s = re.sub(r"[()\[\]]", "", s.lower())
    s = re.split(r"[/,]", s)[0].strip()
    if NOT_BODY.search(s):
        return None
    s = re.sub(r"^(right|left|rt\.|lf\.|r\.?|l\.?|both)\s+", "", s).strip()
    s = PART_FIX.get(s, s)
    return s.title() if s else None


def load() -> tuple[pd.DataFrame, int]:
    parts = {}
    for y in range(FIRST, season_now() + 1):
        pq, csv = CACHE / f"injuries_{y}.parquet", INJ / f"{y}.csv"
        if pq.exists():
            parts[y] = pd.read_parquet(pq, columns=COLS)
        elif csv.exists():
            parts[y] = pd.read_csv(csv, usecols=COLS, dtype=str)
    if not parts:
        raise SystemExit(f"no injury files in {INJ} or {CACHE}")
    d = pd.concat(parts.values(), ignore_index=True)
    d = d[d["gsis_id"].notna()].copy()
    d["season"] = d["season"].astype(int)
    d["wk"] = d["week"].astype(float).astype(int)
    post = d["game_type"].map(POST)
    d["wk"] = post.fillna(d["wk"]).astype(int)
    for c in ("report_status", "practice_status", "report_primary_injury", "practice_primary_injury"):
        d[c] = d[c].map(clean)
    d["injury"] = d["report_primary_injury"].fillna(d["practice_primary_injury"])
    # A player listed twice in one week (a mid-week trade) keeps the last listing.
    d = d.drop_duplicates(["season", "wk", "gsis_id"], keep="last")

    ids = {}
    for y in range(season_now() - 2, season_now() + 1):
        rp = CACHE / f"roster_{y}.parquet"
        if rp.exists():
            r = pd.read_parquet(rp, columns=["gsis_id", "sleeper_id"]).dropna()
            ids.update(zip(r["gsis_id"], r["sleeper_id"].astype(str).str.split(".").str[0]))
    if not ids:
        raise SystemExit(f"no roster_YYYY.parquet in {CACHE}: nothing to key to Sleeper ids")
    d["sid"] = d["gsis_id"].map(ids)
    return d[d["sid"].notna()], len(parts)


def build() -> tuple[dict, int, int]:
    d, n_files = load()
    tables = {k: [""] for k in ("status", "practice", "injury")}
    index = {k: {"": 0} for k in tables}

    def ix(kind, s):
        s = s if isinstance(s, str) else ""   # pandas turns a None into NaN
        if s not in index[kind]:
            index[kind][s] = len(tables[kind])
            tables[kind].append(s)
        return index[kind][s]

    players = {}
    for (sid, season), g in d.sort_values(["sid", "season", "wk"]).groupby(["sid", "season"], sort=False):
        rows = []
        for r in g.itertuples(index=False):
            rows += [r.wk, ix("status", r.report_status), ix("practice", r.practice_status), ix("injury", r.injury)]
        # newest week first: reverse the 4-wide groups
        rows = [x for i in range(len(rows) - 4, -1, -4) for x in rows[i:i + 4]]
        top = collections.Counter(p for p in map(body_part, g["injury"]) if p).most_common(1)
        players.setdefault(sid, []).append([int(season), len(g), int((g["report_status"] == "Out").sum()),
                                            ix("injury", top[0][0]) if top else 0, rows])
    for v in players.values():
        v.reverse()   # newest season first
    data = {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source": "nflverse injuries (weekly NFL injury reports), keyed to Sleeper through nflverse rosters",
        "seasons": [int(d["season"].min()), int(d["season"].max())],
        "post": {str(v): k for k, v in POST.items()},
        **tables,
        "players": players,
    }
    return data, len(d), n_files


def write(data: dict) -> None:
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("// Generated by projections/build_injury_history.py from nflverse. Do not edit.\n"
                   f"window.INJURY_HISTORY={body};\n", encoding="utf-8")


def self_check() -> int:
    assert body_part("right Shoulder") == "Shoulder" and body_part("lf. calf") == "Calf"
    assert body_part("Knees") == "Knee" and body_part("Chest/Ankle/Illness") == "Chest"
    assert body_part("(Migraines)") == "Migraine" and body_part("Rib cage") == "Ribs"
    for s in ("Not injury related - resting player", "Illness", "Rest", "Coach's Decision", "--",
              "PLACED ON INJURED RESERVE", "Personal", "COVID Protocol", "Non-Football Illness"):
        assert body_part(clean(s)) is None, s
    assert clean("\n") is None and clean("right Groin") == "Right Groin" and clean("ACL") == "ACL"

    # The card loads it when it opens; a tag in index.html would put it back on first paint.
    assert "injury-history.js" not in (ROOT / "site" / "index.html").read_text(encoding="utf-8"), "index.html loads injury-history.js"

    # The written file decodes back to exactly the source listings.
    if not OUT.exists():
        print(f"  {OUT.name} missing, run the builder first")
        return 1
    txt = OUT.read_text(encoding="utf-8")
    H = json.loads(txt[txt.index("={") + 1:].rstrip().rstrip(";"))
    d, _ = load()
    src = d.groupby(["sid", "season"]).agg(n=("wk", "size"), out=("report_status", lambda s: int((s == "Out").sum())))
    bad = 0
    got = {}
    for sid, seasons in H["players"].items():
        assert [s[0] for s in seasons] == sorted((s[0] for s in seasons), reverse=True), sid
        for season, listed, out, top, rows in seasons:
            wks = rows[0::4]
            n_out = sum(1 for i in range(1, len(rows), 4) if H["status"][rows[i]] == "Out")
            if len(wks) != listed or n_out != out or wks != sorted(wks, reverse=True):
                bad += 1
                print(f"  {sid} {season}: summary {listed}/{out} vs rows {len(wks)}/{n_out}")
            got[(sid, season)] = (listed, out)
    want = {k: (int(r.n), int(r.out)) for k, r in src.iterrows()}
    if got != want:
        bad += 1
        diff = set(got.items()) ^ set(want.items())
        print(f"  {len(diff)} player-seasons differ from the source, e.g. {sorted(diff)[:3]}")
    print(f"build_injury_history self-check: {len(got)} player-seasons, {bad} problem(s)")
    if bad:
        return 1
    print("build_injury_history self-check ok")
    return 0


def main() -> int:
    global INJ, CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument("--injuries", help="folder of YYYY.csv (default: FF_INJURIES_DIR or historical/injuries)")
    ap.add_argument("--cache", help="nflverse cache directory (default: NFLVERSE_CACHE or projections/nflverse-cache)")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.injuries:
        INJ = pathlib.Path(a.injuries)
    if a.cache:
        CACHE = pathlib.Path(a.cache)
    if a.self_check:
        return self_check()
    data, n_rows, n_files = build()
    write(data)
    n_seasons = sum(len(v) for v in data["players"].values())
    print(f"wrote {OUT.name}: {len(data['players'])} players, {n_seasons} player-seasons, {n_rows} listings "
          f"from {n_files} seasons {data['seasons'][0]}-{data['seasons'][1]} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
