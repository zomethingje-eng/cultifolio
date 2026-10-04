/**
 * Round-59 review, data area: the clock. Real vault over fake-indexeddb, as clock-park.test.ts does, plus a
 * localStorage stand-in so the clock correction and its confirmation persist across a reboot as they do in a browser.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;
const YEAR = 365 * DAY;

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

describe('Q1: a never-synced device takes in changes stamped five years ahead', () => {
  it('a peer\'s backup five years ahead: the HLC does not follow; the changes are held (not shown), not parked, and the preview counts them as restored', async () => {
    const T0 = Date.now();
    const b = await boot();
    await b.store.collection.load();
    const far = T0 + 5 * YEAR;
    const t = (n: number) => hlcEncode({ wall: far + n, count: 0, device: PEER });
    const file: Change[] = [
      { t: t(1), kind: 'accession', id: 'rfar', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: t(2), kind: 'accession', id: 'rfar', field: 'status', value: 'growing' },
      { t: t(3), kind: 'accession', id: 'rfar', field: 'acc', value: '2031-0001' }
    ];
    await b.store.collection.ingest(file, 'import');
    expect(b.store.collection.accession('rfar')).toBeUndefined(); // the restored plant is not shown
    expect(b.store.collection.heldList().length).toBe(3);
    expect(await b.vault.getMeta('parked')).toBeUndefined();
    // the clock did not follow: a new plant is stamped now
    const p = await b.store.collection.addAccession({ taxonName: 'Lithops' } as never);
    const mine = (await b.vault.allChanges()).filter((c) => c.id === p.id);
    expect(Math.max(...mine.map((c) => Number(c.t.slice(0, 13))))).toBeLessThan(T0 + 60_000);
    // the backup's preview, as io.ts builds it: summarise/previewMerge fold with no hold, so the plant is counted as added
    const { previewMerge } = await import('$lib/backup/backup');
    const pv = previewMerge([], file);
    expect(pv.addedByKind.accession).toBe(1);
  });

  it('this device\'s OWN stamps five years ahead (its clock was fast, then put right; never synced): a later edit is stored and silently not shown, for good', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 5 * YEAR); // the phone's clock five years fast
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'first' } as never);
    vi.setSystemTime(T0); // put right
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('first'); // own: folded
    await b.store.collection.put('accession', p.id, { notes: 'edited after the clock was put right', taxonName: 'Copiapoa humilis' });
    expect(b.store.collection.lastWriteError).toBeNull(); // nothing said
    const stored = (await b.vault.allChanges()).filter((c) => c.id === p.id && c.field === 'notes').map((c) => c.value);
    expect(stored).toContain('edited after the clock was put right'); // it is in the log
    // ...but the screen keeps the five-years-ahead value
    expect(b.store.collection.accession(p.id)?.notes).toBe('first');
    expect(b.store.collection.accession(p.id)?.taxonName).toBe('Copiapoa cinerea');
    // and the line under the bar says "Nothing is lost: set the clock right" although the clock is right
    expect(b.store.collection.clockBehindAt).toBeGreaterThan(Date.now() + 4 * YEAR);
    // a reload changes nothing
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('first');
  });
});

describe('Q2: the clock set back, forward, back', () => {
  it('never synced, set back three days: an edit to a field written in the last day of true time is stored and silently lost, and stays lost after the clock is put right', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'bought at the show' } as never);
    vi.setSystemTime(T0 - 3 * DAY);
    b = await boot();
    await b.store.collection.load();
    await b.store.collection.put('accession', p.id, { notes: 'repotted into pumice' });
    expect(b.store.collection.lastWriteError).toBeNull();
    expect(b.store.collection.accession(p.id)?.notes).toBe('bought at the show'); // the edit did not take
    vi.setSystemTime(T0 + 60_000); // put right
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('bought at the show'); // and never will: its stamp is older
    expect((await b.vault.allChanges()).some((c) => c.value === 'repotted into pumice')).toBe(true);
  });

  it('one day back is fine (the edit is stamped past the field)', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'a' } as never);
    vi.setSystemTime(T0 - 0.9 * DAY);
    b = await boot();
    await b.store.collection.load();
    await b.store.collection.put('accession', p.id, { notes: 'b' });
    expect(b.store.collection.accession(p.id)?.notes).toBe('b');
  });

  it('a device that synced (clock confirmed) and is then set back three days while offline: plants made since the last load are parked at the next load and stay parked after the clock is put right', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    b.hlc.trustServerTime(T0); // a sync run's reading, agreeing
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    await b.store.collection.snapshotWritten;
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'added today' } as never);
    expect(b.store.collection.accession(p.id)).toBeTruthy();

    vi.setSystemTime(T0 - 3 * DAY); // clock set back; no sync possible (offline)
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true); // Date.now() - confirmedAt is negative: still "confirmed"
    await b.store.collection.load();
    const plantShown = !!b.store.collection.accession(p.id);
    const parkedStored = ((await b.vault.getMeta<string[]>('parked')) ?? []).length;
    vi.setSystemTime(T0 + 5 * 60_000); // put right
    b = await boot();
    await b.store.collection.load();
    const afterFix = !!b.store.collection.accession(p.id);
    const listed = b.store.collection.parkedList().map((x) => x.label);
    // record what happened
    console.log('confirmed+set back 3d', { plantShown, parkedStored, afterFix, listed });
    expect(plantShown).toBe(false);
    expect(parkedStored).toBeGreaterThan(0);
    expect(afterFix).toBe(false);
  });

  it('forward a year, corrected by two readings, then back to true: the stored -1 year correction stays "confirmed", edits are stamped a year in the past and lost', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    b.hlc.trustServerTime(T0);
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'true time' } as never);

    vi.setSystemTime(T0 + YEAR); // clock forward a year
    b = await boot();
    await b.store.collection.load();
    b.hlc.trustServerTime(T0 + 1000, Date.now()); // first reading: pending
    vi.setSystemTime(T0 + YEAR + 2 * 60_000);
    b.hlc.trustServerTime(T0 + 2 * 60_000 + 1000, Date.now()); // second reading: correction of -1 year taken
    expect(Math.round(b.hlc.clockOffsetMs() / DAY)).toBe(-365);

    vi.setSystemTime(T0 + 5 * 60_000); // the grower puts the clock back to true; offline, no sync yet
    b = await boot();
    const off = b.hlc.clockOffsetMs();
    const checked = b.hlc.clockChecked();
    await b.store.collection.load();
    await b.store.collection.put('accession', p.id, { notes: 'edited after the clock was put back' });
    const shown = b.store.collection.accession(p.id)?.notes;
    const line = b.store.collection.clockBehindAt;
    const edit = (await b.vault.allChanges()).find((c) => c.value === 'edited after the clock was put back')!;
    console.log('the edit is stamped', Math.round((Number(edit.t.slice(0, 13)) - Date.now()) / DAY), 'days from true time');
    expect(Number(edit.t.slice(0, 13))).toBeLessThan(Date.now() - 300 * DAY); // stamped a year in the past: older than every value it was meant to replace
    // a whole-log fold under this clock (any rebuild: another tab's refold, a displaced stamp, a FOLD_RULES bump)
    await b.store.collection.rebuild();
    const afterRebuild = !!b.store.collection.accession(p.id);
    const parked = ((await b.vault.getMeta<string[]>('parked')) ?? []).length;
    console.log('forward a year then back', { offDays: off / DAY, checked, shown, line: line && new Date(line).toISOString(), afterRebuild, parked });
    expect(off).toBeLessThan(-300 * DAY);
    expect(checked).toBe(true);
    expect(shown).toBeUndefined(); // the load itself (offset changed, so the snapshot is not used) parked the plant
    expect(line).toBeNull(); // and nothing under the bar says why
    expect(afterRebuild).toBe(false);
    expect(parked).toBeGreaterThan(0);
  });
});

describe('Q1b: a peer change five years ahead after a never-synced device meets a correct one', () => {
  it('once the clock is confirmed the far-ahead changes are parked (not winning), and a correct device\'s later edit stands', async () => {
    const T0 = Date.now();
    const b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    const far: Change[] = [{ t: hlcEncode({ wall: T0 + 5 * YEAR, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'from 2031' }];
    await b.store.collection.ingest(far, 'import');
    expect(b.store.collection.accession(p.id)?.notes ?? null).toBeNull(); // held
    b.hlc.trustServerTime(Date.now());
    await b.store.collection.rebuild();
    expect(b.store.collection.parkedRecords).toBe(1);
    await b.store.collection.put('accession', p.id, { notes: 'now' });
    expect(b.store.collection.accession(p.id)?.notes).toBe('now');
  });
});

describe('Q2b: the writer and its peers judge a fast clock\'s stamps by different rules', () => {
  it('a device three days fast pushes once and is put right before a second reading: the peers park its edit by arrival, the writer keeps it folded for good', async () => {
    const { isParked } = await import('$core/log');
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    b.hlc.trustServerTime(T0);
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'before' } as never);
    vi.setSystemTime(T0 + 3 * DAY); // the clock jumps three days ahead; the old confirmation is still in its window
    b = await boot();
    await b.store.collection.load();
    await b.store.collection.put('accession', p.id, { notes: 'typed while three days fast' });
    const mine = (await b.vault.allChanges()).find((c) => c.value === 'typed while three days fast')!;
    // the push reaches the server at true time T0: every peer parks it by the arrival rule (takeBatch)
    expect(isParked(mine.t, { now: T0, arrival: T0, clockChecked: true })).toBe(true);
    b.hlc.trustServerTime(T0 + 1000, Date.now()); // the run's one reading: a large correction, pending
    vi.setSystemTime(T0 + 2 * DAY); // the grower puts the clock right two days later (true time), before any second reading
    b = await boot();
    await b.store.collection.load();
    b.hlc.trustServerTime(Date.now()); // the next run agrees: no correction, nothing re-judged
    await b.store.collection.rebuild();
    expect(b.store.collection.accession(p.id)?.notes).toBe('typed while three days fast'); // the writer shows it; every peer shows 'before'
    expect(b.store.collection.parkedRecords).toBe(0);
  });
});
