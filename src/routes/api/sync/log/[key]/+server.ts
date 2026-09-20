import type { RequestHandler } from './$types';
import { store, vaultId, authed, batchKey, limited } from '$lib/server/sync';

/** One sealed batch. */
export const GET: RequestHandler = async ({ request, url, params, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'syncobj');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  const o = await r2.get(batchKey(id, params.key));
  if (!o) return new Response('no such batch', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable' } });
};
