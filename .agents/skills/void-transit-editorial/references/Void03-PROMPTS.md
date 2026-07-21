# VOID/03 · every prompt, in order

This is the complete prompt set for the whole build, start to finish, in the same order
as the video. Every step is a plain-English ask you give ChatGPT 5.6 Sol (or any strong
frontend model with built-in image generation). The build starts before any image
exists, with the brief, and the images only start once the direction is locked. Copy
each prompt and swap in your own subject, topic, and palette. The image prompts follow
the exact eight-part structure the real build used; use them as the worked example of
the method.

## 1 · The brief, before anything else

The first ask sets the ground rules. Give the model the job, the bar, and the bans, and
make it show you a direction before it builds.

```
I want to build an amazing landing page template to demonstrate what you can do. Get inspiration from award-level sites (Awwwards) - multiple sites, but stitch the principles together into ONE coherent, original style. We do not want a copy of any website - similar animations, effects, and interactions only. The page must be focused on scroll-driven animation. Create your own assets with your built-in image generation. Pick a topic that is genuinely popular - something real clients or web designers would actually use, not a novelty. Before writing code, tell me the topic, the visual style, and the section plan.
```

## 2 · Reject the generic (the iteration asks)

The first idea an AI reaches for is everyone's first idea. These are the real
follow-ups that steered the project from generic to original. Use the same energy:
name what is wrong, name the constraint, ask again.

When the first concept is too safe:
```
No architecture or houses - too generic. Find another topic and another visual style. Do not replace completed work; create a new standalone page.
```

When the imagery drifts off-style or repeats:
```
Beside the hero, the rest is not really in the style we set. Make sure the SUBJECT stays the same if it appears again - same identity, drawn the same. Do not give me repetitive art (the same image recolored is not a new asset). More animation, more wow.
```

When the style is right but the topic can't carry commerce:
```
I want a professional photo-shoot style - real studio lighting, a PERSON as the subject (someone wearing the product), not just an object. It has to support an e-commerce section. No perfume, nothing predictable. Make it unique and creative, and keep the subject identical across every image.
```

## 3 · The identity paragraph (the invariants)

Write down what is never allowed to change, once, and paste it into every image prompt.
This is the whole secret of consistent AI imagery. The VOID/03 paragraph:

```
Same model, same face, in every image: a woman with white braided hair. She wears the VOID/03 modular transit shell - a black faceted technical jacket - with a red armor piece on the left shoulder, an electric-blue cord routed across the chest, black technical trousers, a thigh pouch, black gloves, and black boots. Identical garment construction, materials, and details in every image. Use the previous approved image as the identity reference.
```

## 4 · The eight image prompts

Each asset had a purpose on the page before it was generated. Every prompt has the same
eight parts: placement, reference, invariants, the one new thing, lighting, composition,
background, avoid list. The invariants paragraph from step 3 is pasted where marked.

**4a · Crouching hero pose**
```
Generate an image for the full-screen HERO of a streetwear landing page. [invariants paragraph] New pose: a low, coiled crouch on one knee, looking into camera, seen slightly from below. Hyperreal studio campaign photography, hard key light, deep contrast, high detail. Compose her in the right two-thirds with clear space above her head; the left third stays visually quiet for a headline. Place her on one perfectly flat, even mid-green background covering the entire frame, with no floor line, no cast shadow, no gradient, no reflection. Avoid: extra accessories, logo text, changed hair, soft fashion-catalog lighting.
```

**4b · Standing portrait**
```
Generate an image for the product VIEW SWITCHER of the same page. [invariants paragraph] New pose: a relaxed standing portrait, three-quarter angle, arms loose. Same studio campaign lighting as the hero. Full body in frame with padding on all sides. Same flat green background, no floor, no shadow. Avoid: cropping any part of the body, new garment details.
```

**4c · Apparel detail**
```
Generate an image for a close product DETAIL view. [invariants paragraph] New framing: a tight three-quarter crop from head to thigh emphasizing the jacket's faceted panels, the red shoulder armor, and the blue cord routing. Crisp macro-level garment detail, same studio light. Same flat green background, no shadow. Avoid: face out of frame, motion blur.
```

