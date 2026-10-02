/**
 * The local vault: an IndexedDB change log plus a little metadata. Nothing in
 * here knows about the network; sync (a later milestone) appends remote
 * changes through the same door local edits use.
 */
import { openDB, deleteDB, type IDBPDatabase, type DBSchema, type IDBPTransaction } from 'idb';
import { mendChange, type Change } from '$core/log';

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
/** Where a replacement (restore from backup, "replace" mode) is written in full before the live vault is touched. */
const STAGING_NAME = 'cultifolio-staging';
const DB_V = 2;
/** Set in the live vault's meta from the moment the live log is wiped until the staged replacement has been copied in; on open, a set flag resumes the copy. */
const STAGING_PENDING = 'staging-pending';

let dbp: Promise<IDBPDatabase<VaultDB>> | null = null;

/* ---- in-flight writes ----
 * When another tab upgrades the vault this tab must let go and reload, but
 * not in the middle of a write: a photo's pixels landing without its record,
 * or a batch of changes without its outbox entries, would be a vault no one
 * wrote. Every write below passes through `writing()`, which counts it; the
 * reload waits for the count to reach zero, or five seconds, whichever comes
 * first. `holdVault()` is the same door for a compound operation made of
 * several writes (a photograph's blobs and then its record), so the gap
 * between them is covered too.
 */
let inFlight = 0;
const onIdle = new Set<() => void>();
export function holdVault<T>(work: () => Promise<T>): Promise<T> {
  inFlight++;
  return (async () => work())().finally(() => {
    if (--inFlight === 0) for (const fn of [...onIdle]) fn();
  });
}
const writing = holdVault;
/** How many writes (or held compound operations) are in flight; for tests. */
export const vaultWritesInFlight = (): number => inFlight;
/** Resolves once no write is in flight, or after `maxMs`, whichever comes first. */
export function whenVaultIdle(maxMs: number): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onIdle.delete(finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, maxMs);
    onIdle.add(finish);
  });
}
/** Reload once in-flight writes are done (or after `RELOAD_MAX_MS`), and not before the notice has had a moment on screen. */
export const RELOAD_MAX_MS = 5000;
const RELOAD_GRACE_MS = 800;

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

function upgrade(db: IDBPDatabase<VaultDB>, oldV: number) {
  if (oldV < 1) {
    const ch = db.createObjectStore('changes', { keyPath: 't' });
    ch.createIndex('byRecord', ['kind', 'id']);
    db.createObjectStore('meta');
    db.createObjectStore('photos', { keyPath: 'id' });
  }
  if (oldV < 2) db.createObjectStore('outbox', { keyPath: 't' });
}

export function openVault(): Promise<IDBPDatabase<VaultDB>> {
  if (!dbp)
    dbp = openDB<VaultDB>(DB_NAME, DB_V, {
      upgrade,
      // This tab is newer than one still open: say so, rather than wait in silence for it to close.
      blocked() {
        notify('Another tab has an older Cultifolio open. Close it, or reload it, to carry on here.');
      },
      // This tab is the old one: let go of the vault so the new tab can upgrade it, then reload into the new code, once
      // the writes in flight have landed (close() lets open transactions finish) or five seconds have passed.
      blocking(_cur, _next, ev) {
        (ev.target as IDBDatabase | null)?.close();
        dbp = null;
        notify('Cultifolio has been updated in another tab. Reloading…');
        if (typeof location !== 'undefined') {
          const grace = new Promise<void>((r) => setTimeout(r, RELOAD_GRACE_MS));
          Promise.all([whenVaultIdle(RELOAD_MAX_MS), grace]).then(() => location.reload());
        }
      },
      terminated() {
        dbp = null;
        notify('The browser closed the vault; reload the page.');
      }
    }).then(async (db) => {
      // A replace that was cut off between the wipe and the copy: finish it before anything reads the vault.
      if (await db.get('meta', STAGING_PENDING)) await writing(() => replaceFromStaging(db));
      return db;
    });
  return dbp;
}

