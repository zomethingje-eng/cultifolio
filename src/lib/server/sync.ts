/**
 * Sync storage: ciphertext in, ciphertext out. The Worker knows a vault by its
 * id and a hash of its token; it never holds a key and cannot read a byte of
 * what it stores. Layout in R2:
 *
 *   vault/<id>/meta.json          { tokenHash, created, entitlement, bytes }
 *   vault/<id>/log/<hour>-0000-<device>-<fp>.bin  one sealed batch of changes; <hour> the hour of the batch's last
 *                                    change (13 digits of ms), <device> the pushing device, <fp> the first 12 hex of
 *                                    the keyed fingerprint (HMAC-SHA-256 under the vault's naming key) of the changes
 *                                    as JSON, so a re-seal of the same batch has the same name and the server holds
 *                                    nothing it could test a guess against; batches from earlier builds are named by
 *                                    the last change's full HLC and an unkeyed SHA-256, and the oldest have no hash part
 *   vault/<id>/photo/<photoId>.bin one sealed photo (full + thumb)
 *
 * And in KV (the QUEUE binding), small counters that R2 cannot keep quickly:
 *
 *   bytes:<id>                 { bytes, day }: the vault's live byte total and the UTC day it was last
 *                              put right from an R2 listing (the slow, authoritative figure)
 *   ipbytes:<ip>:<yyyy-mm-dd>  bytes stored from one address today
 *   vaults:<ip>:<yyyy-mm-dd>   vaults created from one address today
 *   rl:<bucket>:<ip>:<window>  requests from one address in one rate-limit window
 * (<ip> is the IPv4 address, or the /64 of an IPv6 one: see `addressKey`)
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
import { error, json } from '@sveltejs/kit';
import { tokenHash, sha256hex } from '$lib/sync/crypto';
export { MAX_BATCH_BYTES, MAX_PHOTO_BYTES } from '$lib/sync/limits';

export interface VaultMeta {
  tokenHash: string;
  created: string;
  /** 'open' while nobody pays; the licence check lands here. */
  entitlement: 'open' | 'licensed' | 'none';
  /**
   * Bytes stored, as last flushed from the live KV counter (see `storeCounted`).
   * A snapshot, not the figure quotas are checked against; it can lag by up to
   * `META_FLUSH_BYTES` or `META_FLUSH_MS`.
   */
  bytes: number;
}

const ID = /^[A-HJKMNP-TV-Z2-9]{26}$/;
/** An HLC-shaped name, optionally followed by the keyed fingerprint newer clients add (`BATCH_NAME`, shared with the engine). Two batches that differ in content differ in name. */
const BATCH = BATCH_NAME;
const PHOTO = /^p[a-z0-9]{6,32}$/;
const TOKEN = /^[0-9a-f]{64}$/;

/**
 * Remove an object and take its bytes off the vault's count (round forty-nine, 1). A removed photograph's ciphertext
 * stayed in the bucket for good, counted against the vault's allowance, and the key that could read it was the
 * grower's; now the device that folded the removal asks for the bytes to go. False when nothing was there.
 */
export async function deleteCounted(r2: R2Bucket, id: string, meta: VaultMeta, key: string, quota?: Quota, proof?: string | null): Promise<boolean | 'noproof'> {
  const existing = await r2.head(key);
  if (!existing) return false;
  // The token alone could add; it must not be able to destroy. The object carries the proof its upload left, and only a
  // key-holder can repeat it. An object stored before proofs were kept cannot be deleted (round fifty-one, 2).
  const kept = existing.customMetadata?.drop;
  if (!kept || !proof || kept !== proof) return 'noproof';
  await r2.delete(key);
  const size = existing.size;
  const kv = quota?.kv;
  if (!kv) {
    meta.bytes = Math.max(0, meta.bytes - size);
    await writeMeta(r2, id, meta).catch(() => {});
    return true;
  }
  const now = quota.now ?? Date.now();
  const before = await vaultBytes(r2, kv, id, meta, now);
  const after = Math.max(0, before - size);
  await kv.put(`bytes:${id}`, JSON.stringify({ bytes: after, day: day(now) } satisfies BytesRow)).catch(() => {});
  meta.bytes = after;
  await writeMeta(r2, id, meta).catch(() => {});
  return true;
}

