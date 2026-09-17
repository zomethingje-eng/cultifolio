import type { RequestHandler } from './$types';
import { store, vaultId, authed, batchKey } from '$lib/server/sync';

/** One sealed batch. */
export const GET: RequestHandler = async ({ request, url, params, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  const o = await r2.get(batchKey(id, params.key));
  if (!o) return new Response('no such batch', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable' } });
};
