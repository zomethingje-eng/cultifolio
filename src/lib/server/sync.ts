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
 *                                    nothing it could test a guess against
 *   vault/<id>/photo/<photoId>.bin one sealed photo (full + thumb): the name's first generation
 *   vault/<id>/photo/<photoId>.<g>  a later generation of it (`g` and base-36 digits), stored when a removed photograph is
 *                                    stored again (round sixty-two)
 *   vault/<id>/photoref/<photoId>.json  the name's pointer, once it was removed: { g } naming the generation it holds, or
 *                                    { g: null, drop, at } with the removal's receipt. Absent: the first generation.
 *
 * And in KV (the QUEUE binding), small counters that R2 cannot keep quickly:
 *
 *   bytes:<id>                 { bytes, day }: the vault's live byte total and the UTC day it was last
 *                              put right from an R2 listing (the slow, authoritative figure)
 *   ipbytes:<ip>:<yyyy-mm-dd>  bytes stored from one address today
 *   vaults:<ip>:<yyyy-mm-dd>   vaults created from one address today
 *   vaultplace:<id>            the day a vault took its place, without the counter object (round sixty-one)
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
import { NET_FACTOR, UPSTREAM_ADDRESS_PART } from './caps';
import { type PhotoRef, refKey, genKey, photoRef, unnamedGenerations, receipt } from './photogen';
export { MAX_BATCH_BYTES, MAX_PHOTO_BYTES } from '$lib/sync/limits';

