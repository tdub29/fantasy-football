"""Build opportunity-share / roster-turnover / new-team-signing dataset.

Outputs (under derived/):
  team_season_totals.csv     team-level total targets/carries/air_yards/rz touches
  player_team_share.csv      per (player, season, team) — share of team's targets/
                              carries/air_yards/rz, plus contract APY at signing
  team_turnover.csv          per (team, season) — vacated share, incoming player count,
                              total APY influx, biggest losses and additions
  player_new_team.csv        per (player, season) — new_team flag, prev_team, contract
                              APY at signing, prior-season share, contract-tier expectation

Scope: 2014-2024 (offense), with RZ pulled from PBP 2020-2025.
"""
from __future__ import annotations

import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from season_window import INFLIGHT_WEEK_FLOOR, weeks_on_disk

ROOT = Path(__file__).parent
OUT = ROOT / "derived"
OUT.mkdir(exist_ok=True)

# Skill positions only — offensive opportunity is meaningful here
SKILL = {"QB", "RB", "WR", "TE", "FB"}

# A season is "in flight" until enough REG weeks are on disk for participation
# (games >= 1) to mean anything. Under that floor one missed game reads as a
# leaver, so membership for that season comes from the roster file instead.
# The floor itself lives in season_window, which is also what keeps the
# season-complete aggregates in the other builders off the season in progress.

# Roster statuses that mean "on this team". CUT and RET are not.
ON_ROSTER = {"ACT", "RES", "DEV", "EXE"}
# A practice-squad body is on the team but is not a signing worth listing.
JOINER_STATUS = {"ACT", "RES"}


def to_f(x) -> float:
    try:
        if x in (None, "", "NA"):
            return 0.0
        return float(x)
    except Exception:
        return 0.0


def norm_name(s: str | None) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


# Map "Cardinals" -> "ARI" etc. for joining contracts to nflverse stats
TEAM_NAME_TO_ABBR = {
    "cardinals": "ARI", "falcons": "ATL", "ravens": "BAL", "bills": "BUF",
    "panthers": "CAR", "bears": "CHI", "bengals": "CIN", "browns": "CLE",
    "cowboys": "DAL", "broncos": "DEN", "lions": "DET", "packers": "GB",
    "texans": "HOU", "colts": "IND", "jaguars": "JAX", "chiefs": "KC",
    "raiders": "LV", "chargers": "LAC", "rams": "LA", "dolphins": "MIA",
    "vikings": "MIN", "patriots": "NE", "saints": "NO", "giants": "NYG",
    "jets": "NYJ", "eagles": "PHI", "steelers": "PIT", "49ers": "SF",
    "seahawks": "SEA", "buccaneers": "TB", "titans": "TEN", "commanders": "WAS",
    "redskins": "WAS", "football team": "WAS",
    "oakland raiders": "LV", "san diego chargers": "LAC", "st. louis rams": "LA",
}


