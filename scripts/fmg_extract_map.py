#!/usr/bin/env python3
"""
Extract every renderable layer from an Azgaar Fantasy-Map-Generator .map save
(tested on v1.156.0) into standalone, faithfully styled SVG files.

Usage: python3 fmg_extract_map.py SAVE.map [--out DIR] [--scale N] [--composite]

Outputs (canvas coordinates, viewBox 0 0 W H):
  basemap.svg   ocean + landmass + coastline
  cultures.svg  socioeconomic (cultures) layer
  religions.svg influence (religions) layer
  borders.svg   state/province borders
  zones.svg     zones with hatch fills and names
  routes.svg    roads + trails + searoutes, named
  labels.svg    state + added labels with embedded fonts and text paths
  composite.svg all extracted layers stacked in FMG draw order (with --composite)

The tile grid used by the viewer is 8x the native canvas: multiply by 8
(or pass --scale 8) to get 15360x8640 coordinates.
"""
import argparse, copy, json, re, sys
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

# Base hatch patterns, verbatim from FMG v1.156.0 src/index.html (#defs-hatching).
# Zone fills reference these by id (e.g. url(#hatch32)); they are generated
# app-side and are NOT stored in the save.
HATCHING_DEFS_XML = '<g id="defs-hatching">\n          <pattern id="hatch0" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch1" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch2" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch3" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch4" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch5" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch6" patternUnits="userSpaceOnUse" width="5" height="5">\n            <circle cx="2.5" cy="2.5" r="1" style="fill: black" />\n          </pattern>\n          <pattern id="hatch7" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" transform="rotate(-45 0 0)" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch8" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 2.5" />\n          </pattern>\n          <pattern id="hatch9" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 2.5" />\n          </pattern>\n          <pattern id="hatch10" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 2.5" />\n          </pattern>\n          <pattern id="hatch11" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 2.5" />\n          </pattern>\n          <pattern id="hatch12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="1" x2="0" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="1" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch13" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch14" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch15" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch16" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch17" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="1" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch18" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="1" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch19" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch20" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch21" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch22" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="2" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch23" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch24" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="0" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="2" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch25" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch26" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch27" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch28" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="2" y1="0" x2="0" y2="2" style="stroke: black; stroke-width: 2" />\n          </pattern>\n          <pattern id="hatch29" patternTransform="rotate(30 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="1" x2="0" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="1" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch30" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="1" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch31" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="1" y1="0" x2="0" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="1" y1="0" x2="3" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch32" patternUnits="userSpaceOnUse" width="5" height="5">\n            <circle cx="2.5" cy="2.5" r="0.5" style="fill: black" />\n          </pattern>\n          <pattern id="hatch33" patternUnits="userSpaceOnUse" width="5" height="5">\n            <circle cx="2.5" cy="2.5" r="1.5" style="fill: black" />\n          </pattern>\n          <pattern id="hatch34" patternUnits="userSpaceOnUse" width="5" height="5">\n            <circle cx="3" cy="3" r="1" style="fill: black" />\n            <circle cx="1" cy="1" r="1" style="fill: black" />\n          </pattern>\n          <pattern id="hatch35" patternUnits="userSpaceOnUse" width="5" height="5">\n            <circle cx="3" cy="3" r="1.5" style="fill: black" />\n            <circle cx="1" cy="1" r="1.5" style="fill: black" />\n          </pattern>\n          <pattern id="hatch36" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" transform="rotate(-45 0 0)" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch37" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="0" y2="3" transform="rotate(-45 0 0)" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch38" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="4" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch39" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="4" y2="4" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch40" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="3" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch41" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="4" height="4">\n            <line x1="0" y1="0" x2="3" y2="3" style="stroke: black; stroke-width: 1.5" />\n            <line x1="0" y1="0" x2="4" y2="0" style="stroke: black; stroke-width: 1.5" />\n          </pattern>\n          <pattern id="hatch42" patternUnits="userSpaceOnUse" width="4" height="4">\n            <path d="M0 2Q1 .5 2 2T4 2" fill="none" style="stroke: black; stroke-width: 1" />\n          </pattern>\n          <pattern id="hatch43" patternUnits="userSpaceOnUse" width="4" height="4">\n            <path d="M0 2L1 1 3 3 4 2" fill="none" style="stroke: black; stroke-width: 1" />\n          </pattern>\n          <pattern id="hatch44" patternUnits="userSpaceOnUse" width="5" height="5">\n            <path d="M2.5 1V4M1 2.5H4" style="stroke: black; stroke-width: 1" />\n          </pattern>\n          <pattern id="hatch45" patternUnits="userSpaceOnUse" width="8" height="8">\n            <path d="M0 1H8M0 5H8M1 1V5M5 5V8M5 0V1" style="stroke: black; stroke-width: 1" />\n          </pattern>\n          <pattern id="hatch46" patternUnits="userSpaceOnUse" width="8" height="8">\n            <path d="M1 1.5h.01M4.5 1h.01M7 3h.01M2.5 4.5h.01M5.5 5.5h.01M1 7h.01M7.2 6.8h.01" style="stroke: black; stroke-width: 1.2; stroke-linecap: round" />\n          </pattern>\n        </g>'

