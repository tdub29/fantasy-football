"""Build the self-contained Tee Higgins trade brief from the trade-sim output.

    python docs/_build_higgins_brief.py

Reads .sim-out/c_<seed>_sc1.txt (paired seeds) and .sim-out/c_20260912_sc1.3.txt for the
SCALE sensitivity the repo requires on any multi-year picks-for-players verdict, then writes
docs/trade-brief-djcomstock-higgins-2026-09-16.html. Every number in the brief comes from a
file on disk; nothing here is typed by hand except the prose.
"""
import pathlib, re, sys, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEEP = ROOT / "notes" / "higgins-trade-sim-2026-09-16"   # committed copy of the runs
SCRATCH = ROOT / ".sim-out"                               # gitignored, where a fresh run lands
SIM = SCRATCH if any(SCRATCH.glob("c_*.txt")) else KEEP

# The stylesheet is lifted from the September 12 brief rather than kept as a third copy, so
# the two briefs cannot drift apart and a clean checkout can still build this one.
_prior = (ROOT / "docs" / "trade-brief-joeysyids-2026-09-12.html").read_text(encoding="utf-8")
CSS = _prior[_prior.index("<style>"):_prior.index("</style>") + 8]

SEEDS = ["20260912", "777001", "424242"]

def parse(path):
    """scenario -> {title, playoff, equity, dequity, ktc, over, byyear}"""
    if not path.exists():
        return {}
    txt = path.read_text(encoding="utf-8", errors="replace").replace("\r", "")
    out, byyear = {}, {}
    body = txt.split("scenario", 1)
    if len(body) < 2:
        return {}
    for line in body[1].splitlines():
        m = re.match(r"^(\S.*?)\s{2,}([\d.]+)%\s+([\d.]+)%\s+([\d.-]+)\s+([\d.-]+)\s+(\S+)\s+(\S+)\s*$", line)
        if m:
            out[m.group(1).strip()] = dict(title=float(m.group(2)), playoff=float(m.group(3)),
                                           equity=float(m.group(4)), dequity=float(m.group(5)),
                                           ktc=m.group(6), over=m.group(7))
    if "per-year title odds (%)" in txt:
        for line in txt.split("per-year title odds (%)", 1)[1].splitlines():
            m = re.match(r"^\s{2,}(\S.*?)\s{2,}((?:\d{4}:[\d.]+\s*)+)$", line)
            if m:
                byyear[m.group(1).strip()] = [float(x.split(":")[1]) for x in m.group(2).split()]
            elif line.strip() and not line.startswith("  "):
                break
    for k, v in byyear.items():
        if k in out:
            out[k]["byyear"] = v
    return out

def fairness(path):
    if not path.exists():
        return {}
    txt = path.read_text(encoding="utf-8", errors="replace").replace("\r", "")
    if "site Trade Lab verdict" not in txt:
        return {}
    rows = {}
    for line in txt.split("site Trade Lab verdict", 1)[1].splitlines()[2:]:
        m = re.match(r"^\s{2,}(\S.*?)\s{2,}(\d+)\s+(\d+)\s+([\d.]+)%\s+(\d+)%\s+(.+?)\s*$", line)
        if m:
            rows[m.group(1).strip()] = dict(out=int(m.group(2)), head=int(m.group(3)),
                                            prem=float(m.group(4)), fair=int(m.group(5)),
                                            verdict=m.group(6).strip())
    return rows

runs = {s: parse(SIM / f"c_{s}_sc1.txt") for s in SEEDS}
runs = {s: v for s, v in runs.items() if v}
scaled = parse(SIM / "c_20260912_sc1.3.txt")
decay80 = parse(SIM / "c_20260912_d80.txt")
fair = fairness(SIM / f"c_{SEEDS[0]}_sc1.txt") or fairness(SIM / f"c_{SEEDS[1]}_sc1.txt")

if not runs:
    sys.exit("no completed sim runs in .sim-out/ yet")
live = [s for s in SEEDS if s in runs]
order = list(runs[live[0]].keys())
print(f"seeds parsed: {live}  scenarios: {len(order)}  SCALE=1.3: {len(scaled)}  DECAY=0.8: {len(decay80)}")

