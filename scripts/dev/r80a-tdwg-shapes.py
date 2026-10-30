"""
Round eighty, agent A: the regions' shapes for the range test (scripts/tdwg3-shapes.json). Round eighty-four, G: the same
idea places nearly every region (review D2, A2, W1); `--report` writes how each state or province and each polygon was
placed, and why each region still without a shape has none.

TDWG's own level-3 polygons (github.com/tdwg/wgsrpd, level3/) are not openly licensed: their metadata says the boundaries
are "the intellectual property of ESRI and its licensors ... All Rights Reserved". So the shapes are made here from Natural
Earth's 1:10m states and provinces (public domain, naturalearthdata.com), each assigned to a TDWG level-3 region by TDWG's
own tables of the second edition (tblLevel3.txt, tblLevel4.txt: each basic recording unit's country ISO code and name;
tblGazetteer.txt, round eighty-four: the places TDWG names, every Russian oblast among them, with the region of each):
  - a state or province of a country TDWG holds as one level-3 region is that region's;
  - else the one level-3 region of that country whose level-4 unit (or level-3 name) has the same name;
  - else the one level-3 region of that country whose bounding box (tdwg3.json) holds the middle of its largest ring;
  - else (round eighty-four) the one region of that country TDWG's gazetteer files the province's name under;
  - else (round eighty-four), of the regions of that country whose box holds that middle, the one where the country is
    the whole region (a unit `-OO`) rather than a named part of it (Hampshire is in Great Britain, not in France's
    Channel Islands, though both boxes hold it); else the smallest such box, and the report names each one so placed;
  - a state or province Natural Earth gives no code of TDWG's tables (Somaliland, South Sudan, Northern Cyprus and a few
    more, `NE_L3`) is its TDWG region's; one whose code no unit carries (Jersey, Guernsey, Sint Maarten) is the region
    TDWG's gazetteer files its name under (round eighty-four).
Then each polygon of a placed state or province (round eighty-four: before, one remote island kept a whole region out):
  - one whose middle is in its region's box, or that lies within the box a degree either way and in no other box of its
    country's regions, stays; where it reaches more than a degree beyond the box it is cut to the box and a tenth of a
    degree (TDWG's region lies inside its box, so the cut takes nothing of the region: Western Sahara out of Morocco's
    Guelmim, the east of Gilgit-Baltistan out of Pakistan's Northern Areas);
  - else one whose middle is in exactly one box of another region of the same country goes to that region (Marion and
    Prince Edward Islands out of the Western Cape; the Bonin Islands out of Tokyo; Easter Island out of Valparaiso;
    Socotra out of Hadramawt; Jan Mayen out of Nordland to Svalbard; Labrador out of Newfoundland and Labrador);
  - else, for a country TDWG holds as one region, an island in no region's box is that region's (Ebon in the Marshall
    Islands: TDWG's box leaves it out);
  - else it is left out, and the report names it.
A region is written only when every state or province of each of its countries was placed, and each of its level-4 units'
countries placed one in it at least (round eighty-three, C: a unit whose code no state or province carries, or whose every
province went to another region, is not in the shape), so it is the whole region; any other keeps its bounding box
(tdwg3.json), and the build says the range was tested by its box.

The tables are those of github.com/tdwg/wgsrpd ("109-488-1-ED/2nd Edition/"), and the states and provinces Natural Earth's
geojson/ne_10m_admin_1_states_provinces.geojson of github.com/nvkelso/natural-earth-vector (version 5.1.1). With `--r83`
(and no gazetteer) the script writes round eighty-three's file byte for byte.
Each ring is simplified (Douglas-Peucker, 0.02 degrees, about 2 km), unless that leaves it fewer than four points, and
written in thousandths of a degree.

  python3 scripts/dev/r80a-tdwg-shapes.py <tblLevel3.txt> <tblLevel4.txt> <ne_10m_admin_1_states_provinces.geojson> <out.json> <tblGazetteer.txt> [--report <report.json>] [--draw <draw.json>]

`--draw` also writes each shaped region's outline for the maps (scripts/dev/r84g-region-maps.py reads it): its states and
provinces dissolved into one, by taking out every edge two of them share (Natural Earth's neighbouring provinces share
their border's points exactly), so a map draws the region's edge and none of the borders inside it.
  python3 scripts/dev/r80a-tdwg-shapes.py <tblLevel3.txt> <tblLevel4.txt> <ne_10m_admin_1_states_provinces.geojson> <out.json> --r83
"""
import json, sys, unicodedata, re, collections

