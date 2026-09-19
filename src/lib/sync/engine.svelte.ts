/**
 * Sync: this device's changes up, everyone else's down, both sealed with the
 * vault key. The server is a dumb store of ciphertext (see server/sync.ts).
 *
 * Push: whatever is in the outbox, in HLC order, sealed as batches named by
 * the HLC of their last change plus a hash of the sealed bytes, so two
 * batches with different contents never share a name and a batch is acked
 * only when the server says it holds exactly those bytes. The outbox is
 * every change the server has not acknowledged: local edits, imports,
 * restores; when sync is first set up it is filled with the whole log, so a
 * collection that lived on one device for a year arrives whole. Nothing is
 * inferred from device ids: a change from another device that came in
 * through a backup file is still ours to push. A batch or photo the server
 * refuses (too big, malformed) is noted and stepped over: one bad item must
 * not stop the device receiving.
 *
 * Pull: batches by ARRIVAL time at the server, from a minute before our
 * cursor, skipping any we already hold (ours, or applied earlier); download,
 * open, validate, ingest as 'server' so they do not go back up. The log's
 * merge rule makes this idempotent, so an interrupted pull costs nothing but
 * a repeat. A batch that cannot be opened or applied is quarantined by name
 * and reported; the cursor moves past it.
 *
 * Photos: by id, immutable. Push what we have that the server lacks; pull
 * what records mention that we lack.
 */
import { collection } from '$lib/db/collection.svelte';
import { getMeta, setMeta, getPhotoBlobs, putPhotoBlobs, photoBlobIds, outboxKeys, outboxAck, outboxFill, outboxClear, changesByKeys } from '$lib/db/vault';
import { deriveKeys, sealJson, openJson, seal, open, packPhoto, unpackPhoto, parseVaultKey, sha256hex, type VaultKeys } from './crypto';
import { MAX_BATCH_BYTES, MAX_PHOTO_BYTES, SEAL_OVERHEAD } from './limits';
import { validateChanges, type Change } from '$core/log';
import { hlcCompare } from '$core/hlc';
import type { Photo } from '$lib/db/types';

interface SyncMeta {
  key: string; // the vault key, kept on this device so it can sync without asking
  /** Arrival time (ms) of the newest batch we have taken from the server. */
  since: number;
  /** Batch keys this device holds: pushed by it or applied from a pull. Skipped when listed again. */
  have: string[];
  /** Batches that could not be opened or applied, by name, with why. Also in `have`, so they never block the cursor. */
  quarantined?: Array<{ key: string; error: string; at: string }>;
  /** Things the server refused to take from this device, by name, with why. They stay in the outbox; the rest of a sync goes on. */
  refused?: Array<{ key: string; error: string; at: string }>;
  photosPushed: string[];
  lastSync: string | null;
}

