/**
 * Round eighty-seven, t3 (plans F7, F10, F11, F12) in Node: the plants sheet from its column table, the import naming
 * the sheet's own columns apart, the watering calendar keeping a plant's rest months, the label's code carrying the
 * number, and the lock's stored passcode.
 *
 * Fails on the base (stage 2 head): the column table, the calendar's own rest months, the code's number and the lock do
 * not exist.
 */
import { describe, it, expect } from 'vitest';
import { materialise, live, type Change, type Record_ } from '$core/log';
import { plantsCsv } from '$lib/backup/backup';
import { PLANT_COLUMNS, OWN_HEADS } from '$lib/backup/plant-columns';
import { parseCsv, guessMapping, unmappedColumns } from '$lib/import/csv';
import { rhythmsOf } from '$lib/export/rhythms';
import { plantQrUrl, labelFromHash, idTag } from '$lib/ui/grow/qr';
import { readLock, hashPass, passError, LOCK_AFTER, lockExempt } from '$lib/ui/lock.svelte';
import type { Accession } from '$lib/db/types';

let wall = 1789520000000;
const c = (kind: string, id: string, field: string, value: unknown): Change => ({ t: `${wall++}-0000-abcdefabcdef0000`, kind, id, field, value } as Change);

describe('r87t3 the plants sheet (F11)', () => {
  const log = [
    c('location', 'L1', 'name', 'Greenhouse'),
    ...Object.entries({ acc: '2026-0001', taxonName: 'Conophytum minutum', status: 'growing', locationId: 'L1', taxonKey: 3084923, waterDays: 10, season: 'winter', restMonths: [6, 7, 8], seasonFrom: 'rain', price: '£6' }).map(([f, v]) => c('accession', 'a1', f, v)),
    ...Object.entries({ acc: 'a1', d: '2026-11-01', w: 10, h: 10, bytes: 9 }).map(([f, v]) => c('photo', 'p1', f, v)),
    ...Object.entries({ acc: 'a1', d: '2026-11-09', mime: 'application/pdf', fileName: 'permit.pdf', doc: 'cites', bytes: 9 }).map(([f, v]) => c('photo', 'x1', f, v)),
    ...Object.entries({ acc: 'a1', d: '2026-11-09', mime: 'image/jpeg', fileName: 'invoice.jpg', doc: 'invoice', bytes: 9 }).map(([f, v]) => c('photo', 'x2', f, v))
  ];
  const { state } = materialise(log);
  const sheet = parseCsv(plantsCsv(live<Accession & Record_>(state, 'accession'), state).slice(1));
  const col = (h: string) => sheet[1][sheet[0].indexOf(h)];
  it('one column a field, from one table; the record\'s identity still last', () => {
    expect(sheet[0]).toEqual(PLANT_COLUMNS.map((x) => x.head));
    expect(sheet[0].at(-1)).toBe('id');
    expect(sheet[0].slice(0, 17)).toEqual(['number', 'species', 'cultivar', 'kind', 'parentage', 'name as received', 'field number', 'provenance', 'status', 'location', 'acquired', 'from', 'lot or reference', 'form', 'price', 'sowing', 'notes']);
  });
  it('carries the season, the rest months, the photographs and the papers', () => {
    expect(col('growing season')).toBe('winter');
    expect(col('rest months')).toBe('Jun Jul Aug');
    expect(col('season from')).toBe('rain');
    expect(col('photographs')).toBe('1');
    expect(col('papers')).toBe('CITES permit or certificate: permit.pdf; Invoice or receipt: invoice.jpg');
    expect(col('GBIF key')).toBe('3084923');
    expect(col('water every (days)')).toBe('10');
  });
  it('the import names the sheet\'s own columns apart and adds none of them to a plant\'s notes', () => {
    const m = guessMapping(sheet, true);
    const u = unmappedColumns(sheet, m, true);
    expect(u.extra).toEqual([]);
    expect(u.own).toEqual(expect.arrayContaining(['growing season', 'rest months', 'papers', 'id']));
    for (const h of OWN_HEADS) expect(PLANT_COLUMNS.some((x) => x.head === h) || h === 'sowing').toBe(true);
  });
});

