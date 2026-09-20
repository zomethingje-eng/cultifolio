/**
 * Sync storage: ciphertext in, ciphertext out. The Worker knows a vault by its
 * id and a hash of its token; it never holds a key and cannot read a byte of
 * what it stores. Layout in R2:
 *
 *   vault/<id>/meta.json          { tokenHash, created, entitlement }
 *   vault/<id>/log/<hlc>-<hash>.bin  one sealed batch of changes; <hlc> is the batch's last change, <hash> the
 *                                    first 12 hex of the SHA-256 of the changes as JSON (the plaintext, so a
 *                                    re-seal of the same batch has the same name; batches from before this
 *                                    hashed the sealed bytes, and older ones still have no hash part)
 *   vault/<id>/photo/<photoId>.bin one sealed photo (full + thumb)
 *
 * Batches are handed out in ARRIVAL order (R2's upload time), not in HLC
 * order: a device that edited offline at t1 and uploads after another device
 * has already pulled past t1 must still be discovered. The client's cursor is
 * an arrival time; it re-reads a minute of overlap and skips batches it has
 * applied, so a put that landed slightly out of order is never missed. Within
 * one run it pages with an (arrival, key) pair, which is a total order, so
 * five hundred batches that arrived in the same second cannot repeat for ever. The
 * HLCs inside a batch are for merging, which is a separate job. Nothing is
 * ever rewritten; a vault only grows, which is what makes the merge on every
 * device idempotent.
 */
import { error } from '@sveltejs/kit';
import { tokenHash, sha256hex } from '$lib/sync/crypto';
export { MAX_BATCH_BYTES, MAX_PHOTO_BYTES } from '$lib/sync/limits';

export interface VaultMeta {
  tokenHash: string;
  created: string;
  /** 'open' while nobody pays; the licence check lands here. */
  entitlement: 'open' | 'licensed' | 'none';
  /** Bytes stored, kept as a running total so quotas need no listing. */
  bytes: number;
}

const ID = /^[A-HJKMNP-TV-Z2-9]{26}$/;
/** An HLC, optionally followed by the content hash newer clients add. Two batches that differ in content differ in name. */
const BATCH = /^\d{13}-[0-9a-f]{4,6}-[a-z0-9]{1,16}(-[0-9a-f]{12})?$/;
const PHOTO = /^p[a-z0-9]{6,32}$/;

export function store(platform: App.Platform | undefined): R2Bucket {
  const s = platform?.env?.STORE;
  if (!s) error(503, 'sync storage is not configured on this deployment');
  return s;
}

export function vaultId(raw: string | null): string {
  if (!raw || !ID.test(raw)) error(400, 'vault id must be 26 letters and digits');
  return raw;
}

export async function readMeta(r2: R2Bucket, id: string): Promise<VaultMeta | null> {
  const o = await r2.get(`vault/${id}/meta.json`);
  return o ? ((await o.json()) as VaultMeta) : null;
}

/** Every call except creation goes through here: the bearer must hash to what the vault was made with. */
export async function authed(r2: R2Bucket, id: string, request: Request): Promise<VaultMeta> {
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!bearer) error(401, 'a vault token is required');
  const meta = await readMeta(r2, id);
  if (!meta) error(404, 'no such vault');
  if (meta.tokenHash !== (await tokenHash(bearer))) error(403, 'that token does not open this vault');
  if (meta.entitlement === 'none') error(402, 'this vault has no sync licence');
  return meta;
}

/** Create the vault if it does not exist. Idempotent for the right token; refused for the wrong one. */
export async function ensureVault(r2: R2Bucket, id: string, token: string, open: boolean): Promise<{ created: boolean; meta: VaultMeta }> {
  const h = await tokenHash(token);
  const existing = await readMeta(r2, id);
  if (existing) {
    if (existing.tokenHash !== h) error(403, 'that token does not open this vault');
    return { created: false, meta: existing };
  }
  const meta: VaultMeta = { tokenHash: h, created: new Date().toISOString(), entitlement: open ? 'open' : 'none', bytes: 0 };
  await writeMeta(r2, id, meta);
  return { created: true, meta };
}

