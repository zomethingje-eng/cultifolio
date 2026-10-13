/**
 * Round seventy, agent R: a snapshot that can be dropped under any clock (triage-69 R1; IND-5, rule 6). The snapshot
 * was read by its stored correction alone, while the fold holds by the correction in force, which is nothing while a
 * load waits for a reading. A snapshot written with three days in force, read by a load that waits, showed what a fold
 * of the whole log under that load's clock holds back, so dropping it changed the collection.
 *
 * The property test folds random logs under random clock states, through random reloads, sleeps, readings, another
 * tab's record and the grower's edits (the self-review's D2 and D4), and at every load requires the load's collection
 * (from the snapshot or the log) to be the whole log's fold under the same clock (`rebuild`). Each case marked "base"
 * fails on 526ecaf. On the real vault over an in-memory IndexedDB, as r69r-clock-slow.test.ts.
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

describe('a snapshot written with a large correction in force, read by a load that waits (IND-5)', () => {
  /** Three days slow, confirmed by two readings; a peer's plant added six hours ago (true time); folded in force. */
  async function inForceSnapshot() {
    // Confirmed four days before, the tab open since: the reload then waits (round seventy, R5: a load waits only when the
    // device clock has moved at least the correction since the reading).
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - 7 * DAY });
    const b = await boot();
    b.hlc.trustServerTime(T - 4 * DAY, Date.now());
    vi.advanceTimersByTime(2 * MIN);
    b.hlc.trustServerTime(T - 4 * DAY + 2 * MIN, Date.now());
    vi.advanceTimersByTime(4 * DAY - 2 * MIN);
    expect(b.hlc.clockOffsetMs()).toBe(3 * DAY);
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(T - 6 * HOUR, 0), kind: 'accession', id: 'p2', field: 'taxonName', value: 'Aloe vera' },
      { t: stamp(T - 6 * HOUR, 1), kind: 'accession', id: 'p2', field: 'status', value: 'growing' }
    ], true);
    await b.collection.load();
    expect(b.collection.accession('p2')?.taxonName).toBe('Aloe vera');
    expect(await b.collection.snapshotWritten).toBe(true);
    vi.setSystemTime(T + 2 * HOUR - 3 * DAY); // reloaded two hours on, still three days slow
    return boot();
  }
  it('base: the load folds the log, and holds the peer\'s plant as the whole log\'s fold does', async () => {
    const c = await inForceSnapshot();
    expect(c.hlc.clockOffsetMs()).toBe(0);
    await c.collection.load();
    expect(c.collection.loaded.from).toBe('log');
    expect(c.collection.accession('p2')).toBeUndefined();
    expect(c.collection.heldWaiting).toBe(2);
  });
  it('base: dropping the snapshot changes nothing the grower sees', async () => {
    const c = await inForceSnapshot();
    await loadAndCompare(c, 'IND-5');
  });
  it('a snapshot holding nothing past the waiting clock is still read (round sixty-nine\'s step 4)', async () => {
    // Confirmed four days before, the tab open since: the reload then waits (round seventy, R5: a load waits only when the
    // device clock has moved at least the correction since the reading).
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - 7 * DAY });
    const b = await boot();
    b.hlc.trustServerTime(T - 4 * DAY, Date.now());
    vi.advanceTimersByTime(2 * MIN);
    b.hlc.trustServerTime(T - 4 * DAY + 2 * MIN, Date.now());
    vi.advanceTimersByTime(4 * DAY - 2 * MIN);
    await b.vault.appendChanges([
      { t: stamp(T - 30 * DAY, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(T - 30 * DAY, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      // this device's own edit, stamped by the corrected clock: the hold never holds this device's changes
      { t: stamp(T - HOUR, 0, OWN), kind: 'accession', id: 'p1', field: 'notes', value: 'repotted' }
    ], true);
    await b.collection.load();
    expect(await b.collection.snapshotWritten).toBe(true);
    vi.setSystemTime(T + 2 * HOUR - 3 * DAY);
    const c = await boot();
    expect(c.hlc.clockOffsetMs()).toBe(0);
    expect(await loadAndCompare(c, 'step 4')).toBe('snapshot');
    expect(c.collection.accession('p1')?.notes).toBe('repotted');
  });
});

/* ---- the property ---- */

/** A small seeded generator (mulberry32), so a failing trial can be run again by its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, pick: <X>(xs: readonly X[]): X => xs[Math.floor(next() * xs.length)], chance: (p: number) => next() < p };
}
/** How far behind the true time the device clock runs (negative: ahead). */
const SKEWS = [0, 2 * MIN, 3 * DAY, 3 * DAY, 5 * DAY, -3 * DAY, 20 * HOUR] as const;
/** Where a change's stamp falls, against the true time of the first load. */
const WHEN = [-30 * DAY, -4 * DAY, -2 * DAY, -DAY, -12 * HOUR, -6 * HOUR, -HOUR, -3 * MIN, 3 * MIN, HOUR, 12 * HOUR, DAY, 3 * DAY, 10 * DAY] as const;
const FIELDS = ['locationId', 'notes', 'price', '_deleted', '_deleted'] as const;

