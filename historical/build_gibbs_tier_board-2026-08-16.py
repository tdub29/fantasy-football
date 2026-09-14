"""Render the Jacob Gibbs top-175 tier sheet as one self-contained HTML board.

Reads the generated site data (no network, no build step) and writes a single
file that opens on a phone with search, position filters, roster ownership from
the three Sleeper leagues, and the rank move since Gibbs' previous board.

    python site/data/build_gibbs_tier_board.py [--output docs/gibbs-tier-board-<date>.html]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "site" / "data"

POS_COLOR = {"QB": "#f87171", "RB": "#60a5fa", "WR": "#34d399", "TE": "#fbbf24"}
LEAGUE_TAG = {"Password is taco": "taco", "The League": "League", "yuH": "yuH"}


def globals_in(path: Path) -> dict:
    """Parse every `window.NAME = <json>;` assignment in a generated data file."""
    text = path.read_text(encoding="utf-8")
    parts = re.split(r"^window\.(\w+)\s*=\s*", text, flags=re.M)
    out = {}
    for i in range(1, len(parts), 2):
        body = parts[i + 1].strip().rstrip(";").strip()
        out[parts[i]] = json.loads(body)
    return out


def leagues() -> tuple[list[dict], str]:
    lg = globals_in(DATA / "leagues.js")
    return lg["LEAGUES"], str(lg["MY_USER_ID"])


def owner_map() -> dict[str, list[str]]:
    """sleeperId -> league tags where tdub1329 rosters that player."""
    all_leagues, me = leagues()
    owned: dict[str, list[str]] = {}
    for league in all_leagues:
        # Sleeper league names carry stray whitespace ("The League ").
        name = league["name"].strip()
        tag = LEAGUE_TAG.get(name, name[:6])
        for roster in league["rosters"]:
            if str(roster.get("owner_id")) != me:
                continue
            for pid in roster.get("players") or []:
                owned.setdefault(str(pid), []).append(tag)
    return owned


def league_reads(players: list[dict], prior: dict) -> list[dict]:
    """Per league: what this board says about the roster and what is still free."""
    by_id = {str(p["sleeperId"]): p for p in players if p.get("sleeperId")}
    all_leagues, me = leagues()
    reads = []
    for league in all_leagues:
        taken = {str(pid) for r in league["rosters"] for pid in (r.get("players") or [])}
        mine = [by_id[str(pid)] for r in league["rosters"]
                if str(r.get("owner_id")) == me
                for pid in (r.get("players") or []) if str(pid) in by_id]
        mine.sort(key=lambda p: p["rank"])
        moves = sorted(
            ((prior[str(p["sleeperId"])] - p["rank"], p) for p in mine
             if str(p["sleeperId"]) in prior),
            key=lambda pair: pair[0])
        free = sorted((p for pid, p in by_id.items() if pid not in taken),
                      key=lambda p: p["rank"])
        fmt = "superflex" if league.get("is_superflex") else "1QB"
        if league.get("is_idp"):
            fmt += ", IDP"
        reads.append({
            "name": league["name"].strip(), "format": fmt,
            "teams": league.get("total_rosters"),
            "mine": mine, "free": free,
            "down": [pair for pair in moves[:3] if pair[0] < -8],
            "up": [pair for pair in reversed(moves[-3:]) if pair[0] > 8],
        })
    return reads


def prior_board() -> tuple[dict[str, int], dict[str, str], str]:
    """Gibbs' previous overall board: rank and name by Sleeper id, plus its date."""
    sources = globals_in(DATA / "expert-rankings.js")["EXPERT_RANKINGS"]
    prior = next((s for s in sources if s["id"] == "gibbs-fp-2026-07"), None)
    if not prior:
        return {}, {}, ""
    have = [p for p in prior["players"] if p.get("sleeperId")]
    return ({str(p["sleeperId"]): p["rank"] for p in have},
            {str(p["sleeperId"]): p["name"] for p in have},
            prior["updatedAt"])


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def move_cell(new_rank: int, old_rank: int | None) -> tuple[str, str]:
    """(text, css class). Gibbs ranks fewer players now, so 'new' is common."""
    if old_rank is None:
        return "new", "move new"
    delta = old_rank - new_rank
    if delta == 0:
        return "0", "move flat"
    return (f"+{delta}" if delta > 0 else str(delta)), ("move up" if delta > 0 else "move down")