# ============================================================
# 1. Aggregate team totals + per-player share by season
# ============================================================
def build_player_team_share() -> tuple[dict, dict]:
    """Returns (team_totals, player_team_share) keyed by (team, season).

    player_team_share keyed by (player_id, season, team) -> dict of shares.
    """
    # First pass: weekly stats -> sum per (player, season, team)
    p_agg: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    p_meta: dict[tuple, dict] = {}
    # Track team-season totals
    t_agg: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for f in sorted((ROOT / "player_stats").glob("week_*.csv")):
        # Filename: week_2024.csv
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
                if pos not in SKILL:
                    continue
                pid = r.get("player_id")
                team = r.get("team")
                season = r.get("season")
                if not (pid and team and season):
                    continue
                key = (pid, season, team)
                a = p_agg[key]
                a["games"] += 1
                a["targets"] += to_f(r.get("targets"))
                a["receptions"] += to_f(r.get("receptions"))
                a["receiving_yards"] += to_f(r.get("receiving_yards"))
                a["receiving_air_yards"] += to_f(r.get("receiving_air_yards"))
                a["receiving_tds"] += to_f(r.get("receiving_tds"))
                a["carries"] += to_f(r.get("carries"))
                a["rushing_yards"] += to_f(r.get("rushing_yards"))
                a["rushing_tds"] += to_f(r.get("rushing_tds"))
                a["passing_attempts"] += to_f(r.get("attempts"))
                a["passing_air_yards"] += to_f(r.get("passing_air_yards"))
                if key not in p_meta:
                    p_meta[key] = {
                        "name": r.get("player_display_name") or r.get("player_name"),
                        "position": pos,
                    }
                # Team aggregation: only count non-QB carry/target stats per offense
                tkey = (team, season)
                if pos != "QB":
                    t_agg[tkey]["team_targets"] += to_f(r.get("targets"))
                    t_agg[tkey]["team_air_yards"] += to_f(r.get("receiving_air_yards"))
                    t_agg[tkey]["team_carries"] += to_f(r.get("carries"))
                # QB rushing contributes to team carries (mobile QBs)
                else:
                    t_agg[tkey]["team_carries"] += to_f(r.get("carries"))

    # Compute share per player
    p_share: dict[tuple, dict] = {}
    for key, a in p_agg.items():
        pid, season, team = key
        t = t_agg.get((team, season), {})
        tt = t.get("team_targets", 0) or 1
        tc = t.get("team_carries", 0) or 1
        tay = t.get("team_air_yards", 0) or 1
        p_share[key] = {
            **p_meta.get(key, {}),
            "player_id": pid, "season": season, "team": team,
            "games": int(a["games"]),
            "targets": int(a["targets"]),
            "carries": int(a["carries"]),
            "rec_air_yards": int(a["receiving_air_yards"]),
            "receptions": int(a["receptions"]),
            "rec_yards": int(a["receiving_yards"]),
            "rush_yards": int(a["rushing_yards"]),
            "target_share": round(a["targets"] / tt, 4),
            "rush_share": round(a["carries"] / tc, 4),
            "air_yards_share": round(a["receiving_air_yards"] / tay, 4),
        }
    return t_agg, p_share


# ============================================================
# 2. Red-zone touches from PBP (2020-2025)
# ============================================================
def build_redzone_shares(p_share: dict) -> None:
    """Mutate p_share entries with rz_targets/rz_carries/rz_tgt_share/rz_rush_share."""
    # PBP files cover 2020-2025
    rz_player: dict[tuple, dict] = defaultdict(lambda: defaultdict(int))
    rz_team: dict[tuple, dict] = defaultdict(lambda: defaultdict(int))

    for yr in range(2020, 2026):
        f = ROOT / "pbp" / f"{yr}.csv.gz"
        if not f.exists():
            continue
        with gzip.open(f, "rt", encoding="utf-8", errors="replace") as fin:
            for r in csv.DictReader(fin):
                if r.get("season_type") != "REG":
                    continue
                try:
                    yardline = int(r.get("yardline_100") or 100)
                except ValueError:
                    yardline = 100
                if yardline > 20:
                    continue  # not red zone
                posteam = r.get("posteam")
                season = r.get("season") or str(yr)
                tkey = (posteam, season)
                if r.get("rush_attempt") == "1":
                    pid = r.get("rusher_player_id")
                    if pid:
                        rz_player[(pid, season, posteam)]["rz_carries"] += 1
                    rz_team[tkey]["rz_carries"] += 1
                if r.get("pass_attempt") == "1":
                    pid = r.get("receiver_player_id")
                    if pid:
                        rz_player[(pid, season, posteam)]["rz_targets"] += 1
                    rz_team[tkey]["rz_targets"] += 1

    for key, p in p_share.items():
        pid, season, team = key
        tk = (team, season)
        rzp = rz_player.get(key, {})
        rzt = rz_team.get(tk, {})
        rz_tgt = rzp.get("rz_targets", 0)
        rz_car = rzp.get("rz_carries", 0)
        tt = rzt.get("rz_targets", 0) or 1
        tc = rzt.get("rz_carries", 0) or 1
        p["rz_targets"] = rz_tgt
        p["rz_carries"] = rz_car
        p["rz_tgt_share"] = round(rz_tgt / tt, 4) if tt else 0
        p["rz_rush_share"] = round(rz_car / tc, 4) if tc else 0


