/**
 * Round sixty-two, second pass, agent S: a claim moves the pointer (the server review, 1), against wrangler's own R2. A
 * photograph stored once has no pointer; the same upload again (a retry after a lost reply) claims it and writes one
 * naming the first generation, under R2's "only if absent"; the photograph still reads, is removed, and is stored again.
 */
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const vaultIdFor = (token: string) => { const d = createHash('sha256').update('id:' + token).digest(); let s = ''; for (let i = 0; i < 26; i++) s += B32[d[i] % B32.length]; return s; };
const OWNER = 'd'.repeat(64);

test('a claim on a first generation names it in a pointer; the photograph reads, is removed and is stored again (round sixty-two, second pass; the server review, 1)', async ({ request }) => {
  const token = createHash('sha256').update(`r62bs ${Date.now()} ${Math.random()}`).digest('hex');
  const id = vaultIdFor(token);
  const auth = { authorization: `Bearer ${token}` };
  expect((await request.post('/api/sync/vault', { headers: { 'cf-connecting-ip': '198.51.100.63' }, data: { id, token, create: true } })).status()).toBe(200);
  const url = `/api/sync/photo/p00r62bs?vault=${id}`;
  const put = (bytes: number[]) => request.put(url, { headers: { ...auth, 'x-photo-drop': OWNER, 'content-type': 'application/octet-stream' }, data: Buffer.from(bytes) });
  const get = async () => { const r = await request.get(url, { headers: auth }); return r.status() === 200 ? [...(await r.body())] : r.status(); };
  const del = () => request.delete(url, { headers: { ...auth, 'x-photo-drop': OWNER, 'x-photo-removed-at': String(Date.now() + 2_000) } });

  expect((await put([1, 2, 3])).status()).toBe(200);
  // the retry: already there, claimed, and the pointer now names the first generation
  const again = await put([1, 2, 3]);
  expect([again.status(), ((await again.json()) as { stored: boolean }).stored]).toEqual([200, false]);
  expect(await get()).toEqual([1, 2, 3]);
  // a re-seal of it (different bytes) is 409, a claim too, and moves the pointer again under its etag
  expect((await put([7])).status()).toBe(409);
  expect(await get()).toEqual([1, 2, 3]);
  // the removal's condition is the pointer as it reads it now: it goes through
  expect((await del()).status()).toBe(200);
  expect(await get()).toBe(404);
  expect((await del()).status()).toBe(404);
  expect((await put([4, 5])).status()).toBe(200);
  expect(await get()).toEqual([4, 5]);
});
