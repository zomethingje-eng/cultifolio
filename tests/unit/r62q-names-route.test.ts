/**
 * Round sixty-two, decision 3: the names route reads a pasted name as the search does (A7, A8). NFKC, no format
 * characters, and a curly apostrophe or an ampersand is no reason for a 400. Each case FAILED on the base (a 400, or a
 * word broken in two) unless it says guard.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '../../src/routes/api/names/+server';
import { resetRateLimits } from '$lib/server/sync';

function kvFake() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}
let asked: string[] = [];
function call(q: string) {
  const url = new URL(`http://x/api/names?q=${encodeURIComponent(q)}`);
  const platform = { env: { QUEUE: kvFake() }, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
  const upstream = async (u: string) => { asked.push(new URL(u).searchParams.get('q') ?? ''); return new Response('[]', { status: 200 }); };
  return GET({ url, platform, fetch: upstream as typeof fetch, getClientAddress: () => '1.2.3.4' } as never);
}
beforeEach(() => { resetRateLimits(); asked = []; });

describe('/api/names reads a pasted name (A7, A8)', () => {
  it('a curly apostrophe and an ampersand are asked, not refused', async () => {
    expect((await call('Aloe ’Blue Elf’')).status).toBe(200); // base: 400
    expect((await call('Copiapoa cinerea Britton & Rose')).status).toBe(200); // base: 400
    expect(asked).toEqual(["Aloe 'Blue Elf'", 'Copiapoa cinerea Britton & Rose']); // the apostrophe as GBIF reads one
  });
  it('a zero-width space or a soft hyphen is taken out, and full-width letters are read as letters', async () => {
    expect((await call('Copia​poa cinerea')).status).toBe(200);
    expect((await call('Copia­poa')).status).toBe(200);
    expect((await call('Ｃｏｐｉａｐｏａ')).status).toBe(200);
    expect(asked).toEqual(['Copiapoa cinerea', 'Copiapoa', 'Copiapoa']); // base: "Copia​poa cinerea" sent whole, a word GBIF does not hold
  });
  it('guard: a digit is still refused, as no name has one', async () => {
    expect((await call('Copiapoa cinerea KK 1234')).status).toBe(400);
  });
});
