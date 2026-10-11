"""Fetch the full-season fantasy schedule for every Sleeper league (ESPN leagues
are copied from the schedule build_site_data.py stores on the league record).

Only the schedule is fetched here. The lineup math stays in app.js so it goes
through the one lineup filler (fillLineup + offenseStartingSlots); duplicating
that in Python is exactly the trap CLAUDE.md warns about, and it shipped two
starting QBs in a 1QB league the last time someone hand-rolled it.

Writes site/data/schedule.js as:
    { leagues: { <leagueId>: { playoffStart, medianScoring, weeks: { <wk>: { <rosterId>: oppRosterId|null } } } } }

A null opponent means that roster had no head-to-head partner that week, which
happens on odd team counts and in consolation brackets. It is NOT a zero score,
and the consumer must drop it from the average rather than count it.

Usage:
    python projections/build_fantasy_schedule.py
"""
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEAGUES_JS = ROOT / "site" / "data" / "leagues.js"
OUT = ROOT / "site" / "data" / "schedule.js"
UA = {"User-Agent": "Mozilla/5.0 FantasyHub/1.0"}
WEEKS = range(1, 19)


def get(url, tries=3):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
                return json.load(r)
        except Exception:
            if attempt == tries - 1:
                return None
            time.sleep(1.2 * (attempt + 1))
    return None


def local_leagues():
    s = LEAGUES_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.LEAGUES\s*=\s*", s)
    obj, _ = json.JSONDecoder().raw_decode(s[m.end():])
    return obj


def main():
    out = {"leagues": {}}
    for lg in local_leagues():
        if lg.get("platform") == "espn":
            # ESPN is not on this API; build_site_data.py stores its schedule on the league.
            sched = lg.get("fantasy_schedule")
            if not sched:
                print(f"skip {lg['name']}: ESPN, no schedule on the league record")
                continue
            out["leagues"][str(lg["id"])] = {"name": lg["name"], **sched}
            print(f"{lg['name']}: {len(sched['weeks'])} weeks from ESPN, playoffs start wk{sched['playoffStart']}")
            continue
        lid = str(lg["id"])
        settings = get(f"https://api.sleeper.app/v1/league/{lid}") or {}
        st = settings.get("settings") or {}
        # Read the playoff start rather than assuming week 14, and detect the
        # median-scoring leagues, where the opponent is not the only thing you
        # play and a pure opponent-strength number tells half the story.
        playoff_start = st.get("playoff_week_start") or 15
        median = bool(st.get("league_average_match"))
        weeks = {}
        for wk in WEEKS:
            rows = get(f"https://api.sleeper.app/v1/league/{lid}/matchups/{wk}") or []
            groups = {}
            for r in rows:
                mid, rid = r.get("matchup_id"), r.get("roster_id")
                if rid is None:
                    continue
                groups.setdefault(mid, []).append(rid)
            wkmap = {}
            for mid, ids in groups.items():
                if mid is None or len(ids) != 2:
                    # A bye, or a consolation group that is not a pair. Record the
                    # roster with a null opponent so the consumer can exclude it.
                    for rid in ids:
                        wkmap[str(rid)] = None
                    continue
                a, b = ids
                wkmap[str(a)] = b
                wkmap[str(b)] = a
            if wkmap:
                weeks[str(wk)] = wkmap
        out["leagues"][lid] = {
            "name": lg["name"],
            "playoffStart": playoff_start,
            "medianScoring": median,
            "weeks": weeks,
        }
        paired = sum(1 for w in weeks.values() for v in w.values() if v is not None)
        byes = sum(1 for w in weeks.values() for v in w.values() if v is None)
        print(f"{lg['name']}: {len(weeks)} weeks, {paired} paired slots, {byes} without an opponent, "
              f"playoffs start wk{playoff_start}{', median scoring' if median else ''}")

    OUT.write_text("window.FANTASY_SCHEDULE = " + json.dumps(out, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
