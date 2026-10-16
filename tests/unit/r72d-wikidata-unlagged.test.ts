/**
 * Round seventy-two (the owner's process change 3; reviewer D): Wikidata is read without `maxlag`. The lag Wikidata
 * reports to `maxlag` is its query service's ("type": "wikibase-queryservice", "Waiting for wdqs1014: 6.8 seconds
 * lagged", read 2026-10-15 with maxlag=-1), which no read of an item, a label search or a CirrusSearch `haswbstatement`
 * depends on; MediaWiki applies `maxlag` to every api.php module, so every read that sent it waited on a lag it does not
 * have. Round seventy-one's corpus step left ten Wikidata changes unapplied (rebuild-wd.txt) because the rebuild waited
 * on it. A real refusal still backs off: the fetch layer's 429 and 503 retries, after the wait the host names.
 *
 * Each case FAILED on r72base unless it says "guard".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { crossIds } from '$dossier/sources/wikimedia';
import * as gbif from '$dossier/sources/gbif';
import { fillWikidata } from '$dossier/corpus-fills';
import { makeFetcher, resetPacing, type JsonFetcher } from '$dossier/fetch';
import { recordedFetcher } from './helpers/recorded';

const W: { expected: Record<string, unknown>; answers: Record<string, unknown> } = JSON.parse(readFileSync('tests/unit/fixtures/r70c-wikidata-86.json', 'utf8'));
const WD_API = 'https://www.wikidata.org/w/api.php';

function recording(answers: Record<string, unknown>, asked: string[]): JsonFetcher {
  const f = recordedFetcher(answers);
  return (async (url: string) => { asked.push(url); return f(url); }) as unknown as JsonFetcher;
}

describe('Wikidata is read without maxlag', () => {
  it('every Wikidata read of the 86 recorded cases (the key, the label, Kew\'s IPNI, the older names, the items) asks no maxlag', async () => {
    const asked: string[] = [];
    const f = recording(W.answers, asked);
    for (const key of Object.keys(W.expected).map(Number)) {
      const sp = await gbif.species(f, key);
      const syn = await gbif.synonyms(f, key);
      if (sp.status !== 'ok' || syn.status !== 'ok') continue;
      const older = gbif.sameTypeNames({ key, basionymKey: sp.data.basionymKey }, syn.rows ?? []).map((r) => ({ key: r.key, name: r.name }));
      await crossIds(f, sp.data.canonicalName ?? '', key, older, { authorship: sp.data.authorship, family: sp.data.family });
    }
    const wd = asked.filter((u) => u.startsWith(WD_API));
    // Each kind of read is among them.
    for (const kind of [/haswbstatement%3AP846/, /action=wbsearchentities/, /action=wbgetentities/]) expect(wd.some((u) => kind.test(u)), String(kind)).toBe(true);
    expect(wd.filter((u) => /maxlag/.test(u))).toEqual([]); // r72base: every one ended "&maxlag=5"
  });

  it('--fill wikidata reads its fifty items a request without maxlag', async () => {
    const docs: Record<string, unknown> = {
      'a.json': { key: 5384013, name: { scientific: 'Aus bus' }, ids: { gbif: 5384013, wikidata: 'Q5168360' }, links: {}, upstream: { wikidata: { status: 'ok', at: 'x', detail: 'found by its GBIF key' } } }
    };
    const asked: string[] = [];
    const f = (async (url: string) => {
      asked.push(url);
      if (url.includes('action=wbgetentities')) return { status: 'ok', data: { entities: { Q5168360: { claims: { P846: [{ mainsnak: { datavalue: { value: '5384013' } } }] } } } } };
      return { status: 'refused', detail: 'no fixture' };
    }) as unknown as JsonFetcher;
    const c = await fillWikidata({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k, d) => { docs[k] = d; } }, f, () => '2026-10-15T00:00:00Z');
    expect(c).toMatchObject({ read: 1, byKey: 1 });
    expect(asked).toEqual([`${WD_API}?action=wbgetentities&format=json&ids=Q5168360&props=claims`]); // r72base: "…&props=claims&maxlag=5"
  });
});

describe('a real refusal still backs off (guards)', () => {
  beforeEach(() => resetPacing());
  const reply = (status: number, headers: Record<string, string> = {}, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  it('a 503 is asked again after the Retry-After it names, and the answer taken', async () => {
    const calls: string[] = [];
    const answers = [reply(503, { 'retry-after': '0' }), reply(200, {}, { entities: {} })];
    const f = makeFetcher((async (u: string) => { calls.push(String(u)); return answers.shift()!; }) as unknown as typeof fetch);
    const r = await f(`${WD_API}?action=wbgetentities&format=json&ids=Q1&props=claims`);
    expect(r.status).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('a 429 asking for more than two minutes is a refusal now, with the wait named, not a retry', async () => {
    const calls: string[] = [];
    const f = makeFetcher((async (u: string) => { calls.push(String(u)); return reply(429, { 'retry-after': '600' }); }) as unknown as typeof fetch);
    const r = await f(`${WD_API}?action=wbgetentities&format=json&ids=Q2&props=claims`);
    expect(r).toEqual({ status: 'refused', detail: 'www.wikidata.org 429: asked to wait 10 minutes; not asked again until then' });
    expect(calls).toHaveLength(1);
  });
});
