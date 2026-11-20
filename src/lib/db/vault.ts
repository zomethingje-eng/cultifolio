/**
 * The local vault: an IndexedDB change log plus a little metadata. Nothing in
 * here knows about the network; sync (a later milestone) appends remote
 * changes through the same door local edits use.
 */
import { openDB, deleteDB, type IDBPDatabase, type DBSchema, type IDBPTransaction } from 'idb';
import { changeError, type Change } from '$core/log';
import { sampleClosedHere, PAGE_IN_DEMO, DEMO_DB, exampleClosed, markExampleClosed, CLOSED_WORDS } from './demo';
import { storageErrorText as quotaText } from './storage-error';
import { parseVaultKey } from '$lib/sync/crypto';
import {
  SEAL_META, SEALING_META, SEALED_META, haveKey, whenKey, setKey, forgetKey, newDataKey, keyBytes, readSeal, wrapPass, wrapSyncKey, unwrapPass, unwrapSyncKey,
  isSealedChange, sealChangeSync, openChangeSync, openChanges, sealMetaSync, openMetaSync, sealJson, openJson, sealBytes, openBytes,
  type StoredChange, type SealRecord, type Sealing
} from './seal';

/** The pixels for one photo record; metadata is in the change log. */
export interface PhotoBlobs {
  id: string;
  blob: Blob;
  thumb: Blob;
}
/**
 * The same pixels as bytes, as the photos store keeps them where the browser refuses a Blob in its database: Safari's
 * engine in a Private Browsing window ("Error preparing Blob/File data to be stored in object store"), where a photograph
 * could not be added at all (round sixty-four; the all-engines run, smoke "photos"). Read back as Blobs; the JPEGs are
 * the same bytes either way.
 */
interface PhotoBytes {
  id: string;
  full: ArrayBuffer;
  small: ArrayBuffer;
  fullType: string;
  smallType: string;
}
/** A photograph kept sealed (round ninety-nine): its two parts' bytes sealed, each bound to its id and part. */
interface PhotoSealed {
  id: string;
  sealed: 1;
  full: Uint8Array;
  small: Uint8Array;
  fullType: string;
  smallType: string;
}

interface VaultDB extends DBSchema {
  changes: { key: string; value: StoredChange; indexes: { byRecord: [string, string] } };
  meta: { key: string; value: unknown };
  photos: { key: string; value: PhotoBlobs | PhotoBytes | PhotoSealed };
  /** HLCs of changes the server has not acknowledged: every local edit, import and restore lands here; a pull does not. */
  outbox: { key: string; value: { t: string } };
  /**
   * The order changes reached this vault in: one row per change stored (new, or displacing another under its stamp),
   * numbered by the store. The fold snapshot is taken up to a number and brought up to date from the rows after it,
   * which is the one order that is right: a pull brings stamps older than any already folded (round fifty-three, 1).
   */
  order: { key: number; value: { t: string } };
}

/**
 * The vault's database. A sample collection lives in a database of its own (round sixty; the product review's 3): a
 * visitor can try Today, a plant page and labels on plants that are not theirs, and leaving the sample deletes it
 * whole, with nothing written to the grower's own log and nothing synced. The page's collection is read once per page
 * life (`PAGE_IN_DEMO`), and every scope reads the same reading (round sixty-seven; triage-66 V3).
 */
const DB_NAME = PAGE_IN_DEMO ? DEMO_DB : 'cultifolio'; // demo.ts's one reading of the flag and its one name (round sixty-two, second pass; the self-review's N7)
/** Where a replacement (restore from backup, "replace" mode) is written in full before the live vault is touched. */
const STAGING_NAME = DB_NAME === 'cultifolio' ? 'cultifolio-staging' : `${DB_NAME}-staging`; // the grower's keeps its name, so a replace cut off before this build still finishes (round sixty-one; review B)
/**
 * 4 since round sixty-two, with nothing new in it: opening the vault at a new version makes every tab of an older build
 * let go of it and reload into this one (`blocking`, below; round sixty-one's has it too). A round-sixty-one tab left
 * open beside this build stored parks of its clock alone into the shared set, which this build reads as verdicts kept for
 * good, and folded the log again at each turn (the second pass; the data review's suspected items).
 */
/**
 * 5 since round ninety-nine, with nothing new in its shape: a change may be kept sealed (its value encrypted, `x`), and a
 * tab of an older build, which would read one as a change with no value, lets go and reloads into this one; an older
 * build opened after cannot open the vault at all (docs/REVIEW-ROUND-99.md, D10).
 */
const DB_V = 5;
/** The meta key the fold snapshot is kept under, and the counter that says it is stale. */
const FOLD = 'fold';
const FOLD_GEN = 'foldGen';
/** Set in the live vault's meta from the moment the live log is wiped until the staged replacement has been copied in; on open, a set flag resumes the copy. */
const STAGING_PENDING = 'staging-pending';
/**
 * The last arrival number a replace from a backup wrote (round sixty-two, second pass; the data review's 6, the
 * self-review's N3). A backup carries no order of arrival, and the copy writes its changes' rows in stamp order: rows up
 * to this number say when the file was copied in, not when each change reached this device, so `arrivalsOf` gives them
 * no place, and the restore rule reads their order as not known rather than as two clocks. The snapshot's catch-up
 * (`arrivalsAfter`) still reads them: for it any order of a whole log is a right one.
 */
const ORDER_FROM = 'orderFrom';
/**
 * The stamps of changes this device should send but whose shape this version cannot read (round seventy-one; the
 * self-review's D3): a change a backup carried apart, appended by a Merge or a Replace, or one the log held when sync was
 * set up. Pushed, such a change set aside the batch it rode in on every peer (round sixty-nine), so none goes in the
 * outbox; and appended as from the server (round seventy), or left out of the first push, it was never sent, by this
 * version or by a later one that reads it, and no other device ever had it. Each is put in the outbox at the first load
 * that reads it (`queueReadable`).
 */
const UNSENT = 'unsentUnreadable';

let dbp: Promise<IDBPDatabase<VaultDB>> | null = null;
/** The vault opened, past the seal's gate and a replacement's resume: what every read and write awaits. */
let readyp: Promise<IDBPDatabase<VaultDB>> | null = null;

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
const vaultNotice: { text: string | null } = { text: null };
const listeners = new Set<(text: string | null) => void>();
export function onVaultNotice(fn: (text: string | null) => void): () => void {
  listeners.add(fn);
  if (vaultNotice.text) fn(vaultNotice.text); // said before the page listened (a replacement that could not finish at open; round sixty-seven)
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
  if (oldV < 3) db.createObjectStore('order', { autoIncrement: true });
  // 4, 5: no change of shape (`DB_V`).
}

export function openVault(): Promise<IDBPDatabase<VaultDB>> {
  // An example closed under this page (another tab's Leave, its database deleted) is never opened again by it: the page
  // re-created the database Leave had just deleted, and saved a plant into it that the next load deleted (round
  // sixty-seven; triage-66 V3; IND-1, S-A3). The page says why with these words, and keeps what was typed on screen.
  if (DB_NAME === DEMO_DB && exampleClosed()) return Promise.reject(new Error(CLOSED_WORDS));
  if (!readyp) readyp = openRaw().then(async (db) => {
    // The collection encrypted on this device: nothing reads or writes it until this tab holds the key (round ninety-nine;
    // docs/REVIEW-ROUND-99.md, D5). Every caller waits here, behind the lock screen.
    await sealGate(db);
    await resumeReplace(db);
    return db;
  });
  return readyp;
}

/** The database itself, with no gate: for the lock's own reads of the seal record, and for the gate. */
function openRaw(): Promise<IDBPDatabase<VaultDB>> {
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
        if (DB_NAME === DEMO_DB) markExampleClosed(); // first: nothing reopens it from here on (round sixty-seven; triage-66 V3)
        (ev.target as IDBDatabase | null)?.close();
        dbp = null;
        readyp = null;
        // The sample's database is deleted whole when another tab leaves the sample: say that, not "updated" (round sixty-one; the records review, 13).
        if (DB_NAME !== 'cultifolio') { sampleClosedHere(); return; } // one path with the channel's: the flag and the tab's copies go, and the next page says why (round sixty-two; the triage's 4)
        notify('Cultifolio has been updated in another tab. Reloading…');
        if (typeof location !== 'undefined') {
          const grace = new Promise<void>((r) => setTimeout(r, RELOAD_GRACE_MS));
          Promise.all([whenVaultIdle(RELOAD_MAX_MS), grace]).then(() => location.reload());
        }
      },
      terminated() {
        dbp = null;
        readyp = null;
        notify("The browser closed this page's storage; reload the page.");
      }
    });
  return dbp;
}