CSS = """
:root{
  --obsidian:#0b0d12; --graphite:#11141b; --slate:#161a23; --pewter:#1e2330;
  --edge:#262d3d; --edge-hot:#3a4258;
  --porcelain:#f3f4f6; --bone:#d4d8e0; --fog:#9ca3af; --ash:#6b7280;
  --violet:#a78bfa; --mint:#34d399; --red:#f87171; --amber:#fbbf24;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--obsidian); color:var(--porcelain);
  font-family:ui-sans-serif,-apple-system,'SF Pro Text','Inter','Segoe UI',Roboto,sans-serif;
  font-size:.94rem; line-height:1.5; font-variant-numeric:tabular-nums;
}
.wrap{max-width:820px;margin:0 auto;padding:20px 14px 64px}
h1{font-size:1.6rem;font-weight:700;letter-spacing:-.015em;line-height:1.2;margin:0 0 4px}
.sub{color:var(--fog);font-size:.85rem;margin:0 0 14px}
.sub b{color:var(--bone);font-weight:600}
.rule{height:1px;background:var(--edge);margin:14px 0}
.counts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.count{font-size:.75rem;font-weight:600;letter-spacing:.06em;padding:2px 8px;border-radius:999px;
  border:1px solid var(--edge);background:var(--graphite);color:var(--fog)}
.controls{position:sticky;top:0;z-index:5;background:var(--obsidian);
  padding:10px 0;border-bottom:1px solid var(--edge);margin-bottom:6px}
input[type=search]{width:100%;background:var(--slate);color:var(--porcelain);
  border:1px solid var(--edge);border-radius:6px;padding:8px 10px;font:inherit;font-size:1rem}
input[type=search]:focus{outline:none;border-color:var(--violet);box-shadow:0 0 0 2px rgba(167,139,250,.35)}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
button{font:inherit;font-size:.8rem;font-weight:600;letter-spacing:.04em;background:var(--slate);
  color:var(--bone);border:1px solid var(--edge);border-radius:6px;padding:5px 13px;cursor:pointer;
  min-height:40px;transition:background-color 120ms,border-color 120ms}
button:hover{background:#232938;border-color:var(--edge-hot)}
button:active{transform:translateY(1px)}
button:focus-visible{outline:2px solid var(--violet);outline-offset:2px}
button[aria-pressed=true]{background:var(--pewter);border-color:var(--edge-hot);color:var(--porcelain)}
button.qb[aria-pressed=true]{color:var(--red)} button.rb[aria-pressed=true]{color:#60a5fa}
button.wr[aria-pressed=true]{color:var(--mint)} button.te[aria-pressed=true]{color:var(--amber)}
button.mine[aria-pressed=true]{color:var(--violet);border-color:var(--violet)}
.tier{margin-top:18px}
.tier-head{display:flex;align-items:baseline;gap:8px;padding:0 0 6px;border-bottom:1px solid var(--edge)}
.tier-n{font-size:.75rem;font-weight:600;letter-spacing:.06em;color:var(--violet)}
.tier-meta{font-size:.75rem;color:var(--fog);letter-spacing:.04em}
table{width:100%;border-collapse:collapse}
tr{border-bottom:1px solid rgba(38,45,61,.55)}
tr:last-child{border-bottom:none}
tr.mine{background:rgba(167,139,250,.07)}
td{padding:7px 4px;vertical-align:baseline}
td.rk{width:2.6em;text-align:right;color:var(--fog);font-size:.85rem;font-weight:600;padding-right:9px}
td.nm{font-weight:600}
.team{color:var(--fog);font-weight:400;font-size:.82rem;margin-left:5px;white-space:nowrap}
td.ps{width:3.1em;text-align:right}
.pill{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.05em;
  padding:1px 7px;border-radius:999px;border:1px solid;background:var(--graphite)}
td.mv{width:3.6em;text-align:right;font-size:.78rem;font-weight:600}
.move.up{color:var(--mint)} .move.down{color:var(--red)}
.move.flat,.move.new{color:var(--fog);font-weight:400}
.own{display:inline-block;font-size:.66rem;font-weight:600;letter-spacing:.04em;color:var(--violet);
  border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.08);
  border-radius:999px;padding:0 6px;margin-left:5px;white-space:nowrap}
.empty{display:none;color:var(--fog);padding:22px 2px;font-size:.9rem}
.movers{margin:16px 0 0;border:1px solid var(--edge);border-radius:10px;
  background:var(--graphite);padding:12px 14px}
.movers h2{font-size:.75rem;font-weight:600;letter-spacing:.06em;color:var(--fog);margin:0 0 8px}
.movers ul{list-style:none;margin:0;padding:0;
  display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:2px 18px}
.movers li{font-size:.82rem;padding:2px 0;display:flex;gap:8px;align-items:baseline}
.movers .d{width:3.2em;text-align:right;font-weight:600;flex:none}
.movers .who{color:var(--bone)}
.movers .at{color:var(--ash);font-size:.75rem}
.movers .out{margin:10px 0 0;font-size:.78rem;color:var(--fog);line-height:1.55}
.movers .out b{color:var(--bone);font-weight:600}
.leagues{margin:10px 0 0;border:1px solid var(--edge);border-radius:10px;
  background:var(--graphite);padding:12px 14px}
.leagues h2{font-size:.75rem;font-weight:600;letter-spacing:.06em;color:var(--fog);margin:0 0 10px}
.lg{padding:9px 0;border-top:1px solid var(--edge)}
.lg:first-of-type{border-top:none;padding-top:0}
.lg-h{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:4px}
.lg-n{font-weight:600;color:var(--porcelain);font-size:.9rem}
.lg-l{margin:2px 0;font-size:.82rem;color:var(--bone);line-height:1.5}
.lg-l .k{display:inline-block;min-width:8.4em;color:var(--ash);font-size:.72rem;
  font-weight:600;letter-spacing:.05em;text-transform:uppercase}
.leagues .at{color:var(--ash);font-size:.75rem;font-weight:400}
.leagues .out{margin:10px 0 0;font-size:.78rem;color:var(--fog);line-height:1.55}
@media (max-width:430px){.lg-l .k{display:block;min-width:0;margin-top:5px}}
.note{color:var(--fog);font-size:.78rem;line-height:1.55;margin-top:26px;
  border-top:1px solid var(--edge);padding-top:12px}
.note b{color:var(--bone);font-weight:600}
@media (max-width:430px){
  .wrap{padding:16px 11px 56px}
  h1{font-size:1.35rem}
  .team{display:block;margin-left:0}
  td{padding:8px 3px}
}
"""

