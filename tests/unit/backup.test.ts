import { describe, it, expect } from 'vitest';
import { buildBackup, readBackup, previewMerge, summarise, plantsCsv, batchesCsv, eventsCsv, photoBytesError, photosWithoutPixels } from '$lib/backup/backup';
import { zipSync } from 'fflate';
import { materialise, live, type Change, type Record_ } from '$core/log';
import type { Accession, Sowing, PlantEvent } from '$lib/db/types';

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
  c(41, 'photo', 'p1', 'w', 1),
  c(42, 'photo', 'p1', 'h', 1),
  c(43, 'photo', 'p1', 'bytes', 3),
  c(13, 'photo', 'p2', 'acc', '2026-0001'),
  c(14, 'photo', 'p2', 'd', '2026-09-03'),
  c(44, 'photo', 'p2', 'w', 1),
  c(45, 'photo', 'p2', 'h', 1),
  c(46, 'photo', 'p2', 'bytes', 3),
  c(47, 'photo', 'p2', '_deleted', true),
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
    expect(r.manifest?.counts).toMatchObject({ changes: 22, accessions: 1, events: 1, locations: 2, photos: 1, taxa: 1, photoBytes: 22 });
    expect(r.manifest?.photosMissing).toBeUndefined();
    expect(r.changes).toEqual(log);
    expect(r.photoIds).toEqual(['p1']);
    expect(marker(r.readPhoto('p1')!.full)).toBe('FULL-JPEG');
    expect(r.readPhoto('p2')).toBeNull();
  });
  it('a photograph whose record waits for a field travels with its pixels, and is counted as missing when they are not there (round thirty-seven, 1)', async () => {
    // p3 has its plant and day; its size sits in a batch set aside. Round thirty-five kept its pixels on the device for the
    // day the record completes; a backup made before that day must carry them, or "Replace this device" loses them.
    const waiting = [...log, c(50, 'photo', 'p3', 'acc', '2026-0001'), c(51, 'photo', 'p3', 'd', '2026-09-04')];
    const seen: string[] = [];
    const built = await buildBackup({
      changes: waiting,
      readPhoto: async (id) => {
        seen.push(id);
        return { id, full: jpg(`FULL-${id}`), thumb: jpg('THUMB') };
      }
    });
    expect(seen.sort()).toEqual(['p1', 'p3']);
    expect(built.photosMissing).toEqual([]);
    const r = await readBackup(built.bytes);
    expect(r.photoIds.sort()).toEqual(['p1', 'p3']);
    expect(marker(r.readPhoto('p3')!.full)).toBe('FULL-p3');
    expect(r.manifest?.counts.photos).toBe(2);
    expect(photosWithoutPixels(r)).toEqual([]);
    // Without pixels, the waiting record is named as missing like a whole one.
    const bare = await buildBackup({ changes: waiting, readPhoto: async () => null });
    expect(bare.photosMissing.sort()).toEqual(['p1', 'p3']);
    expect(photosWithoutPixels(await readBackup(bare.bytes)).sort()).toEqual(['p1', 'p3']);
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
  it('a JSON file is not a backup: only the zip is read (round fifty-seven)', async () => {
    const json = new TextEncoder().encode(JSON.stringify({ format: 'cultifolio-changes', v: 1, changes: log }));
    await expect(readBackup(json)).rejects.toThrow(/not a Cultifolio backup/);
  });
  it('refuses things that are not backups, with a reason', async () => {
    await expect(readBackup(px('hello'))).rejects.toThrow(/not a Cultifolio backup/);
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
  it('round fifty-one, 4: the preview names the plants here that a merge renumbers, and the file\'s that it renumbers', () => {
    // Here: 2026-0001 (id "2026-0001", created first). The file: another plant under the same number, created later (a later id), and a third under 2026-0005 created before one here under that number.
    const here = [...log, c(60, 'accession', 'r-late', 'taxonName', 'Lithops'), c(61, 'accession', 'r-late', 'status', 'growing'), c(62, 'accession', 'r-late', 'acc', '2026-0005')];
    const file = [c(140, 'accession', 'zz-later', 'taxonName', 'Aloe'), c(141, 'accession', 'zz-later', 'status', 'growing'), c(142, 'accession', 'zz-later', 'acc', '2026-0001'), c(143, 'accession', 'a-early', 'taxonName', 'Haworthia'), c(144, 'accession', 'a-early', 'status', 'growing'), c(145, 'accession', 'a-early', 'acc', '2026-0005')];
    const m = previewMerge(here, file);
    expect(m.renumbered).toEqual([
      { no: '2026-0001', here: false, name: 'Aloe' }, // the file's plant loses to the earlier one here
      { no: '2026-0005', here: true, name: 'Lithops' } // this device's plant loses to the earlier one in the file
    ]);
  });
  it('a file with an extra plant adds it and reports it', () => {
    const more = [...log, c(30, 'accession', '2026-0002', 'taxonName', 'Ariocarpus fissuratus'), c(31, 'accession', '2026-0002', 'status', 'growing')];
    const m = previewMerge(log, more);
    expect(m.fresh).toHaveLength(2);
    expect(m.added).toBe(1);
    expect(m.changed).toBe(0);
    expect(m.addedByKind).toEqual({ accession: 1 });
    expect(m.addedDeleted).toBe(0);
  });
  it('the preview counts what is added by kind, live records apart from deleted ones, so the page can say it in the words of the "In the file" line (round twenty-three, 18)', () => {
    const more = [...log, c(30, 'accession', 'r9', 'taxonName', 'Ariocarpus fissuratus'), c(31, 'taxon', 'ariocarpus-fissuratus', 'name', 'Ariocarpus fissuratus'), c(32, 'event', 'e9', 'acc', 'r9'), c(33, 'accession', 'r8', '_deleted', true), c(34, 'accession', 'r9', 'status', 'growing'), c(35, 'event', 'e9', 'd', '2026-09-01'), c(36, 'event', 'e9', 't', 'water'), c(37, 'sowing', 's9', 'taxonName', 'Aloe')];
    const m = previewMerge(log, more);
    expect(m.added).toBe(5);
    expect(m.addedByKind).toEqual({ accession: 1, taxon: 1, event: 1 });
    expect(m.addedDeleted).toBe(1);
    expect(m.addedWaiting).toBe(1); // the batch with only a name: in the fold, not shown, and not counted as a batch added (round thirty-five, R1-4)
    expect(m.waitingNames).toEqual(['batch s9']); // by its number as the page addresses it, its id here (round thirty-eight, R1-3) // and named (round thirty-seven, R1-4)
  });
});

describe('plants.csv', () => {
  it('one row per plant, location path resolved, quotes and newlines escaped, Excel BOM', () => {
    const { state } = materialise(log);
    const csv = plantsCsv(live<Accession & Record_>(state, 'accession'), state);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('number,species,cultivar,kind,parentage,name as received,field number,provenance,status,location,acquired,from,lot or reference,form,price,sowing,notes');
    expect(lines[1]).toBe('2026-0001,Copiapoa cinerea,,species,,,,,growing,Greenhouse › Bench 2,,,,,,,"said ""sulks"", then\nflowered"');
  });
  it('a plant under an incomplete or removed place is filed under the nearest whole place above it, as the app shows it (round thirty-seven, R2-1)', () => {
    // L3 has only a parent (its name sits in a batch set aside); L4 is removed. The app walks past both to Bench 2.
    const more = [...log, c(30, 'location', 'L3', 'parentId', 'L2'), c(31, 'accession', '2026-0001', 'locationId', 'L3'),
      c(32, 'location', 'L4', 'name', 'Shelf'), c(33, 'location', 'L4', 'parentId', 'L1'), c(34, 'location', 'L4', '_deleted', true),
      c(35, 'accession', '2026-0002', 'taxonName', 'Aloe'), c(36, 'accession', '2026-0002', 'status', 'growing'), c(37, 'accession', '2026-0002', 'locationId', 'L4'),
      c(38, 'sowing', 's1', 'no', 'S2026-001'), c(39, 'sowing', 's1', 'taxonName', 'Aloe'), c(40, 'sowing', 's1', 'method', 'seed'), c(41, 'sowing', 's1', 'sown', '2026-03-01'), c(42, 'sowing', 's1', 'count', 1), c(43, 'sowing', 's1', 'status', 'active'), c(44, 'sowing', 's1', 'locationId', 'L3')];
    const { state } = materialise(more);
    const lines = plantsCsv(live<Accession & Record_>(state, 'accession'), state).slice(1).split('\r\n');
    expect(lines[1].split(',')[9]).toBe('Greenhouse › Bench 2');
    expect(lines[2].split(',')[9]).toBe('Greenhouse');
    const batch = batchesCsv(live<Sowing & Record_>(state, 'sowing'), state).slice(1).split('\r\n')[1];
    expect(batch).toContain(',Greenhouse › Bench 2,');
  });
  it('a cell that would be read as a formula is written as text, and the lot or reference travels (round twenty-six, 14)', () => {
    const more = [...log, c(30, 'accession', '2026-0001', 'notes', '-5 °C on the sill, =SUM(A1) is not a note'), c(31, 'accession', '2026-0001', 'sourceRef', 'KK 1462'), c(32, 'accession', '2026-0001', 'nameAsReceived', '@handle')];
    const { state } = materialise(more);
    const line = plantsCsv(live<Accession & Record_>(state, 'accession'), state).slice(1).split('\r\n')[1];
    expect(line).toBe("2026-0001,Copiapoa cinerea,,species,,'@handle,,,growing,Greenhouse › Bench 2,,,KK 1462,,,,'-5 °C on the sill, =SUM(A1) is not a note".replace(",'-5 °C on the sill, =SUM(A1) is not a note", ",\"'-5 °C on the sill, =SUM(A1) is not a note\""));
  });
});

describe('events.csv (round forty-nine, 1)', () => {
  it('every timeline entry, oldest first, with the plant or batch number and species, the label, and the figures; the sheet is in the zip', async () => {
    const more = [...log,
      c(30, 'event', 'e2', 'acc', '2026-0001'), c(31, 'event', 'e2', 'd', '2026-08-01'), c(32, 'event', 'e2', 't', 'measure'), c(33, 'event', 'e2', 'measures', { h: 42, heads: 3, width: 30 }),
      c(34, 'event', 'e3', 'acc', '2026-0001'), c(35, 'event', 'e3', 'd', '2026-09-03'), c(36, 'event', 'e3', 't', 'treat'), c(37, 'event', 'e3', 'used', 'neem'), c(38, 'event', 'e3', 'note', 'mealy, = top'), c(39, 'event', 'e3', 'auto', true),
      c(40, 'sowing', 's1', 'taxonName', 'Ariocarpus fissuratus'), c(41, 'sowing', 's1', 'method', 'seed'), c(42, 'sowing', 's1', 'sown', '2026-03-01'), c(43, 'sowing', 's1', 'count', 12), c(44, 'sowing', 's1', 'status', 'active'), c(45, 'sowing', 's1', 'no', 'S2026-001'),
      c(46, 'event', 'g1', 'acc', 's1'), c(47, 'event', 'g1', 'd', '2026-03-20'), c(48, 'event', 'g1', 't', 'germinate'), c(49, 'event', 'g1', 'n', 9)];
    const { state } = materialise(more);
    const lines = eventsCsv(live<PlantEvent & Record_>(state, 'event'), state).slice(1).split('\r\n');
    expect(lines[0]).toBe('date,number,species,entry,note,count,cause,used,measurements,by the app,record removed');
    // a measurement names its unit, as the label does; a key this build does not know is written as it is (round fifty-one, 5)
    expect(lines.slice(1, 5)).toEqual([
      '2026-03-20,S2026-001,Ariocarpus fissuratus,Germination count,,9,,,,,',
      '2026-08-01,2026-0001,Copiapoa cinerea,Measured,,,,,height 42 mm; heads 3; width 30,,',
      '2026-09-01,2026-0001,Copiapoa cinerea,Watered,,,,,,,',
      '2026-09-03,2026-0001,Copiapoa cinerea,Treated,"mealy, = top",,,neem,,yes,'
    ]);
    // an entry on a removed plant is kept and marked
    const gone = materialise([...more, c(60, 'accession', '2026-0001', '_deleted', true)]).state;
    const goneLines = eventsCsv(live<PlantEvent & Record_>(gone, 'event'), gone).slice(1).split('\r\n');
    expect(goneLines[3]).toBe('2026-09-01,2026-0001,Copiapoa cinerea,Watered,,,,,,,yes');
    const { bytes } = await buildBackup({ changes: more, readPhoto: async () => null });
    const r = await readBackup(bytes);
    expect(r.changes.length).toBe(more.length); // the sheet is for people; the file reads as before
    expect(new TextDecoder().decode(bytes)).toContain('events.csv');
  });
});

describe('batches.csv', () => {
  it('one row per batch with the latest count, potted and lost, the lot and the field number apart (round twenty-eight, 9)', () => {
    const more = [...log, c(30, 'sowing', 's1', 'no', 'S2026-001'), c(31, 'sowing', 's1', 'taxonName', 'Ariocarpus fissuratus'), c(32, 'sowing', 's1', 'method', 'seed'), c(33, 'sowing', 's1', 'sown', '2026-03-01'), c(34, 'sowing', 's1', 'count', 12), c(35, 'sowing', 's1', 'status', 'active'), c(36, 'sowing', 's1', 'sourceRef', 'lot 77'), c(37, 'sowing', 's1', 'fieldNumber', 'KK 1462'), c(38, 'sowing', 's1', 'locationId', 'L2'),
      c(40, 'event', 'g1', 'acc', 's1'), c(41, 'event', 'g1', 'd', '2026-03-10'), c(42, 'event', 'g1', 't', 'germinate'), c(43, 'event', 'g1', 'n', 4),
      c(44, 'event', 'g2', 'acc', 's1'), c(45, 'event', 'g2', 'd', '2026-03-20'), c(46, 'event', 'g2', 't', 'germinate'), c(47, 'event', 'g2', 'n', 9),
      c(48, 'event', 'l1', 'acc', 's1'), c(49, 'event', 'l1', 'd', '2026-04-01'), c(50, 'event', 'l1', 't', 'loss'), c(51, 'event', 'l1', 'n', 2),
      c(52, 'event', 'u1', 'acc', 's1'), c(53, 'event', 'u1', 'd', '2026-05-01'), c(54, 'event', 'u1', 't', 'potup'), c(55, 'event', 'u1', 'n', 3)];
    const { state } = materialise(more);
    const lines = batchesCsv(live<Sowing & Record_>(state, 'sowing'), state).slice(1).split('\r\n');
    expect(lines[0]).toBe('number,species,cultivar,kind,parentage,method,parent plant,date,started,counted,potted,lost,from,lot,field number,provenance,medium,container,pre-treatment,bottom heat C,covered,location,status,notes');
    expect(lines[1]).toBe('S2026-001,Ariocarpus fissuratus,,species,,seed,,2026-03-01,12,9,3,2,,lot 77,KK 1462,,,,,,,Greenhouse › Bench 2,active,');
  });
});

describe('a value of the wrong type in a backup is left out, not the file (round twenty-nine, 2)', () => {
  it('a value of a type its field never takes is left out and named; the rest is read', async () => {
    const rows = [...log, c(30, 'accession', '2026-0001', 'price', 12), c(31, 'accession', '2026-0001', 'notes', { a: 1 })];
    const { bytes } = await buildBackup({ changes: rows as Change[], readPhoto: async () => null });
    const r = await readBackup(bytes);
    expect(r.changes).toHaveLength(rows.length - 2);
    expect(r.unreadable).toEqual(['change 23: price of an accession must be a string, not 12', 'change 24: notes of an accession must be a string, not {"a":1}']);
  });
});

describe('a zip made to inflate past what a backup can hold is refused at its table of contents (round twenty-nine, 10)', () => {
  it('an entry declared over the cap, or under a name a backup never has, is not inflated', async () => {
    const big = new Uint8Array(4 * 1024 * 1024); // deflates to a few kilobytes; declared size is what the filter reads
    const zipped = zipSync({ 'manifest.json': new TextEncoder().encode('{}'), 'changes.json': new TextEncoder().encode('[]'), 'evil.bin': big, 'photos/huge.jpg': [new Uint8Array(0), { level: 0 }] });
    await expect(readBackup(zipped)).rejects.toThrow(/not in a shape/); // the two unknown entries were skipped and the manifest is then read as usual
    // many deflated photograph entries each under the cap but adding up past what a file of this size could hold (round
    // thirty, R2-7) are refused earlier now: a deflated photograph is not one any writer made (round thirty-eight, R1-11)
    const many: Record<string, Uint8Array> = { 'manifest.json': new TextEncoder().encode('{}'), 'changes.json': new TextEncoder().encode('[]') };
    for (let i = 0; i < 6; i++) many[`photos/p${i}.jpg`] = new Uint8Array(40 * 1024 * 1024);
    await expect(readBackup(zipSync(many))).rejects.toThrow(/compresses photos\/p0.jpg/);
    // the sheets are never inflated, the manifest has a small cap, and a name seen twice is refused: eight deflated
    // entries alternating the two sheet names at 40 MB each are not touched (round thirty-five, R1-6, R2-4)
    const sheetsBomb: Record<string, Uint8Array> = { 'manifest.json': new TextEncoder().encode('{}'), 'changes.json': new TextEncoder().encode('[]'), 'plants.csv': new Uint8Array(40 * 1024 * 1024), 'batches.csv': new Uint8Array(40 * 1024 * 1024) };
    // No clock on it: a three-second bound failed on a slow machine and passed whether or not the sheets were inflated
    // (eighty megabytes of zeros inflate in a fraction of that); the filter's own test is the name set (round fifty-nine).
    await expect(readBackup(zipSync(sheetsBomb))).rejects.toThrow(/not in a shape/); // the sheets were skipped and the (empty) manifest refused as usual
    await expect(readBackup(zipSync({ 'manifest.json': new Uint8Array(5 * 1024 * 1024), 'changes.json': new TextEncoder().encode('[]') }))).rejects.toThrow(/no manifest.json/); // a 5 MB manifest is not inflated: it is not ours
    // (a zip naming an entry twice cannot be made with fflate's writer; the refusal is by the name set in the filter)
  });
  it('a table of contents whose entries all point at one stored block, each declaring a byte, is refused by the block\'s own size (round thirty-seven, R1-5)', async () => {
    // fflate copies a stored entry by its compressed size, whatever the entry declares as its original: 100 entries over
    // one 1 MB block declared a hundred bytes and cost a hundred megabytes. Made by hand: one stored entry, its central
    // directory record repeated under a hundred names, every record pointing at the same local header.
    const block = new Uint8Array(1024 * 1024);
    block.set([0xff, 0xd8, 0xff, 0xe0]);
    const one = zipSync({ 'manifest.json': new TextEncoder().encode('{}'), 'changes.json': new TextEncoder().encode('[]'), 'photos/a000.jpg': block }, { level: 0 });
    const dv = new DataView(one.buffer, one.byteOffset, one.byteLength);
    const eocd = one.length - 22;
    const cdOff = dv.getUint32(eocd + 16, true);
    const cdSize = dv.getUint32(eocd + 12, true);
    const cd = one.subarray(cdOff, cdOff + cdSize);
    // The three records: find the photo's by its name, and keep the other two as they are.
    const recs: Uint8Array[] = [];
    let at = 0;
    let photo: Uint8Array | null = null;
    while (at < cd.length) {
      const nameLen = cd[at + 28] | (cd[at + 29] << 8);
      const extraLen = cd[at + 30] | (cd[at + 31] << 8);
      const commentLen = cd[at + 32] | (cd[at + 33] << 8);
      const rec = cd.subarray(at, at + 46 + nameLen + extraLen + commentLen);
      const name = new TextDecoder().decode(rec.subarray(46, 46 + nameLen));
      if (name === 'photos/a000.jpg') photo = rec;
      else recs.push(rec);
      at += rec.length;
    }
    const N = 100;
    for (let i = 0; i < N; i++) {
      const r = new Uint8Array(photo!);
      r.set(new TextEncoder().encode(`photos/a${String(i).padStart(3, '0')}.jpg`), 46);
      // declared original size: one byte (offset 24); the compressed size (offset 20) is the block's, as fflate copies it
      new DataView(r.buffer).setUint32(24, 1, true);
      recs.push(r);
    }
    const dir = new Uint8Array(recs.reduce((n, r) => n + r.length, 0));
    let o = 0;
    for (const r of recs) { dir.set(r, o); o += r.length; }
    const tail = new Uint8Array(one.subarray(eocd));
    const tv = new DataView(tail.buffer);
    tv.setUint16(8, recs.length, true);
    tv.setUint16(10, recs.length, true);
    tv.setUint32(12, dir.length, true);
    tv.setUint32(16, cdOff, true);
    const bomb = new Uint8Array(cdOff + dir.length + tail.length);
    bomb.set(one.subarray(0, cdOff));
    bomb.set(dir, cdOff);
    bomb.set(tail, cdOff + dir.length);
    await expect(readBackup(bomb)).rejects.toThrow(/two different sizes|declares far more content/);
    // but the app's own backup of a log that compresses well (a 70 MB note deflates to well under a megabyte) is read:
    // the deflated entries have their own caps and are not in the sum (round thirty-three, 3)
    const { bytes } = await buildBackup({ changes: [...log, c(40, 'accession', '2026-0001', 'notes', 'a'.repeat(70 * 1024 * 1024))], readPhoto: async () => null });
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    const r = await readBackup(bytes);
    expect(r.changes.filter((x) => x.field === 'notes').some((x) => (x.value as string).length === 70 * 1024 * 1024)).toBe(true);
  });
  it('a numeric cell is written as a number, a text cell beginning like a formula is made text, after spaces and in full width too', () => {
    const rows = [...log, c(30, 'sowing', 's1', 'no', 'S2026-001'), c(31, 'sowing', 's1', 'taxonName', 'Aloe'), c(32, 'sowing', 's1', 'method', 'seed'), c(33, 'sowing', 's1', 'sown', '2026-03-01'), c(34, 'sowing', 's1', 'count', 3), c(35, 'sowing', 's1', 'status', 'active'), c(36, 'sowing', 's1', 'bottomHeatC', -5), c(37, 'sowing', 's1', 'notes', '  =HYPERLINK("x")'), c(38, 'sowing', 's1', 'medium', '＝pumice')];
    const { state } = materialise(rows);
    const line = batchesCsv(live<Sowing & Record_>(state, 'sowing'), state).slice(1).split('\r\n')[1];
    expect(line).toContain(',-5,');
    expect(line).toContain(",\"'  =HYPERLINK(\"\"x\"\")\"");
    expect(line).toContain(",'＝pumice,");
  });
});

describe('a backup is checked before anything is stored', () => {
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(0)]);
  it('a change whose timestamp is not an HLC is refused with its position', async () => {
    const bad = [...log, { t: '~', kind: 'accession', id: '2026-0001', field: 'notes', value: 'wins forever' }];
    const { bytes } = await buildBackup({ changes: bad as Change[], readPhoto: async () => null });
    await expect(readBackup(bytes)).rejects.toThrow(/Change 23 .*bad timestamp/);
  });
  it('photo entries must be JPEGs under the sync limit, with sane names', async () => {
    expect(photoBytesError(jpeg(10), jpeg(2))).toBeNull();
    expect(photoBytesError(px('<html>'), jpeg(2))).toMatch(/JPEG/);
    expect(photoBytesError(jpeg(12 * 1024 * 1024), jpeg(2))).toMatch(/over the 12 MB limit/);
    const files = { 'manifest.json': px(JSON.stringify({ format: 'cultifolio-backup', v: 1, exported: 'x', counts: { changes: 0, accessions: 0, events: 0, locations: 0, sowings: 0, taxa: 0, photos: 0, photoBytes: 0 } })), 'changes.json': px('[]') };
    const stored = (b: Uint8Array): [Uint8Array, { level: 0 }] => [b, { level: 0 }];
    await expect(readBackup(zipSync({ ...files, 'photos/p1.jpg': stored(px('GIF89a')), 'photos/p1.t.jpg': stored(jpeg(1)) }))).rejects.toThrow(/Photo p1 .*not a JPEG/);
    await expect(readBackup(zipSync({ ...files, 'photos/../x.jpg': stored(jpeg(1)), 'photos/../x.t.jpg': stored(jpeg(1)) }))).rejects.toThrow(/impossible name/);
    await expect(readBackup(zipSync({ ...files, 'photos/p1.jpg': jpeg(1), 'photos/p1.t.jpg': jpeg(1) }))).rejects.toThrow(/compresses photos\/p1.jpg/); // deflated: not ours (round thirty-eight, R1-11)
    const r = await readBackup(zipSync({ ...files, 'photos/p1.jpg': stored(jpeg(1)), 'photos/p1.t.jpg': stored(jpeg(1)) }));
    expect(r.photoIds).toEqual(['p1']);
  });
});
