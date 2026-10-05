/** Round sixty: the front page's search reads the server's relaxed retry from `x-search-relaxed`, and a plain answer stays plain. */
import { describe, it, expect, vi, afterEach } from 'vitest';

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; vi.resetModules(); });

function serve(search: () => Response) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = String(input);
    if (u.startsWith('/api/corpus')) return new Response(JSON.stringify({ id: 'c1', buckets: 32 }), { headers: { 'content-type': 'application/json' } });
    if (u.startsWith('/api/search')) return search();
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

describe('searchCatalogue', () => {
  it('carries the relaxed query when the server searched the first two words instead', async () => {
    serve(() => new Response(JSON.stringify([{ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }]), { headers: { 'content-type': 'application/json', 'x-search-relaxed': encodeURIComponent('Copiapoa cinerea') } }));
    const { searchCatalogue } = await import('$lib/ui/index.svelte');
    const r = await searchCatalogue('Copiapoa cinerea var. columna-alba');
    expect(Array.isArray(r)).toBe(true);
    expect((r as { relaxed?: { query: string } }).relaxed).toEqual({ query: 'Copiapoa cinerea' });
    expect((r as unknown[]).length).toBe(1);
  });
  it('a plain answer has no relaxed query', async () => {
    serve(() => new Response(JSON.stringify([{ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }]), { headers: { 'content-type': 'application/json' } }));
    const { searchCatalogue } = await import('$lib/ui/index.svelte');
    const r = await searchCatalogue('Copiapoa cinerea');
    expect((r as { relaxed?: unknown }).relaxed).toBeUndefined();
  });
});
