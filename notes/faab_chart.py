#!/usr/bin/env python
"""Renders notes/faab-bid-archetypes-2026-09-16.html: box-and-whisker bid
distributions per waiver archetype, dynasty and redraft kept separate, plus the
n / median / IQR / max tables.

Called by faab_extract.py. Everything is inline SVG and inline CSS so the file
opens off disk with no build step and no network, matching how the rest of this
repo ships (site/ is static files, no npm).

Series palette validated with the dataviz skill's validate_palette.js:
  light  dynasty #2842b0  redraft #9e5418   (all six checks PASS)
  dark   dynasty #6b84ee  redraft #cc7b2e   (all six checks PASS)
"""
import html
import math
import os
import statistics
from collections import defaultdict

DIMS = [
    ("situation", "Situation of emergence",
     "The dimension the FAAB market actually prices. Rules and their order are in "
     "the note; the first matching rule wins."),
    ("position", "Position", "Sleeper's position, or IDP collapsed to one group."),
    ("experience", "NFL experience at the pickup",
     "Pickup season minus metadata.rookie_year. Team defenses have no rookie year "
     "and are labelled n/a, not unknown."),
    ("production", "Point-production profile",
     "Realized weekly PPR from the pickup week onward against that position-season's "
     "own starter weeks. Hindsight, by construction."),
    ("archetype", "Full four-dimension archetype (n >= 8)",
     "Experience, situation, position and production crossed. Only cells with at "
     "least 8 priced claims are drawn; the long tail is in the CSV."),
]

W = 980
PAD_L, PAD_R, PAD_T, PAD_B = 300, 108, 42, 46
ROW_H = 15
BAND_GAP = 13


def five(vals):
    v = sorted(vals)
    n = len(v)
    if n == 1:
        return {"n": 1, "min": v[0], "q1": v[0], "median": v[0], "q3": v[0],
                "max": v[0], "lo": v[0], "hi": v[0], "out": []}
    q1, _, q3 = statistics.quantiles(v, n=4, method="inclusive")
    iqr = q3 - q1
    lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    inside = [x for x in v if lo_f <= x <= hi_f]
    return {"n": n, "min": v[0], "q1": q1, "median": statistics.median(v),
            "q3": q3, "max": v[-1],
            "lo": min(inside) if inside else v[0],
            "hi": max(inside) if inside else v[-1],
            "out": [x for x in v if x < lo_f or x > hi_f]}


def short(label):
    """Squeeze the 4-tuple archetype key into something that fits the gutter."""
    if " | " not in label:
        return label
    parts = [p.strip() for p in label.split("|")]
    swap = {
        "NFL year 1 (rookie)": "rookie", "NFL years 2-3": "yr 2-3",
        "NFL years 4-7": "yr 4-7", "NFL years 8+": "yr 8+",
        "n/a (team defense)": "team D",
        "starter long-term injury": "starter out long-term",
        "starter short-term injury": "starter out 1-2 wks",
        "starter left the team (cut or traded)": "starter left team",
        "entrenched NFL starter, unrostered": "entrenched starter",
        "healthy handcuff / backup stash": "healthy handcuff",
        "usage takeover, no big box score": "usage takeover",
        "speculative stash, minimal NFL role": "speculative stash",
        "one-week stream / roster filler": "one-week stream",
        "rookie ramping into a role": "rookie ramp",
        "unclassified, no signal in the data": "unclassified",
        "low output, neither profile": "low output",
        "unknown (under 3 games after pickup)": "profile unknown",
        "injured or unavailable stash": "injured stash",
        "returning starter from own absence": "returning starter",
        "rotational piece, no role change": "rotational piece",
    }
    return " · ".join(swap.get(p, p) for p in parts)


def nice_ticks(hi):
    for step in (5, 10, 20, 25, 50, 100):
        if hi / step <= 9:
            break
    # ceil, not floor: a last tick below hi puts the max-bid dot outside the plot
    return [i * step for i in range(max(1, math.ceil(hi / step)) + 1)]


