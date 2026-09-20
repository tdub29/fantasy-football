"""Build IDP defense-vs-position: which OFFENSES feed opposing defenders.

The offense-side grid (build_sos_grid.py) asks which defenses a receiver wants to
face. This asks the mirror question, and the mirror is not symmetric, which is
the reason this file exists rather than a flag on the other one.

An IDP defender's fantasy week is mostly tackles, and tackles are a volume stat
driven by the OFFENSE he is on the field against. Three things make an offense
generous to defenders, and they are not the things that make it bad:

  * it runs a lot of plays, so there are more chances to record something
  * it runs the ball and completes short passes, which produce tackles rather
    than touchdowns
  * it turns the ball over and takes sacks

So a good, fast, run-heavy offense can be a BETTER matchup for a linebacker than
a bad pass-happy one, which is the opposite of the offense-side intuition and is
exactly the kind of thing a grid should show rather than leave to instinct.

Scored in yuH's own currency, not a generic IDP preset. That league pays 1 per
solo tackle, 1 per sack, 1 per tackle for loss, 5 per interception and 6 per
defensive touchdown, so the tackle-heavy linebacker and the splash-play corner
are valued very differently than they would be under a big-play scoring system.
Reading the scoring off the league means the grid stays correct if the
commissioner changes it.

Positions are grouped DL / LB / DB, because that is how the roster slots work
and because nflverse position codes are finer than any lineup is.

Prior season is the stable baseline; completed current-season games are pooled
in by real points and real games, with the Sleeper week as the cutoff so a
Thursday game never leaks into a week still being played. Same discipline as the
offense grid.

Emits site/data/idp-dvp.js (window.IDP_DVP).

    python projections/build_idp_dvp.py
    python projections/build_idp_dvp.py --self-check
"""
import argparse
import csv
import io
import json
import pathlib
import sys
import urllib.request
from collections import defaultdict

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SITE = ROOT / "site" / "data"
OUT = SITE / "idp-dvp.js"
STATS_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "stats_player/stats_player_week_{season}.csv")

# nflverse position codes to the three slots a lineup actually has.
GROUPS = {
    "DL": {"DE", "DT", "NT", "DL"},
    "LB": {"LB", "ILB", "OLB", "MLB"},
    "DB": {"CB", "S", "FS", "SS", "DB"},
}
POS_TO_GROUP = {p: g for g, ps in GROUPS.items() for p in ps}

# Sleeper scoring key -> nflverse weekly column. Only keys that exist on both
# sides; anything unmapped is reported rather than silently scored as zero.
STAT_MAP = {
    "idp_tkl_solo": "def_tackles_solo",
    "idp_tkl_ast": "def_tackle_assists",
    "idp_tkl": "def_tackles_solo",          # leagues that pay a flat tackle
    "idp_tkl_loss": "def_tackles_for_loss",
    "idp_sack": "def_sacks",
    "sack": "def_sacks",
    "idp_sack_yd": "def_sack_yards",
    "idp_qb_hit": "def_qb_hits",
    "idp_int": "def_interceptions",
    "int": "def_interceptions",
    "idp_int_ret_yd": "def_interception_yards",
    "idp_pass_def": "def_pass_defended",
    "idp_ff": "def_fumbles_forced",
    "ff": "def_fumbles_forced",
    "idp_def_td": "def_tds",
    "idp_safe": "def_safeties",
    "idp_blk_kick": "def_fg_blocks",
}
# Relocated franchises, same collapse the rest of the pipeline uses.
RELOCATIONS = {"STL": "LA", "SD": "LAC", "OAK": "LV"}


def load_js(path, var):
    """Read one `window.X = <literal>;` out of a data file, without running JS.

    Balanced scan rather than a slice to the last brace. leagues.js is an ARRAY
    followed by a second statement (`window.MY_USER_ID = ...`), so taking
    everything up to the file's final brace runs past the end of the value and
    fails with a delimiter error 5,000 lines in. Quote and escape state are
    tracked so a bracket inside a team name cannot end the scan early.
    """
    text = pathlib.Path(path).read_text(encoding="utf-8")
    i = text.index("=", text.index(var)) + 1
    while text[i].isspace():
        i += 1
    open_ch = text[i]
    close_ch = {"{": "}", "[": "]"}[open_ch]
    depth, j, in_str, esc = 0, i, False, False
    while j < len(text):
        c = text[j]
        if in_str:
            if esc:
                esc = False
            elif c == chr(92):
                esc = True
            elif c == chr(34):
                in_str = False
        elif c == chr(34):
            in_str = True
        elif c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return json.loads(text[i:j + 1])
        j += 1
    raise ValueError("unterminated " + open_ch + " for " + var)


