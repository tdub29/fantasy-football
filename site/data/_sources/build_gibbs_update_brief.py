"""Render the 2026-08-22 Gibbs board update as one self-contained page.

Reads the verified partial source (ranks 85-200 of his new top-200), diffs it
against the Aug-14 top-175 he published on CBS, and overlays Trevor's league
rosters. No network, no deps, no build step.

    python site/data/_sources/build_gibbs_update_brief.py

Why a separate page instead of regenerating site/gibbs-tiers.html: ranks 1-84 of
this board are not sourced yet, so jacob-gibbs.js still holds the complete Aug-14
board. Mixing an Aug-22 tail onto an Aug-14 head would invent ranks nobody
published. This page is explicitly the tail plus the delta.

Raw rank movement is inflated here because the board grew from 175 to 200 and 26
players were inserted into the 85-200 band, so everyone who merely held his ground
drifted down. The primary movement number is therefore the RE-RANKED delta: both
boards restricted to the players on both, then compared. Raw is shown beside it.
"""
from __future__ import annotations

import csv
import html
import json
import re
from pathlib import Path

# One Backyard skin and one position palette for both Gibbs pages.
from build_gibbs_brief import BACKYARD_CSS, POS_HUE, number_word

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
NEW_CSV = HERE / "jacob-gibbs-2026-08-22-partial-85-200.csv"
OLD_CSV = HERE / "jacob-gibbs-2026-08-14.csv"
PLAYERS = ROOT / "players-nfl.json"
LEAGUES = ROOT / "site" / "data" / "leagues.js"
OUT = ROOT / "site" / "gibbs-update-2026-08-22.html"

UPDATED = "2026-08-22"
PRIOR_DATE = "August 14"
PRIOR_URL = ("https://www.cbssports.com/fantasy/football/news/"
             "jacob-gibbs-rankings-fantasy-football-2026-half-ppr/")

TEAM_ALIASES = {"JAC": "JAX", "WSH": "WAS", "LA": "LAR"}
# The bar above rank 178 is the 7th tier bar in view, so the block is stored as 17.
# Its printed number does not survive the screenshot: the bar's digits are 6 pixels
# tall and the second one reads as 5 or 7 depending on how it is measured. The
# grouping is certain, the label is not, so the page says so rather than guessing.
TIER_SLIP = {17: "bar number unreadable at this resolution"}


def norm(value: str) -> str:
    value = value.lower().replace(".", "").replace("'", "")
    value = re.sub(r"\s+(jr|sr|iii|ii|iv)\b", "", value)
    return re.sub(r"[^a-z0-9 -]", "", re.sub(r"\s+", " ", value)).strip()


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def read_global(path: Path, name: str):
    parts = re.split(r"^window\.(\w+)\s*=\s*", path.read_text(encoding="utf-8"), flags=re.M)
    for i in range(1, len(parts), 2):
        if parts[i] == name:
            return json.loads(parts[i + 1].strip().rstrip(";").strip())
    raise KeyError(name)


def sleeper_index() -> dict:
    index: dict[str, list] = {}
    for pid, p in json.loads(PLAYERS.read_text(encoding="utf-8")).items():
        n = p.get("full_name") or p.get("name")
        if n:
            index.setdefault(norm(n), []).append((pid, p))
    return index


def resolve(name: str, team: str, pos: str, index: dict) -> str | None:
    team = TEAM_ALIASES.get(team, team)
    cands = index.get(norm(name), [])
    if len(cands) == 1:
        return cands[0][0]
    for pid, p in cands:
        if pos in {p.get("position"), *(p.get("fantasy_positions") or [])} and p.get("team") == team:
            return pid
    for pid, p in cands:
        if pos in {p.get("position"), *(p.get("fantasy_positions") or [])}:
            return pid
    return None


def rows(path: Path) -> list[dict]:
    out = []
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            m = re.fullmatch(r"([A-Z]+)(\d+)", (r["POS"] or "").strip().upper())
            out.append({"rank": int(r["RK"]), "tier": int(r["TIERS"]),
                        "name": r["PLAYER NAME"].strip(), "team": r["TEAM"].strip().upper(),
                        "pos": m.group(1), "bye": int(r["BYE"])})
    return sorted(out, key=lambda p: p["rank"])


