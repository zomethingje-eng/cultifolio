/**
 * Round sixty-two (agent A, Today's "Check again"): a failed read of the species sheets lets go of every failed bucket,
 * not only the first, so one "Check again" asks for all of them. Failed on the base: the second call asked one bucket.
 */
import { it, expect, vi } from 'vitest';
it('a second call asks again for every bucket that failed, not one of them', async () => {
  vi.resetModules();
  let fail = true;
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.startsWith('/api/corpus')) return new Response(JSON.stringify({ id: 'fixture', buckets: 32 }), { status: 200 });
    asked.push(url);
    if (fail) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify([]), { status: 200 });
  });
  const { sheetsFor } = await import('$lib/ui/index.svelte');
  const slugs = ['copiapoa-cinerea', 'welwitschia-mirabilis']; // two buckets of 32
  expect(await sheetsFor(slugs)).toBeNull();
  fail = false;
  asked.length = 0;
  expect(await sheetsFor(slugs)).not.toBeNull();
  expect(asked).toHaveLength(2);
  vi.unstubAllGlobals();
});
