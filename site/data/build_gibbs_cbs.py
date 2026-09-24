"""Build Jacob Gibbs's weekly board from CBS Sports, where he keeps it current.

This replaces a screenshot ritual with a fetch, and it is a better board on
every axis that matters here:

  * Scoring: CBS files it under PPR, but the order is his HALF-PPR board
    (checked 2026-09-24 against his FantasyPros half and PPR boards). It is
    labelled half-PPR; a PPR version must be derived, never presented as his.
  * 150 players deep instead of the top 12 a graphic fits.
  * Carries the positional rank AND the overall flex rank, so "start the better
    of these two" works across positions, which a per-position card cannot do.
  * Updated continuously, stamped "Updated Nh ago", rather than whenever he
    happens to post an image.
  * Plain server-rendered HTML. No key, no login, no browser.

What it does NOT carry: QB, K and DST. The per-position URLs 404 for him and
the flex list is RB/WR/TE only. His QB ranks exist solely on the X card and in
NON-PPR, so they stay a separate capture and are labelled as such rather than
being quietly folded in at the wrong scoring.

Verification that these are the same rankings, not a lookalike feed: the top 12
of each position here matched the two-reader transcription of his 2026-09-22 X
cards 36 of 36 on player and order.

    python site/data/build_gibbs_cbs.py
    python site/data/build_gibbs_cbs.py --html cached.html   # offline re-parse
    python site/data/build_gibbs_cbs.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import html as htmllib
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_gibbs_ros import norm, sleeper_index, sleeper_id, index_team  # noqa: E402

URL = "https://www.cbssports.com/fantasy/football/rankings/ppr/flex/jacob-gibbs/"
OUTPUT = ROOT / "site" / "data" / "gibbs-week.js"
HEADERS = {"User-Agent": "Mozilla/5.0"}
# Below this the page is not the board, it is an error page or a layout change.
# His flex list has run 150 rows; 60 is a floor, not a target.
MIN_ROWS = 60

ROW_RE = re.compile(
    r"<tr[^>]*>(?:(?!</tr>).)*?FantasyRankingsTable-td--rank.*?</tr>", re.S)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
CBSID_RE = re.compile(r"/nfl/players/(\d+)/")
POSRANK_RE = re.compile(r"^([A-Z]+)(\d+)$")
# The markup carries the first name TWICE: the real one, and a narrow-layout
# initial beside it. Stripping the duplicate out of flattened text needs a
# heuristic, and the heuristic is wrong exactly where it matters: "J.K. J.
# Dobbins" and "T.J. T. Hockenson" have initials inside the real first name,
# so a rule that deletes "<letter>. " mangles them to "J.Dobbins". Drop the
# duplicate span structurally, by its class, before any text is extracted.
INITIAL_SPAN_RE = re.compile(
    r'<span class="[^"]*FantasyRankingsTable-firstInitial[^"]*">.*?</span>', re.S)
TEAMPOS_RE = re.compile(
    r'<span class="[^"]*FantasyRankingsTable-teamPosition[^"]*">(.*?)</span>', re.S)
NAME_RE = re.compile(
    r'<span class="[^"]*FantasyRankingsTable-playerName[^"]*">(.*?)</span></a>', re.S)


def fetch(url: str = URL) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "ignore")


def text_of(html: str) -> str:
    # unescape AFTER stripping tags, so "De&#039;Von" survives as "De'Von".
    # Without this five real players fell out of the Sleeper match silently,
    # which reads as "CBS lists someone we don't have" rather than as a bug.
    return htmllib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))).strip()


def split_player(cell_html: str) -> tuple[str, str]:
    """Player cell HTML -> ("Jahmyr Gibbs", "DET"), read from the spans.

    Structural, not textual: the duplicate initial span is removed by class and
    the team comes from its own span, so a name containing initials or an
    apostrophe survives and a new team abbreviation cannot break the split.
    """
    team_m = TEAMPOS_RE.search(cell_html)
    team = text_of(team_m.group(1)) if team_m else ""
    name_m = NAME_RE.search(cell_html)
    chunk = name_m.group(1) if name_m else cell_html
    name = text_of(INITIAL_SPAN_RE.sub("", chunk))
    if not name_m and team:                      # fell back to the whole cell
        name = name[: -len(team)].strip() if name.endswith(team) else name
    return name, team


def parse(html: str) -> tuple[list[dict], str | None]:
    rows = []
    for raw in ROW_RE.findall(html):
        raw_cells = CELL_RE.findall(raw)
        cells = [text_of(c) for c in raw_cells]
        if len(cells) < 4:
            continue
        m = POSRANK_RE.match(cells[3])
        if not m:
            continue
        name, team = split_player(raw_cells[1])
        cbs = CBSID_RE.search(raw)
        rows.append({
            "flexRank": int(cells[0]),
            "player": name,
            "team": team,
            # "@WAS" means away. Keep the marker: it is real information and
            # rewriting it to "WAS" would lose the home/away split.
            "opp": cells[2] or None,
            "pos": m.group(1),
            "rank": int(m.group(2)),
            "cbsId": cbs.group(1) if cbs else None,
        })
    stamp = re.search(r"Updated[^<]{0,40}", html)
    return rows, stamp.group(0).strip() if stamp else None


def to_source(rows: list[dict], updated: str | None, qb: dict | None) -> dict:
    """Shape the rows into what build_gibbs_ros.build() already validates."""
    if len(rows) < MIN_ROWS:
        raise SystemExit(
            f"only {len(rows)} rows parsed, expected at least {MIN_ROWS}. "
            f"The page layout probably changed; fix the parser rather than "
            f"lowering the floor, because a short board looks like a real one.")
    positions: dict[str, list[dict]] = {}
    for r in rows:
        positions.setdefault(r["pos"], []).append(r)
    for pos in positions:
        positions[pos].sort(key=lambda r: r["rank"])
    # CBS files this under its PPR URL, but the ORDER is his half-PPR board:
    # on 2026-09-24 it sat 0.4-2 spots from his FantasyPros half-PPR board and
    # 4+ from his FantasyPros PPR one, and matched his half-PPR X cards 36/36.
    # Labelling it PPR told the user a half-PPR opinion was a PPR one. A PPR
    # version has to be DERIVED (see _sources/build_gibbs_fullppr.py).
    scoring = {p: "half_ppr" for p in positions}
    sources = {p: "CBS Sports weekly PPR flex board" for p in positions}

    # His QB ranks exist only on the X card and only in NON-PPR. Folding them
    # in unlabelled would present a non-PPR rank as a PPR one.
    if qb:
        positions["QB"] = qb["rows"]
        scoring["QB"] = qb.get("scoring", "non_ppr")
        sources["QB"] = qb.get("source", "his X card, two-reader transcription")

    today = dt.date.today().isoformat()
    return {
        "source": "Jacob Gibbs (@jagibbs_23)",
        "board": "week",
        "posted": today,
        "captured": today,
        "scoringByPosition": scoring,
        "sourceByPosition": sources,
        "updatedLabel": updated,
        "provenance": (
            f"RB, WR and TE scraped from his CBS Sports weekly flex board "
            f"({URL}), {len(rows)} players, page stamped "
            f"\"{updated or 'no timestamp'}\". CBS files it under PPR, but the "
            f"ordering is his HALF-PPR board: it matches his half-PPR X cards "
            f"36 of 36 and his FantasyPros half-PPR board within 2 spots, and "
            f"not his FantasyPros PPR board, which is internally inconsistent "
            f"(Brock Bowers TE4 in half, TE21 in PPR). These leagues are full "
            f"PPR, so treat it as his half-PPR order."
            + (" QB comes from the X card instead, because the per-position CBS "
               "URLs 404 for him and the flex list is RB/WR/TE only; it is "
               "NON-PPR and is labelled that way." if qb else
               " QB, K and DST are not on this board: the per-position CBS URLs "
               "404 for him and the flex list is RB/WR/TE only.")),
        "positions": positions,
    }


def existing_qb(path: pathlib.Path) -> dict | None:
    """Carry a previously captured QB block forward rather than dropping it."""
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    except (ValueError, OSError):
        return None
    rows = (data.get("positions") or {}).get("QB")
    if not rows:
        return None
    return {
        "rows": [{"rank": r["rank"], "player": r["name"], "team": r["team"]}
                 for r in rows],
        "scoring": (data.get("formatByPosition") or {}).get("QB", "non_ppr"),
        "source": "his X card, two-reader transcription",
    }


def self_check() -> int:
    """The parsing decisions that would corrupt a board without erroring."""
    def fixture(rank, pid, first, initial, last, team, opp, posrank):
        return (f'<tr><td class="FantasyRankingsTable-td--rank">{rank}</td>'
                f'<td><a href="/nfl/players/{pid}/x/fantasy/">'
                f'<span class="FantasyRankingsTable-playerName">'
                f'<span class="FantasyRankingsTable-firstName">{first} </span>'
                f'<span class="FantasyRankingsTable-firstInitial">{initial} </span>'
                f'{last}</span></a>'
                f'<span class="FantasyRankingsTable-teamPosition">{team}</span>'
                f'</td><td>{opp}</td><td>{posrank}</td></tr>')

    row = fixture(3, "3121372", "Kenneth", "K.", "Walker III", "KC", "@MIA", "RB2")
    rows, _ = parse(row)
    assert len(rows) == 1, rows
    r = rows[0]
    # The duplicated first-name initial must not survive into the name, and the
    # team lives in its own span rather than as a trailing token.
    assert r["player"] == "Kenneth Walker III", r["player"]
    assert r["team"] == "KC" and r["pos"] == "RB", r
    assert r["rank"] == 2 and r["flexRank"] == 3, r
    assert r["opp"] == "@MIA", r["opp"]      # the @ is away, keep it
    assert r["cbsId"] == "3121372", r["cbsId"]

    # A first name that CONTAINS initials must survive. Stripping "<letter>. "
    # from flattened text turned "J.K. J. Dobbins" into "J.Dobbins", which then
    # failed to match Sleeper and read as a missing player rather than a bug.
    dob, _ = parse(fixture(40, "1", "J.K.", "J.", "Dobbins", "DEN", "@LV", "RB20"))
    assert dob[0]["player"] == "J.K. Dobbins", dob[0]["player"]
    hock, _ = parse(fixture(41, "2", "T.J.", "T.", "Hockenson", "MIN", "TB", "TE9"))
    assert hock[0]["player"] == "T.J. Hockenson", hock[0]["player"]

    # An HTML entity in a name must be decoded, or five real players fall out
    # of the Sleeper match and look like people CBS invented.
    ach, _ = parse(fixture(9, "3", "De&#039;Von", "D.", "Achane", "MIA", "KC", "RB8"))
    assert ach[0]["player"] == "De'Von Achane", ach[0]["player"]
    chase, _ = parse(fixture(12, "4", "Ja&#039;Marr", "J.", "Chase", "CIN", "@MIN", "WR6"))
    assert chase[0]["player"] == "Ja'Marr Chase", chase[0]["player"]

    # A cell with no team span keeps the whole name rather than eating a word.
    n, t = split_player("<span>Some Guy</span>")
    assert (n, t) == ("Some Guy", ""), (n, t)

    # A short board must raise. A page that changed layout parses to a handful
    # of rows and otherwise looks exactly like a real, small board.
    try:
        to_source(rows, None, None)
    except SystemExit as e:
        assert "expected at least" in str(e), e
    else:
        raise AssertionError("a 1-row board was accepted")

    # Scoring must be PPR for the scraped positions, and a carried-over QB
    # block must keep its own scoring rather than inheriting PPR.
    many = [dict(r, rank=i + 1, flexRank=i + 1) for i in range(MIN_ROWS)]
    src = to_source(many, "Updated 5h ago",
                    {"rows": [{"rank": 1, "player": "A", "team": "BUF"}],
                     "scoring": "non_ppr"})
    assert src["scoringByPosition"]["RB"] == "half_ppr"
    assert src["scoringByPosition"]["QB"] == "non_ppr", src["scoringByPosition"]
    assert "NON-PPR" in src["provenance"]
    print("build_gibbs_cbs self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=pathlib.Path, help="parse a saved page instead")
    ap.add_argument("--output", type=pathlib.Path, default=OUTPUT)
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()

    html = a.html.read_text(encoding="utf-8", errors="ignore") if a.html else fetch()
    rows, updated = parse(html)
    print(f"parsed {len(rows)} players from CBS, page says \"{updated}\"")

    src = to_source(rows, updated, existing_qb(a.output))
    # Reuse the existing builder so this board gets the same guards the X
    # capture gets: rank continuity, the ecr arithmetic check, the Sleeper
    # team cross-check, and one code path deciding what a board looks like.
    from build_gibbs_ros import build
    idx = sleeper_index()
    data = build(src, idx)
    # build() keeps the columns an X card has. The flex rank is the thing this
    # source adds, and it is the reason the board can compare across positions.
    flex = {(r["pos"], r["rank"]): r["flexRank"] for r in rows}
    for pos, built in data["positions"].items():
        for row in built:
            row["flexRank"] = flex.get((pos, row["rank"]))
    data["sourceByPosition"] = src["sourceByPosition"]
    data["updatedLabel"] = src.get("updatedLabel")

    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    a.output.write_text(
        "// Generated by build_gibbs_cbs.py from his CBS Sports PPR board. Do not edit.\n"
        f"window.GIBBS_WEEK={body};\n", encoding="utf-8")
    for pos, built in data["positions"].items():
        matched = sum(bool(r["sleeperId"]) for r in built)
        print(f"  {pos}: {len(built)} ranked, {matched} matched to Sleeper "
              f"({data['formatByPosition'][pos]})")
        miss = [r["name"] for r in built if not r["sleeperId"]]
        if miss:
            print(f"     unmatched: {', '.join(miss[:8])}")
    if data.get("teamMismatches"):
        print(f"  {len(data['teamMismatches'])} team code(s) differ from Sleeper:")
        for m in data["teamMismatches"][:8]:
            print(f"     {m}")
    print(f"wrote {a.output.name} ({a.output.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
