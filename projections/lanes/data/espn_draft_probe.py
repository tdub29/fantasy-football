"""Probe ESPN's key-free draft-prospect records (core API `seasons/<y>/draft/athletes`): what each
class carries (Scouts Inc grade, overall and position rank, 40 time, arm, hand, durability grade),
for drafted and undrafted prospects. Samples N records per class, saves raw JSON to scratch.

    python projections/lanes/data/espn_draft_probe.py [N] [years...]
"""
import json
import os
import pathlib
import random
import sys
import time
import urllib.request

OUT = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data")) / "espn_draft"
BASE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{y}/draft/athletes"


def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(url.replace("http://", "https://"), timeout=60) as r:
                return json.load(r)
        except Exception as ex:  # noqa: BLE001  (retry then report)
            err = ex
            time.sleep(2 * (i + 1))
    raise SystemExit(f"{url}: {err}")


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    years = [int(a) for a in sys.argv[2:]] or list(range(2008, 2027))
    OUT.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(7)
    for y in years:
        f = OUT / f"sample_{y}.json"
        if f.exists():
            continue
        head = get(BASE.format(y=y) + "?limit=1")
        pages = (head["count"] + 99) // 100
        refs = []
        for p in rnd.sample(range(1, pages + 1), min(pages, 3)):
            refs += [i["$ref"] for i in get(BASE.format(y=y) + f"?limit=100&page={p}")["items"]]
        recs = []
        for ref in rnd.sample(refs, min(n, len(refs))):
            recs.append(get(ref))
            time.sleep(0.2)
        f.write_text(json.dumps({"season": y, "count": head["count"], "records": recs}))
        print(y, head["count"], len(recs))


if __name__ == "__main__":
    main()
