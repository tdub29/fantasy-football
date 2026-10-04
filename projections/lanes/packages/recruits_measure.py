"""What ESPN recruiting records (espn_recruits.py) add over the store's 247 stars, on population B.

The 247 side reproduces `build_prospect_model.player_bio`'s join (normalized name + a team he
played for, `bpp.norm_name`, max stars), read from a store copy. The ESPN side joins by id:
recruit `athlete.alternateId` = ESPN college athlete id = population B `player_id`.

Denominator: population B rows (player_id > 0) whose first season on file is a fetched ESPN class
year (complete classes only). Reports coverage, fill where 247 is missing, missingness by outcome
(an outcome-dependent presence rate would leak), and agreement between ESPN grade and 247 stars.

    python projections/lanes/packages/recruits_measure.py <store copy> <pop_b.parquet> <year> [year ...]
"""
import json
import os
import pathlib
import sqlite3
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import build_prospect_profile as bpp  # noqa: E402  (norm_name only)

SCR = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp"))


def espn(years):
    rows = []
    for y in years:
        refs = json.loads((SCR / "espn_recruits" / f"refs_{y}.json").read_text())
        recs = {}
        for line in (SCR / "espn_recruits" / f"raw_{y}.jsonl").open(encoding="utf-8"):
            r = json.loads(line)
            recs[r["_id"]] = r
        assert len(recs) >= len(refs), f"class {y} incomplete: {len(recs)} of {len(refs)}"
        for r in recs.values():
            a = r.get("athlete") or {}
            at = {x.get("name"): x.get("value") for x in r.get("attributes") or []}
            rows.append({"recruit_id": int(r["_id"]), "rclass": r.get("recruitingClass"), "player_id": pd.to_numeric(a.get("alternateId"), errors="coerce"),
                         "name": a.get("fullName"), "pos": (a.get("position") or {}).get("abbreviation"), "grade": r.get("grade"),
                         "espn_stars": at.get("stars"), "espn_rank": at.get("overallRank") or at.get("rank"),
                         "pos_rank": at.get("positionRank"), "status": (r.get("status") or {}).get("description"),
                         "attr_names": ",".join(sorted(k for k in at if k)),
                         # high-school testing; 99 is ESPN's placeholder for "not tested"
                         **{k: (None if at.get(k) in (None, 99.0) else at.get(k))
                            for k in ("fortyYrdDash", "twentyYrdShuttle", "verticalJump", "threeConeDrill")}})
    return pd.DataFrame(rows)


def stars_247(con):
    """player_bio's join, from the store copy: max 247 stars per college id."""
    ps = pd.concat([pd.read_sql(f"SELECT player_id, {n} AS name, team_id FROM {t}", con) for t, n in
                    (("cfb_receiving", "receiver_player_name"), ("cfb_rushing", "rusher_player_name"), ("cfb_passing", "passer_player_name"))])
    ros = pd.read_sql("SELECT athlete_id AS player_id, full_name AS name, team_id FROM cfb_roster WHERE athlete_id IS NOT NULL", con)
    names = pd.concat([ps, ros])
    names["team_id"] = pd.to_numeric(names.team_id, errors="coerce")   # TEXT in some tables, INTEGER in cfb_roster (as player_bio does)
    names["_k"] = names["name"].map(bpp.norm_name)
    rec = pd.read_sql("SELECT season, team_id, player_name, stars FROM cfb_recruit", con)
    rec["_k"] = rec.player_name.map(bpp.norm_name)
    rec["team_id"] = pd.to_numeric(rec.team_id, errors="coerce")
    rk = rec.groupby(["_k", "team_id"]).agg(rclass=("season", "min"), stars=("stars", "max")).reset_index()
    m = names.drop_duplicates(["player_id", "_k", "team_id"]).merge(rk, on=["_k", "team_id"])
    out = m.groupby("player_id").agg(rclass247=("rclass", "min"), stars247=("stars", "max"))
    first = pd.concat([ps[["player_id"]].assign(src="s"), ros[["player_id"]]]).player_id
    seasons = pd.concat([pd.read_sql(f"SELECT player_id, season FROM {t}", con) for t in ("cfb_receiving", "cfb_rushing", "cfb_passing")]
                        + [pd.read_sql("SELECT athlete_id AS player_id, season FROM cfb_roster", con)])
    out = out.reindex(first.dropna().unique())
    out["first_season"] = seasons.groupby("player_id").season.min()
    return out


