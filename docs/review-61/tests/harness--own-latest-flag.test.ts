/**
 * Harness review of round sixty-one, mutation C15: the clock check reads this device's latest stamp (`ownLatest`,
 * collection.svelte.ts) and leaves out stamps made past another (`isPastStamp`): such a stamp is as far ahead as the
 * field it was placed after, and says nothing of this clock. Removing `!isPastStamp(t)` there passed every clock test.
 * The engine then warns "Some changes made on this device are dated as late as <a year on>... its clock was set ahead"
 * on a device whose clock was always right, after the grower edits a field that a peer's year-ahead change holds (one
 * the grower pressed Apply on).
 *
 * Also (mutation I9): a plant whose acquisition is a year alone ("2019", which the import now keeps) is numbered for
 * that year by the store's own `nextAccessionNumber`, as the import's plan numbers it (`yearOf` accepts `YYYY`). The
 * import tests check the plan, not the store; reverting the store's `yearOf` to `YYYY-` passed every test.
 *
 * PASSES on f4ab4f8 (a guard; each test fails under its mutation). Setup as r61h-snapshot-checked.test.ts.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--own-latest-flag.test.ts`.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode, hlcPast } from '$core/hlc';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');
const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const YEAR = 365 * 86_400_000;
const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot(): Promise<{ store: Store; vault: Vault; hlc: Hlc }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('the store, round sixty-one', () => {
  it("ownLatest leaves out this device's stamps made past a peer's far stamp", async () => {
    const now = Date.now();
    const own = (i: number) => hlcEncode({ wall: now - 3_600_000 + i, count: 0, device: DEV + '0000' });
    const peerFar = hlcEncode({ wall: now + YEAR, count: 0, device: PEER });
    const flagged = hlcPast(peerFar, DEV + '0000'); // this device's edit of the field, placed past the peer's stamp
    const b = await boot();
    await b.vault.appendChanges([
      { t: own(0), kind: 'accession', id: 'p1', field: 'acc', value: '2026-0001' },
      { t: own(1), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: own(2), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: flagged, kind: 'accession', id: 'p1', field: 'notes', value: 'mine, after Apply' }
    ], true);
    await b.store.collection.load();
    expect(b.store.collection.accession('p1')?.notes).toBe('mine, after Apply'); // folded: a flagged stamp is never held
    expect(b.store.collection.ownLatest()).toBe(own(2));
  });
  it('a plant acquired in a year alone is numbered for that year by the store, as the import plans it', async () => {
    const b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.nextAccessionNumber(undefined, '2019')).toMatch(/^2019-/);
    expect(b.store.collection.nextAccessionNumber(undefined, '2019-05')).toMatch(/^2019-/);
  });
});
