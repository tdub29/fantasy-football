"""Render the 2026-08-22 Gibbs board update as one self-contained page.

Reads the verified partial source (ranks 85-200 of his new top-200), diffs it
against the Aug-14 top-175 he published on CBS, and overlays Trevor's three
Sleeper rosters. No network, no deps, no build step.

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

POS_HUE = {"QB": "#fb923c", "RB": "#60a5fa", "WR": "#34d399", "TE": "#fbbf24"}
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
        return (f'<span class="{cls}" style="color:{hue};border-color:{hue}59;'
                f'background:{hue}14">{pos}</span>')

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
<meta name="color-scheme" content="dark">
<title>Gibbs board update, ranks {lo} to {hi}, {updated}</title>
<style>
  :root {{
    --obsidian:#0b0d12; --graphite:#11141b; --slate:#161a23; --pewter:#1e2330;
    --edge:#262d3d; --edge-hot:#3a4258;
    --porcelain:#f3f4f6; --bone:#d4d8e0; --fog:#9ca3af; --ash:#6b7280;
    --violet:#a78bfa; --mint:#34d399; --red:#f87171; --amber:#fbbf24;
  }}
  * {{ box-sizing:border-box; }}
  html {{ -webkit-text-size-adjust:100%; }}
  body {{
    margin:0 auto; background:var(--obsidian); color:var(--bone);
    font-family:ui-sans-serif,-apple-system,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;
    font-size:0.94rem; line-height:1.5; font-feature-settings:'ss01','cv11';
    padding:0 16px 64px; max-width:860px;
  }}
  table, .num {{ font-variant-numeric:tabular-nums; }}
  h1 {{ font-size:1.6rem; font-weight:700; letter-spacing:-0.015em; line-height:1.2;
       margin:24px 0 4px; color:var(--porcelain); }}
  h2 {{ font-size:0.95rem; font-weight:600; letter-spacing:0.05em; text-transform:uppercase;
       color:var(--porcelain); margin:32px 0 10px; }}
  .eyebrow {{ font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
              text-transform:uppercase; color:var(--ash); margin-top:20px; }}
  .sub {{ color:var(--fog); margin:6px 0 0; max-width:72ch; }}
  .sub a {{ color:var(--violet); text-decoration:none; border-bottom:1px solid #a78bfa40; }}
  .sub b {{ color:var(--bone); font-weight:600; }}
  .stats {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; }}
  .stat {{ background:var(--graphite); border:1px solid var(--edge); border-radius:10px;
           padding:8px 12px; }}
  .stat b {{ display:block; font-size:1.05rem; font-weight:700; letter-spacing:-0.02em;
             color:var(--porcelain); }}
  .stat span {{ font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
                text-transform:uppercase; color:var(--ash); }}

  .gap {{ margin:20px 0 0; padding:14px 16px; background:#fbbf240d;
          border:1px solid #fbbf2440; border-left:3px solid var(--amber);
          border-radius:0 10px 10px 0; }}
  .gap h3 {{ margin:0 0 6px; font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
             text-transform:uppercase; color:var(--amber); }}
  .gap p {{ margin:0; color:var(--fog); max-width:72ch; }}

  .bar {{ position:sticky; top:0; z-index:5; background:var(--obsidian);
          padding:12px 0 10px; margin-top:20px;
          border-bottom:1px solid var(--edge); display:flex; flex-wrap:wrap;
          gap:8px; align-items:center; }}
  .bar button {{ font:inherit; font-size:0.8rem; font-weight:600; color:var(--bone);
                 background:var(--slate); border:1px solid var(--edge); border-radius:6px;
                 padding:6px 12px; cursor:pointer; transition:background 120ms,border-color 120ms; }}
  .bar button:hover {{ background:#232938; border-color:var(--edge-hot); }}
  .bar button:active {{ transform:translateY(1px); }}
  .bar button[aria-pressed="true"] {{ color:var(--porcelain); border-color:var(--violet);
                                      background:#a78bfa1f; }}
  .bar input {{ font:inherit; font-size:0.85rem; color:var(--porcelain); background:var(--slate);
                border:1px solid var(--edge); border-radius:6px; padding:6px 10px;
                flex:1 1 180px; min-width:0; }}
  .bar input:focus {{ outline:none; border-color:var(--violet); box-shadow:0 0 0 3px #a78bfa26; }}

  .legend {{ margin:10px 0 0; color:var(--ash); font-size:0.78rem; max-width:72ch; }}
  .tier {{ margin-top:18px; scroll-margin-top:64px; }}
  .tb {{ display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
         padding:6px 0; border-bottom:1px solid var(--edge-hot); }}
  .tno {{ font-size:0.75rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
          color:var(--porcelain); }}
  .trg {{ font-size:0.75rem; font-weight:600; color:var(--ash); }}
  .slip {{ font-size:0.7rem; color:var(--amber); }}
  .tmx {{ margin-left:auto; display:flex; gap:8px; }}
  .mix {{ font-size:0.7rem; font-weight:600; letter-spacing:0.04em; }}

  table.grid {{ width:100%; border-collapse:collapse; }}
  .grid td {{ border-bottom:1px solid var(--edge); padding:7px 6px; vertical-align:middle; }}
  .grid tr:hover td {{ background:var(--slate); }}
  .grid tr.mine td {{ background:#a78bfa0f; }}
  .grid tr.mine:hover td {{ background:#a78bfa1a; }}
  td.rk {{ width:46px; text-align:right; font-weight:700; letter-spacing:-0.02em;
           color:var(--porcelain); }}
  td.nm {{ line-height:1.35; }}
  td.tmc {{ width:52px; color:var(--fog); font-size:0.8rem; }}
  td.byc {{ width:58px; color:var(--ash); font-size:0.75rem; }}
  td.ps {{ width:56px; text-align:right; }}
  td.dl {{ width:56px; text-align:right; }}
  td.wc {{ width:44px; text-align:right; color:var(--ash); font-size:0.75rem; }}
  td.fr {{ color:var(--fog); font-size:0.78rem; }}
  .pn {{ color:var(--porcelain); }}
  .lg {{ display:inline-block; margin-left:8px; padding:1px 7px; border-radius:999px;
         font-size:0.68rem; font-weight:600; color:var(--violet);
         border:1px solid #a78bfa66; background:#a78bfa14; }}
  .pill {{ display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid;
           font-size:0.72rem; font-weight:600; }}
  .pill.sm {{ padding:1px 7px; font-size:0.68rem; }}
  .d {{ font-size:0.75rem; font-weight:700; }}
  .d.up {{ color:var(--mint); }}
  .d.down {{ color:var(--red); }}
  .d.flat {{ color:var(--ash); }}
  .d.new {{ color:var(--amber); font-size:0.68rem; letter-spacing:0.04em; }}

  .cols {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
  .card {{ background:var(--graphite); border:1px solid var(--edge); border-radius:10px;
           padding:16px; }}
  .card h3 {{ margin:0 0 10px; font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
              text-transform:uppercase; color:var(--fog); }}
  .card ul {{ list-style:none; margin:0; padding:0; }}
  .card li {{ display:flex; align-items:center; gap:8px; padding:5px 0;
              border-bottom:1px solid var(--edge); font-size:0.85rem; }}
  .card li:last-child {{ border-bottom:0; }}
  .mrk {{ width:34px; text-align:right; color:var(--porcelain); font-weight:700;
          font-variant-numeric:tabular-nums; }}
  .was {{ margin-left:auto; color:var(--ash); font-size:0.75rem; }}

  .lg-read {{ background:var(--graphite); border:1px solid var(--edge); border-radius:10px;
              padding:14px 16px; margin-bottom:10px; }}
  .lg-h {{ display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
           padding-bottom:8px; margin-bottom:6px; border-bottom:1px solid var(--edge); }}
  .lg-n {{ color:var(--porcelain); font-weight:600; }}
  .at {{ color:var(--ash); font-size:0.75rem; }}
  .ll {{ margin:5px 0; font-size:0.85rem; }}
  .k {{ display:inline-block; min-width:150px; color:var(--fog); font-size:0.72rem;
        font-weight:600; letter-spacing:0.05em; text-transform:uppercase; }}
  footer {{ margin-top:40px; padding-top:14px; border-top:1px solid var(--edge);
            color:var(--ash); font-size:0.78rem; }}
  footer p {{ max-width:72ch; }}
  .hide {{ display:none !important; }}
  @media (max-width:720px) {{
    body {{ padding:0 12px 56px; }}
    .cols {{ grid-template-columns:1fr; }}
    .tmx {{ width:100%; margin-left:0; }}
    td.byc, td.wc {{ display:none; }}
    td.tmc {{ width:38px; font-size:0.75rem; }}
    td.ps {{ width:46px; }}
    td.dl {{ width:44px; }}
    .grid td {{ padding:7px 3px; }}
    .pill {{ padding:2px 6px; font-size:0.68rem; }}
    .card li {{ flex-wrap:wrap; }}
    .k {{ display:block; min-width:0; }}
  }}
</style></head><body>

<p class="eyebrow">Redraft, half PPR, his own scoring</p>
<h1>Gibbs moved off his top 175</h1>
<p class="sub">His new board is a <b>top 200</b>, and this is the half of it you photographed:
<b>ranks {lo} to {hi}</b>, captured {updated}. Against the {prior} board
(<a href="{prior_url}">CBS</a>) <b>{n_fresh} players are new</b> to the range and
<b>{n_gone} are gone</b>. Movement below is re-ranked, meaning both boards are cut to the
players on both before comparing, so the 25 extra slots do not read as everyone falling.
Violet rows are players you already roster in {leagues}.</p>

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

<h2>Your three rosters</h2>
{reads}

<h2>Biggest opinion swings</h2>
<div class="cols">
  <div class="card"><h3>He warmed up</h3><ul>{risers}</ul></div>
  <div class="card"><h3>He cooled off</h3><ul>{fallers}</ul></div>
</div>
<p class="legend">Numbers are re-ranked places, not raw rank change. A player can sit lower on
the new board and still show a gain, because 25 slots and {n_fresh} bodies were added around him.</p>

<h2>New to the board</h2>
<table class="grid"><tbody>{fresh_rows}</tbody></table>

<h2>Off the board</h2>
<div class="card"><ul>{gone_rows}</ul></div>
<p class="legend">These were inside his {prior} top 175 at rank {lo} or lower and are not in the
new {lo} to {hi} range. Each is either now inside the new top 84 or off the board entirely.</p>

<div class="bar">
  <input id="q" type="search" placeholder="Filter by name" autocomplete="off" aria-label="Filter by name">
  <button id="fmine" aria-pressed="false">Mine only</button>
  <button id="ffree" aria-pressed="false">Free only</button>
</div>
<p class="legend">The board as printed, {lo} to {hi}. Last column is his {prior} rank.
Free means unrostered in at least one of your three leagues.</p>
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
