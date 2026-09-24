"""Build advanced per-player IDP (individual defensive player) stats for the site, scored
under the actual league scoring of whichever Sleeper league is IDP (roster_positions has an
IDP slot). Combines nflverse weekly player stats (tackles/sacks/turnovers), snap counts
(usage), and PFR advanced defensive stats (pressures, coverage allowed, missed tackles).

Inputs (nflverse-cache, downloaded if missing or older than 6h):
  roster_2026.parquet             -> sleeper_id / pfr_id / gsis_id crosswalk + position
  stats_player_week_2026.parquet  -> def_* weekly box score stats (tackles, sacks, turnovers)
  snap_counts_2026.parquet        -> defense_snaps / defense_pct usage, keyed by pfr_player_id
  advstats_week_def_2026.parquet  -> PFR def advanced stats (targets/comp/yards/rating allowed,
                                      pressures, missed tackles), keyed by pfr_player_id

Output: site/data/idp-advanced.js as `window.IDP_ADVANCED = {...};`

Run: python projections/build_idp_advanced.py [--self-check]
"""
import argparse
import json
import math
import pathlib
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

import pandas as pd

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
CACHE = HERE / "nflverse-cache"
SITE_DATA = ROOT / "site" / "data"
LEAGUES_JS = SITE_DATA / "leagues.js"
OUT_JS = SITE_DATA / "idp-advanced.js"

SEASON = 2026
MAX_AGE_H = 6.0

# (release tag, asset filename) on nflverse-data, for cache misses / staleness.
NFLVERSE_SOURCES = {
    f"roster_{SEASON}.parquet": ("rosters", f"roster_{SEASON}.parquet"),
    f"stats_player_week_{SEASON}.parquet": ("player_stats", f"stats_player_week_{SEASON}.parquet"),
    f"snap_counts_{SEASON}.parquet": ("snap_counts", f"snap_counts_{SEASON}.parquet"),
    f"advstats_week_def_{SEASON}.parquet": ("pfr_advstats", f"advstats_week_def_{SEASON}.parquet"),
}

# DE/DT/NT/DL -> DL, OLB/ILB/MLB/LB -> LB, CB/S/FS/SS/DB -> DB
POS_BUCKET = {
    "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL",
    "OLB": "LB", "ILB": "LB", "MLB": "LB", "LB": "LB",
    "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "DB": "DB",
}


def bucket_pos(pos):
    if pos is None:
        return None
    return POS_BUCKET.get(str(pos).strip().upper())


def ensure_cached(filename: str) -> pathlib.Path:
    path = CACHE / filename
    if path.exists():
        age_h = (time.time() - path.stat().st_mtime) / 3600.0
        if age_h < MAX_AGE_H:
            return path
    tag, remote_name = NFLVERSE_SOURCES[filename]
    url = f"https://github.com/nflverse/nflverse-data/releases/download/{tag}/{remote_name}"
    print(f"  downloading {filename} <- {url}")
    tmp = path.with_suffix(path.suffix + ".tmp")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r, open(tmp, "wb") as f:
        f.write(r.read())
    tmp.replace(path)
    return path


def load_idp_league():
    """Find the Sleeper league whose roster_positions include an IDP slot, and pull its
    is_idp flag / idp_ scoring keys straight out of leagues.js (read-only)."""
    text = LEAGUES_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.LEAGUES\s*=\s*(\[.*?\])\s*;\s*(?:window\.|$)", text, re.S)
    if not m:
        raise RuntimeError("could not locate window.LEAGUES array in leagues.js")
    leagues = json.loads(m.group(1))

    idp_slots = {"DL", "LB", "DB", "IDP_FLEX", "DE", "DT", "CB", "S"}
    candidates = []
    for lg in leagues:
        positions = set(lg.get("roster_positions") or [])
        has_idp_slot = bool(positions & idp_slots)
        has_idp_scoring = any(k.startswith("idp_") for k in (lg.get("scoring") or {}))
        if lg.get("is_idp") or (has_idp_slot and has_idp_scoring):
            candidates.append(lg)

    if not candidates:
        return None

    # Prefer the one Sleeper itself flags is_idp; else the richest idp_ scoring set.
    candidates.sort(key=lambda lg: (
        0 if lg.get("is_idp") else 1,
        -sum(1 for k in (lg.get("scoring") or {}) if k.startswith("idp_")),
    ))
    return candidates[0]


