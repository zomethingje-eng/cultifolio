/**
 * Round sixty-seven, agent V (triage-66 V5; IND-6, S-A7, R45-16, S-E1): the example's seed is one atomic thing.
 * - Its commit carries its seeded mark and its own last arrival number (contract C1: `putWith`'s `opts.meta` and
 *   `opts.markLast`), and Leave counts the records that arrived after that number, whatever their stamps.
 * - An example whose mark is missing (a reload between an older build's commit and its mark) is marked from the seed's
 *   own changes, and is never set out twice.
 * - Without Web Locks, a seed whose commit fails stays retryable.
 * - The fold's snapshot is written after the seed.
 *
 * The seed's choice of its last change is tested on its own; the rest against the real vault on fake-indexeddb, with
 * the collection stood in where `putWith`'s new argument is what is checked (R's half of C1 is R's to test).
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ss = new Map<string, string>();
const hadSS = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const hadNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
beforeEach(() => {
  ss.clear();
  ss.set('cultifolio.demo', '1'); // every page here is the example's
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, String(v)), removeItem: (k: string) => void ss.delete(k), key: (i: number) => [...ss.keys()][i] ?? null, get length() { return ss.size; } } });
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  vi.doUnmock('$lib/db/collection.svelte');
});
afterEach(() => {
  if (hadSS) Object.defineProperty(globalThis, 'sessionStorage', hadSS); else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  if (hadNav) Object.defineProperty(globalThis, 'navigator', hadNav); else delete (globalThis as { navigator?: unknown }).navigator;
});
type C = { t: string; kind: string; id: string; field: string; value: unknown };
const ch = (n: number, kind: string, id: string, field: string, value: unknown): C => ({ t: `17900000000${String(n).padStart(2, '0')}-0000-aaaaaaaaaaaa0000`, kind, id, field, value });
/** The seed's one commit, in the order `putWith` writes it: its records, then its timelines, the seed batch's pot-up last. */
const seedCommit = (): C[] => [
  ch(0, 'location', 'l1sampleseeds0', 'name', 'Greenhouse'),
  ch(1, 'accession', 'r1sampleseeds0', 'taxonName', 'Copiapoa cinerea'),
  ch(2, 'sowing', 's1sampleseeds0', 'taxonName', 'Astrophytum asterias'),
  ch(3, 'taxon', 'copiapoa-cinerea', 'name', 'Copiapoa cinerea'),
  ch(4, 'event', 'e1', 'acc', 'r1sampleseeds0'),
  ch(5, 'event', 'e1', 't', 'water'),
  ch(6, 'event', 'e2', 'acc', 's1sampleseeds0'),
  ch(7, 'event', 'e2', 't', 'potup'),
  ch(8, 'event', 'e2', 'plants', ['r2sampleseeds0', 'r3sampleseeds0'])
];

describe('the seed\'s own last change (seedLast)', () => {
  it('is the last field of the pot-up whose plants all carry the seed\'s tag, as first written', async () => {
    const { seedLast } = await import('$lib/db/demo');
    const log = seedCommit();
    expect(seedLast(log)).toBe(log[8]);
    // The visitor pots up from the seed batch (plants of their own) and edits the seed's pot-up line afterwards.
    const later = [...log, ch(9, 'event', 'e9', 'acc', 's1sampleseeds0'), ch(10, 'event', 'e9', 't', 'potup'), ch(11, 'event', 'e9', 'plants', ['r9']), ch(12, 'event', 'e2', 'note', 'the two largest'), ch(13, 'event', 'e2', 'plants', ['r2sampleseeds0'])];
    expect(seedLast(later)).toBe(log[8]);
  });
  it('without the pot-up, the run of seed-tagged records the log opens with: never past the seed', async () => {
    const { seedLast } = await import('$lib/db/demo');
    const log = seedCommit().slice(0, 5);
    expect(seedLast(log)).toBe(log[2]);
    expect(seedLast([ch(0, 'accession', 'r9', 'taxonName', 'Aloe vera')])).toBeNull();
  });
});

