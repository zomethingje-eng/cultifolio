/**
 * Round-59 review, data area: a large realistic collection through backup, merge restore and replace restore, on the real
 * vault over fake-indexeddb; the sheets as Excel reads them; the preview against what the restore does.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';
import { buildBackup, readBackup, previewMerge, plantsCsv, eventsCsv } from '$lib/backup/backup';
import { materialise, live } from '$core/log';
import { unzipSync, strFromU8 } from 'fflate';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbb';

async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const io = await import('$lib/backup/io');
  return { vault, collection: store.collection, io };
}
beforeEach(async () => {
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});

const NOTES = ['Seed from Köhres, 🌵 sown under glass', 'هذا نبات جميل من الصحراء', 'שתיל מהחממה', '"Quoted", with commas, and\nnew lines\r\nCRLF', '=HYPERLINK("http://evil","x")', '+1 cm since spring', '-5 °C survived', '@SUM(A1:A2)', '\tTabbed', '＝全角', 'zero-width​join', 'Ünïcødé ẞ ǅ 𝔘 👨‍👩‍👧', '   =padded formula'];
const JPEG = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 200 + n }, (_, i) => (i * 7 + n) & 0xff), 0xff, 0xd9]);

/** A collection as a log, as a device at real time writes it: 400 plants, places five deep, events, photos, sowings, species notes. */
function bigLog(): Change[] {
  const out: Change[] = [];
  let wall = Date.now() - 30 * 86_400_000;
  const st = (dev = PEER) => hlcEncode({ wall: wall++, count: 0, device: dev });
  const put = (kind: Change['kind'], id: string, fields: Record<string, unknown>) => { for (const [field, value] of Object.entries(fields)) out.push({ t: st(), kind, id, field, value }); };
  let parent: string | null = null;
  const places: string[] = [];
  for (let i = 0; i < 5; i++) { const id = `l${i}`; put('location', id, { name: ['Greenhouse', 'Bench 2', 'Tray A', 'Row 3, left', 'Pot "nest" ש'][i], type: 'other', parentId: parent }); places.push(id); parent = id; }
  for (let i = 0; i < 400; i++) {
    const id = `r${String(i).padStart(4, '0')}`;
    put('accession', id, { acc: `2026-${String(i + 1).padStart(4, '0')}`, taxonName: ['Copiapoa cinerea', 'Lithops lesliei', 'Aloe polyphylla'][i % 3], status: i % 17 === 0 ? 'dead' : 'growing', locationId: places[i % 5], notes: NOTES[i % NOTES.length], fieldNumber: i % 5 === 0 ? '0012' : i % 5 === 1 ? '3-12' : i % 5 === 2 ? '1E5' : `SB ${i}`, price: i % 4 === 0 ? '12.50' : null, acquired: '2026-03-0' + ((i % 9) + 1), sourceRef: i % 3 === 0 ? '00042' : null });
    put('event', `e${i}a`, { acc: id, d: '2026-09-01', t: 'water', note: NOTES[(i + 3) % NOTES.length] });
    put('event', `e${i}b`, { acc: id, d: '2026-09-02', t: 'measure', measures: { heightMm: 12.5 + i, widthMm: 30 } });
    if (i % 4 === 0) put('photo', `p${i}`, { acc: id, d: '2026-09-03', w: 1600, h: 1200, bytes: 300 + i, caption: NOTES[i % NOTES.length], sha: null });
  }
  for (let i = 0; i < 20; i++) put('sowing', `s${i}`, { no: `S2026-${String(i + 1).padStart(3, '0')}`, taxonName: 'Lithops lesliei', method: 'seed', sown: '2026-02-01', count: 50 + i, status: 'active', notes: NOTES[i % NOTES.length], bottomHeatC: -5 + i });
  put('taxon', 'lithops-lesliei', { name: 'Lithops lesliei', myNotes: 'شکل 🌵 notes', myNotesBase: null });
  put('setting', 'numbering', { scheme: { mode: 'year', width: 4 } });
  out.push({ t: st(), kind: 'accession', id: 'r0003', field: '_deleted', value: true });
  return out;
}

