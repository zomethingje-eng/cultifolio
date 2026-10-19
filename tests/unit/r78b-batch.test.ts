/**
 * Round seventy-eight, agent B: the build's batched sources (`src/lib/dossier/batch.ts`).
 *
 *   - Equality on recorded answers: four real species (Aloe vera, Welwitschia mirabilis, Kroenleinia grusonii, Haworthia
 *     decipiens), each built with the real builder once on the answers Wikidata and Wikipedia gave species by species and
 *     once on the answers their batches gave, all recorded live on 2026-10-19 by `scripts/dev/scale/r78b-batch-proof.ts`
 *     (`fixtures/r78b-batch-recorded.json`; each entity's claims cut to the properties the build reads, alike in both): the two dossiers are the same, field for field.
 *   - Rule 2: a batch that does not answer leaves each of its species not checked (Wikidata or Wikipedia refused or
 *     failed), never "none", and a title Wikipedia does not hold is "none" only because the batch said so.
 *   - Rule 3: an item is taken by its GBIF key only when one item carries it, as the search's answer said; statements of
 *     every rank count, as the search counts them.
 *   - The REST summary's shape: the lead's first paragraph, a disambiguation page said as one, a redirect's title.
 * Each case FAILED on r78base (no `batch.ts`) unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDossier } from '$dossier/build';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';

const batch = await import('$dossier/batch').catch(() => null);
const need = () => { if (!batch) throw new Error('src/lib/dossier/batch.ts is missing'); return batch; };

type Recorded = Record<string, Record<string, unknown>>;
const recorded = JSON.parse(readFileSync('tests/unit/fixtures/r78b-batch-recorded.json', 'utf8')) as { species: Array<{ key: number; name: string }>; answers: Recorded };
/** A recorded answer table as a fetcher: an address not recorded is refused, so a test never takes a gap for an absence. */
const replay = (table: Record<string, unknown>, asked?: string[]): JsonFetcher =>
  (async <T>(url: string): Promise<FetchResult<T>> => {
    asked?.push(url);
    if (!(url in table)) return { status: 'refused', detail: `not recorded: ${url}` };
    const v = table[url] as { __status?: string; detail?: string };
    if (v && typeof v === 'object' && '__status' in v) return (v.__status === 'none' ? { status: 'none' } : { status: v.__status, detail: v.detail ?? '' }) as FetchResult<T>;
    return { status: 'ok', data: v as T };
  }) as JsonFetcher;
const opts = (fetcher: JsonFetcher) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-19T12:00:00Z'), skip: ['inat', 'commons', 'gbif.media', 'openalex'] as Array<'inat' | 'commons' | 'gbif.media' | 'openalex'> });
const WIKIMEDIA = /^https:\/\/[^/]*(wikipedia|wikidata|wikimedia)\.org\//;

describe('equality on recorded answers: the batched path writes what the per-species path wrote', () => {
  for (const sp of recorded.species) {
    it(sp.name, async () => {
      const { batchSources } = need();
      const per = { ...recorded.answers.shared, ...recorded.answers[`perSpecies:${sp.name}`] };
      const bat = { ...recorded.answers.shared, ...recorded.answers[`batched:${sp.name}`], ...recorded.answers['batched:__batches'] };
      const a = await buildDossier(sp.key, opts(replay(per)));
      // The batched build: the batches first (recorded), then the builder, whose Wikimedia requests the batches answer.
      const asked: string[] = [];
      const b = batchSources(replay(bat, asked));
      await b.prefetch(recorded.species.map((s) => ({ key: s.key, name: s.name })));
      const before = asked.length;
      const c = await buildDossier(sp.key, opts(b.fetcher));
      expect(a.ok && c.ok).toBe(true);
      if (!a.ok || !c.ok) return;
      expect(c.dossier).toEqual(a.dossier);
      // The per-species path asked Wikidata and Wikipedia species by species; the batched path asked none of the three
      // questions the batches answer (the item by GBIF key, the item, the summary). A title's own item, read for its
      // proof (Welwitschia, the genus's article), is asked on its own in both, as before.
      const own = Object.keys(recorded.answers[`perSpecies:${sp.name}`]).filter((u) => WIKIMEDIA.test(u));
      const batched = /haswbstatement%3AP846|action=wbgetentities&format=json&ids=|\/page\/summary\//;
      expect(own.filter((u) => batched.test(u)).length).toBeGreaterThanOrEqual(2);
      const left = asked.slice(before).filter((u) => WIKIMEDIA.test(u));
      expect(left.filter((u) => batched.test(u))).toEqual([]);
      expect(left.length).toBeLessThan(own.length);
    });
  }
});

