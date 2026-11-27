"""Build yuH IDP component expected stats (yuh-idp-xstats-v1) -> site/data/idp-xstats.js.

Computes strictly lagged empirical-Bayes component projections (xSnaps, xSolo,
xAst, xTkl, xTFL, xSack, xSackYd, xQBH, xPBU, xINT, xFF, xFR, xTD) and
scores them dynamically using yuH league IDP settings, plus non-survivor
2015-2025 empirical age-retention Dynasty scores for 2 IDP_FLEX starters.

Usage:
    python projections/build_idp_xstats.py
    python projections/build_idp_xstats.py --offline --self-check
"""
from __future__ import annotations

import argparse
import csv
import datetime
import json
import pathlib
import re
import sys
import unicodedata
import urllib.request
from typing import Any

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SITE = ROOT / "site" / "data"
OUT_JS = SITE / "idp-xstats.js"


# Hyperparameters locked strictly <= 2025 in yuh-idp-xstats-v1 evaluation
BEST_PARAMS: dict[str, float] = {
    "half_life": 16.0,
    "k_snap": 2.0,
    "k_tkl_opp": 120.0,
    "k_tkl_conv": 16.0,
    "k_solo_sh": 16.0,
    "k_prs": 160.0,
    "k_sk_conv": 25.0,
    "k_qbh_conv": 20.0,
    "k_tfl": 260.0,
    "k_tgt": 180.0,
    "k_pbu_conv": 22.0,
    "k_int_conv": 55.0,
    "k_pbu_snap": 360.0,
    "k_int_snap": 900.0,
    "k_rare": 1500.0,
}

DEFAULT_YUH_SCORING: dict[str, float] = {
    "idp_tkl_solo": 1.0,
    "idp_tkl_ast": 0.5,
    "idp_tkl": 0.0,
    "idp_tkl_loss": 1.0,
    "idp_qb_hit": 1.0,
    "idp_sack": 3.0,
    "idp_sack_yd": 0.1,
    "idp_pass_def": 3.0,
    "idp_int": 5.0,
    "idp_int_ret_yd": 0.1,
    "idp_ff": 3.0,
    "idp_fum_rec": 3.0,
    "idp_fum_ret_yd": 0.1,
    "idp_def_td": 6.0,
    "idp_safe": 3.0,
    "idp_blk_kick": 3.0,
}

IDP_POS = {"DL", "DE", "DT", "NT", "EDGE", "LB", "ILB", "OLB", "MLB", "DB", "CB", "S", "FS", "SS"}
POS_GROUP_MAP = {
    "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL", "EDGE": "DL",
    "OLB": "LB", "ILB": "LB", "MLB": "LB", "LB": "LB",
    "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "DB": "DB",
}
SUB_ROLES = ("EDGE", "IDL", "OBLB", "S", "CB")
OFFSEASON_GAP_WEEKS = 4.0

# Exact 2015-2025 non-survivor empirical NPV age-retention multipliers (yuH scoring)
EMPIRICAL_AGE_MULT_2015_2025: dict[str, dict[int, float]] = {
    "DL": {21: 0.8508, 22: 0.8552, 23: 0.8733, 24: 0.7983, 25: 0.7622, 26: 0.7917, 27: 0.792, 28: 0.7388, 29: 0.7088, 30: 0.6712, 31: 0.6772, 32: 0.5765, 33: 0.5259, 34: 0.6266},
    "LB": {21: 0.881, 22: 0.9061, 23: 0.832, 24: 0.8151, 25: 0.7896, 26: 0.7732, 27: 0.723, 28: 0.6921, 29: 0.6429, 30: 0.6233, 31: 0.5921, 32: 0.5941, 33: 0.5656, 34: 0.7079},
    "DB": {21: 0.9402, 22: 0.8285, 23: 0.7966, 24: 0.771, 25: 0.7491, 26: 0.7316, 27: 0.7167, 28: 0.6841, 29: 0.6377, 30: 0.5865, 31: 0.6148, 32: 0.6194, 33: 0.5787, 34: 0.5251},
}


def norm_name(s: Any) -> str:
    if not s or (isinstance(s, float) and np.isnan(s)):
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_team(t: Any) -> str:
    if not t or (isinstance(t, float) and np.isnan(t)):
        return ""
    up = str(t).strip().upper()
    return {"JAC": "JAX", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "LA": "LAR", "SL": "LAR", "OAK": "LV", "STL": "LAR", "SD": "LAC"}.get(up, up)


def assign_sub_role(pos: Any, depth_pos: Any, fantasy_positions: list[str] | None = None) -> str:
    p = str(pos or "").strip().upper()
    dp = str(depth_pos or "").strip().upper()
    fpos = {str(x).strip().upper() for x in (fantasy_positions or []) if x}
    if dp in ("DT", "NT") or p in ("DT", "NT"):
        return "IDL"
    if dp in ("DE", "EDGE") or p in ("DE", "EDGE"):
        return "EDGE"
    if "DL" in fpos and "LB" in fpos:
        return "EDGE"
    if dp in ("ILB", "MLB"):
        return "OBLB"
    if dp == "OLB":
        return "OBLB" if fpos == {"LB"} else "EDGE"
    if dp == "CB" or p == "CB":
        return "CB"
    if dp in ("FS", "SS", "S") or p in ("FS", "SS", "S"):
        return "S"
    if p == "DL":
        return "IDL" if dp == "DL" else "EDGE"
    if p == "LB":
        return "OBLB"
    if p == "DB":
        return "S"
    return "OBLB"


def time_index(season: int, week: int) -> float:
    return float(season) * (18.0 + OFFSEASON_GAP_WEEKS) + float(week)


def load_yuh_scoring_and_week(root_dir: pathlib.Path) -> tuple[dict[str, float], int, int]:
    """Read exact yuH IDP scoring weights and current NFL season/week."""
    sc = dict(DEFAULT_YUH_SCORING)
    season, target_week = 2026, 12
    lj = root_dir / "Leagues" / "yuH" / "league.json"
    if lj.exists():
        doc = json.loads(lj.read_text(encoding="utf-8"))
        raw_sc = doc.get("scoring_settings") or {}
        for k in DEFAULT_YUH_SCORING:
            if k in raw_sc and raw_sc[k] is not None:
                sc[k] = float(raw_sc[k])
        season = int(doc.get("season") or season)
        st_set = doc.get("settings") or {}
        if st_set.get("leg"):
            target_week = int(st_set["leg"])
        elif st_set.get("last_scored_leg"):
            target_week = int(st_set["last_scored_leg"]) + 1
    else:
        ljs = root_dir / "site" / "data" / "leagues.js"
        if ljs.exists():
            txt = ljs.read_text(encoding="utf-8")
            arr = json.loads(txt[txt.index("["):txt.rindex("]") + 1])
            lg = next((l for l in arr if l.get("is_idp")), None)
            if lg:
                raw_sc = lg.get("scoring") or {}
                for k in DEFAULT_YUH_SCORING:
                    if k in raw_sc and raw_sc[k] is not None:
                        sc[k] = float(raw_sc[k])
                season = int(lg.get("season") or season)
                target_week = int(lg.get("week") or target_week)
    wr = root_dir / "site" / "data" / "weekly-rankings.js"
    if wr.exists():
        m = re.search(r'"currentWeek"\s*:\s*(\d+)', wr.read_text(encoding="utf-8")[:500])
        if m:
            target_week = max(target_week, int(m.group(1)))
    return sc, season, target_week


