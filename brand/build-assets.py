#!/usr/bin/env python3
"""Derive every logo asset in web/public from brand/logo-source.jpg.

The source is a JPEG on a white field, which is wrong for the app in three
ways: the white would show as a box on the sand background, JPEG noise mottles
what should be flat colour, and the full scene is illegible at favicon size.
This script fixes all three, and exists so the assets can be regenerated at new
sizes without redoing that reasoning by hand.

    pip install Pillow && python3 brand/build-assets.py
"""
import pathlib
from collections import deque
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'brand/logo-source.jpg'
OUT = ROOT / 'web/public'

# The three inks the artwork actually uses, sampled from the source.
DARK, SUN, WAVE = (0x12, 0x43, 0x3f), (0xd6, 0x9d, 0x56), (0x45, 0x9f, 0x9f)
SAND = (0xfd, 0xfb, 0xf7, 255)          # sand-50, the app's page background
CREAM = (0xfd, 0xfb, 0xf7)              # reversed ink, for dark panels
WAVE_LIGHT = (0x5e, 0xea, 0xd4)         # brand-300, lifts off dark teal

# Alpha ramp: below LO fully opaque, above HI fully transparent. The band keeps
# anti-aliased edges smooth instead of cutting them into jagged steps.
LO, HI = 200, 248


def cut_out(path):
    """White background to alpha, with each ink snapped to its exact value."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    src = im.load()
    res = Image.new('RGBA', (w, h))
    dst = res.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = min(r, g, b)
            if m >= HI:
                dst[x, y] = (0, 0, 0, 0)
                continue
            a = 255 if m <= LO else int(round(255 * (HI - m) / (HI - LO)))
            # Recover the ink from a pixel composited onto white, so an edge
            # pixel is classified by its real colour rather than a washed one.
            f = a / 255
            ink = tuple(max(0, min(255, int(round((c - 255 * (1 - f)) / f))))
                        for c in (r, g, b))
            # Snapping removes JPEG mottle and makes the PNGs compress flat.
            near = min((DARK, SUN, WAVE),
                       key=lambda t: sum((p - q) ** 2 for p, q in zip(ink, t)))
            dst[x, y] = near + (a,)
    return res.crop(res.getbbox())


def largest_edge_component(img):
    """The palm: the connected shape reached from the first opaque pixel."""
    w, h = img.size
    px = img.load()
    solid = [[px[x, y][3] > 100 for x in range(w)] for y in range(h)]
    seed = next((x, y) for y in range(h) for x in range(w) if solid[y][x])
    seen = [[False] * w for _ in range(h)]
    seen[seed[1]][seed[0]] = True
    queue = deque([seed])
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    while queue:
        x, y = queue.popleft()
        op[x, y] = px[x, y]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and solid[ny][nx]:
                seen[ny][nx] = True
                queue.append((nx, ny))
    return out.crop(out.getbbox())


def recolour(img, mapping):
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = mapping.get((r, g, b), (r, g, b)) + (a,)
    return out


def square(img, box, pad=0.0, bg=None):
    inner = int(box * (1 - 2 * pad))
    scale = min(inner / img.width, inner / img.height)
    r = img.resize((max(1, round(img.width * scale)),
                    max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (box, box), bg or (0, 0, 0, 0))
    canvas.paste(r, ((box - r.width) // 2, (box - r.height) // 2), r)
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = cut_out(SRC)
    logo.save(OUT / 'logo.png', optimize=True)

    # Reversed lockup for the dark teal sign-in panel, where the near-black
    # teal of the original would disappear into the background.
    recolour(logo, {DARK: CREAM, WAVE: WAVE_LIGHT}).save(
        OUT / 'logo-light.png', optimize=True)

    # Square contexts get the palm alone: the full scene turns to mush at 16px.
    mark = largest_edge_component(logo)
    mark.save(OUT / 'mark.png', optimize=True)

    square(mark, 16).save(OUT / 'favicon-16.png', optimize=True)
    square(mark, 32).save(OUT / 'favicon-32.png', optimize=True)
    square(mark, 48).save(OUT / 'favicon.ico',
                          sizes=[(16, 16), (32, 32), (48, 48)])
    # iOS composites alpha onto black, so this one needs a real background.
    square(mark, 180, pad=0.14, bg=SAND).convert('RGB').save(
        OUT / 'apple-touch-icon.png', optimize=True)
    square(mark, 192, pad=0.12, bg=SAND).save(OUT / 'icon-192.png', optimize=True)
    square(mark, 512, pad=0.12, bg=SAND).save(OUT / 'icon-512.png', optimize=True)
    # Maskable icons are cropped to a circle on some launchers; keep the fronds
    # inside the 80% safe zone.
    square(mark, 512, pad=0.22, bg=SAND).save(
        OUT / 'icon-maskable-512.png', optimize=True)

    for f in sorted(OUT.iterdir()):
        print(f'{f.name:24} {f.stat().st_size:>7,} B')


if __name__ == '__main__':
    main()