args = sys.argv[1:]
R83 = '--r83' in args
if R83: args.remove('--r83')
REPORT = None
if '--report' in args:
    i = args.index('--report'); REPORT = args[i + 1]; del args[i:i + 2]
DRAW = None
if '--draw' in args:
    i = args.index('--draw'); DRAW = args[i + 1]; del args[i:i + 2]
l3f, l4f, a1f, out = args[:4]
gzf = args[4] if len(args) > 4 and not R83 else None
if not R83 and not gzf: sys.exit('the gazetteer (tblGazetteer.txt) is the fifth argument; --r83 writes round eighty-three\'s file without it')
# The regions' boxes as the build has them (src/lib/dossier/tdwg3.json: code, name, s, w, n, e).
BOX = {r[0]: r[2:] for r in json.load(open(__file__.rsplit('/', 3)[0] + '/src/lib/dossier/tdwg3.json'))}
def inbox(code, lat, lon, m=0.0):
    b = BOX.get(code)
    return bool(b) and b[0] - m <= lat <= b[2] + m and (b[1] - m <= lon <= b[3] + m if b[1] <= b[3] else (lon >= b[1] - m or lon <= b[3] + m))
def nearbox(code, lat, lon):
    # Within the region's box, a degree either way (the check below on a whole shape); a box across 180° holds anything.
    b = BOX.get(code)
    return not b or b[1] > b[3] or (b[0] - 1 <= lat <= b[2] + 1 and b[1] - 1 <= lon <= b[3] + 1)
def within1(code, ring):
    # A ring within the region's box a degree either way (a box across 180° holds anything).
    b = BOX.get(code); xs = [x for x, y in ring]; ys = [y for x, y in ring]
    return not b or b[1] > b[3] or (min(ys) >= b[0] - 1 and max(ys) <= b[2] + 1 and min(xs) >= b[1] - 1 and max(xs) <= b[3] + 1)
def boxarea(code):
    b = BOX[code]
    return (b[2] - b[0]) * ((b[3] - b[1]) % 360)
def ringcentre(ring):
    return sum(y for x, y in ring) / len(ring), sum(x for x, y in ring) / len(ring)
def centre(g):
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    return ringcentre(max((p[0] for p in polys), key=len))

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
# Round eighty-three (C): the second edition writes the codes of 2001. Former Yugoslavia's units are under YU, a code no
# state or province carries now (Bosnia-Herzegovina is BA, Kosovo XK, Montenegro ME, Serbia RS), and Slovenia is under SL,
# Sierra Leone's (Slovenia's is SI); so Yugoslavia's shape was Croatia's and Macedonia's alone, and a record in Slovenia,
# Bosnia, Serbia, Montenegro or Kosovo was outside the range. The Spratly Is. are written SI, Slovenia's: Natural Earth
# gives them no code, so they keep their box. Navassa I. is written PR, Puerto Rico's: Natural Earth files it under the
# US Minor Outlying Islands, whose other islands are not all placed, so it is read under Haiti's code, and Haiti's shape
# leaves the island (about 5 km², with no one living on it) out, as it did.
L4_ISO = {'NAM-OO': 'NA', 'YUG-BH': 'BA', 'YUG-KO': 'XK', 'YUG-MN': 'ME', 'YUG-SE': 'RS', 'YUG-SL': 'SI', 'SCS-SI': '', 'HAI-NI': 'HT'}
if not R83:
    # Round eighty-four (G): the other codes of 2001 no state or province carries now, read as Natural Earth files the
    # places. The Coco Is. are Burma's (BU), now Myanmar's (MM); East Timor's TP is TL. The Netherlands Antilles (AN) are
    # gone: Natural Earth files Bonaire, Saba and St Eustatius under the Netherlands (NL), Curaçao under its own code
    # (CW) and Sint Maarten under its own (SX, placed by the gazetteer). It files Svalbard and Jan Mayen (SJ) and Bouvet
    # Island (BV) under Norway, and the Paracel Is. (PI) under China.
    # TDWG's tables write Belarus and Latvia under Russia's code (RU): no state or province of Belarus (BY) or Latvia (LV) was
    # placed, so the Baltic States' shape left Latvia out and Belarus had none. The Mozambique Channel Is. (MCI) are written
    # under Réunion's code; Natural Earth files them under the French Southern Lands (TF), as Iles Eparses.
    L4_ISO.update({'AND-CO': 'MM', 'LSI-ET': 'TL', 'NLA-BO': 'NL', 'NLA-CU': 'CW', 'LEE-NL': 'NL', 'SVA-OO': 'NO', 'BOU-OO': 'NO', 'SCS-PI': 'CN', 'BLR-OO': 'BY', 'BLT-LA': 'LV', 'MCI-OO': 'TF'})
