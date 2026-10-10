/**
 * Round sixty-seven, agent V:
 * - triage-66 V2 (R45-2): an example left behind (its tab closed without Leave) that holds records the visitor added is
 *   kept, and offered back once, never deleted without a question; one with nothing of theirs in it is deleted.
 * - triage-66 V6 (S-A5): the first page after a Leave deletes the example only for a tab that was leaving (Leave's own
 *   mark, never the address alone), and only under the open lock, so never from under another tab that has it open.
 * The page's storage and a lock manager are stood in; fake-indexeddb is the database. The example's database is written
 * through the vault, as a page in the example writes it.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Locks } from './r67v-locks';

const ss = new Map<string, string>();
const store = { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, String(v)), removeItem: (k: string) => void ss.delete(k), key: (i: number) => [...ss.keys()][i] ?? null, get length() { return ss.size; } };
const had = { ss: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), loc: Object.getOwnPropertyDescriptor(globalThis, 'location') };
let locks: Locks;
beforeEach(() => {
  ss.clear();
  locks = new Locks();
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'http://x/' } });
});
afterEach(() => {
  for (const [k, d] of [['sessionStorage', had.ss], ['navigator', had.nav], ['location', had.loc]] as const) { if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
type C = { t: string; kind: string; id: string; field: string; value: unknown };
const ch = (n: number, kind: string, id: string, field: string, value: unknown): C => ({ t: `17900000000${String(n).padStart(2, '0')}-0000-aaaaaaaaaaaa0000`, kind, id, field, value });
const seed: C[] = [ch(0, 'accession', 'r1sampleseeds0', 'taxonName', 'Copiapoa cinerea'), ch(1, 'event', 'e1', 'acc', 's1sampleseeds0'), ch(2, 'event', 'e1', 't', 'potup'), ch(3, 'event', 'e1', 'plants', ['r2sampleseeds0'])];
/** An example tab's page writes its database, then goes (its tab closed): `visitor` changes after the seed, marked or not. */
async function leftBehind(visitor: C[], marked = true) {
  ss.set('cultifolio.demo', '1');
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  await vault.appendChanges(seed as never);
  if (marked) await vault.setMeta('demoSeedSeq', await vault.lastArrival());
  if (visitor.length) await vault.appendChanges(visitor as never);
  (await vault.openVault()).close();
  ss.clear(); // the tab is closed; a new one opens the site
  vi.resetModules();
  return import('$lib/db/demo');
}
const exists = async () => (await indexedDB.databases()).some((d) => d.name === 'cultifolio-demo');

describe('a leftover example (V2; R45-2)', () => {
  it('with a plant the visitor added: kept, and offered back once with the number of records', async () => {
    const demo = await leftBehind([ch(10, 'accession', 'r9', 'taxonName', 'Lithops lesliei'), ch(11, 'event', 'e9', 'acc', 'r9'), ch(12, 'event', 'e9', 't', 'acquire')]);
    const offered: number[] = [];
    expect(await demo.dropLeftoverSample((n) => offered.push(n))).toBe(false);
    expect(await exists()).toBe(true); // base: deleted, the visitor's plant with it, no question
    expect(offered).toEqual([2]);
    expect(await demo.dropLeftoverSample((n) => offered.push(n))).toBe(false);
    expect(offered).toEqual([2]); // once
    expect(await exists()).toBe(true);
  });
  it('with an edit to a seed plant, its marks cut off: counted from the seed\'s own changes', async () => {
    const demo = await leftBehind([ch(10, 'event', 'e9', 'acc', 'r1sampleseeds0'), ch(11, 'event', 'e9', 't', 'water')], false);
    const offered: number[] = [];
    expect(await demo.dropLeftoverSample((n) => offered.push(n))).toBe(false);
    expect(offered).toEqual([1]);
  });
  it('with nothing of the visitor\'s: deleted, so the next example starts fresh', async () => {
    const demo = await leftBehind([]);
    const offered: number[] = [];
    expect(await demo.dropLeftoverSample((n) => offered.push(n))).toBe(true);
    expect(offered).toEqual([]);
    expect(await exists()).toBe(false);
  });
  it('"Delete it" deletes it, and reading it never made a database that was not there', async () => {
    const demo = await leftBehind([ch(10, 'location', 'l9', 'name', 'Shelf')]);
    expect(await demo.deleteLeftoverSample()).toBe('deleted');
    expect(await exists()).toBe(false);
    expect(await demo.dropLeftoverSample()).toBe(false);
    expect(await exists()).toBe(false);
  });
});

