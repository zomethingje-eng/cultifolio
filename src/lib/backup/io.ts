/** Browser wiring for backups: the vault in, a download out, and a file back in. */
import { collection } from '$lib/db/collection.svelte';
import { getPhotoBlobs, putPhotoBlobs, photoBlobIds, getMeta, wipeVault, appendChanges } from '$lib/db/vault';
import { buildBackup, readBackup, previewMerge, summarise, type ReadBackup } from './backup';
import { backupName } from './format';

export async function exportBackup(onProgress?: (done: number, total: number) => void): Promise<{ name: string; bytes: number }> {
  const changes = await collection.exportChanges();
  const bytes = await buildBackup({
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
  const name = backupName();
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return { name, bytes: bytes.length };
}

export interface Opened {
  file: ReadBackup;
  counts: ReturnType<typeof summarise>;
  merge: ReturnType<typeof previewMerge>;
  /** Photos in the file whose pixels this device does not have. */
  newPhotos: number;
}

/** Read and size up a backup without changing anything. */
export async function openBackup(f: File): Promise<Opened> {
  const file = await readBackup(new Uint8Array(await f.arrayBuffer()));
  const counts = summarise(file.changes);
  const merge = previewMerge(await collection.exportChanges(), file.changes);
  const have = new Set(await photoBlobIds());
  const newPhotos = file.photoIds.filter((id) => !have.has(id)).length;
  return { file, counts, merge, newPhotos };
}

/**
 * Merge: add what the file has that this device lacks; nothing here is lost.
 * Replace: wipe this device first, so it ends up exactly the file. The page
 * reloads afterwards because the in-memory collection was folded from the old log.
 */
export async function restoreBackup(o: Opened, mode: 'merge' | 'replace', onProgress?: (done: number, total: number) => void): Promise<{ changes: number; photos: number }> {
  if (mode === 'replace') await wipeVault();
  const changes = mode === 'replace' ? o.file.changes : o.merge.fresh;
  const have = mode === 'replace' ? new Set<string>() : new Set(await photoBlobIds());
  let photos = 0;
  const ids = o.file.photoIds.filter((id) => !have.has(id));
  for (let i = 0; i < ids.length; i++) {
    const p = o.file.readPhoto(ids[i]);
    if (!p) continue;
    await putPhotoBlobs({ id: p.id, blob: new Blob([p.full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([p.thumb as BlobPart], { type: 'image/jpeg' }) });
    photos++;
    onProgress?.(i + 1, ids.length);
  }
  if (mode === 'replace') {
    await appendChanges(changes);
    if (o.file.manifest?.scheme) await collection.setScheme(o.file.manifest.scheme as typeof collection.scheme);
  } else {
    await collection.ingest(changes);
  }
  return { changes: changes.length, photos };
}
