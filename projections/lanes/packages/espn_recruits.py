"""ESPN recruiting records for one or more recruit classes, the endpoint cfbfastR::espn_cfb_recruits()
reads (cfbfastR 3.0.0.9000, R/espn_cfb_player.R): the class index
`sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/<y>/recruits` lists
record refs, one GET per record. Key-free; ESPN data under ESPN terms (local research use only).

Why: the 247 stars in `cfb_recruit` are null for 20-33% of the 2018-2021 classes and join to college
careers by name only (about 40%). An ESPN recruit record carries `athlete.alternateId`, the ESPN
college athlete id the store's careers are keyed on, so it joins by id.

Raw records are appended unmodified to <scratch>/espn_recruits/raw_<y>.jsonl (resumable: ids already
saved are skipped). Lane prototype; never touches the shared store.

    python projections/lanes/packages/espn_recruits.py 2018 2019 2020 2021
"""
import json
import os
import pathlib
import random
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp")) / "espn_recruits"
BASE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"
HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json",
       "Origin": "https://www.espn.com", "Referer": "https://www.espn.com/"}  # cfbfastR's headers
WORKERS = 6  # ponytail: fixed politeness cap; lower it if ESPN starts refusing


def get(url):
    err = None
    for i in range(4):
        try:
            req = urllib.request.Request(url.replace("http://", "https://"), headers=HDR)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as ex:  # noqa: BLE001  retried, then raised
            err = ex
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def refs(y):
    f = OUT / f"refs_{y}.json"   # the class index, saved once (pageCount GETs)
    if f.exists():
        return json.loads(f.read_text())
    head = get(f"{BASE}/seasons/{y}/recruits?limit=100&lang=en&region=us")
    out = [i["$ref"] for i in head["items"]]
    for p in range(2, head["pageCount"] + 1):
        out += [i["$ref"] for i in get(f"{BASE}/seasons/{y}/recruits?limit=100&page={p}&lang=en&region=us")["items"]]
    assert len(out) == head["count"], (y, len(out), head["count"])
    f.write_text(json.dumps(out))
    return out


def rid(ref):
    return ref.split("/recruits/")[1].split("?")[0]


def main():
    """Args: class years; `--sample N` fetches a fixed random N refs per class (seed 7) instead of all."""
    OUT.mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    n = int(args[args.index("--sample") + 1]) if "--sample" in args else None
    years = [int(a) for a in args if a.isdigit() and (n is None or int(a) != n)]
    for y in years:
        f = OUT / f"raw_{y}.jsonl"
        have = {json.loads(line)["_id"] for line in f.open(encoding="utf-8")} if f.exists() else set()
        pool = refs(y)
        if n:
            pool = random.Random(7).sample(pool, min(n, len(pool)))
        todo = [r for r in pool if rid(r) not in have]
        t = time.time()
        with f.open("a", encoding="utf-8") as fh, ThreadPoolExecutor(WORKERS) as ex:
            for ref, rec in zip(todo, ex.map(get, todo)):
                rec["_id"] = rid(ref)
                fh.write(json.dumps(rec) + "\n")
        print(y, "had", len(have), "fetched", len(todo), f"{time.time() - t:.0f}s")


if __name__ == "__main__":
    main()
