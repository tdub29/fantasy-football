"""Assert the turf background-image is intact.

Why this exists: the field has shipped as flat green TWICE, from two different
mistakes, and both times every other check passed.

  1. A raw `#` or a double quote inside the SVG data URI ended the CSS string early.
  2. A string-slice edit inserted a second `url(` without closing quotes.

CSS fails a background-image declaration ATOMICALLY: one malformed layer among five
throws away all five, so the page renders the base turf colour and nothing else. No
linter here catches it, `node --check` does not read CSS, and verify-app.py asserts on
DOM nodes, not on painted pixels. Hence a dedicated check.

    python site/check-field-tile.py
"""
import pathlib
import re
import sys

CSS = pathlib.Path(__file__).resolve().parent / "css" / "styles.css"
# Anchor on the data URI, not on comment prose: rewording the comment once made
# this check report the field as GONE when it was fine.
MARKER = "data:image/svg+xml,%3Csvg"


def main() -> int:
    s = CSS.read_text(encoding="utf-8")
    if MARKER not in s:
        print("FAIL: the field block is gone; nothing draws the turf markings")
        return 1
    # The LAST body::before rule wins the cascade, so that is the one to check.
    i = s.rindex("body::before {", 0, s.index(MARKER))
    block = s[i:s.index("\n}", i)]

    def decl(name):
        a = block.index(name)
        return block[a + len(name) + 1:block.index(";", a)].strip()

    img = decl("background-image")
    opens = img.count("url(")
    # A well-formed layer is url(" ... ") with the quotes intact.
    well_formed = len(re.findall(r'url\(".*?"\)', img, re.S))
    layers = well_formed + img.count("repeating-linear-gradient")
    problems = []

    if opens != well_formed:
        problems.append(f"{opens - well_formed} malformed url() layer(s): a broken layer "
                        f"voids the ENTIRE declaration and the field ships flat green")
    for bad, why in (('#', "a raw hash ends the CSS string early"),):
        if bad in img:
            problems.append(f"{bad!r} in background-image: {why}")
    # Every data URI must keep its SVG single-quoted inside.
    for n, arg in enumerate(re.findall(r'url\("(.*?)"\)', img, re.S)):
        if '"' in arg:
            problems.append(f"layer {n} has a double quote inside the data URI")
        if not arg.startswith("data:image/svg+xml,"):
            problems.append(f"layer {n} is not an svg data URI")

    # size / position / repeat must each have one entry per image layer, or the
    # layers silently mis-align instead of failing.
    for name in ("background-size", "background-position", "background-repeat"):
        n = decl(name).count(",") + 1
        if n != layers:
            problems.append(f"{name} has {n} entries for {layers} image layers")

    sizes = [x.strip() for x in decl("background-size").split(",")]
    repeats = [x.strip() for x in decl("background-repeat").split(",")]
    if sizes != ["100% 180px", "100% 180px", "100% 100%", "100% 100%"]:
        problems.append("field layers must scale once across the viewport; fixed-width tiles repeat when zoomed out")
    if repeats != ["no-repeat"] * layers:
        problems.append("field layers must not repeat; browser zoom otherwise creates multiple fields")

    # The geometry that the two reported bugs were about.
    # Numerals are 5x7 bitmap rect groups, one <g id='nX'> per numeral centred on X.
    nums = [int(m) for m in re.findall(r"%3Cg id='n(\d+)'", img)]
    # Real field order from a sideline inward: outer hashes, numerals, inner hashes.
    # Only the bottom tile carries numerals, so they must sit between its two rows.
    bottom = next((a for a in re.findall(r'url\("(.*?)"\)', img, re.S) if "id='n" in a), "")
    glyphs = [(int(y), int(y) + int(hh)) for y, hh in re.findall(r"y='(\d+)' width='\d+' height='([46])'", bottom)]
    hash_rows = sorted({int(m) for m in re.findall(r"y='(\d+)' width='3' height='12'", bottom)})
    if len(hash_rows) != 2:
        problems.append(f"expected inner and outer hash rows in the bottom tile, found {len(hash_rows)}: {hash_rows}")
    elif glyphs and not (hash_rows[0] + 12 < min(g[0] for g in glyphs) and max(g[1] for g in glyphs) < hash_rows[1]):
        problems.append(f"numerals span y={min(g[0] for g in glyphs)}-{max(g[1] for g in glyphs)}, not between the inner "
                        f"hashes (y={hash_rows[0]}) and the outer sideline hashes (y={hash_rows[1]})")
    if nums:
        chalk = 120  # one 5-yard segment on the 1-yard = 24px grid
        bisected = [x for x in nums if min(x % chalk, chalk - x % chalk) < 24]
        if bisected:
            problems.append(f"{len(bisected)} numeral(s) sit on a chalk line at x={bisected}")
    else:
        problems.append("no yard numerals in the tile")

    # Chalk is a full-height gradient, not a tile rect: folding it into the tile
    # once shortened the lines to two 180px bands instead of running the page.
    if "rgba(255,255,255,.20) 0 4px" not in img:
        problems.append("the 5-yard chalk gradient is gone; lines will not run full height")
    if "transparent 4px 5%" not in img:
        problems.append("5-yard chalk spacing must be viewport-relative so zoom keeps one field")

    problems += phone_problems(s, nums)
    if not re.search(r"body \{\s*background: var\(--dither\), var\(--grad-turf\);[^}]*isolation: isolate;", s):
        problems.append("body lost isolation: isolate; html's own background then lets body's turf cover the field")

    if problems:
        print("FAIL: the turf field is broken")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"field ok: {layers} layers, {len(nums)} numerals clear of chalk, "
          f"numerals between inner hashes y={hash_rows[0]} and sideline hashes y={hash_rows[1]}")
    return 0


