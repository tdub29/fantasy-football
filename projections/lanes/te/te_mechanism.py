"""TE lane step 1b: mechanism check on TRAINING rows only (no served outcomes): per replay season, the
S4n4 fit's chosen C, its stage coefficient, and its in-sample forecast vs hits by stage on the
served-shaped training rows (stage 2+, plays next season). Plus the power check rescaled so the
truth forecasts the observed event count.

    PROSPECT_DB=<lane copy> python -W ignore projections/lanes/te/te_mechanism.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import te_replay as tr
import te_diagnose as tdg


def main():
    c = tr.load()
    cols = c["stage_cols"]["TE"] + c["live_cols"]
    import prospect_experiments_b as peb
    print("TE stage cols:", cols)
    for season in tr.SEASONS:
        t = tr.train_rows(c, "TE", season)
        peb.NestedLR.chosen = []
        m = peb.NestedLR().fit(t[cols].to_numpy(float), t.hit.to_numpy(float), t.draft_year.to_numpy(int))
        coef = dict(zip(cols, m.m[-1].coef_[0]))
        p = m.predict_proba(t[cols].to_numpy(float))[:, 1]
        t = t.assign(p=p, st=t.stage.clip(upper=4))
        srv = t[(t.stage >= 2) & t.plays_next]
        g = srv.groupby("st").agg(n=("hit", "size"), hits=("hit", "sum"), pred=("p", "sum"))
        g["ratio"] = (g.pred / g.hits.replace(0, np.nan)).round(2)
        print(f"\n{season}: train rows {len(t)}, players {t.player_id.nunique()}, hits(player) "
              f"{int(t.drop_duplicates('player_id').hit.sum())}, classes {t.draft_year.min()}-{t.draft_year.max()}, "
              f"C {peb.NestedLR.chosen[-1]}, coef stage {coef['stage']:+.3f} age_k {coef['age_k']:+.3f} "
              f"ryptpa_best {coef['ryptpa_best']:+.3f} dom_best {coef['dom_best']:+.3f} live_rec_share {coef['live_rec_share']:+.3f}")
        print(g.round(2).T.to_string())
    # Power when the truth forecasts the observed number of events: S4n4 served logits shifted so the
    # mean forecast equals the observed rate (shape kept), then the same simulation.
    r4 = pd.read_pickle(tr.SCRATCH / "rows_s4n4_te.pkl")
    from scipy.optimize import brentq
    lg = np.log(r4._pd / (1 - r4._pd))
    shift = brentq(lambda a: (1 / (1 + np.exp(-(lg + a)))).sum() - r4.y.sum(), -5, 5)
    r = r4.assign(_pd=1 / (1 + np.exp(-(lg + shift))))
    print(f"\npower, truth = S4n4 shape shifted to {r.y.sum():.0f} expected events (shift {shift:+.3f}):")
    print(tdg.power(r))
    # A truth with less discrimination (logits shrunk by half toward the mean) and the observed total.
    lg2 = lg.mean() + 0.5 * (lg - lg.mean())
    shift2 = brentq(lambda a: (1 / (1 + np.exp(-(lg2 + a)))).sum() - r4.y.sum(), -5, 5)
    r2 = r4.assign(_pd=1 / (1 + np.exp(-(lg2 + shift2))))
    print("power, truth = half-strength logits, observed total:")
    print(tdg.power(r2))


if __name__ == "__main__":
    main()
