/**
 * Round sixty-seven, agent V (triage-66 V3; IND-1, S-A3, S-A4, S-A10, R45-17): which collection a page shows is decided
 * once, as it loads, and every scope reads that; a page whose example is closed under it (another tab's Leave, or its
 * database deleted) is in a closed state, writes nothing more and never opens that database again; the tab's flag and
 * the example's settings go only when the page really goes.
 *
 * The browser's storage and page events are stood in; fake-indexeddb is the database. The vault's half (`blocking` and
 * `openVault`) is the need in /tmp/r67/V-needs.md; with it reverted, the "closed" tests below fail (checked).
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
const loc = { href: 'http://x/plants/new', reload: vi.fn() };
let page: EventTarget;
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const set = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

beforeEach(() => {
  vi.resetModules();
  session.m.clear(); local.m.clear();
  loc.href = 'http://x/plants/new';
  page = new EventTarget();
  globalThis.indexedDB = new IDBFactory();
  set('sessionStorage', session.s);
  set('localStorage', local.s);
  set('location', loc);
  set('addEventListener', page.addEventListener.bind(page));
  set('removeEventListener', page.removeEventListener.bind(page));
  set('document', { visibilityState: 'visible' });
  delete (globalThis as { navigation?: unknown }).navigation; // Safari's engine before the Navigation API, an older Firefox
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
/** A page loaded in the example: its modules read the flag as they load. */
async function examplePage() {
  session.m.set('cultifolio.demo', '1');
  vi.resetModules();
  const demo = await import('$lib/db/demo');
  const stored = await import('$lib/ui/stored');
  const vault = await import('$lib/db/vault');
  return { demo, stored, vault };
}
const names = async () => (await indexedDB.databases()).map((d) => d.name).sort();

describe('the page\'s collection, read once (V3; S-A4, R45-17)', () => {
  it('a Leave answered Cancel where the browser does not say so writes the example\'s settings as the example\'s, not the grower\'s', async () => {
    vi.useFakeTimers();
    const { demo, stored } = await examplePage();
    local.m.set('cultifolio.lastLocation', 'growers-own-bench');
    page.addEventListener('beforeunload', (e) => e.preventDefault()); // the add form's own guard
    demo.leaveDemo('/');
    page.dispatchEvent(new Event('beforeunload', { cancelable: true })); // "Leave site?" … Cancel, said by nothing
    expect(demo.inDemo()).toBe(false); // the flag is off for the next page, as Leave needs (the first deploy's race)
    // Within the 3 s before the Leave is known to be called off, the visitor presses Add with a new place.
    stored.writeSetting('cultifolio.lastLocation', 'collection', 'example-place-id');
    expect(local.m.get('cultifolio.lastLocation')).toBe('growers-own-bench'); // base: 'example-place-id', the grower's own overwritten
    expect(session.m.get('cultifolio.demo.lastLocation')).toBe('example-place-id');
    expect(stored.sampleTab()).toBe(true);
    vi.advanceTimersByTime(3100);
    expect(demo.inDemo()).toBe(true); // called off: the flag is back
  });
  it('a page that loaded outside the example is the grower\'s, whatever the tab\'s flag says later', async () => {
    const { PAGE_IN_DEMO } = await import('$lib/db/demo');
    const stored = await import('$lib/ui/stored');
    session.m.set('cultifolio.demo', '1'); // a load into the example asked for, and not yet gone
    stored.writeSetting('cultifolio.units', 'device', 'us');
    expect([PAGE_IN_DEMO, local.m.get('cultifolio.units'), session.m.has('cultifolio.demo.units')]).toEqual([false, 'us', false]);
  });
  it('the labels page\'s picks, kept as the example\'s page goes, are the example\'s (S-A10)', async () => {
    const { demo, stored } = await examplePage();
    demo.leaveDemo('/');
    stored.writeSetting('cultifolio.labelsPicked', 'tab', '["r1sampleseeds0"]'); // keep() at visibilitychange, after the flag went
    expect([session.m.has('cultifolio.labelsPicked'), session.m.get('cultifolio.demo.labelsPicked')]).toEqual([false, '["r1sampleseeds0"]']); // base: under the grower's own key
  });
});