# Round eighty-four (G): units no state or province of Natural Earth can stand for, so that a region is written without
# them: Aves I. (LEE-AV), a sandbank of Venezuela's, and Malpelo I. (CPI-MA), a rock of Colombia's, which Natural Earth
# does not draw; the Coco Is. (AND-CO), which Natural Earth draws with Myanmar's Ayeyarwady, inside Myanmar's box, so
# they stay in Myanmar's shape.
EXCUSED = set() if R83 else {'LEE-AV', 'CPI-MA', 'AND-CO'}
for r in L4:
    iso = (r.get('L4 ISOcode') or '').strip()
    r['L4 ISOcode'] = L4_ISO.get(r['L4 code'], ISO_FIX.get(iso, iso))
# Natural Earth files France's overseas regions under France: read by their own ISO codes, as TDWG does.
NE_ISO = {'La Réunion': 'RE', 'Martinique': 'MQ', 'Guadeloupe': 'GP', 'Guyane française': 'GF', 'Mayotte': 'YT'}
# Round eighty-three (C): Natural Earth gives no code of TDWG's tables to these countries of its own (by its `admin`), so
# they were never placed and their regions' shapes left them out, with nothing to say so: Somaliland out of Somalia's,
# South Sudan out of Sudan's (Kew's region is "Sudan-South Sudan"), the Gaza Strip and the West Bank out of Palestine's,
# Northern Cyprus and the two British bases out of Cyprus's, Aland out of Finland's, Baikonur out of Kazakhstan's and
# Guantanamo Bay out of Cuba's. Each is placed in its TDWG region. The Siachen Glacier, which TDWG's tables do not settle,
# stays out.
NE_L3 = {'Somaliland': 'SOM', 'S. Sudan': 'SUD', 'Gaza Strip': 'PAL', 'West Bank': 'PAL', 'Northern Cyprus': 'CYP', 'Akrotiri Sovereign Base Area': 'CYP', 'Dhekelia Sovereign Base Area': 'CYP', 'Aland': 'FIN', 'Baykonur Cosmodrome': 'KAZ', 'US Naval Base Guantanamo Bay': 'CUB'}
# Round eighty-four (G): Natural Earth files Crimea and Sevastopol under Russia; TDWG holds the peninsula as a region of
# its own, Krym, under Ukraine's code. Each is placed in it by name, and counted under Ukraine's code.
NE_NAME_L3 = {} if R83 else {'Crimea': ('KRY', 'UA'), 'Sevastopol': ('KRY', 'UA'),
    # The Iles Eparses (Europa, Bassas da India, Juan de Nova, Glorioso) are TDWG's Mozambique Channel Is. (the gazetteer's
    # "Europa I."); their middle is in no box, so no rule below places them.
    "Iles Eparses de l'ocean Indien": ('MCI', 'TF')}
# Round eighty-four (G): states or provinces no rule above places, where two of their country's boxes hold them whole,
# placed by what Natural Earth or TDWG's own unit says of them: New Zealand's by Natural Earth's `region` (Nelson,
# Marlborough and Tasman are "South Island", which New Zealand North's box overlaps); Brazil's Distrito Federal, TDWG's
# unit BZC-DF "Brazilia Distrito Federal"; Papua New Guinea's by its own regions (the Islands Region's Manus, New
# Ireland and East and West New Britain are the Bismarck Archipelago, the rest of the mainland is New Guinea's: the
# Bismarck Archipelago's box holds the highlands too).
NE_REGION_L3 = {} if R83 else {('NZ', 'South Island'): 'NZS', ('NZ', 'North Island'): 'NZN', ('BR', 'Distrito Federal'): 'BZC',
    **{('PG', n): 'BIS' for n in ('Manus', 'New Ireland', 'East New Britain', 'West New Britain')},
    **{('PG', n): 'NWG' for n in ('Sandaun', 'East Sepik', 'Madang', 'Morobe', 'Enga', 'Western Highlands', 'Southern Highlands', 'Eastern Highlands', 'Chimbu')}}
