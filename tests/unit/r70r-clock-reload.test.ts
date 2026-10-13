/**
 * Round seventy, second pass, agent R: the slow clock after a reload (triage-69 R5; R47-14, R46-17). Round sixty-nine
 * held a positive correction over two days out of force at every load, until a reading. R47's scenarios, each run
 * first against the first pass (R1, R2):
 *  1. a device three days slow, confirmed, reloaded offline twenty hours on: the grower's move, stamped three days
 *     back, lost to a peer's move made twelve hours before the reload, which the device had not seen (step 2 places an
 *     edit only past what it has seen). Fails after the first pass;
 *  2. a clock three days fast, set right while closed for over three days, keeps its minus three days: not fixable
 *     without a reading (a fast clock left fast and a fast clock set right read alike after the time it was closed),
 *     and a correction held out of force there would stamp ahead, which parks; held as it was, a guard;
 *  3. a reload a minute after a confirming reading, the clock unmoved, put the correction out of force. Fails after the
 *     first pass;
 *  4. a newly opened tab's first disagreeing reading wrote `out: true`, and every open tab took it. Fixed by the first
 *     pass (the load's wait is the tab's own), a guard here;
 *  5. a correction just under two days stayed in force at a load after the clock was set right while closed, and its
 *     edits, a day and more ahead, were held by peers and then overwrote their edits. Fails after the first pass.
 * The rule now: a load waits only when the device clock has moved at least the correction since the reading confirmed
 * it, which is what a slow clock set right does, and a correction over a day (`FOLLOW_HELD_MS`) waits, not over two.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// The real vault over an in-memory IndexedDB is slow on a loaded machine: a wipe or a replace took over ten seconds.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbb';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
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
async function confirmedSlow() {
  vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
  const b = await boot();
  b.hlc.trustServerTime(T, Date.now());
  vi.advanceTimersByTime(2 * MIN);
  b.hlc.trustServerTime(T + 2 * MIN, Date.now());
  return b;
}
async function reloadAt(trueTime: number) { vi.setSystemTime(trueTime - SLOW); return boot(); }

const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('a reload of a device still slow keeps its correction in force (R47-14)', () => {
  it('base: scenario 1, reloaded offline twenty hours on: the grower\'s later move wins over the peer\'s unseen one', async () => {
    const b = await confirmedSlow();
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(T - 30 * DAY, 2), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench A' }
    ], true);
    await b.collection.load();
    const c = await reloadAt(T + 20 * HOUR);
    expect(c.hlc.clockOffsetMs()).toBe(SLOW);
    await c.collection.load();
    await c.collection.put('accession', 'p1', { locationId: 'bench C' });
    // Back online: the peer's move, made twelve hours before the reload, arrives, and a reading confirms the clock.
    await c.vault.appendChanges([{ t: stamp(T + 8 * HOUR), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench B' }], true);
    vi.advanceTimersByTime(5 * MIN);
    c.hlc.trustServerTime(Date.now() + SLOW, Date.now());
    await c.collection.rebuild();
    expect(c.collection.accession('p1')?.locationId).toBe('bench C');
  });
  it('base: scenario 3, a reload a minute after a confirming reading keeps the correction in force', async () => {
    await confirmedSlow();
    vi.advanceTimersByTime(MIN);
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(SLOW);
  });
  it('guard: a reload after the clock was set right while closed waits for a reading', async () => {
    await confirmedSlow();
    vi.setSystemTime(T + 2 * HOUR); // the device clock now reads the true time: it moved three days and two hours
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(0);
  });
  it('guard: a reload four days on, the clock still slow, waits too: it cannot tell that from a clock set right', async () => {
    await confirmedSlow();
    const c = await reloadAt(T + 4 * DAY);
    expect(c.hlc.clockOffsetMs()).toBe(0);
  });
});

describe('a correction under two days (R47-14, scenario 5)', () => {
  const NEAR = 1.9 * DAY;
  async function confirmedNear() {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - NEAR });
    const b = await boot();
    b.hlc.trustServerTime(T, Date.now());
    expect(b.hlc.clockOffsetMs()).toBe(NEAR);
    return b;
  }
  it('base: set right while closed a day, it waits at the load, and the edits stamp by the true time', async () => {
    await confirmedNear();
    vi.setSystemTime(T + DAY); // set right: the clock moved the day and the correction
    const c = await boot();
    expect(c.hlc.nowMs() - (T + DAY)).toBe(0);
  });
  it('guard: still slow and closed a day, it stays in force', async () => {
    await confirmedNear();
    vi.setSystemTime(T + DAY - NEAR);
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(NEAR);
  });
  it('guard: a correction of a day or less is never held out of force', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - 20 * HOUR });
    const b = await boot();
    b.hlc.trustServerTime(T, Date.now());
    vi.setSystemTime(T + DAY);
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(20 * HOUR);
  });
});

describe('a clock three days fast set right while closed (R47-14, scenario 2)', () => {
  it('guard: the correction is kept, stamping behind until a reading, which parks nothing, and the grower\'s edit shows', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T + SLOW });
    const b = await boot();
    b.hlc.trustServerTime(T, Date.now());
    vi.advanceTimersByTime(2 * MIN);
    b.hlc.trustServerTime(T + 2 * MIN, Date.now());
    expect(b.hlc.clockOffsetMs()).toBe(-SLOW);
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(T + 4 * DAY - HOUR), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench B' }
    ], true);
    vi.setSystemTime(T + 4 * DAY); // set right, closed four days
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(-SLOW);
    await c.collection.load();
    await c.collection.put('accession', 'p1', { locationId: 'bench C' });
    expect(c.collection.accession('p1')?.locationId).toBe('bench C');
  });
});
