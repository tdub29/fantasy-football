"""Independent audit of PR #16 yuH IDP scoring against Sleeper's own matchup points.

Ground truth: players_points from /v1/league/<yuH>/matchups/<week>, every rostered IDP.
Paths under test, imported unchanged from projections/:
  A  build_weekly_rankings.yuh_idp_score on Sleeper's actual weekly stat line
  B  build_idp_dvp.score_row with build_idp_dvp.idp_scoring weights on nflverse weekly rows
  C  the pre-PR DVP mapping (D/ST sack/int/ff also mapped, raw sack yards, FG blocks only,
     no fumble recoveries), rebuilt here to test the double-count claim
Run from the repo root:  python notes/idp-scoring-audit-2026-11-26/audit_idp_scoring.py
"""
import json
import re
import pathlib
import statistics
import sys
import urllib.request

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "projections"))
import build_idp_dvp as dvp  # noqa: E402
import build_weekly_rankings as wr  # noqa: E402

LEAGUE_ID = "1312276370583220224"  # yuH, site/data/fetch_sleeper.py
SEASON, WEEKS = 2026, (9, 10, 11)
IDP_POS = {"LB", "DB", "DL", "CB", "S", "DT", "DE", "NT", "EDGE", "IDL"}
# nflverse weekly parquet; gitignored, so default to the main checkout's cache.
CACHE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else (
    pathlib.Path.home() / "Downloads/Big Projects/Fantasy Football/projections/nflverse-cache")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def norm(name):
    name = re.sub(r"[^a-z ]", "", str(name or "").lower())
    return re.sub(r"(jr|sr|ii|iii|iv|v)", "", name).replace(" ", "")


def old_weights(scoring):
    old_map = dict(dvp.STAT_MAP, sack="def_sacks", int="def_interceptions", ff="def_fumbles_forced")
    old_map.pop("idp_fum_rec"), old_map.pop("idp_fum_ret_yd")
    w = {}
    for k, p in scoring.items():
        if isinstance(p, (int, float)) and p and k in old_map:
            w[old_map[k]] = w.get(old_map[k], 0.0) + float(p)
    return w


def old_score(row, w):
    return sum(dvp._num(row.get(c)) * p for c, p in w.items())


# Sleeper stat key -> how the new DVP path reads nflverse for it (per-term check).
TERM_NFLVERSE = {
    "idp_tkl_solo": lambda r: dvp._num(r.get("def_tackles_solo")),
    "idp_tkl_ast": lambda r: dvp._num(r.get("def_tackle_assists")),
    "idp_tkl_loss": lambda r: dvp._num(r.get("def_tackles_for_loss")),
    "idp_sack": lambda r: dvp._num(r.get("def_sacks")),
    "idp_sack_yd": lambda r: abs(dvp._num(r.get("def_sack_yards"))),
    "idp_qb_hit": lambda r: dvp._num(r.get("def_qb_hits")),
    "idp_int": lambda r: dvp._num(r.get("def_interceptions")),
    "idp_int_ret_yd": lambda r: dvp._num(r.get("def_interception_yards")),
    "idp_pass_def": lambda r: dvp._num(r.get("def_pass_defended")),
    "idp_ff": lambda r: dvp._num(r.get("def_fumbles_forced")),
    "idp_fum_rec": lambda r: dvp._num(r.get("fumble_recovery_opp")),
    "idp_fum_ret_yd": lambda r: dvp._num(r.get("fumble_recovery_yards_opp")),
    "idp_def_td": lambda r: dvp._num(r.get("def_tds")),
    "idp_safe": lambda r: dvp._num(r.get("def_safeties")),
    "idp_blk_kick": lambda r: sum(dvp._num(r.get(c)) for c in ("def_fg_blocks", "def_punt_blocks", "def_pat_blocks")),
}


