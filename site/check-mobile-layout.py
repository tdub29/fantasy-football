"""Fail if anything on a phone screen is clipped or runs off the page.

Two real bugs justify this file, and both looked fine in the CSS:

  * `display:none` on a grid ITEM removes it from the flow, it does not blank
    the column. Hiding the SOS comparison bar shifted every later cell one
    column left, so the "LEFT" caption landed in the zero-width column and
    printed through its neighbour as "LEPLAYED".
  * `justify-content: space-between` on a two-up stat grid pushed each value
    hard left and its caption hard right, so "2-0 REC | 188 PF" read as four
    unrelated items.

Neither shows up in a syntax check, a unit test, or a desktop screenshot. What
catches them is measuring rendered boxes at phone width, which is what this
does: any element whose content is wider than its own box is a clip, unless it
opted into ellipsis or its own scroller.

    python site/check-mobile-layout.py            # 390px baseline + 536px zoomed phone
    python site/check-mobile-layout.py 360 390    # several widths
"""
from __future__ import annotations

import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

SITE = Path(__file__).resolve().parent
# A free port, not a fixed one, so two checkouts (git worktrees) can run this
# at the same time without one silently testing the other's server.
with socket.socket() as _s:
    _s.bind(("127.0.0.1", 0))
    PORT = _s.getsockname()[1]
BASE = f"http://127.0.0.1:{PORT}/index.html"

# One page per layout that has its own phone rules. Adding a page here is the
# cheap way to put a new view under the same guard.
PAGES = {
    "dashboard": "#dashboard",
    "standings-dynasty": "#league/1314860638501076992",
    "standings-redraft": "#league/1389722402430136320",
    "standings-idp": "#league/1312276370583220224",
    "standings-espn": "#league/1532688686",
    "players-dynasty": "#league/1314860638501076992/players",
    "players-idp": "#league/1312276370583220224/players",
    "transactions": "#league/1314860638501076992/transactions",
    "trajectory": "#dashboard/trajectory",
    "rankings": "#rankings",
    "kickers": "#dashboard/market",
    "stats-lab-tools": "#stats/WR",
    "stats-lab-coverage": "#stats/Coverage",
    "stats-lab-routes": "#stats/Routes",
    "stats-lab-onoff": "#stats/OnOff",
    "stats-lab-game-splits": "#stats/OnOff/games",
    "games": "#games",
}


def _game_pages() -> dict:
    """One game page per state, picked from the data on disk so neither goes stale
    when the week turns: the week's last kickoff as a pregame, the newest final
    as a postgame."""
    d, out, gid = SITE / "data", {}, r'"(\d{4}_\d{2}_[A-Z]+_[A-Z]+)"'
    week = re.findall(r'"game_id":' + gid, (d / "weather.js").read_text(encoding="utf-8"))
    if week:
        out["game-pregame"] = f"#game/{week[-1]}/pregame"
    index = sorted(d.glob("games-[0-9][0-9][0-9][0-9].js"))
    done = re.findall(gid + r':\[', index[-1].read_text(encoding="utf-8")) if index else []
    if done:
        out["game-postgame"] = f"#game/{done[-1]}"
    return out


PAGES.update(_game_pages())

# The player card is a modal on <body>, outside #main, so it gets its own probe:
# (page it opens from, player, tab to show).
CARD = ("#league/1314860638501076992/players", "Jahmyr Gibbs", "Context")

# Deliberate truncation. A name column that ellipsises is doing its job; a
# caption that overruns its cell is not.
ALLOWED_CLIP = (
    "sos-team", "team-name", "name", "league-table-meta", "slot-bar-name",
    "mover-meta", "tab-label", "page-sub", "owner",
)

PROBE = """
([allowed, rootSel]) => {
  const out = [];
  const root = document.querySelector(rootSel);
  if (!root) return ['MISSING ROOT :: ' + rootSel];
  // Stops at the root: a modal is overflow-y:auto, which makes overflow-x auto
  // too, and counting it would excuse everything inside the card.
  const scrolls = e => {
    for (let n = e; n && n !== root && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  // A filter button is only usable if you can see all of it. The filter groups
  // scroll sideways with the scrollbar hidden, so a button past a clipping
  // ancestor's edge is cut off with nothing saying there is more.
  for (const b of root.querySelectorAll('.filters button')) {
    const r = b.getBoundingClientRect();
    if (!r.width) continue;
    let lo = 0, hi = window.innerWidth;
    for (let n = b.parentElement; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).overflowX === 'visible') continue;
      const c = n.getBoundingClientRect();
      lo = Math.max(lo, c.left + n.clientLeft);
      hi = Math.min(hi, c.left + n.clientLeft + n.clientWidth);
    }
    if (r.left < lo - 1 || r.right > hi + 1)
      out.push('CUT-OFF BUTTON :: ' + b.textContent.trim().slice(0, 24) + ' :: '
               + Math.round(r.left) + '-' + Math.round(r.right) + ' outside '
               + Math.round(lo) + '-' + Math.round(hi));
  }
  for (const e of root.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (e.scrollWidth <= e.clientWidth + 1) continue;
    if (!e.clientWidth) continue;              // zero-width cell: reported below
    // SVG text reports scrollWidth past clientWidth while drawing whole (route
    // tree labels at 536px+); that box model is not layout overflow.
    if (e instanceof SVGElement && e.tagName !== 'svg') continue;
    if (cs.textOverflow === 'ellipsis') continue;
    const cls = (e.className || '').toString();
    if (allowed.some(a => cls.includes(a))) continue;
    if (scrolls(e)) continue;                  // lives in its own scroller
    out.push(cls.split(' ').slice(0, 2).join('.') + ' :: '
             + e.textContent.trim().slice(0, 24) + ' :: '
             + e.scrollWidth + '>' + e.clientWidth);
  }
  // Overflow to the LEFT (a flex-end number wider than its column) never shows
  // in scrollWidth, so the row's own box is the edge a cell must stay inside.
  for (const row of root.querySelectorAll('.strength-row')) {
    const b = row.getBoundingClientRect();
    for (const e of row.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (!r.width || getComputedStyle(e).display === 'none') continue;
      if (r.left < b.left - 1 || r.right > b.right + 1) {
        out.push('ROW SPILL :: ' + e.textContent.trim().slice(0, 24) + ' :: '
                 + Math.round(r.left) + '-' + Math.round(r.right) + ' outside '
                 + Math.round(b.left) + '-' + Math.round(b.right));
        break;
      }
    }
  }
  // A grid child collapsed to zero width is the column-shift signature.
  for (const e of root.querySelectorAll('.sos-head > *, .strength-detail > *')) {
    if (getComputedStyle(e).display === 'none') continue;
    if (e.clientWidth === 0 && e.textContent.trim())
      out.push('ZERO-WIDTH CELL :: ' + e.textContent.trim().slice(0, 24));
  }
  return out.slice(0, 12);
}
"""