export const batchKey = (id: string, name: string) => {
  if (!BATCH.test(name)) error(400, 'batch key must be an HLC with an optional content hash');
  return `vault/${id}/log/${name}.bin`;
};
export const photoKey = (id: string, photoId: string) => {
  if (!PHOTO.test(photoId)) error(400, 'bad photo id');
  return `vault/${id}/photo/${photoId}.bin`;
};

export interface BatchRef {
  key: string;
  /** Arrival at the server, ms since the epoch. */
  at: number;
}

/** Strictly after this (arrival, key) pair: the page cursor. On the wire as `after=<at>:<key>`. */
export type After = { at: number; key: string };

const AFTER = /^(\d{1,15}):(\S{1,64})$/;
/** Parse the `after` query parameter; null when absent; 400 when malformed. */
export function parseAfter(raw: string | null): After | null {
  if (raw == null || raw === '') return null;
  const m = AFTER.exec(raw);
  if (!m) error(400, 'after must be <arrival ms>:<batch key>');
  return { at: Number(m[1]), key: m[2] };
}

const refCompare = (a: BatchRef, b: BatchRef) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** How far behind its cursor a client re-reads, so a put that committed a little late is still seen. */
export const OVERLAP_MS = 60_000;

/**
 * Every batch that arrived at or after (cursor − overlap), oldest arrival
 * first, then by key. With `after`, everything strictly after that
 * (arrival, key) pair and no overlap: the next page of the same run. When a
 * page is cut short, `next` is its last entry, to pass back as `after`. The
 * whole prefix is listed (a vault has hundreds to a few thousand batches over
 * its life; a page holds a thousand) and filtered by upload time, because R2
 * can only list in key order and key order is the wrong order.
 */
export async function listBatches(r2: R2Bucket, id: string, sinceMs: number | null, limit = 500, after: After | null = null): Promise<{ batches: BatchRef[]; more: boolean; next?: After }> {
  const prefix = `vault/${id}/log/`;
  const from = after ? after.at : sinceMs == null ? 0 : Math.max(0, sinceMs - OVERLAP_MS);
  const all: BatchRef[] = [];
  let cursor: string | undefined;
  for (;;) {
    const r = await r2.list({ prefix, limit: 1000, cursor });
    for (const o of r.objects) {
      const at = o.uploaded.getTime();
      if (at < from) continue;
      const ref = { key: o.key.slice(prefix.length, -'.bin'.length), at };
      if (after && refCompare(ref, after) <= 0) continue;
      all.push(ref);
    }
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  all.sort(refCompare);
  const batches = all.slice(0, limit);
  const more = all.length > limit;
  return more ? { batches, more, next: { at: batches[batches.length - 1].at, key: batches[batches.length - 1].key } } : { batches, more };
}

/** A generous per-vault ceiling until quotas are real: 2 GB. */
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * The vault has no room for this object. Answered as 507 with `{ error:
 * 'vault full', bytes, limit }`, distinct from 413 (one body too large), so a
 * client can stop pushing and say so instead of splitting the batch.
 */
export class VaultFull extends Error {
  readonly status = 507;
  constructor(
    public readonly bytes: number,
    public readonly limit: number
  ) {
    super('this vault is full');
  }
  response(): Response {
    return new Response(JSON.stringify({ error: 'vault full', bytes: this.bytes, limit: this.limit }), { status: 507, headers: { 'content-type': 'application/json' } });
  }
}

/** Metadata a batch is stored with; `plain` and `device` only when the pushing client sent them. */
export interface BatchMeta {
  /** SHA-256 hex of the changes as JSON (the plaintext). */
  plain?: string;
  /** The device that pushed it. */
  device?: string;
}

/**
 * Store an object against the vault's allowance. The bytes are reserved in
 * the meta BEFORE the object is written, so a refused upload never lands; if
 * the write then fails the reservation is released. Two simultaneous uploads
 * can still each read the same starting total (R2 has no atomic counter), so
 * `recount` puts the total right from a listing when a vault is (re)joined.
 */
export async function storeCounted(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, sha?: string, extra: BatchMeta = {}): Promise<void> {
  if (meta.bytes + body.length > MAX_BYTES) throw new VaultFull(meta.bytes, MAX_BYTES);
  meta.bytes += body.length;
  await writeMeta(r2, id, meta);
  try {
    const customMetadata: Record<string, string> = { sha: sha ?? (await sha256hex(body)) };
    if (extra.plain) customMetadata.plain = extra.plain;
    if (extra.device) customMetadata.device = extra.device;
    await r2.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata });
  } catch (e) {
    meta.bytes -= body.length;
    await writeMeta(r2, id, meta).catch(() => {});
    throw e;
  }
}

