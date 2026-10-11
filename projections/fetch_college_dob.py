"""Refresh projections/college-dob.csv: real birth dates for the M.college prospects.

Key-free sources, best first:
  wikipedia  infobox {{birth date|Y|M|D}} on an article whose title starts with his name and
             whose text names his school (search "<name> <school> American football")
  wikidata   P569 on the item whose ESPN college id (P7262) is his cid
Every date must fall in cls-25..cls-18. ESPN's athlete API and roster files carry no usable
college DOBs; the On3 college profiles probed had none; Bo Jackson style name collisions are why a
bare name match is never enough.

The model build reads the CSV and never touches the network. A birth date does not change, so
only prospects with no row yet are looked up (delete a row to look him up again). Run this by
hand when the prospect list changes, then rebuild:
    python projections/fetch_college_dob.py
    python projections/build_prospect_model.py
"""
from __future__ import annotations

import csv
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "projections" / "college-dob.csv"
MODEL = ROOT / "site" / "data" / "prospect-model.js"
UA = {"User-Agent": "ff-prospects-dob/1.0 (personal research; key-free; low rate)"}
WP = "https://en.wikipedia.org/w/api.php?"
COLS = ["cid", "name", "school", "cls", "dob", "source", "source_url"]
BD = re.compile(r"\{\{\s*birth[ _]date(?:[ _]and[ _]age)?\s*\|(?:[^|}]*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", re.I)


def get(url: str) -> dict:
    for k in range(8):  # Wikipedia answers bursts with 429
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503):
                raise
            time.sleep(max(int(e.headers.get("Retry-After") or 0), 10 * (k + 1)))
    raise RuntimeError(f"rate limited: {url[:80]}")


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s.lower()))


def plausible(y: int, cls: int) -> bool:
    return cls - 25 <= y <= cls - 18


def wikipedia(r: dict) -> dict | None:
    time.sleep(1)   # one request a second, one thread: polite enough that 429s stay rare
    try:
        return _wikipedia(r)
    except Exception as e:   # one bad row keeps its cached date (or none) instead of sinking the run
        print("wikipedia failed:", r["n"], str(e)[:80])
        return None


def _wikipedia(r: dict) -> dict | None:
    q = get(WP + urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrsearch": f"{r['n']} {r['sch']} American football",
        "gsrlimit": 4, "prop": "revisions", "rvprop": "content", "rvslots": "main",
        "format": "json", "formatversion": 2}))
    want = norm(r["n"])
    for h in sorted(q.get("query", {}).get("pages", []), key=lambda x: x.get("index", 9)):
        if not norm(h["title"].split("(")[0]).startswith(want[:max(6, len(want) - 2)]):
            continue
        text = h["revisions"][0]["slots"]["main"]["content"]
        if r["sch"].split()[0].lower() not in text.lower():
            continue
        m = BD.search(text)
        if m and plausible(int(m.group(1)), r["cls"]):
            y, mo, d = map(int, m.groups())
            return {"dob": f"{y:04d}-{mo:02d}-{d:02d}", "source": "wikipedia",
                    "source_url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(h["title"].replace(" ", "_"))}
    return None


def wikidata(rows: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(rows), 150):
        vals = " ".join(json.dumps(str(r["cid"])) for r in rows[i:i + 150])
        q = f"SELECT ?id ?dob ?item WHERE {{ VALUES ?id {{ {vals} }} ?item wdt:P7262 ?id; wdt:P569 ?dob . }}"
        for b in get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))["results"]["bindings"]:
            out[b["id"]["value"]] = {"dob": b["dob"]["value"][:10], "source": "wikidata", "source_url": b["item"]["value"]}
    return out


def main() -> None:
    s = MODEL.read_text(encoding="utf-8")
    rows = json.loads(s[s.index("{"):s.rindex("}") + 1])["college"]
    old = {r["cid"]: r for r in csv.DictReader(OUT.open(encoding="utf-8"))} if OUT.exists() else {}
    todo = [r for r in rows if str(r["cid"]) not in old]
    wp = [wikipedia(r) for r in todo]
    wd = wikidata(todo) if todo else {}
    found, conflicts = {}, []
    for r, w in zip(todo, wp):
        cid = str(r["cid"])
        d = wd.get(cid)
        if d and not plausible(int(d["dob"][:4]), r["cls"]):
            d = None
        hit = w or d
        if w and d and w["dob"] != d["dob"]:
            conflicts.append((r["n"], w["dob"], d["dob"]))
        if hit:
            found[cid] = {"cid": cid, "name": r["n"], "school": r["sch"], "cls": r["cls"], **hit}
    rows_out = {**old, **found}  # a player who drops off the list keeps his row for when he returns
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, COLS, lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(rows_out.values(), key=lambda x: (int(x["cls"]), x["name"])))
    by: dict[tuple, list] = {}
    for r in rows:
        k = (r["cls"], r["p"])
        by.setdefault(k, [0, 0])
        by[k][0] += 1
        by[k][1] += str(r["cid"]) in rows_out
    dated = [rows_out[str(r["cid"])] for r in rows if str(r["cid"]) in rows_out]
    print(f"{len(found)} new of {len(todo)} looked up; {len(dated)} of {len(rows)} prospects dated "
          f"(wikipedia {sum(v['source'] == 'wikipedia' for v in dated)}, "
          f"wikidata {sum(v['source'] == 'wikidata' for v in dated)})")
    print("  ".join(f"{c} {p} {h}/{n}" for (c, p), (n, h) in sorted(by.items())))
    for c in conflicts:
        print("wikipedia vs wikidata, kept wikipedia:", *c)


if __name__ == "__main__":
    main()
