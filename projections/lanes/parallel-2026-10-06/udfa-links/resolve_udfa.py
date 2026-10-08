"""UDFA-links lane: deterministic college resolver on top of bpm.link_college, plus before/after audit.
No scoring. Reads the lane's store copy (PROSPECT_DB) and the ESPN NFL->college crosswalk cached by the
data lane (UDFA_REUSE dir). Writes only next to this file: out/udfa_links.csv, out/audit.json.

Added rules, each run only on rows the base linker left unlinked, and each must give ONE unused id:
  espn_xwalk    ESPN's own collegeAthlete id for the NFL athlete, college seasons ending before the rookie year
  multi_school  base name+school rule (unique id) retried per school of an "A; B" college string
  gap_window    exact name key + school sim >= 0.8 + last college season within rookie-5..rookie-1

    PROSPECT_DB=.../udfa.sqlite python projections/lanes/parallel-2026-10-06/udfa-links/resolve_udfa.py
"""
import json
import os
import pathlib
import sys

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2]))
import build_prospect_model as bpm  # noqa: E402

REUSE = pathlib.Path(os.environ.get("UDFA_REUSE", r"C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/reuse"))
POS = ("QB", "RB", "WR", "TE", "FB")
NEW = ("espn_xwalk", "multi_school", "gap_window")


def college_last(ps):
    last = ps.sort_values("season").groupby("player_id").agg(last_season=("season", "max"), team=("pos_team", "last"),
                                                             name=("name", "last"))
    last["_k"] = last.name.map(bpm.name_key)
    return last


def schools(s):
    return [x.strip() for x in str(s if isinstance(s, str) else "").split(";") if x.strip()]


def resolve(rows, ps, xw, last):
    """rows: season, pfr_player_name, college, espn_id, gsis_id. Returns (player_id, method) Series."""
    lm = {}
    pid = bpm.link_college(rows, rows.espn_id, ps, lm).reindex(rows.index).astype(object)
    meth = pd.Series(lm, dtype=object).reindex(rows.index).fillna("none")
    used = set(int(x) for x in pid.dropna())

    def take(i, c, m):
        if c not in used:
            pid[i], meth[i] = c, m
            used.add(c)

    cid = rows.gsis_id.map(xw)
    for i in rows.index[pid.isna()]:
        c = cid[i]
        if pd.notna(c) and int(c) in last.index and last.at[int(c), "last_season"] < rows.at[i, "season"]:
            take(i, int(c), "espn_xwalk")
    by_key = last.reset_index().groupby("_k")["player_id"].agg(list)

    def pick(i, lo, sch, bar):
        yr = rows.at[i, "season"]
        c = [x for x in by_key.get(bpm.name_key(rows.at[i, "pfr_player_name"]), [])
             if yr - lo <= last.at[x, "last_season"] <= yr - 1
             and max((bpm.school_sim(s, last.at[x, "team"]) for s in sch), default=0) >= bar]
        return int(c[0]) if len(c) == 1 else None

    for i in rows.index[pid.isna()]:   # the base name_school rule, once per school of "A; B"
        sch = schools(rows.at[i, "college"])
        for s in sch if len(sch) > 1 else []:
            c = pick(i, 2, [s], 0.5)
            if c is not None:
                take(i, c, "multi_school")
                break
    for i in rows.index[pid.isna()]:
        c = pick(i, 5, schools(rows.at[i, "college"]), 0.8)
        if c is not None:
            take(i, c, "gap_window")
    return pid, meth


def outcome(pl):
    st = pd.concat([bpm.read_src("nfl_player_season", f"stats_player_reg_{y}.parquet",
                                 ["player_id", "season", "season_type", "fantasy_points_ppr"])
                    for y in range(2008, bpm.LAST_NFL + 1)])
    st = st[st.season_type == "REG"].merge(pl[["gsis_id", "rookie_season"]], left_on="player_id", right_on="gsis_id")
    st = st[st.season < st.rookie_season + 3]
    return st.groupby("gsis_id").fantasy_points_ppr.sum()