describe('rule 2: a batch that does not answer is not checked, never none', () => {
  const species = { key: 2777724, name: 'Aloe vera' };
  // GBIF's answers for the build, recorded; Wikimedia's batches refused or failed.
  const gbif = recorded.answers.shared;
  it('the query service refusing: Wikidata refused for the species, and the summary asked by name', async () => {
    const { batchSources, sparqlUrl } = need();
    const net = replay({ ...gbif, [sparqlUrl([species.key])]: { __status: 'refused', detail: 'query.wikidata.org 429' } });
    const b = batchSources(net);
    await b.prefetch([species]);
    const r = await buildDossier(species.key, opts(b.fetcher));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.upstream.wikidata.status).toBe('refused');
    expect(r.dossier.upstream.wikidata.detail).toContain("batched: Wikidata's query service, 1 GBIF keys");
    // Wikipedia's batch was not recorded either: refused, not none.
    expect(r.dossier.upstream.wikipedia.status).toBe('refused');
  });
  it('Wikipedia failing in an HTTP 200 (a MediaWiki error): the summary is not checked, never none', async () => {
    const { batchSources, extractsUrl, sparqlUrl, entitiesUrl } = need();
    const all = { ...recorded.answers['batched:__batches'] } as Record<string, unknown>;
    const net = replay({ ...gbif, ...all, [extractsUrl(['Aloe vera'])]: { error: { code: 'ratelimited', info: 'You have exceeded your rate limit.' } } });
    const b = batchSources(net);
    await b.prefetch([species]);
    expect(b.heldAt(sparqlUrl([species.key]))).toBeUndefined(); // guard: a batch's own address is never held
    expect(entitiesUrl(['Q80079'])).toContain('ids=Q80079&');
    const r = await buildDossier(species.key, opts(b.fetcher));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.upstream.wikipedia).toMatchObject({ status: 'error', detail: 'ratelimited: You have exceeded your rate limit. (batched: Wikipedia, 1 titles)' });
    expect(r.dossier.summary).toBeUndefined();
  });
  it('a title Wikipedia does not hold is none, as its 404 is; one the batch cut short is asked on its own', async () => {
    const { batchSources, extractsUrl, summaryUrl } = need();
    const ask = ['Nopea nonexistens', 'Aloe vera'];
    const net = replay({ [extractsUrl(ask)]: { batchcomplete: true, continue: { excontinue: 1 }, query: { pages: [{ ns: 0, title: 'Nopea nonexistens', missing: true }, { pageid: 1, ns: 0, title: 'Aloe vera' }] } } });
    const b = batchSources(net, { wikidata: false });
    await b.prefetch(ask.map((name) => ({ name })));
    expect(b.heldAt(summaryUrl('Nopea nonexistens'))).toEqual({ status: 'none' });
    expect(b.heldAt(summaryUrl('Aloe vera'))).toBeUndefined();
  });
});

