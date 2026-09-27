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
    # His weekly board, from FantasyPros (filters=1576:1576). It replaced the
    # CBS scrape on 2026-09-24: his "Week 3 FLEX Top-100 (PPR)" post on X
    # matched this board 94/100 exact while CBS sat a mean 11 flex spots off.
    ("Gibbs weekly board (FantasyPros)", SITE_DATA / "build_gibbs_ros_fp.py", True, ["--board", "week"]),
    # He DOES have a rest-of-season board on FantasyPros, reachable only as
    # filters=1576:1576; the bare form is ignored and hands back consensus.
    # These two run in order: the deep board first, then his own newer
    # per-player restatements from X layered on top of it.
    ("Gibbs ROS board (FantasyPros)", SITE_DATA / "build_gibbs_ros_fp.py", True),
    ("Gibbs ROS per-player updates (X)", SITE_DATA / "refresh_gibbs_ros.py", False),
    # Two independent publications of the same man's rankings. Agreement is
    # what proves the scrape is still pointed at HIM and at THIS week; a slug
    # that silently resolves to another analyst produces a perfectly healthy
    # looking board, and nothing else in this pipeline would notice.
    ("Gibbs week board vs his X posts", SITE_DATA / "check_gibbs_sources.py", True),
    # DERIVED full-PPR re-rank of his half-PPR ROS board (his week board he
    # titles PPR himself, so it is not re-ranked).
    ("Gibbs PPR adjustment",       SITE_DATA / "build_gibbs_ppr.py",      True),
    # Advanced stats for every skill player and team, all from nflverse:
    # play-by-play, snap counts, Next Gen Stats, PFR advanced, QBR, injuries,
    # depth charts. The one builder that owns site/data/advanced.js.
    ("nflverse advanced stats",    PROJ / "build_nflverse_suite.py",      True, ["--all"]),
    # Stats Lab split cube (seasons x weeks x situations), from the pbp and FTN
    # files the suite just refreshed, then proven against the advanced.js it wrote.
    ("Stats Lab split cube",       PROJ / "build_split_cube.py",          True),
    ("split cube vs advanced.js",  PROJ / "build_split_cube.py",          True, ["--self-check"]),
    # Stats Lab Coverage tab: man/zone, shells, personnel, formation, pressure and
    # targeted routes from nflverse participation. A season nflverse has not
    # posted yet is written as "not published" and lights up once it appears.
    ("Stats Lab coverage splits",  PROJ / "build_coverage_splits.py",     True),
    ("coverage vs participation",  PROJ / "build_coverage_splits.py",     True, ["--self-check"]),
    # Field location maps: QB throws and receiver targets by pass_location x depth
    # band, RB carries by run gap, read from the cache the suite just refreshed and
    # proven to add back up to advanced.js.
    ("Stats Lab location maps",    PROJ / "build_location_splits.py",     True),
    ("location maps vs advanced.js", PROJ / "build_location_splits.py",   True, ["--self-check"]),
    # Stats Lab On/Off tab: team and teammate splits with a player on vs off the
    # field (participation, play level; snap counts, game level, for a season
    # nflverse has not posted participation for) and game splits by starting QB
    # and playcaller, then recounted from the source files: on + off == team.
    ("Stats Lab on/off + game splits", PROJ / "build_onoff.py",          True),
    ("on/off vs participation",    PROJ / "build_onoff.py",               True, ["--self-check"]),
    # Postgame game pages (#game/:id): drive chart, play-by-play with EPA and win
    # probability, top WPA plays and receiver target lines for every finished
    # game, then drive yards proven against nflverse's own team box scores.
    ("postgame game pages",        PROJ / "build_game_pages.py",          True),
    ("game pages vs team stats",   PROJ / "build_game_pages.py",          True, ["--self-check"]),
    ("draft + combine profile",    PROJ / "build_prospect_profile.py",    True),
    ("game-day weather",           PROJ / "build_game_weather.py",        True),
    ("defense vs position",        PROJ / "build_defense_matchups.py",    True),
    ("weekly usage splits",        PROJ / "build_weekly_splits.py",       True),
    # The card's Advanced game log is those weekly rows, so they must add back up to advanced.js.
    ("weekly log vs advanced.js",  PROJ / "build_weekly_splits.py",       True, ["--self-check"]),
    # Card injury history, 2009 to now, from the injury CSVs plus the parquet and
    # rosters the suite just refreshed; the self-check decodes it back to the source.
    ("injury history",             PROJ / "build_injury_history.py",      True),
    ("injury history vs source",   PROJ / "build_injury_history.py",      True, ["--self-check"]),
    ("IDP advanced",               PROJ / "build_idp_advanced.py",        True),
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
    "idp-dvp.js", "kickers.js", "gibbs-week.js", "gibbs-ros.js", "gibbs-ppr.js", "advanced.js", "prospect.js", "weather.js", "defense.js", "usage-weekly.js", "idp-advanced.js", "weekly-rankings.js", "sleeper-market.js", "faab.js", "trade-history.js", "context.js", "history.js",
]

def run(label, script, timeout=600, args=()):
    if not script.exists():
        print(f"SKIP  {label}: {script.name} not found")
        return {"label": label, "script": script.name, "ok": False, "note": "missing"}
    print(f"\n=== {label}  ({script.name}) ===")
    t0 = time.time()
    try:
        r = subprocess.run([sys.executable, str(script), *args], cwd=str(ROOT),
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
    for step in STEPS:
        label, script, is_core = step[:3]
        args = step[3] if len(step) > 3 else ()
        if core_only and not is_core:
            print(f"\n--- skip (non-core): {label}")
            continue
        results.append(run(label, script, args=args))
    info = stamp()
    ok = sum(1 for r in results if r.get("ok"))
    print(f"\n{'='*48}\npipeline done: {ok}/{len(results)} steps ok")
    for r in results:
        if not r.get("ok"):
            print(f"  FAILED: {r['label']} ({r.get('note','rc!=0')})")

if __name__ == "__main__":
    main()
