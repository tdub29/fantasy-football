"""Local SQLite store for the prospect model's football data.

One file, `projections/prospect-db/prospect.sqlite` ($PROSPECT_DB overrides), gitignored like the
parquet cache it is loaded from. Two layers:

  raw      one table per source family, one row per source row, every row tagged with the file it
           came from (`source_key` = "<release tag>/<file>") and its position in that file
           (`src_row`). `source_file` holds each file's URL, sha256, size, row count and licence.
           A file is re-ingested only when its sha256 changes, inside one transaction, so a rerun
           is a no-op and a half-finished load never survives.
  derived  what a model build made of the raw rows: `build_run` (code hash, params, the sha256 of
           every source it read), `player_link` (college id per NFL player and how it was found),
           `model_row` (population, outcome), `model_feature` (value plus observed / estimated /
           imputed / missing / inapplicable) and `prediction`. Rows are keyed by run, never
           overwritten, so any shipped file can be traced to the data and code that made it.

The builder (build_prospect_model.py) reads its inputs from here, not from the parquet files, and
the static site still gets a plain JS file: nothing in site/ talks to SQL.

    python projections/prospect_db.py ingest      # download what is stale, load what changed
    python projections/prospect_db.py status      # sources, row counts, licences
    python projections/prospect_db.py coverage    # writes notes/prospect-research/data-coverage.md
    python projections/prospect_db.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import sqlite3
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_profile as bpp  # noqa: E402  (shared cached fetch)

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or ROOT / "projections" / "nflverse-cache")
DB_PATH = pathlib.Path(os.environ.get("PROSPECT_DB") or ROOT / "projections" / "prospect-db" / "prospect.sqlite")
SDV = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
NFLV = "https://github.com/nflverse/nflverse-data/releases/download"
SCHEMA_VERSION = 1
SEASON, LAST_NFL, FIRST_CFB, FIRST_NFL = 2026, 2025, 2004, 2008

# Licences as checked 2026-10-03 (GitHub licence API + README). The ESPN-derived college files sit
# under ESPN's own terms; the repo licence covers the packaging. Local use only: the DB is not
# committed or redistributed, and the site ships aggregates.
LIC = {"sdv": "sportsdataverse-data: LICENSE file MIT, README badge CC BY 4.0; ESPN source data under ESPN terms",
       "nflv": "nflverse-data: CC-BY-4.0 (LICENSE.md); attribute nflverse"}

# table -> (licence key, base url, release tag, file pattern, years or None, columns, natural key)
SOURCES = {
    "cfb_receiving": ("sdv", SDV, "espn_cfb_receiving", "cfb_receiving_{y}.parquet", (FIRST_CFB, SEASON),
                      ["season", "player_id", "team_id", "receiver_player_name", "pos_team", "division", "conference",
                       "fbs_class", "position_group", "games", "team_games", "plays", "targets", "comp", "yards",
                       "passing_td", "fumbles", "TEPA", "EPAplay", "success"], ["season", "player_id", "team_id"]),
    "cfb_rushing": ("sdv", SDV, "espn_cfb_rushing", "cfb_rushing_{y}.parquet", (FIRST_CFB, SEASON),
                    ["season", "player_id", "team_id", "rusher_player_name", "pos_team", "division", "conference",
                     "fbs_class", "position_group", "games", "team_games", "plays", "yards", "rushing_td", "fumbles",
                     "TEPA", "EPAplay", "success"], ["season", "player_id", "team_id"]),
    "cfb_passing": ("sdv", SDV, "espn_cfb_passing", "cfb_passing_{y}.parquet", (FIRST_CFB, SEASON),
                    ["season", "player_id", "team_id", "passer_player_name", "pos_team", "division", "conference",
                     "fbs_class", "position_group", "games", "team_games", "plays", "att", "comp", "yards",
                     "passing_td", "pass_int", "TEPA", "EPAplay", "success"], ["season", "player_id", "team_id"]),
    "cfb_roster": ("sdv", SDV, "espn_cfb_rosters", "cfb_rosters_{y}.parquet", (FIRST_CFB, SEASON),
                   ["season", "athlete_id", "team_id", "full_name", "first_name", "last_name", "position_abbreviation",
                    "height", "weight", "date_of_birth", "age", "experience_years", "jersey", "birth_place_state",
                    "cfbd_home_state", "games_rostered"], ["season", "athlete_id", "team_id"]),
    "cfb_recruit": ("sdv", SDV, "cfb_recruits", "cfb_recruits_{y}.parquet", (FIRST_CFB, SEASON),
                    ["season", "team_id", "team_id_247", "team", "recruit_id", "player_name", "stars", "grade",
                     "position"], None),
    # Team strength and player usage (charter v2 addendum 1). Regenerated daily upstream by current
    # code, so a past season's numbers are today's method on that season's plays, not a vintage.
    "cfb_rating": ("sdv", SDV, "cfb_ratings", "cfb_ratings_{y}.parquet", (FIRST_CFB, SEASON),
                   ["season", "team_id", "adj_off_epa", "adj_def_epa", "adj_st_epa", "adj_net", "fei_off", "fei_def",
                    "fei_net", "games", "off_pace", "net_z"], ["season", "team_id"]),
    "cfb_team_game": ("sdv", SDV, "cfb_team_opponent_splits", "cfb_team_opponent_splits_{y}.parquet", (FIRST_CFB, SEASON),
                      ["season", "season_type", "week", "game_id", "team_id", "opponent_id", "is_home", "points_for",
                       "points_against", "plays", "epa_per_play", "success_rate"], ["game_id", "team_id"]),
    "cfb_usage": ("sdv", SDV, "espn_cfb_usage_players", "usage_players_{y}.parquet", (FIRST_CFB, SEASON),
                  ["season", "pos_team_id", "player_id", "player_name", "position_group", "games", "rushes", "targets",
                   "receptions", "touches", "opportunities", "first_downs", "explosive_plays", "successful_plays", "epa",
                   "rz_targets", "rz_touches", "team_targets", "team_first_downs", "team_touches", "explosive_rate",
                   "success_rate", "epa_per_opportunity", "third_down_over_expected", "target_share",
                   "first_down_share", "touch_share"], None),   # null-id "Team" and "N/A" rows repeat; real ids are unique
    # Per-game lines (charter v2 addendum 12): as-of-game features for the season in progress.
    "cfb_player_box": ("sdv", SDV, "espn_cfb_player_box", "player_box_{y}.parquet", (FIRST_CFB, SEASON),
                       ["season", "game_id", "team_id", "athlete_id", "athlete_name", "category", "receptions",
                        "receivingYards", "receivingTouchdowns", "rushingAttempts", "rushingYards", "rushingTouchdowns",
                        "completions/passingAttempts", "passingYards", "passingTouchdowns", "interceptions"], None),
    "cfb_team_box": ("sdv", SDV, "espn_cfb_team_box", "team_box_{y}.parquet", (FIRST_CFB, SEASON),
                     ["season", "game_id", "team_id", "home_away", "completionAttempts", "netPassingYards", "rushingYards",
                      "rushingAttempts"], None),
    "nfl_player": ("nflv", NFLV, "players", "players.parquet", None,
                   ["gsis_id", "display_name", "first_name", "last_name", "position", "birth_date", "height", "weight",
                    "college_name", "college_conference", "espn_id", "pfr_id", "pff_id", "rookie_season", "last_season",
                    "draft_year", "draft_round", "draft_pick", "draft_team", "years_of_experience", "status"], ["gsis_id"]),
    "nfl_draft_pick": ("nflv", NFLV, "draft_picks", "draft_picks.parquet", None,
                       ["season", "round", "pick", "team", "gsis_id", "pfr_player_id", "cfb_player_id",
                        "pfr_player_name", "position", "category", "college", "age"], ["season", "pick"]),
    "nfl_combine": ("nflv", NFLV, "combine", "combine.parquet", None,
                    ["season", "draft_year", "draft_team", "draft_round", "draft_ovr", "pfr_id", "cfb_id", "player_name",
                     "pos", "school", "ht", "wt", "forty", "bench", "vertical", "broad_jump", "cone", "shuttle"], None),
    "nfl_player_season": ("nflv", NFLV, "stats_player", "stats_player_reg_{y}.parquet", (FIRST_NFL, LAST_NFL),
                          ["player_id", "player_display_name", "position", "season", "season_type", "recent_team",
                           "games", "fantasy_points_ppr", "attempts", "passing_yards", "carries", "rushing_yards",
                           "targets", "receptions", "receiving_yards", "target_share"], None),
    "nfl_roster": ("nflv", NFLV, "rosters", "roster_{y}.parquet", (FIRST_NFL, SEASON),
                   ["season", "team", "position", "gsis_id", "espn_id", "sleeper_id", "pfr_id", "full_name",
                    "birth_date", "college", "entry_year", "rookie_year", "draft_number", "status"], None),
}
# Natural keys verified unique on the 2026-10-03 files; the rest carry duplicates (two roster rows for
# a player traded mid-season, recruits with no team) and are keyed by file and row only.

DERIVED_DDL = """
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source_file (
  source_key TEXT PRIMARY KEY, tbl TEXT NOT NULL, url TEXT NOT NULL, sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL, n_rows INTEGER NOT NULL CHECK (n_rows >= 0), file_mtime TEXT NOT NULL,
  ingested_at TEXT NOT NULL, licence TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS build_run (
  run_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, builder TEXT NOT NULL, code_sha256 TEXT NOT NULL,
  params TEXT NOT NULL, sources TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS player_link (
  run_id TEXT NOT NULL REFERENCES build_run(run_id), gsis_id TEXT NOT NULL, cfb_player_id INTEGER,
  method TEXT NOT NULL CHECK (method IN ('espn_id', 'name_school', 'none')), draft_year INTEGER,
  PRIMARY KEY (run_id, gsis_id));
CREATE TABLE IF NOT EXISTS model_row (
  run_id TEXT NOT NULL REFERENCES build_run(run_id), sid TEXT NOT NULL, population TEXT NOT NULL,
  pos TEXT NOT NULL CHECK (pos IN ('QB', 'RB', 'WR', 'TE')), draft_year INTEGER NOT NULL,
  gsis_id TEXT, cfb_player_id INTEGER, name TEXT, pick INTEGER, hit REAL CHECK (hit IN (0, 1) OR hit IS NULL),
  best_ppg REAL, best_rank INTEGER, outcome_status TEXT NOT NULL CHECK (outcome_status IN ('final', 'open')),
  PRIMARY KEY (run_id, sid));
CREATE TABLE IF NOT EXISTS model_feature (
  run_id TEXT NOT NULL, sid TEXT NOT NULL, feature TEXT NOT NULL, value REAL,
  status TEXT NOT NULL CHECK (status IN ('observed', 'estimated', 'imputed', 'missing', 'inapplicable')),
  PRIMARY KEY (run_id, sid, feature), FOREIGN KEY (run_id, sid) REFERENCES model_row(run_id, sid));
CREATE TABLE IF NOT EXISTS prediction (
  run_id TEXT NOT NULL, sid TEXT NOT NULL, model TEXT NOT NULL, scheme TEXT NOT NULL, p REAL NOT NULL
  CHECK (p >= 0 AND p <= 1), PRIMARY KEY (run_id, sid, model, scheme),
  FOREIGN KEY (run_id, sid) REFERENCES model_row(run_id, sid));
"""


def _sqltype(s: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(s) or pd.api.types.is_integer_dtype(s):
        return "INTEGER"
    if pd.api.types.is_float_dtype(s):
        return "REAL"
    return "TEXT"


def _cell(v):
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, (float, np.floating)):
        return None if math.isnan(v) else float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_, bool)):
        return int(v)
    if isinstance(v, (pd.Timestamp, dt.datetime, dt.date)):
        return v.isoformat()
    return v


def connect(path: pathlib.Path | None = None) -> sqlite3.Connection:
    path = pathlib.Path(path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.executescript(DERIVED_DDL)
    v = con.execute("SELECT v FROM meta WHERE k = 'schema_version'").fetchone()
    if v is None:
        con.execute("INSERT INTO meta VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
    elif int(v[0]) != SCHEMA_VERSION:
        raise SystemExit(f"{path}: schema v{v[0]}, code expects v{SCHEMA_VERSION}; add a migration in migrate()")
    con.commit()
    return con


def _ensure_raw_table(con, tbl: str, df: pd.DataFrame, key):
    cols = SOURCES[tbl][5]
    have = {r[1] for r in con.execute(f"PRAGMA table_info({tbl})")}
    if have:
        missing = [c for c in cols if c not in have]
        for c in missing:   # additive only: a new source column never rewrites old rows
            con.execute(f'ALTER TABLE {tbl} ADD COLUMN "{c}" {_sqltype(df[c]) if c in df else "TEXT"}')
        return
    body = ", ".join(f'"{c}" {_sqltype(df[c]) if c in df else "TEXT"}' for c in cols)
    con.execute(f"CREATE TABLE {tbl} (source_key TEXT NOT NULL REFERENCES source_file(source_key), "
                f"src_row INTEGER NOT NULL, {body}, PRIMARY KEY (source_key, src_row))")
    if key:
        con.execute(f"CREATE UNIQUE INDEX {tbl}_nk ON {tbl} ({', '.join(key)})")
    for c in ("player_id", "athlete_id", "gsis_id", "pfr_id", "season"):
        if c in cols and not (key and c == key[0] and len(key) == 1):
            con.execute(f"CREATE INDEX IF NOT EXISTS {tbl}_{c} ON {tbl} ({c})")


def files_for(tbl: str):
    lic, base, tag, pat, years, _cols, _key = SOURCES[tbl]
    ys = range(years[0], years[1] + 1) if years else [None]
    return [(tag, pat.format(y=y) if y else pat, y) for y in ys]


def ingest(con, tables=None, fetch=True, say=print) -> dict:
    """Fetch (cache rules of build_prospect_profile.fetch) and load every source file whose sha256
    changed. Returns {source_key: 'loaded' | 'unchanged'}."""
    out = {}
    for tbl in tables or SOURCES:
        lic, base, tag, _pat, _years, cols, key = SOURCES[tbl]
        sub = CACHE / "cfb" if base == SDV else CACHE
        for tag_, name, y in files_for(tbl):
            live = y is None or y >= (SEASON if tbl != "nfl_player_season" else LAST_NFL + 1)
            if fetch:
                path = bpp.fetch(tag_, name, base=base, cache=sub, max_age_h=24.0 if live else math.inf)
            else:
                path = sub / name
            sk = f"{tag_}/{name}"
            raw = path.read_bytes()
            sha = hashlib.sha256(raw).hexdigest()
            old = con.execute("SELECT sha256 FROM source_file WHERE source_key = ?", (sk,)).fetchone()
            if old and old[0] == sha and con.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tbl,)).fetchone():
                out[sk] = "unchanged"
                continue
            df = pd.read_parquet(path)
            absent = [c for c in cols if c not in df.columns]
            df = df.reindex(columns=cols)
            with con:   # one transaction per file: delete its old rows, insert the new ones
                _ensure_raw_table(con, tbl, df, key)
                con.execute(f"DELETE FROM {tbl} WHERE source_key = ?", (sk,))
                con.execute("INSERT OR REPLACE INTO source_file VALUES (?,?,?,?,?,?,?,?,?)",
                            (sk, tbl, f"{base}/{tag_}/{name}", sha, len(raw), len(df),
                             dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat(timespec="seconds"),
                             dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), LIC[lic]))
                qcols = ", ".join(f'"{c}"' for c in cols)
                ph = ", ".join("?" for _ in range(len(cols) + 2))
                rows = ((sk, i, *(_cell(v) for v in r)) for i, r in enumerate(df.itertuples(index=False, name=None)))
                con.executemany(f"INSERT INTO {tbl} (source_key, src_row, {qcols}) VALUES ({ph})", rows)
            out[sk] = "loaded"
            say(f"  loaded {sk}: {len(df):,} rows" + (f" (absent columns: {', '.join(absent)})" if absent else ""))
    return out


def read_file(con, tbl: str, name: str, columns=None) -> pd.DataFrame:
    """One source file's rows, in file order, as the builder used to read the parquet."""
    tag = SOURCES[tbl][2]
    cols = columns or SOURCES[tbl][5]
    q = ", ".join(f'"{c}"' for c in cols)
    df = pd.read_sql_query(f"SELECT {q} FROM {tbl} WHERE source_key = ? ORDER BY src_row", con,
                           params=(f"{tag}/{name}",))
    if df.empty and not con.execute("SELECT 1 FROM source_file WHERE source_key = ?", (f"{tag}/{name}",)).fetchone():
        raise SystemExit(f"{tag}/{name} is not in {DB_PATH.name}; run: python projections/prospect_db.py ingest")
    return df


def source_shas(con) -> dict:
    return dict(con.execute("SELECT source_key, sha256 FROM source_file ORDER BY source_key"))


# ----------------------------------------------------------------------------- derived layer

def record_run(con, builder: str, params: dict, note: str = "") -> str:
    code = pathlib.Path(builder).read_bytes() + pathlib.Path(__file__).read_bytes()
    srcs = source_shas(con)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    run_id = stamp.replace(":", "").replace("-", "")[:15] + "-" + hashlib.sha256(
        code + json.dumps(srcs, sort_keys=True).encode()).hexdigest()[:8]
    with con:
        con.execute("INSERT OR REPLACE INTO build_run VALUES (?,?,?,?,?,?,?)",
                    (run_id, stamp, pathlib.Path(builder).name, hashlib.sha256(code).hexdigest(),
                     json.dumps(params, sort_keys=True, default=str), json.dumps(srcs, sort_keys=True), note))
    return run_id


def write_rows(con, table: str, rows):
    rows = [tuple(_cell(v) for v in r) for r in rows]
    if rows:
        with con:
            con.executemany(f"INSERT OR REPLACE INTO {table} VALUES ({', '.join('?' for _ in rows[0])})", rows)


# ----------------------------------------------------------------------------- reports

def status(con):
    for tbl in SOURCES:
        n = con.execute("SELECT COUNT(*), SUM(n_rows), MIN(source_key), MAX(source_key) FROM source_file WHERE tbl = ?",
                        (tbl,)).fetchone()
        print(f"{tbl:18s} files={n[0]:3d} rows={n[1] or 0:>9,}  {n[2]} .. {n[3]}")
    for t in ("build_run", "player_link", "model_row", "model_feature", "prediction"):
        print(f"{t:18s} rows={con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]:,}")
    print("licences:", *sorted({r[0] for r in con.execute("SELECT licence FROM source_file")}), sep="\n  ")


def self_check():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        con = connect(pathlib.Path(d) / "t.sqlite")
        df = pd.DataFrame({"season": [2020, 2020], "player_id": [1, 2], "team_id": [9, 9], "games": [12.0, np.nan],
                           "receiver_player_name": ["A B", None]})
        global CACHE
        old = CACHE
        CACHE = pathlib.Path(d)
        (CACHE / "cfb").mkdir()
        p = CACHE / "cfb" / "cfb_receiving_2020.parquet"
        df.to_parquet(p)
        SOURCES["_t"] = ("sdv", SDV, "espn_cfb_receiving", "cfb_receiving_{y}.parquet", (2020, 2020),
                         SOURCES["cfb_receiving"][5], ["season", "player_id", "team_id"])
        try:
            r1 = ingest(con, ["_t"], fetch=False, say=lambda *a: None)
            r2 = ingest(con, ["_t"], fetch=False, say=lambda *a: None)
            assert list(r1.values()) == ["loaded"] and list(r2.values()) == ["unchanged"], "rerun must be a no-op"
            back = read_file(con, "_t", "cfb_receiving_2020.parquet", ["season", "player_id", "games", "receiver_player_name"])
            assert back.player_id.tolist() == [1, 2] and pd.isna(back.games[1]) and pd.isna(back.receiver_player_name[1])
            df.assign(games=[13.0, 11.0]).to_parquet(p)   # a revised file replaces its rows, never appends
            assert list(ingest(con, ["_t"], fetch=False, say=lambda *a: None).values()) == ["loaded"]
            assert con.execute("SELECT COUNT(*), SUM(games) FROM _t").fetchone() == (2, 24.0)
            try:
                with con:
                    con.execute("INSERT INTO _t (source_key, src_row, season, player_id, team_id) VALUES "
                                "('espn_cfb_receiving/cfb_receiving_2020.parquet', 9, 2020, 1, 9)")
                raise AssertionError("natural key must be unique")
            except sqlite3.IntegrityError:
                pass
            rid = record_run(con, __file__, {"x": 1})
            write_rows(con, "model_row", [(rid, "s1", "drafted", "WR", 2020, "g", 1, "A", 5, 1.0, 14.2, 3, "final")])
            try:
                write_rows(con, "model_feature", [(rid, "s1", "f", 1.0, "guessed")])
                raise AssertionError("feature status is a closed list")
            except sqlite3.IntegrityError:
                pass
            try:
                write_rows(con, "prediction", [(rid, "nobody", "m", "loco", 0.5)])
                raise AssertionError("a prediction needs its model row")
            except sqlite3.IntegrityError:
                pass
        finally:
            SOURCES.pop("_t")
            CACHE = old
            con.close()
    print("prospect_db self-check OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", nargs="?", choices=["ingest", "status", "coverage"])
    ap.add_argument("--no-fetch", action="store_true", help="load only what is already in the parquet cache")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        self_check()
        return
    con = connect()
    if a.cmd == "ingest":
        r = ingest(con, fetch=not a.no_fetch)
        print(f"{sum(v == 'loaded' for v in r.values())} loaded, {sum(v == 'unchanged' for v in r.values())} unchanged "
              f"-> {DB_PATH}")
    elif a.cmd == "status":
        status(con)
    elif a.cmd == "coverage":
        import prospect_coverage
        prospect_coverage.write_report(con)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
