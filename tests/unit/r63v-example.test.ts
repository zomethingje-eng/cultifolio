/**
 * Round sixty-three, agent V (V2): the example collection as the answer to an empty grower page. The rules here, apart
 * from the pages (tests/e2e/r63v-visitor.spec.ts walks them): a tab whose storage refuses the flag is never sent
 * anywhere. Until round seventy-four an empty Today opened the example by itself, and a tab that left it was marked
 * (`cultifolio.sampleOut`) so it would not open again; since the owner's decision of round seventy-four nothing opens it
 * by itself, so there is no mark, and an empty page offers it with a button whether or not the tab has left it before.
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

// Round seventy-four: the subject of round sixty-three's three tests here was the mark that stopped an empty page from
// opening the example again. Nothing opens it by itself now, so each is turned to its opposite: no mark is written, and
// nothing reads one. On r74base Leave, a close and the address each wrote `cultifolio.sampleOut`.
describe('a tab that left the example is not marked, since no page opens it by itself (round seventy-four)', () => {
  it('Leave writes no mark before the navigation', async () => {
    session.m.set('cultifolio.demo', '1');
    const demo = await import('$lib/db/demo');
    demo.leaveDemo('/');
    expect(loc.href).toMatch(/^\/\?left=[a-z0-9]+$/);
    expect(session.m.has('cultifolio.sampleOut')).toBe(false);
    expect(['leftHere', 'markLeftByAddress', 'OUT'].filter((k) => k in demo)).toEqual([]);
  });
  it('a close in another tab sends the tab home and writes no mark', async () => {
    session.m.set('cultifolio.demo', '1');
    const { sampleClosedHere } = await import('$lib/db/demo');
    sampleClosedHere();
    expect(loc.href).toBe('/'); // home; the tab's note takes it out of the example, and the address marks nothing (round sixty-nine; triage-68 X1)
    expect(session.m.has('cultifolio.sampleOut')).toBe(false);
  });
  it('a tab whose storage refuses the flag is not sent anywhere', async () => {
    const { enterDemo } = await import('$lib/db/demo');
    const refuse = { ...session.s, getItem: () => { throw new Error('refused'); }, setItem: () => { throw new Error('refused'); } };
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: refuse });
    expect(enterDemo('/today')).toBe(false);
    expect(loc.href).toBe('http://x/today');
  });
  it('enterDemo opens on the page it is given, Today by default', async () => {
    const { enterDemo, ENTERING } = await import('$lib/db/demo');
    expect(enterDemo()).toBe(true);
    // Round seventy-seven (F): the address carries the entry's one-use token, and the page it opens sets the flag
    // (app.html's first script; tests/unit/r77f-enter.test.ts). On r77base: '/today', and the flag '1' set here.
    const token = session.m.get(ENTERING);
    expect(loc.href).toBe(`/today?enter=${token}`);
    expect(session.m.get('cultifolio.demo')).toBeUndefined();
  });
});

// Round seventy-four: the page no longer decides to go in (`entersHere` is gone); it decides whether to offer the
// button (`offersHere`), on the same open, empty, own collection, and a tab that left the example before is offered it
// too. On r74base `offersHere` did not exist.
describe('who is offered the example (round seventy-four: offered, never taken)', () => {
  it('a page offers it only on an open, empty, own collection, outside the example, and never opens it itself', async () => {
    const ex = await import('$lib/ui/grow/example.svelte');
    const { offersHere, example } = ex;
    expect('entersHere' in ex).toBe(false);
    example.settled = true;
    expect(offersHere()).toBe(false); // not open yet: never decided before the collection is read
    col.ready = true;
    expect(offersHere()).toBe(true);
    col.sowings = [{}];
    expect(offersHere()).toBe(false); // a batch is a collection
    col.sowings = [];
    col.taxa = [{ followed: true }];
    expect(offersHere()).toBe(false); // so is a species followed
    col.taxa = [];
    col.locations = [{}];
    expect(offersHere()).toBe(false); // and so is a space: a grower who began with their benches (round sixty-three, V2)
    col.locations = [];
    session.m.set('cultifolio.sampleOut', '1');
    expect(offersHere()).toBe(true); // a tab that left it before is offered it again: the button is the only way in
    session.m.set('cultifolio.demo', '1');
    expect(offersHere()).toBe(false); // already in it
    expect(loc.href).toBe('http://x/today'); // and nothing was opened
  });
});
