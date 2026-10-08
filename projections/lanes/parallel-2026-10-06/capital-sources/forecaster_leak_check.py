"""Missingness leak check for candidate forecaster inputs in cfb_roster (read-only).

A column whose PRESENCE differs between drafted and undrafted leavers encodes the outcome, so it cannot be an
input even before its value is used. Population per class D: QB/RB/WR/TE athletes whose LAST roster season is
D-1. Drafted = linked to an NFL draft pick in class D via player_link (CFBD athlete id space; nfl_draft_pick's
cfb_player_id is a different id space and joins nothing).

    PROSPECT_DB=<scratch copy> python -I forecaster_leak_check.py
"""
import os
import sqlite3
import sys

COLS = {"date_of_birth": "date_of_birth is not null and trim(date_of_birth) <> ''", "age": "age > 0",
        "height": "height > 0", "weight": "weight > 0"}


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    db = os.environ.get("PROSPECT_DB") or sys.exit("set PROSPECT_DB to a scratch COPY of the prospect DB")
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    run = c.execute("select max(run_id) from player_link").fetchone()[0]
    flags = ", ".join(f"max(case when {e} then 1 else 0 end) {k}" for k, e in COLS.items())
    c.execute(f"""create temp table r as select cast(athlete_id as integer) a, season s, {flags}
                  from cfb_roster where position_abbreviation in ('QB','RB','WR','TE') group by 1, 2""")
    c.execute("create index temp.ri on r(a, s)")
    c.execute("create temp table last as select a, max(s) s from r group by a")
    c.execute("create temp table pl as select distinct cast(cfb_player_id as integer) a, draft_year d "
              "from player_link where run_id = ? and cfb_player_id is not null", (run,))
    c.execute("create index temp.pli on pl(a)")
    print(f"player_link run {run}; cells are % present among drafted / undrafted leavers")
    print("D,n_left,n_drafted," + ",".join(f"{k}_drafted,{k}_undrafted" for k in COLS))
    for d in range(2015, 2025):
        q = f"""select {", ".join("r." + k for k in COLS)}, pl.d is not null from last join r on r.a = last.a and r.s = last.s
                left join pl on pl.a = last.a and pl.d = ? where last.s = ?"""
        rows = c.execute(q, (d, d - 1)).fetchall()
        dr, un = [x for x in rows if x[-1]], [x for x in rows if not x[-1]]
        pct = lambda v, i: f"{100 * sum(x[i] for x in v) / len(v):.1f}" if v else ""  # noqa: E731
        print(f"{d},{len(rows)},{len(dr)}," + ",".join(f"{pct(dr, i)},{pct(un, i)}" for i in range(len(COLS))))


if __name__ == "__main__":
    main()