async function resumeReplace(db: IDBPDatabase<VaultDB>): Promise<void> {
  // A replace that was cut off between the wipe and the copy: finish it before anything reads the vault. One that
  // cannot finish now (the device is still full) leaves the collection openable, the reason said and writes refused
  // until it does (`storeIn`); it rejected every open, and the collection never opened (round sixty-seven; triage-66
  // R1, the self-review's C1).
  // One tab copies, under the replace lock; a tab that finds the lock held waits, says why, and reads the flag again
  // once it has the lock, since the tab that held it has most likely finished (round eighty-two; the independent
  // review's 1: two tabs copying at once wiped each other's photographs). Every other tab still shows the old
  // collection, and its writes went into the new log as half records, its new plant numbered from the old state
  // (round sixty-nine; triage-68 R4, R46-21): told, they reload onto this one.
  if (await db.get('meta', STAGING_PENDING)) {
    let waited = false;
    try {
      await underReplaceLock(async () => {
        if (!(await db.get('meta', STAGING_PENDING))) return; // finished by the tab that held the lock
        await writing(() => replaceFromStaging(db));
        announce('replaced'); // once finished: a resume that cannot finish says nothing, or two tabs reloaded each other for good
      }, () => { waited = true; notify(REPLACE_ELSEWHERE); });
      if (waited) notify(null);
      replaceWaitingSeen = false;
    } catch (e) { replaceWaitingSeen = true; notify(await pendingText(e)); }
  }
}


/* ---- the collection encrypted on this device (round ninety-nine; docs/REVIEW-ROUND-99.md) ----
 * Whether this vault is sealed is read once, at the first open; this tab's own sealing and unsealing change it, and
 * another tab's tell this one to reload (`announce('sealed')`). `writeSealed`: new records are written sealed, which is
 * so from the moment sealing begins until unsealing begins (D4: a record of either form reads).
 */
let sealedVault = false;
let writeSealed = false;
async function sealGate(db: IDBPDatabase<VaultDB>): Promise<void> {
  if (DB_NAME !== 'cultifolio') return; // the example is never sealed
  const [rec, sealing] = await Promise.all([db.get('meta', SEAL_META), db.get('meta', SEALING_META)]);
  sealedVault = !!readSeal(rec);
  writeSealed = sealedVault && (sealing as Sealing | undefined)?.to !== 'off';
  if (sealedVault && !haveKey()) await whenKey();
}
/** Whether the collection on this device is encrypted, and a sealing or unsealing left part-way; read without the gate. */
export async function sealState(): Promise<{ sealed: boolean; sealing: Sealing | null }> {
  if (DB_NAME !== 'cultifolio') return { sealed: false, sealing: null };
  const db = await openRaw();
  const [rec, sealing] = await Promise.all([db.get('meta', SEAL_META), db.get('meta', SEALING_META)]);
  return { sealed: !!readSeal(rec), sealing: (sealing as Sealing | undefined) ?? null };
}
/** A change as stored: sealed when the vault writes sealed. */
const storedOf = (c: Change): StoredChange => (writeSealed ? sealChangeSync(c) : c);
/** A meta record as stored. */
const metaStored = (k: string, v: unknown): unknown => (writeSealed && SEALED_META.has(k) && v !== undefined && v !== null ? sealMetaSync(k, v) : v);

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
  /** The stamps the replacement holds parked, which replace the device's own (round fifty-eight). */
  setParked(stamps: string[]): Promise<void>;
  /** How many changes and photographs the staging database holds, to check against what was meant to go in. */
  counts(): Promise<{ changes: number; photos: number }>;
  /** Throw the staged replacement away; the live vault is untouched. */
  discard(): Promise<void>;
  /** Switch: wipe the live vault, copy the staged replacement in, delete the staging database. */
  promote(): Promise<void>;
}

function openStagingDb(made?: () => void): Promise<IDBPDatabase<VaultDB>> {
  return openDB<VaultDB>(STAGING_NAME, DB_V, { upgrade(db, oldV) { if (oldV < 1) made?.(); upgrade(db, oldV); } });
}

/**
 * One replacement at a time in this browser, and one copy of it (round eighty-two; the independent review's 1). A Replace
 * holds this Web Lock from the staging to the end of the switch, and a tab that opens the vault while a switch is under
 * way waits for it and reads the flag again inside it: two tabs copying at once wiped the photographs each other had
 * copied, and when one of them was closed part-way those photographs were gone (and two Replaces at once deleted each
 * other's staging database). In this tab the lock is taken once: a call made while this tab holds it runs at once.
 *
 * Without Web Locks (every engine the app supports has them: Chromium 69, Firefox 96, Safari 15.4) the work runs as it
 * is, and the copy is safe to run twice at once all the same: the records are wiped and copied in one transaction, a
 * photograph the file holds is never deleted (only the live ones the file does not hold, before the copy), and a tab that
 * finds the staging database gone stops without touching the live vault (`replaceFromStaging`). Two tabs then copy the same
 * photographs twice; none is lost.
 */
const REPLACE_LOCK = 'cultifolio-replace';
let replaceHeld = 0;
/** What a tab that waits for another tab's switch says meanwhile. */
const REPLACE_ELSEWHERE = 'A replacement from a backup is being copied in another tab of this browser. This page opens when it is done.';
export async function underReplaceLock<T>(work: () => Promise<T>, onWait?: () => void): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks || replaceHeld > 0) return work();
  const held = async (): Promise<T> => {
    replaceHeld++;
    try { return await work(); } finally { replaceHeld--; }
  };
  // Asked first without waiting, so a tab that must wait can say so before it does.
  const NOT_FREE = Symbol('held elsewhere');
  const first = await locks.request(REPLACE_LOCK, { ifAvailable: true }, async (lock) => (lock ? { v: await held() } : NOT_FREE));
  if (first !== NOT_FREE) return (first as { v: T }).v;
  onWait?.();
  return (await locks.request(REPLACE_LOCK, held)) as T;
}

/** A fresh, empty staging database (any leftover from an earlier attempt is deleted first). */
export async function openStaging(): Promise<StagedReplacement> {
  if (DB_NAME !== 'cultifolio') throw new Error('A replacement cannot be staged in the example collection; leave the example first. Nothing was changed.'); // a guard in code, not only the locked page (round sixty-one; review B)
  // The staging copy a switch still needs is never deleted: it is then the collection's only copy, and a second Replace
  // that stopped before its own switch emptied the collection (round sixty-seven; triage-66 R1, the self-review's C1).
  if (await (await openVault()).get('meta', STAGING_PENDING)) throw new ReplacePendingError();
  await deleteDB(STAGING_NAME);
  let db: IDBPDatabase<VaultDB> | null = await openStagingDb();
  const need = () => {
    if (!db) throw new Error('The staged replacement was already discarded.');
    return db;
  };
  return {
    async putPhoto(p) {
      await writing(() => putPhotoIn(need(), p));
    },
    async appendChanges(changes) {
      if (!changes.length) return;
      await writing(async () => {
        const tx = need().transaction('changes', 'readwrite');
        await Promise.all([...changes.map((c) => tx.store.put(storedOf(c))), tx.done]);
      });
    },
    async setParked(stamps) {
      await writing(() => need().put('meta', [...stamps], 'parked'));
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
      // Under the replace lock (`underReplaceLock`): taken here if the caller did not take it for the whole Replace. The
      // other tabs are told as the wipe lands (`replaceFromStaging`), and reload onto this one (round fifteen, 2).
      await underReplaceLock(() => writing(async () => {
        const live = await openVault();
        await live.put('meta', true, STAGING_PENDING);
        await replaceFromStaging(live, true);
      }));
    }
  };
}

/**
 * The flag means "the staged file is the collection now, whatever the live
 * stores hold": every run of this, the first or a recovery after the browser
 * stopped part-way, replaces the live log before copying the photographs, so a
 * stop between the flag and the copy cannot leave the old collection merged
 * under the new. The ledger of issued numbers in `meta` is kept on purpose: a
 * number given after the backup was taken stays given.
 *
 * Re-runnable, and safe to run in two tabs at once (round eighty-two; the independent review's 1), though the replace
 * lock lets only one run (`underReplaceLock`): the live log is wiped and the file's copied in by one transaction, so no
 * run's wipe lands after another run's copy; the photographs the file does not hold are deleted, and the file's are put
 * one by one, so no run deletes a photograph another has copied; and a run that finds the staging database gone (another
 * run finished and deleted it) touches nothing.
 */
