/**
 * Build and read backup zips. Pure over its inputs (a change log, a photo
 * reader, a photo writer) so the same code is unit-tested in Node and run in
 * the browser; the vault wiring is in ./io.ts.
 */
import { zip, unzip, strToU8, strFromU8, type Zippable } from 'fflate';
import * as v from 'valibot';
import { materialise, live, type Change, type Record_ } from '$core/log';
import { kindOf, accNo, sowNo, type Accession, type Photo, type Sowing } from '$lib/db/types';
import { BACKUP_FORMAT, BACKUP_V, Manifest, ChangeRow, LegacyChanges, photoPath, thumbPath } from './format';

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
  /** Called once per live photo record; return null when the pixels are missing (the record still travels). */
  readPhoto: (id: string) => Promise<PhotoBytes | null>;
  onProgress?: (done: number, total: number) => void;
}

/** Counts from a change log, for the manifest and for the import preview. */
export function summarise(changes: Change[]) {
  const { state } = materialise(changes);
  const n = (kind: Record_['kind']) => live(state, kind).length;
  return { changes: changes.length, accessions: n('accession'), events: n('event'), locations: n('location'), sowings: n('sowing'), taxa: n('taxon'), photos: n('photo'), state };
}

export async function buildBackup(o: BuildOpts): Promise<Uint8Array> {
  const s = summarise(o.changes);
  const photos = live<Photo & Record_>(s.state, 'photo');
  const files: Zippable = {};
  let photoBytes = 0;
  let done = 0;
  for (const p of photos) {
    const b = await o.readPhoto(p.id);
    if (b) {
      // JPEGs do not compress; store them as-is so the zip is fast to write and read.
      files[photoPath(p.id)] = [b.full, { level: 0 }];
      files[thumbPath(p.id)] = [b.thumb, { level: 0 }];
      photoBytes += b.full.length + b.thumb.length;
    }
    o.onProgress?.(++done, photos.length);
  }
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    v: BACKUP_V,
    app: o.app,
    exported: new Date().toISOString(),
    device: o.device,
    counts: { changes: s.changes, accessions: s.accessions, events: s.events, locations: s.locations, sowings: s.sowings, taxa: s.taxa, photos: s.photos, photoBytes },
    scheme: o.scheme
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
  files['changes.json'] = strToU8(JSON.stringify(o.changes));
  files['plants.csv'] = strToU8(plantsCsv(live<Accession & Record_>(s.state, 'accession'), s.state));
  return new Promise((resolve, reject) => zip(files, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))));
}

export interface ReadBackup {
  manifest: Manifest | null; // null for the legacy changes-only JSON
  changes: Change[];
  /** Photo ids whose pixels are in the file. */
  photoIds: string[];
  readPhoto: (id: string) => PhotoBytes | null;
}

/** Parse a backup from bytes: a zip, or the older JSON. Throws a readable error for anything else. */
export async function readBackup(bytes: Uint8Array): Promise<ReadBackup> {
  // JSON starts with '{' after optional whitespace; a zip starts with PK.
  const head = strFromU8(bytes.subarray(0, 64)).trimStart();
  if (head.startsWith('{')) {
    const json = JSON.parse(strFromU8(bytes));
    const r = v.safeParse(LegacyChanges, json);
    if (!r.success) throw new Error('That JSON is not a Cultifolio backup.');
    return { manifest: null, changes: r.output.changes as Change[], photoIds: [], readPhoto: () => null };
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
  return {
    manifest: m.output,
    changes: rows.output as Change[],
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
