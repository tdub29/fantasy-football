"""ESPN box scores for games involving FCS teams (ESPN site API: the scoreboard and summary endpoints
cfbfastR::espn_cfb_schedule / espn_cfb_game_player_box and sportsdataverse's ESPN helpers read).

Why: the store's ESPN files hold FBS games only (200-236 teams, 800-960 games a season), so an FCS
player's season is missing unless he faced an FBS team. stats.ncaa.org (data-gaps lane) covers FCS
from 2013 only and keys players by name; ESPN box scores carry the ESPN athlete id (which the
NFL-to-college crosswalk links to gsis) and reach back before 2013.

Per season: scoreboard `groups=81` (FCS) for every regular-season week and the postseason, completed
events only; one summary GET per event; the raw `boxscore.players` block is appended to
<scratch>/espn_fcs/box_<y>.jsonl (resumable). `lines <y>` aggregates player-season lines from it.

    python projections/lanes/packages/espn_fcs_box.py fetch 2016
    python projections/lanes/packages/espn_fcs_box.py lines 2016
"""
import json
import os
import pathlib
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

OUT = pathlib.Path(os.environ.get("LANE_PK", r"C:\Users\TrevorWhite\.claude\jobs\b56027d3\tmp")) / "espn_fcs"
SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json"}


def get(url):
    err = None
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=90) as r:
                return json.load(r)
        except Exception as ex:  # noqa: BLE001  retried, then raised
            err = ex
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def events(y):
    f = OUT / f"events_{y}.json"
    if f.exists():
        return json.loads(f.read_text())
    ev = {}
    for st, weeks in ((2, range(1, 17)), (3, [1])):
        for w in weeks:
            d = get(f"{SITE}/scoreboard?groups=81&dates={y}&seasontype={st}&week={w}&limit=400")
            for e in d.get("events", []):
                c = (e.get("competitions") or [{}])[0]
                if not c.get("status", {}).get("type", {}).get("completed"):
                    continue
                ev[e["id"]] = {"id": e["id"], "date": e.get("date"), "season_type": st, "week": w,
                               "teams": [(t["team"]["id"], t["team"].get("displayName"), t.get("homeAway")) for t in c["competitors"]]}
    f.write_text(json.dumps(list(ev.values())))
    return list(ev.values())


def fetch(y):
    OUT.mkdir(parents=True, exist_ok=True)
    ev = events(y)
    f = OUT / f"box_{y}.jsonl"
    have = {json.loads(line)["game_id"] for line in f.open(encoding="utf-8")} if f.exists() else set()
    todo = [e["id"] for e in ev if e["id"] not in have]

    def one(gid):
        d = get(f"{SITE}/summary?event={gid}")
        return {"game_id": gid, "players": (d.get("boxscore") or {}).get("players") or []}

    with f.open("a", encoding="utf-8") as fh, ThreadPoolExecutor(6) as ex:
        for rec in ex.map(one, todo):
            fh.write(json.dumps(rec) + "\n")
    print(y, "events", len(ev), "fetched", len(todo))


KEEP = {"passing": {"completions/passingAttempts": "cmp_att", "passingYards": "pass_yds", "passingTouchdowns": "pass_td",
                    "interceptions": "pass_int"},
        "rushing": {"rushingAttempts": "rush_att", "rushingYards": "rush_yds", "rushingTouchdowns": "rush_td"},
        "receiving": {"receptions": "rec", "receivingYards": "rec_yds", "receivingTouchdowns": "rec_td"}}


def lines(y):
    rows, games_with_box, games = [], 0, 0
    for line in (OUT / f"box_{y}.jsonl").open(encoding="utf-8"):
        g = json.loads(line)
        games += 1
        games_with_box += bool(g["players"])
        for t in g["players"]:
            for s in t.get("statistics", []):
                m = KEEP.get(s.get("name"))
                if not m:
                    continue
                keys = s.get("keys") or []
                for a in s.get("athletes", []):
                    r = {"game_id": g["game_id"], "team_id": t["team"]["id"], "team": t["team"].get("displayName"),
                         "athlete_id": a["athlete"].get("id"), "name": a["athlete"].get("displayName")}
                    for k, v in zip(keys, a.get("stats") or []):
                        if k in m:
                            r[m[k]] = v
                    rows.append(r)
    x = pd.DataFrame(rows)
    if "cmp_att" in x:
        ca = x.cmp_att.fillna("").str.split("/", expand=True)
        x["comp"], x["pass_att"] = pd.to_numeric(ca[0], errors="coerce"), pd.to_numeric(ca[1], errors="coerce")
    num = [c for c in ("rec", "rec_yds", "rec_td", "rush_att", "rush_yds", "rush_td", "comp", "pass_att", "pass_yds", "pass_td", "pass_int") if c in x]
    for c in num:
        x[c] = pd.to_numeric(x[c], errors="coerce")
    s = x.groupby(["athlete_id", "team_id", "team"]).agg(name=("name", "first"), games=("game_id", "nunique"),
                                                          **{c: (c, "sum") for c in num}).reset_index()
    s["season"] = y
    s.to_parquet(OUT / f"lines_{y}.parquet", index=False)
    print(y, "games", games, "with player box", games_with_box, "player-team lines", len(s))
    return s


if __name__ == "__main__":
    cmd, years = sys.argv[1], [int(a) for a in sys.argv[2:]]
    for y in years:
        (fetch if cmd == "fetch" else lines)(y)