async function replaceFromStaging(live: IDBPDatabase<VaultDB>, sayAtWipe = false): Promise<void> {
  let made = false;
  const stage = await openStagingDb(() => { made = true; });
  try {
    if (made) {
      // No staging database: it was made just now by this open, so the copy it held is gone. Another tab finished the
      // switch (it clears the flag before it deletes the copy), or the browser lost it; either way the live vault is the
      // most there is, and wiping it for an empty file would empty the collection.
      if (await live.get('meta', STAGING_PENDING)) {
        console.warn('the staged replacement is gone; the collection is left as the copy left it');
        await live.delete('meta', STAGING_PENDING);
      }
      replaceWaitingSeen = false;
    } else await copyStagingIn(live, stage, sayAtWipe);
  } finally {
    stage.close();
  }
  await deleteDB(STAGING_NAME);
}

/** The copy itself, from a staging database that holds the file (`replaceFromStaging`). */
async function copyStagingIn(live: IDBPDatabase<VaultDB>, stage: IDBPDatabase<VaultDB>, sayAtWipe: boolean): Promise<void> {
  {
    const [staged, parked] = await Promise.all([stage.getAll('changes'), stage.get('meta', 'parked')]);
    const changes = await openChanges(staged); // the file's changes, staged sealed when the vault is (round ninety-nine)
    // One transaction for the wipe, the drop of the snapshot and the copy of the file's log: a load between a wipe and a
    // copy could lay the new log over the old fold (round fifty-four, 2), and a second tab's wipe between this tab's copy
    // and its end emptied the log the first had copied (round eighty-two). Through storeIn, so the numbers a restored
    // collection carries go on the ledger like any other write (round twelve, 6); every row it writes is of unknown order
    // (`ORDER_FROM`, its last row's number, written in the same transaction); the parked set is the file's: the device's
    // own named changes the wiped log no longer has (round fifty-eight).
    {
      const tx = live.transaction(STORES, 'readwrite');
      await Promise.all([tx.objectStore('changes').clear(), tx.objectStore('outbox').clear(), tx.objectStore('order').clear(), dropFoldIn(tx)]);
      await storeIn(tx, changes, false, {}, false, undefined, {}, { copying: true, markLast: ORDER_FROM, meta: { parked: (parked as string[] | undefined) ?? [] } });
    }
    // The switch itself (`promote`) tells the other tabs as the wipe lands: they still show the old collection, and they
    // reload onto this one, where a tab that opens the vault waits for this copy (round eighty-two; they were told only
    // once the photographs were in, and not at all when the copy then failed). A resume says so only once it has finished
    // (`openVault`), as before.
    if (sayAtWipe) announce('replaced');
    // The photographs: the live ones the file does not hold go first, which frees their room before the copy; then the
    // file's, one at a time, since a transaction holding every blob of a large collection would be one large allocation.
    const keep = new Set(await stage.getAllKeys('photos'));
    {
      const tx = live.transaction('photos', 'readwrite');
      const gone = (await tx.store.getAllKeys()).filter((id) => !keep.has(id));
      await Promise.all([...gone.map((id) => tx.store.delete(id)), tx.done]);
    }
    for (const id of keep) {
      const p = await stage.get('photos', id);
      if (p) await live.put('photos', p);
    }
    await live.delete('meta', STAGING_PENDING);
    replaceWaitingSeen = false;
  }
}

/** The fold snapshot goes, and the counter moves, inside `tx`: a snapshot of a log that no longer exists is never read, and one being written of that log is refused (round fifty-three, 1). */
type MetaStore = { get(k: string): Promise<unknown>; put(v: unknown, k: string): Promise<unknown>; delete(k: string): Promise<void> };
async function dropFoldIn(tx: { objectStore(name: 'meta'): MetaStore }): Promise<number> {
  const meta = tx.objectStore('meta');
  const gen = Number((await meta.get(FOLD_GEN)) ?? 0) + 1;
  await Promise.all([meta.delete(FOLD), meta.put(gen, FOLD_GEN)]);
  return gen;
}

export { storageErrorText } from './storage-error'; // its own module since round sixty, so the collection reads it without the vault (and tests that stand the vault in still get it)

export async function allChanges(): Promise<Change[]> {
  const db = await openVault();
  return openChanges(await db.getAll('changes'));
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
type Tx = IDBPTransaction<VaultDB, ('changes' | 'outbox' | 'meta' | 'order')[], 'readwrite'>;
const STORES: ('changes' | 'outbox' | 'meta' | 'order')[] = ['changes', 'outbox', 'meta', 'order'];

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
  /** The last arrival number this write took, 0 when it took none. */
  seq: number;
  /** The first arrival number this write took, 0 when it took none: a tab moves its catch-up frontier over its own write only when the write's rows follow the frontier with no gap, since a gap is another tab's row it has not folded (round fifty-five, 1; both reviewers). */
  first: number;
}
export class StoppedError extends Error {
  constructor() {
    super('syncing was stopped on this device while this run was under way');
  }
}
/**
 * A replacement from a backup has begun and is not finished (`STAGING_PENDING`): the live log is being made the file's,
 * and the next open finishes it, wiping the live stores first, so a change written meanwhile would be lost without a word
 * (round sixty-seven; triage-66 R1, the self-review's C1). Refused, and said.
 */
export class ReplacePendingError extends Error {
  constructor() {
    super('A replacement from a backup has begun on this device and is not finished: it finishes when there is room. Free some space, then reload the page. Nothing can be saved until then');
  }
}
/** The notice for a replacement that could not finish when the vault opened: the reason, and what the page does meanwhile. */
async function pendingText(e: unknown): Promise<string> {
  const full = !!(await quotaText(e).catch(() => null));
  const why = full ? 'this device is out of space' : e instanceof Error && e.message ? e.message.replace(/\.$/, '') : 'the copy was refused';
  return `A replacement from a backup began on this device and could not finish: ${why}. It finishes when there is room: free some space, then reload the page. Until then the collection shows what was copied so far, and nothing can be saved.`;
}
/**
 * A condition on a meta record, checked inside the write's own transaction (`StoreOpts.requireMeta`; round sixty-nine,
 * for triage-68 X6): `absent`, the record is missing or null; else `equals`, it holds this value (compared as JSON);
 * with neither, the record must be present.
 */
export interface MetaCondition { key: string; equals?: unknown; absent?: true }
/**
 * A write refused because a meta condition did not hold (`StoreOpts.requireMeta`): nothing was written, the transaction
 * was aborted. Not a failed write to say to the grower: the caller asked for it, and reads `key` to know which.
 */
export class MetaRefusedError extends Error {
  constructor(readonly key: string) {
    super(`the write was not made: the record "${key}" is not as the write required`);
    this.name = 'MetaRefusedError';
  }
}
/** Whether a meta record meets the condition. */
function metaHolds(had: unknown, c: MetaCondition): boolean {
  const missing = had === undefined || had === null;
  if (c.absent) return missing;
  if ('equals' in c) return !missing && JSON.stringify(had) === JSON.stringify(c.equals);
  return !missing;
}
/** A replacement from a backup was found waiting as the vault opened, and could not finish then (round sixty-nine; triage-68 X4). */
let replaceWaitingSeen = false;
/**
 * The same, read without a request, for a test that must answer at once (the example's "empty", `ownEmpty`): true from
 * the moment this tab's vault found a replacement it could not finish, until one finishes (round sixty-nine; triage-68
 * X4; S-C3: the example opened over a collection waiting in the staging database for room).
 */
export function replaceWaiting(): boolean {
  return replaceWaitingSeen;
}
/** Whether a replacement from a backup has begun and is not finished on this device (`STAGING_PENDING`): the collection is then the file's, part copied, and writes are refused until the copy ends (round sixty-nine, for triage-68 X4: a pending replacement is not an empty collection). */
export async function replacePending(): Promise<boolean> {
  return !!(await (await openVault()).get('meta', STAGING_PENDING));
}
/** What a write may carry besides its changes, in its own transaction (round sixty-seven; contract C1, triage-66 R1). */
export interface StoreOpts {
  /** The replacement's own copy, which runs while the flag is up. */
  copying?: boolean;
  /** Meta records written in the same transaction as the changes. */
  meta?: Record<string, unknown>;
  /** A meta key that receives, in the same transaction, the arrival number of the last change the write stored (the last arrival in the vault when it stored none). */
  markLast?: string;
  /**
   * Meta records that must be as given for the write to be made, read in its own transaction (round sixty-nine, for
   * triage-68 X6: the example's seed is appended only while this tab's claim stands and no seed is marked, so a tab
   * whose claim lapsed and was taken cannot seed a second time). One that is not: nothing is written, and the write
   * throws `MetaRefusedError`.
   */
  requireMeta?: MetaCondition[];
  /**
   * The log must hold no change for the write to be made, read in its own transaction (round seventy, for triage-69 X3;
   * S-D6: the example's seed is set out only into an empty log). One that holds any: nothing is written, and the write
   * throws `MetaRefusedError('changes')`.
   */
  requireEmpty?: boolean;
}
/**
 * The example writes no outbox rows: syncing is refused there, and the rows were a third of every write's requests
 * (round sixty-seven; contract C2, triage-66 R13).
 */
