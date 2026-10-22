"""
Round eighty, agent A: the regions' shapes for the range test (src/lib/dossier/tdwg3-shapes.json).

TDWG's own level-3 polygons (github.com/tdwg/wgsrpd, level3/) are not openly licensed: their metadata says the boundaries
are "the intellectual property of ESRI and its licensors ... All Rights Reserved". So the shapes are made here from Natural
Earth's 1:10m states and provinces (public domain, naturalearthdata.com), each assigned to a TDWG level-3 region by TDWG's
own tables of the second edition (tblLevel3.txt, tblLevel4.txt: each basic recording unit's country ISO code and name):
  - a state or province of a country TDWG holds as one level-3 region is that region's;
  - else the one level-3 region of that country whose level-4 unit (or level-3 name) has the same name;
  - else the one level-3 region of that country whose bounding box (tdwg3.json) holds the middle of its largest ring;
  - a region is written only when every state or province of each of its countries was placed, so it is the whole region;
    any other keeps its bounding box (tdwg3.json), as before, and the build says the range was tested by its box.
Each ring is simplified (Douglas-Peucker, 0.02 degrees, about 2 km) and written in thousandths of a degree.

  python3 scripts/dev/r80a-tdwg-shapes.py <tblLevel3.txt> <tblLevel4.txt> <ne_10m_admin_1_states_provinces.geojson> <out.json>
"""
import json, sys, unicodedata, re, collections

l3f, l4f, a1f, out = sys.argv[1:5]
# The regions' boxes as the build has them (src/lib/dossier/tdwg3.json: code, name, s, w, n, e).
BOX = {r[0]: r[2:] for r in json.load(open(__file__.rsplit('/', 3)[0] + '/src/lib/dossier/tdwg3.json'))}
def inbox(code, lat, lon):
    b = BOX.get(code)
    return bool(b) and b[0] <= lat <= b[2] and (b[1] <= lon <= b[3] if b[1] <= b[3] else (lon >= b[1] or lon <= b[3]))
def centre(g):
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    ring = max((p[0] for p in polys), key=len)
    return sum(y for x, y in ring) / len(ring), sum(x for x, y in ring) / len(ring)

def rows(f):
    lines = open(f, encoding='latin-1').read().splitlines()
    h = lines[0].split('*')
    return [dict(zip(h, l.split('*'))) for l in lines[1:] if l.strip()]

def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').lower()
    s = re.sub(r'\b(i|is|islands?|isl|province|state|region|prov|dept|department)\b\.?', ' ', s)
    return re.sub(r'[^a-z]+', '', s)

L3 = {r['L3 code']: r for r in rows(l3f)}
L4 = rows(l4f)
# TDWG's tables write the United Kingdom's ISO code as UK, and Namibia's as ZA (South Africa's): read as GB and NA.
ISO_FIX = {'UK': 'GB'}
L4_ISO = {'NAM-OO': 'NA'}
for r in L4:
    iso = (r.get('L4 ISOcode') or '').strip()
    r['L4 ISOcode'] = L4_ISO.get(r['L4 code'], ISO_FIX.get(iso, iso))
# Natural Earth files France's overseas regions under France: read by their own ISO codes, as TDWG does.
NE_ISO = {'La Réunion': 'RE', 'Martinique': 'MQ', 'Guadeloupe': 'GP', 'Guyane française': 'GF', 'Mayotte': 'YT'}
iso2l3 = collections.defaultdict(set)
names = collections.defaultdict(dict)  # iso -> norm name -> l3
for r in L4:
    iso = (r.get('L4 ISOcode') or '').strip()
    if not iso: continue
    iso2l3[iso].add(r['L3 code'])
    names[iso][norm(r['L4 country'])] = r['L3 code']
for c, r in L3.items():
    for iso in (r.get('L3 ISOcode') or '').split(','):
        iso = iso.strip()
        if iso and c in iso2l3.get(iso, ()): names[iso].setdefault(norm(r['L3 area']), c)

