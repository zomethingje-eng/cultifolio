/**
 * Round sixty-nine, agent X: triage-68 X6 (IND-6). Without Web Locks, the example's seed is fenced in the transaction
 * that appends it: the claim must still be this tab's and the example unseeded, or nothing is written. A tab suspended
 * past its claim's minute woke and appended a second seed after another tab's, 24 plants; and a claimant's finally
 * cleared whatever claim was stored, another tab's included. Two tabs are two module graphs over one fake-indexeddb, as
 * two pages are; the clock is stood in. The vault's half is R's `requireMeta`, checked in the write's own transaction.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
const ss = new Map<string, string>();
const store = { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, String(v)), removeItem: (k: string) => void ss.delete(k), key: (i: number) => [...ss.keys()][i] ?? null, get length() { return ss.size; } };
const KEYS = ['sessionStorage', 'navigator'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
let now = 1_800_000_000_000;
beforeEach(() => {
  ss.clear();
  ss.set('cultifolio.demo', '1');
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} }); // no Web Locks: an older Safari
  now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

/** A page in the example: its own modules, and its seed's commit held at a gate until released. */
async function tab() {
  vi.resetModules();
  const seed = await import('$lib/ui/grow/demo-seed');
  const { collection } = await import('$lib/db/collection.svelte');
  const vault = await import('$lib/db/vault');
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  let reached!: () => void;
  const atGate = new Promise<void>((r) => (reached = r));
  const real = collection.putWith.bind(collection);
  vi.spyOn(collection, 'putWith').mockImplementation((async (...a: Parameters<typeof real>) => { reached(); await gate; return real(...a); }) as never);
  return { seed, vault, run: () => seed.seedDemo(), atGate, release: () => open() };
}
async function plants(): Promise<number> {
  vi.resetModules();
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return collection.accessions.length;
}

describe('the seed without Web Locks (X6; IND-6)', () => {
  it('a claimant suspended past its minute, whose claim another tab took and seeded under, writes nothing', async () => {
    const a = await tab();
    const aDone = a.run();
    await a.atGate; // A has claimed and checked; the phone suspends the tab
    now += 60_001; // its claim lapses
    const b = await tab();
    b.release();
    expect(await b.run()).toBe(true); // B claims and sets it out
    a.release(); // A wakes
    expect(await aDone).toBe(false); // base: true
    expect(await plants()).toBe(12); // base: 24
  });
  it('a stale claimant gives back only its own claim, never the claim of the tab now setting it out', async () => {
    const a = await tab();
    const aDone = a.run();
    await a.atGate;
    now += 60_001;
    const b = await tab();
    const bDone = b.run();
    await b.atGate; // B holds the claim now, mid-seed
    a.release();
    expect(await aDone).toBe(false);
    expect(String(await b.vault.getMeta('demoSeeding'))).toMatch(/^\d+:/); // still B's (base: null, cleared by A's finally)
    b.release();
    expect(await bDone).toBe(true);
    expect(await b.vault.getMeta('demoSeeding')).toBeNull(); // B's own, given back by B
    expect(await plants()).toBe(12);
  });
});