SRC_W = 2400          # the SVG's own width
PHONE_H = 844         # the field's long axis on a portrait phone
MIN_NUMERALS = 3      # fewer than this and it stops reading as a field


def phone_problems(css: str, nums: list[int]) -> list[str]:
    """Check proportional yard numerals across the rotated phone field."""
    out = []
    m = re.search(r"@media \(max-width: 720px\)\s*\{\s*body::before \{(.*?)\}", css, re.S)
    if not m:
        return ["the phone field override is gone; the tile will stretch to "
                "viewport width and the numerals become slivers"]
    if "rotate(90deg)" not in m.group(1):
        out.append("phone field must rotate to run vertically")
    length = re.search(r"--phone-field-length:\s*max\(([0-9.]+)px,\s*100dvh\)", m.group(1))
    ratio = re.search(r"calc\(var\(--phone-field-length\)\s*\*\s*([0-9.]+)\)", m.group(1))
    if not length or not ratio:
        return ["phone field must cover its viewport length and preserve the SVG aspect"]
    w = max(float(length.group(1)), PHONE_H)
    h = w * float(ratio.group(1))

    # Aspect. A tile scaled unevenly renders squashed or stretched glyphs.
    if abs((w / SRC_W) - (h / 180)) > 0.01:
        out.append(f"phone tile {w:.0f}x{h:.0f} is not proportional to the "
                   f"{SRC_W}x180 source, so the numerals render distorted")

    # The actual bug: how many numerals land inside the visible window.
    scale = w / SRC_W
    left = (SRC_W * scale - PHONE_H) / 2          # rotated and centred
    visible = [n for n in nums if left <= n * scale <= left + PHONE_H]
    if len(visible) < MIN_NUMERALS:
        out.append(f"only {len(visible)} yard numeral(s) fall inside a "
                   f"{PHONE_H}px screen height at this tile size; a phone sees "
                   f"{visible or 'none'} and that reads as a broken background, "
                   f"not a field. Shrink the tile so more of the field fits.")
    return out


def self_check() -> None:
    """Reject lost rotation, excessive scale, distortion and missing override."""
    css = CSS.read_text(encoding="utf-8")
    nums = [300, 540, 780, 1020, 1260, 1500, 1740, 1980, 2220]

    horizontal = phone_problems(css.replace("rotate(90deg)", "rotate(0deg)"), nums)
    assert any("vertically" in p for p in horizontal), horizontal

    broken = phone_problems(css.replace("max(960px, 100dvh)", "max(4800px, 100dvh)"), nums)
    assert any("yard numeral" in p for p in broken), broken

    # An unevenly scaled tile distorts the glyphs.
    squashed = phone_problems(css.replace("* 0.075", "* 0.15"), nums)
    assert any("distorted" in p for p in squashed), squashed

    # And deleting the override entirely must be caught, not read as fine.
    gone = phone_problems(css.replace("@media (max-width: 720px)", "@media (min-width: 99999px)"), nums)
    assert gone, "a missing phone override was reported as healthy"


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        self_check()
        print("check-field-tile self-check ok")
        sys.exit(0)
    sys.exit(main())
