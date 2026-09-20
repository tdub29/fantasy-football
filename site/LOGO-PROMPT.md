# Logo prompt: cartoon goalposts, late-90s game-UI style

Palette and style laws come from [DESIGN.md](DESIGN.md) and
[BACKYARD-INVENTORY.md](BACKYARD-INVENTORY.md). The grammar of late-90s kids' sports-game UI is
generic convention and is what this prompt asks for. It never names or imitates the Backyard
Football or NFL marks, which is the boundary the inventory sets.

## The prompt

```
Flat vector logo mark: a set of American football goalposts, drawn as a chunky
late-1990s kids' sports video game sticker.

Shape: goalposts centered on a deep purple halftone end-zone slab. Single
upright post rising from a wide base plate, crossbar, two tall
uprights forming a squat Y. Proportions exaggerated and toy-like, uprights
slightly splayed outward, crossbar slightly bowed. Read it as a friendly
character, not as engineering.

Line: every shape carries a heavy uniform near-black outline, about 5% of the
mark's width. No thin strokes anywhere. Corners rounded, never sharp.

Fill: vertical two-stop gradients only, light at the top and darker at the
bottom, one gradient per shape. Posts are warm gold (#FCCA21 top to #D89700
bottom). Behind the posts sits a deep purple end-zone slab (#3A2575 top to a
darker shade at the bottom) carrying a visible halftone dot pattern, wide enough
to frame the uprights: this purple is the dominant background color of the mark,
not an accent. Base plate is periwinkle (#746FBB top to #504D95 bottom). A short
strip of kelly turf (#207029) sits under the base, cut off flat.

Depth: one hard drop shadow offset down and right with ZERO blur, in solid
near-black (#0E101F). A single thin white highlight inside the top edge of each
post, like molded plastic. No soft shading, no glow, no gloss, no bevel
gradients.

Composition: centered, symmetrical, slight low camera tilt so the crossbar sits
just above center. Generous flat margin. Transparent background.

Style: thick-outlined cartoon decal, saturated, high contrast, playful,
hand-drawn-toy energy. Reads clearly at 32 pixels. No text, no letters, no
numbers, no team logos, no players, no crowd, no photorealism, no 3D render,
no gradient mesh, no drop-shadow blur, no lens flare.
```

## Tweaks

- Too stiff: add "uprights lean apart at a slight angle, one a touch taller than the other".
- Too busy at favicon size: drop the turf strip and the white highlight, keep the purple slab.
- Purple still not showing: the pale lavender #E5E6FA reads as white at small sizes, which is
  why the first pass came back with no purple in it at all. Say "deep purple background slab"
  in the first sentence rather than trusting a hex late in the prompt.
- Wants the netting: add "a loose cartoon net hangs behind the crossbar in thick outlined
  diamond mesh", but check it at 32px before keeping it.
- For a wordmark beside it, the display face is Baloo 2 heavy, title case, never all caps.
