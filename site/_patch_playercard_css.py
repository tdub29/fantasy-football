"""Append the number band / value chart / tab panel styles to styles.css."""
import io
import sys

P = 'css/styles.css'
MARK = 'Player card: number band, value chart, tab panels'

CSS = """

/* ==========================================================================
   Player card: number band, value chart, tab panels
   ==========================================================================
   The band replaced two stacked rows of loose chips. Those rows wrapped, so on
   a phone the same six figures landed in a different order and on a different
   number of lines for every player, and "is he worth more than he scores" was
   never a comparison you could make without hunting. One scroll rail fixes the
   order: the cells are always these six, always left to right, and the rail
   scrolls instead of the page.
   ========================================================================== */
.num-band {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  margin: 0 0 14px;
  padding-bottom: 6px;
  /* The rail is the scroll container, so the PAGE never gains a horizontal
     scrollbar from it. That is the 390px non-negotiable. */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}
.num-band::-webkit-scrollbar { height: 4px; }
.num-band::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.num-cell {
  flex: 0 0 auto;
  min-width: 96px;
  padding: 8px 12px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-sm);
  background: var(--grad-plate, var(--bg-1));
  box-shadow: var(--bevel);
  /* A cell is a plate like every other surface here, so it gets the ink border
     and the hard bevel rather than a flat tint. */
}
.num-cell-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-2);
  white-space: nowrap;
}
.num-cell-value {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.15;
  color: var(--fg-0);
  letter-spacing: -0.015em;
  white-space: nowrap;
}
.num-cell-sub {
  font-size: 0.66rem;
  color: var(--fg-3);
  white-space: nowrap;
}
/* The Tier cell holds two chips instead of a numeral, so it opts out of the
   numeric line-height and lets its chips set their own. */
.num-cell-chips .num-cell-chiprow { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.num-cell-chips .num-cell-chiprow.num-cell-sub { margin-top: 3px; }

/* ---- Dynasty value chart (opens the Value tab) ---- */
.ktcv-block { margin-bottom: 14px; }
.ktcv-tabs { margin: 0; flex: 0 0 auto; }
.ktcv-callout {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 2px 0 8px;
}
.ktcv-callout strong { font-size: 1.05rem; font-weight: 800; }
.ktcv-callout.up   strong { color: var(--green); }
.ktcv-callout.down strong { color: var(--red); }
.ktcv-callout.flat strong { color: var(--fg-2); }

/* ---- The three reference tabs ---- */
.pm-tab-bar {
  /* The view-level .tab-bar pulls itself up under a page title with a negative
     margin. Inside the modal there is no title above it, so that margin drags
     the bar into the block before it. */
  margin: 4px 0 14px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-0);
}
.pm-tab-bar .tab { padding: 12px 14px; }
/* A panel is a plain flow container. It must not become a scroll or transform
   context: the sticky thead on the tables inside it pins to the modal's own
   scroller, and a new containing block here would strand it mid-panel. */
.pm-panel > :last-child { margin-bottom: 0; }

@media (max-width: 720px) {
  .num-cell { min-width: 88px; padding: 7px 10px; }
  .num-cell-value { font-size: 1.1rem; }
  .pm-tab-bar .tab { padding: 12px 11px; font-size: 0.72rem; }
}
"""


def main() -> int:
    s = io.open(P, encoding='utf-8').read()
    if MARK in s:
        print('already present, nothing to do')
        return 0
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s + CSS)
    print('appended %d chars of CSS' % len(CSS))
    return 0


if __name__ == '__main__':
    sys.exit(main())
