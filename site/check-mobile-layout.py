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

    python site/check-mobile-layout.py            # 390px, the iPhone baseline
    python site/check-mobile-layout.py 360 390    # several widths
"""
from __future__ import annotations

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
    "rankings": "#rankings",
    "kickers": "#dashboard/market",
}

# Deliberate truncation. A name column that ellipsises is doing its job; a
# caption that overruns its cell is not.
ALLOWED_CLIP = (
    "sos-team", "team-name", "name", "league-table-meta", "slot-bar-name",
    "mover-meta", "tab-label", "page-sub", "owner",
)

PROBE = """
(allowed) => {
  const out = [];
  const scrolls = e => {
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  for (const e of document.querySelectorAll('#main *')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (e.scrollWidth <= e.clientWidth + 1) continue;
    if (!e.clientWidth) continue;              // zero-width cell: reported below
    if (cs.textOverflow === 'ellipsis') continue;
    const cls = (e.className || '').toString();
    if (allowed.some(a => cls.includes(a))) continue;
    if (scrolls(e)) continue;                  // lives in its own scroller
    out.push(cls.split(' ').slice(0, 2).join('.') + ' :: '
             + e.textContent.trim().slice(0, 24) + ' :: '
             + e.scrollWidth + '>' + e.clientWidth);
  }
  // A grid child collapsed to zero width is the column-shift signature.
  for (const e of document.querySelectorAll('.sos-head > *, .strength-detail > *')) {
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
                for label, hsh in PAGES.items():
                    page.goto(BASE + hsh, wait_until="networkidle")
                    page.wait_for_timeout(1200)
                    doc = page.evaluate("document.documentElement.scrollWidth")
                    clips = page.evaluate(PROBE, list(ALLOWED_CLIP))
                    if doc > w + 1:
                        print(f"  [FAIL] {w}px {label}: page is {doc}px wide, "
                              f"{doc - w}px of sideways scroll")
                        bad += 1
                    for c in clips:
                        print(f"  [FAIL] {w}px {label}: {c}")
                    bad += len(clips)
                    if doc <= w + 1 and not clips:
                        print(f"  [ok]   {w}px {label}")
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
    assert "sos-team" in ALLOWED_CLIP
    assert "sos-head" not in " ".join(ALLOWED_CLIP), "captions must never be exempt"
    print("check-mobile-layout self-check ok")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--self-check" in args:
        sys.exit(self_check())
    sys.exit(check([int(a) for a in args] or [390]))
