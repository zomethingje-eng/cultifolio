/**
 * Round eighty-seven, stage 2 (browse, C6 to C9): the pins' record of a view's species and their words; the browse
 * pages' alphabet (a collator); the record low read with a fallback; the results map's counts, frame and steps; the map
 * picker's points; "next door" from the shapes; the collection lens, worked out in the browser; /browse/data.
 *
 * Fails on the base (r85m head), where none of $lib/browse exists; on stage 1, where pins, the map, the lens, the
 * collator and the record low are not there.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { browseTableOf } from '$lib/browse/table';
import { prepared, runQuery, allRows, parseQuery, queryString, regionCounts, nativeNamesOf, lowsOf, sortOf, EMPTY, type BrowseQuery } from '$lib/browse/engine';
import { collatedOrder, nameOrder } from '$lib/browse/order';
import { encodeKeys, decodeKeys, changesOf, sinceWords, dayWords, TOO_WIDE, PIN_FOLLOW_MAX } from '$lib/browse/pins';
import { frameOf, stepsOf, stepOf, stepWords, WORLD } from '$lib/browse/map-draw';
import { nextDoor, NEIGHBOURS_SOURCE } from '$lib/browse/neighbours';
import { lensOf, slugsToAsk, plantSlug, type LensEntry } from '$lib/browse/lens';
import { LEVEL3 } from '$lib/browse/tdwg';
import { browseCsv, columns } from '$lib/browse/csv';
import points from '$lib/browse/map-points.json';
import neighbours from '$lib/browse/tdwg-neighbours.json';

type E = { key: string; gbif?: number; slug: string; name: string; family?: string; origin: string[]; climate: string; grown?: number; low?: number | null };
const e = (key: string, name: string, origin: string[], x: Partial<E> = {}): E => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, family: 'Apocynaceae', origin, climate: 'ok', gbif: Number(key.slice(1)), grown: 1, ...x });
const INDEX: E[] = [
  e('k1', 'Hoodia alstonii', ['Cape Provinces', 'Namibia'], { grown: 5 }),
  e('k2', 'Hoodia gordonii', ['Cape Provinces', 'Namibia', 'Botswana'], { grown: 37 }),
  e('k3', 'Hoodia juttae', ['Namibia'], { climate: 'none' }),
  e('k4', 'Æthionema schistosum', ['Turkey'], { family: 'Brassicaceae' }),
  e('k5', 'Aethusa cynapium', ['Great Britain'], { family: 'Apiaceae' }),
  e('k6', 'Échinopsis test', ['Argentina Northwest'], { family: 'Cactaceae' }),
  e('k7', 'Agave calodonta', ['Mexico'], { family: 'Asparagaceae' }),
  e('k8', 'Agave victoriae-reginae', ['Mexico Northeast'], { family: 'Asparagaceae' })
];
/** The table as the derived agent's index writes it: `low` beside every entry (here added by hand, as browseTableOf may). */
const withLows = (lows: Array<number | null>) => { const t = browseTableOf(INDEX as never); return prepared({ ...t, low: lows } as never); };

describe('r87b pins 1: a view\'s species, written short', () => {
  it('reads back what it wrote, in order, Kew\'s and GBIF\'s', () => {
    const keys = ['k3331952', 'k1', 'k22', 'k23', 'k1000000', 'g999', 'g12000000', 'g5'];
    const s = encodeKeys(keys);
    expect(decodeKeys(s)!.sort()).toEqual([...keys].sort());
    expect(decodeKeys(encodeKeys([]))).toEqual([]);
    expect(decodeKeys(encodeKeys(['k7']))).toEqual(['k7']);
  });
  it('is about three characters a species for a view of thousands', () => {
    const many = Array.from({ length: PIN_FOLLOW_MAX }, (_, i) => `k${1 + i * 1100}`);
    const s = encodeKeys(many);
    expect(s.length / PIN_FOLLOW_MAX).toBeLessThan(3.2);
    expect(decodeKeys(s)).toEqual(many);
  });
  it('refuses text that is not one', () => {
    for (const x of ['k1,k2', 'abc!', 'Z', '~~']) expect(decodeKeys(x), x).toBeNull();
  });
  it('says what changed', () => {
    expect(changesOf(['k1', 'k2', 'k3'], ['k2', 'k3', 'k4', 'k5'])).toEqual({ added: ['k4', 'k5'], removed: ['k1'] });
    expect(sinceWords({ added: 3, removed: 1 }, '2026-11-12', '2026-11-20')).toBe('+3 · −1 since 12 Nov');
    expect(sinceWords({ added: 0, removed: 0 }, '2026-11-12', '2026-11-20')).toBe('no change since 12 Nov');
    expect(dayWords('2025-12-01', '2026-01-02')).toBe('1 Dec 2025');
    expect(TOO_WIDE).toMatch(/3,000 species/);
  });
});

