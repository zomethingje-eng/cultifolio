/**
 * Round eighty-seven (browse, C3 and the plan's C13): the searches Plantistry fails and the reference must keep passing,
 * through the search route itself (/api/search: its reading, its retries, its genus by a typing error) and the search
 * box's browse rows (/api/suggest's `suggest`): an older name (Sansevieria trifasciata), common names (peyote, San
 * Pedro), GBIF's name (Ceropegia alstonii) and a typing error (hodia).
 *
 * At unit level, as the brief allows: the browser suite's corpus is the five-species fixture, which these species are not
 * in, and adding them would change the counts every other spec of the front page holds. Over the live index of
 * 5 November when it is to hand (/tmp/claude-0/rev86r/inputs/index.json), else over a cut of it of 726 pages
 * (tests/unit/fixtures/r87c/parity-index.json: every page of the genera these names reach, and the eight pages Kew gives
 * only a wider region). Lophophora williamsii's entry is the one the next build writes from its record (round
 * eighty-six's `indexNames`, tests/unit/fixtures/r86s): "peyote" is a spelling of it only from that build on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { GET } from '../../src/routes/api/search/+server';
import { _forgetIndex } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { indexNames } from '$dossier/index-entry';
import { browseTableOf } from '$lib/browse/table';
import { prepared } from '$lib/browse/engine';
import { suggest } from '$lib/browse/suggest';

const LIVE = '/tmp/claude-0/rev86r/inputs/index.json';
let text = '';
let index: Array<Record<string, unknown>> = [];
beforeAll(() => {
  index = JSON.parse(readFileSync(existsSync(LIVE) ? LIVE : 'tests/unit/fixtures/r87c/parity-index.json', 'utf8'));
  const lw = JSON.parse(readFileSync('tests/unit/fixtures/r86s/k2337299-names.json', 'utf8'));
  Object.assign(index.find((x) => x.key === 'k2337299')!, indexNames(lw.name.vernacular, { genus: lw.name.scientific }));
  text = JSON.stringify(index);
  _forgetIndex();
  resetRateLimits();
});
afterAll(() => _forgetIndex());

/** The route over the index as a static corpus (no manifest: the whole index held, as a corpus before the key files). */
async function search(q: string): Promise<{ hits: Array<{ name: string; slug: string; gname?: string }>; relaxed?: { query: string } }> {
  const f = (async (u: string) => (String(u).endsWith('/s/v3/index.json') ? new Response(text) : new Response('', { status: 404 }))) as typeof fetch;
  const r = await GET({ url: new URL(`http://x/api/search?q=${encodeURIComponent(q)}&n=5&shape=2`), platform: { env: {} } as never, fetch: f, getClientAddress: () => '1.2.3.4' } as never);
  expect(r.status).toBe(200);
  return r.json();
}

describe('C13: the searches the reference keeps passing', () => {
  it('an older name: "Sansevieria trifasciata" is Dracaena trifasciata', async () => {
    expect((await search('Sansevieria trifasciata')).hits[0].slug).toBe('dracaena-trifasciata');
  }, 120_000);
  it('a common name: "peyote" is Lophophora williamsii', async () => {
    expect((await search('peyote')).hits[0].slug).toBe('lophophora-williamsii');
  });
  it('a common name of two words: "San Pedro" is Echinopsis pachanoi', async () => {
    expect((await search('San Pedro')).hits[0].slug).toBe('echinopsis-pachanoi');
  });
  it("GBIF's name: \"Ceropegia alstonii\" is Hoodia alstonii", async () => {
    expect((await search('Ceropegia alstonii')).hits[0].slug).toBe('hoodia-alstonii');
  });
  it('a typing error: "hodia" is read as Hoodia, said so, and the box offers the genus first', async () => {
    const a = await search('hodia');
    expect(a.relaxed?.query).toBe('Hoodia');
    expect(a.hits.length).toBeGreaterThan(0);
    expect(a.hits.every((h) => h.name.startsWith('Hoodia '))).toBe(true);
    const p = prepared(browseTableOf(index as never));
    expect(suggest(p, 'hodia')[0]).toMatchObject({ kind: 'genus', label: 'Hoodia', href: '/genus/hoodia' });
  });
});