def standard_idp_scoring():
    """Fallback scoring used only if no IDP league is found in leagues.js."""
    return {
        "idp_tkl_solo": 1.0, "idp_tkl_ast": 0.5, "idp_tkl_loss": 1.0,
        "idp_sack": 3.0, "idp_sack_yd": 0.1, "idp_qb_hit": 1.0,
        "idp_pass_def": 2.0, "idp_int": 4.0, "idp_int_ret_yd": 0.1,
        "idp_ff": 2.0, "idp_fum_rec": 2.0, "idp_fum_ret_yd": 0.1,
        "idp_def_td": 6.0, "idp_safe": 2.0, "idp_blk_kick": 2.0,
    }


# Maps each idp_ scoring key to the per-player raw-stat field we compute below.
IDP_SCORE_STAT_MAP = {
    "idp_tkl_solo": "tkl_solo",
    "idp_tkl_ast": "tkl_ast",
    "idp_tkl": "tkl",
    "idp_tkl_loss": "tfl",
    "idp_sack": "sk",
    "idp_sack_yd": "_sack_yds",
    "idp_qb_hit": "qbh",
    "idp_pass_def": "pbu",
    "idp_int": "intc",
    "idp_int_ret_yd": "_int_ret_yds",
    "idp_ff": "ff",
    "idp_fum_rec": "fr",
    "idp_fum_ret_yd": "_fum_ret_yds",
    "idp_def_td": "_def_td",
    "idp_safe": "_safety",
    "idp_blk_kick": "_blk_kick",
}


def score_player(stat_row: dict, scoring: dict) -> float:
    total = 0.0
    for key, weight in scoring.items():
        if not key.startswith("idp_") or not weight:
            continue
        field = IDP_SCORE_STAT_MAP.get(key)
        if field is None:
            continue
        total += (stat_row.get(field) or 0.0) * weight
    return total


def unmapped_scoring_keys(scoring: dict) -> list:
    return sorted(
        k for k, w in scoring.items()
        if k.startswith("idp_") and w and k not in IDP_SCORE_STAT_MAP
    )


def r4(x):
    """Round to 4 decimals, turning NaN/inf into None so json.dumps(allow_nan=False) never fires."""
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(xf) or math.isinf(xf):
        return None
    return round(xf, 4)


def passer_rating_allowed(att, comp, yds, td, intc):
    if not att or att <= 0:
        return None
    a = max(0.0, min(2.375, ((comp / att) - 0.3) * 5))
    b = max(0.0, min(2.375, ((yds / att) - 3) * 0.25))
    c = max(0.0, min(2.375, (td / att) * 20))
    d = max(0.0, min(2.375, 2.375 - (intc / att * 25)))
    return (a + b + c + d) / 6 * 100


def build_dataframes():
    roster = pd.read_parquet(ensure_cached(f"roster_{SEASON}.parquet"))
    stats = pd.read_parquet(ensure_cached(f"stats_player_week_{SEASON}.parquet"))
    snaps = pd.read_parquet(ensure_cached(f"snap_counts_{SEASON}.parquet"))
    adv = pd.read_parquet(ensure_cached(f"advstats_week_def_{SEASON}.parquet"))

    print(f"roster_{SEASON}.parquet columns ({len(roster.columns)}): {list(roster.columns)}")
    print(f"stats_player_week_{SEASON}.parquet columns ({len(stats.columns)}): {list(stats.columns)}")
    print(f"snap_counts_{SEASON}.parquet columns ({len(snaps.columns)}): {list(snaps.columns)}")
    print(f"advstats_week_def_{SEASON}.parquet columns ({len(adv.columns)}): {list(adv.columns)}")

    return roster, stats, snaps, adv


