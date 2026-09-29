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
 * the clock reaches it. A pull writes such changes straight to the log and
 * ingests only the rest; the collection's own fold skips them on load (see
 * `apply()` in core/log). This engine keeps the list, re-folds what has come
 * due at the start of every run, and the sync page says how many are waiting.
 *
 * Photos: by id, immutable. Push what we have that the server lacks; pull
 * what records mention that we lack.
 */
import { collection } from '$lib/db/collection.svelte';
import { StoppedError, getMeta, setMeta, setMetaIfKey, getPhotoBlobs, putPhotoBlobs, photoBlobIds, outboxKeys, outboxAck, outboxFill, outboxClear, changesByKeys, allChanges, appendChanges, onOtherTabWrite, announceSyncForgotten } from '$lib/db/vault';
import { deriveKeys, sealJson, openJson, seal, open, packPhoto, unpackPhoto, parseVaultKey, batchFingerprint, sha256hex, type VaultKeys } from './crypto';
import { MAX_BATCH_BYTES, MAX_PHOTO_BYTES, SEAL_OVERHEAD, OVERLAP_MS, PUSH_HEADERS, batchName, listAfter, logBatch } from './limits';
import { readChanges, isHeld, dueAt, hlcWall, type Change } from '$core/log';
import { hlcCompare, MAX_AHEAD_MS } from '$core/hlc';
import type { Photo } from '$lib/db/types';
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
  quarantined?: Array<{ key: string; error: string; at: string; build?: string; /** what the key names; an entry without it from before round fifteen is told by its error text */ kind?: 'batch' | 'photo' }>;
  /** Things the server refused to take from this device, by name, with why. They stay in the outbox; the rest of a sync goes on. */
  refused?: Array<{ key: string; error: string; at: string }>;
  /** HLCs of stored changes the fold is holding back because they are stamped too far ahead of this device's clock. */
  held?: string[];
  /** The server said the vault is full: what it held and the limit, in bytes. Cleared when a push is taken again. */
  vaultFull?: { bytes: number; limit: number; at: string };
  photosPushed: string[];
  lastSync: string | null;
}

const META = 'sync';
/**
 * Where a batch may be cut: never between a notes change and the `notesBase` that follows it for the same record, since
 * a base that arrives in a later pull would make the edit look blind (round twenty-six, 2). Returns the index to cut
 * before, at most one step back from `at`; a cut that cannot move (a two-change batch) stays where it is.
 */