def gutter(labels):
    """Left gutter sized to the longest label, so a chart of two-letter positions
    does not spend 300px on white space and squeeze its own plot."""
    widest = max((len(s) for s in labels), default=0)
    return min(PAD_L, max(56, int(widest * 5.9) + 26))


def box_svg(groups, unit, title_id):
    """groups: [(label, {fmt: [values]})] in display order."""
    labels = [short(g[0]) for g in groups]
    allv = [v for _, d in groups for vals in d.values() for v in vals]
    if not allv:
        return "<p class='empty'>no priced claims in this grouping</p>"
    # The axis ends at the furthest WHISKER, not the furthest outlier. One $200
    # claim was setting the scale for every chart and compressing every box into
    # the left fifth of the canvas, which is the comparison the reader came for.
    # Claims past the edge are drawn as a chevron ON the edge and their row's max
    # is labelled in text, so nothing is hidden, only moved off the scale.
    whisker_hi = max((five(vals)["hi"] for _, d in groups for vals in d.values()
                      if vals), default=0)
    ticks = nice_ticks(max(whisker_hi, 10))
    xmax = ticks[-1]
    clipped = max(allv) > xmax
    pad_l = gutter(labels)
    plot_w = W - pad_l - PAD_R
    band_h = 2 * ROW_H + BAND_GAP
    H = PAD_T + band_h * len(labels) + PAD_B

    def x(v):
        return pad_l + plot_w * (v / xmax if xmax else 0)

    o = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="{title_id}" class="chart">',
         f'<desc>Paired box plots. The upper row of each band is dynasty, the lower '
         f'row is redraft. Every value is also in the table below this chart.</desc>']
    # x grid + axis, solid hairlines one shade off the surface
    for t in ticks:
        o.append(f'<line class="grid" x1="{x(t):.1f}" y1="{PAD_T - 4}" '
                 f'x2="{x(t):.1f}" y2="{H - PAD_B + 4}"/>')
        o.append(f'<text class="tick" x="{x(t):.1f}" y="{PAD_T - 10}" '
                 f'text-anchor="middle">{t}</text>')
        o.append(f'<text class="tick" x="{x(t):.1f}" y="{H - PAD_B + 20}" '
                 f'text-anchor="middle">{t}</text>')
    cap = unit
    if clipped:
        cap += f"   \u25b8 marks claims above {xmax:g}; that row's max is labelled at the right"
    o.append(f'<text class="axis-title" x="{pad_l + plot_w / 2:.0f}" y="{H - PAD_B + 40}" '
             f'text-anchor="middle">{html.escape(cap)}</text>')

    for i, (label, byfmt) in enumerate(groups):
        top = PAD_T + i * band_h
        if i % 2 == 1:
            o.append(f'<rect class="stripe" x="{pad_l}" y="{top - BAND_GAP / 2:.1f}" '
                     f'width="{plot_w}" height="{band_h}"/>')
        o.append(f'<text class="cat" x="{pad_l - 14}" y="{top + ROW_H + 1}" '
                 f'text-anchor="end">{html.escape(labels[i])}</text>')
        for j, fmt in enumerate(("dynasty", "redraft")):
            vals = byfmt.get(fmt) or []
            cy = top + ROW_H * j + ROW_H / 2
            if not vals:
                continue
            s = five(vals)
            tip = (f"{label}, {fmt}: n={s['n']}, median {s['median']:g}, "
                   f"IQR {s['q1']:g} to {s['q3']:g}, max {s['max']:g}")
            o.append(f'<g class="mark {fmt}"><title>{html.escape(tip)}</title>')
            # full-row hit area: a 3px dot is not a hover target
            o.append(f'<rect class="hit" x="{pad_l}" y="{cy - ROW_H / 2:.1f}" '
                     f'width="{plot_w}" height="{ROW_H}"/>')
            if s["n"] >= 5:
                o.append(f'<line class="whisk" x1="{x(s["lo"]):.1f}" y1="{cy:.1f}" '
                         f'x2="{x(s["hi"]):.1f}" y2="{cy:.1f}"/>')
                for end in (s["lo"], s["hi"]):
                    o.append(f'<line class="cap" x1="{x(end):.1f}" y1="{cy - 3.5:.1f}" '
                             f'x2="{x(end):.1f}" y2="{cy + 3.5:.1f}"/>')
                bw = max(1.5, x(s["q3"]) - x(s["q1"]))
                o.append(f'<rect class="box" x="{x(s["q1"]):.1f}" y="{cy - 5:.1f}" '
                         f'width="{bw:.1f}" height="10" rx="2"/>')
                o.append(f'<line class="med" x1="{x(s["median"]):.1f}" y1="{cy - 6:.1f}" '
                         f'x2="{x(s["median"]):.1f}" y2="{cy + 6:.1f}"/>')
                for ov in s["out"]:
                    if ov <= xmax:
                        o.append(f'<circle class="out" cx="{x(ov):.1f}" cy="{cy:.1f}" '
                                 f'r="2.6"/>')
                over = [v for v in s["out"] if v > xmax]
            else:
                for v in vals:
                    if v <= xmax:
                        o.append(f'<circle class="thin" cx="{x(v):.1f}" cy="{cy:.1f}" '
                                 f'r="3.2"/>')
                over = [v for v in vals if v > xmax]
            if over:
                ex = x(xmax)
                o.append(f'<path class="over" d="M{ex - 1:.1f} {cy - 4:.1f} '
                         f'L{ex + 5:.1f} {cy:.1f} L{ex - 1:.1f} {cy + 4:.1f} Z"/>')
            o.append('</g>')
            # selective direct labels: sample size always, and the max only when
            # the axis could not show it
            lab = f'n={s["n"]}'
            if over:
                lab += f'  max {s["max"]:g}'
            o.append(f'<text class="nlab" x="{W - PAD_R + 10}" y="{cy + 3.5:.1f}">'
                     f'{lab}</text>')
    o.append('</svg>')
    return "\n".join(o)


