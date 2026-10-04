/**
 * Round fifty-nine (the round forty-one review, 1): a device whose clock is set back two days or more judged its own
 * changes against it at load, parked them and stored the verdict, so the grower's plants were gone and stayed gone after
 * the clock was put right. A park judged by the clock alone is now kept only when a server reading has confirmed that
 * clock; otherwise this device's own changes are folded, a peer's far ahead is held for the load, and nothing is stored.
 * Real vault over fake-indexeddb, as rule5.test.ts does.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;

async function boot(): Promise<{ store: Store; vault: Vault; hlc: Hlc }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}

beforeEach(async () => {
  vi.useRealTimers();
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await vault.setMeta('device', DEV);
  await vault.setMeta('parked', []);
  await vault.setMeta('parkedDone', []);
  await vault.setMeta('sync', null);
  await vault.setMeta('issued:accession', []);
  await vault.setMeta('issued:sowing', []);
});
afterEach(() => vi.useRealTimers());

describe('a clock set back does not hide the grower\'s own plants', () => {
  it('three days back: the plant and its note still show, nothing is parked or written, and a line says the clock reads early', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'bought at the show' } as never);
    expect(b.store.collection.clockBehindAt).toBeNull();
    const logged = (await b.vault.allChanges()).length;

    vi.setSystemTime(T0 - 3 * DAY); // the phone's clock set back three days
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('bought at the show');
    expect(b.store.collection.parkedRecords).toBe(0);
    expect(await b.vault.getMeta('parked')).toEqual([]);
    expect((await b.vault.allChanges()).length).toBe(logged); // a reading wrote nothing
    expect(b.store.collection.clockBehindAt).toBeGreaterThan(Date.now());

    vi.setSystemTime(T0 + 60_000); // put right
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('bought at the show');
    expect(b.store.collection.clockBehindAt).toBeNull();
  });

  it('a peer\'s change dated past an unconfirmed clock is held for the load, not stored as parked, and folds once the clock is right', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Lithops' } as never);
    const peer: Change[] = [{ t: hlcEncode({ wall: T0 + 60_000, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'sourceFrom', value: 'from the peer' }];
    await b.store.collection.ingest(peer, 'server');

    vi.setSystemTime(T0 - 3 * DAY);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.sourceFrom ?? null).toBeNull(); // waits for the clock
    expect(b.store.collection.heldList()).toContain(peer[0].t);
    expect(await b.vault.getMeta('parked')).toEqual([]);

    vi.setSystemTime(T0 + 2 * 60_000);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.sourceFrom).toBe('from the peer');
  });

  it('against a clock a server reading confirmed, a change far ahead is parked and the park is kept, as round fifty-two designed', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const b = await boot();
    b.hlc.trustServerTime(T0); // a reading that agrees: the clock in force is confirmed
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Haworthia' } as never);
    const far: Change[] = [{ t: hlcEncode({ wall: T0 + 400 * DAY, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'sourceFrom', value: 'a year ahead' }];
    await b.store.collection.ingest(far, 'server');
    expect(b.store.collection.accession(p.id)?.sourceFrom ?? null).toBeNull();
    expect(b.store.collection.parkedRecords).toBe(1);
  });
});
