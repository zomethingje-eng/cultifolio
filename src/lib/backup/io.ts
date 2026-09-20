/** Browser wiring for backups: the vault in, a download out, and a file back in. */
import { collection } from '$lib/db/collection.svelte';
import { getPhotoBlobs, putPhotoBlobs, photoBlobIds, getMeta, openStaging } from '$lib/db/vault';
import { NUMBERING_SETTING } from '$lib/db/types';
import { sync } from '$lib/sync/engine.svelte';
import { DEFAULT_SCHEME, type NumberingScheme } from '$core/accession';
import { buildBackup, readBackup, previewMerge, summarise, photosWithoutPixels, type ReadBackup } from './backup';
import { replaceThroughStaging } from './replace';
import { backupName } from './format';

export interface PreparedBackup {
  name: string;
  blob: Blob;
  bytes: number;
  /** Photo records on this device whose pixels it does not hold; they are in the file as records only, and the manifest names them. */
  photosMissing: string[];
}

/** Build the backup file without downloading it, so the page can say what is not in it first. */
export async function prepareBackup(onProgress?: (done: number, total: number) => void): Promise<PreparedBackup> {
  const changes = await collection.exportChanges();
  const built = await buildBackup({
    changes,
    scheme: collection.scheme,
    device: await getMeta<string>('device'),
    app: 'cultifolio 3',
    onProgress,
    readPhoto: async (id) => {
      const b = await getPhotoBlobs(id);
      if (!b) return null;
      return { id, full: new Uint8Array(await b.blob.arrayBuffer()), thumb: new Uint8Array(await b.thumb.arrayBuffer()) };
    }
  });
  return { name: backupName(), blob: new Blob([built.bytes as BlobPart], { type: 'application/zip' }), bytes: built.bytes.length, photosMissing: built.photosMissing };
}

export function downloadBackup(p: PreparedBackup): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(p.blob);
  a.download = p.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export interface Opened {
  file: ReadBackup;
  counts: ReturnType<typeof summarise>;
  merge: ReturnType<typeof previewMerge>;
  /** Photos in the file whose pixels this device does not have. */
  newPhotos: number;
  /** Photo records in the file that have no pixels in the file and none on this device: they restore as records without a photograph. */
  missingPixels: string[];
}

/** Read and size up a backup without changing anything. */
export async function openBackup(f: File): Promise<Opened> {
  const file = await readBackup(new Uint8Array(await f.arrayBuffer()));
  const counts = summarise(file.changes);
  const merge = previewMerge(await collection.exportChanges(), file.changes);
  const have = new Set(await photoBlobIds());
  const newPhotos = file.photoIds.filter((id) => !have.has(id)).length;
  const missingPixels = photosWithoutPixels(file).filter((id) => !have.has(id));
  return { file, counts, merge, newPhotos, missingPixels };
}

export interface RestoreReport {
  changes: number;
  photos: number;
  /** Photo records restored without pixels, because neither the file nor this device holds them. Said once, here; the record is kept. */
  photosMissing: number;
  /** The numbering scheme was taken from the file because this device was on the default. */
  schemeRestored: NumberingScheme | null;
}

const sameScheme = (a: NumberingScheme, b: NumberingScheme) => a.mode === b.mode && a.width === b.width && (a.prefix ?? null) === (b.prefix ?? null);
const isScheme = (s: unknown): s is NumberingScheme => !!s && typeof s === 'object' && ((s as NumberingScheme).mode === 'year' || (s as NumberingScheme).mode === 'prefix') && typeof (s as NumberingScheme).width === 'number';

/**
 * Merge: add what the file has that this device lacks; nothing here is lost.
 * A file from before the scheme was a synced setting carries it in the
 * manifest only; when this device is still on the default scheme, the file's
 * is taken.
 *
 * Replace: the device ends up exactly the file. The replacement is written
 * in full to a staging database first (see vault.ts); only when every change
 * and photograph is there is the live vault wiped and the copy moved in, so a
 * storage failure part-way leaves the device as it was. If sync is on, it is
 * turned off first: a synced vault is a union of every device's log, so
 * "replace" while joined would only merge the vault straight back in. After
 * a replace the device can create a new vault or re-join the old one (which
 * merges). The page reloads afterwards because the in-memory collection was
 * folded from the old log.
 */
export async function restoreBackup(o: Opened, mode: 'merge' | 'replace', onProgress?: (done: number, total: number) => void): Promise<RestoreReport> {
  if (mode === 'replace') return replaceFromBackup(o, onProgress);
  const changes = o.merge.fresh;
  const have = new Set(await photoBlobIds());
  const ids = o.file.photoIds.filter((id) => !have.has(id));
  let photos = 0;
  for (let i = 0; i < ids.length; i++) {
    const p = o.file.readPhoto(ids[i]);
    if (!p) continue;
    await putPhotoBlobs({ id: p.id, blob: new Blob([p.full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([p.thumb as BlobPart], { type: 'image/jpeg' }) });
    photos++;
    onProgress?.(i + 1, ids.length);
  }
  await collection.ingest(changes);
  let schemeRestored: NumberingScheme | null = null;
  const fileScheme = o.file.manifest?.scheme;
  const fileHasSetting = o.file.changes.some((c) => c.kind === 'setting' && c.id === NUMBERING_SETTING);
  if (!fileHasSetting && isScheme(fileScheme) && sameScheme(collection.scheme, DEFAULT_SCHEME) && !sameScheme(fileScheme, DEFAULT_SCHEME)) {
    await collection.setScheme(fileScheme);
    schemeRestored = fileScheme;
  }
  return { changes: changes.length, photos, photosMissing: o.missingPixels.length, schemeRestored };
}

/** The replace path: stage, verify, turn sync off, switch (see replace.ts and vault.ts). */
async function replaceFromBackup(o: Opened, onProgress?: (done: number, total: number) => void): Promise<RestoreReport> {
  const r = await replaceThroughStaging(o.file, openStaging, { onProgress, beforeSwitch: async () => { if (sync.configured) await sync.forget(); } });
  return { ...r, schemeRestored: null };
}
