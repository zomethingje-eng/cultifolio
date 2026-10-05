/**
 * Build and read backup zips. Pure over its inputs (a change log, a photo
 * reader, a photo writer) so the same code is unit-tested in Node and run in
 * the browser; the vault wiring is in ./io.ts.
 */
import { Zip, ZipPassThrough, ZipDeflate, unzipSync, strToU8, strFromU8 } from 'fflate';
import * as v from 'valibot';
import { materialise, live, known, readChanges, isComplete, type Change, type Record_ } from '$core/log';
import { kindOf, accNo, sowNo, EVENT_LABEL, MEASURES, type Accession, type Photo, type Sowing, type PlantEvent } from '$lib/db/types';
import { MAX_PHOTO_BYTES, SEAL_OVERHEAD } from '$lib/sync/limits';
import { BACKUP_FORMAT, BACKUP_V, Manifest, ChangeRow, photoPath, thumbPath } from './format';

/** Why a photo's bytes cannot be stored, or null: both files must be JPEGs (the app only ever writes JPEGs) and small enough to sync. */
export function photoBytesError(full: Uint8Array, thumb: Uint8Array): string | null {
  const jpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (!jpeg(full) || !jpeg(thumb)) return 'not a JPEG';
  if (full.length + thumb.length + SEAL_OVERHEAD > MAX_PHOTO_BYTES) return `${Math.round((full.length + thumb.length) / 1048576)} MB, over the ${MAX_PHOTO_BYTES / 1048576} MB limit`;
  return null;
}

/**
 * Every row the fold can take; a row it cannot take is left out
 * and named in `unreadable` rather than refusing the file (round twenty-nine, 2). A file with no readable change at all
 * is refused, since there is nothing to restore.
 */
function checkRows(rows: unknown[]): { changes: Change[]; unreadable: string[] } {
  let read: ReturnType<typeof readChanges>;
  try {
    read = readChanges(rows);
  } catch (e) {
    const m = /^change (\d+): (.*)$/.exec(e instanceof Error ? e.message : String(e));
    throw new Error(m ? `Change ${Number(m[1]) + 1} in that backup cannot be read (${m[2]}); the file may be damaged or from a newer version.` : String(e));
  }
  return { changes: read.changes, unreadable: read.dropped.map((d) => d.replace(/^change (\d+):/, (_, n) => `change ${Number(n) + 1}:`)) };
}

export interface PhotoBytes {
  id: string;
  full: Uint8Array;
  thumb: Uint8Array;
}

/** This device's own settings, which are not records: the site, the units, the label sheet choices, the preferences. Carried as `device.json` so a restore on a cleared or new device gets them back (round twenty-two, 5). */
/** `device.json` in a backup: this device's settings, which are not records in the log. Each is applied on restore only where the device has none of its own. */
export interface DeviceSettings {
  site?: { lat: number; lon: number; name?: string };
  units?: string;
  labels?: Record<string, unknown>;
  prefs?: { referencePhotos?: boolean };
}
export interface BuildOpts {
  changes: Change[];
  device?: string;
  app?: string;
  settings?: DeviceSettings;
  /** The stamps of changes this device has parked; those in `changes` go in the manifest (round fifty-eight). */
  parked?: Iterable<string>;
  /** Called once per live photo record; return null when the pixels are missing (the record still travels, and the manifest names it under `photosMissing`). */
  readPhoto: (id: string) => Promise<PhotoBytes | null>;
  onProgress?: (done: number, total: number) => void;
}

/** Counts from a change log, for the manifest and for the import preview. */
export function summarise(changes: Change[]) {
  const { state } = materialise(changes);
  const n = (kind: Record_['kind']) => live(state, kind).length;
  return { changes: changes.length, accessions: n('accession'), events: n('event'), locations: n('location'), sowings: n('sowing'), taxa: n('taxon'), photos: n('photo'), state };
}

export interface BuiltBackup {
  /** The zip as the pieces the writer produced, in order: a Blob of them is the file, with nothing held twice (round twenty-nine, 11). */
  parts: Uint8Array[];
  /** The zip's size in bytes. */
  size: number;
  /** The zip as one array, joined on demand: for tests and for the older JSON path; a page should use `parts`. */
  readonly bytes: Uint8Array;
  /** Live photo records whose pixels `readPhoto` could not supply: their records are in the file, their pixels are not, and the manifest says so. */
  photosMissing: string[];
}

