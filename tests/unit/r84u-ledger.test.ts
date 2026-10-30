/**
 * Round eighty-four, agent U: outside review B5, the number ledger outside the log.
 *
 * Plant 2026-0001, a backup, plant 2026-0002, then Replace from the older file: the log holds only 0001, and the number
 * 0002, given here after the file was taken, was remembered only in `meta['issued:accession']`. That record is promised
 * to be droppable (the log is what is kept); dropped, the next number offered was 2026-0002 again. Now the Replace writes
 * the numbers it keeps into the replacement's log (a setting record, `numbers-kept-…`), so they are read back from the
 * log like any record. Real vault over fake IndexedDB, through the backup page's own calls.
 *
 * On r84base: the first test's last assertion read 2026-0002 (and the log held no record of the kept number).
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DEV = 'aaaaaaaaaaaa';
const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { vault, collection: store.collection, hlc };
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

/** The backup page's Replace: the file opened as the page opens it, then restored with mode 'replace'. */
async function replaceWith(bytes: Blob) {
  const io = await import('$lib/backup/io');
  const o = await io.openBackup(new File([bytes], 'old.cultifolio.zip', { type: 'application/zip' }));
  return io.restoreBackup(o, 'replace');
}
const year = new Date().getFullYear();
const no = (n: number) => `${year}-${String(n).padStart(4, '0')}`;

describe('a Replace keeps the numbers it does not bring back in the log (B5)', () => {
  it('the next number stays past one given after the file was taken, with the ledger in meta dropped', { timeout: 120_000 }, async () => {
    let b = await boot();
    await b.collection.load();
    await b.collection.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    const io = await import('$lib/backup/io');
    const file = (await io.prepareBackup()).blob;
    await b.collection.addAccession({ taxonName: 'Lithops lesliei' } as never);
    expect(b.collection.accessions.map((a) => a.acc).sort()).toEqual([no(1), no(2)]);
    const r = await replaceWith(file);
    expect(r.countedAsBackup).toBe(true);
    // The page reloads after a Replace: a fresh load reads the replaced log.
    b = await boot();
    await b.collection.load();
    expect(b.collection.accessions.map((a) => a.acc)).toEqual([no(1)]);
    expect(b.collection.nextAccessionNumber()).toBe(no(3)); // with the ledger: as before
    // The log itself says 0002 is given: one setting record, written by this device.
    const log = await b.vault.allChanges();
    const kept = log.filter((c) => c.kind === 'setting' && c.id.startsWith('numbers-kept'));
    expect(kept.map((c) => [c.field, c.value])).toEqual([['accession', [no(2)]]]);
    // The ledger in meta dropped, as the log's promise allows: the number is still not offered again.
    await b.vault.setMeta('issued:accession', undefined as never);
    b = await boot();
    await b.collection.load();
    expect(await b.vault.getMeta('issued:accession')).toBeFalsy();
    expect(b.collection.nextAccessionNumber()).toBe(no(3)); // r84base: 2026-0002
    expect(b.collection.isNumberTaken(no(2))).toBe(true);
    // A number typed by hand is refused as before.
    await expect(b.collection.addAccession({ taxonName: 'Aloe vera', acc: no(2) } as never)).rejects.toThrow(/already used/);
  });

  it('a second Replace keeps the first one\'s numbers, and one from a file that carries them all writes nothing', { timeout: 120_000 }, async () => {
    let b = await boot();
    await b.collection.load();
    await b.collection.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    const io = await import('$lib/backup/io');
    const first = (await io.prepareBackup()).blob;
    await b.collection.addAccession({ taxonName: 'Lithops lesliei' } as never);
    await replaceWith(first);
    b = await boot();
    await b.collection.load();
    // A file of this replaced collection: it carries its kept record, so replacing from it keeps what it says and adds none.
    const second = (await (await import('$lib/backup/io')).prepareBackup()).blob;
    await b.collection.addAccession({ taxonName: 'Aloe vera' } as never); // 0003
    await replaceWith(second);
    b = await boot();
    await b.collection.load();
    await b.vault.setMeta('issued:accession', undefined as never);
    b = await boot();
    await b.collection.load();
    expect(b.collection.nextAccessionNumber()).toBe(no(4));
    const kept = (await b.vault.allChanges()).filter((c) => c.kind === 'setting' && c.id.startsWith('numbers-kept'));
    expect(new Set(kept.map((c) => c.id)).size).toBe(2); // the file's own and this Replace's, never overwriting each other
    expect(kept.flatMap((c) => c.value as string[]).sort()).toEqual([no(2), no(3)]);
    // Replacing from the newest file again: it carries 0002 and 0003, and nothing else was given since.
    const third = (await (await import('$lib/backup/io')).prepareBackup()).blob;
    const before = (await b.vault.allChanges()).length;
    await replaceWith(third);
    b = await boot();
    await b.collection.load();
    expect((await b.vault.allChanges()).length).toBe(before);
  });

  it('the merge preview names a kept-numbers record as such, not as the numbering scheme', async () => {
    const { previewMerge } = await import('$lib/backup/backup');
    const t = (n: number) => `${String(1700000000000 + n).padStart(13, '0')}-0000-dev1`;
    const m = previewMerge([], [{ t: t(1), kind: 'setting', id: 'numbers-kept-x1', field: 'accession', value: ['2026-0002'] }]);
    expect(m.addedByKind['numbers-kept']).toBe(1);
    expect(m.addedByKind.setting).toBeUndefined();
  });
});
