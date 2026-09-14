"""Pull PrizePicks NFL player lines (free, no key) and parse to clean per-player rows.

PrizePicks' pick'em numbers ARE the market line for each stat (Pass Yards, Rush+Rec
Yds, Receptions, etc.). JSON:API endpoint, no auth. BUT it now sits behind DataDome
on top of Cloudflare, so the live fetch is effectively dead from a script: verified
2026-08-11 that curl_cffi (browser TLS) 403s and headless Chrome gets served a
geo.captcha-delivery.com challenge even from this residential IP. The parser is the
valuable part -- feed it a dump saved from a real logged-in browser.

Leagues: 9 = NFL weekly props. 163 = NFLSZN, the season-long board that
build_offense_components.py reads (prizepicks-nfl-season-lines.json).

Usage (plain `python` is fine -- these scripts are stdlib-only, no venv needed):
  python fetch_prizepicks.py                      # try live fetch, NFL weekly (league 9)
  python fetch_prizepicks.py --all-odds           # include demon/goblin variants
  # season board, from a browser dump (the path that actually works):
  python fetch_prizepicks.py --league 163 --from-file szn.json --out prizepicks-nfl-season-lines.json

Getting the dump (~1 min, real browser, no keys): open
https://api.prizepicks.com/projections?league_id=163&per_page=250&page=1&single_stat=true
in the Chrome you already browse PrizePicks in and save the JSON. ONE page is the
whole board -- `per_page` is ignored on this endpoint and the response says
`meta.total_pages: 1` (1346 rows / 290 players on 2026-08-11), so page=2 and page=3
return byte-identical copies. Don't bother walking pages by hand. --from-file still
takes several files for the day PrizePicks starts paginating again:
  --from-file page1.json page2.json
"""
import json, sys, argparse, urllib.request, urllib.error, pathlib, time

HERE = pathlib.Path(__file__).parent
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept": "application/json",
           "Origin": "https://app.prizepicks.com", "Referer": "https://app.prizepicks.com/"}

def url_for(league, page, per=250):
    return (f"https://api.prizepicks.com/projections?league_id={league}"
            f"&per_page={per}&page={page}&single_stat=true")

# PrizePicks sits behind Cloudflare which blocks plain-Python by TLS/JA3
# fingerprint (not only IP). curl_cffi impersonates a real Chrome TLS handshake
# and clears it; cloudscraper is a fallback; urllib is last (usually 403s).
def _make_getter():
    try:
        from curl_cffi import requests as creq
        sess = creq.Session()
        return lambda u: creq.get(u, headers=HEADERS, impersonate="chrome", timeout=30), "curl_cffi"
    except Exception:
        pass
    try:
        import cloudscraper
        sc = cloudscraper.create_scraper()
        return lambda u: sc.get(u, headers=HEADERS, timeout=30), "cloudscraper"
    except Exception:
        pass
    def _urllib(u):
        with urllib.request.urlopen(urllib.request.Request(u, headers=HEADERS), timeout=30) as r:
            class R:  # minimal shim to match .status_code/.json()
                status_code = 200
                _d = json.load(r)
                def json(self): return R._d
            return R()
    return _urllib, "urllib(no bypass)"

def fetch_pages(league):
    get, engine = _make_getter()
    print(f"http engine: {engine}")
    pages = []
    for page in range(1, 21):
        u = url_for(league, page)
        try:
            resp = get(u)
            code = getattr(resp, "status_code", 200)
            if code == 403:
                raise urllib.error.HTTPError(u, 403, "Forbidden", {}, None)
            doc = resp.json() if callable(getattr(resp, "json", None)) else resp.json
        except urllib.error.HTTPError as e:
            if getattr(e, "code", None) == 403 and page == 1:
                print("403 Forbidden. Cloudflare still blocking. Fixes, in order:")
                print("  1) pip install curl_cffi   (browser-TLS impersonation — usually clears it)")
                print("  2) open this URL in your browser, save the JSON, run --from-file raw.json:")
                print(f"     {url_for(league,1)}")
                sys.exit(2)
            break
        if not doc.get("data"):
            break
        pages.append(doc)
        if len(doc["data"]) < 250:
            break
        time.sleep(1)
    return pages

def parse(docs, keep_all_odds):
    players, stat_names = {}, {}
    rows = []
    for doc in docs:
        for inc in doc.get("included", []):
            a = inc.get("attributes", {})
            if inc.get("type") == "new_player":
                players[inc["id"]] = {"name": a.get("name") or a.get("display_name"),
                                      "team": a.get("team"), "pos": a.get("position")}
            elif inc.get("type") == "stat_type":
                stat_names[inc["id"]] = a.get("name")
        for row in doc.get("data", []):
            a = row.get("attributes", {})
            rel = row.get("relationships", {})
            if not keep_all_odds and a.get("odds_type") not in (None, "standard"):
                continue  # skip demon/goblin alt lines
            pid = (rel.get("new_player", {}).get("data") or {}).get("id")
            p = players.get(pid, {})
            stat = a.get("stat_type") or stat_names.get((rel.get("stat_type", {}).get("data") or {}).get("id"))
            rows.append({
                "player": p.get("name"), "team": p.get("team"), "pos": p.get("pos"),
                "stat_type": stat, "line": a.get("line_score"),
                "start_time": a.get("start_time"), "odds_type": a.get("odds_type"),
            })
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="9", help="PrizePicks league id (9=NFL)")
    ap.add_argument("--all-odds", action="store_true", help="include demon/goblin alt lines")
    ap.add_argument("--from-file", nargs="+", help="parse browser-saved projections JSON (one file per API page) instead of fetching")
    ap.add_argument("--out", default="prizepicks-nfl-lines.json",
                    help="output filename in projections/ (season board: prizepicks-nfl-season-lines.json)")
    args = ap.parse_args()

    if args.from_file:
        docs = [json.loads(pathlib.Path(f).read_text(encoding="utf-8")) for f in args.from_file]
    else:
        docs = fetch_pages(args.league)
    rows = parse(docs, args.all_odds)
    rows = [r for r in rows if r["player"] and r["line"] is not None]

    # per-player pivot: player -> {stat_type: line}
    pivot = {}
    for r in rows:
        key = f"{r['player']}|{r['team']}|{r['pos']}"
        pivot.setdefault(key, {"player": r["player"], "team": r["team"], "pos": r["pos"], "lines": {}})
        pivot[key]["lines"][r["stat_type"]] = r["line"]

    (HERE / args.out).write_text(
        json.dumps({"league": args.league, "count": len(rows), "rows": rows,
                    "players": list(pivot.values())}, ensure_ascii=False, indent=1), encoding="utf-8")
    stats = sorted({r["stat_type"] for r in rows})
    print(f"parsed {len(rows)} lines across {len(pivot)} players -> {args.out}")
    print("stat types:", ", ".join(s for s in stats if s))
    for r in rows[:12]:
        print(f"  {r['player']:22s} {r['team'] or '?':3s} {r['stat_type']:18s} {r['line']}")
    if not rows:
        print("(0 lines — offseason: NFL props post ~preseason/August)")

if __name__ == "__main__":
    main()
