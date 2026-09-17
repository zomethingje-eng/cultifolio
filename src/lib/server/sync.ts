/**
 * Sync storage: ciphertext in, ciphertext out. The Worker knows a vault by its
 * id and a hash of its token; it never holds a key and cannot read a byte of
 * what it stores. Layout in R2:
 *
 *   vault/<id>/meta.json          { tokenHash, created, entitlement }
 *   vault/<id>/log/<hlc>.bin      one sealed batch of changes; <hlc> is the batch's last change
 *   vault/<id>/photo/<photoId>.bin one sealed photo (full + thumb)
 *
 * Batches are listed in key order, which is HLC order, so "everything after
 * cursor X" is one list call. Nothing is ever rewritten; a vault only grows,
 * which is what makes the merge on every device idempotent.
 */
import { error } from '@sveltejs/kit';
import { tokenHash } from '$lib/sync/crypto';

export interface VaultMeta {
  tokenHash: string;
  created: string;
  /** 'open' while nobody pays; the licence check lands here. */
  entitlement: 'open' | 'licensed' | 'none';
  /** Bytes stored, kept as a running total so quotas need no listing. */
  bytes: number;
}

const ID = /^[A-HJKMNP-TV-Z2-9]{26}$/;
const HLC = /^\d{13}-[0-9a-f]{4}-[a-z0-9]{1,16}$/;
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
  await r2.put(`vault/${id}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
  return { created: true, meta };
}

export const batchKey = (id: string, hlc: string) => {
  if (!HLC.test(hlc)) error(400, 'batch key must be an HLC');
  return `vault/${id}/log/${hlc}.bin`;
};
export const photoKey = (id: string, photoId: string) => {
  if (!PHOTO.test(photoId)) error(400, 'bad photo id');
  return `vault/${id}/photo/${photoId}.bin`;
};

/** Batches after a cursor, oldest first. */
export async function listBatches(r2: R2Bucket, id: string, after: string | null, limit = 500): Promise<{ keys: string[]; more: boolean }> {
  const prefix = `vault/${id}/log/`;
  const r = await r2.list({ prefix, limit, startAfter: after ? `${prefix}${after}.bin` : undefined });
  return { keys: r.objects.map((o) => o.key.slice(prefix.length, -'.bin'.length)), more: r.truncated };
}

/** A generous per-vault ceiling until quotas are real: 2 GB. */
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export async function addBytes(r2: R2Bucket, id: string, meta: VaultMeta, n: number): Promise<void> {
  meta.bytes += n;
  if (meta.bytes > MAX_BYTES) error(413, 'this vault is over its storage allowance');
  await r2.put(`vault/${id}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
}
