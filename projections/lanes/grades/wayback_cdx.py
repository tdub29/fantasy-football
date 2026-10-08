"""Wayback Machine CDX inventory of ESPN draft-prospect pages and JSON (key-free, read-only GETs).
Writes one JSON list per URL prefix to scratch `wayback/cdx_<name>.json` (timestamp, original,
status, mime, digest), then prints snapshot counts by year-month.

    python projections/lanes/grades/wayback_cdx.py [name ...]
"""
import collections
import json
import os
import pathlib
import sys
import time
import urllib.parse
import urllib.request

SCR = pathlib.Path(os.environ.get("LANE_GRADES", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-grades")) / "wayback"
CDX = "http://web.archive.org/cdx/search/cdx"
PREFIXES = {
    "site_athlete": "site.api.espn.com/apis/site/v2/sports/football/nfl/draft/athlete/",
    "site_draft": "site.api.espn.com/apis/site/v2/sports/football/nfl/draft",
    "core_draft": "sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/",
    "best_available": "www.espn.com/nfl/draft/bestavailable",
    "go_best_available": "espn.go.com/nfl/draft/bestavailable",
    "insider_player": "insider.espn.go.com/nfl/draft/player/",
    "insider_com_player": "insider.espn.com/nfl/draft/player/",
    "go_player": "espn.go.com/nfl/draft/player/",
    "com_player": "www.espn.com/nfl/draft/player/",
    "insider_rankings": "insider.espn.go.com/nfl/draft/rankings",
    "go_rankings": "espn.go.com/nfl/draft/rankings",
    "com_rankings": "www.espn.com/nfl/draft/rankings",
}


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as ex:  # noqa: BLE001  (retry then report)
            err = ex
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def cdx(prefix):
    q = {"url": prefix, "matchType": "prefix", "output": "json", "fl": "timestamp,original,statuscode,mimetype,digest",
         "filter": "statuscode:200"}
    pages = int(get(CDX + "?" + urllib.parse.urlencode({**q, "showNumPages": "true"})).strip() or 0)
    rows = []
    for p in range(max(pages, 1)):
        txt = get(CDX + "?" + urllib.parse.urlencode({**q, "page": p}))
        js = json.loads(txt) if txt.strip() else []
        rows += js[1:] if js and js[0][0] == "timestamp" else js
        time.sleep(1)
    return rows


def main():
    SCR.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[1:] or PREFIXES:
        f = SCR / f"cdx_{name}.json"
        if not f.exists():
            f.write_text(json.dumps(cdx(PREFIXES[name])))
        rows = json.loads(f.read_text())
        by = collections.Counter(r[0][:6] for r in rows)
        months = " ".join(f"{k}:{v}" for k, v in sorted(by.items()) if k[4:6] in ("01", "02", "03", "04", "05"))
        print(f"{name}: {len(rows)} snapshots; Jan-May by month: {months[:900]}", flush=True)


if __name__ == "__main__":
    main()