def main() -> None:
    index = sleeper_index()
    new = rows(NEW_CSV)
    old = rows(OLD_CSV)
    for p in new + old:
        p["sid"] = resolve(p["name"], p["team"], p["pos"], index)
    missing = [p["name"] for p in new if not p["sid"]]
    if missing:
        raise SystemExit("unresolved Sleeper ids: " + ", ".join(missing))

    old_by = {p["sid"]: p for p in old}
    new_by = {p["sid"]: p for p in new}
    lo = min(p["rank"] for p in new)

    # Re-ranked delta: both boards cut to the players on both, so the 25 extra slots
    # and the 26 insertions stop counting as movement. This isolates opinion change.
    common = [p for p in new if p["sid"] in old_by]
    new_pos = {p["sid"]: i for i, p in enumerate(sorted(common, key=lambda p: p["rank"]))}
    old_pos = {p["sid"]: i for i, p in enumerate(
        sorted((old_by[p["sid"]] for p in common), key=lambda p: p["rank"]))}
    for p in new:
        prior = old_by.get(p["sid"])
        p["prior"] = prior["rank"] if prior else None
        p["priorTier"] = prior["tier"] if prior else None
        p["raw"] = (p["prior"] - p["rank"]) if prior else None
        p["adj"] = (old_pos[p["sid"]] - new_pos[p["sid"]]) if prior else None

    leagues = read_global(LEAGUES, "LEAGUES")
    owned: dict[str, list[str]] = {}
    taken_by: dict[str, set] = {}
    league_meta = []
    for lg in leagues:
        name = lg["name"].strip()
        mine = next((r for r in lg.get("rosters", []) if r.get("is_me")), None)
        if not mine:
            continue
        fmt = "superflex" if lg.get("is_superflex") else "1QB"
        if lg.get("is_idp"):
            fmt += ", IDP"
        league_meta.append({"name": name, "fmt": fmt, "teams": lg.get("total_rosters")})
        taken_by[name] = {str(pid) for r in lg.get("rosters", []) for pid in (r.get("players") or [])}
        for pid in mine.get("players") or []:
            owned.setdefault(str(pid), []).append(name)
    for p in new:
        p["mine"] = owned.get(str(p["sid"]), [])
        p["free"] = [m["name"] for m in league_meta if str(p["sid"]) not in taken_by[m["name"]]]

    fresh = [p for p in new if p["prior"] is None]
    gone = sorted((p for p in old if p["rank"] >= lo and p["sid"] not in new_by),
                  key=lambda p: p["rank"])
    moved = [p for p in new if p["adj"] is not None and p["adj"] != 0]
    risers = sorted(moved, key=lambda p: (-p["adj"], p["rank"]))[:10]
    fallers = sorted(moved, key=lambda p: (p["adj"], p["rank"]))[:10]
    held = [p for p in new if p["mine"]]

    counts = {k: sum(1 for p in new if p["pos"] == k) for k in ("RB", "WR", "TE", "QB")}
    tiers: dict[int, list] = {}
    for p in new:
        tiers.setdefault(p["tier"], []).append(p)

    # ---- fragments -------------------------------------------------------
    def pill(pos: str, small: bool = False) -> str:
        hue = POS_HUE[pos]
        cls = "pill sm" if small else "pill"
        return f'<span class="{cls}" style="background:{hue}">{pos}</span>'

    def delta_cell(p: dict) -> str:
        if p["adj"] is None:
            return '<span class="d new">NEW</span>'
        cls = "up" if p["adj"] > 0 else ("down" if p["adj"] < 0 else "flat")
        sign = f'{p["adj"]:+d}' if p["adj"] else "0"
        return f'<span class="d {cls}">{sign}</span>'

    def name_cell(p: dict) -> str:
        tags = "".join(f'<span class="lg">{esc(n)}</span>' for n in p["mine"])
        return f'<span class="pn">{esc(p["name"])}</span>{tags}'

    board = []
    for t in sorted(tiers):
        block = tiers[t]
        mix = {}
        for p in block:
            mix[p["pos"]] = mix.get(p["pos"], 0) + 1
        slip = f' <span class="slip">{esc(TIER_SLIP[t])}</span>' if t in TIER_SLIP else ""
        chips = "".join(
            f'<span class="mix" style="color:{POS_HUE[k]}">{k} {mix[k]}</span>'
            for k in ("QB", "RB", "WR", "TE") if k in mix)
        trs = "".join(
            f'<tr class="{"mine" if p["mine"] else ""}" data-n="{esc(norm(p["name"]))}"'
            f' data-mine="{1 if p["mine"] else 0}" data-free="{1 if p["free"] else 0}">'
            f'<td class="rk">{p["rank"]}</td>'
            f'<td class="nm">{name_cell(p)}</td>'
            f'<td class="tmc">{esc(p["team"])}</td>'
            f'<td class="byc">bye {p["bye"]}</td>'
            f'<td class="ps">{pill(p["pos"], True)}</td>'
            f'<td class="dl">{delta_cell(p)}</td>'
            f'<td class="wc">{p["prior"] if p["prior"] else ""}</td></tr>'
            for p in block)
        board.append(
            f'<section class="tier" data-tier="{t}"><div class="tb">'
            f'<span class="tno">Tier {t}</span>'
            f'<span class="trg">{block[0]["rank"]} to {block[-1]["rank"]}</span>{slip}'
            f'<span class="tmx">{chips}</span></div>'
            f'<table class="grid"><tbody>{trs}</tbody></table></section>')

    def mover_list(items: list[dict]) -> str:
        return "".join(
            f'<li><span class="mrk">{p["adj"]:+d}</span>{pill(p["pos"], True)}'
            f'<span class="pn">{esc(p["name"])}</span>'
            f'<span class="was">{p["prior"]} to {p["rank"]}</span></li>' for p in items)

    fresh_rows = "".join(
        f'<tr><td class="rk">{p["rank"]}</td><td class="nm">{name_cell(p)}</td>'
        f'<td class="tmc">{esc(p["team"])}</td><td class="ps">{pill(p["pos"], True)}</td>'
        f'<td class="fr">{"free in " + ", ".join(esc(n) for n in p["free"]) if p["free"] else "rostered everywhere"}</td>'
        f'</tr>' for p in fresh)

    gone_rows = "".join(
        f'<li><span class="mrk">{p["rank"]}</span>{pill(p["pos"], True)}'
        f'<span class="pn">{esc(p["name"])}</span>'
        f'<span class="was">{esc(p["team"])}</span></li>' for p in gone)

    reads = []
    for m in league_meta:
        mine_here = sorted((p for p in new if m["name"] in p["mine"]), key=lambda p: p["rank"])
        drops = [p for p in mine_here if p["adj"] is not None and p["adj"] <= -5]
        gains = [p for p in mine_here if p["adj"] is not None and p["adj"] >= 5]
        free_here = [p for p in new if m["name"] in p["free"]][:12]
        line = lambda k, v: f'<p class="ll"><span class="k">{k}</span>{v}</p>' if v else ""
        fmt_list = lambda ps: ", ".join(
            f'{esc(p["name"])} <span class="at">{p["rank"]}</span>' for p in ps)
        reads.append(
            f'<div class="lg-read"><div class="lg-h"><span class="lg-n">{esc(m["name"])}</span>'
            f'<span class="at">{esc(m["fmt"])} &middot; {m["teams"]} teams</span></div>'
            + line("On this half of board", f'{len(mine_here)} of yours')
            + line("He soured on", fmt_list(drops) or "nobody by 5 or more")
            + line("He warmed to", fmt_list(gains) or "nobody by 5 or more")
            + line("Best still unrostered", fmt_list(free_here[:6]) or "none")
            + "</div>")

    page = TEMPLATE.format(
        updated=UPDATED, prior=PRIOR_DATE, prior_url=PRIOR_URL,
        lo=lo, hi=max(p["rank"] for p in new), n=len(new),
        n_fresh=len(fresh), n_gone=len(gone), n_mine=len(held),
        rb=counts["RB"], wr=counts["WR"], te=counts["TE"], qb=counts["QB"],
        leagues=", ".join(esc(m["name"]) for m in league_meta),
        n_leagues=number_word(len(league_meta)), css=BACKYARD_CSS,
        risers=mover_list(risers), fallers=mover_list(fallers),
        fresh_rows=fresh_rows, gone_rows=gone_rows,
        reads="".join(reads), board="".join(board),
    )
    OUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUT} ({len(new)} rows, {len(fresh)} new to the board, "
          f"{len(gone)} gone, {len(held)} you roster)")


TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>Gibbs board update, ranks {lo} to {hi}, {updated}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap">
<style>
{css}</style></head><body>

<p class="eyebrow">Redraft, his half-PPR board as printed</p>
<h1>Gibbs moved off his top 175</h1>
<p class="sub">His new board is a <b>top 200</b>, and this is the half of it you photographed:
<b>ranks {lo} to {hi}</b>, captured {updated}. Against the {prior} board
(<a href="{prior_url}">CBS</a>) <b>{n_fresh} players are new</b> to the range and
<b>{n_gone} are gone</b>. Movement below is re-ranked, meaning both boards are cut to the
players on both before comparing, so the 25 extra slots do not read as everyone falling.
Every rank on this page is his own half-PPR rank, not converted, because the page compares
two of his boards. Gold rows are players you already roster in {leagues}.</p>

<div class="stats">
  <div class="stat"><b>{n}</b><span>rows read</span></div>
  <div class="stat"><b>{n_fresh}</b><span>new</span></div>
  <div class="stat"><b>{n_gone}</b><span>gone</span></div>
  <div class="stat"><b>{n_mine}</b><span>yours</span></div>
  <div class="stat"><b>{rb}</b><span>RB</span></div>
  <div class="stat"><b>{wr}</b><span>WR</span></div>
  <div class="stat"><b>{te}</b><span>TE</span></div>
  <div class="stat"><b>{qb}</b><span>QB</span></div>