def compute(roster, stats, snaps, adv):
    roster = roster.copy()
    roster["pos_bucket"] = roster["position"].map(bucket_pos)
    roster_def = roster[roster["pos_bucket"].notna() & roster["sleeper_id"].notna()].copy()
    roster_def = roster_def.drop_duplicates(subset=["sleeper_id"])
    roster_def = roster_def[["sleeper_id", "full_name", "team", "pos_bucket", "gsis_id", "pfr_id"]]

    pfr_ids = set(roster_def["pfr_id"].dropna())

    # -- weekly box-score defensive stats, keyed by gsis_id (stats.player_id) --
    box_cols = [
        "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_fumbles_forced",
        "def_sacks", "def_sack_yards", "def_qb_hits", "def_interceptions", "def_interception_yards",
        "def_pass_defended", "def_tds", "def_safeties",
        "def_punt_blocks", "def_pat_blocks", "def_fg_blocks",
        "fumble_recovery_own", "fumble_recovery_opp",
        "fumble_recovery_yards_own", "fumble_recovery_yards_opp",
    ]
    stats_def = stats[stats["player_id"].isin(roster_def["gsis_id"])].copy()
    for c in box_cols:
        stats_def[c] = pd.to_numeric(stats_def[c], errors="coerce").fillna(0.0)
    box_agg = stats_def.groupby("player_id").agg(
        **{c: (c, "sum") for c in box_cols},
        weeks_with_stats=("week", "nunique"),
        max_week_box=("week", "max"),
    )

    # -- snap counts / usage, keyed by pfr_player_id --
    snaps_def = snaps[snaps["pfr_player_id"].isin(pfr_ids)].copy()
    snaps_def["defense_snaps"] = pd.to_numeric(snaps_def["defense_snaps"], errors="coerce").fillna(0.0)
    snaps_def["defense_pct"] = pd.to_numeric(snaps_def["defense_pct"], errors="coerce").fillna(0.0)
    played = snaps_def[snaps_def["defense_snaps"] > 0]
    snap_agg = played.groupby("pfr_player_id").agg(
        defense_snaps=("defense_snaps", "sum"),
        defense_pct_avg=("defense_pct", "mean"),
        games_played=("week", "nunique"),
        max_week_snaps=("week", "max"),
    )

    # -- PFR advanced defensive stats, keyed by pfr_player_id --
    adv_cols = [
        "def_targets", "def_completions_allowed", "def_yards_allowed", "def_receiving_td_allowed",
        "def_ints", "def_pressures", "def_tackles_combined", "def_missed_tackles",
    ]
    adv_def = adv[adv["pfr_player_id"].isin(pfr_ids)].copy()
    for c in adv_cols:
        adv_def[c] = pd.to_numeric(adv_def[c], errors="coerce").fillna(0.0)
    adv_agg = adv_def.groupby("pfr_player_id").agg(
        **{c: (c, "sum") for c in adv_cols},
        max_week_adv=("week", "max"),
    )

    adv_pfr_ids_seen = set(adv["pfr_player_id"].dropna().unique())
    adv_pfr_ids_matched = adv_pfr_ids_seen & pfr_ids

    through_week = 0
    for frame, col in ((box_agg, "max_week_box"), (snap_agg, "max_week_snaps"), (adv_agg, "max_week_adv")):
        if len(frame):
            through_week = max(through_week, int(frame[col].max()))

    rows = {}
    for rec in roster_def.itertuples(index=False):
        sid = rec.sleeper_id
        b = box_agg.loc[rec.gsis_id] if rec.gsis_id in box_agg.index else None
        sn = snap_agg.loc[rec.pfr_id] if rec.pfr_id in snap_agg.index else None
        av = adv_agg.loc[rec.pfr_id] if rec.pfr_id in adv_agg.index else None

        tkl_solo = float(b["def_tackles_solo"]) if b is not None else 0.0
        tkl_ast = float(b["def_tackle_assists"]) if b is not None else 0.0
        tfl = float(b["def_tackles_for_loss"]) if b is not None else 0.0
        ff = float(b["def_fumbles_forced"]) if b is not None else 0.0
        sk = float(b["def_sacks"]) if b is not None else 0.0
        sack_yds = float(b["def_sack_yards"]) if b is not None else 0.0
        qbh = float(b["def_qb_hits"]) if b is not None else 0.0
        intc = float(b["def_interceptions"]) if b is not None else 0.0
        int_ret_yds = float(b["def_interception_yards"]) if b is not None else 0.0
        pbu = float(b["def_pass_defended"]) if b is not None else 0.0
        def_td = float(b["def_tds"]) if b is not None else 0.0
        safety = float(b["def_safeties"]) if b is not None else 0.0
        blk_kick = (float(b["def_punt_blocks"]) + float(b["def_pat_blocks"]) + float(b["def_fg_blocks"])) if b is not None else 0.0
        fr = (float(b["fumble_recovery_own"]) + float(b["fumble_recovery_opp"])) if b is not None else 0.0
        fum_ret_yds = (float(b["fumble_recovery_yards_own"]) + float(b["fumble_recovery_yards_opp"])) if b is not None else 0.0
        weeks_with_stats = int(b["weeks_with_stats"]) if b is not None else 0

        defense_snaps = float(sn["defense_snaps"]) if sn is not None else 0.0
        snap_pct = float(sn["defense_pct_avg"]) if sn is not None else None
        games_snap = int(sn["games_played"]) if sn is not None else 0

        games = games_snap if games_snap > 0 else weeks_with_stats

        tgt = float(av["def_targets"]) if av is not None else 0.0
        cmp_ = float(av["def_completions_allowed"]) if av is not None else 0.0
        yds_allow = float(av["def_yards_allowed"]) if av is not None else 0.0
        td_allow = float(av["def_receiving_td_allowed"]) if av is not None else 0.0
        adv_ints = float(av["def_ints"]) if av is not None else 0.0
        prs = float(av["def_pressures"]) if av is not None else 0.0
        tkl_combined_pfr = float(av["def_tackles_combined"]) if av is not None else 0.0
        mtkl = float(av["def_missed_tackles"]) if av is not None else 0.0

        rat_allow = passer_rating_allowed(tgt, cmp_, yds_allow, td_allow, adv_ints) if tgt > 0 else None
        mtkl_denom = tkl_combined_pfr + mtkl
        mtkl_pct = (mtkl / mtkl_denom) if mtkl_denom > 0 else None

        tkl = tkl_solo + tkl_ast

        stat_row = {
            "tkl_solo": tkl_solo, "tkl_ast": tkl_ast, "tkl": tkl, "tfl": tfl,
            "sk": sk, "_sack_yds": sack_yds, "qbh": qbh, "pbu": pbu,
            "intc": intc, "_int_ret_yds": int_ret_yds, "ff": ff, "fr": fr,
            "_fum_ret_yds": fum_ret_yds, "_def_td": def_td, "_safety": safety,
            "_blk_kick": blk_kick,
        }

        rows[sid] = {
            "n": rec.full_name, "p": rec.pos_bucket, "t": rec.team,
            "gp": games, "snp": defense_snaps, "snp_pct": snap_pct,
            "tkl_solo": tkl_solo, "tkl_ast": tkl_ast, "tkl": tkl, "tfl": tfl,
            "ff": ff, "fr": fr, "mtkl": mtkl, "mtkl_pct": mtkl_pct,
            "sk": sk, "qbh": qbh, "prs": prs,
            "prs_per_snap": (prs / defense_snaps) if defense_snaps > 0 else None,
            "pbu": pbu, "intc": intc,
            "tgt": tgt, "cmp": cmp_, "yds_allow": yds_allow, "rat_allow": rat_allow,
            "_stat_row": stat_row,
            "_defense_snaps": defense_snaps,
        }

    return rows, through_week, len(adv_pfr_ids_seen), len(adv_pfr_ids_matched)


