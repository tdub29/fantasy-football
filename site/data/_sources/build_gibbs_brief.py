"""Render the Gibbs tier board as one self-contained page (site/gibbs-tiers.html).

Reads the generated jacob-gibbs.js (current board), the newest archived Gibbs board
older than it (for the movers column, resolved by date rather than by filename), and
leagues.js (to mark who Trevor already rosters).
No network, no deps, no build step: open the output file and it works.

    python site/data/_sources/build_gibbs_brief.py
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CURRENT = ROOT / "site" / "data" / "jacob-gibbs.js"
HISTORICAL = ROOT / "historical"
LEAGUES = ROOT / "site" / "data" / "leagues.js"
OUT = ROOT / "site" / "gibbs-tiers.html"
DERIVED = ROOT / "site" / "data" / "_expert_sources.json"
DERIVED_ID = "gibbs-ppr-2026-08"

STRATEGY_URL = ("https://www.cbssports.com/fantasy/football/news/"
                "jacob-gibbs-rankings-fantasy-football-2026-half-ppr/")
STRATEGY_WHEN = "August 14"

# Position hue = position meaning, and every pill still carries its letters, so the
# color is reinforcement rather than the message (DESIGN.md tier-chip rule).
POS_HUE = {"QB": "#fb923c", "RB": "#60a5fa", "WR": "#34d399", "TE": "#fbbf24"}

# Gibbs' own words from the CBS piece, trimmed to the actionable line.
STRATEGY = [
    ("QB", "Wait. \"By far, my favorites have been the ones where I waited as long as "
           "possible to select a QB.\" He is well above consensus on Kyler Murray, Malik "
           "Willis, Baker Mayfield and Jared Goff, and calls Josh Allen in Round 4 the "
           "green goblin mask."),
    ("RB", "Leave the first three rounds with at least two backs. Javonte Williams and "
           "D'Andre Swift are fine Round 4 security; Cam Skattebo is the Round 4 dice roll. "
           "Bucky Irving and Bhayshul Tuten are the Round 5 upside shots. Other than "
           "Jonathon Brooks he avoids the position entirely in Rounds 6 through 9, then "
           "stacks handcuff-adjacent backs late."),
    ("WR", "After the top three RBs go, a stack of receivers look like great Round 1 picks. "
           "He generally avoids WR in Round 2, with A.J. Brown the exception. Rounds 3 "
           "through 6 are where the league winners are, and he still likes plenty of names "
           "in the lower-hit-rate 7 to 11 range."),
    ("TE", "He prefers to wait but will take a mid-round shot sooner than at QB. Sam LaPorta "
           "is his mispriced call, Tucker Kraft nearly as much, and Tyler "
           "Warren and Harold Fannin Jr. are both valid. Double-dipping a TE with his own "
           "WR is fine by him. Late: Dallas Goedert on ADP value, Gunnar Helm and Terrance "
           "Ferguson as Year 2 breakouts, Brenton Strange as the free glue guy."),
]
HOT_TAKES = [
    ("Favorite Round 2", "CeeDee Lamb, Omarion Hampton, Kenneth Walker"),
    ("Favorite Round 3", "A.J. Brown, George Pickens, Malik Nabers, Emeka Egbuka, Jeremiyah Love"),
    ("Favorite Round 4", "Zay Flowers, Ladd McConkey, Colston Loveland, Cam Skattebo, Luther Burden"),
    ("Favorite sleeper", "Josh Downs"),
    ("Favorite breakout", "Bhayshul Tuten"),
]


def newest_prior_board() -> tuple[Path, dict]:
    """The most recent archived Gibbs board that predates the live one.

    Hardcoding this filename is what made the movers column diff against a
    different publisher's month-old board for a week, so it is resolved instead:
    every archived board carries its own updatedAt, and the newest one older than
    the current board is the right thing to diff against.
    """
    current = read_global(CURRENT, "window.JACOB_GIBBS_RANKINGS")["updatedAt"]
    dated = []
    for path in sorted(HISTORICAL.glob("jacob-gibbs-*.js")):
        try:
            board = read_global(path, "window.JACOB_GIBBS_RANKINGS")
        except Exception:
            continue
        when = board.get("updatedAt")
        if when and when < current:
            dated.append((when, path, board))
    if not dated:
        raise SystemExit(f"no archived Gibbs board older than {current} in {HISTORICAL}")
    when, path, board = max(dated, key=lambda row: row[0])
    return path, board


def read_global(path: Path, name: str):
    text = path.read_text(encoding="utf-8")
    body = text.split(f"{name}=", 1)[1] if f"{name}=" in text else text.split(f"{name} =", 1)[1]
    body = body.split("window.", 1)[0].strip().rstrip(";").strip()
    return json.loads(body)


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def main() -> None:
    board = read_global(CURRENT, "window.JACOB_GIBBS_RANKINGS")
    players = board["players"]
    prior_path, prior_board_data = newest_prior_board()
    prior = {p["sleeperId"]: p["rank"] for p in prior_board_data["players"]}
    prior_when = prior_board_data["updatedAt"]
    leagues = read_global(LEAGUES, "window.LEAGUES")

    owned: dict[str, list[str]] = {}
    league_names = []
    for lg in leagues:
        mine = next((r for r in lg.get("rosters", []) if r.get("is_me")), None)
        if not mine:
            continue
        league_names.append(lg["name"].strip())
        for pid in mine.get("players") or []:
            owned.setdefault(str(pid), []).append(lg["name"].strip())

    # The full-PPR adaptation, generated by build_gibbs_fullppr.py. It is derived,
    # not Gibbs' published board, and it is what these three PPR leagues actually use.
    derived = next(s for s in json.loads(DERIVED.read_text(encoding="utf-8"))
                   if s["id"] == DERIVED_ID)
    ppr_by_id = {str(d["sleeperId"]): d for d in derived["players"]}

    for p in players:
        p["prior"] = prior.get(p["sleeperId"])
        p["delta"] = (p["prior"] - p["rank"]) if p["prior"] else None
        p["mine"] = owned.get(str(p["sleeperId"]), [])
        p["ppr"] = ppr_by_id[str(p["sleeperId"])]

    tiers: dict[int, list] = {}
    for p in players:
        tiers.setdefault(p["tier"], []).append(p)

    # Positional runway: how many of each position are gone by the end of each tier.
    runway, seen = [], {"QB": 0, "RB": 0, "WR": 0, "TE": 0}
    for t in sorted(tiers):
        for p in tiers[t]:
            seen[p["pos"]] += 1
        runway.append((t, tiers[t][0]["rank"], tiers[t][-1]["rank"], dict(seen)))

    ranked = [p for p in players if p["delta"] is not None]
    risers = sorted(ranked, key=lambda p: -p["delta"])[:12]
    fallers = sorted(ranked, key=lambda p: p["delta"])[:12]

    # Players Gibbs had on the previous board who are off this one entirely.
    by_id = {str(p["sleeperId"]): p for p in players}
    prior_board = prior_board_data["players"]
    fell_out = sorted(
        ((p["rank"], p["name"]) for p in prior_board
         if p["rank"] <= len(players) and str(p["sleeperId"]) not in by_id),
        key=lambda pair: pair[0])

    # Per league: what the board says about the roster, and who is still unrostered.
    reads = []
    for lg in leagues:
        rosters = lg.get("rosters", [])
        mine_r = next((r for r in rosters if r.get("is_me")), None)
        if not mine_r:
            continue
        taken = {str(pid) for r in rosters for pid in (r.get("players") or [])}
        held = sorted((by_id[str(pid)] for pid in (mine_r.get("players") or [])
                       if str(pid) in by_id), key=lambda p: p["rank"])
        moved = sorted((p for p in held if p["delta"] is not None), key=lambda p: p["delta"])
        free = sorted((p for pid, p in by_id.items() if pid not in taken),
                      key=lambda p: p["rank"])
        fmt = "superflex" if lg.get("is_superflex") else "1QB"
        if lg.get("is_idp"):
            fmt += ", IDP"
        reads.append({
            "name": lg["name"].strip(), "format": fmt, "teams": lg.get("total_rosters"),
            "held": held, "free": free,
            "down": [p for p in moved[:3] if p["delta"] < -8],
            "up": [p for p in reversed(moved[-3:]) if p["delta"] > 8],
        })

    def move_cell(d, new_word="new") -> str:
        if d is None:
            return f'<span class="d flat">{new_word}</span>'
        if d > 0:
            return f'<span class="d up">+{d}</span>'
        if d < 0:
            return f'<span class="d down">{d}</span>'
        return '<span class="d flat">0</span>'

    def row(p, ppr: bool) -> str:
        hue = POS_HUE[p["pos"]]
        rank = p["ppr"]["rank"] if ppr else p["rank"]
        pos_rank = p["ppr"]["posRank"] if ppr else p["posRank"]
        delta = move_cell(p["ppr"]["move"] if ppr else p["delta"])
        tags = "".join(f'<span class="lg">{esc(n)}</span>' for n in p["mine"])
        rec = (f'<td class="num rec">{p["ppr"]["projRec"]:.0f}</td>' if ppr
               else '<td class="num rec"></td>')
        return (
            f'<tr class="r{" mine" if p["mine"] else ""}" data-pos="{p["pos"]}" '
            f'data-mine="{1 if p["mine"] else 0}" data-name="{esc(p["name"].lower())}">'
            f'<td class="num rk">{rank}</td>'
            f'<td class="nm"><span class="pn">{esc(p["name"])}</span>{tags}</td>'
            f'<td class="tmc">{esc(p["team"])}</td>'
            f'{rec}'
            f'<td class="byc">bye {p["bye"]}</td>'
            f'<td class="ps"><span class="pill" style="color:{hue};border-color:{hue}66;'
            f'background:{hue}14">{p["pos"]}{pos_rank}</span></td>'
            f'<td class="num dl">{delta}</td></tr>'
        )

    def board_html(groups, ppr: bool) -> str:
        out = []
        for t in sorted(groups):
            group = groups[t]
            mix = {}
            for p in group:
                mix[p["pos"]] = mix.get(p["pos"], 0) + 1
            mix_html = "".join(
                f'<span class="mix" style="color:{POS_HUE[k]}">{k} {v}</span>'
                for k, v in sorted(mix.items(), key=lambda kv: -kv[1])
            )
            lo = group[0]["ppr"]["rank"] if ppr else group[0]["rank"]
            hi = group[-1]["ppr"]["rank"] if ppr else group[-1]["rank"]
            out.append(
                f'<section class="tier" data-tier="{t}">'
                f'<header class="tb"><span class="tno">Tier {t}</span>'
                f'<span class="trg">{lo} to {hi}</span>'
                f'<span class="tmx">{mix_html}</span></header>'
                f'<table class="grid"><tbody>'
                f'{"".join(row(p, ppr) for p in group)}</tbody></table></section>'
            )
        return "".join(out)

    ppr_tiers: dict[int, list] = {}
    for p in sorted(players, key=lambda x: x["ppr"]["rank"]):
        ppr_tiers.setdefault(p["ppr"]["tier"], []).append(p)
    tier_html = [
        '<div id="board-ppr">' + board_html(ppr_tiers, True) + "</div>",
        '<div id="board-half" class="hide">' + board_html(tiers, False) + "</div>",
    ]

    def mover_rows(rows, up: bool) -> str:
        out = []
        for p in rows:
            hue = POS_HUE[p["pos"]]
            sign = f'+{p["delta"]}' if p["delta"] > 0 else str(p["delta"])
            out.append(
                f'<li><span class="num mrk">{p["rank"]}</span>'
                f'<span class="pn">{esc(p["name"])}</span>'
                f'<span class="pill sm" style="color:{hue};border-color:{hue}66;background:{hue}14">'
                f'{p["pos"]}</span>'
                f'<span class="num was">was {p["prior"]}</span>'
                f'<span class="d {"up" if up else "down"}">{sign}</span></li>'
            )
        return "".join(out)

    board_size = len(players)

    def read_block(r) -> str:
        def names(rows, cls=None):
            return ", ".join(
                f'{esc(p["name"])} <span class="at">{p["rank"]}</span>'
                + (f' <span class="d {cls}">{"+" if p["delta"] > 0 else ""}{p["delta"]}</span>'
                   if cls else "")
                for p in rows)
        lines = [f'<p class="ll"><span class="k">Best you hold</span> '
                 f'{names(r["held"][:5]) or "none on this board"}</p>']
        if r["down"]:
            lines.append(f'<p class="ll"><span class="k">Gibbs soured on</span> '
                         f'{names(r["down"], "down")}</p>')
        if r["up"]:
            lines.append(f'<p class="ll"><span class="k">Gibbs warmed to</span> '
                         f'{names(r["up"], "up")}</p>')
        swing = sorted(r["held"], key=lambda p: -abs(p["ppr"]["move"]))[:4]
        if swing:
            body = ", ".join(
                f'{esc(p["name"])} <span class="d {"up" if p["ppr"]["move"] > 0 else "down"}">'
                f'{"+" if p["ppr"]["move"] > 0 else ""}{p["ppr"]["move"]}</span>'
                for p in swing if p["ppr"]["move"])
            if body:
                lines.append(f'<p class="ll"><span class="k">Full PPR swings</span> {body}</p>')
        if r["free"]:
            more = f', and {len(r["free"]) - 6} more' if len(r["free"]) > 6 else ""
            lines.append(f'<p class="ll"><span class="k">Unrostered</span> '
                         f'{names(r["free"][:6])}{more}</p>')
        return ('<div class="lg-read"><div class="lg-h"><span class="lg-n">'
                f'{esc(r["name"])}</span><span class="at">{r["teams"]} teams, '
                f'{esc(r["format"])}, {len(r["held"])} of the {board_size}</span></div>'
                + "".join(lines) + "</div>")

    reads_html = "".join(read_block(r) for r in reads)
    if fell_out:
        shown = ", ".join(f"{esc(n)} ({r})" for r, n in fell_out[:8])
        more = f", and {len(fell_out) - 8} more" if len(fell_out) > 8 else ""
        fell_html = (f'<p class="out"><span class="k">Fell out of the top {len(players)}</span> '
                     f"{shown}{more}. The number is where he had them on {prior_when}.</p>")
    else:
        fell_html = ""

    runway_rows = "".join(
        f'<tr><td class="num">{t}</td><td class="num">{lo} to {hi}</td>'
        + "".join(f'<td class="num" style="color:{POS_HUE[k]}">{c[k]}</td>' for k in ("QB", "RB", "WR", "TE"))
        + "</tr>"
        for t, lo, hi, c in runway
    )
    strategy_html = "".join(
        f'<div class="note"><span class="pill sm" style="color:{POS_HUE[pos]};'
        f'border-color:{POS_HUE[pos]}66;background:{POS_HUE[pos]}14">{pos}</span>'
        f"<p>{esc(text)}</p></div>"
        for pos, text in STRATEGY
    )
    takes_html = "".join(
        f'<li><span class="tk">{esc(label)}</span><span class="tv">{esc(value)}</span></li>'
        for label, value in HOT_TAKES
    )
    counts = {k: sum(1 for p in players if p["pos"] == k) for k in ("QB", "RB", "WR", "TE")}
    mine_count = sum(1 for p in players if p["mine"])

    page = TEMPLATE.format(
        updated=board["updatedAt"],
        board_size=board_size,
        tier_count=len(tiers),
        prior_when=prior_when,
        source=esc(board["source"]),
        strategy_url=STRATEGY_URL,
        strategy_when=STRATEGY_WHEN,
        title=esc(board["title"]),
        qb=counts["QB"], rb=counts["RB"], wr=counts["WR"], te=counts["TE"],
        mine=mine_count,
        leagues=esc(", ".join(league_names)),
        reads=reads_html,
        fell=fell_html,
        tiers="".join(tier_html),
        risers=mover_rows(risers, True),
        fallers=mover_rows(fallers, False),
        runway=runway_rows,
        strategy=strategy_html,
        takes=takes_html,
    )
    OUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUT} ({len(players)} players, {len(tiers)} tiers, {mine_count} already rostered)")
    print(f"Movers diffed against {prior_path.name} ({prior_when}, {len(prior)} players)")


TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Gibbs Tier Board, full PPR, {updated}</title>
<style>
  :root {{
    --obsidian:#0b0d12; --graphite:#11141b; --slate:#161a23; --pewter:#1e2330;
    --edge:#262d3d; --edge-hot:#3a4258;
    --porcelain:#f3f4f6; --bone:#d4d8e0; --fog:#9ca3af; --ash:#6b7280;
    --violet:#a78bfa; --mint:#34d399; --red:#f87171;
  }}
  * {{ box-sizing:border-box; }}
  html {{ -webkit-text-size-adjust:100%; }}
  body {{
    margin:0; background:var(--obsidian); color:var(--bone);
    font-family:ui-sans-serif,-apple-system,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;
    font-size:0.94rem; line-height:1.5; font-feature-settings:'ss01','cv11';
    padding:0 16px 64px; max-width:860px; margin:0 auto;
  }}
  .num, .grid td.num, table {{ font-variant-numeric:tabular-nums; }}
  h1 {{ font-size:1.6rem; font-weight:700; letter-spacing:-0.015em; line-height:1.2;
       margin:24px 0 4px; color:var(--porcelain); }}
  h2 {{ font-size:0.95rem; font-weight:600; letter-spacing:0.05em; text-transform:uppercase;
       color:var(--porcelain); margin:32px 0 10px; }}
  .eyebrow {{ font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
              text-transform:uppercase; color:var(--ash); }}
  .sub {{ color:var(--fog); margin:6px 0 0; max-width:72ch; }}
  .sub a {{ color:var(--violet); text-decoration:none; border-bottom:1px solid #a78bfa40; }}
  .stats {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; }}
  .stat {{ background:var(--graphite); border:1px solid var(--edge); border-radius:10px;
           padding:8px 12px; flex:1 1 auto; min-width:74px; }}
  .stat b {{ display:block; font-size:1.05rem; font-weight:700; letter-spacing:-0.02em;
             color:var(--porcelain); }}
  .stat span {{ font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
                text-transform:uppercase; color:var(--ash); }}

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

  .legend {{ margin:8px 0 0; color:var(--ash); font-size:0.78rem; max-width:72ch; }}
  .how {{ margin:10px 0 0; max-width:72ch; }}
  .how summary {{ cursor:pointer; color:var(--fog); font-size:0.8rem; font-weight:600;
                  letter-spacing:0.02em; padding:4px 0; }}
  .how summary:hover {{ color:var(--porcelain); }}
  .how summary:focus-visible {{ outline:2px solid var(--violet); outline-offset:3px;
                                border-radius:4px; }}
  .how p {{ margin:4px 0 0; color:var(--fog); font-size:0.85rem; }}
  .tier {{ margin-top:18px; }}
  .tb {{ display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
         padding:6px 0; border-bottom:1px solid var(--edge-hot); }}
  .tno {{ font-size:0.75rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
          color:var(--porcelain); }}
  .trg {{ font-size:0.75rem; font-weight:600; color:var(--ash);
          font-variant-numeric:tabular-nums; }}
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
  .pn {{ color:var(--porcelain); }}
  
  .lg {{ display:inline-block; margin-left:8px; padding:1px 7px; border-radius:999px;
         font-size:0.68rem; font-weight:600; color:var(--violet);
         border:1px solid #a78bfa66; background:#a78bfa14; }}
  td.ps {{ width:64px; text-align:right; }}
  .pill {{ display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid;
           font-size:0.72rem; font-weight:600; }}
  .pill.sm {{ padding:1px 7px; font-size:0.68rem; }}
  td.dl {{ width:58px; text-align:right; }}
  .d {{ font-size:0.75rem; font-weight:700; }}
  .d.up {{ color:var(--mint); }}
  .d.down {{ color:var(--red); }}
  .d.flat {{ color:var(--ash); }}

  .lg-read {{ background:var(--graphite); border:1px solid var(--edge); border-radius:10px;
              padding:14px 16px; margin-bottom:10px; }}
  .lg-h {{ display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
           padding-bottom:8px; margin-bottom:6px; border-bottom:1px solid var(--edge); }}
  .lg-n {{ color:var(--porcelain); font-weight:600; }}
  .at {{ color:var(--ash); font-size:0.75rem; font-variant-numeric:tabular-nums; }}
  .ll {{ margin:5px 0; font-size:0.85rem; }}
  .k {{ display:inline-block; min-width:120px; color:var(--fog); font-size:0.72rem;
        font-weight:600; letter-spacing:0.05em; text-transform:uppercase; }}
  .out {{ margin:12px 0 0; padding-top:10px; border-top:1px solid var(--edge);
          font-size:0.82rem; color:var(--fog); }}
  .sep {{ width:1px; align-self:stretch; background:var(--edge); margin:0 2px; }}
  .bar button.fmt[aria-pressed="true"] {{ color:var(--porcelain); border-color:var(--mint);
                                          background:#34d3991f; }}
  td.rec {{ width:44px; color:var(--ash); font-size:0.75rem; text-align:right; }}
  .cols {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
  .card {{ background:var(--graphite); border:1px solid var(--edge); border-radius:10px;
           padding:16px; }}
  .card h3 {{ margin:0 0 10px; font-size:0.75rem; font-weight:600; letter-spacing:0.06em;
              text-transform:uppercase; color:var(--fog); }}
  .card ul {{ list-style:none; margin:0; padding:0; }}
  .card li {{ display:flex; align-items:center; gap:8px; padding:5px 0;
              border-bottom:1px solid var(--edge); font-size:0.85rem; }}
  .card li:last-child {{ border-bottom:0; }}
  .mrk {{ width:30px; text-align:right; color:var(--porcelain); font-weight:700; }}
  .was {{ margin-left:auto; color:var(--ash); font-size:0.75rem; }}
  .runway {{ width:100%; border-collapse:collapse; font-size:0.85rem; }}
  .runway th:first-child, .runway td:first-child,
  .runway th:nth-child(2), .runway td:nth-child(2) {{ text-align:left; }}
  .runway th {{ font-size:0.7rem; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
                color:var(--ash); text-align:right; padding:4px 6px;
                border-bottom:1px solid var(--edge); }}
  .runway td {{ text-align:right; padding:4px 6px; border-bottom:1px solid var(--edge); }}
  .note {{ display:flex; align-items:flex-start; gap:10px; padding:10px 0;
           border-bottom:1px solid var(--edge); }}
  .note .pill {{ flex:0 0 auto; margin-top:2px; }}
  .note:last-child {{ border-bottom:0; }}
  .note p {{ margin:0; max-width:72ch; }}
  .tk {{ color:var(--fog); font-size:0.75rem; font-weight:600; letter-spacing:0.04em;
         text-transform:uppercase; min-width:150px; }}
  .tv {{ color:var(--bone); }}
  footer {{ margin-top:40px; padding-top:14px; border-top:1px solid var(--edge);
            color:var(--ash); font-size:0.78rem; }}
  h2, section.tier {{ scroll-margin-top:64px; }}
  .hide {{ display:none !important; }}
  @media (max-width:720px) {{
    body {{ padding:0 12px 56px; }}
    .cols {{ grid-template-columns:1fr; }}
    .tmx {{ width:100%; margin-left:0; }}
    td.byc {{ display:none; }}
    td.rec {{ width:28px; font-size:0.7rem; }}
    td.tmc {{ width:38px; font-size:0.75rem; }}
    td.ps {{ width:52px; }}
    td.dl {{ width:44px; }}
    .grid td {{ padding:7px 3px; }}
    .pill {{ padding:2px 6px; font-size:0.68rem; }}
    .card li {{ flex-wrap:wrap; }}
    .k {{ display:block; min-width:0; }}
  }}
</style></head><body>

<div class="eyebrow">Redraft context, full PPR by default, 1QB</div>
<h1>Jacob Gibbs, 2026 Top {board_size}</h1>
<p class="sub">Updated {updated} by {source}, transcribed from his own board.
<a href="{strategy_url}">His strategy write-up</a>.
He ranks for <b>half PPR</b> and all three of your leagues are full PPR, so this opens on a
full-PPR adaptation. <b>That is a derived board, not his.</b> Violet rows are players you
already roster in {leagues}.</p>
<details class="how"><summary>How the full-PPR board is derived</summary>
<p>Each flex player keeps the value his slot on Gibbs' board is worth, then gains 0.5 per
projected catch. The {tier_count} tier sizes and every QB slot are untouched, so he still
decides the order and only the reception bonus moves anyone. The move column shows the swing
against his published half-PPR order; switch to his board and it shows the swing since his
{prior_when} one instead.</p></details>

<div class="stats">
  <div class="stat"><b>{board_size}</b><span>ranked</span></div>
  <div class="stat"><b>{tier_count}</b><span>tiers</span></div>
  <div class="stat"><b>{rb}</b><span>RB</span></div>
  <div class="stat"><b>{wr}</b><span>WR</span></div>
  <div class="stat"><b>{te}</b><span>TE</span></div>
  <div class="stat"><b>{qb}</b><span>QB</span></div>
  <div class="stat"><b>{mine}</b><span>you roster</span></div>
</div>

<h2>Your three rosters on this board</h2>
{reads}

<div class="bar" role="toolbar" aria-label="Filter the board">
  <button class="fmt" data-fmt="ppr" aria-pressed="true">Full PPR</button>
  <button class="fmt" data-fmt="half" aria-pressed="false">His half PPR</button>
  <span class="sep"></span>
  <button data-pos="ALL" aria-pressed="true">All</button>
  <button data-pos="RB" aria-pressed="false">RB</button>
  <button data-pos="WR" aria-pressed="false">WR</button>
  <button data-pos="TE" aria-pressed="false">TE</button>
  <button data-pos="QB" aria-pressed="false">QB</button>
  <button id="mineOnly" aria-pressed="false">Mine only</button>
  <input id="q" type="search" placeholder="Filter by name" aria-label="Filter by name">
</div>
<p class="legend">On the full-PPR board the number beside the team is projected catches, and the
last column is the swing against his published half-PPR order.</p>

{tiers}

<h2>Movement since {prior_when}</h2>
<div class="cols">
  <div class="card"><h3>Climbing</h3><ul>{risers}</ul></div>
  <div class="card"><h3>Sliding</h3><ul>{fallers}</ul></div>
</div>
{fell}

<h2>When each position dries up</h2>
<div class="card">
  <table class="runway">
    <thead><tr><th>Tier</th><th>Ranks</th><th>QB</th><th>RB</th><th>WR</th><th>TE</th></tr></thead>
    <tbody>{runway}</tbody>
  </table>
</div>

<h2>How Gibbs says to draft it</h2>
<p class="legend">His words, from the {strategy_when} write-up, not from this board.</p>
<div class="card">{strategy}</div>

<h2>His round-by-round calls</h2>
<div class="card"><ul>{takes}</ul></div>

<footer>Season production context only. KTC stays the dynasty value source of truth for
trades in the three leagues.</footer>

<script>
(function () {{
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr.r'));
  var pos = 'ALL', mineOnly = false, term = '';
  var mineBtn = document.getElementById('mineOnly');
  var boards = {{ ppr: document.getElementById('board-ppr'),
                 half: document.getElementById('board-half') }};

  function apply() {{
    rows.forEach(function (r) {{
      var ok = (pos === 'ALL' || r.dataset.pos === pos)
        && (!mineOnly || r.dataset.mine === '1')
        && (!term || r.dataset.name.indexOf(term) !== -1);
      r.classList.toggle('hide', !ok);
    }});
    document.querySelectorAll('section.tier').forEach(function (s) {{
      var any = s.querySelector('tr.r:not(.hide)');
      s.classList.toggle('hide', !any);
    }});
  }}

  document.querySelectorAll('.bar button.fmt').forEach(function (b) {{
    b.addEventListener('click', function () {{
      Object.keys(boards).forEach(function (k) {{
        boards[k].classList.toggle('hide', k !== b.dataset.fmt);
      }});
      document.querySelectorAll('.bar button.fmt').forEach(function (o) {{
        o.setAttribute('aria-pressed', String(o === b));
      }});
      apply();
    }});
  }});
  document.querySelectorAll('.bar button[data-pos]').forEach(function (b) {{
    b.addEventListener('click', function () {{
      pos = b.dataset.pos;
      document.querySelectorAll('.bar button[data-pos]').forEach(function (o) {{
        o.setAttribute('aria-pressed', String(o === b));
      }});
      apply();
    }});
  }});
  mineBtn.addEventListener('click', function () {{
    mineOnly = !mineOnly;
    mineBtn.setAttribute('aria-pressed', String(mineOnly));
    apply();
  }});
  document.getElementById('q').addEventListener('input', function (e) {{
    term = e.target.value.trim().toLowerCase();
    apply();
  }});
}})();
</script>
</body></html>
"""