def main():
    store, popb, years = sys.argv[1], sys.argv[2], [int(a) for a in sys.argv[3:]]
    con = sqlite3.connect(store)
    e = espn(years)
    res = {"espn_records": int(len(e)), "by_class": {}}
    for y, g in e.groupby("rclass"):
        res["by_class"][int(y)] = {"records": int(len(g)), "alternateId": int(g.player_id.gt(0).sum()),
                                   "grade_gt0": int(g.grade.fillna(0).gt(0).sum()), "stars_attr": int(g.espn_stars.notna().sum())}
    print("attribute sets:", e.attr_names.value_counts().head(6).to_dict())
    print(json.dumps(res["by_class"], indent=0))
    s = stars_247(con)
    b = pd.read_parquet(popb)
    b = b[b.player_id > 0].join(s, on="player_id")
    e1 = e[e.player_id > 0].sort_values("grade", ascending=False).drop_duplicates("player_id").set_index("player_id")
    b = b.join(e1[["rclass", "grade", "espn_stars", "pos", "pos_rank", "fortyYrdDash", "twentyYrdShuttle", "verticalJump"]], on="player_id")
    b["hs_forty"] = b.fortyYrdDash.notna()
    b["has247"] = b.stars247.notna()
    b["has_espn"] = b.grade.notna()
    b["espn_graded"] = b.grade.fillna(0) > 0
    d = b[b.first_season.isin(years)].copy()
    d["grp"] = d.drafted.eq(1).map({True: "drafted", False: "undrafted"})
    t = d.groupby("first_season").agg(rows=("sid", "size"), has247=("has247", "mean"), espn=("has_espn", "mean"),
                                      espn_graded=("espn_graded", "mean"),
                                      fill=("espn_graded", lambda v: v[~d.loc[v.index, "has247"]].mean()),
                                      either=("has247", lambda v: (v | d.loc[v.index, "espn_graded"]).mean()))
    print(t.round(3).to_string())
    print("by outcome group:")
    print(d.groupby("grp")[["has247", "has_espn", "espn_graded", "hs_forty"]].mean().round(3).to_string())
    print("HS forty on file by position:", d.groupby("cpos").hs_forty.mean().round(3).to_dict())
    res["hs_forty"] = int(d.hs_forty.sum())
    res["hs_forty_by_group"] = d.groupby("grp").hs_forty.mean().round(3).to_dict()
    both = d[d.has247 & d.espn_graded]
    res["popb_rows"] = int(len(d))
    res["has247"] = int(d.has247.sum())
    res["espn_graded"] = int(d.espn_graded.sum())
    res["fill_where_247_missing"] = int((d.espn_graded & ~d.has247).sum())
    res["missing_247"] = int((~d.has247).sum())
    res["either"] = int((d.has247 | d.espn_graded).sum())
    res["spearman_grade_vs_247stars"] = round(float(both.grade.corr(both.stars247, method="spearman")), 3) if len(both) > 10 else None
    res["n_both"] = int(len(both))
    res["presence_by_group"] = d.groupby("grp")[["has247", "espn_graded"]].mean().round(3).to_dict()
    # Descriptive only, not a model test: univariate AUC for "drafted" (not the model's hit label).
    from sklearn.metrics import roc_auc_score
    y = d.drafted.eq(1).astype(int)
    only = d.espn_graded & ~d.has247
    res["auc_both_rated"] = {"stars247": round(float(roc_auc_score(y[both.index], both.stars247)), 3),
                             "espn_grade": round(float(roc_auc_score(y[both.index], both.grade)), 3)}
    res["auc_espn_only_rows"] = round(float(roc_auc_score(y[only], d.grade[only])), 3)
    res["drafted_rate_espn_only_vs_neither"] = [round(float(y[only].mean()), 3),
                                                round(float(y[~d.espn_graded & ~d.has247].mean()), 3)]
    print(json.dumps({k: v for k, v in res.items() if k != "by_class"}, indent=1))
    d.to_parquet(SCR / "recruits_measure_rows.parquet", index=False)
    (SCR / "recruits_measure.json").write_text(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
