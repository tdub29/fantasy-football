"""Build RB ball-security (fumble fault & fluke-vs-trend) and defender fumble-disruption
attribution tables from local nflverse play-by-play, snaps, rosters, and stats.

Why this exists:
  1. Official GSIS play descriptions never label technique ("peanut punch" vs wrap strip),
     and NFL scorers mark ~94% of RB scrimmage fumbles as forced. Treating `unforced` as
     RB fault misses nearly every multi-year ball-security outlier (r = -0.062 YOY),
     while 2-to-3-season pooled total/forced fumble rate predicts Year 3 (r = +0.292).
  2. Multi-fumble plays (`both == 1`, e.g. 2026 W8 Mayfield/Irving) share play-level flags;
     we parse each FUMBLES clause in `desc` and verify against stats_player_week so
     teammate fumbles never leak onto an RB.
  3. On defense, splitting `def_fumbles_forced` into `Strip-Sack FF` (`sack == 1`,
     YOY r = +0.401) and `Ball-Carrier FF` (`sack == 0`, YOY r = +0.180, plus rate per
     1,000 defensive snaps) isolates punch/strip specialists cleanly.

Output: site/data/fumbles.js as `window.FUMBLES = {...};`

Run:
    python projections/build_fumbles.py [--cache DIR] [--players FILE] [--offline] [--self-check]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
DEFAULT_CACHE = pathlib.Path(os.environ.get("NFLVERSE_CACHE") or (HERE / "nflverse-cache"))
DEFAULT_PLAYERS = ROOT / "players-nfl.json"
OUT_JS = ROOT / "site" / "data" / "fumbles.js"

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
SEASON = 2026
POOLED_SEASONS = (2024, 2025, 2026)
P0_RB_RATE = 0.00799
P_LOST = 0.565
PRIOR_M = 3000.0
MAX_AGE_H = 6.0
FINISHED_AGE_H = 24.0 * 365.0

RE_FUM_CLAUSE = re.compile(r"\bFUMBLES\b(?:\s*\(([^)]+)\))?")


def norm_name(s: str | None) -> str:
    if not s or (isinstance(s, float) and math.isnan(s)):
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_team(t: str | None) -> str:
    if not t or (isinstance(t, float) and math.isnan(t)):
        return ""
    u = str(t).strip().upper()
    return {"LA": "LAR", "JAC": "JAX", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU"}.get(u, u)


def ensure_file(cache_dir: pathlib.Path, tag: str, filename: str, past: bool, offline: bool) -> pathlib.Path:
    p = cache_dir / filename
    if offline:
        if not p.exists():
            raise SystemExit(f"Missing {filename} in {cache_dir} with --offline set")
        return p
    max_h = FINISHED_AGE_H if past else MAX_AGE_H
    if p.exists() and ((time.time() - p.stat().st_mtime) / 3600.0) < max_h:
        return p
    cache_dir.mkdir(parents=True, exist_ok=True)
    url = f"{BASE}/{tag}/{filename}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            tmp = p.with_suffix(p.suffix + ".tmp")
            tmp.write_bytes(r.read())
            tmp.replace(p)
    except Exception as exc:
        if not p.exists():
            raise SystemExit(f"Failed downloading {filename}: {exc}")
    return p


def build_crosswalk(cache_dir: pathlib.Path, players_path: pathlib.Path, offline: bool) -> dict:
    """Map gsis_id / pfr_id -> sleeper_id plus display info across 2024..2026."""
    players_nfl = json.loads(players_path.read_text(encoding="utf-8"))
    sid_info: dict[str, dict] = {}
    bdate_name_to_sid: dict[tuple[str, str], str] = {}
    name_team_to_sid: dict[tuple[str, str], str] = {}
    name_to_sids: dict[str, list[str]] = {}

    for pid_raw, info in players_nfl.items():
        sid = str(pid_raw)
        nm_full = info.get("full_name") or f"{info.get('first_name', '')} {info.get('last_name', '')}".strip()
        nm = norm_name(nm_full)
        tm = norm_team(info.get("team"))
        bd = str(info.get("birth_date") or "")[:10]
        pos = str(info.get("position") or "")
        sid_info[sid] = {
            "name": nm_full,
            "pos": pos,
            "team": tm,
            "gsis_id": str(info.get("gsis_id")).strip() if info.get("gsis_id") else None,
        }
        if nm:
            name_to_sids.setdefault(nm, []).append(sid)
            if tm:
                name_team_to_sid[(nm, tm)] = sid
            if bd and bd != "None":
                bdate_name_to_sid[(bd, nm)] = sid

    gsis_to_sid: dict[str, str] = {}
    pfr_to_sid: dict[str, str] = {}
    rb_gsis: set[str] = set()
    gsis_pos: dict[str, str] = {}
    gsis_name: dict[str, str] = {}

    # Seed from players-nfl.json gsis_id first
    for sid, rec in sid_info.items():
        if rec["gsis_id"]:
            gsis_to_sid[rec["gsis_id"]] = sid
            gsis_pos[rec["gsis_id"]] = rec["pos"]
            gsis_name[rec["gsis_id"]] = rec["name"]
            if rec["pos"] == "RB":
                rb_gsis.add(rec["gsis_id"])

    for yr in POOLED_SEASONS:
        r = pd.read_parquet(
            ensure_file(cache_dir, "rosters", f"roster_{yr}.parquet", yr < SEASON, offline),
            columns=["gsis_id", "pfr_id", "sleeper_id", "position", "full_name", "team", "birth_date"],
        )
        r = r[r["gsis_id"].notna()].drop_duplicates("gsis_id", keep="last")
        for row in r.itertuples(index=False):
            gid = str(row.gsis_id).strip()
            pos = str(row.position or "")
            gsis_pos[gid] = pos or gsis_pos.get(gid, "")
            if pd.notna(row.full_name):
                gsis_name[gid] = str(row.full_name)
            if pos == "RB":
                rb_gsis.add(gid)

            sid = None if pd.isna(row.sleeper_id) else str(row.sleeper_id)
            if sid and sid in sid_info:
                pass
            else:
                nm = norm_name(row.full_name)
                bd = str(row.birth_date)[:10] if pd.notna(row.birth_date) else ""
                tm = norm_team(row.team)
                if (bd, nm) in bdate_name_to_sid:
                    sid = bdate_name_to_sid[(bd, nm)]
                elif (nm, tm) in name_team_to_sid:
                    sid = name_team_to_sid[(nm, tm)]
                elif nm in name_to_sids and len(name_to_sids[nm]) == 1:
                    sid = name_to_sids[nm][0]
                else:
                    sid = gsis_to_sid.get(gid)

            if sid:
                gsis_to_sid[gid] = sid
                if pd.notna(row.pfr_id):
                    pfr_to_sid[str(row.pfr_id)] = sid

    return {
        "sid_info": sid_info,
        "gsis_to_sid": gsis_to_sid,
        "pfr_to_sid": pfr_to_sid,
        "rb_gsis": rb_gsis,
        "gsis_pos": gsis_pos,
        "gsis_name": gsis_name,
    }


def _short_match(pbp_token: str | None, name1: str | None, name2: str | None) -> int | None:
    """Match a GSIS desc player token like '28-J.Bates' against ff1/ff2 short names."""
    if not pbp_token:
        return None
    tok = pbp_token.strip().lower()
    # Extract surname from tokens such as "93-M.Jackson" or "M.Jackson"
    tok_clean = re.sub(r"^\d+-", "", tok).strip()
    sur = tok_clean.split(".")[-1].strip() if "." in tok_clean else tok_clean
    for idx, cand in ((1, name1), (2, name2)):
        if not cand or (isinstance(cand, float) and math.isnan(cand)):
            continue
        cl = str(cand).strip().lower()
        if cl == tok_clean or (sur and sur in cl):
            return idx
    return None


def resolve_slot_event(row, slot: int, st_lookup: dict[tuple[int, str], tuple[int, int, int]]) -> tuple[int, int, str | None, str | None]:
    """Return (is_forced, is_lost, forcer_gid, forcer_name) for slot 1 or 2 on a fumble row."""
    fum_gid = str(row.fumbled_1_player_id if slot == 1 else row.fumbled_2_player_id).strip()
    wk = int(row.week)
    f_forced_flag = int(row.fumble_forced or 0)
    f_unforced_flag = int(row.fumble_not_forced or 0)
    f_lost_flag = int(row.fumble_lost or 0)

    ff1_id = str(row.forced_fumble_player_1_player_id).strip() if pd.notna(row.forced_fumble_player_1_player_id) else None
    ff1_nm = str(row.forced_fumble_player_1_player_name) if pd.notna(row.forced_fumble_player_1_player_name) else None
    ff2_id = str(row.forced_fumble_player_2_player_id).strip() if pd.notna(row.forced_fumble_player_2_player_id) else None
    ff2_nm = str(row.forced_fumble_player_2_player_name) if pd.notna(row.forced_fumble_player_2_player_name) else None

    clauses = list(RE_FUM_CLAUSE.finditer(str(row.desc or "")))

    # Default single-fumbler fast path
    if pd.isna(row.fumbled_2_player_id) and not (f_forced_flag == 1 and f_unforced_flag == 1):
        is_forced = 1 if f_forced_flag == 1 else 0
        is_lost = 1 if f_lost_flag == 1 else 0
        return is_forced, is_lost, (ff1_id if is_forced else None), (ff1_nm if is_forced else None)

    # Multi-fumble / mixed-flag disambiguation:
    # 1) stats_player_week exact player-level forced/unforced/lost counts when non-ambiguous
    is_forced = None
    is_lost = None
    st_rec = st_lookup.get((wk, fum_gid))
    if st_rec is not None:
        st_ff, st_uf, st_lost = st_rec
        if st_ff > 0 and st_uf == 0:
            is_forced = 1
        elif st_uf > 0 and st_ff == 0:
            is_forced = 0
        if (st_ff + st_uf) == 1:
            is_lost = 1 if st_lost >= 1 else 0

    # 2) Positional FUMBLES clause in desc -> distinguishes forced paren vs unforced comma + matches forcer ID
    forcer_id = None
    forcer_nm = None
    if len(clauses) >= slot:
        tok = clauses[slot - 1].group(1)
        if tok and tok.strip().lower() != "aborted":
            if is_forced is None:
                is_forced = 1
            which = _short_match(tok, ff1_nm, ff2_nm)
            if which == 2 and ff2_id:
                forcer_id, forcer_nm = ff2_id, ff2_nm
            elif ff1_id:
                forcer_id, forcer_nm = ff1_id, ff1_nm
        else:
            if is_forced is None:
                is_forced = 0
    elif is_forced is None:
        is_forced = 1 if f_forced_flag == 1 else 0

    if is_forced and forcer_id is None:
        if slot == 2 and ff2_id and ff1_id != ff2_id:
            forcer_id, forcer_nm = ff2_id, ff2_nm
        else:
            forcer_id, forcer_nm = ff1_id, ff1_nm

    if is_lost is None:
        rec_team = row.fumble_recovery_1_team if slot == 1 else row.fumble_recovery_2_team
        if pd.notna(rec_team) and pd.notna(row.posteam):
            is_lost = 1 if str(rec_team) != str(row.posteam) else 0
        else:
            is_lost = 1 if (slot == 1 and pd.isna(row.fumbled_2_player_id) and f_lost_flag == 1) else 0

    return int(is_forced), int(is_lost), (forcer_id if is_forced else None), (forcer_nm if is_forced else None)


def classify_rb_tag(cur: dict, pool3: dict) -> tuple[str, str]:
    pt = pool3["t"]
    p_rt = pool3["rate100"] or 0.0
    ct = cur["t"]
    cf = cur["f"]
    c_rt = cur["rate100"] or 0.0
    if pt >= 250 and p_rt >= 1.25:
        return (
            "Multi-Yr Trend",
            f"3-yr fumble rate {p_rt:.2f}/100t across {pt} touches tracks above the 0.80% NFL RB norm (pooled forced rate persists r=+0.292).",
        )
    if pt >= 250 and p_rt < 1.25 and ct >= 40 and cf >= 2 and c_rt >= 1.60:
        return (
            "1-Yr Spike (Fluke?)",
            f"2026 rate ({c_rt:.2f}/100t) spikes above a normal 3-yr baseline ({p_rt:.2f}/100t across {pt}t); thin single-year fumble samples usually regress.",
        )
    if pt < 250 and cf >= 2:
        return (
            "Small Sample",
            f"Only {pt} 3-yr touches; single-season fumbles need 250+ touches to separate ball-security skill from noise (watch snap share, not panic-sell).",
        )
    if pt >= 250 and p_rt < 0.60 and cf <= 2:
        return (
            "Clean",
            f"Only {pool3['f']} fumbles across {pt} 3-yr touches ({p_rt:.2f}/100t vs 0.80% avg).",
        )
    if pt >= 25:
        return (
            "Normal",
            f"{pool3['f']} fumbles on {pt} 3-yr touches ({p_rt:.2f}/100t), within normal NFL RB variance around 0.80%.",
        )
    return ("Low Sample", f"Fewer than 25 tracked 3-yr touches ({pt}t).")


def detect_closed_max_week(root_dir: pathlib.Path, pbp_cur: pd.DataFrame, max_week_override: int | None = None) -> int:
    """Return latest completed regular-season week, excluding partial/in-progress weeks."""
    if max_week_override is not None:
        return int(max_week_override)
    site_closed = None
    wr = root_dir / "site" / "data" / "weekly-rankings.js"
    if wr.exists():
        m = re.search(r'"currentWeek"\s*:\s*(\d+)', wr.read_text(encoding="utf-8")[:600])
        if m:
            site_closed = max(0, int(m.group(1)) - 1)
    if site_closed is None:
        lg = root_dir / "site" / "data" / "leagues.js"
        if lg.exists():
            m = re.search(r'"week"\s*:\s*(\d+)', lg.read_text(encoding="utf-8")[:1200])
            if m:
                site_closed = max(0, int(m.group(1)) - 1)
    if len(pbp_cur):
        wk_games = pbp_cur.groupby("week")["game_id"].nunique()
        complete_wks = [int(w) for w, gcnt in wk_games.items() if gcnt >= 10]
        # No fully played week means none counts; never fall back to a partial week.
        pbp_closed = max(complete_wks) if complete_wks else 0
    else:
        pbp_closed = 0
    return min(site_closed, pbp_closed) if site_closed is not None else pbp_closed


def build_payload(cache_dir: pathlib.Path, players_path: pathlib.Path, offline: bool, self_check: bool, max_week: int | None = None) -> dict:
    cw = build_crosswalk(cache_dir, players_path, offline)
    gsis_to_sid = cw["gsis_to_sid"]
    pfr_to_sid = cw["pfr_to_sid"]
    rb_gsis = cw["rb_gsis"]
    sid_info = cw["sid_info"]

    pbp_cols = [
        "game_id", "week", "season_type", "play_type", "special_teams_play",
        "kickoff_attempt", "punt_attempt", "field_goal_attempt", "extra_point_attempt",
        "posteam", "defteam", "sack", "two_point_attempt", "aborted_play",
        "rush_attempt", "complete_pass", "rusher_player_id", "receiver_player_id",
        "fumble", "fumble_forced", "fumble_not_forced", "fumble_lost", "fumble_out_of_bounds",
        "fumbled_1_player_id", "fumbled_2_player_id",
        "forced_fumble_player_1_player_id", "forced_fumble_player_1_player_name",
        "forced_fumble_player_2_player_id", "forced_fumble_player_2_player_name",
        "fumble_recovery_1_team", "fumble_recovery_2_team", "desc",
    ]

    rb_seasons: dict[int, dict[str, dict]] = {y: {} for y in POOLED_SEASONS}
    def_seasons: dict[int, dict[str, dict]] = {y: {} for y in POOLED_SEASONS}
    rb_logs_2026: dict[str, list] = {}
    through_week = 0
    closed_max_week = None

    def ensure_rb(bucket: dict, sid: str) -> dict:
        if sid not in bucket:
            bucket[sid] = {"car": 0, "rec": 0, "t": 0, "f": 0, "ff": 0, "uf": 0, "fl": 0, "oob": 0, "f_rush": 0, "f_rec": 0}
        return bucket[sid]

    def ensure_def(bucket: dict, sid: str) -> dict:
        if sid not in bucket:
            bucket[sid] = {"snp": 0, "ff": 0, "ff_sk": 0, "ff_bc": 0, "ff_st": 0, "ff_rb": 0}
        return bucket[sid]

    reconcile_2026: dict[str, dict] = {}

    for yr in POOLED_SEASONS:
        pbp = pd.read_parquet(ensure_file(cache_dir, "pbp", f"play_by_play_{yr}.parquet", yr < SEASON, offline), columns=pbp_cols)
        pbp = pbp[(pbp["season_type"] == "REG") & (pbp["two_point_attempt"] != 1)].copy()
        if yr == SEASON and len(pbp):
            closed_max_week = detect_closed_max_week(ROOT, pbp, max_week)
            pbp = pbp[pbp["week"] <= closed_max_week].copy()
            through_week = int(pbp["week"].max()) if len(pbp) else 0
            # Closed-week guard, always on (not only under --self-check): a partial
            # in-progress week must never reach the displayed 2026 counts.
            last_wk_games = pbp.loc[pbp["week"] == through_week, "game_id"].nunique() if through_week else 0
            assert max_week is not None or through_week == 0 or last_wk_games >= 10, (
                f"Partial week leaked: W{through_week} has only {last_wk_games} games in play_by_play")

        # Stats player week lookup for exact per-player multi-fumble reconciliation
        spw = pd.read_parquet(
            ensure_file(cache_dir, "stats_player", f"stats_player_week_{yr}.parquet", yr < SEASON, offline),
            columns=[
                "season_type", "week", "player_id", "position",
                "fumbles_forced_by_opp", "fumbles_not_forced",
                "rushing_fumbles", "receiving_fumbles",
                "rushing_fumbles_lost", "receiving_fumbles_lost", "sack_fumbles_lost",
            ],
        )
        spw = spw[spw["season_type"] == "REG"].copy()
        if yr == SEASON and closed_max_week is not None:
            spw = spw[spw["week"] <= closed_max_week].copy()
        st_lookup: dict[tuple[int, str], tuple[int, int, int]] = {}
        for r in spw.itertuples(index=False):
            gid = str(r.player_id).strip()
            wk = int(r.week)
            ff_s = int(pd.to_numeric(r.fumbles_forced_by_opp, errors="coerce") or 0)
            uf_s = int(pd.to_numeric(r.fumbles_not_forced, errors="coerce") or 0)
            fl_s = int(
                (pd.to_numeric(r.rushing_fumbles_lost, errors="coerce") or 0)
                + (pd.to_numeric(r.receiving_fumbles_lost, errors="coerce") or 0)
                + (pd.to_numeric(r.sack_fumbles_lost, errors="coerce") or 0)
            )
            st_lookup[(wk, gid)] = (ff_s, uf_s, fl_s)

        if yr == SEASON:
            rb_spw = spw[spw["player_id"].astype(str).str.strip().isin(rb_gsis)]
            reconcile_2026["spw_scrim_sum"] = int(
                (pd.to_numeric(rb_spw["rushing_fumbles"], errors="coerce").fillna(0)
                 + pd.to_numeric(rb_spw["receiving_fumbles"], errors="coerce").fillna(0)).sum()
            )
            reconcile_2026["spw_total_ff"] = int(pd.to_numeric(rb_spw["fumbles_forced_by_opp"], errors="coerce").fillna(0).sum())

        # Defensive snaps (from snap_counts)
        sn = pd.read_parquet(
            ensure_file(cache_dir, "snap_counts", f"snap_counts_{yr}.parquet", yr < SEASON, offline),
            columns=["game_type", "week", "pfr_player_id", "defense_snaps"],
        )
        sn = sn[sn["game_type"] == "REG"].copy()
        if yr == SEASON and closed_max_week is not None:
            sn = sn[sn["week"] <= closed_max_week].copy()
        sn["defense_snaps"] = pd.to_numeric(sn["defense_snaps"], errors="coerce").fillna(0.0)
        sn = sn[sn["defense_snaps"] > 0]
        for pfr_id, tot_sn in sn.groupby("pfr_player_id")["defense_snaps"].sum().items():
            sid = pfr_to_sid.get(str(pfr_id).strip())
            if sid:
                ensure_def(def_seasons[yr], sid)["snp"] += int(round(float(tot_sn)))

        # Scrimmage flag per play (exclude kickoffs/punts/FG/XP & explicit special teams plays)
        is_st = (
            pbp["play_type"].isin(["kickoff", "punt", "field_goal", "extra_point"])
            | (pbp["special_teams_play"] == 1)
            | (pbp["kickoff_attempt"] == 1)
            | (pbp["punt_attempt"] == 1)
            | (pbp["field_goal_attempt"] == 1)
            | (pbp["extra_point_attempt"] == 1)
        )
        scrim = pbp[~is_st].copy()

        # RB carries & receptions
        car_df = scrim[(scrim["rush_attempt"] == 1) & scrim["rusher_player_id"].astype(str).str.strip().isin(rb_gsis)]
        for gid, cnt in car_df.groupby("rusher_player_id").size().items():
            sid = gsis_to_sid.get(str(gid).strip())
            if sid:
                rec = ensure_rb(rb_seasons[yr], sid)
                rec["car"] += int(cnt)
                rec["t"] += int(cnt)

        rec_df = scrim[(scrim["complete_pass"] == 1) & scrim["receiver_player_id"].astype(str).str.strip().isin(rb_gsis)]
        for gid, cnt in rec_df.groupby("receiver_player_id").size().items():
            sid = gsis_to_sid.get(str(gid).strip())
            if sid:
                rec = ensure_rb(rb_seasons[yr], sid)
                rec["rec"] += int(cnt)
                rec["t"] += int(cnt)

        # RB Scrimmage Fumbles (using fumbled_1 and fumbled_2 slots on non-ST plays)
        fum_scrim = scrim[scrim["fumble"] == 1]
        for row in fum_scrim.itertuples(index=False):
            for slot in (1, 2):
                fgid_raw = row.fumbled_1_player_id if slot == 1 else row.fumbled_2_player_id
                if pd.isna(fgid_raw):
                    continue
                fgid = str(fgid_raw).strip()
                if fgid not in rb_gsis:
                    continue
                sid = gsis_to_sid.get(fgid)
                if not sid:
                    continue
                is_forced, is_lost, forcer_gid, forcer_nm = resolve_slot_event(row, slot, st_lookup)
                rrec = ensure_rb(rb_seasons[yr], sid)
                rrec["f"] += 1
                if is_forced:
                    rrec["ff"] += 1
                else:
                    rrec["uf"] += 1
                if is_lost:
                    rrec["fl"] += 1
                if int(row.fumble_out_of_bounds or 0) == 1:
                    rrec["oob"] += 1
                if row.complete_pass == 1 or (pd.notna(row.receiver_player_id) and str(row.receiver_player_id).strip() == fgid):
                    rrec["f_rec"] += 1
                    ctx = "rec"
                elif int(row.aborted_play or 0) == 1 or row.rush_attempt != 1:
                    ctx = "aborted"
                else:
                    rrec["f_rush"] += 1
                    ctx = "rush"

                if yr == SEASON:
                    forcer_sid = gsis_to_sid.get(forcer_gid) if forcer_gid else None
                    rb_logs_2026.setdefault(sid, []).append({
                        "wk": int(row.week),
                        "opp": norm_team(str(row.defteam or "")),
                        "ctx": ctx,
                        "ff": int(is_forced),
                        "fl": int(is_lost),
                        "fn": forcer_nm or ("Unforced" if not is_forced else "Unknown"),
                        "fsid": forcer_sid,
                    })

        # Defender Forced Fumbles across ALL plays (Strip-Sack vs Ball-Carrier vs ST + vs-RB drill-down)
        fum_all = pbp[(pbp["fumble"] == 1) & (pbp["fumble_forced"] == 1)].copy()
        for row in fum_all.itertuples(index=False):
            play_st = (
                str(row.play_type or "") in ("kickoff", "punt", "field_goal", "extra_point")
                or int(row.special_teams_play or 0) == 1
                or int(row.kickoff_attempt or 0) == 1
                or int(row.punt_attempt or 0) == 1
                or int(row.field_goal_attempt or 0) == 1
                or int(row.extra_point_attempt or 0) == 1
            )
            play_sack = (not play_st) and (int(row.sack or 0) == 1)
            f1_rb = pd.notna(row.fumbled_1_player_id) and str(row.fumbled_1_player_id).strip() in rb_gsis
            f2_rb = pd.notna(row.fumbled_2_player_id) and str(row.fumbled_2_player_id).strip() in rb_gsis
            any_rb = f1_rb or f2_rb

            seen_forcers: set[str] = set()
            for fcol in (row.forced_fumble_player_1_player_id, row.forced_fumble_player_2_player_id):
                if pd.isna(fcol):
                    continue
                fgid = str(fcol).strip()
                if fgid in seen_forcers:
                    continue
                seen_forcers.add(fgid)
                dsid = gsis_to_sid.get(fgid)
                if not dsid:
                    continue
                drec = ensure_def(def_seasons[yr], dsid)
                drec["ff"] += 1
                if play_st:
                    drec["ff_st"] += 1
                elif play_sack:
                    drec["ff_sk"] += 1
                else:
                    drec["ff_bc"] += 1
                    if any_rb:
                        drec["ff_rb"] += 1

    # Aggregate 3-year defender metrics first so RB event logs can attach the forcer's 3yr BC FF/1k
    all_def_sids = set()
    for yr in POOLED_SEASONS:
        all_def_sids |= set(def_seasons[yr].keys())

    def_out: dict[str, dict] = {}
    for sid in sorted(all_def_sids):
        c = def_seasons[SEASON].get(sid) or {"snp": 0, "ff": 0, "ff_sk": 0, "ff_bc": 0, "ff_st": 0, "ff_rb": 0}
        p3 = {"snp": 0, "ff": 0, "ff_sk": 0, "ff_bc": 0, "ff_st": 0, "ff_rb": 0}
        for yr in POOLED_SEASONS:
            d = def_seasons[yr].get(sid)
            if d:
                for k in p3:
                    p3[k] += d[k]
        if p3["snp"] == 0 and p3["ff"] == 0:
            continue
        cur_bc1k = round(c["ff_bc"] / c["snp"] * 1000.0, 2) if c["snp"] >= 100 else None
        p3_bc1k = round(p3["ff_bc"] / p3["snp"] * 1000.0, 2) if p3["snp"] >= 300 else None
        def_out[sid] = {
            "cur": {**c, "bc_1k": cur_bc1k},
            "pool3": {**p3, "bc_1k": p3_bc1k},
        }

    # Attach forcer's 3-yr BC FF/1k rate to 2026 RB logs & build RB output
    all_rb_sids = set()
    for yr in POOLED_SEASONS:
        all_rb_sids |= set(rb_seasons[yr].keys())

    rb_out: dict[str, dict] = {}
    for sid in sorted(all_rb_sids):
        c = rb_seasons[SEASON].get(sid) or {"car": 0, "rec": 0, "t": 0, "f": 0, "ff": 0, "uf": 0, "fl": 0, "oob": 0, "f_rush": 0, "f_rec": 0}
        p3 = {"t": 0, "f": 0, "ff": 0, "uf": 0, "fl": 0}
        for yr in POOLED_SEASONS:
            r = rb_seasons[yr].get(sid)
            if r:
                for k in p3:
                    p3[k] += r[k]
        if p3["t"] == 0 and p3["f"] == 0:
            continue

        cur_rate = round(c["f"] / c["t"] * 100.0, 2) if c["t"] > 0 else None
        cur_exp_lost = round(c["f"] * P_LOST, 2)
        cur_lost_luck = round(c["fl"] - cur_exp_lost, 2)
        p3_rate = round(p3["f"] / p3["t"] * 100.0, 2) if p3["t"] > 0 else None
        eb_rate = round((p3["f"] + PRIOR_M * P0_RB_RATE) / (p3["t"] + PRIOR_M) * 100.0, 2)

        cur_pkg = {
            **c,
            "rate100": cur_rate,
            "exp_lost": cur_exp_lost,
            "lost_luck": cur_lost_luck,
        }
        p3_pkg = {
            **p3,
            "rate100": p3_rate,
            "eb100": eb_rate,
        }
        tag, note = classify_rb_tag(cur_pkg, p3_pkg)

        log_rows = []
        for ev in sorted(rb_logs_2026.get(sid, []), key=lambda x: x["wk"]):
            fsid = ev["fsid"]
            fbc = (def_out.get(fsid) or {}).get("pool3", {}).get("bc_1k") if fsid else None
            log_rows.append([ev["wk"], ev["opp"], ev["ctx"], ev["ff"], ev["fl"], ev["fn"], fsid, fbc])

        rb_out[sid] = {
            "cur": cur_pkg,
            "pool3": p3_pkg,
            "tag": tag,
            "note": note,
            "log": log_rows,
        }

    if self_check:
        run_self_checks(rb_out, def_out, sid_info, reconcile_2026, gsis_to_sid, through_week, closed_max_week)

    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": SEASON,
        "throughWeek": through_week,
        "pooledSeasons": list(POOLED_SEASONS),
        "meta": {
            "p0_rb_rate": round(P0_RB_RATE * 100.0, 3),
            "p_lost": P_LOST,
            "prior_M": int(PRIOR_M),
            "source": "nflverse play_by_play + stats_player_week + snap_counts (2024-2026 REG, excl. 2-pt)",
        },
        "rb": rb_out,
        "def": def_out,
    }


def run_self_checks(
    rb_out: dict,
    def_out: dict,
    sid_info: dict,
    reconcile_2026: dict,
    gsis_to_sid: dict,
    through_week: int,
    closed_max_week: int | None,
) -> None:
    print("\n--- build_fumbles self-check ---")
    assert closed_max_week is not None and through_week == closed_max_week, (
        f"Closed-week maturity mismatch: through_week={through_week} vs closed_max_week={closed_max_week}"
    )
    assert all(k == k.strip() and v == v.strip() for k, v in gsis_to_sid.items()), "Unstripped IDs in crosswalk"
    for sid, r in rb_out.items():
        for span in ("cur", "pool3"):
            d = r[span]
            assert d["f"] == d["ff"] + d["uf"], f"RB {sid} {span}: f={d['f']} != ff+uf ({d['ff']}+{d['uf']})"
            for k, v in d.items():
                if isinstance(v, float):
                    assert not (math.isnan(v) or math.isinf(v)), f"RB {sid} {span} {k} is NaN/Inf"

    for sid, d in def_out.items():
        for span in ("cur", "pool3"):
            x = d[span]
            assert x["ff"] == x["ff_sk"] + x["ff_bc"] + x["ff_st"], f"DEF {sid} {span}: ff={x['ff']} mismatch"
            for k, v in x.items():
                if isinstance(v, float):
                    assert not (math.isnan(v) or math.isinf(v)), f"DEF {sid} {span} {k} is NaN/Inf"

    # Bucky Irving W8 verification (Baker Mayfield unforced drop must NOT bleed onto Irving)
    bucky_sids = [sid for sid, info in sid_info.items() if norm_name(info["name"]) == "bucky irving"]
    assert bucky_sids, "Could not find Bucky Irving in players-nfl.json"
    bucky = rb_out.get(bucky_sids[0])
    assert bucky is not None, "Bucky Irving missing from rb_out"
    assert bucky["cur"]["uf"] == 0, f"Bucky Irving leaked unforced fumble from Mayfield W8: {bucky['cur']}"
    assert bucky["cur"]["ff"] >= 4, f"Expected Bucky Irving >= 4 forced fumbles: {bucky['cur']}"
    print(f"  OK  Bucky Irving 2026 cur={bucky['cur']['f']}f ({bucky['cur']['ff']}ff / {bucky['cur']['uf']}uf, log={len(bucky['log'])})")

    # 2026 PBP scrimmage sum vs stats_player_week rushing+receiving fumbles
    pbp_scrim_sum = sum(r["cur"]["f"] for r in rb_out.values())
    spw_scrim_sum = reconcile_2026.get("spw_scrim_sum", 0)
    assert abs(pbp_scrim_sum - spw_scrim_sum) <= 3, (
        f"2026 RB scrimmage fumble sum mismatch: PBP={pbp_scrim_sum} vs spw={spw_scrim_sum}"
    )
    print(f"  OK  2026 RB scrimmage sum: PBP={pbp_scrim_sum}, stats_player_week rush+rec={spw_scrim_sum}")
    print(f"  OK  invariant checks passed across {len(rb_out)} RBs and {len(def_out)} defenders")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=pathlib.Path, default=DEFAULT_CACHE, help="nflverse-cache folder")
    ap.add_argument("--players", type=pathlib.Path, default=DEFAULT_PLAYERS, help="players-nfl.json path")
    ap.add_argument("--max-week", type=int, default=None, help="Override latest completed 2026 week")
    ap.add_argument("--offline", action="store_true", help="never download; fail if cache file missing")
    ap.add_argument("--self-check", action="store_true", help="run consistency asserts before writing")
    args = ap.parse_args()

    payload = build_payload(args.cache, args.players, args.offline, args.self_check, max_week=args.max_week)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    js = f"window.FUMBLES={body};\n"
    OUT_JS.write_text(js, encoding="utf-8")
    size_kb = len(js.encode("utf-8")) / 1024.0
    print(
        f"Wrote {OUT_JS.relative_to(ROOT)} ({size_kb:.1f} KB, "
        f"{len(payload['rb'])} RBs, {len(payload['def'])} defenders, throughWeek={payload['throughWeek']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
