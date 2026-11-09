/**
 * Round eighty-seven, t3 (plans F7 and F9): the growing season and the papers in the collection's log, both ways between
 * versions, as tests/unit/r87b-pins-log.test.ts holds the pins.
 *
 * 1. A log holding a plant's growing season and a paper, as this version writes them, read by round eighty-six's own log
 *    module (tests/unit/r87b-old/log-r86.ts): no change refused or left out, no batch refused whole, the plants folded
 *    as before; the paper a photo record waiting for fields (never a photograph it shows or takes for a cover), and
 *    still among the records whose bytes a backup and a sync carry (`known`).
 * 2. A log written by round eighty-six read by this version: no season, no paper, its photographs as before.
 * 3. Validated on read: a season, months, a paper of another version's shape or a damaged one.
 * 4. The paper's bytes behind the envelope: a JPEG to every reader's check, the file whole after it.
 *
 * Fails on the base (stage 2 head): $core/season and $lib/attach/attach do not exist.
 */
import { describe, it, expect } from 'vitest';
import * as old from './r87b-old/log-r86';
import { readChanges, materialise, live, known, incomplete, FOLD_RULES, type Change, type Record_ } from '$core/log';
import { seasonOf, readMonths, suggestSeason, restsIn, restReason, type PlantSeason } from '$core/season';
import { attachmentOf, wrap, unwrap, ENVELOPE, sniff, fileError, cleanName, MAX_ATTACHMENT_BYTES, FILE_NAME_MAX } from '$lib/attach/attach';
import { photoBytesError, buildBackup, readBackup, previewMerge } from '$lib/backup/backup';
import { growingYear, type Month } from '$core/sheet';

const W = 'aaaaaaaaaaaa';
let wall = 1789520000000;
const ch = (kind: string, id: string, field: string, value: unknown): Change => ({ t: `${wall++}-0000-${W}`, kind, id, field, value } as Change);
const plant = (id: string, name: string): Change[] => [ch('accession', id, 'taxonName', name), ch('accession', id, 'status', 'growing'), ch('accession', id, 'acc', `2026-00${id.slice(-2)}`)];
const photo = (id: string, acc: string): Change[] => Object.entries({ acc, d: '2026-11-01', dFrom: 'added', w: 1600, h: 1200, bytes: 400_000, sha: 'ab'.repeat(32) }).map(([f, v]) => ch('photo', id, f, v));
/** A paper as `collection.addAttachment` writes it (one change a field, by `put`). */
const paper = (id: string, acc: string, more: Record<string, unknown> = {}): Change[] => Object.entries({ acc, d: '2026-11-09', mime: 'application/pdf', fileName: 'CITES permit 2026.pdf', doc: 'cites', caption: 'Permit 26-GB-1234', bytes: 82_000, sha: 'cd'.repeat(32), ...more }).map(([f, v]) => ch('photo', id, f, v));
const season = (id: string, s: string, rest: number[] | null, from: string): Change[] => [ch('accession', id, 'season', s), ch('accession', id, 'restMonths', rest), ch('accession', id, 'seasonFrom', from)];

describe('r87t3 the log 1: read by round eighty-six', () => {
  const log = [...plant('a01', 'Conophytum minutum'), ...season('a01', 'winter', [5, 6, 7, 8], 'rain'), ...photo('p1', 'a01'), ...paper('x1', 'a01'), ...plant('a02', 'Copiapoa cinerea'), ...season('a02', 'none', null, 'grower')];
  it('no change refused or left out, and the batch is not refused whole', () => {
    for (const c of log) expect(old.changeError(c), JSON.stringify(c)).toBeNull();
    const { changes, dropped } = old.readChanges(log);
    expect(dropped).toEqual([]);
    expect(changes).toHaveLength(log.length);
    expect(() => old.validateChanges(log)).not.toThrow();
  });
  it('the plants fold as before, their season fields carried as fields it does not read', () => {
    const { state } = old.materialise(old.readChanges(log).changes);
    expect(old.live(state, 'accession').map((r) => r.taxonName).sort()).toEqual(['Conophytum minutum', 'Copiapoa cinerea']);
    expect(state.get(old.key('accession', 'a01'))!.restMonths).toEqual([5, 6, 7, 8]);
  });
  it('the paper is a photo record waiting for fields: not a photograph it shows, but carried by its backups and its sync', () => {
    const { state } = old.materialise(old.readChanges(log).changes);
    expect(old.live(state, 'photo').map((r) => r.id)).toEqual(['p1']);
    expect(old.known(state, 'photo').map((r) => r.id).sort()).toEqual(['p1', 'x1']);
    expect(old.isComplete(state.get(old.key('photo', 'x1'))!)).toBe(false);
    expect(old.REQUIRED_FIELDS.photo).toEqual(['d', 'w', 'h', 'bytes']);
  });
  it('folds the same in this version, which reads the season and the paper from it', () => {
    const { changes, dropped } = readChanges(log);
    expect(dropped).toEqual([]);
    const now = materialise(changes).state, then = old.materialise(old.readChanges(log).changes).state;
    expect([...now.values()].map((r) => JSON.stringify(r)).sort()).toEqual([...then.values()].map((r) => JSON.stringify(r)).sort());
    expect(seasonOf(now.get('accession:a01') as never)).toEqual({ season: 'winter', rest: [5, 6, 7, 8], from: 'rain' });
    expect(seasonOf(now.get('accession:a02') as never)).toEqual({ season: 'none', rest: [], from: 'grower' });
    expect(live(now, 'photo').map((r) => r.id)).toEqual(['p1']);
    expect(attachmentOf(now.get('photo:x1'))).toMatchObject({ id: 'x1', acc: 'a01', mime: 'application/pdf', doc: 'cites', fileName: 'CITES permit 2026.pdf', bytes: 82_000 });
    expect(attachmentOf(now.get('photo:p1'))).toBeNull();
    // Waiting by the fold's rule here too: the collection reads it as a paper and leaves it out of the count of records waiting.
    expect(incomplete(now).map((r) => r.id)).toEqual(['x1']);
    expect(known(now, 'photo')).toHaveLength(2);
    expect(FOLD_RULES).toBe(8); // no fold rule moved
  });
  it('a removal of the paper is a removal it folds', () => {
    const more = [...log, ch('photo', 'x1', '_deleted', true)];
    expect(old.known(old.materialise(old.readChanges(more).changes).state, 'photo').map((r) => r.id)).toEqual(['p1']);
    expect(attachmentOf(materialise(readChanges(more).changes).state.get('photo:x1'))).toBeNull();
  });
});