# ============================================================
# 3a. Season roster membership (for the in-flight season)
# ============================================================
def load_season_roster(season: int) -> tuple[dict, dict]:
    """Returns (team -> set of gsis ids on the roster, pid -> meta).

    Skill positions only. Empty dicts when the roster file is not on disk.
    """
    f = ROOT / "rosters" / f"{season}.csv"
    if not f.exists():
        return {}, {}
    by_team: dict[str, set[str]] = defaultdict(set)
    meta: dict[str, dict] = {}
    with open(f, encoding="utf-8") as fin:
        for r in csv.DictReader(fin):
            status = (r.get("status") or "").upper()
            if status not in ON_ROSTER:
                continue
            pos = (r.get("position") or "").upper()
            if pos not in SKILL:
                continue
            pid, team = r.get("gsis_id"), r.get("team")
            if not (pid and team):
                continue
            by_team[team].add(pid)
            # ACT beats DEV when a player somehow appears twice
            if pid not in meta or status in JOINER_STATUS:
                meta[pid] = {
                    "name": r.get("full_name") or r.get("football_name"),
                    "pos": pos,
                    "status": status,
                    "rookie_year": r.get("rookie_year") or r.get("entry_year") or "",
                    "draft_number": to_f(r.get("draft_number")),
                }
    return dict(by_team), meta