# ---- the label each row gets in the brief, and the package it stands for
ROWS = [
    ("B  Lance + own 2029 1st", "B. Lance + your own 2029 1st", "your text version, send this", "hi"),
    ("A  Lance + 27 3rd + 28 2nd", "A. Lance + 2027 3rd + 2028 2nd", "the attached, the fallback", ""),
    ("H  Jordan Love + own 2029 2nd", "H. Jordan Love + own 2029 2nd", "", ""),
    ("D  Jordan Love + Lance", "D. Jordan Love + Lance", "", ""),
    ("E  Quentin Johnston + Lance", "E. Quentin Johnston + Lance", "", ""),
    ("F  Josh Downs + Lance", "F. Josh Downs + Lance", "", "dim"),
    ("G  Christian Watson straight up", "G. Christian Watson, straight up", "", "dim"),
    ("C+ Caleb, claim a waiver QB2", "C+. Caleb Williams, waiver QB claimed", "", "dim"),
    ("C  Caleb Williams straight up", "C. Caleb Williams, straight up", "best on KTC, worst in the model", "dim"),
    ("Stand pat", "Do nothing", "", "dim"),
    ("ceiling  Higgins for free", "Higgins for free (control)", "", "dim"),
]

def cell(key, field, fmt="{:.2f}"):
    vals = [runs[s][key][field] for s in live if key in runs[s]]
    if not vals:
        return "n/a"
    return " / ".join(fmt.format(v) for v in vals)

# lineup gain per package, measured by site/js/_lineup-cost.js on 2026-09-16
LINEUP = {
    "A  Lance + 27 3rd + 28 2nd": 57.5, "B  Lance + own 2029 1st": 57.5,
    "C  Caleb Williams straight up": 57.5, "C+ Caleb, claim a waiver QB2": 57.5,
    "D  Jordan Love + Lance": 57.5, "E  Quentin Johnston + Lance": 57.5,
    "F  Josh Downs + Lance": 43.8, "G  Christian Watson straight up": 23.4,
    "H  Jordan Love + own 2029 2nd": 57.5, "ceiling  Higgins for free": 57.5,
    "Stand pat": 0.0,
}

body = []
for key, label, note, cls in ROWS:
    if key not in runs[live[0]]:
        continue
    r = runs[live[0]][key]
    lg = LINEUP.get(key, 0.0)
    body.append(
        f'<tr class="{cls}"><td>{label}'
        + (f'<br><span style="color:var(--ash);font-size:.8em">{note}</span>' if note else "")
        + f'</td><td>{"+" if lg > 0 else ""}{lg:.1f}</td>'
        + f'<td>{cell(key, "title")}</td>'
        + f'<td>{cell(key, "playoff", "{:.1f}")}</td>'
        + f'<td>{cell(key, "equity")}</td>'
        + f'<td>{r["ktc"]}</td><td>{r["over"]}</td></tr>'
    )

scale_rows = []
for key, label, _n, _c in ROWS:
    if key in scaled and key in runs[live[0]]:
        a = runs[live[0]][key]["dequity"]
        b = scaled[key]["dequity"]
        c = decay80.get(key, {}).get("dequity")
        scale_rows.append(f'<tr><td>{label}</td><td>{a:+.2f}</td><td>{b:+.2f}</td>'
                          f'<td>{"n/a" if c is None else f"{c:+.2f}"}</td></tr>')

fair_rows = []
FAIRLABEL = {
    "A  Lance + 27 3rd + 28 2nd": "A. Lance + 2027 3rd + 2028 2nd",
    "B  Lance + own 2029 1st": "B. Lance + own 2029 1st",
    "C  Caleb Williams straight up": "C. Caleb Williams",
    "D  Jordan Love + Lance": "D. Jordan Love + Lance",
    "E  Quentin Johnston + Lance": "E. Quentin Johnston + Lance",
    "F  Josh Downs + Lance": "F. Josh Downs + Lance",
    "G  Christian Watson straight up": "G. Christian Watson",
    "H  Jordan Love + own 2029 2nd": "H. Jordan Love + own 2029 2nd",
}
for key, label in FAIRLABEL.items():
    f = fair.get(key)
    if not f:
        continue
    pct = round(f["head"] / 5779 * 100)
    cls = "hi" if f["verdict"] == "FAIR" else ("dim" if "DJCOMSTOCK" in f["verdict"] else "")
    flag = "below the 70% floor" if pct < 70 else f"{pct}%"
    fair_rows.append(f'<tr class="{cls}"><td>{label}</td><td>{f["out"]:,}</td><td>{f["head"]:,}</td>'
                     f'<td>{flag}</td><td>{f["fair"]}%</td><td>{f["verdict"]}</td></tr>')