BURG_SPRITES_XML = '<g id="defs-burg-sprites"><symbol id="burgs-atlas-circle" viewBox="-6 -6 12 12"><circle cx="0" cy="0" r="5" /></symbol><symbol id="burgs-atlas-triangle" viewBox="-6 -6 12 12"><polygon points="0,-5 5,5 -5,5" /></symbol><symbol id="burgs-atlas-square" viewBox="-6 -6 12 12"><rect x="-5" y="-5" width="10" height="10" /></symbol><symbol id="burgs-watabou-capital" viewBox="-6.2 -19.3 12.6 20.8"><desc>Burg icon by Watabou (Oleg Dolya), from the Medieval Fantasy City Generator. Source: https://watabou.itch.io/medieval-fantasy-city-generator. Attribution appreciated.</desc>\n<g transform="scale(.1)">\n<g transform="translate(-60 -194) scale(2 2)">\n<path fill="#EBE8DF" d="M26 90H13l1.3-37.3-1-1v-16h12.6v16l-1 1L26 90" />\n<path d="m19.5 12 1.3 6.9 1 3.8 1 3 1.5 3.6 3.1 6.4H11.6l3.1-6.4 1.5-3.6 1-3 1-3.8 1.3-7" />\n<path\nfill="#4D3F36"\nd="M19.5 10.4V5.6L21.3 4l1-.3 1 .5.9 1 1 1.7.9 1 .9.5.9-.3.9-.8.7-.5.8-.2.6.2.5.5.6.4.7.3 1 .1h1.8l-1.8.6-1 .1H32l-.6-.2L31 8h-.6l-.8.4-.7.7-1 1.1-.8.5-1-.1-.9-.8-1-1.4-.9-.7-.9-.2-1 .6-1.8 2.2"\n/>\n<path fill="#4D3F36" d="M19.5 12V5.5" />\n<path fill="#4D3F36" d="M17.2 46h1.6V42l-.3-.6h-1l-.3.6v4" />\n<path fill="#EBE8DF" d="M41.7 90H31.2l1-24.5-.8-.9v-16h10.1v16l-.8.9 1 24.5" />\n<path d="m36.5 29.7 1 5.6.8 3 .8 2.4 1.2 2.9 2.5 5H30.2l2.5-5 1.2-3 .8-2.3.7-3 1-5.6" />\n<path\nfill="#4D3F36"\nd="M36.5 28.2v-4.8l1.5-2 .9-.4.7.4.6 1 .7 1.7.7 1.1.8.5.7-.1.8-.7 1-.4h1l1 .2 1.2.5 1 .4 1 .3h2.4l-1.5.5-1 .2h-1.9l-1.2-.3-1 .1-1 .4-1 .7-.8.9-.7.3-.8-.2-.7-1-.7-1.4-.6-.8-.7-.2-.9.7-1.5 2.4"\n/>\n<path fill="#4D3F36" d="M36.5 29.7v-6.3" />\n<path fill="#4D3F36" d="M34 59h1.6V55l-.3-.7h-1l-.3.7V59" />\n<path fill="#4D3F36" d="M47.6 88.8h1.6v-4.1l-.4-.7h-1l-.2.7v4.1" />\n<path\nfill="#EBE8DF"\nd="M14.8 94.6H1.5L2 84.4 8.3 73l6.3 11.4.2 10.2m8.3 0h-8.3l-.2-10.2L8.3 73l2 .4h4l2-.4 6.3 11.4.5 10.2"\n/>\n<path d="M22.6 84.4h-8L8.3 73l2 .4h4l2-.4 6.3 11.4" />\n<path fill="#4D3F36" d="M9.5 94.6H7V89l.5-1H9l.5 1v5.5" />\n<path\nfill="#EBE8DF"\nd="M50.4 95.3H33.1l.5-10.4L42 70l8.3 15 .2 10.3m8.3 0h-8.3l-.2-10.4L41.9 70l2 .5 2 .1 2-.1 2-.5 8.3 15 .5 10.3"\n/>\n<path d="M58.2 85h-8l-8.3-15 2 .5 2 .1 2-.1 2-.5 8.3 15" />\n<path fill="#4D3F36" d="M43 95.3h-2.3v-5.5l.5-1h1.4l.5 1v5.5" />\n<path\nfill="#EBE8DF"\nd="M27.9 97.3H13.4l1-19.8L21 65.8l6.5 11.7.5 19.8m8.5 0h-8.5l-.5-19.8-6.5-11.7 2 .4 2 .1 2-.1 2-.4 6.5 11.7 1 19.8"\n/>\n<path d="M35.4 77.5h-8l-6.5-11.7 2 .4 2 .1 2-.1 2-.4 6.5 11.7" />\n<path fill="#4D3F36" d="m21.6 77.1.1.4-.1.4-.3.3-.4.1h-.4l-.3-.4v-.8l.3-.3h.8l.3.3" />\n<path fill="#4D3F36" d="M22.1 97.3h-2.4v-5.5l.5-1h1.4l.5 1v5.5" />\n</g>\n<circle fill="#EBE8DF" stroke-width="3" cx="0" cy="0" r="10" />\n</g></symbol><symbol id="ports-anchor" viewBox="-5.4 -5.4 10.8 10.8"><g transform="scale(.3333)">\n<path d="m 1.003,-9.873 c 0,-0.547 -0.453,-1 -1,-1 -0.547,0 -1,0.453 -1,1 0,0.547 0.453,1 1,1 0.547,0 1,-0.453 1,-1 z m 13,14.5 v 5.5 c 0,0.203 -0.125,0.391 -0.313,0.469 -0.063,0.016 -0.125,0.031 -0.187,0.031 -0.125,0 -0.25,-0.047 -0.359,-0.141 L 11.691,9.033 c -2.453,2.953 -6.859,4.844 -11.688,4.844 -4.829,0 -9.234,-1.891 -11.688,-4.844 l -1.453,1.453 c -0.094,0.094 -0.234,0.141 -0.359,0.141 -0.063,0 -0.125,-0.016 -0.187,-0.031 -0.187,-0.078 -0.313,-0.266 -0.313,-0.469 v -5.5 c 0,-0.281 0.219,-0.5 0.5,-0.5 h 5.5 c 0.203,0 0.391,0.125 0.469,0.313 0.078,0.188 0.031,0.391 -0.109,0.547 L -9.2,6.55 c 1.406,1.891 4.109,3.266 7.203,3.687 V 0.128 h -3 c -0.547,0 -1,-0.453 -1,-1 v -2 c 0,-0.547 0.453,-1 1,-1 h 3 v -2.547 c -1.188,-0.688 -2,-1.969 -2,-3.453 0,-2.203 1.797,-4 4,-4 2.203,0 4,1.797 4,4 0,1.484 -0.812,2.766 -2,3.453 v 2.547 h 3 c 0.547,0 1,0.453 1,1 v 2 c 0,0.547 -0.453,1 -1,1 h -3 V 10.237 C 5.097,9.815 7.8,8.44 9.206,6.55 L 7.643,4.987 C 7.502,4.831 7.456,4.628 7.534,4.44 7.612,4.252 7.8,4.127 8.003,4.127 h 5.5 c 0.281,0 0.5,0.219 0.5,0.5 z" />\n</g></symbol></g>'

