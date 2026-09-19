import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, ensureVault, authed, readMeta, recount, allowCreation } from '$lib/server/sync';

/** Create or open a vault. Body: { id, token }. The token is hashed and never stored. */
export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  const r2 = store(platform);
  const body = (await request.json().catch(() => ({}))) as { id?: string; token?: string; create?: boolean };
  const id = vaultId(body.id ?? null);
  if (!body.token || !/^[0-9a-f]{64}$/.test(body.token)) return json({ error: 'token required' }, { status: 400 });
  // Joining a second device must not quietly make a fresh empty vault out of a mistyped key.
  if (body.create === false && !(await readMeta(r2, id))) return json({ error: 'no vault answers to that key' }, { status: 404 });
  // SYNC_OPEN=1 (dev, and the launch before licences) lets any vault sync; anything else, including an unset variable, means a licence must be attached later.
  const open = platform?.env?.SYNC_OPEN === '1';
  const existing = await readMeta(r2, id);
  if (!existing && !(await allowCreation(platform?.env?.QUEUE, getClientAddress()))) return json({ error: 'too many new vaults from this address today' }, { status: 429 });
  const { created, meta } = await ensureVault(r2, id, body.token, open);
  // A (re)join is a cheap moment to put the byte total right; concurrent uploads can drift it.
  if (!created) await recount(r2, id, meta);
  return json({ created, entitlement: meta.entitlement, bytes: meta.bytes });
};

/** Vault status. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  return json({ entitlement: meta.entitlement, bytes: meta.bytes, created: meta.created });
};
