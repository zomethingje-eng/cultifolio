"""
Round eighty-four, G (review W1): the maps draw the native regions' shapes, not their bounding boxes.

From the regions' outlines (r80a-tdwg-shapes.py's `--draw`: the range test's own regions, each one's states and provinces
dissolved into one, from Natural Earth, public domain), this writes the files the maps draw them from, each one path a region, referenced like the coastline
(`<use href="/maps/regions110.svg#CPP">`), so a page carries a few dozen bytes a region and the file is fetched once and
kept a day (`_headers`, /maps/*):
  - static/app/maps/regions110.svg, for the world maps (rings simplified to 0.3 degrees, islets under half a degree
    left out; about 118 kB, 32 kB compressed);
  - static/app/maps/regions50.svg, for the close-up (0.08 degrees, about 9 km, islets under 0.06 degrees left out;
    about 436 kB, 143 kB compressed: the 1:50m coastline it is drawn on is 260 kB);
  - src/lib/map/regions-drawn.ts: which region a box is (the dossiers name a region's box, the maps draw its shape), and
    for each region up to three rectangles wholly inside its shape (a quarter-degree grid), by which the close-up says
    "inside" a region whose shape holds the whole frame (Echeveria desmetiana's records, all within Mexico Central).
A region with no shape (three: Cocos (Keeling) and Christmas Is., and the South China Sea) is drawn as its box, as before.

  python3 scripts/dev/r80a-tdwg-shapes.py <the tables and Natural Earth's file, as it says> scripts/tdwg3-shapes.json <tblGazetteer.txt> --draw draw.json
  python3 scripts/dev/r84g-region-maps.py draw.json
"""
import json, math, os

import sys
ROOT = __file__.rsplit('/', 3)[0]
SH = json.load(open(f'{ROOT}/scripts/tdwg3-shapes.json'))['shapes']
# The regions' outlines, their states and provinces dissolved (`r80a-tdwg-shapes.py ... --draw <draw.json>`): one ring list a region.
OUT = json.load(open(sys.argv[1]))['outlines']
assert set(OUT) == set(SH), 'the outlines are not of the shapes file: make both with the same run of r80a-tdwg-shapes.py'

BOX = {r[0]: r[2:] for r in json.load(open(f'{ROOT}/src/lib/dossier/tdwg3.json'))}

def dp(pts, tol):
    if len(pts) < 4: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay; L = (dx * dx + dy * dy) ** 0.5
        best, at = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > best: best, at = d, i
        if best > tol: keep[at] = True; stack += [(a, at), (at, b)]
    return [p for p, k in zip(pts, keep) if k]

def num(v, places):
    s = f'{v:.{places}f}'.rstrip('0').rstrip('.') if places else str(int(round(v)))
    if s in ('-0', ''): s = '0'
    return s.replace('0.', '.', 1) if s.startswith('0.') else s.replace('-0.', '-.', 1) if s.startswith('-0.') else s

def span(ring):
    xs = [x for x, y in ring]; ys = [y for x, y in ring]
    return max(max(xs) - min(xs), max(ys) - min(ys)) / 1000

def path(rings, tol, places, least):
    """One region's outline as one path (its rings drawn even-odd, so a lake is a hole): absolute moves, relative lines,
    y = -lat as the coastline files are. An islet or a lake less than `least` degrees across is left out, unless the
    region has no larger ring (an atoll's region keeps its largest)."""
    q = 10 ** places
    out = []
    big = max(span(r) for r in rings)
    for k, ring in enumerate(rings):
        if span(ring) < least and span(ring) < big: continue
        if True:
            pts = [(x / 1000, y / 1000) for x, y in ring]
            s = dp(pts, tol)
            if len(s) < 4:
                s = dp(pts, tol / 10)
                if len(s) < 4: s = pts
            p = [(round(x * q), round(-y * q)) for x, y in s]
            # Drop repeats the rounding makes; a ring of fewer than three points left is a dot, kept as one.
            r = [p[0]] + [b for a, b in zip(p, p[1:]) if b != a]
            seg = f'M{num(r[0][0] / q, places)} {num(r[0][1] / q, places)}'
            seg += 'l' + ' '.join(f'{num((b[0] - a[0]) / q, places)} {num((b[1] - a[1]) / q, places)}' for a, b in zip(r, r[1:])) if len(r) > 1 else 'h0'
            out.append(seg + 'z')
    return ''.join(out).replace(' -', '-')

def svg(tol, places, least):
    paths = ''.join(f'<path id="{c}" fill-rule="evenodd" vector-effect="non-scaling-stroke" d="{path(OUT[c], tol, places, least)}"/>' for c in sorted(SH))
    return f'<svg xmlns="http://www.w3.org/2000/svg">{paths}</svg>\n'

