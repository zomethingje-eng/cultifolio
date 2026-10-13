/**
 * Round seventy, agent X: triage-69 X3 (S-D6). The example's seed is written only into an empty log, checked in the
 * same transaction as the write, and a tab whose example already holds the visitor's records says why it has none of
 * its own. Without Web Locks a tab claimed the seed and found the log empty, was suspended within its claim's minute,
 * and woke to set the seed out over a plant the visitor had added meanwhile in another tab: the two shared 2026-0001,
 * the seed's mark fell after the visitor's plant, and Leave deleted it without asking.
 *
 * Two tabs are two module graphs over one fake-indexeddb, as two pages are; the seed's commit is held at a gate as
 * tests/unit/r69x-seed.test.ts holds it (the reviewer's reproduction, docs/review-69/self-D.md finding 6).
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

describe('the seed only into an empty log, checked in its own transaction (X3; S-D6)', () => {
  it('a claimant suspended within its minute does not set the seed out over a plant the visitor added in another tab', async () => {
    const a = await tab();
    const aDone = a.run();
    await a.atGate; // A has claimed and found the example empty; the phone suspends the tab
    now += 20_000; // within its claim's minute
    const b = await tab();
    b.release();
    expect(await b.run()).toBe(false); // A holds the claim
    const visitor = await visitorPage();
    await visitor.addAccessions(1, { taxonName: 'Visitor plant', acquired: today(), provenance: 'unknown' } as never);
    a.release(); // A wakes
    expect(await aDone).toBe(false); // base: true
    expect(a.held()).toBe(1); // and its bar says why the example has none of its own
    const { collection, edits } = await collectionNow();
    expect(collection.accessions.map((p) => p.taxonName)).toEqual(['Visitor plant']); // base: 13 plants, two numbered 2026-0001
    expect(edits).toBeGreaterThan(0); // Leave asks before deleting it (base: 0, deleted without a question)
  });
  it('nor over a batch the visitor started', async () => {
    const a = await tab();
    const aDone = a.run();
    await a.atGate;
    now += 20_000;
    const visitor = await visitorPage();
    await visitor.addSowing({ taxonName: 'Visitor seed', method: 'seed', sown: today(), count: 20 } as never);
    a.release();
    expect(await aDone).toBe(false); // base: true
    const { collection } = await collectionNow();
    expect(collection.accessions).toHaveLength(0);
    expect(collection.sowings.map((s) => s.taxonName)).toEqual(['Visitor seed']);
  });
  it('nor over a place the visitor made (passes once R applies `requireEmpty` in vault.ts: a need of round seventy)', async () => {
    const a = await tab();
    const aDone = a.run();
    await a.atGate;
    now += 20_000;
    const visitor = await visitorPage();
    await visitor.addLocation({ name: 'Visitor shelf', type: 'shelf', parentId: null });
    a.release();
    expect(await aDone).toBe(false); // base: true, and the shelf counted as the seed's
    const { collection, edits } = await collectionNow();
    expect(collection.accessions).toHaveLength(0);
    expect(edits).toBeGreaterThan(0);
  });
  it('a log holding only the visitor\'s place, read before the commit, is not set out over, and the tab says so', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: new Locks() } });
    const visitor = await visitorPage();
    await visitor.addLocation({ name: 'Visitor shelf', type: 'shelf', parentId: null });
    vi.resetModules();
    const seed = await import('$lib/ui/grow/demo-seed');
    let held = 0;
    expect(await seed.seedDemo(() => held++)).toBe(false); // base: true, the seed set out over it
    expect(held).toBe(1);
    const { collection, edits } = await collectionNow();
    expect(collection.locations.map((l) => l.name)).toEqual(['Visitor shelf']);
    expect(edits).toBeGreaterThan(0); // base: 0
  });
  it('an empty example is set out as before, and says nothing (a guard)', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: new Locks() } });
    vi.resetModules();
    const seed = await import('$lib/ui/grow/demo-seed');
    let held = 0;
    expect(await seed.seedDemo(() => held++)).toBe(true);
    expect(held).toBe(0);
    const { collection, edits } = await collectionNow();
    expect(collection.accessions).toHaveLength(12);
    expect(edits).toBe(0);
  });
});
