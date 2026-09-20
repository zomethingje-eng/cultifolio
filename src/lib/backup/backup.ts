/**
 * Build and read backup zips. Pure over its inputs (a change log, a photo
 * reader, a photo writer) so the same code is unit-tested in Node and run in
 * the browser; the vault wiring is in ./io.ts.
 */
import { zip, unzip, strToU8, strFromU8, type Zippable } from 'fflate';
import * as v from 'valibot';
import { materialise, live, changeError, type Change, type Record_ } from '$core/log';
import { kindOf, accNo, sowNo, type Accession, type Photo, type Sowing } from '$lib/db/types';
import { MAX_PHOTO_BYTES, SEAL_OVERHEAD } from '$lib/sync/limits';
import { BACKUP_FORMAT, BACKUP_V, Manifest, ChangeRow, LegacyChanges, photoPath, thumbPath } from './format';

/** Why a photo's bytes cannot be stored, or null: both files must be JPEGs (the app only ever writes JPEGs) and small enough to sync. */
export function photoBytesError(full: Uint8Array, thumb: Uint8Array): string | null {
  const jpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (!jpeg(full) || !jpeg(thumb)) return 'not a JPEG';
  if (full.length + thumb.length + SEAL_OVERHEAD > MAX_PHOTO_BYTES) return `${Math.round((full.length + thumb.length) / 1048576)} MB, over the ${MAX_PHOTO_BYTES / 1048576} MB limit`;
  return null;
}

/** Every row must be a change the fold can take; the first that is not names itself. */
function checkRows(rows: unknown[]): Change[] {
  for (let i = 0; i < rows.length; i++) {
    const e = changeError(rows[i]);
    if (e) throw new Error(`Change ${i + 1} in that backup cannot be read (${e}); the file may be damaged or from a newer version.`);
  }
  return rows as Change[];
}

export interface PhotoBytes {
  id: string;
  full: Uint8Array;
  thumb: Uint8Array;
}

export interface BuildOpts {
  changes: Change[];
  scheme?: unknown;
  device?: string;
  app?: string;
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
  bytes: Uint8Array;
  /** Live photo records whose pixels `readPhoto` could not supply: their records are in the file, their pixels are not, and the manifest says so. */
  photosMissing: string[];
}

export async function buildBackup(o: BuildOpts): Promise<BuiltBackup> {
  const s = summarise(o.changes);
  const photos = live<Photo & Record_>(s.state, 'photo');
  const files: Zippable = {};
  let photoBytes = 0;
  let done = 0;
  const photosMissing: string[] = [];
  for (const p of photos) {
    const b = await o.readPhoto(p.id);
    if (b) {
      // JPEGs do not compress; store them as-is so the zip is fast to write and read.
      files[photoPath(p.id)] = [b.full, { level: 0 }];
      files[thumbPath(p.id)] = [b.thumb, { level: 0 }];
      photoBytes += b.full.length + b.thumb.length;
    } else photosMissing.push(p.id);
    o.onProgress?.(++done, photos.length);
  }
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    v: BACKUP_V,
    app: o.app,
    exported: new Date().toISOString(),
    device: o.device,
    counts: { changes: s.changes, accessions: s.accessions, events: s.events, locations: s.locations, sowings: s.sowings, taxa: s.taxa, photos: photos.length - photosMissing.length, photoBytes },
    ...(photosMissing.length ? { photosMissing } : {}),
    scheme: o.scheme
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
  files['changes.json'] = strToU8(JSON.stringify(o.changes));
  files['plants.csv'] = strToU8(plantsCsv(live<Accession & Record_>(s.state, 'accession'), s.state));
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))));
  return { bytes, photosMissing };
}

export interface ReadBackup {
  manifest: Manifest | null; // null for the legacy changes-only JSON
  changes: Change[];
  /** Photo ids whose pixels are in the file. */
  photoIds: string[];
  readPhoto: (id: string) => PhotoBytes | null;
}

/** Live photo records in a backup whose pixels are not in it, counted from the file itself (the manifest's list is what the exporting device said; this is what the file holds). */
export function photosWithoutPixels(file: Pick<ReadBackup, 'changes' | 'photoIds'>): string[] {
  const have = new Set(file.photoIds);
  return live<Photo & Record_>(materialise(file.changes).state, 'photo')
    .map((p) => p.id)
    .filter((id) => !have.has(id));
}

/** Parse a backup from bytes: a zip, or the older JSON. Throws a readable error for anything else. */
export async function readBackup(bytes: Uint8Array): Promise<ReadBackup> {
  // JSON starts with '{' after optional whitespace; a zip starts with PK.
  const head = strFromU8(bytes.subarray(0, 64)).trimStart();
  if (head.startsWith('{')) {
    const json = JSON.parse(strFromU8(bytes));
    const r = v.safeParse(LegacyChanges, json);
    if (!r.success) throw new Error('That JSON is not a Cultifolio backup.');
    return { manifest: null, changes: checkRows(r.output.changes), photoIds: [], readPhoto: () => null };
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('That file is neither a Cultifolio backup zip nor a JSON export.');
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(bytes, (err, out) => (err ? reject(err) : resolve(out))));
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
  return {
    manifest: m.output,
    changes: checkRows(rows.output),
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
  let added = 0, changed = 0;
  for (const [k, r] of after) {
    const b = before.get(k);
    if (!b) added++;
    else if (b._t !== r._t) changed++;
  }
  return { fresh, added, changed, unchanged: after.size - added - changed };
}

const csvCell = (x: unknown) => {
  if (x == null) return '';
  const s = String(x);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** The plants as a flat sheet: one row each, the fields a person would want in a spreadsheet. */
export function plantsCsv(accs: Array<Accession & Record_>, state: Map<string, Record_>): string {
  const loc = (id: string | null | undefined, seen = new Set<string>()): string => {
    if (!id || seen.has(id)) return ''; // a cycle in a damaged log ends here rather than never
    seen.add(id);
    const r = state.get(`location:${id}`);
    if (!r || r._deleted) return '';
    const parent = loc(r.parentId as string | null, seen);
    return parent ? `${parent} › ${r.name}` : String(r.name);
  };
  const head = ['number', 'species', 'cultivar', 'kind', 'parentage', 'name as received', 'field number', 'provenance', 'status', 'location', 'acquired', 'from', 'form', 'price', 'sowing', 'notes'];
  const rows = [...accs]
    .sort((a, b) => accNo(a).localeCompare(accNo(b)))
    .map((a) => [accNo(a), a.taxonName, a.cultivar, kindOf(a), a.parentage, a.nameAsReceived, a.fieldNumber, a.provenance, a.status, a.locationId ? loc(a.locationId) : a.location, a.acquired, a.sourceFrom, a.sourceForm, a.price, a.sowingId ? sowNo((state.get(`sowing:${a.sowingId}`) as unknown as Sowing | undefined) ?? { id: a.sowingId }) : null, a.notes].map(csvCell).join(','));
  return '﻿' + [head.join(','), ...rows].join('\r\n') + '\r\n';
}
