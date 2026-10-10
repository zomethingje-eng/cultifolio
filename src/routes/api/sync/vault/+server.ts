import { json } from '@sveltejs/kit';
import { STATUS } from '$lib/sync/limits';
import type { RequestHandler } from './$types';
import { store, vaultId, vaultIdFor, ensureVault, authed, readMeta, recount, vaultBytes, allowCreation, refundCreation, creationCeilings, clientIp, limited, readBody, quotaOf, RecountCrossed, untilMidnight } from '$lib/server/sync';

/** The most a creation body may be: its three fields are under two hundred bytes. */
const MAX_VAULT_BODY = 1024;

/**
 * Create or open a vault. Body: { id, token, create }. The token is hashed
 * and never stored; it is also the one thing the id can be checked against,
 * and it is, so a vault cannot be made under a name its key would not derive.
 */
export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'sync');
  if (stop) return stop;
  // JSON only: a body of another type is what a page on another site can send without asking first (round fifty-eight;
  // the server review). The hook refuses a write that names another site; this refuses one that names none.
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return json({ error: 'the body must be application/json' }, { status: 415, headers: { 'cache-control': 'no-store' } });
  // A body that is valid JSON but not an object (`null`, a number) is treated like no body: a 400 below, never a 500 (round sixteen, 16).
  // Read through the capped reader, not `request.json()`: this is the one route with no token to check first, and it read
  // whatever a stranger streamed, up to the platform's limit, before judging it (round thirty-eight, R1-4). A creation body is a
  // few hundred bytes; a kilobyte is generous.
  const text = await readBody(request, MAX_VAULT_BODY, 'a vault request').then((b) => new TextDecoder().decode(b)).catch((e: unknown) => { if ((e as { status?: number })?.status === STATUS.tooBig) throw e; return ''; });
  let raw: unknown = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    raw = {};
  }
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
  const now = Date.now(); // one instant for the count and any refund, so a creation counted at 23:59:59 is refunded on the same day's keys (round twenty-three, 8)
  if (!existing) {
    // Three ceilings on new vaults (per address, for everyone today, in all), and a refusal is a plain answer the sync
    // page shows as it is, never a 500: 429 for the address's own limit, 503 with a sentence that says which shared ceiling, the day's or the total, and what still works.
    // `clientIp`, not the raw callback: a local runtime can give no address at all, and `addressKey(null)` was a 500 on every creation under `wrangler dev` (round twenty-one, R1-1).
    const may = await allowCreation(platform?.env?.QUEUE, clientIp(getClientAddress), now, creationCeilings(platform?.env as Record<string, unknown> | undefined), platform?.env?.COUNTERS);
    // The counts are kept by the UTC day, so each of these waits until midnight UTC: an hour's Retry-After was refused again
    // until then. The /48's own count is said as the network's, since this address may have made none (round sixty-seven;
    // triage-66 S9, S-D7).
    const midnight = String(untilMidnight(now));
    if (may === 'address') return json({ error: 'too many new vaults from this address today', retryAfter: Number(midnight) }, { status: STATUS.rateLimited, headers: { 'retry-after': midnight, 'cache-control': 'no-store' } });
    if (may === 'network') return json({ error: 'too many new vaults from this network today', retryAfter: Number(midnight) }, { status: STATUS.rateLimited, headers: { 'retry-after': midnight, 'cache-control': 'no-store' } });
    if (may === 'day') return json({ error: 'Sync has taken all the new vaults it can today. Your collection stays on this device; try again tomorrow.', retryAfter: Number(midnight) }, { status: STATUS.ceilings, headers: { 'retry-after': midnight, 'cache-control': 'no-store' } });
    if (may === 'unavailable') return json({ error: 'Sync could not count new vaults just now. Your collection stays on this device; try again in a minute.' }, { status: STATUS.ceilings, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
    if (may === 'total') return json({ error: 'Sync is not taking new vaults for now. Your collection stays on this device; joining an existing vault still works.' }, { status: STATUS.ceilings, headers: { 'retry-after': '86400', 'cache-control': 'no-store' } });
  }
  let made: Awaited<ReturnType<typeof ensureVault>>;
  try {
    made = await ensureVault(r2, id, body.token, open);
  } catch (e) {
    if (!existing) await refundCreation(platform?.env?.COUNTERS, clientIp(getClientAddress), now); // counted above, not made: the slot goes back (round twenty-two, 1)
    throw e;
  }
  const { created, meta } = made;
  // Two devices creating the same vault at once: both were counted, one made it; the other's count goes back (round twenty-three, 7).
  if (!existing && !created) await refundCreation(platform?.env?.COUNTERS, clientIp(getClientAddress), now);
  // A (re)join is the moment the slow, authoritative listing puts the live counter right.
  const kv = platform?.env?.QUEUE;
  let bytes: number;
  try {
    bytes = created ? 0 : kv ? await vaultBytes(r2, kv, id, meta, Date.now(), true, quotaOf(platform, getClientAddress)) : await recount(r2, id, meta);
  } catch (e) {
    // Two listings crossed by landing uploads: 503 with Retry-After, and the device asks again (round sixty-one; B11).
    if (e instanceof RecountCrossed) return e.response();
    throw e;
  }
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
  let bytes: number;
  try {
    bytes = kv ? await vaultBytes(r2, kv, id, meta, Date.now(), false, quotaOf(platform, getClientAddress)) : meta.bytes;
  } catch (e) {
    if (e instanceof RecountCrossed) return e.response(); // round sixty-one; B11
    throw e;
  }
  return json({ entitlement: meta.entitlement, bytes, created: meta.created });
};
