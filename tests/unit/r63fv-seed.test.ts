/**
 * Round sixty-three, the fix pass (fixer V; review R1, 8): the example's seed is checked and set out by one tab at a time
 * (a Web Lock), and its "seeded" mark is written after the seed's one commit, so two tabs opening the example at once set
 * it out once, and a seed cut off before its commit (a reload in the first second) is set out on the next load rather
 * than leaving an empty example for good. A browser without Web Locks keeps the older order (tests/unit/r60f-demo.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';

const fault = { cut: false };
/** Web Locks as a browser has them: one holder of a name at a time, the rest queued in order. */
const held = new Map<string, Promise<unknown>>();
const locks = { request: (name: string, fn: () => Promise<unknown>) => { const before = held.get(name) ?? Promise.resolve(); const run = before.then(() => fn(), () => fn()); held.set(name, run.catch(() => {})); return run; } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks, language: 'en-GB' } });

const store = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }).sessionStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k)
};

// The collection store against an in-memory vault: what a page sees, without IndexedDB.
const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => { if (fault.cut) { fault.cut = false; throw new Error('the page was reloaded before the commit landed'); } mem.changes.push(...c); return { kept: c, replaced: [] }; },
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
  requestPersistence: async () => true
};
  // The claiming write of the real vault, over the same in-memory log: `build` sees the numbers the caller knows.
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  // No snapshot in memory: every load folds the whole log, as a first load does (the snapshot is tested on the real vault in fold-snapshot.test.ts).
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => { const had = (mem.meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem.meta.set('parked', out); return out; };
  m.lastArrival = async () => 0;
  // Arrival numbers as the order of the in-memory log, from 1 (round sixty-seven: the seed's mark is the arrival number of its own last change).
  m.arrivalsAfter = async (seq = 0) => ({ changes: mem.changes.slice(seq), seq: mem.changes.length, gen: 0 });
  m.arrivalsOf = async (ts: string[]) => new Map(ts.map((t) => [t, mem.changes.findIndex((c) => c.t === t) + 1] as [string, number]).filter(([, n]) => n > 0));
  m.changeKeys = async () => mem.changes.map((c) => c.t);
  if (!m.changesByKeys) m.changesByKeys = async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t));
  if (!m.updateMeta) m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  if (!m.changesOf) m.changesOf = async (kind: string, id: string) => (mem.changes as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.announceSyncForgotten = () => {};
  return m;
});

// The page loads in the example: which collection a page shows is read once, as it loads (round sixty-seven; triage-66 V3).
store.set('cultifolio.demo', '1');
const { collection } = await import('$lib/db/collection.svelte');
const { seedDemo, SEEDED, SEED_LOCK } = await import('$lib/ui/grow/demo-seed');

describe('the example\'s seed under a Web Lock', () => {
  it('a seed cut off before its commit leaves no mark, so the next load sets the example out', async () => {
    store.set('cultifolio.demo', '1');
    fault.cut = true;
    await expect(seedDemo()).rejects.toThrow('reloaded');
    expect(mem.meta.has(SEEDED)).toBe(false); // before the fix the mark was written first: an empty example for good
    expect(mem.changes).toHaveLength(0);
    expect(await seedDemo()).toBe(true);
    expect(mem.meta.get(SEEDED)).toBe(true);
    expect(collection.accessions.length).toBe(12);
  });
  it('two tabs opening an empty example at once set it out once', async () => {
    mem.changes.length = 0;
    mem.meta.clear();
    await collection.rebuild(); // a fresh example: nothing in its log
    expect(collection.accessions).toHaveLength(0);
    const before = mem.changes.length;
    const [a, b] = await Promise.all([seedDemo(), seedDemo()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(held.has(SEED_LOCK)).toBe(true);
    const seeded = mem.changes.length - before;
    expect(seeded).toBeGreaterThan(0);
    expect(await seedDemo()).toBe(false);
    expect(mem.changes.length - before).toBe(seeded);
  });
});
