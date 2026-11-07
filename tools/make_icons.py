#!/usr/bin/env python3
"""Generate the extension PNG icons from a simple vector-free drawing.

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
    # Diagonal gradient from bright azure (top-left) to deep blue (bottom-right).
    top = (27, 139, 220)
    bottom = (10, 90, 168)
    gradient = Image.new("RGBA", (size, size))
    pixels = gradient.load()
    for y in range(size):
        for x in range(size):
            t = (x / size) * 0.32 + (y / size) * 0.68
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
    scale = SUPERSAMPLE
    cx, cy = 64 * scale, 66 * scale
    ring_r = 29 * scale
    stroke = 9 * scale

    draw.ellipse(
        (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
        outline=(255, 255, 255, 255),
        width=stroke,
    )
    # Clock hands: 12 o'clock, then towards 4 o'clock.
    draw.line(
        ((64 * scale, 46 * scale), (64 * scale, 66 * scale)),
        fill=(255, 255, 255, 255),
        width=stroke,
    )
    draw.line(
        ((64 * scale, 66 * scale), (79 * scale, 74 * scale)),
        fill=(255, 255, 255, 255),
        width=stroke,
    )
    # Round the hand ends and the elbow.
    for (x, y) in ((64, 46), (64, 66), (79, 74)):
        r = stroke / 2
        draw.ellipse(
            (x * scale - r, y * scale - r, x * scale + r, y * scale + r),
            fill=(255, 255, 255, 255),
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
