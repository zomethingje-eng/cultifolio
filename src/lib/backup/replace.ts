/**
 * "Replace this device with the file", as an order of operations over a
 * staged replacement (see `openStaging` in vault.ts): everything is written
 * to the staging store and counted before the live vault is touched. Pure
 * over the store it is given, so the order can be tested without IndexedDB.
 */
import type { Change } from '$core/log';
import type { StagedReplacement, PhotoBlobs } from '$lib/db/vault';
import { photosWithoutPixels, type ReadBackup } from './backup';

export interface ReplaceOpts {
  /** Runs after the replacement is fully staged and just before the live vault is wiped (turning sync off, say). */
  beforeSwitch?: () => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

/** The file's changes: the replacement is exactly the file's log. */
export function replacementChanges(file: ReadBackup): Change[] {
  return [...file.changes];
}

export interface ReplaceResult {
  changes: number;
  photos: number;
  /** Photo records in the file with no pixels in the file: restored as records without a photograph. */
  photosMissing: number;
}

/**
 * Stage, verify, switch. A failure before the switch discards the staging
 * store and throws; the live vault is as it was. A failure during the switch
 * is not discarded: the staging store is then the only copy, and the vault
 * finishes the copy the next time it opens.
 */
export async function replaceThroughStaging(file: ReadBackup, open: () => Promise<StagedReplacement>, opts: ReplaceOpts = {}): Promise<ReplaceResult> {
  // A change this build cannot read is left out of a merge and stays in the file; a replacement is the file and nothing
  // else, so the same change would be gone from the device for good, and a backup from a newer build is the file most
  // likely to hold one (round forty-nine, 1; round thirty-five, R1). Refused, with the first such change named.
  if (file.unreadable.length) throw new Error(`${file.unreadable.length} ${file.unreadable.length === 1 ? 'change' : 'changes'} in that file cannot be read by this version (${file.unreadable[0]}), and a replacement would lose ${file.unreadable.length === 1 ? 'it' : 'them'} for good. Merge instead, which leaves ${file.unreadable.length === 1 ? 'it' : 'them'} in the file, or replace from a newer version of the app; this device is unchanged.`);
  const changes = replacementChanges(file);
  const stage = await open();
  let switching = false;
  try {
    let photos = 0;
    const ids = file.photoIds;
    for (let i = 0; i < ids.length; i++) {
      const p = file.readPhoto(ids[i]);
      if (!p) continue;
      const blobs: PhotoBlobs = { id: p.id, blob: new Blob([p.full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([p.thumb as BlobPart], { type: 'image/jpeg' }) };
      await stage.putPhoto(blobs);
      photos++;
      opts.onProgress?.(i + 1, ids.length);
    }
    await stage.appendChanges(changes);
    // The device becomes the file, its parked changes with it (round fifty-eight).
    await stage.setParked(file.manifest.parked ?? []);
    const n = await stage.counts();
    if (n.changes !== changes.length || n.photos !== photos) throw new Error(`The replacement did not all reach storage (${n.changes} of ${changes.length} changes, ${n.photos} of ${photos} photographs); this device is unchanged.`);
    await opts.beforeSwitch?.();
    switching = true;
    await stage.promote();
    return { changes: changes.length, photos, photosMissing: photosWithoutPixels(file).length };
  } catch (e) {
    if (!switching) await stage.discard().catch(() => {});
    throw e;
  }
}