def table_html(dim, rep, chart_order=()):
    head = ("<tr><th scope='col' class='lbl'>archetype</th>"
            "<th scope='col'>format</th>"
            "<th scope='col'>n priced</th><th scope='col'>median $</th>"
            "<th scope='col'>IQR $</th><th scope='col'>Q1 $</th>"
            "<th scope='col'>Q3 $</th><th scope='col'>max $</th>"
            "<th scope='col'>mean $</th><th scope='col'>$0 claims</th>"
            "<th scope='col'>$0 share</th></tr>")
    rows = []
    keys = list(rep["dims"][dim]["dynasty"]) + [
        k for k in rep["dims"][dim]["redraft"] if k not in rep["dims"][dim]["dynasty"]]
    # charted rows first, in the chart's own order, so the table reads as its twin
    rank = {k: i for i, k in enumerate(chart_order)}
    keys.sort(key=lambda k: rank.get(k, len(rank)))
    for k in keys:
        for fmt in ("dynasty", "redraft"):
            v = rep["dims"][dim][fmt].get(k)
            if not v:
                continue
            rows.append(
                f"<tr><td class='lbl'>{html.escape(k)}</td>"
                f"<td><span class='dot {fmt}'></span>{fmt}</td>"
                f"<td class='num'>{v['n']}</td><td class='num strong'>{v['median']:g}</td>"
                f"<td class='num'>{v['iqr']:g}</td><td class='num'>{v['q1']:g}</td>"
                f"<td class='num'>{v['q3']:g}</td><td class='num'>{v['max']:g}</td>"
                f"<td class='num'>{v['mean']:g}</td><td class='num'>{v['zero_claims']}</td>"
                f"<td class='num'>{v['zero_share']:g}%</td></tr>")
    return (f"<div class='tw'><table><caption class='vh'>{html.escape(dim)} bid "
            f"distribution</caption><thead>{head}</thead><tbody>"
            + "".join(rows) + "</tbody></table></div>")


