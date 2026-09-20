import { describe, it, expect } from 'vitest';
import { buildBackup, readBackup, previewMerge, summarise, plantsCsv, photoBytesError, photosWithoutPixels } from '$lib/backup/backup';
import { zipSync } from 'fflate';
import { materialise, live, type Change, type Record_ } from '$core/log';
import type { Accession } from '$lib/db/types';

const t = (n: number) => `${String(1700000000000 + n).padStart(13, '0')}-0000-dev1`;
const c = (n: number, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({ t: t(n), kind, id, field, value });

const log: Change[] = [
  c(1, 'location', 'L1', 'name', 'Greenhouse'),
  c(2, 'location', 'L2', 'name', 'Bench 2'),
  c(3, 'location', 'L2', 'parentId', 'L1'),
  c(4, 'accession', '2026-0001', 'taxonName', 'Copiapoa cinerea'),
  c(5, 'accession', '2026-0001', 'status', 'growing'),
  c(6, 'accession', '2026-0001', 'locationId', 'L2'),
  c(7, 'accession', '2026-0001', 'notes', 'said "sulks", then\nflowered'),
  c(8, 'event', 'e1', 'acc', '2026-0001'),
  c(9, 'event', 'e1', 'd', '2026-09-01'),
  c(10, 'event', 'e1', 't', 'water'),
  c(11, 'photo', 'p1', 'acc', '2026-0001'),
  c(12, 'photo', 'p1', 'd', '2026-09-02'),
  c(13, 'photo', 'p2', 'acc', '2026-0001'),
  c(14, 'photo', 'p2', 'd', '2026-09-03'),
  c(15, 'photo', 'p2', '_deleted', true),
  c(16, 'taxon', 'copiapoa-cinerea', 'name', 'Copiapoa cinerea')
];
const px = (s: string) => new TextEncoder().encode(s);
/** Bytes that pass for a JPEG (the header is what a restore checks) carrying a marker text. */
const jpg = (s: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...px(s)]);
const marker = (b: Uint8Array) => new TextDecoder().decode(b.subarray(4));

describe('backup round trip', () => {
  it('writes a zip and reads back the same log, photos and manifest', async () => {
    const seen: string[] = [];
    const { bytes, photosMissing } = await buildBackup({
      changes: log,
      scheme: { mode: 'year', width: 4 },
      device: 'dev1',
      readPhoto: async (id) => {
        seen.push(id);
        return id === 'p1' ? { id, full: jpg('FULL-JPEG'), thumb: jpg('THUMB') } : null;
      }
    });
    expect(bytes[0]).toBe(0x50); // PK
    expect(seen).toEqual(['p1']); // the deleted photo is not exported
    expect(photosMissing).toEqual([]);
    const r = await readBackup(bytes);
    expect(r.manifest?.format).toBe('cultifolio-backup');
    expect(r.manifest?.counts).toMatchObject({ changes: 16, accessions: 1, events: 1, locations: 2, photos: 1, taxa: 1, photoBytes: 22 });
    expect(r.manifest?.photosMissing).toBeUndefined();
    expect(r.manifest?.scheme).toEqual({ mode: 'year', width: 4 });
    expect(r.changes).toEqual(log);
    expect(r.photoIds).toEqual(['p1']);
    expect(marker(r.readPhoto('p1')!.full)).toBe('FULL-JPEG');
    expect(r.readPhoto('p2')).toBeNull();
  });
  it('a photo record whose pixels are missing still travels, without pixels, and the file says so: the count is what is in the file and the record is named', async () => {
    const built = await buildBackup({ changes: log, readPhoto: async () => null });
    expect(built.photosMissing).toEqual(['p1']); // the builder tells the page before download
    const r = await readBackup(built.bytes);
    expect(r.photoIds).toEqual([]);
    expect(summarise(r.changes).photos).toBe(1); // the record is there
    expect(r.manifest?.counts.photos).toBe(0); // the photograph is not
    expect(r.manifest?.counts.photoBytes).toBe(0);
    expect(r.manifest?.photosMissing).toEqual(['p1']);
    expect(photosWithoutPixels(r)).toEqual(['p1']); // and a restore can say so once, from the file itself
  });
  it('reads the older changes-only JSON export', async () => {
    const json = new TextEncoder().encode(JSON.stringify({ format: 'cultifolio-changes', v: 1, changes: log }));
    const r = await readBackup(json);
    expect(r.manifest).toBeNull();
    expect(r.changes).toHaveLength(16);
  });
  it('refuses things that are not backups, with a reason', async () => {
    await expect(readBackup(px('hello'))).rejects.toThrow(/neither/);
    await expect(readBackup(px('{"a":1}'))).rejects.toThrow(/not a Cultifolio backup/);
    const { bytes } = await buildBackup({ changes: log, readPhoto: async () => null });
    const truncated = bytes.subarray(0, 40);
    await expect(readBackup(truncated)).rejects.toThrow();
  });
});

