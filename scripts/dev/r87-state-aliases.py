"""
Round eighty-seven (final review M2 of round eighty-six): the table of state and province aliases the border allowance
reads (src/lib/dossier/state-aliases.ts), made from two sources and written whole:

  1. ISO 3166-2, as the Debian iso-codes project publishes it (iso_3166-2.json; read here as pycountry 24.6.1 packages it,
     https://pypi.org/project/pycountry/24.6.1/, its databases/iso3166-2.json): each subdivision's code, with and without
     its country's prefix ("ZA-KZN", "KZN"), and its name where Natural Earth names the place otherwise ("Ciudad de
     Mexico"), each standing for the Natural Earth states and provinces the shapes file places (scripts/tdwg3-shapes.json,
     `places`) that it names: the one of its name, or, for a subdivision ISO divides further (Spain's autonomous
     communities, England's), those of its own subdivisions (ISO's `parent`).
  2. A short list of historical provinces, by hand below (HISTORICAL), each mapped to the current provinces whose land it
     held, by the law that made them: South Africa's four provinces of 1910 to 1994 (Constitution of the Republic of South
     Africa, 1993, Schedule 1, which drew the nine provinces from them), and Canada's names and post abbreviations before
     ISO's codes. Where an old province held land now in several, it stands for all of them, and the shape decides
     (admission-policy.ts).

Only the countries of more than one region in the shapes file are read: the border allowance reads a state only where
both sides of a border are of one country. An alias that would stand for another place's own name in its country is left
out and said. Run: python3 scripts/dev/r87-state-aliases.py <pycountry's iso3166-2.json> > src/lib/dossier/state-aliases.ts
(the same package's iso3166-1.json, beside it, gives the countries' names /about/how says).

Round eighty-seven's review (M1): ISO names China's, Russia's and Ukraine's subdivisions with their kind ("Yunnan Sheng",
"Amurskaja oblast'", "Vinnytska oblast"), and Natural Earth without it ("Yunnan", "Amur", "Vinnytsya"), so none of 34
Chinese, 82 Russian and 27 Ukrainian subdivisions had an alias. A name is now matched again with its kind taken off
(`ADMIN_SUFFIX`), and, where the kind followed an adjective (Russian "-skaja", Ukrainian "-ska"), the adjective's ending
too, Russian names read in Natural Earth's letters (`bgn`: ISO writes "j", "h" and "c" where Natural Earth writes "y",
"kh" and "ts"). Such a match is taken only where it reaches one place, and no other subdivision reaches that place; the
rest, by hand in ISO_AS_NAMED, each one checked against the ISO 3166-2 code Natural Earth gives the place
(ne_10m_admin_1_states_provinces, `iso_3166_2`, version 5.1.1). A subdivision may stand for a place the shapes file holds
under another country's code in one of its own country's regions (Crimea and Sevastopol, which Natural Earth files under
RU, in TDWG's Krym, a region of RU and UA).

The historical names are written apart (`STATE_HISTORICAL`), since only they may hold land on both sides of a border:
a current code stands for its place, and is read as that place's name is (`stateSide`, tdwg-shapes.ts).
"""
import json, os, re, sys, unicodedata
from collections import defaultdict

def state_key(s):
    """As `stateKey` in admission-policy.ts reads a name."""
    s = unicodedata.normalize('NFD', str(s or ''))
    s = re.sub('[̀-ͯ]', '', s).lower()
    s = re.sub(r'\b(province|provincia|provinz|state|estado|etat|region|departamento|department|dept|prov)\b\.?', ' ', s)
    return re.sub('[^a-z]+', '', s)