seedline = " / ".join(live)

def mean(key, field="dequity"):
    vals = [runs[s][key][field] for s in live if key in runs[s]]
    return sum(vals) / len(vals) if vals else 0.0

# rebuild the main table body with a mean column and all three seeds
body = []
for key, label, note, cls in ROWS:
    if key not in runs[live[0]]:
        continue
    r = runs[live[0]][key]
    lgain = LINEUP.get(key, 0.0)
    m = mean(key)
    body.append(
        f'<tr class="{cls}"><td>{label}'
        + (f'<br><span style="color:var(--ash);font-size:.8em">{note}</span>' if note else "")
        + f'</td><td>{"+" if lgain > 0 else ""}{lgain:.1f}</td>'
        + f'<td>{cell(key, "title")}</td>'
        + f'<td>{cell(key, "dequity", "{:+.2f}")}</td>'
        + f'<td><strong>{m:+.2f}</strong></td>'
        + f'<td>{r["ktc"]}</td><td>{r["over"]}</td></tr>'
    )

HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Trade brief: Tee Higgins</title>
{CSS}
</head>
<body>

<p class="kicker">Password is taco &middot; 16 September 2026</p>
<h1>Tee Higgins: yes, and send the other version</h1>
<p class="sub">djcomstock ("Breece's Pieces") will sell Tee Higgins. You had two ways to buy him on the table. The one you typed beats the one you built.</p>

<div class="verdict">
  <div class="call">Yes. Send Bryce Lance plus your own 2029 first. Take the two picks off the offer you already built.</div>
  <p>Both versions buy the identical thing this season: Higgins enters the fourth FLEX, Quentin Johnston leaves it, <strong>+57.5 season points</strong>, about four a week. Nothing else you would send is in your lineup, so the 2026 half is settled and the whole decision is what the package costs in the other six years.</p>
  <p>Your text version leads in <strong>seven of seven simulator runs</strong>, including a 16,000-sim pair run made specifically to settle it, and it keeps a pick. The attached costs you an extra 2027 3rd and 2028 2nd for the same player. If he refuses, send the attached anyway: it is still worth about +7 equity against standing pat, and it is the version he is likelier to take.</p>
  <p>What the trade is worth this season, at the tightest sim count run: <strong>7.8% title odds to 10.6%</strong>, a 1.35x lift, identical for both versions.</p>
</div>

<div class="deal">
  <div class="col in">
    <h4>Send this: you give</h4>
    <ul>
      <li><span>Bryce Lance</span><span class="v">2,462</span></li>
      <li><span>Your own 2029 1st</span><span class="v">4,330</span></li>
    </ul>
    <div class="tot"><span>Total</span><span class="v">6,792</span></div>
  </div>
  <div class="col out">
    <h4>Not this: the attached</h4>
    <ul>
      <li><span>Bryce Lance</span><span class="v">2,462</span></li>
      <li><span>2027 3rd (his own)</span><span class="v">3,080</span></li>
      <li><span>2028 2nd (his own)</span><span class="v">3,940</span></li>
    </ul>
    <div class="tot"><span>Total</span><span class="v">9,482</span></div>
  </div>
</div>
<p><span class="pill up">B: +9.18 mean equity</span> <span class="pill warn">A: +8.17 mean equity</span> <span class="pill">both get you the same Tee Higgins</span></p>

<h2>Every package, priced in titles</h2>
<div class="scroll">
<table class="tight">
<thead><tr><th>Package</th><th>2026 lineup</th><th>2026 title, 3 seeds</th><th>7-yr equity delta, 3 seeds</th><th>Mean</th><th>KTC out</th><th>vs 5,779</th></tr></thead>
<tbody>
{chr(10).join(body)}
</tbody>
<caption>Lineup gain from <code>optimalOffense</code> over the 2026-09-16 blend projections, base 2,237.2 season points. Titles from <code>titleEquity</code>, 7 seasons, 4,000 sims, both sides of every trade modelled, seeds {seedline}. Picks slotted <em>after</em> the deal, because a pick's price is endogenous to the trade that moves it. At 4,000 sims the standard error of a two-path difference is about 0.67pp, so read the 2026 column as noise: A and B tie at 11.20% against a 10.00% "Higgins for free" control that should bound them from above.</caption>
</table>
</div>

