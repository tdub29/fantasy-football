"""NFL Mock Draft Database consensus big board, read from the LAST Wayback capture made strictly before
each draft day (UTC). Key-free read-only GETs; raw HTML cached to scratch with sha256 so the parse is
reproducible. Rows: board rank, peak rank, name, pos, school, projected pick (consensus mock), team.

    python projections/lanes/overall/nfmdd_wayback.py [year ...]      # writes scratch nfmdd_predraft.csv
    python projections/lanes/overall/nfmdd_wayback.py --selftest      # parser check on cached 2020 page
"""
import csv
import hashlib
import html
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

SCR = pathlib.Path(os.environ.get("LANE_OVERALL_SCRATCH", r"C:\Users\TrevorWhite\.claude\jobs\ea66a469\tmp\nfmdd"))
URL = "https://www.nflmockdraftdatabase.com/big-boards/{y}/consensus-big-board-{y}"
# Round 1 start dates; a capture must be from an EARLIER UTC day, so draft-night edits cannot leak.
DRAFT_DAY = {2016: "20160428", 2017: "20170427", 2018: "20180426", 2019: "20190425", 2020: "20200423",
             2021: "20210429", 2022: "20220428", 2023: "20230427", 2024: "20240425", 2025: "20250424",
             2026: "20260423"}

# Markup changed every year or two; reading each <li> as plain text survives all of 2020-2025.
TXT = re.compile(r"^(\d+) Peak: (\d+) (.+) (\S+) \| (.+?)(?: \d+)?"
                 r"(?: Projected to be drafted at: #(\d+) (.+)| # (\d+) Projection # \d+| -- Projection N/A)?\s*$")


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except Exception as ex:  # noqa: BLE001  (Wayback rate-limits; back off then report)
            err = ex
            time.sleep(10 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def last_predraft(y):
    q = (f"http://web.archive.org/cdx/search/cdx?url={URL.format(y=y).split('//')[1]}"
         f"&from={y - 1}0901&to={DRAFT_DAY[y]}&fl=timestamp&filter=statuscode:200&output=json")
    ts = [r[0] for r in json.loads(get(q))[1:] if r[0][:8] < DRAFT_DAY[y]]
    return max(ts) if ts else None


def parse(raw):
    """Board rows. proj_pick is the site's consensus projected pick: R1 only (32) in 2020, 2021, 2025
    and 2026, about two rounds (63-64) in 2022-2024. Past that depth proj_pick is None (censored)."""
    m = re.search(r'data-react-class="big_boards/Consensus" data-react-props="([^"]*)"', raw)
    if m:  # 2026+: React props JSON, no peak rank
        sel = json.loads(html.unescape(m.group(1)))["mock"]["selections"]
        return [dict(rank=x["pick"], peak=None, name=x["player"]["name"].strip(), pos=x["player"]["position"],
                     school=(x["player"]["college"] or {}).get("name"),
                     proj_pick=(x["consensus"] or {}).get("pick"),
                     proj_team=(x["consensus"] or {}).get("team_code")) for x in sel]
    out = []
    for li in raw.split("<li")[1:]:
        if "Peak:" not in li:
            continue
        t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", li.split("</li>")[0].split(">", 1)[1]))).strip()
        g = TXT.match(t)
        if not g:
            raise ValueError(f"unparsed board row: {t[:160]}")
        rank, peak, name, pos, school, p1, team, p2 = g.groups()
        proj = p1 or p2
        out.append(dict(rank=int(rank), peak=int(peak), name=name.strip(), pos=pos, school=school.strip(),
                        proj_pick=int(proj) if proj else None, proj_team=team.strip() if team else None))
    return out


def fetch(y):
    ts = last_predraft(y)
    if not ts:
        return ts, None, []
    p = SCR / f"nfmdd_{y}_{ts}.html"
    if not p.exists():
        p.write_bytes(get(f"http://web.archive.org/web/{ts}id_/{URL.format(y=y)}"))
    raw = p.read_bytes()
    return ts, hashlib.sha256(raw).hexdigest(), parse(raw.decode("utf-8", "replace"))


def selftest():
    raw = next(SCR.glob("nfmdd_2020_*.html")).read_text("utf-8", "replace")
    rows = parse(raw)
    assert rows[0]["name"] == "Joe Burrow" and rows[0]["proj_pick"] == 1, rows[0]
    jt = next(r for r in rows if r["name"] == "Jonathan Taylor")
    assert (jt["rank"], jt["peak"], jt["pos"], jt["school"]) == (48, 38, "RB", "Wisconsin"), jt
    assert [r["rank"] for r in rows] == list(range(1, 151)), len(rows)
    assert sum(r["proj_pick"] is not None for r in rows) == 32
    print("selftest ok", len(rows), "rows")


if __name__ == "__main__":
    SCR.mkdir(parents=True, exist_ok=True)
    if "--selftest" in sys.argv:
        selftest()
        sys.exit()
    years = [int(a) for a in sys.argv[1:]] or sorted(DRAFT_DAY)
    rows, prov = [], []
    for y in years:
        ts, sha, rs = fetch(y)
        prov.append(dict(year=y, capture=ts, sha256=sha, rows=len(rs),
                         with_proj=sum(r["proj_pick"] is not None for r in rs)))
        print(prov[-1], flush=True)
        rows += [dict(year=y, capture=ts, **r) for r in rs]
        time.sleep(5)
    with open(SCR / "nfmdd_predraft.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["year", "capture", "rank", "peak", "name", "pos", "school", "proj_pick", "proj_team"])
        w.writeheader()
        w.writerows(rows)
    (SCR / "nfmdd_provenance.json").write_text(json.dumps(prov, indent=1))
