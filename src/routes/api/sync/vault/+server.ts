import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, vaultIdFor, ensureVault, authed, readMeta, recount, vaultBytes, allowCreation, limited } from '$lib/server/sync';

/**
 * Create or open a vault. Body: { id, token, create }. The token is hashed
 * and never stored; it is also the one thing the id can be checked against,
 * and it is, so a vault cannot be made under a name its key would not derive.
 */
export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'sync');
  if (stop) return stop;
  const body = (await request.json().catch(() => ({}))) as { id?: string; token?: string; create?: boolean };
  const id = vaultId(body.id ?? null);
  if (!body.token || !/^[0-9a-f]{64}$/.test(body.token)) return json({ error: 'token required' }, { status: 400 });
  // Joining a second device must not quietly make a fresh empty vault out of a mistyped key.
  const existing = await readMeta(r2, id);
  if (body.create === false && !existing) return json({ error: 'no vault answers to that key' }, { status: 404 });
  // A new vault only under the name its own token derives (an existing one is decided by the token hash, 403 when wrong).
  if (!existing && (await vaultIdFor(body.token)) !== id) return json({ error: 'that vault id does not belong to that token' }, { status: 400 });
  // SYNC_OPEN=1 (dev, and the launch before licences) lets any vault sync; anything else, including an unset variable, means a licence must be attached later.
  const open = platform?.env?.SYNC_OPEN === '1';
  if (!existing && !(await allowCreation(platform?.env?.QUEUE, getClientAddress()))) return json({ error: 'too many new vaults from this address today' }, { status: 429, headers: { 'retry-after': '3600', 'cache-control': 'no-store' } });
  const { created, meta } = await ensureVault(r2, id, body.token, open);
  // A (re)join is the moment the slow, authoritative listing puts the live counter right.
  const kv = platform?.env?.QUEUE;
  const bytes = created ? 0 : kv ? await vaultBytes(r2, kv, id, meta, Date.now(), true) : await recount(r2, id, meta);
  return json({ created, entitlement: meta.entitlement, bytes });
};

/** Vault status. `bytes` is the live counter where KV is bound, else the meta snapshot. */
export const GET: RequestHandler = async ({ request, url, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'sync');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const kv = platform?.env?.QUEUE;
  const bytes = kv ? await vaultBytes(r2, kv, id, meta) : meta.bytes;
  return json({ entitlement: meta.entitlement, bytes, created: meta.created });
};