# ============================================================
# 3. Roster turnover: leavers / joiners per team-season
# ============================================================
def build_turnover(p_share: dict) -> tuple[dict, dict]:
    """Returns:
      turnover[(team, season)] -> dict with vacated_target_share, vacated_rush_share,
                                   incoming_count, leaver_names[], joiner_names[]
      player_new_team[(pid, season)] -> dict with prev_team, new_team flag, prior shares
    """
    # Index player->seasons,team
    player_seasons: dict[str, list] = defaultdict(list)  # pid -> [(season, team, target_share, rush_share, ay_share)]
    for (pid, season, team), p in p_share.items():
        player_seasons[pid].append((int(season), team, p["target_share"], p["rush_share"], p["air_yards_share"], p["games"], p["targets"], p["carries"], p["name"], p["position"]))

    # team_roster[(team, season)] -> set of player_ids that played at least 1 game
    team_roster: dict[tuple, set[str]] = defaultdict(set)
    for (pid, season, team), p in p_share.items():
        if p["games"] >= 1:
            team_roster[(team, int(season))].add(pid)

    turnover: dict[tuple, dict] = {}
    player_new_team: dict[tuple, dict] = {}

    # For each player, sort seasons and detect transitions
    for pid, seasons in player_seasons.items():
        seasons.sort()  # by year
        for i, (yr, team, ts, rs, ays, games, tgts, cars, name, pos) in enumerate(seasons):
            prev = seasons[i-1] if i > 0 else None
            prev_team = prev[1] if prev else None
            prev_year = prev[0] if prev else None
            consecutive = prev and (yr - prev_year == 1)
            new_team = (not consecutive) or (prev_team != team)
            player_new_team[(pid, str(yr))] = {
                "player_id": pid,
                "name": name,
                "position": pos,
                "season": yr,
                "team": team,
                "prev_team": prev_team if consecutive else None,
                "new_team": bool(new_team),
                "is_rookie_or_first_season": prev is None,
                "prior_target_share": prev[2] if prev else 0,
                "prior_rush_share": prev[3] if prev else 0,
                "prior_air_yards_share": prev[4] if prev else 0,
                "prior_targets": prev[6] if prev else 0,
                "prior_carries": prev[7] if prev else 0,
                "current_target_share": ts,
                "current_rush_share": rs,
                "current_air_yards_share": ays,
            }

    # Compute team turnover by comparing year-over-year rosters
    all_team_seasons = sorted(team_roster.keys())
    for team, season in all_team_seasons:
        prev_roster = team_roster.get((team, season - 1))
        cur_roster = team_roster.get((team, season))
        if not cur_roster:
            continue
        leavers = (prev_roster or set()) - cur_roster
        joiners = cur_roster - (prev_roster or set())

        vacated_t = vacated_r = vacated_ay = 0.0
        leaver_list = []
        for pid in leavers:
            # Their share LAST year on this team
            prev_p = p_share.get((pid, str(season - 1), team))
            if not prev_p:
                continue
            vacated_t += prev_p["target_share"]
            vacated_r += prev_p["rush_share"]
            vacated_ay += prev_p["air_yards_share"]
            leaver_list.append({
                "player_id": pid, "name": prev_p["name"], "pos": prev_p["position"],
                "prev_target_share": prev_p["target_share"],
                "prev_rush_share": prev_p["rush_share"],
                "prev_air_yards_share": prev_p["air_yards_share"],
            })
        leaver_list.sort(key=lambda x: -(x["prev_target_share"] + x["prev_rush_share"]))

        joiner_list = []
        for pid in joiners:
            cur_p = p_share.get((pid, str(season), team))
            if not cur_p:
                continue
            # Previous season share on prior team (any team)
            prev_seasons = [s for s in player_seasons[pid] if s[0] == season - 1]
            prior_t = prev_seasons[0][2] if prev_seasons else 0
            prior_r = prev_seasons[0][3] if prev_seasons else 0
            joiner_list.append({
                "player_id": pid, "name": cur_p["name"], "pos": cur_p["position"],
                "cur_target_share": cur_p["target_share"],
                "cur_rush_share": cur_p["rush_share"],
                "prior_target_share_elsewhere": prior_t,
                "prior_rush_share_elsewhere": prior_r,
                "rookie": not prev_seasons and player_new_team.get((pid, str(season)), {}).get("is_rookie_or_first_season", False),
            })
        joiner_list.sort(key=lambda x: -(x["cur_target_share"] + x["cur_rush_share"]))

        turnover[(team, season)] = {
            "team": team, "season": season,
            "basis": "participation",
            "vacated_target_share": round(vacated_t, 4),
            "vacated_rush_share": round(vacated_r, 4),
            "vacated_air_yards_share": round(vacated_ay, 4),
            "leaver_count": len(leaver_list),
            "joiner_count": len(joiner_list),
            "top_leavers": leaver_list[:5],
            "top_joiners": joiner_list[:5],
        }

    # The in-flight season gets membership from the roster file. Participation
    # cannot answer "who left" after one or two weeks: every healthy scratch and
    # every player on a bye-adjacent inactive list reads as a leaver.
    for season in sorted({s for (_, s) in team_roster} | {s + 1 for (_, s) in team_roster}):
        by_team, meta = load_season_roster(season)
        if not by_team:
            continue
        played = weeks_on_disk(season)
        if played >= INFLIGHT_WEEK_FLOOR:
            continue  # enough of the season is on disk, participation is honest
        for team, cur_ids in by_team.items():
            prev_roster = team_roster.get((team, season - 1))
            if not prev_roster:
                continue
            turnover[(team, season)] = roster_turnover_row(
                team, season, played, prev_roster, cur_ids, meta,
                p_share, player_seasons,
            )

    return turnover, player_new_team