COLUMNS = [
    {"key": "gp", "label": "Games", "group": "Usage", "fmt": "int",
     "desc": "Games played on defense this season."},
    {"key": "snp", "label": "Def snaps", "group": "Usage", "fmt": "int",
     "desc": "Total defensive snaps played (nflverse snap counts)."},
    {"key": "snp_pct", "label": "Snap share", "group": "Usage", "fmt": "pct",
     "desc": "Average share of the team's defensive snaps, per game played."},
    {"key": "tkl_solo", "label": "Solo tkl", "group": "Tackling", "fmt": "int",
     "desc": "Solo (unassisted) tackles."},
    {"key": "tkl_ast", "label": "Ast tkl", "group": "Tackling", "fmt": "int",
     "desc": "Assisted tackles."},
    {"key": "tkl", "label": "Tot tkl", "group": "Tackling", "fmt": "int",
     "desc": "Total tackles (solo + assist)."},
    {"key": "tfl", "label": "TFL", "group": "Tackling", "fmt": "int",
     "desc": "Tackles for a loss."},
    {"key": "ff", "label": "FF", "group": "Tackling", "fmt": "int",
     "desc": "Forced fumbles."},
    {"key": "fr", "label": "FR", "group": "Tackling", "fmt": "int",
     "desc": "Fumble recoveries (own + opponent)."},
    {"key": "mtkl", "label": "Missed tkl", "group": "Tackling", "fmt": "int",
     "desc": "Missed tackles (PFR charting)."},
    {"key": "mtkl_pct", "label": "Miss tkl %", "group": "Tackling", "fmt": "pct",
     "desc": "Missed tackle rate: missed / (tackles + missed), PFR."},
    {"key": "sk", "label": "Sacks", "group": "Pass rush", "fmt": "dec1",
     "desc": "Sacks."},
    {"key": "qbh", "label": "QB hits", "group": "Pass rush", "fmt": "int",
     "desc": "QB hits."},
    {"key": "prs", "label": "Pressures", "group": "Pass rush", "fmt": "int",
     "desc": "Pressures: PFR hurries + hits + sacks."},
    {"key": "prs_per_snap", "label": "Prs/snap", "group": "Pass rush", "fmt": "dec2",
     "desc": "Pressures per defensive snap."},
    {"key": "pbu", "label": "PBU", "group": "Coverage", "fmt": "int",
     "desc": "Passes defended (breakups)."},
    {"key": "intc", "label": "INT", "group": "Coverage", "fmt": "int",
     "desc": "Interceptions."},
    {"key": "tgt", "label": "Tgt allowed", "group": "Coverage", "fmt": "int",
     "desc": "Targets allowed while in coverage (PFR)."},
    {"key": "cmp", "label": "Cmp allowed", "group": "Coverage", "fmt": "int",
     "desc": "Completions allowed while in coverage (PFR)."},
    {"key": "yds_allow", "label": "Yds allowed", "group": "Coverage", "fmt": "int",
     "desc": "Receiving yards allowed while in coverage (PFR)."},
    {"key": "rat_allow", "label": "Rating allowed", "group": "Coverage", "fmt": "dec1",
     "desc": "Passer rating allowed when targeted, standard NFL formula (PFR targets/comp/yds/TD/INT)."},
    {"key": "pts", "label": "Fantasy pts", "group": "Fantasy", "fmt": "dec1",
     "desc": "Total fantasy points under the league's own idp_ scoring rules."},
    {"key": "ppg", "label": "Pts/gm", "group": "Fantasy", "fmt": "dec2",
     "desc": "Fantasy points per game played."},
    {"key": "pts_per_snap", "label": "Pts/snap", "group": "Fantasy", "fmt": "dec2",
     "desc": "Fantasy points per defensive snap."},
    {"key": "tkl_per_snap", "label": "Tkl/snap", "group": "Fantasy", "fmt": "dec2",
     "desc": "Total tackles per defensive snap."},
    {"key": "rank", "label": "Rank", "group": "Fantasy", "fmt": "int",
     "desc": "Rank within position group (DL / LB / DB) by total fantasy points."},
]