export function store(platform: App.Platform | undefined): R2Bucket {
  const s = platform?.env?.STORE;
  if (!s) error(503, 'sync storage is not configured on this deployment');
  return s;
}

export function vaultId(raw: string | null): string {
  if (!raw || !ID.test(raw)) error(400, 'vault id must be 26 letters and digits');
  return raw;
}

/**
 * The vault id a token stands for: the first 26 symbols of SHA-256("id:" +
 * token) in the key alphabet, exactly as `deriveKeys` in $lib/sync/crypto.ts
 * makes it (the alphabet is repeated here because that module keeps it
 * private; the unit test holds the two together). The client sends the token
 * in the creation body and then as the bearer of every request, over TLS; the
 * server keeps only its hash, and compares the bearer against that. (An earlier
 * version of this comment said the token travelled once; it travels every time,
 * which is why /about/how says a holder of the token can fill the vault: round
 * thirty-eight, R1-6.) Creation is the one moment the server checks that the
 * id belongs to the token, and it does: a vault cannot be made under a name
 * that its own key would never derive.
 */
const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export async function vaultIdFor(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('id:' + token)));
  let s = '';
  for (let i = 0; i < 26; i++) s += B32[d[i] % B32.length];
  return s;
}

export async function readMeta(r2: R2Bucket, id: string): Promise<VaultMeta | null> {
  const o = await r2.get(`vault/${id}/meta.json`);
  return o ? ((await o.json()) as VaultMeta) : null;
}

/** The Authorization header every call but creation carries: the scheme and the token's 64 hex digits (exported for the formats test). */
export const BEARER = /^Bearer ([0-9a-f]{64})$/;
/** Every call except creation goes through here: the bearer must hash to what the vault was made with. */
export async function authed(r2: R2Bucket, id: string, request: Request): Promise<VaultMeta> {
  const bearer = BEARER.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!bearer) error(401, 'a vault token is required');
  const meta = await readMeta(r2, id);
  if (!meta) error(404, 'no such vault');
  if (meta.tokenHash !== (await tokenHash(bearer))) error(403, 'that token does not open this vault');
  if (meta.entitlement === 'none') error(402, 'this vault has no sync licence');
  return meta;
}

/**
 * Create the vault if it does not exist. Idempotent for the right token;
 * refused (403) for the wrong one; a new vault is refused (400) when the id
 * is not the one the token derives, so a stranger cannot park a vault under
 * an arbitrary name.
 */
export async function ensureVault(r2: R2Bucket, id: string, token: string, open: boolean): Promise<{ created: boolean; meta: VaultMeta }> {
  if (!TOKEN.test(token)) error(400, 'token must be 64 hex digits');
  const h = await tokenHash(token);
  const existing = await readMeta(r2, id);
  if (existing) {
    // A vault that exists was made under this check, so the hash alone decides; a wrong token stays 403.
    if (existing.tokenHash !== h) error(403, 'that token does not open this vault');
    return { created: false, meta: existing };
  }
  if ((await vaultIdFor(token)) !== id) error(400, 'that vault id does not belong to that token');
  const meta: VaultMeta = { tokenHash: h, created: new Date().toISOString(), entitlement: open ? 'open' : 'none', bytes: 0 };
  await writeMeta(r2, id, meta);
  return { created: true, meta };
}

export const batchKey = (id: string, name: string) => {
  if (!BATCH.test(name)) error(400, 'batch key must be an HLC with an optional fingerprint');
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

import { OVERLAP_MS, PUSH_HEADERS, BATCH_NAME, STATUS, PHOTO_DROP_HEADER } from '$lib/sync/limits';
export { OVERLAP_MS };

/**
 * R2 list pages (of 1,000 keys) one request may walk over a prefix. A vault
 * holds hundreds to a few thousand batches over its life; fifty pages is
 * fifty thousand, past a grower who syncs with changes five times a day for
 * twenty-five years. The prefix must be walked whole because R2
 * lists in key order and the client needs arrival order, and a batch that
 * arrived late can sit anywhere in key order; so the walk is bounded here and
 * a vault past the bound is refused (503, plain JSON) rather than listed
 * short and silently missed. The rate limit bounds how often one address can
 * make the Worker do the walk. The structural fix, for a round that can change
 * the wire: name the stored object by its arrival time (the client's key kept
 * as a marker object beside it), so the list starts at the cursor and costs
 * one page per pull whatever the vault's size (round twelve, 10).
 */
export const MAX_LIST_PAGES = 50;

/** Walk one prefix, at most `MAX_LIST_PAGES` pages; false when the prefix goes on past the bound. */
async function walk(r2: R2Bucket, prefix: string, each: (o: R2Object) => void): Promise<boolean> {
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const r = await r2.list({ prefix, limit: 1000, cursor });
    for (const o of r.objects) each(o);
    if (!r.truncated) return true;
    cursor = r.cursor;
  }
  return false;
}