def score_components(
    solo: Any, ast: Any, tfl: Any, qbh: Any, sack: Any, sack_yd_abs: Any,
    pbu: Any, intc: Any, int_yd: Any, ff: Any, fr: Any, fr_yd: Any,
    td: Any, safe: Any, blk: Any, w: dict[str, float],
) -> Any:
    return (
        w["idp_tkl_solo"] * solo
        + w["idp_tkl_ast"] * ast
        + w["idp_tkl_loss"] * tfl
        + w["idp_qb_hit"] * qbh
        + w["idp_sack"] * sack
        + w["idp_sack_yd"] * sack_yd_abs
        + w["idp_pass_def"] * pbu
        + w["idp_int"] * intc
        + w["idp_int_ret_yd"] * int_yd
        + w["idp_ff"] * ff
        + w["idp_fum_rec"] * fr
        + w["idp_fum_ret_yd"] * fr_yd
        + w["idp_def_td"] * td
        + w["idp_safe"] * safe
        + w["idp_blk_kick"] * blk
    )


def build_sleeper_crosswalk(players_path: pathlib.Path, cache_dir: pathlib.Path, season: int) -> dict[str, Any]:
    players_nfl = json.loads(players_path.read_text(encoding="utf-8"))
    r_cur = pd.read_parquet(cache_dir / f"roster_{season}.parquet")
    r_cur = r_cur[r_cur["position"].isin(["DL", "LB", "DB"]) | r_cur["depth_chart_position"].isin(IDP_POS)].copy()
    r_cur["norm_name"] = r_cur["full_name"].map(norm_name)
    r_cur["norm_team"] = r_cur["team"].map(norm_team)
    r_cur["bdate"] = r_cur["birth_date"].astype(str).str[:10]

    sid_to_info: dict[str, dict[str, Any]] = {}
    name_team_to_sid: dict[tuple[str, str], str] = {}
    name_to_sids: dict[str, list[str]] = {}
    bdate_name_to_sid: dict[tuple[str, str], str] = {}

    for pid_raw, info in players_nfl.items():
        pid = str(pid_raw)
        pos = info.get("position")
        fpos = info.get("fantasy_positions") or []
        if pos not in IDP_POS and not (set(fpos) & IDP_POS):
            continue
        nm = norm_name(info.get("full_name") or f"{info.get('first_name', '')} {info.get('last_name', '')}")
        tm = norm_team(info.get("team"))
        bd = str(info.get("birth_date") or "")[:10]
        gsis_raw = str(info.get("gsis_id") or "").strip()
        rec = {
            "sleeper_id": pid,
            "name": info.get("full_name") or f"{info.get('first_name', '')} {info.get('last_name', '')}".strip(),
            "norm_name": nm,
            "team": tm,
            "pos": POS_GROUP_MAP.get(pos or "", POS_GROUP_MAP.get(fpos[0], "LB") if fpos else "LB"),
            "raw_pos": pos or "",
            "fantasy_positions": list(fpos),
            "age": info.get("age"),
            "birth_date": bd,
            "inj": info.get("injury_status") or "",
            "gsis_id": gsis_raw or None,
            "pfr_id": None,
            "depth_pos": None,
            "sub_role": None,
        }
        sid_to_info[pid] = rec
        if nm:
            name_to_sids.setdefault(nm, []).append(pid)
            if tm:
                name_team_to_sid[(nm, tm)] = pid
            if bd and bd != "None":
                bdate_name_to_sid[(bd, nm)] = pid

    gsis_to_sid: dict[str, str] = {}
    pfr_to_sid: dict[str, str] = {}
    for row in r_cur.itertuples(index=False):
        sid = None if pd.isna(row.sleeper_id) else str(row.sleeper_id)
        if sid and sid in sid_to_info:
            pass
        elif (row.bdate, row.norm_name) in bdate_name_to_sid:
            sid = bdate_name_to_sid[(row.bdate, row.norm_name)]
        elif (row.norm_name, row.norm_team) in name_team_to_sid:
            sid = name_team_to_sid[(row.norm_name, row.norm_team)]
        elif row.norm_name in name_to_sids and len(name_to_sids[row.norm_name]) == 1:
            sid = name_to_sids[row.norm_name][0]
        else:
            sid = None
        if sid and sid in sid_to_info:
            rec = sid_to_info[sid]
            if not pd.isna(row.gsis_id):
                rg = str(row.gsis_id).strip()
                if rg:
                    rec["gsis_id"] = rg
                    gsis_to_sid[rg] = sid
            if not pd.isna(row.pfr_id):
                rp_id = str(row.pfr_id).strip()
                if rp_id:
                    rec["pfr_id"] = rp_id
                    pfr_to_sid[rp_id] = sid
            if not pd.isna(row.depth_chart_position):
                rec["depth_pos"] = str(row.depth_chart_position).strip()

    for rec in sid_to_info.values():
        rec["sub_role"] = assign_sub_role(rec["raw_pos"], rec["depth_pos"], rec["fantasy_positions"])

    return {
        "sid_to_info": sid_to_info,
        "gsis_to_sid": gsis_to_sid,
        "pfr_to_sid": pfr_to_sid,
        "name_team_to_sid": name_team_to_sid,
        "name_to_sids": name_to_sids,
    }


def resolve_name_team(name: Any, team: Any, cw: dict[str, Any]) -> str | None:
    nm = norm_name(name)
    tm = norm_team(team)
    if (nm, tm) in cw["name_team_to_sid"]:
        return cw["name_team_to_sid"][(nm, tm)]
    cands = cw["name_to_sids"].get(nm, [])
    return cands[0] if len(cands) == 1 else (cands[0] if cands else None)


def find_advstats_file(yr: int, cache_dir: pathlib.Path, raw_dir: pathlib.Path | None, offline: bool = False) -> pathlib.Path | None:
    for d in (cache_dir, raw_dir):
        if d is None:
            continue
        p = pathlib.Path(d) / f"advstats_week_def_{yr}.parquet"
        if p.exists():
            return p
    if not offline:
        p = cache_dir / f"advstats_week_def_{yr}.parquet"
        cache_dir.mkdir(parents=True, exist_ok=True)
        url = f"https://github.com/nflverse/nflverse-data/releases/download/pfr_advstats/advstats_week_def_{yr}.parquet"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                tmp = p.with_suffix(p.suffix + ".tmp")
                tmp.write_bytes(r.read())
                tmp.replace(p)
            return p
        except Exception:
            return None
    return None


def load_cur_games(cache_dir: pathlib.Path, cur_season: int, offline: bool = False) -> pd.DataFrame:
    gpq = cache_dir / f"games_{cur_season}.parquet"
    if gpq.exists():
        return pd.read_parquet(gpq)
    gcsv = cache_dir / "games.csv"
    if not gcsv.exists() and not offline:
        cache_dir.mkdir(parents=True, exist_ok=True)
        url = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as r:
            tmp = gcsv.with_suffix(".csv.tmp")
            tmp.write_bytes(r.read())
            tmp.replace(gcsv)
    df = pd.read_csv(gcsv)
    return df[df["season"] == cur_season].copy()


