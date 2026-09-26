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
import { getMeta, setMeta, setMetaIfKey, getPhotoBlobs, putPhotoBlobs, photoBlobIds, outboxKeys, outboxAck, outboxFill, outboxClear, changesByKeys, allChanges, appendChanges, onOtherTabWrite, announceSyncForgotten } from '$lib/db/vault';
import { deriveKeys, sealJson, openJson, seal, open, packPhoto, unpackPhoto, parseVaultKey, batchFingerprint, sha256hex, type VaultKeys } from './crypto';
import { MAX_BATCH_BYTES, MAX_PHOTO_BYTES, SEAL_OVERHEAD, OVERLAP_MS } from './limits';
import { validateChanges, isHeld, dueAt, hlcWall, type Change } from '$core/log';
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
    const m = await getMeta<SyncMeta & { own?: string[]; cursor?: string; firstPushDone?: boolean }>(META);
    if (m?.key) {
      // Meta written by the HLC-cursor engine: carry the key, start the arrival cursor from zero (a re-list is idempotent).
      if (!Array.isArray(m.have)) {
        this.meta = { key: m.key, since: 0, have: m.own ?? [], photosPushed: m.photosPushed ?? [], lastSync: m.lastSync ?? null };
        if (m.firstPushDone === false) await outboxFill();
        await setMeta(META, this.meta);
      } else this.meta = m;
      this.keys = await deriveKeys(m.key);
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
    onOtherTabWrite((what) => { if (what === 'sync-forgotten' && this.configured) this.dropped(); });
    window.addEventListener('online', () => this.schedule(1000));
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
    if (!r.ok) throw new Error(r.status === 404 ? 'No vault answers to that key. Check it against the other device; one wrong letter is a different vault.' : r.status === 403 ? 'That key does not open its vault.' : r.status === 503 ? 'Sync is not available on this server.' : `The server said ${r.status}.`);
    this.gen++; // a run still in flight for an earlier vault is stale from here: it touches nothing of this one (round sixteen, 2)
    this.keys = keys;
    this.vaultId = keys.id;
    this.meta = { key, since: 0, have: [], photosPushed: [], lastSync: null };
    // Busy from here until the first run ends: a device that has just joined is not "Synced" until it has pulled (round ten).
    this.busy = mode === 'join' ? 'Joining…' : 'Starting…';
    try {
      await setMeta(META, this.meta);
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
  async forget(): Promise<void> {
    this.dropped(); // this.meta is null from here: a run in flight cannot write the old record back (round fifteen, 2)
    await setMeta(META, null);
    await outboxClear();
    announceSyncForgotten(); // and the other tabs drop theirs
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

  /** The same check without a write, before a step that must not happen for a vault this device has left: an outbox ack, a fold. */
  private async live(m: SyncMeta): Promise<void> {
    if (this.meta !== m) throw stopped();
    const stored = await getMeta<SyncMeta>(META);
    if (!stored || stored.key !== m.key) {
      this.dropped();
      throw stopped();
    }
  }

  /** Forget the key in memory only: another tab did the forgetting and wrote the vault; this tab must not sync through it. */
  private dropped(): void {
    this.gen++;
    this.unhook?.();
    this.unhook = null;
    this.meta = null;
    this.keys = null;
    this.configured = false;
    this.vaultId = '';
    this.lastSync = null;
    this.pending = 0;
    this.quarantined = [];
    this.refused = [];
    this.held = 0;
    this.heldUntil = null;
    this.clockWarning = null;
    this.vaultFull = null;
  }

  private note(list: 'quarantined' | 'refused', key: string, error: string): void {
    const m = this.meta!;
    const l = (m[list] ??= []);
    if (!l.some((q) => q.key === key)) l.push({ key, error, at: new Date().toISOString(), ...(list === 'quarantined' ? { build: BUILD, kind: error.startsWith('photo:') ? 'photo' : 'batch' } : {}) });
    this[list] = [...l];
  }

  private h(): Record<string, string> {
    return { authorization: `Bearer ${this.keys!.token}` };
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
  private async refold(): Promise<void> {
    const m = this.meta!;
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
    this.lastError = null;
    this.busy = 'Starting…';
    try {
      await collection.load();
      await this.refold();
      // A push the server asks to wait on (429: the address's allowance is spent, say after a large photo upload) does not
      // stop the pull: other devices' changes still arrive, and the wait is reported afterwards (round fifteen, 7).
      let wait: Error | null = null;
      try {
        await this.push();
      } catch (e) {
        if ((e as { retryAfterMs?: number })?.retryAfterMs) wait = e as Error;
        else throw e;
      }
      const got = await this.pull();
      this.meta.lastSync = new Date().toISOString();
      this.lastSync = this.meta.lastSync;
      await this.save(this.meta);
      // Said only when something did arrive (round sixteen, design note).
      if (wait) { if (got) wait.message = `received ${got} batch${got === 1 ? '' : 'es'}; ${wait.message}`; throw wait; }
    } catch (e) {
      if (g === this.gen) {
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

  private setFull(full: { bytes: number; limit: number } | null): void {
    const m = this.meta!;
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

  private async push(): Promise<void> {
    const m = this.meta!;
    const todo = await this.toPush();
    this.pending = todo.length;
    let sent = 0;
    // A vault that was full last time is tried once more each run (one request); if it is still full the push stops there.
    for (let i = 0; i < todo.length; i += BATCH_MAX) {
      const batch = todo.slice(i, i + BATCH_MAX);
      this.busy = `Sending ${Math.min(i + batch.length, todo.length)} of ${todo.length} changes…`;
      sent += await this.pushBatch(batch);
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
    for (const id of have) {
      if (pushed.has(id) || !live.has(id)) continue;
      this.busy = `Sending photo ${++n}…`;
      const b = await getPhotoBlobs(id);
      if (!b) continue;
      if (b.blob.size + b.thumb.size + SEAL_OVERHEAD > MAX_PHOTO_BYTES) {
        this.note('refused', id, `photo is ${Math.round((b.blob.size + b.thumb.size) / 1048576)} MB; the limit is ${MAX_PHOTO_BYTES / 1048576} MB`);
        continue;
      }
      const packed = packPhoto(new Uint8Array(await b.blob.arrayBuffer()), new Uint8Array(await b.thumb.arrayBuffer()));
      const r = await fetch(`${this.base}/api/sync/photo/${id}?vault=${this.keys!.id}`, { method: 'PUT', headers: this.h(), body: (await seal(this.keys!, 'photo', packed, id)) as BodyInit });
      const full = await this.fullFrom(r);
      if (full) {
        this.setFull(full);
        await this.save(m);
        return;
      }
      if (r.ok) { m.photosPushed.push(id); if (probing) this.setFull(null); }
      else if (r.status === 429) this.limited(r);
      else if (r.status === 409 && (await this.serverHolds(id, packed))) m.photosPushed.push(id); // our own earlier send whose answer was lost: sealed again with a fresh nonce, so the bytes differ, the pixels do not
      else if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403) this.note('refused', id, `photo refused: ${r.status}`);
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
  private async pushBatch(batch: Change[], mayResplit = true): Promise<number> {
    const m = this.meta!;
    // The name the server files this under: the hour of the last edit (never the millisecond), a fixed counter, this
    // device, and twelve digits of a keyed fingerprint of the content. The fingerprint is sent in full so a re-send after
    // a lost reply is recognised as the same batch; being keyed, it is not a hash anyone could test a guessed edit against.
    const lastWall = hlcWall(batch[batch.length - 1].t);
    const plain = await batchFingerprint(this.keys!, utf8.encode(JSON.stringify(batch)));
    const key = `${String(Math.floor(lastWall / 3600_000) * 3600_000).padStart(13, '0')}-0000-${collection.device || 'dev'}-${plain.slice(0, 12)}`;
    const body = await sealJson(this.keys!, 'log', { v: 1, device: collection.device, changes: batch });
    if (body.length > MAX_BATCH_BYTES && mayResplit && batch.length > 1) {
      // Too big before it ever leaves: halve it. Each half is named by its own content.
      const mid = Math.ceil(batch.length / 2);
      return (await this.pushBatch(batch.slice(0, mid))) + (await this.pushBatch(batch.slice(mid)));
    }
    const headers: Record<string, string> = { ...this.h(), 'x-batch': key, 'x-batch-plain': plain };
    if (collection.device) headers['x-device'] = collection.device;
    const r = await fetch(`${this.base}/api/sync/log?vault=${this.keys!.id}`, { method: 'POST', headers, body: body as BodyInit });
    if (r.ok) {
      await this.live(m); // never ack into a vault this device has since left or replaced: the new vault's outbox holds these same changes (round sixteen, 2)
      this.setFull(null);
      if (!m.have.includes(key)) m.have.push(key);
      (m.haveAt ??= {})[key] = Date.now(); // its arrival, near enough: the server's clock and this one agree to the minute the overlap allows
      await outboxAck(batch.map((c) => c.t)); // acknowledged: out of the outbox, whatever device stamped them
      return batch.length;
    }
    const full = await this.fullFrom(r);
    if (full) {
      this.setFull(full);
      return 0;
    }
    if (r.status === 429) this.limited(r);
    if ((r.status === 400 || r.status === 409 || r.status === 413) && mayResplit && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const a = await this.pushBatch(batch.slice(0, mid));
      return this.vaultFull ? a : a + (await this.pushBatch(batch.slice(mid)));
    }
    if (r.status === 400 || r.status === 409 || r.status === 413) {
      // Noted under the last HLC, which is stable across runs.
      this.note('refused', batch[batch.length - 1].t, `the server refused ${batch.length} change${batch.length === 1 ? '' : 's'} (${r.status})`);
      return 0;
    }
    throw new Error(`push failed: ${r.status}`);
  }

  /** A 409 for a photo id: fetch what the server holds under it and compare the pixels. True when it is this very photo (a send whose answer was lost); false when something else sits there, which is the refusal it looks like. */
  private async serverHolds(id: string, packed: Uint8Array): Promise<boolean> {
    try {
      const r = await fetch(`${this.base}/api/sync/photo/${id}?vault=${this.keys!.id}`, { headers: this.h() });
      if (!r.ok) return false;
      const theirs = await open(this.keys!, 'photo', new Uint8Array(await r.arrayBuffer()), id);
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
    const res = await fetch(`${this.base}/api/sync/log/${key}?vault=${this.keys!.id}`, { headers: this.h() });
    if (res.status === 429) this.limited(res);
    if (!res.ok) throw new Error(`batch ${key}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let changes: Change[] | null = null;
    try {
      const batch = await openJson<{ v: number; device: string; changes: unknown }>(this.keys!, 'log', bytes);
      if (!batch || typeof batch !== 'object' || batch.v !== 1) throw new Error('not a batch this version understands');
      changes = validateChanges(batch.changes);
    } catch (e) {
      this.note('quarantined', key, e instanceof Error ? e.message : String(e));
      return false;
    }
    // Storing can fail (a full phone). That is not the batch's fault: nothing is noted, the cursor stays before it,
    // and the error stops this run, so the next run fetches it again.
    await this.live(m); // and never fold a batch of a vault this device has left into a log that has since been replaced (round sixteen, 1)
    const hold = this.hold();
    const ahead = changes.filter((c) => isHeld(c.t, hold));
    if (ahead.length) {
      // Stamped too far ahead of this clock: into the log, not into the fold, until the clock reaches them.
      await appendChanges(ahead, true);
      for (const c of ahead) if (!m.held?.includes(c.t)) (m.held ??= []).push(c.t);
      this.setHeld();
    }
    if (ahead.length < changes.length) await collection.ingest(ahead.length ? changes.filter((c) => !isHeld(c.t, hold)) : changes, 'server', { repair: false });
    return true;
  }

  /** Returns how many batches were folded this run. */
  private async pull(): Promise<number> {
    const m = this.meta!;
    let got = 0;
    // The first page of a run starts a minute before the cursor; later pages continue strictly after the last batch listed.
    let after: { at: number; key: string } | null = null;
    for (;;) {
      this.busy = 'Checking for changes…';
      // `since` goes with every page so a server that does not know `after` still answers the old way.
      const q = `since=${m.since || ''}` + (after ? `&after=${after.at}:${encodeURIComponent(after.key)}` : '');
      const r = await fetch(`${this.base}/api/sync/log?vault=${this.keys!.id}&${q}`, { headers: this.h() });
      if (r.status === 429) this.limited(r);
      if (!r.ok) throw new Error(`pull failed: ${r.status}`);
      const { batches, more, next } = (await r.json()) as { batches: Array<{ key: string; at: number }>; more: boolean; next?: { at: number; key: string } };
      const have = new Set(m.have);
      const fresh = batches.filter((b) => !have.has(b.key));
      let n = 0;
      try {
        for (const b of batches) {
          if (!have.has(b.key)) {
            this.busy = `Receiving ${++n} of ${fresh.length}…`;
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
      this.busy = 'Reading a batch set aside by an earlier build…';
      let ok: boolean;
      try {
        ok = await this.takeBatch(m, q.key);
      } catch (e) {
        if ((e as { retryAfterMs?: number })?.retryAfterMs) throw e;
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
      this.busy = `Receiving photo ${i + 1} of ${missing.length}…`;
      const p = missing[i];
      const setAside = m.quarantined?.find((q) => q.key === p.id);
      if (setAside && setAside.build === BUILD) continue; // set aside by this build: not asked for again
      if (setAside) { m.quarantined = m.quarantined!.filter((q) => q.key !== p.id); this.quarantined = [...m.quarantined]; } // another build's: read again; set aside afresh below if still unreadable
      const r = await fetch(`${this.base}/api/sync/photo/${p.id}?vault=${this.keys!.id}`, { headers: this.h() });
      if (r.status === 404) continue; // not uploaded from its device yet
      if (r.status === 429) this.limited(r);
      if (!r.ok) throw new Error(`photo ${p.id}: ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer()); // read whole before it is judged: a dropped connection stops the run and it is fetched again
      let pixels: { full: Uint8Array; thumb: Uint8Array } | null = null;
      try {
        pixels = unpackPhoto(await open(this.keys!, 'photo', bytes, p.id));
        // The record says what the pixels hash to; a server cannot swap one photo for another.
        if (p.sha && (await sha256hex(pixels.full)) !== p.sha) throw new Error('pixels do not match the record');
      } catch (e) {
        this.note('quarantined', p.id, `photo: ${e instanceof Error ? e.message : String(e)}`);
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

const stopped = () => new Error('syncing was stopped on this device while this run was under way');
/** A full vault is probed with a photograph at most this often. */
const PROBE_MS = 3600_000;

function collectionPhotos(): Photo[] {
  const out: Photo[] = [];
  for (const a of collection.accessions) out.push(...collection.photos(a.id));
  for (const s of collection.sowings) out.push(...collection.photosOfSowing(s.id));
  return out;
}

export const sync = new Sync();