/**
 * Every batch that arrived at or after (cursor − overlap), oldest arrival
 * first, then by key. With `after`, everything strictly after that
 * (arrival, key) pair and no overlap: the next page of the same run. When a
 * page is cut short, `next` is its last entry, to pass back as `after`. The
 * whole prefix is listed (bounded by `MAX_LIST_PAGES`) and filtered by upload
 * time, because R2 can only list in key order and key order is the wrong order.
 */
export async function listBatches(r2: R2Bucket, id: string, sinceMs: number | null, limit = 500, after: After | null = null): Promise<{ batches: BatchRef[]; more: boolean; next?: After }> {
  const prefix = `vault/${id}/log/`;
  const from = after ? after.at : sinceMs == null ? 0 : Math.max(0, sinceMs - OVERLAP_MS);
  const all: BatchRef[] = [];
  const whole = await walk(r2, prefix, (o) => {
    const at = o.uploaded.getTime();
    if (at < from) return;
    const ref = { key: o.key.slice(prefix.length, -'.bin'.length), at };
    if (after && refCompare(ref, after) <= 0) return;
    all.push(ref);
  });
  if (!whole) error(STATUS.ceilings, `this vault holds more than ${MAX_LIST_PAGES * 1000} batches, which is past what one listing can walk`);
  all.sort(refCompare);
  const batches = all.slice(0, limit);
  const more = all.length > limit;
  return more ? { batches, more, next: { at: batches[batches.length - 1].at, key: batches[batches.length - 1].key } } : { batches, more };
}

/** A generous per-vault ceiling until quotas are real: 2 GB. */
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** Bytes one address may store in one UTC day, across all its vaults: 3 GB. */
export const MAX_IP_BYTES_PER_DAY = 3 * 1024 * 1024 * 1024;

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
    return new Response(JSON.stringify({ error: 'vault full', bytes: this.bytes, limit: this.limit }), { status: STATUS.full, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}

/**
 * This address has stored its day's allowance. Answered as 429 with
 * Retry-After set to the next UTC midnight; the device keeps the change in
 * its outbox and tries again later, as it does for any 429.
 */
export class DayQuota extends Error {
  readonly status = 429;
  constructor(
    public readonly bytes: number,
    public readonly limit: number,
    public readonly retryAfter: number
  ) {
    super('daily upload allowance used');
  }
  response(): Response {
    return tooMany('the upload allowance for this address is used up for today', this.retryAfter, { bytes: this.bytes, limit: this.limit });
  }
}

/** Metadata a batch is stored with; `plain` and `device` only when the pushing client sent them. */
export interface BatchMeta {
  /** The keyed fingerprint (HMAC-SHA-256 under the vault's naming key) of the changes as JSON, 64 hex digits; older clients sent an unkeyed SHA-256, which the server cannot tell apart and need not. */
  plain?: string;
  /** The device that pushed it. */
  device?: string;
  /** A photograph's removal proof, 64 hex digits, kept with the object and demanded back by DELETE (round fifty-one, 2). */
  drop?: string;
}

/** Where the counters live, and who is asking. `kv` absent means no KV is bound (tests, a bare `wrangler dev`). */
export interface Quota {
  kv: KVNamespace | undefined;
  ip: string;
  /** For tests. */
  now?: number;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** When a key dated `d` (YYYY-MM-DD, UTC) expires: the midnight that ends the following day, in seconds, as KV's `expiration` takes it. A fixed moment, never a TTL a write renews (round twenty-four, 6; round twenty-five, 8). */
const endOfNextDay = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000) + 2 * 86400;
const untilMidnight = (ms: number) => Math.max(1, Math.ceil((Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate() + 1) - ms) / 1000));