const NO_OUTBOX = DB_NAME === DEMO_DB;
async function storeIn(tx: Tx, changes: Change[], fromServer: boolean, extra: Partial<Record<NumberKind, Set<string>>> = {}, strict = false, requireKey?: string, ledger: Partial<Record<NumberKind, Set<string>>> = {}, opts: StoreOpts = {}): Promise<Stored> {
  const ch = tx.objectStore('changes'), ob = tx.objectStore('outbox'), meta = tx.objectStore('meta');
  // A transaction aborted before the write below awaits its end (a read refused first) is the caller's error, thrown
  // from the read: its end is not a second, unhandled one (round sixty-seven; the self-review's E14).
  tx.done.catch(() => {});
  // Nothing is written while a replacement is being finished, read inside this very transaction (round sixty-seven;
  // triage-66 R1): the next open wipes the live stores and copies the file in again.
  if (!opts.copying && (await meta.get(STAGING_PENDING))) {
    tx.abort();
    await tx.done.catch(() => { /* aborted on purpose: the abort's rejection is the expected end */ });
    throw new ReplacePendingError();
  }
  // A write for a sync run happens only while the stored sync record still carries that run's key, checked inside this
  // very transaction: another tab's "Stop syncing" or new vault between a check and a write can no longer let a batch of
  // the old vault into the new log (round seventeen, A1).
  if (requireKey !== undefined) {
    const s = openMetaSync('sync', await meta.get('sync')) as { key?: string } | null | undefined;
    if (!s || s.key !== requireKey) {
      tx.abort();
      await tx.done.catch(() => {}); // the abort is the point; its rejection is not an error to surface
      throw new StoppedError();
    }
  }
  for (const c of opts.requireMeta ?? []) {
    if (metaHolds(await meta.get(c.key), c)) continue;
    tx.abort();
    await tx.done.catch(() => { /* aborted on purpose: the abort's rejection is the expected end */ });
    throw new MetaRefusedError(c.key);
  }
  if (opts.requireEmpty && (await ch.count()) > 0) {
    tx.abort();
    await tx.done.catch(() => { /* aborted on purpose: the abort's rejection is the expected end */ });
    throw new MetaRefusedError('changes');
  }
  // Two changes under one stamp should not exist; when they do (a stamp minted twice by a bug, a file edited by hand), the store keeps one of them, and the same one on
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
  /** The changes that are new to the store, or displace another: these get a row in the order of arrival; a re-send of what is held does not. */
  const arrived: Change[] = [];
  // A large batch (a restore, a merge) read the store once per change to find collisions, in sequence: a hundred thousand
  // reads, ten seconds. The keys in the batch's range come in one read, and only a stamp among them is read in full (round fifty-one, 5).
  let existing: Set<string> | null = null;
  // A merge of a file of this same collection collides on every stamp, and reading each in full in sequence was the
  // whole cost (round fifty-two, 5): past a few hundred collisions the stored changes in the range come in one read.
  let stored: Map<string, Change> | null = null;
  if (!strict && byStamp.size > 64) {
    const ts = [...byStamp.keys()].sort();
    const range = IDBKeyRange.bound(ts[0], ts[ts.length - 1]);
    existing = new Set((await ch.getAllKeys(range)) as string[]);
    let collisions = 0;
    for (const t of byStamp.keys()) if (existing.has(t)) collisions++;
    if (collisions > 200) stored = new Map((await ch.getAll(range)).map((r) => [r.t, openChangeSync(r)]));
  }
  for (let c of byStamp.values()) {
    const raw = strict || (existing && !existing.has(c.t)) ? undefined : stored ? stored.get(c.t) : await ch.get(c.t);
    const had = raw ? openChangeSync(raw) : undefined; // opened inside the transaction: the codec is synchronous (round ninety-nine; REVIEW-ROUND-99, D3)
    if (had && !sameChange(had, c)) {
      if (rank(c) > rank(had)) {
        console.warn(`change ${c.t} is already stored with other content; this one ranks higher and replaces it`);
        replaced.push(had);
        kept.push(c);
        arrived.push(c);
      } else console.warn(`change ${c.t} is already stored with other content; the stored one stands`);
      continue;
    }
    // The same change met again keeps the earliest recorded time either copy carries (round sixty-three): two devices that
    // write one repair record two times under one stamp, and a copy from a build that does not keep the time (a restore
    // on round sixty-two's) carries none; the same on every device, whatever order it met them in.
    if (had && typeof had.w === 'number' && !(typeof c.w === 'number' && c.w < had.w)) c = { ...c, w: had.w };
    kept.push(c);
    if (!had) arrived.push(c);
  }
  // A displaced change has no inverse in a fold built on top of it: the snapshot of the fold goes with it, in this same
  // transaction, and the counter moves so a snapshot being written of the old fold is refused (round fifty-three, 1).
  if (replaced.length) await dropFoldIn(tx);
  const carried: Partial<Record<NumberKind, Set<string>>> = { ...extra };
  for (const c of kept) {
    const k = numberField(c);
    if (k && typeof c.value === 'string') (carried[k] ??= new Set()).add(c.value);
  }
  const order = tx.objectStore('order');
  const rows = arrived.map((c) => order.add({ t: c.t }));
  // A change this version cannot read waits apart for a version that reads it, never in the outbox (`UNSENT`; round
  // seventy-one, the self-review's D3).
  const toSend = fromServer || NO_OUTBOX ? [] : kept.filter((c) => !changeError(c, true));
  const unsent = fromServer || NO_OUTBOX ? [] : kept.filter((c) => !!changeError(c, true)).map((c) => c.t);
  const puts: Promise<unknown>[] = [...kept.map((c) => (strict ? ch.add(storedOf(c)) : ch.put(storedOf(c)))), ...toSend.map((c) => ob.put({ t: c.t })), ...rows];
  if (unsent.length) puts.push(noteUnsent(meta, unsent));
  // Contract C1 (round sixty-seven): the caller's meta records, and the arrival number of this write's last change, in
  // this same transaction, so the example's seed and its marks land together or not at all (triage-66 V5).
  for (const [k, v] of Object.entries(opts.meta ?? {})) puts.push(meta.put(v, k));
  if (opts.markLast) {
    const key = opts.markLast;
    puts.push(rows.length ? rows[rows.length - 1].then((n) => meta.put(Number(n), key)) : order.openKeyCursor(null, 'prev').then((cur) => meta.put(cur ? Number(cur.key) : 0, key)));
  }
  // The ledger is read once per transaction (a caller that minted passes the copy it read) and written back only when
  // this write adds a number to it: an import read and rewrote the whole ledger twice per line, and slowed from 33 lines
  // a second to 5 over 2,000 (round sixty-two; agent G, outside review A's decision 3).
  for (const k of Object.keys(carried) as NumberKind[]) {
    const set = ledger[k] ?? (await issuedIn(tx, k));
    let added = false;
    for (const n of carried[k]!) if (!set.has(n)) { set.add(n); added = true; }
    if (added) puts.push(meta.put([...set], ISSUED(k)));
  }
  await Promise.all([...puts, tx.done]);
  const last = rows.length ? Number(await rows[rows.length - 1]) : 0;
  const first = rows.length ? Number(await rows[0]) : 0;
  return { kept, replaced, seq: last, first };
}
const sameChange = (a: Change, b: Change) => a.kind === b.kind && a.id === b.id && a.field === b.field && JSON.stringify(a.value ?? null) === JSON.stringify(b.value ?? null);
/** A total order on a change's content, for two under one stamp: the same on every device, whatever order they met them in. */
const rank = (c: Change) => `${c.kind}\0${c.id}\0${c.field}\0${JSON.stringify(c.value ?? null)}`;

