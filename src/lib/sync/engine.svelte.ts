/**
 * Sync: this device's changes up, everyone else's down, both sealed with the
 * vault key. The server is a dumb store of ciphertext (see server/sync.ts).
 *
 * Push: whatever is in the outbox, in HLC order, sealed as batches named by
 * the hour of their last change, the device, and a keyed fingerprint of the
 * changes as JSON, so two batches with different contents never share a name and
 * the same batch sealed twice (a re-push after a lost reply; each seal has a
 * fresh IV) lands on the same name. A batch is acked only when the server
 * says it holds that batch. The outbox is every change the server has not
 * acknowledged: local edits, imports, restores; when sync is first set up it
 * is filled with the whole log, so a collection that lived on one device for
 * a year arrives whole. Nothing is inferred from device ids: a change from
 * another device that came in through a backup file is still ours to push. A
 * batch or photo the server refuses (too big, malformed) is noted and stepped
 * over: one bad item must not stop the device receiving. A full vault (507)
 * stops the push, is not split, and is said plainly.
 *
 * Pull: batches by ARRIVAL time at the server, from a minute before our
 * cursor, paging within a run by (arrival, key), skipping any we already hold
 * (ours, or applied earlier); download, open, validate, ingest as 'server' so
 * they do not go back up. The log's merge rule makes this idempotent, so an
 * interrupted pull costs nothing but a repeat. A batch that cannot be opened
 * or validated is quarantined by name and reported; the cursor moves past it.
 * A batch that cannot be STORED (a full phone) is not quarantined: the run
 * stops there with an error and the next run fetches it again.
 *
 * Held changes: a change stamped more than MAX_AHEAD_MS past this device's
 * clock (a peer with a fast clock) is stored but left out of the fold until
 * the clock reaches it. Every pulled change goes through the collection's
 * `ingest`, which stores it, folds what is due and holds the rest as a load
 * does (round fifty-eight); the hold is applied only once the device's clock
 * has been checked against the server's (round fifty-nine). This engine keeps
 * the list, re-folds what has come due at the start of every run, and the
 * sync page says how many are waiting.
 *
 * Photos: by id, immutable. Push what we have that the server lacks; pull
 * what records mention that we lack.
 */
import { collection } from '$lib/db/collection.svelte';
import { storageErrorText } from '$lib/db/storage-error';
import { StoppedError, getMeta, setMeta, setMetaIfKey, getPhotoBlobs, putPhotoBlobs, deletePhotoBlobs, photoBlobIds, outboxKeys, outboxAck, outboxFill, outboxClear, changesByKeys, appendChanges, onOtherTabWrite, announceSyncForgotten } from '$lib/db/vault';
import { deriveKeys, sealJson, openJson, seal, open, packPhoto, unpackPhoto, parseVaultKey, batchFingerprint, dropProof, sha256hex, type VaultKeys } from './crypto';
import { MAX_BATCH_BYTES, MAX_PHOTO_BYTES, SEAL_OVERHEAD, OVERLAP_MS, CURSOR_SLACK_MS, PUSH_HEADERS, PHOTO_DROP_HEADER, PHOTO_REMOVED_AT_HEADER, SYNC_HEADER, batchName, listAfter, logBatch, BATCH_VERSIONS } from './limits';
import { readChanges, isHeld, isParked, dueAt, hlcWall, PARK_MS, type Change } from '$core/log';
import { hlcCompare, isHlc, MAX_AHEAD_MS, nowMs, trustServerTime, clockOffsetMs, clearClockOffset, onClockOffsetChange, onReadingWanted, clockChecked, isPastStamp } from '$core/hlc';
import { inDemo } from '$lib/db/demo';
import { version as BUILD } from '$app/environment';

interface SyncMeta {
  key: string; // the vault key, kept on this device so it can sync without asking
  /** Arrival time (ms) of the newest batch we have taken from the server. */
  since: number;
  /** Batch keys this device holds: pushed by it or applied from a pull. Skipped when listed again. Pruned to the overlap window (round twelve). */
  have: string[];
  /** Arrival time of each key in `have`, so the list can be pruned once the cursor has moved well past it. */
  haveAt?: Record<string, number>;
  /**
   * Batches that could not be opened or validated, by name, with why, and the build that failed to read them. Also in
   * `have`, so they never block the cursor; a new build drops them from both and reads them again (round twelve, 2).
   */
  quarantined?: Array<{ key: string; error: string; at: string; build?: string; /** what the key names */ kind?: 'batch' | 'photo' }>;
  /** Things the server refused to take from this device, by name, with why. They stay in the outbox; the rest of a sync goes on. */
  refused?: Array<{ key: string; error: string; at: string }>;
  /** HLCs of stored changes the fold is holding back because they are stamped too far ahead of this device's clock. */
  held?: string[];
  /** The server said the vault is full: what it held and the limit, in bytes. Cleared when a push is taken again. */
  vaultFull?: { bytes: number; limit: number; at: string };
  photosPushed: string[];
  /** Removed photographs whose ciphertext this device has asked the server to drop, or found gone (round forty-nine, 1). */
  photosDropped?: string[];
  /** Photographs seen removed at the last run: one of them live again, with pixels here, is sent again whatever `photosPushed` says, since a peer may have asked the server to drop it meanwhile (round fifty-one, 2). */
  photosRemoved?: string[];
  lastSync: string | null;
  /**
   * The server's refusal of this vault's uploads (a 503 with a Retry-After of a minute or more), and when the device asks
   * again: kept here, so a reload or another tab of this device respects it, not only the tab that was told (round
   * sixty-one; decision 6). Never more than an hour ahead.
   */
  refusal?: { text: string; until: number };
  /**
   * For each batch this device pushed and has not yet seen listed, the latest wall time among its stamps read from a
   * clock (a stamp made past another, `isPastStamp`, is left out: it is never parked). The listing gives the batch's
   * arrival, and a batch whose latest such stamp is more than two days past it holds a change to park (round sixty-one).
   */
  ownMax?: Record<string, number>;
  /** This device's own batches, by key, with their arrival, still to be judged by it (fetched again and their far stamps parked): kept until that is done, so a failed fetch is tried again next run (round sixty-one). */
  ownJudge?: Record<string, number>;
  /** Whether this device has listed the whole vault for its own batches since it began judging them (round sixty-one): a device that pushed before then lists once from the start. */
  ownListed?: boolean;
  /**
   * Removed photographs the server last answered 409 for ("an upload claimed after the removal is kept"), and when, by
   * this device's clock: asked again only an hour later, by every tab and after a reload (round sixty-two; the server
   * review's 10, A5: the hour lived in one tab's memory, and each reload asked again).
   */
  asked409?: Record<string, number>;
  /** When this device first saw each removed photograph whose removal's stamp is marked (its wall says nothing of when it was made; round sixty-two, the clock review's 15). */
  removedSeen?: Record<string, number>;
}

const META = 'sync';
/**
 * A sync request with a time limit (round fifty-nine; two reviews). None had one, so a request that hung kept its run,
 * and since round fifty-eight its tab's lock, for good, and every other tab skipped its run without a word. A request
 * past its limit is said as a server that did not answer, as a dropped connection is (a TypeError), not as a refusal.
 * Photographs and batches get longer, for a slow line.
 */
