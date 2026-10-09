/** Browser wiring for backups: the vault in, a download out, and a file back in. */
import { inDemo } from '$lib/db/demo';
import { collection } from '$lib/db/collection.svelte';
import { getPhotoBlobs, putPhotoBlobs, deletePhotoBlobs, photoBlobIds, getMeta, openStaging } from '$lib/db/vault';
import { accNo, sowNo } from '$lib/db/types';
import { sync } from '$lib/sync/engine.svelte';
import { buildBackup, readBackup, previewMerge, summarise, photosWithoutPixels, type ReadBackup } from './backup';
import { replaceThroughStaging } from './replace';
import { backupName } from './format';
import { readDeviceSettings, applyDeviceSettings, previewDeviceSettings } from './device';

export interface PreparedBackup {
  name: string;
  blob: Blob;
  bytes: number;
  /** Photo records on this device whose pixels it does not hold; they are in the file as records only, and the manifest names them. */
  photosMissing: string[];
}

/**
 * The app a backup names (`manifest.app`). Every build before round sixty-two wrote "cultifolio 3", and listed as parked
 * what it held parked in memory too, a park judged by its clock alone; since then a file lists the stored verdicts only,
 * and says so by this name (round sixty-two, second pass; the data review's suspected items, B7 through an old file).
 */
const APP = 'cultifolio 3 (stored parks)';
/**
 * The parks a file's restore stores: its list, unless an older build wrote it (a version-1 manifest naming no app, or
 * the old name). Then the list may hold parks of that device's clock alone, which restored here would be kept for good,
 * so it is not read, and its changes are judged here as any change arriving now is (round sixty-two, second pass).
 */
export function fileParks(m: { v: number; app?: string; parked?: string[] }): string[] {
  return m.v === 1 && (m.app === undefined || m.app === 'cultifolio 3') ? [] : (m.parked ?? []);
}

/** Build the backup file without downloading it, so the page can say what is not in it first. */
export async function prepareBackup(onProgress?: (done: number, total: number) => void): Promise<PreparedBackup> {
  const changes = await collection.exportChanges();
  const built = await buildBackup({
    changes,
    device: await getMeta<string>('device'),
    app: APP,
    settings: readDeviceSettings(),
    // The stored parks only: a park judged by this device's clock alone is a reading of this load, and a restore of the file
    // would store it for good, here or on a new phone (round sixty-two; rule 5, B7, A16, the clock review's 2).
    parked: collection.storedParks,
    onProgress,
    readPhoto: async (id) => {
      const b = await getPhotoBlobs(id);
      if (!b) return null;
      return { id, full: new Uint8Array(await b.blob.arrayBuffer()), thumb: new Uint8Array(await b.thumb.arrayBuffer()) };
    }
  });
  return { name: backupName(), blob: new Blob(built.parts as BlobPart[], { type: 'application/zip' }), bytes: built.size, photosMissing: built.photosMissing };
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
  /** Device settings in the file that this device lacks and a restore would apply ('site', 'units', 'label settings', 'preferences'). */
  settings: string[];
  /** Plants and batches here that the file does not hold, by number: what Replace loses (round fifty-one, 4). */
  onlyHere: string[];
  /** Records the file holds that have changes here it lacks: what Replace also loses (round fifty-two, 4). */
  changedHere: number;
}

/** Read and size up a backup without changing anything. */
export async function openBackup(f: File): Promise<Opened> {
  const file = await readBackup(new Uint8Array(await f.arrayBuffer()));
  const counts = summarise(file.changes);
  const current = await collection.exportChanges();
  const merge = previewMerge(current, file.changes);
  const have = new Set(await photoBlobIds());
  const newPhotos = file.photoIds.filter((id) => !have.has(id)).length;
  const missingPixels = photosWithoutPixels(file).filter((id) => !have.has(id));
  const inFile = new Set(file.changes.map((c) => `${c.kind}:${c.id}`));
  const onlyHere = [...collection.accessions.filter((a) => !inFile.has(`accession:${a.id}`)).map(accNo), ...collection.sowings.filter((s) => !inFile.has(`sowing:${s.id}`)).map(sowNo)];
  // And the records the file does hold that were edited here since: a note written after the merge is gone with a replace too (round fifty-two, 4).
  const stamps = new Set(file.changes.map((c) => c.t));
  const changedHere = new Set<string>();
  for (const c of current) if (!stamps.has(c.t) && inFile.has(`${c.kind}:${c.id}`)) changedHere.add(`${c.kind}:${c.id}`);
  return { file, counts, merge, newPhotos, missingPixels, settings: previewDeviceSettings(file.settings), onlyHere, changedHere: changedHere.size };
}

