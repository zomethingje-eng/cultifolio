/**
 * Round-60 self-review, clock area: the rebase of this device's own stale stamps (collection.stampPast + commit).
 * Adopted in round sixty-one (agent L) from docs/review-60/tests/clock--rebase.test.ts. The rebase is gone (decision 1):
 * an edit is stamped past the field's stamp, however far ahead, flagged as made past it (`hlcPast`), and shows. The four
 * reproductions (findings 1, 2, 6, 9) failed on the round-sixty base and pass now. The review's GUARD "one fast stamp
 * per field is rebased and the edit shows" tested the removed rebase (it asserted the edit was stamped now, not a year
 * ahead): it is dropped, and the test in its place asserts the new rule on the same story.
 *
 * Real vault over fake-indexeddb with a localStorage stand-in, the boot pattern of r60-clock-review.test.ts.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');

const DEV = 'aaaaaaaaaaaa';
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

/** A plant made while the clock was a year fast, its notes edited once more then; the clock put right and confirmed by a sync reading. */
async function fastThenConfirmed() {
  const T0 = Date.now();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 + YEAR);
  let b = await boot();
  await b.store.collection.load();
  const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'typed while fast' } as never);
  await b.store.collection.put('accession', p.id, { notes: 'edited while fast' });
  vi.setSystemTime(T0); // put right
  b = await boot();
  b.hlc.trustServerTime(T0); // a sync run's reading, agreeing: the clock is now confirmed
  expect(b.hlc.clockChecked()).toBe(true);
  await b.store.collection.load();
  expect(b.store.collection.accession(p.id)?.notes).toBe('edited while fast');
  return { b, p, T0 };
}

describe('an edit always wins, on a confirmed clock, over a field this device wrote twice while fast', () => {
  it('the first edit after the clock is confirmed is shown (round 60: the older fast stamp took the field back)', async () => {
    const { b, p } = await fastThenConfirmed();
    await b.store.collection.put('accession', p.id, { notes: 'edited after the clock was put right' });
    expect(b.store.collection.lastWriteError).toBeNull();
    const shown = b.store.collection.accession(p.id)?.notes;
    expect(shown).toBe('edited after the clock was put right'); // on 21257b7: 'typed while fast'
  });

  it('a removal of a plant made while fast takes (round 60: the plant stayed, one of its fields parked)', async () => {
    const { b, p } = await fastThenConfirmed();
    await b.store.collection.remove('accession', p.id);
    expect(b.store.collection.accession(p.id)).toBeUndefined(); // on 21257b7: still shown
  });

  it('the grower\'s own replaced text is not offered back as "an edit from a device whose clock was wrong" (round 60: offered back)', async () => {
    const { b, p } = await fastThenConfirmed();
    await b.store.collection.put('accession', p.id, { notes: 'one' });
    await b.store.collection.put('accession', p.id, { notes: 'two' });
    expect(b.store.collection.accession(p.id)?.notes).toBe('two');
    // The record page's Parked notice reads parkedFor: on 21257b7 it lists 'edited while fast' / 'typed while fast' as edits
    // "from a device whose clock was wrong ... not applied", with Apply, which would write the old text over 'two'.
    expect(b.store.collection.parkedFor('accession', p.id)).toEqual([]);
  });
});

describe('one fast stamp per field: the edit is stamped past it, flagged, and shows (replaces the review\'s rebase GUARD)', () => {
  it('a field written once while fast, edited after the clock is confirmed: shown, survives a reload, flagged as made past the old stamp', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + YEAR);
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'typed while fast' } as never);
    vi.setSystemTime(T0);
    b = await boot();
    b.hlc.trustServerTime(T0);
    await b.store.collection.load();
    await b.store.collection.put('accession', p.id, { notes: 'after' });
    expect(b.store.collection.accession(p.id)?.notes).toBe('after');
    const edit = (await b.vault.allChanges()).find((c) => c.value === 'after')!;
    expect(Number(edit.t.slice(0, 13)) - T0).toBeGreaterThan(YEAR - DAY); // placed just past the year-ahead stamp
    expect(b.hlc.isPastStamp(edit.t)).toBe(true); // and flagged, so no device holds or parks it
    expect(((await b.vault.getMeta<string[]>('parked')) ?? []).length).toBe(0); // nothing parked by the edit itself
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('after');
  });
});

describe('the held notice after an edit stamped past a held change', () => {
  it('a held change the grower has already overridden is not counted as one that "appears when this device\'s date reaches it" (round 60: heldWaiting stayed 1)', async () => {
    const { hlcEncode } = await import('$core/hlc');
    const b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    const t = hlcEncode({ wall: Date.now() + 3 * 3600_000, count: 0, device: 'bbbbbbbbbbbbq0q0' });
    await b.store.collection.ingest([{ t, kind: 'accession', id: p.id, field: 'notes', value: 'a peer three hours fast' }], 'server');
    expect(b.store.collection.heldWaiting).toBe(1); // "1 change from a device whose clock runs ahead is waiting. It appears when this device's date reaches it."
    await b.store.collection.put('accession', p.id, { notes: 'edited here meanwhile' }); // stamped past the held change (FOLLOW_HELD_MS)
    const mine = (await b.vault.allChanges()).find((c) => c.value === 'edited here meanwhile')!;
    expect(mine.t > t).toBe(true); // so the held change will never appear
    expect(b.store.collection.heldWaiting).toBe(0); // on 21257b7: 1, and the plants list, Today and the sync page say it will appear
  });
});
