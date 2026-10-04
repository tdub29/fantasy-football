"""Young lane step 2: descriptive diagnosis and power check for later-class (college year 1-2) rows.
Counts and base rates only, no model is fit, so it can be read before any hypothesis is registered.

    PROSPECT_DB=<lane copy> python projections/lanes/young/young_power.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import young_data as yd  # noqa: E402

bpm = yd.bpm
OUT = yd.HERE.parents[2] / "notes" / "prospect-research" / "lanes" / "young" / "power.json"


def last_season(pos):
    """Replay seasons end where a 5th-year exit of a freshman is resolved (prereg.md)."""
    return bpm.LAST_CLASS[pos] - 5


def main():
    D = yd.load()
    ps, e, snap, wide, live4 = D["ps"], D["e"], D["snap"], D["wide"], D["live4"]
    team = ps.drop_duplicates(["player_id", "season"]).set_index(["player_id", "season"]).team_id
    out = {}
    for pos in bpm.POS:
        L = last_season(pos)
        r = {"replay_seasons": [2012, L]}
        # served shape of the completed-season path: stage-1 snapshot at k = S-1, still playing at S
        s1 = snap[(snap.cpos == pos) & (snap.stage == 1) & snap.hit.notna()]
        y2 = s1[s1.plays_next & s1.season.between(2011, L - 1)]
        r["year2_served"] = {"rows": int(len(y2)), "events": int(y2.hit.sum()), "rate": round(float(y2.hit.mean()), 4),
                             "per_season": y2.groupby(y2.season + 1).hit.agg(["size", "sum"]).astype(int).to_dict("index")}
        # survivorship among all stage-1 snapshots with a closed window (training pool shape)
        r["stage1_pool"] = {"rows": int(len(s1)), "plays_next_share": round(float(s1.plays_next.mean()), 3),
                            "rate_plays_next": round(float(s1[s1.plays_next].hit.mean()), 4),
                            "rate_not_next": round(float(s1[~s1.plays_next].hit.mean()), 4),
                            "events_not_next": int(s1[~s1.plays_next].hit.sum())}
        nxt = s1[s1.plays_next]
        moved = [team.get((p, k + 1)) != team.get((p, k)) for p, k in zip(nxt.player_id, nxt.season)]
        nxt = nxt.assign(moved=moved)
        r["stage1_transfer_next"] = {"share": round(float(nxt.moved.mean()), 3),
                                     "rate_moved": round(float(nxt[nxt.moved].hit.mean()), 4),
                                     "rate_stayed": round(float(nxt[~nxt.moved].hit.mean()), 4)}
        # base rate by stage, closed windows (all snapshot rows)
        sp = snap[(snap.cpos == pos) & snap.hit.notna()]
        r["rate_by_stage"] = sp.groupby("stage").hit.agg(["size", "sum", "mean"]).round(4).to_dict("index")
        # year-1 rows: every player at the position with a stat line in his first college season (no
        # qualifying filter; labels from every exit), and those with a live line in his team's first 4 games
        w = wide[(wide.cpos == pos) & wide.hit.notna()].set_index("player_id")
        fr = ps[ps.player_id.isin(w.index)].drop_duplicates(["player_id", "season"])
        fr = fr[fr.season == fr.player_id.map(w.hs_class)]
        fr = fr[fr.season.between(2012, L)]
        fr = fr.assign(hit=fr.player_id.map(w.hit))
        lv = live4.reindex(pd.MultiIndex.from_arrays([fr.season.astype(int), fr.player_id.astype("Int64")]))
        has = lv.has_live.notna().to_numpy()
        r["year1_all"] = {"rows": int(len(fr)), "events": int(fr.hit.sum()), "rate": round(float(fr.hit.mean()), 4),
                          "with_live4": int(has.sum()), "events_live4": int(fr.hit.to_numpy()[has].sum())}
        # recruiting among year-2 served rows
        r["year2_by_stars"] = y2.groupby(y2.stars.fillna(-1)).hit.agg(["size", "sum"]).astype(int).to_dict("index")
        # horizon: draft year minus the serving season, for hits among year-2 served rows
        h = y2[y2.hit == 1]
        r["year2_hit_horizon"] = (h.outcome_year - (h.season + 1)).value_counts().sort_index().astype(int).to_dict()
        # eventual exits of year-2 served players: how many never reach a 3rd college year
        ex = y2.exit - y2.hs_class + 1
        r["year2_exit_year"] = ex.value_counts().sort_index().astype(int).to_dict()
        out[pos] = r
        print(f"{pos}: replay 2012-{L} | year-2 served {r['year2_served']['rows']} rows, {r['year2_served']['events']} events "
              f"({r['year2_served']['rate']:.3f}) | year-1 {r['year1_all']['rows']} rows, {r['year1_all']['events']} events, "
              f"with live4 {r['year1_all']['with_live4']} ({r['year1_all']['events_live4']} events) | stage-1 pool plays-next "
              f"{r['stage1_pool']['plays_next_share']:.0%}, rate next {r['stage1_pool']['rate_plays_next']:.4f} vs not "
              f"{r['stage1_pool']['rate_not_next']:.4f} | transfer next season {r['stage1_transfer_next']['share']:.0%}")
        print(f"   rate by stage: { {k: round(v['mean'], 4) for k, v in r['rate_by_stage'].items()} }")
        print(f"   year-2 hits drafted after: {r['year2_hit_horizon']} (years after serving season) | exit year {r['year2_exit_year']}")
        print(f"   year-2 by stars (size, hits): { {k: (v['size'], v['sum']) for k, v in r['year2_by_stars'].items()} }")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