export async function buildBackup(o: BuildOpts): Promise<BuiltBackup> {
  const s = summarise(o.changes);
  // Every photograph with a record that is not removed, waiting ones included: round thirty-five kept their pixels on the
  // device for the day the record completes, and a backup made in between must carry them too (round thirty-seven, 1).
  const photos = known<Pick<Photo, 'id'> & Record_>(s.state, 'photo');
  // Written as a stream, one entry at a time: a photograph is read, pushed through the zip and let go before the next
  // is read, and the zip's own output is kept as the pieces it comes in rather than joined. A backup of six hundred
  // photographs held every photograph, the whole zip and a copy of it at once, about three times the file, which is
  // more than a phone gives a tab (round twenty-nine, 11). fflate's streaming classes use no worker, so the CSP stands.
  const parts: Uint8Array[] = [];
  let size = 0;
  let failed: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failed = err;
    else {
      parts.push(chunk);
      size += chunk.length;
    }
  });
  const entry = (name: string, bytes: Uint8Array, deflate: boolean) => {
    const f = deflate ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name); // JPEGs do not compress; stored as-is so the zip is fast to write and read
    zip.add(f);
    f.push(bytes, true);
    if (failed) throw failed;
  };
  let photoBytes = 0;
  let done = 0;
  const photosMissing: string[] = [];
  for (const p of photos) {
    const b = await o.readPhoto(p.id);
    if (b) {
      entry(photoPath(p.id), b.full, false);
      entry(thumbPath(p.id), b.thumb, false);
      photoBytes += b.full.length + b.thumb.length;
    } else photosMissing.push(p.id);
    o.onProgress?.(++done, photos.length);
  }
  const inLog = new Set(o.changes.map((c) => c.t));
  const parked = [...new Set(o.parked ?? [])].filter((t) => inLog.has(t)).sort();
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    v: BACKUP_V,
    app: o.app,
    exported: new Date().toISOString(),
    device: o.device,
    counts: { changes: s.changes, accessions: s.accessions, events: s.events, locations: s.locations, sowings: s.sowings, taxa: s.taxa, photos: photos.length - photosMissing.length, photoBytes },
    ...(photosMissing.length ? { photosMissing } : {}),
    ...(parked.length ? { parked } : {})
  };
  entry('manifest.json', strToU8(JSON.stringify(manifest, null, 1)), true);
  entry('changes.json', strToU8(JSON.stringify(o.changes)), true);
  if (o.settings && Object.keys(o.settings).length) entry('device.json', strToU8(JSON.stringify(o.settings, null, 1)), true);
  entry('plants.csv', strToU8(plantsCsv(live<Accession & Record_>(s.state, 'accession'), s.state)), true);
  entry('batches.csv', strToU8(batchesCsv(live<Sowing & Record_>(s.state, 'sowing'), s.state)), true);
  entry('events.csv', strToU8(eventsCsv(live<PlantEvent & Record_>(s.state, 'event'), s.state)), true);
  zip.end();
  if (failed) throw failed;
  return {
    parts,
    size,
    photosMissing,
    get bytes() {
      const out = new Uint8Array(size);
      let at = 0;
      for (const c of parts) { out.set(c, at); at += c.length; }
      return out;
    }
  };
}

export interface ReadBackup {
  manifest: Manifest;
  changes: Change[];
  /** Rows of `changes.json` that could not be read and were left out, each named ("change 15: price of a accession must be a string, not [1]"). */
  unreadable: string[];
  /** The exporting device's settings (`device.json`), when the file has them. */
  settings: DeviceSettings | null;
  /** Photo ids whose pixels are in the file. */
  photoIds: string[];
  readPhoto: (id: string) => PhotoBytes | null;
}

/** Photo records in a backup (not removed, whole or waiting) whose pixels are not in it, counted from the file itself (the manifest's list is what the exporting device said; this is what the file holds). */
export function photosWithoutPixels(file: Pick<ReadBackup, 'changes' | 'photoIds'>): string[] {
  const have = new Set(file.photoIds);
  return known<Pick<Photo, 'id'> & Record_>(materialise(file.changes).state, 'photo')
    .map((p) => p.id)
    .filter((id) => !have.has(id));
}

