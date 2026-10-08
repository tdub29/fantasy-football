"""Lane target-experiment A1/A2: label-maturity and timestamp audit, and a reproduction of the frozen
prereg (125c50c) on the lane's own store copy (sha 85d9801d).

The inline run (e468360) read a population cache built 2026-10-05 22:52 PDT from an older scratch
store, not from 85d9801d as the prereg says. This rebuilds the population from the lane copy with every
fetch disabled, compares it row by row with that cache, audits label maturity and decision-time
availability, then reruns target_experiment.main() unchanged into repro-85d9801d/. Nothing is tuned.

Reads (read-only): scratch/work.sqlite (a copy of the 85d9801d copy; connect() may add derived tables to
it, never to scratch/prospect.sqlite), scratch/nflverse-cache (stats_player_reg_2008-2025 only), the
inline run's population cache, scratch K0 files, scratch/nfmdd. Writes: scratch/overall_data.pkl
(gitignored), and audit.json plus repro-85d9801d/results.json in the lane notes folder.

    python projections/lanes/parallel-2026-10-06/target-experiment/audit_repro.py
"""
import hashlib
import json
import os
import pathlib
import pickle
import sys

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
WT = HERE.parents[3]
SCR = HERE / "scratch"
NOTES = WT / "notes" / "prospect-research" / "lanes" / "parallel-2026-10-06" / "target-experiment"
OLD_PKL = pathlib.Path(r"C:/Users/TrevorWhite/.claude/jobs/ea66a469/tmp/overall/overall_data.pkl")
OLD_PKL_SHA = "c79d7ab8182722277f78735278b81436a437b2a5058f08b72ec3ec79400c0d6e"
STORE_SHA = "85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0"
MASTER = WT / "projections" / "prospect-db" / "prospect.sqlite"   # the worktree store the lane copied
# First night of each draft (round 1). Every NFLMDD capture and K0 "pre" snapshot must precede it.
DRAFT_DAY = {2019: "2019-04-25", 2020: "2020-04-23", 2021: "2021-04-29", 2022: "2022-04-28",
             2023: "2023-04-27", 2024: "2024-04-25", 2025: "2025-04-24", 2026: "2026-04-23"}

os.environ["PROSPECT_DB"] = str(SCR / "work.sqlite")
os.environ["NFLVERSE_CACHE"] = str(SCR / "nflverse-cache")
os.environ["OVERALL_SCRATCH"] = str(SCR)
os.environ["NFMDD_CSV"] = str(SCR / "nfmdd" / "nfmdd_predraft.csv")
sys.path.insert(0, str(WT / "projections"))
sys.path.insert(0, str(HERE))
import build_prospect_profile as bpp  # noqa: E402
import prospect_db as pdb  # noqa: E402


def _blocked(*a, **k):
    raise RuntimeError("fetch disabled: the lane reads its store copy as frozen")


pdb.ingest = lambda *a, **k: {}   # read the copy as it is; never refresh it from the network
bpp.fetch = _blocked
import target_experiment as te  # noqa: E402  (imports overall_study, then build_prospect_model)

ov, bpm = te.ov, te.bpm
assert pathlib.Path(bpm.CACHE) == SCR / "nflverse-cache" and pathlib.Path(pdb.DB_PATH) == SCR / "work.sqlite"
assert ov.SCR == SCR and te.NFMDD == SCR / "nfmdd" / "nfmdd_predraft.csv"


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def keyed(pop):
    """Drafted rows keyed by (class, pick), UDFAs by gsis_id: both survive a rebuild, sids do not."""
    p = pop.copy()
    dk = "d:" + p.draft_year.astype(int).astype(str) + ":" + p.pick.astype(int).astype(str)
    p["key"] = np.where(p.udfa.astype(bool), "u:" + p.gsis_id.astype(str), dk)
    assert p.key.is_unique, "rebuild key not unique"
    return p.set_index("key")


def same(a, b):
    a, b = a.align(b)
    if a.dtype.kind in "fiub" and b.dtype.kind in "fiub":
        x, y = a.astype(float), b.astype(float)
        return (np.isclose(x, y, rtol=0, atol=1e-9) | (x.isna() & y.isna()))
    return (a.astype(str) == b.astype(str)) | (a.isna() & b.isna())


