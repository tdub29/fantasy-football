---
name: void-transit-editorial
description: "Streetwear/editorial-tech aesthetic — warm-paper + near-black ink on a 1px hairline spec-sheet grid, tri-accent (signal red / electric blue / acid), Inter Tight tight-tracked display over DM Mono technical labels, giant outlined numerals as texture, a fixed left rail, and scroll-driven signature interactions (pinned smootherstep hero, horizontal scroll-jacked lookbook, pointer-parallax lerp follower, shared IntersectionObserver entrance engine). Use when the ask is a bold fashion/streetwear/product drop page, a lookbook, an editorial-tech landing page, a scroll-driven campaign site, or anything described as 'Void 03', 'transit shell', 'techwear', 'award-level scroll animation', or 'spec-sheet / blueprint' styling. Ships a worked exemplar (references/void-reference.html) and a reusable AI-image method (references/image-prompts.md)."
---

# Void Transit Editorial

A single, committed aesthetic: streetwear drop page crossed with an engineering spec-sheet. Warm paper, near-black ink, hairline grid, three loud accents used sparingly, tight display type over mono labels, and heavy scroll-driven motion that still respects `prefers-reduced-motion`. The worked build is `references/void-reference.html` — read it when you need the exact resting values; this file teaches the reusable recipe.

## Use When
- A fashion / streetwear / techwear drop page, product launch, or lookbook.
- An editorial-tech landing page that must feel engineered, not lifestyle-soft.
- A scroll-driven campaign site ("award-level scroll animation", Awwwards energy).
- Anything the user calls "Void 03", "transit shell", "spec-sheet", or "blueprint" styling.

Not for: quiet corporate SaaS, dense dashboards, or anything needing calm restraint — this look is loud on purpose.

## 1. Color system

Five tokens plus one shared easing curve. Accents punctuate; they never fill.

```css
:root{
  --ink:#101010;    /* near-black — text, borders, ghost surfaces */
  --paper:#f3efe5;  /* warm paper — the default ground */
  --red:#f33a2f;    /* signal red — primary accent / CTAs / progress */
  --blue:#123fdd;   /* electric blue — secondary accent / hover flip */
  --acid:#d9ff00;   /* acid — rare highlight + ::selection */
  --muted:#d7d2c6;  /* warm neutral for quiet fields */
  --ease:cubic-bezier(.16,1,.3,1);  /* THE shared curve — every transition uses it */
  --rail:86px;      /* left side-rail width, everything offsets by it */
}
```

Rules:
- One easing curve everywhere (`var(--ease)`). Consistency of motion is the tell.
- `::selection{background:var(--acid);color:var(--ink)}` — the acid rarely appears elsewhere; that's what keeps it loud.
- Whole slides may flood a single accent (`.slide-two{background:var(--red)}`) but body copy stays ink-on-paper.
- Hover flips ink↔paper or red→blue; don't introduce new hues.

## 2. Type system

Two families, opposite jobs.

- **Display — Inter Tight**, weights 700–900, tightly tracked and low line-height. Tracking runs `-.06em` to `-.15em`, `line-height` `.64`–`.86`. The tighter the value the more it visually crops glyphs, so pair every tight title with cap-height padding (see §7).
- **Technical labels — DM Mono**, `text-transform:uppercase`, letter-spacing `.06em`–`.18em`, small (8–11px). Everything utility — counters, specs, nav, footer — is mono.

```css
h1{font-family:'Inter Tight';font-weight:800;line-height:.72;letter-spacing:-.09em}
.eyebrow{font:500 10px/1.55 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em}
```

**Giant outlined / transparent numerals as background texture.** Oversized drop/section numbers sit behind content as structure, drawn with `webkit-text-stroke`:

```css
.launch-visual:before{content:'03';font-size:40vw;font-weight:900;letter-spacing:-.13em;
  color:var(--paper);mix-blend-mode:screen}                 /* filled ghost numeral */
h1 span{color:transparent;-webkit-text-stroke:1.5px var(--ink)}  /* outlined word/number */
.front-type{color:transparent;-webkit-text-stroke:2px currentColor;mix-blend-mode:difference}
```

