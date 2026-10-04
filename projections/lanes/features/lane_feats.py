"""Features lane: the two preregistered candidate features (prereg.md), built identically for training
snapshot rows and served rows.

Both are attached to a player's most recent completed college season on file, k, and his team that
season (the team he played most for, ps.team_id):

- `tal_pct`  team talent: percentile of his team's 247-style talent composite in season k (sportsdataverse
  `cfb_team_talent`, built from the signing classes k-3..k, all signed before season k) among that season's
  FBS teams (store player seasons with an fbs_class). Missing when k < 2005 (no file) or the team is absent.
- `pos_bc`   opportunity competition: number of 4-5 star recruits in his position group (WR: WR; RB: RB, APB)
  that his team signed in classes k-3..k, excluding any record with his own name key. Classes come from the
  store's cfb_recruit plus the lane's 2002-2003 files. Missing when k < 2005 (window not on file).

    python projections/lanes/features/lane_feats.py      # self-check
"""
from __future__ import annotations

import os
import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
DL = pathlib.Path(os.environ.get("LANE_DL", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-features\dl"))
GROUP = {"WR": {"WR"}, "RB": {"RB", "APB"}}
FIRST_K = 2005
NEW = ["tal_pct", "pos_bc"]


def talent_pct(ps: pd.DataFrame, dl=DL) -> pd.Series:
    """(season, team_id) -> percentile of talent among that season's FBS teams."""
    out = []
    fbs = ps[ps.fbs_class.notna()].groupby("season").team_id.unique()
    for y in range(FIRST_K, int(ps.season.max()) + 1):
        f = dl / f"cfb_team_talent_{y}.parquet"
        if not f.exists() or y not in fbs.index:
            continue
        t = pd.read_parquet(f)
        t["team_id"] = pd.to_numeric(t.team_id, errors="coerce")
        ref = np.sort(t[t.team_id.isin(fbs[y])].talent_composite.to_numpy(float))
        out.append(pd.DataFrame({"season": y, "team_id": t.team_id,
                                 "tal_pct": np.searchsorted(ref, t.talent_composite.to_numpy(float), side="right") / len(ref)}))
    return pd.concat(out).dropna(subset=["team_id"]).drop_duplicates(["season", "team_id"]).set_index(["season", "team_id"]).tal_pct


def recruits(con, dl=DL) -> pd.DataFrame:
    import build_prospect_profile as bpp
    r = pd.read_sql_query("SELECT season, team_id, player_name, stars, position FROM cfb_recruit", con)
    extra = [pd.read_parquet(dl / f"cfb_recruits_{y}.parquet", columns=["season", "team_id", "player_name", "stars", "position"])
             for y in (2002, 2003)]
    r = pd.concat([r, *extra], ignore_index=True)
    r["team_id"] = pd.to_numeric(r.team_id, errors="coerce")
    r["stars"] = pd.to_numeric(r.stars, errors="coerce")
    r["_k"] = r.player_name.map(bpp.norm_name)
    return r.dropna(subset=["team_id"])


def competition(rows: pd.DataFrame, rec: pd.DataFrame, pos: str) -> np.ndarray:
    """rows: k, team_id, _k (his name key). Blue-chip same-group recruits of his team in classes k-3..k, not him."""
    bc = rec[rec.position.isin(GROUP[pos]) & rec.stars.ge(4)][["season", "team_id", "_k"]]
    out = np.full(len(rows), np.nan)
    for i, (k, t, nk) in enumerate(zip(rows.k.to_numpy(), rows.team_id.to_numpy(), rows._k.to_numpy())):
        if k >= FIRST_K and not np.isnan(t):
            w = bc[(bc.team_id == t) & bc.season.between(k - 3, k)]
            out[i] = float((w._k != nk).sum())
    return out


def attach(rows: pd.DataFrame, ps: pd.DataFrame, pos: str, tal: pd.Series, rec: pd.DataFrame) -> pd.DataFrame:
    """rows: player_id and k (his most recent completed season on file). Returns tal_pct, pos_bc aligned to rows."""
    import build_prospect_profile as bpp
    key = ps.drop_duplicates(["player_id", "season"]).set_index(["player_id", "season"])
    idx = pd.MultiIndex.from_arrays([rows.player_id.astype("Int64"), rows.k.astype(int)])
    r = pd.DataFrame({"k": rows.k.astype(int).to_numpy(), "team_id": key.team_id.reindex(idx).to_numpy(float),
                      "_k": key.name.reindex(idx).map(bpp.norm_name).to_numpy()}, index=rows.index)
    r["tal_pct"] = tal.reindex(pd.MultiIndex.from_arrays([r.k, r.team_id])).to_numpy()
    r["pos_bc"] = competition(r, rec, pos)
    return r[NEW]


def last_season(ps: pd.DataFrame, pids, cutoff: int) -> pd.Series:
    """Most recent season on file <= cutoff, per player id."""
    s = ps[ps.player_id.isin(pids) & (ps.season <= cutoff)].groupby("player_id").season.max()
    return s


def _check():
    ps = pd.DataFrame({"player_id": pd.array([1, 1, 2], dtype="Int64"), "season": [2015, 2016, 2016],
                       "team_id": [7.0, 8.0, 7.0], "name": ["Al Bee", "Al Bee", "Cy Dee"], "fbs_class": ["P5", "P5", "G5"]})
    rec = pd.DataFrame({"season": [2013, 2016, 2012, 2014, 2016], "team_id": [7.0, 7.0, 7.0, 7.0, 7.0],
                        "_k": ["x", "albee", "y", "cydee", "z"], "stars": [4, 5, 5, 3, 4], "position": ["WR", "WR", "WR", "WR", "RB"]})
    rows = pd.DataFrame({"k": [2016, 2016, 2004], "team_id": [7.0, 7.0, 7.0], "_k": ["cydee", "albee", "q"]})
    got = competition(rows, rec, "WR")
    # 2013 x and 2016 albee are in window 2013-2016 and blue-chip; 2012 y is outside; 2014 cydee is 3-star
    assert got[0] == 2 and got[1] == 1 and np.isnan(got[2]), got
    assert competition(rows, rec, "RB")[0] == 1
    t = pd.DataFrame({"season": 2016, "team_id": ["7", "8", "9"], "talent_composite": [900.0, 500.0, 100.0]})
    import tempfile
    d = pathlib.Path(tempfile.mkdtemp())
    t.to_parquet(d / "cfb_team_talent_2016.parquet")
    tp = talent_pct(ps, d)
    assert tp.loc[(2016, 7.0)] == 1.0 and tp.loc[(2016, 8.0)] == 0.5 and tp.loc[(2016, 9.0)] == 0.0, tp
    assert last_season(ps, [1], 2015).loc[1] == 2015 and last_season(ps, [1], 2026).loc[1] == 2016
    print("lane_feats self-check OK")


if __name__ == "__main__":
    _check()
