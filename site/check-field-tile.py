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
    nums = [int(m) for m in re.findall(r"%3Ctext x='(\d+)'", img)]
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
    hash_rows = sorted({int(m) for m in re.findall(r"y='(\d+)' width='3' height='12'", img)})
    if len(hash_rows) != 2:
        problems.append(f"expected 2 hash rows, found {len(hash_rows)}: {hash_rows}")
    elif min(hash_rows) <= 52:
        problems.append(f"hash row at y={min(hash_rows)} overlaps the numeral band, which ends at y=52")

    if problems:
        print("FAIL: the turf field is broken")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"field ok: {layers} layers, {len(nums)} numerals clear of chalk, "
          f"hash rows at y={hash_rows[0]} and y={hash_rows[1]}, numeral band ends y=52")
    return 0


if __name__ == "__main__":
    sys.exit(main())