export interface VaultMeta {
  tokenHash: string;
  created: string;
  /** False from creation until the vault's first stored object, which is when it takes its place under the ceiling in all (round fifty-eight). Absent: a vault from before, counted at its creation. */
  filled?: boolean;
  /**
   * When the midnight sweep gave the vault's place back after 90 days without an upload (ms; round sixty-two). Written by
   * the counter object before it gives the place back, and cleared when an upload takes one again: the evidence a write
   * is judged on, since a missing place entry alone is also what a vault from before round fifty-nine has.
   */
  reclaimedAt?: number;
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
/** The batch name (`BATCH_NAME`, shared with the engine): the hour, the device and the keyed fingerprint. Two batches that differ in content differ in name. */
const BATCH = BATCH_NAME;
const PHOTO = /^p[a-z0-9]{6,32}$/;
const TOKEN = /^[0-9a-f]{64}$/;

/**
 * Remove an object and take its bytes off the vault's count (round forty-nine, 1). A removed photograph's ciphertext
 * stayed in the bucket for good, counted against the vault's allowance, and the key that could read it was the
 * grower's; now the device that folded the removal asks for the bytes to go. False when nothing was there; a
 * `PhotoBusy` when the name is held by an upload or another removal of it (the route answers 503 with Retry-After);
 * 'newer' when an upload claimed the name after the removal (`removed`, its own time when the device sends it, else when
 * the request came): that upload is a newer generation of the photograph, revived on another device, and is left alone
 * (round sixty; A12, B5). Round sixty-one (the server review, 1 to 3; B9): decided by claims alone, since R2's own upload
 * time is as late for a first upload that lands after the removal as for a revival, and that photograph stayed on the
 * server for good; a claim is two days old at most, so a late first upload is removed once its claim is swept (the
 * device asks again after a 409). And the proof is checked first, before the hold and the claim, so a request without it
 * learns nothing of when the photograph was uploaded and holds nothing.
 *
 * Round sixty-two (decision 7): a photograph is stored by generation. `key` is its name (`…/photo/<id>.bin`, which is
 * also where its first generation lies); its pointer says which generation it holds now. A removal moves the pointer to
 * its receipt, under R2's condition that the pointer is still the one it read, and only then deletes the generation it
 * looked at: a removal that stalls anywhere can delete nothing but that generation, and a revival stored meanwhile is a
 * new generation the removal never names. A revival that found the old generation still there (the removal stalled
 * before its pointer write) claims it by moving the pointer, so the stalled write then fails (the server review, 1). The
 * receipt names the generation it takes, so a removal cut off after it is finished when the device asks again (the server
 * review, 2).
 */
export async function deleteCounted(r2: R2Bucket, id: string, meta: VaultMeta, key: string, quota?: Quota, proof?: string | null, removed: number | null = null): Promise<boolean | 'noproof' | 'newer' | PhotoBusy> {
  const since = removed ?? quota?.now ?? Date.now();
  // The token alone could add; it must not be able to destroy. The object carries the proof its upload left, and only a
  // key-holder can repeat it (round fifty-one, 2).
  const proved = (o: { customMetadata?: Record<string, string> } | null) => !!o?.customMetadata?.drop && !!proof && o.customMetadata.drop === proof;
  const photo = key.includes('/photo/');
  const look = async () => {
    const ref: PhotoRef = photo ? await photoRef(r2, key) : { exists: false, etag: null, key, removed: null };
    // A removal cut off after its receipt was written (the R2 delete failed, the counter object threw, the Worker stopped)
    // left the generation its receipt names: the device asks again, with the same proof, and this finishes it (round
    // sixty-two; the server review, 2: the retry was answered 404, "done", and the bytes stayed, counted, for good).
    const left = !ref.key && ref.removed?.was && proof && ref.removed.drop === proof ? (ref.removed.was === 'bin' ? key : genKey(key, ref.removed.was)) : null;
    const at = ref.key ?? left;
    return { ref, left, o: at ? await r2.head(at) : null };
  };
  const first = (await look()).o;
  if (first && !proved(first)) return 'noproof';
  // The look, the proof, the delete and the give back are one step for this name: a removal that looked at one upload
  // and then deleted the next one (a photograph revived on another device in between) lost it for good (round sixty;
  // the self-review, P3; two outside reviews, A12 and B5). An upload of the same name waits for it, and it for an upload.
  const r = await withHold(quota, id, key, async (claimed, fence) => {
    const { ref, left, o: existing } = await look();
    if (!existing) {
      // A pointer that could not be read is not a photograph already removed: the device is asked to wait and ask again,
      // where it was answered 404, which it takes as done (round sixty-three; R3 2).
      if (ref.unreadable) return new PhotoBusy(PHOTO_BUSY_S);
      // Nothing to remove; an unnamed generation of a removed photograph goes at this touch of it (the server review, 2).
      if (photo && ref.exists) await dropStrays(r2, id, meta, key, quota);
      return false;
    }
    if (!proved(existing)) return 'noproof';
    if (left) {
      // The removal was already decided (the pointer holds its receipt, and nothing revived the name since, or the pointer
      // would have moved): only its bytes remain to go.
      if (!(await fence())) return new PhotoBusy(PHOTO_BUSY_S);
      if (!(await markUnnamed(quota, id, key))) return new PhotoBusy(PHOTO_BUSY_S); // the vault's sweep finishes it if this is cut off again (round sixty-three; S1)
      await takeOff(r2, id, meta, left, existing, quota);
      await dropStrays(r2, id, meta, key, quota);
      return true;
    }
    if (!ref.key) return false;
    if (claimed != null && claimed > since) return 'newer';
    // Fenced (round sixty-one; B10): a hold that lapsed (a stalled call) and was taken by another request is not this
    // removal's, and it is left; the device asks again.
    if (!(await fence())) return new PhotoBusy(PHOTO_BUSY_S);
    // Marked for the vault's sweep before the pointer moves: a removal cut off between its receipt and its delete leaves
    // bytes nothing names, which the sweep then removes even when the device never asks again (round sixty-three; S1).
    if (photo && !(await markUnnamed(quota, id, key))) return new PhotoBusy(PHOTO_BUSY_S);
    // The pointer moves to the removal's receipt only if it is still the one read (round sixty-two): a revival stored
    // since moved it, and is kept. The receipt asks a later first store of the name for the removal's proof (A23).
    // A pointer that moved to another removal's receipt is a removal already made: nothing more to do here.
    // The receipt names the generation it takes (`was`), so a removal cut off after this write is finished by the device
    // asking again (the server review, 2).
    if (photo && !(await point(r2, key, ref, { g: null, drop: existing.customMetadata?.drop ?? '', at: since, was: genOf(key, ref.key) }))) {
      const moved = await photoRef(r2, key);
      return moved.key ? 'newer' : moved.unreadable ? new PhotoBusy(PHOTO_BUSY_S) : false;
    }
    await takeOff(r2, id, meta, ref.key, existing, quota);
    // Generations nothing names (an upload cut off between storing its bytes and naming them) go with the photograph.
    if (photo) await dropStrays(r2, id, meta, key, quota);
    return true;
  });
  // A removal's wait is one fixed figure, never the time left on another request's hold (round sixty-one; the server
  // review, 3: the photo route answers without timing information).
  return r instanceof PhotoBusy ? new PhotoBusy(PHOTO_BUSY_S) : r;
}
/**
 * How long a request that found a photograph's name busy is asked to wait, whatever held it: removals since round
 * sixty-one, uploads since round sixty-two (A30: an upload was told the time left on the hold, up to a minute, and the
 * engine keeps a wait of a minute or more as a refusal of the whole vault, so one photograph stopped every upload).
 */
export const PHOTO_BUSY_S = 10;

/**
 * Delete one stored object and take its bytes off the vault's count. With the counter object, the removal is held as a
 * lease of no bytes from before the delete until its give-back, so a listing made between the two is not believed
 * (round sixty-two; A24: it left the object out, and the give-back then took its bytes off again).
 */
async function takeOff(r2: R2Bucket, id: string, meta: VaultMeta, key: string, existing: R2Object, quota?: Quota): Promise<void> {
  const size = existing.size;
  const kv = quota?.kv;
  if (!kv) {
    await r2.delete(key);
    meta.bytes = Math.max(0, meta.bytes - size);
    await writeMeta(r2, id, meta).catch(() => {});
    return;
  }
  const now = quota.now ?? Date.now();
  const objs = byteObjects(quota, id);
  if (objs) {
    const token = receipt(key, existing);
    await objs.vault.removing?.(token, now);
    await r2.delete(key);
    const held = await objs.vault.bytesToday(day(now));
    // Given back once per object, by its key and R2's version of it (round sixty: unique per upload; before, its etag and
    // upload time): concurrent removals of one photograph each saw it before the delete and each gave its bytes back, so
    // the total could be pushed down at will (round fifty-nine; the server reviews). On a day with no row yet the
    // receipt is recorded before the listing, so a second removal that looked first cannot give the bytes back again
    // after the listing already left them out (round sixty; the server review, 10).
    if (held == null) {
      await objs.vault.give('vault', 0, day(now), token);
      // A listing crossed twice leaves the total unwritten: the next request lists, and the removal stands (round sixty-one).
      meta.bytes = await vaultBytes(r2, kv, id, meta, now, false, quota).catch((e) => { if (e instanceof RecountCrossed) return meta.bytes; throw e; });
    } else meta.bytes = await objs.vault.give('vault', size, day(now), token);
    await writeMeta(r2, id, meta).catch(() => {});
    return;
  }
  // The total before the delete: on a day with no total yet it is put right from a listing, and a listing made after the
  // delete no longer held the object, so its bytes came off twice (round sixty-three; S4, found checking round
  // fifty-one's E6, in the KV fallback only).
  const before = await vaultBytes(r2, kv, id, meta, now);
  await r2.delete(key);
  const after = Math.max(0, before - size);
  await kv.put(`bytes:${id}`, JSON.stringify({ bytes: after, day: day(now) } satisfies BytesRow)).catch(() => {});
  meta.bytes = after;
  await writeMeta(r2, id, meta).catch(() => {});
}

// The pointer, the generations' names and their reading are in photogen.ts since round sixty-three, so the vault's
// counter object, which sweeps unnamed generations, reads them the same way (S1).
/** A generation's suffix as a pointer names it: the first generation is 'bin' (round sixty-two; the server review, 1). */
const genOf = (name: string, key: string) => (key === name ? 'bin' : key.slice(key.lastIndexOf('.') + 1));
/** Move a photograph's pointer, only if it is still the one `ref` read (R2's conditional write): false when it moved. */
async function point(r2: R2Bucket, name: string, ref: PhotoRef, to: { g: string | null; drop?: string; at?: number; was?: string }): Promise<boolean> {
  // `n`: each write's own, so two pointers that say the same have different etags, and a condition read before one of
  // them never passes after it.
  const body = JSON.stringify({ ...to, n: crypto.randomUUID() });
  const onlyIf = !ref.exists ? { etagDoesNotMatch: '*' } : ref.etag ? { etagMatches: ref.etag } : undefined; // R2 always gives an etag
  return (await r2.put(refKey(name), body, { httpMetadata: { contentType: 'application/json' }, ...(onlyIf ? { onlyIf } : {}) })) !== null;
}
/** The key a photograph's bytes are under now, or null when it was removed (round sixty-two): the GET and HEAD routes read through it. */
export async function photoObjectKey(r2: R2Bucket, name: string): Promise<string | null> {
  return (await photoRef(r2, name)).key;
}
/** Remove the generations of a photograph that its pointer does not name and that are older than `STRAY_MS` (round sixty-two). */
async function dropStrays(r2: R2Bucket, id: string, meta: VaultMeta, name: string, quota?: Quota): Promise<void> {
  const now = quota?.now ?? Date.now();
  try {
    const found = await unnamedGenerations(r2, name, now);
    if (!found) return; // no pointer: the first generation is the photograph, and no other was ever stored
    for (const key of found.old) {
      const h = await r2.head(key);
      if (h) await takeOff(r2, id, meta, key, h, quota);
    }
  } catch (e) {
    console.error("sync: a photograph's unnamed generations were not removed; the vault's sweep tries again", e);
  }
}

/**
 * Mark a photograph in the vault's counter object before a step that can leave bytes nothing names (round sixty-three;
 * S1): its alarm then removes them, where before they went only at the photograph's next touch. False when the object
 * could not be asked: the caller does not take the step (the device is asked to wait, as for a busy photograph), so no
 * bytes are left that the sweep does not know of. Without the object (tests, a bare dev server, the KV fallback) there is
 * no sweep, and such bytes go at the next touch, as before.
 */
async function markUnnamed(quota: Quota | undefined, id: string, name: string): Promise<boolean> {
  const ns = quota?.counters;
  const o = ns ? ns.get(ns.idFromName(`bytes:${id}`)) : null;
  if (!o?.markUnnamed) return true;
  try {
    await o.markUnnamed(name, quota?.now ?? Date.now());
    return true;
  } catch (e) {
    console.error("sync: a photograph could not be marked for the sweep of unnamed bytes; the request waits", e);
    return false;
  }
}

/**
 * A first store of a photograph that was removed, without the proof its removal carried (round sixty-two; A23): a
 * holder of the token alone could put back a copy of the ciphertext under any proof, and the grower's removal was then
 * refused for good. Answered 403; a device that holds the vault's key always carries the proof.
 */
export class PhotoRemoved extends Error {
  readonly status = 403;
  constructor() {
    super('this photograph was removed');
  }
  response(): Response {
    return new Response(JSON.stringify({ error: 'This photograph was removed, and only a device that holds the vault\'s key can store it again.' }), { status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}

/** A removed object's give-back receipt (photogen.ts since round sixty-three). */
export { receipt };

/** A photograph's name held by an upload or a removal of it: answered 503 with Retry-After, which the device waits out and retries (round sixty). */
export class PhotoBusy extends Error {
  readonly status = 503;
  constructor(public readonly retryAfter: number) {
    super('this photograph is being stored or removed just now');
  }
  response(): Response {
    return new Response(JSON.stringify({ error: 'Another device is storing or removing this photograph just now; it will try again shortly.', retryAfter: this.retryAfter }), { status: STATUS.ceilings, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(this.retryAfter) } });
  }
}

/**
 * Run `fn` holding a photograph's name in the vault's counter object, so a removal and an upload of it cannot interleave
 * (round sixty). `fn` is told when an upload last claimed the name (null when none is known), and given `fence`, which
 * renews the hold and says whether it is still this request's (round sixty-one; B10). Without the object (tests, a bare
 * dev server) it runs as before. A hold the object cannot give is the name being busy: answered with a short
 * wait, never run unheld. `claims` says whether a result is an upload's claim on the name, recorded as the hold is freed.
 */
async function withHold<T>(quota: Quota | undefined, id: string, key: string, fn: (claimed: number | null, fence: () => Promise<boolean>) => Promise<T>, claims: (r: T) => boolean = () => false): Promise<T | PhotoBusy> {
  const ns = quota?.counters;
  const o = ns ? ns.get(ns.idFromName(`bytes:${id}`)) : null;
  if (!o?.hold || !o.unhold) return fn(null, async () => true);
  const now = quota?.now ?? Date.now();
  let h: Awaited<ReturnType<NonNullable<typeof o.hold>>>;
  try {
    h = await o.hold(key, now);
  } catch (e) {
    console.error("sync: a photograph's name could not be held; the request waits", e);
    return new PhotoBusy(PHOTO_BUSY_S);
  }
  // One fixed short wait, never the time left on the hold (round sixty-two; A30).
  if (!h.ok) return new PhotoBusy(PHOTO_BUSY_S);
  let claimed = false;
  // A renewal that cannot be asked is a hold not known to be this request's: the step it guards is skipped.
  const fence = async () => (o.renew ? await o.renew(key, h.token, quota?.now ?? Date.now()).catch(() => false) : true);
  try {
    const r = await fn(h.claimed ?? null, fence);
    claimed = claims(r);
    return r;
  } finally {
    await o.unhold(key, h.token, claimed, quota?.now ?? Date.now()).catch((e) => console.error("sync: a photograph's hold was not freed; it frees itself within a minute", e));
  }
}

/** The header a removal may carry: when the device made it (ms), so an upload of the name after that is left alone (round sixty). */
export { PHOTO_REMOVED_AT_HEADER } from '$lib/sync/limits'; // one name for both ends (round sixty-two; agent L)
import { PHOTO_REMOVED_AT_HEADER } from '$lib/sync/limits';
/** A removal's own time from its request, when sent and believable (not ahead of the server by more than five minutes); else null. */
export function removedAt(request: Request, now = Date.now()): number | null {
  const v = request.headers.get(PHOTO_REMOVED_AT_HEADER);
  if (v == null || !/^\d{1,15}$/.test(v)) return null;
  const t = Number(v);
  return t > 0 && t <= now + 300_000 ? t : null;
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
  const meta: VaultMeta = { tokenHash: h, created: new Date().toISOString(), entitlement: open ? 'open' : 'none', bytes: 0, filled: false };
  // Written only if no meta is there, in the same step: two creations of one vault at once both wrote and both answered
  // "created", so neither was refunded and both stayed in the day's and the address's counts (round fifty-nine).
  const put = await r2.put(`vault/${id}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' }, onlyIf: { etagDoesNotMatch: '*' } });
  if (put === null) {
    const now = await readMeta(r2, id);
    if (!now || now.tokenHash !== h) error(403, 'that token does not open this vault');
    return { created: false, meta: now };
  }
  return { created: true, meta };
}

export const batchKey = (id: string, name: string) => {
  if (!BATCH.test(name)) error(400, 'batch key must be <hour>-0000-<device>-<fingerprint>');
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
    public readonly retryAfter: number,
    /** 'network': the IPv6 /48 around the address stored its day's total, which this address may not have touched (round sixty-three; S5). */
    public readonly who: 'address' | 'network' = 'address'
  ) {
    super('daily upload allowance used');
  }
  response(): Response {
    return tooMany(`the upload allowance for this ${this.who} is used up for today`, this.retryAfter, { bytes: this.bytes, limit: this.limit });
  }
}

/** Metadata a batch is stored with (`plain`, `device`), or a photograph (`drop`). */
export interface BatchMeta {
  /** The keyed fingerprint (HMAC-SHA-256 under the vault's naming key) of the changes as JSON, 64 hex digits. */
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
  /** The counter object, when bound: the byte totals are taken there in one step (round fifty-eight). */
  counters?: CountersNs;
  /** The ceiling in all, when the deployment sets one (`SYNC_VAULTS_MAX`). */
  max?: number;
  /** The day's ceiling of new vaults, when the deployment sets one (`SYNC_VAULTS_PER_DAY`); counted at a vault's first object (round sixty). */
  perDay?: number;
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
  /** When that listing was made (ms), so an open does not list again within the hour (round sixty). */
  at?: number;
}

/**
 * The vault's live byte total. Absent, or last put right on another day, the R2 listing (the authoritative, slow figure)
 * puts it right and the meta snapshot with it. `open` (a vault opened or joined) asks for the listing unless one was
 * made in the last hour: every open walked the whole vault, up to a hundred list calls a request (round sixty; the server
 * review, 4).
 */
export async function vaultBytes(r2: R2Bucket, kv: KVNamespace, id: string, meta: VaultMeta, now = Date.now(), open = false, quota?: Quota): Promise<number> {
  const today = day(now);
  const objs = byteObjects(quota, id);
  if (objs) {
    const held = await objs.vault.bytesToday(today);
    if (held != null && !open) return held;
    for (let tries = 0; tries < RECOUNT_TRIES; tries++) {
      const g = await objs.vault.generation(now);
      if (held != null && g.at != null && now - g.at < RECOUNT_MS) return held;
      // No listing while one could not be kept (round sixty-two; the server review, 5): it was made and then refused. The
      // upload that is live may have put today's total right itself; else the device asks again shortly.
      if (g.busy) { const t = held ?? (await objs.vault.bytesToday(today)); if (t != null) return t; continue; }
      const bytes = await recount(r2, id, meta);
      // Committed only if no upload landed and nothing was removed while the listing ran: a listing taken before an
      // upload landed and written after it erased that upload's charge (round sixty; the second outside review, B7). The
      // second try keeps the check too: it was committed unchecked, and a landing that crossed it was erased (round
      // sixty-one; B11).
      const set = await objs.vault.setBytes(bytes, today, g.gen, now);
      if (set != null) return set;
    }
    // An open with today's total already kept answers that total: its listing was only to put it right, and since round
    // sixty-two a listing is refused while any upload or removal is live, which a long push from another device often is.
    if (held != null) return held;
    throw new RecountCrossed();
  }
  const row = await kv.get<BytesRow>(`bytes:${id}`, 'json').catch(() => null);
  const fresh = row && row.day === today && typeof row.bytes === 'number';
  if (fresh && (!open || (typeof row.at === 'number' && now - row.at < RECOUNT_MS))) return row.bytes;
  const bytes = await recount(r2, id, meta);
  await kv.put(`bytes:${id}`, JSON.stringify({ bytes, day: today, at: now } satisfies BytesRow)).catch(() => {});
  return bytes;
}
/** How recent a listing an open accepts (round sixty). */
export const RECOUNT_MS = 3_600_000;
/** Listings one request may make of a vault whose uploads keep crossing them, before it asks the device to try again (round sixty-one; B11). */
export const RECOUNT_TRIES = 2;

/**
 * A vault's total could not be put right: each of its listings was crossed by an upload that landed or a removal while
 * it ran, so neither could be written without erasing that change (round sixty-one; B11). Answered 503 with a short
 * Retry-After, which the device waits out; nothing is stored or counted.
 */
export class RecountCrossed extends Error {
  readonly status = 503;
  constructor() {
    super("this vault's total was crossed by other uploads while it was counted");
  }
  response(): Response {
    return new Response(JSON.stringify({ error: 'The site could not count this vault just now: other uploads kept landing while it was counted. It tries again shortly.', retryAfter: RECOUNT_RETRY_S }), { status: STATUS.ceilings, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(RECOUNT_RETRY_S) } });
  }
}
/** How long a device waits after a crossed recount. */
export const RECOUNT_RETRY_S = 30;

/** The byte objects of a quota, when the counter object is bound and has them: one per vault, one per address. */
function byteObjects(quota: Quota | undefined, id: string) {
  const ns = quota?.counters;
  if (!ns) return null;
  const vault = ns.get(ns.idFromName(`bytes:${id}`));
  const address = ns.get(ns.idFromName(`ipbytes:${addressKey(quota!.ip)}`));
  // An IPv6 address's /48 has a day's total of its own (round sixty-three; S5); an IPv4 address none.
  const nk = networkKey(quota!.ip);
  const net = nk ? ns.get(ns.idFromName(`ipbytes:${nk}`)) : null;
  if (!vault.take || !vault.give || !vault.release || !vault.setBytes || !vault.bytesToday || !vault.generation || !address.take || !address.give) return null;
  return { vault: vault as Required<typeof vault>, address: address as Required<typeof address>, net: net?.take && net.give ? (net as Required<typeof net>) : null };
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
export async function storeCounted(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, sha?: string, extra: BatchMeta = {}, quota?: Quota, once = false): Promise<boolean> {
  const customMetadata: Record<string, string> = { sha: sha ?? (await sha256hex(body)) };
  if (extra.plain) customMetadata.plain = extra.plain;
  if (extra.device) customMetadata.device = extra.device;
  if (extra.drop) customMetadata.drop = extra.drop;
  // `once`: written only if nothing is under the name, in the same step as the write, so two uploads of one name that
  // both found it free cannot both be counted and the second overwrite the first (round fifty-eight; the server review).
  // R2 answers null when the condition fails, and the reservation goes back.
  const put = async () => (await r2.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata, ...(once ? { onlyIf: { etagDoesNotMatch: '*' } } : {}) })) !== null;

  // Admitted here when the route did not already (it does, before reading the body); a vault this call admitted whose
  // write then did not land gives its place back, unless something of it is already stored (round sixty; B8).
  const admitted = await admitVault(r2, id, meta, quota);
  let stored = false;
  try {
    stored = await storeCountedNow(r2, id, meta, key, body, quota, put);
  } finally {
    if (admitted && !stored) await unadmit(r2, id, meta, quota);
  }
  if (stored && meta.filled === false) await landed(r2, id, meta, quota);
  return stored;
}
async function storeCountedNow(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, quota: Quota | undefined, put: () => Promise<boolean>): Promise<boolean> {
  const kv = quota?.kv;
  if (!kv) {
    if (meta.bytes + body.length > MAX_BYTES) throw new VaultFull(meta.bytes, MAX_BYTES);
    meta.bytes += body.length;
    await writeMeta(r2, id, meta);
    let stored = false;
    try {
      stored = await put();
    } finally {
      if (!stored) {
        meta.bytes -= body.length;
        await writeMeta(r2, id, meta).catch(() => {});
      }
    }
    return stored;
  }

  const now = quota.now ?? Date.now();
  const today = day(now);
  const objs = byteObjects(quota, id);
  if (objs) {
    // The address's day, then the vault, each checked and taken in one step in its own object.
    const ip = await objs.address.take('address', body.length, MAX_IP_BYTES_PER_DAY, today, null, now);
    if ('recount' in ip || !ip.ok) throw new DayQuota('before' in ip ? ip.before : 0, MAX_IP_BYTES_PER_DAY, untilMidnight(now));
    // And an IPv6 address's /48, at four times one address's allowance, as every other /48 count is: a host holding a /48
    // had 65,536 /64s, each a fresh day's allowance (round sixty-three; S5, left in round fifty-nine).
    const giveAddress = () => Promise.all([objs.address.give('address', body.length, today), objs.net ? objs.net.give('address', body.length, today) : 0]);
    if (objs.net) {
      let n: Awaited<ReturnType<typeof objs.net.take>>;
      try { n = await objs.net.take('address', body.length, MAX_IP_BYTES_PER_DAY * NET_FACTOR, today, null, now); }
      catch (e) { await objs.address.give('address', body.length, today).catch(() => 0); throw e; }
      if ('recount' in n || !n.ok) {
        await objs.address.give('address', body.length, today).catch(() => 0);
        throw new DayQuota('before' in n ? n.before : 0, MAX_IP_BYTES_PER_DAY * NET_FACTOR, untilMidnight(now), 'network');
      }
    }
    let v: Awaited<ReturnType<typeof objs.vault.take>>;
    try {
      v = await objs.vault.take('vault', body.length, MAX_BYTES, today, null, now);
      // A day's first upload passes a listing, with the generation read before it: a landing or a removal that crossed
      // the listing has it refused, and it is listed again, once (round sixty; B7); the second listing is checked too,
      // and a second crossing asks the device to try again (round sixty-one; B11).
      for (let tries = 0; 'recount' in v && tries < RECOUNT_TRIES; tries++) {
        const g = await objs.vault.generation(now);
        // An upload or a removal is live, so a listing would be refused: none is made (round sixty-two; the server review,
        // 5: up to four whole-vault listings were made and thrown away). The live upload is often a first upload of the day
        // that has just put today's total right, so the take is asked again without one; if it still needs a listing,
        // the device asks again shortly.
        if (g.busy) { v = await objs.vault.take('vault', body.length, MAX_BYTES, today, null, now); continue; }
        const listed = await recount(r2, id, meta);
        v = await objs.vault.take('vault', body.length, MAX_BYTES, today, listed, now, g.gen);
      }
      if ('recount' in v) throw new RecountCrossed();
    } catch (e) {
      // The address's bytes go back whatever stopped the vault's step (a listing that threw): they stayed counted till midnight (round fifty-nine).
      await giveAddress().catch(() => 0);
      throw e;
    }
    if ('recount' in v || !v.ok) {
      await giveAddress().catch(() => 0);
      throw new VaultFull('before' in v ? v.before : 0, MAX_BYTES);
    }
    let stored = false;
    try {
      stored = await put();
    } finally {
      // Landed or not, the lease is given back; one that did not land gives its bytes back in both objects. A release that
      // fails is said in the log (it was swallowed in silence); its lease lapses by itself in ten minutes (round sixty).
      const lease = v.lease;
      await Promise.all([
        lease ? objs.vault.release(lease, stored).catch((e) => console.error(`sync: an upload's lease was not released (landed: ${stored}); it lapses in ten minutes`, e)) : Promise.resolve(),
        ...(stored ? [] : [giveAddress().catch((e) => console.error("sync: an address's bytes were not given back after a failed upload", e))])
      ]);
    }
    if (stored) await flushMeta(r2, id, meta, v.before, v.before + body.length, now);
    return stored;
  }
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
  let stored = false;
  try {
    stored = await put();
  } finally {
    if (!stored) await kv.put(bytesKey, JSON.stringify({ bytes: before, day: today } satisfies BytesRow)).catch(() => {});
  }
  if (!stored) return false;
  // A fixed expiry at the end of the day after this one, not a TTL that every write renews: a key written at 00:01 and
  // again at 23:59 would otherwise live nearly three days, past what /about/how says (round twenty-four, 6).
  await kv.put(ipKey, String(ipBytes + body.length), { expiration: endOfNextDay(today) }).catch(() => {});
  await flushMeta(r2, id, meta, before, after, now);
  return true;
}
/** The meta snapshot, lazily: past a step of `META_FLUSH_BYTES`, or `META_FLUSH_MS` since this isolate last wrote it. */
async function flushMeta(r2: R2Bucket, id: string, meta: VaultMeta, before: number, after: number, now: number): Promise<void> {
  const flushed = lastMetaFlush.get(id) ?? 0;
  meta.bytes = after;
  if (Math.floor(before / META_FLUSH_BYTES) !== Math.floor(after / META_FLUSH_BYTES) || now - flushed >= META_FLUSH_MS) {
    lastMetaFlush.set(id, now);
    await writeMeta(r2, id, meta).catch(() => {});
  }
}