def finalize(rows, scoring):
    for sid, row in rows.items():
        pts = score_player(row["_stat_row"], scoring)
        row["pts"] = pts
        row["ppg"] = (pts / row["gp"]) if row["gp"] else None
        row["pts_per_snap"] = (pts / row["_defense_snaps"]) if row["_defense_snaps"] > 0 else None
        row["tkl_per_snap"] = (row["tkl"] / row["_defense_snaps"]) if row["_defense_snaps"] > 0 else None
        del row["_stat_row"]
        del row["_defense_snaps"]

    by_pos = {}
    for sid, row in rows.items():
        by_pos.setdefault(row["p"], []).append((sid, row))
    for pos, lst in by_pos.items():
        lst.sort(key=lambda t: (-(t[1]["pts"] or 0.0), -(t[1]["ppg"] or 0.0)))
        for i, (sid, row) in enumerate(lst, 1):
            row["rank"] = i

    numeric_keys = [
        "snp", "snp_pct", "tkl_solo", "tkl_ast", "tkl", "tfl", "ff", "fr", "mtkl", "mtkl_pct",
        "sk", "qbh", "prs", "prs_per_snap", "pbu", "intc", "tgt", "cmp", "yds_allow", "rat_allow",
        "pts", "ppg", "pts_per_snap", "tkl_per_snap",
    ]
    for row in rows.values():
        for k in numeric_keys:
            row[k] = r4(row.get(k))

    return rows