/** The entries a backup carries and nothing else: the three JSON files, the two sheets, a photograph or its thumbnail. */
const KNOWN_ENTRY = /^(manifest\.json|changes\.json|device\.json|plants\.csv|batches\.csv|events\.csv|photos\/[^\0]{1,200}\.jpg)$/; // a photo entry's name is judged below, so an impossible one is refused and said rather than skipped
/** The most any one entry may inflate to: a photograph is bounded by the sync limit, and a log of a million changes is well under this. */
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
/** The most changes.json may inflate to: a log of a million changes is about a hundred megabytes. */
export const MAX_CHANGES_BYTES = 192 * 1024 * 1024;
/** The manifest and the device settings: a few kilobytes each; anything declaring more is not one of ours. */
export const MAX_SMALL_ENTRY_BYTES = 4 * 1024 * 1024;

/** What a damaged or foreign zip is called, in place of fflate's "invalid zip data" (round fifty-eight; the grower review). */
export const UNREADABLE_ZIP = 'That file is not a readable zip: it may be damaged or not a Cultifolio backup. Nothing on this device was changed.';

/** Parse a backup from bytes: the zip a backup is. Throws a readable error for anything else. */
export async function readBackup(bytes: Uint8Array): Promise<ReadBackup> {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('That file is not a Cultifolio backup (a .cultifolio.zip).');
  // Synchronous for the same reason as the writer: the asynchronous reader inflates entries over 512 kB in a blob: worker
  // the CSP refuses. Only the entries a backup has are inflated, each within a size a backup entry can have: a zip made
  // to inflate to gigabytes is refused at its table of contents, not after the page has frozen on it (round twenty-nine, 10).
  // The sum of what the table of contents declares is bounded by the file's own size too (JPEGs are stored, so a
  // backup inflates to little more than itself), and changes.json by its own cap, so ten entries each under the
  // per-entry cap cannot add up to gigabytes (round thirty, R2-7). An entry that inflates past what it declared is cut
  // by fflate at the declared size.
  // What is inflated, and how much of it: the log under its own cap (it compresses by an order of magnitude, so the
  // file's size says nothing about it: round thirty-three, 3); the manifest and the device settings, which are a few
  // kilobytes, under a small cap; the sheets not at all, since a restore never reads them (they are made again from the
  // log); the photographs, which are stored, bounded by the file's own size. A name seen twice is refused: eight
  // entries alternating the two sheet names at 250 MB each inflated two gigabytes before the manifest was read
  // (round thirty-five, R1-6, R2-4).
  let declared = 0;
  const seen = new Set<string>();
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!KNOWN_ENTRY.test(f.name) || f.originalSize > MAX_ENTRY_BYTES) return false;
        // Every writer has stored the photographs as they are (JPEGs do not compress), so a deflated photograph entry is not
        // ours, and inflating one is the one cost the declared size does not bound: a 205 kB stream declared as 300 bytes
        // inflated 200 MB before it was cut to the declared size (round thirty-eight, R1-11).
        if (f.name.startsWith('photos/') && f.compression !== 0) throw new Error(`That zip compresses ${f.name}; a Cultifolio backup stores its photographs as they are.`);
        if (seen.has(f.name)) throw new Error(`That zip names ${f.name} twice; it is not a Cultifolio backup.`);
        seen.add(f.name);
        if (f.name === 'plants.csv' || f.name === 'batches.csv' || f.name === 'events.csv') return false;
        if (f.name === 'changes.json') return f.originalSize <= MAX_CHANGES_BYTES;
        if (f.name === 'manifest.json' || f.name === 'device.json') return f.originalSize <= MAX_SMALL_ENTRY_BYTES;
        // A stored entry is copied by its compressed size, whatever it declares as its original: a table of contents whose
        // entries all point at one stored block and each declare a byte of content passed the sum and cost a copy of the
        // block apiece (round thirty-seven, R1-5). The larger of the two counts, and a stored entry whose two sizes differ
        // is not one a writer makes.
        if (f.compression === 0 && f.size !== f.originalSize) throw new Error(`That zip stores ${f.name} with two different sizes; it is not a Cultifolio backup.`);
        declared += Math.max(f.size, f.originalSize);
        if (declared > bytes.length * 1.1 + 64 * 1048576) throw new Error('That zip declares far more content than a backup of its size can hold; it is not a Cultifolio backup.');
        return true;
      }
    });
  } catch (e) {
    // fflate's own failures ("invalid zip data", "unexpected EOF") carry a numeric code; the refusals above are ours and
    // already say what is wrong. The file is only read here, so nothing on the device has changed (round fifty-eight; the grower review).
    if (e && typeof (e as { code?: unknown }).code === 'number') throw new Error(UNREADABLE_ZIP);
    throw e;
  }
  if (!files['manifest.json'] || !files['changes.json']) throw new Error('That zip has no manifest.json and changes.json; it is not a Cultifolio backup.');
  const m = v.safeParse(Manifest, JSON.parse(strFromU8(files['manifest.json'])));
  if (!m.success) throw new Error('The backup manifest is not in a shape this version understands.');
  if (m.output.v > BACKUP_V) throw new Error(`This backup was written by a newer Cultifolio (format ${m.output.v}); update the app to restore it.`);
  const rows = v.safeParse(v.array(ChangeRow), JSON.parse(strFromU8(files['changes.json'])));
  if (!rows.success) throw new Error('The change log in that backup does not parse.');
  const photoIds = Object.keys(files)
    .filter((k) => k.startsWith('photos/') && k.endsWith('.jpg') && !k.endsWith('.t.jpg'))
    .map((k) => k.slice('photos/'.length, -'.jpg'.length))
    .filter((id) => files[thumbPath(id)]);
  for (const id of photoIds) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`That backup has a photo entry with an impossible name (${photoPath(id)}).`);
    const e = photoBytesError(files[photoPath(id)], files[thumbPath(id)]);
    if (e) throw new Error(`Photo ${id} in that backup cannot be restored: ${e}.`);
  }
  let settings: DeviceSettings | null = null;
  if (files['device.json']) {
    try {
      const d: unknown = JSON.parse(strFromU8(files['device.json']));
      if (d && typeof d === 'object' && !Array.isArray(d)) settings = d as DeviceSettings;
    } catch {
      /* a device.json that does not parse is left out; the records still restore */
    }
  }
  return {
    manifest: m.output,
    ...checkRows(rows.output),
    settings,
    photoIds,
    readPhoto: (id) => (files[photoPath(id)] && files[thumbPath(id)] ? { id, full: files[photoPath(id)], thumb: files[thumbPath(id)] } : null)
  };
}