describe('r87b order: the browse pages\' alphabet is a collator\'s', () => {
  it('files Æ as Ae and É with E, where folded bytes filed Æ after Z', () => {
    const names = ['Zygophyllum fabago', 'Æthionema schistosum', 'Aethusa cynapium', 'Échinopsis test', 'Echeveria elegans', 'aloe vera'];
    expect(collatedOrder(names).map((i) => names[i])).toEqual(['Æthionema schistosum', 'Aethusa cynapium', 'aloe vera', 'Echeveria elegans', 'Échinopsis test', 'Zygophyllum fabago']);
    expect(nameOrder('Aloe 9', 'Aloe 10')).toBeLessThan(0);
  });
  it('is the engine\'s A to Z', () => {
    const p = prepared(browseTableOf(INDEX as never));
    const az = allRows(p, { ...EMPTY, sort: 'az' }).map((i) => p.t.name[i]);
    expect(az.slice(0, 4)).toEqual(['Æthionema schistosum', 'Aethusa cynapium', 'Agave calodonta', 'Agave victoriae-reginae']);
    expect(az.indexOf('Échinopsis test')).toBeLessThan(az.indexOf('Hoodia alstonii'));
  });
  it('orders 48,375 names in well under the stage-1 collator sort\'s 150 ms', () => {
    // A corpus's names: most plain, some with an accent or a ligature, some with a hyphen or a space where folding and the collator differ.
    const names = Array.from({ length: 48375 }, (_, i) => `${['Aloe', 'Æonium', 'Échinopsis', 'Haworthia', 'Lithops', 'Aloe-x', 'Aloe x'][i % 7]} ${(i * 7919 % 48375).toString(36)}${i % 13 ? '' : '-a b'}`);
    const t0 = performance.now();
    const o = collatedOrder(names);
    const ms = performance.now() - t0;
    for (let k = 1; k < o.length; k++) expect(nameOrder(names[o[k - 1]], names[o[k]]) <= 0).toBe(true);
    expect(ms).toBeLessThan(1500); // a loaded test machine; measured about 60 ms alone
  });
});

describe('r87b record low: read with a fallback', () => {
  it('an index of before holds none: no column, no order by it, the default order', () => {
    const p = prepared(browseTableOf(INDEX as never));
    expect(lowsOf(p.t)).toBeNull();
    expect(sortOf(p, 'low')).toBe('grown');
    expect(parseQuery(new URLSearchParams('sort=low')).sort).toBe('low');
    const a = runQuery(p, { ...EMPTY, sort: 'low' });
    expect(a.query.sort).toBe('grown');
    expect(queryString(a.query)).toBe('');
  });
  it('a column of another length is not read, nor one with no number in it (a table made from an index of before)', () => {
    const t = browseTableOf(INDEX as never);
    expect(lowsOf({ ...t, low: [1, 2] } as never)).toBeNull();
    expect(lowsOf({ ...t, low: INDEX.map(() => null) } as never)).toBeNull();
  });
  it('with the column: coldest first, the species with none last', () => {
    const p = withLows([-5.3, -12.1, null, 2, -1, 0, -30.2, 4]);
    const rows = allRows(p, { ...EMPTY, sort: 'low' }).map((i) => p.t.name[i]);
    expect(rows[0]).toBe('Agave calodonta');
    expect(rows[1]).toBe('Hoodia gordonii');
    expect(rows[rows.length - 1]).toBe('Hoodia juttae');
    expect(runQuery(p, { ...EMPTY, sort: 'low' }).query.sort).toBe('low');
  });
  it('the CSV carries it, empty where none', () => {
    const p = withLows([-5.3, -12.1, null, 2, -1, 0, -30.2, 4]);
    const csv = browseCsv(p, allRows(p, { ...EMPTY, r: ['NAM'], sort: 'az' }), '2026-11-09').slice(1).split('\r\n');
    const at = columns(null).findIndex((c) => c.head === 'record_low_c');
    expect(csv[1].split(',')[at]).toBe('-5.3');
    expect(csv.find((l) => l.startsWith('Hoodia juttae'))!.split(',')[at]).toBe('');
  });
});

