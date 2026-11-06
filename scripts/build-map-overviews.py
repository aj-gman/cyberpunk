#!/usr/bin/env python3
"""build-map-overviews.py — regenerate the map viewer's low-zoom overviews.

The map viewer (src/site/img/map-viewer/index.html) renders a single
downscaled overview.webp per tile folder when zoomed out, instead of
loading all 145 tile PNGs. Run this after adding or replacing tiles.

Usage:
    python3 scripts/build-map-overviews.py

Requires: Pillow (pip install Pillow).

Reads:  src/site/img/map-viewer/<folder>/<A1..I16>.png
Writes: src/site/img/map-viewer/<folder>/overview.webp  (2560x1440)
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

VIEWER = os.path.join(os.path.dirname(__file__), "..", "src", "site", "img", "map-viewer")
FOLDERS = [
    "tiles-pol",
    "tiles-socio",
    "tiles-infl",
    "august/pol",
    "august/socio",
    "august/infl",
]
ROWS = "ABCDEFGHI"
COLS = [str(i) for i in range(1, 17)]
TILE_W = TILE_H = 160  # each 960x960 tile becomes 160x160 -> 2560x1440 grid


def build(folder):
    path = os.path.join(VIEWER, folder)
    missing = [r + c for r in ROWS for c in COLS if not os.path.exists(os.path.join(path, f"{r}{c}.png"))]
    if missing:
        print(f"{folder}: skipped, missing tiles: {', '.join(missing[:5])}")
        return
    canvas = Image.new("RGB", (TILE_W * len(COLS), TILE_H * len(ROWS)), (0, 0, 0))
    for ri, row in enumerate(ROWS):
        for ci, col in enumerate(COLS):
            tile = Image.open(os.path.join(path, f"{row}{col}.png")).convert("RGB")
            canvas.paste(tile.resize((TILE_W, TILE_H), Image.LANCZOS), (ci * TILE_W, ri * TILE_H))
    out = os.path.join(path, "overview.webp")
    canvas.save(out, quality=82, method=6)
    print(f"{folder}: {os.path.getsize(out) // 1024} KB")


for folder in FOLDERS:
    build(folder)
