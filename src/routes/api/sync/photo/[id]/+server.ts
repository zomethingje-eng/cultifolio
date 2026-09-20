import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, authed, photoKey, storeOnce, readBody, VaultFull, DayQuota, MAX_PHOTO_BYTES, limited, quotaOf } from '$lib/server/sync';

export const GET: RequestHandler = async ({ request, url, params, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'syncobj');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  const o = await r2.get(photoKey(id, params.id));
  if (!o) return new Response('no such photo', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable' } });
};

/**
 * Store a sealed photo. Photos are immutable by id: the same bytes again is a no-op, different bytes
 * under a held id are refused (409); a full vault is 507; an address past its day's bytes or the
 * rate limit is 429 with Retry-After.
 */
export const PUT: RequestHandler = async ({ request, url, params, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'syncobj');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const key = photoKey(id, params.id);
  const body = await readBody(request, MAX_PHOTO_BYTES, 'a photo');
  let r: Awaited<ReturnType<typeof storeOnce>>;
  try {
    r = await storeOnce(r2, id, meta, key, body, {}, quotaOf(platform, getClientAddress));
  } catch (e) {
    if (e instanceof VaultFull || e instanceof DayQuota) return e.response();
    throw e;
  }
  if (r === 'different') return json({ error: 'a different photo already has that id' }, { status: 409 });
  return json({ stored: r === 'stored', reason: r === 'same' ? 'already there' : undefined });
};

export const HEAD: RequestHandler = async ({ request, url, params, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'syncobj');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  return new Response(null, { status: (await r2.head(photoKey(id, params.id))) ? 200 : 404 });
};
