"""Compute fantasy points (PPR / Half / Std / 4ptPassTD / IDP) per weekly stat row
and build aggregated player season + career summaries used by stat cards.

Inputs:
  player_stats/week_*.csv       (offense)
  idp_stats/week_*.csv          (defense)
  kicking_stats/week_*.csv      (kickers)

Outputs:
  derived/weekly_fantasy.csv    one row per (player, season, week, season_type)
                                with fp_ppr, fp_half, fp_std, fp_4pt_ppr, fp_idp_yuh
  derived/season_summary.csv    per (player, season) — totals + per-game averages
  derived/career_summary.csv    per player — career totals, peaks, age curve buckets
  derived/player_card.json      one keyed dict per player for fast UI lookup
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "derived"
OUT.mkdir(exist_ok=True)


def to_float(x) -> float:
    try:
        if x in (None, "", "NA"):
            return 0.0
        return float(x)
    except Exception:
        return 0.0


def offense_points(r: dict) -> dict[str, float]:
    """Compute multiple scoring variants from one offense weekly row."""
    py = to_float(r.get("passing_yards"))
    ptd = to_float(r.get("passing_tds"))
    pint = to_float(r.get("passing_interceptions") or r.get("interceptions"))
    p2pt = to_float(r.get("passing_2pt_conversions"))
    sack_fum_lost = to_float(r.get("sack_fumbles_lost"))

    ry = to_float(r.get("rushing_yards"))
    rtd = to_float(r.get("rushing_tds"))
    rfl = to_float(r.get("rushing_fumbles_lost"))
    r2pt = to_float(r.get("rushing_2pt_conversions"))

    rec = to_float(r.get("receptions"))
    recy = to_float(r.get("receiving_yards"))
    rectd = to_float(r.get("receiving_tds"))
    recfl = to_float(r.get("receiving_fumbles_lost"))
    rec2pt = to_float(r.get("receiving_2pt_conversions"))

    st_td = to_float(r.get("special_teams_tds"))

    base_no_rec = (
        py / 25.0
        + ptd * 4.0  # default 4pt pass TD
        - pint * 2.0
        - sack_fum_lost * 2.0
        + p2pt * 2.0
        + ry / 10.0
        + rtd * 6.0
        - rfl * 2.0
        + r2pt * 2.0
        + recy / 10.0
        + rectd * 6.0
        - recfl * 2.0
        + rec2pt * 2.0
        + st_td * 6.0
    )
    # 6pt pass TD variants override
    base_6pt = base_no_rec + ptd * 2.0  # add extra 2 to convert 4->6

    fp_std = base_6pt
    fp_half = base_6pt + rec * 0.5
    fp_ppr = base_6pt + rec * 1.0
    fp_4pt_ppr = base_no_rec + rec * 1.0  # 4pt pass TD + full PPR (this user's leagues)
    return {
        "fp_std": round(fp_std, 2),
        "fp_half": round(fp_half, 2),
        "fp_ppr": round(fp_ppr, 2),
        "fp_4pt_ppr": round(fp_4pt_ppr, 2),
    }


def idp_points_yuh(r: dict) -> float:
    """yuH league IDP scoring: solo=1, sack=3, int=5, ff=3, fr=3, pd=3, def_td=6."""
    solo = to_float(r.get("def_tackles_solo"))
    asst = to_float(r.get("def_tackle_assists"))
    sack = to_float(r.get("def_sacks"))
    intn = to_float(r.get("def_interceptions"))
    ff = to_float(r.get("def_fumbles_forced"))
    fr_own = to_float(r.get("def_fumble_recovery_own"))
    fr_opp = to_float(r.get("def_fumble_recovery_opp"))
    pd = to_float(r.get("def_pass_defended"))
    td = to_float(r.get("def_tds"))
    safety = to_float(r.get("def_safety"))
    return round(
        solo * 1.0
        + asst * 0.5
        + sack * 3.0
        + intn * 5.0
        + ff * 3.0
        + (fr_own + fr_opp) * 3.0
        + pd * 3.0
        + td * 6.0
        + safety * 2.0,
        2,
    )


# ---------- WEEKLY OUTPUT ----------
def build_weekly():
    out_path = OUT / "weekly_fantasy.csv"
    fieldnames = [
        "player_id", "player_name", "position", "season", "week", "season_type", "team", "opponent_team",
        "completions", "attempts", "passing_yards", "passing_tds", "interceptions",
        "carries", "rushing_yards", "rushing_tds",
        "receptions", "targets", "receiving_yards", "receiving_tds",
        "fp_std", "fp_half", "fp_ppr", "fp_4pt_ppr", "fp_idp_yuh",
    ]
    n_off = n_idp = 0
    seen: set[tuple] = set()
    with open(out_path, "w", encoding="utf-8", newline="") as fout:
        w = csv.DictWriter(fout, fieldnames=fieldnames)
        w.writeheader()

        # Offense
        for f in sorted((ROOT / "player_stats").glob("week_*.csv")):
            with open(f, encoding="utf-8") as fin:
                for r in csv.DictReader(fin):
                    pts = offense_points(r)
                    key = (r.get("player_id"), r.get("season"), r.get("week"), r.get("season_type"))
                    seen.add(key)
                    n_off += 1
                    w.writerow({
                        "player_id": r.get("player_id"),
                        "player_name": r.get("player_display_name") or r.get("player_name"),
                        "position": r.get("position"),
                        "season": r.get("season"),
                        "week": r.get("week"),
                        "season_type": r.get("season_type"),
                        "team": r.get("team"),
                        "opponent_team": r.get("opponent_team"),
                        "completions": r.get("completions"),
                        "attempts": r.get("attempts"),
                        "passing_yards": r.get("passing_yards"),
                        "passing_tds": r.get("passing_tds"),
                        "interceptions": r.get("passing_interceptions") or r.get("interceptions"),
                        "carries": r.get("carries"),
                        "rushing_yards": r.get("rushing_yards"),
                        "rushing_tds": r.get("rushing_tds"),
                        "receptions": r.get("receptions"),
                        "targets": r.get("targets"),
                        "receiving_yards": r.get("receiving_yards"),
                        "receiving_tds": r.get("receiving_tds"),
                        "fp_std": pts["fp_std"],
                        "fp_half": pts["fp_half"],
                        "fp_ppr": pts["fp_ppr"],
                        "fp_4pt_ppr": pts["fp_4pt_ppr"],
                        "fp_idp_yuh": "",
                    })

        # IDP
        for f in sorted((ROOT / "idp_stats").glob("week_*.csv")):
            with open(f, encoding="utf-8") as fin:
                for r in csv.DictReader(fin):
                    pts = idp_points_yuh(r)
                    n_idp += 1
                    w.writerow({
                        "player_id": r.get("player_id"),
                        "player_name": r.get("player_display_name") or r.get("player_name"),
                        "position": r.get("position"),
                        "season": r.get("season"),
                        "week": r.get("week"),
                        "season_type": r.get("season_type"),
                        "team": r.get("team"),
                        "opponent_team": "",
                        "fp_std": "", "fp_half": "", "fp_ppr": "", "fp_4pt_ppr": "",
                        "fp_idp_yuh": pts,
                    })
    print(f"Wrote {out_path}: offense_rows={n_off}, idp_rows={n_idp}")


# ---------- AGGREGATES ----------
def aggregate():
    """Build per-(player,season) and per-player career summaries."""
    season_keys = ["games", "fp_ppr", "fp_4pt_ppr", "fp_idp_yuh",
                   "passing_yards", "passing_tds", "interceptions",
                   "rushing_yards", "rushing_tds", "carries",
                   "receptions", "targets", "receiving_yards", "receiving_tds",
                   "def_solo", "def_sacks", "def_int", "def_ff", "def_pd"]

    # season_agg[(player_id, season)] = {stat: total, ...}
    season_agg: dict[tuple, dict] = defaultdict(lambda: defaultdict(float))
    # name/pos by player_id
    info: dict[str, dict] = {}
    # game-week dedup so offense and IDP files don't double-count games
    games_seen_set: dict[tuple, set] = defaultdict(set)

    # OFFENSE
    for f in sorted((ROOT / "player_stats").glob("week_*.csv")):
        with open(f, encoding="utf-8") as fin:
            for r in csv.DictReader(fin):
                if r.get("season_type") not in ("REG", "POST"):
                    continue
                if r.get("season_type") == "POST":
                    continue  # focus on REG for fantasy
                pid = r.get("player_id")
                if not pid:
                    continue
                key = (pid, r.get("season"))
                a = season_agg[key]
                wk = r.get("week")
                if wk and wk not in games_seen_set[key]:
                    a["games"] += 1
                    games_seen_set[key].add(wk)
                pts = offense_points(r)
                a["fp_ppr"] += pts["fp_ppr"]
                a["fp_4pt_ppr"] += pts["fp_4pt_ppr"]
                for col, dst in [
                    ("passing_yards", "passing_yards"), ("passing_tds", "passing_tds"),
                    ("passing_interceptions", "interceptions"), ("rushing_yards", "rushing_yards"),
                    ("rushing_tds", "rushing_tds"), ("carries", "carries"),
                    ("receptions", "receptions"), ("targets", "targets"),
                    ("receiving_yards", "receiving_yards"), ("receiving_tds", "receiving_tds"),
                ]:
                    a[dst] += to_float(r.get(col))
                if pid not in info:
                    info[pid] = {
                        "name": r.get("player_display_name") or r.get("player_name"),
                        "position": r.get("position"),
                    }

    # IDP
    for f in sorted((ROOT / "idp_stats").glob("week_*.csv")):
        with open(f, encoding="utf-8") as fin:
            for r in csv.DictReader(fin):
                if r.get("season_type") != "REG":
                    continue
                pid = r.get("player_id")
                if not pid:
                    continue
                key = (pid, r.get("season"))
                a = season_agg[key]
                wk = r.get("week")
                if wk and wk not in games_seen_set[key]:
                    a["games"] += 1
                    games_seen_set[key].add(wk)
                a["fp_idp_yuh"] += idp_points_yuh(r)
                a["def_solo"] += to_float(r.get("def_tackles_solo"))
                a["def_sacks"] += to_float(r.get("def_sacks"))
                a["def_int"] += to_float(r.get("def_interceptions"))
                a["def_ff"] += to_float(r.get("def_fumbles_forced"))
                a["def_pd"] += to_float(r.get("def_pass_defended"))
                if pid not in info:
                    info[pid] = {
                        "name": r.get("player_display_name") or r.get("player_name"),
                        "position": r.get("position"),
                    }

    # Write season_summary.csv
    season_path = OUT / "season_summary.csv"
    with open(season_path, "w", encoding="utf-8", newline="") as fout:
        cols = ["player_id", "name", "position", "season"] + season_keys + [
            "fp_ppr_per_g", "fp_4pt_ppr_per_g", "fp_idp_per_g"]
        w = csv.DictWriter(fout, fieldnames=cols)
        w.writeheader()
        for (pid, season), a in sorted(season_agg.items()):
            games = max(a["games"], 1)
            row = {"player_id": pid, "season": season,
                   "name": info.get(pid, {}).get("name"),
                   "position": info.get(pid, {}).get("position")}
            for k in season_keys:
                row[k] = round(a[k], 2)
            row["fp_ppr_per_g"] = round(a["fp_ppr"] / games, 2)
            row["fp_4pt_ppr_per_g"] = round(a["fp_4pt_ppr"] / games, 2)
            row["fp_idp_per_g"] = round(a["fp_idp_yuh"] / games, 2)
            w.writerow(row)
    print(f"Wrote {season_path}: rows={len(season_agg)}")

    # Career summary
    career: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    seasons_played: dict[str, set] = defaultdict(set)
    peaks: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for (pid, season), a in season_agg.items():
        seasons_played[pid].add(season)
        for k in season_keys:
            career[pid][k] += a[k]
            if a[k] > peaks[pid][k]:
                peaks[pid][k] = a[k]
                peaks[pid][f"{k}_year"] = float(season) if season and season.isdigit() else 0.0

    career_path = OUT / "career_summary.csv"
    with open(career_path, "w", encoding="utf-8", newline="") as fout:
        cols = ["player_id", "name", "position", "seasons", "first_season", "last_season"] + \
               season_keys + [f"peak_{k}" for k in ("fp_ppr", "fp_4pt_ppr", "fp_idp_yuh")]
        w = csv.DictWriter(fout, fieldnames=cols)
        w.writeheader()
        for pid, totals in career.items():
            ys = sorted(int(s) for s in seasons_played[pid] if s and s.isdigit())
            row = {
                "player_id": pid,
                "name": info.get(pid, {}).get("name"),
                "position": info.get(pid, {}).get("position"),
                "seasons": len(ys),
                "first_season": ys[0] if ys else "",
                "last_season": ys[-1] if ys else "",
            }
            for k in season_keys:
                row[k] = round(totals[k], 2)
            for k in ("fp_ppr", "fp_4pt_ppr", "fp_idp_yuh"):
                row[f"peak_{k}"] = round(peaks[pid][k], 2)
            w.writerow(row)
    print(f"Wrote {career_path}: players={len(career)}")

    # JSON player_card index keyed by player_id
    card_path = OUT / "player_card.json"
    cards: dict[str, dict] = {}
    for pid, totals in career.items():
        ys = sorted(int(s) for s in seasons_played[pid] if s and s.isdigit())
        seasons_data = {}
        for (p2, season), a in season_agg.items():
            if p2 != pid:
                continue
            seasons_data[season] = {k: round(a[k], 2) for k in season_keys}
        cards[pid] = {
            "name": info.get(pid, {}).get("name"),
            "position": info.get(pid, {}).get("position"),
            "career": {k: round(totals[k], 2) for k in season_keys},
            "peak": {k: round(peaks[pid][k], 2) for k in ("fp_ppr", "fp_4pt_ppr", "fp_idp_yuh")},
            "first_season": ys[0] if ys else None,
            "last_season": ys[-1] if ys else None,
            "by_season": seasons_data,
        }
    with open(card_path, "w", encoding="utf-8") as f:
        json.dump(cards, f, separators=(",", ":"))
    print(f"Wrote {card_path}: {len(cards)} cards")


def main() -> int:
    build_weekly()
    aggregate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
