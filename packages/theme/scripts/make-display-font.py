"""Creates the static Peakr-Display font and the outlined wordmark from the Archivo variable font.

Archivo (SIL Open Font License 1.1) – source: https://github.com/google/fonts/tree/main/ofl/archivo
The width axis is unreliable in React Native, so app and web both use this static instance:
wght 800 / wdth 112.

Outputs:
  fonts/Peakr-Display.ttf   static instance
  assets/wordmark.json      "peakr" at font size 50, tracking -0.03em, kerned with HarfBuzz, outlined
                            as one SVG path with its tight bounding box at the origin (read by
                            `pnpm brand:assets`, which writes src/logo.generated.ts and the SVGs)

Usage (needs `pip install fonttools uharfbuzz`):
    python packages/theme/scripts/make-display-font.py "path/to/Archivo[wdth,wght].ttf"
"""

import json
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FAMILY = "Peakr Display"
POSTSCRIPT = "PeakrDisplay-ExtraBoldSemiExpanded"
THEME = Path(__file__).resolve().parent.parent
FONT_OUT = THEME / "fonts" / "Peakr-Display.ttf"
WORDMARK_OUT = THEME / "assets" / "wordmark.json"

WORDMARK_TEXT = "peakr"
WORDMARK_SIZE = 50
WORDMARK_TRACKING_EM = -0.03


def make_font(source: str) -> None:
    static = instancer.instantiateVariableFont(
        TTFont(source), {"wght": 800, "wdth": 112}, updateFontNames=False
    )
    # Rename so the instance never clashes with an installed Archivo (Archivo has no Reserved Font Name).
    for record in static["name"].names:
        if record.nameID in (1, 4, 16):
            record.string = FAMILY
        elif record.nameID in (2, 17):
            record.string = "Regular"
        elif record.nameID == 6:
            record.string = POSTSCRIPT
        elif record.nameID == 3:
            record.string = f"{POSTSCRIPT};instance-wght800-wdth112"
    static["OS/2"].usWeightClass = 800
    static["OS/2"].usWidthClass = 6  # semi-expanded
    FONT_OUT.parent.mkdir(parents=True, exist_ok=True)
    static.save(FONT_OUT)
    print(f"Wrote {FONT_OUT}")


def make_wordmark() -> None:
    font = TTFont(FONT_OUT)
    upem = font["head"].unitsPerEm
    scale = WORDMARK_SIZE / upem
    tracking = WORDMARK_TRACKING_EM * upem

    hb_font = hb.Font(hb.Face(FONT_OUT.read_bytes()))
    buf = hb.Buffer()
    buf.add_str(WORDMARK_TEXT)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"kern": True, "liga": False})

    glyph_set = font.getGlyphSet()
    order = font.getGlyphOrder()

    def draw(pen_factory):
        x = 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            name = order[info.codepoint]
            # Font units → px at size 50, y flipped (SVG y points down), baseline at y = 0.
            pen = TransformPen(pen_factory, (scale, 0, 0, -scale, (x + pos.x_offset) * scale, 0))
            glyph_set[name].draw(pen)
            x += pos.x_advance + tracking

    bounds = BoundsPen(glyph_set)
    draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds

    svg = SVGPathPen(glyph_set, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    draw(TransformPen(svg, (1, 0, 0, 1, -x_min, -y_min)))

    WORDMARK_OUT.parent.mkdir(parents=True, exist_ok=True)
    WORDMARK_OUT.write_text(
        json.dumps(
            {
                "fontSize": WORDMARK_SIZE,
                "width": round(x_max - x_min, 2),
                "height": round(y_max - y_min, 2),
                "path": svg.getCommands(),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote {WORDMARK_OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    make_font(sys.argv[1])
    make_wordmark()
