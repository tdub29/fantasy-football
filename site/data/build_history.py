"""Build site/data/history.js — historical fantasy stats keyed by Sleeper ID,
optimized for the player-card modal.

Only includes Sleeper players that have a gsis_id match. Trims `by_season`
to 2014+ and keeps just the columns the UI actually renders.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent  # Fantasy Football/
SITE_DATA = ROOT / "site" / "data"
HIST = ROOT / "historical"

CROSSWALK = HIST / "id_crosswalk.json"
PLAYER_CARD = HIST / "derived/player_card.json"

# Per-position columns kept for stat cards (compact)
KEEP_COLS = {
    "QB":  ["games", "fp_4pt_ppr", "fp_4pt_ppr_per_g", "passing_yards", "passing_tds",
            "interceptions", "rushing_yards", "rushing_tds"],
    "RB":  ["games", "fp_ppr", "fp_ppr_per_g", "carries", "rushing_yards", "rushing_tds",
            "receptions", "targets", "receiving_yards", "receiving_tds"],
    "WR":  ["games", "fp_ppr", "fp_ppr_per_g", "receptions", "targets",
            "receiving_yards", "receiving_tds"],
    "TE":  ["games", "fp_ppr", "fp_ppr_per_g", "receptions", "targets",
            "receiving_yards", "receiving_tds"],
    "DEF": ["games", "fp_idp_yuh", "fp_idp_per_g", "def_solo", "def_sacks", "def_int",
            "def_ff", "def_pd"],
    "LB":  ["games", "fp_idp_yuh", "fp_idp_per_g", "def_solo", "def_sacks", "def_int",
            "def_ff", "def_pd"],
    "DB":  ["games", "fp_idp_yuh", "fp_idp_per_g", "def_solo", "def_sacks", "def_int",
            "def_ff", "def_pd"],
    "DL":  ["games", "fp_idp_yuh", "fp_idp_per_g", "def_solo", "def_sacks", "def_int",
            "def_ff", "def_pd"],
    "S":   ["games", "fp_idp_yuh", "fp_idp_per_g", "def_solo", "def_sacks", "def_int",
            "def_ff", "def_pd"],
    "CB":  ["games", "fp_idp_yuh", "fp_idp_per_g", "def_solo", "def_sacks", "def_int",
            "def_ff", "def_pd"],
}
DEFAULT_COLS = ["games", "fp_ppr", "fp_ppr_per_g"]

MIN_SEASON = 2014
ACTIVE_SINCE = 2022  # only ship players who have at least one season >= this


def main() -> int:
    if not CROSSWALK.exists() or not PLAYER_CARD.exists():
        print("Missing inputs — run historical/ scripts first.", file=sys.stderr)
        return 1

    cw = json.loads(CROSSWALK.read_text(encoding="utf-8"))
    cards = json.loads(PLAYER_CARD.read_text(encoding="utf-8"))

    history: dict[str, dict] = {}
    matched = 0
    for sid, info in cw["by_sleeper"].items():
        gsis = info.get("gsis_id")
        if not gsis:
            continue
        card = cards.get(gsis)
        if not card:
            continue

        pos = (info.get("position") or card.get("position") or "").upper()
        cols = KEEP_COLS.get(pos, DEFAULT_COLS)

        # Compute per-season per-game on the fly for the trimmed columns
        by_season: dict[str, dict] = {}
        for season, srow in card.get("by_season", {}).items():
            try:
                yr = int(season)
            except (TypeError, ValueError):
                continue
            if yr < MIN_SEASON:
                continue
            games = srow.get("games") or 0
            # Map *_per_g column → underlying total column
            per_g_map = {
                "fp_ppr_per_g": "fp_ppr",
                "fp_4pt_ppr_per_g": "fp_4pt_ppr",
                "fp_idp_per_g": "fp_idp_yuh",
                "fp_std_per_g": "fp_std",
                "fp_half_per_g": "fp_half",
            }
            entry = {}
            for c in cols:
                if c in per_g_map:
                    val = srow.get(per_g_map[c]) or 0
                    entry[c] = round(val / games, 2) if games else 0
                else:
                    entry[c] = srow.get(c) or 0
            by_season[season] = entry

        if not by_season:
            continue

        years = sorted(by_season.keys())
        if not any(int(y) >= ACTIVE_SINCE for y in years):
            continue
        recent = years[-5:]
        career = card.get("career", {})
        peak = card.get("peak", {})

        history[sid] = {
            "gsis_id": gsis,
            "pos": pos,
            "first": years[0],
            "last": years[-1],
            "seasons": len(years),
            # Compact career stats (only kept cols)
            # Career totals only for non-per_g columns (per-game makes no sense at career-level here)
            "career": {c: round(career.get(c, 0) or 0, 2) for c in cols if not c.endswith("_per_g")},
            "peak_ppr": peak.get("fp_ppr", 0),
            "peak_4pt": peak.get("fp_4pt_ppr", 0),
            "peak_idp": peak.get("fp_idp_yuh", 0),
            # Last 5 years detailed
            "recent": [{"year": y, **by_season[y]} for y in recent],
            # Spark: fp/game per season for ALL years post-2014 (small)
            "spark": [{"y": int(y),
                       "v": by_season[y].get("fp_ppr_per_g")
                            or by_season[y].get("fp_4pt_ppr_per_g")
                            or by_season[y].get("fp_idp_per_g")
                            or 0}
                      for y in years],
        }
        matched += 1

    out = SITE_DATA / "history.js"
    out.write_text(
        "window.HISTORY = " + json.dumps(history, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {out} — {matched} players, {out.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