/* ---- staged replacement ----
 * "Replace this device with the file" must never leave the device with
 * neither collection. The replacement is written in full to a second
 * database first; only when every change and photograph is there is the
 * live vault wiped and the staged copy moved in. A failure before the wipe
 * (a full phone, most likely) discards the staging database and leaves the
 * live one untouched. IndexedDB cannot rename a database, so the switch is a
 * copy: the residual window is a failure between the wipe and the end of the
 * copy. That window is covered by a flag in the live vault's meta, set before
 * the wipe and cleared after the copy, which `openVault()` reads: a set flag
 * re-runs the copy (every write is a keyed put, so re-running is safe) before
 * anything else opens the vault.
 */

export interface StagedReplacement {
  putPhoto(p: PhotoBlobs): Promise<void>;
  appendChanges(changes: Change[]): Promise<void>;
  /** How many changes and photographs the staging database holds, to check against what was meant to go in. */
  counts(): Promise<{ changes: number; photos: number }>;
  /** Throw the staged replacement away; the live vault is untouched. */
  discard(): Promise<void>;
  /** Switch: wipe the live vault, copy the staged replacement in, delete the staging database. */
  promote(): Promise<void>;
}

function openStagingDb(): Promise<IDBPDatabase<VaultDB>> {
  return openDB<VaultDB>(STAGING_NAME, DB_V, { upgrade });
}

/** A fresh, empty staging database (any leftover from an earlier attempt is deleted first). */
export async function openStaging(): Promise<StagedReplacement> {
  await deleteDB(STAGING_NAME);
  let db: IDBPDatabase<VaultDB> | null = await openStagingDb();
  const need = () => {
    if (!db) throw new Error('The staged replacement was already discarded.');
    return db;
  };
  return {
    async putPhoto(p) {
      await writing(() => need().put('photos', p));
    },
    async appendChanges(changes) {
      if (!changes.length) return;
      await writing(async () => {
        const tx = need().transaction('changes', 'readwrite');
        await Promise.all([...changes.map((c) => tx.store.put(c)), tx.done]);
      });
    },
    async counts() {
      const d = need();
      const [changes, photos] = await Promise.all([d.count('changes'), d.count('photos')]);
      return { changes, photos };
    },
    async discard() {
      db?.close();
      db = null;
      await deleteDB(STAGING_NAME);
    },
    async promote() {
      need().close();
      db = null;
      await writing(async () => {
        const live = await openVault();
        await live.put('meta', true, STAGING_PENDING);
        await replaceFromStaging(live);
      });
      announce('replaced'); // every other tab folds the old log; they reload onto this one (round fifteen, 2)
    }
  };
}

/**
 * The flag means "the staged file is the collection now, whatever the live
 * stores hold": every run of this, the first or a recovery after the browser
 * stopped part-way, clears the live log before copying, so a stop between the
 * flag and the clear cannot leave the old collection merged under the new.
 * The ledger of issued numbers in `meta` is kept on purpose: a number given
 * after the backup was taken stays given.
 */
async function replaceFromStaging(live: IDBPDatabase<VaultDB>): Promise<void> {
  await Promise.all([live.clear('changes'), live.clear('photos'), live.clear('outbox')]);
  await copyStagingIn(live);
}

/** Copy every change (into the log and the outbox: the server has not seen a restored log) and every photograph from the staging database into the live one, clear the flag, delete the staging database. Re-runnable. */
async function copyStagingIn(live: IDBPDatabase<VaultDB>): Promise<void> {
  const stage = await openStagingDb();
  try {
    const changes = await stage.getAll('changes');
    if (changes.length) {
      // Through storeIn, so the numbers a restored collection carries go on the ledger like any other write (round twelve, 6).
      await storeIn(live.transaction(['changes', 'outbox', 'meta'], 'readwrite'), changes, false);
    }
    // Photographs one at a time: a transaction holding every blob of a large collection would be one large allocation.
    for (const id of await stage.getAllKeys('photos')) {
      const p = await stage.get('photos', id);
      if (p) await live.put('photos', p);
    }
    await live.delete('meta', STAGING_PENDING);
  } finally {
    stage.close();
  }
  await deleteDB(STAGING_NAME);
}

/**
 * A storage failure in words. Chrome's QuotaExceededError carries an empty message, so a page that showed
 * `err.message` said nothing at all when the device was full (round twenty-nine, 4). The figure is what the browser
 * reports as in use, when it reports one.
 */
