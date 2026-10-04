"""Score the frozen prospective holdout (charter v2): predictions written for the 2024-2026 classes
before their outcomes existed, in notes/prospect-research/experiments/prospective-*.json.

Each entry is scored only on players whose outcome window has closed in the current store (WR/RB:
three NFL seasons played; QB/TE: four), against the baseline entry frozen at the same time. Until
then it prints how many are still open. Never rewrites the frozen files.

    python projections/prospect_prospective.py
"""
from __future__ import annotations

import json
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402

EXP = bpm.ROOT / "notes" / "prospect-research" / "experiments"


def score_entries(book, labels, key):
    """labels: id -> hit (NaN while open). Returns one row per entry, compared with the baseline
    entry for the same position (population A) or with stars-only (none frozen; population B
    entries are compared with each other)."""
    rows = []
    for e in book["entries"]:
        p = pd.Series(e[key], dtype=float)
        y = labels.reindex(p.index.astype(str))
        m = y.notna().to_numpy()
        rows.append({"id": e["id"], "pos": e["pos"], "frozen": e["frozen_at_utc"], "n": len(p), "closed": int(m.sum()),
                     "hits": int(y[m].sum()) if m.any() else 0,
                     "logloss": bpm.ll(y[m].to_numpy(float), p[m].to_numpy()) if m.sum() else np.nan})
    return pd.DataFrame(rows)


def main():
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    a = t[t.gsis_id.notna()].drop_duplicates("gsis_id").set_index("gsis_id").hit
    book = json.loads((EXP / "prospective-2024-2026.json").read_text(encoding="utf-8"))
    ra = score_entries(book, a, "p_by_gsis")
    print("Population A (post-draft), frozen predictions on classes 2024-2026:")
    print(ra.to_string(index=False))
    path_b = EXP / "prospective-b.json"
    if path_b.exists():
        import prospect_population as pp
        e = pp.build(ps, bio, d, t, age0, bpm._CON, say=lambda *a: None)
        b = e.drop_duplicates("player_id").assign(player_id=lambda x: x.player_id.astype(str)).set_index("player_id").hit
        rb = score_entries(json.loads(path_b.read_text(encoding="utf-8")), b, "p_by_college_id")
        print("\nPopulation B (pre-draft), frozen predictions on open classes:")
        print(rb.to_string(index=False))
    if ra.closed.sum() == 0:
        print("\nNo frozen prediction has a closed window yet: the 2024 WR/RB window closes after the 2026 NFL season.")


if __name__ == "__main__":
    main()
