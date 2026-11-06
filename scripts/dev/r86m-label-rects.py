"""
Round eighty-six (review P's P1): where the close-up may write a region's name.

The close-up wrote each native region's name at the middle of the region's box clipped to the frame. A region whose shape
is not its box (the Cape Provinces' L, Chile's ribbon, Mexico, an archipelago) then had its name written on another
region's land whenever the frame cut it: on Hoodia alstonii's close-up "Cape Provinces" sat on southern Namibia.

From the outlines the close-up draws (static/app/maps/r/r-<code>.svg, r84g-region-maps.py's output, so the test is the
drawn shape's own), this writes src/lib/map/region-labels.ts: for each region up to four rectangles [s, w, n, e] wholly
inside its shape, the largest first, on a grid of a 24th of the region's extent (a cell inside when its middle is inside
and no edge of the outline crosses it), rounded inward. A region too thin or too small for one cell has one point: the
inside point farthest from its outline among a finer grid's (a pole of inaccessibility, roughly), as a rectangle of no
size. `still.ts` writes a name only at a point inside one of its region's rectangles within the frame, else not at all
(the regions are listed beside the map).

  python3 scripts/dev/r86m-label-rects.py
"""
import math, os, re, json

ROOT = __file__.rsplit('/', 3)[0]
DIR = f'{ROOT}/static/app/maps/r'
NUM = re.compile(r'-?(?:\d+\.?\d*|\.\d+)')
MOST = 4
CELLS = 24


def rings_of(d):
    """The path's rings as lists of (lon, lat): absolute moves, relative lines, y = -lat (r84g-region-maps.py's `path`)."""
    out = []
    for part in re.findall(r'M[^M]*', d):
        body = part[1:].rstrip('z')
        if 'l' in body:
            head, rel = body.split('l', 1)
        elif 'h0' in body:
            head, rel = body.replace('h0', ''), ''
        else:
            head, rel = body, ''
        x, y = [float(v) for v in NUM.findall(head)[:2]]
        ring = [(x, -y)]
        nums = [float(v) for v in NUM.findall(rel)]
        for i in range(0, len(nums) - 1, 2):
            x += nums[i]; y += nums[i + 1]
            ring.append((x, -y))
        out.append(ring)
    return out


def inside(px, py, segs):
    c = False
    for ax, ay, bx, by in segs:
        if (ay > py) != (by > py) and px < ax + (bx - ax) * (py - ay) / (by - ay):
            c = not c
    return c


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def label_rects(rings):
    segs = [(a[0], a[1], b[0], b[1]) for r in rings for a, b in zip(r, r[1:] + r[:1]) if a != b]
    xs = [p[0] for r in rings for p in r]; ys = [p[1] for r in rings for p in r]
    w0, s0, e0, n0 = min(xs), min(ys), max(xs), max(ys)
    ext = max(e0 - w0, n0 - s0, 1e-6)
    cell = ext / CELLS
    W, H = int(math.ceil((e0 - w0) / cell)) + 1, int(math.ceil((n0 - s0) / cell)) + 1
    edge = set()
    for ax, ay, bx, by in segs:
        n = max(1, int(max(abs(bx - ax), abs(by - ay)) / (cell / 8)))
        for i in range(n + 1):
            t = i / n
            edge.add((int((ax + (bx - ax) * t - w0) // cell), int((ay + (by - ay) * t - s0) // cell)))
    grid = [[(i, j) not in edge and inside(w0 + (i + 0.5) * cell, s0 + (j + 0.5) * cell, segs) for i in range(W)] for j in range(H)]
    rects = []
    for _ in range(MOST):
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
                    if hh * (i - k) > best[0]: best = (hh * (i - k), (j - hh + 1, k, j, i - 1))
                    start = k
                st.append((start, cur))
        if not best[1]: break
        j0, i0, j1, i1 = best[1]
        rects.append((s0 + j0 * cell, w0 + i0 * cell, s0 + (j1 + 1) * cell, w0 + (i1 + 1) * cell))
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1): grid[j][i] = False
    if rects:
        # Rounded inward, to a tenth of a cell or finer, so a rounded rectangle stays inside the one found.
        places = max(1, min(4, math.ceil(-math.log10(cell / 10))))
        q = 10 ** places
        out = []
        for s, w, n, e in rects:
            m = cell / 20  # and a twentieth of a cell in from each side, so a corner on a cell's edge is not on the outline
            r = [math.ceil((s + m) * q) / q, math.ceil((w + m) * q) / q, math.floor((n - m) * q) / q, math.floor((e - m) * q) / q]
            if r[0] < r[2] and r[1] < r[3]: out.append([round(v, places) for v in r])
        if out: return out
    # No cell wholly inside (an archipelago of islets, a thin strip): in the largest ring, the inside point farthest from
    # the outline on a grid of a 32nd of that ring's own extent; rings in order of size until one has such a point.
    def area(r):
        return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1]))) / 2
    for ring in sorted(rings, key=area, reverse=True):
        rx = [p[0] for p in ring]; ry = [p[1] for p in ring]
        f = max(max(rx) - min(rx), max(ry) - min(ry)) / 32
        if f <= 0: continue
        best, at = -1, None
        for j in range(33):
            for i in range(33):
                px, py = min(rx) + (i + 0.5) * f, min(ry) + (j + 0.5) * f
                if not inside(px, py, segs): continue
                dd = min(seg_dist(px, py, *sg) for sg in segs)
                if dd > best: best, at = dd, (py, px)
        if at is not None:
            # Rounded to a ten-thousandth of a degree (about 11 m) only where that stays inside.
            r4 = (round(at[0], 4), round(at[1], 4))
            pt = r4 if inside(r4[1], r4[0], segs) else at
            return [[pt[0], pt[1], pt[0], pt[1]]]
    # A ring of no area: its first point, on the islet's own outline.
    at = (rings[0][0][1], rings[0][0][0])
    return [[round(at[0], 4), round(at[1], 4), round(at[0], 4), round(at[1], 4)]]


labels = {}
for name in sorted(os.listdir(DIR)):
    m = re.fullmatch(r'r-([A-Z]{3})\.svg', name)
    if not m: continue
    d = re.search(r' d="([^"]+)"', open(f'{DIR}/{name}').read()).group(1)
    labels[m.group(1)] = label_rects(rings_of(d))

ts = ['/**',
      " * Where the close-up may write each region's name (round eighty-six; review P's P1). Written by",
      ' * scripts/dev/r86m-label-rects.py from the close-up\'s own outlines (static/app/maps/r/): do not edit by hand.',
      ' * For each region up to four rectangles [s, w, n, e] wholly inside its drawn shape, the largest first; a region too',
      ' * small or thin for one has a single inside point, as a rectangle of no size.',
      ' */',
      'export const LABEL_AT: Readonly<Record<string, ReadonlyArray<readonly [number, number, number, number]>>> = ' + json.dumps(labels, separators=(',', ':')) + ';',
      '']
open(f'{ROOT}/src/lib/map/region-labels.ts', 'w').write('\n'.join(ts))
print('region-labels.ts', os.path.getsize(f'{ROOT}/src/lib/map/region-labels.ts'), 'bytes;', len(labels), 'regions,', sum(1 for v in labels.values() if v[0][0] == v[0][2]), 'with a point only')