def summarize(rows, key):
    errs = [abs(r[key] - r["sleeper"]) for r in rows if r.get(key) is not None]
    if not errs:
        return {"n": 0}
    return {"n": len(errs), "exact_share": round(sum(e <= 0.01 for e in errs) / len(errs), 4),
            "mae": round(statistics.mean(errs), 4), "max_abs_err": round(max(errs), 2)}


def main():
    import pandas as pd
    league = get(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}")
    scoring = league["scoring_settings"]
    idp_keys = {k: v for k, v in scoring.items() if k.startswith("idp_")}
    dst_keys = {k: scoring[k] for k in ("sack", "int", "ff", "fum_rec", "safe", "blk_kick", "def_td") if k in scoring}
    new_w, unmapped, _ = dvp.idp_scoring([{"is_idp": True, "scoring": scoring}])
    yuh_w = {k: float(scoring.get(k, v)) for k, v in wr.DEFAULT_YUH_IDP_SCORING.items()}
    o_w = old_weights(scoring)
    players = get("https://api.sleeper.app/v1/players/nfl")
    nfl = pd.read_parquet(CACHE / f"stats_player_week_{SEASON}.parquet")
    nfl = nfl[nfl["season_type"] == "REG"] if "season_type" in nfl else nfl

    rows, term_rows = [], []
    for wk in WEEKS:
        stats = get(f"https://api.sleeper.app/v1/stats/nfl/regular/{SEASON}/{wk}")
        wk_rows = nfl[nfl["week"] == wk].to_dict("records")
        by_gsis = {r["player_id"]: r for r in wk_rows}
        by_name = {}
        for r in wk_rows:
            by_name.setdefault(norm(r.get("player_display_name")), []).append(r)
        seen = {}
        for m in get(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{wk}"):
            for pid, pts in (m.get("players_points") or {}).items():
                seen[pid] = pts
        for pid, pts in seen.items():
            p = players.get(pid) or {}
            pos = p.get("position")
            if pos not in IDP_POS and not (set(p.get("fantasy_positions") or []) & IDP_POS):
                continue
            st = stats.get(pid) or {}
            # Sleeper's dump lacks gsis_id for most IDPs; fall back to a unique name match.
            nv = by_gsis.get((p.get("gsis_id") or "").strip())
            cands = by_name.get(norm(p.get("full_name")), [])
            if nv is None and len(cands) == 1:
                nv = cands[0]
            a = wr.yuh_idp_score(st, yuh_w)
            raw_idp = sum(float(st.get(k) or 0) * v for k, v in idp_keys.items())
            dst_on_player = sum(float(st.get(k) or 0) * v for k, v in dst_keys.items())
            rows.append({
                "week": wk, "player_id": pid, "name": p.get("full_name"), "pos": pos,
                "sleeper": round(float(pts), 2),
                "A_weekly_rankings": a if a is not None else (0.0 if not st else None),
                "raw_idp_all_league_keys": round(raw_idp, 2),
                "raw_idp_plus_dst_keys": round(raw_idp + dst_on_player, 2),
                "B_dvp_new": round(dvp.score_row(nv, new_w), 2) if nv else None,
                "C_dvp_old": round(old_score(nv, o_w), 2) if nv else None,
                "nflverse_matched": nv is not None,
                "sleeper_stats": {k: st[k] for k in sorted(st) if k.startswith("idp_") or k in dst_keys},
            })
            if nv:
                for k, f in TERM_NFLVERSE.items():
                    term_rows.append((k, float(st.get(k) or 0), f(nv)))

    term_check = {}
    for k in TERM_NFLVERSE:
        pairs = [(s, n) for kk, s, n in term_rows if kk == k]
        nz = [(s, n) for s, n in pairs if s or n]
        term_check[k] = {"weight": scoring.get(k), "player_weeks": len(pairs), "nonzero_either": len(nz),
                         "agree": sum(abs(s - n) <= 0.01 for s, n in nz),
                         "sleeper_total": round(sum(s for s, _ in pairs), 1),
                         "nflverse_total": round(sum(n for _, n in pairs), 1),
                         "disagreements": [{"sleeper": s, "nflverse": n} for s, n in nz if abs(s - n) > 0.01][:8]}

    # Rare terms barely occur on yuH rosters, so check them league-wide over W1 to the last closed week.
    rare = ("idp_blk_kick", "idp_fum_rec", "idp_fum_ret_yd", "idp_def_td", "idp_safe", "idp_int_ret_yd", "idp_sack_yd")
    rare_check = {k: {"events": 0, "agree": 0, "disagreements": []} for k in rare}
    nfl_def = nfl[nfl["position_group"].isin(["DL", "LB", "DB"])] if "position_group" in nfl else nfl
    for wk in range(1, max(WEEKS) + 1):
        stats = get(f"https://api.sleeper.app/v1/stats/nfl/regular/{SEASON}/{wk}")
        by_name = {}
        for r in nfl_def[nfl_def["week"] == wk].to_dict("records"):
            by_name.setdefault(norm(r.get("player_display_name")), []).append(r)
        done = set()
        for pid, st in stats.items():
            p = players.get(pid) or {}
            if p.get("position") not in IDP_POS:
                continue
            cands = by_name.get(norm(p.get("full_name")), [])
            if len(cands) != 1:
                continue
            nv = cands[0]
            done.add(id(nv))
            for k in rare:
                s_v, n_v = float(st.get(k) or 0), TERM_NFLVERSE[k](nv)
                if s_v or n_v:
                    ck = rare_check[k]
                    ck["events"] += 1
                    if abs(s_v - n_v) <= 0.01:
                        ck["agree"] += 1
                    else:
                        ck["disagreements"].append({"week": wk, "name": p.get("full_name"), "sleeper": s_v, "nflverse": n_v})

    for r in rows:
        r["gap_A"] = None if r["A_weekly_rankings"] is None else round(r["A_weekly_rankings"] - r["sleeper"], 2)
        r["gap_B"] = None if r["B_dvp_new"] is None else round(r["B_dvp_new"] - r["sleeper"], 2)
    worst = lambda g: [{k: r[k] for k in ("week", "name", "pos", "sleeper", "A_weekly_rankings", "B_dvp_new",
                                          "C_dvp_old", "gap_A", "gap_B", "sleeper_stats")}
                       for r in sorted((r for r in rows if r[g] is not None), key=lambda r: -abs(r[g]))[:10]]
    out = {
        "league_id": LEAGUE_ID, "season": SEASON, "weeks": list(WEEKS),
        "idp_scoring": idp_keys, "dst_keys_in_same_settings": dst_keys,
        "dvp_new_weights": new_w, "dvp_unmapped_idp_keys": unmapped, "dvp_old_weights": o_w,
        "rows_rostered_idp_player_weeks": len(rows),
        "parity": {
            "A_weekly_rankings_yuh_idp_score": summarize(rows, "A_weekly_rankings"),
            "raw_idp_all_league_keys": summarize(rows, "raw_idp_all_league_keys"),
            "raw_idp_plus_dst_keys_hypothesis": summarize(rows, "raw_idp_plus_dst_keys"),
            "B_dvp_new_nflverse": summarize(rows, "B_dvp_new"),
            "C_dvp_old_nflverse": summarize(rows, "C_dvp_old"),
        },
        "players_with_dst_keys_on_individual_line": sum(1 for r in rows if any(
            k in r["sleeper_stats"] for k in dst_keys)),
        "term_check_sleeper_vs_nflverse": term_check,
        "rare_term_check_all_idp_w1_to_last": rare_check,
        "worst10_A": worst("gap_A"), "worst10_B": worst("gap_B"),
        "rows": rows,
    }
    (HERE / "results.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("rows_rostered_idp_player_weeks", "parity",
                                          "players_with_dst_keys_on_individual_line", "dvp_unmapped_idp_keys",
                                          "rare_term_check_all_idp_w1_to_last")}, indent=1))


if __name__ == "__main__":
    main()