/** For tests: forget when each vault's snapshot was last flushed. */
export const resetMetaFlush = () => { lastMetaFlush.clear(); touched.clear(); };

/**
 * Store an immutable object once. 'same' when the name already holds these
 * exact bytes (a client re-sending after a lost reply), or, for a batch, the
 * same plaintext from the same device (a re-seal after a lost reply: a fresh
 * IV makes fresh bytes, and the client proves it is the same batch with the
 * full plaintext hash, of which the name carries only twelve digits); the
 * first copy is kept. 'different' when it holds something else: the caller
 * answers 409 and nothing is overwritten, so a name can never quietly stand
 * for two contents.
 */
export async function storeOnce(r2: R2Bucket, id: string, meta: VaultMeta, key: string, body: Uint8Array, extra: BatchMeta = {}, quota?: Quota): Promise<'stored' | 'same' | 'different'> {
  const sha = await sha256hex(body);
  // A claim on a photograph's name is recorded only for an upload that carries the proof the stored object holds: one
  // that stored it with its proof, or found it already there with the same proof. The bearer token alone could PUT the
  // same bytes back with any proof, claim the name and so veto a key-holder's removal (round sixty-one; the server
  // review, 2).
  let proved = false;
  // A photograph is stored holding its name, as its removal is, so the two cannot interleave (round sixty): a removal
  // that looked before this upload's look, and deleted after its "already there", left the device sure of a photograph
  // the server no longer held. A batch is never removed, so it needs no hold.
  const run = async (): Promise<'stored' | 'same' | 'different'> => {
    const existing = await r2.head(key);
    if (existing) {
      const md: Partial<Record<string, string>> = existing.customMetadata ?? {};
      proved = !!extra.drop && md.drop === extra.drop;
      if (md.sha === sha) return 'same';
      if (extra.plain && extra.device && md.plain === extra.plain && md.device === extra.device) return 'same';
      return 'different';
    }
    if (await storeCounted(r2, id, meta, key, body, sha, extra, quota, true)) { proved = !!extra.drop; return 'stored'; }
    // Another upload took the name between the look and the write: judged against what it stored, as above.
    const now = await r2.head(key);
    const md: Partial<Record<string, string>> = now?.customMetadata ?? {};
    proved = !!extra.drop && md.drop === extra.drop;
    return md.sha === sha || (extra.plain && extra.device && md.plain === extra.plain && md.device === extra.device) ? 'same' : 'different';
  };
  if (!key.includes('/photo/')) return run();
  /** Judged against what the name holds: the same bytes (or a re-seal of the same batch) or not; a matching proof is a claim. */
  const against = (o: { customMetadata?: Record<string, string> } | null): 'same' | 'different' => {
    const md: Partial<Record<string, string>> = o?.customMetadata ?? {};
    proved = !!extra.drop && md.drop === extra.drop;
    return md.sha === sha ? 'same' : 'different';
  };
  // Round sixty-two (decision 7): through the name's pointer. A name never removed is stored as before, under the name
  // itself (its first generation); a removed one is stored as a new generation, and the pointer is moved to it only if it
  // is still the one read, so a removal that read the pointer before cannot move it back.
  /**
   * An upload with the proof that found the photograph already there claims it, and the claim moves the pointer to the
   * generation it found, under the condition the pointer is still the one read (round sixty-two; the server review, 1). A
   * removal whose own conditional write stalled past its hold read the pointer before, so it now fails and answers
   * 'newer', where it deleted the generation this upload had just told its device was on the server. One conditional
   * write per such upload (a retry after a lost reply, an Undo). A pointer that moved meanwhile is a removal that landed:
   * the device is asked to wait and try again, and then stores the photograph anew.
   */
  const claim = async (ref: PhotoRef, found: string, r: 'same' | 'different'): Promise<'same' | 'different'> => {
    if (!proved) return r;
    if (await point(r2, key, ref, { g: genOf(key, found) })) return r;
    proved = false;
    throw new PhotoBusy(PHOTO_BUSY_S);
  };
  const runPhoto = async (): Promise<'stored' | 'same' | 'different'> => {
    const ref = await photoRef(r2, key);
    const existing = ref.key ? await r2.head(ref.key) : null;
    if (existing) {
      // A revived photograph is where a generation stored and never named can be left (an upload cut off between its two
      // writes): it goes at this touch, once old enough (the server review, 2).
      if (ref.key !== key) await dropStrays(r2, id, meta, key, quota);
      return claim(ref, ref.key!, against(existing));
    }
    // A removed name keeps its removal's receipt: a first store of it carries the removal's proof, or is refused (A23).
    if (ref.removed?.drop && ref.removed.drop !== extra.drop) throw new PhotoRemoved();
    if (!ref.exists) {
      if (await storeCounted(r2, id, meta, key, body, sha, extra, quota, true)) { proved = !!extra.drop; return 'stored'; }
      // Another upload took the name between the look and the write: judged against what it stored, as above.
      return claim(ref, key, against(await r2.head(key)));
    }
    await dropStrays(r2, id, meta, key, quota);
    const gk = genKey(key, `g${(quota?.now ?? Date.now()).toString(36)}${crypto.randomUUID().slice(0, 8)}`);
    // Marked before the new generation is written: an upload cut off before its pointer names it leaves bytes the vault's
    // sweep then removes (round sixty-three; S1).
    if (!(await markUnnamed(quota, id, key))) throw new PhotoBusy(PHOTO_BUSY_S);
    if (!(await storeCounted(r2, id, meta, gk, body, sha, extra, quota, true))) throw new PhotoBusy(PHOTO_BUSY_S);
    if (await point(r2, key, ref, { g: gk.slice(gk.lastIndexOf('.') + 1) })) { proved = !!extra.drop; return 'stored'; }
    // The pointer moved while this generation was written (another request, past a hold that lapsed): the generation goes,
    // its bytes given back, and the upload is judged against what the name holds now.
    const mine = await r2.head(gk);
    if (mine) await takeOff(r2, id, meta, gk, mine, quota);
    const now = await photoRef(r2, key);
    const o = now.key ? await r2.head(now.key) : null;
    if (!o) throw new PhotoBusy(PHOTO_BUSY_S);
    return claim(now, now.key!, against(o));
  };
  // A claim whenever the proof matches, whatever the answer (round sixty-two; A23): a re-sealed Undo makes different
  // bytes, was answered 409 with no claim, and a removal asked for before it then deleted it.
  const r = await withHold(quota, id, key, runPhoto, () => proved);
  if (r instanceof PhotoBusy) throw r;
  return r;
}