interface BytesRow {
  bytes: number;
  /** The UTC day the total was last put right from an R2 listing. */
  day: string;
}

/**
 * The vault's live byte total from KV. Absent, or last checked on another
 * day, the R2 listing (the authoritative, slow figure) puts it right and the
 * meta snapshot with it. `force` asks for the listing regardless: a vault
 * open is a cheap moment for it.
 */
export async function vaultBytes(r2: R2Bucket, kv: KVNamespace, id: string, meta: VaultMeta, now = Date.now(), force = false): Promise<number> {
  const today = day(now);
  const row = force ? null : await kv.get<BytesRow>(`bytes:${id}`, 'json').catch(() => null);
  if (row && row.day === today && typeof row.bytes === 'number') return row.bytes;
  const bytes = await recount(r2, id, meta);
  await kv.put(`bytes:${id}`, JSON.stringify({ bytes, day: today } satisfies BytesRow)).catch(() => {});
  return bytes;
}

/** The meta snapshot is rewritten at most once per this many bytes of growth per vault, or per this many seconds per isolate: R2 allows about one write a second to a key. */
export const META_FLUSH_BYTES = 16 * 1024 * 1024;
export const META_FLUSH_MS = 30_000;
const lastMetaFlush = new Map<string, number>();

/**
 * Store an object against the vault's allowance and the address's allowance
 * for the day. With KV: the live total is `bytes:<id>`, read, checked and
 * written back before the object is written (a reservation), and put back if
 * the write fails. Two uploads in the same instant can still each read the
 * same starting total (KV has no atomic add either) but the window is one KV
 * round trip, not an R2 listing, and the listing puts the total right once a
 * day and on every vault open. A KV write that fails (two writes to one key
 * inside a second) is let go: the object is stored and the count drifts until
 * the next listing, which is bounded by that same day. `meta.json` is only a
 * snapshot now, flushed lazily so a first push of many photographs does not
 * write it twice per object.
 *
 * Without KV (tests, a bare dev server): the old path, the meta total reserved
 * and written per object, no per-address allowance.
 */
export async function storeCounted(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, sha?: string, extra: BatchMeta = {}, quota?: Quota): Promise<void> {
  const customMetadata: Record<string, string> = { sha: sha ?? (await sha256hex(body)) };
  if (extra.plain) customMetadata.plain = extra.plain;
  if (extra.device) customMetadata.device = extra.device;
  if (extra.drop) customMetadata.drop = extra.drop;
  const put = () => r2.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata });

  const kv = quota?.kv;
  if (!kv) {
    if (meta.bytes + body.length > MAX_BYTES) throw new VaultFull(meta.bytes, MAX_BYTES);
    meta.bytes += body.length;
    await writeMeta(r2, id, meta);
    try {
      await put();
    } catch (e) {
      meta.bytes -= body.length;
      await writeMeta(r2, id, meta).catch(() => {});
      throw e;
    }
    return;
  }

  const now = quota.now ?? Date.now();
  const today = day(now);
  // The address's day. Read before the vault so a used-up address costs no listing.
  const ipKey = `ipbytes:${quota.ip}:${today}`;
  const ipBytes = Number((await kv.get(ipKey)) ?? 0);
  if (ipBytes + body.length > MAX_IP_BYTES_PER_DAY) throw new DayQuota(ipBytes, MAX_IP_BYTES_PER_DAY, untilMidnight(now));
  // The vault.
  const before = await vaultBytes(r2, kv, id, meta, now);
  if (before + body.length > MAX_BYTES) throw new VaultFull(before, MAX_BYTES);
  const after = before + body.length;
  const bytesKey = `bytes:${id}`;
  await kv.put(bytesKey, JSON.stringify({ bytes: after, day: today } satisfies BytesRow)).catch(() => {});
  try {
    await put();
  } catch (e) {
    await kv.put(bytesKey, JSON.stringify({ bytes: before, day: today } satisfies BytesRow)).catch(() => {});
    throw e;
  }
  // A fixed expiry at the end of the day after this one, not a TTL that every write renews: a key written at 00:01 and
  // again at 23:59 would otherwise live nearly three days, past what /about/how says (round twenty-four, 6).
  await kv.put(ipKey, String(ipBytes + body.length), { expiration: endOfNextDay(today) }).catch(() => {});
  // The snapshot, lazily.
  const flushed = lastMetaFlush.get(id) ?? 0;
  if (Math.floor(before / META_FLUSH_BYTES) !== Math.floor(after / META_FLUSH_BYTES) || now - flushed >= META_FLUSH_MS) {
    lastMetaFlush.set(id, now);
    meta.bytes = after;
    await writeMeta(r2, id, meta).catch(() => {});
  } else {
    meta.bytes = after;
  }
}