def compare(old, new):
    o, n = keyed(old[old.draft_year.between(2008, 2023)]), keyed(new[new.draft_year.between(2008, 2023)])
    show = ["pfr_player_name", "draft_year", "pos", "pick", "udfa"]
    feats = sorted({c for p in ov.POS for c in ov.feat_list(p)})
    cols = ([f"{k}_{f}" for f in ov.FMTS for k in ("vor3", "peak3", "vor4")]
            + ["pos", "pick", "player_id", "link_method", "gsis_id", "weight", "cwt", "ros_weight"] + feats)
    common = o.index.intersection(n.index)
    out = {"rows_old": int(len(o)), "rows_new": int(len(n)), "common": int(len(common)),
           "drafted_old": int((~o.udfa.astype(bool)).sum()), "drafted_new": int((~n.udfa.astype(bool)).sum()),
           "only_old": o.loc[o.index.difference(n.index), show].astype(str).to_dict("records"),
           "only_new": n.loc[n.index.difference(o.index), show].astype(str).to_dict("records"),
           "mismatch": {}, "examples": {}}
    for c in cols:
        if c not in o or c not in n:
            out["mismatch"][c] = "absent in " + ("old" if c not in o else "new")
            continue
        ok = same(o.loc[common, c], n.loc[common, c])
        bad = ok.index[~ok.to_numpy()]
        out["mismatch"][c] = int(len(bad))
        if len(bad):
            ex = pd.DataFrame({"name": o.loc[bad, "pfr_player_name"], "class": o.loc[bad, "draft_year"],
                               "udfa": o.loc[bad, "udfa"], "old": o.loc[bad, c], "new": n.loc[bad, c]})
            out["examples"][c] = ex.head(25).astype(str).to_dict("records")
    return out


def season_audit():
    rows = []
    for y in range(2008, bpm.LAST_NFL + 1):
        p = SCR / "nflverse-cache" / f"stats_player_reg_{y}.parquet"
        s = pd.read_parquet(p)
        pl = s[s.player_id.notna()]
        rows.append({"season": y, "sha256": sha(p), "rows": int(len(s)),
                     "season_type": s.season_type.value_counts().to_dict() if "season_type" in s else None,
                     "null_id_rows": int(s.player_id.isna().sum()),
                     "null_id_games": s.loc[s.player_id.isna(), "games"].tolist(),
                     "teams": int(pl.recent_team.nunique()), "max_games": int(pl.games.max()),
                     "ppr_total": round(float(pl.fantasy_points_ppr.sum()), 1)})
    t = pd.DataFrame(rows)
    exp_games = np.where(t.season >= 2021, 17, 16)
    med = t.ppr_total.median()
    t["complete"] = (t.teams == 32) & (t.max_games == exp_games) & (t.ppr_total.between(0.85 * med, 1.15 * med))
    return t


def horizon_table(pop):
    """Per scored class Y and embargo, label seasons of the training classes not yet played at draft Y."""
    dr = pop[~pop.udfa.astype(bool)]
    n = dr.groupby("draft_year").size()
    rows = []
    for Y in ov.SCORED:
        r = {"class": Y}
        for emb in (1, 2, 3):
            cls = [c for c in range(2008, Y - emb + 1)]
            fut = {c: sum(1 for s in range(c, c + 3) if s >= Y) for c in cls}
            r[f"emb{emb}_future_label_seasons"] = int(sum(fut.values()))
            r[f"emb{emb}_rows_with_future_labels"] = int(sum(n.get(c, 0) for c, k in fut.items() if k))
            r[f"emb{emb}_train_rows"] = int(sum(n.get(c, 0) for c in cls))
        rows.append(r)
    mat = [{"class": c, "label_seasons": f"{c}-{c + 2}", "mature": bool(c + 2 <= bpm.LAST_NFL)}
           for c in range(2008, 2027)]
    return rows, mat