# Round eighty-four (G): the one province two regions share whose polygons no box can part: Çanakkale's Gallipoli peninsula
# and Imbros, on the European side of the Dardanelles, are Turkey-in-Europe; its Asian shore and Tenedos are Turkey's.
# Every polygon of Çanakkale lies in both regions' boxes. (Istanbul's two shores are parted by their share of the boxes.)
POLY_L3 = [] if R83 else [('TR', 'Çanakkale', lambda lat, lon: lat > 40.1, 'TUE')]
iso2l3 = collections.defaultdict(set)
names = collections.defaultdict(dict)  # iso -> norm name -> l3
unit_iso = {}  # L4 code -> its country code, as read above
for r in L4:
    iso = (r.get('L4 ISOcode') or '').strip()
    unit_iso[r['L4 code']] = iso
    if not iso: continue
    iso2l3[iso].add(r['L3 code'])
    names[iso][norm(r['L4 country'])] = r['L3 code']
for c, r in L3.items():
    for iso in (r.get('L3 ISOcode') or '').split(','):
        iso = iso.strip()
        if iso and c in iso2l3.get(iso, ()): names[iso].setdefault(norm(r['L3 area']), c)
# TDWG's gazetteer (round eighty-four): a name, and each of its synonyms, to the units it is filed under. Read with "Saint"
# as "St." and without "Atoll" and "Reef" (Natural Earth's "Palmyra Atoll" is the gazetteer's "Palmyra I.").
def gnorm(s):
    s = re.sub(r'\bsainte?\b', lambda m: 'st' if m.group(0) == 'saint' else 'ste', (s or '').lower())
    return norm(re.sub(r'\b(atoll|reef)\b', ' ', s))
gazetteer = collections.defaultdict(set)
if gzf:
    for r in rows(gzf):
        for n in [r.get('Gazetteer')] + (r.get('Synonym') or '').split(';'):
            k = gnorm(n)
            if k and r.get('L3 code'): gazetteer[k].add((r['L3 code'], r.get('L4 code') or ''))
def namesof(p):
    return [part for n in [p.get('name'), p.get('name_en'), p.get('name_alt'), p.get('region'), p.get('woe_name')] for part in (n or '').split('|')]
def gazof(p, lat, lon, boxed=True):
    """The units TDWG's gazetteer files a state or province's names under (each name and each part of a hyphenated one:
    "Tuamotu-Gambier"). With `boxed`, only a region whose box holds the province's middle a degree either way (the
    gazetteer files Russia's Tula oblast under South European Russia, whose box ends a degree and a half south of it);
    without, for a province no box of its country holds (Palmyra, Europa I.), any."""
    found = set()
    for n in namesof(p):
        for part in [n] + (n.split('-') if '-' in n else []):
            found |= {u for u in gazetteer.get(gnorm(part), ()) if not boxed or inbox(u[0], lat, lon, 1.0)}
    return found

a1 = json.load(open(a1f, encoding='utf-8'))
polys = collections.defaultdict(list)
unplaced = collections.defaultdict(list)
# The states and provinces placed in each region, by country code (round eighty-three, C).
placedin = collections.Counter()
how = collections.Counter()  # how each state or province was placed (the report)
byshare = []  # those placed by their area in the boxes (the report names each)
moved, cut, dropped, kept = [], [], [], []  # each polygon not simply left where its province was placed (the report)