/** What restoring would do against the current log: new changes, and records that would appear or change. */
export function previewMerge(current: Change[], incoming: Change[]) {
  const have = new Set(current.map((c) => c.t));
  const fresh = incoming.filter((c) => !have.has(c.t));
  const before = materialise(current).state;
  const after = materialise([...current, ...fresh]).state;
  let added = 0, changed = 0, addedDeleted = 0, addedWaiting = 0;
  const waitingNames: string[] = []; // named, so the grower can find them: a count alone gave nothing to act on (round thirty-seven, R1-4)
  // Added, by kind, live records only, so the preview can say "5 plants, 20 timeline entries" in the words the "In the
  // file" line uses, rather than a total that also counts species notes, the numbering record, deleted records
  // (round twenty-three, 18) and records the file leaves without a required field, which the pages will not show
  // (round thirty-five, R1-4).
  const addedByKind: Record<string, number> = {};
  for (const [k, r] of after) {
    const b = before.get(k);
    if (!b) {
      added++;
      if (r._deleted) addedDeleted++;
      else if (!isComplete(r)) {
        addedWaiting++;
        const what = r.kind === 'accession' ? accNo(r as unknown as Accession) : r.kind === 'sowing' ? sowNo(r as unknown as Sowing) : (r.name ?? r.id);
        waitingNames.push(`${r.kind === 'accession' ? 'plant' : r.kind === 'sowing' ? 'batch' : r.kind === 'location' ? 'place' : r.kind} ${String(what)}`);
      }
      else addedByKind[r.kind] = (addedByKind[r.kind] ?? 0) + 1;
    } else if (b._t !== r._t) changed++;
  }
  // Numbers the merge would leave shared: a plant here and a plant in the file under one number. Nothing renumbers on
  // its own any more (round fifty-nine): both keep the number until the grower presses Renumber on either page, which
  // the preview says rather than promising a renumbering that does not happen (round sixty; the data review's 7).
  const sharedNumbers: Array<{ no: string; here: boolean; name: string }> = [];
  for (const kind of ['accession', 'sowing'] as const) {
    const byNo = new Map<string, Array<Record_>>();
    for (const r of after.values()) {
      if (r.kind !== kind || r._deleted || !isComplete(r)) continue;
      const no = kind === 'accession' ? accNo(r as unknown as Accession) : sowNo(r as unknown as Sowing);
      const xs = byNo.get(no);
      if (xs) xs.push(r); else byNo.set(no, [r]);
    }
    for (const [no, recs] of byNo) {
      if (recs.length < 2) continue;
      for (const r of recs) sharedNumbers.push({ no, here: before.has(`${kind}:${r.id}`), name: String(r.taxonName ?? '') });
    }
  }
  sharedNumbers.sort((a, b) => a.no.localeCompare(b.no) || Number(b.here) - Number(a.here));
  return { fresh, added, changed, unchanged: after.size - added - changed, addedByKind, addedDeleted, addedWaiting, waitingNames, sharedNumbers };
}

