"""Pull KeepTradeCut's daily dynasty-value history, the series behind its own chart.

`build_ktc.py` fetches today's snapshot. This fetches the TIME SERIES, so a player card
can plot value the way keeptradecut.com/dynasty-rankings/players/<slug> plots it.

Where the data is, because it took a while to find and the obvious places are decoys:
  - The rankings page payload (`<script id="ktc-players">`) carries a `history` key on
    every player and it is ALWAYS an empty array. So is `pd-players` on a player page.
    Both look like the answer and neither is.
  - The real series is on the player page in `<script type="application/json"
    id="pd-superflex">` and its `pd-oneqb` sibling, as TOP-LEVEL keys, not per-player:
        overallValue            [{d: "YYMMDD", v: 5232}, ...]   1285 points
        overallRankHistory      same shape, overall rank
        positionalRankHistory   same shape, positional rank
    Measured 2026-09-17 on Jahmyr Gibbs: 1285 daily points from 2023-03-10.
  - vft* and blend* are KTC's alternate value models. Only the plain series is taken;
    adding three models per player triples the payload to answer nothing we ask.

Storage: daily x 500 players x 2 formats is about 1.3M points, which is not something to
ship to a phone. Sampled WEEKLY by default (`--every 7`), which is about 184 points per
player per format and still far denser than the per-season chart it replaces.

Usage:
    python site/data/build_ktc_history.py                 # every ranked player, weekly
    python site/data/build_ktc_history.py --limit 25      # smoke test
    python site/data/build_ktc_history.py --every 1       # full daily, big
"""
import argparse
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "site" / "data" / "ktc-history.js"
RANKINGS = "https://keeptradecut.com/dynasty-rankings"
PLAYER = "https://keeptradecut.com/dynasty-rankings/players/{slug}"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Safari/537.36"}
# id -> the key we store it under. Both formats come off the same page fetch.
FORMATS = {"pd-superflex": "sf", "pd-oneqb": "one"}
# Only the value series. positionalRankHistory was carried for one revision and
# nothing plotted it, at the cost of half the payload.
SERIES = {"overallValue": "v"}


def get(url, tries=3, timeout=40):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "ignore")
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == tries - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def script_json(html, script_id):
    m = re.search(rf'<script[^>]*id=["\']{script_id}["\'][^>]*>(.*?)</script>',
                  html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def roster():
    """[(playerID, slug, name, pos)] off the rankings page, in rank order."""
    html = get(RANKINGS)
    if not html:
        raise SystemExit("could not fetch the rankings page")
    players = script_json(html, "ktc-players")
    if not players:
        raise SystemExit("ktc-players payload missing; the page shape changed")
    return [(p["playerID"], p["slug"], p["playerName"], p.get("position"))
            for p in players if p.get("slug")]


def series_for(html, every):
    """{fmt: {series: [[dateYYMMDD, value], ...]}} for one player page."""
    out = {}
    for script_id, fmt in FORMATS.items():
        blob = script_json(html, script_id)
        if not blob:
            continue
        got = {}
        for src, dest in SERIES.items():
            pts = blob.get(src)
            if not isinstance(pts, list) or not pts:
                continue
            # Keep the LAST point regardless of the sampling stride, or today's value
            # silently disappears and the chart's headline number is a week stale.
            sampled = pts[::every]
            if sampled[-1] is not pts[-1]:
                sampled = sampled + [pts[-1]]
            got[dest] = [[p["d"], p["v"]] for p in sampled
                         if isinstance(p, dict) and "d" in p and "v" in p]
        if got:
            out[fmt] = got
    return out


def compact(out, every, failed):
    """Intern the date grids. Measured 2026-09-17: 500 players share only 79 distinct
    grids, so storing dates per player spent 3.9 of 4.8 MB repeating the same strings.

    Grids differ at all because each player's series is sampled from HIS first date, so
    the weekly phase varies. Interning is robust to that; aligning everyone onto one
    calendar would need a daily crawl and would not shrink it further."""
    grids, gidx = [], {}
    players = {}
    for pid, rec in out.items():
        entry = {"name": rec["name"], "pos": rec["pos"]}
        for fmt in FORMATS.values():
            v = (rec.get(fmt) or {}).get("v")
            if not v:
                continue
            key = tuple(d for d, _ in v)
            if key not in gidx:
                gidx[key] = len(grids)
                grids.append(list(key))
            entry[fmt] = [gidx[key], [int(val) for _, val in v]]
        if len(entry) > 2:
            players[pid] = entry
    return {"generated": time.strftime("%Y-%m-%d"), "every": every,
            "grids": grids, "players": players, "failed": failed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only the top N ranked players")
    ap.add_argument("--every", type=int, default=7, help="keep every Nth point (7 = weekly)")
    ap.add_argument("--sleep", type=float, default=1.2, help="seconds between player fetches")
    args = ap.parse_args()

    people = roster()
    if args.limit:
        people = people[:args.limit]
    print(f"{len(people)} players, sampling every {args.every} days")

    out, failed, points = {}, [], 0
    for i, (pid, slug, name, pos) in enumerate(people, 1):
        html = get(PLAYER.format(slug=slug))
        s = series_for(html, args.every) if html else None
        if not s:
            failed.append(name)
        else:
            out[str(pid)] = {"name": name, "pos": pos, "slug": slug, **s}
            points += sum(len(v) for f in s.values() for v in f.values())
        if i % 25 == 0 or i == len(people):
            print(f"  {i}/{len(people)}  {points} points  {len(failed)} failed")
        time.sleep(args.sleep)

    if not out:
        raise SystemExit("no histories captured; refusing to write an empty board")
    payload = compact(out, args.every, failed)
    OUT.write_text("window.KTC_HISTORY = " + json.dumps(payload, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out)} players, {points} points, {kb:.0f} KB")
    if failed:
        print(f"  {len(failed)} without a series: {', '.join(failed[:8])}"
              f"{' ...' if len(failed) > 8 else ''}")
    return 0


def self_check():
    """One real player, proving the extraction path rather than the crawl."""
    html = get(PLAYER.format(slug="jahmyr-gibbs-1415"))
    assert html, "could not fetch the probe player"
    s = series_for(html, 7)
    assert "sf" in s and "one" in s, f"both formats expected, got {list(s)}"
    v = s["sf"]["v"]
    assert len(v) > 100, f"a weekly series since 2023 should be 150+ points, got {len(v)}"
    assert re.fullmatch(r"\d{6}", v[0][0]), f"date should be YYMMDD, got {v[0][0]!r}"
    assert v[0][0] < v[-1][0], "series should run oldest to newest"
    assert all(isinstance(p[1], int) for p in v), "values should be ints"
    # The decoys, asserted so a future change to KTC's shape is loud rather than empty.
    rank = script_json(get(RANKINGS), "ktc-players")
    g = next(p for p in rank if p["playerID"] == 1415)
    assert not (g["superflexValues"].get("history") or []), \
        "the rankings page now carries history; prefer it and drop the per-player crawl"
    print(f"self-check ok: {len(v)} weekly points, {v[0]} .. {v[-1]}")
    return 0


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        sys.exit(self_check())
    sys.exit(main())
