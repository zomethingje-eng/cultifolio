/**
 * "Replace this device with the file", as an order of operations over a
 * staged replacement (see `openStaging` in vault.ts): everything is written
 * to the staging store and counted before the live vault is touched. Pure
 * over the store it is given, so the order can be tested without IndexedDB.
 */
import type { Change } from '$core/log';
import { hlcCompare } from '$core/hlc';
import type { StagedReplacement, PhotoBlobs } from '$lib/db/vault';
import { NUMBERING_SETTING } from '$lib/db/types';
import { photosWithoutPixels, type ReadBackup } from './backup';

export interface ReplaceOpts {
  /** Runs after the replacement is fully staged and just before the live vault is wiped (turning sync off, say). */
  beforeSwitch?: () => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

const isScheme = (s: unknown): boolean => !!s && typeof s === 'object' && ((s as { mode?: unknown }).mode === 'year' || (s as { mode?: unknown }).mode === 'prefix') && typeof (s as { width?: unknown }).width === 'number';

/** The file's changes, plus the setting record for a manifest-only numbering scheme (a file from before the scheme was synced), stamped after everything in the file. */
export function replacementChanges(file: ReadBackup): Change[] {
  const changes = [...file.changes];
  const fileScheme = file.manifest?.scheme;
  // The default scheme needs no record: a device with no setting record is on the default already, and a file that is
  // exactly its collection should restore to exactly its log.
  const isDefault = isScheme(fileScheme) && (fileScheme as { mode: string; width: number }).mode === 'year' && (fileScheme as { width: number }).width === 4;
  if (isScheme(fileScheme) && !isDefault && !changes.some((c) => c.kind === 'setting' && c.id === NUMBERING_SETTING)) {
    const last = changes.reduce((m, c) => (hlcCompare(c.t, m) > 0 ? c.t : m), '0000000000000-0000-a');
    changes.push({ t: `${last.slice(0, 13)}-ffff-zzscheme`, kind: 'setting', id: NUMBERING_SETTING, field: 'scheme', value: fileScheme });
  }
  return changes;
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
