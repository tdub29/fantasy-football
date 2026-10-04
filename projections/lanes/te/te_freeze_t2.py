"""Freeze T2's 2027-class TE forecasts as a prospective entry (coordinator decision, 2026-10-04). Serves
no number. T2 (prereg.md) is fit on every mature served-shaped TE and WR snapshot, as fit_stage fits
production models (hit known, no replay cut); each current next-class TE (first eligible SEASON + 1,
playing in SEASON) is scored through the builder's path: score_college's subject frame,
predraft_profile, with_live(n=4) and stage_score(which="next").

    PROSPECT_DB=<lane copy> python -W ignore projections/lanes/te/te_freeze_t2.py
"""
from __future__ import annotations

import datetime
import hashlib
import json
import subprocess
import warnings

import numpy as np
import pandas as pd

import te_replay as tr
from te_candidates import NOTES, SPECS, fit_design, served_shape, tune

bpm = tr.bpm


def main():
    warnings.filterwarnings("ignore")
    import prospect_live as pl
    import prospect_population as pp
    import prospect_stage as pst
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    e = pp.build(ps, bio, d, t, age0, con, say=lambda *a: None)
    snap = pst.snapshots(e[e.draft_year >= bpm.FIRST_CLASS], ps, age0, con)
    live = pl.live_features(con, tr.N_LIVE)
    key = pd.MultiIndex.from_arrays([snap.season.astype(int) + 1, snap.player_id.astype("Int64")])
    snap = snap.join(pd.DataFrame(live.reindex(key).to_numpy(), columns=pl.LIVE, index=snap.index))
    snap["has_live"] = snap.has_live.fillna(0.0)

    # T2 fit on every mature served-shaped row (TE + WR), (C, k) by inner leave-one-class-out on TE rows.
    prod = [x for x in pst.stage_cols("TE") if x not in ("stage", "age_k")] + list(pl.LIVE)
    assert not SPECS["T2"]["extra"] and SPECS["T2"]["pooled"]
    cols = prod + ["stage"]
    mat = snap[snap.hit.notna()]
    f = pd.concat([served_shape(mat[mat.cpos == "TE"]).assign(is_te=1.0),
                   served_shape(mat[mat.cpos == "WR"]).assign(is_te=0.0)], ignore_index=True)
    C, k, inner = tune(f, prod, True)
    dsg, m = fit_design(f, prod, True, C, k)

    class Adapter:
        def predict_proba(self, X):
            p = m.predict_proba(dsg.transform(pd.DataFrame(X, columns=cols).assign(is_te=1.0)))[:, 1]
            return np.column_stack([1 - p, p])

    # Serving: score_college's subject frame, then the NEXT_STAGE S4-style path.
    S = bpm.SEASON
    cur = ps[ps.season == S].drop_duplicates("player_id").set_index("player_id")
    cand = bio.loc[bio.index.isin(cur.index)].copy()
    cand = cand[cand.ros_pos.isin(bpm.POS)]
    subj = cand.reset_index().rename(columns={"index": "player_id", "ros_pos": "pos"})
    subj["player_id"] = subj.player_id.astype("Int64")
    subj["draft_year"] = np.maximum(S + 1, subj.hs_class + 3)
    subj["cutoff"] = S
    subj["dob"] = subj.ros_dob
    subj["sid"] = "c" + subj.player_id.astype(str)
    subj = subj.merge(bpm.career_features(subj, ps, age0), on="sid", how="left").rename(columns={"ros_weight": "weight"})
    subj = subj.join(bpm.context_features(subj, ps), on="sid")
    done = bpm.predraft_profile(subj, ps, age0)
    s = subj[(subj.pos == "TE") & (subj.n_qual >= 1)].copy()
    s["cls"] = s.draft_year
    s["_pd"], s["_pdx"] = np.nan, np.nan
    d_ = bpm.with_live(done, subj, ps, tr.N_LIVE)
    s = bpm.stage_score(s, d_, {"model": Adapter(), "cols": cols}, age0, which="next")
    x = s[(s.cls == S + 1) & s._pd.notna()].sort_values("_pd", ascending=False)
    pmap = {str(int(pid)): round(float(p), 3) for pid, p in zip(x.player_id, x._pd)}
    nxt = s[s.cls == S + 1]

    wk = con.execute("SELECT MAX(week) FROM cfb_team_game WHERE season = ? AND season_type = 2", (S,)).fetchone()[0]
    head = subprocess.run(["git", "-C", str(bpm.ROOT), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    entry = {"id": "lane T2 TE prospective", "pos": "TE", "model": "T2", "class": S + 1,
             "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "git_head": head, "live_through_week": int(wk), "p_by_college_id": pmap,
             "sha256": hashlib.sha256(json.dumps(pmap, sort_keys=True).encode()).hexdigest(),
             "fit": {"C": C, "k": k, "inner_te_logloss": inner, "te_rows": int(f.is_te.sum()),
                     "te_events": int(f[f.is_te == 1].hit.sum()), "wr_rows": int((f.is_te == 0).sum()),
                     "next_class_te_with_qualifying_season": int(len(nxt)), "scored": len(pmap)}}
    path = NOTES / "prospective-t2.json"
    book = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"note": (
        "TE lane T2 (prereg.md; failed the serving gates, serves no number): next-class forecasts frozen before "
        "outcomes exist, every current next-class TE with a number, keyed by ESPN college id. Judged when the class's "
        "four-season TE window closes. Never rewritten; new freezes are appended."), "entries": []}
    book["entries"].append(entry)
    path.write_text(json.dumps(book, indent=1) + "\n", encoding="utf-8")
    print(f"froze {entry['id']}: {len(pmap)} of {len(nxt)} next-class TEs, live through week {wk}, C {C} k {k}, "
          f"mean p {np.mean(list(pmap.values())):.3f}, top: {list(pmap.items())[:5]}")


if __name__ == "__main__":
    main()
