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
  /** HLCs of changes the server has not acknowledged: every local edit, import and restore lands here; a pull does not. */
  outbox: { key: string; value: { t: string } };
}

const DB_NAME = 'cultifolio';
const DB_V = 2;

let dbp: Promise<IDBPDatabase<VaultDB>> | null = null;

/** What the person should be told about the vault itself (another tab holding an old version open); null when there is nothing to say. */
export const vaultNotice: { text: string | null } = { text: null };
const listeners = new Set<(text: string | null) => void>();
export function onVaultNotice(fn: (text: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(text: string | null) {
  vaultNotice.text = text;
  for (const fn of listeners) fn(text);
}

export function openVault(): Promise<IDBPDatabase<VaultDB>> {
  if (!dbp)
    dbp = openDB<VaultDB>(DB_NAME, DB_V, {
      upgrade(db, oldV) {
        if (oldV < 1) {
          const ch = db.createObjectStore('changes', { keyPath: 't' });
          ch.createIndex('byRecord', ['kind', 'id']);
          db.createObjectStore('meta');
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (oldV < 2) db.createObjectStore('outbox', { keyPath: 't' });
      },
      // This tab is newer than one still open: say so, rather than wait in silence for it to close.
      blocked() {
        notify('Another tab has an older Cultifolio open. Close it, or reload it, to carry on here.');
      },
      // This tab is the old one: let go of the vault so the new tab can upgrade it, then reload into the new code.
      blocking(_cur, _next, ev) {
        (ev.target as IDBDatabase | null)?.close();
        dbp = null;
        notify('Cultifolio has been updated in another tab. Reloading…');
        if (typeof location !== 'undefined') setTimeout(() => location.reload(), 800);
      },
      terminated() {
        dbp = null;
        notify('The browser closed the vault; reload the page.');
      }
    });
  return dbp;
}

export async function allChanges(): Promise<Change[]> {
  const db = await openVault();
  return db.getAll('changes');
}

/** Append changes; unless they came from the server (`fromServer`), they also go in the outbox to be pushed. One transaction, so the two stores cannot disagree. */
export async function appendChanges(changes: Change[], fromServer = false): Promise<void> {
  if (!changes.length) return;
  const db = await openVault();
  const tx = db.transaction(['changes', 'outbox'], 'readwrite');
  const ch = tx.objectStore('changes'), ob = tx.objectStore('outbox');
  await Promise.all([...changes.map((c) => ch.put(c)), ...(fromServer ? [] : changes.map((c) => ob.put({ t: c.t }))), tx.done]);
}

/** HLCs waiting to be pushed, in order. */
export async function outboxKeys(): Promise<string[]> {
  const db = await openVault();
  return db.getAllKeys('outbox');
}
export async function outboxAck(ts: string[]): Promise<void> {
  if (!ts.length) return;
  const db = await openVault();
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all([...ts.map((t) => tx.store.delete(t)), tx.done]);
}
/** Put every change on this device in the outbox: the first push after sync is set up sends the whole collection. */
export async function outboxFill(): Promise<number> {
  const db = await openVault();
  const ts = await db.getAllKeys('changes');
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all([...ts.map((t) => tx.store.put({ t })), tx.done]);
  return ts.length;
}
export async function outboxClear(): Promise<void> {
  const db = await openVault();
  await db.clear('outbox');
}
export async function changesByKeys(ts: string[]): Promise<Change[]> {
  const db = await openVault();
  const tx = db.transaction('changes');
  const out = await Promise.all(ts.map((t) => tx.store.get(t)));
  return out.filter((c): c is Change => !!c);
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
  await Promise.all([db.clear('changes'), db.clear('photos'), db.clear('outbox')]);
}