JS = """
(function(){
  var q = document.getElementById('q');
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-n]'));
  var pos = '', mine = false;
  function apply(){
    var t = q.value.trim().toLowerCase();
    rows.forEach(function(r){
      var ok = (!t || r.dataset.n.indexOf(t) > -1 || r.dataset.tm.indexOf(t) > -1)
            && (!pos || r.dataset.p === pos)
            && (!mine || r.dataset.own === '1');
      r.hidden = !ok;
    });
    var shown = 0;
    document.querySelectorAll('section.tier').forEach(function(s){
      var live = s.querySelectorAll('tr[data-n]:not([hidden])').length;
      s.hidden = live === 0; shown += live;
    });
    document.querySelector('.empty').style.display = shown ? 'none' : 'block';
    document.getElementById('shown').textContent = shown + ' shown';
  }
  q.addEventListener('input', apply);
  document.querySelectorAll('button[data-pos]').forEach(function(b){
    b.addEventListener('click', function(){
      pos = (pos === b.dataset.pos) ? '' : b.dataset.pos;
      document.querySelectorAll('button[data-pos]').forEach(function(o){
        o.setAttribute('aria-pressed', String(o.dataset.pos === pos));
      });
      apply();
    });
  });
  var mb = document.getElementById('mine');
  mb.addEventListener('click', function(){
    mine = !mine; mb.setAttribute('aria-pressed', String(mine)); apply();
  });
  apply();
})();
"""


