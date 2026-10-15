/**
 * Round seventy-one, agent D: tests for the survivors of the self-review's mutation run in the fold (finding 7).
 *  - MC3, MC4: a snapshot is read only by a clock that holds nothing it folded (`reach`, round seventy's R1). Read a day
 *    past it, or five minutes past it, the default 24 seeds of r70r-snapshot-clock's property test passed (160 caught the
 *    day, none the five minutes). Here a peer's stamp lies 7 minutes and 14 hours past a waiting load's clock, folded in a
 *    snapshot written with three days in force: the load must fold the log and hold it.
 *  - MC9: a removal is placed past a held edit to any field of its record, a field this build does not know included (a
 *    newer build's, which the record carries): stamped behind it, the plant came back when the edit came due.
 * Each passes on r71base and fails under its mutation (guards).
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// The real vault over an in-memory IndexedDB is slow on a loaded machine: a wipe or a replace took over ten seconds.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
import { hlcEncode, hlcPast } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const OWN = DEV + '0000';
const PEER = 'bbbbbbbbbbbb';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
const OFFSET_KEY = 'cultifolio.clockOffsetMs';
/** True time when the device's clock was first confirmed. */
const T = Date.UTC(2026, 9, 2, 12, 0, 0);
const stamp = (wall: number, count = 0, device = PEER) => hlcEncode({ wall, count, device });

/** The other tabs' storage events reach the clock module through this, as a browser delivers them. */
let onStorage: ((e: { key: string }) => void) | null = null;
const hadAdd = (globalThis as { addEventListener?: unknown }).addEventListener;
async function boot() {
  vi.resetModules();
  onStorage = null;
  (globalThis as { addEventListener?: unknown }).addEventListener = (type: string, fn: (e: { key: string }) => void) => { if (type === 'storage') onStorage = fn; };
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { vault, hlc, collection: store.collection };
}
type Booted = Awaited<ReturnType<typeof boot>>;
const ls = new Map<string, string>();
const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function fresh() {
  ls.clear();
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
}
beforeEach(async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  await fresh();
}, 60_000);
afterEach(() => {
  vi.useRealTimers();
  (globalThis as { addEventListener?: unknown }).addEventListener = hadAdd;
  if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** What the grower is shown of the plants, the held and the parked. */
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5'];
function picture(c: Booted['collection']) {
  return JSON.parse(JSON.stringify({
    records: IDS.map((id) => c.accession(id) ?? c.removedAccession(id) ?? c.waiting('accession', id) ?? null),
    held: c.heldWaiting,
    parked: c.parkedList(),
    own: c.parkedOwn(),
    incomplete: c.incomplete
  }));
}
/** The load as it came, then the whole log folded under the same clock: they must agree (rule 6). */
async function loadAndCompare(b: Booted, label: string): Promise<'log' | 'snapshot'> {
  await b.collection.load();
  const from = b.collection.loaded.from;
  const loaded = picture(b.collection);
  await b.collection.rebuild();
  expect(loaded, `${label}: the load from the ${from} and the whole log's fold differ`).toEqual(picture(b.collection));
  await b.collection.snapshotWritten;
  return from;
}


describe('guard (MC3, MC4): the snapshot\'s reach at its edge', () => {
  for (const ahead of [7 * MIN, 14 * HOUR]) it(`a peer's stamp ${ahead / MIN} min past a waiting load's clock, folded with three days in force, is held and the snapshot not read`, async () => {
    const SLOW = 3 * DAY;
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - 7 * DAY });
    const b = await boot();
    b.hlc.trustServerTime(T - 4 * DAY, Date.now());
    vi.advanceTimersByTime(2 * MIN);
    b.hlc.trustServerTime(T - 4 * DAY + 2 * MIN, Date.now());
    vi.advanceTimersByTime(4 * DAY - 2 * MIN); // the device clock now reads T - 3 days; the true time is T
    expect(b.hlc.clockOffsetMs()).toBe(SLOW);
    const loadRaw = T - SLOW + HOUR; // the reload, an hour on, still slow
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(loadRaw + ahead, 0), kind: 'accession', id: 'p1', field: 'notes', value: 'peer' }
    ], true);
    await b.collection.load();
    expect(b.collection.accession('p1')?.notes).toBe('peer');
    expect(await b.collection.snapshotWritten).toBe(true);
    vi.setSystemTime(loadRaw);
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(0);
    await loadAndCompare(c, 'edge');
    expect(c.collection.accession('p1')?.notes).toBeUndefined();
  });
});

describe('guard (MC9): a removal follows a held edit to a field this build does not know', () => {
  it('the plant stays removed when the peer\'s edit comes due', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T });
    const b = await boot();
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(T - 30 * DAY, 2), kind: 'accession', id: 'p1', field: 'harvestKg', value: 1 },
      // a peer whose clock runs twelve hours fast: held here until then
      { t: stamp(T + 12 * HOUR, 0), kind: 'accession', id: 'p1', field: 'harvestKg', value: 2 }
    ], true);
    await b.collection.load();
    expect(b.collection.heldWaiting).toBe(1);
    await b.collection.remove('accession', 'p1');
    expect(b.collection.accession('p1')).toBeUndefined();
    vi.setSystemTime(T + 13 * HOUR);
    await b.collection.rebuild();
    expect(b.collection.accession('p1')).toBeUndefined();
  });
});
