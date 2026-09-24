"""Draft capital + athletic profile for every current NFL QB/RB/WR/TE.

Writes site/data/prospect.js: one row per player keyed by Sleeper id -- draft
year/round/pick/team, college, combine measurables, Barnwell's Speed Score,
and our own athleticism percentile composite (NOT Kent Lee Platte's RAS --
see the "athl_pct" field description in the payload itself).

Sources, all public and key-free (github.com/nflverse/nflverse-data releases),
cached under projections/nflverse-cache/ (gitignored) and reused if <24h old:
  draft_picks   draft_picks.parquet   round/pick/team/college/age, keyed by pfr_player_id
  combine       combine.parquet       measurables, keyed by pfr_id
  roster        roster_2026.parquet   carries sleeper_id, the key the site uses;
                                       already one row per gsis_id (deduped here
                                       defensively by latest `week` anyway)

Combine (and, defensively, draft_picks) are joined to the roster by pfr_id
first, then a fallback: normalized name + position + draft-class year. The
fallback uses combine's `season` column rather than `draft_year` -- `draft_year`
is null for combine invitees who went undrafted, but `season` (the year of the
combine itself) is always populated and lines up with the roster's entry_year.

    python projections/build_prospect_profile.py
    python projections/build_prospect_profile.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import pathlib
import time
import urllib.request

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "projections" / "nflverse-cache"
OUT = ROOT / "site" / "data" / "prospect.js"
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
MAX_AGE_H = 24.0
SKILL = ("QB", "RB", "WR", "TE")
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
TIMED_DRILLS = ("forty", "cone", "shuttle")
ALL_DRILLS = ("forty", "bench", "vertical", "broad_jump", "cone", "shuttle")



PFR_TEAM = {"GNB": "GB", "KAN": "KC", "LVR": "LV", "NOR": "NO", "NWE": "NE", "SFO": "SF",
            "TAM": "TB", "SDG": "SD", "RAM": "STL", "STL": "STL", "OAK": "OAK"}

def fetch(tag: str, name: str) -> pathlib.Path:
    """Cached download. A failed refresh keeps the copy on disk and says so."""
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    fresh = p.exists() and (time.time() - p.stat().st_mtime) / 3600 < MAX_AGE_H
    if not fresh:
        try:
            req = urllib.request.Request(f"{BASE}/{tag}/{name}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                tmp = p.with_suffix(".part")
                tmp.write_bytes(r.read())
                tmp.replace(p)
        except Exception as e:
            if not p.exists():
                raise SystemExit(f"{name}: download failed and no cached copy ({e})")
            age = (time.time() - p.stat().st_mtime) / 3600
            print(f"  {name}: refresh failed ({e}); using the {age:.0f}h-old copy")
    return p


def norm_name(s) -> str:
    """Lowercase, drop punctuation/suffixes, collapse to one token for joining."""
    if s is None or (isinstance(s, float) and math.isnan(s)):
        return ""
    s = str(s).lower().replace(".", "").replace("'", "").replace("-", " ")
    return "".join(t for t in s.split() if t not in SUFFIXES)


def speed_score(weight, forty):
    """Barnwell's Speed Score: (weight x 200) / forty^4. Needs both inputs.

    ponytail: the task brief's own worked example (220 lb / 4.40s -> "116.2")
    does not reproduce from this formula (it computes to 117.39); the formula
    as literally specified is implemented here and the self-check asserts the
    value that actually falls out of it, not the brief's number.
    """
    if weight is None or forty is None or pd.isna(weight) or pd.isna(forty) or forty <= 0:
        return None
    return round(float(weight) * 200.0 / (float(forty) ** 4), 2)


def add_drill_percentiles(combine: pd.DataFrame) -> pd.DataFrame:
    """Per-drill percentile (0-100) vs all combine participants at the same pos.

    Timed drills (forty/cone/shuttle) invert: a lower time earns a higher pct.
    """
    combine = combine.copy()
    for drill in ALL_DRILLS:
        s = combine[drill]
        if drill in TIMED_DRILLS:
            s = -s
        combine[f"{drill}_pct"] = s.groupby(combine["pos"]).rank(pct=True) * 100
    return combine


def draft_capital_label(rnd) -> str:
    if rnd is None or pd.isna(rnd):
        return "UDFA"
    rnd = int(rnd)
    if rnd == 1:
        return "Round 1"
    if rnd in (2, 3):
        return "Day 2"
    if rnd in (4, 5, 6, 7):
        return "Day 3"
    return "UDFA"


def age_at_draft(birth_date, draft_year):
    """Age as of an assumed April 25 draft date in draft_year. None if either input is missing."""
    if birth_date is None or pd.isna(birth_date) or draft_year is None or pd.isna(draft_year):
        return None
    bd = pd.Timestamp(birth_date)
    draft_day = pd.Timestamp(year=int(draft_year), month=4, day=25)
    return round((draft_day - bd).days / 365.25, 2)


def clean(v):
    """Recursively turn NaN/NaT/pd.NA into None and numpy scalars into python ones."""
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x) for x in v]
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float):
        return round(v, 2)
    return v


def load_frames():
    roster = pd.read_parquet(fetch("rosters", "roster_2026.parquet"))
    draft = pd.read_parquet(fetch("draft_picks", "draft_picks.parquet"))
    combine = pd.read_parquet(fetch("combine", "combine.parquet"))
    return roster, draft, combine


def build_players(roster: pd.DataFrame, draft: pd.DataFrame, combine: pd.DataFrame):
    # Roster ships one row per gsis_id already, but dedupe defensively by the
    # latest `week` in case a future release carries per-week history.
    roster = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    base = roster[roster["position"].isin(SKILL) & roster["sleeper_id"].notna()].copy()
    base["norm_name"] = base["full_name"].map(norm_name)

    draft = draft.copy()
    draft["_norm"] = draft["pfr_player_name"].map(norm_name)
    draft_by_pfr = draft.dropna(subset=["pfr_player_id"]).drop_duplicates("pfr_player_id", keep="first").set_index("pfr_player_id")
    draft_by_name = (
        draft.dropna(subset=["_norm", "season"])
        .drop_duplicates(["_norm", "position", "season"], keep="first")
        .set_index(["_norm", "position", "season"])
    )

    combine = add_drill_percentiles(combine)
    combine["_norm"] = combine["player_name"].map(norm_name)
    combine_by_pfr = combine.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id", keep="first").set_index("pfr_id")
    combine_by_name = (
        combine.dropna(subset=["_norm", "season"])
        .drop_duplicates(["_norm", "pos", "season"], keep="first")
        .set_index(["_norm", "pos", "season"])
    )

    players = {}
    combine_hits = 0
    for row in base.itertuples():
        pfr = row.pfr_id
        pos = row.position
        entry_year = int(row.entry_year) if pd.notna(row.entry_year) else None
        nm = row.norm_name

        d_row = None
        if pd.notna(pfr) and pfr in draft_by_pfr.index:
            d_row = draft_by_pfr.loc[pfr]
        elif entry_year is not None and (nm, pos, entry_year) in draft_by_name.index:
            d_row = draft_by_name.loc[(nm, pos, entry_year)]

        c_row = None
        if pd.notna(pfr) and pfr in combine_by_pfr.index:
            c_row = combine_by_pfr.loc[pfr]
        elif entry_year is not None and (nm, pos, entry_year) in combine_by_name.index:
            c_row = combine_by_name.loc[(nm, pos, entry_year)]
        if c_row is not None:
            combine_hits += 1

        if d_row is not None:
            draft_year = int(d_row["season"]) if pd.notna(d_row["season"]) else entry_year
            rnd = d_row["round"] if pd.notna(d_row["round"]) else None
            pick = d_row["pick"] if pd.notna(d_row["pick"]) else None
            # draft_picks uses PFR codes (GNB, KAN, TAM); the site uses standard ones.
            # Relocated franchises keep the city they drafted from (SD, OAK, STL).
            drafted_by = PFR_TEAM.get(d_row["team"], d_row["team"]) if pd.notna(d_row["team"]) else None
            college = row.college if pd.notna(row.college) else d_row["college"]
            age = d_row["age"] if pd.notna(d_row["age"]) else age_at_draft(row.birth_date, draft_year)
        else:
            draft_year = entry_year
            rnd = None
            pick = None
            drafted_by = None
            college = row.college if pd.notna(row.college) else None
            age = age_at_draft(row.birth_date, draft_year)

        drills = {}
        if c_row is not None:
            for drill in ALL_DRILLS:
                drills[drill] = c_row[drill]
                drills[f"{drill}_pct"] = c_row[f"{drill}_pct"]
        else:
            for drill in ALL_DRILLS:
                drills[drill] = None
                drills[f"{drill}_pct"] = None

        pct_vals = [drills[f"{d}_pct"] for d in ALL_DRILLS if pd.notna(drills[f"{d}_pct"])]
        athl_pct = round(sum(pct_vals) / len(pct_vals), 2) if len(pct_vals) >= 3 else None

        weight_lb = row.weight if pd.notna(row.weight) else None
        players[str(row.sleeper_id)] = clean(
            {
                "name": row.full_name,
                "pos": pos,
                "team": row.team,
                "draft_year": draft_year,
                "draft_round": rnd,
                "draft_pick": pick,
                "drafted_by": drafted_by,
                "draft_capital": draft_capital_label(rnd),
                "college": college,
                "height_in": row.height if pd.notna(row.height) else None,
                "weight_lb": weight_lb,
                "age_at_draft": age,
                "forty": drills["forty"],
                "forty_pct": drills["forty_pct"],
                "bench": drills["bench"],
                "bench_pct": drills["bench_pct"],
                "vertical": drills["vertical"],
                "vertical_pct": drills["vertical_pct"],
                "broad_jump": drills["broad_jump"],
                "broad_jump_pct": drills["broad_jump_pct"],
                "cone": drills["cone"],
                "cone_pct": drills["cone_pct"],
                "shuttle": drills["shuttle"],
                "shuttle_pct": drills["shuttle_pct"],
                "speed_score": speed_score(weight_lb, drills["forty"]),
                "athl_pct": athl_pct,
            }
        )

    match_rate = 100.0 * combine_hits / len(base) if len(base) else 0.0
    return players, match_rate, len(base)


FIELDS = {
    "name": "Player full name",
    "pos": "Position (QB/RB/WR/TE)",
    "team": "Current NFL team (2-3 letter code)",
    "draft_year": "Draft class year (year entered the league for UDFAs)",
    "draft_round": "Round drafted, 1-7; null if undrafted",
    "draft_pick": "Overall pick number; null if undrafted",
    "drafted_by": "Team that drafted the player (2-3 letter code); null if undrafted",
    "draft_capital": "'Round 1' / 'Day 2' (rounds 2-3) / 'Day 3' (rounds 4-7) / 'UDFA'",
    "college": "College attended",
    "height_in": "Height in inches",
    "weight_lb": "Weight in pounds",
    "age_at_draft": "Approximate age at the draft (assumes an April 25 draft date)",
    "forty": "40-yard dash, seconds",
    "forty_pct": "40-yard dash percentile vs same-position combine field, all years (inverted: faster=higher)",
    "bench": "Bench press reps at 225 lb",
    "bench_pct": "Bench press percentile vs same-position combine field, all years",
    "vertical": "Vertical jump, inches",
    "vertical_pct": "Vertical jump percentile vs same-position combine field, all years",
    "broad_jump": "Broad jump, inches",
    "broad_jump_pct": "Broad jump percentile vs same-position combine field, all years",
    "cone": "3-cone drill, seconds",
    "cone_pct": "3-cone percentile vs same-position combine field, all years (inverted: faster=higher)",
    "shuttle": "20-yard shuttle, seconds",
    "shuttle_pct": "Shuttle percentile vs same-position combine field, all years (inverted: faster=higher)",
    "speed_score": "Barnwell's Speed Score: (weight x 200) / forty^4; null unless both weight and forty exist",
    "athl_pct": (
        "OUR OWN composite: the mean of this player's available drill percentiles, "
        "computed only when at least 3 drills exist. This is NOT Kent Lee Platte's "
        "Relative Athletic Score (RAS) -- it is a simpler same-site composite over "
        "whatever combine drills nflverse has, with no positional-weighting scheme."
    ),
}


def write_payload(players: dict, match_rate: float, total: int):
    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": (
            "nflverse-data (github.com/nflverse/nflverse-data releases): "
            "draft_picks.parquet, combine.parquet, roster_2026.parquet"
        ),
        "fields": FIELDS,
        "players": players,
    }
    body = json.dumps(payload, allow_nan=False, indent=None, separators=(",", ":"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(f"window.PROSPECT={body};\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes), {len(players)} players, combine match rate {match_rate:.1f}% ({total} candidates)")


def self_check():
    # 1. speed score on a known input.
    got = speed_score(220, 4.40)
    assert got == 117.39, f"speed_score(220, 4.40) = {got}, expected 117.39 (see docstring on the brief's own example)"
    assert speed_score(None, 4.4) is None
    assert speed_score(220, None) is None

    # 2. a timed drill inverts: faster time -> higher percentile.
    toy = pd.DataFrame({"pos": ["RB"] * 4, "forty": [4.30, 4.50, 4.70, 4.40],
                        "bench": [20, 15, 10, 18], "vertical": [36, 30, 28, 33],
                        "broad_jump": [120, 110, 105, 115], "cone": [6.8, 7.2, 7.5, 7.0],
                        "shuttle": [4.1, 4.3, 4.5, 4.2]})
    scored = add_drill_percentiles(toy)
    fastest = scored.loc[scored["forty"].idxmin(), "forty_pct"]
    slowest = scored.loc[scored["forty"].idxmax(), "forty_pct"]
    assert fastest > slowest, f"fastest 40 pct ({fastest}) should beat slowest ({slowest})"
    assert scored["forty_pct"].max() == 100.0
    # a non-timed drill does NOT invert: highest raw value gets the top pct.
    best_bench = scored.loc[scored["bench"].idxmax(), "bench_pct"]
    assert best_bench == 100.0

    # 3. NaN never survives cleaning / JSON dumping.
    dirty = {"a": float("nan"), "b": [1.0, float("nan")], "c": pd.NA, "d": pd.NaT, "e": 3.14159}
    cleaned = clean(dirty)
    dumped = json.dumps(cleaned, allow_nan=False)
    assert "NaN" not in dumped and "null" in dumped
    assert cleaned["e"] == 3.14
    assert cleaned["a"] is None and cleaned["c"] is None and cleaned["d"] is None

    print("self-check OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        self_check()
        return

    roster, draft, combine = load_frames()
    players, match_rate, total = build_players(roster, draft, combine)
    write_payload(players, match_rate, total)


if __name__ == "__main__":
    main()