def main():
    import time
    t0 = time.time()
    ps = bpm.load_college()
    print(f"college loaded {time.time() - t0:.0f}s", flush=True)
    last = college_last(ps)
    xw = pd.read_parquet(REUSE / "espn_nfl_college_xwalk.parquet").dropna(subset=["college_athlete_id"])
    xw = xw.drop_duplicates("gsis_id").set_index("gsis_id").college_athlete_id.astype(int)
    pl = bpm.read_src("nfl_player", "players.parquet")
    dr = bpm.read_src("nfl_draft_pick", "draft_picks.parquet")
    u = pl[pl.draft_pick.isna() & ~pl.gsis_id.isin(dr.gsis_id.dropna()) & pl.position.isin(POS)
           & pl.rookie_season.between(2008, 2023)].copy()
    u = u.assign(season=u.rookie_season.astype(int), pfr_player_name=u.display_name, college=u.college_name)
    u.index = range(len(u))
    lm = {}
    base = bpm.link_college(u, u.espn_id, ps, lm).reindex(u.index)
    u["base_method"] = pd.Series(lm, dtype=object).reindex(u.index).fillna("none")
    u["player_id"], u["method"] = resolve(u, ps, xw, last)
    assert (base.dropna().astype(int) == u.player_id[base.notna()].astype(int)).all(), "new rules moved a base link"
    u["ppr3"] = u.gsis_id.map(outcome(pl)).fillna(0.0)
    u["cohort"] = pd.cut(u.season, [2007, 2011, 2015, 2019, 2023], labels=["2008-11", "2012-15", "2016-19", "2020-23"])

    # Precision: drafted rows the base linker tied by ESPN id; blank the id so only name/xwalk rules can fire.
    d = dr[dr.season.between(2008, 2023) & dr.position.isin(POS[:4]) & dr.pick.notna()].merge(
        pl[["gsis_id", "espn_id"]], on="gsis_id", how="left")
    d.index = range(len(d))
    dm = {}
    truth = bpm.link_college(d, d.espn_id, ps, dm).reindex(d.index)
    known = d[pd.Series(dm, dtype=object).reindex(d.index).eq("espn_id")]
    bp, bm = resolve(known.assign(espn_id=np.nan), ps, xw, last)
    prec = {m: f"{int(((bm == m) & (bp.astype(float) == truth[known.index].astype(float))).sum())}/{int((bm == m).sum())}"
            for m in ("name_school", "name_prefix") + NEW}

    lk = u.player_id.notna()
    R = {
        "store": os.environ.get("PROSPECT_DB"),
        "udfa_candidates": len(u),
        "linked_before": int(base.notna().sum()), "linked_after": int(lk.sum()),
        "by_method": u.method.value_counts().to_dict(),
        "duplicate_ids_after": int(u.player_id.dropna().astype(int).duplicated().sum()),
        "ppr3_total": round(u.ppr3.sum(), 1), "ppr3_linked_before": round(u.ppr3[base.notna()].sum(), 1),
        "ppr3_linked_after": round(u.ppr3[lk].sum(), 1),
        "by_cohort_pos": {f"{c}|{p}": f"{int(g.player_id.notna().sum())}/{len(g)} (base {int((g.base_method != 'none').sum())})"
                          for (c, p), g in u.groupby(["cohort", u.position.replace({"FB": "RB"})], observed=True)},
        "precision_id_known_drafted": {"rows": len(known), "correct/fired": prec},
        "newly_linked": u[(u.method != u.base_method) & lk].sort_values("ppr3", ascending=False)[
            ["display_name", "season", "position", "college_name", "method", "player_id", "ppr3"]].head(40).to_dict("records"),
        "still_unlinked_top": u[~lk].sort_values("ppr3", ascending=False)[
            ["display_name", "season", "position", "college_name", "ppr3"]].head(25).to_dict("records"),
    }
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    u[["gsis_id", "display_name", "season", "position", "college_name", "espn_id", "base_method", "method", "player_id",
       "ppr3"]].to_csv(out / "udfa_links.csv", index=False)
    (out / "audit.json").write_text(json.dumps(R, indent=1, default=str))
    print(json.dumps({k: R[k] for k in list(R)[:9]} | {"prec": R["precision_id_known_drafted"]}, default=str))


if __name__ == "__main__":
    main()
