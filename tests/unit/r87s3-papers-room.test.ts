/**
 * Round eighty-seven, the stage 3 fixes (the review of the tracker, S2): the papers of a collection have a room in all,
 * and a backup's photographs and papers are read as views of the file, not copies.
 *
 * 1. `PAPERS_MAX_BYTES` (300 MB) bounds the papers of the whole collection: a paper that would pass it is refused with a
 *    sentence saying what the papers hold; under it, it is taken.
 * 2. `readBackup` gives each stored photograph (and paper) as a view of the file's own bytes: no copy, so a backup is held
 *    once. Measured on a 64 MB backup of 200 stored entries: what the reader adds beyond the file is a small fraction of
 *    it (it was a second copy of every entry, as large as the file). By reasoning, the same holds at 500 MB: the reader's
 *    own allocations are the log (changes.json, inflated), the manifest and one view object an entry, none proportional
 *    to the photographs' bytes. A zip it cannot walk alone (zip64) falls back to fflate's copies, as before.
 *
 * Fails on the base (r87final, dd20377): no `PAPERS_MAX_BYTES`, no `papersBytes`, and every photograph read is a copy.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, vi } from 'vitest';
import { PAPERS_MAX_BYTES, papersFullError } from '$lib/attach/attach';
import { buildBackup, readBackup, storedViews } from '$lib/backup/backup';
import { strToU8, zipSync } from 'fflate';
import type { Change } from '$core/log';

const pdf = (n: number) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d]); return b; };

describe('r87s3 S2 1: the papers of a collection have a room in all', () => {
  it('300 MB, refused past it with a sentence', () => {
    expect(PAPERS_MAX_BYTES).toBe(300 * 1024 * 1024);
    expect(papersFullError(0, 10 * 1048576)).toBeNull();
    expect(papersFullError(PAPERS_MAX_BYTES - 1000, 1000)).toBeNull();
    expect(papersFullError(PAPERS_MAX_BYTES - 1000, 2048)).toBe('The papers of a collection are kept up to 300 MB in all, and yours hold 300.0 MB: this 2 kB file would pass it. Remove a paper you no longer need first.');
  });
  it('the collection counts its papers and refuses one past the room', async () => {
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.wipeVault();
    await wipeMeta(vault);
    await vault.setMeta('device', 'aaaaaaaaaaaa');
    const { collection: c } = await import('$lib/db/collection.svelte');
    await c.load();
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0012' } as never);
    await c.addAttachment(P.id, pdf(3000), 'permit.pdf', 'cites', null);
    expect(c.papersBytes).toBe(3000);
    // The room nearly used (300 MB of papers is not made here): the next paper is refused, and nothing is written.
    const spy = vi.spyOn(c, 'papersBytes', 'get').mockReturnValue(PAPERS_MAX_BYTES - 1000);
    await expect(c.addAttachment(P.id, pdf(2048), 'invoice.pdf', 'invoice', null)).rejects.toThrow(/kept up to 300 MB in all/);
    spy.mockRestore();
    expect(c.attachments(P.id)).toHaveLength(1);
  });
});

describe('r87s3 S2 2: a backup photograph is a view of the file, not a copy', () => {
  it('64 MB of stored entries read with a small fraction of the file added, each a view of its bytes', async () => {
    const N = 200, SIZE = 320 * 1024; // 200 photographs of 320 kB: 64 MB
    const jpeg = (i: number, n: number) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); b[4] = i & 0xff; b[n - 1] = 0xd9; return b; };
    const ids = Array.from({ length: N }, (_, i) => `ph${String(i).padStart(4, '0')}`);
    const W = 'aaaaaaaaaaaa';
    let wall = 1789520000000;
    const changes: Change[] = [];
    for (const id of ids) for (const [f, v] of Object.entries({ acc: 'r1', d: '2026-11-01', w: 10, h: 10, bytes: SIZE })) changes.push({ t: `${wall++}-0000-${W}`, kind: 'photo', id, field: f, value: v } as Change);
    const built = await buildBackup({ changes, app: 'test', device: W, readPhoto: async (id: string) => ({ full: jpeg(ids.indexOf(id), SIZE), thumb: jpeg(1, 64) }) } as never);
    const bytes = built.bytes;
    expect(bytes.length).toBeGreaterThan(N * SIZE);
    globalThis.gc?.();
    const before = process.memoryUsage().arrayBuffers;
    const file = await readBackup(bytes);
    const added = process.memoryUsage().arrayBuffers - before;
    console.log(`r87s3 S2: a ${(bytes.length / 1048576).toFixed(1)} MB backup read with ${(added / 1048576).toFixed(1)} MB of array buffers added`);
    expect(file.photoIds).toHaveLength(N);
    for (const id of [ids[0], ids[N - 1]]) {
      const p = file.readPhoto(id)!;
      expect(p.full.buffer).toBe(bytes.buffer); // a view of the file
      expect(p.thumb.buffer).toBe(bytes.buffer);
      expect(p.full.length).toBe(SIZE);
      expect(p.full[4]).toBe(ids.indexOf(id) & 0xff);
    }
    expect(added).toBeLessThan(bytes.length / 4); // a copy of each entry was the file's size again
  }, 120_000);
  it('a zip this reader cannot walk alone gives its photographs by fflate, as before', async () => {
    const j = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]);
    const zip = zipSync({ 'photos/a.jpg': [j, { level: 0 }], 'photos/a.t.jpg': [j, { level: 0 }], 'manifest.json': strToU8('{}'), 'changes.json': strToU8('[]') });
    expect(storedViews(zip, new Set(['photos/a.jpg', 'photos/a.t.jpg']))!.get('photos/a.jpg')).toEqual(j);
    expect(storedViews(zip, new Set(['photos/missing.jpg']))).toBeNull();
    expect(storedViews(zip.subarray(0, zip.length - 30), new Set(['photos/a.jpg']))).toBeNull(); // no end record
  });
});
