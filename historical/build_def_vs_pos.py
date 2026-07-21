"""Opponent fantasy points allowed by position (DvP).

For each (defense_team, season, position), sum the fantasy points scored by
offensive players against that defense and divide by games — a poor-man's
DVOA that's still very predictive for fantasy.

Outputs:
  derived/def_vs_pos.csv      per (season, def_team, opp_pos): fp_allowed_per_g,
                              games, fp_allowed_total, plus per-stat allowances
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "derived"


def to_f(x) -> float:
    try:
        if x in (None, "", "NA"):
            return 0.0
        return float(x)
    except Exception:
        return 0.0


def offense_points_ppr(r: dict) -> float:
    """PPR with 4pt pass TD (matches user's offense leagues)."""
    return (
        to_f(r.get("passing_yards")) / 25.0
        + to_f(r.get("passing_tds")) * 4.0
        - to_f(r.get("passing_interceptions") or r.get("interceptions")) * 2.0
        - to_f(r.get("sack_fumbles_lost")) * 2.0
        + to_f(r.get("rushing_yards")) / 10.0
        + to_f(r.get("rushing_tds")) * 6.0
        - to_f(r.get("rushing_fumbles_lost")) * 2.0
        + to_f(r.get("receiving_yards")) / 10.0
        + to_f(r.get("receiving_tds")) * 6.0
        - to_f(r.get("receiving_fumbles_lost")) * 2.0
        + to_f(r.get("receptions")) * 1.0
    )


def main() -> int:
    POS = {"QB", "RB", "WR", "TE"}
    # (def_team, season, opp_pos) -> sums
    agg: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    games_seen: dict[tuple, set] = defaultdict(set)

    for f in sorted((ROOT / "player_stats").glob("week_*.csv")):
        try:
            yr = int(f.stem.replace("week_", "").replace("_derived", ""))
        except ValueError:
            continue
        if yr < 2014:
            continue
        with open(f, encoding="utf-8") as fin:
            for r in csv.DictReader(fin):
                if r.get("season_type") != "REG":
                    continue
                pos = (r.get("position") or "").upper()
                if pos not in POS:
                    continue
                opp = r.get("opponent_team")
                if not opp:
                    continue
                season = r.get("season")
                week = r.get("week")
                if not (season and week):
                    continue
                key = (opp, season, pos)
                a = agg[key]
                a["fp_ppr"] += offense_points_ppr(r)
                a["pass_yds"] += to_f(r.get("passing_yards"))
                a["pass_tds"] += to_f(r.get("passing_tds"))
                a["rush_yds"] += to_f(r.get("rushing_yards"))
                a["rush_tds"] += to_f(r.get("rushing_tds"))
                a["rec_yds"] += to_f(r.get("receiving_yards"))
                a["rec_tds"] += to_f(r.get("receiving_tds"))
                a["receptions"] += to_f(r.get("receptions"))
                a["targets"] += to_f(r.get("targets"))
                a["carries"] += to_f(r.get("carries"))
                games_seen[key].add(f"{season}-{week}")

    # Write
    out = OUT / "def_vs_pos.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        cols = ["season", "def_team", "opp_pos", "games",
                "fp_ppr_total", "fp_ppr_per_g",
                "pass_yds_per_g", "rush_yds_per_g", "rec_yds_per_g",
                "rec_per_g", "tgt_per_g", "car_per_g",
                "td_per_g"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for key in sorted(agg):
            opp_team, season, pos = key
            a = agg[key]
            g = len(games_seen[key]) or 1
            tds = a["pass_tds"] + a["rush_tds"] + a["rec_tds"]
            w.writerow({
                "season": season, "def_team": opp_team, "opp_pos": pos,
                "games": g,
                "fp_ppr_total": round(a["fp_ppr"], 1),
                "fp_ppr_per_g": round(a["fp_ppr"] / g, 2),
                "pass_yds_per_g": round(a["pass_yds"] / g, 1),
                "rush_yds_per_g": round(a["rush_yds"] / g, 1),
                "rec_yds_per_g": round(a["rec_yds"] / g, 1),
                "rec_per_g": round(a["receptions"] / g, 2),
                "tgt_per_g": round(a["targets"] / g, 2),
                "car_per_g": round(a["carries"] / g, 2),
                "td_per_g": round(tds / g, 3),
            })
    print(f"wrote {out}: {len(agg)} rows")

    # ---- League-relative defensive ranking per pos per season ----
    # Rank teams 1..32 by fp_ppr_per_g allowed (1 = stingiest, 32 = most generous)
    ranks_out = OUT / "def_vs_pos_ranks.csv"
    with open(out, encoding="utf-8") as f, open(ranks_out, "w", encoding="utf-8", newline="") as wfile:
        rows = list(csv.DictReader(f))
        out_rows = []
        # group by (season, pos)
        groups = defaultdict(list)
        for r in rows:
            groups[(r["season"], r["opp_pos"])].append(r)
        for key, grp in groups.items():
            grp.sort(key=lambda r: float(r["fp_ppr_per_g"]))
            for rank, r in enumerate(grp, start=1):
                out_rows.append({
                    "season": r["season"],
                    "def_team": r["def_team"],
                    "opp_pos": r["opp_pos"],
                    "fp_allowed_per_g": r["fp_ppr_per_g"],
                    "rank": rank,
                    "tier": "stingy" if rank <= 8 else "tough" if rank <= 16
                            else "soft" if rank <= 24 else "smash",
                })
        wr = csv.DictWriter(wfile, fieldnames=["season", "def_team", "opp_pos",
                                               "fp_allowed_per_g", "rank", "tier"])
        wr.writeheader()
        for r in out_rows:
            wr.writerow(r)
    print(f"wrote {ranks_out}: {len(out_rows)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