/**
 * Store an immutable object once. 'same' when the name already holds these
 * exact bytes (a client re-sending after a lost reply), or, for a batch, the
 * same plaintext from the same device (a re-seal after a lost reply: a fresh
 * IV makes fresh bytes, and the client proves it is the same batch with the
 * full plaintext hash, of which the name carries only twelve digits); the
 * first copy is kept. 'different' when it holds something else: the caller
 * answers 409 and nothing is overwritten, so a name can never quietly stand
 * for two contents. A batch stored without a plaintext hash (an older client)
 * is compared by bytes only.
 */
export async function storeOnce(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, extra: BatchMeta = {}): Promise<'stored' | 'same' | 'different'> {
  const sha = await sha256hex(body);
  const existing = await r2.head(key);
  if (existing) {
    const md: Partial<Record<string, string>> = existing.customMetadata ?? {};
    let had: string | undefined = md.sha;
    if (!had) {
      // Written before hashes were kept: compare the bytes themselves.
      const o = await r2.get(key);
      had = o ? await sha256hex(new Uint8Array(await o.arrayBuffer())) : undefined;
    }
    if (had === sha) return 'same';
    if (extra.plain && extra.device && md.plain === extra.plain && md.device === extra.device) return 'same';
    return 'different';
  }
  await storeCounted(r2, id, meta, key, body, sha, extra);
  return 'stored';
}

const PLAIN = /^[0-9a-f]{64}$/;
const DEVICE = /^[a-z0-9]{1,16}$/;
/** The optional push headers: X-Batch-Plain (SHA-256 hex of the changes as JSON) and X-Device. Absent is fine (older clients); malformed is 400. */
export function batchMeta(request: Request): BatchMeta {
  const plain = request.headers.get('x-batch-plain');
  const device = request.headers.get('x-device');
  if (plain != null && !PLAIN.test(plain)) error(400, 'x-batch-plain must be 64 hex digits');
  if (device != null && !DEVICE.test(device)) error(400, 'x-device must be a device id');
  return { plain: plain ?? undefined, device: device ?? undefined };
}

/** Refuse an oversize body from its declared length, before reading it; the read itself is capped too. */
export async function readBody(request: Request, max: number, what: string): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > max) error(413, `${what} must be at most ${Math.round(max / 1048576)} MB`);
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length) error(400, `${what} is empty`);
  if (body.length > max) error(413, `${what} must be at most ${Math.round(max / 1048576)} MB`);
  return body;
}

export async function writeMeta(r2: R2Bucket, id: string, meta: VaultMeta): Promise<void> {
  await r2.put(`vault/${id}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
}

/** The true byte total from a listing; written back when it disagrees with the running one. */
export async function recount(r2: R2Bucket, id: string, meta: VaultMeta): Promise<number> {
  let bytes = 0;
  for (const sub of ['log', 'photo']) {
    let cursor: string | undefined;
    for (;;) {
      const r = await r2.list({ prefix: `vault/${id}/${sub}/`, limit: 1000, cursor });
      for (const o of r.objects) bytes += o.size;
      if (!r.truncated) break;
      cursor = r.cursor;
    }
  }
  if (bytes !== meta.bytes) {
    meta.bytes = bytes;
    await writeMeta(r2, id, meta);
  }
  return bytes;
}

/** New vaults per address per day. A random key stops anyone reading a stranger's vault; this stops a stranger making ten thousand of them. */
export const MAX_NEW_VAULTS_PER_DAY = 20;
export async function allowCreation(kv: KVNamespace | undefined, ip: string): Promise<boolean> {
  if (!kv) return true; // no KV bound (local dev): no cap
  const k = `vaults:${ip}:${new Date().toISOString().slice(0, 10)}`;
  const n = Number((await kv.get(k)) ?? 0);
  if (n >= MAX_NEW_VAULTS_PER_DAY) return false;
  await kv.put(k, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}