def idp_scoring(leagues):
    """The IDP scoring of the first IDP league, as {nflverse column: points}.

    Reading it from the league rather than hardcoding a preset is what keeps the
    grid honest if the commissioner retunes. Returns the mapping plus the keys
    that had no nflverse equivalent, so a silent zero is visible.
    """
    lg = next((l for l in leagues if l.get("is_idp")), None)
    if lg is None:
        return {}, [], None
    scoring = lg.get("scoring") or {}
    mapped, unmapped = defaultdict(float), []
    for key, pts in scoring.items():
        if not isinstance(pts, (int, float)) or not pts:
            continue
        col = STAT_MAP.get(key)
        if col:
            mapped[col] += float(pts)
        elif key.startswith("idp_"):
            unmapped.append(key)
    return dict(mapped), sorted(unmapped), lg


def fetch_weekly(season):
    url = STATS_URL.format(season=season)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read()
    return list(csv.DictReader(io.TextIOWrapper(io.BytesIO(raw), encoding="utf-8")))


def score_row(row, weights):
    pts = 0.0
    for col, w in weights.items():
        v = row.get(col)
        if v not in (None, ""):
            try:
                pts += float(v) * w
            except ValueError:
                pass
    return pts


def allowed_by_offense(rows, weights, cutoff_week=None):
    """Points the OFFENSE gave up to each defensive group, per game.

    Keyed on `opponent_team`, which from a defender's row is the offense he
    played against. Games are counted as distinct (team, week) pairs rather than
    as player rows, or an eleven-man defensive front would read as eleven games.
    """
    totals = defaultdict(float)
    games = defaultdict(set)
    for r in rows:
        if (r.get("season_type") or "REG") != "REG":
            continue
        grp = POS_TO_GROUP.get((r.get("position") or "").upper())
        if not grp:
            continue
        week = int(r.get("week") or 0)
        if cutoff_week is not None and week > cutoff_week:
            continue
        off = RELOCATIONS.get(r.get("opponent_team"), r.get("opponent_team"))
        if not off:
            continue
        totals[(off, grp)] += score_row(r, weights)
        games[(off, grp)].add(week)
    return {k: {"pts": round(v, 1), "games": len(games[k]),
                "ppg": round(v / len(games[k]), 2) if games[k] else None}
            for k, v in totals.items()}


def main():
    leagues = load_js(SITE / "leagues.js", "LEAGUES")
    lgs = leagues.get("leagues", leagues) if isinstance(leagues, dict) else leagues
    weights, unmapped, lg = idp_scoring(lgs)
    if not weights:
        raise SystemExit("no IDP league found in leagues.js, nothing to build")
    print(f"scoring read from {lg['name']}: {len(weights)} mapped stats")
    for col, w in sorted(weights.items(), key=lambda kv: -abs(kv[1])):
        print(f"    {col:28} {w:+.2f}")
    if unmapped:
        # Named rather than swallowed: an unmapped key scores zero, and a grid
        # that quietly ignores a scoring rule is worse than no grid.
        print(f"  {len(unmapped)} IDP scoring key(s) have no nflverse column and "
              f"score 0 here: {', '.join(unmapped)}")

    season = int(lg.get("season") or 2026)
    week = int(lg.get("week") or 1)
    prior = season - 1

    prior_rows = fetch_weekly(prior)
    print(f"  {prior}: {len(prior_rows):,} player-weeks")
    try:
        cur_rows = fetch_weekly(season)
        print(f"  {season}: {len(cur_rows):,} player-weeks, pooling through week {week - 1}")
    except Exception as exc:
        cur_rows = []
        print(f"  {season} weekly stats unavailable ({str(exc)[:60]}), prior season only")

    base = allowed_by_offense(prior_rows, weights)
    cur = allowed_by_offense(cur_rows, weights, cutoff_week=week - 1) if cur_rows else {}

    grid = {}
    for (off, grp), b in base.items():
        c = cur.get((off, grp))
        pts = b["pts"] + (c["pts"] if c else 0.0)
        games = b["games"] + (c["games"] if c else 0)
        grid.setdefault(off, {})[grp] = {
            "ppg": round(pts / games, 2) if games else None,
            "games": games,
            "priorPpg": b["ppg"],
            "curPpg": c["ppg"] if c else None,
            "curGames": c["games"] if c else 0,
        }

    # Rank within each group: 1 is the most generous offense to face.
    for grp in GROUPS:
        vals = sorted(((off, g[grp]["ppg"]) for off, g in grid.items()
                       if grp in g and g[grp]["ppg"] is not None),
                      key=lambda kv: -kv[1])
        for rank, (off, _) in enumerate(vals, 1):
            grid[off][grp]["rank"] = rank
        if vals:
            mid = vals[len(vals) // 2][1]
            for off, ppg in vals:
                grid[off][grp]["vsMedian"] = round(ppg - mid, 2)

    payload = {
        "season": season, "week": week, "league": lg["name"],
        "groups": list(GROUPS),
        "scoring": {k: round(v, 3) for k, v in weights.items()},
        "unmappedScoringKeys": unmapped,
        "note": "Points an OFFENSE allows to each defensive group per game, in "
                f"{lg['name']} scoring. Rank 1 is the most generous offense to "
                "face. Prior season pooled with completed current-season games.",
        "offenses": grid,
    }
    OUT.write_text("window.IDP_DVP = " + json.dumps(payload, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)}: {len(grid)} offenses, "
          f"{OUT.stat().st_size / 1024:.0f} KB")
    for grp in GROUPS:
        ranked = sorted((g[grp] | {"off": off} for off, g in grid.items() if grp in g),
                        key=lambda x: x.get("rank", 99))
        if not ranked:
            continue
        best = ", ".join(f"{r['off']} {r['ppg']}" for r in ranked[:4])
        worst = ", ".join(f"{r['off']} {r['ppg']}" for r in ranked[-3:])
        print(f"  {grp}: most generous {best}  |  stingiest {worst}")
    return 0