export async function storageErrorText(err: unknown): Promise<string | null> {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!/quota|QuotaExceeded|NS_ERROR_DOM_QUOTA|out of space|disk is full/i.test(name + ' ' + msg)) return null;
  let used = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) used = `: ${Math.round(est.usage / 1048576)} MB in use${est.quota ? ` of the ${Math.round(est.quota / 1048576)} MB the browser allows this site` : ''}`;
  } catch {
    /* no estimate: the sentence stands without a figure */
  }
  return `This device is out of space for the collection${used}. Free some space, or back up and remove what you can spare.`;
}

export async function allChanges(): Promise<Change[]> {
  const db = await openVault();
  // Mended as they are read: a value an older build wrote with the wrong type (a numeric price from a v2 file) is put
  // right for the fold, for a backup and for a push alike, so it stops travelling (round twenty-nine, 2).
  return (await db.getAll('changes')).map(mendChange);
}

/* ---- numbers, issued once ----
 * A plant's number is never reused, and two tabs of the same browser are two
 * writers over one vault: each holds its own picture of the collection, so
 * each would mint the same "next" number for a different plant. The ledger
 * of every number ever written on this device lives in `meta` and is read and
 * extended inside the same read-write transaction that stores the change, and
 * IndexedDB runs such transactions one after another; so the second tab reads
 * the first tab's number before choosing its own. Numbers arriving any other
 * way (an import, a sync pull, a repair) go on the ledger by the same route.
 */
const ISSUED = (kind: NumberKind) => `issued:${kind}`;
export type NumberKind = 'accession' | 'sowing';
const numberField = (c: Change): NumberKind | null => (c.kind === 'accession' && c.field === 'acc' ? 'accession' : c.kind === 'sowing' && c.field === 'no' ? 'sowing' : null);
type Tx = IDBPTransaction<VaultDB, ('changes' | 'outbox' | 'meta')[], 'readwrite'>;

async function issuedIn(tx: Tx, kind: NumberKind): Promise<Set<string>> {
  const v = (await tx.objectStore('meta').get(ISSUED(kind))) as unknown;
  return new Set(Array.isArray(v) ? (v as string[]) : []);
}
/** Store changes and outbox entries, and note every number they carry, inside `tx`. */
/**
 * `strict` (a change made on this device): a stamp already in the store is a bug, not a re-send, and `add` refuses it
 * so the transaction fails loudly instead of one change silently replacing another under the same key (round twelve, 4).
 */
