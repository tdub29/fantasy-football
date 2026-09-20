"""Grab the PrizePicks season board with a REAL headed browser, then hand it to
fetch_prizepicks.py --from-file. Removes the manual save-the-JSON-by-hand step.

Headed is necessary but it was never sufficient. Three things were wrong, all found
2026-09-16:

1. FRESH CONTEXT EVERY RUN. new_context() meant no cookie and no history, so every run
   arrived as a brand-new visitor and DataDome eventually challenged the PAGE LOAD itself,
   not just the API call (page title came back as bare 'prizepicks.com' with zero API
   requests). A persistent profile plus the REAL installed Chrome cleared it on the first
   try: title 'PrizePicks | America's #1 Fantasy Sports App', challenged=False.
2. WRONG HOST. The API's own links.self says api.prod01.universe.prizepicks.com. The old
   host still answers but is not canonical.
3. WRONG BOARD, and this is the one that silently cost the most. League 163 is the SEASON
   board and it is EMPTY mid-season: {"data":[]}, total_pages 1, 186 bytes. The step
   reported success while writing zero rows, so build_offense_components.py has been
   falling back to Sleeper for weeks without anyone seeing an error. League 9 (weekly)
   carried 5,163 projections across 48 stat types on the same day.

Do not "optimize" this to headless, and do not truncate the response: the weekly payload
is ~6MB and slicing it mid-string is what broke the first fix attempt.

Leagues: 9 = NFL weekly (the live board in season). 163 = NFLSZN season board.

No tackle props exist. Checked 2026-09-16 against the full weekly board: the only
defensive markets are Sacks (31) and INT (50). IDP tackle work stays model-based.

Usage (plain `python`; needs playwright, already installed workspace-wide):
  python grab_prizepicks_browser.py                 # fetch + parse + write repo file
  python grab_prizepicks_browser.py --headless      # will almost certainly 403, for testing
  python grab_prizepicks_browser.py --raw-only out.json
"""
import json, sys, subprocess, argparse, pathlib

HERE = pathlib.Path(__file__).parent


HOSTS = ("api.prod01.universe.prizepicks.com", "api.prizepicks.com")
# The profile lives beside the script so the DataDome cookie and the browsing
# history survive between runs. That persistence IS the fix.
PROFILE = HERE / ".pp-profile"


def grab(league, headless):
    from playwright.sync_api import sync_playwright
    PROFILE.mkdir(exist_ok=True)
    with sync_playwright() as p:
        # channel="chrome" is the real installed browser, which fingerprints far
        # better than bundled Chromium. Fall back to Chromium if Chrome is absent.
        ctx = None
        for channel in ("chrome", None):
            try:
                ctx = p.chromium.launch_persistent_context(
                    str(PROFILE), headless=headless, channel=channel,
                    args=["--disable-blink-features=AutomationControlled", "--no-first-run",
                          "--no-default-browser-check", "--disable-session-crashed-bubble"],
                    locale="en-US", timezone_id="America/Los_Angeles",
                    viewport={"width": 1440, "height": 900})
                break
            except Exception:
                continue
        if ctx is None:
            raise SystemExit("could not launch a browser")
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        # wait_until="commit", not "domcontentloaded": under the challenge script
        # the SPA may never fire that event and the navigation times out.
        try:
            pg.goto("https://app.prizepicks.com/", wait_until="commit", timeout=45000)
        except Exception:
            pass
        pg.wait_for_timeout(12000)
        title = pg.title()
        res, used = None, None
        for host in HOSTS:
            url = (f"https://{host}/projections?league_id={league}"
                   "&per_page=250&page=1&single_stat=true")
            r = pg.evaluate("""async (u) => {
                const r = await fetch(u, {headers: {Accept: 'application/json'}, credentials: 'include'});
                return {status: r.status, body: await r.text()};
            }""", url)
            if r["status"] == 200 and r["body"].lstrip().startswith("{"):
                res, used = r, host
                break
            print(f"  {host} -> {r['status']}")
        ctx.close()
    if res is None:
        raise SystemExit(f"blocked on every host (page title was {title!r})")
    print(f"  host {used}, page title {title!r}")
    return res["body"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="9",
                    help="9 = NFL weekly (default; the live board in season), 163 = season")
    ap.add_argument("--headless", action="store_true", help="expect a DataDome 403")
    # The default league is 9, the WEEKLY board, so the default out file has to be
    # the weekly one. It was the season file, which meant the one scripted call per
    # refresh wrote a weekly board into a file named "season" and left
    # prizepicks-nfl-weekly-lines.json, the file build_weekly_rankings.py actually
    # reads, untouched by the pipeline. It sat two days stale with every step green.
    ap.add_argument("--out", default=None,
                    help="defaults to the file matching --league: weekly for 9, season for 163")
    ap.add_argument("--raw-only", metavar="FILE", help="save raw JSON:API and stop")
    a = ap.parse_args()
    if a.out is None:
        a.out = ("prizepicks-nfl-season-lines.json" if str(a.league) == "163"
                 else "prizepicks-nfl-weekly-lines.json")

    body = grab(a.league, a.headless)
    rows = len(json.loads(body).get("data", []))
    # An empty board is not a success. League 163 returns {"data":[]} all season and
    # the old code wrote that happily, which is why nobody noticed for weeks.
    if rows == 0:
        raise SystemExit(f"league {a.league} returned an EMPTY board (0 rows). "
                         f"In season use --league 9; 163 only has props before kickoff.")
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
