import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { store, vaultId, authed, batchKey, listBatches, parseAfter, storeOnce, readBody, batchMeta, VaultFull, DayQuota, MAX_BATCH_BYTES, limited, quotaOf } from '$lib/server/sync';

/**
 * Batches that arrived at or after ?since=<ms> (less a minute of overlap), oldest arrival first.
 * When the page is cut short the reply carries `next: { at, key }`; the next page is asked for with
 * ?after=<at>:<key> (strictly after that pair, no overlap). A request without `after` behaves as it always has.
 * One request walks the vault's prefix once, bounded (see `MAX_LIST_PAGES`); 429 with Retry-After past the rate limit.
 */
export const GET: RequestHandler = async ({ request, url, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'sync');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  await authed(r2, id, request);
  const since = url.searchParams.get('since');
  const after = parseAfter(url.searchParams.get('after'));
  return json(await listBatches(r2, id, since == null || since === '' ? null : Number(since), 500, after), { headers: { 'cache-control': 'no-store' } });
};

/**
 * Push one sealed batch. Header X-Batch: its name (last HLC, content hash). Body: the sealed bytes.
 * Optional X-Batch-Plain (SHA-256 hex of the changes as JSON) and X-Device let a re-seal of the same
 * batch from the same device be answered 200 as already there. 200 only when the server now holds
 * that batch under that name; 409 when the name holds something else; 507 when the vault is full;
 * 429 with Retry-After when the address has used its day's bytes or the rate limit.
 */
export const POST: RequestHandler = async ({ request, url, platform, getClientAddress }) => {
  const r2 = store(platform);
  const stop = await limited(platform, getClientAddress, 'sync');
  if (stop) return stop;
  const id = vaultId(url.searchParams.get('vault'));
  const meta = await authed(r2, id, request);
  const key = batchKey(id, request.headers.get('x-batch') ?? '');
  const extra = batchMeta(request);
  const body = await readBody(request, MAX_BATCH_BYTES, 'a batch');
  let r: Awaited<ReturnType<typeof storeOnce>>;
  try {
    r = await storeOnce(r2, id, meta, key, body, extra, quotaOf(platform, getClientAddress));
  } catch (e) {
    if (e instanceof VaultFull || e instanceof DayQuota) return e.response();
    throw e;
  }
  if (r === 'different') return json({ error: 'a different batch already has that name' }, { status: 409 });
  return json({ stored: r === 'stored', reason: r === 'same' ? 'already there' : undefined });
};
