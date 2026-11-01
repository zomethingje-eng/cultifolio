/**
 * Round eighty-five, the merge (agent M): what the merge settled between the agents' changes, each tested by behaviour.
 *
 * 1. Older names Kew's file places in another plant (`name.kew.elsewhere`, N) are not shown on the page as its older
 *    names (E's page): Echinopsis macrogona no longer lists Trichocereus pachanoi. And an autonym's page says it has no
 *    author of its own (outside review A9b), not that the backbone did not state one.
 * 2. The catalogue counts the species whose GBIF records were not asked (no GBIF key) apart from those not checked
 *    (A's need, S9); `notChecked` keeps its sum for a server built before.
 * 3. A page's other GBIF keys are sampled as its own key is: region by region where GBIF's search holds more (G's
 *    decision 5, which /about/how states for both).
 * 4. Each FAILED on r85base, where `$core/shown-names` did not exist, the catalogue had no `notAsked`, and
 *    `extraOccurrences` asked each extra key with no region.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import type { Route } from '@playwright/test';
import { catalogueOf } from '$lib/dossier/catalogue';
import { extraOccurrences } from '$lib/dossier/build';
import type { IndexEntry } from '$lib/dossier/index-entry';
import type { JsonFetcher } from '$lib/dossier/fetch';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { _forgetIndex } from '$lib/server/dossiers';
import { mount, stopMounting } from './helpers/mount';

afterAll(stopMounting);
const SLOW = 240_000;

describe('1. the names a page shows', () => {
  it('drops the older names Kew places in another plant, exactly as stored, and keeps the rest', async () => {
    const { ownSynonyms } = await import('$core/shown-names');
    const name = { synonyms: ['Trichocereus pachanoi Britton & Rose', 'Echinopsis pachanoi (Britton & Rose) H.Friedrich & G.D.Rowley', 'Cereus macrogonus Salm-Dyck'], kew: { elsewhere: ['Trichocereus pachanoi Britton & Rose', 'Echinopsis pachanoi (Britton & Rose) H.Friedrich & G.D.Rowley'] } };
    expect(ownSynonyms(name)).toEqual(['Cereus macrogonus Salm-Dyck']);
    expect(ownSynonyms({ synonyms: name.synonyms })).toEqual(name.synonyms); // a dossier written before: every name kept
  });
  it('an autonym is told by its words', async () => {
    const { isAutonymName } = await import('$core/shown-names');
    expect(isAutonymName('Stapelia hirsuta var. hirsuta')).toBe(true);
    expect(isAutonymName('Huernia barbata subsp. barbata')).toBe(true);
    expect(isAutonymName('Conophytum calculus subsp. vanzylii')).toBe(false);
    expect(isAutonymName('Stapelia hirsuta')).toBe(false);
  });

  const fixtures = (async (u: string | URL) => {
    const p = new URL(String(u), 'http://x').pathname;
    const f = p === '/s/v3/index.json' ? 'fixtures/dossiers/index.json' : p.startsWith('/s/v3/') ? `fixtures/dossiers${p}` : '';
    return f && existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
  }) as typeof fetch;
  type Data = Record<string, unknown> & { d: Record<string, unknown> & { name: Record<string, unknown> } };
  async function copiapoa(): Promise<Data> {
    _forgetIndex();
    const url = new URL('http://x/species/copiapoa-cinerea');
    const data = await load({ params: { slug: 'copiapoa-cinerea' }, platform: undefined, fetch: fixtures, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.1', locals: {}, isDataRequest: true } as never);
    return JSON.parse(JSON.stringify(data)) as Data;
  }
  const nothing = (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  async function pageText(data: Data): Promise<string> {
    const m = await mount('src/routes/species/[slug]/+page.svelte', { data }, { answer: nothing });
    try {
      return (await m.page.locator('#target').evaluate((el) => el.textContent ?? '')).replace(/\s+/g, ' ');
    } finally {
      await m.close();
    }
  }
  it('the page lists an older name of its own and leaves out one Kew places in another plant', async () => {
    const data = await copiapoa();
    const kew = (data.d.name.kew ?? {}) as Record<string, unknown>;
    data.d.name = { ...data.d.name, synonyms: [...((data.d.name.synonyms as string[]) ?? []), 'Copiapoa ownoldname Britton', 'Copiapoa elsewhereana Ritter'], kew: { ...kew, elsewhere: ['Copiapoa elsewhereana Ritter'] } };
    const t = await pageText(data);
    expect(t).toContain('Copiapoa ownoldname');
    expect(t).not.toContain('elsewhereana');
  }, SLOW);
  it("an autonym's page says it has no author of its own", async () => {
    const data = await copiapoa();
    data.d.name = { ...data.d.name, scientific: 'Copiapoa cinerea var. cinerea', authorship: null };
    const t = await pageText(data);
    expect(t).toContain('no author of its own: an autonym, named by its species');
    expect(t).not.toContain('authorship not stated by the backbone');
  }, SLOW);
});

describe('2. not asked apart from not checked', () => {
  const e = (name: string, climate: string, gbif?: number): IndexEntry => ({ key: `k${name.length}${climate}`, slug: name.toLowerCase().replace(/ /g, '-'), name, family: 'Cactaceae', origin: [], photos: 0, open: 0, climate, ...(gbif ? { gbif } : {}) }) as unknown as IndexEntry;
  it('a keyless pending page is not asked, a refused one not checked, and the old sum stands', () => {
    const idx = [e('Aloe a', 'ok', 1), e('Aloe bb', 'pending'), e('Aloe ccc', 'refused', 3), e('Aloe dddd', 'pending', 4), e('Aloe eeeee', 'none', 5)];
    const row = catalogueOf(idx, 'genus', 'all').rows[0];
    expect({ notChecked: row.notChecked, notAsked: row.notAsked, pending: row.pending }).toEqual({ notChecked: 2, notAsked: 1, pending: 1 });
  });
});

describe("3. a page's other keys sampled as its own", () => {
  it('each extra key read through the search asks region by region where GBIF holds more', async () => {
    const asked: string[] = [];
    const f = (async (u: string) => {
      asked.push(u);
      const many = /taxonKey=777&/.test(u) && !/decimalLatitude/.test(u);
      return { status: 'ok', data: { count: many ? 5000 : 1, endOfRecords: !many, results: [{ key: asked.length, decimalLatitude: 1, decimalLongitude: 1, taxonKey: 777 }] } };
    }) as unknown as JsonFetcher;
    const boxes = [{ s: -10, w: 10, n: 0, e: 20 }, { s: 0, w: 0, n: 5, e: 5 }];
    await extraOccurrences(f, { status: 'none' }, [{ page: 1, key: 777, label: 'X y', status: 'SYNONYM', kew: '1', kewLabel: 'X y (synonym)', how: 'filed' }], boxes);
    expect(asked.filter((u) => /decimalLatitude=-10,0&decimalLongitude=10,20/.test(u))).toHaveLength(1);
    expect(asked.filter((u) => /decimalLatitude=0,5&decimalLongitude=0,5/.test(u))).toHaveLength(1);
  });
});

describe("4. the credits' fill reads the captive mark again (review-d D13)", () => {
  it('a photograph iNaturalist now marks captive is marked so, and the change is said', async () => {
    const { applyCredits, CREDIT_OBS_URL } = await import('$dossier/photo-read');
    expect(decodeURIComponent(CREDIT_OBS_URL(['715055189']))).toContain('captive:!t');
    const d = { key: 'k1', name: { scientific: 'Eucomis comosa' }, photos: [{ src: 'inat', id: '9001', page: 'https://www.inaturalist.org/observations/715055189', attribution: '(c) A, some rights reserved (CC BY)', licence: 'by' }] };
    const obs = new Map([['715055189', { id: 715055189, captive: true, photos: [{ id: 9001, license_code: 'cc-by', attribution: '(c) A, some rights reserved (CC BY)' }] }]]);
    const c = { pages: 0, read: 0, changed: 0, dropped: 0, unread: 0, lines: [] as string[] };
    expect(applyCredits(d as never, obs as never, new Map(), '2026-10-31', c as never)).toBe(true);
    expect((d.photos[0] as { captive?: boolean }).captive).toBe(true);
    expect(c.lines.join('\n')).toContain('now marked captive or cultivated on iNaturalist');
  });
});

describe("5. the picker offers the search's reading of a misspelt genus (K's picker against N's reading)", () => {
  it('a genus read as its nearest is offered, as a similar spelling; another epithet is not', async () => {
    const { offeredReading, genusReading } = await import('$lib/ui/picker-rows');
    expect(genusReading('Copiapoa cin', 'Copiapao cin')).toBe(true);
    expect(offeredReading('Copiapoa cin', 'Copiapao cin')).toBe(true); // r85base with N's reading: false, so the list was empty
    expect(genusReading('Copiapoa cinerea', 'Copiapao cin')).toBe(false);
    expect(offeredReading('Copiapoa cinerea', 'Copiapao humilis')).toBe(false);
    expect(genusReading(undefined, 'Copiapao cin')).toBe(false);
  });
});

describe("6. no browser test waits on a promise's truthiness (the merge's find in smoke-3's 2.4.11 walk)", () => {
  it("`waitForFunction` is never given an async predicate or one that returns a promise: it reads the promise as truthy and returns at once", async () => {
    const { readdirSync, readFileSync: read } = await import('node:fs');
    const dir = 'tests/e2e';
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/${f}`), ...readdirSync(`${dir}/helpers`).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/helpers/${f}`)];
    const bad = files.flatMap((f) => read(f, 'utf8').split('\n').map((l, i) => ({ at: `${f}:${i + 1}`, l })).filter(({ l }) => /waitForFunction\(\s*(?:async\b|\([^)]*\)\s*=>\s*new Promise|\(\)\s*=>\s*\{?\s*return new Promise)/.test(l)));
    expect(bad.map((b) => b.at)).toEqual([]); // r85base: smoke-3.spec.ts (settle) and helpers/inject.ts (snapshotSaved)
  });
});
