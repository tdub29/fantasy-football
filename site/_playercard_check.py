"""Open the player card for real and assert every part of it is there.

The card regressed to 3 of 11 blocks once already, because a range edit nested
the child list inside projectionBlock and `node --check` was happy about it. So
this drives a real browser, opens the card through Cmd+K the way a user does,
and counts what actually painted for an OWNED player and an UNOWNED one.

    python _playercard_check.py
    python _playercard_check.py --players "Jahmyr Gibbs,Marvin Mims"
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = pathlib.Path(__file__).resolve().parent
ENTRY = (HERE / "index.html").as_uri()

PROBE = r"""
() => {
  const m = document.querySelector('.modal');
  if (!m) return { open: false };
  const band = m.querySelector('.num-band');
  const cells = band ? [...band.querySelectorAll('.num-cell')] : [];
  const bar = m.querySelector('.pm-tab-bar');
  const tabs = bar ? [...bar.querySelectorAll('[role=tab]')] : [];
  const panels = [...m.querySelectorAll('.pm-panel')];
  return {
    open: true,
    title: (m.querySelector('h2')?.textContent || '').trim(),
    band: !!band,
    bandScrolls: band ? band.scrollWidth > band.clientWidth + 1 : null,
    bandOverflowsPage: band ? band.scrollWidth > window.innerWidth : null,
    cells: cells.map(c => ({
      label: (c.querySelector('.num-cell-label')?.textContent || '').trim(),
      value: (c.querySelector('.num-cell-value')?.textContent
              || c.querySelector('.num-cell-chiprow')?.textContent || '').trim().slice(0, 18),
    })),
    tabs: tabs.map(t => ({
      label: t.textContent.trim(),
      selected: t.getAttribute('aria-selected'),
      h: Math.round(t.getBoundingClientRect().height),
    })),
    panelCount: panels.length,
    visiblePanels: panels.filter(p => !p.hidden).length,
    // Every direct child of the modal that actually painted. This is the count
    // that caught the 11-to-3 regression.
    blocks: [...m.children].filter(el => el.getClientRects().length).length,
    ktcChart: !!m.querySelector('.ktcv-block'),
    ktcRanges: [...m.querySelectorAll('.ktcv-tabs [role=tab]')].map(b => b.textContent.trim()),
    ktcCallout: (m.querySelector('.ktcv-callout')?.textContent || '').trim().slice(0, 50),
    verdict: !!m.querySelector('.verdict-banner'),
    thisWeek: !!m.querySelector('.tw-block, .this-week, [aria-label*="his week"]'),
    // Specifically the exposure table, not any data table. Matching
    // `table.data` also matched the schedule strip and the history table, so
    // this read true for a player nobody rosters.
    ownedTable: [...m.querySelectorAll('.card-title')]
      .some(e => /owned in your leagues/i.test(e.textContent || '')),
    // The rows the band replaced must be gone, or the numbers print twice.
    staleChipRow: !!m.querySelector('.price-line'),
    staleAge: [...m.querySelectorAll('.muted')].some(e => /^age \d/.test(e.textContent.trim())),
    pageScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    // The band's whole justification is that these figures stop being scattered
    // and stop being repeated. The band is pinned above the tab bar, so it is on
    // screen at the same time as whatever panel is open: a figure printed in both
    // places is visibly doubled, which is how the VOR row in projectionBlock was
    // caught. Count occurrences of the band's own values in the card text.
    dupes: (() => {
      const txt = m.innerText || '';
      const out = {};
      for (const c of cells) {
        const v = (c.querySelector('.num-cell-value')?.textContent || '').trim();
        if (!v || v === '·') continue;
        const lbl = (c.querySelector('.num-cell-label')?.textContent || '').trim();
        const hits = txt.split(v).length - 1;
        if (hits > 1) out[lbl + '=' + v] = hits;
      }
      return out;
    })(),
  };
}
"""


def open_card(page, name: str) -> dict:
    """Open via Cmd+K, and fall back to openPlayerDetail for anyone it lacks.

    Cmd+K indexes ranked players plus players rostered in one of the leagues,
    and nothing else, on purpose ("limit to those rostered in any league for
    relevance"). So a real NFL player like Cooper Rush is genuinely absent from
    it, which is not a bug but does make him untestable through that door. The
    fallback is the same function every table row click calls, so it exercises
    the identical code path.
    """
    page.evaluate("document.querySelector('.modal-backdrop')?.remove()")
    page.evaluate("document.querySelector('.cmdk-backdrop')?.remove()")
    page.evaluate("location.hash='#rankings'")
    page.wait_for_timeout(2200)
    page.keyboard.press("Control+k")
    page.wait_for_timeout(450)
    page.fill(".cmdk-input-wrap input", name)
    page.wait_for_timeout(900)
    page.keyboard.press("Enter")
    page.wait_for_timeout(2000)
    d = page.evaluate(PROBE)
    if d.get("open"):
        return d
    page.evaluate("document.querySelector('.cmdk-backdrop')?.remove()")
    opened = page.evaluate(
        """nm => {
          const hit = Object.entries(window.PLAYERS || {})
            .find(([, sp]) => String(sp.name || '').toLowerCase() === nm.toLowerCase());
          if (!hit || typeof window.openPlayerDetail !== 'function') return false;
          window.openPlayerDetail(hit[1].name, hit[0]);
          return true;
        }""", name)
    if not opened:
        return {"open": False, "notInData": True}
    page.wait_for_timeout(2000)
    d = page.evaluate(PROBE)
    d["viaFallback"] = True
    return d


def check(page, name: str, width: int, errs: list) -> int:
    d = open_card(page, name)
    fails = []
    print(f"\n--- {name} @ {width}px ---")
    if not d.get("open"):
        # This branch used to return without recording anything, so a card that
        # never opened printed one line and the run still said PASS.
        why = "not present in window.PLAYERS" if d.get("notInData") else "openPlayerDetail did not paint a modal"
        print(f"  MODAL DID NOT OPEN ({why})")
        errs.append(f"{name}@{width}: modal did not open, {why}")
        return 1
    print(f"  title={d['title'][:34]!r}  painted children={d['blocks']}"
          + ("  [opened via openPlayerDetail]" if d.get("viaFallback") else ""))
    print(f"  band={d['band']} cells={len(d['cells'])} scrolls={d['bandScrolls']}")
    for c in d["cells"]:
        print(f"     {c['label']:12s} {c['value']}")
    print(f"  tabs={[t['label'] for t in d['tabs']]} heights={[t['h'] for t in d['tabs']]}")
    print(f"  panels={d['panelCount']} visible={d['visiblePanels']}")
    print(f"  ktcChart={d['ktcChart']} ranges={d['ktcRanges']} callout={d['ktcCallout']!r}")
    print(f"  verdict={d['verdict']} ownedTable={d['ownedTable']} pageScroll={d['pageScroll']}")

    labels = [c["label"] for c in d["cells"]]
    if not d["band"]:
        fails.append("no number band")
    elif not labels:
        fails.append("band rendered with no cells")
    elif "Value" in labels:
        # Six is the ceiling, not a floor, and which cells are REACHABLE depends
        # on the player:
        #   Value / Tier   need a ranking, so an unranked player has neither
        #   Value rank + Proj pts come from mispricingIndex(), which is built
        #     from OFFENSE_PROJ.offense ONLY, so an IDP player has neither
        #   VOR needs a projection record in either unit
        # Asserting a flat six flagged Tykee Smith (a DB) and asserting a flat
        # minimum of four flagged Cooper Rush (unranked, one cell). Both were
        # correct output. So assert what cannot legitimately vary instead.
        for need in ('Tier', 'Age'):
            if need not in labels:
                fails.append(f"ranked player has no {need} cell")
        # These two share one source, so exactly one of them is a real defect.
        if ('Value rank' in labels) != ('Proj pts' in labels):
            fails.append("Value rank and Proj pts disagree; they come from the "
                         "same mispricingIndex row, so one without the other is a bug")
    if d["panelCount"] and d["panelCount"] < 2 and len(d["tabs"]):
        fails.append("tab bar rendered for a single panel")
    if d["staleChipRow"]:
        fails.append("old .price-line chip row still rendering, numbers print twice")
    if d["staleAge"]:
        fails.append("old 'age N' span still rendering, age prints twice")
    if d["pageScroll"]:
        fails.append("PAGE scrolls horizontally")
    # Only NUMERIC values count. A positional rank recurs on purpose: "RB1"
    # appears 6x on Gibbs' card, in the band twice, in the verdict sentence
    # ("RB1 value vs RB1 projection") and in two expert badges, and every one of
    # those is meaningful. Flagging it called correct copy a bug. A bare figure
    # like 299 or +138 has no such excuse, which is the case that caught the
    # duplicated VOR row.
    for k, n in (d.get("dupes") or {}).items():
        val = k.split("=", 1)[1]
        if re.fullmatch(r"[+−-]?\d[\d.,]*", val) and len(val.lstrip("+-−")) >= 3:
            fails.append(f"band value {k} appears {n}x in the card, printed twice")
    if d["bandOverflowsPage"] and not d["bandScrolls"]:
        fails.append("band wider than viewport but not scrollable")
    if d["panelCount"] and d["visiblePanels"] != 1:
        fails.append(f"{d['visiblePanels']} panels visible, expected exactly 1")
    if len(d["tabs"]) > 3:
        fails.append(f"{len(d['tabs'])} tabs, the judge capped it at 3")
    for t in d["tabs"]:
        if t["h"] < 40:
            fails.append(f"tab {t['label']!r} is {t['h']}px tall, under the 44px target")
    if d["ktcChart"] and d["ktcRanges"] != ["3 mo", "1 yr", "All"]:
        fails.append(f"range tabs are {d['ktcRanges']}")

    # Tab switching has to actually work, and every panel has to have content.
    if len(d["tabs"]) > 1:
        for i in range(len(d["tabs"])):
            page.evaluate(
                "i => document.querySelectorAll('.pm-tab-bar [role=tab]')[i].click()", i
            )
            page.wait_for_timeout(500)
            r = page.evaluate(
                """() => {
                  const ps=[...document.querySelectorAll('.pm-panel')];
                  const vis=ps.filter(p=>!p.hidden);
                  return { vis: vis.length,
                           painted: vis[0] ? [...vis[0].children].filter(e=>e.getClientRects().length).length : 0,
                           pageScroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
                }"""
            )
            lbl = d["tabs"][i]["label"]
            print(f"     tab {lbl:11s} -> visible={r['vis']} painted={r['painted']} pageScroll={r['pageScroll']}")
            if r["vis"] != 1:
                fails.append(f"tab {lbl}: {r['vis']} panels visible")
            if r["painted"] < 1:
                fails.append(f"tab {lbl}: panel painted nothing")
            if r["pageScroll"]:
                fails.append(f"tab {lbl}: page scrolls horizontally")

    if fails:
        for f in fails:
            print(f"  FAIL  {f}")
            errs.append(f"{name}@{width}: {f}")
    else:
        print("  ok")
    return len(fails)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", default="Jahmyr Gibbs,Marvin Mims")
    a = ap.parse_args()
    names = [x.strip() for x in a.players.split(",") if x.strip()]
    errs: list = []
    console: list = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width in (1500, 390):
            ctx = b.new_context(viewport={"width": width, "height": 1000})
            page = ctx.new_page()
            page.on("console", lambda m: console.append(m.text[:110]) if m.type == "error" else None)
            page.on("pageerror", lambda e: console.append("PAGEERROR " + str(e)[:110]))
            page.goto(ENTRY, wait_until="load")
            page.wait_for_timeout(2800)
            for n in names:
                check(page, n, width, errs)
            ctx.close()
        b.close()
    real = [c for c in console if "gstatic" not in c and "favicon" not in c]
    if real:
        print("\nconsole errors:")
        for c in dict.fromkeys(real):
            print("  " + c)
        errs += real
    print(f"\n{'FAILED: ' + str(len(errs)) + ' problem(s)' if errs else 'PASS, card is whole at both widths'}")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
