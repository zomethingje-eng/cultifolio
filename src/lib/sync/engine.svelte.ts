/**
 * Sync: this device's changes up, everyone else's down, both sealed with the
 * vault key. The server is a dumb store of ciphertext (see server/sync.ts).
 *
 * Push: whatever is in the outbox, in HLC order, sealed as batches named by
 * the HLC of their last change plus a hash of the changes as JSON (the
 * plaintext), so two batches with different contents never share a name and
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
import { getMeta, setMeta, getPhotoBlobs, putPhotoBlobs, photoBlobIds, outboxKeys, outboxAck, outboxFill, outboxClear, changesByKeys, allChanges, appendChanges } from '$lib/db/vault';
import { deriveKeys, sealJson, openJson, seal, open, packPhoto, unpackPhoto, parseVaultKey, sha256hex, type VaultKeys } from './crypto';
import { MAX_BATCH_BYTES, MAX_PHOTO_BYTES, SEAL_OVERHEAD } from './limits';
import { validateChanges, isHeld, dueAt, hlcWall, type Change } from '$core/log';
import { hlcCompare, MAX_AHEAD_MS } from '$core/hlc';
import type { Photo } from '$lib/db/types';

interface SyncMeta {
  key: string; // the vault key, kept on this device so it can sync without asking
  /** Arrival time (ms) of the newest batch we have taken from the server. */
  since: number;
  /** Batch keys this device holds: pushed by it or applied from a pull. Skipped when listed again. */
  have: string[];
  /** Batches that could not be opened or validated, by name, with why. Also in `have`, so they never block the cursor. */
  quarantined?: Array<{ key: string; error: string; at: string }>;
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