const csvCell = (x: unknown) => {
  if (x == null) return '';
  let s = String(x);
  // A text cell beginning =, +, -, @ or a tab (after any leading spaces, and the full-width forms too) is read as a
  // formula by a spreadsheet; a note starting "-5 °C" is the real case. A leading apostrophe makes it text, which is
  // what it is (round twenty-six, 14). A number is a number and is written as one: −5 °C of bottom heat stays -5 (round twenty-nine, 10).
  if (typeof x === 'string' && /^\s*[=+\-@\t\r＝＋－＠]/.test(s)) s = "'" + s;
  // Text a spreadsheet would read as a number or a date and change: a lot "0012" became 12, "1E5" 100000, "3-12" the
  // 3rd of December (round sixty; the data review's 12). Written as ="0012", which spreadsheets show as the text itself;
  // the import page reads it back the same way. Real numbers stay numbers.
  else if (typeof x === 'string' && (/^0\d+$/.test(s) || /^\d+(\.\d+)?[eE][+-]?\d+$/.test(s) || /^\d{1,2}[-/]\d{1,2}$/.test(s) || /^\d{16,}$/.test(s))) s = `="${s}"`;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** A place's full path for a sheet cell, "Greenhouse › Bench 2". */
const locPath = (state: Map<string, Record_>, id: string | null | undefined, seen = new Set<string>()): string => {
  if (!id || seen.has(id)) return ''; // a cycle in a damaged log ends here rather than never
  seen.add(id);
  const r = state.get(`location:${id}`);
  if (!r) return '';
  // A removed or incomplete place is walked past to its parent, as the store's own walk does (`rawParent`): the plant
  // the app shows in House was a blank cell in the sheet of the same backup (round thirty-seven, R2-1).
  if (r._deleted || !isComplete(r)) return locPath(state, r.parentId as string | null, seen);
  const parent = locPath(state, r.parentId as string | null, seen);
  return parent ? `${parent} › ${r.name}` : String(r.name);
};
const csvSheet = (head: string[], rows: string[]) => '\ufeff' + [head.join(','), ...rows].join('\r\n') + '\r\n';

/** The plants as a flat sheet: one row each, the fields a person would want in a spreadsheet. */
export function plantsCsv(accs: Array<Accession & Record_>, state: Map<string, Record_>): string {
  const loc = (id: string | null | undefined) => locPath(state, id);
  // The record's identity last: two plants under one number (two devices gave it out offline) are two rows that a reader
  // and an import can tell apart (round sixty; the data review's 12).
  const head = ['number', 'species', 'cultivar', 'kind', 'parentage', 'name as received', 'field number', 'provenance', 'status', 'location', 'acquired', 'from', 'lot or reference', 'form', 'price', 'sowing', 'notes', 'id'];
  const rows = [...accs]
    .sort((a, b) => accNo(a).localeCompare(accNo(b)))
    .map((a) => [accNo(a), a.taxonName, a.cultivar, kindOf(a), a.parentage, a.nameAsReceived, a.fieldNumber, a.provenance, a.status, a.locationId ? loc(a.locationId) : null, a.acquired, a.sourceFrom, a.sourceRef, a.sourceForm, a.price, a.sowingId ? sowNo((state.get(`sowing:${a.sowingId}`) as unknown as Sowing | undefined) ?? { id: a.sowingId }) : null, a.notes, a.id].map(csvCell).join(','));
  return csvSheet(head, rows);
}

/**
 * The timeline as a sheet: every entry on every plant and batch, oldest first, with the plant's number and species so
 * the sheet reads on its own (round forty-nine, 1). The years of waterings, repottings and measurements were in the
 * changes file only, which a spreadsheet cannot open.
 */
export function eventsCsv(events: Array<PlantEvent & Record_>, state: Map<string, Record_>): string {
  // Measurements are written as the label and the unit ("height 42 mm"), not the stored key in bare millimetres, which a
  // reader in inches misread; an entry on a removed record says so in its own column (round fifty-one, 5).
  const head = ['date', 'number', 'species', 'entry', 'note', 'count', 'cause', 'used', 'measurements', 'by the app', 'record removed', 'record id'];
  const rows = [...events]
    .sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id))
    .map((e) => {
      const acc = state.get(`accession:${e.acc}`) as unknown as (Accession & Record_) | undefined;
      const sow = acc ? undefined : (state.get(`sowing:${e.acc}`) as unknown as (Sowing & Record_) | undefined);
      const no = acc ? accNo(acc) : sow ? sowNo(sow) : e.acc;
      const name = acc?.taxonName ?? sow?.taxonName ?? null;
      const measures = e.measures && typeof e.measures === 'object' ? Object.entries(e.measures).map(([k, v]) => { const m = MEASURES.find((x) => x.k === k) ?? (k === 'pot' ? { label: 'Pot size', unit: 'mm' } : undefined); /* a repot's pot, in mm (round fifty-eight) */ return `${(m?.label ?? k).toLowerCase()} ${v}${m?.unit ? ` ${m.unit}` : ''}`; }).join('; ') : null;
      const removed = (acc ?? sow)?._deleted ? 'yes' : null;
      return [e.d, no, name, EVENT_LABEL[e.t as keyof typeof EVENT_LABEL] ?? e.t, e.note, e.n, e.cause, e.used, measures, e.auto ? 'yes' : null, removed, e.acc].map(csvCell).join(',');
    });
  return csvSheet(head, rows);
}