const PLAIN = /^[0-9a-f]{64}$/;
const DEVICE = /^[a-z0-9]{1,16}$/;
/** The push headers: X-Batch-Plain (the keyed fingerprint of the changes as JSON, 64 hex digits) and X-Device. Both required; absent or malformed is 400. */
export function batchMeta(request: Request): BatchMeta {
  const plain = request.headers.get(PUSH_HEADERS.plain);
  const device = request.headers.get(PUSH_HEADERS.device);
  if (plain == null || !PLAIN.test(plain)) error(400, 'x-batch-plain must be 64 hex digits');
  if (device == null || !DEVICE.test(device)) error(400, 'x-device must be a device id');
  return { plain, device };
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
  // The buffer grows as the bytes arrive, from the smaller of the declared length and a megabyte, doubling and never past
  // the declared length: a declared 12 MB with one byte sent held 12 MB, and a few stalled requests could press a
  // Worker's memory (round sixty; the server review, 8; the first outside review, A21). A body longer than it declared
  // is refused. Without a declared length (chunked), the same growth up to the cap.
  const sized = Number.isInteger(declared) && declared > 0;
  const cap = sized ? declared : max;
  let buf = new Uint8Array(0);
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > max) {
        await reader.cancel().catch(() => {});
        tooBig();
      }
      if (sized && total + value.length > declared) {
        await reader.cancel().catch(() => {});
        error(400, `${what} is longer than its declared length`);
      }
      if (total + value.length > buf.length) {
        let size = Math.max(buf.length * 2, Math.min(cap, GROW_FROM));
        while (size < total + value.length) size *= 2;
        const next = new Uint8Array(Math.min(Math.max(size, total + value.length), Math.max(cap, total + value.length)));
        next.set(buf.subarray(0, total));
        buf = next;
      }
      buf.set(value, total);
      total += value.length;
    }
  }
  if (!total) error(400, `${what} is empty`);
  return total === buf.length ? buf : buf.subarray(0, total);
}
/** The first buffer `readBody` makes for a body that declares more (round sixty). */
const GROW_FROM = 1024 * 1024;

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
  let whole = true;
  for (const sub of ['log', 'photo']) if (!(await walk(r2, `vault/${id}/${sub}/`, (o) => (bytes += o.size)))) whole = false;
  // A listing cut short by the bound is a floor, not the figure: it never writes a smaller total over a larger one
  // (round fifty-eight; the server review), which would have let a vault past the bound store past its allowance.
  if (!whole) bytes = Math.max(bytes, meta.bytes);
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
/** The counter object's methods as the Worker calls them (src/lib/server/counters.ts); the byte methods are optional so a test's object can count creations alone. */
export type CountersNs = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    create(address: string, day: string, perAddress: number, perDay: number, max: number, seed?: number | null, now?: number, net?: string | null): Promise<Creation>;
    refund(address: string, day: string, net?: string | null): Promise<void>;
    fill?(vault: string, max: number, seed?: number | null, day?: string | null, perDay?: number, now?: number): Promise<'counted' | 'already' | 'total' | 'day' | 'unavailable'>;
    unfill?(vault: string): Promise<boolean>;
    take?(kind: 'vault' | 'address', n: number, limit: number, day: string, base?: number | null, now?: number, gen?: number | null): Promise<{ ok: boolean; before: number; lease?: string } | { recount: true }>;
    give?(kind: 'vault' | 'address', n: number, day: string, token?: string | null): Promise<number>;
    release?(lease: string, landed: boolean): Promise<void>;
    setBytes?(bytes: number, day: string, gen?: number | null, now?: number): Promise<number | null>;
    bytesToday?(day: string): Promise<number | null>;
    generation?(now?: number): Promise<{ gen: number; at: number | null; busy?: boolean }>;
    hold?(name: string, now?: number): Promise<{ ok: true; token: string; claimed?: number | null } | { ok: false; retryAfter: number }>;
    unhold?(name: string, token: string, claimed?: boolean, now?: number): Promise<void>;
    renew?(name: string, token: string, now?: number): Promise<boolean>;
    inFlight?(now?: number): Promise<number>;
    touch?(vault: string, day: string, max: number, seed?: number | null, reclaimed?: boolean, now?: number): Promise<'already' | 'adopted' | 'counted' | 'total' | 'unavailable'>;
    removing?(token: string, now?: number): Promise<void>;
    markUnnamed?(name: string, now?: number): Promise<void>;
    upstream?(services: string[], share: number, address?: string | null, net?: string | null, now?: number): Promise<UpstreamAnswer>;
  };
};
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
  // The day's count is taken at the vault's first object (`admitVault`), as the object counts it (round sixty).
  return 'ok';
}