def selftest() -> None:
    """Prove the movers baseline is chosen by date, not by whichever file sorts last.

    Picking the wrong archive is silent: the page still renders and every delta is
    just measured against the wrong board.
    """
    archives = []
    for path in sorted(HISTORICAL.glob("jacob-gibbs-*.js")):
        try:
            archives.append((read_global(path, "window.JACOB_GIBBS_RANKINGS")["updatedAt"], path.name))
        except Exception:
            continue
    assert len(archives) >= 2, f"need 2+ dated archives to test ordering, found {archives}"
    current = read_global(CURRENT, "window.JACOB_GIBBS_RANKINGS")["updatedAt"]
    older = [row for row in archives if row[0] < current]
    assert older, f"no archive older than the live board ({current})"
    want = max(older)[1]
    got = newest_prior_board()[0].name
    assert got == want, f"resolver picked {got}, newest older archive is {want}"
    # Filename order must not be what decides it: the July board sorts first and the
    # August one last, so a lexical pick would still look right today. Check the rule
    # holds against an earlier cutoff, where the two answers differ.
    cutoff = min(row[0] for row in archives if row[0] >= "2026-08-01") if any(
        row[0] >= "2026-08-01" for row in archives) else None
    if cutoff:
        want_earlier = max(row for row in archives if row[0] < cutoff)[1]
        assert want_earlier != want, "test is vacuous: both cutoffs pick the same archive"
    print(f"selftest ok: {len(archives)} archives, live {current}, movers baseline {got}")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