</div>

<div class="gap">
  <h3>Ranks 1 to 84 are not in here</h3>
  <p>The screenshot starts at {lo}, and the top of this board is not published anywhere
  reachable: the {prior} CBS piece still serves only its two {prior} images, and his own
  feed is behind a login wall. So the site's main board still holds the complete {prior}
  top 175 rather than a half-and-half hybrid. Send the other screenshot and the full
  top 200 builds in one command.</p>
</div>

<h2>Your {n_leagues} rosters</h2>
{reads}

<h2>Biggest opinion swings</h2>
<div class="cols">
  <div class="card"><h3>He warmed up</h3><ul>{risers}</ul></div>
  <div class="card"><h3>He cooled off</h3><ul>{fallers}</ul></div>
</div>
<p class="legend">Numbers are re-ranked places, not raw rank change. A player can sit lower on
the new board and still show a gain, because 25 slots and {n_fresh} bodies were added around him.</p>

<h2>New to the board</h2>
<div class="tier"><table class="grid"><tbody>{fresh_rows}</tbody></table></div>

<h2>Off the board</h2>
<div class="card"><ul>{gone_rows}</ul></div>
<p class="legend">These were inside his {prior} top 175 at rank {lo} or lower and are not in the
new {lo} to {hi} range. Each is either now inside the new top 84 or off the board entirely.</p>

<div class="bar">
  <input id="q" type="search" placeholder="Filter by name" autocomplete="off" aria-label="Filter by name">
  <button id="fmine" aria-pressed="false">Mine only</button>
  <button id="ffree" aria-pressed="false">Free only</button>
</div>
<p class="legend">The board as printed, {lo} to {hi}, in his half-PPR ranks. Last column is his
{prior} rank. Free means unrostered in at least one of your {n_leagues} leagues. The full-PPR
conversion of his newest board is on the <a href="gibbs-tiers.html">tier page</a>.</p>
{board}

<footer>
<p>Source: Jacob Gibbs' 2026 half-PPR top 200, ranks {lo} to {hi}, transcribed from the
{updated} screenshot. Every row was checked two ways: the printed bye matches that team's
2026 bye, and name plus team plus position resolve to exactly one Sleeper player. Two
independent transcriptions were diffed field by field.</p>
<p>Redraft context only. KTC stays the dynasty value source of truth.</p>
</footer>

<script>
(function () {{
  var q = document.getElementById('q');
  var bMine = document.getElementById('fmine');
  var bFree = document.getElementById('ffree');
  function toggle(b) {{
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    apply();
  }}
  bMine.addEventListener('click', function () {{ toggle(bMine); }});
  bFree.addEventListener('click', function () {{ toggle(bFree); }});
  q.addEventListener('input', apply);
  function apply() {{
    var term = q.value.trim().toLowerCase();
    var mineOnly = bMine.getAttribute('aria-pressed') === 'true';
    var freeOnly = bFree.getAttribute('aria-pressed') === 'true';
    document.querySelectorAll('section.tier').forEach(function (s) {{
      var shown = 0;
      s.querySelectorAll('tbody tr').forEach(function (tr) {{
        var ok = (!term || (tr.dataset.n || '').indexOf(term) !== -1)
          && (!mineOnly || tr.dataset.mine === '1')
          && (!freeOnly || tr.dataset.free === '1');
        tr.classList.toggle('hide', !ok);
        if (ok) shown++;
      }});
      s.classList.toggle('hide', shown === 0);
    }});
  }}
}})();
</script>
</body></html>
"""


if __name__ == "__main__":
    main()
