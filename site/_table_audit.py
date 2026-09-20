"""Measure every table.data in the app at a desktop and a phone width.

Why this exists: `table.data` is `width:100%` with no column sizing, so a
4-column table stretches to fill any viewport (sprawl) and a 13-column table
crushes. Neither is visible from reading app.js, and eyeballing one screenshot
does not tell you which of the 20 tables are wrong. This walks every route in
.agents/feature-map.json, finds each table, and reports:

  natural  the width the table wants, measured from a hidden `width:max-content`
           clone, so it is the real content width not a guess
  actual   what it renders at
  stretch  actual / natural, the sprawl number. 1.0 is snug, 2.0 means every
           column is twice as wide as its content needs
  clipped  the table is wider than an ancestor that has overflow hidden, so the
           right-hand columns are cut off rather than scrollable
  scroll   the table overflows its own box (scrollWidth > clientWidth)

Also reports whether the PAGE scrolls horizontally, which is the 390px failure
that matters most.

    python _table_audit.py              # 1500 and 390
    python _table_audit.py --json
    python _table_audit.py --width 1500
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

# Windows stdout is cp1252 here, and several headers carry a real arrow glyph
# (Age  League), so an unguarded print dies mid-report after doing all the work.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
ENTRY = (HERE / "index.html").as_uri()
FEATURE_MAP = ROOT / ".agents" / "feature-map.json"

# The sprawl threshold. Below this a table is using its width; above it the
# columns are padding dead space. 1.6 was picked by measuring: the Rookie Pick
# Values table Trevor flagged as unreadable measures 3.4, and the tables that
# read fine sit under 1.5.
SPRAWL = 1.6

MEASURE_JS = r"""
() => {
  // Natural width comes from a `width:max-content` clone, not from summing
  // guesses about text length. The clone is visibility:hidden so it lays out
  // (display:none would give every measurement 0) and position:fixed with a
  // huge available width so max-content is not itself constrained.
  function natural(tbl) {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:-99999px;top:0;width:99999px;visibility:hidden;' +
      'pointer-events:none;contain:layout size style';
    const clone = tbl.cloneNode(true);
    clone.style.width = 'max-content';
    clone.style.minWidth = '0';
    clone.style.maxWidth = 'none';
    clone.style.tableLayout = 'auto';
    host.appendChild(clone);
    document.body.appendChild(host);
    const w = clone.getBoundingClientRect().width;
    const cols = [...clone.querySelectorAll('thead tr:last-child th')]
      .map(th => Math.round(th.getBoundingClientRect().width));
    host.remove();
    return { w, cols };
  }

  // Walk up looking for an ancestor that would clip us. The cards wrapping
  // these tables use overflow:hidden, so a table wider than its card is CUT,
  // not scrollable, and the user never learns the columns exist.
  function clipper(el) {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      const ox = cs.overflowX;
      if (ox === 'hidden' || ox === 'clip') {
        if (el.getBoundingClientRect().width > p.clientWidth + 1) {
          return (p.className || p.tagName) + '';
        }
      }
      if (ox === 'auto' || ox === 'scroll') return null; // scrollable, fine
      p = p.parentElement;
    }
    return null;
  }

  const out = [];
  document.querySelectorAll('table.data').forEach((tbl, i) => {
    const r = tbl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // not laid out on this route
    const nat = natural(tbl);
    const heads = [...tbl.querySelectorAll('thead tr:last-child th')];
    out.push({
      idx: i,
      cls: tbl.className,
      cols: heads.length,
      headers: heads.map(th => (th.textContent || '').trim()).slice(0, 16),
      rows: tbl.querySelectorAll('tbody tr').length,
      actual: Math.round(r.width),
      natural: Math.round(nat.w),
      naturalCols: nat.cols,
      actualCols: heads.map(th => Math.round(th.getBoundingClientRect().width)),
      selfScroll: tbl.scrollWidth > tbl.clientWidth + 1,
      clippedBy: clipper(tbl),
      // Which sizing contract this table opted into. A `fill-last` table is
      // SUPPOSED to be full width, so scoring it on table width reports a
      // correct table as sprawling. Score it on its data columns instead.
      mode: tbl.classList.contains('fill-last') ? 'fill-last'
          : tbl.classList.contains('snug-center') ? 'snug-center'
          : tbl.classList.contains('snug') ? 'snug' : 'fluid',
    });
  });
  return {
    tables: out,
    pageScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    pageScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
}
"""


# Routes the feature map does not exercise as TABLE surfaces. The draft board
# and the roster deep-dive each own tables that no mapped feature opens, so
# without these probes 10 of the 25 tables never get measured at all.
# ---------------------------------------------------------------------------
# The three renderDraftBoard tables used to be unmeasurable: #draft fetches a
# real draft off Sleeper and answers 4xx out of season, so the 2026-09-17 audit
# left them unmeasured and the follow-up said "check during the next live
# draft". That is a wait, not a gate. The view's ONLY external dependency is two
# Sleeper endpoints, so stub them and the board renders in full.
#
# The fixture is a 12-team superflex snake with 15 rounds and 9 picks already in,
# which is what makes the lineup table honest: every starting slot filled, a
# bench row, and real player-name lengths rather than empty cells. `status` is
# 'paused' so setPoll never starts a live beat during a measurement.
DRAFT_FIXTURE_ID = "9900000000000000001"

_FIXTURE_JS = """
(() => {
  const ID = '%s';
  const ME = window.MY_USER_ID || 'me';
  const order = { [ME]: 3 };
  for (let s = 1; s <= 12; s++) if (s !== 3) order['u' + s] = s;
  const NAMES = [
    ['Jamarr','Chase','WR','CIN'], ['Christian','McCaffrey','RB','SF'],
    ['Amon-Ra','St. Brown','WR','DET'], ['Bijan','Robinson','RB','ATL'],
    ['Patrick','Mahomes','QB','KC'],   ['Brock','Bowers','TE','LV'],
    ['Puka','Nacua','WR','LAR'],       ['Jayden','Daniels','QB','WAS'],
    ['Devon','Achane','RB','MIA'],
  ];
  // draft_slot 3 is ours, so give every pick to slot 3 across the first rounds.
  const picks = NAMES.map((n, i) => ({
    player_id: String(9000 + i), pick_no: 3 + i * 12, round: i + 1, draft_slot: 3,
    picked_by: ME,
    metadata: { first_name: n[0], last_name: n[1], position: n[2], team: n[3] },
  }));
  const draft = {
    draft_id: ID, status: 'paused', type: 'snake', season: '2026', league_id: null,
    metadata: { name: 'Table width fixture', scoring_type: 'ppr' },
    draft_order: order,
    settings: { teams: 12, rounds: 15, reversal_round: 0,
      slots_qb: 1, slots_rb: 2, slots_wr: 3, slots_te: 1, slots_flex: 1,
      slots_super_flex: 1, slots_k: 1, slots_def: 1, slots_bn: 5 },
  };
  if (!window.__origFetch) window.__origFetch = window.fetch;
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body),
    { status: 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = (input, init) => {
    const u = String((input && input.url) || input || '');
    if (u.includes('/v1/draft/' + ID + '/picks')) return json(picks);
    if (u.endsWith('/v1/draft/' + ID)) return json(draft);
    return window.__origFetch(input, init);
  };
  // The drawer tab and board mode live in localStorage, so seed them rather
  // than clicking: a click depends on the tab bar's order, which moves.
  try {
    localStorage.setItem('ff-draft-view::' + ID,
      JSON.stringify({ tab: %s, mode: %s, drawer: true, drawerH: 420 }));
  } catch (e) {}
})()
"""


def fixture_steps(tab: str, mode: str) -> list:
    """Install the Sleeper stub, seed the view state, then open the board."""
    js = _FIXTURE_JS % (DRAFT_FIXTURE_ID, json.dumps(tab), json.dumps(mode))
    return [
        {"eval": js},
        {"eval": f"location.hash='#draft/{DRAFT_FIXTURE_ID}'"},
        {"sleepMs": 2600},
    ]


EXTRA_PROBES = [
    ("roster-deep", [{"eval": "location.hash='#roster/1341184676601028608/10'"},
                     {"sleepMs": 1800}]),
    ("draft-board", [{"eval": "location.hash='#draft/1341184676601028608'"},
                     {"sleepMs": 2200}]),
    ("projections-lg", [{"eval": "location.hash='#projections/1341184676601028608'"},
                        {"sleepMs": 1800}]),
    ("sos-pos", [{"eval": "location.hash='#sos/RB'"}, {"sleepMs": 1500}]),
    ("watch", [{"eval": "location.hash='#watch'"}, {"sleepMs": 1200}]),
    ("trade-deep", [{"eval": "location.hash='#trade/1341184676601028608'"},
                    {"sleepMs": 1800}]),
    # Stubbed-Sleeper draft board, the three tables a live draft used to gate.
    ("draft-avail", fixture_steps("avail", "board")),
    ("draft-team",  fixture_steps("team", "board")),
    ("draft-sos",   fixture_steps("avail", "sos")),
]


def walk_modal_tabs(page) -> list:
    """Click through any .pm-tab-bar and measure the tables each panel reveals.

    Returns the tables found in the NON-default panels only; the default one was
    already measured by the caller. A table whose panel is display:none has a
    zero-width box, so without this the audit reports "no tables here" on a card
    that has four.
    """
    try:
        n = page.evaluate("() => document.querySelectorAll('.pm-tab-bar [role=tab]').length")
    except Exception:
        return []
    if not n or n < 2:
        return []
    found = []
    for i in range(1, n):
        try:
            page.evaluate(
                "i => document.querySelectorAll('.pm-tab-bar [role=tab]')[i].click()", i
            )
            page.wait_for_timeout(450)
            found.extend(page.evaluate(MEASURE_JS)["tables"])
        except Exception:
            continue
    return found


def routes_from_feature_map() -> list[tuple[str, list]]:
    fm = json.loads(FEATURE_MAP.read_text(encoding="utf-8"))
    out = []
    for f in fm["features"]:
        out.append((f["id"], f.get("path") or []))
    return out + EXTRA_PROBES


def run(width: int, height: int = 1000, verbose: bool = True) -> dict:
    result: dict[str, dict] = {}
    page_scroll_offenders = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": width, "height": height})
        page = ctx.new_page()
        page.goto(ENTRY, wait_until="load")
        page.wait_for_timeout(2500)
        for fid, steps in routes_from_feature_map():
            try:
                page.evaluate("location.hash=''")
                page.wait_for_timeout(120)
                for st in steps:
                    # The feature map uses five step kinds. Handling only
                    # eval/click silently skipped every player-card table,
                    # because that modal opens through Cmd+K (press + fill).
                    if "eval" in st:
                        page.evaluate(st["eval"])
                        page.wait_for_timeout(450)
                    elif "click" in st:
                        page.click(st["click"], timeout=4000)
                        page.wait_for_timeout(450)
                    elif "press" in st:
                        page.keyboard.press(st["press"])
                        page.wait_for_timeout(300)
                    elif "fill" in st:
                        page.fill(st["fill"], st.get("value", ""), timeout=4000)
                        page.wait_for_timeout(300)
                    elif "sleepMs" in st:
                        page.wait_for_timeout(int(st["sleepMs"]))
                page.wait_for_timeout(500)
                data = page.evaluate(MEASURE_JS)
                # The player card now holds its reference blocks in three tab
                # panels, and a hidden panel measures zero wide, so every table
                # in it was silently dropped from this report the moment the
                # tabs shipped. Walk the tabs and merge what each one shows.
                # extend with the LIST, not with each dict in it: extending a
                # list with a dict appends its keys, which is how this first
                # crashed on t['cols'] with a string index.
                data["tables"].extend(walk_modal_tabs(page))
            except Exception as exc:  # a route that will not open is not a table bug
                if verbose:
                    print(f"  ! {fid}: {type(exc).__name__}: {str(exc)[:90]}")
                continue
            if data["pageScroll"]:
                page_scroll_offenders.append(
                    (fid, data["pageScrollWidth"], data["innerWidth"])
                )
            for t in data["tables"]:
                key = f"{t['cols']}c:{'|'.join(t['headers'])[:70]}"
                # Keep the widest sighting of a given table shape.
                prev = result.get(key)
                if prev is None or t["actual"] > prev["actual"]:
                    t = dict(t)
                    t["route"] = fid
                    result[key] = t
        browser.close()
    return {"tables": result, "pageScroll": page_scroll_offenders}


def stretch(t: dict) -> float:
    """How much wider than its content this table renders, per its own contract.

    A `fill-last` table is meant to fill the card; all its slack goes to the
    last column on purpose. Measuring the whole table would score it 1.68 and
    send the next reader off to "fix" a table that is already right, so score
    only the columns that are supposed to be content-tight.
    """
    if t.get("mode") == "fill-last" and len(t["naturalCols"]) > 1:
        nat = sum(t["naturalCols"][:-1])
        act = sum(t["actualCols"][:-1])
        return act / max(nat, 1)
    return t["actual"] / max(t["natural"], 1)


def report(width: int, data: dict) -> int:
    tables = data["tables"]
    print(f"\n{'='*104}\n  {width}px  ({len(tables)} distinct tables seen)\n{'='*104}")
    print(f"{'route':22s} {'cols':>4s} {'nat':>5s} {'act':>5s} {'x':>5s} {'mode':11s} {'flags':9s} headers")
    bad = 0
    for t in sorted(tables.values(), key=lambda t: -stretch(t)):
        x = stretch(t)
        flags = []
        if x >= SPRAWL:
            flags.append("SPRAWL")
        if t["clippedBy"]:
            flags.append("CLIPPED")
        if t["selfScroll"] and not t["clippedBy"]:
            flags.append("scrolls")
        if flags:
            bad += 1
        print(
            f"{t['route']:22s} {t['cols']:4d} {t['natural']:5d} {t['actual']:5d} "
            f"{x:5.2f} {t.get('mode','fluid'):11s} {','.join(flags) or '-':9s} "
            f"{' '.join(t['headers'])[:48]}"
        )
    if data["pageScroll"]:
        print(f"\n  PAGE SCROLLS HORIZONTALLY on {len(data['pageScroll'])} route(s):")
        for fid, sw, iw in data["pageScroll"]:
            print(f"    {fid:24s} {sw}px content in a {iw}px viewport")
    else:
        print("\n  no horizontal page scroll on any route")
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--width", type=int, action="append")
    a = ap.parse_args()
    widths = a.width or [1500, 390]
    blob = {}
    total_bad = 0
    for w in widths:
        data = run(w, verbose=not a.json)
        blob[str(w)] = {
            "tables": list(data["tables"].values()),
            "pageScroll": data["pageScroll"],
        }
        if not a.json:
            total_bad += report(w, data)
    if a.json:
        print(json.dumps(blob, indent=1))
    else:
        print(f"\n{total_bad} table/width combinations flagged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
