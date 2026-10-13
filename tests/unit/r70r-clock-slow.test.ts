/**
 * Round seventy, agent R: the slow clock's step 2 across the fields of a record (triage-69 R2; the self-review's D2).
 * While a three-day correction waits for a reading at a load, a peer's changes of the last three days are held, and an
 * edit here was stamped past a held stamp of its own field only. Whether a plant is removed is decided across its
 * fields, so a removal made then was undone once the peer's held move folded, and an edit made then went with the
 * peer's held removal. Built on r69r-clock-slow's log; the reviewer's reproduction (zzd-slow), with guards. Each case
 * marked "base" fails on 526ecaf.
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
  // Confirmed four days before T, the tab open since (round seventy; triage-69 R5, R47-14): a load waits for a reading
  // only when the device clock has moved at least the correction since the reading that confirmed it.
  vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - 4 * DAY - SLOW });
  const b = await boot();
  b.hlc.trustServerTime(T - 4 * DAY, Date.now());
  vi.advanceTimersByTime(2 * MIN);
  b.hlc.trustServerTime(T - 4 * DAY + 2 * MIN, Date.now());
  vi.advanceTimersByTime(4 * DAY - 2 * MIN);
  return b;
}
async function reloadAt(trueTime: number) { vi.setSystemTime(trueTime - SLOW); return boot(); }
async function slowLog() {
  const b = await confirmedSlow();
  await b.vault.appendChanges([
    { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
    { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
    { t: stamp(T - 30 * DAY, 2), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench A' },
    { t: stamp(T - 30 * DAY, 3), kind: 'accession', id: 'p3', field: 'taxonName', value: 'Aloe vera' },
    { t: stamp(T - 30 * DAY, 4), kind: 'accession', id: 'p3', field: 'status', value: 'growing' },
    // a peer's edits twelve hours before the reload: a move of p1, and p3 removed
    { t: stamp(T + 8 * HOUR, 0), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench B' },
    { t: stamp(T + 8 * HOUR, 1), kind: 'accession', id: 'p3', field: '_deleted', value: true }
  ], true);
  await b.collection.load();
  return reloadAt(T + 20 * HOUR);
}
describe('step 2 covers every field a change could lose to (S-D2)', () => {
  it('base: a removal made while the correction waits is undone by a held peer edit to another field once the reading comes', async () => {
    const b = await slowLog();
    await b.collection.load();
    expect(b.collection.heldWaiting).toBeGreaterThan(0);
    await b.collection.remove('accession', 'p1'); // the grower removes the plant, eight hours after the peer moved it
    expect(b.collection.accession('p1')).toBeUndefined();
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now() + SLOW, Date.now());
    await b.collection.rebuild();
    expect(b.collection.accession('p1')).toBeUndefined(); // the grower removed it last
  });
  it('base: an edit made while the correction waits is hidden by a held peer removal once the reading comes', async () => {
    const b = await slowLog();
    await b.collection.load();
    expect(b.collection.accession('p3')?.taxonName).toBe('Aloe vera'); // the removal is held
    await b.collection.put('accession', 'p3', { notes: 'repotted today' });
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now() + SLOW, Date.now());
    await b.collection.rebuild();
    expect(b.collection.accession('p3')?.notes).toBe('repotted today'); // the grower edited it after the peer's removal
  });
  it('guard: a peer\'s held move to a plant not removed here still folds once the reading comes', async () => {
    const b = await slowLog();
    await b.collection.load();
    await b.collection.put('accession', 'p3', { notes: 'repotted today' });
    vi.advanceTimersByTime(5 * MIN);
    b.hlc.trustServerTime(Date.now() + SLOW, Date.now());
    await b.collection.rebuild();
    expect(b.collection.accession('p1')?.locationId).toBe('bench B');
  });
  it('guard: a removal is not stamped past a held change a day beyond the latest the real time may be', async () => {
    const b = await slowLog();
    await b.vault.appendChanges([{ t: stamp(T + 30 * DAY), kind: 'accession', id: 'p1', field: 'notes', value: 'a broken clock' }], true);
    await b.collection.load();
    await b.collection.remove('accession', 'p1');
    const mine = (await b.vault.allChanges()).find((c: Change) => c.field === '_deleted' && c.value === true && c.id === 'p1')!;
    expect(Number(mine.t.slice(0, 13))).toBeLessThan(T + 2 * DAY);
  });
});