Use `clamp()` per breakpoint for these, never raw `vw` alone on semantic titles.

## 3. Layout chrome — the spec-sheet grid

- **Fixed left side-rail, `--rail` = 86px:** brand mark (top), a rotated vertical label (`writing-mode:vertical-rl;transform:rotate(180deg)`), and a circular counter (bottom). `main{margin-left:var(--rail)}`; the top bar and all fixed overlays start at `left:var(--rail)`.
- **Fixed top bar,** 65px, `grid-template-columns:1fr auto 1fr`, `backdrop-filter:blur(14px)` over a translucent paper, mono uppercase links.
- **1px hairline borders throughout** (`border:1px solid var(--ink)` / `border-right` / `border-top`) turn every panel into a spec-sheet cell. Sections are separated by single ink rules, not shadows or gaps.
- `body{overflow-x:clip}` — **`clip`, never `hidden`**. Sticky pins break if an ancestor is `overflow:hidden`; `clip` still contains horizontal bleed.

## 4. Signature interactions (real technique from the exemplar)

All four run off one `requestAnimationFrame` loop gated by a `ticking` flag and a passive scroll listener; all four are disabled when `reduceMotion` is true.

```js
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n,min=0,max=1)=>Math.min(max,Math.max(min,n));
addEventListener('scroll',()=>{ if(!ticking){requestAnimationFrame(update);ticking=true;} },{passive:true});
```

### 4.1 Pinned smootherstep hero
Outer section is taller than the viewport (~170vh); inner panel is `position:sticky;top:65px`. Normalize scroll through the pin to `0..1`, run it through **smootherstep**, and derive three overlapping phases:

```js
const lr = launch.getBoundingClientRect();
const pinRange = Math.max(1, launch.offsetHeight - innerHeight);
const p = clamp(-lr.top / pinRange);                 // 0..1 progress through the pin
const ease = n => n*n*n*(n*(n*6-15)+10);             // smootherstep (Ken Perlin)
const intro   = ease(clamp(p / .3));                 // 0 → .3   : bg + title settle
const build   = ease(clamp((p - .12) / .64));        // .12 → .76: stamps/orbit/number track in
const release = ease(clamp((p - .7) / .3));          // .7 → 1   : layers ease off
```

Drive transforms and CSS custom props (`--hero-progress`, `--hero-num-x/y/scale`) from `intro/build/release`. **Critical:** ancestors of the sticky hero use `overflow:clip`, never `hidden`, or the pin dies.

### 4.2 Horizontal scroll-jacked lookbook (conveyor)
Tall outer + sticky full-screen inner + a flex track of full-screen cards translated on X from vertical progress. A progress meter and the active-card label read from the *same* normalized progress.

```css
.conveyor{height:440vh}                               /* outer = ~cards × screens */
.conveyor-sticky{position:sticky;top:65px;height:calc(100vh - 65px);overflow:hidden}
.track{position:absolute;height:100%;display:flex;width:max-content}
.slide{width:calc(100vw - var(--rail));flex:none}
```
```js
const cr = conveyor.getBoundingClientRect();
const cp = clamp(-cr.top / (cr.height - innerHeight));            // 0..1
const railPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail'));
const travel = Math.max(0, track.scrollWidth - (innerWidth - railPx));
track.style.transform = `translate3d(${-cp*travel}px,0,0)`;
meter.style.transform = `scaleX(${1 + cp*3})`;                    // meter base 25% → 100%
frameLabel.textContent = labels[Math.min(3, Math.floor(cp*4))];  // synced active label
slides.forEach((s,i)=>{ s._local = cp*3 - i; paintSlide(s, s._local); }); // per-card local progress
```
Each card layers, back-to-front: giant background display word, orbit ring w/ accent dots, transparent subject cutout, outlined foreground word, card title, caption, floating spec chip.

### 4.3 Pointer-parallax lerp follower
Never assign the pointer position directly — keep `current` and `target`, update only `target` on move, and ease `current` toward it each frame. One follower serves hero and every card.