**4d · Walking motion study**
```
Generate an image for a motion card in a horizontal lookbook. [invariants paragraph] New pose: mid-stride walk, strong silhouette, garment in motion. Same studio campaign light. Full body, generous padding, nothing touching frame edges. Same flat green background, no floor, no shadow. Avoid: running pose, changed footwear.
```

**4e · Seated static pose** (the repetition fix: card one originally repeated the walk)
```
Generate an image for the FIRST lookbook card, themed STATIC / REST. [invariants paragraph] New pose: seated on the ground, knees up, forearms resting on knees, calm and still, front-on camera. Same studio light. Full body with padding. Same flat green background, no shadow. Avoid: any walking or standing pose, any prop.
```

**4f · Ghost product display**
```
Generate an image for the E-COMMERCE product section. Show the VOID/03 modular transit shell jacket ALONE with no person: an invisible-mannequin ghost display, dimensional, zipped, floating upright as if worn. Same garment exactly: black faceted panels, red left-shoulder armor piece, electric-blue chest cord. Studio product lighting, high detail. Centered with generous padding. Same flat green background, no floor, no shadow, no hanger. Avoid: a person, a mannequin form, flat lay.
```

**4g · Exploded system layout**
```
Generate an image for a full-width SYSTEM LABORATORY section. Show the complete VOID/03 outfit system laid out top-down, exploded like an equipment diagram: shell jacket, shoulder armor, cord, trousers, pouch, gloves, boots, arranged with even spacing on a wide dark technical surface. Overhead studio light, editorial catalog precision. Wide 16:9 composition with breathing room at the left for a large title. Avoid: a person, overlapping items, labels or text baked into the image.
```

**4h · Macro cloth finale**
```
Generate an image for the FINALE background. An extreme macro of the shell jacket's black faceted fabric with one red armor edge and a hint of the blue cord crossing frame, shallow depth of field, moody low-key light. Wide 16:9, texture-first, dark enough to hold light text on top. Avoid: full garment visible, faces, bright areas in the center.
```

## 5 · The cutout requirement

For every image that must float between layers, add this to the prompt, then remove the
background after generation:

```
Place the subject on one perfectly flat, even mid-green background that appears nowhere on the garment, covering the whole frame. No floor line, no cast shadow, no gradient, no reflection, no background texture.
```

Then ask your agent:
```
Remove the flat green background from this image cleanly: soft matte edge, despill any green from edges, keep hair, straps, and cables intact. Give me a transparent PNG, and confirm the four corners are fully transparent.
```

## 6 · The single-file build

The page is one HTML file with styles and behavior inline, plus an assets folder with
relative paths. The build asks, in order:

The skeleton:
```
Build the page as ONE self-contained HTML file. Design tokens first in :root (near-black ink, warm paper, signal red, electric blue, one acid accent, one shared easing curve). Fixed left side rail with the brand mark, fixed top bar, then six sections: pinned hero, horizontal lookbook, product section, system laboratory, drop index, campaign finale with a full real footer. Monospaced font for all technical labels, tightly tracked grotesk for display type, 1px border lines throughout. All images from a relative assets/ folder.
```

The pinned hero:
```
Make the hero a pinned scroll sequence: the outer section provides about 70vh of extra scroll distance, the inner panel is position:sticky under the fixed header. Normalize the scroll progress to 0..1 and run it through a smootherstep ease. Drive three phases from it: intro (background and title settle), build (stamps, orbit ring, and the giant background number track in), release (layers ease off). IMPORTANT: never put overflow:hidden on the hero's ancestors - use overflow:clip so the sticky pin keeps working.
```

The entrance:
```
Choreograph a first-load entrance where each hero layer arrives from its own origin with its own delay: background reveals downward, title swings in from a rotated diagonal, eyebrow drops from above, copy rises from below, the model slides in from the right scaling to place, technical stamps pop late, the product-view control arrives last. Remove the entrance classes when done so scroll transforms take over cleanly, and disable all of it under prefers-reduced-motion.
```

The product-view switcher:
```
Add a product-view switcher with three labeled views (crouch, portrait, detail). One strong active state, preload the next image before swapping, fade between images without touching scroll state, and keep proper alt text per view.
```

The horizontal lookbook:
```
Convert vertical scroll into a horizontal lookbook: a tall outer section about 4.5 screens high, a sticky full-screen viewport that subtracts the fixed header height, and a track of four full-screen cards translated horizontally from the vertical progress. Derive the active card label and a bottom progress meter from the same normalized progress. Layer each card: giant background display word, orbit ring with accent dots, the transparent subject, an outlined foreground word, the card title, a caption, and a floating spec chip.
```