/** Append changes; unless they came from the server (`fromServer`), they also go in the outbox to be pushed. One transaction, so the two stores cannot disagree. */
export async function appendChanges(changes: Change[], fromServer = false, strict = false, requireKey?: string, opts: Pick<StoreOpts, 'meta' | 'markLast' | 'requireMeta' | 'requireEmpty'> = {}): Promise<Stored> {
  if (!changes.length && !opts.meta && !opts.markLast) return { kept: [], replaced: [], seq: 0, first: 0 };
  const out = await writing(async () => {
    const db = await openVault();
    return storeIn(db.transaction(STORES, 'readwrite'), changes, fromServer, {}, strict, requireKey, {}, opts);
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
export async function appendChangesClaiming<T>(kind: NumberKind, known: Set<string>, build: (issued: Set<string>) => { changes: Change[]; result: T }, stored?: (s: Stored) => void): Promise<T> {
  const out = await writing(async () => {
    const db = await openVault();
    const tx = db.transaction(STORES, 'readwrite');
    let built: { changes: Change[]; result: T };
    let ledger: Set<string>;
    try {
      ledger = await issuedIn(tx, kind);
      const issued = new Set(ledger);
      for (const n of known) issued.add(n);
      built = build(issued);
    } catch (e) {
      tx.done.catch(() => {}); // the abort is the point; its rejection is not a second error (round sixty-two: an import's group refused this way left an unhandled rejection)
      tx.abort();
      throw e;
    }
    // What the write stored is told (`stored`), so the tab moves its frontier over its own rows as `commit` does: the next
    // ordinary write re-read every change since the load, one request each (round sixty-seven; triage-66 R13, the
    // self-review's E5).
    const s = await storeIn(tx, built.changes, false, {}, false, undefined, { [kind]: ledger });
    stored?.(s);
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
/** Named by the database, so a sample collection's tab and the grower's own tabs never hear each other (round sixty; agent F). */
const CHANNEL = `${DB_NAME}-vault`;
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
export type VaultNotice = 'written' | 'replaced' | 'refold' | 'sync-forgotten' | 'sealed';
function announce(what: VaultNotice = 'written'): void {
  try { chan?.postMessage(what); } catch { /* a closed channel is nothing to report */ }
}
/** Tell the other tabs to fold the log again: the inputs of the fold changed under them (a stamp parked; round fifty-five, 2). */
const announceRefold = () => announce('refold');
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
      const s = openMetaSync('sync', await tx.objectStore('meta').get('sync')) as { key?: string } | null | undefined;
      if (!s || s.key !== key) {
        tx.abort();
        await tx.done.catch(() => { /* aborted on purpose: the abort's rejection is the expected end */ });
        throw new StoppedError();
      }
    }
    const ob = tx.objectStore('outbox');
    await Promise.all([...ts.map((t) => ob.delete(t)), tx.done]);
  });
}
/**
 * Put every change on this device in the outbox: the first push after sync is set up sends the whole collection. The
 * changes it holds as parked go too, and the push sends their verdicts with them (`logBatch`'s `parked`), so a device
 * that joins parks them as this one does, and Apply on any device sends one as an edit made now (round sixty-two, second
 * pass; the data review's 5: left out, a record whose own fields were parked reached the joining device as waiting for a
 * newer version of the app, with nothing to Apply; judged by the new vault's arrival alone, A15, a change parked long ago
 * would fold there).
 */
export async function outboxFill(): Promise<number> {
  return writing(async () => {
    const db = await openVault();
    const tx = db.transaction(['changes', 'outbox', 'meta'], 'readwrite');
    // A change this build cannot fold (`changeError`'s shape: a newer build's kind, a reserved field, a broken stamp) stays
    // in the log and out of the outbox: pushed, it set aside the batch it rode in, with up to 2,000 good changes, on every
    // peer, for good (round sixty-nine; triage-68 R3, the self-review's D3, R46-18). A backup carries it (`unreadable.json`).
    // It waits apart, and goes in the outbox once a version reads it (`UNSENT`; round seventy-one, the self-review's D3).
    const all = (await tx.objectStore('changes').getAll()).map(openChangeSync);
    const ts = all.filter((c) => !changeError(c, true)).map((c) => c.t);
    const later = all.filter((c) => !!changeError(c, true) && typeof c.t === 'string').map((c) => c.t);
    const ob = tx.objectStore('outbox');
    await Promise.all([...ts.map((t) => ob.put({ t })), ...(later.length ? [noteUnsent(tx.objectStore('meta'), later)] : []), tx.done]);
    return ts.length;
  });
}
/** Add stamps to the changes waiting apart for a version that reads them (`UNSENT`), inside the caller's transaction. */
async function noteUnsent(meta: MetaStore, ts: string[]): Promise<void> {
  const had = (await meta.get(UNSENT)) as unknown;
  const set = new Set(Array.isArray(had) ? (had as unknown[]).filter((x): x is string => typeof x === 'string') : []);
  const n = set.size;
  for (const t of ts) set.add(t);
  if (set.size !== n) await meta.put([...set], UNSENT);
}
/**
 * The changes waiting apart (`UNSENT`) that this version reads, put in the outbox, and returned, so sync sends them
 * (round seventy-one; the self-review's D3: a change restored from a backup made by a newer version reached no other
 * device, even once this one was updated to read it). One no longer in the log is forgotten; one still unreadable waits.
 * Nothing in the example, which sends nothing, nor while a replacement is being finished.
 */
export async function queueReadable(): Promise<Change[]> {
  if (NO_OUTBOX) return [];
  return writing(async () => {
    const db = await openVault();
    const tx = db.transaction(['changes', 'outbox', 'meta'], 'readwrite');
    tx.done.catch(() => { /* held so an abort below is not an unhandled rejection; the commit is awaited, and its failure thrown, at the end */ });
    const meta = tx.objectStore('meta');
    const had = (await meta.get(UNSENT)) as unknown;
    if (!Array.isArray(had) || !had.length || (await meta.get(STAGING_PENDING))) { await tx.done.catch(() => { /* nothing was written on this path, so how the transaction ends changes nothing */ }); return []; }
    const ch = tx.objectStore('changes'), ob = tx.objectStore('outbox');
    const queued: Change[] = [];
    const wait: string[] = [];
    for (const t of had) {
      if (typeof t !== 'string') continue;
      const r = await ch.get(t);
      const c = r ? openChangeSync(r) : undefined;
      if (!c) continue;
      if (changeError(c, true)) { wait.push(t); continue; }
      queued.push(c);
    }
    if (queued.length || wait.length !== had.length) {
      await Promise.all([...queued.map((c) => ob.put({ t: c.t })), wait.length ? meta.put(wait, UNSENT) : meta.delete(UNSENT)]);
    }
    await tx.done;
    return queued;
  });
}
export async function outboxClear(): Promise<void> {
  await writing(async () => (await openVault()).clear('outbox'));
}
export async function changesByKeys(ts: string[]): Promise<Change[]> {
  const db = await openVault();
  const tx = db.transaction('changes');
  const out = await Promise.all(ts.map((t) => tx.store.get(t)));
  return openChanges(out.filter((c): c is StoredChange => !!c));
}

/** Every stored change of one record, by the record index: for a reading of its history, such as notes replaced unseen (round fifty-eight). */
export async function changesOf(kind: string, id: string): Promise<Change[]> {
  return openChanges(await (await openVault()).getAllFromIndex('changes', 'byRecord', [kind, id] as never));
}

export async function getMeta<T>(k: string): Promise<T | undefined> {
  const db = await openVault();
  return openMetaSync(k, await db.get('meta', k)) as T | undefined;
}

export async function setMeta(k: string, v: unknown): Promise<void> {
  await writing(async () => (await openVault()).put('meta', metaStored(k, v), k));
  if (k === 'sync') await keepSyncWrap(v);
}

/**
 * Change a meta record from what is stored, read and written in one transaction: two tabs that each wrote their own copy
 * of a set (the photographs to check, the parked changes dealt with) wrote over each other's additions (round fifty-eight;
 * the client review).
 */
export async function updateMeta<T>(k: string, fn: (had: T | undefined) => T): Promise<T> {
  return writing(async () => {
    const tx = (await openVault()).transaction('meta', 'readwrite');
    const next = fn(openMetaSync(k, await tx.store.get(k)) as T | undefined);
    await Promise.all([tx.store.put(metaStored(k, next), k), tx.done]);
    return next;
  }).then(async (next) => { if (k === 'sync') await keepSyncWrap(next); return next; });
}

/**
 * Write a meta record only while the stored one still carries `key`: read and write in one transaction, so a tab whose
 * sync was stopped or replaced by another tab cannot put the old record back between the two (round sixteen, 1). False
 * when the stored record is gone or belongs to another vault; nothing is written then.
 */
export async function setMetaIfKey(k: string, v: unknown, key: string): Promise<boolean> {
  return writing(async () => {
    const tx = (await openVault()).transaction('meta', 'readwrite');
    const had = openMetaSync(k, await tx.store.get(k)) as { key?: string } | undefined;
    if (!had || had.key !== key) {
      await tx.done;
      return false;
    }
    await Promise.all([tx.store.put(metaStored(k, v), k), tx.done]);
    return true;
  }).then(async (ok) => { if (ok && k === 'sync') await keepSyncWrap(v); return ok; });
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

/**
 * What the browser has already promised about keeping this site's storage, read without asking. The one ask is
 * `keep-ask.ts`'s gate (a month between asks, never for a visitor or in the example); this function asked too when
 * `ask` was left at its default, a second door past the gate that no page used (round sixty-nine; triage-68 P5, R46-31,
 * S-E's P1 note). `known` and `ask` are kept so no caller changes; neither asks any more.
 */
export async function requestPersistence(known?: (persisted: boolean) => void, ask = false): Promise<boolean> {
  void ask;
  try {
    const now = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    known?.(now);
    return now;
  } catch {
    return false;
  }
}

/** Set once a Blob was refused and the same photograph stored as bytes: the rest of this page's photographs go as bytes. */
let blobsRefused = false;
async function asBytes(p: PhotoBlobs): Promise<PhotoBytes> {
  const [full, small] = await Promise.all([p.blob.arrayBuffer(), p.thumb.arrayBuffer()]);
  return { id: p.id, full, small, fullType: p.blob.type, smallType: p.thumb.type };
}
const asBlobs = (p: PhotoBlobs | PhotoBytes): PhotoBlobs =>
  'full' in p ? { id: p.id, blob: new Blob([p.full], { type: p.fullType }), thumb: new Blob([p.small], { type: p.smallType }) } : p;
/**
 * A photograph into a photos store: as Blobs, or as bytes where the browser refuses Blobs there. Only a refusal the bytes
 * then get past switches to bytes; a write that fails both ways (a full disk) is the first error, as it always was. The
 * bytes are read before the write's transaction opens, which would otherwise close while they are read.
 */
async function putPhotoIn(db: IDBPDatabase<VaultDB>, p: PhotoBlobs): Promise<void> {
  // Sealed as bytes, each part bound to the photograph's id, before the write's transaction opens (round ninety-nine).
  if (writeSealed) { await db.put('photos', await sealPhoto(await asBytes(p))); return; }
  if (blobsRefused) { await db.put('photos', await asBytes(p)); return; }
  try {
    await db.put('photos', p);
  } catch (e) {
    const bytes = await asBytes(p);
    try { await db.put('photos', bytes); } catch { throw e; }
    blobsRefused = true;
  }
}

export async function putPhotoBlobs(p: PhotoBlobs): Promise<void> {
  await writing(async () => putPhotoIn(await openVault(), p));
}

export async function getPhotoBlobs(id: string): Promise<PhotoBlobs | undefined> {
  const db = await openVault();
  const p = await db.get('photos', id);
  if (p && 'sealed' in p) return asBlobs(await openPhoto(p));
  return p && asBlobs(p);
}
async function sealPhoto(b: PhotoBytes): Promise<PhotoSealed> {
  const [full, small] = await Promise.all([sealBytes(b.id, 'full', new Uint8Array(b.full)), sealBytes(b.id, 'small', new Uint8Array(b.small))]);
  return { id: b.id, sealed: 1, full, small, fullType: b.fullType, smallType: b.smallType };
}
async function openPhoto(p: PhotoSealed): Promise<PhotoBytes> {
  const [full, small] = await Promise.all([openBytes(p.id, 'full', p.full), openBytes(p.id, 'small', p.small)]);
  return { id: p.id, full: full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength) as ArrayBuffer, small: small.buffer.slice(small.byteOffset, small.byteOffset + small.byteLength) as ArrayBuffer, fullType: p.fullType, smallType: p.smallType };
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
    const tx = db.transaction(['changes', 'photos', 'outbox', 'order', 'meta'], 'readwrite');
    await Promise.all([tx.objectStore('changes').clear(), tx.objectStore('photos').clear(), tx.objectStore('outbox').clear(), tx.objectStore('order').clear(), tx.objectStore('meta').delete(ORDER_FROM), dropFoldIn(tx)]);
    await tx.done;
  });
}