# Historical and conventional names, each with the current places (as Natural Earth names them) it stands for.
HISTORICAL = {
    'ZA': {
        # The four provinces of 1910 to 1994 (Schedule 1 of the 1993 Constitution drew the nine from them).
        'Natal': ['KwaZulu-Natal'],
        'Natal Province': ['KwaZulu-Natal'],
        'KwaZulu': ['KwaZulu-Natal'],
        'Orange Free State': ['Free State'],
        'Oranje Vrystaat': ['Free State'],
        'OFS': ['Free State'],
        'O.F.S.': ['Free State'],
        'Transvaal': ['Limpopo', 'Mpumalanga', 'Gauteng', 'North West'],
        'Tvl': ['Limpopo', 'Mpumalanga', 'Gauteng', 'North West'],
        'Cape Province': ['Western Cape', 'Eastern Cape', 'Northern Cape', 'North West'],
        'Cape of Good Hope': ['Western Cape', 'Eastern Cape', 'Northern Cape', 'North West'],
        'Cape Colony': ['Western Cape', 'Eastern Cape', 'Northern Cape', 'North West'],
        # The nine provinces' first names (1994), before Limpopo, Mpumalanga and Gauteng were named so.
        'Northern Province': ['Limpopo'],
        'Northern Transvaal': ['Limpopo'],
        'Eastern Transvaal': ['Mpumalanga'],
        'Pretoria-Witwatersrand-Vereeniging': ['Gauteng'],
        'PWV': ['Gauteng'],
        # ISO 3166-2's first codes for three of them (ISO 3166-2:1998), since changed to GP, KZN and LP.
        'ZA-GT': ['Gauteng'], 'GT': ['Gauteng'],
        'ZA-NL': ['KwaZulu-Natal'], 'NL': ['KwaZulu-Natal'],
        'ZA-NP': ['Limpopo'], 'NP': ['Limpopo'],
    },
    'CA': {
        # Canada Post's abbreviations before ISO's codes, and the names before 2001.
        'PQ': ['Québec'], 'Que.': ['Québec'],
        'NF': ['Newfoundland and Labrador'], 'Nfld.': ['Newfoundland and Labrador'], 'Newfoundland': ['Newfoundland and Labrador'],
        'Ont.': ['Ontario'], 'Alta.': ['Alberta'], 'Sask.': ['Saskatchewan'], 'Man.': ['Manitoba'],
        'N.W.T.': ['Northwest Territories'], 'Yukon Territory': ['Yukon'],
    },
    'MX': {
        # Mexico City's name and code before 2016 (ISO 3166-2's MX-DIF), as Natural Earth still names it.
        'MX-DIF': ['Distrito Federal'], 'DIF': ['Distrito Federal'], 'D.F.': ['Distrito Federal'], 'CDMX': ['Distrito Federal'],
        'Estado de México': ['México'],
    },
}

# ISO's name where Natural Earth names the same state shorter, by hand: each checked against both files.
ISO_AS_NAMED = {
    'MX-CMX': ['Distrito Federal'],
    'MX-COA': ['Coahuila'],
    'MX-MIC': ['Michoacán'],
    'MX-VER': ['Veracruz'],
    # Round eighty-seven's review (M1): those the kind's removal does not reach, each the place to which Natural Earth gives
    # the same ISO 3166-2 code (its `iso_3166_2`). But Moscow: Natural Earth gives RU-MOW to Moskovskaya (the oblast) and
    # RU-MOS to Moskva (the city), the other way round from ISO, whose names ("Moskva", "Moskovskaja oblast'") are read.
    'CN-NM': ['Inner Mongol'],
    'RU-AL': ['Gorno-Altay'], 'RU-ALT': ['Altay'], 'RU-CE': ['Chechnya'], 'RU-CHU': ['Chukchi Autonomous Okrug'],
    'RU-IN': ['Ingush'], 'RU-IVA': ['Ivanovo'], 'RU-KAM': ['Kamchatka'], 'RU-KB': ['Kabardin-Balkar'],
    'RU-KC': ['Karachay-Cherkess'], 'RU-KEM': ['Kemerovo'], 'RU-KK': ['Khakass'], 'RU-KLU': ['Kaluga'],
    'RU-KOS': ['Kostroma'], 'RU-KR': ['Karelia'], 'RU-MAG': ['Maga Buryatdan'], 'RU-MO': ['Mordovia'],
    'RU-NEN': ['Nenets'], 'RU-ORL': ['Orel'], 'RU-PNZ': ['Penza'], 'RU-PRI': ["Primor'ye"], 'RU-SA': ['Sakha (Yakutia)'],
    'RU-SAM': ['Samara'], 'RU-SE': ['North Ossetia'], 'RU-SPE': ['City of St. Petersburg'], 'RU-TUL': ['Tula'],
    'RU-TY': ['Tuva'], 'RU-VLG': ['Vologda'], 'RU-YAN': ['Yamal-Nenets'], 'RU-YAR': ["Yaroslavl'"], 'RU-ZAB': ['Chita'],
    'UA-05': ['Vinnytsya'], 'UA-21': ['Transcarpathia'], 'UA-23': ['Zaporizhzhya'], 'UA-30': ['Kiev City'],
    'UA-32': ['Kiev'], 'UA-43': ['Crimea'], 'UA-48': ['Mykolayiv'], 'UA-51': ['Odessa'], 'UA-53': ['Poltava'],
    'UA-56': ['Rivne'], 'UA-59': ['Sumy'], 'UA-68': ["Khmel'nyts'kyy"], 'UA-71': ['Cherkasy'], 'UA-77': ['Chernivtsi'],
    # Pakistan's, the same way: the West Himalaya's border with Pakistan's region runs between them.
    'PK-BA': ['Baluchistan'], 'PK-GB': ['Northern Areas'], 'PK-IS': ['F.C.T.'], 'PK-JK': ['Azad Kashmir'], 'PK-KP': ['K.P.'],
    'PK-SD': ['Sind'],
}