The pointer parallax:
```
Add pointer parallax inside each card with a follower, never direct assignment: keep current X/Y and target X/Y, update only the target on pointer move, and every animation frame move current toward target by about 18 percent of the remaining distance. On pointer leave set the target to zero and let the same follower ease home; on re-entry only the target changes so there is never a jump. Background type moves least, subject more, foreground type most, orbit independent. Keep all semantic text in safe zones at maximum offset, and disable the effect for touch input.
```

The commerce section:
```
Build the product section as a split: product information left (price, stock state, colorway selector, size selector, add-to-bag, material and dispatch metadata), the ghost-form jacket image right. Size headlines with clamps per breakpoint, never raw viewport units. It must stack on mobile without losing the product hierarchy.
```

The laboratory:
```
Build the system laboratory as a FULL-WIDTH section, deliberately different from the product split: the exploded top-down outfit image edge to edge, a dark editorial overlay, a large title over the left side, and five modular system cards docked below with a hover lift. Remove any decorative element that looks like a progress indicator but measures nothing.
```

The drop index and finale:
```
Build the drop index as a typographic table (number, name, status per row) where hovering a row reveals a small floating image preview that follows the cursor. Then the finale: a full dark panel on the macro cloth image, an oversized campaign wordmark, one circular call-to-action, and a complete real footer: brand description, release locations, section navigation, size and shipping and care links, contact and social, privacy and terms and copyright. On mobile the footer joins normal document flow.
```

Section entrances:
```
Give each section its own entrance variant from a shared engine (enter left, right, up, down, scale, clip reveal) with different stagger values - never one generic fade-up everywhere. Use IntersectionObserver plus a passed-element fallback so hash jumps and fast scrolling never leave content invisible.
```

Responsive pass:
```
Recompose (not stack) for three tiers - desktop, tablet, phone - plus short desktop screens, touch devices, and reduced motion. Narrow the rail, simplify the header, let hero copy overlay the visual on a soft gradient so the subject stays large, make the view switcher numeric, stack the buy panel in a deliberate order, step the lab dock from five columns to two to one, reduce index metadata, move the footer into flow, and disable hover-only transforms on touch.
```

## 7 · The painted-ink typography audit

Element rectangles lie about huge display type; painted glyph ink can spill past the
line box and get clipped. Ask once:

```
Write a small browser-console audit for my display typography: for every large display title, report clientWidth vs scrollWidth and clientHeight vs scrollHeight, the computed line-height and padding, the nearest ancestor that clips, and the painted overflow in pixels - measured at the resting state, at the section's mid-animation scroll position, and at maximum pointer-parallax offset. Print one line per title with its worst overflow in px.
```

Fix until every title reports zero: protective cap-height padding, safer line heights,
gentler negative tracking, container-aware font sizes, and safe zones for vertical
titles.

## 8 · The browser verification habit

After every meaningful change: reload, navigate to the affected section, test resting
state, hover, extreme cursor position, scroll midpoint and boundaries, measure clipping
and overflow, screenshot, check the console for errors, and confirm page scrollWidth
minus innerWidth equals zero. Numbers beat impressions: check the sticky panel's top at
0, 25, 50, 75, and 100 percent of its scroll range.

## 9 · Git as a design tool

Commit after each coherent change with a real message (hero rework, new asset and
composition, deeper parallax, responsive pass, typography hardening, interaction
timing, footer expansion). Run `git diff --check` before committing. Small commits are
a time machine for taste: compare directions, recover last week's composition, find
the change that broke an interaction.

## 10 · Package

Deliver the HTML file and the assets folder together (relative paths). Final sweep: no
missing assets, no leftover flat-background source files, alt text everywhere, reduced
motion works, the mobile footer overlays nothing, every link resolves, working tree
clean.

---
The eight image prompts follow the eight-part structure of the real build (placement,
reference, invariants, new pose, lighting, composition, background, avoid list) with
the real identity paragraph; treat them as the worked example of the method and swap in
your own subject and product. This handout mirrors the course plan in
VOID03_YOUTUBE_COURSE.md; keep the two in sync if you edit either.