describe('the closed state (V3; IND-1, S-A3)', () => {
  it('another tab\'s Leave deletes the database: this page is closed, writes are refused with a sentence, and the database is never re-created', async () => {
    const { demo, vault } = await examplePage();
    await vault.setMeta('device', 'demodemodemo');
    expect(await names()).toContain('cultifolio-demo');
    // Tab A's next page deletes the example: this page's connection hears `versionchange`.
    const del = indexedDB.deleteDatabase('cultifolio-demo');
    await new Promise<void>((r) => { del.onsuccess = () => r(); });
    expect(demo.exampleClosed()).toBe(true);
    expect(loc.href).toBe('/?left=sample'); // asked to go home
    // "Leave site?" answered Cancel: the page stays. The flag and the example's copies are still the tab's until it goes.
    expect(session.m.get('cultifolio.demo')).toBe('1');
    expect(session.m.get('cultifolio.sampleClosed')).toBe('1'); // the next page's first script takes the flag off by this
    await expect(vault.setMeta('x', 1)).rejects.toThrow(demo.CLOSED_WORDS);
    await expect(vault.appendChanges([{ t: '1790000000000-0000-aaaaaaaaaaaa0000', kind: 'accession', id: 'r9', field: 'taxonName', value: 'Copiapoa cinerea' } as never])).rejects.toThrow('closed in another tab');
    expect(await names()).not.toContain('cultifolio-demo'); // base: re-created, empty, and the plant written into it
    page.dispatchEvent(new Event('pagehide')); // the page really goes
    expect([session.m.has('cultifolio.demo'), session.m.has('cultifolio.demo.lastLocation')]).toEqual([false, false]);
  });
  it('the channel and the database both tell the tab: it is asked to go once, and the closed state holds from the first', async () => {
    const { demo } = await examplePage();
    const asked: string[] = [];
    const real = loc;
    set('location', { get href() { return real.href; }, set href(v: string) { asked.push(v); real.href = v; }, reload: real.reload });
    demo.sampleClosedHere(); // the channel's "closed"
    demo.sampleClosedHere(); // then the database's versionchange
    expect(asked).toEqual(['/?left=sample']);
    expect(demo.exampleClosed()).toBe(true);
  });
  it('the lock goes as the example closes, not with the page, so the leaving tab\'s delete is not held up', async () => {
    const { Locks } = await import('./r67v-locks');
    const locks = new Locks();
    const hadNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    set('navigator', { locks });
    try {
      const { demo } = await examplePage();
      demo.keepSampleOpen();
      await new Promise((r) => setTimeout(r, 0));
      expect(locks.held.has('cultifolio-sample-open')).toBe(true);
      demo.markExampleClosed();
      await new Promise((r) => setTimeout(r, 0));
      expect(locks.held.has('cultifolio-sample-open')).toBe(false);
    } finally {
      if (hadNav) Object.defineProperty(globalThis, 'navigator', hadNav); else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });
});

describe('the address a Leave opens (V1)', () => {
  it('keeps a fragment after the query: the "+" on Places leads to /places?left=sample#add', async () => {
    const { leftAddress } = await import('$lib/db/demo');
    expect(leftAddress('/')).toBe('/?left=sample');
    expect(leftAddress('/places#add')).toBe('/places?left=sample#add');
    expect(leftAddress('/places?name=Shelf#add')).toBe('/places?name=Shelf&left=sample#add');
    expect(leftAddress('/plants/new?species=Copiapoa%20cinerea&key=5384013')).toBe('/plants/new?species=Copiapoa%20cinerea&key=5384013&left=sample');
  });
});
