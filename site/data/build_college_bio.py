"""Height, weight and school logo for the college prospects, from ESPN's public API.

    python site/data/build_college_bio.py

Reads the college list in prospect-model.js, pulls each school's current roster
(site.api.espn.com, key-free) and writes college-bio.js. ESPN has no birth dates
for college players, so age today is not in here.
"""
import json
import pathlib
import re
import time
import unicodedata
import urllib.request
from datetime import datetime

HERE = pathlib.Path(__file__).resolve().parent
API = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
# Our school name -> ESPN location, where the two disagree.
ALIAS = {"Miami": "Miami", "Ole Miss": "Ole Miss", "USC": "USC", "UCF": "UCF", "SMU": "SMU",
         "Pitt": "Pittsburgh", "Hawaii": "Hawai'i", "San Jose State": "San José State"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def key(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", s)
    return re.sub(r"[^a-z]", "", s)


def main():
    src = (HERE / "prospect-model.js").read_text(encoding="utf-8")
    college = json.loads(src[src.index("{"):src.rindex("}") + 1])["college"]
    teams = [t["team"] for s in get(f"{API}/teams?limit=1000&groups=80")["sports"]
             for lg in s["leagues"] for t in lg["teams"]]
    by_loc = {}
    for t in teams:
        by_loc.setdefault(t["location"], t)  # ponytail: first FBS team per location wins
    schools, players, missed = {}, {}, []
    for sch in sorted({r["sch"] for r in college}):
        t = by_loc.get(ALIAS.get(sch, sch))
        if not t:
            missed.append(f"school {sch}")
            continue
        schools[sch] = f"https://a.espncdn.com/i/teamlogos/ncaa/500/{t['id']}.png"
        roster = {}
        # The default page stops at 100 players, alphabetically, so late surnames vanish.
        for g in get(f"{API}/teams/{t['id']}/roster?limit=200").get("athletes", []):
            for a in g.get("items", []):
                roster[key(a.get("fullName", ""))] = a
        for r in (x for x in college if x["sch"] == sch):
            a = roster.get(key(r["n"]))
            if a and a.get("height") and a.get("weight"):
                players[str(r["cid"])] = {"ht": int(a["height"]), "wt": int(a["weight"])}
            else:
                missed.append(f"{r['n']} ({sch})")
        time.sleep(0.2)
    out = {"generated": datetime.now().isoformat(timespec="seconds"),
           "source": "ESPN college football roster API, current season", "schools": schools, "players": players}
    (HERE / "college-bio.js").write_text("window.COLLEGE_BIO = " + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"college-bio.js: {len(players)}/{len(college)} players, {len(schools)} schools; missed {len(missed)}")
    for m in missed[:40]:
        print("  missed", m)


if __name__ == "__main__":
    main()