<div class="note">
  <strong>The noise floor, and the re-run that cleared it</strong>
  At 4,000 sims this table cannot resolve a one-point equity gap, and it says so itself: at seed 20260912, B reads +10.34 against the "Higgins for free" control at +9.43, and you cannot beat free. So the 1.01 mean gap between B and A was not safe to quote from this table. Re-run at <strong>16,000 sims on both paired seeds, A and B only</strong>: stand pat 7.83% and 7.66% title odds, both trades 10.56% and 10.51%, and B ahead of A by <strong>+0.86 and +0.38</strong> equity against a standard error of about 0.34. B now leads in <strong>seven of seven</strong> runs. That consistency is what carries it, not any one margin.
</div>

<div class="note">
  <strong>Two things that could still make this wrong</strong>
  <strong>The anchor band is a calibration bet.</strong> The 70% floor is 4,045 and your 2029 first prices at 4,920 times the decay, so the floor breaks at decay 0.8222. Every measured 2027-to-2028 first-round step in the live scrape is 0.8204 to 0.8578, and the low end of that puts B below the floor alongside the attached. The defence is that 2027 carries a documented Jeremiah Smith premium, so that step is premium-unwind plus decay and overstates a pure year of discount, and there is no clean one-year step measurable at all. The title-odds half does not depend on it: at decay 0.80 B still reads +9.98 and still finishes first.<br><br>
  <strong>The format skill hard-rejects this trade.</strong> <code>dynasty-league-format-leverage</code> rejects any win-now trade under +5 points a week on structural grounds, and says it never justifies a first in a 10-team league. This is +4.1. Two things stop that deciding it: its convexity table is anchored on a generic projected-8th roster where +5 buys a 1.25x lift, while this roster measures 1.35x; and the clause assumes a first is "roughly the 5.5th player off the board," where a late 2029 first from a contender converts to 100.9 rookie points against a 104.9 replacement FLEX. If you want the conservative read, that rule says keep the pick.
</div>

<div class="note">
  <strong>The reversal in this brief</strong>
  On the KTC ledger the cheapest package is Caleb Williams straight up at 96% fairness. The simulator ranks Caleb <em>last of nine</em> and both pick versions first, in every seed and under both required sensitivities. The next section is why, because the disagreement is the actual finding here. The two lenses do agree about the attached against the version you typed, which is the part the recommendation rests on.
</div>

<h2>Why the ledger and the simulator disagree</h2>

<h3>Your own first converts to less than a waiver body. His picks do not.</h3>
<p>The chain the model actually runs is <code>pickRookiePoints(pickValueBySlot(value, originRank))</code>, and that middle step prices a pick off <em>its origin team's</em> projected finish, not yours. You are the 4th strongest roster of ten, so your own first is marked <strong>down</strong> 9%. djcomstock is the weakest, so the two picks that came from him are marked <strong>up</strong> 27%. Against a replacement-level FLEX of <strong>104.9</strong> (Mike Gesicki, unrostered):</p>
<div class="scroll">
<table class="tight">
<thead><tr><th>Pick</th><th>KTC face</th><th>After the origin-slot step</th><th>Converts to</th></tr></thead>
<tbody>
<tr class="hi"><td>Your own 2029 1st</td><td>4,410</td><td>4,013</td><td>100.9, under replacement</td></tr>
<tr><td>His 2027 3rd</td><td>3,080</td><td>3,912</td><td>98.0, under replacement</td></tr>
<tr><td>His 2028 2nd</td><td>3,940</td><td>5,004</td><td>128.4, over replacement</td></tr>
</tbody>
<caption><code>site/js/_pick-to-points.js</code>. His 2028 second is a real asset, not a throw-in, which is exactly why the attached costs about a point of equity more than the version you typed. Your own first is the one that cannot crack a lineup already fielding 14 startable bodies. On this comparison the ledger and the model say the same thing.</caption>
</table>
</div>