def load_season_weekly(yr: int, cur_season: int, closed_max_week: int, cache_dir: pathlib.Path, hist_dir: pathlib.Path | None, raw_dir: pathlib.Path | None, weights: dict[str, float], offline: bool = False) -> pd.DataFrame:
    roster = pd.read_parquet(cache_dir / f"roster_{yr}.parquet")
    roster = roster[roster["position"].isin(["DL", "LB", "DB"])].copy()
    roster = roster.sort_values("week" if "week" in roster.columns else "gsis_id").drop_duplicates("gsis_id", keep="first")
    roster["sub_role"] = [assign_sub_role(p, dp, None) for p, dp in zip(roster["position"], roster["depth_chart_position"])]
    roster["pos_group"] = roster["position"].map(lambda x: POS_GROUP_MAP.get(str(x), "LB"))
    r_map = roster[["gsis_id", "pfr_id", "full_name", "position", "depth_chart_position", "sub_role", "pos_group", "team"]].rename(
        columns={"gsis_id": "player_id", "team": "roster_team"}
    )
    r_map["player_id"] = r_map["player_id"].astype(str).str.strip()

    if yr == 2023 and hist_dir is not None and (hist_dir / "week_2023.csv").exists():
        st = pd.read_csv(hist_dir / "week_2023.csv")
        st = st[st["season_type"] == "REG"].copy()
        st = st.rename(columns={
            "def_fumble_recovery_opp": "fumble_recovery_opp",
            "def_fumble_recovery_yards_opp": "fumble_recovery_yards_opp",
            "def_safety": "def_safeties",
        })
        for blk in ("def_punt_blocks", "def_pat_blocks", "def_fg_blocks"):
            if blk not in st.columns:
                st[blk] = 0.0
    else:
        st = pd.read_parquet(cache_dir / f"stats_player_week_{yr}.parquet")
        st = st[st["season_type"] == "REG"].copy()

    if yr == cur_season:
        st = st[st["week"] <= closed_max_week].copy()

    def gcol(df: pd.DataFrame, col: str) -> pd.Series:
        return pd.to_numeric(df[col], errors="coerce").fillna(0.0) if col in df.columns else pd.Series(0.0, index=df.index)

    snaps = pd.read_parquet(cache_dir / f"snap_counts_{yr}.parquet")
    snaps = snaps[snaps["game_type"] == "REG"].copy()
    if yr == cur_season:
        snaps = snaps[snaps["week"] <= closed_max_week].copy()
    snaps["defense_snaps"] = pd.to_numeric(snaps["defense_snaps"], errors="coerce")
    snaps["defense_pct"] = pd.to_numeric(snaps["defense_pct"], errors="coerce")
    snaps_def = snaps[snaps["defense_snaps"] > 0][["week", "pfr_player_id", "team", "opponent", "defense_snaps", "defense_pct"]].rename(
        columns={"pfr_player_id": "pfr_id"}
    ).drop_duplicates(["week", "pfr_id"])

    adv_cols = [
        "def_targets", "def_completions_allowed", "def_yards_allowed", "def_receiving_td_allowed",
        "def_times_blitzed", "def_times_hurried", "def_times_hitqb", "def_pressures",
        "def_tackles_combined", "def_missed_tackles",
    ]
    adv_path = find_advstats_file(yr, cache_dir, raw_dir, offline=offline)
    if adv_path is not None:
        adv = pd.read_parquet(adv_path)
        adv = adv[adv["game_type"] == "REG"].copy()
        if yr == cur_season:
            adv = adv[adv["week"] <= closed_max_week].copy()
        for c in adv_cols:
            adv[c] = pd.to_numeric(adv[c], errors="coerce")
        adv_sub = adv[["week", "pfr_player_id"] + adv_cols].rename(columns={"pfr_player_id": "pfr_id"}).drop_duplicates(["week", "pfr_id"])
    else:
        adv_sub = pd.DataFrame(columns=["week", "pfr_id"] + adv_cols)

    st_sub = st[st["player_id"].isin(r_map["player_id"])].copy()
    box_keep = [
        "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_sacks",
        "def_sack_yards", "def_qb_hits", "def_pass_defended", "def_interceptions",
        "def_interception_yards", "def_fumbles_forced", "fumble_recovery_opp",
        "fumble_recovery_yards_opp", "def_tds", "def_safeties",
        "def_punt_blocks", "def_pat_blocks", "def_fg_blocks",
    ]
    box_df = pd.DataFrame({"season": int(yr), "week": st_sub["week"].astype(int), "player_id": st_sub["player_id"].astype(str).str.strip(), "stat_team": st_sub["team"]})
    for c in box_keep:
        box_df[c] = gcol(st_sub, c).values
    box_df["def_blk_kicks"] = box_df["def_punt_blocks"] + box_df["def_pat_blocks"] + box_df["def_fg_blocks"]
    box_df = box_df.drop_duplicates(["week", "player_id"])

    panel = snaps_def.merge(r_map, on="pfr_id", how="inner")
    panel = panel.merge(box_df, on=["week", "player_id"], how="left")
    panel = panel.merge(adv_sub, on=["week", "pfr_id"], how="left")
    panel["season"] = int(yr)
    panel["team"] = panel["team"].map(norm_team)
    panel["opponent"] = panel["opponent"].map(norm_team)
    for c in box_keep + ["def_blk_kicks"]:
        panel[c] = panel[c].fillna(0.0)

    panel["yuh_pts_nfl"] = score_components(
        panel["def_tackles_solo"], panel["def_tackle_assists"], panel["def_tackles_for_loss"],
        panel["def_qb_hits"], panel["def_sacks"], panel["def_sack_yards"].abs(),
        panel["def_pass_defended"], panel["def_interceptions"], panel["def_interception_yards"],
        panel["def_fumbles_forced"], panel["fumble_recovery_opp"], panel["fumble_recovery_yards_opp"],
        panel["def_tds"], panel["def_safeties"], panel["def_blk_kicks"], weights,
    ).round(3)

    panel["tkl_opp"] = np.where(
        panel["def_missed_tackles"].notna(),
        panel["def_tackles_solo"] + panel["def_tackle_assists"] + panel["def_missed_tackles"],
        np.nan,
    )
    panel["pfr_present"] = panel["def_pressures"].notna()
    return panel.sort_values(["season", "week", "player_id"]).reset_index(drop=True)