# Rules from FMG v1.156.0 src/index.css that affect faithful rendering. The save
# stores per-layer attributes inline, but these stylesheet rules live only in the app.
FMG_CSS = """
#coastline { fill: none; stroke-linejoin: round; }
#landmass { mask: url(#land); fill-rule: evenodd; }
#cults, #relig { mask: url(#land); stroke-linejoin: round; fill-rule: evenodd; }
#labels { text-anchor: middle; dominant-baseline: central; paint-order: stroke; stroke-linejoin: round; }
#labels text[data-label-shape="point"] { dominant-baseline: alphabetic; }
#borders, #routes { fill: none; }
#oceanLayers { fill-rule: evenodd; }
"""

def q(tag): return "{%s}%s" % (SVG_NS, tag)

def load_save(path):
    text = open(path, encoding="utf-8").read()
    header, rest = text.split("\n", 1)
    version = header.split("|")[0]
    svg_start = text.index("<svg")
    svg_end = text.rindex("</svg>") + len("</svg>")
    svg_text = text[svg_start:svg_end]
    root = ET.fromstring(svg_text)
    tail = text[svg_end:]
    data = {"zones": None, "routes": None, "burgs": None, "states": None,
            "style": None, "labels": None, "fonts": None, "order": None}
    for line in tail.split("\n"):
        line = line.strip()
        if not line or line[0] not in "[{":
            continue
        try:
            v = json.loads(line)
        except ValueError:
            continue
        if isinstance(v, dict):
            if "order" in v and isinstance(v["order"], list):
                data["order"] = v["order"]
            elif "borders" in v and "routes" in v:
                data["style"] = v
        elif isinstance(v, list) and v:
            first = next((e for e in v if isinstance(e, dict)), None)
            if first is None:
                continue
            if "label" in first:
                data["labels"] = v
            elif "group" in first and "points" in first:
                data["routes"] = v
            elif "cells" in first and "color" in first and "name" in first and "diplomacy" not in first:
                data["zones"] = v
            elif "diplomacy" in first or ("formName" in str(first)[:200]):
                data["states"] = v
            elif "cell" in first and "x" in first:
                data["burgs"] = v
            elif "family" in first:
                data["fonts"] = v
    return version, root, data