def roster_turnover_row(team, season, weeks_played, prev_roster, cur_ids, meta,
                        p_share, player_seasons) -> dict:
    """One (team, season) turnover row built from roster membership.

    Leavers keep the same meaning and the same numbers as the participation
    path: who played for this team last season and is no longer on the roster,
    priced at the share they held. Joiners cannot carry a current-season share
    that means anything yet, so they carry their prior share elsewhere and the
    row is flagged basis=roster so the UI can say which number it is showing.
    """
    vacated_t = vacated_r = vacated_ay = 0.0
    leaver_list = []
    for pid in prev_roster - cur_ids:
        prev_p = p_share.get((pid, str(season - 1), team))
        if not prev_p:
            continue
        vacated_t += prev_p["target_share"]
        vacated_r += prev_p["rush_share"]
        vacated_ay += prev_p["air_yards_share"]
        leaver_list.append({
            "player_id": pid, "name": prev_p["name"], "pos": prev_p["position"],
            "prev_target_share": prev_p["target_share"],
            "prev_rush_share": prev_p["rush_share"],
            "prev_air_yards_share": prev_p["air_yards_share"],
        })
    leaver_list.sort(key=lambda x: -(x["prev_target_share"] + x["prev_rush_share"]))

    joiner_list = []
    for pid in cur_ids - prev_roster:
        m = meta.get(pid) or {}
        if m.get("status") not in JOINER_STATUS:
            continue  # practice squad counts as membership, not as a signing
        prior = [x for x in player_seasons.get(pid, []) if x[0] == season - 1]
        prior_t = prior[0][2] if prior else 0
        prior_r = prior[0][3] if prior else 0
        cur_p = p_share.get((pid, str(season), team)) or {}
        joiner_list.append({
            "player_id": pid,
            "name": m.get("name") or (cur_p.get("name") if cur_p else pid),
            "pos": m.get("pos") or cur_p.get("position") or "",
            "cur_target_share": cur_p.get("target_share", 0),
            "cur_rush_share": cur_p.get("rush_share", 0),
            "prior_target_share_elsewhere": prior_t,
            "prior_rush_share_elsewhere": prior_r,
            "rookie": str(m.get("rookie_year") or "") == str(season) or not player_seasons.get(pid),
        })
    # Rank on the only share a joiner has before the season runs: what he held
    # elsewhere. Rookies have none, so a drafted rookie is ordered by pick.
    def joiner_key(j):
        held = j["prior_target_share_elsewhere"] + j["prior_rush_share_elsewhere"]
        if held:
            return (0, -held)
        pick = (meta.get(j["player_id"]) or {}).get("draft_number") or 999
        return (1, pick)
    joiner_list.sort(key=joiner_key)

    return {
        "team": team, "season": season,
        "basis": "roster",
        "weeks_played": weeks_played,
        "vacated_target_share": round(vacated_t, 4),
        "vacated_rush_share": round(vacated_r, 4),
        "vacated_air_yards_share": round(vacated_ay, 4),
        "leaver_count": len(leaver_list),
        "joiner_count": len(joiner_list),
        "top_leavers": leaver_list[:5],
        "top_joiners": joiner_list[:5],
    }


# ============================================================
# 4. Contracts: join to player-season
# ============================================================
def build_contracts_index() -> dict[str, list[dict]]:
    """Index contracts by normalized name + position. Returns name_pos -> list of contracts."""
    f = ROOT / "contracts" / "historical_contracts.csv.gz"
    idx: dict[str, list[dict]] = defaultdict(list)
    with gzip.open(f, "rt", encoding="utf-8") as fin:
        for r in csv.DictReader(fin):
            key = (norm_name(r.get("player")), (r.get("position") or "").upper())
            try:
                year_signed = int(r.get("year_signed") or 0)
                years = int(r.get("years") or 1)
                apy = float(r.get("apy") or 0)
                value = float(r.get("value") or 0)
                guar = float(r.get("guaranteed") or 0)
            except (TypeError, ValueError):
                continue
            idx[key].append({
                "year_signed": year_signed,
                "years": years,
                "apy": apy,
                "value": value,
                "guaranteed": guar,
                "team": TEAM_NAME_TO_ABBR.get((r.get("team") or "").lower().strip(), r.get("team")),
                "year_end": year_signed + years - 1,
            })
    for k in idx:
        idx[k].sort(key=lambda c: c["year_signed"])
    return idx


def apy_for_season(contracts: list[dict], season: int, team: str | None) -> dict | None:
    """Pick the contract that covered this player in this season on this team."""
    if not contracts:
        return None
    # Prefer one whose [year_signed, year_end] window contains `season` AND team matches
    matches = [c for c in contracts if c["year_signed"] <= season <= c["year_end"]]
    if team:
        team_matches = [c for c in matches if c.get("team") == team]
        if team_matches:
            return max(team_matches, key=lambda c: c["year_signed"])
    if matches:
        return max(matches, key=lambda c: c["year_signed"])
    # else closest prior contract
    prior = [c for c in contracts if c["year_signed"] <= season]
    if prior:
        return max(prior, key=lambda c: c["year_signed"])
    return None