describe('merging a backup into a live collection', () => {
  it('restoring the same file twice changes nothing; an older file over a newer collection loses nothing', () => {
    const same = previewMerge(log, log);
    expect(same.fresh).toHaveLength(0);
    expect(same.added + same.changed).toBe(0);
    const newer = [...log, c(20, 'accession', '2026-0001', 'notes', 'moved on')];
    const m = previewMerge(newer, log);
    expect(m.fresh).toHaveLength(0);
    const { state } = materialise([...newer, ...m.fresh]);
    expect(state.get('accession:2026-0001')?.notes).toBe('moved on');
  });
  it('a file with an extra plant adds it and reports it', () => {
    const more = [...log, c(30, 'accession', '2026-0002', 'taxonName', 'Ariocarpus fissuratus'), c(31, 'accession', '2026-0002', 'status', 'growing')];
    const m = previewMerge(log, more);
    expect(m.fresh).toHaveLength(2);
    expect(m.added).toBe(1);
    expect(m.changed).toBe(0);
  });
});

describe('plants.csv', () => {
  it('one row per plant, location path resolved, quotes and newlines escaped, Excel BOM', () => {
    const { state } = materialise(log);
    const csv = plantsCsv(live<Accession & Record_>(state, 'accession'), state);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('number,species,cultivar,kind,parentage,name as received,field number,provenance,status,location,acquired,from,form,price,sowing,notes');
    expect(lines[1]).toBe('2026-0001,Copiapoa cinerea,,species,,,,,growing,Greenhouse › Bench 2,,,,,,"said ""sulks"", then\nflowered"');
  });
});

describe('a backup is checked before anything is stored', () => {
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(0)]);
  it('a change whose timestamp is not an HLC is refused with its position', async () => {
    const bad = [...log, { t: '~', kind: 'accession', id: '2026-0001', field: 'notes', value: 'wins forever' }];
    await expect(readBackup(px(JSON.stringify({ format: 'cultifolio-changes', v: 1, changes: bad })))).rejects.toThrow(/Change 17 .*bad timestamp/);
    const { bytes } = await buildBackup({ changes: bad as Change[], readPhoto: async () => null });
    await expect(readBackup(bytes)).rejects.toThrow(/Change 17/);
  });
  it('photo entries must be JPEGs under the sync limit, with sane names', async () => {
    expect(photoBytesError(jpeg(10), jpeg(2))).toBeNull();
    expect(photoBytesError(px('<html>'), jpeg(2))).toMatch(/JPEG/);
    expect(photoBytesError(jpeg(12 * 1024 * 1024), jpeg(2))).toMatch(/over the 12 MB limit/);
    const files = { 'manifest.json': px(JSON.stringify({ format: 'cultifolio-backup', v: 1, exported: 'x', counts: { changes: 0, accessions: 0, events: 0, locations: 0, sowings: 0, taxa: 0, photos: 0, photoBytes: 0 } })), 'changes.json': px('[]') };
    await expect(readBackup(zipSync({ ...files, 'photos/p1.jpg': px('GIF89a'), 'photos/p1.t.jpg': jpeg(1) }))).rejects.toThrow(/Photo p1 .*not a JPEG/);
    await expect(readBackup(zipSync({ ...files, 'photos/../x.jpg': jpeg(1), 'photos/../x.t.jpg': jpeg(1) }))).rejects.toThrow(/impossible name/);
    const r = await readBackup(zipSync({ ...files, 'photos/p1.jpg': jpeg(1), 'photos/p1.t.jpg': jpeg(1) }));
    expect(r.photoIds).toEqual(['p1']);
  });
});