def find(root, gid):
    for e in root.iter():
        if e.get("id") == gid:
            return e
    return None

def collect_defs(root):
    """Map def id -> element for everything under the save's <defs>."""
    defs = {}
    defs_el = next((c for c in root if c.tag == q("defs")), None)
    if defs_el is not None:
        for e in defs_el.iter():
            i = e.get("id")
            if i:
                defs[i] = e
    return defs

def referenced_ids(el):
    ids = set()
    for e in el.iter():
        for k, v in e.attrib.items():
            for m in re.finditer(r"url\(#([^)]+)\)", v):
                ids.add(m.group(1))
            if k in ("href", "{%s}href" % XLINK_NS) and v.startswith("#"):
                ids.add(v[1:])
        if e.tag == q("style") and e.text:
            for m in re.finditer(r"url\(#([^)]+)\)", e.text):
                ids.add(m.group(1))
    return ids

def build_svg(width, height, groups, save_defs, hatch_defs, extra_defs=(), font_css=None):
    svg = ET.Element(q("svg"), {
        "width": str(width), "height": str(height),
        "viewBox": "0 0 %s %s" % (width, height), "version": "1.1"})
    defs = ET.SubElement(svg, q("defs"))
    fmg_style = ET.SubElement(defs, q("style"))
    fmg_style.text = FMG_CSS + (font_css or "")
    font_css = None
    need = set()
    selfcontained = set()
    for g in groups:
        need |= referenced_ids(g)
        for e in g.iter():
            if e.get("id"):
                selfcontained.add(e.get("id"))
    for d in extra_defs:
        need |= referenced_ids(d)
    for m in re.finditer(r"url\(#([^)]+)\)", FMG_CSS + (font_css or "")):
        need.add(m.group(1))
    need -= selfcontained
    placed = set()
    def place(did):
        if did in placed:
            return
        el = save_defs.get(did)
        if el is None:
            el = hatch_defs.get(did)
        if el is None:
            print("  warning: unresolved def #%s" % did, file=sys.stderr)
            return
        el = copy.deepcopy(el)
        placed.add(did)
        for ref in referenced_ids(el):
            place(ref)
        defs.append(el)
    for did in sorted(need):
        place(did)
    if font_css:
        st = ET.SubElement(defs, q("style"))
        st.text = font_css
    for g in groups:
        svg.append(g)
    return svg

def font_face_css(fonts, families):
    """Build @font-face CSS from the save's embedded font table for the latin subset."""
    css = []
    for fam in families:
        entries = [f for f in (fonts or []) if f.get("family") == fam and "U+0000-00FF" in f.get("unicodeRange", "")]
        if not entries:
            entries = [f for f in (fonts or []) if f.get("family") == fam]
        for f in entries[:1]:
            src = f.get("src", "")
            m = re.search(r"url\((https://[^)]+)\)", src)
            if m:
                css.append("@font-face{font-family:'%s';src:url('%s') format('woff2');}" % (fam, m.group(1)))
    return "\n".join(css)

