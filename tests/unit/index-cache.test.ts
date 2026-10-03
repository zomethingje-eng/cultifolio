/**
 * The parsed index is kept per isolate and, past its minute, revalidated by the object's etag with a `head` rather
 * than re-read: on a quiet site the first request of nearly every minute paid a four-megabyte fetch and parse before
 * it answered, and that was most of a species page's time to first byte (round forty-three, 1).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getIndex, getCorpusId, _forgetIndex } from '$lib/server/dossiers';

const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ key: i + 1, slug: `s-${i + 1}`, name: `Genus s${i + 1}`, family: 'F', climate: 'ok', open: 0 }));

function r2(initial: { etag: string; body: unknown }) {
  const state = { etag: initial.etag, body: initial.body, gets: 0, heads: 0 };
  return {
    state,
    // A bucket with no manifest (round fifty-three, 2): the manifest is asked for first and is not there, which is not a read of the index.
    get: async (k: string) => { if (k.endsWith('manifest.json')) return null; state.gets++; return { text: async () => JSON.stringify(state.body), json: async () => state.body, etag: state.etag }; },
    head: async (k: string) => { if (k.endsWith('manifest.json')) return null; state.heads++; return { etag: state.etag }; } // the look for a manifest each minute is not a head of the index (round fifty-four, 3)
  };
}
const platformWith = (store: ReturnType<typeof r2>) => ({ env: { STORE: store } }) as unknown as App.Platform;

describe('the index cache (round forty-three, 1)', () => {
  beforeEach(() => { _forgetIndex(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('reads the index once, answers from memory within the minute, and past the minute asks for the etag alone while it is unchanged', async () => {
    const store = r2({ etag: '"aaa"', body: rows(3) });
    const p = platformWith(store);
    expect((await getIndex(p, noStatic)).length).toBe(3);
    await getIndex(p, noStatic);
    expect(store.state).toMatchObject({ gets: 1, heads: 0 });
    vi.advanceTimersByTime(61_000);
    expect((await getIndex(p, noStatic)).length).toBe(3);
    expect(store.state).toMatchObject({ gets: 1, heads: 1 });
    // the head renews the minute: the next request within it asks nothing
    await getIndex(p, noStatic);
    expect(store.state).toMatchObject({ gets: 1, heads: 1 });
    vi.advanceTimersByTime(61_000);
    await getIndex(p, noStatic);
    expect(store.state).toMatchObject({ gets: 1, heads: 2 });
  });

  it('re-reads the index when the etag has changed (an upload), and the corpus id changes with it', async () => {
    const store = r2({ etag: '"aaa"', body: rows(3) });
    const p = platformWith(store);
    await getIndex(p, noStatic);
    const before = await getCorpusId(p, noStatic);
    store.state.etag = '"bbb"';
    store.state.body = rows(5);
    vi.advanceTimersByTime(61_000);
    expect((await getIndex(p, noStatic)).length).toBe(5);
    expect(store.state).toMatchObject({ gets: 2, heads: 1 });
    expect(await getCorpusId(p, noStatic)).not.toBe(before);
  });

  it('a store without head answers (an object gone) falls back to a read', async () => {
    const store = r2({ etag: '"aaa"', body: rows(3) });
    (store as { head: unknown }).head = async (k: string) => { if (k.endsWith('manifest.json')) return null; store.state.heads++; return null; };
    const p = platformWith(store);
    await getIndex(p, noStatic);
    vi.advanceTimersByTime(61_000);
    await getIndex(p, noStatic);
    expect(store.state).toMatchObject({ gets: 2, heads: 1 });
  });
});

describe('round fifty-two, 5: fixtures stand in only under the fixture corpus', () => {
  beforeEach(() => { _forgetIndex(); });
  it('a real index that names a species whose record the bucket lacks gets no record, not the synthetic one; the fixture corpus still does', async () => {
    const { getDossier, getGenus } = await import('$lib/server/dossiers');
    // a bucket whose index lists Copiapoa cinerea's key but holds no dossier or genus object for it
    const store = { get: async (path: string) => (path.endsWith('index.json') ? { text: async () => JSON.stringify([{ key: 5384013, slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', family: 'Cactaceae', climate: 'ok', open: 0, photos: 0 }]), etag: '"real"' } : null), head: async () => ({ etag: '"real"' }) };
    const p = { env: { STORE: store } } as unknown as App.Platform;
    expect(await getIndex(p, noStatic)).toHaveLength(1);
    expect(await getDossier(p, noStatic, 5384013)).toBeNull();
    expect(await getGenus(p, noStatic, 'copiapoa')).toBeNull();
    // no bucket, no static corpus: the fixtures are the corpus, and answer
    _forgetIndex();
    expect((await getIndex(undefined, noStatic)).length).toBeGreaterThan(1);
    expect((await getDossier(undefined, noStatic, 5384013))?.name.scientific).toBe('Copiapoa cinerea');
  });
});