export interface RestoreReport {
  changes: number;
  photos: number;
  /** Photo records restored without pixels, because neither the file nor this device holds them. Said once, here; the record is kept. */
  photosMissing: number;
  /** Device settings taken from the file because this device had none: 'site', 'units', 'label settings', 'preferences'. */
  settingsRestored: string[];
}


/**
 * Merge: add what the file has that this device lacks; nothing here is lost.
 * The numbering scheme is a setting record in the log, so it merges like any other.
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
  // Refused in code, not only hidden by the page (round sixty-one; review B): restored into the sample, a backup would be
  // deleted with it on leaving, and a replace would stage it beside the grower's own.
  if (inDemo()) throw new Error(SAMPLE_REFUSAL);
  if (mode === 'replace') return replaceFromBackup(o, onProgress);
  const changes = o.merge.fresh;
  const have = new Set(await photoBlobIds());
  const ids = o.file.photoIds.filter((id) => !have.has(id));
  let photos = 0;
  // The pixels go in before the records that name them, so a reload between the two never shows a record with no
  // photograph. If the device fills up part way, the pixels written so far are taken out again: without their records
  // they would be bytes nothing can reach or remove (round twenty-nine, 4).
  const written: string[] = [];
  try {
    for (let i = 0; i < ids.length; i++) {
      const p = o.file.readPhoto(ids[i]);
      if (!p) continue;
      await putPhotoBlobs({ id: p.id, blob: new Blob([p.full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([p.thumb as BlobPart], { type: 'image/jpeg' }) });
      written.push(p.id);
      photos++;
      onProgress?.(i + 1, ids.length);
    }
    // What the exporting device had parked is parked here too, before it can be folded (round fifty-eight), when the file
    // lists stored verdicts only (`fileParks`).
    const parked = new Set(fileParks(o.file.manifest));
    const toPark = changes.filter((c) => parked.has(c.t));
    if (toPark.length) await collection.markParked(toPark);
    await collection.ingest(changes);
  } catch (e) {
    // Only the pixels whose records did not land: the ingest is not one write (the changes, then the import-day stamps),
    // so a failure after the records are stored must leave their pixels in place (round thirty, R2-2).
    for (const id of written) if (!collection.photoKnown(id)) await deletePhotoBlobs(id).catch(() => {});
    throw e;
  }
  // The same after a merge that landed: an older backup carries the pixels of a photograph removed on this device since,
  // and the fold keeps it removed, so those pixels would be bytes nothing names (round thirty-three, small). Removed,
  // not merely waiting: a photograph a set-aside batch has yet to complete keeps its pixels for the day it does
  // (round thirty-five, R1-3).
  for (const id of written) if (collection.photoRemoved(id)) { await deletePhotoBlobs(id).catch(() => {}); photos--; }
  return { changes: changes.length, photos, photosMissing: o.missingPixels.length, settingsRestored: applyDeviceSettings(o.file.settings) };
}

/** What a restore started in the sample collection is told. */
const SAMPLE_REFUSAL = 'Restoring a backup is off in the sample collection: it would go into the sample and be deleted with it. Leave the sample to restore into your own collection';

/** The replace path: stage, verify, turn sync off, switch (see replace.ts and vault.ts). */
async function replaceFromBackup(o: Opened, onProgress?: (done: number, total: number) => void): Promise<RestoreReport> {
  // A file of an older build is staged with no parks (`fileParks`): replace.ts stages the manifest's list as it is.
  const parks = fileParks(o.file.manifest);
  const file = parks === o.file.manifest.parked ? o.file : { ...o.file, manifest: { ...o.file.manifest, parked: parks } };
  const r = await replaceThroughStaging(file, openStaging, { onProgress, beforeSwitch: async () => { if (sync.configured) await sync.forget('replaced'); else await sync.markReplaced(); } });
  return { ...r, settingsRestored: applyDeviceSettings(o.file.settings) };
}
