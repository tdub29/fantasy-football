"""College production grades for the prospect card.

Writes site/data/production-grades.js (window.PRODUCTION_GRADES): per position, the sorted
values of every player drafted since FROM with a college line on file, for each metric public
play-by-play can compute, plus career YPC for the RBs on the card (prospect-model.js carries
dominator and breakout age already). The card turns a value into a percentile against that list
(pmPctile in site/js/app.js). What ships and why the rest is hidden:
notes/prospect-research/production-grades.md.

Reads the prospect store through build_prospect_model's own loaders, from a throwaway copy:
prospect_db.connect() writes, so the store itself is never opened.

    python projections/build_production_grades.py
    python projections/build_production_grades.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import shutil
import sys
import tempfile

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402
import prospect_db as pdb  # noqa: E402

OUT = bpm.ROOT / "site" / "data" / "production-grades.js"
FROM = 2010          # first draft class in the reference
MIN_CARRIES = 100    # career carries before YPC is a rate and not a handful of runs
# Card key -> (column in the drafted table, decimals build_prospect_model rounds it to). card()
# then applies the payload's own clean(), so a tie on the card is a tie in the reference.
COLS = {"dom": ("dom_best", 3), "ba": ("breakout_age", 1), "ypc": ("ypc", 1)}


def card(v, k):
    """A value exactly as prospect-model.js carries it: key_stats rounds, then bpp.clean rounds to 2."""
    return bpm.bpp.clean(round(float(v), COLS[k][1]))
METRICS = {"QB": (), "RB": ("dom", "ba", "ypc"), "WR": ("dom", "ba"), "TE": ("dom", "ba")}


def read_js(path, var):
    src = path.read_text(encoding="utf-8")
    return json.loads(src[src.index("{", src.index(var)):src.rindex("}") + 1])


def career_ypc(ps, subj):
    """Career rush yards per carry through each subject's cutoff season; blank under MIN_CARRIES."""
    f = subj[["key", "player_id", "cutoff"]].merge(ps[["player_id", "season", "rush_att", "rush_yds"]], on="player_id")
    g = f[f.season <= f.cutoff].groupby("key")[["rush_att", "rush_yds"]].sum()
    return (g.rush_yds / g.rush_att).where(g.rush_att >= MIN_CARRIES)


def load():
    with tempfile.TemporaryDirectory() as tmp:
        copy = pathlib.Path(tmp) / "prospect.sqlite"
        shutil.copyfile(pdb.DB_PATH, copy)
        bpm._CON = pdb.connect(copy)   # preset, so read_src skips ingest: no fetch, nothing written back
        try:
            ps, _bio, _d, t, _age0 = bpm.prepare(say=lambda *a: None)
        finally:
            bpm._CON.close()
            bpm._CON = None
    return ps, t


def build():
    ps, t = load()
    t = t.assign(key=t.sid)
    t["ypc"] = t.key.map(career_ypc(ps, t))
    ref = t[t.draft_year >= FROM]
    out = {"generated": dt.date.today().isoformat(), "from": FROM, "to": int(ref.draft_year.max()),
           "min_carries": MIN_CARRIES, "ref": {}, "ypc": {"nfl": {}, "college": {}}}
    for pos, keys in METRICS.items():
        rows = ref[ref.pos == pos]
        out["ref"][pos] = {k: sorted(card(v, k) for v in rows[COLS[k][0]].dropna()) for k in keys}
    # YPC for the players on the card: drafted rows by (class, pick), college rows by ESPN id.
    model = read_js(bpm.OUT, "PROSPECT_MODEL")
    by_slot = t[t.pos == "RB"].set_index(["draft_year", "pick"]).ypc
    for sid, r in model["nfl"].items():
        v = by_slot.get((r["y"], r["pk"])) if r["p"] == "RB" else None
        if v is not None and not np.isnan(v):
            out["ypc"]["nfl"][sid] = card(v, "ypc")
    cur = [r for r in model["college"] if r["p"] == "RB"]
    subj = bpm.pd.DataFrame({"key": [r["cid"] for r in cur], "player_id": [r["cid"] for r in cur], "cutoff": bpm.SEASON})
    subj["player_id"] = subj.player_id.astype("Int64")
    for cid, v in career_ypc(ps, subj).dropna().items():
        out["ypc"]["college"][str(cid)] = card(v, "ypc")
    OUT.write_text("window.PRODUCTION_GRADES = " + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")
    n = {p: {k: len(v) for k, v in m.items()} for p, m in out["ref"].items()}
    print(f"wrote {OUT.name}: classes {FROM}-{out['to']}, n {n}, "
          f"YPC for {len(out['ypc']['nfl'])} drafted and {len(out['ypc']['college'])} college RBs")


def self_check():
    """The written file against prospect-model.js: every drafted card value since FROM is in its
    own reference (same definition, same rounding), lists are sorted and plausible, QB is empty."""
    g, m = read_js(OUT, "PRODUCTION_GRADES"), read_js(bpm.OUT, "PROSPECT_MODEL")
    span = {"dom": (0, 1), "ba": (17, 26), "ypc": (1, 12)}
    assert g["from"] == FROM and g["ref"]["QB"] == {}, "QB has no public production metric"
    # Every breakout age shipped, drafted and college, on the one class-year clock: a value
    # outside 17-26 means the first season or recruit class joined to the wrong player.
    bas = [r["ba"] for r in [*m["nfl"].values(), *m["college"]] if r.get("ba") is not None]
    assert bas and all(17 <= v <= 26 for v in bas), f"breakout age out of range: {min(bas)}..{max(bas)}"
    for pos, keys in METRICS.items():
        for k in keys:
            ref = g["ref"][pos][k]
            assert len(ref) >= 100 and ref == sorted(ref), f"{pos} {k}: n={len(ref)} or unsorted"
            assert span[k][0] <= ref[0] and ref[-1] <= span[k][1], f"{pos} {k}: {ref[0]}..{ref[-1]}"
            pool = list(ref)
            card = [(r["st"] or {}).get(k) if k == "dom" else r.get(k) if k == "ba" else g["ypc"]["nfl"].get(sid)
                    for sid, r in m["nfl"].items() if r["p"] == pos and r["y"] >= FROM and "st" in r]
            for v in (v for v in card if v is not None):
                assert v in pool, f"{pos} {k}={v} on a drafted card is missing from the reference"
                pool.remove(v)
    rbs = {str(r["cid"]) for r in m["college"] if r["p"] == "RB"}
    assert set(g["ypc"]["college"]) <= rbs and len(g["ypc"]["college"]) >= len(rbs) // 2, "college YPC coverage"
    assert all(m["nfl"][s]["p"] == "RB" for s in g["ypc"]["nfl"]), "YPC keyed to a non-RB"
    print(f"self-check ok: {sum(len(v) for p in g['ref'].values() for v in p.values())} reference values, "
          f"every drafted card value since {FROM} found in its reference")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    self_check() if a.self_check else build()