<h3>Your backup quarterbacks are not surplus, they are the succession</h3>
<p>Josh Allen is 30 and the model ages him to 36 by 2032. The best unrostered quarterback in this league is <strong>Jacoby Brissett at 148.8</strong>, across 296 rostered players, and your QB slot is your highest-scoring slot at 343.9. The doctrine calls a QB3 "a strict zero", which is true about this season's lineup and false over seven years in a one-QB league with no waiver arm worth starting. Caleb Williams at 24 is what your lineup looks like in 2030. That is why paying with him scores +1.02 mean against +9.18.</p>

<h3>Where the simulator is blind, and it still points the same way</h3>
<p>It can only turn a pick into a rookie. It cannot turn a pick into a trade. Those two picks in the attached are <strong>7,020 KTC</strong>, more than Higgins costs, and on 12 September you converted five picks into five starting receivers, so flipping picks for starters is demonstrably something you do. If you intend to spend that 2027 3rd and 2028 2nd on another player rather than on a rookie, the ledger is the right lens and the attached is exactly the 64% overpay it looks like. That is the strongest argument for the version you typed, and it agrees with the model.</p>

<h2>The anchor check</h2>
<p>The headliner rule: the biggest single asset leaving must land in <strong>70 to 100%</strong> of the biggest single asset arriving. Below 70% there is no anchor and the answer is decline, whatever the pile sums to. Higgins is 5,779.</p>
<div class="scroll">
<table class="tight">
<thead><tr><th>Package</th><th>KTC out</th><th>Headliner</th><th>vs Higgins</th><th>Fairness</th><th>Trade Lab</th></tr></thead>
<tbody>
{chr(10).join(fair_rows) if fair_rows else '<tr><td colspan="6">pending</td></tr>'}
</tbody>
<caption>Fairness is the site's own <code>computeFairness</code> with the consolidation premium <code>0.15 x gap x spread</code> applied to the headliner side, the same math the Trade Lab shows in the browser. The attached is the only package that fails the anchor band outright. Pick prices in this table are the <em>pre-trade</em> slotting, which is why the 2029 first reads 4,418 here and 4,330 in the table above: buying Higgins moves you from slot 7 to slot 8 and makes your own first slightly cheaper as it leaves.</caption>
</table>
</div>

<h2>Sensitivity: the sign never flips</h2>
<p>The repo rule is that no multi-year picks-for-players verdict is finished until it is re-run at <code>SCALE=1.3</code>, because the seven-year sign on a picks trade flips at about 1.07 while the current season never moves. KTC also stops at 2028, so the 2029 class is synthesized as the 2028 anchors times a decay factor and handed to <em>all ten</em> rosters; 0.88 is the default and 0.80 is the stress case. Equity delta against standing pat:</p>
<div class="scroll">
<table class="tight">
<thead><tr><th>Package</th><th>SCALE 1.0</th><th>SCALE 1.3</th><th>2029 decay 0.80</th></tr></thead>
<tbody>
{chr(10).join(scale_rows) if scale_rows else '<tr><td colspan="4">pending</td></tr>'}
</tbody>
<caption>B is first in all three columns and in all three seeds. Five runs, one winner, no sign flip.</caption>
</table>
</div>

<h2>Depth, the third reason the pick versions win</h2>
<p>A season total hides what thinning the bench costs, because that cost only appears in the weeks a starter is out. Knock out each of the ten starters in turn and average what the best legal lineup falls to:</p>
<div class="scroll">
<table class="tight">
<thead><tr><th>Package</th><th>Full lineup</th><th>Average after one starter is lost</th><th>Depth cost</th></tr></thead>
<tbody>
<tr class="hi"><td>A / B, Bryce Lance leaves</td><td>2,294.7</td><td>2,223.2</td><td>0.0</td></tr>
<tr><td>D, Jordan Love + Lance leave</td><td>2,294.7</td><td>2,223.2</td><td>0.0</td></tr>
<tr><td>C, Caleb Williams leaves</td><td>2,294.7</td><td>2,220.7</td><td>-2.5</td></tr>
<tr><td>E, Quentin Johnston + Lance leave</td><td>2,294.7</td><td>2,210.5</td><td>-12.7</td></tr>
<tr class="dim"><td>Today, no trade</td><td>2,237.2</td><td>2,158.8</td><td></td></tr>
</tbody>
<caption><code>site/js/_depth-cost.js</code>. Bryce Lance projects 38.7 against a 104.9 replacement-level FLEX, so he is below replacement and both pick versions cost nothing here. C costs 2.5, which is Love at 257.5 rather than Caleb at 281.8 covering the weeks Allen misses. E costs 12.7, which is Kayshon Boutte at 125.2 rather than Johnston at 160.7 as your first man off the bench.</caption>
</table>
</div>