/* ---- the fold snapshot ----
 * The folded state, as the collection last built it from the whole log, kept
 * in meta with the arrival number it was taken at: a load reads it and the
 * rows of `order` after that number, rather than every change in the log
 * (six seconds at four hundred thousand changes; round fifty-three, 1). The
 * collection decides what goes in it and when it is wrong; the vault keeps
 * it, drops it with the log it describes, and refuses a write of one that
 * began before the log was replaced or a stored change displaced.
 */
export interface FoldSnapshot {
  /** The fold rules the snapshot was built under: another number is not read (round fifty-four, 2). Since round fifty-seven the build is kept for the record only, so a deploy that leaves the rules as they were costs no whole fold; a test fails when the fold's source changes and the number does not. */
  rules: number;
  build: string;
  device: string;
  /** The clock correction in force when it was built: another one re-judges every hold, so the snapshot is wrong. */
  offset: number;
  /** Whether the clock had been confirmed by a sync server when this was folded: the park rule reads it (round sixty). Absent in older snapshots, which are under older rules anyway. */
  checked?: boolean;
  /**
   * The wall of the latest stamp it folded that a clock could hold (a peer's, not made past another): read only by a clock
   * that holds none of it, so a load from it is the whole log's fold under the clock in force at that load (round seventy;
   * triage-69 R1, IND-5). Absent in older snapshots, which are under older rules anyway.
   */
  reach?: number;
  /** The last arrival number it covers. */
  seq: number;
  records: unknown[];
  seen: string[];
  born: string[];
  parents: Array<[string, Array<[string, string | null]>]>;
  /** Every stamp the fold held when it was taken: re-judged at each load, folded as they come due (round fifty-four, 2). */
  held: string[];
  /** The latest stamp folded, for the clock. */
  last: string;
  /** How many changes were folded, for the page's own account of the load. */
  changes: number;
  /** When it was written (ms): a snapshot under newer rules that no shell has written for an hour is a rolled-back build's, and may be replaced (round fifty-eight). */
  savedAt?: number;
}
/** How long a snapshot under newer rules is kept from an older build: past the overlap of two shells in a deploy, not for good. */
export const NEWER_FOLD_KEPT_MS = 60 * 60_000;
export async function readFold(): Promise<{ fold: FoldSnapshot; gen: number } | undefined> {
  const db = await openVault();
  const tx = db.transaction('meta');
  const [fold, gen] = await Promise.all([tx.store.get(FOLD), tx.store.get(FOLD_GEN)]);
  if (!fold || typeof fold !== 'object') return undefined;
  const x = (fold as { x?: unknown }).x;
  if (x instanceof Uint8Array) {
    const { x: _x, ...plain } = fold as FoldSnapshot & { x: Uint8Array };
    void _x;
    return { fold: { ...plain, ...(await openJson<FoldSealedPart>('fold', x)) } as FoldSnapshot, gen: Number(gen ?? 0) };
  }
  return { fold: fold as FoldSnapshot, gen: Number(gen ?? 0) };
}
/** The snapshot's parts that say what the collection holds, sealed together; its rules, counter and times stay plain, read inside transactions. */
type FoldSealedPart = Pick<FoldSnapshot, 'records' | 'seen' | 'born' | 'parents' | 'held' | 'last'>;
async function foldStored(fold: FoldSnapshot): Promise<unknown> {
  if (!writeSealed) return fold;
  const { records, seen, born, parents, held, last, ...plain } = fold;
  return { ...plain, x: await sealJson('fold', { records, seen, born, parents, held, last } satisfies FoldSealedPart) };
}
/** The counter that moves whenever the log is replaced or a stored change displaced; a snapshot is written only against the value it was read at. */
export async function foldGen(): Promise<number> {
  return Number((await getMeta<number>(FOLD_GEN)) ?? 0);
}
/** Write the snapshot, unless the log changed under it since `gen` was read, or the snapshot stored was folded under newer rules; false then, and nothing is written. */
export async function writeFold(fold: FoldSnapshot, gen: number): Promise<boolean> {
  return writing(async () => {
    const stored = (await foldStored(fold)) as FoldSnapshot; // sealed before the transaction opens (round ninety-nine)
    const tx = (await openVault()).transaction('meta', 'readwrite');
    const now = Number((await tx.store.get(FOLD_GEN)) ?? 0);
    const had = (await tx.store.get(FOLD)) as FoldSnapshot | undefined;
    // An old build's shell, still open after a deploy, must not overwrite a snapshot folded under newer rules, nor the new
    // the old's back and forth: the newer rules keep the snapshot (round fifty-five, 2; since round fifty-seven by the
    // rules, not the build, since the snapshot is keyed to the rules).
    // But not for good: after a rollback the newer rules are gone, and a snapshot no build can read locked every load into
    // folding the whole log until the next deploy (round fifty-eight; the client review). One that no newer shell has
    // written for an hour is replaced.
    // A savedAt in the future (this device's clock went back since) is not a reason to wait: it would hold for as long as
    // the clock was wrong (round fifty-nine; the round forty-one review, 10).
    const age = Date.now() - (typeof had?.savedAt === 'number' ? had.savedAt : 0);
    const newer = typeof had?.rules === 'number' && had.rules > fold.rules && age >= 0 && age < NEWER_FOLD_KEPT_MS;
    if (now !== gen || newer) {
      await tx.done;
      return false;
    }
    await Promise.all([tx.store.put({ ...stored, savedAt: Date.now() }, FOLD), tx.done]);
    return true;
  });
}
/**
 * A shell under the snapshot's own rules that loaded from it says so, at most every ten minutes: `savedAt` moved only
 * when a newer shell wrote, which is rare, so an old shell took the snapshot over an hour later while the new one was
 * still open, and then the new one folded the whole log and took it back (round fifty-nine; the round forty-one review,
 * 10). Not a write of the log; a refusal or a quota error is ignored.
 */
