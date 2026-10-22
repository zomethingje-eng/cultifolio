/**
 * Round eighty, agent A: 22 pages of the full build said Wikidata "not checked", their batched query of GBIF keys having
 * timed out or been answered 502 once (Tillandsia tricholepis: "query.wikidata.org 502 (batched: Wikidata's query service,
 * 100 GBIF keys)"), and nothing asked them again. Now a query that does not answer is asked again as two halves, down to
 * RETRY_KEYS keys, and `--list-wikidata-retry` lists every page Wikidata did not answer, and every page with a Kew id
 * whose item a label refused, for `--keys`. FAILED on r80f: one failure was held for every key of the query, and no list.
 */
import { describe, it, expect } from 'vitest';
import { batchSources, p846SearchUrl, RETRY_KEYS } from '../../src/lib/dossier/batch';
import { wikidataRetryList } from '../../src/lib/dossier/corpus-fills';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';

describe('a batched Wikidata query that does not answer', () => {
  it('is asked again as two halves, and each key is answered', async () => {
    const asked: number[] = [];
    const net = (async (url: string) => {
      if (!url.includes('query.wikidata.org')) return { status: 'none' };
      const keys = [...decodeURIComponent(url).matchAll(/"(\d+)"/g)].map((m) => Number(m[1]));
      asked.push(keys.length);
      if (keys.length > 50) return { status: 'error', detail: 'query.wikidata.org 502' };
      return { status: 'ok', data: { results: { bindings: keys.map((k) => ({ k: { value: String(k) }, item: { value: `http://www.wikidata.org/entity/Q${k}` } })) } } };
    }) as unknown as JsonFetcher;
    const b = batchSources(net, { wikidata: true, wikipedia: false });
    const jobs = Array.from({ length: 100 }, (_, i) => ({ key: 1000 + i, name: `Aloe x${i}` }));
    await b.prefetch(jobs);
    expect(asked.slice(0, 3)).toEqual([100, 50, 50]);
    const r = await b.fetcher(p846SearchUrl(1042));
    expect(r).toMatchObject({ status: 'ok', data: { query: { search: [{ title: 'Q1042' }] } } });
    expect(b.stats.retried).toBe(1);
  });
  it('a part of RETRY_KEYS or fewer that still does not answer is held as not answered (rule 2)', async () => {
    const net = (async (url: string) => (url.includes('query.wikidata.org') ? { status: 'error', detail: 'timeout' } : { status: 'none' })) as unknown as JsonFetcher;
    const b = batchSources(net, { wikidata: true, wikipedia: false });
    await b.prefetch(Array.from({ length: RETRY_KEYS * 2 }, (_, i) => ({ key: 1 + i, name: `n${i}` })));
    expect((await b.fetcher(p846SearchUrl(3))).status).toBe('error');
    expect(b.stats.sparql).toBe(3);
  });
});

describe('--list-wikidata-retry', () => {
  it('lists the pages Wikidata did not answer, and Kew pages refused by a label, for --keys', () => {
    const docs: Record<string, unknown> = {
      a: { key: 'g2695104', ids: { gbif: 2695104 }, name: { scientific: 'Tillandsia tricholepis' }, upstream: { wikidata: { status: 'error', detail: "query.wikidata.org 502 (batched: Wikidata's query service, 100 GBIF keys)" } } },
      b: { key: 'k2757799', ids: { gbif: 2928755 }, name: { scientific: 'Datura innoxia' }, upstream: { wikidata: { status: 'ambiguous', detail: 'not taken: two items answered to the label Datura innoxia (Q17464343, Q1519478)' } } },
      c: { key: 'k298116', ids: { gbif: 2777724, wikidata: 'Q80079' }, name: { scientific: 'Aloe vera' }, upstream: { wikidata: { status: 'ok' } } }
    };
    const lines = wikidataRetryList({ files: () => Object.keys(docs), read: <T,>(f: string) => docs[f] as T });
    expect(lines.map((l) => l.split('\t')[0])).toEqual(['g2695104 Tillandsia tricholepis', 'k2757799 Datura innoxia']);
  });
});