def build_payload(self_check=False):
    league = load_idp_league()
    if league is not None:
        scoring = {k: v for k, v in (league.get("scoring") or {}).items() if k.startswith("idp_") and v}
        league_info = {"id": league.get("id"), "name": league.get("name") or league.get("short_name"), "scoring": scoring}
        print(f"IDP league found: {league_info['name']!r} (id {league_info['id']})")
        print(f"idp_ scoring keys applied: {json.dumps(scoring, sort_keys=True)}")
    else:
        scoring = standard_idp_scoring()
        league_info = {"id": None, "name": None, "scoring": scoring}
        print("No IDP league found in leagues.js roster_positions/scoring -> using standard IDP scoring.")
        print(f"standard scoring: {json.dumps(scoring, sort_keys=True)}")

    unmapped = unmapped_scoring_keys(scoring)
    if unmapped:
        league_info["unmappedScoringKeys"] = unmapped
        print(f"WARNING: idp_ scoring keys with no stat mapping (ignored): {unmapped}")

    roster, stats, snaps, adv = build_dataframes()
    rows, through_week, adv_pfr_seen, adv_pfr_matched = compute(roster, stats, snaps, adv)
    rows = finalize(rows, scoring)

    if self_check:
        run_self_checks(rows, scoring)

    payload = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": SEASON,
        "throughWeek": through_week,
        "league": league_info,
        "source": (
            "nflverse stats_player_week (box score), snap_counts (usage), "
            "PFR advstats_week_def (pressures/coverage/missed tackles) via roster sleeper_id/pfr_id/gsis_id crosswalk"
        ),
        "columns": COLUMNS,
        "players": {sid: row for sid, row in rows.items()},
    }

    match_rate = (adv_pfr_matched / adv_pfr_seen) if adv_pfr_seen else 0.0
    return payload, match_rate