const META = 'sync';
const BATCH_MAX = 2000;

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
  vaultId = $state('');
  keys: VaultKeys | null = null;
  private meta: SyncMeta | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unhook: (() => void) | null = null;
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
      this.configured = true;
      this.hook();
      await this.countPending();
    }
  }

  private hook() {
    this.unhook?.();
    this.unhook = collection.onLocalChange(() => this.schedule());
    if (typeof window !== 'undefined') window.addEventListener('online', () => this.schedule(1000));
  }

  /** Coalesce bursts of edits into one push. */
  schedule(ms = 2500): void {
    if (!this.configured) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run().catch(() => {}), ms);
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

  async run(): Promise<void> {
    if (!this.configured || !this.keys || !this.meta || this.busy) return;
    this.lastError = null;
    this.busy = 'Starting…';
    try {
      await collection.load();
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

  private async push(): Promise<void> {
    const m = this.meta!;
    const todo = await this.toPush();
    this.pending = todo.length;
    let sent = 0;
    for (let i = 0; i < todo.length; i += BATCH_MAX) {
      const batch = todo.slice(i, i + BATCH_MAX);
      this.busy = `Sending ${Math.min(i + batch.length, todo.length)} of ${todo.length} changes…`;
      sent += await this.pushBatch(batch);
      this.pending = todo.length - sent;
      await setMeta(META, m);
    }
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
      if (r.ok) m.photosPushed.push(id);
      else if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403) this.note('refused', id, `photo refused: ${r.status}`);
      else throw new Error(`photo push failed: ${r.status}`);
      await setMeta(META, m);
    }
  }

  /**
   * Seal and send one batch. 200 means the server holds exactly these bytes
   * under this name (stored now, or already there), and only then are the
   * changes acked. A 400/409/413 is the server refusing the batch itself: it
   * is halved and each half tried, down to the one change at fault, which is
   * noted and left in the outbox while the rest of the sync goes on.
   */
  private async pushBatch(batch: Change[], mayResplit = true): Promise<number> {
    const m = this.meta!;
    const last = batch[batch.length - 1].t;
    const body = await sealJson(this.keys!, 'log', { v: 1, device: collection.device, changes: batch });
    const key = `${last}-${(await sha256hex(body)).slice(0, 12)}`;
    if (body.length > MAX_BATCH_BYTES && mayResplit && batch.length > 1) {
      // Too big before it ever leaves: halve it. Each half is named by its own content.
      const mid = Math.ceil(batch.length / 2);
      return (await this.pushBatch(batch.slice(0, mid))) + (await this.pushBatch(batch.slice(mid)));
    }
    const r = await fetch(`${this.base}/api/sync/log?vault=${this.keys!.id}`, { method: 'POST', headers: { ...this.h(), 'x-batch': key }, body: body as BodyInit });
    if (r.ok) {
      if (!m.have.includes(key)) m.have.push(key);
      await outboxAck(batch.map((c) => c.t)); // acknowledged: out of the outbox, whatever device stamped them
      return batch.length;
    }
    if ((r.status === 400 || r.status === 409 || r.status === 413) && mayResplit && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      return (await this.pushBatch(batch.slice(0, mid))) + (await this.pushBatch(batch.slice(mid)));
    }
    if (r.status === 400 || r.status === 409 || r.status === 413) {
      // Noted under the last HLC, which is stable across runs (the sealed bytes, and so the hash, are not).
      this.note('refused', last, `the server refused ${batch.length} change${batch.length === 1 ? '' : 's'} (${r.status})`);
      return 0;
    }
    throw new Error(`push failed: ${r.status}`);
  }

  private async pull(): Promise<void> {
    const m = this.meta!;
    for (;;) {
      this.busy = 'Checking for changes…';
      const r = await fetch(`${this.base}/api/sync/log?vault=${this.keys!.id}&since=${m.since || ''}`, { headers: this.h() });
      if (!r.ok) throw new Error(`pull failed: ${r.status}`);
      const { batches, more } = (await r.json()) as { batches: Array<{ key: string; at: number }>; more: boolean };
      const have = new Set(m.have);
      const fresh = batches.filter((b) => !have.has(b.key));
      let n = 0;
      for (const b of batches) {
        if (!have.has(b.key)) {
          this.busy = `Receiving ${++n} of ${fresh.length}…`;
          const res = await fetch(`${this.base}/api/sync/log/${b.key}?vault=${this.keys!.id}`, { headers: this.h() });
          if (!res.ok) throw new Error(`batch ${b.key}: ${res.status}`);
          try {
            const batch = await openJson<{ v: number; device: string; changes: unknown }>(this.keys!, 'log', new Uint8Array(await res.arrayBuffer()));
            if (!batch || typeof batch !== 'object' || batch.v !== 1) throw new Error('not a batch this version understands');
            await collection.ingest(validateChanges(batch.changes), 'server'); // validates everything first; nothing is applied on a failure
          } catch (e) {
            // Bad bytes, a wrong key, a malformed change: set it aside by name so it never blocks what came after it.
            this.note('quarantined', b.key, e instanceof Error ? e.message : String(e));
          }
          m.have.push(b.key);
          have.add(b.key);
        }
        if (b.at > m.since) m.since = b.at;
        await setMeta(META, m);
      }
      if (!more) break;
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
      try {
        const { full, thumb } = unpackPhoto(await open(this.keys!, 'photo', new Uint8Array(await r.arrayBuffer()), p.id));
        // The record says what the pixels hash to; a server cannot swap one photo for another.
        if (p.sha && (await sha256hex(full)) !== p.sha) throw new Error('pixels do not match the record');
        await putPhotoBlobs({ id: p.id, blob: new Blob([full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([thumb as BlobPart], { type: 'image/jpeg' }) });
        m.photosPushed.push(p.id); // it is on the server already; never push it back
      } catch (e) {
        this.note('quarantined', p.id, `photo: ${e instanceof Error ? e.message : String(e)}`);
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