describe('r87b results map (C7)', () => {
  const p = prepared(browseTableOf(INDEX as never));
  it('counts the results by level-3 region; a wider origin by its region, on no level-3 one', () => {
    const { l3, wide } = regionCounts(p, allRows(p, { ...EMPTY, f: 'apocynaceae' }));
    expect(Object.fromEntries(l3)).toEqual({ NAM: 3, CPP: 2, BOT: 1 });
    expect(wide.size).toBe(0);
    const ag = regionCounts(p, allRows(p, { ...EMPTY, f: 'asparagaceae' }));
    expect(Object.fromEntries(ag.l3)).toEqual({ MXE: 1 });
    expect(Object.fromEntries(ag.wide)).toEqual({ '79': 1 });
  });
  it('fits every region it draws, and steps its scale on round numbers its legend says', () => {
    const f = frameOf([[17, -22], [24, -29], [25, -22]]);
    expect(f.x).toBeLessThanOrEqual(17 - 8);
    expect(f.x + f.w).toBeGreaterThanOrEqual(25 + 8);
    expect(f.y).toBeLessThanOrEqual(22 - 8);
    expect(f.w / f.h).toBeCloseTo(WORLD.w / WORLD.h, 5);
    expect(frameOf([[-170, 60], [170, -40]])).toEqual(WORLD);
    expect(stepsOf(103)).toEqual([1, 2, 5, 10, 20]);
    expect(stepsOf(3)).toEqual([1, 2, 3]);
    expect(stepOf(41, stepsOf(103))).toBe(4);
    expect(stepWords([1, 2, 5, 10, 20], 1, 103)).toBe('2 to 4');
    expect(stepWords([1, 2, 5, 10, 20], 4, 103)).toBe('20 to 103');
  });
  it('has a point, a size and an extent for every level-3 region', () => {
    const at = (points as { at: Record<string, number[]> }).at;
    for (const r of LEVEL3) { expect(at[r.code], r.code).toHaveLength(7); expect(Math.abs(at[r.code][0])).toBeLessThanOrEqual(180); }
    expect(at.CPP[2]).toBe(0);
    expect(Object.values(at).filter((x) => x[2] === 1).length).toBeGreaterThan(20); // islands get a ring to press
  });
});

describe('r87b next door, from the shapes', () => {
  it('Namibia, the Caprivi Strip and the Cape: their borders; Sicily none; a region with no outline not worked out', () => {
    expect(nextDoor('NAM')).toEqual(['ANG', 'BOT', 'CPP', 'CPV']);
    expect(nextDoor('CPV')).toEqual(expect.arrayContaining(['ZAM', 'ZIM', 'NAM']));
    expect(nextDoor('SIC')).toEqual([]); // the Strait of Messina, 3 km, is wider than the rule's 2.4 km
    expect(nextDoor('UTA')).toEqual(expect.arrayContaining(['NWM'])); // four corners: a point
    expect(nextDoor('CKI')).toBeNull();
    expect(nextDoor('27')).not.toContain('NAM'); // a region's neighbours are outside it
    expect(nextDoor('27')).toEqual(expect.arrayContaining(['ANG', 'ZAM', 'ZIM', 'MOZ']));
    expect(NEIGHBOURS_SOURCE).toMatch(/Natural Earth/);
  });
  it('is symmetric', () => {
    const next = (neighbours as { next: Record<string, string[]> }).next;
    for (const [a, list] of Object.entries(next)) for (const b of list) expect(next[b], `${a}-${b}`).toContain(a);
  });
});