/** What a store did: the changes it kept (all a caller applies), and the stored changes it displaced under the same stamp, which a caller must un-fold (round seventeen, 3). */
export interface Stored {
  kept: Change[];
  replaced: Change[];
}
export class StoppedError extends Error {
  constructor() {
    super('syncing was stopped on this device while this run was under way');
  }
}
async function storeIn(tx: Tx, changes: Change[], fromServer: boolean, extra: Partial<Record<NumberKind, Set<string>>> = {}, strict = false, requireKey?: string): Promise<Stored> {
  const ch = tx.objectStore('changes'), ob = tx.objectStore('outbox'), meta = tx.objectStore('meta');
  // A write for a sync run happens only while the stored sync record still carries that run's key, checked inside this
  // very transaction: another tab's "Stop syncing" or new vault between a check and a write can no longer let a batch of
  // the old vault into the new log (round seventeen, A1).
  if (requireKey !== undefined) {
    const s = (await meta.get('sync')) as { key?: string } | null | undefined;
    if (!s || s.key !== requireKey) {
      tx.abort();
      await tx.done.catch(() => {}); // the abort is the point; its rejection is not an error to surface
      throw new StoppedError();
    }
  }
  // Two changes under one stamp should not exist; when they do (an importer's shared counter before round fifteen, or two
  // devices naming the same v2 event differently before round sixteen), the store keeps one of them, and the same one on
  // every device: not whichever arrived first but the one that ranks higher by content, so devices that met the two in
  // either order converge (round fifteen, 3; round sixteen, 4). Within one batch the same rule applies first, so the last
  // put never silently wins (round seventeen, 3). Only what is kept goes into the outbox, onto the ledger and back to the
  // caller, which applies only that and un-folds what was replaced.
  const byStamp = new Map<string, Change>();
  for (const c of changes) {
    const had = byStamp.get(c.t);
    if (!had || rank(c) > rank(had)) byStamp.set(c.t, c);
  }
  const kept: Change[] = [];
  const replaced: Change[] = [];
  // A large batch (a restore, a merge) read the store once per change to find collisions, in sequence: a hundred thousand
  // reads, ten seconds. The keys in the batch's range come in one read, and only a stamp among them is read in full (round fifty-one, 5).
  let existing: Set<string> | null = null;
  if (!strict && byStamp.size > 64) {
    const ts = [...byStamp.keys()].sort();
    existing = new Set((await ch.getAllKeys(IDBKeyRange.bound(ts[0], ts[ts.length - 1]))) as string[]);
  }
  for (const c of byStamp.values()) {
    const had = strict || (existing && !existing.has(c.t)) ? undefined : await ch.get(c.t);
    if (had && !sameChange(had, c)) {
      if (rank(c) > rank(had)) {
        console.warn(`change ${c.t} is already stored with other content; this one ranks higher and replaces it`);
        replaced.push(had);
        kept.push(c);
      } else console.warn(`change ${c.t} is already stored with other content; the stored one stands`);
      continue;
    }
    kept.push(c);
  }
  const carried: Partial<Record<NumberKind, Set<string>>> = { ...extra };
  for (const c of kept) {
    const k = numberField(c);
    if (k && typeof c.value === 'string') (carried[k] ??= new Set()).add(c.value);
  }
  const puts: Promise<unknown>[] = [...kept.map((c) => (strict ? ch.add(c) : ch.put(c))), ...(fromServer ? [] : kept.map((c) => ob.put({ t: c.t })))];
  for (const k of Object.keys(carried) as NumberKind[]) {
    const set = await issuedIn(tx, k);
    for (const n of carried[k]!) set.add(n);
    puts.push(meta.put([...set], ISSUED(k)));
  }
  await Promise.all([...puts, tx.done]);
  return { kept, replaced };
}
const sameChange = (a: Change, b: Change) => a.kind === b.kind && a.id === b.id && a.field === b.field && JSON.stringify(a.value ?? null) === JSON.stringify(b.value ?? null);
/** A total order on a change's content, for two under one stamp: the same on every device, whatever order they met them in. */
const rank = (c: Change) => `${c.kind}\0${c.id}\0${c.field}\0${JSON.stringify(c.value ?? null)}`;

/** Append changes; unless they came from the server (`fromServer`), they also go in the outbox to be pushed. One transaction, so the two stores cannot disagree. */
export async function appendChanges(changes: Change[], fromServer = false, strict = false, requireKey?: string): Promise<Stored> {
  if (!changes.length) return { kept: [], replaced: [] };
  const out = await writing(async () => {
    const db = await openVault();
    return storeIn(db.transaction(['changes', 'outbox', 'meta'], 'readwrite'), changes, fromServer, {}, strict, requireKey);
  });
  announce(out.replaced.length ? 'refold' : 'written');
  return out;
}

/**
 * Append changes that mint numbers. `build` is called inside the transaction
 * with every number this device has ever written (the ledger, plus whatever
 * the caller knows from memory), chooses numbers outside it, and returns the
 * changes; the numbers it chose are on the ledger before the transaction ends.
 * A `build` that throws (a number the grower typed is already taken) stores
 * nothing.
 */
export async function appendChangesClaiming<T>(kind: NumberKind, known: Set<string>, build: (issued: Set<string>) => { changes: Change[]; result: T }): Promise<T> {
  const out = await writing(async () => {
    const db = await openVault();
    const tx = db.transaction(['changes', 'outbox', 'meta'], 'readwrite');
    let built: { changes: Change[]; result: T };
    try {
      const issued = await issuedIn(tx, kind);
      for (const n of known) issued.add(n);
      built = build(issued);
    } catch (e) {
      tx.abort();
      throw e;
    }
    await storeIn(tx, built.changes, false);
    return built.result;
  });
  announce();
  return out;
}

/* ---- other tabs ----
 * A write here is told to the other tabs of this browser, which fold in what
 * they have not seen; so a plant added in one tab is on the list in the next,
 * and its number is never offered there.
 */
