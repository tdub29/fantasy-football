"""Grab the PrizePicks season board with a REAL headed browser, then hand it to
fetch_prizepicks.py --from-file. Removes the manual save-the-JSON-by-hand step.

The trick is not the browser, it's the headed browser. Verified 2026-08-18: identical
code headless gets a geo.captcha-delivery.com 403 from DataDome; with headless=False the
same page earns the cookie and the in-page fetch returns 200 / 1351 rows. So do not
"optimize" this to headless -- a window opening for ~15s IS the mechanism. curl_cffi with
Chrome TLS impersonation still 403s, which is why fetch_prizepicks.py's live path is dead.

The API call is made from inside the page, not from Python, so it carries the same cookie
jar, TLS session and Origin the challenge just cleared.

Leagues: 163 = NFLSZN (the season board). 9 = NFL weekly.

Usage (plain `python`; needs playwright, already installed workspace-wide):
  python grab_prizepicks_browser.py                 # fetch + parse + write repo file
  python grab_prizepicks_browser.py --headless      # will almost certainly 403, for testing
  python grab_prizepicks_browser.py --raw-only out.json
"""
import json, sys, subprocess, argparse, pathlib

HERE = pathlib.Path(__file__).parent


def grab(league, headless):
    from playwright.sync_api import sync_playwright
    url = (f"https://api.prizepicks.com/projections?league_id={league}"
           "&per_page=250&page=1&single_stat=true")
    with sync_playwright() as p:
        b = p.chromium.launch(headless=headless,
                              args=["--disable-blink-features=AutomationControlled"])
        ctx = b.new_context(locale="en-US", timezone_id="America/Los_Angeles",
                            viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        pg.goto("https://app.prizepicks.com/", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(6000)  # let DataDome's script run and set its cookie
        res = pg.evaluate("""async (u) => {
            const r = await fetch(u, {headers: {Accept: 'application/json'}, credentials: 'include'});
            return {status: r.status, body: await r.text()};
        }""", url)
        b.close()
    if res["status"] != 200 or not res["body"].lstrip().startswith("{"):
        raise SystemExit(f"blocked ({res['status']}): {res['body'][:160]}")
    return res["body"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="163", help="163 = NFLSZN season board, 9 = weekly")
    ap.add_argument("--headless", action="store_true", help="expect a DataDome 403")
    ap.add_argument("--out", default="prizepicks-nfl-season-lines.json")
    ap.add_argument("--raw-only", metavar="FILE", help="save raw JSON:API and stop")
    a = ap.parse_args()

    body = grab(a.league, a.headless)
    rows = len(json.loads(body).get("data", []))
    raw = pathlib.Path(a.raw_only) if a.raw_only else HERE / "_prizepicks-raw.json"
    raw.write_text(body, encoding="utf-8")
    print(f"grabbed {rows} rows -> {raw.name}")
    if a.raw_only:
        return
    subprocess.run([sys.executable, str(HERE / "fetch_prizepicks.py"),
                    "--league", a.league, "--from-file", str(raw), "--out", a.out],
                   check=True, cwd=HERE)


if __name__ == "__main__":
    main()
