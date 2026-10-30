/**
 * Round eighty-three, second part (A): a merged page's old address goes to its kept page even where another page holds
 * the same name. `/species/echeveria-peacockii` answered 404 ("Echeveria peacockii is an older name of two species of the
 * reference, so this address leads to neither …"), because Kew's file also files the name, by another author, under
 * Dudleya pulverulenta; the owner's decision is that a merged page's old address leads to its kept page (302, as
 * `/species/bisnaga-hamatacantha` does to Ferocactus hamatacanthus). The kept page knows its merges from its own record
 * (`occurrences.keys` with the old address, `slug`), so the Worker decides with no new file.
 *
 *   1. `mergedHolder`: the one holder whose record carries the address; none when two do, or none does.
 *   2. The 11 merged addresses on the live corpus's own entries and records (tests/unit/fixtures/r83a-live-merged.json,
 *      read from the live site on 2026-10-29): the ten that moved still move where they moved, and Echeveria peacockii
 *      moves to Echeveria desmetiana, where it was a 404.
 *   3. The kept page, reached so, says the name is merged into it and is also an older name of Dudleya pulverulenta by
 *      another author, with the author Dudleya's record writes and a link; Dudleya's own page, and a shared name no merge
 *      made, are as before.
 *
 * FAILS on r83b: 1 (no `mergedHolder`), 2 (echeveria-peacockii is a 404), 3 (no `wasMerged`, no authors).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from '../../src/routes/species/[slug]/+page.server';
import * as lookupMod from '$lib/server/lookup';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';
import type { Ref } from '$dossier/lookups';

const LIVE = JSON.parse(readFileSync('tests/unit/fixtures/r83a-live-merged.json', 'utf8')) as {
  live: Record<string, string>;
  entries: IndexEntry[];
  records: Record<string, { authorship: string; synonyms: string[]; keys: Array<{ key: number; name: string; kew: string; n: number; from: 'download' | 'api'; slug?: string }> }>;
};
const BASE = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));

/** A corpus of these entries, each page's dossier the fixture's with its name, older names and keys as recorded. */
function corpusOf(entries: IndexEntry[], records: typeof LIVE.records) {
  const dossierOf = (e: IndexEntry) => {
    const r = records[e.key];
    return { ...BASE, key: e.key, slug: e.slug, ids: e.gbif != null ? { gbif: e.gbif } : {}, links: {}, name: { ...BASE.name, scientific: e.name, genus: e.name.split(' ')[0], family: e.family ?? BASE.name.family, authorship: r?.authorship ?? '', synonyms: r?.synonyms ?? [], vernacular: [] }, occurrences: { ...BASE.occurrences, ...(r?.keys?.length ? { keys: r.keys } : {}) } };
  };
  const STORE = { get: async (path: string) => { const e = entries.find((x) => path.endsWith(`/${x.key}.json`)); return e ? { json: async () => dossierOf(e) } : null; } };
  const corpus = { at: Date.now(), idx: entries, bySlug: new Map(entries.map((e) => [e.slug, e.key])), corpus: 'r83a', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
  return (slug: string, was?: string) => {
    const url = new URL(`http://x/species/${slug}${was ? `?was=${encodeURIComponent(was)}` : ''}`);
    return { params: { slug }, platform: { env: { STORE } }, fetch: (async (u: string | URL) => { throw new Error(`asked ${String(u)}`); }) as typeof fetch, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.83', locals: { corpus } } as unknown as Parameters<typeof load>[0];
  };
}
const answer = async (p: unknown) => {
  try { await p; } catch (e) { const x = e as { status: number; location?: string }; return x.location ? `${x.status} ${x.location}` : String(x.status); }
  return '200';
};
type Data = { was: string | null; wasMerged?: boolean; wasShared: Array<{ slug: string; name: string; authors?: string[] }> };

describe('1. mergedHolder: the holder whose record names the address as a merged page\'s old address', () => {
  const holders: Ref[] = [['k2781125', 'echeveria-desmetiana', 'Echeveria desmetiana'], ['k2778991', 'dudleya-pulverulenta', 'Dudleya pulverulenta']];
  const merged = { occurrences: { keys: [{ slug: 'echeveria-peacockii' }] } };
  it('the one holder that says so, whatever the order', () => {
    const fn = (lookupMod as Record<string, unknown>).mergedHolder as (a: string, h: Ref[], r: unknown[]) => Ref | null;
    expect(typeof fn).toBe('function');
    expect(fn('echeveria-peacockii', holders, [merged, { occurrences: {} }])).toEqual(holders[0]);
    expect(fn('echeveria-peacockii', [holders[1], holders[0]], [{ occurrences: {} }, merged])).toEqual(holders[0]);
    // A record not read does not stop the one that was read and says so.
    expect(fn('echeveria-peacockii', holders, [merged, null])).toEqual(holders[0]);
  });
  it('guard: none when no record says so, when two do, or for another address', () => {
    const fn = (lookupMod as Record<string, unknown>).mergedHolder as (a: string, h: Ref[], r: unknown[]) => Ref | null;
    expect(fn('echeveria-peacockii', holders, [{ occurrences: {} }, null])).toBeNull();
    expect(fn('echeveria-peacockii', holders, [merged, merged])).toBeNull();
    expect(fn('echeveria-argentea', holders, [merged, {}])).toBeNull();
  });
});

describe('2. the 11 merged addresses, on the live corpus\'s entries and records', () => {
  const event = corpusOf(LIVE.entries, LIVE.records);
  const want = (slug: string) => (slug === 'echeveria-peacockii' ? '302 /species/echeveria-desmetiana?was=Echeveria%20peacockii' : LIVE.live[slug]);
  it('the live answers read: ten moves and one 404 (Echeveria peacockii)', () => {
    expect(Object.keys(LIVE.live)).toHaveLength(11);
    expect(Object.entries(LIVE.live).filter(([, a]) => !a.startsWith('302 ')).map(([s]) => s)).toEqual(['echeveria-peacockii']);
  });
  for (const slug of Object.keys(LIVE.live)) {
    it(`/species/${slug}: ${want(slug)}`, async () => {
      expect(await answer(load(event(slug)))).toBe(want(slug)); // r83b: echeveria-peacockii 404
    });
  }
  it('guard: a name both pages hold that no merge made is the 404 that names both, as before', async () => {
    // Cotyledon peacockii is Dudleya's older name; given to Echeveria desmetiana too here, it is a shared name no merge made.
    const entries = LIVE.entries.map((e) => (e.key === 'k2781125' ? { ...e, syn: [...(e.syn ?? []), 'Cotyledon peacockii'] } : e));
    expect(await answer(load(corpusOf(entries, LIVE.records)('cotyledon-peacockii')))).toBe('404');
  });
});

describe('3. the kept page, reached by the old address, says so under its name', () => {
  const event = corpusOf(LIVE.entries, LIVE.records);
  it('Echeveria desmetiana: the name is merged here, and is also an older name of Dudleya pulverulenta by another author', async () => {
    const data = (await load(event('echeveria-desmetiana', 'Echeveria peacockii'))) as unknown as Data;
    expect(data.was).toBe('Echeveria peacockii');
    expect(data.wasMerged).toBe(true); // r83b: undefined
    expect(data.wasShared).toEqual([{ slug: 'dudleya-pulverulenta', name: 'Dudleya pulverulenta', authors: ['Croucher ex T.Moore & Mast.'] }]);
  });
  it('the line, as the page writes it', () => {
    const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(page).toContain('{:else if data.was && data.wasMerged && data.wasShared?.length}');
    expect(page).toContain('is the name of a page merged into this one. It is also an older name of');
    expect(page).toContain(', by another author (${o.authors.map((a) => `${data.was} ${a}`).join(\' and \')})');
  });
  it('/about/how says a merged page\'s old address goes to its kept page, shared name or not', () => {
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toContain('But the old address of a page merged into one of them goes to that one (/species/echeveria-peacockii is Echeveria desmetiana');
  });
  it('guard: Dudleya pulverulenta under the same name is as before (a shared name, no merge, no authors read)', async () => {
    const data = (await load(event('dudleya-pulverulenta', 'Echeveria peacockii'))) as unknown as Data;
    expect(data.wasMerged).toBeFalsy();
    expect(data.wasShared).toEqual([{ slug: 'echeveria-desmetiana', name: 'Echeveria desmetiana' }]);
  });
  it('guard: the other kept pages hold their old name alone, so their line is as before', async () => {
    for (const [slug, a] of Object.entries(LIVE.live)) {
      if (slug === 'echeveria-peacockii') continue;
      const to = new URL(a.slice(4), 'http://x');
      const data = (await load(event(to.pathname.split('/').pop()!, to.searchParams.get('was')!))) as unknown as Data;
      expect(data.was, slug).toBe(to.searchParams.get('was'));
      expect(data.wasShared, slug).toEqual([]);
    }
  });
});