CSS = """
:root{
  --bg:#f3f3fa; --surface:#ffffff; --surface-2:#ececf7;
  --ink:#12131f; --ink-2:#4d5488; --ink-3:#5c6390;
  --line:#c9c9e2; --grid:#e2e2f0; --shade:rgba(18,19,31,.17);
  --s-dyn:#2842b0; --s-red:#9e5418;
  --gold:#e0a915;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#101122; --surface:#191b30; --surface-2:#1f2139;
    --ink:#ececf7; --ink-2:#a8aed6; --ink-3:#8a90bb;
    --line:#343765; --grid:#2a2c48;
    --s-dyn:#6b84ee; --s-red:#cc7b2e;
  }
}
:root[data-theme="dark"]{
  --bg:#101122; --surface:#191b30; --surface-2:#1f2139;
  --ink:#ececf7; --ink-2:#a8aed6; --ink-3:#8a90bb;
  --line:#343765; --grid:#2a2c48; --shade:rgba(0,0,0,.5);
  --s-dyn:#6b84ee; --s-red:#cc7b2e;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:400 15px/1.55 ui-sans-serif,-apple-system,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;
  font-feature-settings:"ss01","cv11";
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1084px; margin:0 auto; padding:40px 20px 96px}
header{border-bottom:1px solid var(--line); padding-bottom:22px; margin-bottom:30px}
h1{font-size:1.75rem; font-weight:700; letter-spacing:-.018em; margin:0 0 8px; line-height:1.15}
.sub{color:var(--ink-2); max-width:66ch; margin:0}
.meta{color:var(--ink-3); font-size:.8rem; margin:14px 0 0; letter-spacing:.02em}
h2{font-size:1.06rem; font-weight:650; letter-spacing:-.005em; margin:0 0 4px}
h3{font-size:.76rem; font-weight:650; letter-spacing:.07em; text-transform:uppercase;
   color:var(--ink-3); margin:0 0 12px}
.note{color:var(--ink-2); font-size:.875rem; max-width:72ch; margin:0 0 18px}
section{margin:0 0 44px}
.tiles{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:0 0 38px}
.tile{background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:13px 15px}
.tile .k{font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3)}
.tile .v{font-size:1.6rem; font-weight:700; letter-spacing:-.02em; margin-top:3px; line-height:1.05}
.tile .h{font-size:.79rem; color:var(--ink-2); margin-top:2px}
.card{background:var(--surface); border:1px solid var(--line); border-radius:12px;
      padding:20px 22px 12px; overflow-x:auto}
/* edge cue so a narrow screen shows there is more chart or table to the right */
.card,.tw{
  background-image:
    linear-gradient(to right,var(--surface) 60%,rgba(255,255,255,0)),
    linear-gradient(to left,var(--surface) 60%,rgba(255,255,255,0)),
    linear-gradient(to right,var(--shade),rgba(255,255,255,0) 13px),
    linear-gradient(to left,var(--shade),rgba(255,255,255,0) 13px);
  background-position:0 0,100% 0,0 0,100% 0;
  background-repeat:no-repeat;
  background-size:34px 100%,34px 100%,13px 100%,13px 100%;
  background-attachment:local,local,scroll,scroll;
}
.legend{display:flex; flex-wrap:wrap; gap:6px 20px; align-items:baseline;
        margin:0 0 6px; font-size:.83rem; color:var(--ink-2)}
.legend b{font-weight:600; color:var(--ink)}
.sw{display:inline-block; width:22px; height:10px; border-radius:2px; vertical-align:-1px; margin-right:7px}
.sw.dynasty{background:var(--s-dyn)} .sw.redraft{background:var(--s-red)}
.dot{display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:0}
.dot.dynasty{background:var(--s-dyn)} .dot.redraft{background:var(--s-red)}
/* fixed intrinsic width: the card is the scroll container, so a narrow screen
   scrolls the chart instead of shrinking it to unreadable 4px type */
.chart{display:block; width:980px; max-width:none; flex:none}
.chart .grid{stroke:var(--grid); stroke-width:1}
.chart .stripe{fill:var(--surface-2); opacity:.62}
.chart .tick{fill:var(--ink-3); font-size:11px; font-variant-numeric:tabular-nums}
.chart .axis-title{fill:var(--ink-2); font-size:11.5px; letter-spacing:.05em}
.chart .cat{fill:var(--ink); font-size:11.5px}
.chart .nlab{font-size:10.5px; font-variant-numeric:tabular-nums; fill:var(--ink-3)}
.chart .dynasty .box{fill:var(--s-dyn); fill-opacity:.17; stroke:var(--s-dyn); stroke-width:1.4}
.chart .redraft .box{fill:var(--s-red); fill-opacity:.17; stroke:var(--s-red); stroke-width:1.4}
.chart .dynasty .whisk,.chart .dynasty .cap{stroke:var(--s-dyn); stroke-width:1.3}
.chart .redraft .whisk,.chart .redraft .cap{stroke:var(--s-red); stroke-width:1.3}
.chart .dynasty .med{stroke:var(--s-dyn); stroke-width:2.4}
.chart .redraft .med{stroke:var(--s-red); stroke-width:2.4}
.chart .dynasty .out,.chart .dynasty .thin{fill:var(--s-dyn); stroke:var(--surface); stroke-width:2}
.chart .redraft .out,.chart .redraft .thin{fill:var(--s-red); stroke:var(--surface); stroke-width:2}
.chart .hit{fill:transparent}
.chart .dynasty .over{fill:var(--s-dyn)} .chart .redraft .over{fill:var(--s-red)}
.chart .mark:hover .box{fill-opacity:.34}
.chart .mark:hover .hit{fill:var(--ink); fill-opacity:.035}
.tw{overflow-x:auto; margin-top:16px; border:1px solid var(--line); border-radius:10px;
    background:var(--surface)}
table{border-collapse:collapse; width:100%; font-size:.83rem}
caption{text-align:left}
th,td{padding:7px 11px; text-align:left; border-bottom:1px solid var(--grid); white-space:nowrap}
thead th{position:sticky; top:0; background:var(--surface-2); color:var(--ink-2);
         font-size:.72rem; letter-spacing:.05em; text-transform:uppercase; font-weight:650}
td.num,th.num{text-align:right; font-variant-numeric:tabular-nums}
td.strong{font-weight:700}
td.lbl{white-space:normal; min-width:230px; color:var(--ink)}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--surface-2)}
.vh{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
.empty{color:var(--ink-3); font-size:.85rem; padding:10px 0}
footer{border-top:1px solid var(--line); padding-top:20px; color:var(--ink-2); font-size:.85rem}
footer p{max-width:78ch}
code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:.85em;
     background:var(--surface-2); padding:1px 5px; border-radius:4px}
@media (max-width:760px){
  .wrap{padding:24px 12px 72px} h1{font-size:1.4rem}
  .card{padding:16px 14px 10px}
  .tiles{gap:8px; margin-bottom:28px}
}
"""