class Sync {
  configured = $state(false);
  busy = $state<string | null>(null);
  lastSync = $state<string | null>(null);
  lastError = $state<string | null>(null);
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
    this.keys = keys;
    this.vaultId = keys.id;
    this.meta = { key, since: 0, have: [], photosPushed: [], lastSync: null };
    await setMeta(META, this.meta);
    await outboxFill(); // everything on this device goes up first
    this.configured = true;
    this.hook();
    await this.scanClock();
    await this.run();
  }

  /** Stop syncing on this device. Nothing local is deleted; nothing on the server is deleted. */
  async forget(): Promise<void> {
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
    await setMeta(META, null);
    await outboxClear();
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

  private note(list: 'quarantined' | 'refused', key: string, error: string): void {
    const m = this.meta!;
    const l = (m[list] ??= []);
    if (!l.some((q) => q.key === key)) l.push({ key, error, at: new Date().toISOString() });
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
      else if (hold.except && c.t.endsWith('-' + hold.except) && hlcCompare(c.t, ownLast) > 0) ownLast = c.t;
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
      } else if (hold.except && c.t.endsWith('-' + hold.except) && hlcCompare(c.t, ownLast) > 0) ownLast = c.t;
    }
    if (added) this.setHeld();
    this.warnClock(ownLast);
  }

  private warnClock(ownLast: string): void {
    if (ownLast && hlcWall(ownLast) > Date.now() + MAX_AHEAD_MS) {
      const until = new Date(hlcWall(ownLast));
      this.clockWarning = `This device's clock appears to have jumped back; edits made before ${until.toLocaleString()} will win over later ones until then.`;
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
    await setMeta(META, m);
  }

  async run(): Promise<void> {
    if (!this.configured || !this.keys || !this.meta || this.busy) return;
    this.lastError = null;
    this.busy = 'Starting…';
    try {
      await collection.load();
      await this.refold();
      await this.push();
      await this.pull();
      this.meta.lastSync = new Date().toISOString();
      this.lastSync = this.meta.lastSync;
      await setMeta(META, this.meta);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.busy = null;
    }
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
      await setMeta(META, m);
      if (this.vaultFull) return;
    }
    if (this.vaultFull) return;
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
        await setMeta(META, m);
        return;
      }
      if (r.ok) m.photosPushed.push(id);
      else if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403) this.note('refused', id, `photo refused: ${r.status}`);
      else throw new Error(`photo push failed: ${r.status}`);
      await setMeta(META, m);
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
    const last = batch[batch.length - 1].t;
    const plain = await sha256hex(utf8.encode(JSON.stringify(batch)));
    const key = `${last}-${plain.slice(0, 12)}`;
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
      this.setFull(null);
      if (!m.have.includes(key)) m.have.push(key);
      await outboxAck(batch.map((c) => c.t)); // acknowledged: out of the outbox, whatever device stamped them
      return batch.length;
    }
    const full = await this.fullFrom(r);
    if (full) {
      this.setFull(full);
      return 0;
    }
    if ((r.status === 400 || r.status === 409 || r.status === 413) && mayResplit && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const a = await this.pushBatch(batch.slice(0, mid));
      return this.vaultFull ? a : a + (await this.pushBatch(batch.slice(mid)));
    }
    if (r.status === 400 || r.status === 409 || r.status === 413) {
      // Noted under the last HLC, which is stable across runs.
      this.note('refused', last, `the server refused ${batch.length} change${batch.length === 1 ? '' : 's'} (${r.status})`);
      return 0;
    }
    throw new Error(`push failed: ${r.status}`);
  }

  private async pull(): Promise<void> {
    const m = this.meta!;
    // The first page of a run starts a minute before the cursor; later pages continue strictly after the last batch listed.
    let after: { at: number; key: string } | null = null;
    for (;;) {
      this.busy = 'Checking for changes…';
      // `since` goes with every page so a server that does not know `after` still answers the old way.
      const q = `since=${m.since || ''}` + (after ? `&after=${after.at}:${encodeURIComponent(after.key)}` : '');
      const r = await fetch(`${this.base}/api/sync/log?vault=${this.keys!.id}&${q}`, { headers: this.h() });
      if (!r.ok) throw new Error(`pull failed: ${r.status}`);
      const { batches, more, next } = (await r.json()) as { batches: Array<{ key: string; at: number }>; more: boolean; next?: { at: number; key: string } };
      const have = new Set(m.have);
      const fresh = batches.filter((b) => !have.has(b.key));
      let n = 0;
      for (const b of batches) {
        if (!have.has(b.key)) {
          this.busy = `Receiving ${++n} of ${fresh.length}…`;
          const res = await fetch(`${this.base}/api/sync/log/${b.key}?vault=${this.keys!.id}`, { headers: this.h() });
          if (!res.ok) throw new Error(`batch ${b.key}: ${res.status}`);
          let changes: Change[] | null = null;
          try {
            const batch = await openJson<{ v: number; device: string; changes: unknown }>(this.keys!, 'log', new Uint8Array(await res.arrayBuffer()));
            if (!batch || typeof batch !== 'object' || batch.v !== 1) throw new Error('not a batch this version understands');
            changes = validateChanges(batch.changes);
          } catch (e) {
            // Bad bytes, a wrong key, a malformed change: set it aside by name so it never blocks what came after it.
            this.note('quarantined', b.key, e instanceof Error ? e.message : String(e));
          }
          if (changes) {
            // Storing can fail (a full phone). That is not the batch's fault: nothing is noted, the cursor stays
            // before it, and the error stops this run, so the next run fetches it again.
            const hold = this.hold();
            const ahead = changes.filter((c) => isHeld(c.t, hold));
            if (ahead.length) {
              // Stamped too far ahead of this clock: into the log, not into the fold, until the clock reaches them.
              await appendChanges(ahead, true);
              for (const c of ahead) if (!m.held?.includes(c.t)) (m.held ??= []).push(c.t);
              this.setHeld();
            }
            if (ahead.length < changes.length) await collection.ingest(ahead.length ? changes.filter((c) => !isHeld(c.t, hold)) : changes, 'server');
          }
          m.have.push(b.key);
          have.add(b.key);
        }
        if (b.at > m.since) m.since = b.at;
        await setMeta(META, m);
      }
      if (!more || !batches.length) break;
      const last = next ?? { at: batches[batches.length - 1].at, key: batches[batches.length - 1].key };
      if (after && last.at === after.at && last.key === after.key) break; // no progress (a server without the cursor): stop rather than spin
      after = last;
    }
    // Photos that records mention and we lack.
    const have = new Set(await photoBlobIds());
    const missing = collectionPhotos().filter((p) => !have.has(p.id));
    for (let i = 0; i < missing.length; i++) {
      this.busy = `Receiving photo ${i + 1} of ${missing.length}…`;
      const p = missing[i];
      if (m.quarantined?.some((q) => q.key === p.id)) continue;
      const r = await fetch(`${this.base}/api/sync/photo/${p.id}?vault=${this.keys!.id}`, { headers: this.h() });
      if (r.status === 404) continue; // not uploaded from its device yet
      if (!r.ok) throw new Error(`photo ${p.id}: ${r.status}`);
      let pixels: { full: Uint8Array; thumb: Uint8Array } | null = null;
      try {
        pixels = unpackPhoto(await open(this.keys!, 'photo', new Uint8Array(await r.arrayBuffer()), p.id));
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
      await setMeta(META, m);
    }
  }
}

function collectionPhotos(): Photo[] {
  const out: Photo[] = [];
  for (const a of collection.accessions) out.push(...collection.photos(a.id));
  for (const s of collection.sowings) out.push(...collection.photosOfSowing(s.id));
  return out;
}

export const sync = new Sync();
