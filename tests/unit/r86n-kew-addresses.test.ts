/**
 * Round eighty-six, names: old addresses and Kew's file (review-c C1, C3, C5; review-d D3; plan A7).
 *
 * 1. C1/D3: an address under a name one page's Kew older names hold (the index's `kew`) is that page's, and GBIF is not
 *    asked: /species/anacampseros-schmidtii is Anacampseros dinteri's, under which Kew's file holds the name.
 * 2. C1/D3: GBIF's SYNONYM answer never leads to a page whose record says Kew's file places the name in another plant
 *    (`name.kew.elsewhere`): /species/echinopsis-chalaensis and /species/orbea-carnosa answer 404, saying what Kew holds,
 *    and so does /species/anacampseros-schmidtii where no page here holds it among Kew's names. GBIF's answers are
 *    fixtures of GBIF's match service (tests/unit/fixtures/r86n/match-*.json, read 2026-11-06); the dossiers are the live
 *    ones review D saved (k500252, k2783497, k509301).
 * 3. C1: the landing line never says Kew "does not list" a name the record places elsewhere; it names Kew's holder.
 * 4. C3: the line for a name GBIF files under a variety is read from the record (`name.infra`), with no cache at all.
 * 5. C5: a record that cannot be read on the 404 path is "not checked", kept by no one, never "no page".
 * 6. The key files' `@` file answers Kew's holders as the index does (`kewHoldersFromFiles`).
 *
 * On r86base: 1 FAILED (GBIF was asked); 2 FAILED (302 to Anacampseros albissima, Echinopsis macrogona and Orbea carnosa
 * subsp. keithii); 3 FAILED (the line said "and does not list this name among its synonyms"); 4 FAILED (`was` null with
 * no cached answer); 5 FAILED (404 "No species page", public, max-age=300); 6 FAILED (no `kewHoldersFromFiles`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { wasLine, type Part } from '$lib/ui/ref/was-words';
import { buildSearchFiles, kewHoldersFromFiles, kewHoldersOfIndex, type SearchReader } from '$core/search-files';
import { prepare } from '$core/search';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';
import type { PageId } from '$core/page-id';

const F = 'tests/unit/fixtures/r86n';
const json = (f: string) => JSON.parse(readFileSync(`${F}/${f}`, 'utf8'));
type Dos = { key: string; slug: string; ids: Record<string, unknown>; name: Record<string, unknown> & { scientific: string; kew?: Record<string, unknown> } };
const ALBISSIMA = json('k500252.json') as Dos;
const MACROGONA = json('k2783497.json') as Dos;
const KEITHII = json('k509301.json') as Dos;
// Anacampseros dinteri, as its index entry holds it (`kew`: Anacampseros schmidtii); its record made from A. albissima's,
// with Kew's names for the plant (the live index, 2026-11-05).
const DINTERI: Dos = { ...ALBISSIMA, key: 'k500298', slug: 'anacampseros-dinteri', ids: { ...ALBISSIMA.ids, gbif: 5646651 }, name: { ...ALBISSIMA.name, scientific: 'Anacampseros dinteri', authorship: 'Schönland', synonyms: ['Anacampseros dinteri Schönland', 'Avonia dinteri (Schönland) G.D.Rowley'], kew: { entry: '500298', synonyms: ['Anacampseros schmidtii', 'Avonia dinteri'], acceptedElsewhere: [], file: '2026-06-04' }, gbif: undefined } };
const MATCH: Record<string, unknown> = {
  'anacampseros schmidtii': json('match-anacampseros-schmidtii.json'),
  'echinopsis chalaensis': json('match-echinopsis-chalaensis.json'),
  'orbea carnosa': json('match-orbea-carnosa.json')
};

const entry = (d: Dos, extra: Partial<IndexEntry> = {}): IndexEntry => ({ key: d.key as PageId, gbif: d.ids.gbif as number, slug: d.slug, name: d.name.scientific, photos: 0, open: 0, climate: 'ok', ...extra });
function corpusOf(dinteriKew: string[]) {
  const idx: IndexEntry[] = [entry(ALBISSIMA, { syn: ['Avonia albissima', 'Anacampseros avasmontana'] }), entry(DINTERI, { syn: ['Avonia dinteri'], ...(dinteriKew.length ? { kew: dinteriKew } : {}) }), entry(MACROGONA, { syn: ['Trichocereus macrogonus'] }), entry(KEITHII, { syn: ['Ceropegia keithii'] })];
  return { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r86n', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
}
const records = [ALBISSIMA, DINTERI, MACROGONA, KEITHII];
const STORE = { get: async (path: string) => { const d = records.find((x) => path.endsWith(`/${x.key}.json`)); return d ? { json: async () => structuredClone(d) } : null; } };
const BROKEN = { get: async () => { throw new Error('R2 did not answer'); } };
let asked: string[] = [];
const gbif = (async (u: string | URL) => {
  const name = new URL(String(u)).searchParams.get('name') ?? '';
  asked.push(name);
  const body = MATCH[name.toLowerCase()];
  return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : new Response('{"matchType":"NONE"}', { headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
let ip = 10;
function event(slug: string, opts: { search?: string; kew?: string[]; store?: unknown; fetch?: typeof fetch } = {}) {
  const url = new URL(`http://x/species/${slug}${opts.search ?? ''}`);
  const headers: Record<string, string> = {};
  const addr = `198.51.100.${ip++}`;
  const ev = { params: { slug }, platform: { env: { STORE: opts.store ?? STORE } }, fetch: opts.fetch ?? gbif, setHeaders: (h: Record<string, string>) => Object.assign(headers, h), cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => addr, locals: { corpus: corpusOf(opts.kew ?? ['Anacampseros schmidtii']) }, isDataRequest: true } as never;
  return { ev, headers };
}
const outcome = async (p: unknown) => { try { return { data: await p }; } catch (e) { return e as { status: number; location?: string; body?: { message: string; species?: { accepted?: string } } }; } };
const text = (ps: Part[]) => ps.map((p) => p.t).join('');

describe("1. an address under a name one page's Kew older names hold (C1, D3)", () => {
  it('/species/anacampseros-schmidtii is Anacampseros dinteri, and GBIF is not asked', async () => {
    asked = [];
    const { ev, headers } = event('anacampseros-schmidtii');
    const r = (await outcome(load(ev))) as { status: number; location: string };
    expect(r.status).toBe(302);
    expect(r.location).toBe('/species/anacampseros-dinteri?was=Anacampseros%20schmidtii');
    expect(headers['cache-control']).toBe('public, max-age=86400');
    expect(asked).toEqual([]);
  });
  it('a name two pages hold among Kew\'s names leads to neither, and the 404 names both', async () => {
    asked = [];
    const two = corpusOf(['Anacampseros schmidtii']);
    (two.idx![0] as IndexEntry).kew = ['Anacampseros schmidtii'];
    const { ev } = event('anacampseros-schmidtii');
    (ev as { locals: { corpus: Loaded } }).locals.corpus = two;
    const r = (await outcome(load(ev))) as { status: number; body: { message: string } };
    expect(r.status).toBe(404);
    expect(r.body.message).toContain('Anacampseros schmidtii is an older name of two species of the reference, so this address leads to neither');
    expect(asked).toEqual([]);
  });
});

describe("2. GBIF's match never leads to a page whose record places the name elsewhere (C1, D3)", () => {
  it('/species/echinopsis-chalaensis: 404, saying Kew holds it for another plant than Echinopsis macrogona', async () => {
    asked = [];
    const { ev, headers } = event('echinopsis-chalaensis');
    const r = (await outcome(load(ev))) as { status: number; body: { message: string; species?: { accepted?: string } } };
    expect(asked).toEqual(['Echinopsis chalaensis']);
    expect(r.status).toBe(404);
    expect(r.body.message).toBe("Kew's World Checklist holds Echinopsis chalaensis for another plant than Echinopsis macrogona, and no page of the reference holds the name. GBIF's backbone files it under Trichocereus macrogonus (the reference's Echinopsis macrogona), so this address does not lead there");
    expect(r.body.species?.accepted).toBeUndefined(); // "add it as a plant" offers the name asked, not GBIF's
    expect(headers['cache-control']).toBe('public, max-age=300');
  });
  it('/species/orbea-carnosa: 404, never Orbea carnosa subsp. keithii', async () => {
    const r = (await outcome(load(event('orbea-carnosa').ev))) as { status: number; body: { message: string } };
    expect(r.status).toBe(404);
    expect(r.body.message).toContain("Kew's World Checklist holds Orbea carnosa for another plant than Orbea carnosa subsp. keithii");
    expect(r.body.message).toContain("GBIF's backbone files it under Ceropegia keithii (the reference's Orbea carnosa subsp. keithii)");
  });
  it('/species/anacampseros-schmidtii with no Kew holder here: 404, never Anacampseros albissima', async () => {
    asked = [];
    const r = (await outcome(load(event('anacampseros-schmidtii', { kew: [] }).ev))) as { status: number; body: { message: string } };
    expect(asked).toEqual(['Anacampseros schmidtii']);
    expect(r.status).toBe(404);
    expect(r.body.message).toContain('for another plant than Anacampseros albissima');
  });
});

describe('3. the landing line (C1)', () => {
  const lineOf = async (slug: string, was: string) => {
    const data = (await load(event(slug, { search: `?was=${encodeURIComponent(was)}` }).ev)) as { was: string | null; wasBelow: boolean; wasKew: { accepted: boolean; holder: { slug: string; name: string } | null } | null; d: Dos & { name: Dos['name'] & { synonyms: string[]; infra?: string[] } } };
    const d = data.d;
    const kew = d.name.kew as { synonyms?: string[]; elsewhere?: string[]; acceptedElsewhere?: string[] } | undefined;
    const gbifName = (d.name.gbif as { scientific?: string } | undefined)?.scientific ?? null;
    return { data, parts: data.was ? wasLine({ was: data.was, heading: d.name.scientific, gbifName, gbifSynonyms: d.name.synonyms, kewSynonyms: kew?.synonyms ?? null, below: data.wasBelow, kewElsewhere: kew?.elsewhere ?? null, kewAcceptedElsewhere: kew?.acceptedElsewhere ?? null, kewHolder: data.wasKew?.holder ?? null }) : [] };
  };
  it("on Anacampseros dinteri, Kew's words: Kew holds Anacampseros schmidtii as a synonym of the heading", async () => {
    const { data, parts } = await lineOf('anacampseros-dinteri', 'Anacampseros schmidtii');
    expect(data.was).toBe('Anacampseros schmidtii');
    expect(text(parts)).toBe("is an older name of this species. Kew's World Checklist holds it as a synonym of Anacampseros dinteri, which heads this page.");
  });
  it('on Anacampseros albissima (a link kept from before), Kew\'s holder named and linked, never "does not list"', async () => {
    const { data, parts } = await lineOf('anacampseros-albissima', 'Anacampseros schmidtii');
    expect(data.wasKew?.holder).toEqual({ slug: 'anacampseros-dinteri', name: 'Anacampseros dinteri' });
    const t = text(parts);
    expect(t).not.toContain('does not list');
    expect(t).toBe("is an older name of this species in GBIF's backbone, which files it under Avonia albissima, GBIF's name for this plant. Kew's World Checklist holds it as a synonym of Anacampseros dinteri, which has its own page here, not of Anacampseros albissima.");
    expect(parts.find((p) => p.href)?.href).toBe('/species/anacampseros-dinteri');
  });
  it('on Echinopsis macrogona, GBIF\'s filing under a variety and Kew\'s placement elsewhere', async () => {
    const { parts } = await lineOf('echinopsis-macrogona', 'Echinopsis chalaensis');
    const t = text(parts);
    expect(t).toBe("is, in GBIF's backbone, a synonym of a subspecies or variety of Trichocereus macrogonus, GBIF's name for this plant. Kew's World Checklist holds it for another plant than Echinopsis macrogona, which heads this page.");
    expect(t).not.toContain('accepts the species as');
  });
});

describe('4. the line for a name GBIF files under a variety is read from the record (C3)', () => {
  it('?was=Echinopsis chalaensis on Echinopsis macrogona is shown with no Worker cache at all', async () => {
    const data = (await load(event('echinopsis-macrogona', { search: '?was=Echinopsis%20chalaensis' }).ev)) as { was: string | null; wasBelow: boolean };
    expect(data.was).toBe('Echinopsis chalaensis');
    expect(data.wasBelow).toBe(true);
  });
  it('guard: a name neither the record nor its varieties hold says nothing', async () => {
    const data = (await load(event('echinopsis-macrogona', { search: '?was=Echinopsis%20oxygona' }).ev)) as { was: string | null };
    expect(data.was).toBeNull();
  });
});

describe('5. a record that cannot be read on the 404 path (C5)', () => {
  it("GBIF's exact accepted name of a page's key, the record unread: not checked, kept by no one", async () => {
    const accepted = (async (u: string | URL) => { void u; return new Response(JSON.stringify({ usageKey: 3952140, canonicalName: 'Trichocereus macrogonus', status: 'ACCEPTED', matchType: 'EXACT', confidence: 99 }), { headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
    const { ev, headers } = event('trichocereus-macrogonus', { store: BROKEN, fetch: accepted });
    // GBIF's name for the page's key, which this index does not hold as an older name, so GBIF's match is asked.
    (ev as { locals: { corpus: Loaded } }).locals.corpus.idx!.find((e) => e.key === MACROGONA.key)!.syn = [];
    const r = (await outcome(load(ev))) as { status: number; body: { message: string } };
    expect(r.status).toBe(404);
    expect(r.body.message).toContain('was not checked: the record of the page GBIF\'s answer leads to could not be read just now');
    expect(headers['cache-control']).toBe('no-store');
  });
  it("and a SYNONYM answer whose page's record cannot be read is not checked, never a redirect", async () => {
    const { ev, headers } = event('echinopsis-chalaensis', { store: BROKEN });
    const r = (await outcome(load(ev))) as { status: number; body: { message: string } };
    expect(r.status).toBe(404);
    expect(r.body.message).toContain('was not checked');
    expect(headers['cache-control']).toBe('no-store');
  });
});

describe("6. Kew's holders from the key files, as from the index", () => {
  it('the @ file of the genus answers what the index does', async () => {
    const idx: IndexEntry[] = [
      { key: 'k1' as PageId, slug: 'anacampseros-albissima', name: 'Anacampseros albissima', photos: 0, open: 0, climate: 'ok' },
      { key: 'k2' as PageId, slug: 'anacampseros-dinteri', name: 'Anacampseros dinteri', photos: 0, open: 0, climate: 'ok', kew: ['Anacampseros schmidtii', 'Avonia dinteri'] },
      { key: 'k3' as PageId, slug: 'anacampseros-baeseckei', name: 'Anacampseros baeseckei', photos: 0, open: 0, climate: 'ok', kew: ['Anacampseros crinita', 'Anacampseros quinaria var. alstonii'] },
      { key: 'k4' as PageId, slug: 'anacampseros-filamentosa', name: 'Anacampseros filamentosa', photos: 0, open: 0, climate: 'ok', kew: ['Anacampseros crinita'] }
    ];
    const stored = new Map<string, string>();
    let n = 0;
    const b = buildSearchFiles(idx, prepare(idx), () => `h${n++}`, (h, body) => stored.set(h, body));
    const named = (x: string) => JSON.parse(b.named.get(x)!);
    const blocks = named('search/blocks.json');
    const r: SearchReader<IndexEntry> = {
      dirs: [...b.named.keys()].filter((k) => /^search\/\d+\.json$/.test(k)).length,
      dir: async (x) => named(`search/${x}.json`), node: async (h) => stored.get(h)!, answers: async (h) => JSON.parse(stored.get(h)!),
      genera: async () => new Set(named('search/genera.json')), tables: async () => named('search/tables.json'),
      photos: async (k) => JSON.parse(stored.get(blocks.photos[k])!), show: async (k) => JSON.parse(stored.get(blocks.show[k])!)
    };
    for (const [q, want] of [['Anacampseros schmidtii', ['k2']], ['ANACAMPSEROS  Schmidtii', ['k2']], ['Anacampseros crinita', ['k3', 'k4']], ['Anacampseros quinaria var. alstonii', ['k3']], ['Anacampseros quinaria', []], ['Avonia dinteri', ['k2']], ['Anacampseros', []]] as const) {
      expect((await kewHoldersFromFiles(r, q)).map((e) => e.key), q).toEqual(want);
      expect(kewHoldersOfIndex(idx, q).map((e) => e.key), q).toEqual(want);
    }
  });
});