/**
 * The service has as many vaults as it takes, or as many new ones as it takes today, and this one holds nothing yet: its
 * first object is refused, as a creation is (round fifty-nine; the day's ceiling since round sixty). Answered 503 with
 * the sentence the sync page shows and a Retry-After the device waits out.
 */
export class VaultsClosed extends Error {
  readonly status = 503;
  /** `reclaimed`: a vault whose place was given back after 90 days without an upload, refused a place again (round sixty-one). */
  constructor(public readonly which: 'total' | 'day' = 'total', private readonly now = Date.now(), public readonly reclaimed = false) {
    super('sync is not taking new vaults');
  }
  response(): Response {
    const text = this.reclaimed
      ? 'Sync is full for now. This vault had no upload for 90 days, so its place was given back. What it holds stays on the server, and every device can still receive from it, but only an upload takes a place again: receiving does not. Your changes stay on this device, which asks again within the hour.'
      : this.which === 'day'
      ? 'Sync has taken all the new vaults it can today, and this vault holds nothing yet. Your collection stays on this device; it will try again tomorrow.'
      : 'Sync is not taking new vaults for now, and this vault holds nothing yet. Your collection stays on this device.';
    // A reclaimed vault is asked about again within the hour, as its sentence says (round sixty-two); the engine keeps at
    // most an hour in any case.
    const wait = this.which === 'day' ? untilMidnight(this.now) : this.reclaimed ? 3600 : 86400;
    return new Response(JSON.stringify({ error: text }), { status: STATUS.ceilings, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(wait) } });
  }
}