# ============================================================
# Main
# ============================================================
def write_turnover(turnover: dict) -> None:
    with open(OUT / "team_turnover.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["team", "season", "basis", "weeks_played",
                    "vacated_target_share", "vacated_rush_share",
                    "vacated_air_yards_share", "leaver_count", "joiner_count",
                    "top_leavers", "top_joiners"])
        for (team, season), t in sorted(turnover.items()):
            w.writerow([team, season, t.get("basis", "participation"),
                        t.get("weeks_played", ""), t["vacated_target_share"],
                        t["vacated_rush_share"], t["vacated_air_yards_share"],
                        t["leaver_count"], t["joiner_count"],
                        json.dumps(t["top_leavers"], separators=(",", ":")),
                        json.dumps(t["top_joiners"], separators=(",", ":"))])
    print(f"  wrote team_turnover.csv: {len(turnover)} rows")


def main() -> int:
    # --turnover-only refreshes team_turnover.csv and nothing else. Turnover
    # needs no red-zone or contract join, and the other derived files are
    # season-complete aggregates that an in-flight season would dilute.
    turnover_only = "--turnover-only" in sys.argv

    print("Building player_team_share + team totals...")
    t_agg, p_share = build_player_team_share()
    print(f"  players: {len(p_share)}, team-seasons: {len(t_agg)}")

    if not turnover_only:
        print("Building red-zone shares from PBP...")
        build_redzone_shares(p_share)

    print("Building turnover...")
    turnover, player_new_team = build_turnover(p_share)
    print(f"  turnover rows: {len(turnover)}, player-seasons flagged: {len(player_new_team)}")

    if turnover_only:
        write_turnover(turnover)
        return 0

    print("Joining contracts...")
    contracts_idx = build_contracts_index()
    n_apy = 0
    for (pid, season), p in player_new_team.items():
        name_key = (norm_name(p["name"]), p["position"])
        cs = contracts_idx.get(name_key, [])
        c = apy_for_season(cs, int(season), p.get("team"))
        if c:
            p["apy"] = int(c["apy"])
            p["contract_year_signed"] = c["year_signed"]
            p["contract_years"] = c["years"]
            p["contract_value"] = int(c["value"])
            p["contract_guaranteed"] = int(c["guaranteed"])
            p["signed_new_team_this_year"] = bool(
                p["new_team"] and c["year_signed"] == int(season)
            )
            n_apy += 1
        else:
            p["apy"] = 0
            p["signed_new_team_this_year"] = False
    print(f"  matched contracts: {n_apy}/{len(player_new_team)}")

    # ---- Layer draft capital onto rookie APY (so 1st-round RBs aren't bucketed
    #      with UDFAs). We tag a draft_tier based on overall pick. ----
    draft_index: dict[str, dict] = {}
    with open(ROOT / "draft" / "draft_picks.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            gsis = r.get("gsis_id")
            if not gsis:
                continue
            try:
                pick = int(r.get("pick") or 999)
            except ValueError:
                pick = 999
            try:
                rnd = int(r.get("round") or 99)
            except ValueError:
                rnd = 99
            draft_index[gsis] = {"round": rnd, "pick": pick, "season": int(r.get("season") or 0)}

    def draft_tier(pid: str, season: int) -> str | None:
        d = draft_index.get(pid)
        if not d or d["season"] != season:
            return None
        if d["pick"] <= 16:
            return "d_top16"
        if d["pick"] <= 32:
            return "d_round1"
        if d["round"] <= 2:
            return "d_round2"
        if d["round"] <= 3:
            return "d_round3"
        return "d_late"

    # ---- Position-aware "expected target/rush share given APY tier" baseline ----
    # Build percentile-based tiers per position from contracts that ARE on new teams,
    # then average their realized current_target_share/rush_share to produce an
    # expected-share lookup the UI can use as a forecast for new arrivals.
    print("Building APY -> expected-share baselines...")
    pos_apy_buckets: dict[tuple, list[float]] = defaultdict(list)  # (pos, bucket) -> [tgt_share]
    pos_apy_rush_buckets: dict[tuple, list[float]] = defaultdict(list)
    APY_BUCKETS = [
        (0, 1_000_000, "rookie/min"),
        (1_000_000, 3_000_000, "low"),
        (3_000_000, 8_000_000, "mid"),
        (8_000_000, 18_000_000, "high"),
        (18_000_000, 1e12, "elite"),
    ]

    def bucket_for(apy: float) -> str:
        for lo, hi, label in APY_BUCKETS:
            if lo <= apy < hi:
                return label
        return "rookie/min"

    for (pid, season), p in player_new_team.items():
        if not p["new_team"]:
            continue
        # Rookies: bucket by draft tier (overrides APY which is always rookie-min)
        dt = draft_tier(pid, int(season)) if p.get("is_rookie_or_first_season") else None
        if dt:
            b = dt
        elif p.get("apy"):
            b = bucket_for(p["apy"])
        else:
            continue
        pos_apy_buckets[(p["position"], b)].append(p["current_target_share"])
        pos_apy_rush_buckets[(p["position"], b)].append(p["current_rush_share"])

    expected = {}
    for (pos, b), vals in pos_apy_buckets.items():
        vals_sorted = sorted(vals)
        median = vals_sorted[len(vals_sorted) // 2] if vals_sorted else 0
        rvals = pos_apy_rush_buckets.get((pos, b), [])
        rvals_sorted = sorted(rvals)
        rmedian = rvals_sorted[len(rvals_sorted) // 2] if rvals_sorted else 0
        expected[f"{pos}|{b}"] = {
            "n": len(vals),
            "median_target_share": round(median, 4),
            "median_rush_share": round(rmedian, 4),
            "mean_target_share": round(sum(vals) / len(vals), 4) if vals else 0,
        }

    with open(OUT / "apy_expected_share.json", "w", encoding="utf-8") as f:
        json.dump(expected, f, indent=2)
    print(f"  wrote APY expected baselines: {len(expected)} pos/bucket cells")

    # Tag each player_new_team row with expected_share given their bucket
    for (pid, season), p in player_new_team.items():
        dt = draft_tier(pid, int(season)) if p.get("is_rookie_or_first_season") else None
        b = dt if dt else bucket_for(p.get("apy", 0))
        p["apy_bucket"] = b
        ek = f"{p['position']}|{b}"
        ex = expected.get(ek, {})
        p["expected_target_share"] = ex.get("median_target_share", 0)
        p["expected_rush_share"] = ex.get("median_rush_share", 0)

    # ---- Write outputs ----
    # team_season_totals.csv
    with open(OUT / "team_season_totals.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["team", "season", "team_targets", "team_carries", "team_air_yards"])
        for (team, season), a in sorted(t_agg.items()):
            w.writerow([team, season, int(a["team_targets"]), int(a["team_carries"]),
                        int(a["team_air_yards"])])
    print(f"  wrote team_season_totals.csv: {len(t_agg)} rows")

    # player_team_share.csv
    with open(OUT / "player_team_share.csv", "w", encoding="utf-8", newline="") as f:
        cols = ["player_id", "name", "position", "season", "team", "games",
                "targets", "carries", "receptions", "rec_yards", "rush_yards",
                "rec_air_yards", "target_share", "rush_share", "air_yards_share",
                "rz_targets", "rz_carries", "rz_tgt_share", "rz_rush_share"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for p in p_share.values():
            w.writerow({c: p.get(c, 0) for c in cols})
    print(f"  wrote player_team_share.csv: {len(p_share)} rows")

    write_turnover(turnover)

    # player_new_team.csv
    with open(OUT / "player_new_team.csv", "w", encoding="utf-8", newline="") as f:
        cols = ["player_id", "name", "position", "season", "team", "prev_team",
                "new_team", "is_rookie_or_first_season", "apy", "apy_bucket",
                "contract_year_signed", "contract_years", "contract_value",
                "contract_guaranteed", "signed_new_team_this_year",
                "prior_target_share", "prior_rush_share", "prior_air_yards_share",
                "prior_targets", "prior_carries",
                "current_target_share", "current_rush_share", "current_air_yards_share",
                "expected_target_share", "expected_rush_share"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for p in player_new_team.values():
            w.writerow({c: p.get(c, 0) for c in cols})
    print(f"  wrote player_new_team.csv: {len(player_new_team)} rows")

    return 0


if __name__ == "__main__":
    sys.exit(main())
