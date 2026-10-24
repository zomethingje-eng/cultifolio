/**
 * Round eighty-two (O): what the service worker keeps (the independent review's 8, its cache half).
 *
 * 1. On activation, every build cache older than the newest other one goes; that one stays only while a tab open at
 *    the takeover is open, and goes at the first look after the last of those tabs has gone (before, it stayed until
 *    the next deploy reached the device: the review found one from three weeks before).
 * 2. The species pages a device keeps, and the corpus answers, are capped; the oldest written go first.
 * 3. The worker uses all of it.
 *
 * On r82base: FAILED (no src/lib/core/sw-keep.ts; the worker kept the previous build until the next one, and capped nothing).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pruneOnActivate, sweepPrevious, capCache, isSpeciesEntry, SPECIES_KEEP, CORPUS_KEEP, HELD_KEY, type CacheLike, type CacheStorageLike } from '../../src/lib/core/sw-keep';

/** A cache as the Cache API keeps one: entries in the order written, and a write of a key already there moves it to the end. */
class FakeCache implements CacheLike {
  m = new Map<string, Response>();
  private key(r: { url: string } | string) { return new URL(typeof r === 'string' ? r : r.url, 'https://cultifolio.test').href; }
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
const CUR = 'cultifolio-1761200000000';
const PREV = 'cultifolio-1761100000000';
const OLD = 'cultifolio-1759500000000';
const CORPUS = 'cultifolio-corpus';
async function device() {
  const s = new FakeStorage();
  for (const n of [OLD, PREV, CUR, CORPUS, 'another-sites-cache']) await s.open(n);
  return s;
}

describe('r82o sw keep 1: the build before this one, only while a tab of it is open', () => {
  it('a takeover with a tab open keeps the previous build and drops the older, the corpus and others left alone', async () => {
    const s = await device();
    expect(await pruneOnActivate(s, CUR, CORPUS, ['tab-a'])).toEqual([OLD]);
    expect((await s.keys()).sort()).toEqual([PREV, CUR, CORPUS, 'another-sites-cache'].sort());
    expect(await (await s.open(CUR)).match(HELD_KEY)).toBeTruthy();
  });
  it('the previous build goes at the first look after the tabs open at the takeover have gone, and not before', async () => {
    const s = await device();
    await pruneOnActivate(s, CUR, CORPUS, ['tab-a', 'tab-b']);
    expect(await sweepPrevious(s, CUR, ['tab-b', 'tab-c'])).toBe(true); // tab b still runs the old build
    expect(await s.keys()).toContain(PREV);
    expect(await sweepPrevious(s, CUR, ['tab-c', 'tab-d'])).toBe(false); // a and b reloaded or closed
    expect(await s.keys()).not.toContain(PREV);
    expect(await (await s.open(CUR)).match(HELD_KEY)).toBeUndefined();
    expect(await sweepPrevious(s, CUR, [])).toBe(false); // nothing left to look at
  });
  it('a takeover with no tab open (the last tab of the old build closed) keeps no previous build at all', async () => {
    const s = await device();
    expect((await pruneOnActivate(s, CUR, CORPUS, [])).sort()).toEqual([OLD, PREV].sort());
    expect((await s.keys()).sort()).toEqual([CUR, CORPUS, 'another-sites-cache'].sort());
  });
  it('a first install (no other build) records nothing', async () => {
    const s = new FakeStorage();
    await s.open(CUR);
    expect(await pruneOnActivate(s, CUR, CORPUS, ['tab-a'])).toEqual([]);
    expect(await (await s.open(CUR)).match(HELD_KEY)).toBeUndefined();
  });
});

describe('r82o sw keep 2: the species pages and the corpus answers are capped, oldest written first', () => {
  it('the species pages past the cap go, oldest first; a page read again moves to the end; the shell and other pages are not counted', async () => {
    const c = new FakeCache();
    await c.put('/plants', new Response('shell'));
    await c.put('/about/how', new Response('about'));
    for (let i = 0; i < SPECIES_KEEP + 5; i++) {
      await c.put(`/species/s${i}`, new Response('page'));
      if (i === 10) await c.put('/species/s0', new Response('read again'));
    }
    expect(await capCache(c, SPECIES_KEEP, isSpeciesEntry)).toBe(5);
    const left = (await c.keys()).map((k) => new URL(k.url).pathname);
    expect(left.filter((p) => p.startsWith('/species/'))).toHaveLength(SPECIES_KEEP);
    expect(left).toContain('/species/s0');
    for (const p of ['/species/s1', '/species/s2', '/species/s3', '/species/s4', '/species/s5']) expect(left).not.toContain(p);
    expect(left).toContain('/plants');
    expect(left).toContain('/about/how');
  });
  it('a species page and its data are species entries; the shells, the about pages and the build files are not', () => {
    for (const u of ['https://x/species/copiapoa-cinerea', 'https://x/species/copiapoa-cinerea/__data.json?x-sveltekit-invalidated=01', 'https://x/s/abc']) expect(isSpeciesEntry(u)).toBe(true);
    for (const u of ['https://x/plants', 'https://x/about/how', 'https://x/_app/immutable/chunks/a.js', 'https://x/', 'https://x/speciesx']) expect(isSpeciesEntry(u)).toBe(false);
  });
  it('the corpus answers are capped at CORPUS_KEEP, which holds every group of the live corpus twice over', async () => {
    expect(CORPUS_KEEP).toBeGreaterThanOrEqual(2 * 256);
    const c = new FakeCache();
    for (let i = 0; i < CORPUS_KEEP + 3; i++) await c.put(`/api/sheets?b=${i}&c=x&n=256`, new Response('[]'));
    expect(await capCache(c, CORPUS_KEEP)).toBe(3);
    expect(await c.keys()).toHaveLength(CORPUS_KEEP);
    expect((await c.keys())[0].url).toContain('b=3&');
  });
});

describe('r82o sw keep 3: the worker uses it', () => {
  const sw = readFileSync('src/service-worker.ts', 'utf8');
  it('prunes on activation with the open tabs, sweeps from the fetch handler, and caps both caches', () => {
    expect(sw).toMatch(/pruneOnActivate\(caches, CACHE, CORPUS_CACHE, open\.map/);
    expect(sw).toMatch(/lookAtPrevious\(e\)/);
    expect(sw).toMatch(/capCache\(corpusCache, CORPUS_KEEP\)/);
    expect(sw).toMatch(/capCache\(cache, SPECIES_KEEP, isSpeciesEntry\)/);
    expect(sw).not.toMatch(/ours\.slice\(-1\)/);
  });
});