def compute_role_priors(hist: pd.DataFrame) -> dict[str, Any]:
    role_priors: dict[str, dict[str, float]] = {}
    lg_plays = float(hist["defense_snaps"].sum() / max(hist["defense_pct"].clip(lower=0.05).sum(), 1.0))
    lg_plays = float(np.clip(lg_plays, 55.0, 72.0))

    for role in SUB_ROLES:
        rdf = hist[hist["sub_role"] == role]
        if len(rdf) < 50:
            rdf = hist
        sn = float(np.maximum(rdf["defense_snaps"].sum(), 1.0))
        pfr = rdf[rdf["pfr_present"]]
        sn_pfr = float(np.maximum(pfr["defense_snaps"].sum(), 1.0)) if len(pfr) else sn
        tkl_opp_sum = float(np.maximum(pfr["tkl_opp"].sum(), 1.0)) if len(pfr) else 1.0
        prs_sum = float(np.maximum(pfr["def_pressures"].sum(), 1.0)) if len(pfr) else 1.0
        tgt_sum = float(np.maximum(pfr["def_targets"].sum(), 1.0)) if len(pfr) else 1.0
        comb_tkl_box = float(np.maximum((rdf["def_tackles_solo"] + rdf["def_tackle_assists"]).sum(), 1.0))
        sk_tot = float(rdf["def_sacks"].sum())
        int_tot = float(rdf["def_interceptions"].sum())
        fr_tot = float(rdf["fumble_recovery_opp"].sum())

        role_priors[role] = {
            "yuh_pts_mean": float(rdf["yuh_pts_nfl"].mean()),
            "snap_pct": float(rdf["defense_pct"].clip(0.0, 1.0).mean()),
            "tkl_opp_rate": float(tkl_opp_sum / sn_pfr) if len(pfr) else float(comb_tkl_box / sn) / 0.85,
            "tkl_conv": float(np.clip((pfr["def_tackles_solo"] + pfr["def_tackle_assists"]).sum() / tkl_opp_sum, 0.70, 0.96)) if len(pfr) else 0.86,
            "comb_tkl_rate": float(comb_tkl_box / sn),
            "solo_share": float(np.clip(rdf["def_tackles_solo"].sum() / comb_tkl_box, 0.35, 0.85)),
            "prs_rate": float(prs_sum / sn_pfr) if len(pfr) else float(sk_tot / sn) * 6.0,
            "sk_per_prs": float(np.clip(pfr["def_sacks"].sum() / prs_sum, 0.02, 0.35)) if len(pfr) else 0.14,
            "qbh_per_prs": float(np.clip(pfr["def_qb_hits"].sum() / prs_sum, 0.05, 0.65)) if len(pfr) else 0.34,
            "sk_rate": float(sk_tot / sn),
            "qbh_rate": float(rdf["def_qb_hits"].sum() / sn),
            "tfl_rate": float(rdf["def_tackles_for_loss"].sum() / sn),
            "tgt_rate": float(tgt_sum / sn_pfr) if len(pfr) else 0.06,
            "pbu_per_tgt": float(np.clip(pfr["def_pass_defended"].sum() / tgt_sum, 0.01, 0.35)) if len(pfr) else 0.14,
            "int_per_tgt": float(np.clip(pfr["def_interceptions"].sum() / tgt_sum, 0.002, 0.12)) if len(pfr) else 0.025,
            "pbu_rate": float(rdf["def_pass_defended"].sum() / sn),
            "int_rate": float(int_tot / sn),
            "ff_rate": float(rdf["def_fumbles_forced"].sum() / sn),
            "fr_rate": float(fr_tot / sn),
            "td_rate": float(rdf["def_tds"].sum() / sn),
            "safe_rate": float(rdf["def_safeties"].sum() / sn),
            "blk_rate": float(rdf["def_blk_kicks"].sum() / sn),
            "yd_per_sack": float(np.clip(rdf["def_sack_yards"].abs().sum() / max(sk_tot, 1.0), 4.0, 9.5)),
            "yd_per_int": float(np.clip(rdf["def_interception_yards"].sum() / max(int_tot, 1.0), 5.0, 25.0)),
            "yd_per_fr": float(np.clip(rdf["fumble_recovery_yards_opp"].sum() / max(fr_tot, 1.0), 0.0, 15.0)),
        }
    return {"role_priors": role_priors, "lg_plays": lg_plays}


def compute_opp_factors(seasons: tuple[int, ...], cur_season: int, closed_max_week: int, target_week: int, cache_dir: pathlib.Path) -> dict[str, dict[str, float]]:
    frames: list[pd.DataFrame] = []
    for yr in seasons:
        pbp = pd.read_parquet(
            cache_dir / f"play_by_play_{yr}.parquet",
            columns=["season", "week", "season_type", "posteam", "play_type", "sack", "pass_attempt", "rush_attempt", "complete_pass"],
        )
        pbp = pbp[(pbp["season_type"] == "REG") & pbp["posteam"].notna()].copy()
        if yr == cur_season:
            pbp = pbp[pbp["week"] <= closed_max_week].copy()
        pbp["is_scrim"] = pbp["play_type"].isin(["run", "pass"]).astype(float)
        agg = pbp.groupby(["season", "week", "posteam"], as_index=False).agg(
            off_plays=("is_scrim", "sum"),
            off_sacks=("sack", "sum"),
            off_pass_att=("pass_attempt", "sum"),
            off_comp=("complete_pass", "sum"),
            off_rush_att=("rush_attempt", "sum"),
        )
        agg = agg[agg["off_plays"] >= 20].copy()
        agg["team"] = agg["posteam"].map(norm_team)
        frames.append(agg)
    hist = pd.concat(frames, ignore_index=True)
    prior_yr = hist[hist["season"] == cur_season - 1]
    curr_yr = hist[(hist["season"] == cur_season) & (hist["week"] < target_week)]

    lg_plays = float(hist["off_plays"].mean())
    lg_sack_rt = float(hist["off_sacks"].sum() / max(hist["off_pass_att"].sum(), 1.0))
    lg_tkl_env = float((hist["off_comp"] + hist["off_rush_att"]).sum() / max(hist["off_plays"].sum(), 1.0))
    lg_pass_rt = float(hist["off_pass_att"].sum() / max(hist["off_plays"].sum(), 1.0))

    out: dict[str, dict[str, float]] = {}
    for tm in hist["team"].unique():
        c = curr_yr[curr_yr["team"] == tm]
        p = prior_yr[prior_yr["team"] == tm]
        cw = float(len(c))
        pw = min(4.0, float(len(p))) if len(p) else 0.0
        ps = pw / max(len(p), 1)
        plays_tm = (c["off_plays"].sum() + ps * p["off_plays"].sum() + 4.0 * lg_plays) / (cw + pw + 4.0)
        sacks_num = c["off_sacks"].sum() + ps * p["off_sacks"].sum() + 120.0 * lg_sack_rt
        sacks_den = c["off_pass_att"].sum() + ps * p["off_pass_att"].sum() + 120.0
        tkl_num = (c["off_comp"] + c["off_rush_att"]).sum() + ps * (p["off_comp"] + p["off_rush_att"]).sum() + 180.0 * lg_tkl_env
        tkl_den = c["off_plays"].sum() + ps * p["off_plays"].sum() + 180.0
        pass_num = c["off_pass_att"].sum() + ps * p["off_pass_att"].sum() + 180.0 * lg_pass_rt
        out[tm] = {
            "opp_plays_mult": float(np.clip(plays_tm / lg_plays, 0.88, 1.12)),
            "opp_sack_mult": float(np.clip((sacks_num / sacks_den) / lg_sack_rt, 0.72, 1.35)),
            "opp_tkl_mult": float(np.clip((tkl_num / tkl_den) / lg_tkl_env, 0.88, 1.12)),
            "opp_pass_mult": float(np.clip((pass_num / tkl_den) / lg_pass_rt, 0.85, 1.15)),
        }
    return out


class PlayerAcc:
    __slots__ = (
        "last_t", "g_act", "snap_pct_sum", "snaps_box", "solo", "ast", "tfl",
        "sk_box", "qbh_box", "pbu_box", "int_box", "ff", "fr", "td", "safe", "blk",
        "snaps_pfr", "tkl_opp", "comb_tkl_pfr", "prs", "sk_pfr", "qbh_pfr",
        "tgt", "pbu_pfr", "int_pfr",
    )

    def __init__(self) -> None:
        self.last_t = -1.0
        for s in self.__slots__[1:]:
            setattr(self, s, 0.0)

    def decay_to(self, t_now: float, hl: float) -> None:
        if self.last_t < 0:
            self.last_t = t_now
            return
        dt = t_now - self.last_t
        if dt <= 0:
            return
        d = 0.5 ** (dt / hl)
        for s in self.__slots__[1:]:
            setattr(self, s, getattr(self, s) * d)
        self.last_t = t_now

    def update(self, row: Any, t_now: float, hl: float) -> None:
        self.decay_to(t_now, hl)
        sn = float(row.defense_snaps)
        pct = float(min(max(row.defense_pct if pd.notna(row.defense_pct) else sn / 63.0, 0.0), 1.0))
        self.g_act += 1.0
        self.snap_pct_sum += pct
        self.snaps_box += sn
        self.solo += float(row.def_tackles_solo)
        self.ast += float(row.def_tackle_assists)
        self.tfl += float(row.def_tackles_for_loss)
        self.sk_box += float(row.def_sacks)
        self.qbh_box += float(row.def_qb_hits)
        self.pbu_box += float(row.def_pass_defended)
        self.int_box += float(row.def_interceptions)
        self.ff += float(row.def_fumbles_forced)
        self.fr += float(row.fumble_recovery_opp)
        self.td += float(row.def_tds)
        self.safe += float(row.def_safeties)
        self.blk += float(row.def_blk_kicks)
        if bool(row.pfr_present):
            self.snaps_pfr += sn
            self.tkl_opp += float(row.tkl_opp) if pd.notna(row.tkl_opp) else float(row.def_tackles_solo + row.def_tackle_assists)
            self.comb_tkl_pfr += float(row.def_tackles_solo + row.def_tackle_assists)
            self.prs += float(row.def_pressures) if pd.notna(row.def_pressures) else 0.0
            self.sk_pfr += float(row.def_sacks)
            self.qbh_pfr += float(row.def_qb_hits)
            self.tgt += float(row.def_targets) if pd.notna(row.def_targets) else 0.0
            self.pbu_pfr += float(row.def_pass_defended)
            self.int_pfr += float(row.def_interceptions)