/** One trial: a log, a clock, and three loads through random steps, each compared with the whole log's fold. */
async function trial(seed: number): Promise<Array<'log' | 'snapshot'>> {
  const r = rng(seed);
  const skew = r.pick(SKEWS);
  const raw = (trueTime: number) => trueTime - skew;
  let now = T; // the true time
  vi.useFakeTimers({ toFake: ['Date', 'performance'], now: raw(now) });
  let b = await boot();
  /** A reading of the server's clock, as a sync run takes one: two, a minute apart, for a correction past two days. */
  const reading = () => {
    b.hlc.trustServerTime(now, Date.now());
    vi.advanceTimersByTime(2 * MIN); now += 2 * MIN;
    b.hlc.trustServerTime(now, Date.now());
  };
  if (r.chance(0.75)) reading();
  // The log: every plant made a month ago by a peer, then changes from the peer and from this device across the clock.
  const log: Change[] = [];
  let n = 0;
  for (const id of IDS) log.push({ t: stamp(T - 30 * DAY, n++), kind: 'accession', id, field: 'taxonName', value: `Species ${id}` }, { t: stamp(T - 30 * DAY, n++), kind: 'accession', id, field: 'status', value: 'growing' });
  const changes = 6 + Math.floor(r.next() * 10);
  for (let i = 0; i < changes; i++) {
    const id = r.pick(IDS), field = r.pick(FIELDS);
    const value = field === '_deleted' ? r.chance(0.7) : `${field} ${i}`;
    const prev = log[Math.floor(r.next() * log.length)].t;
    const t = r.chance(0.1) ? hlcPast(prev, r.chance(0.5) ? PEER : OWN) : stamp(T + r.pick(WHEN), n++, r.chance(0.65) ? PEER : OWN);
    if (log.some((c) => c.t === t)) continue;
    log.push({ t, kind: 'accession', id, field, value });
  }
  await b.vault.appendChanges(log, true);
  const froms: Array<'log' | 'snapshot'> = [];
  for (let step = 0; step < 3; step++) {
    // A step between two loads, as a device lives through them.
    const what = r.pick(['reload', 'reload', 'sleep', 'reading', 'adopt', 'later', 'clear'] as const);
    if (what === 'reading') { reading(); await b.collection.rebuild(); await b.collection.snapshotWritten; } // the engine refolds when the clock in force changes
    if (what === 'clear' && r.chance(0.3)) b.hlc.clearClockOffset();
    const pass = r.pick([0, 0, 2 * HOUR, DAY, 8 * DAY]);
    now += pass;
    vi.setSystemTime(raw(now));
    b = await boot();
    if (what === 'sleep') { vi.setSystemTime(raw(now) + 2 * HOUR); now += 2 * HOUR; b.hlc.nowMs(); } // a sleep the monotonic clock did not count
    if (what === 'adopt' && ls.has(OFFSET_KEY) && onStorage) {
      // Another tab, open before this load, followed a short sleep and wrote the record, unsure and not waiting (the
      // self-review's D4): this tab takes it as written.
      const v = JSON.parse(ls.get(OFFSET_KEY)!) as Record<string, unknown>;
      ls.set(OFFSET_KEY, JSON.stringify({ ...v, unsure: true, out: false, jumped: 2 * HOUR }));
      onStorage({ key: OFFSET_KEY });
    }
    froms.push(await loadAndCompare(b, `seed ${seed}, step ${step} (${what}, skew ${skew / HOUR} h, in force ${b.hlc.clockOffsetMs() / HOUR} h)`));
    // The grower's edits, made under the clock as it now is: removals, restores and edits, some to records a peer's held
    // change also touches (the self-review's D2).
    const edits = Math.floor(r.next() * 3);
    for (let e = 0; e < edits; e++) {
      const id = r.pick(IDS);
      const live = !!b.collection.accession(id);
      if (r.chance(0.4)) { if (live) await b.collection.remove('accession', id); else if (b.collection.removedAccession(id)) await b.collection.restore('accession', id); }
      else if (live) await b.collection.put('accession', id, { notes: `edit ${seed}.${step}.${e}` });
    }
    if (edits) await b.collection.saveSnapshot();
  }
  return froms;
}

describe('the snapshot can be dropped under any clock (triage-69 R1, rule 6)', () => {
  // In groups of four seeds, so each group's tabs (their broadcast channels and module graphs) are let go after it.
  const seeds = Number(process.env.R70_SEEDS ?? 24); // more on demand: R70_SEEDS=200 npx vitest run …
  const froms: string[] = [];
  for (let from = 1; from <= seeds; from += 4) {
    it(`base: random logs under random clock states fold the same from the snapshot as from the whole log (seeds ${from} to ${Math.min(from + 3, seeds)})`, async () => {
      for (let seed = from; seed <= Math.min(from + 3, seeds); seed++) {
        await fresh();
        froms.push(...(await trial(seed)));
      }
    }, 300_000);
  }
  it('the snapshot was read often enough for the comparison to mean something', () => {
    expect(froms.filter((f) => f === 'snapshot').length).toBeGreaterThan(froms.length / 4);
  });
});