def vintage_checks(pop, D):
    dr = pop[~pop.udfa.astype(bool) & pop.draft_year.between(2008, 2023)].copy()
    out = {"cutoff_is_year_minus_1": bool((dr.cutoff == dr.draft_year - 1).all())}
    for c in ("season_final", "qb_season_final"):
        if c in dr:
            v = dr[dr[c].notna()]
            out[f"{c}_after_cutoff"] = int((v[c] > v.cutoff).sum())
    # Roster weight is the fallback when no combine weight exists; its roster row must predate the draft.
    ros = bpm.load_rosters()
    last = ros.dropna(subset=["athlete_id"]).groupby("athlete_id").season.max()
    fb = dr[dr.cwt.isna() & dr.ros_weight.notna() & dr.player_id.notna()]
    ls = fb.player_id.astype(int).map(last)
    out["roster_weight_rows"] = int(len(fb))
    out["roster_weight_from_draft_year_or_later"] = int((ls >= fb.draft_year).sum())
    out["roster_weight_late_examples"] = fb.loc[ls >= fb.draft_year, ["pfr_player_name", "draft_year", "pos", "pick"]].assign(
        last_roster=ls[ls >= fb.draft_year]).head(20).astype(str).to_dict("records")
    # draft_age is age0 + draft_year - hs_class - 0.35 for every training row (DOB withheld), so age0 is a
    # constant shift that training-window standardization removes exactly.
    v = dr.dropna(subset=["draft_age", "hs_class"])
    off = v.draft_age - (v.draft_year - v.hs_class)
    out["draft_age_offset"] = {"min": float(off.min()), "max": float(off.max()), "age0_minus_0.35": D["age0"] - 0.35,
                               "n": int(len(v))}
    # Link availability: the unlinked flag enters H2's design; the link uses ESPN ids from the CURRENT
    # nflverse players file, so check whether being unlinked carries outcome beyond pick.
    dr["band"] = pd.cut(dr.pick, [0, 32, 64, 100, 150, 300], labels=["1-32", "33-64", "65-100", "101-150", "151+"])
    g = dr.assign(linked=dr.player_id.notna(), hit=dr.vor3_F1 > 0).groupby(["band", "linked"], observed=True).hit.agg(["mean", "size"])
    out["hit_rate_by_pick_band_and_link"] = {f"{b}|{'linked' if l else 'unlinked'}": {"hit": round(float(r["mean"]), 3), "n": int(r["size"])}
                                             for (b, l), r in g.iterrows()}
    out["link_rate_by_class"] = dr.groupby("draft_year").player_id.apply(lambda s: round(float(s.notna().mean()), 3)).to_dict()
    out["link_method_counts"] = dr.link_method.value_counts().to_dict()
    return out


def linkage_and_duplicates(pop):
    draft = bpm.read_src("nfl_draft_pick", "draft_picks.parquet")
    dp = draft[(draft.season.between(2008, 2023)) & draft.pick.notna()]
    dr = pop[~pop.udfa.astype(bool) & pop.draft_year.between(2008, 2023)]
    by = pd.DataFrame({"draft_picks_qbrbwrte": dp[dp.position.isin(ov.POS)].groupby("season").size(),
                       "draft_picks_fb": dp[dp.position.eq("FB")].groupby("season").size(),
                       "population_drafted": dr.groupby("draft_year").size(),
                       "with_gsis": dr.groupby("draft_year").gsis_id.apply(lambda s: int(s.notna().sum()))}).fillna(0).astype(int)
    nog = dr[dr.gsis_id.isna()]
    return {"per_class": by.to_dict("index"),
            "drafted_equals_draft_picks": bool((by.draft_picks_qbrbwrte == by.population_drafted).all()),
            "missing_gsis_total": int(len(nog)),
            "missing_gsis_top100": nog[nog.pick <= 100][["pfr_player_name", "draft_year", "pos", "pick"]].astype(str).to_dict("records"),
            "dup_gsis": int(dr.gsis_id.dropna().duplicated().sum()),
            "dup_class_pick": int(dr.duplicated(["draft_year", "pick"]).sum()),
            "dup_pfr": int(dr.pfr_player_id.dropna().duplicated().sum()),
            "dup_sid": int(pop.sid.duplicated().sum()),
            "udfa_rows_2008_2023": int(pop[pop.udfa.astype(bool) & pop.draft_year.between(2008, 2023)].shape[0])}


def formats(pop, D):
    dr = pop[~pop.udfa.astype(bool) & pop.draft_year.between(2008, 2023)]
    out = {"slots": D["slots"], "p75": {}, "zero_share_all": {}, "repl_mean_2008_2025": {}}
    for f in ov.FMTS:
        y = dr[f"vor3_{f}"]
        out["p75"][f] = float(y.quantile(.75))
        out["zero_share_all"][f] = round(float((y == 0).mean()), 4)
        out["repl_mean_2008_2025"][f] = D["repl"][f].mean().round(2).to_dict()
    out["share_by_class_F1"] = dr.groupby("draft_year").vor3_F1.apply(lambda s: round(float((s > 0).mean()), 3)).to_dict()
    return out


def timestamps():
    prov = json.loads((SCR / "nfmdd" / "nfmdd_provenance.json").read_text())
    nf = {int(p["year"]): {"capture": p["capture"][:8], "draft": DRAFT_DAY[int(p["year"])],
                           "days_before": (pd.Timestamp(DRAFT_DAY[int(p["year"])]) - pd.Timestamp(p["capture"][:8])).days}
          for p in prov}
    k0 = {}
    for Y, (pre, post) in ov.K0_SNAP.items():
        d = lambda s: pd.Timestamp(s.split(":")[1] if s.startswith("d:") else s.split(":")[1][:4] + "-" + s.split(":")[1][4:6] + "-" + s.split(":")[1][6:])
        k0[Y] = {"pre": str(d(pre).date()), "post": str(d(post).date()), "draft": DRAFT_DAY[Y],
                 "pre_before_draft": bool(d(pre) < pd.Timestamp(DRAFT_DAY[Y])), "post_after_draft": bool(d(post) > pd.Timestamp(DRAFT_DAY[Y]))}
    return {"nfmdd": nf, "k0": k0}


