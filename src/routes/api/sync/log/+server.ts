import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, authed, batchKey, listBatches, addBytes } from '$lib/server/sync';

/** Batches after ?after=<hlc>, oldest first. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  return json(await listBatches(r2, id, url.searchParams.get('after')), { headers: { 'cache-control': 'no-store' } });
};

/** Push one sealed batch. Header X-Batch: the HLC of its last change. Body: the sealed bytes. */
export const POST: RequestHandler = async ({ request, url, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const key = batchKey(id, request.headers.get('x-batch') ?? '');
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > 16 * 1024 * 1024) return json({ error: 'batch must be 1 byte to 16 MB' }, { status: 400 });
  if (await r2.head(key)) return json({ stored: false, reason: 'already there' });
  await r2.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' } });
  await addBytes(r2, id, meta, body.length);
  return json({ stored: true });
};
