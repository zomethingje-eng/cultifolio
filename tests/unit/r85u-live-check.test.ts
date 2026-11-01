/**
 * Round eighty-five, agent U: the owner's decision 9 and reviews A18, B5 and C5. The zone answers `/api/index` and
 * `/api/counts` from its cache with `public, max-age=14400` (its Browser Cache TTL) where the routes say 300. Round
 * eighty-four's live check read one GET of `/api/index`, which right after an upload is a miss carrying the route's own
 * header, and passed; it never read `/api/counts`. Now each route is asked until the edge answers from its cache, and
 * that answer's header is judged; a route the edge never answers from its cache fails, since a miss cannot show it.
 *
 * On r85base `edgeHitGet`, `edgeVerdict` and `EDGE_ROUTES` did not exist, and the check passed the miss-then-hit run
 * below on its first GET.
 */
import { describe, it, expect } from 'vitest';
import { edgeHitGet, edgeVerdict, EDGE_ROUTES, indexCacheFault } from '../../scripts/live-check-cache.mjs';

type A = { status: number; h: (k: string) => string };
const answer = (status: string | null, cc: string, edge = true, code = 200): A => ({ status: code, h: (k: string) => ({ 'cf-cache-status': status ?? '', 'cache-control': cc, 'cf-ray': edge ? '8d1f00aa11bb22cc-EWR' : '' } as Record<string, string>)[k] ?? '' });
/** A fake `get` answering each path from its own list, in turn, the last answer repeated. */
function fake(lists: Record<string, A[]>) {
  const asked: string[] = [];
  const get = async (path: string) => { asked.push(path); const l = lists[path]; return l.length > 1 ? l.shift()! : l[0]; };
  return { get, asked };
}
const noWait = { sleep: async () => {} };

describe('the index and the counts are judged on an edge hit (decision 9; A18, B5, C5)', () => {
  it('both routes are checked', () => {
    expect(EDGE_ROUTES).toEqual(['/api/index', '/api/counts']);
  });
  it('a miss that says 300, then a hit that says four hours: the hit is read, and fails, naming the dashboard setting', async () => {
    const { get, asked } = fake({ '/api/counts': [answer('MISS', 'public, max-age=300'), answer('HIT', 'public, max-age=14400')] });
    const got = await edgeHitGet(get, '/api/counts', noWait);
    expect(got).toMatchObject({ hit: true, tries: 2 });
    expect(asked).toEqual(['/api/counts', '/api/counts']);
    const v = edgeVerdict('/api/counts', got);
    expect(v.fail).toMatch(/^\/api\/counts's cache lifetime on an edge hit: it says max-age=14400 \(240 minutes\).*Browser Cache TTL to "Respect Existing Headers", purge \/api\/counts/);
  });
  it('a hit that says 300 passes, and says it was a hit', async () => {
    const { get } = fake({ '/api/index': [answer('MISS', 'public, max-age=300'), answer('HIT', 'public, max-age=300')] });
    const v = edgeVerdict('/api/index', await edgeHitGet(get, '/api/index', noWait));
    expect(v.fail).toBeNull();
    expect(v.ok).toBe('/api/index: an edge hit (after 2 GETs) says "public, max-age=300", within the 5 minutes promised');
  });
  it('never a hit through the edge: fails, rather than passing on a miss', async () => {
    const { get, asked } = fake({ '/api/index': [answer('MISS', 'public, max-age=300')] });
    const got = await edgeHitGet(get, '/api/index', { ...noWait, tries: 5 });
    expect(asked).toHaveLength(5);
    expect(edgeVerdict('/api/index', got).fail).toMatch(/none of 5 GETs a second apart was answered from the edge's cache \(cf-cache-status "MISS"\)/);
  });
  it('a local server, with no edge: judged on its own header, asked once, and said so', async () => {
    const { get, asked } = fake({ '/api/counts': [answer(null, 'public, max-age=300', false)] });
    const got = await edgeHitGet(get, '/api/counts', noWait);
    expect(asked).toHaveLength(1);
    expect(edgeVerdict('/api/counts', got)).toEqual({ fail: null, ok: '/api/counts: no edge here (a local server) says "public, max-age=300", within the 5 minutes promised' });
  });
  it('an error answer fails at once', async () => {
    const { get, asked } = fake({ '/api/counts': [answer('MISS', 'no-store', true, 503)] });
    const got = await edgeHitGet(get, '/api/counts', noWait);
    expect(asked).toHaveLength(1);
    expect(edgeVerdict('/api/counts', got).fail).toBe('/api/counts answered 503');
  });
  it('the header rule names the route it judged', () => {
    expect(indexCacheFault('public, max-age=14400', '/api/counts')).toMatch(/purge \/api\/counts,/);
    expect(indexCacheFault('public, max-age=14400')).toMatch(/purge \/api\/index,/);
  });
});
