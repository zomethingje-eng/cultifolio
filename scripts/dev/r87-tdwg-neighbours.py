"""
Round eighty-seven (browse, C7 and the region pages' "Next door"): which TDWG level-3 regions touch, and where the
browse map writes and hits each region, from the repository's own shapes file. Reads only the files named below and
writes two files.

What "next door" is. Two level-3 regions are next door when their shapes touch: some corner of one region's outline lies
within 0.022 degrees (about 2.4 km) of the other's outline. The outlines are scripts/tdwg3-shapes.json's `shapes` (round
eighty: Natural Earth 1:10m states and provinces, public domain, placed in TDWG's level-3 regions by TDWG's tables and
gazetteer; `meta.rule` r86), each state or province simplified by Douglas-Peucker at 0.02 degrees and written in
thousandths of a degree. A simplified outline keeps only corners of the original and lies within 0.02 degrees of it, and
two states that share a border in Natural Earth share its points, so a corner of one on the shared border is within
0.02 degrees of the other's simplified outline, and 0.001 more for the rounding to thousandths: 0.022 holds every shared
border and no strait wider than about 2.4 km (the Strait of Messina, 3 km, keeps Sicily and Italy apart). Regions that
meet at a single point (four corners) count, since their outlines touch there. Natural Earth's minor islands
(`islands`, placed in the region of the nearest shape) are left out: an islet off another region's coast is not a
border. The three regions the shapes file has no shape for (Cocos (Keeling) Is., Christmas I., the South China Sea; its
`meta.boxOnly`) have no neighbours here, and the pages say none is computed, never "none".

This is TDWG's scheme read through Natural Earth's borders, not a table of TDWG's: TDWG's own tables give the hierarchy
and no adjacency.

What is written:
- src/lib/browse/tdwg-neighbours.json: `next` (each region with a shape: the regions next door, by code, in code order),
  `noShape` (the three), and `source` (these words, short).
- src/lib/browse/map-points.json: for every level-3 region, where the browse map puts its name and its keyboard focus,
  and whether it is small: [lon, lat, small, w, s, e, n] to a tenth of a degree. The point is the middle of the largest
  rectangle wholly inside the region's drawn outline (src/lib/map/region-labels.ts, round eighty-six's `LABEL_AT`, from
  the close-up's own outlines), or the middle of TDWG's box for a region without one (src/lib/dossier/tdwg3.json). `small`
  is 1 where the outline's extent is under two degrees each way: the map then draws a ring around it, a bigger target for
  a finger than an island a few pixels wide. w, s, e, n is the outline's extent (the shapes file's, or TDWG's box).

  python3 scripts/dev/r87-tdwg-neighbours.py
"""
import json, math, re

ROOT = __file__.rsplit('/', 3)[0]
SH = json.load(open(f'{ROOT}/scripts/tdwg3-shapes.json'))
SHAPES = SH['shapes']
BOX = {r[0]: r[2:] for r in json.load(open(f'{ROOT}/src/lib/dossier/tdwg3.json'))}  # s, w, n, e
LABELS = json.loads(re.search(r'LABEL_AT[^=]*=\s*(\{.*\});', open(f'{ROOT}/src/lib/map/region-labels.ts').read(), re.S).group(1))

EPS = 22  # thousandths of a degree
CELL = 50


def rings(code):
    for poly in SHAPES[code]:
        for ring in poly:
            yield ring


def segments(code):
    for ring in rings(code):
        for i in range(len(ring) - 1):
            yield ring[i], ring[i + 1]


def bbox(code):
    xs, ys = [], []
    for ring in rings(code):
        for x, y in ring:
            xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def seg_dist(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


codes = sorted(SHAPES)
boxes = {c: bbox(c) for c in codes}
# Each region's segments on a grid of CELL thousandths, a segment in every cell its box touches (grown by EPS).
grid = {}
for c in codes:
    g = {}
    for a, b in segments(c):
        x0, x1 = sorted((a[0], b[0])); y0, y1 = sorted((a[1], b[1]))
        for gx in range((x0 - EPS) // CELL, (x1 + EPS) // CELL + 1):
            for gy in range((y0 - EPS) // CELL, (y1 + EPS) // CELL + 1):
                g.setdefault((gx, gy), []).append((a, b))
    grid[c] = g


def touches(a, b):
    """Whether some corner of a's outline is within EPS of b's."""
    gb = grid[b]
    bx0, by0, bx1, by1 = boxes[b]
    for ring in rings(a):
        for p in ring:
            if p[0] < bx0 - EPS or p[0] > bx1 + EPS or p[1] < by0 - EPS or p[1] > by1 + EPS:
                continue
            for s in gb.get((p[0] // CELL, p[1] // CELL), ()):
                if seg_dist(p, s[0], s[1]) <= EPS:
                    return True
    return False


nxt = {c: [] for c in codes}
for i, a in enumerate(codes):
    ax0, ay0, ax1, ay1 = boxes[a]
    for b in codes[i + 1:]:
        bx0, by0, bx1, by1 = boxes[b]
        if ax0 > bx1 + EPS or bx0 > ax1 + EPS or ay0 > by1 + EPS or by0 > ay1 + EPS:
            continue
        if touches(a, b) or touches(b, a):
            nxt[a].append(b); nxt[b].append(a)

no_shape = sorted(set(BOX) - set(SHAPES))
pairs = sum(len(v) for v in nxt.values()) // 2
json.dump({
    'source': "Regions whose outlines touch (a corner of one within 0.022 degrees, about 2.4 km, of the other's outline), from scripts/tdwg3-shapes.json: Natural Earth 1:10m states and provinces (public domain) placed in TDWG's level-3 regions (round eighty), simplified to 0.02 degrees; minor islands left out. Written by scripts/dev/r87-tdwg-neighbours.py.",
    'eps': EPS / 1000,
    'pairs': pairs,
    'noShape': no_shape,
    'next': {c: sorted(v) for c, v in nxt.items()},
}, open(f'{ROOT}/src/lib/browse/tdwg-neighbours.json', 'w'), separators=(',', ':'), ensure_ascii=False)

r1 = lambda v: round(v * 10) / 10
pts = {}
for c in sorted(BOX):
    s, w, n, e = BOX[c]
    if c in SHAPES:
        x0, y0, x1, y1 = boxes[c]
        w, s, e, n = x0 / 1000, y0 / 1000, x1 / 1000, y1 / 1000
    rect = (LABELS.get(c) or [None])[0]
    lat, lon = ((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2) if rect else ((s + n) / 2, (w + e) / 2)
    small = 1 if (e - w) < 2 and (n - s) < 2 else 0
    pts[c] = [r1(lon), r1(lat), small, r1(w), r1(s), r1(e), r1(n)]
json.dump({
    'source': "Label points: the middle of the largest rectangle inside each region's drawn outline (src/lib/map/region-labels.ts), or of TDWG's box (src/lib/dossier/tdwg3.json) for a region with none; small: an outline under two degrees each way. Written by scripts/dev/r87-tdwg-neighbours.py.",
    'at': pts,
}, open(f'{ROOT}/src/lib/browse/map-points.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(f'{len(codes)} regions with a shape, {pairs} pairs next door; no shape: {", ".join(no_shape)}; {sum(1 for v in pts.values() if v[2])} small')