def predict_player(acc: PlayerAcc, sub_role: str, opp_factors: dict[str, float], priors: dict[str, Any], weights: dict[str, float], t_now: float) -> dict[str, float]:
    rp = priors["role_priors"][sub_role]
    lg_plays = priors["lg_plays"]
    p = BEST_PARAMS
    acc.decay_to(t_now, p["half_life"])

    x_snap_pct = (acc.snap_pct_sum + p["k_snap"] * rp["snap_pct"]) / (acc.g_act + p["k_snap"])
    opp_plays = opp_factors.get("opp_plays_mult", 1.0)
    sn_pred = float(np.clip(x_snap_pct * lg_plays * opp_plays, 1.0, 82.0))

    box_comb = (acc.solo + acc.ast + p["k_tkl_opp"] * rp["comb_tkl_rate"]) / (acc.snaps_box + p["k_tkl_opp"])
    solo_sh = (acc.solo + p["k_solo_sh"] * rp["solo_share"]) / (acc.solo + acc.ast + p["k_solo_sh"])
    box_sk = (acc.sk_box + p["k_prs"] * rp["sk_rate"]) / (acc.snaps_box + p["k_prs"])
    box_qbh = (acc.qbh_box + p["k_prs"] * rp["qbh_rate"]) / (acc.snaps_box + p["k_prs"])
    tfl_rt = (acc.tfl + p["k_tfl"] * rp["tfl_rate"]) / (acc.snaps_box + p["k_tfl"])
    box_pbu = (acc.pbu_box + p["k_pbu_snap"] * rp["pbu_rate"]) / (acc.snaps_box + p["k_pbu_snap"])
    box_int = (acc.int_box + p["k_int_snap"] * rp["int_rate"]) / (acc.snaps_box + p["k_int_snap"])
    ff_rt = (acc.ff + p["k_rare"] * rp["ff_rate"]) / (acc.snaps_box + p["k_rare"])
    fr_rt = (acc.fr + p["k_rare"] * rp["fr_rate"]) / (acc.snaps_box + p["k_rare"])
    td_rt = (acc.td + p["k_rare"] * rp["td_rate"]) / (acc.snaps_box + p["k_rare"])
    safe_rt = (acc.safe + p["k_rare"] * rp["safe_rate"]) / (acc.snaps_box + p["k_rare"])
    blk_rt = (acc.blk + p["k_rare"] * rp["blk_rate"]) / (acc.snaps_box + p["k_rare"])

    if acc.snaps_pfr > 0.0:
        w_pfr = acc.snaps_pfr / max(acc.snaps_box, acc.snaps_pfr)
        tkl_opp_rt = (acc.tkl_opp + p["k_tkl_opp"] * rp["tkl_opp_rate"]) / (acc.snaps_pfr + p["k_tkl_opp"])
        tkl_conv = (acc.comb_tkl_pfr + p["k_tkl_conv"] * rp["tkl_conv"]) / (acc.tkl_opp + p["k_tkl_conv"])
        comb_rt = w_pfr * (tkl_opp_rt * tkl_conv) + (1.0 - w_pfr) * box_comb

        prs_rt = (acc.prs + p["k_prs"] * rp["prs_rate"]) / (acc.snaps_pfr + p["k_prs"])
        sk_prs = (acc.sk_pfr + p["k_sk_conv"] * rp["sk_per_prs"]) / (acc.prs + p["k_sk_conv"])
        qbh_prs = (acc.qbh_pfr + p["k_qbh_conv"] * rp["qbh_per_prs"]) / (acc.prs + p["k_qbh_conv"])
        sk_rt = w_pfr * (prs_rt * sk_prs) + (1.0 - w_pfr) * box_sk
        qbh_rt = w_pfr * (prs_rt * qbh_prs) + (1.0 - w_pfr) * box_qbh

        if sub_role in ("OBLB", "S", "CB"):
            tgt_rt = (acc.tgt + p["k_tgt"] * rp["tgt_rate"]) / (acc.snaps_pfr + p["k_tgt"])
            pbu_tgt = (acc.pbu_pfr + p["k_pbu_conv"] * rp["pbu_per_tgt"]) / (acc.tgt + p["k_pbu_conv"])
            int_tgt = (acc.int_pfr + p["k_int_conv"] * rp["int_per_tgt"]) / (acc.tgt + p["k_int_conv"])
            pbu_rt = w_pfr * (tgt_rt * pbu_tgt) + (1.0 - w_pfr) * box_pbu
            int_rt = w_pfr * (tgt_rt * int_tgt) + (1.0 - w_pfr) * box_int
        else:
            pbu_rt, int_rt = box_pbu, box_int
    else:
        comb_rt, sk_rt, qbh_rt, pbu_rt, int_rt = box_comb, box_sk, box_qbh, box_pbu, box_int

    opp_t = opp_factors.get("opp_tkl_mult", 1.0)
    opp_s = opp_factors.get("opp_sack_mult", 1.0)
    opp_p = opp_factors.get("opp_pass_mult", 1.0)

    xs_comb = sn_pred * comb_rt * opp_t
    xs_solo = xs_comb * solo_sh
    xs_ast = xs_comb * (1.0 - solo_sh)
    xs_tfl = sn_pred * tfl_rt * (0.5 * opp_t + 0.5 * opp_s)
    xs_sk = sn_pred * sk_rt * opp_s
    xs_sk_yd = xs_sk * rp["yd_per_sack"]
    xs_qbh = sn_pred * qbh_rt * opp_s
    xs_pbu = sn_pred * pbu_rt * opp_p
    xs_int = sn_pred * int_rt * opp_p
    xs_int_yd = xs_int * rp["yd_per_int"]
    xs_ff = sn_pred * ff_rt
    xs_fr = sn_pred * fr_rt
    xs_fr_yd = xs_fr * rp["yd_per_fr"]
    xs_td = sn_pred * td_rt
    xs_safe = sn_pred * safe_rt
    xs_blk = sn_pred * blk_rt

    pts = float(score_components(
        xs_solo, xs_ast, xs_tfl, xs_qbh, xs_sk, xs_sk_yd,
        xs_pbu, xs_int, xs_int_yd, xs_ff, xs_fr, xs_fr_yd,
        xs_td, xs_safe, xs_blk, weights,
    ))
    return {
        "pts": pts, "snaps": sn_pred, "solo": xs_solo, "ast": xs_ast,
        "tkl": xs_solo + 0.5 * xs_ast, "tfl": xs_tfl, "sk": xs_sk, "sk_yd": xs_sk_yd,
        "qbh": xs_qbh, "pbu": xs_pbu, "int": xs_int, "int_yd": xs_int_yd,
        "ff": xs_ff, "fr": xs_fr, "fr_yd": xs_fr_yd, "td": xs_td,
        "safe": xs_safe, "blk": xs_blk,
    }


