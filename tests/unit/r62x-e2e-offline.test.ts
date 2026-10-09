/**
 * Round sixty-two, the first deploy: the browser suite's local server asks no outside service (`E2E_OFFLINE`), so a PC
 * that can reach GBIF gives the suite the silence it was written against. Never set in production: without the variable
 * every request goes through.
 */
import { it, expect } from 'vitest';
import { handleFetch } from '../../src/hooks.server';

const ev = (env: Record<string, string> = {}) => ({ url: new URL('http://127.0.0.1:4173/api/names?q=x'), platform: { env } }) as never;
const passed: string[] = [];
const fetch = (async (r: Request) => { passed.push(r.url); return new Response('ok'); }) as typeof globalThis.fetch;

it('under E2E_OFFLINE a request to another host fails as an unreachable one does; the site itself is still asked', async () => {
  passed.length = 0;
  await expect(handleFetch({ event: ev({ E2E_OFFLINE: '1' }), request: new Request('https://api.gbif.org/v1/species/suggest?q=x'), fetch })).rejects.toThrow(TypeError);
  await handleFetch({ event: ev({ E2E_OFFLINE: '1' }), request: new Request('http://127.0.0.1:4173/api/corpus'), fetch });
  expect(passed).toEqual(['http://127.0.0.1:4173/api/corpus']);
});

it('without it (production), every request goes through', async () => {
  passed.length = 0;
  await handleFetch({ event: ev(), request: new Request('https://api.gbif.org/v1/species/suggest?q=x'), fetch });
  expect(passed).toEqual(['https://api.gbif.org/v1/species/suggest?q=x']);
});