describe('r87b the collection lens (C8), in the browser', () => {
  const plants = [
    { id: 'a1', acc: '2026-0001', taxonName: 'Hoodia alstonii', status: 'growing' },
    { id: 'a2', acc: '2026-0002', taxonName: 'Hoodia alstonii', status: 'growing' },
    { id: 'a3', acc: '2026-0003', taxonName: 'Ceropegia alstonii', status: 'growing', olderOf: 'Hoodia gordonii' },
    { id: 'a4', acc: '2026-0004', taxonName: 'Hoodia juttae', status: 'dead' },
    { id: 'a5', acc: '2026-0005', taxonName: "Hoodia 'Night'", status: 'growing' },
    { id: 'a6', acc: '2026-0006', taxonName: 'Agave nobody', status: 'growing' },
    { id: 'a7', acc: '2026-0007', taxonName: 'Agave calodonta', status: 'growing' }
  ];
  const p = prepared(browseTableOf(INDEX as never));
  const entries = new Map<string, LensEntry>(INDEX.map((x) => [x.slug, { slug: x.slug, name: x.name, family: x.family, origin: x.origin }]));
  it('asks the entries of the species grown, never a genus alone, never a plant not growing', () => {
    expect(slugsToAsk(plants).sort()).toEqual(['agave-calodonta', 'agave-nobody', 'hoodia-alstonii', 'hoodia-gordonii']);
    expect(plantSlug(plants[2])).toBe('hoodia-gordonii');
  });
  it('a region: the species native to it, each with the plants; a wider origin only where it lies inside', () => {
    const l = lensOf(plants, entries, { kind: 'region', native: nativeNamesOf(p, 'NAM') });
    expect(l.species.map((s) => [s.name, s.plants.map((x) => x.acc)])).toEqual([['Hoodia alstonii', ['2026-0001', '2026-0002']], ['Hoodia gordonii', ['2026-0003']]]);
    expect(l.growing).toBe(6);
    expect(l.notHeld).toBe(1); // Agave nobody: no page
    expect(lensOf(plants, entries, { kind: 'region', native: nativeNamesOf(p, 'MXE') }).species).toEqual([]);
    expect(lensOf(plants, entries, { kind: 'region', native: nativeNamesOf(p, '79') }).species.map((s) => s.name)).toEqual(['Agave calodonta']);
  });
  it('a genus: its species and the plants filed under the genus alone; a family: its species', () => {
    const g = lensOf(plants, entries, { kind: 'genus', genus: 'Hoodia' });
    expect(g.species.map((s) => s.name)).toEqual(['Hoodia alstonii', 'Hoodia gordonii']);
    expect(g.genusOnly.map((x) => x.acc)).toEqual(['2026-0005']);
    expect(lensOf(plants, entries, { kind: 'family', family: 'Asparagaceae' }).species.map((s) => s.name)).toEqual(['Agave calodonta']);
  });
});

describe('r87b /browse/data', () => {
  beforeEach(async () => { (await import('$lib/server/sync')).resetRateLimits(); });
  const get = async (qs: string) => {
    const { GET } = await import('../../src/routes/browse/data/+server');
    const url = new URL(`http://localhost/browse/data?${qs}`);
    const r = (await GET({ url, platform: undefined, fetch, getClientAddress: () => '192.0.2.10' } as never)) as Response;
    return { json: () => r.json() as Promise<{ n: number; keys: string; names: Array<{ name: string }>; l1: unknown[]; l3: Array<unknown[]> }> };
  };
  it('answers a view\'s count, its species written short, names, and the picker\'s regions, from the view\'s query alone', async () => {
    const n = await (await get('part=count&r=NAM')).json();
    expect(n.n).toBeGreaterThan(0);
    const k = await (await get('part=keys&r=NAM')).json();
    expect(k.n).toBe(n.n);
    expect(decodeKeys(k.keys)).toHaveLength(n.n);
    const names = await (await get(`part=names&k=${decodeKeys(k.keys)!.join(',')},k1`)).json();
    expect(names.names.map((x: { name: string }) => x.name).sort()).toEqual(['Refusia testii', 'Welwitschia mirabilis']);
    const reg = await (await get('part=regions&f=cactaceae')).json();
    expect(reg.l1).toHaveLength(9);
    expect(reg.l3).toHaveLength(369);
    expect(reg.l3.find((x: unknown[]) => x[0] === 'CLN')![3]).toBe(2);
    expect(reg.l3.find((x: unknown[]) => x[0] === 'NAM')![3]).toBe(0);
  });
  it('refuses a part it does not know', async () => {
    await expect(get('part=plants')).rejects.toMatchObject({ status: 400 });
  });
});

void ({} as BrowseQuery);
