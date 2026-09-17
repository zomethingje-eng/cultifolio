/**
 * Sync: this device's changes up, everyone else's down, both sealed with the
 * vault key. The server is a dumb store of ciphertext (see server/sync.ts).
 *
 * Push: whatever is in the outbox, in HLC order, sealed as batches whose
 * name is the HLC of their last change. The outbox is every change the
 * server has not acknowledged: local edits, imports, restores; when sync is
 * first set up it is filled with the whole log, so a collection that lived
 * on one device for a year arrives whole. Nothing is inferred from device
 * ids: a change from another device that came in through a backup file is
 * still ours to push.
 *
 * Pull: batches by ARRIVAL time at the server, from a minute before our
 * cursor, skipping any we already hold (ours, or applied earlier); download,
 * open, ingest as 'server' so they do not go back up. The log's merge rule
 * makes this idempotent, so an interrupted pull costs nothing but a repeat.
 *
 * Photos: by id, immutable. Push what we have that the server lacks; pull
 * what records mention that we lack.
 */
import { collection } from '$lib/db/collection.svelte';
import { getMeta, setMeta, getPhotoBlobs, putPhotoBlobs, photoBlobIds, outboxKeys, outboxAck, outboxFill, outboxClear, changesByKeys } from '$lib/db/vault';
import { deriveKeys, sealJson, openJson, seal, open, packPhoto, unpackPhoto, parseVaultKey, type VaultKeys } from './crypto';
import type { Change } from '$core/log';
import type { Photo } from '$lib/db/types';

interface SyncMeta {
  key: string; // the vault key, kept on this device so it can sync without asking
  /** Arrival time (ms) of the newest batch we have taken from the server. */
  since: number;
  /** Batch keys this device holds: pushed by it or applied from a pull. Skipped when listed again. */
  have: string[];
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
    await setMeta(META, null);
    await outboxClear();
  }

  private async countPending(): Promise<void> {
    if (!this.meta) return;
    this.pending = (await outboxKeys()).length;
  }

  /** The outbox, as changes, in HLC order. */
  private async toPush(): Promise<Change[]> {
    const ts = (await outboxKeys()).sort();
    return changesByKeys(ts);
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
    for (let i = 0; i < todo.length; i += BATCH_MAX) {
      const batch = todo.slice(i, i + BATCH_MAX);
      const last = batch[batch.length - 1].t;
      this.busy = `Sending ${Math.min(i + batch.length, todo.length)} of ${todo.length} changes…`;
      const body = await sealJson(this.keys!, 'log', { v: 1, device: collection.device, changes: batch });
      // The batch key is its last HLC: the same changes pushed twice land on the same key and the server says "already there".
      const r = await fetch(`${this.base}/api/sync/log?vault=${this.keys!.id}`, { method: 'POST', headers: { ...this.h(), 'x-batch': last }, body: body as BodyInit });
      if (!r.ok) throw new Error(`push failed: ${r.status}`);
      if (!m.have.includes(last)) m.have.push(last);
      await outboxAck(batch.map((c) => c.t)); // acknowledged: out of the outbox, whatever device stamped them
      this.pending = todo.length - (i + batch.length);
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
      const packed = packPhoto(new Uint8Array(await b.blob.arrayBuffer()), new Uint8Array(await b.thumb.arrayBuffer()));
      const r = await fetch(`${this.base}/api/sync/photo/${id}?vault=${this.keys!.id}`, { method: 'PUT', headers: this.h(), body: (await seal(this.keys!, 'photo', packed)) as BodyInit });
      if (!r.ok) throw new Error(`photo push failed: ${r.status}`);
      m.photosPushed.push(id);
      await setMeta(META, m);
    }
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
          const batch = await openJson<{ v: number; device: string; changes: Change[] }>(this.keys!, 'log', new Uint8Array(await res.arrayBuffer()));
          await collection.ingest(batch.changes, 'server');
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
      const r = await fetch(`${this.base}/api/sync/photo/${missing[i].id}?vault=${this.keys!.id}`, { headers: this.h() });
      if (r.status === 404) continue; // not uploaded from its device yet
      if (!r.ok) throw new Error(`photo ${missing[i].id}: ${r.status}`);
      const { full, thumb } = unpackPhoto(await open(this.keys!, 'photo', new Uint8Array(await r.arrayBuffer())));
      await putPhotoBlobs({ id: missing[i].id, blob: new Blob([full as BlobPart], { type: 'image/jpeg' }), thumb: new Blob([thumb as BlobPart], { type: 'image/jpeg' }) });
      m.photosPushed.push(missing[i].id); // it is on the server already; never push it back
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