def compute_age_curves(cache_dir: pathlib.Path, hist_dir: pathlib.Path | None, weights: dict[str, float]) -> dict[str, dict[int, float]]:
    if hist_dir is None or not (hist_dir / "season_2025_derived.csv").exists() or not (cache_dir / "roster_2015.parquet").exists():
        return EMPIRICAL_AGE_MULT_2015_2025
    id_birth: dict[str, int] = {}
    id_pg: dict[str, str] = {}
    dfs: list[pd.DataFrame] = []
    for yr in range(2015, 2026):
        r = pd.read_parquet(cache_dir / f"roster_{yr}.parquet")
        r = r[r["position"].isin(["DL", "LB", "DB"]) & r["gsis_id"].notna()].drop_duplicates("gsis_id")
        for row in r.itertuples(index=False):
            gid = str(row.gsis_id).strip()
            if pd.notna(row.birth_date):
                try:
                    id_birth[gid] = int(str(row.birth_date)[:4])
                except ValueError:
                    pass
            id_pg[gid] = POS_GROUP_MAP.get(str(row.position), "LB")
        if yr < 2025:
            sdf = pd.read_csv(hist_dir / f"season_{yr}.csv")
            sdf = sdf[sdf["season_type"] == "REG"].copy()
            sk_yd = pd.to_numeric(sdf["def_sack_yards"], errors="coerce").fillna(0.0).abs()
            int_yd = pd.to_numeric(sdf["def_interception_yards"], errors="coerce").fillna(0.0)
            fr_yd = pd.to_numeric(sdf["def_fumble_recovery_yards_opp"], errors="coerce").fillna(0.0)
        else:
            sdf = pd.read_csv(hist_dir / "season_2025_derived.csv")
            sk_yd = pd.to_numeric(sdf["def_sacks"], errors="coerce").fillna(0.0) * 6.5
            int_yd = pd.to_numeric(sdf["def_interceptions"], errors="coerce").fillna(0.0) * 12.0
            fr_yd = pd.to_numeric(sdf["def_fumble_recovery_opp"], errors="coerce").fillna(0.0) * 4.0

        def col(c: str) -> pd.Series:
            return pd.to_numeric(sdf[c], errors="coerce").fillna(0.0) if c in sdf.columns else pd.Series(0.0, index=sdf.index)

        yuh_tot = score_components(
            col("def_tackles_solo"), col("def_tackle_assists"), col("def_tackles_for_loss"),
            col("def_qb_hits"), col("def_sacks"), sk_yd,
            col("def_pass_defended"), col("def_interceptions"), int_yd,
            col("def_fumbles_forced"), col("def_fumble_recovery_opp"), fr_yd,
            col("def_tds"), col("def_safety"), pd.Series(0.0, index=sdf.index), weights,
        )
        part = pd.DataFrame({
            "season": yr,
            "player_id": sdf["player_id"].astype(str).str.strip(),
            "games": pd.to_numeric(sdf["games"], errors="coerce").fillna(0.0),
            "yuh_tot": yuh_tot,
        }).groupby(["season", "player_id"], as_index=False).agg(games=("games", "max"), yuh_tot=("yuh_tot", "sum"))
        part["pos_group"] = part["player_id"].map(id_pg)
        part["birth_year"] = part["player_id"].map(id_birth)
        part = part[part["pos_group"].notna() & part["birth_year"].notna()].copy()
        part["age"] = part["season"] - part["birth_year"]
        dfs.append(part)

    full = pd.concat(dfs, ignore_index=True)
    nxt = full[["season", "player_id", "games", "yuh_tot"]].copy()
    nxt["season"] = nxt["season"] - 1
    nxt = nxt.rename(columns={"games": "games_next", "yuh_tot": "yuh_tot_next"})
    base = full[(full["season"] <= 2024) & (full["games"] >= 6) & (full["yuh_tot"] >= 60.0)].merge(
        nxt, on=["season", "player_id"], how="left"
    )
    base["yuh_tot_next"] = base["yuh_tot_next"].fillna(0.0)
    base["age_bin"] = np.clip(base["age"].astype(int), 21, 34)

    table: dict[str, dict[int, float]] = {"DL": {}, "LB": {}, "DB": {}}
    for pg in ("DL", "LB", "DB"):
        psub = base[base["pos_group"] == pg]
        raw_step: dict[int, float] = {}
        for ab in range(21, 35):
            cell = psub[psub["age_bin"] == ab]
            use = cell if len(cell) >= 12 else psub[(psub["age_bin"] >= ab - 1) & (psub["age_bin"] <= ab + 1)]
            raw_step[ab] = float(np.clip(use["yuh_tot_next"].sum() / max(use["yuh_tot"].sum(), 1.0), 0.25, 1.15))
        for ab in range(21, 35):
            r1 = raw_step.get(ab, 0.7)
            r2 = r1 * raw_step.get(min(ab + 1, 34), 0.65)
            r3 = r2 * raw_step.get(min(ab + 2, 34), 0.6)
            npv = (1.0 + 0.85 * r1 + 0.72 * r2 + 0.61 * r3) / 3.18
            table[pg][ab] = round(float(np.clip(npv, 0.35, 1.15)), 4)
    return table


def load_fp_ranks(raw_dir: pathlib.Path | None, cache_dir: pathlib.Path, target_week: int, cw: dict[str, Any]) -> tuple[dict[str, int], dict[str, int]]:
    fp_wk: dict[str, int] = {}
    fp_dyn: dict[str, int] = {}
    search_dirs = [d for d in (raw_dir, cache_dir) if d is not None and d.exists()]
    for d in search_dirs:
        wk_file = d / f"fp_weekly_w{target_week:02d}_IDP.json"
        if not fp_wk and wk_file.exists():
            doc = json.loads(wk_file.read_text(encoding="utf-8"))
            for r in (doc.get("players") or []):
                sid = resolve_name_team(r.get("player_name"), r.get("player_team_id"), cw)
                if sid and sid not in fp_wk and r.get("rank_ecr") is not None:
                    fp_wk[sid] = int(round(float(r["rank_ecr"])))
        dyn_file = d / "fp_dynasty_IDP.json"
        if not fp_dyn and dyn_file.exists():
            doc = json.loads(dyn_file.read_text(encoding="utf-8"))
            for r in (doc.get("players") or []):
                sid = resolve_name_team(r.get("player_name"), r.get("player_team_id"), cw)
                if sid and sid not in fp_dyn and r.get("rank_ecr") is not None:
                    fp_dyn[sid] = int(round(float(r["rank_ecr"])))
    return fp_wk, fp_dyn