# The kind of subdivision ISO names after (or, Ukraine's Crimea, before) the name (round eighty-seven's review, M1): China's
# province, municipality, autonomous region (with its people's name) and special administrative region; Russia's oblast',
# kraj, republic, autonomous okrug and autonomous oblast'; Ukraine's oblast and autonomous republic.
ADMIN_SUFFIX = [
    r'\s+(?:(?:Zhuangzu|Huizu|Uygur)\s+)?Zizhiqu$', r'\s+Sheng$', r'\s+Shi$', r'\s+Tebiexingzhengqu$',
    r',\s*Respublika$', r'\s+Respublika$', r"\s+avtonomn(?:yj|yy|aja|aya)\s+(?:okrug|oblast')$", r"\s+oblast'?$",
    r'\s+(?:kraj|krai|kray)$', r'^Avtonomna\s+Respublika\s+',
]
# An adjective's endings before the kind, longest first, as `state_key` reads them (Russian in Natural Earth's letters).
ADJ_ENDINGS = {'RU': ['skaya', 'skiy', 'aya', 'iya', 'iy', 'ya', 'a'], 'UA': ['ska', 'ka', 'a']}

def bgn(s):
    """ISO's Russian romanisation (GOST 7.79's letters) in Natural Earth's (BGN/PCGN's): ja, ju, j as ya, yu, y; h as kh
    (not in zh, sh, ch, kh); c as ts (not in ch); an initial E as Ye; the soft sign's apostrophe dropped."""
    s = s.replace("'", '')
    s = s.replace('ja', 'ya').replace('ju', 'yu').replace('j', 'y')
    s = re.sub(r'(?<![kzscKZSC])h', 'kh', s)
    s = re.sub(r'^H', 'Kh', s)
    s = re.sub(r'c(?!h)', 'ts', s)
    return re.sub(r'^E', 'Ye', s)

def iso_keys(name):
    """An ISO name's keys: as `state_key` reads it, and with Turkish's dotless i read as i, which Natural Earth writes
    (ISO's "Aydın", Natural Earth's "Aydin"; but "Bartın" in both)."""
    return list(dict.fromkeys([state_key(name), state_key(name.replace('ı', 'i'))]))

def stripped_keys(cc, name):
    """A name's keys with its kind taken off, and an adjective's ending after it: empty when the name has no kind."""
    s = name
    for p in ADMIN_SUFFIX:
        s = re.sub(p, '', s, flags=re.I)
    if s == name:
        return []
    forms = [s] + ([bgn(s)] if cc == 'RU' else [])
    keys = []
    for f in forms:
        k = state_key(f)
        keys.append(k)
        for e in ADJ_ENDINGS.get(cc, []):
            if k.endswith(e) and len(k) > len(e) + 2:
                keys.append(k[:-len(e)])
    return list(dict.fromkeys(keys))

