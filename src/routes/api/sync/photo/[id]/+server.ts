import { json, error } from '@sveltejs/kit';
import { STATUS } from '$lib/sync/limits';
import type { RequestHandler } from './$types';
import { store, vaultId, authed, photoKey, storeOnce, deleteCounted, readBody, VaultFull, DayQuota, VaultsClosed, MAX_PHOTO_BYTES, limited, quotaOf, dropProof } from '$lib/server/sync';

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
  // The proof is judged before the body is read: a request without it was read whole first (round fifty-eight).
  const drop = dropProof(request); // kept with the object; its DELETE must repeat it (round fifty-one, 2)
  if (!drop) error(400, 'x-photo-drop is required: a photograph is stored with the proof its removal will repeat');
  const body = await readBody(request, MAX_PHOTO_BYTES, 'a photo');
  let r: Awaited<ReturnType<typeof storeOnce>>;
  try {
    r = await storeOnce(r2, id, meta, key, body, { drop }, quotaOf(platform, getClientAddress));
  } catch (e) {
    if (e instanceof VaultFull || e instanceof DayQuota || e instanceof VaultsClosed) return e.response();
    throw e;
  }
  if (r === 'different') return json({ error: 'a different photo already has that id' }, { status: STATUS.differentContent });
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

/**
 * Remove a photograph's ciphertext once its record is removed: the bytes come off the vault's count (round forty-nine, 1).
 * Idempotent: nothing there is 404, which the device takes as done. The request carries the proof the upload left
 * (a keyed fingerprint only a key-holder can make); without it, 403:
 * the bearer token alone can add to a vault, never destroy in it (round fifty-one, 2).
 */
export const DELETE: RequestHandler = async ({ request, url, params, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'syncobj');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const gone = await deleteCounted(r2, id, meta, photoKey(id, params.id), quotaOf(platform, getClientAddress), dropProof(request));
  if (gone === 'noproof') return json({ error: 'the removal proof is missing or does not match the one the upload left' }, { status: 403 });
  return gone ? json({ deleted: true }) : new Response('no such photo', { status: 404 });
};