# Rectangles wholly inside a shape: a quarter-degree grid, a cell inside when its middle is inside and no edge crosses it.
CELL = 0.25
def inner(rings):
    xs = [x / 1000 for poly in rings for ring in poly for x, y in ring]; ys = [y / 1000 for poly in rings for ring in poly for x, y in ring]
    w0, s0 = math.floor(min(xs) / CELL) * CELL, math.floor(min(ys) / CELL) * CELL
    W, H = int(math.ceil((max(xs) - w0) / CELL)) + 1, int(math.ceil((max(ys) - s0) / CELL)) + 1
    if W * H > 4_000_000: return []
    edge = set()
    segs = []
    for poly in rings:
        for ring in poly:
            pts = [(x / 1000, y / 1000) for x, y in ring]
            for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
                segs.append((ax, ay, bx, by))
                n = max(1, int(max(abs(bx - ax), abs(by - ay)) / (CELL / 4)))
                for i in range(n + 1):
                    t = i / n
                    edge.add((int((ax + (bx - ax) * t - w0) // CELL), int((ay + (by - ay) * t - s0) // CELL)))
    grid = [[False] * W for _ in range(H)]
    for j in range(H):
        lat = s0 + (j + 0.5) * CELL
        cross = sorted(ax + (bx - ax) * (lat - ay) / (by - ay) for ax, ay, bx, by in segs if (ay > lat) != (by > lat))
        for a, b in zip(cross[0::2], cross[1::2]):
            for i in range(max(0, int((a - w0) / CELL - 0.5) + 1), min(W, int((b - w0) / CELL - 0.5) + 1)):
                if (i, j) not in edge: grid[j][i] = True
    rects = []
    for _ in range(3):
        best = (0, None)
        h = [0] * W
        for j in range(H):
            for i in range(W): h[i] = h[i] + 1 if grid[j][i] else 0
            st = []
            for i in range(W + 1):
                cur = h[i] if i < W else 0
                start = i
                while st and st[-1][1] >= cur:
                    k, hh = st.pop()
                    # A frame is at least two degrees by three: a smaller rectangle never holds one.
                    if hh * CELL >= 2 and (i - k) * CELL >= 2 and hh * (i - k) > best[0]: best = (hh * (i - k), (j - hh + 1, k, j, i - 1))
                    start = k
                st.append((start, cur))
        if not best[1]: break
        j0, i0, j1, i1 = best[1]
        rects.append([round(s0 + j0 * CELL, 2), round(w0 + i0 * CELL, 2), round(s0 + (j1 + 1) * CELL, 2), round(w0 + (i1 + 1) * CELL, 2)])
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1): grid[j][i] = False
    return rects

os.makedirs(f'{ROOT}/static/app/maps', exist_ok=True)
for name, tol, places, least in ((('regions110', 0.3, 1, 0.5), ('regions50', 0.08, 2, 0.06))):
    open(f'{ROOT}/static/app/maps/{name}.svg', 'w').write(svg(tol, places, least))
    print(name, os.path.getsize(f'{ROOT}/static/app/maps/{name}.svg'), 'bytes')
keys = {}
for c, b in BOX.items():
    if c in SH: keys[f'{b[0]},{b[1]}'] = c
assert len(keys) == len(SH), 'two regions share a box corner'
ins = {c: r for c in sorted(SH) if (r := inner([[ring] for ring in OUT[c]]))}
ts = ['/**',
      ' * The regions the maps draw by their shapes (round eighty-four, G; review W1). Written by scripts/dev/r84g-region-maps.py',
      ' * from scripts/tdwg3-shapes.json: do not edit by hand.',
      ' * `REGION_AT` names the region a box is, by its south-west corner as tdwg3.json and every dossier give it; `INSIDE`',
      ' * gives, for each region large enough, up to three rectangles [s, w, n, e] wholly inside its shape.',
      ' */',
      f"export const REGIONS_WORLD = '/maps/regions110.svg';",
      f"export const REGIONS_CLOSE = '/maps/regions50.svg';",
      'export const REGION_AT: Readonly<Record<string, string>> = ' + json.dumps(keys, separators=(',', ':')) + ';',
      'export const INSIDE: Readonly<Record<string, ReadonlyArray<readonly [number, number, number, number]>>> = ' + json.dumps(ins, separators=(',', ':')) + ';',
      '']
open(f'{ROOT}/src/lib/map/regions-drawn.ts', 'w').write('\n'.join(ts))
print('regions-drawn.ts', os.path.getsize(f'{ROOT}/src/lib/map/regions-drawn.ts'), 'bytes;', len(keys), 'regions,', len(ins), 'with an inside rectangle')
