import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, vaultIdFor, ensureVault, authed, readMeta, recount, vaultBytes, allowCreation, refundCreation, creationCeilings, clientIp, limited } from '$lib/server/sync';

/**
 * Create or open a vault. Body: { id, token, create }. The token is hashed
 * and never stored; it is also the one thing the id can be checked against,
 * and it is, so a vault cannot be made under a name its key would not derive.
 */
export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'sync');
  if (stop) return stop;
  // A body that is valid JSON but not an object (`null`, a number) is treated like no body: a 400 below, never a 500 (round sixteen, 16).
  const raw: unknown = await request.json().catch(() => ({}));
  const body = (raw && typeof raw === 'object' ? raw : {}) as { id?: string; token?: string; create?: boolean };
  const id = vaultId(body.id ?? null);
  if (!body.token || !/^[0-9a-f]{64}$/.test(body.token)) return json({ error: 'token required' }, { status: 400 });
  // Joining a second device must not quietly make a fresh empty vault out of a mistyped key.
  const existing = await readMeta(r2, id);
  if (body.create === false && !existing) return json({ error: 'no vault answers to that key' }, { status: 404 });
  // A new vault only under the name its own token derives (an existing one is decided by the token hash, 403 when wrong).
  if (!existing && (await vaultIdFor(body.token)) !== id) return json({ error: 'that vault id does not belong to that token' }, { status: 400 });
  // SYNC_OPEN=1 (dev, and the launch before licences) lets any vault sync; anything else, including an unset variable, means a licence must be attached later.
  const open = platform?.env?.SYNC_OPEN === '1';
  if (!existing) {
    // Three ceilings on new vaults (per address, for everyone today, in all), and a refusal is a plain answer the sync
    // page shows as it is, never a 500: 429 for the address's own limit, 503 with a sentence that says which shared ceiling, the day's or the total, and what still works.
    // `clientIp`, not the raw callback: a local runtime can give no address at all, and `addressKey(null)` was a 500 on every creation under `wrangler dev` (round twenty-one, R1-1).
    const may = await allowCreation(platform?.env?.QUEUE, clientIp(getClientAddress), Date.now(), creationCeilings(platform?.env as Record<string, unknown> | undefined), platform?.env?.COUNTERS);
    if (may === 'address') return json({ error: 'too many new vaults from this address today' }, { status: 429, headers: { 'retry-after': '3600', 'cache-control': 'no-store' } });
    if (may === 'day') return json({ error: 'Sync has taken all the new vaults it can today. Your collection stays on this device; try again tomorrow.' }, { status: 503, headers: { 'retry-after': '3600', 'cache-control': 'no-store' } });
    if (may === 'unavailable') return json({ error: 'Sync could not count new vaults just now. Your collection stays on this device; try again in a minute.' }, { status: 503, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
    if (may === 'total') return json({ error: 'Sync is not taking new vaults for now. Your collection stays on this device; joining an existing vault still works.' }, { status: 503, headers: { 'retry-after': '86400', 'cache-control': 'no-store' } });
  }
  let made: Awaited<ReturnType<typeof ensureVault>>;
  try {
    made = await ensureVault(r2, id, body.token, open);
  } catch (e) {
    if (!existing) await refundCreation(platform?.env?.COUNTERS, clientIp(getClientAddress)); // counted above, not made: the slot goes back (round twenty-two, 1)
    throw e;
  }
  const { created, meta } = made;
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
