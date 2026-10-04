# Field background and type critique, against the Eagles Eric pixel video (2026-10-04)

Compare visually: open `pixel-field-and-type-specimen.html` beside this note. Reference frames are in
`eagles-eric-frames/` (`t_4`, `even_15`, `crop_texture_117`), and the full video study is in
`eagles-eric-design-study-2026-10-04.md`.

## Verdict

The field is the best place to bring in the pixel art, and it costs the least. Pixel art means hard
edges, a fixed grid, a small palette, and dithering in place of blends. Today the field does the
opposite on all four: smooth gradient, chalk spaced in percent, soft numerals in Arial Black. The
video's field (`even_15`) is hard-edged turf, crisp chalk, square hash ticks, mow stripes and a purple
end zone. Our palette already holds every one of those colors.

## Findings, ranked

1. **P1. The chalk spacing scales with the viewport.** The chalk is `repeating-linear-gradient(90deg, ... transparent 4px 5%)`, so a
   390px phone gets a line about every 19px. Behind every plate on the phone, that is the one
   screen Trevor uses most, and it reads as pinstripe noise (specimen A on mobile). Fix: a fixed px grid of
   120px (5 yards at 24px a yard), which is the grid the sideline SVG already uses.
2. **P1. The numerals sit behind the page header.** The top numeral row is drawn at y 24 to 76,
   exactly where the eyebrow, the title pill and the subtitle sit. On the dashboard, "20" and "30" peek
   out around the Dashboard pill. Fix: draw numerals on the bottom sideline only, or move the
   top row below the header (y 160 or lower).
3. **P2. Nothing on the field is pixel.** Fix: use hard mow stripes on the same 120px grid, a 4px checker
   dither in place of the smooth gradient, and numerals as 5x7 bitmap rects inside the existing SVG (specimen
   B). Rects need no web font inside the data URI, and `check-field-tile.py` can keep asserting their
   geometry. If DESIGN.md's "nothing is flat" should survive, step the fall-off in four hard bands
   (specimen C), the way a 16-bit palette did it.
4. **P2. The logo watermark shows up as a smudge.** At 9% opacity it only shows in the gaps between
   cards, as a muddy blob (dashboard, between My Leagues and the heatmap). Drop it, or pixelate a 64px copy
   (`image-rendering: pixelated`) and put it in the end zone.
5. **P3. `--endzone` is a token, but no field draws it.** The video and the palette share the
   purple end zone. Put it at the right edge of the field (specimen D).
6. **P3. Doc drift.** The typography section of `site/DESIGN.md` still says the system sans stack, but
   the CSS ships Baloo 2 (display) and Nunito (body). Fix the doc when the type decision lands.

## Do not take from the video

- **CRT shadow mask or scanlines over the whole page.** They blur table text and soften the crisp plate edges
  that the whole system depends on. At most, use them inside a recessed screen, such as the LED panel.
- **The navy starfield ground.** The ground is turf. A navy "film room" well for one chart is fine;
  a navy page is a different product.
- **All-caps pixel body text and the cartoon runner.** They break the 65 to 75ch rule and the
  no-mascot rule in DESIGN.md.

## Type

- **Keep Baloo 2 for display.** It carries the title pill, and Trevor likes it.
- **Add exactly one pixel face, and use it only for scoreboard roles:** big stat callouts, verdict numbers,
  the LED freshness panel, rank badges and yard numerals. Never body copy or dense table cells.
  Recommendation: **Jersey 10**. It is the most football face in the set, reads at callout size, and held
  up in the LED panel in the render. The runner-up is **Silkscreen**, which is crisper at micro sizes and
  only worth choosing if pixel micro-labels become a goal. Keep it to one pixel face: Baloo 2,
  Nunito and one pixel face is already the three-family ceiling.
- **Body: Nunito is fine.** Only switch if dense-table legibility becomes a complaint. If it does, use
  **Atkinson Hyperlegible Next**, which has distinct 1/l/I and 0/O in number-heavy rows. Rubik reads
  slightly more game-UI and Lexend more neutral; neither fixes a real problem today.

## Other openings, after the field

1. **Pixel nav icons.** The sidebar mixes unicode glyphs (◆ ! ◉ ⇄ ▦ ◐ Σ ▣ # ◇ ▶ ?) from
   different fonts at different weights. A 16px pixel icon set would carry the look onto every page,
   and it is the second-cheapest win.
2. **Stepped motion.** Use `steps()` timing for meter fills and count-ups. It matches DESIGN.md's 80ms
   linear snap and the video's block builds. Reduced motion stays instant.
3. **Range bars on odds**, as in the video's "How sure are we?" frame (`even_08`). Details are in the
   video study, recommendation 3.

Nothing here is applied to the site yet. The specimen is a comparison page, not product code.
