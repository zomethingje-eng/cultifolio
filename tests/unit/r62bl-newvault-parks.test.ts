/**
 * Adopted in the second pass of round sixty-two (agent L) from the data review's `data--newvault-parks.test.ts` (its 5).
 * The decision: the new vault gets the parked changes with their verdict (`logBatch`'s `parked`), and a reader stores
 * the verdicts before it folds, so the joining phone parks them as the writer does. The phone below reads exactly what a
 * pushed batch says (the outbox's changes, and as verdicts the stored parks among them) the way `takeBatch` reads it;
 * the whole path through the real engine is in r62l-clock-engine.test.ts. It FAILED on the first pass: the outbox left
 * the parked fields out, and the phone was told the plant waits for a newer version of the app.
 * Reviewer "data", round sixty-two: a new vault is not sent what this device holds as parked (A15, `outboxFill`). When
 * the parked changes are a record's own required fields (a plant made while this device was a year fast, judged by its
 * arrival and parked here, then edited after the clock was put right: the edit is marked and folds), a device joining
 * the new vault gets the edit and not the record, and says it waits "for a change from a newer version of the app",
 * with nothing to Apply. In the old vault every device had the parked fields, parked them, and showed Parked with Apply.
 * Real vault over fake IndexedDB. Run: npx vitest run tests/unit/data--newvault-parks.test.ts
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode, hlcPast } from '$core/hlc';
import type { Change } from '$core/log';
import { logBatch } from '$lib/sync/limits';

const DEV = 'aaaaaaaaaaaa';
const DAY = 86_400_000;
const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('a new vault and a record whose own fields are parked', () => {
  it('the device joining the new vault parks the plant\'s fields as the writer does, and offers Apply', async () => {
    let b = await boot();
    await b.store.collection.load();
    const far = Date.now() + 365 * DAY;
    const me = DEV + 'zz00';
    const made: Change[] = [
      { t: hlcEncode({ wall: far, count: 0, device: me }), kind: 'accession', id: 'r-fast', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: hlcEncode({ wall: far, count: 1, device: me }), kind: 'accession', id: 'r-fast', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: far, count: 2, device: me }), kind: 'accession', id: 'r-fast', field: 'acc', value: '2027-0001' }
    ];
    const edit: Change = { t: hlcPast(made[2].t, me), kind: 'accession', id: 'r-fast', field: 'notes', value: 'edited after the clock was put right' };
    await b.vault.appendChanges([...made, edit], false);
    // judged by their batch's arrival (judgeOwn), as every peer judged them: parked and stored
    await b.store.collection.markParked(made);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.waiting('accession', 'r-fast')?.parked).toBe(true); // here: Parked, with Apply
    // Stop syncing, then a new vault: the first push sends what outboxFill put in the outbox
    await b.vault.outboxClear();
    await b.vault.outboxFill();
    const sent = await b.vault.changesByKeys(await b.vault.outboxKeys());
    expect(sent.map((c) => c.t).sort()).toEqual([...made, edit].map((c) => c.t).sort()); // every change goes, the parked ones too
    const batch = logBatch(DEV, sent, sent.filter((c) => b.store.collection.storedParks.has(c.t)).map((c) => c.t));
    expect(batch.v).toBe(2);
    expect([...(batch as { parked?: string[] }).parked ?? []].sort()).toEqual(made.map((c) => c.t).sort());
    // a new phone joins the new vault and receives exactly that
    await b.vault.wipeVault();
    await wipeMeta(b.vault);
    await b.vault.setMeta('device', 'cccccccccccc');
    b.hlc._resetClockOffset();
    const c = await boot();
    await c.store.collection.load();
    // as takeBatch reads it: the verdicts into the log and stored as parked, then the rest folded
    const verdicts = new Set((batch as { parked?: string[] }).parked ?? []);
    const parked = sent.filter((x) => verdicts.has(x.t));
    await c.vault.appendChanges(parked, true);
    await c.store.collection.markParked(parked);
    await c.store.collection.ingest(sent.filter((x) => !verdicts.has(x.t)), 'server');
    const w = c.store.collection.waiting('accession', 'r-fast');
    // Expected: the phone is not told a newer version of the app may bring the plant's name. Either the parked fields
    // reach it (still a year ahead of this arrival, they park there too, with Apply), or it is not counted as waiting.
    expect(w === undefined || w.parked).toBe(true); // was { missing: ['taxonName', 'status'], parked: false }
    expect(c.store.collection.parkedFor('accession', 'r-fast').length).toBeGreaterThan(0);
  });
});
