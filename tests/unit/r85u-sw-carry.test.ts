/**
 * Round eighty-five, agent U: review-c C6. A species page read before a deploy was gone offline after it: the worker kept
 * species pages in the build's own cache, which an update deletes, and the offline page then said "No connection". Now the
 * new worker lists, as it takes over and before anything is deleted, the species pages the builds before it held
 * (`carryList`), and while the device is online reads each one's data again from the new server (`carryOver`), with the
 * species page's own scripts: the offline page opens such a page from this build's cache (`keptData`), in this build's
 * format, never an old copy under new scripts.
 *
 * On r85base `carryList`, `saveCarry` and `carryOver` did not exist: after `pruneOnActivate` the device held no copy of
 * any species page (the last test shows that half).
 */
import { describe, it, expect } from 'vitest';
import { carryList, saveCarry, carryOver, pruneOnActivate, CARRY_KEY, CARRY_MAX, type CacheLike, type CacheStorageLike } from '../../src/lib/core/sw-keep';

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
const CUR = 'cultifolio-1761900000000', PREV = 'cultifolio-1761800000000', CORPUS = 'cultifolio-corpus';
const page = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } });

/** A device as round eighty-four's worker leaves it: three species pages read, one by a link (its data), the app's own files. */
async function before() {
  const s = new FakeStorage();
  const prev = await s.open(PREV);
  await prev.put(`${O}/species/copiapoa-cinerea`, page('old html'));
  await prev.put(`${O}/species/welwitschia-mirabilis/__data.json?x-sveltekit-invalidated=001`, new Response('{"old":1}'));
  await prev.put(`${O}/species/aloe-vera`, page('old html'));
  await prev.put(`${O}/species/copiapoa-cinerea`, page('old html, read again')); // read again: the most recent
  await prev.put(`${O}/plants`, page('shell'));
  await prev.put(`${O}/_app/immutable/chunks/old.js`, new Response('js'));
  await prev.put(`${O}/species/aloe-vera?was=x`, page('a query: not a page of its own')); // never kept so; ignored if it were
  await (await s.open(CORPUS)).put(`${O}/api/sheets?c=abc&b=1`, new Response('[]'));
  await s.open(CUR);
  return s;
}

describe('review-c C6: the species pages read before an update are read again after it', () => {
  it('the list: each species page of the builds before, once, the most recently read first; nothing else', async () => {
    const s = await before();
    expect(await carryList(s, CUR, CORPUS)).toEqual(['/species/copiapoa-cinerea', '/species/aloe-vera', '/species/welwitschia-mirabilis']);
  });
  it('kept before the old build is deleted, then each page\'s data read from the new server with the species page\'s scripts', async () => {
    const s = await before();
    await saveCarry(s, CUR, await carryList(s, CUR, CORPUS));
    expect(await pruneOnActivate(s, CUR, CORPUS, [])).toEqual([PREV]); // no tab open: the old build goes at once
    const asked: string[] = [];
    const server = async (url: string) => { asked.push(url.replace(O, '')); return url.endsWith('/__data.json') ? new Response(`{"page":"${url.replace(O, '')}"}`, { headers: { 'content-type': 'application/json' } }) : new Response('// the species page\'s script'); };
    const r = await carryOver(s, CUR, server, O, ['/_app/immutable/nodes/9.js', '/_app/immutable/assets/9.css']);
    expect(r).toEqual({ read: 3, gone: 0, left: 0 });
    expect(asked).toEqual(['/_app/immutable/nodes/9.js', '/_app/immutable/assets/9.css', '/species/copiapoa-cinerea/__data.json', '/species/aloe-vera/__data.json', '/species/welwitschia-mirabilis/__data.json']);
    const cur = await s.open(CUR);
    // What the offline page asks for (`keptData`): the page's data in this build's cache, the new server's.
    expect(await (await cur.match(`${O}/species/copiapoa-cinerea/__data.json`))!.text()).toBe('{"page":"/species/copiapoa-cinerea/__data.json"}');
    expect(await cur.match(`${O}/_app/immutable/nodes/9.js`)).toBeDefined();
    expect(await cur.match(CARRY_KEY)).toBeUndefined(); // the list is done
    // A second round asks nothing.
    asked.length = 0;
    expect(await carryOver(s, CUR, server, O, ['/_app/immutable/nodes/9.js'])).toEqual({ read: 0, gone: 0, left: 0 });
    expect(asked).toEqual([]);
  });
  it('the network gone half-way: what is read stays, the rest waits on the list for the next round; a page gone is dropped', async () => {
    const s = await before();
    await saveCarry(s, CUR, await carryList(s, CUR, CORPUS));
    let n = 0;
    const flaky = async (url: string) => {
      if (url.includes('aloe-vera')) return new Response('not found', { status: 404 });
      if (url.includes('welwitschia') && n++ === 0) throw new TypeError('Failed to fetch');
      return new Response('{}');
    };
    expect(await carryOver(s, CUR, flaky, O)).toEqual({ read: 1, gone: 1, left: 1 });
    const cur = await s.open(CUR);
    expect(await (await cur.match(CARRY_KEY))!.json()).toEqual(['/species/welwitschia-mirabilis']);
    expect(await cur.match(`${O}/species/aloe-vera/__data.json`)).toBeUndefined();
    expect(await carryOver(s, CUR, flaky, O)).toEqual({ read: 1, gone: 0, left: 0 });
    expect(await cur.match(`${O}/species/welwitschia-mirabilis/__data.json`)).toBeDefined();
  });
  it('a server failing (5xx) stops the round without dropping the page', async () => {
    const s = await before();
    await saveCarry(s, CUR, ['/species/copiapoa-cinerea']);
    expect(await carryOver(s, CUR, async () => new Response('error code: 502', { status: 502 }), O)).toEqual({ read: 0, gone: 0, left: 1 });
  });
  it(`at most ${CARRY_MAX} pages, the most recent; a device that read none carries none`, async () => {
    const s = new FakeStorage();
    const prev = await s.open(PREV);
    for (let i = 0; i < CARRY_MAX + 20; i++) await prev.put(`${O}/species/p-${i}`, page('x'));
    const list = await carryList(s, CUR, CORPUS);
    expect(list).toHaveLength(CARRY_MAX);
    expect(list[0]).toBe(`/species/p-${CARRY_MAX + 19}`);
    const none = new FakeStorage();
    await none.open(CUR);
    expect(await carryList(none, CUR, CORPUS)).toEqual([]);
    await saveCarry(none, CUR, []);
    expect(await (await none.open(CUR)).match(CARRY_KEY)).toBeUndefined();
  });
  it('without the carry, the update leaves no copy of any species page (what r85base did)', async () => {
    const s = await before();
    await pruneOnActivate(s, CUR, CORPUS, []);
    const cur = await s.open(CUR);
    expect((await cur.keys()).filter((k) => k.url.includes('/species/'))).toEqual([]);
  });
});