def repro_compare(a, b):
    def flat(x, p=""):
        if isinstance(x, dict):
            r = {}
            for k, v in x.items():
                r.update(flat(v, f"{p}.{k}" if p else str(k)))
            return r
        if isinstance(x, list):
            r = {}
            for i, v in enumerate(x):
                r.update(flat(v, f"{p}[{i}]"))
            return r
        return {p: x}
    fa, fb = flat(a), flat(b)
    diffs = {}
    for k in sorted(set(fa) | set(fb)):
        x, y = fa.get(k), fb.get(k)
        try:
            eq = (x == y) or (x is not None and y is not None and abs(float(x) - float(y)) < 1e-9)
        except (TypeError, ValueError):
            eq = x == y
        if not eq:
            diffs[k] = [x, y]
    return {"n_keys": len(set(fa) | set(fb)), "n_diff": len(diffs), "diffs": dict(list(diffs.items())[:200])}


def main():
    A = {"store_sha_expected": STORE_SHA, "env": {k: os.environ[k] for k in ("PROSPECT_DB", "NFLVERSE_CACHE", "OVERALL_SCRATCH", "NFMDD_CSV")}}
    pk = SCR / "overall_data.pkl"
    if not pk.exists():
        A["work_db_sha_before_build"] = sha(SCR / "work.sqlite")
        assert A["work_db_sha_before_build"] == STORE_SHA, "work copy is not 85d9801d"
    Dn = ov.load()
    A["new_pickle_sha256"] = sha(pk)
    assert sha(OLD_PKL) == OLD_PKL_SHA, "inline run's population cache changed"
    Do = pickle.loads(OLD_PKL.read_bytes())
    st = lambda p: pd.Timestamp(p.stat().st_mtime, unit="s", tz="UTC").tz_convert("America/Los_Angeles").isoformat()
    A["provenance"] = {"old_pickle": {"path": str(OLD_PKL), "sha256": OLD_PKL_SHA, "mtime": st(OLD_PKL)},
                       "old_scratch_store_mtime": st(OLD_PKL.parent / "prospect.sqlite") if (OLD_PKL.parent / "prospect.sqlite").exists() else None,
                       "master_store_mtime": st(MASTER) if MASTER.exists() else None,
                       "age0_old": Do["age0"], "age0_new": Dn["age0"]}
    A["population_compare"] = compare(Do["pop"], Dn["pop"])
    A["repl_max_abs_diff"] = {f: float((Do["repl"][f] - Dn["repl"][f]).abs().max().max()) for f in ov.FMTS}
    pop = Dn["pop"]
    assert bpm.LAST_NFL == 2025 and pop.loc[pop.draft_year > 2023, "vor3_F1"].isna().all()
    seasons = season_audit()
    A["seasons"] = seasons.to_dict("records")
    A["all_seasons_complete"] = bool(seasons.complete.all())
    A["horizon"], A["maturity"] = horizon_table(pop)
    A["vintage"] = vintage_checks(pop, Dn)
    A["linkage"] = linkage_and_duplicates(pop)
    A["formats"] = formats(pop, Dn)
    A["timestamps"] = timestamps()
    (NOTES / "audit.json").write_text(json.dumps(A, indent=1, default=str), encoding="utf8")
    print("audit.json written; population compare:", {k: A["population_compare"][k] for k in ("rows_old", "rows_new", "common")})

    # A2: the frozen script, unchanged, on the rebuilt population.
    te.OUT = NOTES / "repro-85d9801d"
    te.OUT.mkdir(exist_ok=True)
    te.main()
    orig = json.loads((NOTES / "results.json").read_text())
    rep = json.loads((te.OUT / "results.json").read_text())
    A["repro_compare"] = repro_compare(orig, rep)
    A["repro_verdicts"] = {"original": [(r["hypothesis"], r["verdict"]) for r in orig["ledger"]],
                           "repro": [(r["hypothesis"], r["verdict"]) for r in rep["ledger"]]}
    (NOTES / "audit.json").write_text(json.dumps(A, indent=1, default=str), encoding="utf8")
    print(json.dumps(A["repro_verdicts"]), "diff keys:", A["repro_compare"]["n_diff"])


if __name__ == "__main__":
    main()