def movers_block(players: list[dict], prior: dict, prior_names: dict, prior_date: str) -> str:
    """Top risers/fallers vs the previous board, plus who fell out of the top 175."""
    if not prior:
        return ""
    moved = sorted(
        ((prior[str(p["sleeperId"])] - p["rank"], p) for p in players
         if str(p.get("sleeperId")) in prior),
        key=lambda pair: pair[0])
    if not moved:
        return ""
    here = {str(p.get("sleeperId")) for p in players}
    cut = sorted((rank, prior_names[pid]) for pid, rank in prior.items()
                 if rank <= len(players) and pid not in here)

    def line(delta: int, p: dict) -> str:
        cls = "up" if delta > 0 else "down" if delta < 0 else "flat"
        sign = f"+{delta}" if delta > 0 else str(delta)
        return (f'<li><span class="d move {cls}">{sign}</span>'
                f'<span class=who>{esc(p["name"])} '
                f'<span class=at>{p["pos"]}, now {p["rank"]}</span></span></li>')

    out = ['<section class=movers>', f'<h2>BIGGEST MOVES SINCE {esc(prior_date)}</h2>', "<ul>"]
    for delta, p in reversed(moved[-5:]):
        out.append(line(delta, p))
    for delta, p in moved[:5]:
        out.append(line(delta, p))
    out.append("</ul>")
    if cut:
        names = ", ".join(f"{esc(n)} ({r})" for r, n in cut[:8])
        more = f", and {len(cut) - 8} more" if len(cut) > 8 else ""
        out.append(f'<p class=out><b>Fell out of the top {len(players)}:</b> {names}{more}. '
                   "The number is where he had them before.</p>")
    out.append("</section>")
    return "\n".join(out)


def leagues_block(reads: list[dict], prior_date: str) -> str:
    """What the board says about each of the three Sleeper rosters."""
    if not reads:
        return ""
    out = ['<section class=leagues>', "<h2>YOUR THREE ROSTERS ON THIS BOARD</h2>"]
    for r in reads:
        top = ", ".join(f'{esc(p["name"])} <span class=at>{p["rank"]}</span>' for p in r["mine"][:5])
        out.append('<div class=lg>')
        out.append(f'<div class=lg-h><span class=lg-n>{esc(r["name"])}</span>'
                   f'<span class=at>{r["teams"]} teams, {esc(r["format"])}, '
                   f'{len(r["mine"])} ranked</span></div>')
        out.append(f'<p class=lg-l><span class=k>Best you hold</span> {top or "none on this board"}</p>')
        for label, pairs, cls in (("Gibbs soured on", r["down"], "down"),
                                  ("Gibbs warmed to", r["up"], "up")):
            if pairs:
                body = ", ".join(
                    f'{esc(p["name"])} <span class="move {cls}">'
                    f'{("+" + str(d)) if d > 0 else d}</span>' for d, p in pairs)
                out.append(f'<p class=lg-l><span class=k>{label}</span> {body}</p>')
        if r["free"]:
            body = ", ".join(f'{esc(p["name"])} <span class=at>{p["rank"]} {p["pos"]}</span>'
                             for p in r["free"][:6])
            more = f", and {len(r['free']) - 6} more" if len(r["free"]) > 6 else ""
            out.append(f'<p class=lg-l><span class=k>Still free</span> {body}{more}</p>')
        else:
            out.append('<p class=lg-l><span class=k>Still free</span> nobody, '
                       "every ranked player is on a roster</p>")
        out.append("</div>")
    out.append(f'<p class=out>Moves are against his {esc(prior_date)} board. '
               "Free agents are players nobody in that league rosters, so the list being "
               "short is the league being deep, not the board being thin.</p>")
    out.append("</section>")
    return "\n".join(out)