describe('a large collection through backup, merge and replace', () => {
  it('every change survives the zip byte for byte; merge and replace both rebuild the same fold; the CSV opens as Excel expects', async () => {
    const log = bigLog();
    const photos = new Map<string, { full: Uint8Array; thumb: Uint8Array }>();
    for (const c of log) if (c.kind === 'photo' && c.field === 'd') photos.set(c.id, { full: JPEG(c.id.length * 3), thumb: JPEG(1) });
    const built = await buildBackup({ changes: log, device: PEER, app: 'cultifolio 3', readPhoto: async (id) => (photos.has(id) ? { id, ...photos.get(id)! } : null) });
    const read = await readBackup(built.bytes);
    expect(read.changes).toEqual(log);
    expect(read.unreadable).toEqual([]);
    expect(read.photoIds.length).toBe(photos.size);
    for (const id of read.photoIds) expect(read.readPhoto(id)!.full).toEqual(photos.get(id)!.full);

    // the sheets as the zip holds them
    const files = unzipSync(built.bytes);
    expect([...files['plants.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(files['plants.csv']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
    // a minimal RFC 4180 parser: every row has the header's column count
    const parse = (s: string) => { const rows: string[][] = []; let row: string[] = [], cell = '', q = false; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r' && s[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; } else cell += ch; } return rows; };
    const rows = parse(csv.slice(1));
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    const notesCol = rows[0].indexOf('notes'), fieldCol = rows[0].indexOf('field number'), refCol = rows[0].indexOf('lot or reference');
    const cells = rows.slice(1).map((r) => r[notesCol]);
    // the formula guard: every cell that starts like a formula carries the apostrophe
    for (const c of cells) if (/^\s*[=+\-@\t\r＝＋－＠]/.test(c)) throw new Error('unguarded ' + c);
    expect(cells).toContain("'=HYPERLINK(\"http://evil\",\"x\")");
    expect(cells).toContain("'   =padded formula");
    expect(cells).toContain('"Quoted", with commas, and\nnew lines\r\nCRLF');
    // what Excel does with text that looks like a number or a date: written bare, so it is converted on open
    const fieldCells = new Set(rows.slice(1).map((r) => r[fieldCol]));
    const refCells = new Set(rows.slice(1).map((r) => r[refCol]));
    console.log('field number cells as written:', [...fieldCells].filter((x) => /^[0-9]/.test(x)).slice(0, 5), 'lot cells:', [...refCells].filter(Boolean).slice(0, 3));
    expect(fieldCells.has('0012')).toBe(true); // Excel opens this as 12
    expect(fieldCells.has('3-12')).toBe(true); // Excel opens this as a date (3 Dec, or 12 Mar)
    expect(fieldCells.has('1E5')).toBe(true); // Excel opens this as 100000
    expect(refCells.has('00042')).toBe(true); // Excel opens this as 42
    // there is no identity column: two plants under one number are two rows nobody can tell apart in the sheet
    expect(rows[0]).not.toContain('id');

    // merge restore onto an empty device
    let a = await boot();
    await a.collection.load();
    const file = new File([new Blob(built.parts as BlobPart[])], 'x.cultifolio.zip');
    let opened = await a.io.openBackup(file);
    expect(opened.merge.addedByKind.accession).toBe(399);
    const rep = await a.io.restoreBackup(opened, 'merge');
    expect(rep.changes).toBe(log.length);
    expect(rep.photos).toBe(photos.size);
    a = await boot();
    await a.collection.load();
    const want = materialise(log).state;
    const fold = (c: typeof a.collection) => JSON.stringify(c.accessions.map((x) => ({ ...x })).sort((p, q) => p.id.localeCompare(q.id)));
    expect(a.collection.accessions.length).toBe(live(want, 'accession').length);
    const merged = fold(a.collection);
    expect(a.collection.locationName('l4')).toBe('Greenhouse › Bench 2 › Tray A › Row 3, left › Pot "nest" ש');
    expect(a.collection.taxon('lithops-lesliei')?.myNotes).toBe('شکل 🌵 notes');
    expect(a.collection.accession('r0001')?.notes).toBe(NOTES[1]);
    expect(a.collection.events('r0002').find((e) => e.t === 'measure')?.measures).toEqual({ heightMm: 14.5, widthMm: 30 });
    expect((await a.vault.photoBlobIds()).length).toBe(photos.size);

    // replace restore over a device that holds something else
    await a.collection.addAccession({ taxonName: 'Haworthia', notes: 'only here' } as never);
    opened = await a.io.openBackup(file);
    expect(opened.onlyHere.length).toBe(1);
    await a.io.restoreBackup(opened, 'replace');
    a = await boot();
    await a.collection.load();
    expect(fold(a.collection)).toBe(merged);
    expect(a.collection.accessions.some((x) => x.taxonName === 'Haworthia')).toBe(false);
    expect((await a.vault.allChanges()).length).toBe(log.length);
  }, 120_000);

  it('the preview says a merge renumbers plants; the merge renumbers nothing (round fifty-nine removed the repair)', async () => {
    const base = Date.now() - 86_400_000;
    const plant = (id: string, dev: string, wall: number, name: string): Change[] => [
      { t: hlcEncode({ wall, count: 0, device: dev }), kind: 'accession', id, field: 'taxonName', value: name },
      { t: hlcEncode({ wall, count: 1, device: dev }), kind: 'accession', id, field: 'status', value: 'growing' },
      { t: hlcEncode({ wall, count: 2, device: dev }), kind: 'accession', id, field: 'acc', value: '2026-0001' }
    ];
    // here: made later, but with the smaller id; the file's made earlier with the larger id
    const here = plant('rzzzz-here', DEV, base + 5000, 'Haworthia here');
    const there = plant('raaaa-file', PEER, base, 'Lithops in the file');
    let a = await boot();
    await a.vault.appendChanges(here, true);
    await a.collection.load();
    const built = await buildBackup({ changes: there, readPhoto: async () => null });
    const opened = await a.io.openBackup(new File([built.bytes as BlobPart], 'f.cultifolio.zip'));
    const pv = opened.merge.renumbered;
    console.log('preview renumbered:', pv);
    await a.io.restoreBackup(opened, 'merge');
    a = await boot();
    await a.collection.load();
    const nums = a.collection.accessions.map((x) => `${x.acc} ${x.taxonName}`);
    console.log('after merge:', nums, 'plan:', a.collection.numberPlan('accession', 'rzzzz-here'));
    expect(pv.length).toBe(1); // the preview promises a renumber...
    expect(nums.filter((n) => n.startsWith('2026-0001')).length).toBe(2); // ...that does not happen
    // and the preview names the keeper by id, the record page by first stamp: they disagree here
    expect(pv[0].here).toBe(true); // preview: "this device's plant gets a new number" (rzzzz-here sorts after raaaa-file by id) -- same here by chance
  });

  it('previewMerge counts held far-future changes as added; the merged device shows none of them', async () => {
    const far = Date.now() + 5 * 365 * 86_400_000;
    const file: Change[] = [
      { t: hlcEncode({ wall: far, count: 0, device: PEER }), kind: 'accession', id: 'rfar', field: 'taxonName', value: 'Copiapoa' },
      { t: hlcEncode({ wall: far, count: 1, device: PEER }), kind: 'accession', id: 'rfar', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: far, count: 2, device: PEER }), kind: 'accession', id: 'rfar', field: 'acc', value: '2031-0001' }
    ];
    let a = await boot();
    await a.collection.load();
    const built = await buildBackup({ changes: file, readPhoto: async () => null });
    const opened = await a.io.openBackup(new File([built.bytes as BlobPart], 'f.cultifolio.zip'));
    expect(opened.merge.addedByKind.accession).toBe(1);
    const rep = await a.io.restoreBackup(opened, 'merge');
    expect(rep.changes).toBe(3);
    a = await boot();
    await a.collection.load();
    expect(a.collection.accessions.length).toBe(0);
    expect(a.collection.heldList().length).toBe(3);
  });

  it('eventsCsv names a duplicate number twice with nothing to tell the two plants apart', () => {
    const t = (n: number) => hlcEncode({ wall: 1_790_000_000_000 + n, count: 0, device: PEER });
    const log: Change[] = [];
    let n = 0;
    for (const [id, name] of [['r1', 'Lithops'], ['r2', 'Lithops']]) {
      log.push({ t: t(n++), kind: 'accession', id, field: 'taxonName', value: name }, { t: t(n++), kind: 'accession', id, field: 'status', value: 'growing' }, { t: t(n++), kind: 'accession', id, field: 'acc', value: '2026-0001' });
      log.push({ t: t(n++), kind: 'event', id: 'e' + id, field: 'acc', value: id }, { t: t(n++), kind: 'event', id: 'e' + id, field: 'd', value: '2026-09-01' }, { t: t(n++), kind: 'event', id: 'e' + id, field: 't', value: 'water' });
    }
    const { state } = materialise(log);
    const ev = eventsCsv(live(state, 'event') as never, state).slice(1).split('\r\n');
    const pl = plantsCsv(live(state, 'accession') as never, state).slice(1).split('\r\n');
    console.log(pl.slice(0, 3), ev.slice(0, 3));
    expect(ev[1].split(',').slice(0, 3)).toEqual(ev[2].split(',').slice(0, 3));
  });
});
