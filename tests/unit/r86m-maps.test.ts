/**
 * Round eighty-six, the maps agent:
 *
 * - Outside review B's 4 and review P's P9: the species page's maps name their files in `data-href` (`defer`), turned into
 *   `href` near the viewport or before a print (tests/e2e/r86m-maps.spec.ts); `mapFiles` lists exactly the files the two
 *   maps draw from.
 * - Review C's C4: a species page carried over an update keeps the map files its data names (`carryOver`), and a page
 *   hands the worker its map files to keep (`keepFiles`); nothing but this build's map files is fetched.
 *
 * On r86base (1b663ea): FAILED. `mapFiles`, `mapFilesOfData`, `keepFiles` and `isMapFile` do not exist (the import
 * failed), `regionSvg` and `worldSvg` write `href` whatever they are asked, and `carryOver` kept a carried page's data
 * and none of its map files.
 */
import { describe, it, expect } from 'vitest';
import { regionSvg, worldSvg, mapFiles, WORLD_FILE_AT } from '../../src/lib/map/still';
import { REGION_AT } from '../../src/lib/map/regions-drawn';
import { TDWG3 } from '../../src/lib/dossier/tdwg';
import { carryOver, saveCarry, keepFiles, mapFilesOfData, isMapFile, type CacheLike, type CacheStorageLike } from '../../src/lib/core/sw-keep';

// Hoodia alstonii's ten open records, as the live dossier (k506502, read 5 November) holds them.
const HOODIA: Array<[number, number]> = [[-26.317, 15.467], [-27.09, 16.407], [-28.875, 17.375], [-28.125, 16.875], [-28.375, 17.375], [-28.375, 17.125], [-27.875, 16.875], [-29.125, 18.875], [-28.131, 16.998], [-28.276, 17.218]];

const hrefs = (svg: string) => [...svg.matchAll(/ href="([^"]+)"/g)].map((m) => m[1]);
const deferred = (svg: string) => [...svg.matchAll(/ data-href="([^"]+)"/g)].map((m) => m[1]);
const files = (xs: string[]) => [...new Set(xs.map((x) => x.split('#')[0]))].sort();

describe("outside review B's 4: the species page's maps name their files to be fetched near the viewport", () => {
  it('deferred: every file in data-href and none in href; by default (the group pages) href as before', () => {
    const w = worldSvg([TDWG3.CPP, TDWG3.NAM], undefined, 'Range', true);
    const r = regionSvg([TDWG3.CPP, TDWG3.NAM], HOODIA, undefined, 'Records', [], true);
    for (const svg of [w, r]) { expect(hrefs(svg)).toEqual([]); expect(deferred(svg).length).toBeGreaterThan(2); }
    expect(deferred(w)).toEqual(['/maps/land110.svg#land', '/maps/w/w-CPP.svg#r', '/maps/w/w-NAM.svg#r']);
    expect(hrefs(worldSvg([TDWG3.CPP, TDWG3.NAM], undefined, 'Range'))).toEqual(['/maps/land110.svg#land', '/maps/w/w-CPP.svg#r', '/maps/w/w-NAM.svg#r']);
    // Nothing else changes: the deferred markup is the plain markup with `href` renamed.
    expect(r.replaceAll(' data-href="', ' href="')).toBe(regionSvg([TDWG3.CPP, TDWG3.NAM], HOODIA, undefined, 'Records', [], false));
  });

  it('mapFiles lists exactly the files the two maps draw from: a few regions, more than WORLD_FILE_AT, and no records', () => {
    const many = Object.values(REGION_AT).slice(0, WORLD_FILE_AT + 5).map((c) => TDWG3[c]).filter((b) => b.w <= b.e);
    const cases: Array<[typeof many, Array<[number, number]>, { lat: number; lon: number } | undefined]> = [
      [[TDWG3.CPP, TDWG3.NAM], HOODIA, { lat: -28.276, lon: 17.218 }],
      [many, [[10, 10], [11, 11], [12, 12]], undefined],
      [[TDWG3.GAL], [], undefined],
      [[], [], undefined]
    ];
    for (const [boxes, pts, c] of cases) {
      const drawn = files([...deferred(worldSvg(boxes, c, 'w', true)), ...deferred(regionSvg(boxes, pts, c, 'r', [], true))]);
      expect(mapFiles(boxes, pts, c).sort()).toEqual(drawn);
    }
    expect(mapFiles(many, [[10, 10], [11, 11], [12, 12]])).toContain('/maps/regions110.svg');
  });
});

