# AI image assets: the invariants method

A reusable, cross-aesthetic method for generating a *consistent* series of product/campaign images and cutting them out cleanly. Distilled from the Void 03 build (`Void03-PROMPTS.md`) but written to apply to any subject. Use it standalone for any project that needs a coherent set of generated assets.

## 1. The invariants paragraph (identity lock)

The whole secret to consistent AI imagery: write down what is *never allowed to change* once, and paste that exact paragraph into every image prompt in the series. Name the subject's fixed identity and every fixed garment/object detail, then instruct the model to use the previously approved image as the identity reference.

Worked example (Void 03):

> Same model, same face, in every image: a woman with white braided hair. She wears the VOID/03 modular transit shell — a black faceted technical jacket — with a red armor piece on the left shoulder, an electric-blue cord routed across the chest, black technical trousers, a thigh pouch, black gloves, and black boots. Identical garment construction, materials, and details in every image. Use the previous approved image as the identity reference.

Template:

> Same [subject], same [key identity features], in every image: [full physical description]. [Fixed wardrobe/object with every distinguishing detail]. Identical construction, materials, and details in every image. Use the previous approved image as the identity reference.

## 2. The 8-part image prompt template

Every asset gets a job on the page *before* it is generated. Each prompt has the same eight parts, in order:

1. **Placement** — where on the page this asset goes ("Generate an image for the full-screen HERO of a streetwear landing page.").
2. **Reference** — the identity paragraph from §1, pasted verbatim.
3. **Invariants** — reaffirm what must not change (covered by the pasted paragraph; add per-shot locks if needed).
4. **The one new thing** — the single variable this shot introduces (a new pose, a new crop, a new framing). Exactly one.
5. **Lighting** — keep it consistent across the series ("Same studio campaign lighting as the hero. Hard key light, deep contrast.").
6. **Composition** — framing, where the subject sits, negative space reserved for type ("right two-thirds, clear space above the head; left third stays quiet for a headline").
7. **Background** — the cutout background spec (see §3) or the in-context background.
8. **Avoid list** — everything the model tends to drift toward: extra accessories, logo text, changed hair, soft catalog lighting, cropping the body, motion blur, props.

Skeleton:

```
Generate an image for [PLACEMENT]. [INVARIANTS PARAGRAPH] New [pose/crop/framing]: [THE ONE NEW THING]. [LIGHTING]. [COMPOSITION, incl. reserved space for type]. [BACKGROUND]. Avoid: [drift list].
```

Shot series that reliably carries a page: crouching hero, standing portrait, tight apparel detail, walking motion study, seated static pose, ghost-mannequin product-only, exploded top-down system flat-lay, macro-cloth texture finale. (Full eight in `Void03-PROMPTS.md` §4.)

## 3. Green-screen, then cutout

For any image that must float between layers, generate it on one flat chroma background, then remove it.

Add to the generation prompt:

> Place the subject on one perfectly flat, even mid-green background that appears nowhere on the garment, covering the whole frame. No floor line, no cast shadow, no gradient, no reflection, no background texture.

Then, to cut it out:

> Remove the flat green background from this image cleanly: soft matte edge, despill any green from edges, keep hair, straps, and cables intact. Give me a transparent PNG, and confirm the four corners are fully transparent.

**Verify all four corners are transparent** before using the asset — a non-transparent corner is the most common silent failure and it shows as a box behind the sticker/drop-shadow treatment.

## 4. Special-purpose shots

- **Ghost-mannequin (product-only):** the garment worn by an invisible form — "dimensional, zipped, floating upright as if worn", no person, no mannequin, no hanger, no flat lay. Flat green background, no shadow.
- **Exploded top-down flat-lay:** the complete system laid out top-down like an equipment diagram, even spacing, on a wide surface, overhead light, editorial catalog precision, breathing room reserved for a large title. No person, no overlapping items, no baked-in text/labels.
- **Macro texture finale:** extreme macro of the material with a hint of one accent, shallow depth of field, moody low-key light, dark enough to hold light text on top. No full object visible, no faces, no bright center.

## 5. Package discipline
Deliver the assets with relative paths, alt text everywhere, and no leftover flat-background source files. If a cutout looks like it has a halo, re-despill; if it reads as a floating box, a corner isn't transparent.