def serve() -> subprocess.Popen:
    p = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT),
                          "--bind", "127.0.0.1"], cwd=SITE,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            return p
        except Exception:
            time.sleep(0.2)
    p.kill()
    raise SystemExit(f"static server never came up on {PORT}")


def check(widths: list[int]) -> int:
    from playwright.sync_api import sync_playwright
    bad = 0
    srv = serve()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for w in widths:
                ctx = browser.new_context(viewport={"width": w, "height": 844},
                                          device_scale_factor=2,
                                          is_mobile=True, has_touch=True)
                page = ctx.new_page()

                def measure(label: str, root: str) -> int:
                    doc = page.evaluate("document.documentElement.scrollWidth")
                    clips = page.evaluate(PROBE, [list(ALLOWED_CLIP), root])
                    if doc > w + 1:
                        print(f"  [FAIL] {w}px {label}: page is {doc}px wide, "
                              f"{doc - w}px of sideways scroll")
                    for c in clips:
                        print(f"  [FAIL] {w}px {label}: {c}")
                    if doc <= w + 1 and not clips:
                        print(f"  [ok]   {w}px {label}")
                    return (doc > w + 1) + len(clips)

                for label, hsh in PAGES.items():
                    page.goto(BASE + hsh, wait_until="networkidle")
                    page.wait_for_timeout(1200)
                    # A phone collapses each filter card behind a toggle, and a
                    # collapsed card measures nothing. Open them all.
                    page.evaluate("document.querySelectorAll("
                                  "'#main .filters-toggle[aria-expanded=\"false\"]')"
                                  ".forEach(b => b.click())")
                    # Stats Lab keeps its power tools, its split card (shut on a
                    # phone) and its chart builder behind disclosures; measure them open.
                    page.evaluate("document.querySelectorAll("
                                  "'#main details:is(.stats-lab-tools, .stats-lab-splits, .stats-lab-charts):not([open]) > summary')"
                                  ".forEach(s => s.click())")
                    page.wait_for_timeout(200)
                    bad += measure(label, "#main")

                hsh, player, tab = CARD
                page.goto(BASE + hsh, wait_until="networkidle")
                page.wait_for_timeout(1200)
                page.evaluate("name => openPlayerDetail(name)", player)
                page.click(f".modal .pm-tab-bar button:has-text('{tab}')")
                page.wait_for_timeout(400)
                bad += measure(f"card {player} {tab}", ".modal")
                # The Production tab carries his field map (run gaps for an RB),
                # which loads after the card opens.
                page.click(".modal .pm-tab-bar button:has-text('Production')")
                page.wait_for_selector(".modal .loc-card .loc-gap", timeout=8000)
                bad += measure(f"card {player} Production map", ".modal")
                ctx.close()
            browser.close()
    finally:
        srv.kill()
    print(f"\n{'MOBILE LAYOUT OK' if not bad else f'{bad} mobile layout problem(s)'}")
    return 1 if bad else 0


def self_check() -> int:
    """The probe's own logic, without a browser: what counts as a real clip."""
    assert "textOverflow" in PROBE, "ellipsis must be exempt or every name fails"
    assert "ZERO-WIDTH CELL" in PROBE, "the grid column-shift signature is the point"
    assert "CUT-OFF BUTTON" in PROBE, "a filter button behind a hidden scrollbar is a clip"
    assert "ROW SPILL" in PROBE, "left-edge overflow is invisible to scrollWidth"
    assert "n !== root" in PROBE, "the modal's own scroller must not excuse the card"
    assert "sos-team" in ALLOWED_CLIP
    assert "sos-head" not in " ".join(ALLOWED_CLIP), "captions must never be exempt"
    print("check-mobile-layout self-check ok")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--self-check" in args:
        sys.exit(self_check())
    # 536 is a 402px iPhone at 75% Safari page zoom: past the 480 phone query,
    # inside the tablet one, where the standings score once spilled off-screen.
    sys.exit(check([int(a) for a in args] or [390, 536]))
