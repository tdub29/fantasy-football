"""Score the frozen prospective holdout (charter v2): predictions written for the 2024-2026 classes
before their outcomes existed, in notes/prospect-research/experiments/prospective-*.json.

Each entry is scored only on players whose outcome window has closed in the current store (WR/RB:
three NFL seasons played; QB/TE: four), against the baseline entry frozen at the same time. Until
then it prints how many are still open. Never rewrites the frozen files.

    python projections/prospect_prospective.py

`freeze_served(res, tag)` appends a served next-class list (the top 60 the board shows) from a build
result to prospective-served.json, so served models can be compared on classes nobody has seen.
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


def freeze_served(res: dict, tag: str, positions=("RB", "WR")):
    """Append the served next-class forecasts in `res` (bpm.build output) as frozen entries."""
    import datetime
    import hashlib
    import subprocess
    path = EXP / "prospective-served.json"
    book = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {
        "note": "Served next-class pre-draft lists (top 60 by the model, display rule D1), frozen before outcomes "
                "exist. Score with `python projections/prospect_prospective.py` once the class's window closes "
                "(RB/WR: three NFL seasons). Never rewritten; new freezes are appended.", "entries": []}
    wk = bpm._CON.execute("SELECT MAX(week) FROM cfb_team_game WHERE season = ? AND season_type = 2", (bpm.SEASON,)).fetchone()[0]
    head = subprocess.run(["git", "-C", str(bpm.ROOT), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    c = pd.DataFrame(res["college"])
    for pos in positions:
        st = res["results"][pos].get("stage", {})
        x = c[(c.p == pos) & (c.cls == bpm.SEASON + 1) & c.pd.notna()]
        pmap = {str(int(k)): float(v) for k, v in zip(x.cid, x.pd)}
        e = {"id": f"served {st.get('model')} {pos} {tag}", "pos": pos, "model": st.get("model"), "class": bpm.SEASON + 1,
             "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "git_head": head, "live_through_week": wk, "p_by_college_id": pmap,
             "sha256": hashlib.sha256(json.dumps(pmap, sort_keys=True).encode()).hexdigest()}
        book["entries"].append(e)
        print(f"froze {e['id']}: {len(pmap)} players, live through week {wk}")
    path.write_text(json.dumps(book, indent=1) + "\n", encoding="utf-8")


def main():
    warnings.filterwarnings("ignore")
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    a = t[t.gsis_id.notna()].drop_duplicates("gsis_id").set_index("gsis_id").hit
    book = json.loads((EXP / "prospective-2024-2026.json").read_text(encoding="utf-8"))
    ra = score_entries(book, a, "p_by_gsis")
    print("Population A (post-draft), frozen predictions on classes 2024-2026:")
    print(ra.to_string(index=False))
    import prospect_population as pp
    e = pp.build(ps, bio, d, t, age0, bpm._CON, say=lambda *a: None)
    b = e.drop_duplicates("player_id").assign(player_id=lambda x: x.player_id.astype(str)).set_index("player_id").hit
    for name, title in (("prospective-b.json", "Population B (pre-draft), frozen predictions on open classes"),
                        ("prospective-served.json", "Served next-class lists, frozen")):
        path_b = EXP / name
        if path_b.exists():
            rb = score_entries(json.loads(path_b.read_text(encoding="utf-8")), b, "p_by_college_id")
            print(f"\n{title}:")
            print(rb.to_string(index=False))
    if ra.closed.sum() == 0:
        print("\nNo frozen prediction has a closed window yet: the 2024 WR/RB window closes after the 2026 NFL season.")


if __name__ == "__main__":
    main()
