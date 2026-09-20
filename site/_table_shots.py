"""Screenshot the tables the layout audit touched, at desktop and phone width.

Numbers say the sprawl is gone; only a picture says the result reads well. Run
this after any change to `table.data` sizing and look at the output, because a
table pinned to its content width can look stranded in a wide card and the
stretch number cannot tell you that.

    python _table_shots.py            # writes _shots/tables/
    python _table_shots.py --tag before
"""

from __future__ import annotations

import argparse
import pathlib
import sys

from playwright.sync_api import sync_playwright

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import _table_audit as _ta

HERE = pathlib.Path(__file__).resolve().parent
ENTRY = (HERE / "index.html").as_uri()
OUT = HERE / "_shots" / "tables"

# Each entry is the surface a snug table lives on, with the card to frame so the
# shot shows the table INSIDE its plate. That framing is the point: a table at
# its content width in a full-bleed card is exactly the thing to eyeball.
SURFACES = [
    ("framework", [{"eval": "location.hash='#strategy'"}], None),
    ("about", [{"eval": "location.hash='#about'"}], None),
    ("leagues", [{"eval": "location.hash='#leagues'"}], None),
    ("cornerstones", [{"eval": "location.hash='#dashboard/cornerstones'"}], None),
    ("trajectory", [{"eval": "location.hash='#dashboard/trajectory'"}], None),
    ("projections", [{"eval": "location.hash='#projections/1341184676601028608'"}], None),
    ("trade-calc", [{"eval": "location.hash='#trade/1341184676601028608'"}], None),
    ("roster-strategy",
     [{"eval": "location.hash='#roster/1341184676601028608/10/strategy'"}], None),
    # The draft board's own tables. Reuses the stubbed-Sleeper fixture from the
    # audit so this does not need a live draft either; see _table_audit.py.
    ("draft-team", _ta.fixture_steps("team", "board"), None),
    ("player-card", [
        {"eval": "location.hash='#rankings'"}, {"sleepMs": 2500},
        {"press": "Control+k"}, {"fill": ".cmdk-input-wrap input", "value": "Marvin Mims"},
        {"sleepMs": 900}, {"press": "Enter"}, {"sleepMs": 2000},
    ], None),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="after")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h in ((1500, 1100), (390, 900)):
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            page.goto(ENTRY, wait_until="load")
            page.wait_for_timeout(2800)
            for name, steps, sel in SURFACES:
                try:
                    page.evaluate("location.hash=''")
                    page.wait_for_timeout(200)
                    for st in steps:
                        if "eval" in st:
                            page.evaluate(st["eval"])
                            page.wait_for_timeout(450)
                        elif "press" in st:
                            page.keyboard.press(st["press"])
                            page.wait_for_timeout(300)
                        elif "fill" in st:
                            page.fill(st["fill"], st.get("value", ""), timeout=4000)
                            page.wait_for_timeout(300)
                        elif "sleepMs" in st:
                            page.wait_for_timeout(int(st["sleepMs"]))
                    page.wait_for_timeout(600)
                    out = OUT / f"{name}-{w}-{a.tag}.png"
                    page.screenshot(path=str(out), full_page=True)
                    print(f"  {out.name}")
                except Exception as exc:
                    print(f"  ! {name}@{w}: {type(exc).__name__}: {str(exc)[:70]}")
            ctx.close()
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