export async function touchFold(rules: number): Promise<void> {
  try {
    await writing(async () => {
      const tx = (await openVault()).transaction('meta', 'readwrite');
      const had = (await tx.store.get(FOLD)) as FoldSnapshot | undefined;
      const age = Date.now() - (typeof had?.savedAt === 'number' ? had.savedAt : 0);
      if (had && had.rules === rules && (age < 0 || age > 10 * 60_000)) await tx.store.put({ ...had, savedAt: Date.now() }, FOLD);
      await tx.done;
    });
  } catch {
    /* the heartbeat is best-effort */
  }
}
/** Park stamps and drop the snapshot in one transaction: a load between the two would fold a parked change into a snapshot it could then write (round fifty-five, 2; the first reviewer's finding 7). */
/**
 * `moved`, when the snapshot is dropped: told the fold counter's move, from what to what, in the same transaction, so a tab
 * whose fold already holds these parks and was built against the counter before it can take the new number and write its
 * snapshot (round eighty-two; the independent review's 38: after a Merge that parked, the snapshot was refused).
 */
export async function parkStamps(stamps: string[], drop = true, moved?: (from: number, to: number) => void): Promise<string[]> {
  const all = await writing(async () => {
    const tx = (await openVault()).transaction('meta', 'readwrite');
    // A union with what is stored, read in the same transaction: two tabs parking at once must not write each other's stamps away.
    const had = (await tx.store.get('parked')) as string[] | undefined;
    const out = [...new Set([...(Array.isArray(had) ? had : []), ...stamps])];
    const [, to] = await Promise.all([tx.store.put(out, 'parked'), drop ? dropFoldIn(tx) : Promise.resolve(0)]);
    await tx.done;
    if (drop) moved?.(to - 1, to);
    return out;
  });
  if (drop) announceRefold();
  return all;
}
export async function dropFold(): Promise<void> {
  await writing(async () => {
    const tx = (await openVault()).transaction('meta', 'readwrite');
    await dropFoldIn(tx);
    await tx.done;
  });
}
/** The last arrival number in the vault, 0 when nothing has arrived since the order was kept. */
export async function lastArrival(): Promise<number> {
  const db = await openVault();
  const cur = await db.transaction('order').store.openKeyCursor(null, 'prev');
  return cur ? Number(cur.key) : 0;
}
/**
 * The changes that arrived after `seq`, in arrival order, the number of the last of them (`seq` when there are none),
 * and the fold counter as it is in the same transaction: a caller that read the counter before compares the two, since
 * a replace between the reads would have numbered the new log's rows after the old snapshot's number (round fifty-four, 2).
 * A row whose change has since left the log is skipped.
 */
export async function arrivalsAfter(seq: number): Promise<{ changes: Change[]; seq: number; gen: number }> {
  const { rows, gen, last } = await tailAfter(seq);
  return { changes: rows.map((r) => r.c), seq: last, gen };
}
/**
 * Contract C1 (round sixty-seven): every change that arrived after `seq`, with its arrival number, in arrival order: what
 * the example's Leave counts as the visitor's own (V's `sampleEdits`, after the seed's `markLast`).
 */
export async function arrivalSeqsAfter(seq: number): Promise<Array<{ seq: number; t: string; kind: string; id: string; field: string; value: unknown }>> {
  return (await tailAfter(seq)).rows.map(({ n, c }) => ({ seq: n, t: c.t, kind: c.kind, id: c.id, field: c.field, value: c.value }));
}
/** A tail this long, or longer, is read change by change only when its stamps are scattered over a log much larger than it. */
const TAIL_BY_KEY = 200;
/**
 * The tail's changes in one bounded range read, not one `get` per change (round sixty-seven; triage-66 R13, the
 * self-review's E1, IND): the example's 431 seed changes were 432 requests on every page load, about seven seconds at
 * WebKit-on-Windows' pace, and a load after an import read every imported change one at a time. The stamps the tail names
 * are read as the one key range from the lowest to the highest, filtered by the tail's own set and put back in arrival
 * order. When that range holds many more changes than the tail (a pull brought a few old stamps into a large log), a
 * short tail is read change by change instead, as before; a long one still takes the range, which is no more than a
 * whole-log fold reads.
 */
async function tailAfter(seq: number): Promise<{ rows: Array<{ n: number; c: Change }>; gen: number; last: number }> {
  const db = await openVault();
  const tx = db.transaction(['order', 'changes', 'meta']);
  const after = IDBKeyRange.lowerBound(seq, true);
  const [gen, rows, keys] = await Promise.all([tx.objectStore('meta').get(FOLD_GEN), tx.objectStore('order').getAll(after), tx.objectStore('order').getAllKeys(after)]);
  const last = keys.length ? Number(keys[keys.length - 1]) : seq;
  const out: Array<{ n: number; c: Change }> = [];
  if (!rows.length) return { rows: out, gen: Number(gen ?? 0), last };
  const found: Array<{ n: number; c: StoredChange }> = out as Array<{ n: number; c: StoredChange }>;
  const ch = tx.objectStore('changes');
  // A row whose stamp is not a string (a change written by hand or by a bug, with a number for its stamp) is left out:
  // sorted with the strings, it made a range whose bounds IndexedDB refuses, and every catch-up of every tab failed for
  // good (round sixty-nine; triage-68 R5, R46-29). Such a change is no change the fold can take (`changeError`).
  const ts = rows.map((r) => r.t).filter((t): t is string => typeof t === 'string');
  if (!ts.length) return { rows: out, gen: Number(gen ?? 0), last };
  const sorted = [...new Set(ts)].sort();
  const range = IDBKeyRange.bound(sorted[0], sorted[sorted.length - 1]);
  const spread = sorted.length > 1 ? await ch.count(range) : 1;
  let byT: Map<string, StoredChange>;
  if (sorted.length < TAIL_BY_KEY && spread > sorted.length * 4 + 64) {
    const got = await Promise.all(sorted.map((t) => ch.get(t)));
    byT = new Map(got.filter((c): c is StoredChange => !!c).map((c) => [c.t, c]));
  } else {
    const want = new Set(sorted);
    byT = new Map((await ch.getAll(range)).filter((c) => want.has(c.t)).map((c) => [c.t, c]));
  }
  for (let i = 0; i < rows.length; i++) { const c = byT.get(rows[i].t); if (c) found.push({ n: Number(keys[i]), c }); }
  // Opened once the reads are made: the transaction has nothing left to do (round ninety-nine).
  const opened = await openChanges(found.map((r) => r.c));
  for (let i = 0; i < out.length; i++) out[i].c = opened[i];
  return { rows: out, gen: Number(gen ?? 0), last };
}
/**
 * The order in which these stamps reached this device (their rows in the order of arrival), for the few a caller asks
 * about; a stamp stored before the order was kept has none, and nor has one a replace from a backup wrote (`ORDER_FROM`).
 * What the log can say about "before" and "after" without comparing two devices' clocks (round sixty-one; the records
 * review's 12). One read of the order store: for a rare action (a restore that meets another record under its number),
 * not for a page's path.
 */
export async function arrivalsOf(stamps: string[]): Promise<Map<string, number>> {
  const want = new Set(stamps);
  const out = new Map<string, number>();
  if (!want.size) return out;
  const db = await openVault();
  const tx = db.transaction(['order', 'meta']);
  const [rows, keys, from] = await Promise.all([tx.objectStore('order').getAll(), tx.objectStore('order').getAllKeys(), tx.objectStore('meta').get(ORDER_FROM)]);
  const known = Number(from ?? 0) || 0;
  for (let i = 0; i < rows.length; i++) { const t = (rows[i] as { t?: string })?.t; if (t && want.has(t) && !out.has(t) && Number(keys[i]) > known) out.set(t, Number(keys[i])); }
  return out;
}
/** Every stamp in the log, and nothing else: what a load from the snapshot needs of the log itself. */
export async function changeKeys(): Promise<string[]> {
  const db = await openVault();
  return db.getAllKeys('changes');
}

/* ---- turning the encryption on and off, and opening it (round ninety-nine; docs/REVIEW-ROUND-99.md) ---- */

/** The other tabs reload when this tab begins or ends sealing: their way of writing changes with it (`writeSealed`). */
function announceSealed(): void { announce('sealed'); }

