/**
 * Harness review of round sixty-one, mutation C16: a park judged by the clock alone is not stored, and the fold snapshot
 * carries it in its inventory (`held`) so the next load judges it again (FOLD_RULES 6; collection.svelte.ts saveFold:
 * `const held = [...this.heldStamps, ...[...this.parkedStamps].filter((t) => !this.storedParked.has(t))]`). Writing only
 * `[...this.heldStamps]` passed every clock and snapshot test (r61l-*, fold-snapshot, rule5, r61h-snapshot-checked,
 * clock-park, log-hold, collection-store, backup-parked, vault-hold, r60-clock-review).
 *
 * What the inventory is for: a peer's change three days ahead, with no arrival (restored from a file, or stored before
 * the order store), is parked by a confirmed clock for this load only. Two days later it is one day ahead: no longer
 * parked, only held, and a day after that it is due and shows. Without the inventory a load from the snapshot never looks
 * at it again: it is neither parked, nor held, nor shown, until something drops the snapshot.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). Setup as r61h-snapshot-checked.test.ts.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--snapshot-clock-park.test.ts`.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;

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
  vi.useRealTimers();
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  vi.useRealTimers();
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('a park judged by the clock alone, across loads from the snapshot', () => {
  it('is judged again at each load: parked while three days ahead, held at one day ahead, shown once due', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    b.hlc.trustServerTime(T0, T0); // a sync reading: the clock is confirmed, offset none
    // The log as a device would hold it before its first load of this build: a plant of its own and a peer's edit of it
    // stamped three days ahead, with no arrival. No snapshot yet, so the next load folds the log and writes one.
    const own = (i: number) => hlcEncode({ wall: T0 - 3_600_000 + i, count: 0, device: DEV + '0000' });
    const far = hlcEncode({ wall: T0 + 3 * DAY, count: 0, device: PEER });
    await b.vault.appendChanges([
      { t: own(0), kind: 'accession', id: 'p1', field: 'acc', value: '2026-0001' },
      { t: own(1), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: own(2), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: own(3), kind: 'accession', id: 'p1', field: 'notes', value: 'mine' },
      { t: far, kind: 'accession', id: 'p1', field: 'notes', value: 'from a peer three days ahead' }
    ], true);

    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    expect(b.store.collection.loaded?.from).toBe('log');
    expect(await b.store.collection.snapshotWritten).toBe(true); // the snapshot this test is about
    expect(b.store.collection.accession('p1')?.notes).toBe('mine');
    expect(b.store.collection.parkedStamps.has(far)).toBe(true); // parked by the confirmed clock, for this load

    vi.setSystemTime(T0 + 2 * DAY); // still within the reading's week; the change is now one day ahead
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    expect(b.store.collection.loaded?.from).toBe('snapshot');
    expect(b.store.collection.parkedStamps.has(far)).toBe(false);
    expect(b.store.collection.heldWaiting).toBe(1); // held, coming due: the inventory had it judged again

    vi.setSystemTime(T0 + 3 * DAY + 60_000); // due
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession('p1')?.notes).toBe('from a peer three days ahead');
  });
});
