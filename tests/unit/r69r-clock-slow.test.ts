/**
 * Round sixty-nine, agent R: the slow clock (triage-68 R2; the self-review's D2, R46-17). R46's four steps:
 *  1. while a positive correction over two days waits for a reading, a peer's change far past the raw clock is held,
 *     not parked;
 *  2. an edit here is stamped past the field's newest stamp, held ones included;
 *  3. a confirmed correction is never taken out of force on one reading (nor by a sleep shorter than itself);
 *  4. the snapshot is keyed by the stored correction.
 * The device is three days slow throughout. Each case marked "base" fails on 1609c19. On the real vault over an
 * in-memory IndexedDB, as r62l-clock-snapshot.test.ts.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode, hlcCompare, isPastStamp } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbb';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
/** True time when the device's clock was confirmed three days slow. */
const T = Date.UTC(2026, 9, 2, 12, 0, 0);
const SLOW = 3 * DAY;
const stamp = (wall: number, count = 0, device = PEER) => hlcEncode({ wall, count, device });

async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc, collection: store.collection };
}
const ls = new Map<string, string>();
const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  vi.useRealTimers();
  if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete (globalThis as { localStorage?: unknown }).localStorage;
});
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** The device three days slow, confirmed by two readings two minutes apart; returns the module set. */
async function confirmedSlow() {
  vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
  const b = await boot();
  b.hlc.trustServerTime(T, Date.now());
  vi.advanceTimersByTime(2 * MIN);
  b.hlc.trustServerTime(T + 2 * MIN, Date.now());
  expect(b.hlc.clockOffsetMs()).toBe(SLOW);
  return b;
}
/** The moment `trueTime`, on this device's raw clock, as a load: the module set reloaded. */
async function reloadAt(trueTime: number) {
  vi.setSystemTime(trueTime - SLOW);
  return boot();
}

describe('one reading, or a short sleep, does not take a confirmed correction out of force (step 3)', () => {
  it('base: a reading 45 s off a confirmed three days leaves the three days in force, and tells no listener', async () => {
    const b = await confirmedSlow();
    const told: number[] = [];
    b.hlc.onClockOffsetChange((o) => told.push(o));
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now() + SLOW + 45_000, Date.now());
    await settle();
    expect(b.hlc.clockOffsetMs()).toBe(SLOW);
    expect(told).toEqual([]);
  });
  it('base: a reading ten days out (a proxy\'s wrong Date) leaves the three days in force until a second agrees', async () => {
    const b = await confirmedSlow();
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now() + 10 * DAY, Date.now());
    expect(b.hlc.clockOffsetMs()).toBe(SLOW);
  });
  it('base: a two-hour sleep that paused the monotonic clock leaves it in force', async () => {
    const b = await confirmedSlow();
    vi.setSystemTime(Date.now() + 2 * HOUR); // the device clock moves; performance.now() does not
    expect(b.hlc.nowMs() - Date.now()).toBe(SLOW);
  });
  it('a move forward past the correction (perhaps the clock set right in a sleep) still waits for a reading', async () => {
    const b = await confirmedSlow();
    vi.setSystemTime(Date.now() + SLOW + 2 * HOUR);
    expect(b.hlc.nowMs()).toBe(Date.now());
  });
});

describe('at a load, the correction waits; peers\' changes are held, not parked; an edit wins (steps 1 and 2)', () => {
  /** The confirmed device's log: p1 on bench A long ago, a peer's move to bench B twelve hours before the reload, and a peer's plant added six hours before it. */
  async function slowLog() {
    const b = await confirmedSlow();
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(T - 30 * DAY, 2), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench A' },
      { t: stamp(T + 8 * HOUR), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench B' },
      { t: stamp(T + 14 * HOUR, 0), kind: 'accession', id: 'p2', field: 'taxonName', value: 'Aloe vera' },
      { t: stamp(T + 14 * HOUR, 1), kind: 'accession', id: 'p2', field: 'status', value: 'growing' }
    ], true);
    await b.collection.load();
    return reloadAt(T + 20 * HOUR); // reloaded offline twenty hours on, still three days slow
  }
  it('base: the clock in force is the raw one, and it is not counted as checked', async () => {
    const b = await slowLog();
    expect(b.hlc.clockOffsetMs()).toBe(0);
    expect(b.hlc.clockChecked()).toBe(false);
    expect(b.hlc.clockStored()).toEqual({ offset: SLOW, checked: true });
  });
  it('base: the peer\'s plant from six hours ago and its move from twelve are held, not parked', async () => {
    const b = await slowLog();
    await b.collection.load();
    expect(b.collection.parkedRecords).toBe(0);
    expect(b.collection.heldWaiting).toBe(3);
    expect(b.collection.accession('p1')?.locationId).toBe('bench A');
  });
  it('base: the grower\'s move made then wins over the peer\'s older move once a reading confirms the three days', async () => {
    const b = await slowLog();
    await b.collection.load();
    await b.collection.put('accession', 'p1', { locationId: 'bench C' });
    const mine = (await b.vault.allChanges()).find((c: Change) => c.value === 'bench C')!;
    expect(isPastStamp(mine.t)).toBe(true);
    expect(hlcCompare(mine.t, stamp(T + 8 * HOUR))).toBeGreaterThan(0);
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now() + SLOW, Date.now());
    await b.collection.rebuild();
    expect(b.collection.accession('p1')?.locationId).toBe('bench C');
    expect(b.collection.accession('p2')?.taxonName).toBe('Aloe vera');
  });
});

describe('the snapshot is keyed by the stored correction (step 4)', () => {
  it('base: a snapshot written once the three days were confirmed is read by the next load, which waits for a reading', async () => {
    const b = await confirmedSlow();
    await b.vault.appendChanges([
      { t: stamp(T - DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' }
    ], true);
    await b.collection.load();
    expect(await b.collection.snapshotWritten).toBe(true);
    const c = await reloadAt(T + 2 * HOUR);
    expect(c.hlc.clockOffsetMs()).toBe(0);
    await c.collection.load();
    expect(c.collection.loaded.from).toBe('snapshot');
    expect(c.collection.accession('p1')?.taxonName).toBe('Lithops lesliei');
  });
  it('a snapshot written under another stored correction is not read', async () => {
    const b = await confirmedSlow();
    await b.vault.appendChanges([{ t: stamp(T - DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' }, { t: stamp(T - DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' }], true);
    await b.collection.load();
    expect(await b.collection.snapshotWritten).toBe(true);
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now(), Date.now()); // the clock was set right: the correction goes
    const c = await boot();
    await c.collection.load();
    expect(c.collection.loaded.from).toBe('log');
  });
});