const O = 'https://cultifolio.test';
class FakeCache implements CacheLike {
  m = new Map<string, Response>();
  private key(r: { url: string } | string) { return new URL(typeof r === 'string' ? r : r.url, O).href; }
  async keys() { return [...this.m.keys()].map((url) => ({ url })); }
  async match(r: string) { const v = this.m.get(this.key(r)); return v ? v.clone() : undefined; }
  async put(r: string, res: Response) { const k = this.key(r); this.m.delete(k); this.m.set(k, res); }
  async delete(r: { url: string } | string) { return this.m.delete(this.key(r)); }
}
class FakeStorage implements CacheStorageLike {
  c = new Map<string, FakeCache>();
  async keys() { return [...this.c.keys()]; }
  async open(n: string) { if (!this.c.has(n)) this.c.set(n, new FakeCache()); return this.c.get(n)!; }
  async delete(n: string) { return this.c.delete(n); }
}
const CUR = 'cultifolio-1762400000000';
/** A species page's `__data.json` as SvelteKit writes it: the layout's nodes skipped, the page's one flat list. */
const dataOf = (mapFiles: string[]) => JSON.stringify({ type: 'data', nodes: [{ type: 'skip' }, { type: 'skip' }, { type: 'data', data: [{ d: 1, mapFiles: 2 }, { slug: 3 }, mapFiles.map((_, i) => 4 + i), 'copiapoa-cinerea', ...mapFiles], uses: {} }] });
const CLN = ['/maps/land110.svg', '/maps/w/w-CLN.svg', '/maps/land50.svg', '/maps/r/r-CLN.svg'];

describe("review C's C4: a page carried over an update keeps its maps", () => {
  it("reads the files from the page's data, and only map files", () => {
    expect(mapFilesOfData(dataOf(CLN))).toEqual(CLN);
    expect(mapFilesOfData(dataOf(['/maps/r/r-CLN.svg', '/api/sync/x', 'https://elsewhere.test/maps/land50.svg', '/maps/../secret.svg', '/maps/r/r-cln.svg']))).toEqual(['/maps/r/r-CLN.svg']);
    expect(mapFilesOfData('{"type":"data","nodes":[{"type":"data","data":[{"d":1},{}]}]}')).toEqual([]);
    expect(mapFilesOfData('not json')).toEqual([]);
    for (const p of ['/maps/land50.svg', '/maps/land110.svg', '/maps/regions110.svg', '/maps/w/w-CON.svg', '/maps/r/r-CON.svg']) expect(isMapFile(p), p).toBe(true);
  });

  it("carryOver keeps each carried page's map files with its data; one not reached leaves the page to the next round", async () => {
    const s = new FakeStorage();
    await saveCarry(s, CUR, ['/species/copiapoa-cinerea']);
    const asked: string[] = [];
    let down = true;
    const server = async (url: string) => {
      const p = url.replace(O, '');
      asked.push(p);
      if (p.endsWith('/__data.json')) return new Response(dataOf(CLN), { headers: { 'content-type': 'application/json' } });
      if (down && p === '/maps/r/r-CLN.svg') throw new TypeError('Failed to fetch');
      return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
    };
    expect(await carryOver(s, CUR, server, O)).toEqual({ read: 0, gone: 0, left: 1 });
    down = false;
    expect(await carryOver(s, CUR, server, O)).toEqual({ read: 1, gone: 0, left: 0 });
    const cache = await s.open(CUR);
    for (const f of CLN) expect(await cache.match(O + f), f).toBeDefined();
    // Each file asked for once it was held: the second round asked only for the one the first did not reach.
    expect(asked.filter((p) => p === '/maps/land50.svg')).toHaveLength(1);
    expect(asked.filter((p) => p === '/maps/r/r-CLN.svg')).toHaveLength(2);
  });

  it("keepFiles fetches only this build's map files not yet held", async () => {
    const cache = new FakeCache();
    await cache.put(O + '/maps/land50.svg', new Response('held'));
    const asked: string[] = [];
    const ok = await keepFiles(cache, ['/maps/land50.svg', '/maps/r/r-CLN.svg', '/maps/r/r-ZZZ.svg', '/plants', 42], async (u) => { asked.push(u.replace(O, '')); return new Response('<svg/>'); }, O, (p) => p !== '/maps/r/r-ZZZ.svg');
    expect(ok).toBe(true);
    expect(asked).toEqual(['/maps/r/r-CLN.svg']);
  });
});