def clip(ring, b, m):
    # Sutherland-Hodgman against the box and a margin; a ring is closed (its last point its first).
    s, w, n, e = b[0] - m, b[1] - m, b[2] + m, b[3] + m
    pts = [tuple(p) for p in (ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring)]
    for inside, cross in (
        (lambda p: p[0] >= w, lambda a, c: (w, a[1] + (c[1] - a[1]) * (w - a[0]) / (c[0] - a[0]))),
        (lambda p: p[0] <= e, lambda a, c: (e, a[1] + (c[1] - a[1]) * (e - a[0]) / (c[0] - a[0]))),
        (lambda p: p[1] >= s, lambda a, c: (a[0] + (c[0] - a[0]) * (s - a[1]) / (c[1] - a[1]), s)),
        (lambda p: p[1] <= n, lambda a, c: (a[0] + (c[0] - a[0]) * (n - a[1]) / (c[1] - a[1]), n)),
    ):
        res = []
        for i, c in enumerate(pts):
            a = pts[i - 1]
            if inside(c):
                if not inside(a): res.append(cross(a, c))
                res.append(c)
            elif inside(a): res.append(cross(a, c))
        pts = res
        if not pts: break
    return [list(p) for p in pts] + [list(pts[0])] if len(pts) >= 3 else []
def area(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))) / 2
def by_share(cands, poly):
    """The region whose box holds the largest share of a polygon's area; within two points of it, the smallest box."""
    a = area(poly[0])
    if not a: return None
    sh = {c: area(clip(poly[0], BOX[c], 0)) / a for c in cands if c in BOX and BOX[c][1] <= BOX[c][3]}
    best = max(sh.values(), default=0)
    return min((c for c, v in sh.items() if v >= best - 0.02), key=boxarea) if best > 0 else None

def place_poly(code, poly, iso, label, named):
    """Where one polygon of a state or province placed in `code` goes (round eighty-four): the module's comment says the rule."""
    if R83: return [(code, poly)]
    lat, lon = ringcentre(poly[0])
    # The other regions of its country whose box holds its middle; else whose box a twentieth of a degree wider does (San
    # Felix, Minami-Tori-shima and the Habomai islands lie just outside their own regions' boxes; Block Island, 0.07°
    # outside Massachusetts's, stays Rhode Island's).
    strict = [c for c in iso2l3.get(iso, ()) if c != code and inbox(c, lat, lon)]
    others = strict or [c for c in iso2l3.get(iso, ()) if c != code and inbox(c, lat, lon, 0.05)]
    # Its own box first; then another's that holds it (Naxos, a twentieth of a degree west of the East Aegean's box, is
    # in Greece's); then its own a tenth of a degree wider, or a degree wider where no other box of its country is near.
    if inbox(code, lat, lon) or (not strict and (inbox(code, lat, lon, 0.1) or (within1(code, poly[0]) and not others))):
        if within1(code, poly[0]): return [(code, poly)]
        rings = [clip(r, BOX[code], 0.1) for r in poly]
        if not rings[0]:
            dropped.append((code, label, round(lat, 2), round(lon, 2), 'nothing of it inside the box'))
            return []
        cut.append((code, label, round(lat, 2), round(lon, 2)))
        return [(code, [r for r in rings if r])]
    if others:
        to = min(others, key=boxarea)
        moved.append((code, to, label, round(lat, 2), round(lon, 2)) + ((f"the smallest of the boxes of {', '.join(sorted(others))}",) if len(others) > 1 else ()))
        return place_poly(to, poly, iso, label, named)
    if (named or len(iso2l3.get(iso, ())) == 1) and not any(inbox(c, lat, lon, 0.1) for c in BOX if c != code):
        kept.append((code, label, round(lat, 2), round(lon, 2)))
        return [(code, poly)]
    dropped.append((code, label, round(lat, 2), round(lon, 2), f"its middle is in no box of a region of {iso}" if not any(inbox(c, lat, lon, 0.1) for c in BOX if c != code) else 'its middle is in the box of a region of another country'))
    return []