def render(rows, rep, outdir):
    priced = defaultdict(lambda: defaultdict(list))   # dim -> label -> fmt -> [bids]
    keyers = {
        "situation": lambda r: r["situation"],
        "position": lambda r: r["pos_group"],
        "experience": lambda r: r["exp_tier"],
        "production": lambda r: r["production_profile"],
        "archetype": lambda r: r["archetype"],
    }
    pctof = defaultdict(lambda: defaultdict(list))
    for r in rows:
        if r["status"] != "complete" or r["bid"] <= 0:
            continue
        for dim, k in keyers.items():
            priced[dim].setdefault(k(r), {}).setdefault(r["format"], []).append(r["bid"])
            if dim == "situation":
                pctof["situation"].setdefault(k(r), {}).setdefault(
                    r["format"], []).append(round(r["bid_pct_budget"], 1))

    def ordered(dim, src):
        d = src[dim]
        keep = {}
        for k, byf in d.items():
            if dim == "archetype" and max(len(v) for v in byf.values()) < 8:
                continue
            keep[k] = byf
        def rank(kv):
            byf = kv[1]
            vals = byf.get("dynasty") or byf.get("redraft")
            thin = max((len(v) for v in byf.values()), default=0) < 5
            return (thin, -statistics.median(vals))
        return sorted(keep.items(), key=rank)

    dyn, red = rep["counts"]["dynasty"], rep["counts"]["redraft"]
    parts = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
             f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
             f"<title>FAAB bids by waiver archetype</title><style>{CSS}</style>"
             f"</head><body><div class='wrap'>"]
    parts.append(f"""
<header>
  <h1>What a waiver archetype costs in FAAB</h1>
  <p class="sub">Every waiver claim in tdub1329's three dynasty leagues and his one
  redraft league, {min(dyn['seasons'])} through {max(dyn['seasons'])}, classified on four
  dimensions and priced. Dynasty and redraft never share a box.</p>
  <p class="meta">Source: Sleeper API, <code>/league/{{id}}/transactions/{{week}}</code>, weeks 0 to 18,
  chains walked through <code>previous_league_id</code> &middot; generated {rep['generated']}
  &middot; script <code>notes/faab_extract.py</code> &middot; rules
  <code>notes/faab-bid-archetypes-2026-09-16.md</code></p>
</header>

<div class="tiles">
  <div class="tile"><div class="k">Dynasty</div><div class="v">{dyn['completed_priced']}</div>
    <div class="h">priced claims, {len(dyn['leagues'])} leagues</div></div>
  <div class="tile"><div class="k">Redraft</div><div class="v">{red['completed_priced']}</div>
    <div class="h">priced claims, 1 league</div></div>
  <div class="tile"><div class="k">$0 claims, dynasty</div><div class="v">{dyn['zero_share_pct']:g}%</div>
    <div class="h">{dyn['completed_zero_dollar']} of {dyn['completed']} wins, charted separately</div></div>
  <div class="tile"><div class="k">$0 claims, redraft</div><div class="v">{red['zero_share_pct']:g}%</div>
    <div class="h">{red['completed_zero_dollar']} of {red['completed']} wins</div></div>
  <div class="tile"><div class="k">Losing bids held back</div>
    <div class="v">{dyn['failed'] + red['failed']}</div>
    <div class="h">failed claims, in the CSV only</div></div>
</div>

<section>
  <h2>How to read a box</h2>
  <p class="note">Tukey convention: the box spans Q1 to Q3, the heavy rule is the median,
  whiskers reach the furthest claim within 1.5 &times; IQR and anything past that is drawn as
  its own dot. A grouping with fewer than five priced claims gets its raw claims as dots and
  no box, because a quartile on four numbers is decoration.
  <strong>The axis stops at the furthest whisker, not the furthest claim</strong>, because one
  $200 bid was setting the scale for every chart and squeezing every box into the left fifth of
  the canvas. A claim past the edge is drawn as a triangle on the edge and that row's max is
  written out beside its sample size, so the tail is labelled rather than plotted, and the
  tables carry every exact figure either way. <strong>$0 claims are excluded from every box</strong> and carried as their
  own column in the tables: a $0 waiver win is a free-agent pickup that happened to route
  through the waiver queue, and folding them in drags most medians to zero without telling
  you what the archetype costs.</p>
  <div class="legend">
    <span><span class="sw dynasty"></span><b>Dynasty</b>: Password is taco, The League, yuH</span>
    <span><span class="sw redraft"></span><b>Redraft</b>: Phi Kap Fantasy</span>
  </div>
</section>
""")

    for dim, heading, blurb in DIMS:
        groups = ordered(dim, priced)
        parts.append(f"<section><h2>{html.escape(heading)}</h2>"
                     f"<p class='note'>{html.escape(blurb)}</p>"
                     f"<div class='card'><h3 id='t-{dim}'>Winning bid, dollars</h3>"
                     f"{box_svg(groups, 'winning bid (dollars)', 't-' + dim)}</div>")
        if dim == "situation":
            g2 = ordered("situation", pctof)
            parts.append(
                "<p class='note' style='margin:18px 0 12px'>The apples-to-apples view. Season "
                "budgets are 200 and 201 in Password is taco, 200 in The League, 150 in yuH and "
                "100 in Phi Kap Fantasy, so a dollar does not mean the same thing across the two "
                "formats.</p><div class='card'>"
                "<h3 id='t-sit-pct'>Winning bid, percent of that league-season's budget</h3>"
                + box_svg(g2, "winning bid (% of season budget)", "t-sit-pct") + "</div>")
        parts.append(table_html(dim, rep, [g[0] for g in groups]) + "</section>")

    u_d, u_r = rep["unknowns"]["dynasty"], rep["unknowns"]["redraft"]
    parts.append(f"""
<footer>
  <h2>What is not in here</h2>
  <p><strong>Washington Football League is excluded.</strong> It runs on ESPN, which is not on
  <code>api.sleeper.app</code> and exposes no key-free waiver-bid endpoint, so no ESPN claim
  appears in any number on this page.</p>
  <p><strong>Unknown dimensions.</strong> Dynasty: experience {u_d['experience_unknown_pct']:g}% unknown
  ({u_d['experience_na_team_defense_pct']:g}% more are team defenses, which have no rookie year and are
  labelled n/a), position {u_d['position_unknown_pct']:g}%, production profile
  {u_d['production_unknown_pct']:g}%, situation unresolved {u_d['situation_unresolved_pct']:g}%.
  Redraft: experience {u_r['experience_unknown_pct']:g}%
  ({u_r['experience_na_team_defense_pct']:g}% team defenses), position {u_r['position_unknown_pct']:g}%,
  production {u_r['production_unknown_pct']:g}%, situation {u_r['situation_unresolved_pct']:g}%.
  The production profile needs three games after the pickup, so week-16-and-later claims and the
  two weeks of 2026 played so far are unknown rather than guessed.</p>
  <p><strong>Losing bids.</strong> Failed claims carry a real stated price but several rosters bid on
  the same player in the same week, so charting them would count one vacancy many times. They stay in
  <code>notes/faab-bids-2026-09-16.csv</code> under <code>status</code> for anyone who wants them.</p>
</footer>
</div></body></html>""")

    path = os.path.join(outdir, "faab-bid-archetypes-2026-09-16.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write("".join(parts))
    print(f"wrote {path}")
    return path


if __name__ == "__main__":
    # the two bits of geometry that silently put marks outside the plot when wrong
    for h in (1, 4, 7, 88, 100, 143, 175, 200, 201):
        assert nice_ticks(h)[-1] >= h, (h, nice_ticks(h))
        assert nice_ticks(h)[0] == 0
    assert gutter(["RB", "WR"]) == 56
    assert gutter(["rookie · offseason rookie claim · RB · low output"]) == PAD_L
    assert gutter([]) == 56
    assert 56 < gutter(["starter left the team (cut or traded)"]) < PAD_L
    print("faab_chart geometry checks pass")