def load_slp_ytd_map(raw_dir: pathlib.Path | None, cache_dir: pathlib.Path, cur_season: int, closed_max_week: int, weights: dict[str, float]) -> dict[str, dict[str, float]]:
    search_dirs = [d for d in (raw_dir, cache_dir) if d is not None and d.exists()]
    if not search_dirs:
        return {}
    sums: dict[str, dict[str, float]] = {}
    for w in range(1, closed_max_week + 1):
        p = next((d / f"sleeper_stats_{cur_season}_w{w:02d}.json" for d in search_dirs if (d / f"sleeper_stats_{cur_season}_w{w:02d}.json").exists()), None)
        if p is None:
            continue
        arr = json.loads(p.read_text(encoding="utf-8"))
        seen: set[str] = set()
        for r in arr:
            sid = str(r.get("player_id") or "")
            if not sid or sid in seen:
                continue
            seen.add(sid)
            st = r.get("stats") or {}
            if not any(k.startswith("idp_") for k in st):
                continue
            pts = sum(float(st.get(k) or 0.0) * wt for k, wt in weights.items())
            d = sums.setdefault(sid, {"pts": 0.0, "sk": 0.0, "pbu": 0.0, "int": 0.0})
            d["pts"] += pts
            d["sk"] += float(st.get("idp_sack") or 0.0)
            d["pbu"] += float(st.get("idp_pass_def") or 0.0)
            d["int"] += float(st.get("idp_int") or 0.0)
    return sums


def build(cache_dir: pathlib.Path, players_path: pathlib.Path, hist_dir: pathlib.Path | None, raw_dir: pathlib.Path | None, week_override: int | None, offline: bool = False) -> dict[str, Any]:
    weights, cur_season, detected_week = load_yuh_scoring_and_week(ROOT)
    target_week = week_override if week_override is not None else detected_week
    closed_max_week = max(0, target_week - 1)
    train_seasons = (cur_season - 3, cur_season - 2, cur_season - 1)

    cw = build_sleeper_crosswalk(players_path, cache_dir, cur_season)
    hist_panels = [load_season_weekly(yr, cur_season, closed_max_week, cache_dir, hist_dir, raw_dir, weights, offline=offline) for yr in train_seasons]
    hist_df = pd.concat(hist_panels, ignore_index=True)
    priors = compute_role_priors(hist_df)

    cur_panel = load_season_weekly(cur_season, cur_season, closed_max_week, cache_dir, hist_dir, raw_dir, weights, offline=offline)
    full_panel = pd.concat([hist_df, cur_panel], ignore_index=True).sort_values(["season", "week", "player_id"]).reset_index(drop=True)

    accs: dict[str, PlayerAcc] = {}
    for row in full_panel.itertuples(index=False):
        pid = str(row.player_id)
        if pid not in accs:
            accs[pid] = PlayerAcc()
        accs[pid].update(row, time_index(int(row.season), int(row.week)), BEST_PARAMS["half_life"])

    # Compute YTD actuals from nflverse (plus Sleeper exact YTD when cached)
    ytd_nfl = cur_panel.groupby("player_id", as_index=False).agg(
        act_gp=("defense_snaps", "count"),
        snaps_tot=("defense_snaps", "sum"),
        pts_tot=("yuh_pts_nfl", "sum"),
        sk_tot=("def_sacks", "sum"),
        pbu_tot=("def_pass_defended", "sum"),
        int_tot=("def_interceptions", "sum"),
    ).set_index("player_id").to_dict("index")
    slp_ytd = load_slp_ytd_map(raw_dir, cache_dir, cur_season, closed_max_week, weights)

    opp_factors = compute_opp_factors(train_seasons + (cur_season,), cur_season, closed_max_week, target_week, cache_dir)
    games_cur = load_cur_games(cache_dir, cur_season, offline=offline)
    rem_games = games_cur[(games_cur["game_type"] == "REG") & (games_cur["week"] >= target_week)]
    team_rem_opps: dict[str, dict[int, str]] = {}
    for g in rem_games.itertuples(index=False):
        ht, at, wk = norm_team(g.home_team), norm_team(g.away_team), int(g.week)
        team_rem_opps.setdefault(ht, {})[wk] = at
        team_rem_opps.setdefault(at, {})[wk] = ht

    age_table = compute_age_curves(cache_dir, hist_dir, weights)
    fp_wk, fp_dyn = load_fp_ranks(raw_dir, cache_dir, target_week, cw)

    r_cur_sr = cur_panel.sort_values("week").drop_duplicates("player_id", keep="last").set_index("player_id")["sub_role"].to_dict()
    p_prev = hist_panels[-1]
    r_prev_sr = p_prev.sort_values("week").drop_duplicates("player_id", keep="last").set_index("player_id")["sub_role"].to_dict()

    # Load yuH rostered players so every rostered player stays represented
    yuh_roster_ids: set[str] = set()
    rj = ROOT / "Leagues" / "yuH" / "rosters.json"
    if rj.exists():
        for r in json.loads(rj.read_text(encoding="utf-8")):
            for pid in (r.get("players") or []) + (r.get("reserve") or []) + (r.get("taxi") or []):
                yuh_roster_ids.add(str(pid))

    t_pred = time_index(cur_season, target_week)
    players_out: dict[str, dict[str, Any]] = {}
    for sid, info in cw["sid_to_info"].items():
        gid = info.get("gsis_id")
        acc = accs.get(gid) if gid else None
        if acc is None:
            continue
        ytd_r = ytd_nfl.get(gid) or {}
        act_gp = int(ytd_r.get("act_gp") or 0)
        if act_gp == 0 and sid not in fp_wk and sid not in fp_dyn and sid not in yuh_roster_ids:
            continue
        if acc.g_act < 0.8 and sid not in fp_wk and sid not in fp_dyn and sid not in yuh_roster_ids:
            continue

        sub_role = r_cur_sr.get(gid) or r_prev_sr.get(gid) or info.get("sub_role") or "OBLB"
        pos_grp = info.get("pos") or "LB"
        team = info.get("team") or ""
        p_neut = predict_player(acc, sub_role, {}, priors, weights, t_pred)
        w_opp = team_rem_opps.get(team, {}).get(target_week, "")
        p_wk = predict_player(acc, sub_role, opp_factors.get(w_opp, {}), priors, weights, t_pred)

        rem = team_rem_opps.get(team, {})
        if rem:
            ros_ppg = float(np.mean([predict_player(acc, sub_role, opp_factors.get(op, {}), priors, weights, t_pred)["pts"] for op in rem.values()]))
        else:
            ros_ppg = p_neut["pts"]

        sy = slp_ytd.get(sid)
        pts_sum = sy["pts"] if sy else float(ytd_r.get("pts_tot") or 0.0)
        sk_sum = sy["sk"] if sy else float(ytd_r.get("sk_tot") or 0.0)
        pbu_sum = sy["pbu"] if sy else float(ytd_r.get("pbu_tot") or 0.0)
        int_sum = sy["int"] if sy else float(ytd_r.get("int_tot") or 0.0)
        ytd_ppg = pts_sum / act_gp if act_gp > 0 else 0.0
        luck = round(ytd_ppg - p_neut["pts"], 2) if act_gp >= 4 else 0.0
        sk_luck = round(3.67 * (sk_sum / act_gp - p_neut["sk"]), 2) if act_gp >= 4 else 0.0
        cov_luck = round(3.0 * (pbu_sum / act_gp - p_neut["pbu"]) + 6.2 * (int_sum / act_gp - p_neut["int"]), 2) if act_gp >= 4 else 0.0

        age_val = info.get("age")
        if age_val is None and info.get("birth_date"):
            try:
                age_val = cur_season - int(str(info["birth_date"])[:4])
            except ValueError:
                age_val = 26
        age_int = int(round(float(age_val))) if age_val is not None else 26
        age_mult = age_table[pos_grp][int(np.clip(age_int, 21, 34))]

        inj = info.get("inj") or ""
        is_inactive = inj in {"IR", "PUP", "NA", "Sus"}
        ros_elig = (not is_inactive) or (sid in fp_wk)

        players_out[sid] = {
            "n": info["name"],
            "p": pos_grp,
            "sr": sub_role,
            "t": team or None,
            "opp": w_opp or None,
            "age": age_int,
            "inj": inj or None,
            "gp": act_gp,
            "snp_pg": round(float(ytd_r.get("snaps_tot") or 0.0) / act_gp, 1) if act_gp > 0 else 0.0,
            "xSnp": round(p_neut["snaps"], 1),
            "xSolo": round(p_neut["solo"], 2),
            "xAst": round(p_neut["ast"], 2),
            "xTkl": round(p_neut["tkl"], 2),
            "xTFL": round(p_neut["tfl"], 2),
            "xSk": round(p_neut["sk"], 3),
            "xSkYd": round(p_neut["sk_yd"], 2),
            "xQBH": round(p_neut["qbh"], 2),
            "xPBU": round(p_neut["pbu"], 2),
            "xINT": round(p_neut["int"], 3),
            "xINTYd": round(p_neut["int_yd"], 2),
            "xFF": round(p_neut["ff"], 3),
            "xFR": round(p_neut["fr"], 3),
            "xFRYd": round(p_neut["fr_yd"], 2),
            "xTD": round(p_neut["td"], 3),
            "xSafe": round(p_neut["safe"], 4),
            "xBlk": round(p_neut["blk"], 4),
            "xWk": round(p_wk["pts"], 2) if ros_elig else 0.0,
            "xRos": round(ros_ppg, 2) if ros_elig else None,
            "xNeut": round(p_neut["pts"], 2),
            "ytd": round(ytd_ppg, 2) if act_gp > 0 else None,
            "luck": luck if act_gp >= 4 else None,
            "skLuck": sk_luck if act_gp >= 4 else None,
            "covLuck": cov_luck if act_gp >= 4 else None,
            "fpWk": fp_wk.get(sid),
            "fpDyn": fp_dyn.get(sid),
            "ageMult": age_mult,
            "_elig": ros_elig,
        }

    # Rank active ROS pool and compute 2 IDP_FLEX replacement Dynasty score
    elig_sorted = sorted((r for r in players_out.values() if r["_elig"] and r["xRos"] is not None), key=lambda r: (-r["xRos"], -r["xWk"], r["n"]))
    for idx, r in enumerate(elig_sorted, 1):
        r["rosRk"] = idx
    repl_ppg = elig_sorted[min(23, len(elig_sorted) - 1)]["xNeut"] if elig_sorted else 8.8
    for r in players_out.values():
        vor_pos = max(r["xNeut"] - 0.65 * repl_ppg, 0.25)
        r["dyn"] = round(vor_pos * r["ageMult"] * 10.0, 2)
    dyn_sorted = sorted(players_out.values(), key=lambda r: (-r["dyn"], -r["xNeut"], r["n"]))
    for idx, r in enumerate(dyn_sorted, 1):
        r["dynRk"] = idx
    for r in players_out.values():
        r.pop("_elig", None)
        if not r.get("opp"):
            r.pop("opp", None)
        if not r.get("inj"):
            r.pop("inj", None)
        if r.get("fpWk") is None:
            r.pop("fpWk", None)
        if r.get("fpDyn") is None:
            r.pop("fpDyn", None)

    return {
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "season": cur_season,
        "week": target_week,
        "throughWeek": closed_max_week,
        "league": "yuH",
        "modelId": "yuh-idp-xstats-v1",
        "replPpg": round(repl_ppg, 2),
        "scoring": weights,
        "players": dict(sorted(players_out.items(), key=lambda kv: (kv[1].get("rosRk") or 99999, kv[1].get("dynRk") or 99999))),
    }