def set_names(group, items, id_prefix, key="name"):
    """Attach data-name from save data to elements named <prefix><i>."""
    by_i = {it.get("i"): it for it in (items or []) if isinstance(it, dict)}
    n = 0
    for e in group.iter():
        eid = e.get("id", "")
        m = re.fullmatch(r"%s(\d+)" % id_prefix, eid)
        if m and int(m.group(1)) in by_i:
            name = by_i[int(m.group(1))].get(key)
            if name:
                e.set("data-name", name)
                n += 1
    return n

def serialize(svg, path, scale):
    if scale != 1:
        svg.set("width", str(int(svg.get("width")) * scale))
        svg.set("height", str(int(svg.get("height")) * scale))
        g = ET.Element(q("g"), {"transform": "scale(%s)" % scale})
        for child in list(svg):
            if child.tag != q("defs"):
                svg.remove(child)
                g.append(child)
        svg.append(g)
    ET.ElementTree(svg).write(path, xml_declaration=True, encoding="unicode", default_namespace=None)
    print("wrote", path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("save")
    ap.add_argument("--out", default=".")
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--composite", action="store_true")
    args = ap.parse_args()

    version, root, data = load_save(args.save)
    width, height = root.get("width"), root.get("height")
    print("FMG save version %s, canvas %sx%s" % (version, width, height))

    save_defs = collect_defs(root)
    hatch_root = ET.fromstring(HATCHING_DEFS_XML)
    hatch_defs = {e.get("id"): e for e in hatch_root if e.get("id")}
    sprite_root = ET.fromstring(BURG_SPRITES_XML)
    hatch_defs.update({e.get("id"): e for e in sprite_root if e.get("id")})

    viewbox = find(root, "viewbox")
    layers = {}  # output name -> (list of group copies, font css or None)

    def grab(gid, required=True):
        el = find(viewbox, gid)
        if el is None:
            if required: print("  warning: group #%s missing" % gid, file=sys.stderr)
            return None
        return copy.deepcopy(el)

    # basemap: ocean + landmass + coastline
    bm = [g for g in (grab("ocean"), grab("landmass"), grab("coastline")) if g is not None]
    if bm: layers["basemap"] = (bm, None)

    cults, relig = grab("cults"), grab("relig")
    if cults is not None:
        filled = [p for p in cults.iter(q("path")) if p.get("fill") not in (None, "none")]
        if not filled: print("  warning: cultures layer has no filled paths (hidden at save time?)", file=sys.stderr)
        layers["cultures"] = ([cults], None)
    if relig is not None:
        layers["religions"] = ([relig], None)

    borders = grab("borders")
    if borders is not None:
        for sub in borders:
            paths = [p for p in sub.iter(q("path")) if p.get("d")]
            if not paths:
                print("  note: %s is empty in this save" % sub.get("id"), file=sys.stderr)
        layers["borders"] = ([borders], None)

    zones = grab("zones")
    if zones is not None:
        n = set_names(zones, data["zones"], "zone")
        print("  zones: %d named from save data" % n)
        layers["zones"] = ([zones], None)

    routes = grab("routes")
    if routes is not None:
        n = set_names(routes, data["routes"], "route")
        print("  routes: %d named from save data" % n)
        layers["routes"] = ([routes], None)

    burgicons = grab("burgIcons", required=False)
    if burgicons is not None:
        visible = [g for g in burgicons.iter(q("g")) if g.get("data-group") == "icons" and g.get("opacity") not in (None, "0")]
        print("  burgIcons: %d visible icon groups" % len(visible))
        layers["burgicons"] = ([burgicons], None)

    labels = grab("labels")
    if labels is not None:
        nonempty = [g for g in labels if len(list(g))]
        print("  labels: non-empty groups: %s" % ", ".join(g.get("id") for g in nonempty))
        css = font_face_css(data["fonts"], {"Anta", "Orbitron"} & {
            g.get("font-family") for g in labels.iter(q("g")) if g.get("font-family")})
        layers["labels"] = ([labels], css or None)

    for name, (groups, css) in layers.items():
        svg = build_svg(width, height, groups, save_defs, hatch_defs, font_css=css)
        serialize(svg, "%s/%s.svg" % (args.out, name), args.scale)

    if args.composite:
        order = ["basemap", "cultures", "religions", "zones", "borders", "routes", "burgicons", "labels"]
        groups, css_all = [], []
        for name in order:
            if name in layers:
                gs, css = layers[name]
                groups.extend(gs)
                if css: css_all.append(css)
        svg = build_svg(width, height, groups, save_defs, hatch_defs,
                        font_css="\n".join(css_all) or None)
        serialize(svg, "%s/composite.svg" % args.out, args.scale)

if __name__ == "__main__":
    main()