/** For tests: forget when each vault's snapshot was last flushed. */
export const resetMetaFlush = () => lastMetaFlush.clear();

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
export async function storeOnce(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, extra: BatchMeta = {}, quota?: Quota): Promise<'stored' | 'same' | 'different'> {
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
  await storeCounted(r2, id, meta, key, body, sha, extra, quota);
  return 'stored';
}

const PLAIN = /^[0-9a-f]{64}$/;
const DEVICE = /^[a-z0-9]{1,16}$/;
/** The optional push headers: X-Batch-Plain (the keyed fingerprint of the changes as JSON, 64 hex digits) and X-Device. Absent is fine (older clients); malformed is 400. */
export function batchMeta(request: Request): BatchMeta {
  const plain = request.headers.get(PUSH_HEADERS.plain);
  const device = request.headers.get(PUSH_HEADERS.device);
  if (plain != null && !PLAIN.test(plain)) error(400, 'x-batch-plain must be 64 hex digits');
  if (device != null && !DEVICE.test(device)) error(400, 'x-device must be a device id');
  return { plain: plain ?? undefined, device: device ?? undefined };
}
/** The photograph's removal proof from its header, or null; malformed is 400. */
export function dropProof(request: Request): string | null {
  const p = request.headers.get(PHOTO_DROP_HEADER);
  if (p != null && !PLAIN.test(p)) error(400, `${PHOTO_DROP_HEADER} must be 64 hex digits`);
  return p;
}

/**
 * Refuse an oversize body from its declared length, before reading it; and the read itself stops at the cap, chunk by
 * chunk, rather than buffering whatever arrives and measuring it afterwards. A body sent without a length (chunked) used
 * to be read whole before it was judged, so a holder of a token could have the Worker hold up to the platform's own request
 * limit in memory for one 413 (round thirty-six, 1).
 */
export async function readBody(request: Request, max: number, what: string): Promise<Uint8Array> {
  const tooBig = () => error(STATUS.tooBig, `${what} must be at most ${Math.round(max / 1048576)} MB`);
  const declared = Number(request.headers.get('content-length'));
  if (declared > max) tooBig();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel().catch(() => {});
        tooBig();
      }
      chunks.push(value);
    }
  }
  if (!total) error(400, `${what} is empty`);
  const body = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }
  return body;
}

