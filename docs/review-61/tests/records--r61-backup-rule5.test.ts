/**
 * Self-review of round sixty-one, records area: the backup and rule 5.
 *
 * Round sixty-one stopped storing parks judged by this device's clock alone ("No device keeps a verdict of its own clock
 * alone", /about/formats): they are kept in memory for the load. But `prepareBackup` writes `collection.parkedStamps`,
 * which holds those in-memory parks too, into the manifest's `parked`, and a replace (`stage.setParked`) or a merge
 * (`collection.markParked`) stores whatever the manifest lists. So a backup made while such a park is in memory, restored
 * here or on a new phone, turns a reading of the clock into a stored verdict for good.
 *
 * FAILS on f4ab4f8 (a reproduction). Run: npx vitest run tests/unit/records--r61-backup-rule5.test.ts
 * (about 10 s; it reads the real vault through fake-indexeddb, as r61l-clock-offset.test.ts does).
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
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

it('a backup made while a park judged by the clock alone is in memory does not make it a stored park when restored (rule 5)', { timeout: 120_000 }, async () => {
  let b = await boot();
  await b.store.collection.load();
  const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
  const ahead: Change[] = [{ t: hlcEncode({ wall: Date.now() + 2.5 * DAY, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'from a peer file, 2.5 days ahead' }];
  await b.store.collection.ingest(ahead, 'import'); // no arrival to judge it by: held
  b.hlc.trustServerTime(Date.now()); // sync set up: the clock is confirmed
  b = await boot();
  await b.store.collection.load(); // parked for this load, by the clock alone; nothing stored (round 61, rule 5)
  expect(b.store.collection.parkedRecords).toBe(1);
  expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);

  const io = await import('$lib/backup/io');
  const { readBackup } = await import('$lib/backup/backup');
  const { replaceThroughStaging } = await import('$lib/backup/replace');
  const file = await readBackup(new Uint8Array(await (await io.prepareBackup()).blob.arrayBuffer()));
  // On f4ab4f8 the manifest lists the clock's verdict as if it were one by arrival...
  expect(file.manifest.parked ?? []).toEqual([]);
  // ...and a replace from that file stores it for good.
  await replaceThroughStaging(file, b.vault.openStaging);
  b = await boot();
  expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);
});