/**
 * A vault's first object whose place could not be checked (the counter object did not answer, or could not be seeded):
 * refused for a minute, never stored uncounted (round sixty; the self-review and both outside reviews, A19 and B8: a
 * vault stored unchecked held objects past the ceiling in all, and was later told it "holds nothing yet").
 */
export class VaultUnchecked extends Error {
  readonly status = 503;
  constructor() {
    super("sync could not check this vault's place");
  }
  response(): Response {
    return new Response(JSON.stringify({ error: 'The site could not count this vault just now; try again in a minute.' }), { status: STATUS.ceilings, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '60' } });
  }
}

/**
 * A vault's first stored object takes its place under the ceiling in all and the day's ceiling of new vaults, before it
 * is written (round fifty-eight: not at creation, so a vault made and never used holds no place; the day's too since
 * round sixty). Round fifty-nine (two reviews): the counter object decides and records it by the vault's id in one
 * step, so twenty first uploads at once, or a request that wrote an old meta back, count the vault once. Round sixty: it
 * FAILS CLOSED. A counter that throws or cannot be seeded refuses the upload for a minute (`VaultUnchecked`); before,
 * the object was stored uncounted. The routes call this before they read the body, so a refused upload costs no
 * sixteen megabytes. True when this call took the vault's place (its caller gives it back if nothing then lands).
 *
 * Round sixty-one: the meta says `filled` only once an object has landed (`landed`), not at admission, so a Worker
 * stopped between the two leaves a vault whose next upload is checked again (the server review, 6). A vault that has a
 * place is looked at once a day per isolate (`touch`): the day of its last upload is kept, and a place reclaimed after
 * 90 days without one is taken again. Without the counter object the KV fallback counts a vault once, by a key of its
 * own (`vaultplace:<id>`), and gives back the day's count too (the server review, 7).
 */
export async function admitVault(r2: R2Bucket, id: string, meta: VaultMeta, quota?: Quota): Promise<boolean> {
  if (admitting.has(meta)) return false; // this request admitted it already (the route, before the body)
  const kv = quota?.kv;
  const ns = quota?.counters;
  const max = quota?.max ?? MAX_VAULTS;
  const now = quota?.now ?? Date.now();
  if (meta.filled !== false) return touchVault(r2, id, meta, quota, now);
  let took = false;
  try {
    const o = ns?.get(ns.idFromName('vaults'));
    if (o?.fill) {
      let seed: number | null = 0;
      try { seed = kv ? Number((await kv.get('vaults:all')) ?? 0) : 0; } catch { seed = null; }
      const r = await o.fill(id, max, seed, day(now), quota?.perDay ?? MAX_NEW_VAULTS_ALL_PER_DAY, now);
      if (r === 'total' || r === 'day') throw new VaultsClosed(r, now);
      if (r === 'unavailable') throw new VaultUnchecked();
      took = r === 'counted';
    } else if (kv) {
      const kDay = `vaults:all:${day(now)}`;
      const kPlace = `vaultplace:${id}`;
      const [n, nDay, placed] = await Promise.all([kv.get('vaults:all'), kv.get(kDay), kv.get(kPlace)]);
      if (placed == null) {
        if (Number(n ?? 0) >= max) throw new VaultsClosed('total', now);
        if (Number(nDay ?? 0) >= (quota?.perDay ?? MAX_NEW_VAULTS_ALL_PER_DAY)) throw new VaultsClosed('day', now);
        // The vault's own key first: a second first upload that reads it is not counted again (round sixty-one).
        await kv.put(kPlace, day(now));
        await kv.put('vaults:all', String(Number(n ?? 0) + 1));
        await kv.put(kDay, String(Number(nDay ?? 0) + 1), { expiration: endOfNextDay(day(now)) }).catch(() => {});
        took = true;
      }
    } // no counters at all (a test, a bare dev server): nothing to count against
  } catch (e) {
    if (e instanceof VaultsClosed || e instanceof VaultUnchecked) throw e;
    console.error("sync: a vault's first object could not be counted under the ceiling in all; refused for a minute", e);
    throw new VaultUnchecked();
  }
  admitting.add(meta);
  return took;
}
/** The metas (one per request) whose vault this request has admitted: its store does not ask again (round sixty-one). */
const admitting = new WeakSet<VaultMeta>();
/** Vaults with a place looked at today by this isolate, by id: the day. Bounded, as the rate windows are. */
const touched = new Map<string, string>();