```js
const followPointer = (t, draw) => {
  if (t._motionFrame) return;                          // one rAF chain per target
  const step = () => {
    t._px += (t._targetX - t._px) * .18;               // ease ~18% of remaining distance / frame
    t._py += (t._targetY - t._py) * .18;
    draw(t._pointerVelocity);
    const moving = Math.abs(t._targetX-t._px)+Math.abs(t._targetY-t._py) > .001;
    if (moving) t._motionFrame = requestAnimationFrame(step);
    else { t._px=t._targetX; t._py=t._targetY; t._motionFrame=0; draw(t._pointerVelocity); }
  };
  t._motionFrame = requestAnimationFrame(step);
};
stage.addEventListener('pointermove', e => {
  if (reduceMotion || e.pointerType === 'touch') return;         // disabled on touch + reduced motion
  const r = stage.getBoundingClientRect();
  t._targetX = ((e.clientX-r.left)/r.width  - .5) * 2;           // -1..1, only the TARGET moves
  t._targetY = ((e.clientY-r.top )/r.height - .5) * 2;
  followPointer(t, v => paintSlide(s, s._local, v));
});
// pointerleave: set target to 0,0 and let the SAME follower ease home — no jump on re-entry
```
Per-depth speed: background type moves least, subject more, foreground type most, orbit ring independent. Keep semantic text inside safe zones at max offset so parallax never pushes it off-screen or under the rail.

### 4.4 Shared section-entrance engine
One timing engine, several gestures. A spec array tags each element with a variant class + staggered `--enter-delay`; an IntersectionObserver activates them; a passed-element fallback catches hash jumps / fast scroll so nothing is ever left invisible.

```js
const entranceSpecs = [ // [selector, variant, baseDelayMs, perElementStepMs]
  ['.lab-header>h2','enter-left',260,0], ['.lab-module','enter-up',120,110], /* … */ ];
entranceSpecs.forEach(([sel,type,base,step]) =>
  document.querySelectorAll(sel).forEach((el,i)=>{ el.classList.add('enter',type);
    el.style.setProperty('--enter-delay', `${base + i*step}ms`); }));

const activatePassedEntrances = () =>            // fallback: hash jump / fast scroll safety net
  document.querySelectorAll('.enter:not(.active)').forEach(el=>{
    if (el.getBoundingClientRect().top < innerHeight*.92) el.classList.add('active'); });
new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('active'); }),
  {threshold:.08, rootMargin:'0px 0px -4% 0px'}).observe(/* each .enter/.reveal */);
```
```css
.enter{opacity:0;transition:opacity .85s var(--ease) var(--enter-delay),
  transform 1s var(--ease) var(--enter-delay),clip-path 1.1s var(--ease) var(--enter-delay)}
.enter-left{transform:translate3d(-90px,35px,0) rotate(-5deg);filter:blur(5px)}
.enter-right{transform:translate3d(100px,-25px,0) rotate(5deg);filter:blur(5px)}
.enter-up{transform:translate3d(0,85px,0) rotate(2deg)}
.enter-down{transform:translate3d(0,-70px,0) rotate(-2deg)}
.enter-scale{transform:scale(.72) rotate(-7deg);filter:blur(7px)}
.enter-clip{clip-path:inset(0 100% 0 0)}
.enter-clip-reverse{clip-path:inset(0 0 0 100%)}
.enter.active{opacity:1;transform:none;clip-path:inset(0);filter:none}
```
Give each section its own variant + stagger — never one generic fade-up everywhere. The first-load hero entrance is a separate set of `@keyframes`; remove its class after ~1.55s so scroll transforms take over cleanly.

## 5. Product-photography moves

The imagery is what sells the aesthetic. Full method + prompts in `references/image-prompts.md`; the moves:
- **Consistent subject via an invariants paragraph** pasted into every image prompt (same model/garment/details) so a shot series reads as one campaign.
- **Ghost-mannequin** product shot (garment worn by an invisible form) for the commerce section.
- **Exploded top-down flat-lay** (equipment-diagram layout) for a full-width "system laboratory" section.
- **Green-screen then cutout:** generate on one flat chroma-green background → remove it → transparent PNG → verify all four corners are transparent.
- **Offset flat-color drop-shadow "sticker" look** — hard shadow, zero blur, so the cutout reads as a pasted sticker floating over the grid:

