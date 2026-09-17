import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, authed, photoKey, addBytes } from '$lib/server/sync';

export const GET: RequestHandler = async ({ request, url, params, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  const o = await r2.get(photoKey(id, params.id));
  if (!o) return new Response('no such photo', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable' } });
};

/** Store a sealed photo. Photos are immutable by id; a second put of the same id is a no-op. */
export const PUT: RequestHandler = async ({ request, url, params, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const key = photoKey(id, params.id);
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > 12 * 1024 * 1024) return json({ error: 'photo must be 1 byte to 12 MB' }, { status: 400 });
  if (await r2.head(key)) return json({ stored: false, reason: 'already there' });
  await r2.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' } });
  await addBytes(r2, id, meta, body.length);
  return json({ stored: true });
};

export const HEAD: RequestHandler = async ({ request, url, params, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  return new Response(null, { status: (await r2.head(photoKey(id, params.id))) ? 200 : 404 });
};
