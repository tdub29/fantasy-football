"""CFBD-derived college rosters from the cfbfastR-data repo (`rosters/parquet/cfb_rosters_<y>.parquet`,
2004+, refreshed daily per its README; cfbfastR's own `load_cfb_rosters()` needs a CFBD key, these
committed files do not). Keyed on the ESPN athlete id (CFBD-only players carry negative ids).

Measures, against a population B snapshot and the lane copy of the store:
  1. positions for the pre-2014 classes, where ESPN rosters list every position as "-" and the
     population infers it (usage, then recruit position and weight);
  2. how often the inference agrees with the observed CFBD position;
  3. CFBD vs ESPN position agreement where both exist (2015+), to grade CFBD itself;
  4. whether CFBD `recruit_ids` join to `cfb_recruit.recruit_id` (an id join for 247 stars).

No licence file in cfbfastR-data (checked 2026-10-04); CFBD data, local research use only.

    python projections/lanes/packages/cfbd_rosters.py <pop_b.parquet> <store copy>
"""
import hashlib
import json
import os
import pathlib
import sqlite3
import sys
import urllib.request

import pandas as pd

OUT = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp")) / "cfbd_ros"
RAW = "https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/rosters/parquet/cfb_rosters_{}.parquet"
YEARS = range(2004, 2020)
# CFBD position -> population position; FB stays FB (not RB) because the population treats it apart
SKILL = {"QB": "QB", "RB": "RB", "TB": "RB", "WR": "WR", "TE": "TE"}


def fetch():
    OUT.mkdir(parents=True, exist_ok=True)
    man = {}
    for y in YEARS:
        p = OUT / f"cfb_rosters_{y}.parquet"
        if not p.exists():
            urllib.request.urlretrieve(RAW.format(y), p.with_suffix(".part"))
            p.with_suffix(".part").replace(p)
        man[p.name] = {"url": RAW.format(y), "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
    (OUT / "manifest.json").write_text(json.dumps(man, indent=1))
    return pd.concat([pd.read_parquet(OUT / f"cfb_rosters_{y}.parquet") for y in YEARS], ignore_index=True)


def main():
    pop, store = sys.argv[1], sys.argv[2]
    cf = fetch()
    cf["athlete_id"] = pd.to_numeric(cf.athlete_id, errors="coerce")
    cf = cf[cf.athlete_id > 0]
    print("CFBD roster rows by season (positive ESPN ids):", cf.groupby("season").size().to_dict())

    b = pd.read_parquet(pop)
    b = b[b.player_id > 0]
    # the latest CFBD position on file up to his exit season
    c = cf[["athlete_id", "season", "position"]].dropna().sort_values("season")
    m = b.merge(c, left_on="player_id", right_on="athlete_id", how="left")
    m = m[m.season.isna() | (m.season <= m.exit)]
    last = m.dropna(subset=["position"]).groupby("sid").position.last()
    b["cfbd_pos"] = b.sid.map(last)
    b["cfbd_skill"] = b.cfbd_pos.map(SKILL)
    pre = b[b.cls.between(2008, 2014)]
    res = {"pre2014_rows": int(len(pre)),
           "with_cfbd_position": int(pre.cfbd_pos.notna().sum()),
           "cfbd_position_is_skill": int(pre.cfbd_skill.notna().sum()),
           "agree_with_inferred": int((pre.cfbd_skill == pre.cpos).sum())}
    by = pre.groupby("cls").agg(rows=("sid", "size"), cfbd=("cfbd_pos", lambda s: s.notna().mean()),
                                agree=("cpos", lambda s: (s == pre.loc[s.index, "cfbd_skill"]).sum()
                                       / max(pre.loc[s.index, "cfbd_pos"].notna().sum(), 1)))
    print(by.round(3).to_string())
    dis = pre[pre.cfbd_pos.notna() & (pre.cfbd_skill != pre.cpos)]
    print("inferred vs CFBD, disagreements:")
    print(pd.crosstab(dis.cpos, dis.cfbd_pos).to_string())
    for g, d in pre.groupby(pre.drafted.eq(1)):
        res[f"agree_rate_{'drafted' if g else 'undrafted'}"] = round(
            float((d.cfbd_skill == d.cpos).sum() / max(d.cfbd_pos.notna().sum(), 1)), 3)

    res["with_real_cfbd_position"] = int((pre.cfbd_pos.notna() & (pre.cfbd_pos != "?")).sum())   # "?" = CFBD unknown

    con = sqlite3.connect(store)
    # Grade both against the NFL position (draft position, else first NFL roster position), NFL
    # QB/RB/WR/TE only, with and without CFBD's "?" rows.
    dp = pd.read_sql("SELECT gsis_id, position FROM nfl_draft_pick WHERE gsis_id IS NOT NULL", con
                     ).drop_duplicates("gsis_id").set_index("gsis_id").position
    ro = pd.read_sql("SELECT gsis_id, position FROM nfl_roster ORDER BY season, source_key, src_row", con)
    first = ro.dropna().drop_duplicates("gsis_id").set_index("gsis_id").position
    b["nfl_pos"] = b.gsis_id.map(dp).fillna(b.gsis_id.map(first))
    for lo, hi, lab in ((2008, 2014, "pre2014"), (2016, 2020, "2016_20")):
        g = b[b.cls.between(lo, hi) & b.cfbd_pos.notna() & b.nfl_pos.isin(["QB", "RB", "WR", "TE"])]
        for tag, h in (("all", g), ("excl_unknown", g[g.cfbd_pos != "?"])):
            dis = h[h.cpos != h.cfbd_skill]
            res[f"nfl_grade_{lab}_{tag}"] = {"n": int(len(h)), "population_pos": round(float((h.cpos == h.nfl_pos).mean()), 3),
                                             "cfbd": round(float((h.cfbd_skill == h.nfl_pos).mean()), 3),
                                             "disagree": int(len(dis)), "population_right": int((dis.cpos == dis.nfl_pos).sum()),
                                             "cfbd_right": int((dis.cfbd_skill == dis.nfl_pos).sum())}

    es = pd.read_sql("SELECT season, athlete_id, position_abbreviation AS espn_pos FROM cfb_roster "
                     "WHERE season BETWEEN 2015 AND 2019 AND position_abbreviation NOT IN ('-', '')", con)
    v = es.merge(cf[["season", "athlete_id", "position"]], on=["season", "athlete_id"])
    v = v[v.espn_pos.isin(SKILL) | v.position.isin(SKILL)]
    res["validity_2015_19_rows_skill_either"] = int(len(v))
    res["validity_2015_19_agree"] = round(float((v.espn_pos.map(SKILL) == v.position.map(SKILL)).mean()), 3)

    rec = pd.read_sql("SELECT season, recruit_id, player_name, stars FROM cfb_recruit", con)
    rid = cf[["athlete_id", "recruit_ids"]].explode("recruit_ids")
    rid["recruit_ids"] = pd.to_numeric(rid.recruit_ids, errors="coerce")
    rid = rid[rid.recruit_ids > 0].drop_duplicates()
    hit = rid.merge(rec, left_on="recruit_ids", right_on=pd.to_numeric(rec.recruit_id, errors="coerce"))
    res["cfbd_recruit_ids_positive"] = int(rid.recruit_ids.nunique())
    res["cfbd_recruit_ids_matching_any_cfb_recruit_id"] = int(hit.recruit_ids.nunique())
    print(json.dumps(res, indent=1))
    b.to_parquet(OUT.parent / "cfbd_positions_popb.parquet", index=False)
    (OUT.parent / "cfbd_rosters_result.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
