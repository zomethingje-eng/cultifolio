/**
 * Round sixty-nine, triage-68 M1, M3's pass, M9, M10, M11 and K5's build order: the corpus script's passes and wiring.
 * Each case FAILED on 1609c19 unless it says "guard".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { media } from '$dossier/sources/gbif';
import { mwWait, MAXLAG_TRIES, lagSpell, LAG_SPELL } from '$dossier/sources/wikimedia';
import { dropsBetween, indexDrops } from '$dossier/drops';
import { startCorpusRun, prevIdsFor, idsReadOn, fillOpenGbifAll, fillCommonsAll, heldElsewhereIn } from '$dossier/corpus-run';
import { fillGbifLicence, fillGbifLicenceAll, checkSummaries, rebuildList } from '$dossier/corpus-fills';
import { OPEN_NONE } from '$dossier/open-gbif-fill';
import { COMMONS_NONE } from '$dossier/commons-fill';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

afterEach(() => { mwWait.tries = 1; });
const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
const counting = (answer: unknown = { status: 'ok', data: { results: [], endOfRecords: true, count: 0 } }) => {
  const asked: string[] = [];
  const f = (async (url: string) => { asked.push(url); return answer; }) as unknown as JsonFetcher;
  return { f, asked };
};

describe('a GBIF photograph takes no licence from its record (M1, S-B6)', () => {
  // Shaped as occurrence 1655981894 (ALA, "Map and report a single weed sighting"): the record CC BY, its photograph silent.
  const page = { results: [{ key: 1655981894, license: 'http://creativecommons.org/licenses/by/4.0/legalcode', media: [{ type: 'StillImage', identifier: 'https://images.ala.org.au/image/1.jpg', creator: 'Michael  Sim' }, { type: 'StillImage', identifier: 'https://images.ala.org.au/image/2.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'Michael  Sim' }] }], endOfRecords: true, count: 1 };
  it('the photograph stating no licence of its own is not published', async () => {
    const r = await media(fixtureFetcher({ 're:mediaType=StillImage': page }), 1);
    expect(r.status === 'ok' && r.data.map((m) => m.url)).toEqual(['https://images.ala.org.au/image/2.jpg']); // base: both, the first as CC BY
  });
  const stored = () => ({
    photos: [
      { src: 'gbif', id: '1655981894:0', url: 'https://images.ala.org.au/image/1.jpg', thumb: 't', licence: 'by', attribution: 'Michael  Sim, CC BY, via GBIF' },
      { src: 'gbif', id: '1655981894:1', url: 'https://images.ala.org.au/image/2.jpg', thumb: 't', licence: 'by', attribution: 'Michael  Sim, CC BY, via GBIF' },
      { src: 'gbif', id: '9:0', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg', thumb: 't', licence: 'by', attribution: 'x, CC BY, iNaturalist via GBIF' }
    ],
    upstream: { 'gbif.media': { status: 'ok', at: 'x', detail: 'GBIF records under an open licence (CC0, CC BY)' } } as Record<string, { status: string; at: string; detail?: string }>
  });
  it('--fill gbif-licence reads each stored photograph again, and drops the one with no licence of its own', async () => {
    const asked: string[] = [];
    const occ = fixtureFetcher({ 'https://api.gbif.org/v1/occurrence/1655981894': page.results[0] });
    const f = (async (url: string) => { asked.push(url); return occ(url); }) as unknown as JsonFetcher;
    const d = stored();
    expect(await fillGbifLicence(d as never, f, () => '2026-10-12T00:00:00Z')).toEqual({ kept: 1, dropped: 1 });
    expect(d.photos.map((p) => p.id)).toEqual(['1655981894:1', '9:0']);
    expect(asked).toEqual(['https://api.gbif.org/v1/occurrence/1655981894']); // iNaturalist's photographs are never asked about
    expect(d.upstream['gbif.media'].detail).toBe("GBIF records under an open licence (CC0, CC BY); each photograph's own licence checked 2026-10-12: 1 without one dropped");
  });
  it('resumes: a dossier already read is passed by, and a refusal stops the run with the dossier unchanged', async () => {
    const docs: Record<string, unknown> = { 'a.json': stored(), 'b.json': stored() };
    (docs['a.json'] as ReturnType<typeof stored>).upstream['gbif.media'].detail = "x; each photograph's own licence checked 2026-10-11";
    const { f, asked } = counting({ status: 'refused', detail: 'api.gbif.org 429' });
    const c = await fillGbifLicenceAll(store(docs), f);
    expect(c).toMatchObject({ before: 1, dossiers: 0, failed: 'api.gbif.org 429' });
    expect(asked).toHaveLength(1);
    expect((docs['b.json'] as ReturnType<typeof stored>).photos).toHaveLength(3);
  });
});

describe('the drops audit sees what a build lost (M9, S-A2)', () => {
  const before = { photos: Array(25), ids: { gbif: 1, wikidata: 'Q310510', powo: 'p', inat: 274273, wikipedia: 'Ferocactus glaucescens' }, summary: { text: 't' }, distribution: { native: [{}, {}], verified: true }, upstream: { wikidata: { status: 'ok' }, wikipedia: { status: 'ok' }, 'wcvp.distribution': { status: 'ok' } } };
  it('Bisnaga glaucescens\'s item, links, summary, range and photographs, lost in one run', () => {
    const after = { photos: Array(1), ids: { gbif: 1 }, distribution: { native: [], verified: false }, upstream: { wikidata: { status: 'none' }, wikipedia: { status: 'none' }, 'wcvp.distribution': { status: 'ok' } } };
    expect(dropsBetween(before, after)).toEqual([
      'photographs fell by more than half (25 before, 1 now)',
      'identifier wikidata lost (Q310510 before)',
      'identifier powo lost (p before)',
      'identifier inat lost (274273 before)',
      'identifier wikipedia lost (Ferocactus glaucescens before)',
      'Wikipedia summary lost',
      'native range lost (2 regions before)',
      'wikidata turned none (ok before)',
      'wikipedia turned none (ok before)'
    ]); // base: []
  });
  it('identifiers kept for a second build in a row', () => {
    const kept = (day: string) => ({ upstream: { wikidata: { status: 'error', detail: `wikidata maxlag: x; the identifiers of the build of ${day} are kept` } } });
    expect(dropsBetween(kept('2026-10-01'), kept('2026-10-01'))).toEqual(['the identifiers of an earlier build kept for a second build in a row (Wikidata did not answer twice)']);
    expect(dropsBetween({ upstream: { wikidata: { status: 'ok' } } }, kept('2026-10-01'))).toEqual(['wikidata turned error (ok before)']); // guard: once is a failure, not a second keep
  });
  it('the index audit sees a range lost and photographs halved', () => {
    expect(indexDrops([{ key: 1, name: 'A b', photos: 10, origin: ['Chile North'] }], [{ key: 1, name: 'A b', photos: 4, origin: [] }])).toEqual(['A b: photographs fell by more than half (10 before, 4 now)', 'A b: native range lost (1 regions before)']);
  });
});

describe('a lag spell (M10, S-A7)', () => {
  const lagged = { status: 'error', detail: 'wikidata maxlag: Waiting for wdqs1011: 9.2 seconds lagged.' };
  it(`after ${LAG_SPELL} lagged species in a row the script stops waiting, until Wikidata answers again`, () => {
    const lag = lagSpell();
    mwWait.tries = MAXLAG_TRIES;
    for (let i = 0; i < LAG_SPELL - 1; i++) lag.after(lagged);
    expect(mwWait.tries).toBe(MAXLAG_TRIES);
    lag.after(lagged);
    expect(mwWait.tries).toBe(1);
    lag.after({ status: 'skipped' }); // a species that did not ask leaves the spell as it was (guard)
    expect(mwWait.tries).toBe(1);
    lag.after({ status: 'ok' });
    expect(mwWait.tries).toBe(MAXLAG_TRIES);
  });
});

describe('the script\'s wiring (M11, S-F5, R46-31)', () => {
  const script = readFileSync('scripts/build-dossiers.ts', 'utf8');
  it('the run waits out a lag: startCorpusRun sets the asks, and the script calls it and feeds the spell', () => {
    mwWait.tries = 1;
    startCorpusRun();
    expect(mwWait.tries).toBe(MAXLAG_TRIES);
    expect(script).toMatch(/^const lag = startCorpusRun\(\);$/m);
    expect(script).toMatch(/lag\.after\(d\.upstream\.wikidata\)/);
  });
  it('the previous build\'s identifiers reach the build, with their day', () => {
    expect(prevIdsFor({ ids: { gbif: 1, inat: 2 }, upstream: { wikidata: { status: 'ok', at: '2026-09-29T10:00:00Z' } }, built: '2026-09-29T10:00:00Z' })).toEqual({ prevIds: { gbif: 1, inat: 2 }, prevIdsOn: '2026-09-29' });
    expect(idsReadOn({ ids: { gbif: 1 }, upstream: { wikidata: { status: 'error', at: 'x', detail: 'wikidata maxlag; the identifiers of the build of 2026-08-02 are kept' } }, built: '2026-10-01' })).toBe('2026-08-02');
    expect(idsReadOn({ ids: { gbif: 1 }, upstream: { wikidata: { status: 'error', at: 'x', detail: "wikidata maxlag; the previous build's identifiers are kept" } }, built: '2026-10-01' })).toBeUndefined();
    expect(script).toMatch(/\.\.\.prevIdsFor\(prevOf\(j\.key\)\)/);
    // Since round seventy-nine (K) the build's guard is `heldFor(j)`: the same GBIF guard, and the names of the pages without a GBIF key.
    expect(script).toMatch(/const gbifHeld = heldElsewhereIn\(existing, j\.key \?\? existing\.get\(j\.name\.toLowerCase\(\)\)\);/);
    expect(script).toMatch(/heldElsewhere: heldFor\(j\)/);
  });
  it('the homonym guard of iNaturalist: another species of the index is held elsewhere', () => {
    const held = heldElsewhereIn(new Map([['weingartia canigueralii', 7], ['weingartia pulchra', 3947359]]), 3947359);
    expect([held('Weingartia canigueralii'), held('Weingartia pulchra'), held('Nobody')]).toEqual([true, false, false]);
  });
  it('--fill gbif-open resumes: a dossier an earlier fill found none for is not asked again', async () => {
    const docs = { 'a.json': { key: 'g1', ids: { gbif: 1 }, photos: [], upstream: { 'gbif.media': { status: 'none', at: 'x', detail: OPEN_NONE } } }, 'b.json': { key: 'g2', ids: { gbif: 2 }, photos: [], upstream: {} } };
    const { f, asked } = counting();
    const c = await fillOpenGbifAll(store(docs), f);
    expect(asked.map((u) => /taxonKey=(\d+)/.exec(u)?.[1])).toEqual(['2']);
    expect(c).toMatchObject({ asked: 1, before: 1 });
    expect(script).toMatch(/fillOpenGbifAll\(diskStore\(\)/);
  });
  it('--fill commons resumes: a dossier asked before, or with six photographs, is not asked', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ src: 'inat', id: String(i) }));
    const docs = { 'a.json': { key: 1, name: { scientific: 'A b' }, photos: [], upstream: { commons: { status: 'none', at: 'x', detail: COMMONS_NONE } } }, 'b.json': { key: 2, name: { scientific: 'C d' }, photos: six, upstream: {} }, 'c.json': { key: 3, name: { scientific: 'E f' }, photos: [], upstream: {} } };
    const { f, asked } = counting({ status: 'none' });
    await fillCommonsAll(store(docs), f);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('E%20f');
    expect(script).toMatch(/fillCommonsAll\(diskStore\(\)/);
  });
  it('no file speaks of a Worker tail build any more', () => {
    for (const f of ['src/lib/dossier/build.ts', 'src/lib/dossier/sources/wikimedia.ts', 'src/lib/dossier/fetch.ts', 'scripts/build-dossiers.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/tail build|for the tail|\(tail builds\)/);
  });
});

describe('GBIF\'s media before Commons, and Commons not counted towards "fewer than six" (K5, S-B2, R46-16)', () => {
  it('a species with three iNaturalist photographs is given GBIF\'s, ahead of Commons\'s', async () => {
    const t = copiapoa() as Record<string, unknown>;
    const obs = (n: number, captive: boolean) => ({ results: Array.from({ length: n }, (_, i) => ({ id: 900 + i + (captive ? 50 : 0), photos: [{ id: 900 + i + (captive ? 50 : 0), license_code: 'cc-by', url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${900 + i + (captive ? 50 : 0)}/square.jpg`, attribution: '(c) a, some rights reserved (CC BY)' }] })) });
    t['https://api.inaturalist.org/v1/observations?taxon_id=135254&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false'] = obs(3, false);
    t['https://api.inaturalist.org/v1/observations?taxon_id=135254&photo_license=cc0,cc-by,cc-by-sa&photos=true&captive=true&identifications=most_agree'] = { results: [] };
    for (const k of Object.keys(t)) if (k.includes('mediaType')) delete t[k];
    t['re:api\\.gbif\\.org/v1/occurrence/search\\?taxonKey=5384013&mediaType'] = { results: [{ key: 4242, media: [{ type: 'StillImage', identifier: 'https://example.org/gbif.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'A Grower' }] }], endOfRecords: true, count: 1 };
    t['https://commons.wikimedia.org/w/api.php'] = { query: { pages: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i + 1), { title: `File:Copiapoa cinerea ${i}.jpg`, imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/C${i}.jpg`, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/C${i}.jpg/960px-C${i}.jpg`, width: 3000, height: 2000, descriptionurl: `https://commons.wikimedia.org/wiki/File:C${i}.jpg`, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'A Photographer' } } }] }])) } };
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(t), builtBy: 'node', now: () => new Date('2026-10-11T12:00:00Z') });
    if (!r.ok) throw new Error('no dossier');
    const srcs = r.dossier.photos.map((p) => p.src);
    expect(srcs).toContain('gbif'); // base: Commons's six made nine, and GBIF was not asked
    expect(srcs.indexOf('gbif')).toBeLessThan(srcs.indexOf('commons') < 0 ? Infinity : srcs.indexOf('commons'));
  });
});

describe('--fill summaries (M3, R46-12)', () => {
  // Leads as Wikipedia gives them, in part (round sixty-nine: the fill reads the lead too, so a fixture's lead is a real one).
  const LEADS: Record<string, string> = {
    'Weingartia canigueralii': 'Weingartia canigueralii is a species of cactus native to Bolivia.',
    Kopsia: 'Kopsia is a genus of plants in the family Apocynaceae first described as a genus in 1823.',
    Saguaro: 'The saguaro is a tree-like cactus species in the monotypic genus Carnegiea.',
    'Copiapoa cinerea': 'Copiapoa cinerea is a species of flowering plant in the family Cactaceae.'
  };
  const sum = (title: string) => ({ text: LEADS[title] ?? 't', source: 'wikipedia', url: `https://en.wikipedia.org/wiki/${title}`, licence: 'CC BY-SA 4.0', title });
  const dossier = (name: string, title: string, wikidata?: string, synonyms: string[] = []) => ({ name: { scientific: name, synonyms }, ids: { gbif: 1, ...(wikidata ? { wikidata } : {}), wikipedia: title }, links: { wikipedia: 'x' }, summary: sum(title), upstream: { wikipedia: { status: 'ok', at: 'x' } as { status: string; at: string; detail?: string } } });
  it('drops the summaries a redirect brought, keeps the species\' own, and asks Wikidata only for titles it cannot settle', async () => {
    const docs: Record<string, unknown> = {
      'w.json': dossier('Weingartia pulchra', 'Weingartia canigueralii', 'Q1', ['Rebutia pulchra Cárdenas']),
      'k.json': dossier('Kopsia fruticosa', 'Kopsia'),
      's.json': dossier('Carnegiea gigantea', 'Saguaro', 'Q2'),
      'c.json': dossier('Copiapoa cinerea', 'Copiapoa cinerea', 'Q3')
    };
    const asked: string[] = [];
    // Round seventy (A1): a title the item's sitelink does not settle is asked of Wikipedia again as the build asks it,
    // so Wikipedia answers here too, with the redirects it gave.
    const redirects: Record<string, string> = { 'Weingartia_pulchra': 'Weingartia canigueralii', 'Kopsia_fruticosa': 'Kopsia' };
    const f = (async (url: string) => {
      asked.push(url);
      const t = /page\/summary\/(.+)$/.exec(url)?.[1];
      if (t) return redirects[t] ? { status: 'ok', data: { type: 'standard', title: redirects[t], extract: LEADS[redirects[t]] } } : { status: 'none' };
      if (url.includes('titles=')) return { status: 'ok', data: { entities: { '-1': { missing: '' } } } };
      return { status: 'ok', data: { entities: { Q1: { sitelinks: {} }, Q2: { sitelinks: { enwiki: { title: 'Saguaro' } } } } } };
    }) as unknown as JsonFetcher;
    const c = await checkSummaries(store(docs), f, () => '2026-10-12T00:00:00Z');
    expect(c).toMatchObject({ kept: 1, confirmed: 1, dropped: 2 });
    expect(asked[0]).toContain('ids=Q1|Q2&');
    expect(asked.filter((u) => /Saguaro|Copiapoa/.test(u))).toEqual([]);
    const w = docs['w.json'] as ReturnType<typeof dossier>;
    expect(w.summary).toBeUndefined();
    expect(w.upstream.wikipedia).toEqual({ status: 'none', at: '2026-10-12T00:00:00Z', detail: 'Wikipedia redirects Weingartia pulchra to Weingartia canigueralii' });
    expect((docs['k.json'] as ReturnType<typeof dossier>).upstream.wikipedia.detail).toBe('Wikipedia redirects Kopsia fruticosa to Kopsia');
    expect((docs['s.json'] as ReturnType<typeof dossier>).summary?.title).toBe('Saguaro');
  });
  it('a title Wikidata does not answer for is left as it was, counted unchecked (guard)', async () => {
    const docs: Record<string, unknown> = { 's.json': dossier('Carnegiea gigantea', 'Saguaro', 'Q2') };
    const c = await checkSummaries(store(docs), (async () => ({ status: 'refused', detail: 'x' })) as unknown as JsonFetcher);
    expect(c).toMatchObject({ unchecked: 1, dropped: 0 });
  });
});

describe('--list-rebuild (M2, M4)', () => {
  it('lists the ranges taken under an older name and the lists cut at fifty', () => {
    const docs: Record<string, unknown> = {
      'a.json': { key: 4084229, name: { scientific: 'Lantana strigocamara', synonyms: [] }, distribution: { source: 'WCVP (Govaerts, RBG Kew), under the name Lantana camara subsp. aculeata' } },
      'b.json': { key: 3084719, name: { scientific: 'Portulaca oleracea', synonyms: Array(50).fill('x') }, distribution: { source: 'WCVP (Govaerts, RBG Kew) via GBIF' } },
      'c.json': { key: 1, name: { scientific: 'A b', synonyms: Array(49).fill('x') }, distribution: { source: 'WCVP (Govaerts, RBG Kew) via GBIF' } }
    };
    expect(rebuildList(store(docs))).toEqual(['4084229 Lantana strigocamara\trange taken under an older name', '3084719 Portulaca oleracea\t50 synonyms stored, the old single page']);
  });
});

describe('--fill summaries --offline (M3)', () => {
  // Round seventy (A1): offline only the name is read. A title it does not settle may still be proved online (Kopsia's
  // by Kew's count of the genus, Saguaro's as the item's sitelink), so nothing is dropped offline.
  it('drops nothing, and leaves a title the name does not settle unchecked', async () => {
    const docs: Record<string, unknown> = {
      'k.json': { name: { scientific: 'Kopsia fruticosa', synonyms: [] }, ids: { gbif: 1, wikipedia: 'Kopsia' }, links: {}, summary: { title: 'Kopsia' }, upstream: {} },
      's.json': { name: { scientific: 'Carnegiea gigantea', synonyms: [] }, ids: { gbif: 2, wikidata: 'Q2', wikipedia: 'Saguaro' }, links: {}, summary: { title: 'Saguaro' }, upstream: {} }
    };
    expect(await checkSummaries(store(docs), null)).toMatchObject({ dropped: 0, unchecked: 2 });
    expect((docs['k.json'] as { summary?: unknown }).summary).toBeDefined();
    expect((docs['s.json'] as { summary?: unknown }).summary).toBeDefined();
  });
});