/**
 * A vault that has a place uploads (round sixty-one): once a day per isolate the counter object keeps the day, and a
 * vault whose place was reclaimed after 90 days without an upload takes one again, under the ceiling in all. Past it the
 * upload is refused as a new vault is, in words that say the vault holds what it holds.
 *
 * Round sixty-two (the triage, 6; B11): a vault whose meta says it was reclaimed (`reclaimedAt`) needs a checked place
 * before it writes, every time until it has one: a counter that throws or cannot answer refuses the write for a minute
 * (`VaultUnchecked`), since nothing else shows that it holds a place. Any other vault that has a place is let go when the
 * counter cannot be asked (asked again by the next upload): it is not refused for the counter's fault. Reads never come
 * here. A vault adopted (from before round fifty-eight, or first filled under it) or counted again has its meta written:
 * `filled`, and no `reclaimedAt`.
 */
async function touchVault(r2: R2Bucket, id: string, meta: VaultMeta, quota: Quota | undefined, now: number): Promise<boolean> {
  const ns = quota?.counters;
  const o = ns?.get(ns.idFromName('vaults'));
  if (!o?.touch) return false;
  const reclaimed = typeof meta.reclaimedAt === 'number';
  const today = day(now);
  if (!reclaimed && touched.get(id) === today) return false;
  let r: Awaited<ReturnType<NonNullable<typeof o.touch>>>;
  try {
    let seed: number | null = 0;
    try { seed = quota?.kv ? Number((await quota.kv.get('vaults:all')) ?? 0) : 0; } catch { seed = null; }
    r = await o.touch(id, today, quota?.max ?? MAX_VAULTS, seed, reclaimed, now);
  } catch (e) {
    if (reclaimed) { console.error("sync: a reclaimed vault's place could not be checked; its upload is refused for a minute", e); throw new VaultUnchecked(); }
    console.error("sync: a vault's place could not be looked at; this upload goes on, and the next asks again", e);
    return false;
  }
  if (r === 'total') throw new VaultsClosed('total', now, true);
  if (r === 'unavailable') { if (reclaimed) throw new VaultUnchecked(); return false; }
  if (reclaimed || meta.filled === undefined) {
    delete meta.reclaimedAt;
    meta.filled = true;
    await writeMeta(r2, id, meta).catch((e) => console.error("sync: a vault's meta was not written after its place was checked; the next upload checks again", e));
  }
  if (touched.size > 5000) touched.clear();
  touched.set(id, today);
  return r === 'counted';
}

/**
 * A vault's first object has landed (round sixty-one; the server review, 5 and 6): its place is asked for once more,
 * past any ceiling, since the object is stored and a concurrent first upload that failed may have given the place back
 * while this one was landing; then the meta says `filled`. Best-effort, and logged when it fails: the next upload, whose
 * meta still reads unfilled, asks again.
 */
async function landed(r2: R2Bucket, id: string, meta: VaultMeta, quota?: Quota): Promise<void> {
  const now = quota?.now ?? Date.now();
  try {
    const ns = quota?.counters;
    const o = ns?.get(ns.idFromName('vaults'));
    if (o?.fill) {
      let seed: number | null = 0;
      try { seed = quota?.kv ? Number((await quota.kv.get('vaults:all')) ?? 0) : 0; } catch { seed = null; }
      const r = await o.fill(id, Infinity, seed, day(now), Infinity, now);
      if (r === 'unavailable') return;
    } else if (quota?.kv && (await quota.kv.get(`vaultplace:${id}`)) == null) {
      const n = Number((await quota.kv.get('vaults:all')) ?? 0);
      await quota.kv.put(`vaultplace:${id}`, day(now));
      await quota.kv.put('vaults:all', String(n + 1));
    }
    meta.filled = true;
    await writeMeta(r2, id, meta);
  } catch (e) {
    console.error("sync: a vault's first object landed and its place was not confirmed; the next upload asks again", e);
  }
}

/**
 * A vault admitted by this request whose object then did not land: its place goes back, unless the vault already holds
 * an object (another upload of it landed) or another upload of it is in flight (round sixty-one; the server review, 5),
 * and its meta still says unfilled, so its next upload is counted (round sixty; B8). Without the counter object, the
 * vault's own key and the day's count go back too (round sixty-one; the server review, 7). Best-effort, and logged when
 * it fails: the place is then held until the 90-day sweep gives it back.
 */
export async function unadmit(r2: R2Bucket, id: string, meta: VaultMeta, quota?: Quota): Promise<void> {
  admitting.delete(meta);
  try {
    for (const sub of ['log', 'photo']) if ((await r2.list({ prefix: `vault/${id}/${sub}/`, limit: 1 })).objects.length) {
      // The vault holds something and keeps its place; its meta can say so now.
      if (meta.filled === false) { meta.filled = true; await writeMeta(r2, id, meta).catch(() => {}); }
      return;
    }
    const ns = quota?.counters;
    const v = ns?.get(ns.idFromName(`bytes:${id}`));
    if (v?.inFlight && (await v.inFlight(quota?.now ?? Date.now())) > 0) return;
    const o = ns?.get(ns.idFromName('vaults'));
    if (o?.unfill) await o.unfill(id);
    else if (quota?.kv) {
      const placed = await quota.kv.get(`vaultplace:${id}`);
      if (placed == null) return;
      const kDay = `vaults:all:${placed}`;
      const [n, nDay] = (await Promise.all([quota.kv.get('vaults:all'), quota.kv.get(kDay)])).map((x) => Number(x ?? 0));
      await quota.kv.delete(`vaultplace:${id}`);
      if (n > 0) await quota.kv.put('vaults:all', String(n - 1));
      if (nDay > 0) await quota.kv.put(kDay, String(nDay - 1), { expiration: endOfNextDay(placed) });
    } else return;
    // The stored meta still says unfilled (it says filled only once an object lands), so it is not written: a write here
    // could put "unfilled" over a concurrent upload's landing.
    meta.filled = false;
  } catch (e) {
    console.error("sync: a vault's place was not given back after its first object failed", e);
  }
}

/** The answer for a refusal a store can throw (full, the day's bytes, a ceiling, an unchecked place, a busy name, a crossed recount, a removed photograph's name), or null for anything else. */
export function refusal(e: unknown): Response | null {
  return e instanceof VaultFull || e instanceof DayQuota || e instanceof VaultsClosed || e instanceof VaultUnchecked || e instanceof PhotoBusy || e instanceof RecountCrossed || e instanceof PhotoRemoved ? e.response() : null;
}

/** A creation counted by the object and then not made (the vault write threw): the count goes back, so a grower retrying through an R2 blip is not told they made too many (round twenty-two, 1). Best-effort. */
export async function refundCreation(counters: CountersNs | undefined, ip: string, now = Date.now()): Promise<void> {
  if (!counters) return;
  await counters.get(counters.idFromName('vaults')).refund(addressKey(ip), day(now), networkKey(ip)).catch((e) => console.warn('sync: a vault-creation refund did not land', e));
}

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
  /** A sheet bucket the Worker's cache did not hold, charged per bucket derived: a device asks for at most 32 in a life, and a bucket is one R2 read when the corpus build wrote it, a few hundred when not. */
  sheets: { limit: 200, windowMs: 600_000 },
  /** A catalogue search: a person typing makes a few a second for a few seconds, each answered from memory and kept in the Worker's cache (the Cache API) for a day, so only a query not asked that day is counted (round sixty: a Worker's own answer is not kept by the edge on its own); an office or a campus behind one address is many people (round forty, R1-3). */
  search: { limit: 3000, windowMs: 600_000 },
  /** A search the shard found nothing for, tried over the whole index: a second of work at fifty thousand species, so few a minute (round fifty-five, 4; both reviewers). */
  searchmiss: { limit: 60, windowMs: 600_000 },
  /** A species address the reference does not hold, asked of the backbone's match service: a person follows a few old labels an hour; a script could mint them without end (round thirty-three, 12). */
  match: { limit: 60, windowMs: 600_000 },
  /** A reference file (a dossier, an entries bucket, a sitemap file): every request reaches the Worker, since the edge does not keep a Worker's own answer (round sixty), and each is answered from memory or one R2 read. A device asks for a few dozen per corpus, and its service worker keeps them. */
  reference: { limit: 600, windowMs: 600_000 },
  /** The whole index: megabytes per answer, which no page needs (the catalogue and the search are served in windows), so a handful an hour is plenty (round fifty-one, 6). */
  index: { limit: 6, windowMs: 600_000 },
  /** A species or front page rendered that the page cache cannot hold (a `?was=` page, a client navigation's data, a HEAD the cache did not have): generous, since a reader clicks through many, but bounded (round sixty; the server review, 6). */
  render: { limit: 1200, windowMs: 600_000 },
  /** Calls to another service under this site's name, for every address together: a pool of addresses could otherwise get the site's User-Agent blocked, and the frost watch would say "not checked" for everyone (round sixty; the server review, 16). Since round sixty-one each service (MET Norway, the NWS, GBIF) has a share of its own of this many a minute, counted in the counter object, and one address may take a tenth of a share (`upstreamCall`). */
  upstream: { limit: 600, windowMs: 60_000 }
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
export async function rateLimit(kv: KVNamespace | undefined, bucket: RateBucket, ip: string, now = Date.now(), flushMs = RATE_FLUSH_MS, scale = 1): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const { windowMs } = RATE[bucket];
  const limit = RATE[bucket].limit * scale;
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

