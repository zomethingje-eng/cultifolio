import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, authed, batchKey, listBatches, storeOnce, readBody, MAX_BATCH_BYTES } from '$lib/server/sync';

/** Batches that arrived at or after ?since=<ms> (less a minute of overlap), oldest arrival first. */
export const GET: RequestHandler = async ({ request, url, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  const since = url.searchParams.get('since');
  return json(await listBatches(r2, id, since == null || since === '' ? null : Number(since)), { headers: { 'cache-control': 'no-store' } });
};

/** Push one sealed batch. Header X-Batch: its name (last HLC, content hash). Body: the sealed bytes. 200 only when the server now holds exactly these bytes under that name. */
export const POST: RequestHandler = async ({ request, url, platform }) => {
  const r2 = store(platform);
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const key = batchKey(id, request.headers.get('x-batch') ?? '');
  const body = await readBody(request, MAX_BATCH_BYTES, 'a batch');
  const r = await storeOnce(r2, id, meta, key, body);
  if (r === 'different') return json({ error: 'a different batch already has that name' }, { status: 409 });
  return json({ stored: r === 'stored', reason: r === 'same' ? 'already there' : undefined });
};