/** A sync key this device syncs with is added to the seal's wraps, so it opens the collection without the passcode (D1, D7). */
async function keepSyncWrap(v: unknown): Promise<void> {
  const key = (v as { key?: unknown } | null | undefined)?.key;
  if (!sealedVault || !haveKey() || typeof key !== 'string') return;
  const canonical = parseVaultKey(key);
  if (!canonical) return;
  const db = await openRaw();
  const rec = readSeal(await db.get('meta', SEAL_META));
  if (!rec || (await unwrapSyncKey(rec, canonical))) return; // kept already
  const wrap = await wrapSyncKey(keyBytes()!, canonical);
  await writing(() => updateSealRecord((r) => ({ ...r, keys: [...r.keys, wrap] })));
}
async function updateSealRecord(fn: (r: SealRecord) => SealRecord): Promise<void> {
  const tx = (await openRaw()).transaction('meta', 'readwrite');
  const rec = readSeal(await tx.store.get(SEAL_META));
  if (rec) await tx.store.put(fn(rec), SEAL_META);
  await tx.done;
}

/** The passcode opens the collection: true, and this tab holds the key; false when it is not the passcode. */
export async function openSealWithPass(pass: string): Promise<boolean> {
  const rec = readSeal(await (await openRaw()).get('meta', SEAL_META));
  if (!rec) return true;
  const k = await unwrapPass(rec, pass);
  if (!k) return false;
  await setKey(k);
  void resumeSealing();
  return true;
}
/** A sync key this device synced with opens the collection: true, and this tab holds the key. */
export async function openSealWithSyncKey(canonical: string): Promise<boolean> {
  const rec = readSeal(await (await openRaw()).get('meta', SEAL_META));
  if (!rec) return false;
  const k = await unwrapSyncKey(rec, canonical);
  if (!k) return false;
  await setKey(k);
  return true;
}
/** The key from another open tab of this app (a reload of an unlocked tab; D6): true when this vault is sealed and it is a key. */
export async function openSealWithKey(k: Uint8Array): Promise<boolean> {
  const rec = readSeal(await (await openRaw()).get('meta', SEAL_META));
  if (!rec || k.length !== 32) return false;
  await setKey(k);
  void resumeSealing();
  return true;
}
/** Whether the passcode opens the seal, without taking the key (the passcode asked again in Settings). */
export async function sealPassOpens(pass: string): Promise<boolean> {
  const rec = readSeal(await (await openRaw()).get('meta', SEAL_META));
  return !!rec && !!(await unwrapPass(rec, pass));
}
/**
 * Delete the collection on this device whole, encryption and all (the lock screen's way back with a backup file, which
 * cannot open an encrypted vault: D7). Every tab lets go of the database (`blocking`) and reloads.
 */
export async function eraseVault(): Promise<void> {
  if (DB_NAME !== 'cultifolio') throw new Error('not the collection');
  const db = await openRaw();
  db.close();
  dbp = null;
  readyp = null;
  forgetKey();
  await deleteDB(DB_NAME);
  await deleteDB(STAGING_NAME);
}
/** The passcode changed: the key wrapped again under the new one (the tab holds the key). */
export async function rewrapSealPass(pass: string): Promise<void> {
  if (!haveKey()) throw new Error('the collection is locked in this tab');
  const wrap = await wrapPass(keyBytes()!, pass);
  await writing(() => updateSealRecord((r) => ({ ...r, pass: wrap })));
}
/** Forget the key in this tab (locked). */
export const lockSeal = (): void => forgetKey();

export interface SealProgress { done: number; of: number; what: 'changes' | 'photographs' }

/**
 * Encrypt the collection on this device under a new data key wrapped under `pass` (and the sync key, where it syncs).
 * Every record is sealed in place, in batches; a cut-off midway leaves a whole vault, and the next unlock carries on.
 */
export async function sealVault(pass: string, onProgress?: (p: SealProgress) => void): Promise<void> {
  if (DB_NAME !== 'cultifolio') throw new Error('The example collection is not encrypted.');
  const db = await openVault();
  if (readSeal(await db.get('meta', SEAL_META))) throw new Error('The collection on this device is encrypted already.');
  const dek = newDataKey();
  const sync = openMetaSync('sync', await db.get('meta', 'sync')) as { key?: string } | undefined;
  const canonical = typeof sync?.key === 'string' ? parseVaultKey(sync.key) : null;
  const rec: SealRecord = { v: 1, pass: await wrapPass(dek, pass), keys: canonical ? [await wrapSyncKey(dek, canonical)] : [] };
  await setKey(dek);
  await writing(async () => {
    const tx = db.transaction('meta', 'readwrite');
    await Promise.all([tx.store.put(rec, SEAL_META), tx.store.put({ to: 'on' } satisfies Sealing, SEALING_META), tx.done]);
  });
  sealedVault = true;
  writeSealed = true;
  announceSealed();
  await runSealing('on', onProgress);
}

/** Decrypt the collection on this device back to plain (the tab holds the key): record by record, as sealing. */
export async function unsealVault(onProgress?: (p: SealProgress) => void): Promise<void> {
  if (!sealedVault) return;
  if (!haveKey()) throw new Error('the collection is locked in this tab');
  await writing(async () => { await (await openVault()).put('meta', { to: 'off' } satisfies Sealing, SEALING_META); });
  writeSealed = false;
  announceSealed();
  await runSealing('off', onProgress);
}

let sealingRun: Promise<void> | null = null;
/** A sealing or unsealing left part-way carries on (at an unlock). */
async function resumeSealing(): Promise<void> {
  const s = (await (await openRaw()).get('meta', SEALING_META)) as Sealing | undefined;
  if (s?.to === 'on' || s?.to === 'off') await runSealing(s.to).catch((e) => console.warn('the encryption could not carry on now:', e));
}

/**
 * Every change, photograph and sealed meta record to the form `to` asks, in place. Passes until one changes nothing: a
 * record another tab wrote in the old form while a pass was under way is taken by the next (the other tabs are told to
 * reload as it begins). The fold snapshot is dropped, and the next load writes it in the new form.
 */
function runSealing(to: 'on' | 'off', onProgress?: (p: SealProgress) => void): Promise<void> {
  if (sealingRun) return sealingRun;
  sealingRun = (async () => {
    const db = await openVault();
    const want = to === 'on';
    for (let round = 0; round < 4; round++) {
      let moved = 0;
      const keys = await db.getAllKeys('changes');
      for (let i = 0; i < keys.length; i += 200) {
        const part = keys.slice(i, i + 200);
        moved += await writing(async () => {
          const tx = db.transaction('changes', 'readwrite');
          const rows = await tx.store.getAll(IDBKeyRange.bound(part[0], part[part.length - 1]));
          const puts: Promise<unknown>[] = [];
          for (const r of rows) {
            if (isSealedChange(r) === want) continue;
            puts.push(tx.store.put(want ? sealChangeSync(r as Change) : openChangeSync(r)));
          }
          await Promise.all([...puts, tx.done]);
          return puts.length;
        });
        onProgress?.({ done: Math.min(i + 200, keys.length), of: keys.length, what: 'changes' });
      }
      const ids = await db.getAllKeys('photos');
      for (let i = 0; i < ids.length; i++) {
        const p = await db.get('photos', ids[i]);
        if (!p || 'sealed' in p === want) continue;
        const next = want ? await sealPhoto('full' in p ? (p as PhotoBytes) : await asBytes(p as PhotoBlobs)) : await openPhoto(p as PhotoSealed);
        // Put back only while the photograph is still there, read in the write's own transaction: one deleted meanwhile stays deleted.
        await writing(async () => {
          const tx = db.transaction('photos', 'readwrite');
          if (await tx.store.get(ids[i])) await tx.store.put(next);
          await tx.done;
        });
        moved++;
        onProgress?.({ done: i + 1, of: ids.length, what: 'photographs' });
      }
      moved += await writing(async () => {
        const tx = db.transaction('meta', 'readwrite');
        let n = 0;
        for (const k of SEALED_META) {
          const v = await tx.store.get(k);
          if (v === undefined || v === null) continue;
          const sealed = typeof v === 'object' && '#sealed' in (v as object);
          if (sealed === want) continue;
          await tx.store.put(want ? sealMetaSync(k, v) : openMetaSync(k, v), k);
          n++;
        }
        await tx.done;
        return n;
      });
      if (!moved) break;
    }
    await writing(async () => {
      const tx = db.transaction('meta', 'readwrite');
      await Promise.all([tx.store.delete(SEALING_META), ...(want ? [] : [tx.store.delete(SEAL_META)]), dropFoldIn(tx), tx.done]);
    });
    if (!want) { sealedVault = false; writeSealed = false; forgetKey(); }
    announceRefold();
  })().finally(() => { sealingRun = null; });
  return sealingRun;
}
