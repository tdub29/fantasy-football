"""Grades lane: ESPN recruit grade per college athlete id (R5 / R5b join), one table for training and served rows.

Join (packages lane R5b, the recommended rule, same for every row): the recruit's `alternateId` where it is an
id on some store roster, else the name + committed-school fallback (`recruit_fallback`: normalized name and the
committed ESPN team id against store rosters from the class year on; a key matching two ids stays unlinked).
Grade 0 is "not graded" and counts as missing. Two records on one id: the higher grade (as R5).

Reads the packages lane's raw pulls (read-only) and the lane store copy; writes `<scratch>/espn_grade.parquet`
(player_id, espn_grade, rclass_espn, join = id|fallback) and prints counts by class.

    PROSPECT_DB=<lane copy> python projections/lanes/grades/espn_grade.py
"""
from __future__ import annotations

import os
import pathlib
import sqlite3
import sys

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / "packages"))
import recruit_fallback as rf  # noqa: E402
import recruits_measure as rm  # noqa: E402

SCRATCH = pathlib.Path(os.environ.get("LANE_GRADES_TMP", r"C:\Users\TrevorWhite\.claude\jobs\ea66a469\tmp\grades"))
YEARS = list(range(2006, 2027))
OUT = SCRATCH / "espn_grade.parquet"


def build(db: str) -> pd.DataFrame:
    con = sqlite3.connect(db)
    e = rm.espn(YEARS)
    ros_ids = set(pd.read_sql("SELECT DISTINCT athlete_id FROM cfb_roster WHERE athlete_id IS NOT NULL", con).athlete_id)
    fb = pd.concat([rm.fallback_ids(rf, con, y) for y in YEARS])
    e = e.merge(fb, on="recruit_id", how="left")
    by_id = e.player_id.isin(ros_ids)
    e["join"] = by_id.map({True: "id", False: "fallback"})
    e["pid"] = e.player_id.where(by_id, e.fallback)
    e["grade"] = pd.to_numeric(e.grade, errors="coerce")
    e = e[e.pid.notna() & e.grade.gt(0)]
    e = e.sort_values(["grade", "join"], ascending=[False, False]).drop_duplicates("pid")   # higher grade; tie -> id
    out = pd.DataFrame({"player_id": e.pid.astype("int64"), "espn_grade": e.grade.astype(float),
                        "rclass_espn": e.rclass.astype(int), "join": e["join"]}).reset_index(drop=True)
    return out


def _check(t: pd.DataFrame):
    assert t.player_id.is_unique and t.espn_grade.gt(0).all() and t["join"].isin(["id", "fallback"]).all()
    assert t.rclass_espn.between(2006, 2026).all()


if __name__ == "__main__":
    t = build(os.environ["PROSPECT_DB"])
    _check(t)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    t.to_parquet(OUT, index=False)
    print(t.groupby(["rclass_espn", "join"]).size().unstack(fill_value=0).to_string())
    print(f"{len(t):,} linked graded ids -> {OUT}")