describe('r87t3 the watering calendar keeps a plant\'s own rest months (F7)', () => {
  it('a plant with rest months is a series of its own at its place\'s rhythm, dry in its place\'s months and its own', () => {
    const rs = rhythmsOf({ today: '2026-11-09', plants: [{ id: 'a1', no: '2026-0001', name: 'Conophytum minutum', placeId: 'L1', ownDays: null, ownRest: [6, 7, 8] }, { id: 'a2', no: '2026-0002', name: 'Aloe', placeId: 'L1', ownDays: null }], placeName: () => 'Greenhouse', rule: () => ({ every: 10, dry: [12, 1] }), from: () => '2026-11-01' });
    const own = rs.find((r) => r.uid.startsWith('water-plant-a1'))!;
    expect(own.every).toBe(10);
    expect(own.dry).toEqual([1, 6, 7, 8, 12]);
    expect(own.description).toMatch(/own rest months/);
    expect(rs.find((r) => r.uid.startsWith('water-place-L1'))!.description).toMatch(/^1 growing plant/);
  });
});

describe('r87t3 the label\'s code carries the number (F10)', () => {
  it('the address is the plant\'s number, which the plant page finds as it finds an identity; the name rides in the fragment', () => {
    const u = plantQrUrl('https://cultifolio.com', { id: 'pk3j2abc', acc: '2026-0012', taxonName: 'Copiapoa cinerea', cultivar: null, nameKind: 'species' });
    expect(u).toBe(`https://cultifolio.com/plants/2026-0012#i=${idTag('pk3j2abc')}&s=copiapoa-cinerea&n=Copiapoa%20cinerea`); // and the identity tag first (the stage 3 fixes; B1)
    expect(labelFromHash(new URL(u).hash).slug).toBe('copiapoa-cinerea');
  });
  it('a tape\'s code is the bare address and the identity tag; a number with a prefix or a space is escaped', () => {
    expect(plantQrUrl('https://x', { id: 'r1', acc: 'ACC 7/A', taxonName: 'Aloe vera', cultivar: null, nameKind: 'species' }, true)).toBe(`https://x/plants/ACC%207%2FA#i=${idTag('r1')}`);
  });
  it('a plant from before numbers were apart from identities is coded by its id, which is its number', () => {
    expect(plantQrUrl('https://x', { id: '2026-0003', taxonName: 'Aloe vera', cultivar: null, nameKind: 'species' }, true)).toBe(`https://x/plants/2026-0003#i=${idTag('2026-0003')}`);
  });
});

describe('r87t3 the lock (F12)', () => {
  it('keeps a slow salted hash of the passcode, read back only when whole', async () => {
    const salt = new Uint8Array(16).fill(7);
    const h = await hashPass('1234', salt, 1000);
    expect(h).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(await hashPass('1234', salt, 1000)).toBe(h);
    expect(await hashPass('1235', salt, 1000)).not.toBe(h);
    const ok = JSON.stringify({ v: 1, salt: btoa(String.fromCharCode(...salt)), hash: h, rounds: 1000, after: 1 });
    expect(readLock(ok)).toMatchObject({ rounds: 1000, after: 1 });
    expect(readLock(JSON.stringify({ ...JSON.parse(ok), after: 7 }))!.after).toBe(5);
    for (const bad of [null, '', 'not json', JSON.stringify({ v: 2 }), JSON.stringify({ ...JSON.parse(ok), hash: 'short' }), JSON.stringify({ ...JSON.parse(ok), rounds: 10 })]) expect(readLock(bad), String(bad)).toBeNull();
  });
  it('a passcode is 4 to 64 characters; the about pages are never behind the lock', () => {
    expect(passError('123')).toMatch(/at least 4/);
    expect(passError('1234')).toBeNull();
    expect(passError('x'.repeat(65))).toMatch(/at most 64/);
    expect(LOCK_AFTER).toEqual([0, 1, 5, 15]);
    expect(lockExempt('/about/how')).toBe(true);
    expect(lockExempt('/about')).toBe(true);
    expect(lockExempt('/plants')).toBe(false);
    expect(lockExempt('/aboutx')).toBe(false);
  });
});