async function syncFetch(url: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  try {
    // Every sync request carries a header of its own, which a page on another site cannot send without a preflight the
    // server never grants: the server takes it in place of an Origin that an older browser sends as "null" (round
    // sixty-two; A31, the server's half in hooks.server.ts).
    const headers = new Headers(init.headers);
    headers.set(SYNC_HEADER, '1');
    return await fetch(url, { ...init, headers, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new TypeError(`the server did not answer within ${Math.round(ms / 1000)} seconds`);
    throw e;
  }
}
/** The record as this build reads it, its lists present even when an older one stored none (round fifty-seven; read the same way at init and in a run's reload, round fifty-nine). */
const withDefaults = (m: SyncMeta): SyncMeta => ({ ...m, have: Array.isArray(m.have) ? m.have : [], photosPushed: Array.isArray(m.photosPushed) ? m.photosPushed : [] });
const PHOTO_MS = 180_000;
const BATCH_MS = 120_000;
/**
 * Where a batch may be cut: never between a notes change and the `notesBase` that follows it for the same record, since
 * a base that arrives in a later pull would make the edit look blind (round twenty-six, 2). Returns the index to cut
 * before, at most one step back from `at`; a cut that cannot move (a two-change batch) stays where it is.
 */
/** Each base field and the notes it belongs to: a plant's and a batch's `notes`, a species' `myNotes` (round fifty-nine). */
const NOTES_OF_BASE: Record<string, string> = { notesBase: 'notes', myNotesBase: 'myNotes' };
export function cutBefore(list: Change[], at: number): number {
  if (at <= 0 || at >= list.length) return at;
  const writer = (c: Change) => c.t.slice(c.t.lastIndexOf('-') + 1);
  // Any base within a few steps after the cut whose own notes change sits before it: the cut moves before that notes
  // change. The pair need not be adjacent (another tab's change stamped in the same millisecond can sit between them)
  // and the base need not be the first change after the cut (round twenty-eight, 0; round twenty-nine, 9).
  for (let j = at; j < Math.min(list.length, at + 8); j++) {
    const base = list[j];
    const notesOf = NOTES_OF_BASE[base.field];
    if (!notesOf) continue;
    for (let i = j - 1; i >= Math.max(0, j - 8); i--) {
      const c = list[i];
      if (c.kind !== base.kind || c.id !== base.id) continue;
      if (c.field === notesOf && writer(c) === writer(base)) {
        if (i < at) return i >= 1 ? i : j + 1 < list.length ? j + 1 : at; // a pair that starts the batch is kept whole by cutting after it instead
        break;
      }
      if (c.field === notesOf || c.field === base.field) break; // another edit of the same notes: the pair is not this one
    }
  }
  return at;
}
/** Written by "Stop syncing" (and a replace from backup, which goes through it): which vault this device was in, so the sync page can lead with rejoining rather than with making a second vault (round twenty-four, 10). */
const WAS = 'sync-was';
const BATCH_MAX = 2000;
/** While the page is visible, pull this often even with nothing to push: a laptop left on /plants follows the phone. */
const IDLE_PULL_MS = 5 * 60_000;

const utf8 = new TextEncoder();

/** A stamp made on this device (any tab: the writer is the device plus a tab tag). */
const ownStamp = (t: string, device: string) => t.slice(t.lastIndexOf('-') + 1).startsWith(device);
/**
 * The parked verdicts a batch carries (`logBatch`'s `parked`; round sixty-two, second pass; the data review's 5). None
 * when absent; a marked stamp is never parked (the clock review's 8), so one listed is not taken. Anything but a list of
 * stamps sets the batch aside, as any unreadable part of a batch does.
 */
function parkedVerdicts(v: unknown): Set<string> {
  if (v === undefined) return new Set();
  if (!Array.isArray(v) || !v.every((t) => typeof t === 'string' && isHlc(t))) throw new Error('not a batch this version understands');
  return new Set((v as string[]).filter((t) => !isPastStamp(t)));
}

class Sync {
  configured = $state(false);
  private gen = 0;
  busy = $state<string | null>(null);
  lastSync = $state<string | null>(null);
  lastError = $state<string | null>(null);
  /**
   * The server's own refusal of this vault's uploads, as it said it, and when the device asks again: a vault past the
   * site's ceiling of vaults is answered 503 with a sentence and a Retry-After, and the sync page shows both rather than
   * "push failed: 503" (round sixty; three reviews). Receiving carries on meanwhile.
   */
  refusal = $state<{ text: string; until: number } | null>(null);
  /** The last run could not reach the server at all (no network), as opposed to the server answering with a refusal: the page says offline, and that the changes are kept (round twenty-four, 9). */
  offline = $state(false);
  /** With `offline`: the browser says it has no network ('offline'), or it has one and the server did not answer at all ('server'); the page words them apart (round twenty-five, 15). */
  unreached = $state<'offline' | 'server' | null>(null);
  /** The vault this device was in before it stopped syncing, if any, with when it stopped. */
  wasIn = $state<{ vaultId: string; at: string; why: 'stopped' | 'replaced' } | null>(null);
  /** Runs that finished on this page, well or badly: the sync page shows it, so a test (or a person) can tell a new "Synced" from the one that was already there (round thirteen, B2). */
  runs = $state(0);
  pending = $state(0);
  /** Batches on the server this device could not read; the sync page says so. */
  quarantined = $state<Array<{ key: string; error: string; at: string; kind?: 'batch' | 'photo' }>>([]);
  /** What the server refused from this device. */
  refused = $state<Array<{ key: string; error: string; at: string }>>([]);
  /** A listing dated past this clock plus the slack: said on the sync page, not kept (round thirty-eight, R1-5). */
  clockAhead = $state<string | null>(null);
  /** Changes stored here but held out of the fold because a peer's clock was ahead; and when the last of them comes due (ms). */
  held = $state(0);
  heldUntil = $state<number | null>(null);
  /** This device's own clock has jumped back behind its last stamp; a sentence for the sync page, or null. */
  clockWarning = $state<string | null>(null);
  /** The server has no room for more from this vault; what it holds and the limit, in bytes. */
  vaultFull = $state<{ bytes: number; limit: number } | null>(null);
  vaultId = $state('');
  keys: VaultKeys | null = null;
  /**
   * The browser's lock manager, which keeps two tabs from running one vault's sync at once (round fifty-eight). A field,
   * not read from `navigator` at each run, so a test's simulated devices can each hold their own, as separate browsers do.
   */
  locks: LockManager | undefined = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  private meta: SyncMeta | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unhook: (() => void) | null = null;
  private listening = false;
  private clockHooked = false;
  private base = '';

  /** Read the stored key, if any, and start listening for local changes. Safe to call more than once. */
  async init(base = ''): Promise<void> {
    this.base = base;
    if (this.meta) return;
    // Another tab's correction (a `storage` event) re-judges this tab's holds too (round fifty-two, 1). Once per engine:
    // each init before a vault was set up (the layout, then the sync page) added another (round fifty-eight).
    this.hookClock();
    this.wasIn = (await getMeta<{ vaultId: string; at: string; why: 'stopped' | 'replaced' }>(WAS)) ?? null;
    const m = await getMeta<SyncMeta>(META);
    if (m?.key && !this.meta) {
      // The record as this build writes it (round fifty-seven: the conversion from the HLC-cursor engine's is gone).
      this.meta = withDefaults(m);
      this.keys = await deriveKeys(m.key);
      this.keysOf.set(this.meta, this.keys); // the meta this engine holds (round eighteen, 12)
      this.vaultId = this.keys.id;
      this.lastSync = m.lastSync;
      this.quarantined = this.meta.quarantined ?? [];
      this.refused = this.meta.refused ?? [];
      this.vaultFull = this.meta.vaultFull ? { bytes: this.meta.vaultFull.bytes, limit: this.meta.vaultFull.limit } : null;
      this.readRefusal(this.meta);
      this.configured = true;
      this.hook();
      await this.scanClock();
      await this.countPending();
    }
  }

  /**
   * The clock in force changed (a reading here or in another tab, a correction that lapsed) or was confirmed for the
   * first time, or stopped counting as confirmed: every hold and every park judged by the clock alone is judged again,
   * by a fold of the log, and the engine's list of held changes is read again from it. In the fold-rules hash since round
   * sixty-one: a listener that did nothing passed every test (the clock review's 10, mutations M12 and M13).
   */
  private clockChanged(): void {
    this.clockFolds++;
    this.clockFold = collection.rebuild().then(() => this.scanClock()).catch(() => {});
  }
  /** The refold the clock listener started, and how many it has started: a pull whose reading changed the clock waits for that one rather than folding again (round sixty-two; the clock review's 5, A17: three refolds per reading). */
  private clockFold: Promise<void> | null = null;
  private clockFolds = 0;
  /** A park by arrival of a change this tab had already folded (`takeBatch`, `judgeOwn`): the fold is read again once, at the end of the pull (round sixty-two; the clock review's 9). */
  private foldStale = false;
  /** The clock listeners, once per engine: the refold on a change of the clock in force, and a run at once when the device clock moved and a reading is wanted (round sixty-two). */
  private hookClock(): void {
    if (this.clockHooked) return;
    this.clockHooked = true;
    onClockOffsetChange(() => this.clockChanged());
    onReadingWanted(() => this.schedule(1000));
  }

  private hook() {
    this.unhook?.();
    this.unhook = collection.onLocalChange((changes) => {
      this.noteAhead(changes);
      this.schedule();
    });
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    onOtherTabWrite((what) => { if (what === 'sync-forgotten' && this.configured) { this.dropped(); void getMeta<typeof this.wasIn>(WAS).then((w) => (this.wasIn = w ?? null)); } });
    window.addEventListener('online', () => this.schedule(1000));
    // Said at once, not after the first failed run: a page opened offline is offline from its first frame (round twenty-six, 16).
    if (navigator.onLine === false && this.configured) { this.offline = true; this.unreached = 'offline'; }
    window.addEventListener('offline', () => { if (this.configured) { this.offline = true; this.unreached = 'offline'; } });
    // An open, idle device pulls too: when it comes back into view, when it gets focus, and every few minutes while visible. Never while hidden.
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    document.addEventListener('visibilitychange', () => {
      if (visible()) this.schedule(1000);
    });
    window.addEventListener('focus', () => this.schedule(1000));
    setInterval(() => {
      if (visible()) this.schedule(1000);
    }, IDLE_PULL_MS);
  }

  /** Coalesce bursts of edits into one push. A run already going does not swallow the request: it is tried again after it. */
  schedule(ms = 2500): void {
    if (!this.configured) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.busy) this.schedule(ms);
      else this.run().catch(() => {});
    }, ms);
  }

  /** The vault key as it should be shown, or null. */
  get key(): string | null {
    return this.meta?.key ?? null;
  }

  /** First device: make (or adopt) a vault with this key, then push everything and pull. */
  async setup(vaultKey: string, mode: 'create' | 'join' = 'create'): Promise<void> {
    // Not in the sample collection, whatever the page shows: a vault set up there would send the sample to the server
    // (round sixty-one; decision 10, a guard in the code and not only the page's CSS).
    if (inDemo()) throw new Error('Sync is off in the example collection. Leave the example to sync your own plants.');
    const key = parseVaultKey(vaultKey);
    if (!key) throw new Error('That is not a sync key.'); // the glossary's word, as the sync page says it (round fifty-eight; the accessibility review)
    const keys = await deriveKeys(key);
    const ask = () => syncFetch(`${this.base}/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: keys.id, token: keys.token, create: mode === 'create' }) });
    let r = await ask();
    // A 503 with a wait under a minute is the server's count of the vault crossed by another device's upload: it says "it
    // tries again shortly", and now it does, at most twice, after the wait it gives (round sixty-two; the server review's
    // 9, triage 1). A longer wait is a refusal, said as the server says it.
    for (let tries = 0; r.status === 503 && tries < 2; tries++) {
      const secs = Number(r.headers.get('retry-after'));
      if (!(secs > 0 && secs < 60)) break;
      await new Promise((ok) => setTimeout(ok, secs * 1000));
      r = await ask();
    }
    if (!r.ok) {
      // The server's own sentence where it gives one ("Sync is not taking new vaults for now…", "too many new vaults from this address today"); the fixed wording for the statuses whose meaning the client knows better.
      // `error` is what the routes answer with; `message` is what SvelteKit's own `error()` answers with (a 402 licence refusal, a 401): both are sentences worth showing (round twenty-three, 11).
      const said = await r.json().then((b: unknown) => { const o = b && typeof b === 'object' ? (b as { error?: unknown; message?: unknown }) : null; return typeof o?.error === 'string' ? o.error : typeof o?.message === 'string' ? o.message : null; }).catch(() => null);
      throw new Error(r.status === 404 ? 'No vault answers to that key. Check it against the other device; one wrong letter is a different vault.' : r.status === 403 ? 'That key does not open its vault.' : said ? said[0].toUpperCase() + said.slice(1) + (/[.!?]$/.test(said) ? '' : '.') : r.status === 503 ? 'Sync is not available on this server.' : `The server said ${r.status}.`);
    }
    this.gen++; // a run still in flight for an earlier vault is stale from here: it touches nothing of this one (round sixteen, 2)
    this.keys = keys;
    this.vaultId = keys.id;
    this.meta = { key, since: 0, have: [], photosPushed: [], lastSync: null };
    this.keysOf.set(this.meta, keys);
    // Busy from here until the first run ends: a device that has just joined is not "Synced" until it has pulled (round ten).
    this.busy = mode === 'join' ? 'Joining…' : 'Starting…';
    try {
      await setMeta(META, this.meta);
      await setMeta(WAS, null);
      this.wasIn = null;
      // Everything on this device goes up first, but for what it holds as parked: against this vault's arrival a parked
      // change of long ago is no longer far ahead, and every device joining it would fold what this one keeps parked
      // (round sixty-two; A15). Apply, on its record or on the Sync page, sends it again as an edit made now.
      await outboxFill();
      this.hookClock();
      this.configured = true;
      this.hook();
      await this.scanClock();
    } finally {
      this.busy = null; // run() sets its own, in the same tick
    }
    await this.run();
  }

  /** Stop syncing on this device. Nothing local is deleted; nothing on the server is deleted. */
  async forget(why: 'stopped' | 'replaced' = 'stopped'): Promise<void> {
    // Why matters to the page: after a replace from backup, rejoining would merge the vault's records back into the restored collection, so Rejoin is not the lead there (round twenty-five, 6).
    const was = this.vaultId ? { vaultId: this.vaultId, at: new Date().toISOString(), why } : null;
    this.dropped(); // this.meta is null from here: a run in flight cannot write the old record back (round fifteen, 2)
    clearClockOffset(); // no server to confirm a correction against: the device clock is what there is (round fifty-two, 1)
    await setMeta(META, null);
    if (was) { await setMeta(WAS, was); this.wasIn = was; }
    await outboxClear();
    announceSyncForgotten(); // and the other tabs drop theirs
  }

  /** A replace from backup on a device that had already stopped syncing: the former vault is now one a rejoin would merge back, so the record says so (round twenty-six, 7). */
  async markReplaced(): Promise<void> {
    const was = this.wasIn ?? (await getMeta<{ vaultId: string; at: string; why: 'stopped' | 'replaced' }>(WAS)) ?? null;
    if (!was) return;
    const next = { ...was, why: 'replaced' as const, at: new Date().toISOString() };
    await setMeta(WAS, next);
    this.wasIn = next;
  }

  private async countPending(): Promise<void> {
    if (!this.meta) return;
    this.pending = (await outboxKeys()).length;
  }

  /** The outbox, as changes, in HLC order. */
  private async toPush(): Promise<Change[]> {
    const ts = (await outboxKeys()).sort(hlcCompare);
    return changesByKeys(ts);
  }

  /**
   * Write the meta a run is working on, but only while it is still this device's meta: after "Stop syncing" (here or in
   * another tab) a run already in flight holds the old record, and writing it back would put the key and the cursor back
   * as if nothing had happened. The run ends instead (round fifteen, 2).
   */
  private async save(m: SyncMeta): Promise<void> {
    if (this.meta !== m) throw stopped();
    // And on disk, in one transaction: another tab's "Stop syncing" or "Replace from backup" is seen there before this tab
    // hears of it, and a run in that window must not write the old key and cursor back (round sixteen, 1).
    if (!(await setMetaIfKey(META, m, m.key))) {
      this.dropped();
      throw stopped();
    }
  }

  /** Forget the key in memory only: another tab did the forgetting and wrote the vault; this tab must not sync through it. */
  private dropped(): void {
    this.gen++;
    this.busy = null; // a run this drop strands never clears it (its finally leaves the new generation alone), and the icon would spin until a reload (round eighteen, 11)
    this.unhook?.();
    this.unhook = null;
    this.meta = null;
    this.keys = null;
    this.configured = false;
    this.vaultId = '';
    this.lastSync = null;
    this.lastError = null;
    this.offline = false;
    this.unreached = null;
    this.pending = 0;
    this.quarantined = [];
    this.refused = [];
    this.held = 0;
    this.heldUntil = null;
    this.clockWarning = null;
    this.vaultFull = null;
  }

  private note(m: SyncMeta, list: 'quarantined' | 'refused', key: string, error: string): void {
    if (this.meta !== m) throw stopped(); // a stale run's verdict on its old vault's batch or photo must not land on the new vault (round eighteen, 4)
    const l = (m[list] ??= []);
    if (!l.some((q) => q.key === key)) l.push({ key, error, at: new Date().toISOString(), ...(list === 'quarantined' ? { build: BUILD, kind: error.startsWith('photo:') ? 'photo' : 'batch' } : {}) });
    this[list] = [...l];
  }

  private h(m: SyncMeta): Record<string, string> {
    return { authorization: `Bearer ${this.k(m).token}` };
  }

  /**
   * The keys of the vault a run belongs to, by its meta record: a run that outlives "Stop syncing" and a new vault must
   * never reach the new vault with the old meta (round seventeen, 4). Kept beside the meta, not on the engine.
   */
  private keysOf = new WeakMap<SyncMeta, VaultKeys>();
  private k(m: SyncMeta): VaultKeys {
    const k = this.keysOf.get(m);
    if (!k || this.meta !== m) throw stopped();
    return k;
  }

  /** A step of a run: its progress text, set only while the run is still this device's; a stale run stops here, before it fetches anything (round seventeen, 4). */
  private step(m: SyncMeta, text: string): void {
    if (this.meta !== m) throw stopped();
    this.busy = text;
  }

  /* ---- held changes and the clock ---- */

  /**
   * The stored parks only, never this load's clock-only ones (round sixty-two; the clock review's 1, A14): a batch's change
   * is judged by its arrival against verdicts that are facts of the log, so a reading of this clock is never stored as a
   * verdict by arrival, and the writer of a far change stores the verdict its peers store.
   */
  private hold(arrival?: number) {
    return { now: nowMs(), except: collection.device, arrival, parked: collection.storedParks, clockChecked: clockChecked() };
  }

  /**
   * Which stored changes the fold is holding (a peer's, stamped too far ahead) and whether this device's own last stamp is
   * ahead of its clock (the clock jumped back; its next edits will still be stamped ahead, and will win over later ones
   * elsewhere until real time catches up). Read from the fold, which holds both since round fifty-eight; it read the
   * whole log on every open of a synced device, which undid what the snapshot saves (the client review).
   */
  private async scanClock(): Promise<void> {
    if (!this.meta) return;
    await collection.load();
    const hold = this.hold();
    const held = new Set(this.meta.held ?? []);
    for (const t of collection.heldList()) if (!isParked(t, hold) && isHeld(t, hold)) held.add(t);
    const m = this.meta;
    const changed = held.size !== (m.held?.length ?? 0);
    m.held = [...held];
    this.setHeld();
    this.warnClock(collection.ownLatest());
    // Saved where it is found: a run reads its record from the store, and a list kept only in memory was lost to that
    // read, so a held change brought in by a restore never came due (round fifty-nine; the harness review).
    if (changed) await this.save(m).catch(() => {});
  }

  /** Changes this device just wrote or imported: a restore can carry a peer's ahead-stamped changes; its own stamps show whether its clock is behind. */
  private noteAhead(changes: Change[]): void {
    if (!this.meta) return;
    const hold = this.hold();
    let ownLast = '';
    let added = false;
    const followed = collection.heldWalls(); // an edit stamped just past a held change is not this clock running ahead (round fifty-eight)
    for (const c of changes) {
      if (isParked(c.t, hold)) continue;
      if (isHeld(c.t, hold)) {
        if (!this.meta.held?.includes(c.t)) (this.meta.held ??= []).push(c.t);
        added = true;
      } else if (hold.except && ownStamp(c.t, hold.except) && !followed.has(hlcWall(c.t)) && !isPastStamp(c.t) && hlcCompare(c.t, ownLast) > 0) ownLast = c.t; // a stamp made past another says nothing of this clock (round sixty-one)
    }
    if (added) {
      this.setHeld();
      const m = this.meta;
      void this.save(m).catch(() => {}); // kept, as scanClock keeps what it finds (round fifty-nine)
    }
    this.warnClock(ownLast);
  }

  private warnClock(ownLast: string): void {
    if (ownLast && hlcWall(ownLast) > nowMs() + MAX_AHEAD_MS) {
      const until = new Date(hlcWall(ownLast));
      // Said as what it means to the grower, with nothing to do (round sixty-one; the grower review's 9).
      this.clockWarning = `Some changes made on this device are dated as late as ${until.toLocaleString()}, after today: its clock was set ahead when they were made, or is behind now. Nothing is lost, and what you edit now still shows.`;
    } else if (Math.abs(clockOffsetMs()) > 0) {
      // The device clock disagrees with the server's by more than half a minute: changes are stamped by the server's
      // time while this device syncs, and the warning says so, since the device's own clock is what the grower sees (round forty-nine, 1).
      const off = clockOffsetMs();
      this.clockWarning = `This device's clock is ${spanWords(Math.abs(off))} ${off > 0 ? 'behind' : 'ahead of'} the server's; changes made here are stamped by the server's time until it is set right.`;
    } else this.clockWarning = null; // neither holds now: a warning from an earlier reading is not left standing (round fifty-eight)
  }

  private setHeld(): void {
    // Only those still waiting to change something: one an edit here was since stamped past will never show, and is not
    // said to be on its way (round sixty-one; the clock review's 9). The list itself keeps them, to fold as they come due.
    const held = collection.stillHeld(this.meta?.held ?? []);
    this.held = held.length;
    this.heldUntil = held.length ? Math.max(...held.map(dueAt)) : null;
  }

  /** Re-fold what has come due: they are in the log already; ingesting them again applies them (an append of the same HLC is a no-op). */
  private async refold(m: SyncMeta): Promise<void> {
    if (!m.held?.length) return;
    const hold = this.hold();
    const due = m.held.filter((t) => !isHeld(t, hold));
    if (!due.length) return;
    const changes = await changesByKeys(due);
    // No repair here: the numbers they touch wait for the end of the pull, which repairs once over everything folded (round fifty-eight).
    if (changes.length) await collection.ingest(changes, 'server');
    m.held = m.held.filter((t) => !due.includes(t));
    this.setHeld();
    await this.save(m);
  }

  /**
   * One run at a time across this device's tabs (a Web Lock): two tabs each ran on its own copy of the sync record and
   * wrote it back over the other's cursor and lists (round fifty-eight; the client review). A tab that finds a run in
   * another tab leaves it to that one, which pushes and pulls for the whole device; the run that takes the lock starts
   * from the record as stored, not the copy this tab read when it opened.
   */
  async run(): Promise<void> {
    if (!this.configured || !this.keys || !this.meta || this.busy) return;
    if (inDemo()) return; // never in the sample collection (round sixty-one; decision 10)
    const locks = this.locks;
    if (!locks) return this.runNow();
    // Named by the vault: a run of a vault this tab has since left (after "Stop syncing" and a new key) can still be
    // finishing, and must not keep the new vault's first run from starting (round fifty-eight, after the deploy run).
    await locks.request(`cultifolio-sync:${this.keys.id}`, { ifAvailable: true }, async (lock) => {
      // Another tab is running this vault's sync. That run may have read the outbox before an edit made here, so this tab
      // tries again shortly rather than leaving the edit for the next focus or the five-minute tick (round fifty-nine;
      // two reviews): the edit was pushed by nobody.
      if (!lock) { this.schedule(5000); return; }
      const m = this.meta;
      const stored = m ? await getMeta<SyncMeta>(META) : undefined;
      if (m && stored && stored.key === m.key && this.meta === m) {
        // The record as stored, whole: a merge kept what another tab had since cleared (a full vault it found room in), and
        // this page's own copies of it (set aside, refused, full, last sync) are read again with it (round fifty-nine).
        const fresh = withDefaults(stored);
        for (const k of Object.keys(m) as Array<keyof SyncMeta>) if (!(k in fresh)) delete m[k];
        Object.assign(m, fresh);
        this.quarantined = [...(m.quarantined ?? [])];
        this.refused = [...(m.refused ?? [])];
        this.vaultFull = m.vaultFull ? { bytes: m.vaultFull.bytes, limit: m.vaultFull.limit } : null;
        this.readRefusal(m);
        this.lastSync = m.lastSync;
        this.setHeld();
      }
      await this.runNow();
    });
  }

  private async runNow(): Promise<void> {
    if (!this.configured || !this.keys || !this.meta || this.busy) return;
    if (inDemo()) return;
    // The generation this run belongs to: "Stop syncing" or a new vault during the run makes it stale, and a stale run
    // leaves the status, the busy flag and the run count to the vault that replaced it (round sixteen, 2).
    const g = this.gen;
    // The meta this run belongs to, read once: every step below is given it, so a run that outlives "Stop syncing" or a
    // new vault never reads the engine's meta afresh and finds the new vault's, or null (round twenty, 2).
    const m = this.meta;
    this.lastError = null;
    this.busy = 'Starting…';
    try {
      await collection.load();
      await this.refold(m);
      // A push the server asks to wait on (429: the address's allowance is spent, say after a large photo upload) does not
      // stop the pull: other devices' changes still arrive, and the wait is reported afterwards (round fifteen, 7).
      let wait: Error | null = null;
      try {
        await this.push(m);
      } catch (e) {
        if ((e as { retryAfterMs?: number })?.retryAfterMs) wait = e as Error;
        else throw e;
      }
      if (this.meta !== m) throw stopped(); // the 429 was caught above; a stop or a new vault during the push still ends the run here
      const got = await this.pull(m);
      // A removal folded by this pull may have revived under an edit made here, with the pixels here: the photographs
      // noted by the pull are checked and sent in the same run, not the next (round fifty-two, 2).
      if (collection.unverifiedPhotos().length && !this.vaultFull) await this.push(m);
      m.lastSync = new Date().toISOString();
      this.warnClock(collection.ownLatest()); // judged again after what the run folded
      this.offline = false;
      this.unreached = null;
      await this.save(m); // refuses, and throws, if this run is stale: the sync time below is then never shown for a vault this device has left (round twenty-one, 4)
      this.lastSync = m.lastSync;
      // Said only when something did arrive (round sixteen, design note).
      if (wait) { if (got) wait.message = `received ${got} batch${got === 1 ? '' : 'es'}; ${wait.message}`; throw wait; }
    } catch (e) {
      if (g === this.gen) {
        // A fetch that never reached the server throws a TypeError ("Failed to fetch", "Load failed"); the browser's own
        // offline flag says so more plainly when it is set. Either way the page says offline, not failed (round twenty-four, 9).
        this.offline = e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
        this.unreached = !this.offline ? null : typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'server';
        this.lastError = (await storageErrorText(e)) ?? (e instanceof Error ? e.message || e.name || 'the run stopped' : String(e));
        const wait = (e as { retryAfterMs?: number })?.retryAfterMs;
        if (wait) this.schedule(wait);
      }
      throw e;
    } finally {
      if (g === this.gen) {
        this.busy = null;
        this.runs++;
      }
    }
  }

  /** A 429 from the server: not a refusal of the item, a request to come back later. The run stops and is rescheduled for then. */
  /**
   * The server refusing this vault's uploads for a while (503: the site is past its ceiling of vaults, or could not count
   * this one just now), with its own sentence and a time to ask again. Said on the sync page as the server said it; the
   * outbox keeps every change, uploads wait until then (at most an hour between tries), and receiving carries on (round
   * sixty; three reviews: "push failed: 503", re-sent every five minutes, the pull never ran).
   */
  private async refusedBy(m: SyncMeta, r: Response): Promise<never> {
    let text = '';
    try { const body = (await r.clone().json()) as { error?: string; message?: string }; text = body.error || body.message || ''; } catch { /* a 503 with no sentence (the platform's own) */ }
    const secs = Math.max(5, Math.min(3600, Number(r.headers.get('retry-after')) || 300));
    // A wait of a minute or more is the vault refused for a while: kept in the sync record, so a reload or another tab
    // asks no sooner (round sixty-one; decision 6: it lived in one tab's memory). A shorter one (a photograph held by
    // another device a moment, a recount that crossed a landing) is no refusal: the run is simply tried again then.
    if (secs >= 60) {
      this.refusal = { text: text || 'The sync server is not taking uploads from this vault just now.', until: Date.now() + secs * 1000 };
      if (this.meta === m) { m.refusal = { ...this.refusal }; await this.save(m).catch(() => {}); }
    }
    const e = new Error(text || `the sync server asked this device to wait ${secs} s`);
    (e as Error & { retryAfterMs?: number }).retryAfterMs = secs * 1000;
    throw e;
  }
  /** The refusal as the sync record keeps it, if it still stands, and never more than an hour ahead of this clock. */
  private readRefusal(m: SyncMeta): void {
    const r = m.refusal;
    if (r && typeof r.until === 'number' && r.until > Date.now()) {
      this.refusal = { text: String(r.text ?? ''), until: Math.min(r.until, Date.now() + 3600_000) };
      // The cap is written back, so it holds: after the clock went back a day, each read capped it at "an hour from now"
      // again and uploads waited a day and an hour (round sixty-two; the server review's 5).
      if (r.until > this.refusal.until) r.until = this.refusal.until;
    } else { this.refusal = null; if (r) delete m.refusal; }
  }
  /** The refusal is over: an upload was taken. */
  private clearRefusal(m: SyncMeta): void {
    this.refusal = null;
    if (m.refusal) delete m.refusal;
  }
  /** Uploads wait while the server's refusal stands: no batch or photograph is sent to be refused again. */
  private waitRefusal(m: SyncMeta): void {
    this.readRefusal(m);
    if (!this.refusal) return;
    const left = this.refusal.until - Date.now();
    if (left <= 0) { this.clearRefusal(m); return; }
    const e = new Error(this.refusal.text);
    (e as Error & { retryAfterMs?: number }).retryAfterMs = left;
    throw e;
  }

  private limited(r: Response): never {
    const secs = Math.max(5, Math.min(600, Number(r.headers.get('retry-after')) || 60));
    const e = new Error(`the server asked this device to wait ${secs} s before syncing again`);
    (e as Error & { retryAfterMs?: number }).retryAfterMs = secs * 1000;
    throw e;
  }

  private setFull(m: SyncMeta, full: { bytes: number; limit: number } | null): void {
    if (this.meta !== m) throw stopped(); // a stale 507 or 200 is the old vault's, never the new one's (round eighteen, 4)
    if (full) {
      m.vaultFull = { ...full, at: new Date().toISOString() };
      this.vaultFull = full;
    } else if (m.vaultFull) {
      delete m.vaultFull;
      this.vaultFull = null;
    }
  }

  /** The server's 507 body, if that is what this reply is. */
  private async fullFrom(r: Response): Promise<{ bytes: number; limit: number } | null> {
    if (r.status !== 507) return null;
    const b = (await r.json().catch(() => ({}))) as { bytes?: number; limit?: number };
    return { bytes: typeof b.bytes === 'number' ? b.bytes : 0, limit: typeof b.limit === 'number' ? b.limit : 0 };
  }

  private async push(m: SyncMeta): Promise<void> {
    this.waitRefusal(m);
    // A change stored as parked (one parked in an old vault and sent to a new one, a file's merged with its park) is sent
    // with its verdict (`pushBatch`), so every device parks it alike and offers Apply (round sixty-two, second pass; the
    // data review's 5: left out, a record whose own fields were parked reached a joining device as waiting for a newer
    // version of the app, with nothing to Apply).
    const todo = await this.toPush();
    this.pending = todo.length;
    let sent = 0;
    // A vault that was full last time is tried once more each run (one request); if it is still full the push stops there.
    for (let i = 0; i < todo.length; ) {
      const end = cutBefore(todo, Math.min(i + BATCH_MAX, todo.length));
      const batch = todo.slice(i, end);
      i = end;
      this.step(m, `Sending ${Math.min(i + batch.length, todo.length)} of ${todo.length} changes…`);
      sent += await this.pushBatch(m, batch);
      this.pending = todo.length - sent;
      await this.save(m);
      if (this.vaultFull) return;
    }
    // A vault that was full is probed by the next photo too: with nothing in the outbox no batch is ever sent to clear the
    // flag, and once room is made the photo would otherwise wait until the grower edits something (round fifteen, 8).
    const probing = !!this.vaultFull;
    // But at most once an hour: the probe is a whole photograph, and a run happens on every focus and every five minutes
    // while the page is open, which on mobile data would be tens of megabytes an hour to be told the vault is still full
    // (round sixteen, 13). The batch push above still probes with a small request whenever the outbox has something.
    if (probing && m.vaultFull && Date.now() - Date.parse(m.vaultFull.at) < PROBE_MS) return;
    // Photos we have that the server may not.
    const have = new Set(await photoBlobIds());
    this.noteRevived(m, have);
    await this.verifyPhotos(m, have);
    const pushed = new Set(m.photosPushed);
    // Every photograph with a record, waiting ones too: their pixels are kept for the day the record completes, and the
    // other device needs them that day (round thirty-seven, 1).
    const live = new Set(collection.knownPhotos().map((p) => p.id));
    let n = 0;
    const toSend = [...have].filter((id) => !pushed.has(id) && live.has(id)).length; // the total, so a first sync says "592 of 598", not "592…" (round twenty-nine, 13)
    for (const id of have) {
      if (pushed.has(id) || !live.has(id)) continue;
      this.step(m, `Sending photo ${++n} of ${toSend}…`);
      const b = await getPhotoBlobs(id);
      if (!b) continue;
      if (b.blob.size + b.thumb.size + SEAL_OVERHEAD > MAX_PHOTO_BYTES) {
        this.note(m, 'refused', id, `photo is ${Math.round((b.blob.size + b.thumb.size) / 1048576)} MB; the limit is ${MAX_PHOTO_BYTES / 1048576} MB`);
        continue;
      }
      const packed = packPhoto(new Uint8Array(await b.blob.arrayBuffer()), new Uint8Array(await b.thumb.arrayBuffer()));
      // The upload leaves the proof its removal must repeat: a token-holder without the key can add, never destroy (round fifty-one, 2).
      const r = await syncFetch(`${this.base}/api/sync/photo/${id}?vault=${this.k(m).id}`, { method: 'PUT', headers: { ...this.h(m), [PHOTO_DROP_HEADER]: await dropProof(this.k(m), id) }, body: (await seal(this.k(m), 'photo', packed, id)) as BodyInit }, PHOTO_MS);
      const full = await this.fullFrom(r);
      if (full) {
        this.setFull(m, full);
        await this.save(m);
        return;
      }
      if (r.ok) { m.photosPushed.push(id); this.clearRefusal(m); if (probing) this.setFull(m, null); }
      else if (r.status === 429) this.limited(r);
      else if (r.status === 503) await this.refusedBy(m, r);
      else if (r.status === 409 && (await this.serverHolds(m, id, packed))) m.photosPushed.push(id); // our own earlier send whose answer was lost: sealed again with a fresh nonce, so the bytes differ, the pixels do not
      else if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403) this.note(m, 'refused', id, `photo refused: ${r.status}`);
      else throw new Error(`photo push failed: ${r.status}`);
      await this.save(m);
    }
  }

  /**
   * Seal and send one batch. 200 means the server holds this batch under this
   * name (stored now, or already there), and only then are the changes acked.
   * A 400/409/413 is the server refusing the batch itself: it is halved and
   * each half tried, down to the one change at fault, which is noted and left
   * in the outbox while the rest of the sync goes on. A 507 is the vault being
   * full: nothing is halved; the push stops and the page says so.
   */
  private async pushBatch(m: SyncMeta, batch: Change[], mayResplit = true): Promise<number> {
    // The name the server files this under: the hour of the last edit (never the millisecond), a fixed counter, this
    // device, and twelve digits of a keyed fingerprint of the content. The fingerprint is sent in full so a re-send after
    // a lost reply is recognised as the same batch; being keyed, it is not a hash anyone could test a guessed edit against.
    const lastWall = hlcWall(batch[batch.length - 1].t);
    // The verdicts go with the changes (round sixty-two, second pass; the data review's 5). The name stays the changes'
    // alone, as /about/formats gives it: a re-send after a lost answer with a park stored meanwhile is the batch already
    // there, whose verdicts stand, and a park this device stored after the push is its own arrival's, which every peer
    // reaches alike.
    const parked = batch.filter((c) => collection.storedParks.has(c.t)).map((c) => c.t);
    const plain = await batchFingerprint(this.k(m), utf8.encode(JSON.stringify(batch)));
    const key = batchName(lastWall, collection.device, plain);
    const body = await sealJson(this.k(m), 'log', logBatch(collection.device, batch, parked), key); // bound to its name (round thirty-eight, R1-7)
    if (body.length > MAX_BATCH_BYTES && mayResplit && batch.length > 1) {
      // Too big before it ever leaves: halve it. Each half is named by its own content.
      const mid = cutBefore(batch, Math.ceil(batch.length / 2));
      return (await this.pushBatch(m, batch.slice(0, mid))) + (await this.pushBatch(m, batch.slice(mid)));
    }
    const headers: Record<string, string> = { ...this.h(m), [PUSH_HEADERS.batch]: key, [PUSH_HEADERS.plain]: plain };
    headers[PUSH_HEADERS.device] = collection.device || 'dev'; // the name's own device part
    const r = await syncFetch(`${this.base}/api/sync/log?vault=${this.k(m).id}`, { method: 'POST', headers, body: body as BodyInit }, BATCH_MS);
    if (r.ok) {
      // Acknowledged out of the outbox only while the stored sync record still carries this run's key, checked in the ack's
      // own transaction: a run of a vault this device has since left or replaced must not empty the new vault's outbox of
      // these same changes (round sixteen, 2; round seventeen, A1).
      await outboxAck(batch.map((c) => c.t), m.key);
      this.setFull(m, null);
      this.clearRefusal(m);
      if (!m.have.includes(key)) m.have.push(key);
      (m.haveAt ??= {})[key] = Date.now(); // its arrival, near enough: the server's clock and this one agree to the minute the overlap allows
      // The latest stamp in it that a clock gave, for the listing to judge against the batch's arrival (round sixty-one).
      let far = 0;
      for (const c of batch) if (!isPastStamp(c.t) && hlcWall(c.t) > far) far = hlcWall(c.t);
      (m.ownMax ??= {})[key] = far;
      return batch.length;
    }
    const full = await this.fullFrom(r);
    if (full) {
      this.setFull(m, full);
      return 0;
    }
    if (r.status === 429) this.limited(r);
    if (r.status === 503) await this.refusedBy(m, r);
    if ((r.status === 400 || r.status === 409 || r.status === 413) && mayResplit && batch.length > 1) {
      const mid = cutBefore(batch, Math.ceil(batch.length / 2)); // never between a notes change and its base (round twenty-nine, 9)
      const a = await this.pushBatch(m, batch.slice(0, mid));
      return this.vaultFull ? a : a + (await this.pushBatch(m, batch.slice(mid)));
    }
    if (r.status === 400 || r.status === 409 || r.status === 413) {
      // Noted under the last HLC, which is stable across runs.
      this.note(m, 'refused', batch[batch.length - 1].t, `the server refused ${batch.length} change${batch.length === 1 ? '' : 's'} (${r.status})`);
      return 0;
    }
    throw new Error(`push failed: ${r.status}`);
  }

  /** A 409 for a photo id: fetch what the server holds under it and compare the pixels. True when it is this very photo (a send whose answer was lost); false when something else sits there, which is the refusal it looks like. */
  private async serverHolds(m: SyncMeta, id: string, packed: Uint8Array): Promise<boolean> {
    try {
      const r = await syncFetch(`${this.base}/api/sync/photo/${id}?vault=${this.k(m).id}`, { headers: this.h(m) }, PHOTO_MS);
      if (!r.ok) return false;
      const theirs = await open(this.k(m), 'photo', new Uint8Array(await r.arrayBuffer()), id);
      if (theirs.length !== packed.length) return false;
      for (let i = 0; i < packed.length; i++) if (theirs[i] !== packed[i]) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * `have` only has to cover what a listing can show again: the overlap window before the cursor. Keys whose arrival
   * is well behind it are dropped, and so are keys with no recorded arrival (written before arrivals were kept: a
   * listing can only show them again inside the overlap, and a batch folded twice is harmless; round thirteen, 9).
   * Quarantined keys stay, whatever their age.
   */
  private pruneHave(m: SyncMeta): void {
    const at = m.haveAt ?? {};
    const floor = m.since - 10 * OVERLAP_MS;
    const keep = m.have.filter((k) => (k in at && at[k] >= floor) || m.quarantined?.some((q) => q.key === k));
    if (keep.length !== m.have.length) {
      m.have = keep;
      const set = new Set(keep);
      for (const k of Object.keys(at)) if (!set.has(k)) delete at[k];
      if (m.ownMax) for (const k of Object.keys(m.ownMax)) if (!set.has(k)) delete m.ownMax[k];
    }
  }

  /**
   * Whether a batch the listing shows is one this device pushed that may carry a change to park by its arrival: a stamp
   * read from a clock more than two days past it (round sixty-one, decision 1). Known exactly from what the push kept
   * (`ownMax`); for a batch pushed before that was kept, from the hour its name carries, which is its last change's
   * (a batch is a run of the outbox in stamp order), so a batch that cannot hold one is never fetched.
   */
  private ownToJudge(m: SyncMeta, key: string, at: number): boolean {
    const parts = key.split('-');
    if (parts[2] !== (collection.device || 'dev')) return false;
    const kept = m.ownMax?.[key];
    if (m.ownMax && kept !== undefined) delete m.ownMax[key];
    if (kept !== undefined) return kept > at + PARK_MS;
    const hour = Number(parts[0]);
    return Number.isFinite(hour) && hour + 3600_000 > at + PARK_MS;
  }

  /**
   * This device's own changes judged by the arrival of the batch that carried them, as `takeBatch` judges a peer's (round
   * sixty-one, decision 1; the clock review's 3, the second outside review's 7). The writer never learned its arrivals, so
   * it showed its own year-ahead value over every edit from a correct device while every peer had parked it. The listing
   * says when each batch arrived; a batch of this device's that may hold a stamp more than two days past that is fetched
   * again (the same bytes every peer read) and those stamps are parked here too, stored, and listed with Apply, so the
   * writer and its peers agree. A fetch that fails is tried again next run; nothing else of the batch is written.
   */
  private async judgeOwn(m: SyncMeta): Promise<void> {
    const todo = Object.entries(m.ownJudge ?? {});
    if (!todo.length) return;
    let parkedAny = false;
    for (const [key, at] of todo) {
      this.step(m, 'Checking this device\'s own changes against when they reached the server…');
      let res: Response;
      try {
        res = await syncFetch(`${this.base}/api/sync/log/${key}?vault=${this.k(m).id}`, { headers: this.h(m) }, BATCH_MS);
      } catch (e) {
        if (e instanceof StoppedError || this.meta !== m) throw e;
        continue; // not reached this time: asked again next run
      }
      if (res.status === 429) this.limited(res);
      if (res.status === 404) { delete m.ownJudge![key]; continue; } // nothing there to judge
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const keys = this.k(m);
      let changes: Change[];
      let verdicts: Set<string>;
      try {
        const batch = await openJson<{ v: number; device: string; changes: unknown; parked?: unknown }>(keys, 'log', bytes, key);
        if (!batch || typeof batch !== 'object' || !BATCH_VERSIONS.includes(batch.v)) throw new Error('not a batch this version understands');
        changes = readChanges(batch.changes).changes;
        verdicts = parkedVerdicts(batch.parked);
      } catch {
        delete m.ownJudge![key]; // bytes this device cannot open: no peer can fold them either, and there is nothing to judge
        continue;
      }
      const hold = this.hold(at);
      // Skipping only what is stored as parked: a clock-only park in this tab's memory is judged by the arrival too, and
      // stored, as every peer stores it (round sixty-two; the clock review's 1, A14).
      const parked = changes.filter((c) => (isParked(c.t, hold) || verdicts.has(c.t)) && !collection.storedParks.has(c.t));
      if (parked.length) {
        // Into the log as they are (they are this device's own, normally there already), then parked, in the order a
        // peer's are: a change parked here must be in the log to be listed and applied.
        await appendChanges(parked, true, false, m.key);
        await collection.markParked(parked);
        parkedAny = true;
      }
      delete m.ownJudge![key];
      await this.save(m);
    }
    // The fold of this tab had them as ordinary changes (or as parks of this load alone): it is read again (the other tabs
    // are told by the park), once, at the end of the pull.
    if (parkedAny) this.foldStale = true;
  }

  /** Once per device: list the whole vault for this device's own batches pushed before it judged them by their arrival (round sixty-one). Only the listing; nothing is fetched unless a batch may hold a far stamp. */
  private async listOwnOnce(m: SyncMeta): Promise<void> {
    let after: { at: number; key: string } | null = null;
    for (;;) {
      this.step(m, 'Checking this device\'s own changes against when they reached the server…');
      const q = 'since=' + (after ? `&after=${listAfter(after.at, after.key)}` : '');
      const r = await syncFetch(`${this.base}/api/sync/log?vault=${this.k(m).id}&${q}`, { headers: this.h(m) });
      if (r.status === 429) this.limited(r);
      if (!r.ok) return; // tried again next run
      const { batches, more, next } = (await r.json()) as { batches: Array<{ key: string; at: number }>; more: boolean; next?: { at: number; key: string } };
      for (const b of batches) if (this.ownToJudge(m, b.key, b.at)) (m.ownJudge ??= {})[b.key] = b.at;
      if (!more || !batches.length) break;
      const last = next ?? { at: batches[batches.length - 1].at, key: batches[batches.length - 1].key };
      if (after && last.at === after.at && last.key === after.key) break;
      after = last;
    }
    m.ownListed = true;
    await this.save(m);
  }

  /**
   * Fetch one batch by key and fold it. The bytes are read before anything is judged: a connection that drops mid-body
   * throws here, the run stops, and the batch is fetched again next run. Only bytes that arrived whole and cannot be
   * opened are set aside (by name, so they never block what came after them). True when the batch folded.
   */
  private async takeBatch(m: SyncMeta, key: string, arrival?: number): Promise<boolean> {
    const res = await syncFetch(`${this.base}/api/sync/log/${key}?vault=${this.k(m).id}`, { headers: this.h(m) }, BATCH_MS);
    if (res.status === 429) this.limited(res);
    if (!res.ok) throw new Error(`batch ${key}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let changes: Change[] | null = null;
    let verdicts = new Set<string>();
    const keys = this.k(m); // outside the try: a stale run stops here, and is never read as bad ciphertext (round eighteen, 4)
    try {
      const batch = await openJson<{ v: number; device: string; changes: unknown; parked?: unknown }>(keys, 'log', bytes, key); // opened under its own name only (round fifty-seven)
      // Versions 1 and 2 (a batch with a marked stamp, round sixty-two); any other is set aside for a later build to read.
      if (!batch || typeof batch !== 'object' || !BATCH_VERSIONS.includes(batch.v)) throw new Error('not a batch this version understands');
      const read = readChanges(batch.changes);
      // A batch with anything in it this build cannot read is set aside whole, under its name, for a later build to
      // read again: folding the rest and moving the cursor past it would lose the change on this device for good
      // (round thirty, 1). Nothing is mended (round fifty-seven): a value of a type its field never takes gets here.
      if (read.dropped.length) throw new Error(read.dropped[0]);
      changes = read.changes;
      verdicts = parkedVerdicts(batch.parked);
    } catch (e) {
      this.note(m, 'quarantined', key, e instanceof Error ? e.message : String(e));
      return false;
    }
    // Storing can fail (a full phone). That is not the batch's fault: nothing is noted, the cursor stays before it,
    // and the error stops this run, so the next run fetches it again.
    // Never fold a batch of a vault this device has left into a log that has since been replaced: the key is checked
    // inside the write's own transaction (round sixteen, 1; round seventeen, A1).
    const hold = this.hold(arrival);
    // A change stamped more than two days (PARK_MS) past the batch's arrival at the server is a broken clock's: into the log, never
    // into the fold, listed on its record with Apply (round fifty-two, 1). The same on every device, since the arrival
    // is the server's.
    // And a change its sender holds as parked, by the verdict the batch carries (round sixty-two, second pass; the data
    // review's 5), stored as a backup's verdicts are.
    const parkedHere = (c: Change) => isParked(c.t, hold) || verdicts.has(c.t);
    const parked = changes.filter(parkedHere);
    if (parked.length) {
      await appendChanges(parked, true, false, m.key);
      // One this tab had already folded as ordinary (its own push whose answer was lost, a file's change): the fold is read
      // again at the end of the pull, as judgeOwn's is (round sixty-two; the clock review's 9).
      if (await collection.markParked(parked)) this.foldStale = true;
      changes = changes.filter((c) => !parkedHere(c));
    }
    // Every change goes through the collection's own ingest, those stamped too far ahead of this clock too: the fold holds
    // them as it does at load (into the log, not into the state, until the clock reaches them), and lists them as held, so
    // the grower's next edit to that field is stamped past one within a day. Appended here on their own, as before round
    // fifty-eight, they never reached the fold's held list, and that edit lost when they came due (the client review's
    // finding 8). The engine keeps its own list of them, to fold each as it comes due.
    const ahead = changes.filter((c) => isHeld(c.t, hold));
    if (changes.length) await collection.ingest(changes, 'server', { requireKey: m.key });
    if (ahead.length) {
      for (const c of ahead) if (!m.held?.includes(c.t)) (m.held ??= []).push(c.t);
      this.setHeld();
    }
    return true;
  }

  /** Returns how many batches were folded this run. */
  private async pull(m: SyncMeta): Promise<number> {
    let got = 0;
    this.clockAhead = null; // this run's listings decide it afresh
    const whole = !m.since; // a listing from the start sees every batch of this device's too
    // The first page of a run starts a minute before the cursor; later pages continue strictly after the last batch listed.
    let after: { at: number; key: string } | null = null;
    for (;;) {
      this.step(m, 'Checking for changes…');
      // `since` goes with every page so a server that does not know `after` still answers the old way.
      const q = `since=${m.since || ''}` + (after ? `&after=${listAfter(after.at, after.key)}` : '');
      const r = await syncFetch(`${this.base}/api/sync/log?vault=${this.k(m).id}&${q}`, { headers: this.h(m) });
      if (r.status === 429) this.limited(r);
      if (!r.ok) throw new Error(`pull failed: ${r.status}`);
      const { batches, more, next } = (await r.json()) as { batches: Array<{ key: string; at: number }>; more: boolean; next?: { at: number; key: string } };
      // The clock the arrivals are judged against is the server's own, from the answer's Date header, not this device's:
      // a device clock far behind the server made every arrival look far ahead and parked the cursor for good (round forty, R1-6).
      const dateHeader = Date.parse(r.headers.get('date') ?? '');
      const serverNow = dateHeader || Date.now();
      // And the clock holds are judged by, from here on: a device set years ahead stamped its changes so, judged
      // them against its own clock and saw nothing wrong, while every other device held them (round forty-nine, 1).
      // Only from an answer that carries a Date: one without (a dev server) leaves the correction as it was, rather
      // than resetting it mid-run (round fifty-one, 1). A correction that changes re-folds the log, since the holds
      // were judged by the old clock: a device hours behind held its peers' latest changes at load.
      // One reading per run: the pages of one pull are seconds apart and would count as the two readings a large
      // correction needs (round fifty-two, 1).
      if (dateHeader && !after) {
        const wasOff = clockOffsetMs(), folds = this.clockFolds;
        if (trustServerTime(serverNow) !== wasOff || this.clockFolds !== folds) {
          if (clockOffsetMs() === 0) this.clockWarning = null;
          this.warnClock('');
          // One refold per change of the clock in force: the listener began it inside the reading, and the pull waits for
          // that one (round sixty-two; the clock review's 5, A17). An engine with no listener (none hooked) folds here.
          if (this.clockFolds !== folds) await this.clockFold;
          else { await collection.rebuild(); await this.scanClock(); }
          if (this.meta !== m) throw stopped();
          await this.refold(m);
        }
      }
      const have = new Set(m.have);
      const fresh = batches.filter((b) => !have.has(b.key));
      let n = 0;
      try {
        for (const b of batches) {
          if (!have.has(b.key)) {
            this.step(m, `Receiving ${++n} of ${fresh.length}…`);
            if (await this.takeBatch(m, b.key, b.at)) got++;
            m.have.push(b.key);
            have.add(b.key);
          } else if (this.ownToJudge(m, b.key, b.at)) (m.ownJudge ??= {})[b.key] = b.at; // this device's own, judged below by this arrival
          (m.haveAt ??= {})[b.key] = b.at;
          // The cursor never moves past this clock by more than the slack: one listing with a far-future arrival (a server
          // clock, or a listing shaped by whoever holds the token) would otherwise make every later `since=` answer empty for
          // good, silently (round thirty-eight, R1-5). Such an arrival leaves the cursor where it was and is said on the sync
          // page; the batch itself is folded like any other, and `have` keeps it from folding twice when it is listed again.
          const cap = serverNow + CURSOR_SLACK_MS;
          if (b.at > cap) this.clockAhead = `The server dated a batch ${Math.round((b.at - serverNow) / 60000)} minutes ahead of its own clock; the batch was read, and the cursor stays before it, so listings are longer until that is sorted out.`;
          else if (b.at > m.since) m.since = b.at;
        }
      } finally {
        // One write per page, not per batch (round twelve, 10). A run that stops mid-page keeps what it applied: a
        // batch applied and not recorded is fetched again and folded again, which the log makes harmless.
        this.pruneHave(m);
        await this.save(m);
      }
      if (!more || !batches.length) break;
      const last = next ?? { at: batches[batches.length - 1].at, key: batches[batches.length - 1].key };
      if (after && last.at === after.at && last.key === after.key) break; // no progress (a server without the cursor): stop rather than spin
      after = last;
    }
    if (whole && !m.ownListed) { m.ownListed = true; await this.save(m); }
    else if (!m.ownListed) await this.listOwnOnce(m);
    await this.judgeOwn(m);
    // A batch set aside by an earlier build may be one this build can read (a newer batch format, a kind it did not
    // know). It arrived long before the cursor, so a listing would never show it again: it is fetched by key, after the
    // listing so that new changes arrive even while an old batch keeps failing, and it leaves the quarantine only once it
    // has folded. A transient failure (a 429, a 5xx, a dropped connection) leaves the entry exactly as it was, to be tried
    // next run; only bytes read whole that this build cannot open are re-noted under this build (round fourteen, 1; the
    // round-thirteen version removed the entry first, and a throw then lost it).
    // Batches only: a photograph set aside is retried by the photo pull below, not fetched as if it were a batch (round
    // fifteen, 6: every deploy is a new build, and one photo entry ended every run on the device with a failed fetch).
    // A failure to re-read one key does not end the run: the entry stands, the failure is noted, and the number repair
    // and the photo pull still happen; only a 429 stops the run, since that is the server asking for time.
    const isPhoto = (q: { kind?: string }) => q.kind === 'photo';
    for (const q of (m.quarantined ?? []).filter((q) => q.build !== BUILD && !isPhoto(q))) {
      this.step(m, 'Reading again a batch an earlier version of the app could not read…'); // said plainly, not "set aside" by a "build" (round fifty-eight; the accessibility review)
      let ok: boolean;
      try {
        ok = await this.takeBatch(m, q.key, m.haveAt?.[q.key]);
      } catch (e) {
        if ((e as { retryAfterMs?: number })?.retryAfterMs) throw e;
        if (e instanceof StoppedError || this.meta !== m) throw e; // a stop, from this tab (the meta gone) or another (the stored key gone, seen inside the vault write): the run must not go on into the number repair (round twenty-one, 4; round twenty-two, 8)
        console.warn(`set-aside batch ${q.key} could not be read again this run: ${e instanceof Error ? e.message : String(e)}`);
        continue; // the entry stands, whatever the failure: a 5xx, a dropped connection, or a 4xx for a batch the server no longer holds
      }
      if (ok) {
        got++;
        m.quarantined = m.quarantined!.filter((x) => x.key !== q.key);
        if (!m.have.includes(q.key)) m.have.push(q.key);
      } else {
        const entry = m.quarantined!.find((x) => x.key === q.key);
        if (entry) entry.build = BUILD; // read again by this build and still unreadable: noted as this build's
      }
      this.quarantined = [...(m.quarantined ?? [])];
      await this.save(m);
    }
    if (this.foldStale) { this.foldStale = false; await collection.rebuild(); await this.scanClock(); }
    // Two records a pull leaves under one number are not repaired here: a pull writes what arrived and nothing more (rule
    // 5). The record's page says the number is shared and offers "Renumber now" (round fifty-nine; two reviews agreed).
    // Photos that records mention and we lack.
    const have = new Set(await photoBlobIds());
    const missing = collection.knownPhotos().filter((p) => !have.has(p.id));
    for (let i = 0; i < missing.length; i++) {
      this.step(m, `Receiving photo ${i + 1} of ${missing.length}…`);
      const p = missing[i];
      const setAside = m.quarantined?.find((q) => q.key === p.id);
      if (setAside && setAside.build === BUILD) continue; // set aside by this build: not asked for again
      if (setAside) { m.quarantined = m.quarantined!.filter((q) => q.key !== p.id); this.quarantined = [...m.quarantined]; } // another build's: read again; set aside afresh below if still unreadable
      const r = await syncFetch(`${this.base}/api/sync/photo/${p.id}?vault=${this.k(m).id}`, { headers: this.h(m) }, PHOTO_MS);
      if (r.status === 404) continue; // not uploaded from its device yet
      if (r.status === 429) this.limited(r);
      if (!r.ok) throw new Error(`photo ${p.id}: ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer()); // read whole before it is judged: a dropped connection stops the run and it is fetched again
      let pixels: { full: Uint8Array; thumb: Uint8Array } | null = null;
      const keys = this.k(m);
      try {
        pixels = unpackPhoto(await open(keys, 'photo', bytes, p.id));
        // The record says what the pixels hash to; a server cannot swap one photo for another.
        if (p.sha && (await sha256hex(pixels.full)) !== p.sha) throw new Error('pixels do not match the record');
      } catch (e) {
        this.note(m, 'quarantined', p.id, `photo: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (pixels) {
        // A failed write is storage, not the photo: not quarantined, and the run stops so it is fetched again.
        await putPhotoBlobs({ id: p.id, blob: new Blob([pixels.full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([pixels.thumb as BlobPart], { type: 'image/jpeg' }) });
        m.photosPushed.push(p.id); // it is on the server already; never push it back
      }
      await this.save(m);
    }
    await this.dropRemoved(m, have);
    return got;
  }

  /**
   * A photograph whose removal this device has seen, live again and with pixels here, is asked about before its upload
   * record is trusted: one HEAD each, and a 404 (a peer had the bytes dropped meanwhile) takes it off `photosPushed` so
   * the push below sends it. Covers the cases the last-run list below cannot: a removal pushed but never followed by a
   * successful pull, and a revival made on a device that never saw the removal folded (round fifty-two, 2).
   */
  private async verifyPhotos(m: SyncMeta, have: Set<string>): Promise<void> {
    const ids = collection.unverifiedPhotos();
    if (!ids.length) return;
    const live = new Set(collection.knownPhotos().map((p) => p.id));
    const done: string[] = [];
    const removedAt = new Map((await this.removedAt(m)).map((r) => [r.id, r.at]));
    for (const id of ids) {
      if (!live.has(id)) {
        // Still removed: kept while an Undo could bring the pixels back here; past that window, with no pixels, there is nothing this device could send.
        if (!have.has(id) && nowMs() - (removedAt.get(id) ?? 0) > DROP_AFTER_MS) done.push(id);
        continue;
      }
      if (!have.has(id)) { done.push(id); continue; } // live, no pixels here: another device's to send
      const r = await syncFetch(`${this.base}/api/sync/photo/${id}?vault=${this.k(m).id}`, { method: 'HEAD', headers: this.h(m) });
      if (r.status === 429) this.limited(r);
      if (r.status === 404) { m.photosPushed = m.photosPushed.filter((x) => x !== id); m.photosDropped = (m.photosDropped ?? []).filter((x) => x !== id); done.push(id); }
      else if (r.ok) done.push(id);
      // any other answer: asked again next run
    }
    if (this.meta !== m) throw stopped();
    await collection.verifiedPhotos(done);
  }

  /**
   * A photograph seen removed at the last run and live again now (an Undo, a restore), with its pixels still here, is
   * sent again whatever `photosPushed` says. Another device may have folded the removal, dropped its pixels and asked the
   * server to drop the bytes in between; without this no device ever uploaded it again, and the record showed blank
   * everywhere but here, for good (round fifty-one, 2).
   */
  private noteRevived(m: SyncMeta, have: Set<string>): void {
    if (!m.photosRemoved?.length) return;
    const removedNow = new Set(collection.removedPhotos().map((r) => r.id));
    const live = new Set(collection.knownPhotos().map((p) => p.id));
    for (const id of m.photosRemoved) {
      if (removedNow.has(id) || !live.has(id) || !have.has(id)) continue;
      m.photosPushed = m.photosPushed.filter((x) => x !== id);
      m.photosDropped = (m.photosDropped ?? []).filter((x) => x !== id);
    }
  }

  /**
   * A removed photograph's pixels are bytes nothing names: they go from this device, and the server is asked to drop
   * its copy once the removal is old enough that an Undo is past (round forty-nine, 1). The server's 404 counts as
   * done. The id leaves `photosPushed`, so a record brought back later is pushed again from a device that kept the pixels.
   */
  private async dropRemoved(m: SyncMeta, have: Set<string>): Promise<void> {
    const dropped = new Set(m.photosDropped ?? []);
    let changed = false;
    const seenBefore = JSON.stringify(m.removedSeen ?? {});
    const removed = await this.removedAt(m);
    if (JSON.stringify(m.removedSeen ?? {}) !== seenBefore) changed = true;
    const removedNow = new Set(removed.map((r) => r.id));
    if (!sameList(m.photosRemoved ?? [], [...removedNow])) { m.photosRemoved = [...removedNow]; changed = true; }
    for (const { id, at } of removed) {
      if (have.has(id)) { await deletePhotoBlobs(id).catch(() => {}); collection.forgetPhotoUrls(id); }
      if (dropped.has(id) || nowMs() - at < DROP_AFTER_MS) continue;
      const asked = m.asked409?.[id];
      if (asked !== undefined && Date.now() - asked < ASK_409_MS && asked <= Date.now()) continue; // answered "kept" within the hour (by any tab, before any reload): not asked again yet
      // With the removal's own time, so the server can tell a removal made before a newer upload of this photograph from
      // another device, and leave the newer one (round sixty; the stale DELETE in both outside reviews).
      const r = await syncFetch(`${this.base}/api/sync/photo/${id}?vault=${this.k(m).id}`, { method: 'DELETE', headers: { ...this.h(m), [PHOTO_DROP_HEADER]: await dropProof(this.k(m), id), [PHOTO_REMOVED_AT_HEADER]: String(Math.round(at)) } });
      if (r.status === 429) this.limited(r);
      if (this.meta !== m) throw stopped();
      if (r.status === 503) continue; // the photograph is being stored or removed elsewhere this moment: asked again next run, nothing to report
      if (r.status === 409) {
        // The server holds an upload of this photograph claimed after the removal: a revival (an Undo or an edit elsewhere
        // brought it back), or its first upload landing late, after a peer had already removed its record. Not final
        // (round sixty-one; decision 5, the server review's 1 and the second outside review's 9: taken as done, a late
        // first upload stayed on the server for good). A revival makes the record live again and this loop stops asking;
        // a late upload's claim lapses and the next request removes it. Asked again at a later run, at most hourly, kept in
        // the sync record (round sixty-two; the server review's 10, A5).
        (m.asked409 ??= {})[id] = Date.now();
        changed = true;
        continue;
      }
      if (r.status === 403) {
        // Under another vault's proof: the bytes stay, counted, and the sync page says so once (round fifty-one, 2).
        this.note(m, 'refused', id, 'photo: the server kept the bytes of a removed photograph, since the removal proof did not match the one its upload left');
      } else if (!r.ok && r.status !== 404) {
        // A failed removal is a note, not a failed run: the pull succeeded, and the bytes are asked for again next run (round fifty-one, 2).
        this.lastError = `photo ${id} removal: ${r.status} (tried again next time)`;
        continue;
      }
      (m.photosDropped ??= []).push(id);
      m.photosPushed = m.photosPushed.filter((x) => x !== id);
      if (m.asked409?.[id] !== undefined) delete m.asked409[id];
      changed = true;
    }
    // What is no longer removed is no longer asked about.
    for (const rec of ['asked409', 'removedSeen'] as const) for (const id of Object.keys(m[rec] ?? {})) if (!removedNow.has(id)) { delete m[rec]![id]; changed = true; }
    if (changed) await this.save(m);
  }
  /**
   * The removed photographs with the time each removal was made, as near as this device can say: the removal's wall, or,
   * for a removal stamped past another (marked, its wall as far ahead as the stamp it was placed after), the earlier of
   * that and when this device first saw it, noted in the sync record (round sixty-two; the clock review's 15: a removal
   * placed past a stamp a year ahead kept its bytes on the server for that year, and was then sent as made a year ahead).
   * Since round sixty-three a removal carries the time it was made (`w`, outside review B9), and a marked one is dated by
   * the earlier of that and the first sighting; one written before carries none and is dated as before. A `w` is the
   * writer's clock as it stood, and a peer's fast clock that never synced writes one ahead of now: taken alone it held the
   * server's bytes until that time, the very wait round sixty-two closed (round sixty-three; the fix pass, R2 7).
   */
  private async removedAt(m: SyncMeta): Promise<Array<{ id: string; at: number }>> {
    const removed = collection.removedPhotos();
    const marked = removed.flatMap((r) => (r.marked && r.t ? [r.t] : []));
    const made = marked.length ? await collection.recordedTimes(marked).catch(() => new Map<string, number>()) : new Map<string, number>();
    return removed.map((r) => {
      if (!r.marked) return { id: r.id, at: r.at };
      const w = r.t ? made.get(r.t) : undefined;
      const seen = (m.removedSeen ??= {})[r.id] ?? (m.removedSeen[r.id] = nowMs());
      return { id: r.id, at: Math.min(w ?? r.at, seen) };
    });
  }
}
/** A span in the largest whole unit that reads: "8760 hours" said nothing a reader could use (round fifty-two, 1). */
export function spanWords(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 2) return 'about a minute';
  if (mins < 120) return `${mins} minutes`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} days`;
  const months = Math.round(days / 30.4);
  if (months < 11) return `about ${months} months`;
  const years = days / 365.25;
  return years < 1.5 ? 'about a year' : `about ${Math.round(years)} years`;
}
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/** How old a photograph's removal must be before the server is asked to drop the bytes: past any Undo. */
const DROP_AFTER_MS = 10 * 60_000;
/** How long after a 409 ("an upload claimed after the removal is kept") a removed photograph is asked about again: a run is minutes apart, and a request per removed photograph per run would spend the address's allowance (round sixty-one). */
const ASK_409_MS = 3600_000;

const stopped = () => new StoppedError();
/** A full vault is probed with a photograph at most this often. */
const PROBE_MS = 3600_000;


export const sync = new Sync();
