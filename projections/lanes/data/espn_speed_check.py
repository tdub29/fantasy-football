"""Is ESPN's draft-record `speed` a measured 40 time? Drafted QB/RB/WR/TE (espn_draft_drafted.py)
joined on (draft year, overall pick) to the nflverse combine forty and the RAS archive pro-day forty
(DynastyProcess, draft years to 2019). Also: by class, how many carry a speed at all, and how many of
the players who skipped the combine (the pro-day gap) do.

    PROSPECT_DB=<scratch>/prospect.sqlite python projections/lanes/data/espn_speed_check.py
"""
import json
import os
import pathlib
import sqlite3

import pandas as pd

DB = os.environ["PROSPECT_DB"]
assert "lane-data" in DB
SCR = pathlib.Path(DB).parent


def espn():
    out = []
    for f in sorted((SCR / "espn_draft").glob("drafted_*.json")):
        s = json.loads(f.read_text())
        for r in s["records"]:
            a = {x["name"]: x.get("value") for x in r["core"].get("attributes", [])}
            site = {x["name"]: x.get("displayValue") for x in r["site"].get("attributes", [])}
            out.append({"season": s["season"], "pick": r["pick"], "name": r["site"].get("displayName"),
                        "speed": a.get("speed") or None, "attended": a.get("attendedCombine"),
                        "grade": pd.to_numeric(site.get("grade"), errors="coerce"),
                        "pos_rank": pd.to_numeric(site.get("rank"), errors="coerce"),
                        "ovr_rank": pd.to_numeric(site.get("overall"), errors="coerce")})
    return pd.DataFrame(out)


def main():
    e = espn()
    con = sqlite3.connect(DB)
    c = pd.read_sql_query("SELECT draft_year AS season, draft_ovr AS pick, forty FROM nfl_combine WHERE draft_ovr IS NOT NULL", con)
    menu = pd.read_csv(SCR / "ras" / "MENU_INFO.csv", encoding="utf-8-sig", usecols=["PLAYERID", "DRAFTYEAR", "PICK"])
    pro = pd.read_csv(SCR / "ras" / "PRODAY_METRICS.csv", encoding="utf-8-sig", usecols=["PLAYERID", "40"])
    ras = menu.merge(pro, on="PLAYERID").rename(columns={"DRAFTYEAR": "season", "PICK": "pick", "40": "proday40"})
    ras = ras.dropna(subset=["pick"]).drop_duplicates(["season", "pick"])
    m = e.merge(c, on=["season", "pick"], how="left").merge(ras[["season", "pick", "proday40"]], on=["season", "pick"], how="left")
    m["speed"] = pd.to_numeric(m.speed, errors="coerce")
    comb = m[m.forty.notna() & m.speed.notna()]
    nocomb = m[m.forty.isna()]
    pd_ = nocomb[nocomb.proday40.notna() & nocomb.speed.notna()]
    res = {
        "drafted_skill_records": len(m),
        "combine_forty_match_0.02": round(float(((comb.speed - comb.forty).abs() <= 0.02).mean()), 3), "n_combine": len(comb),
        "no_combine_forty": len(nocomb), "no_combine_with_speed": int(nocomb.speed.notna().sum()),
        "proday_match_0.03": round(float(((pd_.speed - pd_.proday40).abs() <= 0.03).mean()), 3) if len(pd_) else None,
        "n_proday_compared": len(pd_),
    }
    by = m.groupby("season").agg(n=("name", "size"), speed=("speed", lambda s: s.notna().mean()),
                                 no_combine=("forty", lambda s: s.isna().sum()),
                                 grade=("grade", lambda s: s.gt(0).mean()), ovr_rank=("ovr_rank", lambda s: s.gt(0).mean()))
    by["no_combine_speed"] = m[m.forty.isna()].groupby("season").speed.apply(lambda s: int(s.notna().sum()))
    print(json.dumps(res, indent=1))
    print(by.round(2).to_string())
    if len(pd_):
        print(pd_[["season", "name", "speed", "proday40"]].head(15).to_string())
    res["by_class"] = by.round(3).reset_index().to_dict("records")
    (SCR / "espn_speed_check.json").write_text(json.dumps(res, indent=1, default=float))
    m.to_csv(SCR / "espn_drafted_skill.csv", index=False)


if __name__ == "__main__":
    main()
