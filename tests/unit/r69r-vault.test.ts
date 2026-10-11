/**
 * Round sixty-nine, agent R: the vault.
 *  - R4 (R46-21): a Replace cut off during the switch and finished by a later open is announced to the other tabs
 *    ('replaced'), so a tab still showing the old collection reloads rather than write half records into the new log.
 *  - For X6 (IND-6): `putWith`'s `requireMeta`, meta records checked in the write's own transaction; a write whose
 *    condition fails stores nothing and resolves to `{ ok: false, refused }`.
 *  - For X4 (S-C3): `replacePending()`, whether a replacement has begun and not finished.
 * Each case marked "base" fails on 1609c19.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const plant = (id: string, no: string, base: number, device = 'bbbbbbbbbbbb'): Change[] => [
  { t: stamp(base, 0, device), kind: 'accession', id, field: 'taxonName', value: 'Lithops ' + id },
  { t: stamp(base, 1, device), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: stamp(base, 2, device), kind: 'accession', id, field: 'acc', value: no }
];
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, collection: store.collection };
}
const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n, 0xff, 0xd9])], { type: 'image/jpeg' });
const realPut = IDBObjectStore.prototype.put;
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});

/** The grower's plant, a file staged, and the switch stopped by a full device (as r67r-replace-pending.test.ts). */
async function cutOff() {
  const base = Date.now() - 86_400_000;
  const a = await boot();
  await a.vault.appendChanges(plant('mine', '2026-0001', base, DEV), true);
  await a.collection.load();
  const st = await a.vault.openStaging();
  await st.putPhoto({ id: 'pfile', blob: jpeg(1), thumb: jpeg(2) });
  await st.appendChanges(plant('file', '2025-0001', base - 1000));
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
    if (this.name === 'photos' && this.transaction.db.name === 'cultifolio') throw new DOMException('', 'QuotaExceededError');
    return realPut.call(this, v, k);
  });
  await expect(st.promote()).rejects.toThrow();
  vi.restoreAllMocks();
  return a;
}

describe('a resumed Replace is announced (R4)', () => {
  it('base: the open that finishes it tells the other tabs "replaced"', async () => {
    await cutOff();
    const heard: unknown[] = [];
    const other = new BroadcastChannel('cultifolio-vault'); // another tab of this browser
    other.onmessage = (e) => heard.push(e.data);
    try {
      const b = await boot();
      await b.collection.load(); // the open finishes it
      expect(b.collection.accessions.map((x) => x.id)).toEqual(['file']);
      await vi.waitFor(() => expect(heard).toContain('replaced'), { timeout: 2000 });
      expect(await b.vault.replacePending()).toBe(false);
    } finally {
      other.close();
    }
  });
  it('one that cannot finish yet is not announced as done, and is said as pending', async () => {
    await cutOff();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
      if (this.name === 'photos' && this.transaction.db.name === 'cultifolio') throw new DOMException('', 'QuotaExceededError');
      return realPut.call(this, v, k);
    });
    const heard: unknown[] = [];
    const other = new BroadcastChannel('cultifolio-vault');
    other.onmessage = (e) => heard.push(e.data);
    try {
      const b = await boot();
      expect(await b.vault.replacePending()).toBe(true);
      await new Promise((r) => setTimeout(r, 50));
      expect(heard).not.toContain('replaced');
    } finally {
      other.close();
    }
  });
});

describe('putWith with requireMeta (for X6)', () => {
  const fields = { taxonName: 'Aloe vera', status: 'growing', acc: '2026-0001' };
  it('base: a claim that is not this tab\'s refuses the write: nothing stored, no meta, no error said', async () => {
    const a = await boot();
    await a.collection.load();
    await a.vault.setMeta('claim', 'other-tab');
    const r = await a.collection.putWith('accession', 'p1', fields, [], [], { meta: { seeded: true }, requireMeta: [{ key: 'claim', equals: 'this-tab' }] });
    expect(r).toEqual({ ok: false, refused: 'claim' });
    expect(await a.vault.allChanges()).toEqual([]);
    expect(await a.vault.getMeta('seeded')).toBeUndefined();
    expect(a.collection.accession('p1')).toBeUndefined();
    expect(a.collection.lastWriteError).toBeNull();
  });
  it('base: a mark that must be absent refuses the write when it is set, and allows it when it is null', async () => {
    const a = await boot();
    await a.collection.load();
    await a.vault.setMeta('seeded', true);
    expect(await a.collection.putWith('accession', 'p1', fields, [], [], { requireMeta: [{ key: 'seeded', absent: true }] })).toEqual({ ok: false, refused: 'seeded' });
    await a.vault.setMeta('seeded', null);
    expect(await a.collection.putWith('accession', 'p1', fields, [], [], { requireMeta: [{ key: 'seeded', absent: true }] })).toEqual({ ok: true });
    expect(a.collection.accession('p1')?.taxonName).toBe('Aloe vera');
  });
  it('base: every condition holding, the write and its meta land together', async () => {
    const a = await boot();
    await a.collection.load();
    await a.vault.setMeta('claim', 'this-tab');
    const r = await a.collection.putWith('accession', 'p1', fields, [], [], { meta: { seeded: true }, markLast: 'seedMark', requireMeta: [{ key: 'claim', equals: 'this-tab' }, { key: 'seeded', absent: true }] });
    expect(r).toEqual({ ok: true });
    expect(await a.vault.getMeta('seeded')).toBe(true);
    expect(typeof (await a.vault.getMeta('seedMark'))).toBe('number');
    expect(a.collection.accession('p1')).toBeDefined();
  });
});

describe('a stamp that is not a string in the tail read (R5)', () => {
  it('base: the changes after a row with a number for its stamp are read, and that row is left out', async () => {
    const a = await boot();
    const base = Date.now() - 86_400_000;
    await a.vault.appendChanges(plant('p1', '2026-0001', base), true);
    await a.vault.appendChanges([{ t: 5, kind: 'accession', id: 'p1', field: 'notes', value: 'x' } as unknown as Change], true);
    await a.vault.appendChanges(plant('p2', '2026-0002', base + 10), true);
    const got = await a.vault.arrivalsAfter(0); // base: IndexedDB refused the range, and every catch-up failed
    expect(got.changes.map((c) => c.id)).toEqual(['p1', 'p1', 'p1', 'p2', 'p2', 'p2']);
  });
});