def main(iso_path, shapes_path='scripts/tdwg3-shapes.json'):
    iso = json.load(open(iso_path, encoding='utf-8'))['3166-2']
    shapes = json.load(open(shapes_path, encoding='utf-8'))
    regions_of = defaultdict(set)
    for code, ccs in shapes.get('countries', {}).items():
        for cc in ccs:
            regions_of[cc].add(code)
    countries = sorted(cc for cc, r in regions_of.items() if len(r) > 1)
    places = defaultdict(dict)  # cc -> place key -> name
    for code, ps in shapes.get('places', {}).items():
        for p in ps:
            name, _, cc = p.partition('|')
            if cc in countries and state_key(name):
                places[cc][state_key(name)] = name
    # A place the file holds under another country's code in a region of this one (Crimea|RU in TDWG's Krym, of RU and UA).
    for code, ps in shapes.get('places', {}).items():
        for p in ps:
            name, _, pc = p.partition('|')
            for cc in shapes.get('countries', {}).get(code, []):
                if cc in countries and cc != pc and state_key(name) and state_key(name) not in places[cc]:
                    places[cc][state_key(name)] = name
    by_code = {r['code']: r for r in iso}
    children = defaultdict(list)
    for r in iso:
        if 'parent' in r:
            children[r['code'][:2] + '-' + r['parent'] if '-' not in r['parent'] else r['parent']].append(r['code'])
    def names_of(r):
        # Round eighty-seven's review (M1): ISO's other name in brackets is a name too ("Lleida [Lérida]"), its code after
        # it left out ("Isle of Anglesey [Sir Ynys Môn GB-YNM]"); before, the brackets were read into the name.
        name = r['name'].replace('*', '')
        alt = [re.sub(r'\s+[A-Z]{2}-[A-Z0-9]{1,3}$', '', a) for a in re.findall(r'\[([^\]]*)\]', name)]
        out = []
        for n in re.split(r'\s*/\s*', re.sub(r'\s*\[[^\]]*\]', '', name)) + [a for a in alt if a]:
            if n not in out:
                out.append(n)
        return out
    stripped = {}  # ISO code -> the place its name reaches with its kind taken off (round eighty-seven's review, M1)
    for r in iso:
        cc = r['code'][:2]
        if cc in countries:
            hit = {k for n in names_of(r) for k in stripped_keys(cc, n) if k in places[cc]}
            if len(hit) == 1:
                stripped[r['code']] = hit
    def targets(code, seen=()):
        r = by_code[code]
        cc = code[:2]
        hit = {k for n in names_of(r) for k in iso_keys(n) if k in places[cc]} | {state_key(n) for n in ISO_AS_NAMED.get(code, []) if state_key(n) in places[cc]}
        if hit:
            return hit
        if code in stripped:
            return stripped[code]
        out = set()
        for c in children.get(code, []):
            if c not in seen:
                out |= targets(c, seen + (code,))
        return out
    # A place reached with the kind taken off that another subdivision reaches too is no one's for certain (Altaj,
    # Respublika and Altajskij kraj both read "Altay" so; ISO_AS_NAMED parts them): that match is left out and said.
    reached = defaultdict(set)
    for r in iso:
        if r['code'][:2] in countries:
            for k in targets(r['code']):
                reached[(r['code'][:2], k)].add(r['code'])
    table = defaultdict(dict)
    by = defaultdict(set)  # (cc, alias) -> the ISO codes that give it
    unmatched, dropped = [], []
    for code in sorted(stripped):
        (k,) = stripped[code]
        if len(reached[(code[:2], k)]) > 1:
            dropped.append(f"{code} {by_code[code]['name']}: reaches {places[code[:2]][k]} with its kind taken off, as {', '.join(sorted(reached[(code[:2], k)] - {code}))} does")
            del stripped[code]
    for r in iso:
        cc = r['code'][:2]
        if cc not in countries:
            continue
        t = targets(r['code'])
        if not t:
            unmatched.append(f"{r['code']} {r['name']}")
            continue
        sub = r['code'][3:]
        # The code itself under "=CC-SUB", which no name's key can be (a key is letters only); its suffix alone as a key
        # where it holds two letters or more ("KZN", "TX"; never Japan's "01").
        keys = {'=' + r['code'].upper()}
        if re.fullmatch('[A-Za-z]{2,3}', sub):
            keys.add(state_key(sub))
        keys |= {state_key(n) for n in names_of(r)}
        for k in keys:
            if not k or (k in places[cc] and {k} == t):
                continue
            if k in places[cc] and k not in t:
                dropped.append(f"{cc} {k} ({r['code']}): the own name of {places[cc][k]}")
                continue
            table[cc].setdefault(k, set()).update(t)
            by[(cc, k)].add(r['code'])
    # One alias given by two subdivisions (one's code, the other's name): it names neither for certain, and is left out.
    for (cc, k), codes in sorted(by.items()):
        if len(codes) > 1:
            dropped.append(f"{cc} {k}: given by {', '.join(sorted(codes))}")
            del table[cc][k]
    hist = defaultdict(set)  # cc -> the keys of historical names, which alone may stand for land on both sides
    for cc, h in HISTORICAL.items():
        for alias, now in h.items():
            k = '=' + alias.upper() if re.fullmatch('[A-Z]{2}-[A-Z0-9]{1,3}', alias) else state_key(alias)
            t = {state_key(n) for n in now}
            missing = [n for n in now if state_key(n) not in places[cc]]
            if missing:
                raise SystemExit(f'{cc} {alias}: {missing} not in the shapes file')
            # A historical name that is also a current code's alias would be read as the old province is: refused instead.
            if k in table[cc] and k not in hist[cc]:
                raise SystemExit(f'{cc} {alias}: an alias of a current subdivision too')
            table[cc].setdefault(k, set()).update(t)
            hist[cc].add(k)
    # Two subdivisions under one alias (a code's suffix that is another's name): ambiguous, left out.
    # A name's key is held as "~key" (a code as "=CC-SUB"), so no key of the table is a bare word of the source.
    held = lambda k: k if k.startswith('=') else '~' + k
    out = {cc: {held(k): sorted(v) for k, v in sorted(m.items())} for cc, m in sorted(table.items())}
    old = {cc: sorted(held(k) for k in ks) for cc, ks in sorted(hist.items())}
    n = sum(len(m) for m in out.values())
    # The subdivisions not matched, by country (round eighty-seven's review, M1), as the header and the run say them.
    per = defaultdict(int)
    for u in unmatched:
        per[u[:2]] += 1
    per_words = ', '.join(f'{cc} {per[cc]}' for cc in sorted(per))
    # The countries none of whose codes is read, by ISO 3166-1's name (the same package's iso3166-1.json), for /about/how.
    total = defaultdict(int)
    for r in iso:
        total[r['code'][:2]] += 1
    names1 = {c['alpha_2']: c['name'] for c in json.load(open(os.path.join(os.path.dirname(iso_path), 'iso3166-1.json'), encoding='utf-8'))['3166-1']}
    unread = {'subdivisions': len(unmatched), 'countries': [names1[cc] for cc in sorted(per) if per[cc] == total[cc]]}
    print('/**')
    print(' * The state and province aliases the border allowance reads (round eighty-seven; `stateSide` in `tdwg-shapes.ts`), written')
    print(' * by scripts/dev/r87-state-aliases.py (read its comment for the sources): for each country of more than one region, each')
    print(" * alias as `stateKey` reads it, and the Natural Earth states and provinces it stands for, as `stateKey` reads their names.")
    print(f' * {n} aliases in {len(out)} countries; ISO 3166-2 from the Debian iso-codes project as pycountry 24.6.1 packages it.')
    print(' * A code is held as "=CC-SUB", a name (or a code\'s suffix alone) as "~" and its key. ISO subdivisions not matched to a place of the')
    print(f' * shapes file, so not aliased: {len(unmatched)} (territories the file places under their own country codes, subdivisions')
    print(' * made since Natural Earth\'s drawing, such as Morocco\'s regions of 2015, and subdivisions whose places Natural Earth names')
    print(f' * otherwise). Left out as two subdivisions\' alias or another place\'s own name: {len(dropped)}.')
    print(f' * Not matched, by country: {per_words}.')
    print(' */')
    print('export const STATE_ALIASES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = ' + json.dumps(out, ensure_ascii=True, separators=(',', ':')) + ';')
    print('/**')
    print(' * The aliases above that are historical names (round eighty-seven\'s review, S1): an old province may have held land on')
    print(' * both sides of a border, and the shape decides; every other alias is a current subdivision, read as its place\'s name.')
    print(' */')
    print('export const STATE_HISTORICAL: Readonly<Record<string, readonly string[]>> = ' + json.dumps(old, ensure_ascii=True, separators=(',', ':')) + ';')
    print('/** How many ISO subdivisions of these countries no code of the table reads, and the countries none of whose codes it reads (round eighty-seven\'s review, M1): /about/how says them. */')
    print('export const STATE_UNREAD: { readonly subdivisions: number; readonly countries: readonly string[] } = ' + json.dumps(unread, ensure_ascii=True, separators=(',', ':')) + ';')
    sys.stderr.write(f'{n} aliases in {len(out)} countries; {len(unmatched)} ISO subdivisions not matched; {len(dropped)} dropped\n')
    sys.stderr.write(f'  not matched, by country: {per_words}\n')
    for u in unmatched:
        if u[:2] in ('US', 'CA', 'AU', 'MX', 'BR', 'ZA', 'CN', 'RU', 'UA', 'PK', 'TR'):
            sys.stderr.write(f'  not matched: {u}\n')
    for d in dropped:
        sys.stderr.write(f'  dropped: {d}\n')

if __name__ == '__main__':
    main(*sys.argv[1:])
