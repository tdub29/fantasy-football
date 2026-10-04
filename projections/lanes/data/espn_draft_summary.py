"""Summarize the ESPN draft-prospect samples (espn_draft_probe.py): per class, the share of sampled
prospects carrying each attribute and analysis grade, split drafted vs undrafted.

    python projections/lanes/data/espn_draft_summary.py
"""
import json
import os
import pathlib

import pandas as pd

D = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data")) / "espn_draft"


def rows():
    for f in sorted(D.glob("sample_*.json")):
        s = json.loads(f.read_text())
        for r in s["records"]:
            a = {x["name"]: x.get("value") for x in r.get("attributes", [])}
            g = {x["type"]: x.get("grade") for x in r.get("analysis", []) if "grade" in x}
            t = {x["type"]: bool(x.get("text")) for x in r.get("analysis", [])}
            pos = (r.get("position") or {}).get("abbreviation")
            yield {"season": s["season"], "count": s["count"], "drafted": "pick" in r, "pos": pos,
                   "college_ref": bool(r.get("college")), "athlete_ref": bool(r.get("athlete")),
                   **{f"a_{k}": v for k, v in a.items()}, **{f"g_{k}": v for k, v in g.items()},
                   "bottomline_text": t.get("bottomline", False), "predraft_text": t.get("predraft", False)}


def main():
    df = pd.DataFrame(list(rows()))
    cols = [c for c in df.columns if c.startswith(("a_", "g_"))] + ["bottomline_text", "college_ref", "athlete_ref"]
    # an attribute is "present" only when non-null and non-zero (ESPN pads every record with zeros)
    fill = df.groupby("season")[cols].agg(lambda s: (pd.to_numeric(s, errors="coerce").fillna(0) != 0).mean()).round(2)
    fill.insert(0, "n", df.groupby("season").size())
    fill.insert(1, "count", df.groupby("season")["count"].first())
    fill.insert(2, "drafted", df.groupby("season").drafted.mean().round(2))
    pd.set_option("display.width", 250)
    print(fill.to_string())
    und = df[~df.drafted].groupby("season")[[c for c in cols if c.startswith("a_")]].agg(
        lambda s: (pd.to_numeric(s, errors="coerce").fillna(0) != 0).mean()).round(2)
    print("undrafted only:")
    print(und.to_string())
    df.to_csv(D / "summary_rows.csv", index=False)


if __name__ == "__main__":
    main()