def run_self_checks(rows, scoring):
    print("\n--- self-check ---")

    # 1. scoring function on a hand-built stat line
    hand = {
        "tkl_solo": 5.0, "tkl_ast": 2.0, "tkl": 7.0, "tfl": 1.0,
        "sk": 1.5, "_sack_yds": 9.0, "qbh": 2.0, "pbu": 1.0,
        "intc": 1.0, "_int_ret_yds": 14.0, "ff": 1.0, "fr": 1.0,
        "_fum_ret_yds": 0.0, "_def_td": 0.0, "_safety": 0.0, "_blk_kick": 0.0,
    }
    got = score_player(hand, scoring)
    expected = sum((hand.get(IDP_SCORE_STAT_MAP[k]) or 0.0) * w
                   for k, w in scoring.items() if k.startswith("idp_") and w and k in IDP_SCORE_STAT_MAP)
    assert abs(got - expected) < 1e-9, f"score_player mismatch: {got} != {expected}"
    print(f"  OK  score_player(hand-built line) = {got:.4f}")

    # 2. position bucketing
    assert bucket_pos("DE") == "DL"
    assert bucket_pos("DT") == "DL"
    assert bucket_pos("NT") == "DL"
    assert bucket_pos("dl") == "DL"
    assert bucket_pos("OLB") == "LB"
    assert bucket_pos("ILB") == "LB"
    assert bucket_pos("MLB") == "LB"
    assert bucket_pos("CB") == "DB"
    assert bucket_pos("S") == "DB"
    assert bucket_pos("FS") == "DB"
    assert bucket_pos("SS") == "DB"
    assert bucket_pos("QB") is None
    assert bucket_pos(None) is None
    print("  OK  position bucketing (DE/DT/NT->DL, OLB/ILB/MLB->LB, CB/S/FS/SS->DB, QB->None)")

    # 3. no NaN anywhere in the computed rows
    bad = []
    for sid, row in rows.items():
        for k, v in row.items():
            if isinstance(v, float) and math.isnan(v):
                bad.append((sid, k))
    assert not bad, f"NaN values present: {bad[:5]}"
    print(f"  OK  no NaN across {len(rows)} player rows")

    print("--- self-check passed ---\n")


def to_js(payload) -> str:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return f"window.IDP_ADVANCED={body};\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true", help="run internal asserts before writing output")
    args = ap.parse_args()

    payload, match_rate = build_payload(self_check=args.self_check)

    js = to_js(payload)
    OUT_JS.write_text(js, encoding="utf-8")
    size_kb = len(js.encode("utf-8")) / 1024.0

    players = list(payload["players"].values())
    by_pos = {}
    for p in players:
        by_pos.setdefault(p["p"], []).append(p)

    print(f"\nSeason {payload['season']} through week {payload['throughWeek']}")
    print(f"Wrote {OUT_JS.relative_to(ROOT)} ({size_kb:.1f} KB, {len(players)} players)")
    print(f"PFR def-advstats rows matched to a roster sleeper_id: {match_rate*100:.1f}%")

    for pos in ("DL", "LB", "DB"):
        lst = by_pos.get(pos, [])
        print(f"\n{pos}: {len(lst)} players")
        top5 = sorted((p for p in lst if p["ppg"] is not None), key=lambda p: -p["ppg"])[:5]
        for p in top5:
            print(f"  {p['n']:22s} {p['t'] or '?':3s}  ppg {p['ppg']:6.2f}  pts {p['pts']:6.1f}  gp {p['gp']}")

    print("\nColumn keys: " + ", ".join(c["key"] for c in payload["columns"]))


if __name__ == "__main__":
    sys.exit(main())