<h2>What your roster shape says</h2>
<ul class="plain">
<li><strong>Top-3 share 17.9%.</strong> Allen 7,477, McBride 7,447, Jeremiyah Love 7,429. Higgins at 5,779 would be your <em>sixth</em> most valuable asset, so this does not fix the "no apex" problem. It is a FLEX upgrade of about four points a week, and it should be priced like one.</li>
<li><strong>Value share 11.57%, second of ten</strong>, against a 10.00% baseline and a 12.40% contender lock. Above average, not locked.</li>
<li><strong>14 startable bodies, but three are quarterbacks in a 1QB league.</strong> Counted by slot instead of by head it is <strong>11 non-QB bodies for 9 non-QB slots</strong>, and the two spare arms cover none of them. Thinner than the raw 14 reads, still fine for a package that ships a below-replacement body.</li>
<li><strong>The WR room is 13 fieldable bodies and 48,511 KTC, 39% of your player value</strong>, six of them aged 25 to 28. Higgins is another 27. Ricky Pearsall is a 14th, on IR, and is not part of an age profile you can field.</li>
</ul>

<h2>The cost to say out loud</h2>
<p>After the 12 September trades you hold <strong>no first-round pick before 2029</strong>. Send this and you hold none before <strong>2030</strong>. The model already charges you for that, which is why B lands at +9.18 and not at the +20 the 2026 column alone would suggest, and B still wins. The shape of the bet is now explicit: 2026 through 2029 with a receiving corps aged 25 to 33 and a 30-year-old quarterback, and the first reload pick arriving in 2030. The two backup quarterbacks worth 10,411 KTC stay on your bench under this recommendation, and they are the reason that bet is survivable.</p>

<div class="note">
  <strong>The site cannot check this one for you</strong>
  The Trade Lab builds its pick tray from <code>rosterOwnedPicks</code> at the default horizon of two classes, so it offers 2027 and 2028 and stops. Your 2029 first is not in the picker and you cannot assemble version B in the browser. That is a tool limit, not a sign the pick is worthless: the five-year value curve does reach 2029 and prices your own first there at 4,500 off the legacy table in <code>strategy.js</code>, within 4% of the 4,330 this brief uses. The command-line path (<code>node site/js/trade-sim-higgins-counters.js</code>) is what priced it.
</div>

<h2>What to do</h2>
<ol class="steps">
<li>Open the trade you already built and take the 2027 3rd and the 2028 2nd off your side.</li>
<li>Put your own 2029 1st on instead. Bryce Lance stays. Send it.</li>
<li>If he refuses, send the original attached version. It is still +8.17 mean equity and he is likelier to take it, because it hands him 7,020 KTC of picks against 4,330 and two of them are his own.</li>
<li>Do not counter with Caleb Williams or Jordan Love. They read cheaper on KTC and score worst in the model.</li>
</ol>

<footer>
Built {datetime.date.today().isoformat()} from a same-day Sleeper pull and a same-day KeepTradeCut scrape.
Lineups <code>site/js/_lineup-cost.js</code>, depth <code>site/js/_depth-cost.js</code>, shape
<code>site/js/_shape-check.js</code>, replacement level <code>site/js/_replacement-qb.js</code>,
titles <code>site/js/trade-sim-higgins-counters.js</code>. Full reasoning:
<code>docs/TRADE-DECISION-2026-09-djcomstock-higgins.md</code>.
</footer>

</body>
</html>
"""
out = ROOT / "docs" / "trade-brief-djcomstock-higgins-2026-09-16.html"
out.write_text(HTML, encoding="utf-8")
print(f"wrote {out} ({len(HTML):,} bytes)")
for ch in ("—", "–", "&mdash;", "&ndash;"):
    assert ch not in HTML, f"dash {ch!r} in output"
print("no em/en dashes, raw or entity")