/** The propagation batches as a sheet, with the figures the batch page shows: what went in, the latest count, what was potted and lost (round twenty-eight, 9). */
export function batchesCsv(sowings: Array<Sowing & Record_>, state: Map<string, Record_>): string {
  const head = ['number', 'species', 'cultivar', 'kind', 'parentage', 'method', 'parent plant', 'date', 'started', 'counted', 'potted', 'lost', 'from', 'lot', 'field number', 'provenance', 'medium', 'container', 'pre-treatment', 'bottom heat C', 'covered', 'location', 'status', 'notes', 'id'];
  const events = new Map<string, Array<{ t: string; n: number }>>();
  for (const r of state.values()) if (r.kind === 'event' && !r._deleted && isComplete(r) && typeof r.acc === 'string') { let l = events.get(r.acc); if (!l) events.set(r.acc, (l = [])); l.push({ t: String(r.t), n: typeof r.n === 'number' ? r.n : 0 }); }
  const rows = [...sowings]
    .sort((a, b) => sowNo(a).localeCompare(sowNo(b)))
    .map((s) => {
      const ev = events.get(s.id) ?? [];
      const germ = ev.filter((e) => e.t === 'germinate');
      const parent = s.parentAcc ? (state.get(`accession:${s.parentAcc}`) as unknown as Accession | undefined) : undefined;
      return [sowNo(s), s.taxonName, s.cultivar, kindOf(s), s.parentage, s.method, parent ? accNo(parent) : s.parentAcc, s.sown, s.count, germ.length ? Math.max(...germ.map((e) => e.n)) : null, ev.filter((e) => e.t === 'potup').reduce((n, e) => n + e.n, 0) || null, ev.filter((e) => e.t === 'loss').reduce((n, e) => n + e.n, 0) || null, s.sourceFrom, s.sourceRef, s.fieldNumber, s.provenance, s.medium, s.container, s.treatment, s.bottomHeatC, s.covered ? 'yes' : null, locPath(state, s.locationId), s.status, s.notes, s.id].map(csvCell).join(',');
    });
  return csvSheet(head, rows);
}