/**
 * The buckets that spend a call to another service under this site's name (MET Norway, the NWS, GBIF): counted by an
 * IPv6 address's /48 too, at four times one address's allowance, since a host holding a /48 has 65,536 /64s to rotate
 * through and each was a fresh allowance (round fifty-eight; the server review; as vault creation is counted since
 * round thirty-eight, R1-8). And the buckets that cost this Worker's own time (round fifty-nine, the corpus reviews),
 * and since round sixty the sync, object, index and sheet buckets and uncached renders too (the server review, 4 and 9:
 * a vault opened from twenty /64s of one /48 was walked twenty times, and the whole index answered two hundred).
 */
const UPSTREAM: ReadonlySet<RateBucket> = new Set(['forecast', 'names', 'match', 'search', 'searchmiss', 'reference', 'sync', 'syncobj', 'index', 'sheets', 'render']);
export const NET_RATE_FACTOR = NET_FACTOR;
/** The services this site calls under its own name, each with its own share of `RATE.upstream` a minute (round sixty-one). */
export type Upstream = 'met' | 'nws' | 'gbif';
export type UpstreamAnswer = { ok: true } | { ok: false; who: 'site' | 'address' | 'network' | 'reserve'; service: string; retryAfter: number };
/** The words of a call the site held back (round sixty-one; the triage, 6). */
export const HELD_BACK = "not asked: this site's calls are used up for this minute";
export const HELD_BACK_ADDRESS = "not asked: this address has used its part of this site's calls for this minute";
/** The network around the address (its /24 or /48) has used its part: said as the network's, since this address may have made no call at all (round sixty-three; S2). */
export const HELD_BACK_NETWORK = "not asked: this network has used its part of this site's calls for this minute";
/**
 * The last quarter of a share is kept for networks that have not called in the minute, and this one has (round
 * sixty-three; the server review of the round, R3 1): said as that, since the site's calls are not used up then.
 */
export const HELD_BACK_RESERVE = "not asked: the rest of this site's calls for this minute are kept for visitors on networks that have not called yet";

/**
 * The network an address is counted in for the shares of outside calls (round sixty-three; S2): an IPv4 address's /24
 * as well as an IPv6 address's /48, so ten addresses of one /24 take four parts of a share, not ten. Only the shares
 * count by /24; vault creation and the request windows count an IPv6 /48 alone, as before (`networkKey`). Null for an
 * address that is neither ('unknown').
 */
export function upstreamNetwork(ip: string): string | null {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  return networkKey(ip);
}

/**
 * The site's own calls to other services (round sixty-one; the server review, 4; B13). Each of MET Norway, the NWS and
 * GBIF has a share of `RATE.upstream.limit` calls a minute for every address together, and one address (`ip`, keyed as
 * `clientIp` keys it) may take at most a tenth of a share, an IPv6 /48 four tenths: one host spent the whole minute in a
 * second, and every other visitor was told the source "did not answer". All of `services` are taken or none: a US
 * forecast is two calls, MET's and the NWS's. `ip` null counts the share alone.
 *
 * Counted in the counter object named "upstream", so the cap is one for the whole site. Without the binding, or when the
 * object does not answer, each isolate counts in its own memory and shares the count through KV once a second: that
 * bounds each isolate exactly and the site only roughly, since isolates that open the same minute each pass a share
 * before they see one another's counts.
 */
export async function upstreamCall(platform: App.Platform | undefined, services: Upstream[], ip: string | null, now = Date.now()): Promise<UpstreamAnswer> {
  const share = RATE.upstream.limit;
  const net = ip ? upstreamNetwork(ip) : null; // an IPv4 /24 too since round sixty-three (S2)
  const ns = platform?.env?.COUNTERS as unknown as CountersNs | undefined;
  if (ns) {
    try {
      const o = ns.get(ns.idFromName('upstream'));
      if (o.upstream) return await o.upstream(services, share, ip, net, now);
    } catch (e) {
      console.error("sync: the counter of this site's outside calls did not answer; counted in this isolate for now", e);
    }
  }
  const kv = platform?.env?.QUEUE;
  const retry = (r: { ok: false; retryAfter: number }) => r.retryAfter;
  for (const s of services) {
    for (const [who, scale, said] of [[ip, UPSTREAM_ADDRESS_PART, 'address'], [net, UPSTREAM_ADDRESS_PART * NET_RATE_FACTOR, 'network']] as const) {
      if (!who) continue;
      const r = await rateLimit(kv, 'upstream', `${s}:${who}`, now, 1_000, scale);
      if (!r.ok) return { ok: false, who: said, service: s, retryAfter: retry(r) };
    }
    const r = await rateLimit(kv, 'upstream', s, now, 1_000);
    if (!r.ok) return { ok: false, who: 'site', service: s, retryAfter: retry(r) };
  }
  return { ok: true };
}
/** One address's part of a share in a minute, and the /48's factor: from caps.ts, which counters.ts reads too (round sixty-two). */
export { UPSTREAM_ADDRESS_PART };
/**
 * The answer for a call the site held back: 503 with Retry-After to the next minute when the site's share is used up,
 * or its rest is kept for networks that have not called (`reserve`, its own words since round sixty-three), 429 when
 * this address or its network has used its part; plain JSON, never cached, and `held: true` so a page can say that the
 * source was not asked, not that it did not answer (rule 2).
 */
export function heldBack(r: Extract<UpstreamAnswer, { ok: false }>): Response {
  if (r.who === 'address') return tooMany(HELD_BACK_ADDRESS, r.retryAfter, { held: true, service: r.service });
  if (r.who === 'network') return tooMany(HELD_BACK_NETWORK, r.retryAfter, { held: true, service: r.service });
  // `reserve: true` lets a page that writes its own sentence (the forecast's) tell the two 503s apart.
  return json({ error: r.who === 'reserve' ? HELD_BACK_RESERVE : HELD_BACK, held: true, ...(r.who === 'reserve' ? { reserve: true } : {}), service: r.service, retryAfter: r.retryAfter }, { status: STATUS.ceilings, headers: { 'retry-after': String(r.retryAfter), 'cache-control': 'no-store' } });
}
/** Check the bucket for this request; a 429 Response to return, or null to go on. */
export async function limited(platform: App.Platform | undefined, getClientAddress: () => string, bucket: RateBucket): Promise<Response | null> {
  const ip = clientIp(getClientAddress);
  const r = await rateLimit(platform?.env?.QUEUE, bucket, ip);
  if (!r.ok) return tooMany('too many requests from this address; wait and try again', r.retryAfter);
  const net = UPSTREAM.has(bucket) ? networkKey(ip) : null;
  if (net) {
    const n = await rateLimit(platform?.env?.QUEUE, bucket, net, Date.now(), RATE_FLUSH_MS, NET_RATE_FACTOR);
    if (!n.ok) return tooMany('too many requests from this network; wait and try again', n.retryAfter);
  }
  return null;
}

/** The counters' context for a store, from the request. */
export const quotaOf = (platform: App.Platform | undefined, getClientAddress: () => string): Quota => {
  const ceilings = creationCeilings(platform?.env as Record<string, unknown> | undefined);
  return { kv: platform?.env?.QUEUE, ip: clientIp(getClientAddress), counters: platform?.env?.COUNTERS as unknown as CountersNs | undefined, max: ceilings.max, perDay: ceilings.perDay };
};
