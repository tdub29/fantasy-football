"""Build player-level predictive features beyond raw stats:

  derived/qb_changes.csv          per (team, season): primary QB by attempts,
                                  is_new_starting_qb (yoy), qb_continuity_streak
  derived/player_efficiency.csv   per (player, season, team): snap_share, route%,
                                  YPRR, ADOT, target_per_rr, goal_line_share
  derived/career_health.csv       per player: career_games, expected_games,
                                  availability_pct, injury_history_count
  derived/strength_of_schedule.csv per (team, target_season): SOS by pos based
                                   on opponents' prior-year DvP

Inputs:
  player_stats/week_{yr}.csv
  snap_counts/{yr}.csv
  pfr_adv/season_rec.csv (route data)
  injuries/{yr}.csv
  schedules/games.csv
  derived/def_vs_pos.csv
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


def to_i(x) -> int:
    try:
        if x in (None, "", "NA"):
            return 0
        return int(float(x))
    except Exception:
        return 0


# ============================================================
# 1. QB changes
# ============================================================
def build_qb_changes() -> None:
    # Primary QB per (team, season) by passing attempts
    qb_atts: dict[tuple, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    qb_names: dict[str, str] = {}
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
                if (r.get("position") or "").upper() != "QB":
                    continue
                team = r.get("team"); season = r.get("season")
                pid = r.get("player_id")
                if not (team and season and pid):
                    continue
                atts = to_i(r.get("attempts"))
                qb_atts[(team, season)][pid] += atts
                qb_names[pid] = r.get("player_display_name") or r.get("player_name")

    primary: dict[tuple, dict] = {}
    for (team, season), counts in qb_atts.items():
        best = max(counts.items(), key=lambda kv: kv[1])
        primary[(team, season)] = {
            "team": team, "season": int(season),
            "qb_id": best[0], "qb_name": qb_names.get(best[0], ""),
            "qb_attempts": best[1],
            "team_total_attempts": sum(counts.values()),
            "primary_qb_pct": round(best[1] / max(sum(counts.values()), 1), 3),
        }

    # YoY change + continuity streak
    rows = sorted(primary.values(), key=lambda r: (r["team"], r["season"]))
    streak: dict[tuple, int] = {}
    out_rows = []
    by_key = {(r["team"], r["season"]): r for r in rows}
    for r in rows:
        prev = by_key.get((r["team"], r["season"] - 1))
        is_new = prev and prev["qb_id"] != r["qb_id"]
        if prev and not is_new:
            r["qb_continuity_streak"] = streak.get((r["team"], r["qb_id"]), 1) + 1
        else:
            r["qb_continuity_streak"] = 1
        streak[(r["team"], r["qb_id"])] = r["qb_continuity_streak"]
        r["is_new_starting_qb"] = bool(is_new) if prev else True
        r["prev_qb_id"] = prev["qb_id"] if prev else ""
        r["prev_qb_name"] = prev["qb_name"] if prev else ""
        out_rows.append(r)

    out = OUT / "qb_changes.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        cols = ["team", "season", "qb_id", "qb_name", "qb_attempts",
                "team_total_attempts", "primary_qb_pct",
                "is_new_starting_qb", "prev_qb_id", "prev_qb_name",
                "qb_continuity_streak"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in out_rows:
            w.writerow({c: r.get(c, "") for c in cols})
    print(f"wrote {out}: {len(out_rows)} rows")


# ============================================================
# 2. Player efficiency (snap%, YPRR, ADOT, target_per_rr, GL share)
# ============================================================
def build_player_efficiency() -> None:
    # Snap counts: per (player, season, team) — sum offense snaps
    snap_pl: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    snap_team_off: dict[tuple, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    # snap files per year
    for f in sorted((ROOT / "snap_counts").glob("*.csv")):
        try:
            yr = int(f.stem)
        except ValueError:
            continue
        if yr < 2014:
            continue
        with open(f, encoding="utf-8") as fin:
            for r in csv.DictReader(fin):
                if r.get("game_type") != "REG":
                    continue
                pid = r.get("pfr_player_id") or r.get("player")
                # snap_counts uses pfr_player_id; we'll match later via crosswalk
                team = r.get("team")
                week = r.get("week")
                if not (pid and team and week):
                    continue
                off = to_f(r.get("offense_snaps"))
                snap_pl[(pid, str(yr), team)][week] += off
                # Track per-game team total: max across all team snap rows in that game-week
                snap_team_off[(team, str(yr))][week] = max(
                    snap_team_off[(team, str(yr))][week], off
                )

    # PFR receiving advanced has routes, yprr — but pid is pfr_player_id format
    # Build a map from pfr_player_id -> gsis via id_crosswalk
    import json as _json
    cw = _json.loads((ROOT / "id_crosswalk.json").read_text(encoding="utf-8"))
    pfr_to_gsis = {}
    for gsis, info in cw["by_gsis"].items():
        if info.get("pfr_id"):
            pfr_to_gsis[info["pfr_id"]] = gsis

    # Route data from PFR advanced (season-level)
    routes_idx: dict[tuple, dict] = {}
    pfr_f = ROOT / "pfr_adv/season_rec.csv"
    if pfr_f.exists():
        with open(pfr_f, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                gsis = pfr_to_gsis.get(r.get("pfr_id") or r.get("pfr_player_id"))
                season = r.get("season")
                if not (gsis and season):
                    continue
                routes_idx[(gsis, season)] = r

    # Aggregate per (player_gsis, season, team) from offense weekly
    out_rows = []
    pl_agg: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    pl_info: dict[tuple, dict] = {}
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
                pid = r.get("player_id")
                team = r.get("team")
                season = r.get("season")
                if not (pid and team and season):
                    continue
                pos = (r.get("position") or "").upper()
                if pos not in ("QB", "RB", "WR", "TE"):
                    continue
                key = (pid, season, team)
                a = pl_agg[key]
                a["games"] += 1
                a["targets"] += to_f(r.get("targets"))
                a["receptions"] += to_f(r.get("receptions"))
                a["receiving_yards"] += to_f(r.get("receiving_yards"))
                a["receiving_air_yards"] += to_f(r.get("receiving_air_yards"))
                a["carries"] += to_f(r.get("carries"))
                pl_info[key] = {
                    "name": r.get("player_display_name") or r.get("player_name"),
                    "position": pos,
                }

    for key, a in pl_agg.items():
        pid, season, team = key
        info = pl_info[key]

        # Snap share = sum player offense snaps / sum team max offense snaps over games
        # Need to map gsis to PFR/snap key. snap_counts file actually has gsis_id col!
        # Let me re-read snap_counts properly.
        # (Done below - we'll re-iterate snap files with gsis instead.)
        pass

    # Re-do snap aggregation using gsis_id directly
    snap_player_gsis: dict[tuple, float] = defaultdict(float)
    snap_team_total: dict[tuple, float] = defaultdict(float)
    snap_team_games: dict[tuple, set] = defaultdict(set)
    snap_team_max: dict[tuple, dict[str, float]] = defaultdict(dict)
    for f in sorted((ROOT / "snap_counts").glob("*.csv")):
        try:
            yr = int(f.stem)
        except ValueError:
            continue
        if yr < 2014:
            continue
        with open(f, encoding="utf-8") as fin:
            for r in csv.DictReader(fin):
                if r.get("game_type") != "REG":
                    continue
                gsis = r.get("pfr_player_id")  # actually pfr id in this file
                # Look up - try both pfr_player_id and player id-style fields
                # nflverse snap_counts: columns: game_id, pfr_game_id, season, game_type, team,
                # player, pfr_player_id, position, offense_snaps, offense_pct, ...
                player = r.get("player")
                team = r.get("team"); season = r.get("season") or str(yr); week = r.get("week")
                off = to_f(r.get("offense_snaps"))
                if not (gsis and team and week):
                    continue
                # Map pfr to gsis
                gs = pfr_to_gsis.get(gsis)
                if gs:
                    snap_player_gsis[(gs, season, team)] += off
                # team total: each team has 11 offense snaps per play; sum of all rows / 11
                snap_team_total[(team, season)] += off
                snap_team_games[(team, season)].add(week)
                # For an accurate denom, sum of one player's snaps per game is ≤ team plays.
                # Use team's max-snap player as team play count.
                snap_team_max[(team, season)][week] = max(
                    snap_team_max[(team, season)].get(week, 0), off
                )

    # Now build final rows joining everything
    cols = ["player_id", "name", "position", "season", "team", "games",
            "targets", "carries", "rec_air_yards",
            "snap_share", "adot", "ybc_per_rec", "yac_per_rec",
            "drop_pct", "brk_tkl", "passer_rating_when_targeted",
            "tgt_per_g_when_active"]
    with open(OUT / "player_efficiency.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for key, a in pl_agg.items():
            pid, season, team = key
            info = pl_info[key]
            # Snap share: sum player snaps / team max-snaps total
            psnap = snap_player_gsis.get(key, 0)
            team_total_play_snaps = sum(snap_team_max.get((team, season), {}).values())
            snap_share = round(psnap / team_total_play_snaps, 4) if team_total_play_snaps else 0
            # PFR adv receiving
            pfr = routes_idx.get((pid, season), {})
            adot = to_f(pfr.get("adot"))
            ybc_r = to_f(pfr.get("ybc_r"))
            yac_r = to_f(pfr.get("yac_r"))
            drop_pct = to_f(pfr.get("drop_percent"))
            brk = to_f(pfr.get("brk_tkl"))
            rat = to_f(pfr.get("rat"))
            games_played = max(int(a["games"]), 1)
            w.writerow({
                "player_id": pid, "name": info["name"], "position": info["position"],
                "season": season, "team": team, "games": int(a["games"]),
                "targets": int(a["targets"]), "carries": int(a["carries"]),
                "rec_air_yards": int(a["receiving_air_yards"]),
                "snap_share": snap_share,
                "adot": adot,
                "ybc_per_rec": ybc_r,
                "yac_per_rec": yac_r,
                "drop_pct": drop_pct,
                "brk_tkl": int(brk),
                "passer_rating_when_targeted": rat,
                "tgt_per_g_when_active": round(a["targets"] / games_played, 2),
            })
    print(f"wrote {OUT / 'player_efficiency.csv'}: {len(pl_agg)} rows")


# ============================================================
# 3. Career health / availability
# ============================================================
def build_career_health() -> None:
    # For each player: count seasons in player_stats, sum games played,
    # divide by potential games (17 since 2021, 16 before).
    def potential(season: int) -> int:
        return 17 if season >= 2021 else 16

    pl_games: dict[str, dict] = defaultdict(lambda: {"games": 0, "potential": 0, "seasons": set(),
                                                      "name": "", "pos": ""})
    for f in sorted((ROOT / "player_stats").glob("week_*.csv")):
        try:
            yr = int(f.stem.replace("week_", "").replace("_derived", ""))
        except ValueError:
            continue
        if yr < 2014:
            continue
        with open(f, encoding="utf-8") as fin:
            seen_pids_this_year: set[str] = set()
            for r in csv.DictReader(fin):
                if r.get("season_type") != "REG":
                    continue
                pid = r.get("player_id")
                if not pid:
                    continue
                pl_games[pid]["games"] += 1
                pl_games[pid]["seasons"].add(yr)
                pl_games[pid]["name"] = r.get("player_display_name") or r.get("player_name")
                pl_games[pid]["pos"] = (r.get("position") or "").upper()

    # Compute potential = sum of (potential games) for each season they were ACTIVE in NFL.
    # Approx: count active seasons via first/last appearance, multiply.
    out_rows = []
    for pid, d in pl_games.items():
        seasons = sorted(d["seasons"])
        if not seasons:
            continue
        first, last = seasons[0], seasons[-1]
        potential_total = sum(potential(s) for s in range(first, last + 1))
        avail = round(d["games"] / potential_total, 3) if potential_total else 0
        out_rows.append({
            "player_id": pid, "name": d["name"], "position": d["pos"],
            "first_season": first, "last_season": last,
            "career_games": d["games"], "career_potential": potential_total,
            "availability_pct": avail,
            "seasons_played": len(seasons),
        })

    with open(OUT / "career_health.csv", "w", encoding="utf-8", newline="") as f:
        cols = list(out_rows[0].keys())
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in out_rows:
            w.writerow(r)
    print(f"wrote {OUT / 'career_health.csv'}: {len(out_rows)} rows")


# ============================================================
# 4. Strength of schedule for upcoming 2026 season
# ============================================================
def build_strength_of_schedule() -> None:
    """For each (team, target_season), compute average opponent's prior-year DvP
    per position. Opponents come from schedules/games.csv for that season."""

    # Load DvP for past seasons
    dvp: dict[tuple, dict] = {}
    f = OUT / "def_vs_pos.csv"
    if not f.exists():
        print("def_vs_pos.csv missing — skipping SOS")
        return
    with open(f, encoding="utf-8") as fin:
        for r in csv.DictReader(fin):
            dvp[(r["def_team"], r["season"], r["opp_pos"])] = float(r["fp_ppr_per_g"])

    # Schedule for 2025 + 2026 (if known)
    team_opps: dict[tuple, list[str]] = defaultdict(list)
    with open(ROOT / "schedules/games.csv", encoding="utf-8") as fin:
        for r in csv.DictReader(fin):
            try:
                season = int(r["season"])
            except (KeyError, ValueError):
                continue
            if season not in (2024, 2025, 2026):
                continue
            if r.get("game_type") != "REG":
                continue
            home, away = r["home_team"], r["away_team"]
            team_opps[(home, season)].append(away)
            team_opps[(away, season)].append(home)

    out_rows = []
    for (team, season), opps in sorted(team_opps.items()):
        for pos in ("QB", "RB", "WR", "TE"):
            # Use prior season's DvP
            prior = str(season - 1)
            vals = []
            for opp in opps:
                v = dvp.get((opp, prior, pos))
                if v is not None:
                    vals.append(v)
            if not vals:
                continue
            avg = sum(vals) / len(vals)
            # League avg for prior-year DvP for that pos
            league_vals = [v for k, v in dvp.items() if k[1] == prior and k[2] == pos]
            league_avg = sum(league_vals) / len(league_vals) if league_vals else avg
            out_rows.append({
                "team": team, "target_season": season, "opp_pos": pos,
                "avg_opp_fp_allowed_prior": round(avg, 2),
                "league_avg_prior": round(league_avg, 2),
                "vs_league_avg": round(avg - league_avg, 2),
                "n_opps": len(vals),
            })

    out = OUT / "strength_of_schedule.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        cols = list(out_rows[0].keys())
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in out_rows:
            w.writerow(r)
    print(f"wrote {out}: {len(out_rows)} rows")


def main() -> int:
    print("Building qb_changes...")
    build_qb_changes()
    print("Building player_efficiency...")
    build_player_efficiency()
    print("Building career_health...")
    build_career_health()
    print("Building strength_of_schedule...")
    build_strength_of_schedule()
    return 0


if __name__ == "__main__":
    sys.exit(main())