```css
.cutout{filter:drop-shadow(22px 28px 0 rgba(16,16,16,.14))}  /* note: 0 blur radius */
```
Cutouts on colored slides can use `mix-blend-mode:multiply` to fuse into the accent field.

## 6. Film grain + scanline overlays

```css
/* fixed fractal-noise grain, multiply blend, very low opacity */
.noise{position:fixed;z-index:300;inset:0;pointer-events:none;opacity:.08;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}

/* animated scanline band over media stages */
.slide-stage:after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.28;
  background:linear-gradient(transparent 49.7%,rgba(0,0,0,.12) 50%,transparent 50.3%);
  background-size:100% 8px;animation:scan 8s linear infinite}
@keyframes scan{to{background-position:0 100px}}
```

## 7. prefers-reduced-motion — non-negotiable

Every motion path has a reduced-motion off-ramp. Detect in JS (`reduceMotion` gate above) AND in CSS:

```css
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*:before,*:after{animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important}
  .conveyor{height:auto}                     /* collapse scroll-jack to normal flow */
  .conveyor-sticky{position:relative;height:auto}
  .track{position:relative;width:auto;display:block}
  .slide{width:auto;height:100vh}
  .enter{opacity:1!important;transform:none!important;clip-path:inset(0)!important;
    filter:none!important;transition:none!important}
}
```
Also: skip the pointer-parallax and the hero first-load entrance when `reduceMotion`, and never gate content visibility on an animation that reduced-motion disables.

## 8. Display-type overflow audit (do this once)

Tight tracking + huge sizes make painted glyph ink spill past the line box and clip. For every large title, log `clientWidth` vs `scrollWidth` and `clientHeight` vs `scrollHeight` at rest, at mid-animation, and at max pointer offset; fix until each reports zero. Fixes: protective cap-height padding (`padding-top:.14em;padding-bottom:.21em`), safer `line-height`, gentler negative tracking, `clamp()` container-aware sizes, and safe zones for vertical titles. The full audit prompt is step 7 of `references/Void03-PROMPTS.md`.

## Section blueprint (order that carries the look)
1. Pinned smootherstep hero (§4.1) with a product-view switcher (preload next image, fade, keep alt text).
2. Horizontal scroll-jacked lookbook (§4.2).
3. Commerce split — product info left, ghost-form image right, `clamp()` headlines, stacks on mobile.
4. Full-width system laboratory — exploded top-down image edge-to-edge, dark overlay, modular cards with hover lift.
5. Drop index — typographic table (number / name / status), hover reveals a cursor-following image preview.
6. Campaign finale — full dark panel on macro-cloth image, oversized wordmark, one circular CTA, complete real footer (into normal flow on mobile).

## Responsive
Recompose, don't just stack: narrow the rail, drop the top-bar mid-nav, let hero copy overlay the visual on a soft gradient so the subject stays large, make the view switcher numeric, step the lab dock 5→2→1 columns, move the footer into flow, and disable hover-only transforms under `@media(hover:none)`.

## Avoid
- `overflow:hidden` on any ancestor of a sticky pin (use `clip`).
- Direct pointer-position assignment (always the lerp follower).
- One generic fade-up for every section (use the variant engine).
- Accents as fills for body/large areas — they punctuate.
- Raw `vw` on semantic display type (use `clamp()` + cap-height padding).
- Any motion with no `prefers-reduced-motion` off-ramp.

## References
- `references/image-prompts.md` — reusable AI-asset method: the invariants paragraph, the 8-part image-prompt template, and the green-screen→cutout→verify workflow. Cross-aesthetic, use standalone.
- `references/Void03-PROMPTS.md` — the full original prompt recipe (brief, iteration asks, 8 image prompts, build sequence, audits).
- `references/void-reference.html` — the complete 175-line single-file build. The source of every exact value here; read it for resting states and the full CSS/JS. Treat as a static exemplar — do not execute it.