def self_check():
    """Scoring and the games denominator, the two things that break quietly."""
    weights = {"def_tackles_solo": 1.0, "def_sacks": 1.0, "def_interceptions": 5.0}
    row = {"def_tackles_solo": "6", "def_sacks": "1", "def_interceptions": "1"}
    assert score_row(row, weights) == 12.0, score_row(row, weights)
    # A blank or absent stat contributes nothing rather than raising.
    assert score_row({"def_tackles_solo": ""}, weights) == 0.0
    assert score_row({}, weights) == 0.0

    # Eleven defenders in ONE game is one game, not eleven. Getting this wrong
    # divides by the size of the front seven and makes every offense look stingy.
    rows = [{"season_type": "REG", "position": "LB", "week": "1",
             "opponent_team": "KC", "def_tackles_solo": "5"} for _ in range(11)]
    got = allowed_by_offense(rows, weights)[("KC", "LB")]
    assert got["games"] == 1, got
    assert got["pts"] == 55.0 and got["ppg"] == 55.0, got

    # Two weeks is two games, and the cutoff excludes a week in progress.
    rows.append({"season_type": "REG", "position": "LB", "week": "2",
                 "opponent_team": "KC", "def_tackles_solo": "3"})
    assert allowed_by_offense(rows, weights)[("KC", "LB")]["games"] == 2
    assert allowed_by_offense(rows, weights, cutoff_week=1)[("KC", "LB")]["games"] == 1

    # Position grouping, including the codes that are easy to forget.
    for pos, grp in (("NT", "DL"), ("OLB", "LB"), ("FS", "DB"), ("CB", "DB")):
        assert POS_TO_GROUP[pos] == grp, pos
    assert "QB" not in POS_TO_GROUP          # offense must never enter the grid

    # Relocated franchises collapse on the OFFENSE key too.
    old = [{"season_type": "REG", "position": "LB", "week": "1",
            "opponent_team": "OAK", "def_tackles_solo": "4"}]
    assert ("LV", "LB") in allowed_by_offense(old, weights)

    # Playoffs are excluded: a four-team sample is not a matchup rating.
    post = [{"season_type": "POST", "position": "LB", "week": "19",
             "opponent_team": "KC", "def_tackles_solo": "9"}]
    assert allowed_by_offense(post, weights) == {}
    # The parser that failed on the real file: an array value with another
    # statement after it, and a bracket inside a string.
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        f = pathlib.Path(td) / "x.js"
        arr = 'window.LEAGUES = [{"name": "a ] b", "is_idp": true}];\nwindow.MY_USER_ID = "1";\n'
        f.write_text(arr, encoding="utf-8")
        got = load_js(f, "LEAGUES")
        assert got == [{"name": "a ] b", "is_idp": True}], got
        obj = 'window.X = {"k": [1, 2]};\nwindow.Y = 1;\n'
        f.write_text(obj, encoding="utf-8")
        assert load_js(f, "X") == {"k": [1, 2]}
    print("build_idp_dvp self-check ok")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    sys.exit(self_check() if a.self_check else main())
