"""nflreadpy (official nflverse loader) against the store's own copies of the same nflverse tables:
row counts, key sets and values. Also measures what `load_ff_playerids` (DynastyProcess) would add.
Runs in the lane venv (nflreadpy needs polars); reads a store copy only.

    <venv python> projections/lanes/packages/nflreadpy_parity.py <store copy>
"""
import importlib.metadata as md
import json
import sqlite3
import sys

import nflreadpy as nfl
import pandas as pd


def cmp(name, a, b, key, cols):
    a, b = a.copy(), b.copy()
    for c in cols:
        a[c], b[c] = a[c].astype("string"), b[c].astype("string")
    m = a.merge(b, on=key, how="outer", suffixes=("_pkg", "_db"), indicator=True)
    both = m[m._merge == "both"]
    diff = {c: int((both[f"{c}_pkg"].fillna("<NA>") != both[f"{c}_db"].fillna("<NA>")).sum()) for c in cols}
    return {"table": name, "rows_pkg": len(a), "rows_db": len(b), "only_pkg": int((m._merge == "left_only").sum()),
            "only_db": int((m._merge == "right_only").sum()), "value_diffs": diff}


def main():
    con = sqlite3.connect(sys.argv[1])
    out = {"nflreadpy": md.version("nflreadpy"), "polars": md.version("polars")}
    dp = nfl.load_draft_picks().to_pandas()
    db = pd.read_sql("SELECT season, pick, gsis_id, pfr_player_id, position, college FROM nfl_draft_pick", con)
    out["draft_picks"] = cmp("draft_picks", dp[db.columns], db, ["season", "pick"], ["gsis_id", "pfr_player_id", "position", "college"])
    pl = nfl.load_players().to_pandas()
    dbp = pd.read_sql("SELECT gsis_id, birth_date, espn_id, pfr_id, college_name, draft_year FROM nfl_player", con)
    out["players"] = cmp("players", pl[dbp.columns], dbp, ["gsis_id"], ["birth_date", "espn_id", "pfr_id", "college_name"])
    cb = nfl.load_combine().to_pandas()
    dbc = pd.read_sql("SELECT season, pfr_id, player_name, forty, wt FROM nfl_combine", con)
    cb = cb.rename(columns={"player_name": "player_name"})[dbc.columns]
    out["combine"] = {"rows_pkg": len(cb), "rows_db": len(dbc),
                      "forty_nonnull_pkg": int(cb.forty.notna().sum()), "forty_nonnull_db": int(dbc.forty.notna().sum())}

    ids = nfl.load_ff_playerids().to_pandas()
    out["ff_playerids"] = {"rows": len(ids), "columns": list(ids.columns)}
    # DOB for NFL QB/RB/WR/TE that nflverse players lacks
    nob = dbp[dbp.birth_date.isna()].gsis_id
    hit = ids[ids.gsis_id.isin(nob) & ids.birthdate.notna()]
    out["ff_playerids"]["fills_missing_nflverse_dob"] = int(len(hit))
    # pre-draft rookies listed before they have an NFL id: the only pre-draft DOB source here
    pre = ids[ids.gsis_id.isna() & ids.draft_year.isna() & ids.birthdate.notna() & ids.position.isin(["QB", "RB", "WR", "TE"])]
    out["ff_playerids"]["no_gsis_qb_rb_wr_te_with_dob"] = int(len(pre))
    out["ff_playerids"]["db_season_values"] = sorted(ids.db_season.dropna().astype(int).unique().tolist())[-3:]
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
