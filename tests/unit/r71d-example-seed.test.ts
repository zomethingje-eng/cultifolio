/**
 * Round seventy-one, agent D: a test for the survivor MD10 of the self-review's mutation run (finding 7). The bar says
 * "Its own plants and places were not set out, because something had already been added to it" only when the seed's
 * commit was refused for the visitor's records: a refusal because another tab has set the example out since (its mark)
 * is not the visitor's doing and says nothing. Saying it on any refusal passed every test. Without Web Locks, as
 * r70x-seed.test.ts stands two tabs in. A guard: passes on r71base, fails under the mutation.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Locks } from './r67v-locks';

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
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  let reached!: () => void;
  const atGate = new Promise<void>((r) => (reached = r));
  const real = collection.putWith.bind(collection);
  vi.spyOn(collection, 'putWith').mockImplementation((async (...a: Parameters<typeof real>) => { reached(); await gate; return real(...a); }) as never);
  let held = 0;
  return { run: () => seed.seedDemo(() => held++), atGate, release: () => open(), held: () => held };
}
/** Another page of the example, where the visitor adds something. */
async function visitorPage() {
  vi.resetModules();
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return collection;
}
async function collectionNow() {
  vi.resetModules();
  const demo = await import('$lib/db/demo');
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return { collection, edits: await demo.sampleEdits() };
}
const today = () => new Date(now).toISOString().slice(0, 10);

describe('guard (MD10): a seed refused because another tab set the example out says nothing', () => {
  it('the mark written meanwhile by another tab', async () => {
    const a = await tab();
    const aDone = a.run();
    await a.atGate; // A has claimed the seed and found the example empty
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    const demo = await import('$lib/db/demo');
    await vault.setMeta(demo.SEED_MARK, 1); // another tab (an older page) set the example out and marked it
    a.release();
    expect(await aDone).toBe(false);
    expect(a.held()).toBe(0);
  });
});