describe('the first page after a Leave (V6; S-A5)', () => {
  it('an address alone (a copied link, a bookmark, the history) deletes nothing', async () => {
    const demo = await leftBehind([ch(10, 'location', 'l9', 'name', 'Shelf')]);
    // `?left=sample` took the tab out of the example (app.html); Leave's own mark is not there.
    expect(await demo.finishLeaving(50)).toBeNull(); // base: app.html set the mark from the address, and this deleted it
    expect(await exists()).toBe(true);
  });
  it('a real Leave waits for the example\'s other tabs to let go, and says so when one does not', async () => {
    const demo = await leftBehind([]);
    let release!: () => void;
    void locks.request('cultifolio-sample-open', { mode: 'shared' }, () => new Promise<void>((r) => (release = r))); // another example tab, still open
    await new Promise((r) => setTimeout(r, 0));
    ss.set('cultifolio.sampleLeft', '1');
    expect(await demo.finishLeaving(50)).toBe('blocked'); // base: deleted from under it, with no lock asked for
    expect(await exists()).toBe(true);
    release(); // that tab is told, and lets go (or closes)
    await new Promise((r) => setTimeout(r, 20));
    expect(await exists()).toBe(false); // and the delete that waited goes ahead
  });
  it('with no other tab, it deletes at once', async () => {
    const demo = await leftBehind([ch(10, 'location', 'l9', 'name', 'Shelf')]);
    ss.set('cultifolio.sampleLeft', '1');
    expect(await demo.finishLeaving(500)).toBe('deleted');
    expect(await exists()).toBe(false);
    expect(ss.has('cultifolio.sampleLeft')).toBe(false);
  });
});

describe('app.html\'s first script (V3, V6)', () => {
  /** The inline script, run against a stood-in page. */
  async function firstScript(search: string) {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync('src/app.html', 'utf8');
    const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    const dataset: Record<string, string> = {};
    const local = { getItem: () => null };
    new Function('localStorage', 'sessionStorage', 'document', 'location', code)(local, store, { documentElement: { dataset } }, { search });
    return dataset;
  }
  it('the address takes the tab out of the example, and marks nothing for deletion', async () => {
    ss.set('cultifolio.demo', '1');
    const d = await firstScript('?left=sample');
    expect([d.demo, ss.get('cultifolio.demo'), ss.get('cultifolio.sampleOut'), ss.get('cultifolio.sampleLeft')]).toEqual([undefined, undefined, '1', undefined]); // base: sampleLeft '1'
  });
  it('a tab sent home by another tab\'s Leave opens its next page outside the example, whatever the address (a reload, a link)', async () => {
    ss.set('cultifolio.demo', '1');
    ss.set('cultifolio.sampleClosed', '1');
    const d = await firstScript('');
    expect([d.demo, ss.get('cultifolio.demo'), ss.get('cultifolio.sampleClosed')]).toEqual([undefined, undefined, '1']); // the note stays for the page to say
  });
  it('an ordinary load in the example stays in it', async () => {
    ss.set('cultifolio.demo', '1');
    const d = await firstScript('?q=aloe');
    expect([d.demo, ss.get('cultifolio.demo')]).toEqual(['1', '1']);
  });
});