describe('r87t3 the log 2: a log of round eighty-six read here', () => {
  it('holds no season and no paper; its photographs are as before', () => {
    const log = [...plant('a01', 'Aloe vera'), ...photo('p1', 'a01'), ch('location', 'L1', 'name', 'Bench'), ch('location', 'L1', 'dryMonths', [12, 1, 2])];
    const { state } = materialise(readChanges(log).changes);
    expect(seasonOf(state.get('accession:a01') as never)).toBeNull();
    expect([...state.values()].filter((r) => attachmentOf(r))).toEqual([]);
    expect(live(state, 'photo')).toHaveLength(1);
  });
});

describe('r87t3 the log 3: validated on read', () => {
  const rec = (o: Record<string, unknown>) => ({ id: 'a1', kind: 'accession', _t: '', taxonName: 'X', status: 'growing', ...o }) as { season?: unknown; restMonths?: unknown; seasonFrom?: unknown };
  it('a season of a word or months this version does not know is not set; months are whole, 1 to 12, at most eleven', () => {
    expect(seasonOf(rec({ season: 'spring', restMonths: [1] }))).toBeNull();
    expect(seasonOf(rec({ season: 7 }))).toBeNull();
    expect(seasonOf(rec({ season: 'summer', restMonths: [12, 1, 2, 2], seasonFrom: 'rain' }))).toEqual({ season: 'summer', rest: [1, 2, 12], from: 'rain' });
    expect(seasonOf(rec({ season: 'summer', restMonths: [0, 3] }))).toEqual({ season: 'summer', rest: [], from: 'grower' });
    expect(seasonOf(rec({ season: 'winter', restMonths: [6], seasonFrom: 'astrology' }))!.from).toBe('grower');
    expect(readMonths([1.5])).toBeNull();
    expect(readMonths(Array.from({ length: 12 }, (_, i) => i + 1))).toBeNull(); // resting all year: never written, never read
    expect(readMonths(Array.from({ length: 5000 }, () => 3))).toBeNull(); // nothing that grows without bound
    expect(readMonths('6,7')).toBeNull();
  });
  it('a paper of another version\'s shape is read by the fields it knows; one not a paper\'s is not shown', () => {
    const p = (o: Record<string, unknown>) => ({ id: 'x1', kind: 'photo', _t: '', acc: 'a1', d: '2026-11-09', mime: 'image/png', bytes: 10, ...o });
    expect(attachmentOf(p({ doc: 'warranty', fileName: 'x'.repeat(500), extra: { any: 1 } }))).toMatchObject({ doc: 'other', fileName: 'x'.repeat(FILE_NAME_MAX) });
    for (const bad of [{ mime: 'text/html' }, { mime: null }, { w: 10, h: 10 }, { acc: null }, { d: 'yesterday' }, { bytes: -1 }, { bytes: MAX_ATTACHMENT_BYTES + 1 }, { bytes: 1.5 }, { _deleted: true }, { kind: 'event' }]) expect(attachmentOf(p(bad)), JSON.stringify(bad)).toBeNull();
    expect(attachmentOf(p({ fileName: '../../etc/\u202epasswd\u0000.png' }))!.fileName).toBe('passwd .png');
  });
});