describe('the mark, repaired, and Leave\'s count (S-A7, R45-16, IND-6)', () => {
  it('an example whose seed landed and whose marks did not: marked from the seed\'s changes, and the visitor\'s edits counted', async () => {
    const vault = await import('$lib/db/vault');
    const { sampleEdits, seedState, SEED_MARK } = await import('$lib/db/demo');
    await vault.appendChanges(seedCommit() as never);
    // The visitor waters a seed plant and notes another: their own, though on the seed's records.
    await vault.appendChanges([ch(20, 'event', 'e20', 'acc', 'r1sampleseeds0'), ch(21, 'event', 'e20', 't', 'water')] as never);
    await vault.appendChanges([ch(22, 'accession', 'r1sampleseeds0', 'notes', 'a new spine cluster')] as never);
    expect(await sampleEdits()).toBe(2); // base: 0 with no stamp, and Leave deleted the waterings with no question (K1)
    expect(await seedState('demoSeeded')).toBe('repaired');
    expect(await vault.getMeta(SEED_MARK)).toBe(9);
    expect(await vault.getMeta('demoSeeded')).toBe(true);
    expect(await seedState('demoSeeded')).toBe('marked');
    expect(await sampleEdits()).toBe(2);
  });
  it('an edit that arrived after the seed counts even when its stamp is older than the seed\'s (IND-6)', async () => {
    const vault = await import('$lib/db/vault');
    const { sampleEdits, SEED_MARK } = await import('$lib/db/demo');
    await vault.appendChanges(seedCommit() as never);
    await vault.setMeta(SEED_MARK, 9);
    await vault.appendChanges([{ ...ch(0, 'location', 'l9', 'name', 'Shelf'), t: '1789000000000-0000-bbbbbbbbbbbb0000' }] as never);
    expect(await sampleEdits()).toBe(1); // base: 0, the boundary a stamp read later
  });
  it('an example whose plants were all removed is never set out again (K2)', async () => {
    const vault = await import('$lib/db/vault');
    const { seedState } = await import('$lib/db/demo');
    await vault.appendChanges(seedCommit() as never);
    await vault.appendChanges([ch(30, 'accession', 'r1sampleseeds0', '_deleted', true)] as never);
    expect(await seedState('demoSeeded')).toBe('repaired'); // base: the seed ran again, 24 plants and 8 places
  });
  it('a seeded flag over an empty log (a commit that failed after the flag) is no seed: it is set out', async () => {
    const vault = await import('$lib/db/vault');
    const { seedState } = await import('$lib/db/demo');
    await vault.setMeta('demoSeeded', true);
    expect(await seedState('demoSeeded')).toBe('empty');
  });
});

describe('the commit (C1) and the browser without Web Locks', () => {
  /** The collection stood in: what `putWith` was given, and a commit that can fail once. */
  function standIn(fail = false) {
    const calls: unknown[][] = [];
    const rebuilt = { n: 0 };
    let failing = fail;
    vi.doMock('$lib/db/collection.svelte', () => ({
      collection: {
        scheme: { mode: 'year', width: 4 },
        accessions: [],
        load: async () => {},
        putWith: async (...a: unknown[]) => { calls.push(a); if (failing) { failing = false; throw new Error('QuotaExceededError'); } },
        rebuild: async () => { rebuilt.n++; }
      }
    }));
    return { calls, rebuilt };
  }
  it('the seed\'s commit carries its seeded mark and asks for its last arrival number, and the snapshot follows', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: new (await import('./r67v-locks')).Locks() } });
    const { calls, rebuilt } = standIn();
    const { seedDemo, SEEDED } = await import('$lib/ui/grow/demo-seed');
    const { SEED_MARK } = await import('$lib/db/demo');
    expect(await seedDemo()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0][5]).toEqual({ meta: { [SEEDED]: true }, markLast: SEED_MARK }); // base: no sixth argument; the mark and stamp were two later writes
    expect(rebuilt.n).toBe(1); // base: no snapshot after the seed (S-E1)
  });
  it('without Web Locks a seed whose commit fails leaves nothing marked, and the next load sets it out', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const { calls } = standIn(true);
    const vault = await import('$lib/db/vault');
    const { seedDemo, SEEDED } = await import('$lib/ui/grow/demo-seed');
    await expect(seedDemo()).rejects.toThrow('QuotaExceededError');
    expect(await vault.getMeta(SEEDED)).toBeUndefined(); // base: true, an empty example for good
    expect(await vault.getMeta('demoSeeding')).toBeNull(); // the claim given back
    expect(await seedDemo()).toBe(true);
    expect(calls).toHaveLength(2);
  });
  it('without Web Locks, two tabs at once: one claims the seed, the other leaves it', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const { calls } = standIn();
    const vault = await import('$lib/db/vault');
    const { seedDemo } = await import('$lib/ui/grow/demo-seed');
    await vault.setMeta('demoSeeding', `${Date.now()}:another-tab`); // another tab is setting it out
    expect(await seedDemo()).toBe(false);
    expect(calls).toHaveLength(0);
    await vault.setMeta('demoSeeding', `${Date.now() - 120_000}:a-tab-reloaded`); // its claim lapsed: a reload cut it off
    expect(await seedDemo()).toBe(true);
  });
});
