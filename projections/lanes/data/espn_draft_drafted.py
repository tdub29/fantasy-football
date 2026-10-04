"""ESPN draft records for every DRAFTED QB/RB/WR/TE, 2008-2026: one site-API call per class lists the
picks (draft-athlete id, ESPN athlete id, grade / ranks), then one core-API call per skill-position
pick fetches the full record (speed, arm, hand, combine fields, durability grade). Key-free GETs,
saved raw to scratch `espn_draft/`.

    python projections/lanes/data/espn_draft_drafted.py [years...]
"""
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from espn_draft_probe import get  # noqa: E402

OUT = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data")) / "espn_draft"
SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season={y}"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{y}/draft/athletes/{i}"
SKILL = {"QB", "RB", "WR", "TE", "FB"}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for y in [int(a) for a in sys.argv[1:]] or range(2008, 2027):
        f = OUT / f"drafted_{y}.json"
        if f.exists():
            continue
        site = get(SITE.format(y=y))
        pos = {p["id"]: p["abbreviation"] for p in site.get("positions", [])}
        recs = []
        for p in site.get("picks", []):
            a = p.get("athlete") or {}
            if pos.get((a.get("position") or {}).get("id")) not in SKILL:
                continue
            recs.append({"pick": p.get("overall"), "site": a, "core": get(CORE.format(y=y, i=a["id"]))})
            time.sleep(0.2)
        f.write_text(json.dumps({"season": y, "records": recs}))
        print(y, len(recs), flush=True)


if __name__ == "__main__":
    main()