for f in a1['features']:
    p = f['properties']
    iso = p.get('iso_a2') or ''
    if iso in ('-1', '-99', ''): iso = (p.get('iso_3166_2') or '')[:2]
    iso = NE_ISO.get(p.get('name') or '', iso)
    # A feature Natural Earth leaves unnamed is a scrap of islets (one off Yucatan, one off Colombia): not read.
    if not p.get('name'): continue
    g = f['geometry']
    lat, lon = centre(g) if g else (0, 0)
    code, named, split = None, True, None
    if p.get('name') in NE_NAME_L3: code, iso = NE_NAME_L3[p['name']]; cands = {code}; how['by name, under another country'] += 1
    else: cands = {NE_L3[p['admin']]} if p.get('admin') in NE_L3 else iso2l3.get(iso)
    # A place whose code no unit carries (Jersey, Guernsey, Sint Maarten, Clipperton) or that no region of its country holds
    # (Navassa I., under the US Minor Outlying Islands): the region TDWG's gazetteer files its name under, counted under
    # the country of the gazetteer's unit (the Channel Is. are the United Kingdom's in TDWG's tables, Navassa Haiti's).
    if not R83 and not code and (not cands or not any(inbox(c, lat, lon, 1.0) for c in cands)):
        gz = gazof(p, lat, lon, bool(cands))
        if len({u[0] for u in gz}) == 1 and len({unit_iso.get(u[1]) for u in gz} - {None, ''}) == 1:
            code = next(iter(gz))[0]; iso = next(iter({unit_iso.get(u[1]) for u in gz} - {None, ''})); cands = {code}; how['the gazetteer, under another country'] += 1
    label = f"{p.get('name')} ({iso})"
    if not cands: unplaced[iso].append(p.get('name')); continue
    if code: pass
    elif len(cands) == 1: code = next(iter(cands)); how['the one region of its country'] += 1
    else:
        for part in namesof(p):
            k = norm(part)
            if k and k in names[iso]: code = names[iso][k]; how['a unit of that name'] += 1; break
    if not code and g:
        boxed = [c for c in cands if inbox(c, lat, lon)]
        if len(boxed) == 1: code = boxed[0]; named = False; how['the one box holding it'] += 1
        elif not R83:
            gz = {u[0] for u in gazof(p, lat, lon, bool(boxed)) if u[0] in cands}
            rg = NE_REGION_L3.get((iso, p.get('region'))) or NE_REGION_L3.get((iso, p.get('name')))
            if len(gz) == 1: code = next(iter(gz)); how['the gazetteer'] += 1
            elif rg in cands: code = rg; how["Natural Earth's region or TDWG's unit"] += 1
            else:
                # Each polygon by the box that holds the largest share of it (Istanbul's two shores, Bursa in Asia).
                gpolys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
                code = by_share(cands, max(gpolys, key=lambda q: len(q[0])))
                if code:
                    named = False; how['the boxes holding the largest share of it'] += 1
                    split = [by_share(cands, q) or code for q in gpolys]
                    byshare.append((label, sorted(set(split)), sorted(cands)))
    if not code: unplaced[iso].append(p.get('name')); continue
    if not g: continue
    placedin[(code, iso)] += 1
    for i, poly in enumerate(g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
        at = split[i] if split else code
        for piso, pname, test, region in POLY_L3:
            if iso == piso and p.get('name') == pname and test(*ringcentre(poly[0])): at = region
        for c, q in place_poly(at, poly, iso, label, named):
            polys[c].append(q)
            if c != code: placedin[(c, iso)] += 1

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
    isos = {(r.get('L4 ISOcode') or '').strip() for r in L4 if r['L3 code'] == code and r['L4 code'] not in EXCUSED}
    if not isos or '' in isos or any(unplaced.get(i) for i in isos) or not polys.get(code):
        if R83: partial[code] = sorted(i for i in isos if unplaced.get(i)) or ['no state or province placed']
        else: partial[code] = sorted(f"{i}: {', '.join(sorted(unplaced[i]))} not placed" for i in isos if unplaced.get(i)) or ([f"a unit no country code is given ({', '.join(r['L4 code'] for r in L4 if r['L3 code'] == code and not r['L4 ISOcode'])})"] if '' in isos else ['no state or province of Natural Earth is in it'])
        continue
    # Each level-4 unit's country placed a state or province here (round eighty-three, C), else the unit is not in the shape.
    missing = sorted(f"{r['L4 code']} {r['L4 ISOcode']}" for r in L4 if r['L3 code'] == code and r['L4 code'] not in EXCUSED and not placedin[(code, (r.get('L4 ISOcode') or '').strip())])
    if missing:
        partial[code] = [f"no state or province of {', '.join(missing)} placed"]
        continue
    rings = []
    for poly in polys[code]:
        rr = []
        for ring in poly:
            s = dp(ring, 0.02)
            # A ring the simplification leaves with fewer than four points is an islet or a pond; it is kept as drawn
            # when it lies in the region's box, a degree either way (round eighty-three, C: 570 rings were lost, among
            # them Santa Fe in the Galapagos and most of the Maldives); one outside it is left out, as before.
            if len(s) < 4 and all(nearbox(code, y, x) for x, y in ring): s = ring
            if len(s) >= 4: rr.append([[round(x * 1000), round(y * 1000)] for x, y in s])
        if rr: rings.append(rr)
    b = BOX.get(code)
    xs = [x / 1000 for poly in rings for ring in poly for x, y in ring]; ys = [y / 1000 for poly in rings for ring in poly for x, y in ring]
    if not xs:
        partial[code] = ['no ring left']
        continue
    # A check on the assignment: the shape lies within the region's own box, a degree either way. Round eighty-four holds
    # each polygon to it above instead (bar a country's own island no box holds), so a remote ring no longer costs the region.
    if R83 and b and b[1] <= b[3] and not (min(ys) >= b[0] - 1 and max(ys) <= b[2] + 1 and min(xs) >= b[1] - 1 and max(xs) <= b[3] + 1):
        partial[code] = [f'shape outside its box ({min(ys):.1f},{min(xs):.1f} to {max(ys):.1f},{max(xs):.1f})']
        continue
    shapes[code] = rings
meta = {'source': "Natural Earth 1:10m admin 1 states and provinces (public domain, naturalearthdata.com), assigned to TDWG's level-3 regions by TDWG's tblLevel3.txt and tblLevel4.txt (WGSRPD second edition); Douglas-Peucker 0.02 degrees; coordinates in thousandths of a degree, [lon, lat]", 'regions': len(shapes), 'boxOnly': len(partial)}
if not R83:
    meta['source'] = meta['source'].replace('tblLevel3.txt and tblLevel4.txt', 'tblLevel3.txt, tblLevel4.txt and tblGazetteer.txt')
    # The rule the file was made by: a dossier's record of its sources names it, and `--check-ranges` lists a page derived before it.
    meta['rule'] = 'r84'
json.dump({'meta': meta, 'shapes': shapes}, open(out, 'w'), separators=(',', ':'))
print(f"{len(shapes)} regions with shapes, {len(partial)} by their box only")
print('box only:', ' '.join(f"{c}({'; '.join(v)})" for c, v in sorted(partial.items())))
if REPORT:
    json.dump({'regions': len(shapes), 'boxOnly': {c: {'name': L3[c]['L3 area'], 'why': v} for c, v in sorted(partial.items())}, 'placedBy': dict(how), 'byShare': byshare,
               'moved': moved, 'cut': cut, 'dropped': dropped, 'kept': kept, 'excused': sorted(EXCUSED)}, open(REPORT, 'w'), indent=1, ensure_ascii=False)

if DRAW:
    def outline(polys_):
        """The region's states and provinces as one: every edge two of them share taken out, the rest chained into rings."""
        key = lambda q: (round(q[0], 7), round(q[1], 7))
        edges = collections.Counter()
        for poly in polys_:
            for ring in poly:
                pts = [key(q) for q in ring]
                for a, b in zip(pts, pts[1:] + pts[:1]):
                    if a != b: edges[(a, b)] += 1
        left = {}
        for (a, b), n in edges.items():
            if (b, a) in edges: continue
            left.setdefault(a, []).append(b)
        rings = []
        while left:
            a = next(iter(left)); ring = [a]; cur = a
            while True:
                nxt = left.get(cur)
                if not nxt: break
                b = nxt.pop()
                if not nxt: del left[cur]
                if b == a: break
                ring.append(b); cur = b
            if len(ring) >= 3: rings.append(ring)
        out_ = []
        for ring in rings:
            q = dp(ring + [ring[0]], 0.02)
            if len(q) < 4: q = ring + [ring[0]]
            if len(q) >= 4: out_.append([[round(x * 1000), round(y * 1000)] for x, y in q])
        return out_
    json.dump({'meta': {'source': meta['source'] + '; states and provinces dissolved into their region, for the maps'}, 'outlines': {c: outline(polys[c]) for c in shapes}}, open(DRAW, 'w'), separators=(',', ':'))
    print(f"outlines of {len(shapes)} regions → {DRAW}")
