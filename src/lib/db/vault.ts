/**
 * The local vault: an IndexedDB change log plus a little metadata. Nothing in
 * here knows about the network; sync (a later milestone) appends remote
 * changes through the same door local edits use.
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Change } from '$core/log';

/** The pixels for one photo record; metadata is in the change log. */
export interface PhotoBlobs {
  id: string;
  blob: Blob;
  thumb: Blob;
}

interface VaultDB extends DBSchema {
  changes: { key: string; value: Change; indexes: { byRecord: [string, string] } };
  meta: { key: string; value: unknown };
  photos: { key: string; value: PhotoBlobs };
}

const DB_NAME = 'cultifolio';
const DB_V = 1;

let dbp: Promise<IDBPDatabase<VaultDB>> | null = null;

export function openVault(): Promise<IDBPDatabase<VaultDB>> {
  if (!dbp)
    dbp = openDB<VaultDB>(DB_NAME, DB_V, {
      upgrade(db) {
        const ch = db.createObjectStore('changes', { keyPath: 't' });
        ch.createIndex('byRecord', ['kind', 'id']);
        db.createObjectStore('meta');
        db.createObjectStore('photos', { keyPath: 'id' });
      }
    });
  return dbp;
}

export async function allChanges(): Promise<Change[]> {
  const db = await openVault();
  return db.getAll('changes');
}

export async function appendChanges(changes: Change[]): Promise<void> {
  if (!changes.length) return;
  const db = await openVault();
  const tx = db.transaction('changes', 'readwrite');
  await Promise.all([...changes.map((c) => tx.store.put(c)), tx.done]);
}

export async function getMeta<T>(k: string): Promise<T | undefined> {
  const db = await openVault();
  return (await db.get('meta', k)) as T | undefined;
}

export async function setMeta(k: string, v: unknown): Promise<void> {
  const db = await openVault();
  await db.put('meta', v, k);
}

/** A stable per-device id, minted once. */
export async function deviceId(): Promise<string> {
  let id = await getMeta<string>('device');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
    await setMeta('device', id);
  }
  return id;
}

/** Ask the browser not to evict us. Safari clears unused sites' storage after 7 days unless installed or persisted. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

export async function putPhotoBlobs(p: PhotoBlobs): Promise<void> {
  const db = await openVault();
  await db.put('photos', p);
}

export async function getPhotoBlobs(id: string): Promise<PhotoBlobs | undefined> {
  const db = await openVault();
  return db.get('photos', id);
}

export async function deletePhotoBlobs(id: string): Promise<void> {
  const db = await openVault();
  await db.delete('photos', id);
}

export async function photoBlobIds(): Promise<string[]> {
  const db = await openVault();
  return db.getAllKeys('photos');
}

export async function wipeVault(): Promise<void> {
  const db = await openVault();
  await Promise.all([db.clear('changes'), db.clear('photos')]);
}