const CHANNEL = 'cultifolio-vault';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
export type VaultNotice = 'written' | 'replaced' | 'refold' | 'sync-forgotten';
function announce(what: VaultNotice = 'written'): void {
  try { chan?.postMessage(what); } catch { /* a closed channel is nothing to report */ }
}
/** Tell the other tabs something they must not sync through: the sync key was forgotten here (round fifteen, 2). */
export const announceSyncForgotten = () => announce('sync-forgotten');
/** Called when another tab wrote to the vault ('written'), replaced the whole collection ('replaced'), or stopped syncing ('sync-forgotten'). */
export function onOtherTabWrite(fn: (what: VaultNotice) => void): () => void {
  if (!chan) return () => {};
  const h = (e: MessageEvent) => fn(typeof e.data === 'string' ? (e.data as VaultNotice) : 'written');
  chan.addEventListener('message', h);
  return () => chan.removeEventListener('message', h);
}

/** HLCs waiting to be pushed, in order. */
export async function outboxKeys(): Promise<string[]> {
  const db = await openVault();
  return db.getAllKeys('outbox');
}
/**
 * Acknowledge pushed changes out of the outbox, but only while the stored sync record still carries `key`, read in the
 * same transaction: a run of a vault this device has since left, or replaced, must not empty the new vault's outbox of the
 * very changes it has yet to send (round seventeen, A1). Without a key the ack is unconditional.
 */
export async function outboxAck(ts: string[], key?: string): Promise<void> {
  if (!ts.length) return;
  await writing(async () => {
    const db = await openVault();
    const tx = db.transaction(['outbox', 'meta'], 'readwrite');
    if (key !== undefined) {
      const s = (await tx.objectStore('meta').get('sync')) as { key?: string } | null | undefined;
      if (!s || s.key !== key) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new StoppedError();
      }
    }
    const ob = tx.objectStore('outbox');
    await Promise.all([...ts.map((t) => ob.delete(t)), tx.done]);
  });
}
/** Put every change on this device in the outbox: the first push after sync is set up sends the whole collection. */
export async function outboxFill(): Promise<number> {
  return writing(async () => {
    const db = await openVault();
    const ts = await db.getAllKeys('changes');
    const tx = db.transaction('outbox', 'readwrite');
    await Promise.all([...ts.map((t) => tx.store.put({ t })), tx.done]);
    return ts.length;
  });
}
export async function outboxClear(): Promise<void> {
  await writing(async () => (await openVault()).clear('outbox'));
}
export async function changesByKeys(ts: string[]): Promise<Change[]> {
  const db = await openVault();
  const tx = db.transaction('changes');
  const out = await Promise.all(ts.map((t) => tx.store.get(t)));
  return out.filter((c): c is Change => !!c).map(mendChange); // mended on the way out too, so an older value stops travelling (round thirty, 5)
}

export async function getMeta<T>(k: string): Promise<T | undefined> {
  const db = await openVault();
  return (await db.get('meta', k)) as T | undefined;
}

export async function setMeta(k: string, v: unknown): Promise<void> {
  await writing(async () => (await openVault()).put('meta', v, k));
}

/**
 * Write a meta record only while the stored one still carries `key`: read and write in one transaction, so a tab whose
 * sync was stopped or replaced by another tab cannot put the old record back between the two (round sixteen, 1). False
 * when the stored record is gone or belongs to another vault; nothing is written then.
 */
export async function setMetaIfKey(k: string, v: unknown, key: string): Promise<boolean> {
  return writing(async () => {
    const tx = (await openVault()).transaction('meta', 'readwrite');
    const had = (await tx.store.get(k)) as { key?: string } | undefined;
    if (!had || had.key !== key) {
      await tx.done;
      return false;
    }
    await Promise.all([tx.store.put(v, k), tx.done]);
    return true;
  });
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
  await writing(async () => (await openVault()).put('photos', p));
}

export async function getPhotoBlobs(id: string): Promise<PhotoBlobs | undefined> {
  const db = await openVault();
  return db.get('photos', id);
}

export async function deletePhotoBlobs(id: string): Promise<void> {
  await writing(async () => (await openVault()).delete('photos', id));
}

export async function photoBlobIds(): Promise<string[]> {
  const db = await openVault();
  return db.getAllKeys('photos');
}

export async function wipeVault(): Promise<void> {
  await writing(async () => {
    const db = await openVault();
    await Promise.all([db.clear('changes'), db.clear('photos'), db.clear('outbox')]);
  });
}
