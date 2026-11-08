#!/usr/bin/env python3
"""Generate the extension PNG icons from the local vector-style artwork.

Run from the project root:

    python3 tools/make_icons.py

The source SVG in icons/icon.svg mirrors this artwork for documentation and
store listing use; Pillow is used here so the raster output has clean alpha and
proper antialiasing at every size.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "icons"
SIZES = (16, 24, 32, 48, 128, 256)
SUPERSAMPLE = 8
BASE = 128


def lerp(a: int, b: int, t: float) -> float:
    return a + (b - a) * t


def make_master() -> Image.Image:
    size = BASE * SUPERSAMPLE
    # Violet -> azure, deliberately different from Edge's blue swirl.
    top = (104, 86, 255)
    bottom = (0, 151, 255)
    gradient = Image.new("RGBA", (size, size))
    pixels = gradient.load()
    for y in range(size):
        for x in range(size):
            t = (x / size) * 0.38 + (y / size) * 0.62
            pixels[x, y] = (
                int(lerp(top[0], bottom[0], t)),
                int(lerp(top[1], bottom[1], t)),
                int(lerp(top[2], bottom[2], t)),
                255,
            )

    # Rounded-square alpha mask.
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    inset = 4 * SUPERSAMPLE
    radius = 28 * SUPERSAMPLE
    mask_draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset), radius=radius, fill=255
    )
    gradient.putalpha(mask)

    draw = ImageDraw.Draw(gradient, "RGBA")
    s = SUPERSAMPLE
    white = (255, 255, 255, 255)

    # Timeline spine with three nodes and matching history rows.
    draw.line(((34 * s, 34 * s), (34 * s, 94 * s)), fill=white, width=4 * s)
    for x, y in ((34, 34), (34, 94)):
        r = 2 * s
        draw.ellipse((x * s - r, y * s - r, x * s + r, y * s + r), fill=white)

    for y, end_x in ((40, 98), (64, 86), (88, 74)):
        r = 7 * s
        draw.ellipse((34 * s - r, y * s - r, 34 * s + r, y * s + r), fill=white)
        draw.rounded_rectangle(
            (47 * s, (y - 7) * s, end_x * s, (y + 7) * s),
            radius=7 * s,
            fill=white,
        )

    # Subtle inner edge for a more finished squircle.
    edge = 2 * s
    draw.rounded_rectangle(
        (inset + edge, inset + edge, size - inset - edge, size - inset - edge),
        radius=radius - edge,
        outline=(255, 255, 255, 28),
        width=edge,
    )

    return gradient.resize((BASE * 4, BASE * 4), Image.LANCZOS)


def main() -> None:
    ICON_DIR.mkdir(exist_ok=True)
    master = make_master()
    for size in SIZES:
        icon = master.resize((size, size), Image.LANCZOS)
        path = ICON_DIR / f"icon{size}.png"
        icon.save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
