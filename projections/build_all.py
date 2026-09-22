"""One-command pipeline: refresh every data source in dependency order, then stamp
site/data/build-info.js with per-file freshness so the site can show an "as of" badge.

Why this exists: the datasets have a strict dependency order (raw Sleeper + KTC must
land BEFORE projections, which must land BEFORE categories). Running builders ad hoc
produced stale/mis-ordered data (e.g. categories.js built minutes before the
projections it summarizes). This runs the correct order once, is resilient (a failing
step is logged and skipped, the rest still run), and always writes build-info.js from
the real file mtimes at the end so the UI reflects reality regardless of what failed.

Usage:
    python projections/build_all.py            # full refresh (network-heavy)
    python projections/build_all.py --core      # value-critical chain only (skips the
                                                 # slow bio/transaction scrapes + odds)
    python projections/build_all.py --stamp-only # just rewrite build-info.js from mtimes
"""
import subprocess, sys, time, json, pathlib, datetime

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SITE_DATA = ROOT / "site" / "data"
PROJ = HERE

# (label, script path, core?)  — order IS the dependency order.
STEPS = [
    ("raw Sleeper dump + leagues", SITE_DATA / "fetch_sleeper.py",        True),
    ("KTC dynasty rankings",       SITE_DATA / "build_ktc.py",            True),
    ("site data (players/leagues)", SITE_DATA / "build_site_data.py",     True),
    ("trade partner history",       SITE_DATA / "build_trade_history.py", True),
    ("league FAAB history",         PROJ / "build_faab_site_data.py",      True),
    ("IDP rankings",               SITE_DATA / "build_idp.py",            True),
    ("player info (contracts)",    SITE_DATA / "build_player_info.py",    True),
    # (Jacob Gibbs ranks are a manual import — build_jacob_gibbs.py takes an input
    #  file arg, so it's not part of the automated rebuild.)
    # opens a real headed Chrome for ~15s on purpose -- headless gets a DataDome 403.
    ("PrizePicks weekly board",    PROJ / "grab_prizepicks_browser.py",   True),
    ("season props (9-book market)", PROJ / "fetch_season_props.py",      True),
    ("offense components",         PROJ / "build_offense_components.py",  True),
    ("score offense",              PROJ / "score_offense.py",             True),
    ("score defense",              PROJ / "score_defense.py",             True),
    ("weekly rankings",            PROJ / "build_weekly_rankings.py",     True),
    ("FantasyPros expert boards",  PROJ / "build_fantasypros_experts.py", True),
    # Gibbs keeps his weekly board current on CBS, in PPR, 150 deep. That is
    # the same scoring these leagues play and it beats the half-PPR top-12
    # cards he posts to X, which only moved when someone screenshotted them.
    # Registered here so the column ages with everything else instead of
    # quietly sitting on whichever week it was last captured by hand.
    ("Gibbs weekly board (CBS)",   SITE_DATA / "build_gibbs_cbs.py",      True),
    # Two independent publications of the same man's rankings. Agreement is
    # what proves the scrape is still pointed at HIM and at THIS week; a slug
    # that silently resolves to another analyst produces a perfectly healthy
    # looking board, and nothing else in this pipeline would notice.
    ("Gibbs CBS vs his X cards",   SITE_DATA / "check_gibbs_sources.py",  True),
    ("IDP defense-vs-position",    PROJ / "build_idp_dvp.py",             True),
    # The kicker board is modelled in a SEPARATE repo and written back into
    # site/data/kickers.js. It belongs in this list anyway: leaving it out is
    # how a board silently stays on last week beside freshly rebuilt columns,
    # which on a phone look identical. It needs the market lines, so it runs
    # after the odds steps.
    ("kicker board (kicker-analysis)",
     ROOT.parent / "kicker-analysis" / "src" / "kicker_analysis" / "predict_week.py", False),
    ("team environment",           PROJ / "build_environment.py",         True),
    ("strength of schedule",       PROJ / "build_sos.py",                 True),
    ("SOS grid (DvP)",             PROJ / "build_sos_grid.py",            True),
    ("player categories + tiers",  PROJ / "build_categories.py",          True),  # LAST: needs KTC + projections
    # heavy / optional (skipped by --core)
    ("player context",             SITE_DATA / "build_context.py",        False),
    ("player history",             SITE_DATA / "build_history.py",        False),
]

# Files whose freshness the UI cares about, grouped for the badge.
TRACKED = [
    "ktc.js", "players.js", "leagues.js", "projections.js", "categories.js",
    "environment.js", "sos.js", "sos-grid.js", "sleeper-idp.js", "player-info.js",
    "jacob-gibbs.js", "expert-rankings.js", "fantasypros-experts.js",
    "idp-dvp.js", "kickers.js", "gibbs-week.js", "weekly-rankings.js", "sleeper-market.js", "faab.js", "trade-history.js", "context.js", "history.js",
]

def run(label, script, timeout=600):
    if not script.exists():
        print(f"SKIP  {label}: {script.name} not found")
        return {"label": label, "script": script.name, "ok": False, "note": "missing"}
    print(f"\n=== {label}  ({script.name}) ===")
    t0 = time.time()
    try:
        r = subprocess.run([sys.executable, str(script)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=timeout)
        dt = round(time.time() - t0, 1)
        out = (r.stdout or "").strip().splitlines()
        for line in out[-4:]:
            print("   ", line)
        if r.returncode != 0:
            err = (r.stderr or "").strip().splitlines()
            print(f"   FAILED rc={r.returncode} ({dt}s):", err[-1] if err else "")
            return {"label": label, "script": script.name, "ok": False, "seconds": dt}
        print(f"   ok ({dt}s)")
        return {"label": label, "script": script.name, "ok": True, "seconds": dt}
    except subprocess.TimeoutExpired:
        print(f"   TIMEOUT after {timeout}s")
        return {"label": label, "script": script.name, "ok": False, "note": "timeout"}
    except Exception as e:
        print(f"   ERROR: {e}")
        return {"label": label, "script": script.name, "ok": False, "note": str(e)[:120]}

def stamp():
    files = {}
    for name in TRACKED:
        p = SITE_DATA / name
        if p.exists():
            files[name] = datetime.datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds")
    payload = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "files": files}
    (SITE_DATA / "build-info.js").write_text(
        "window.BUILD_INFO = " + json.dumps(payload, indent=2) + ";\n", encoding="utf-8")
    print(f"\nstamped build-info.js: {len(files)} files")
    return payload

def main():
    args = set(sys.argv[1:])
    if "--stamp-only" in args:
        stamp(); return
    core_only = "--core" in args
    results = []
    for label, script, is_core in STEPS:
        if core_only and not is_core:
            print(f"\n--- skip (non-core): {label}")
            continue
        results.append(run(label, script))
    info = stamp()
    ok = sum(1 for r in results if r.get("ok"))
    print(f"\n{'='*48}\npipeline done: {ok}/{len(results)} steps ok")
    for r in results:
        if not r.get("ok"):
            print(f"  FAILED: {r['label']} ({r.get('note','rc!=0')})")

if __name__ == "__main__":
    main()
