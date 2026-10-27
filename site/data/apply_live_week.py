"""Score the current week into leagues.js before Sleeper finalizes it.

Sleeper keeps W-L and points-for at the last processed week until its overnight job
runs (Tuesday or Wednesday), so after Monday night the records lag a full week. This
reads each Sleeper league's matchups for the NFL state week and, when every roster has
a score, adds that week's results: W-L-T (plus the median game where the league plays
one), fpts and fpts_against. Max PF (ppts) is left alone: it needs the optimal lineup.

Idempotent: a league is touched only while last_scored_leg is below the week, and it
marks last_scored_leg so a second run is a no-op. The next build_site_data.py after
Sleeper finalizes overwrites all of it with Sleeper's own numbers.
    python site/data/apply_live_week.py [--dry-run]
"""
import json
import pathlib
import statistics
import sys
import urllib.request

OUT = pathlib.Path(__file__).with_name("leagues.js")
API = "https://api.sleeper.app/v1"


def get(path):
    req = urllib.request.Request(f"{API}{path}", headers={"User-Agent": "fantasy-hub"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def nfl_week_final(season, week):
    """Every NFL game of the week is final (ESPN scoreboard). A fantasy week with any
    game left is still moving, so it is never scored as a result."""
    url = ("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
           f"?seasontype=2&week={week}&dates={season}")
    req = urllib.request.Request(url, headers={"User-Agent": "fantasy-hub"})
    with urllib.request.urlopen(req, timeout=30) as r:
        events = json.load(r).get("events") or []
    return bool(events) and all(e["status"]["type"]["completed"] for e in events)


def score_week(lg, matchups, week):
    """Mutates lg. Returns a one-line summary, or None when the week cannot be scored."""
    pts = {m.get("roster_id"): m.get("points") for m in matchups}
    sides = {}
    for m in matchups:
        if m.get("matchup_id") is not None:
            sides.setdefault(m["matchup_id"], []).append(m.get("roster_id"))
    opp = {}
    for s in sides.values():
        if len(s) == 2:
            opp[s[0]], opp[s[1]] = s[1], s[0]
    # All or nothing: every roster needs a numeric score and exactly one opponent, or
    # the week is left unscored and last_scored_leg stays put for the next run. Scoring
    # a partial week and advancing would drop the missing roster's game for good.
    # Unplayed weeks come back as all zeros, not nulls.
    expected = [r["roster_id"] for r in lg.get("rosters") or []]
    if (not expected or set(pts) != set(expected) or len(matchups) != len(expected)
            or any(not isinstance(pts[rid], (int, float)) for rid in expected)
            or not any(pts.values()) or any(rid not in opp for rid in expected)):
        return None
    med = statistics.median(pts.values()) if lg.get("league_average_match") else None
    for r in lg["rosters"]:
        rid = r["roster_id"]
        mine = pts[rid]
        games = [pts[opp[rid]]]
        if med is not None:
            games.append(med)
        for theirs in games:
            key = "wins" if mine > theirs else "losses" if mine < theirs else "ties"
            r[key] = r.get(key, 0) + 1
        r["fpts"] = round((r.get("fpts") or 0) + mine, 2)
        r["fpts_against"] = round((r.get("fpts_against") or 0) + pts[opp[rid]], 2)
    lg["last_scored_leg"] = week
    lg["live_scored_week"] = week   # marks the records as ours, not Sleeper's, until it finalizes
    me = next((r for r in lg["rosters"] if r.get("is_me")), None)
    return f"{lg['name']}: week {week} scored" + (f", you {me['wins']}-{me['losses']}" if me else "")


def self_check():
    lg = {"name": "t", "league_average_match": 1, "rosters": [
        {"roster_id": i, "wins": 0, "losses": 0, "ties": 0, "fpts": 0, "fpts_against": 0} for i in (1, 2, 3, 4)]}
    m = [{"roster_id": 1, "matchup_id": 1, "points": 100}, {"roster_id": 2, "matchup_id": 1, "points": 90},
         {"roster_id": 3, "matchup_id": 2, "points": 80}, {"roster_id": 4, "matchup_id": 2, "points": 120}]
    assert score_week(lg, m, 7)
    w = {r["roster_id"]: (r["wins"], r["losses"]) for r in lg["rosters"]}
    assert w == {1: (2, 0), 2: (0, 2), 3: (0, 2), 4: (2, 0)}, w   # median 95
    assert score_week({"name": "x", "rosters": []}, [{"roster_id": 1, "points": None}], 7) is None
    # Regression: a roster missing from the matchup feed leaves the league untouched.
    lg2 = {"name": "m", "last_scored_leg": 6, "rosters": [
        {"roster_id": i, "wins": 3, "losses": 3, "ties": 0, "fpts": 600, "fpts_against": 600} for i in (1, 2, 3, 4)]}
    import copy
    before = copy.deepcopy(lg2)
    assert score_week(lg2, m[:3], 7) is None and lg2 == before, lg2
    # ...and so does a roster with no opponent, or a non-numeric score.
    assert score_week(lg2, m[:2] + [dict(m[2], matchup_id=9), m[3]], 7) is None and lg2 == before
    assert score_week(lg2, m[:3] + [dict(m[3], points="120")], 7) is None and lg2 == before
    assert score_week({"name": "x", "rosters": []}, [{"roster_id": 1, "points": 0}], 8) is None
    print("self-check ok")


def main():
    if "--self-check" in sys.argv:
        return self_check()
    text = OUT.read_text(encoding="utf-8")
    head, rest = text.split("window.LEAGUES = ", 1)
    body, tail = rest.split(";\nwindow.MY_USER_ID", 1)
    leagues = json.loads(body)
    state = get("/state/nfl")
    week, season = int(state["week"]), state["season"]
    finals = {}
    changed = False
    for lg in leagues:
        if lg.get("platform") not in (None, "sleeper"):
            continue
        # Sleeper rolls state.week forward on Tuesday before it finalizes the week just
        # played, so walk forward from the last week it scored rather than trusting state.
        # Regular season only: playoff weeks do not count toward W-L.
        last = min(week, int(lg.get("playoff_week_start") or 15) - 1)
        while (lg.get("last_scored_leg") or 0) < last:
            w = (lg.get("last_scored_leg") or 0) + 1
            if w not in finals:
                finals[w] = nfl_week_final(season, w)
            if not finals[w]:
                print(f"{lg['name']}: week {w} has NFL games left, left as is")
                break
            line = score_week(lg, get(f"/league/{lg['id']}/matchups/{w}"), w)
            print(line or f"{lg['name']}: week {w} not played yet, left as is")
            if not line:
                break
            changed = True
    if changed and "--dry-run" not in sys.argv:
        OUT.write_text(head + "window.LEAGUES = " + json.dumps(leagues, indent=2, ensure_ascii=False)
                       + ";\nwindow.MY_USER_ID" + tail, encoding="utf-8", newline="\n")
        print(f"wrote {OUT.name}")


if __name__ == "__main__":
    main()
