/**
 * Round sixty-three, agent V (V2): the example collection as the answer to an empty grower page. The rules here, apart
 * from the pages (tests/e2e/r63v-visitor.spec.ts walks them): a tab that left the example is marked so, by Leave, by the
 * address a Leave opens, and by a close in another tab, so an empty Today never opens it again (Leave would loop); a tab
 * whose storage refuses the flag is never sent anywhere. A tap no longer decides (round sixty-three, the fix pass; R1, 1):
 * the page it lands on does, by the open collection (tests/unit/r63fv-example.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
const loc = { href: 'http://x/today', reload: () => {} };
const had = { ss: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), ls: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), loc: Object.getOwnPropertyDescriptor(globalThis, 'location'), add: Object.getOwnPropertyDescriptor(globalThis, 'addEventListener') };
/** The collection as the pages read it: open or not, and what it holds. */
const col = { ready: false, accessions: [] as unknown[], sowings: [] as unknown[], locations: [] as unknown[], taxa: [] as unknown[], mySpecies: new Map<string, unknown>(), heldWaiting: 0, parkedRecords: 0 };
vi.mock('$lib/db/collection.svelte', () => ({ collection: col }));
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
const syncState = { configured: false, busy: null as string | null };
vi.mock('$lib/sync/engine.svelte', () => ({ sync: syncState }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));
beforeEach(() => {
  session.m.clear(); local.m.clear(); loc.href = 'http://x/today';
  Object.assign(col, { ready: false, accessions: [], sowings: [], locations: [], taxa: [], mySpecies: new Map() });
  vi.resetModules(); // each test a page of its own: which collection a page shows is read as it loads (round sixty-seven; triage-66 V3)
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session.s });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local.s });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: loc });
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: () => {} });
});
afterEach(() => {
  for (const [k, d] of [['sessionStorage', had.ss], ['localStorage', had.ls], ['location', had.loc], ['addEventListener', had.add]] as const) { if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

describe('the tab that left the example is marked, so an empty page never opens it again', () => {
  it('Leave marks it before the navigation', async () => {
    session.m.set('cultifolio.demo', '1');
    const { leaveDemo, leftHere } = await import('$lib/db/demo');
    expect(leftHere()).toBe(false);
    leaveDemo('/');
    expect(loc.href).toBe('/?left=sample');
    expect(leftHere()).toBe(true);
  });
  it('a close in another tab marks it too, and so does the address a Leave opens', async () => {
    session.m.set('cultifolio.demo', '1');
    const { sampleClosedHere, markLeftByAddress, leftHere, OUT } = await import('$lib/db/demo');
    sampleClosedHere();
    expect(loc.href).toBe('/?left=sample'); // the address says it too, for the next page's first script (round sixty-seven; triage-66 V3)
    expect(leftHere()).toBe(true);
    session.m.delete(OUT);
    markLeftByAddress();
    expect(leftHere()).toBe(true);
  });
  it('a tab whose storage refuses the flag is not sent anywhere, and reads as left (never entered by itself)', async () => {
    const { enterDemo, leftHere } = await import('$lib/db/demo');
    const refuse = { ...session.s, getItem: () => { throw new Error('refused'); }, setItem: () => { throw new Error('refused'); } };
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: refuse });
    expect(enterDemo('/today')).toBe(false);
    expect(loc.href).toBe('http://x/today');
    expect(leftHere()).toBe(true);
  });
  it('enterDemo opens on the page it is given, Today by default', async () => {
    const { enterDemo } = await import('$lib/db/demo');
    expect(enterDemo()).toBe(true);
    expect(loc.href).toBe('/today');
    expect(session.m.get('cultifolio.demo')).toBe('1');
  });
});

describe('who is taken into the example', () => {
  it('a page decides only on an open, empty, own collection in a tab that has not left it', async () => {
    const { entersHere, example } = await import('$lib/ui/grow/example.svelte');
    example.settled = true;
    expect(entersHere()).toBe(false); // not open yet: never decided before the collection is read
    col.ready = true;
    expect(entersHere()).toBe(true);
    col.sowings = [{}];
    expect(entersHere()).toBe(false); // a batch is a collection
    col.sowings = [];
    col.taxa = [{ followed: true }];
    expect(entersHere()).toBe(false); // so is a species followed
    col.taxa = [];
    col.locations = [{}];
    expect(entersHere()).toBe(false); // and so is a place: a grower who began with their benches (round sixty-three, V2)
    col.locations = [];
    session.m.set('cultifolio.sampleOut', '1');
    expect(entersHere()).toBe(false); // left here
    session.m.delete('cultifolio.sampleOut');
    session.m.set('cultifolio.demo', '1');
    expect(entersHere()).toBe(false); // already in it
  });
});