export async function writeMeta(r2: R2Bucket, id: string, meta: VaultMeta): Promise<void> {
  await r2.put(`vault/${id}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
}

/**
 * The true byte total from a listing; written back to the meta snapshot when
 * it disagrees with the running one. Bounded by `MAX_LIST_PAGES` per prefix:
 * a vault past that bound counts as at least what was walked, never less.
 */
export async function recount(r2: R2Bucket, id: string, meta: VaultMeta): Promise<number> {
  let bytes = 0;
  for (const sub of ['log', 'photo']) await walk(r2, `vault/${id}/${sub}/`, (o) => (bytes += o.size));
  if (bytes !== meta.bytes) {
    meta.bytes = bytes;
    await writeMeta(r2, id, meta);
  }
  return bytes;
}

let warnedNoKv = false;
const noKv = () => {
  if (!warnedNoKv) console.error('sync: no KV namespace is bound (QUEUE); vault creation is refused and the rate limit is off until wrangler.jsonc names a real namespace');
  warnedNoKv = true;
};
/** For tests. */
export const resetKvWarning = () => (warnedNoKv = false);

/**
 * New vaults: per address per day, for everyone per day, and in all. A random
 * key stops anyone reading a stranger's vault; these stop a stranger making
 * ten thousand of them, from one address or from many, and put a ceiling on
 * what a launch day can cost before anyone looks. The ceilings can be raised
 * without a deploy: `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` in the Worker's
 * variables. The counters live in one Durable Object (src/lib/server/counters.ts),
 * where the check and the count are one step; the KV path beneath is the
 * fallback without that binding. FAILS CLOSED: no KV bound, or a KV that
 * cannot be read, refuses every creation and says so once in the log. The
 * placeholder id in wrangler.jsonc cannot be seen from inside the Worker
 * (only the binding is), but a deploy with it is refused by wrangler, so an
 * absent binding is the case that reaches code.
 */
export const MAX_NEW_VAULTS_PER_DAY = 5;
export const MAX_NEW_VAULTS_ALL_PER_DAY = 200;
export const MAX_VAULTS = 2000;
export type Creation = 'ok' | 'address' | 'day' | 'total' | 'unavailable';
export interface CreationCeilings {
  perDay?: number;
  max?: number;
}
export function creationCeilings(env: Record<string, unknown> | undefined): CreationCeilings {
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);
  return { perDay: n(env?.SYNC_VAULTS_PER_DAY), max: n(env?.SYNC_VAULTS_MAX) };
}
/** The counters' Durable Object namespace, typed loosely so this module needs nothing from `cloudflare:workers`. */
export type CountersNs = { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): { create(address: string, day: string, perAddress: number, perDay: number, max: number, seed?: number | null, now?: number, net?: string | null): Promise<Creation>; refund(address: string, day: string, net?: string | null): Promise<void> } };
/**
 * With the Durable Object bound (production), the decision and the count are one atomic step and a burst is counted
 * exactly (round twenty-one, 1). Without it (tests, a `wrangler dev` before the migration), the KV counters below bound
 * approximately: the address's own count is written first and a write that fails refuses the creation, since that
 * write is the one thing that stops a burst from one address; the shared counters are best-effort. A KV that cannot be
 * read is 'unavailable', a short wait, not the permanent ceiling (round twenty-one, 6).
 */
export async function allowCreation(kv: KVNamespace | undefined, ip: string, now = Date.now(), ceilings: CreationCeilings = {}, counters?: CountersNs): Promise<Creation> {
  const perDay = ceilings.perDay ?? MAX_NEW_VAULTS_ALL_PER_DAY;
  const max = ceilings.max ?? MAX_VAULTS;
  const address = addressKey(ip);
  // Without KV there is no byte allowance per address and the request windows are memory only, whatever the counter
  // object says: a deploy with the object bound and no namespace is not one that should take vaults, and DEPLOY.md says
  // the Worker fails closed without the binding (round twenty-six, 11).
  if (!kv) {
    noKv();
    return 'total'; // "not taking new vaults for now": a deployment fault, not a moment's wait
  }
  if (counters) {
    try {
      // The vaults made before the object existed are the KV total; the object takes it as its starting count, once
      // (round twenty-two, 6). A KV that cannot be read is not a count of zero: the seed is null, and an object not yet
      // seeded answers 'unavailable' rather than start its total from nothing (round twenty-three, 6).
      let seed: number | null = 0;
      if (kv) {
        try {
          seed = Number((await kv.get('vaults:all')) ?? 0);
        } catch {
          seed = null;
        }
      }
      return await counters.get(counters.idFromName('vaults')).create(address, day(now), MAX_NEW_VAULTS_PER_DAY, perDay, max, seed, now, networkKey(ip));
    } catch (e) {
      console.error('sync: the vault-creation counter object did not answer; creation refused for now', e);
      return 'unavailable';
    }
  }
  if (!kv) {
    noKv();
    return 'total';
  }
  const kIp = `vaults:${address}:${day(now)}`;
  const kDay = `vaults:all:${day(now)}`;
  const kAll = 'vaults:all';
  let nIp = 0, nDay = 0, nAll = 0;
  try {
    const [ip$, day$, all$] = await Promise.all([kv.get(kIp), kv.get(kDay), kv.get(kAll)]);
    [nIp, nDay, nAll] = [ip$, day$, all$].map((v) => Number(v ?? 0));
  } catch (e) {
    console.error('sync: the vault-creation counters could not be read; creation refused for now', e);
    return 'unavailable';
  }
  if (nIp >= MAX_NEW_VAULTS_PER_DAY) return 'address';
  if (nAll >= max) return 'total';
  if (nDay >= perDay) return 'day';
  try {
    await kv.put(kIp, String(nIp + 1), { expiration: endOfNextDay(day(now)) });
  } catch (e) {
    // KV takes one write a second per key: two creations from one household within a second are not "too many today", they are a moment's wait (round twenty-two, 9).
    console.warn("sync: the address's vault-creation count could not be written; creation refused for a minute", e);
    return 'unavailable';
  }
  await Promise.allSettled([kv.put(kDay, String(nDay + 1), { expiration: endOfNextDay(day(now)) }), kv.put(kAll, String(nAll + 1))]).then((rs) => {
    if (rs.some((r) => r.status === 'rejected')) console.warn('sync: a shared vault-creation counter was not written; the count is short by one');
  });
  return 'ok';
}

/** A creation counted by the object and then not made (the vault write threw): the count goes back, so a grower retrying through an R2 blip is not told they made too many (round twenty-two, 1). Best-effort. */
export async function refundCreation(counters: CountersNs | undefined, ip: string, now = Date.now()): Promise<void> {
  if (!counters) return;
  await counters.get(counters.idFromName('vaults')).refund(addressKey(ip), day(now), networkKey(ip)).catch((e) => console.warn('sync: a vault-creation refund did not land', e));
}
/** The day key of the address-keyed counters, for callers that need to pair a count with its refund. */
export const creationDay = (now = Date.now()) => day(now);

/* ---------- Rate limit ---------- */

/** A 429 the client can show: plain JSON, Retry-After in seconds, never cached. */
export function tooMany(what: string, retryAfter: number, extra: Record<string, unknown> = {}): Response {
  return json({ error: what, retryAfter, ...extra }, { status: STATUS.rateLimited, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } });
}

/** Requests one address may make per window, by what it is asking for. */
export const RATE = {
  /** Vault open or create, status, the batch listing, a batch push: a device makes a few of these per sync. */
  sync: { limit: 600, windowMs: 600_000 },
  /** One batch or one photo fetched, checked or stored: a first join of a large vault makes a thousand. */
  syncobj: { limit: 3000, windowMs: 600_000 },
  /** Name suggestions: a person typing makes a few a second for a few seconds. */
  names: { limit: 300, windowMs: 600_000 },
  /** A forecast: the frost page and the front strip ask once an hour per site; each distinct coordinate is a call to MET Norway under this site's name. */
  forecast: { limit: 60, windowMs: 600_000 },
  /** A sheet bucket the edge did not hold, charged per bucket derived: a device asks for at most 32 in a life, and a bucket is one R2 read when the corpus build wrote it, a few hundred when not. */
  sheets: { limit: 200, windowMs: 600_000 },
  /** A catalogue search: a person typing makes a few a second for a few seconds, each answered from memory and cached at the edge, so only unique queries reach here; an office or a campus behind one address is many people (round forty, R1-3). */
  search: { limit: 3000, windowMs: 600_000 },
  /** A search the shard found nothing for, tried over the whole index: a second of work at fifty thousand species, so few a minute (round fifty-five, 4; both reviewers). */
  searchmiss: { limit: 60, windowMs: 600_000 },
  /** A species address the reference does not hold, asked of the backbone's match service: a person follows a few old labels an hour; a script could mint them without end (round thirty-three, 12). */
  match: { limit: 60, windowMs: 600_000 },
  /** The whole index: megabytes per answer, which no page needs (the catalogue and the search are served in windows), so a handful an hour is plenty (round fifty-one, 6). */
  index: { limit: 6, windowMs: 600_000 }
} as const;
export type RateBucket = keyof typeof RATE;

interface Window {
  /** The KV value when last read or written by this isolate. */
  remote: number;
  /** Requests seen by this isolate in the window. */
  local: number;
  /** Of `local`, how many are already in `remote`. */
  flushed: number;
  lastFlush: number;
}
/** How often this isolate writes its count to KV per key: KV takes about one write a second per key, and each address's bursts land on few isolates. */
export const RATE_FLUSH_MS = 5_000;
const windows = new Map<string, Window>();

/**
 * A fixed window per address and bucket, counted in this isolate's memory and
 * folded into KV every few seconds (`rl:<bucket>:<ip>:<window>`), so that a
 * burst from one address neither exceeds KV's write rate for a key nor hides
 * from the next isolate. Counting across isolates is approximate: two that
 * flush in the same second lose one flush, and a fresh isolate learns the
 * count only when it first sees the address in that window. It is a nuisance
 * control, not a spend control, and it fails OPEN: without KV it counts in
 * memory alone (and says so once); a KV error is let go. The spend controls
 * (`allowCreation`, the byte allowances) fail closed.
 */
export async function rateLimit(kv: KVNamespace | undefined, bucket: RateBucket, ip: string, now = Date.now(), flushMs = RATE_FLUSH_MS): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const { limit, windowMs } = RATE[bucket];
  const win = Math.floor(now / windowMs);
  const key = `rl:${bucket}:${ip}:${win}`;
  let w = windows.get(key);
  if (!w) {
    // Windows that are over go now, in every bucket, not when the map is large or the isolate ends, so the isolate's memory holds only each address's current window (round twenty-five, 8; round twenty-six, 10). Each bucket has its own window length, so each is judged by its own.
    for (const k of windows.keys()) {
      const m = /^rl:([a-z]+):.*:(\d+)$/.exec(k); // the address in the middle may itself hold colons (IPv6)
      const len = m && RATE[m[1] as RateBucket]?.windowMs;
      if (m && len && Number(m[2]) < Math.floor(now / len)) windows.delete(k);
    }
    if (windows.size > 5000) windows.clear();
    let remote = 0;
    if (kv) remote = Number((await kv.get(key).catch(() => null)) ?? 0);
    else noKv();
    w = { remote, local: 0, flushed: 0, lastFlush: now };
    windows.set(key, w);
  }
  w.local++;
  const total = w.remote + w.local - w.flushed;
  if (total > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil(((win + 1) * windowMs - now) / 1000)) };
  if (kv && (now - w.lastFlush >= flushMs || total === limit)) {
    w.lastFlush = now;
    const delta = w.local - w.flushed;
    w.flushed = w.local;
    try {
      const cur = Number((await kv.get(key)) ?? 0);
      w.remote = cur + delta;
      await kv.put(key, String(w.remote), { expirationTtl: Math.ceil((2 * windowMs) / 1000) });
    } catch {
      /* a lost flush is a few requests uncounted */
    }
  }
  return { ok: true };
}

/** For tests: forget every window. */
export const resetRateLimits = () => windows.clear();

/**
 * The caller's address as the counters key it: an IPv4 address as it is, an IPv6 address by its /64, since one host
 * usually has a whole /64 to rotate within and would otherwise be a fresh address every request (round twenty, 3).
 * 'unknown' where the platform gives none.
 */
export function clientIp(getClientAddress: () => string): string {
  try {
    return addressKey(getClientAddress() || 'unknown');
  } catch {
    return 'unknown';
  }
}
export function addressKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  // Expand `::` so the first four groups can be read whatever the shortening; an IPv4-mapped address keeps its IPv4 part.
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1];
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=\w)/, '')).join(':') + '::/64';
}

/** The wider network an IPv6 address sits in, its /48, for the second creation allowance; null for IPv4 (round thirty-eight, R1-8). */
export function networkKey(ip: string): string | null {
  const k = addressKey(ip);
  if (!k.endsWith('::/64')) return null;
  return k.slice(0, -5).split(':').slice(0, 3).join(':') + '::/48';
}

/** Check the bucket for this request; a 429 Response to return, or null to go on. */
export async function limited(platform: App.Platform | undefined, getClientAddress: () => string, bucket: RateBucket): Promise<Response | null> {
  const r = await rateLimit(platform?.env?.QUEUE, bucket, clientIp(getClientAddress));
  return r.ok ? null : tooMany('too many requests from this address; wait and try again', r.retryAfter);
}

/** The counters' context for a store, from the request. */
export const quotaOf = (platform: App.Platform | undefined, getClientAddress: () => string): Quota => ({ kv: platform?.env?.QUEUE, ip: clientIp(getClientAddress) });