export function cutBefore(list: Change[], at: number): number {
  if (at <= 0 || at >= list.length) return at;
  const writer = (c: Change) => c.t.slice(c.t.lastIndexOf('-') + 1);
  // Any base within a few steps after the cut whose own notes change sits before it: the cut moves before that notes
  // change. The pair need not be adjacent (another tab's change stamped in the same millisecond can sit between them)
  // and the base need not be the first change after the cut (round twenty-eight, 0; round twenty-nine, 9).
  for (let j = at; j < Math.min(list.length, at + 8); j++) {
    const base = list[j];
    if (base.field !== 'notesBase') continue;
    for (let i = j - 1; i >= Math.max(0, j - 8); i--) {
      const c = list[i];
      if (c.kind !== base.kind || c.id !== base.id) continue;
      if (c.field === 'notes' && writer(c) === writer(base)) {
        if (i < at) return i >= 1 ? i : j + 1 < list.length ? j + 1 : at; // a pair that starts the batch is kept whole by cutting after it instead
        break;
      }
      if (c.field === 'notes' || c.field === 'notesBase') break; // another edit of the same notes: the pair is not this one
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

class Sync {
  configured = $state(false);
  private gen = 0;
  busy = $state<string | null>(null);
  lastSync = $state<string | null>(null);
  lastError = $state<string | null>(null);
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
  quarantined = $state<Array<{ key: string; error: string; at: string }>>([]);
  /** What the server refused from this device. */
  refused = $state<Array<{ key: string; error: string; at: string }>>([]);
  /** Changes stored here but held out of the fold because a peer's clock was ahead; and when the last of them comes due (ms). */
  held = $state(0);
  heldUntil = $state<number | null>(null);
  /** This device's own clock has jumped back behind its last stamp; a sentence for the sync page, or null. */
  clockWarning = $state<string | null>(null);
  /** The server has no room for more from this vault; what it holds and the limit, in bytes. */
  vaultFull = $state<{ bytes: number; limit: number } | null>(null);
  vaultId = $state('');
  keys: VaultKeys | null = null;
  private meta: SyncMeta | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unhook: (() => void) | null = null;
  private listening = false;
  private base = '';

  /** Read the stored key, if any, and start listening for local changes. Safe to call more than once. */
  async init(base = ''): Promise<void> {
    this.base = base;
    if (this.meta) return;
    this.wasIn = (await getMeta<{ vaultId: string; at: string; why: 'stopped' | 'replaced' }>(WAS)) ?? null;
    const m = await getMeta<SyncMeta & { own?: string[]; cursor?: string; firstPushDone?: boolean }>(META);
    if (m?.key) {
      // Meta written by the HLC-cursor engine: carry the key, start the arrival cursor from zero (a re-list is idempotent).
      if (!Array.isArray(m.have)) {
        this.meta = { key: m.key, since: 0, have: m.own ?? [], photosPushed: m.photosPushed ?? [], lastSync: m.lastSync ?? null };
        if (m.firstPushDone === false) await outboxFill();
        await setMeta(META, this.meta);
      } else this.meta = m;
      this.keys = await deriveKeys(m.key);
      this.keysOf.set(this.meta!, this.keys); // the meta this engine holds, which the conversion branch just replaced (round eighteen, 12)
      this.vaultId = this.keys.id;
      this.lastSync = m.lastSync;
      this.quarantined = this.meta.quarantined ?? [];
      this.refused = this.meta.refused ?? [];
      this.vaultFull = this.meta.vaultFull ? { bytes: this.meta.vaultFull.bytes, limit: this.meta.vaultFull.limit } : null;
      this.configured = true;
      this.hook();
      await this.scanClock();
      await this.countPending();
    }
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
    const key = parseVaultKey(vaultKey);
    if (!key) throw new Error('That is not a vault key.');
    const keys = await deriveKeys(key);
    const r = await fetch(`${this.base}/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: keys.id, token: keys.token, create: mode === 'create' }) });
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
      await outboxFill(); // everything on this device goes up first
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

  private hold() {
    return { now: Date.now(), except: collection.device };
  }

  /**
   * Once, from the whole log: which stored changes the fold is holding (a
   * peer's, stamped too far ahead) and whether this device's own last stamp is
   * ahead of its clock (the clock jumped back; its next edits will still be
   * stamped ahead, and will win over later ones elsewhere until real time
   * catches up).
   */
  private async scanClock(): Promise<void> {
    if (!this.meta) return;
    await collection.load();
    const all = await allChanges();
    const hold = this.hold();
    const held = new Set(this.meta.held ?? []);
    let ownLast = '';
    for (const c of all) {
      if (isHeld(c.t, hold)) held.add(c.t);
      else if (hold.except && ownStamp(c.t, hold.except) && hlcCompare(c.t, ownLast) > 0) ownLast = c.t;
    }
    this.meta.held = [...held];
    this.setHeld();
    this.warnClock(ownLast);
  }

  /** Changes this device just wrote or imported: a restore can carry a peer's ahead-stamped changes; its own stamps show whether its clock is behind. */
  private noteAhead(changes: Change[]): void {
    if (!this.meta) return;
    const hold = this.hold();
    let ownLast = '';
    let added = false;
    for (const c of changes) {
      if (isHeld(c.t, hold)) {
        if (!this.meta.held?.includes(c.t)) (this.meta.held ??= []).push(c.t);
        added = true;
      } else if (hold.except && ownStamp(c.t, hold.except) && hlcCompare(c.t, ownLast) > 0) ownLast = c.t;
    }
    if (added) this.setHeld();
    this.warnClock(ownLast);
  }

  private warnClock(ownLast: string): void {
    if (ownLast && hlcWall(ownLast) > Date.now() + MAX_AHEAD_MS) {
      const until = new Date(hlcWall(ownLast));
      this.clockWarning = `This device's clock appears to have jumped back; edits it made before ${until.toLocaleString()} keep their stamps, and a later edit to the same field is stamped just past them.`;
    }
  }

  private setHeld(): void {
    const held = this.meta?.held ?? [];
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
    if (changes.length) await collection.ingest(changes, 'server');
    m.held = m.held.filter((t) => !due.includes(t));
    this.setHeld();
    await this.save(m);
  }

  async run(): Promise<void> {
    if (!this.configured || !this.keys || !this.meta || this.busy) return;
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
      m.lastSync = new Date().toISOString();
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
        this.lastError = e instanceof Error ? e.message : String(e);
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
    const pushed = new Set(m.photosPushed);
    const live = new Set(collectionPhotos().map((p) => p.id));
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
      const r = await fetch(`${this.base}/api/sync/photo/${id}?vault=${this.k(m).id}`, { method: 'PUT', headers: this.h(m), body: (await seal(this.k(m), 'photo', packed, id)) as BodyInit });
      const full = await this.fullFrom(r);
      if (full) {
        this.setFull(m, full);
        await this.save(m);
        return;
      }
      if (r.ok) { m.photosPushed.push(id); if (probing) this.setFull(m, null); }
      else if (r.status === 429) this.limited(r);
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
    const plain = await batchFingerprint(this.k(m), utf8.encode(JSON.stringify(batch)));
    const key = batchName(lastWall, collection.device, plain);
    const body = await sealJson(this.k(m), 'log', logBatch(collection.device, batch));
    if (body.length > MAX_BATCH_BYTES && mayResplit && batch.length > 1) {
      // Too big before it ever leaves: halve it. Each half is named by its own content.
      const mid = cutBefore(batch, Math.ceil(batch.length / 2));
      return (await this.pushBatch(m, batch.slice(0, mid))) + (await this.pushBatch(m, batch.slice(mid)));
    }
    const headers: Record<string, string> = { ...this.h(m), [PUSH_HEADERS.batch]: key, [PUSH_HEADERS.plain]: plain };
    if (collection.device) headers[PUSH_HEADERS.device] = collection.device;
    const r = await fetch(`${this.base}/api/sync/log?vault=${this.k(m).id}`, { method: 'POST', headers, body: body as BodyInit });
    if (r.ok) {
      // Acknowledged out of the outbox only while the stored sync record still carries this run's key, checked in the ack's
      // own transaction: a run of a vault this device has since left or replaced must not empty the new vault's outbox of
      // these same changes (round sixteen, 2; round seventeen, A1).
      await outboxAck(batch.map((c) => c.t), m.key);
      this.setFull(m, null);
      if (!m.have.includes(key)) m.have.push(key);
      (m.haveAt ??= {})[key] = Date.now(); // its arrival, near enough: the server's clock and this one agree to the minute the overlap allows
      return batch.length;
    }
    const full = await this.fullFrom(r);
    if (full) {
      this.setFull(m, full);
      return 0;
    }
    if (r.status === 429) this.limited(r);
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
      const r = await fetch(`${this.base}/api/sync/photo/${id}?vault=${this.k(m).id}`, { headers: this.h(m) });
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
    }
  }

  /**
   * Fetch one batch by key and fold it. The bytes are read before anything is judged: a connection that drops mid-body
   * throws here, the run stops, and the batch is fetched again next run. Only bytes that arrived whole and cannot be
   * opened are set aside (by name, so they never block what came after them). True when the batch folded.
   */
  private async takeBatch(m: SyncMeta, key: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/sync/log/${key}?vault=${this.k(m).id}`, { headers: this.h(m) });
    if (res.status === 429) this.limited(res);
    if (!res.ok) throw new Error(`batch ${key}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let changes: Change[] | null = null;
    const keys = this.k(m); // outside the try: a stale run stops here, and is never read as bad ciphertext (round eighteen, 4)
    try {
      const batch = await openJson<{ v: number; device: string; changes: unknown }>(keys, 'log', bytes);
      if (!batch || typeof batch !== 'object' || batch.v !== 1) throw new Error('not a batch this version understands');
      const read = readChanges(batch.changes);
      // A batch with anything in it this build cannot read is set aside whole, under its name, for a later build to
      // read again: folding the rest and moving the cursor past it would lose the change on this device for good
      // (round thirty, 1). Values are mended first (a number for text, an older importer's words), so only a value of
      // a type its field never takes gets here.
      if (read.dropped.length) throw new Error(read.dropped[0]);
      changes = read.changes;
    } catch (e) {
      this.note(m, 'quarantined', key, e instanceof Error ? e.message : String(e));
      return false;
    }
    // Storing can fail (a full phone). That is not the batch's fault: nothing is noted, the cursor stays before it,
    // and the error stops this run, so the next run fetches it again.
    // Never fold a batch of a vault this device has left into a log that has since been replaced: the key is checked
    // inside the write's own transaction (round sixteen, 1; round seventeen, A1).
    const hold = this.hold();
    const ahead = changes.filter((c) => isHeld(c.t, hold));
    if (ahead.length) {
      // Stamped too far ahead of this clock: into the log, not into the fold, until the clock reaches them.
      await appendChanges(ahead, true, false, m.key);
      for (const c of ahead) if (!m.held?.includes(c.t)) (m.held ??= []).push(c.t);
      this.setHeld();
    }
    if (ahead.length < changes.length) await collection.ingest(ahead.length ? changes.filter((c) => !isHeld(c.t, hold)) : changes, 'server', { repair: false, requireKey: m.key });
    return true;
  }

  /** Returns how many batches were folded this run. */
  private async pull(m: SyncMeta): Promise<number> {
    let got = 0;
    // The first page of a run starts a minute before the cursor; later pages continue strictly after the last batch listed.
    let after: { at: number; key: string } | null = null;
    for (;;) {
      this.step(m, 'Checking for changes…');
      // `since` goes with every page so a server that does not know `after` still answers the old way.
      const q = `since=${m.since || ''}` + (after ? `&after=${listAfter(after.at, after.key)}` : '');
      const r = await fetch(`${this.base}/api/sync/log?vault=${this.k(m).id}&${q}`, { headers: this.h(m) });
      if (r.status === 429) this.limited(r);
      if (!r.ok) throw new Error(`pull failed: ${r.status}`);
      const { batches, more, next } = (await r.json()) as { batches: Array<{ key: string; at: number }>; more: boolean; next?: { at: number; key: string } };
      const have = new Set(m.have);
      const fresh = batches.filter((b) => !have.has(b.key));
      let n = 0;
      try {
        for (const b of batches) {
          if (!have.has(b.key)) {
            this.step(m, `Receiving ${++n} of ${fresh.length}…`);
            if (await this.takeBatch(m, b.key)) got++;
            m.have.push(b.key);
            have.add(b.key);
          }
          (m.haveAt ??= {})[b.key] = b.at;
          if (b.at > m.since) m.since = b.at;
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
    const isPhoto = (q: { kind?: string; error: string }) => q.kind === 'photo' || (!q.kind && q.error.startsWith('photo:'));
    for (const q of (m.quarantined ?? []).filter((q) => q.build !== BUILD && !isPhoto(q))) {
      this.step(m, 'Reading a batch set aside by an earlier build…');
      let ok: boolean;
      try {
        ok = await this.takeBatch(m, q.key);
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
    // Duplicate numbers are repaired once, over the whole pull, so every device repairs from the same complete log (round twelve, 3).
    await collection.repairNumbers();
    // Photos that records mention and we lack.
    const have = new Set(await photoBlobIds());
    const missing = collectionPhotos().filter((p) => !have.has(p.id));
    for (let i = 0; i < missing.length; i++) {
      this.step(m, `Receiving photo ${i + 1} of ${missing.length}…`);
      const p = missing[i];
      const setAside = m.quarantined?.find((q) => q.key === p.id);
      if (setAside && setAside.build === BUILD) continue; // set aside by this build: not asked for again
      if (setAside) { m.quarantined = m.quarantined!.filter((q) => q.key !== p.id); this.quarantined = [...m.quarantined]; } // another build's: read again; set aside afresh below if still unreadable
      const r = await fetch(`${this.base}/api/sync/photo/${p.id}?vault=${this.k(m).id}`, { headers: this.h(m) });
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
    return got;
  }
}

const stopped = () => new StoppedError();
/** A full vault is probed with a photograph at most this often. */
const PROBE_MS = 3600_000;

function collectionPhotos(): Photo[] {
  const out: Photo[] = [];
  for (const a of collection.accessions) out.push(...collection.photos(a.id));
  for (const s of collection.sowings) out.push(...collection.photosOfSowing(s.id));
  return out;
}

export const sync = new Sync();
