/**
 * Round eighty-seven (browse, C1 to C4): the TDWG hierarchy, the country presets and the region names; the browse
 * engine's counts, each what a click gives; the pages Kew gives only a wider region; the address of a view; the CSV.
 *
 * Fails on the base (r85m head), where none of $lib/browse exists and the front page grouped by `broadRegion`.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { REGIONS, CONTINENTS, LEVEL3, COUNTRIES, level3Of, lineOf, regionBySlug, regionOfOrigin, aliasNamed, countryOfCodes, countriesIn, codeOf, TDWG_SOURCE } from '$lib/browse/tdwg';
import { browseTableOf, isBrowseTable, keyAt, slugAt } from '$lib/browse/table';
import { prepared, runQuery, allRows, parseQuery, queryString, titleOf, wholeCounts, untickPart, EMPTY, PAGE, type BrowseQuery, type Prepared } from '$lib/browse/engine';
import { csvCell, browseCsv, sourcesCsv, columns, BOM } from '$lib/browse/csv';
import { KEW_DAY, GROWN_DAY } from '$lib/browse/sources';
import { suggest } from '$lib/browse/suggest';
import { wideOrigins } from '$dossier/wide-origins';
import tdwg3 from '$dossier/tdwg3.json';

type E = { key: string; gbif?: number; slug: string; name: string; family?: string; common?: string; origin: string[]; climate: string; grown?: number; changed?: number };
const e = (key: string, name: string, origin: string[], x: Partial<E> = {}): E => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, family: 'Apocynaceae', origin, climate: 'ok', gbif: Number(key.slice(1)), ...x });

describe("TDWG's hierarchy (C1)", () => {
  it('has 9 continents, 52 regions and the 369 level-3 regions the index names, each in one region of one continent', () => {
    expect(CONTINENTS).toHaveLength(9);
    expect([...REGIONS.values()].filter((r) => r.level === 2)).toHaveLength(52);
    expect(LEVEL3.map((r) => r.code).sort()).toEqual((tdwg3 as Array<[string, string]>).map((r) => r[0]).sort());
    for (const r of LEVEL3) { const line = lineOf(r.code); expect(line.map((x) => x.level)).toEqual([1, 2, 3]); }
    expect([...level3Of('27')].sort()).toEqual(['BOT', 'CPP', 'CPV', 'LES', 'NAM', 'NAT', 'OFS', 'SWZ', 'TVL']);
    expect(level3Of('79')).toHaveLength(7);
    expect(TDWG_SOURCE).toMatch(/Brummitt 2001/);
  });
  it('reads the index\'s origin names as Kew writes them, and the wider ones by level', () => {
    expect(regionOfOrigin('Cape Provinces')).toBe('CPP');
    expect(regionOfOrigin('Gambia,  The')).toBe('GAM');
    expect(regionOfOrigin('Zaïre')).toBe('ZAI');
    expect(regionOfOrigin('Mexico')).toBe('79');
    expect(regionOfOrigin('Brazil')).toBe('84');
    expect(regionOfOrigin('Malesia')).toBe('42');
    expect(regionOfOrigin('Southern America')).toBe('8');
    expect(regionOfOrigin('Mongolia')).toBe('MON'); // a level-3 name before the level-2 region of the same name
    expect(regionOfOrigin('')).toBeUndefined();
  });
  it('gives every region one address, and reads a code as one', () => {
    const slugs = [...REGIONS.values()].map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(regionBySlug('cape-provinces')?.code).toBe('CPP');
    expect(regionBySlug('mongolia')?.code).toBe('MON');
    expect(regionBySlug('mongolia-l2')?.code).toBe('37');
    expect(regionBySlug('the-gambia')?.code).toBe('GAM');
    expect(codeOf('cpp')).toBe('CPP');
    expect(codeOf('27')).toBe('27');
    expect(codeOf('XYZ')).toBeUndefined();
  });
  it('presets a country as the level-3 regions it holds alone or most of', () => {
    expect(COUNTRIES.get('MX')!.regions).toEqual(['MXC', 'MXE', 'MXG', 'MXI', 'MXN', 'MXS', 'MXT']);
    expect(COUNTRIES.get('BR')!.regions).toEqual(['BZC', 'BZE', 'BZL', 'BZN', 'BZS']);
    expect(COUNTRIES.get('NA')!.regions).toEqual(['CPV', 'NAM']);
    expect(COUNTRIES.get('ZA')!.regions).toEqual(expect.arrayContaining(['CPP', 'NAT', 'OFS', 'TVL']));
    // Great Britain is the United Kingdom's; Ireland and France it shares, unticked.
    expect(COUNTRIES.get('GB')).toMatchObject({ regions: ['GRB'], shared: false });
    expect(COUNTRIES.get('GB')!.also).toEqual(['FRA', 'IRE']);
    // Croatia holds no region alone or most of: its preset is the region it shares, said as shared.
    expect(COUNTRIES.get('HR')).toMatchObject({ regions: ['YUG'], shared: true });
    expect(countryOfCodes(['NAM', 'CPV'])?.iso).toBe('NA');
    expect(countriesIn('27').map((c) => c.iso)).toEqual(expect.arrayContaining(['NA', 'ZA', 'BW', 'LS']));
  });
  it('knows other names of regions from TDWG\'s tables and the shapes file, never a level-3 name', () => {
    expect(aliasNamed('Limpopo')?.regions).toEqual(['TVL']);
    expect(aliasNamed('Transvaal')?.regions).toEqual(['TVL']);
    expect(aliasNamed('Gauteng')?.regions).toEqual(['TVL']);
    expect(aliasNamed('Burma')?.regions).toEqual(['MYA']);
    expect(aliasNamed('Oaxaca')?.regions).toEqual(['MXS']);
    expect(aliasNamed('Cape Provinces')).toBeUndefined();
  });
});

// A small reference: three regions of southern Africa, one of Madagascar, Mexico's seven and Kew's "Mexico" alone.
const INDEX: E[] = [
  e('k1', 'Hoodia alstonii', ['Cape Provinces', 'Namibia'], { grown: 0 }),
  e('k2', 'Hoodia gordonii', ['Cape Provinces', 'Namibia', 'Botswana'], { grown: 37 }),
  e('k3', 'Hoodia juttae', ['Namibia'], { climate: 'none' }),
  e('k4', 'Huernia zebrina', ['Botswana', 'Northern Provinces'], { grown: 199 }),
  e('k5', 'Pachypodium lamerei', ['Madagascar'], { grown: 400 }),
  e('k6', 'Lithops lesliei', ['Cape Provinces', 'Northern Provinces', 'Free State'], { family: 'Aizoaceae', grown: 2000 }),
  e('k7', 'Conophytum minimum', ['Cape Provinces'], { family: 'Aizoaceae', climate: 'pending' }),
  e('k8', 'Agave calodonta', ['Mexico'], { family: 'Asparagaceae', grown: 3 }),
  e('k9', 'Agave victoriae-reginae', ['Mexico Northeast'], { family: 'Asparagaceae', grown: 900 }),
  e('k10', 'Echeveria elegans', ['Mexico Central', 'Mexico Northeast'], { family: 'Crassulaceae', climate: 'refused' }),
  e('k11', 'Caladium praetermissum', [''], { family: 'Araceae', climate: 'pending', gbif: undefined })
];
const P = (): Prepared => prepared(browseTableOf(INDEX as never));
const run = (q: Partial<BrowseQuery>) => runQuery(P(), { ...EMPTY, ...q });
const names = (p: Prepared, rows: number[]) => rows.map((i) => p.t.name[i]);

describe('the browse engine (C1)', () => {
  it('filters by regions, any or all, only here, family, genus, climate and grown', () => {
    const p = P();
    const got = (q: Partial<BrowseQuery>) => names(p, allRows(p, { ...EMPTY, ...q, sort: 'az' }));
    expect(got({ r: ['NAM'] })).toEqual(['Hoodia alstonii', 'Hoodia gordonii', 'Hoodia juttae']);
    expect(got({ r: ['NAM', 'BOT'] })).toHaveLength(4);
    expect(got({ r: ['NAM', 'BOT'], all: true })).toEqual(['Hoodia gordonii']);
    expect(got({ r: ['NAM'], only: true })).toEqual(['Hoodia juttae']);
    expect(got({ r: ['NAM', 'CPP'], only: true })).toEqual(['Conophytum minimum', 'Hoodia alstonii', 'Hoodia juttae']);
    expect(got({ r: ['27'], f: 'aizoaceae' })).toEqual(['Conophytum minimum', 'Lithops lesliei']);
    expect(got({ g: 'hoodia', climate: true })).toEqual(['Hoodia alstonii', 'Hoodia gordonii']);
    expect(got({ grown: true, r: ['CPP'] })).toEqual(['Hoodia gordonii', 'Lithops lesliei']); // a count of 0 is not grown; no count is not counted
    // Most grown first, then the alphabet; a species the list does not count goes last.
    expect(names(p, allRows(p, { ...EMPTY, r: ['CPP'] }))).toEqual(['Lithops lesliei', 'Hoodia gordonii', 'Hoodia alstonii', 'Conophytum minimum']);
  });

  it('every count beside a choice is what clicking it gives', () => {
    const p = P();
    const check = (q: BrowseQuery) => {
      const a = runQuery(p, q);
      const total = (x: Partial<BrowseQuery>) => runQuery(p, { ...q, ...x, at: 0 }).total;
      for (const o of [...a.rail.options, ...a.rail.ticked]) {
        const after = total({ r: o.next, all: o.next.length > 1 && q.all, only: o.next.length ? q.only : false });
        if (o.on) { const native = new Set(allRows(p, { ...EMPTY, r: [o.code] })); expect(o.n, `${o.label} ticked: its share`).toBe(allRows(p, q).filter((i) => native.has(i)).length); }
        else expect(o.plus ? a.total + o.n : o.n, `${o.label} under ${queryString(q)}`).toBe(after);
      }
      for (const f of a.families) expect(f.n, f.name).toBe(total({ f: f.slug }));
      for (const g of a.genera) expect(g.n, g.name).toBe(total({ g: g.slug }));
      expect(a.flags.climate).toBe(total({ climate: true }));
      expect(a.flags.grown).toBe(total({ grown: true }));
      if (q.r.length) expect(a.flags.only).toBe(total({ only: true }));
      if (q.r.length > 1) { expect(a.modes.all).toBe(total({ all: true })); expect(a.modes.any).toBe(total({ all: false })); }
      for (const c of a.rail.countries) expect(c.n, c.name).toBe(total({ r: [...c.regions], all: false }));
    };
    for (const q of [{}, { r: ['NAM'] }, { r: ['NAM', 'BOT'] }, { r: ['NAM', 'BOT'], all: true }, { r: ['CPP'], only: true }, { r: ['27'] }, { r: ['2'], in: '27' }, { f: 'aizoaceae', climate: true }, { r: ['MXE'] }, { r: ['79'], in: '79' }, { g: 'hoodia', in: '27' }] as Array<Partial<BrowseQuery>>) check({ ...EMPTY, ...q });
  });

  it('a ticked wider region ticks its parts; unticking one ticks the others instead', () => {
    const a = run({ r: ['27'], in: '27' });
    const nam = a.rail.options.find((o) => o.code === 'NAM')!;
    expect(nam.on).toBe(true);
    expect(nam.next.sort()).toEqual(level3Of('27').filter((c) => c !== 'NAM').sort());
    const rest = untickPart(['2'], 'NAM');
    expect(rest).not.toContain('NAM');
    expect(rest).not.toContain('2');
    expect(rest).not.toContain('27');
    expect(rest).toEqual(expect.arrayContaining(['22', 'NAT', 'BOT', 'CPV'])); // the other regions of Africa whole, the other parts of Southern Africa
    expect(new Set(rest.flatMap((c) => level3Of(c)))).toEqual(new Set(level3Of('2').filter((c) => c !== 'NAM')));
  });

  it('says how many a region adds to an any-of view (+N), and what an all-of view narrows to', () => {
    const a = run({ r: ['NAM'] });
    const bot = a.rail.options.find((o) => o.code === 'BOT')!;
    expect(bot).toMatchObject({ plus: true, n: 1, on: false }); // Huernia zebrina
    const b = run({ r: ['NAM', 'BOT'], all: true });
    expect(b.rail.options.find((o) => o.code === 'CPP')).toMatchObject({ plus: false, n: 1 });
  });

  it('when nothing answers, says which filter loosened alone gives some, each count what its link gives', () => {
    const q: BrowseQuery = { ...EMPTY, r: ['NAM', 'MDG'], all: true, only: true };
    const a = runQuery(P(), q);
    expect(a.total).toBe(0);
    expect(a.fixes.length).toBeGreaterThan(0);
    for (const f of a.fixes) expect(f.n, f.label).toBe(runQuery(P(), { ...q, ...f.query }).total);
    expect(a.fixes[0].n).toBeGreaterThanOrEqual(a.fixes[a.fixes.length - 1].n);
  });
});

describe('pages Kew gives only a wider region (C1; the plan\'s B16)', () => {
  it('are native to that region and to any set of regions holding all of it, never to one of its parts by guess', () => {
    const p = P();
    const has = (q: Partial<BrowseQuery>) => names(p, allRows(p, { ...EMPTY, ...q })).includes('Agave calodonta');
    expect(has({ r: [...COUNTRIES.get('MX')!.regions] })).toBe(true);
    expect(has({ r: ['79'] })).toBe(true);
    expect(has({ r: ['7'] })).toBe(true);
    expect(has({ r: ['MXE'] })).toBe(false);
    expect(has({ r: [...COUNTRIES.get('MX')!.regions], only: true })).toBe(true);
    // The view of a part says what it leaves out, and where to find it.
    expect(run({ r: ['MXE'] }).wide).toEqual([{ code: '79', label: 'Mexico', n: 1 }]);
    expect(run({ r: [...COUNTRIES.get('MX')!.regions] }).wide).toEqual([]);
  });
  it('a species with no origin TDWG names is in no region, and counted apart', () => {
    const p = P();
    expect(wholeCounts(p).unplaced).toBe(1);
    expect(names(p, allRows(p, { ...EMPTY, r: ['8'] }))).not.toContain('Caladium praetermissum');
    // Once derived again its origin is Kew's continent, and the continent's view holds it.
    const q = prepared(browseTableOf(INDEX.map((x) => (x.key === 'k11' ? { ...x, origin: ['Southern America'] } : x)) as never));
    expect(names(q, allRows(q, { ...EMPTY, r: ['8'] }))).toContain('Caladium praetermissum');
    expect(names(q, allRows(q, { ...EMPTY, r: [...COUNTRIES.get('BR')!.regions] }))).not.toContain('Caladium praetermissum');
  });
  it("the live index's eight such pages: Brazil's and Mexico's by their country preset, Malesia's by its region, said under its countries", () => {
    const file = '/tmp/claude-0/rev86r/inputs/index.json';
    const idx = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : JSON.parse(readFileSync('tests/unit/fixtures/r87c/parity-index.json', 'utf8'));
    const pages = wideOrigins(idx);
    expect(pages).toHaveLength(8);
    const p = prepared(browseTableOf(idx));
    const keys = (q: Partial<BrowseQuery>) => new Set(allRows(p, { ...EMPTY, ...q }).map((i) => keyAt(p.t, i)));
    const br = keys({ r: [...COUNTRIES.get('BR')!.regions] }), mx = keys({ r: [...COUNTRIES.get('MX')!.regions] });
    for (const pg of pages) {
      if (pg.wide[0] === 'Brazil') expect(br.has(pg.key), pg.name).toBe(true);
      if (pg.wide[0] === 'Mexico') expect(mx.has(pg.key), pg.name).toBe(true);
      if (pg.wide[0] === 'Malesia') {
        expect(keys({ r: ['42'] }).has(pg.key)).toBe(true);
        // Under Indonesia's preset it is not counted, and the page says so, with the way to it.
        expect(keys({ r: [...COUNTRIES.get('ID')!.regions] }).has(pg.key)).toBe(false);
        expect(runQuery(p, { ...EMPTY, r: [...COUNTRIES.get('ID')!.regions] }).wide).toContainEqual(expect.objectContaining({ code: '42', label: 'Malesia' }));
      }
    }
  });
});

describe('the address of a view (C1: URLs are shareable query strings)', () => {
  it('reads and writes one canonical order, and leaves out what it does not understand', () => {
    const q = parseQuery(new URLSearchParams('r=nam,CPV&r=XYZ&f=apocynaceae&climate=1&only=1&m=all&sort=az&view=list&at=48&junk=1&in=27'));
    expect(q).toMatchObject({ r: ['NAM', 'CPV'], all: true, f: 'apocynaceae', climate: true, only: true, sort: 'az', view: 'list', at: 48, in: '27' });
    expect(queryString(q)).toBe('?r=NAM,CPV&m=all&f=apocynaceae&climate=1&only=1&sort=az&view=list&at=48&in=27');
    expect(queryString(q, { f: '' })).toBe('?r=NAM,CPV&m=all&climate=1&only=1&sort=az&view=list&in=27'); // a new filter starts the results again
    expect(parseQuery(new URLSearchParams('at=7&only=1&m=all&r=NAM'))).toMatchObject({ at: 0, only: true, all: false });
    expect(parseQuery(new URLSearchParams('only=1')).only).toBe(false);
    expect(queryString(EMPTY)).toBe('');
    expect(PAGE).toBe(48);
  });
  it('names a view in words', () => {
    const p = P();
    expect(titleOf(p, { ...EMPTY, r: ['NAM', 'CPV'], f: 'apocynaceae' })).toBe('Apocynaceae native to Namibia');
    expect(titleOf(p, { ...EMPTY, r: ['NAM', 'BOT'], all: true, climate: true })).toBe('Species native to all of Namibia and Botswana, with a habitat climate');
    expect(titleOf(p, EMPTY)).toBe('Every species in the reference');
  });
});

describe('the browse table', () => {
  it('holds every column at every place, and refuses a table with a short column', () => {
    const t = browseTableOf(INDEX as never);
    expect(isBrowseTable(t, INDEX.length)).toBe(true);
    expect(isBrowseTable(JSON.parse(JSON.stringify(t)), INDEX.length)).toBe(true);
    expect(isBrowseTable({ ...t, grown: t.grown.slice(1) }, INDEX.length)).toBe(false);
    expect(isBrowseTable(t, INDEX.length + 1)).toBe(false);
    expect(keyAt(t, 0)).toBe('k1');
    expect(slugAt(t, 0)).toBe('hoodia-alstonii');
    expect(t.grown[2]).toBe(-1); // not counted, never 0
    expect(t.climate).toBe('oonooopoorp'); // one letter a species: ok, none, pending, refused
    expect(t.climate.length).toBe(INDEX.length);
  });
});

describe('the CSV (C4)', () => {
  it('writes plain numbers, ISO dates, a byte-order mark, CRLF, and guards text cells that begin with = + - @', () => {
    expect(csvCell(-5.3)).toBe('-5.3');
    expect(csvCell(1247)).toBe('1247');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+44')).toBe("'+44");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell(null)).toBe('');
    const p = prepared(browseTableOf(INDEX.map((x) => ({ ...x, changed: 20765 })) as never));
    const csv = browseCsv(p, allRows(p, { ...EMPTY, r: ['NAM'], sort: 'az' }), '2026-11-08');
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(columns('2026-11-08').map((c) => c.head).join(','));
    expect(lines[1]).toBe('Hoodia alstonii,https://cultifolio.com/species/hoodia-alstonii,1,1,Apocynaceae,,CPP;NAM,Cape Provinces;Namibia,known,,0,2026-11-08'); // round eighty-seven, stage 2: record_low_c, empty in an index that holds no record lows
    expect(lines[3]).toContain(',none,,,2026-11-08'); // Hoodia juttae: no habitat climate; not counted, an empty cell, never 0
    expect(lines).toHaveLength(5); // three rows, the header, the last line's end
  });
  it("names each column's meaning, source and day in a second file", () => {
    const s = sourcesCsv('2026-11-08').slice(1).split('\r\n');
    expect(s[0]).toBe('column,meaning,source,as_of');
    expect(s).toHaveLength(columns(null).length + 2);
    for (const c of columns('2026-11-08')) { expect(c.source.length).toBeGreaterThan(5); expect(c.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/); }
    expect(sourcesCsv(null)).toContain('not stated'); // a corpus with no build day says so, never a made-up day
  });
  it("its days are the records' own: Kew's file as /about/how states it, iNaturalist's counts as the species list's header", () => {
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toContain('4 June 2026');
    expect(KEW_DAY).toBe('2026-06-04');
    expect(readFileSync('scripts/species-list.txt', 'utf8')).toMatch(new RegExp(`captive=true[^\\n]*read ${GROWN_DAY}`));
  });
});

describe('the search box\'s browse rows (C3)', () => {
  it('a genus, a typing error of one, a family, a country, a region by its own name or another, and a genus with a place', () => {
    const p = P();
    const s = (q: string) => suggest(p, q);
    expect(s('hood')[0]).toMatchObject({ kind: 'genus', label: 'Hoodia', href: '/genus/hoodia', n: 3 });
    expect(s('hodia')[0]).toMatchObject({ kind: 'genus', label: 'Hoodia' });
    expect(s('aizo')[0]).toMatchObject({ kind: 'family', label: 'Aizoaceae', href: '/family/aizoaceae', n: 2 });
    const nam = s('namib');
    expect(nam[0]).toMatchObject({ kind: 'country', label: 'Native to Namibia', href: '/browse?r=CPV,NAM', n: 3 });
    expect(nam).toContainEqual(expect.objectContaining({ kind: 'region', label: 'Namibia', href: '/region/namibia' }));
    expect(s('limpopo')[0]).toMatchObject({ kind: 'region', label: 'Limpopo: in Northern Provinces', href: '/region/northern-provinces', n: 2 });
    expect(s('mexico')[0]).toMatchObject({ kind: 'region', href: '/region/mexico', n: 3 }); // the country and TDWG's region hold the same regions: one row
    const both = s('hoodia namib');
    expect(both[0]).toMatchObject({ kind: 'combined', label: 'Hoodia native to Namibia', sci: 'Hoodia', href: '/browse?r=CPV,NAM&g=hoodia' });
    expect(both[0].n).toBe(allRows(p, { ...EMPTY, g: 'hoodia', r: ['CPV', 'NAM'] }).length);
    expect(s('namibia hoodia')[0]).toMatchObject({ kind: 'combined', label: 'Hoodia native to Namibia' });
    expect(s('x')).toEqual([]);
  });
});
