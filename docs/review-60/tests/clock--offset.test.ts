/**
 * Round-60 self-review, clock area: the stored correction and its confirmation after a real change of the device clock.
 *
 * FAILS on 21257b7 (reproductions), except tests marked GUARD.
 * Run: npx vitest run tests/unit/clock--offset.test.ts
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import { isParked, type Change } from '$core/log';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');
type Dates = typeof import('$core/dates');

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;
const MIN = 60_000;

const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

async function boot(): Promise<{ store: Store; vault: Vault; hlc: Hlc; dates: Dates }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  const dates = await import('$core/dates');
  return { store, vault, hlc, dates };
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

/** A device three days slow, corrected by two sync readings a few minutes apart (+3 days in force, confirmed). */
async function slowAndCorrected(T0: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 - 3 * DAY);
  const b = await boot();
  b.hlc.trustServerTime(T0, Date.now()); // first reading of a large correction: pending
  vi.setSystemTime(T0 - 3 * DAY + 5 * MIN);
  b.hlc.trustServerTime(T0 + 5 * MIN, Date.now()); // the next run agrees: +3 days taken
  expect(Math.round(b.hlc.clockOffsetMs() / DAY)).toBe(3);
  await b.store.collection.load();
  const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'before' } as never);
  return { b, p };
}

describe('a correction outlives the clock change it corrected', () => {
  it('the grower sets a three-days-slow clock right and reopens the app offline: edits are stamped and dated three days ahead and every peer parks them (FAILS)', async () => {
    const T0 = Date.now();
    const { p } = await slowAndCorrected(T0);
    const fixedAt = T0 + 20 * MIN;
    vi.setSystemTime(fixedAt); // the clock set right (forward three days); no sync yet (a greenhouse, no signal)
    const b = await boot();
    await b.store.collection.load();
    expect(b.hlc.clockChecked()).toBe(true); // informational: the stale correction still counts as confirmed (its age is positive)
    await b.store.collection.put('accession', p.id, { notes: 'repotted' });
    const edit = (await b.vault.allChanges()).find((c) => c.value === 'repotted')!;
    const ahead = Number(edit.t.slice(0, 13)) - fixedAt;
    expect.soft(b.dates.localDate()).toBe(b.dates.localDate(new Date(fixedAt))); // a watering logged now is dated today (on 21257b7: three days on)
    expect.soft(ahead).toBeLessThan(DAY); // on 21257b7: ~3 days
    // pushed when the device is next online, it reaches the server at true time: every peer parks it by arrival, the writer folds it
    expect(isParked(edit.t, { now: fixedAt + 30 * MIN, arrival: fixedAt + 30 * MIN, clockChecked: true })).toBe(false);
  });

  it('the same in one open tab: the clock set right while the page stays open (FAILS: nothing notices until the next sync reading)', async () => {
    const T0 = Date.now();
    const { b, p } = await slowAndCorrected(T0);
    const fixedAt = T0 + 20 * MIN;
    vi.setSystemTime(fixedAt);
    await b.store.collection.put('accession', p.id, { notes: 'repotted' });
    const edit = (await b.vault.allChanges()).find((c) => c.value === 'repotted')!;
    expect(Number(edit.t.slice(0, 13)) - fixedAt).toBeLessThan(DAY); // on 21257b7: ~3 days
  });

  it('GUARD: the opposite fix (a fast clock set back to true) drops the correction at the next load, and the clock counts as unchecked', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 3 * DAY);
    let b = await boot();
    b.hlc.trustServerTime(T0, Date.now());
    vi.setSystemTime(T0 + 3 * DAY + 5 * MIN);
    b.hlc.trustServerTime(T0 + 5 * MIN, Date.now());
    expect(Math.round(b.hlc.clockOffsetMs() / DAY)).toBe(-3);
    vi.setSystemTime(T0 + 20 * MIN);
    b = await boot();
    expect(b.hlc.clockOffsetMs()).toBe(0);
    expect(b.hlc.clockChecked()).toBe(false);
  });

  it('GUARD: the slack. A clock nudged back four minutes after a reading stays confirmed; six minutes back does not', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    b.hlc.trustServerTime(T0, Date.now());
    vi.setSystemTime(T0 - 4 * MIN);
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true);
    vi.setSystemTime(T0 - 6 * MIN);
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(false);
  });
});

describe('rule 5: a load stores no verdict of its own clock', () => {
  it('a peer change three days ahead, restored from a file before the device synced, is not stored as parked by the load after the first reading (FAILS; still open from round 59, data review 9)', async () => {
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    const ahead: Change[] = [{ t: hlcEncode({ wall: Date.now() + 2.5 * DAY, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'from a peer\'s file, 2.5 days ahead' }];
    await b.store.collection.ingest(ahead, 'import'); // unchecked: held, nothing stored
    expect(((await b.vault.getMeta<string[]>('parked')) ?? []).length).toBe(0);
    b.hlc.trustServerTime(Date.now()); // sync set up: the first reading confirms the clock
    b = await boot();
    await b.store.collection.load(); // a load, nothing else
    expect(((await b.vault.getMeta<string[]>('parked')) ?? [])).toEqual([]); // on 21257b7: the stamp, stored for good
  });
});