def render(board: dict, owned: dict, prior: dict, prior_names: dict, prior_date: str) -> str:
    players = board["players"]
    by_pos: dict[str, int] = {}
    for p in players:
        by_pos[p["pos"]] = by_pos.get(p["pos"], 0) + 1
    mine_n = sum(1 for p in players if str(p.get("sleeperId")) in owned)

    tiers: list[tuple[int, list[dict]]] = []
    for p in players:
        if not tiers or tiers[-1][0] != p["tier"]:
            tiers.append((p["tier"], []))
        tiers[-1][1].append(p)

    out: list[str] = []
    out.append("<!doctype html><html lang=en><head><meta charset=utf-8>")
    out.append('<meta name=viewport content="width=device-width,initial-scale=1">')
    out.append("<title>Gibbs 2026 tier board, top 175</title>")
    out.append('<meta name="color-scheme" content="dark">')
    out.append("<style>" + CSS + "</style></head><body><div class=wrap>")
    out.append("<h1>Gibbs 2026 tier board</h1>")
    out.append(
        f'<p class=sub>Top {len(players)} overall in {len(tiers)} tiers, single-QB managed leagues, '
        f'half-PPR redraft. Jacob Gibbs, as of <b>{esc(board["updatedAt"])}</b>.</p>'
    )
    out.append('<div class=counts>')
    for pos in ("QB", "RB", "WR", "TE"):
        out.append(f'<span class=count>{pos} {by_pos.get(pos, 0)}</span>')
    out.append(f'<span class=count>{mine_n} on your rosters</span>')
    out.append('<span class=count id=shown aria-live=polite></span>')
    out.append("</div>")
    out.append(movers_block(players, prior, prior_names, prior_date))
    out.append(leagues_block(league_reads(players, prior), prior_date))

    out.append('<div class=controls>')
    out.append('<input id=q type=search aria-label="Search the board by player or team" '
               'placeholder="Search a player or team" autocomplete=off>')
    out.append('<div class=filters>')
    for pos in ("QB", "RB", "WR", "TE"):
        out.append(f'<button class="{pos.lower()}" data-pos="{pos}" aria-pressed=false>{pos}</button>')
    out.append('<button id=mine class=mine aria-pressed=false>On my rosters</button>')
    out.append("</div></div>")

    for tier, group in tiers:
        lo, hi = group[0]["rank"], group[-1]["rank"]
        span = f"{lo}" if lo == hi else f"{lo} to {hi}"
        out.append('<section class=tier>')
        out.append(
            f'<div class=tier-head><span class=tier-n>TIER {tier}</span>'
            f'<span class=tier-meta>{span}, {len(group)} player{"s" if len(group) != 1 else ""}</span></div>'
        )
        out.append("<table><tbody>")
        for p in group:
            pid = str(p.get("sleeperId") or "")
            tags = owned.get(pid, [])
            txt, cls = move_cell(p["rank"], prior.get(pid))
            colour = POS_COLOR[p["pos"]]
            own_html = "".join(f'<span class=own>{esc(t)}</span>' for t in tags)
            out.append(
                f'<tr data-n="{esc(p["name"].lower())}" data-tm="{esc(p["team"].lower())}" '
                f'data-p="{p["pos"]}" data-own="{1 if tags else 0}"{" class=mine" if tags else ""}>'
                f'<td class=rk>{p["rank"]}</td>'
                f'<td class=nm>{esc(p["name"])}{own_html}'
                f'<span class=team>{esc(p["team"])} bye {p["bye"]}</span></td>'
                f'<td class=ps><span class=pill style="color:{colour};border-color:{colour}66">'
                f'{p["pos"]}{p.get("posRank", "")}</span></td>'
                f'<td class=mv><span class="{cls}">{txt}</span></td>'
                "</tr>"
            )
        out.append("</tbody></table></section>")

    out.append('<p class=empty>Nothing matches that filter.</p>')
    unranked_before = sum(1 for p in players if str(p.get("sleeperId")) not in prior)
    note = ["<p class=note>The right-hand number is the move since Gibbs' previous board"]
    if prior_date:
        note.append(f" ({esc(prior_date)})")
    note.append(", green up, red down.")
    if unranked_before:
        note.append(' <b>new</b> means he did not rank the player then. That board went 315 deep '
                    'and this one stops at 175, so a "new" tag is not a promotion by itself.')
    note.append(" Violet rows and tags are players you already roster. This is a <b>redraft</b> "
                "board, so it prices 2026 production only. KTC stays the dynasty value source "
                "of truth.</p>")
    out.append("".join(note))
    out.append("</div><script>" + JS + "</script></body></html>")
    return "\n".join(out)


def main() -> None:
    board = globals_in(DATA / "jacob-gibbs.js")["JACOB_GIBBS_RANKINGS"]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "docs" / f"gibbs-tier-board-{board['updatedAt']}.html")
    args = parser.parse_args()
    prior, prior_names, prior_date = prior_board()
    html = render(board, owner_map(), prior, prior_names, prior_date)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding="utf-8")
    print(f"Wrote {len(board['players'])} players to {args.output} ({len(html):,} bytes)")


if __name__ == "__main__":
    main()