describe('r87t3 the log 4: a paper\'s bytes', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4\n% a permit\n%%EOF\n');
  it('stored behind a JPEG of one pixel: every reader\'s check takes the stored bytes and the thumbnail for JPEGs; the file comes back whole', () => {
    const stored = wrap(pdf);
    expect(photoBytesError(stored, ENVELOPE)).toBeNull();
    expect(Array.from(unwrap(stored)!)).toEqual(Array.from(pdf));
    expect(unwrap(ENVELOPE)).toBeNull();
    expect(unwrap(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...pdf]))).toBeNull(); // a photograph's JPEG is not a paper's
  });
  it('a file is taken by its own first bytes and its size, never by its name', () => {
    expect(sniff(pdf)).toBe('application/pdf');
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(fileError(new TextEncoder().encode('<html>'), 'permit.pdf')).toMatch(/not a PDF, a JPEG or a PNG/);
    expect(fileError(new Uint8Array(0), 'e.pdf')).toMatch(/empty/);
    expect(fileError(new Uint8Array(MAX_ATTACHMENT_BYTES + 1).fill(0x25), 'big.pdf')).toMatch(/10 MB/);
    expect(cleanName('C:\\Users\\me\\Invoice.pdf')).toBe('Invoice.pdf');
  });
  it('a backup with a paper is read back by this version, its bytes as stored; a restore\'s preview counts it as a paper, not a record waiting', async () => {
    const log = [...plant('a01', 'Conophytum minutum'), ...paper('x1', 'a01')];
    const built = await buildBackup({ changes: log, readPhoto: async (id) => (id === 'x1' ? { id, full: wrap(pdf), thumb: ENVELOPE } : null) });
    const file = await readBackup(built.bytes);
    expect(file.photoIds).toEqual(['x1']);
    expect(Array.from(unwrap(file.readPhoto('x1')!.full)!)).toEqual(Array.from(pdf));
    const m = previewMerge([], file.changes);
    expect(m.addedByKind.attachment).toBe(1);
    expect(m.addedWaiting).toBe(0);
  });
});

describe('r87t3 the season suggested and kept', () => {
  // A winter-rainfall habitat in the south (a Conophytum's): wet in the cooler months.
  const m = (precip: number[], t: number[]): Month[] => precip.map((p, i) => ({ precipMm: p, tmean: t[i], tmin: t[i] - 6, tmax: t[i] + 6, dli: 30 }) as Month);
  const winterRain = m([5, 6, 8, 15, 30, 40, 38, 30, 15, 8, 6, 5], [22, 22, 20, 17, 14, 12, 11, 12, 14, 17, 19, 21]);
  it('suggests by the species page\'s own rain rule, shifted to the grower\'s hemisphere, and says the rule', () => {
    const y = growingYear(winterRain, -31)!;
    expect(y.grow).toBe('winter');
    const north = suggestSeason(y, 51.5)!;
    expect(north.season).toBe('winter');
    expect(north.rule).toBe('rain');
    expect(y.growMonths).toEqual([4, 5, 6, 7, 8]); // the smallest set of months holding 70% of the rain, April to August at the habitat
    expect(north.grow).toEqual([1, 2, 10, 11, 12]); // shifted six months for the north
    expect(north.rest).toEqual([3, 4, 5, 6, 7, 8, 9]);
    const south = suggestSeason(y, -33.9)!;
    expect(south.grow).toEqual([4, 5, 6, 7, 8]);
  });
  it('suggests nothing where the sheet reads no growing season, and "no rest" for rain spread over the year', () => {
    const flat = m([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50], [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25]);
    const y = growingYear(flat, 0)!;
    expect(y.spread).toBe(true);
    expect(suggestSeason(y, 51)).toEqual({ season: 'none', rest: [], rule: 'spread', grow: [] });
    expect(suggestSeason(null, 51)).toBeNull();
    const frozen = growingYear(m([5, 6, 8, 15, 30, 40, 38, 30, 15, 8, 6, 5], [12, 12, 10, 7, 2, -2, -3, -2, 4, 7, 9, 11]), 40)!;
    expect(frozen.frozen).toBe(true);
    expect(suggestSeason(frozen, 40)).toBeNull();
  });
  it('rests in its months only; the reason says what was set and from what', () => {
    const p: PlantSeason = { season: 'winter', rest: [6, 7, 8], from: 'rain' };
    expect(restsIn(p, 7)).toBe(true);
    expect(restsIn(p, 9)).toBe(false);
    expect(restsIn({ season: 'none', rest: [], from: 'grower' }, 7)).toBe(false);
    expect(restsIn(null, 7)).toBe(false);
    expect(restReason(p)).toBe("A winter-grower resting June to August, as you confirmed from its habitat's rain");
    expect(restReason({ ...p, from: 'grower', season: 'summer', rest: [12, 1, 2] })).toBe('A summer-grower resting December to February, as you set it');
  });
});

void ({} as Record_);