describe('rule 3: the item by GBIF key, as the search answers it', () => {
  it('statements of every rank, and the search\'s two hits at most', async () => {
    const { batchSources, sparqlUrl, p846SearchUrl, p846Query } = need();
    expect(p846Query([1761])).toContain('?item p:P846 ?st . ?st ps:P846 ?k'); // not wdt:, which leaves out a deprecated statement (Q651038, key 1761)
    const keys = [1, 2, 3];
    const bind = (k: number, q: string) => ({ k: { value: String(k) }, item: { value: `http://www.wikidata.org/entity/${q}` } });
    const net = replay({ [sparqlUrl(keys)]: { results: { bindings: [bind(2, 'Q20'), bind(3, 'Q30'), bind(3, 'Q31'), bind(3, 'Q32')] } } });
    const b = batchSources(net, { wikipedia: false });
    await b.prefetch(keys.map((key) => ({ key, name: `Planta k${key}` })));
    expect(b.heldAt(p846SearchUrl(1))).toMatchObject({ status: 'ok', data: { query: { search: [] } } });
    expect(b.heldAt(p846SearchUrl(2))).toMatchObject({ status: 'ok', data: { query: { search: [{ title: 'Q20' }] } } });
    expect((b.heldAt(p846SearchUrl(3)) as { data: { query: { search: unknown[] } } }).data.query.search).toHaveLength(2);
  });
});

describe('the REST summary\'s shape from TextExtracts', () => {
  it('the lead\'s first paragraph, empty brackets closed up', () => {
    const { restExtract } = need();
    expect(restExtract('Aloe vera () is a succulent plant species of the genus Aloe. It is widely distributed.\nAn evergreen perennial, it originates from the Arabian Peninsula.\n\n')).toBe('Aloe vera is a succulent plant species of the genus Aloe. It is widely distributed.');
    expect(restExtract('\n\nX (; Greek) is a plant.')).toBe('X (Greek) is a plant.');
  });
  it('a redirect\'s title, a disambiguation page, and the article address', async () => {
    const { batchSources, extractsUrl, summaryUrl } = need();
    const ask = ['Echinocactus grusonii', 'Mercury'];
    const net = replay({ [extractsUrl(ask)]: { batchcomplete: true, query: { redirects: [{ from: 'Echinocactus grusonii', to: 'Kroenleinia grusonii' }], pages: [{ pageid: 7, ns: 0, title: 'Kroenleinia grusonii', extract: 'Kroenleinia grusonii, popularly known as the golden barrel cactus, is a species of barrel cactus.' }, { pageid: 8, ns: 0, title: 'Mercury', extract: 'Mercury may refer to:', pageprops: { disambiguation: '' } }] } } });
    const b = batchSources(net, { wikidata: false });
    await b.prefetch(ask.map((name) => ({ name })));
    expect(b.heldAt(summaryUrl('Echinocactus grusonii'))).toEqual({ status: 'ok', data: { type: 'standard', title: 'Kroenleinia grusonii', extract: 'Kroenleinia grusonii, popularly known as the golden barrel cactus, is a species of barrel cactus.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Kroenleinia_grusonii' } } } });
    expect(b.heldAt(summaryUrl('Mercury'))).toMatchObject({ status: 'ok', data: { type: 'disambiguation' } });
  });
});

describe('a species listed by name alone', () => {
  it('its GBIF name match is asked once, by the batches, and held for the builder; its item is batched by the key the match accepts', async () => {
    const { batchSources, matchUrl, sparqlUrl, p846SearchUrl } = need();
    const asked: string[] = [];
    const net = replay({
      [matchUrl('Aloe barbadensis')]: { usageKey: 2777727, acceptedUsageKey: 2777724, scientificName: 'Aloe barbadensis Mill.', canonicalName: 'Aloe barbadensis', status: 'SYNONYM', synonym: true, matchType: 'EXACT' },
      [sparqlUrl([2777724])]: { results: { bindings: [{ k: { value: '2777724' }, item: { value: 'http://www.wikidata.org/entity/Q80079' } }] } }
    }, asked);
    const b = batchSources(net, { wikipedia: false });
    await b.prefetch([{ name: 'Aloe barbadensis' }]);
    expect(b.heldAt(p846SearchUrl(2777724))).toMatchObject({ status: 'ok', data: { query: { search: [{ title: 'Q80079' }] } } });
    // The builder's own match is answered from the batch: GBIF is asked once.
    const before = asked.length;
    expect(await b.fetcher(matchUrl('Aloe barbadensis'))).toMatchObject({ status: 'ok', data: { usageKey: 2777727 } });
    expect(asked.length).toBe(before);
    expect(asked.filter((u) => u === matchUrl('Aloe barbadensis'))).toHaveLength(1);
  });
});