a1 = json.load(open(a1f, encoding='utf-8'))
polys = collections.defaultdict(list)
unplaced = collections.defaultdict(list)
for f in a1['features']:
    p = f['properties']
    iso = p.get('iso_a2') or ''
    if iso in ('-1', '-99', ''): iso = (p.get('iso_3166_2') or '')[:2]
    iso = NE_ISO.get(p.get('name') or '', iso)
    # A feature Natural Earth leaves unnamed is a scrap of islets (one off Yucatan, one off Colombia): not read.
    if not p.get('name'): continue
    cands = iso2l3.get(iso)
    if not cands: unplaced[iso].append(p.get('name')); continue
    if len(cands) == 1: code = next(iter(cands))
    else:
        code = None
        for n in [p.get('name'), p.get('name_en'), p.get('name_alt'), p.get('region'), p.get('woe_name')]:
            for part in (n or '').split('|'):
                k = norm(part)
                if k and k in names[iso]: code = names[iso][k]; break
            if code: break
    if not code and f['geometry']:
        lat, lon = centre(f['geometry'])
        boxed = [c for c in cands if inbox(c, lat, lon)]
        if len(boxed) == 1: code = boxed[0]
    if not code: unplaced[iso].append(p.get('name')); continue
    g = f['geometry']
    if not g: continue
    for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
        polys[code].append(poly)

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

shapes, partial = {}, {}
for code in sorted(L3):
    isos = {(r.get('L4 ISOcode') or '').strip() for r in L4 if r['L3 code'] == code}
    if not isos or '' in isos or any(unplaced.get(i) for i in isos) or not polys.get(code):
        partial[code] = sorted(i for i in isos if unplaced.get(i)) or ['no state or province placed']
        continue
    rings = []
    for poly in polys[code]:
        rr = []
        for ring in poly:
            s = dp(ring, 0.02)
            if len(s) >= 4: rr.append([[round(x * 1000), round(y * 1000)] for x, y in s])
        if rr: rings.append(rr)
    # A check on the assignment: the shape lies within the region's own box, a degree either way.
    b = BOX.get(code)
    xs = [x / 1000 for poly in rings for ring in poly for x, y in ring]; ys = [y / 1000 for poly in rings for ring in poly for x, y in ring]
    if not xs:
        partial[code] = ['no ring left']
        continue
    if b and b[1] <= b[3] and not (min(ys) >= b[0] - 1 and max(ys) <= b[2] + 1 and min(xs) >= b[1] - 1 and max(xs) <= b[3] + 1):
        partial[code] = [f'shape outside its box ({min(ys):.1f},{min(xs):.1f} to {max(ys):.1f},{max(xs):.1f})']
        continue
    shapes[code] = rings
meta = {'source': "Natural Earth 1:10m admin 1 states and provinces (public domain, naturalearthdata.com), assigned to TDWG's level-3 regions by TDWG's tblLevel3.txt and tblLevel4.txt (WGSRPD second edition); Douglas-Peucker 0.02 degrees; coordinates in thousandths of a degree, [lon, lat]", 'regions': len(shapes), 'boxOnly': len(partial)}
json.dump({'meta': meta, 'shapes': shapes}, open(out, 'w'), separators=(',', ':'))
print(f"{len(shapes)} regions with shapes, {len(partial)} by their box only")
print('box only:', ' '.join(f"{c}({','.join(v)})" for c, v in sorted(partial.items())))
if len(sys.argv) > 5 and sys.argv[5] == 'all':
    print({k: v for k, v in unplaced.items() if k in {i for c in partial for i in partial[c]}})
    print('no ISO:', sorted({r['L3 code'] for r in L4 if not (r.get('L4 ISOcode') or '').strip()}))
elif len(sys.argv) > 5:
    for iso in sys.argv[5].split(','): print(iso, unplaced.get(iso), sorted(names[iso].items())[:80])