def run_self_check(payload: dict[str, Any], freeze_dir: pathlib.Path | None) -> None:
    players = payload["players"]
    assert len(players) >= 600, f"Too few IDP xStats players: {len(players)}"
    assert payload["throughWeek"] == payload["week"] - 1, f"throughWeek={payload['throughWeek']} vs week={payload['week']}"
    sc = payload["scoring"]
    assert abs(sc["idp_pass_def"] - 3.0) < 1e-6 and abs(sc["idp_sack"] - 3.0) < 1e-6 and abs(sc["idp_int"] - 5.0) < 1e-6
    for sid, r in players.items():
        assert sid == sid.strip(), f"Unstripped SID: {sid!r}"
        for k in ("xSnp", "xSolo", "xAst", "xTkl", "xTFL", "xSk", "xQBH", "xPBU", "xINT", "xFF", "xFR", "xSafe", "xBlk", "xNeut", "dyn"):
            v = r.get(k)
            assert v is not None and np.isfinite(float(v)), f"NaN/missing {k} on {sid} ({r.get('n')})"

    if freeze_dir and (freeze_dir / "rankings_2026_w12_ros.csv").exists():
        with (freeze_dir / "rankings_2026_w12_ros.csv").open(encoding="utf-8") as f:
            top25 = list(csv.DictReader(f))[:25]
        diffs = []
        for row in top25:
            sid = row["sleeper_id"]
            assert sid in players, f"Frozen top-25 SID {sid} ({row['name']}) missing!"
            d = abs(float(players[sid]["xRos"]) - float(row["xYuH_ROS_PPG"]))
            diffs.append((row["name"], d))
            assert d <= 0.05, f"ROS mismatch for {row['name']}: got {players[sid]['xRos']} vs frozen {row['xYuH_ROS_PPG']}"
        print(f"  OK  Top-25 ROS parity check vs frozen CSV: max_diff={max(d for _, d in diffs):.4f} (limit <= 0.05)")

        with (freeze_dir / "rankings_2026_dynasty.csv").open(encoding="utf-8") as f:
            top20_dyn = list(csv.DictReader(f))[:20]
        dyn_diffs = []
        for row in top20_dyn:
            sid = row["sleeper_id"]
            assert sid in players, f"Frozen top-20 Dyn SID {sid} missing!"
            d = abs(float(players[sid]["dyn"]) - float(row["dyn_yuh_score"]))
            dyn_diffs.append((row["name"], d))
            assert d <= 0.15, f"Dynasty score mismatch for {row['name']}: got {players[sid]['dyn']} vs {row['dyn_yuh_score']}"
        print(f"  OK  Top-20 Dynasty parity check vs frozen CSV: max_diff={max(d for _, d in dyn_diffs):.4f} (limit <= 0.15)")
    print(f"  OK  invariant checks passed across {len(players)} IDPs (replPpg={payload['replPpg']})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=pathlib.Path, default=HERE / "nflverse-cache")
    ap.add_argument("--players", type=pathlib.Path, default=ROOT / "players-nfl.json")
    ap.add_argument("--hist-dir", type=pathlib.Path, default=ROOT / "historical" / "idp_stats", help="Optional historical/idp_stats folder")
    ap.add_argument("--raw-dir", type=pathlib.Path, default=None, help="Optional snapshot directory for FP/Sleeper JSON")
    ap.add_argument("--freeze-dir", type=pathlib.Path, default=None, help="Optional prospective freeze directory for --self-check")
    ap.add_argument("--week", type=int, default=None)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    raw_dir = args.raw_dir if args.raw_dir and args.raw_dir.exists() else None
    freeze_dir = args.freeze_dir if args.freeze_dir and args.freeze_dir.exists() else None
    payload = build(args.cache, args.players, args.hist_dir, raw_dir, args.week, offline=args.offline)

    if args.self_check:
        run_self_check(payload, freeze_dir)

    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("window.IDP_XSTATS = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    sz = OUT_JS.stat().st_size / 1024.0
    print(f"Wrote {OUT_JS.relative_to(ROOT)} ({sz:.1f} KB, {len(payload['players'])} IDPs, season={payload['season']} W{payload['week']}, throughWeek={payload['throughWeek']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
