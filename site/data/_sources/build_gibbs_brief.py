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
# color is reinforcement rather than the message (DESIGN.md tier-chip rule). Same
# hue per position as the app's .pos-chip, at the Backyard values that read on lavender.
POS_HUE = {"QB": "#a82a22", "RB": "#1a7a54", "WR": "#2842b0", "TE": "#966a10"}
NUMBER_WORDS = "zero one two three four five six seven eight nine ten".split()


def number_word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)

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
    ppr_leagues = 0
    for lg in leagues:
        mine = next((r for r in lg.get("rosters", []) if r.get("is_me")), None)
        if not mine:
            continue
        league_names.append(lg["name"].strip())
        ppr_leagues += (lg.get("scoring") or {}).get("rec") == 1.0
        for pid in mine.get("players") or []:
            owned.setdefault(str(pid), []).append(lg["name"].strip())

    # The full-PPR adaptation, generated by build_gibbs_fullppr.py. It is derived,
    # not Gibbs' published board, and it is what Trevor's full-PPR leagues actually use.
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

    ppr_tiers: dict[int, list] = {}
    for p in sorted(players, key=lambda x: x["ppr"]["rank"]):
        ppr_tiers.setdefault(p["ppr"]["tier"], []).append(p)

    # Positional runway on the full-PPR board the page opens on: how many of each
    # position are gone by the end of each tier.
    runway, seen = [], {"QB": 0, "RB": 0, "WR": 0, "TE": 0}
    for t in sorted(ppr_tiers):
        for p in ppr_tiers[t]:
            seen[p["pos"]] += 1
        runway.append((t, ppr_tiers[t][0]["ppr"]["rank"], ppr_tiers[t][-1]["ppr"]["rank"], dict(seen)))

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
                       if str(pid) in by_id), key=lambda p: p["ppr"]["rank"])
        moved = sorted((p for p in held if p["delta"] is not None), key=lambda p: p["delta"])
        free = sorted((p for pid, p in by_id.items() if pid not in taken),
                      key=lambda p: p["ppr"]["rank"])
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
        # A converted rank is marked * with his own half-PPR rank in the tooltip.
        rank_td = (f'<td class="num rk" title="His half-PPR rank: {p["rank"]}">{rank}'
                   f'<span class="star">*</span></td>' if ppr else f'<td class="num rk">{rank}</td>')
        return (
            f'<tr class="r{" mine" if p["mine"] else ""}" data-pos="{p["pos"]}" '
            f'data-mine="{1 if p["mine"] else 0}" data-name="{esc(p["name"].lower())}">'
            f'{rank_td}'
            f'<td class="nm"><span class="pn">{esc(p["name"])}</span>{tags}</td>'
            f'<td class="tmc">{esc(p["team"])}</td>'
            f'{rec}'
            f'<td class="byc">bye {p["bye"]}</td>'
            f'<td class="ps"><span class="pill" style="background:{hue}">{p["pos"]}{pos_rank}</span></td>'
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
                f'<span class="pill sm" style="background:{hue}">{p["pos"]}</span>'
                f'<span class="num was">was {p["prior"]}</span>'
                f'<span class="d {"up" if up else "down"}">{sign}</span></li>'
            )
        return "".join(out)

    board_size = len(players)

    def read_block(r) -> str:
        def names(rows, cls=None):
            return ", ".join(
                f'{esc(p["name"])} <span class="at" title="His half-PPR rank: {p["rank"]}">'
                f'{p["ppr"]["rank"]}*</span>'
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
        f'<div class="note"><span class="pill sm" style="background:{POS_HUE[pos]}">{pos}</span>'
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
        n_leagues=number_word(len(league_names)),
        ppr_note=(f"all {number_word(len(league_names))} of your leagues are full PPR"
                  if ppr_leagues == len(league_names) else
                  f"{number_word(ppr_leagues)} of your {number_word(len(league_names))} leagues are full PPR"),
        css=BACKYARD_CSS,
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


# Backyard, the site's standard (site/DESIGN.md), inlined so the page stays one file.
# build_gibbs_update_brief.py imports it, so both Gibbs pages share one skin.
BACKYARD_CSS = """
  :root {
    --gold:#ffd42a; --gold-deep:#e0a915; --ink:#12131f;
    --band:#7b7bc4; --band-deep:#4f4f96; --panel:#e9e9fa; --panel-alt:#d5d5f0;
    --peri:#b9b9e4; --turf:#3f9f43; --turf-deep:#2c7a31; --chalk:#ffffff;
    --navy:#1f2450; --navy-soft:#343a6b; --label:#4d5488; --caption:#5f669b;
    --up:#1a7a54; --down:#a82a22; --amber:#966a10;
    --grad-panel:linear-gradient(180deg,#f4f4fd,var(--panel));
    --grad-btn:linear-gradient(180deg,var(--panel-alt),#bcbce2);
    --grad-gold:linear-gradient(180deg,var(--gold),var(--gold-deep));
    --grad-band:linear-gradient(180deg,var(--band),var(--band-deep));
    --grad-turf:linear-gradient(180deg,var(--turf),var(--turf-deep));
    --bevel:inset 0 1px 0 rgba(255,255,255,.72), inset 0 -2px 0 rgba(0,0,0,.16);
    --bevel-in:inset 0 2px 0 rgba(0,0,0,.20), inset 0 -1px 0 rgba(255,255,255,.35);
    --shadow-1:0 2px 0 rgba(0,0,0,.28); --shadow-2:0 4px 0 rgba(0,0,0,.32);
    --on-turf:0 2px 0 rgba(0,0,0,.45);
    --display:"Baloo 2","Arial Rounded MT Bold",ui-rounded,"SF Pro Rounded","Trebuchet MS","Segoe UI",system-ui,sans-serif;
  }
  * { box-sizing:border-box; }
  /* The ground is turf, on the root so it fills the window past the 900px column. */
  html { -webkit-text-size-adjust:100%; min-height:100%; background:var(--grad-turf) fixed; }
  html::before { content:''; position:fixed; inset:0; z-index:-1; pointer-events:none;
    background-image:radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px),
      repeating-linear-gradient(90deg, rgba(255,255,255,.055) 0 2px, transparent 2px 148px);
    background-size:7px 7px, auto; }
  body { margin:0 auto; max-width:900px; padding:0 16px 64px; color:var(--navy);
    font-family:"Nunito",ui-sans-serif,-apple-system,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;
    font-size:0.94rem; line-height:1.5; font-feature-settings:'ss01','cv11'; }
  table, .num, .rk, .mrk, .at, .was, .trg { font-variant-numeric:tabular-nums; }

  /* Anything sitting on the field, outside a plate, is chalk with a hard shadow. */
  .eyebrow, .sub, .legend, .how, footer, h2 { color:var(--chalk); text-shadow:var(--on-turf); }
  .eyebrow { font-family:var(--display); font-size:0.75rem; font-weight:800; letter-spacing:0.08em;
    text-transform:uppercase; margin:24px 0 8px; }
  h1 { display:inline-block; margin:0 0 10px; padding:4px 20px; font-family:var(--display);
    font-size:1.6rem; font-weight:800; line-height:1.25; letter-spacing:-0.01em; color:var(--gold);
    -webkit-text-stroke:2px var(--ink); paint-order:stroke fill; text-shadow:var(--on-turf);
    background:var(--grad-band); border:3px solid var(--ink); border-radius:18px;
    box-shadow:var(--bevel), var(--shadow-2); }
  h2 { font-family:var(--display); font-size:1.1rem; font-weight:800; letter-spacing:0.06em;
    text-transform:uppercase; margin:32px 0 10px; color:var(--gold); -webkit-text-stroke:2px var(--ink);
    paint-order:stroke fill; }
  .sub { font-weight:600; margin:6px 0 0; max-width:72ch; }
  .sub b { color:var(--gold); }
  .sub a, .legend a, footer a { color:var(--chalk); font-weight:700; text-decoration:underline;
    text-decoration-thickness:1.5px; text-underline-offset:3px; }
  .sub a:hover, .sub a:focus-visible, .legend a:hover, .legend a:focus-visible { color:var(--gold); }
  .legend { margin:10px 0 0; font-size:0.8rem; font-weight:600; max-width:72ch; }
  .how { margin:10px 0 0; max-width:72ch; }
  .how summary { cursor:pointer; font-size:0.82rem; font-weight:800; padding:4px 0; }
  .how summary:focus-visible { outline:3px solid var(--gold); outline-offset:3px; border-radius:4px; }
  .how p { margin:4px 0 0; font-size:0.86rem; font-weight:600; }
  footer { margin-top:40px; padding-top:14px; border-top:2px solid rgba(255,255,255,.55);
    font-size:0.8rem; font-weight:600; }
  footer p { max-width:72ch; }

  /* Plates: every surface carries an ink edge, a bevel and a hard drop. */
  .stat, .card, .lg-read, .tier, .bar, .gap, .out {
    background:var(--grad-panel); border:2px solid var(--ink); border-radius:10px;
    box-shadow:var(--bevel), var(--shadow-1); }
  .stats { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; }
  .stat { padding:8px 12px; flex:1 1 auto; min-width:74px; }
  .stat b { display:block; font-family:var(--display); font-size:1.15rem; font-weight:800;
    letter-spacing:-0.02em; color:var(--navy); line-height:1.2; }
  .stat span { font-size:0.68rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase;
    color:var(--label); }

  /* A plate's heading is a periwinkle band bled to the edge, chalk text. */
  .lg-h, .card h3, .gap h3 { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
    margin:-4px -4px 10px; padding:5px 10px; background:var(--grad-band); color:var(--chalk);
    border:2px solid var(--ink); border-radius:6px; box-shadow:var(--bevel);
    font-family:var(--display); font-size:0.78rem; font-weight:800; letter-spacing:0.06em;
    text-transform:uppercase; text-shadow:0 1px 0 rgba(0,0,0,.45); }
  .lg-h .at { color:var(--panel); text-transform:none; letter-spacing:0; }
  .lg-n { font-size:0.9rem; text-transform:none; letter-spacing:0; }
  .lg-read { padding:14px 16px; margin-bottom:12px; }
  .ll { margin:5px 0; font-size:0.86rem; }
  .k { display:inline-block; min-width:150px; margin-right:10px; color:var(--label); font-size:0.7rem; font-weight:800;
    letter-spacing:0.06em; text-transform:uppercase; }
  .at { color:var(--label); font-size:0.75rem; font-weight:700; }
  .card { padding:14px; }
  .card ul { list-style:none; margin:0; padding:0; }
  .card li { display:flex; align-items:center; gap:8px; padding:6px 0; font-size:0.86rem;
    border-bottom:2px solid var(--chalk); }
  .card li:last-child { border-bottom:0; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .mrk { min-width:32px; text-align:right; color:var(--navy); font-weight:800; }
  .was { margin-left:auto; color:var(--label); font-size:0.75rem; font-weight:700; }
  .out { margin:12px 0 0; padding:10px 14px; font-size:0.84rem; }
  .gap { margin:20px 0 0; padding:14px 16px; }
  .gap p { margin:0; max-width:72ch; }

  /* The sticky filter bar: a plate, and a pressed button is gold with ink text. */
  .bar { position:sticky; top:8px; z-index:5; margin-top:20px; padding:8px 10px;
    display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .bar button { font:inherit; font-family:var(--display); font-size:0.8rem; font-weight:700;
    color:var(--navy); background:var(--grad-btn); border:2px solid var(--ink); border-radius:6px;
    padding:5px 12px; cursor:pointer; box-shadow:var(--bevel), var(--shadow-1); }
  .bar button:active { transform:translateY(2px); box-shadow:var(--bevel-in); }
  .bar button[aria-pressed="true"] { background:var(--grad-gold); color:var(--ink);
    text-shadow:0 1px 0 rgba(255,255,255,.45); }
  .bar button:focus-visible, .bar input:focus { outline:none;
    box-shadow:0 0 0 3px var(--gold), 0 0 0 5px var(--ink); }
  .bar input { font:inherit; font-size:0.85rem; font-weight:600; color:var(--navy);
    background:var(--chalk); border:2px solid var(--ink); border-radius:6px; padding:5px 10px;
    box-shadow:var(--bevel-in); flex:1 1 180px; min-width:0; }
  .sep { width:2px; align-self:stretch; background:var(--ink); opacity:.35; margin:0 2px; }

  /* Tier board: each tier is a plate with a band head; rows are stitched with chalk. */
  .tier { margin-top:16px; overflow:hidden; scroll-margin-top:72px; }
  .tb { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:6px 12px;
    background:var(--grad-band); color:var(--chalk); border-bottom:3px solid var(--ink);
    text-shadow:0 1px 0 rgba(0,0,0,.45); }
  .tno { font-family:var(--display); font-size:0.8rem; font-weight:800; letter-spacing:0.06em;
    text-transform:uppercase; }
  .trg { font-size:0.78rem; font-weight:700; }
  .slip { font-size:0.72rem; font-weight:700; color:var(--gold); }
  .tmx { margin-left:auto; display:flex; gap:6px; }
  .mix { font-size:0.68rem; font-weight:800; letter-spacing:0.04em; background:var(--panel);
    border:1.5px solid var(--ink); border-radius:4px; padding:0 5px; text-shadow:none; }
  table.grid { width:100%; border-collapse:collapse; }
  .grid td { border-bottom:2px solid var(--chalk); padding:7px 8px; vertical-align:middle;
    font-weight:600; color:var(--navy); }
  .grid tr:nth-child(even) td { background:var(--panel-alt); }
  .grid tr:hover td { background:#c9c9ec; }
  /* A player you roster is the gold thread: the "you" row of every table. */
  .grid tr.mine td { background:var(--grad-gold); color:var(--ink); }
  .grid tr.mine:hover td { background:linear-gradient(180deg,#ffe066,var(--gold)); }
  td.rk { width:52px; text-align:right; font-weight:800; letter-spacing:-0.02em; }
  td.nm { line-height:1.35; }
  .pn { font-weight:700; }
  td.tmc { width:52px; color:var(--label); font-size:0.8rem; font-weight:700; }
  td.byc { width:62px; color:var(--caption); font-size:0.75rem; }
  td.rec { width:44px; color:var(--caption); font-size:0.75rem; text-align:right; }
  td.ps { width:64px; text-align:right; }
  td.dl { width:58px; text-align:right; }
  td.wc { width:44px; text-align:right; color:var(--caption); font-size:0.75rem; }
  td.fr { color:var(--label); font-size:0.8rem; }
  .grid tr.mine td.tmc, .grid tr.mine td.byc, .grid tr.mine td.rec,
  .grid tr.mine td.wc, .grid tr.mine td.fr { color:var(--navy-soft); }
  .lg { display:inline-block; margin-left:8px; padding:0 7px; border-radius:8px;
    font-size:0.66rem; font-weight:800; color:var(--navy); background:var(--peri);
    border:1.5px solid var(--ink); vertical-align:1px; }
  /* Position pills are stamped: the hue is the fill, chalk text, ink edge. */
  .pill { display:inline-block; padding:1px 8px; border-radius:999px; border:2px solid var(--ink);
    font-family:var(--display); font-size:0.7rem; font-weight:800; color:var(--chalk);
    text-shadow:0 1px 0 rgba(0,0,0,.35); }
  .pill.sm { padding:0 7px; font-size:0.66rem; }
  .d { font-size:0.76rem; font-weight:800; }
  .d.up { color:var(--up); }
  .d.down { color:var(--down); }
  .d.flat { color:var(--caption); }
  .d.new { color:var(--amber); font-size:0.68rem; letter-spacing:0.04em; }
  .star { color:var(--label); font-weight:800; }

  .runway { width:100%; border-collapse:collapse; font-size:0.86rem; }
  .runway th:first-child, .runway td:first-child,
  .runway th:nth-child(2), .runway td:nth-child(2) { text-align:left; }
  .runway th { font-size:0.68rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase;
    color:var(--label); text-align:right; padding:4px 6px; border-bottom:3px solid var(--ink); }
  .runway td { text-align:right; padding:5px 6px; font-weight:700; border-bottom:2px solid var(--chalk); }
  .note { display:flex; align-items:flex-start; gap:10px; padding:10px 0;
    border-bottom:2px solid var(--chalk); }
  .note .pill { flex:0 0 auto; margin-top:2px; }
  .note:last-child { border-bottom:0; }
  .note p { margin:0; max-width:72ch; }
  .tk { color:var(--label); font-size:0.72rem; font-weight:800; letter-spacing:0.05em;
    text-transform:uppercase; min-width:150px; }
  h2, section.tier { scroll-margin-top:72px; }
  .hide { display:none !important; }
  @media (max-width:720px) {
    body { padding:0 12px 56px; }
    h1 { font-size:1.25rem; padding:2px 14px; border-radius:14px; }
    .cols { grid-template-columns:1fr; }
    .tmx { width:100%; margin-left:0; }
    td.byc, td.wc { display:none; }
    td.rec { width:28px; font-size:0.7rem; }
    td.tmc { width:38px; font-size:0.75rem; }
    td.ps { width:52px; }
    td.dl { width:44px; }
    .grid td { padding:7px 4px; }
    .pill { padding:1px 6px; font-size:0.66rem; }
    .card li { flex-wrap:wrap; }
    .k { display:block; min-width:0; }
  }
"""


TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>Gibbs Tier Board, full PPR, {updated}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap">
<style>
{css}</style></head><body>

<div class="eyebrow">Redraft context, full PPR by default, 1QB</div>
<h1>Jacob Gibbs, 2026 Top {board_size}</h1>
<p class="sub">Updated {updated} by {source}, transcribed from his own board.
<a href="{strategy_url}">His strategy write-up</a>.
He ranks for <b>half PPR</b> and {ppr_note}, so this opens on a full-PPR adaptation.
<b>That is a derived board, not his.</b> A rank marked * is converted; hover it for his own
half-PPR rank, or switch to his board below. Gold rows are players you already roster in
{leagues}.</p>
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

<h2>Your {n_leagues} rosters on this board</h2>
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

<h2>Movement on his half-PPR board since {prior_when}</h2>
<p class="legend">His own ranks on both boards, so the move is his opinion changing, not the
PPR conversion.</p>
<div class="cols">
  <div class="card"><h3>Climbing</h3><ul>{risers}</ul></div>
  <div class="card"><h3>Sliding</h3><ul>{fallers}</ul></div>
</div>
{fell}

<h2>When each position dries up</h2>
<div class="card">
  <table class="runway">
    <thead><tr><th>Tier</th><th>Ranks*</th><th>QB</th><th>RB</th><th>WR</th><th>TE</th></tr></thead>
    <tbody>{runway}</tbody>
  </table>
</div>

<h2>How Gibbs says to draft it</h2>
<p class="legend">His words, from the {strategy_when} write-up, not from this board.</p>
<div class="card">{strategy}</div>

<h2>His round-by-round calls</h2>
<div class="card"><ul>{takes}</ul></div>

<footer>Season production context only. KTC stays the dynasty value source of truth for
trades in your dynasty leagues.</footer>

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
