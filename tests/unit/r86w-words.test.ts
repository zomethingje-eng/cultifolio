/**
 * Round eighty-six, the words agent: the about pages true of the code as it stands, and the remaining wording and small
 * faults on pages. Each sentence is found by its opening words and driven through the code it describes
 * (`tests/about-pages.ts`).
 *
 * - S4 (review S): /about/how and /about/formats said "not checked" for a page whose GBIF records were not asked; that
 *   no page holds a name Kew places elsewhere; that every English name a source gives is searched; that a cultivar in
 *   any quotes is left out; October for Cloudflare's headers; the file counts at 48,357; "26 species" under the wrong rule.
 * - Outside review B's 5: the summary is Wikipedia's summary service's text, not the article's opening "as written". Since
 *   the plan's B7 (the sources agent, round eighty-six) it is the article's opening paragraph read by the action API with
 *   its revision, and the test says that.
 * - The plan's A13: "Wild plants lead" (the lead is iNaturalist's cultivated set first); "outside the WCVP native range not
 *   used"; a skipped range said as "WCVP publishes no distribution"; the register saying "not asked" twice; the place's
 *   source and country ("Congo - Kinshasa", "Crimea, Russia"); "Photographs not asked" where one source was not asked.
 * - The plan's A10: a numbering setting of width 1e9 threw on every open of the add form.
 * - Review W's W5 (and P's P4), W9, W11 and W15 (and P's P8).
 *
 * On r86base (1b663ea) every `it` below FAILED, but the guards marked "(guard)": the sentences said the old words, and
 * `fileCounts`, `outsideUnused`, `registerDetail`, `placeWords`, `shownPlace`, `isScheme` (exported) and `photoSourceGaps`'
 * `what` did not exist; the collection with a 1e9-wide scheme threw "Invalid string length"; the range caption said
 * "WCVP publishes no distribution"; the chart said "99th-percentile day" and "mm rain"; SpeciesName glued the author on
 * with a no-break space; the caption's date had no "observed".
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { said, aboutText, sentences } from '../about-pages';
import { COUNTS_ON, fileCounts } from '$lib/ui/about-counts';
import { searchDirsFor } from '$core/search-files';
import { cardFilesFor, olderFilesFor, rowFilesFor } from '$dossier/lookups';
import { canonicalSynonym } from '$core/names';
import { keptNames, englishNames } from '$dossier/index-entry';
import { prepare, search } from '$core/search';
import { summary } from '$dossier/sources/wikipedia';
import { heroOf } from '$dossier/dedupe';
import { rangeCaption } from '$lib/ui/ref/range-words';
import { outsideUnused } from '$dossier/range-via';
import { registerDetail } from '$lib/ui/ref/upstream';
import { placeWords, shownPlace } from '$core/place-words';
import { fewRecordsSentence } from '$core/few-records';
import { photoSourceGaps } from '$lib/ui/ref/photos';
import { isScheme, nextAccession } from '$core/accession';
import { climograph } from '$climate/climograph';
import type { Change } from '$core/log';

const listHeader = readFileSync('scripts/species-list.txt', 'utf8').split('\n').filter((l) => l.startsWith('#')).join('\n');

describe('S4: /about/how and /about/formats say what the code does', () => {
  it('a page with no GBIF key says its records were not asked, on both pages', () => {
    const how = said('how', 'Where there are none, the page says its records');
    expect(how.text).toContain('the page says its records were not asked'); // base: "were not checked"
    expect(how.text).not.toContain('not checked');
    const formats = said('formats', 'Its climate is pending with the reason');
    expect(formats.text).toContain('the site says each as not asked, never none'); // base: "as not checked"
    // What the pages describe: the dossier's rows are `skipped`, and the register's word for `skipped` is "not asked".
    expect(registerDetail('skipped', 'not asked: GBIF holds none')).toBe('GBIF holds none');
  });

  it('the Kew rule: a name below the species keeps its rank word, so it is never cut to another species\' binomial (A8)', () => {
    const text = said('how', "A name of GBIF's below the species keeps its rank word").text;
    expect(text).toContain('"proles"');
    expect(text).toContain('Paeonia corallina proles ovatifolia');
    // What the code does since round eighty-six (A8): every rank word is read, so the name is not cut to a binomial ...
    expect(canonicalSynonym('Paeonia corallina proles ovatifolia (Boiss. & Reut.) Cout.')).not.toBe('Paeonia corallina');
    // ... and the page no longer says the opposite (base: "is never a search name of a page it does not lead to").
    expect(aboutText('how')).not.toContain('is never a search name of a page it does not lead to');
    expect(aboutText('how')).not.toContain('So about 20 pages still hold');
  });

  it('English names: a row with no language is never shown, and only NCBI\'s are searched, as the pages say', () => {
    const s = said('how', 'The English name shown is one GBIF');
    expect(s.text).not.toContain('Every English name a source gives is searched'); // base
    // Since round eighty-six (the sources agent; review S's S2): NCBI's rows with no language are searched, never shown.
    expect(said('how', 'A row with no language marked is never shown').text).toBeTruthy();
    expect(said('how', "The rows NCBI's taxonomy gives with no language marked").text).toContain('searched, never shown');
    // Lophophora williamsii's rows as its dossier holds them: "Peyote" from Catalogue of Life with no language.
    const rows = [{ name: 'Indian-dope', lang: 'eng', source: 'x' }, { name: 'Peyote', lang: '', source: 'Catalogue of Life Checklist' }, { name: 'peyote', lang: '', source: 'NCBI Taxonomy' }];
    const names = englishNames(rows as never);
    expect([names.common, ...(names.commons ?? [])]).not.toContain('Peyote');
    expect([names.common, ...(names.commons ?? [])]).not.toContain('peyote');
    expect(said('formats', 'The entry holds the names a source marks as English').text).toContain("never another source's row with no language");
  });

  it('a cultivar with an apostrophe in its quotes is not read as one, and finds nothing, as the page says', () => {
    const s = said('how', 'A cultivar whose name holds an apostrophe');
    expect(s.text).toContain(`"Galanthus 'Wendy's Gold'" finds nothing`);
    const p = prepare([{ name: 'Galanthus nivalis', slug: 'galanthus-nivalis' }, { name: 'Galanthus elwesii', slug: 'galanthus-elwesii' }] as never);
    expect(search(p, "Galanthus 'Wendy's Gold'")).toEqual([]);
    expect(search(p, "Galanthus 'Wendy Gold'").length).toBeGreaterThan(0); // (guard) a cultivar without one is left out
  });

  it("Cloudflare's headers are dated by the day they were last seen", () => {
    expect(said('how', 'Cloudflare, which serves the site').text).toContain('as it was when last checked, on 5 November 2026'); // base: "as it is in October 2026"
  });

  it('the file counts are said at the count --index wrote, by the build\'s own rules', () => {
    for (const n of [1, 8_947, 20_480, 20_481, 40_960, 48_357, 48_375, 81_920, 81_921, 300_000, 1_000_000]) {
      expect(fileCounts(n), String(n)).toEqual({ genusRows: rowFilesFor('genus', n), otherRows: rowFilesFor('family', n), cards: cardFilesFor(n), names: olderFilesFor(n), searchDirs: searchDirsFor(n) });
    }
    const src = readFileSync('src/routes/about/formats/+page.svelte', 'utf8');
    expect(src).toContain('const files = fileCounts(COUNTS_ON.species);');
    expect(src).not.toMatch(/at 48,357 species|At 48,357 species/); // base: four sentences at round eighty-four's count
    expect(COUNTS_ON.species).toBe(48_375);
  });

  it('"26 species are here for that reason alone" stands under the rule that keeps the species already in the reference', () => {
    const alone = /([\d,]+) only because they are already in the reference/.exec(listHeader)![1];
    expect(said('how', 'It keeps every species that was already in the reference').text).toContain(`; ${alone} species are here for that reason alone`);
    expect(said('how', 'Each page is the species of the Kew entry it cites').text).not.toContain('reason alone'); // base: here
  });
});

describe("outside review B's 5: the summary is the article's opening paragraph (since the plan's B7)", () => {
  it('the page says the opening paragraph, and the code asks the action API for it with its revision, its brackets kept', async () => {
    const sum = said('how', "The summary is the English Wikipedia article's opening paragraph");
    expect(sum.text).toContain('quoted word for word as plain text');
    expect(sum.text).toContain("with the article's revision it was read at");
    expect(aboutText('how')).not.toMatch(/quoted as written|as that service shortens it/); // base: the service's shortening
    expect(said('how', "The summary is the article's opening paragraph").text).toContain('its brackets kept');
    expect(said('how', "The paragraph and the article's revision are read in one request").text).toContain('twenty articles a request');
    expect(said('how', 'A summary read before November 2026 is the text of Wikipedia').text).toContain('its credit names the service');
    const asked: string[] = [];
    // The article's opening paragraph for Aloe vera, as TextExtracts gives it in plain text: its words in brackets kept,
    // the pronunciation's emptied bracket closed up; the revision read in the same request.
    const extract = 'Aloe vera () is a succulent plant species of the genus Aloe (family Asphodelaceae). It is widely distributed.\nAn evergreen perennial.';
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: { batchcomplete: true, query: { pages: [{ title: 'Aloe vera', extract, revisions: [{ revid: 123 }] }] } } }; }) as never;
    const r = await summary(f, 'Aloe vera', ['Aloe vera']);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^https:\/\/en\.wikipedia\.org\/w\/api\.php\?action=query&.*prop=extracts\|revisions\|pageprops&exintro=1&explaintext=1&.*rvprop=ids&.*titles=Aloe%20vera$/);
    expect(r.status === 'ok' && r.data.text).toBe('Aloe vera is a succulent plant species of the genus Aloe (family Asphodelaceae). It is widely distributed.');
    expect(r.status === 'ok' && r.data.revision).toBe(123);
    expect(r.status === 'ok' && r.data.from).toBe('lead');
  });
});

describe('the plan\'s A13: the words on pages', () => {
  it('the lead is iNaturalist\'s cultivated photograph first, as /about/how now says', () => {
    const wild = { url: 'https://x/wild.jpg', src: 'inat', captive: false, width: 1024, height: 768, page: 'o1' };
    const grown = { url: 'https://x/grown.jpg', src: 'inat', captive: true, width: 1024, height: 768, page: 'o2' };
    expect(heroOf([wild, grown])).toBe(grown);
    expect(aboutText('how')).not.toContain('Wild plants lead'); // base
    expect(said('how', 'The lead photograph is taken from').text).toContain("iNaturalist's cultivated set first");
  });

  it('a range the build did not ask is "not asked", never "no distribution"', () => {
    expect(rangeCaption({ native: [] }, 'skipped')).toBe('Native range not asked: the distribution source was not asked when this page was built'); // base: "No native range: WCVP publishes no distribution for this name"
    expect(rangeCaption({ native: [] }, 'none')).toBe('No native range: WCVP publishes no distribution for this name'); // (guard)
  });

  it('records outside the range: one sentence, the range "stated", as the empty case says it', () => {
    expect(outsideUnused(12)).toBe('12 records lie outside the stated native range, and are not used.');
    expect(outsideUnused(1)).toBe('One record lies outside the stated native range, and is not used.');
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).not.toContain('outside the WCVP native range not used'); // base
  });

  it('the register says a skipped row\'s state once, by its pill, and its reason (S15)', () => {
    // Echinopsis pachanoi's gbif.vernacular row, as the live dossier k2783547 holds it.
    const why = "GBIF's backbone holds no one accepted species of this name, and a name it holds only as another species' synonym is not taken for this one, so GBIF's records were not asked";
    expect(registerDetail('skipped', why)).toBe("GBIF's backbone holds no one accepted species of this name, and a name it holds only as another species' synonym is not taken for this one");
    const occ = 'GBIF lumps what Kew splits; GBIF\'s records under those names are on that page, and a record is shown on one page only, so they were not asked for this one';
    expect(registerDetail('skipped', occ)).toBe('GBIF lumps what Kew splits; GBIF\'s records under those names are on that page, and a record is shown on one page only');
    expect(registerDetail('refused', 'HTTP 429, so it was not asked again')).toBe('HTTP 429, so it was not asked again'); // (guard) only a skipped row
  });

  it('the typical spot\'s place: its source said, its country as a reader writes it, a disputed province alone', () => {
    expect(placeWords('Sud-Kivu', 'CD')).toBe('Sud-Kivu, Democratic Republic of the Congo');
    expect(placeWords('Crimea', 'RU')).toBe('Crimea');
    expect(placeWords('Sevastopol', 'RU')).toBe('Sevastopol');
    expect(placeWords('São Paulo', 'BR')).toBe('São Paulo, Brazil'); // (guard)
    expect(placeWords('Somaliland', '-9')).toBe('Somaliland'); // (guard) Natural Earth gives no country
    // A place a build of round eighty-five stored, read the same way.
    expect(shownPlace('Sud-Kivu, Congo - Kinshasa')).toBe('Sud-Kivu, Democratic Republic of the Congo');
    expect(shownPlace('Crimea, Russia')).toBe('Crimea');
    expect(shownPlace('Saint Helena, St. Helena')).toBe('Saint Helena, Saint Helena');
    expect(fewRecordsSentence({ records: 3, cells: 3, place: 'Sud-Kivu, Congo - Kinshasa' })).toMatch(/is in Sud-Kivu, Democratic Republic of the Congo \(Natural Earth's provinces\)\.$/);
  });

  it('the mark under the name names the photograph source not asked when another answered (S15)', () => {
    // Aria latifolia: GBIF's media not asked; iNaturalist's sets and Commons answered with none.
    const up = { 'gbif.media': { status: 'skipped' }, 'inat.photos.wild': { status: 'none' }, 'inat.photos.cultivated': { status: 'none' }, commons: { status: 'none' } };
    expect(photoSourceGaps(up, 0)!.what).toBe('GBIF media');
    expect(photoSourceGaps({ 'gbif.media': { status: 'skipped' }, 'inat.photos.wild': { status: 'skipped' }, 'inat.photos.cultivated': { status: 'skipped' }, commons: { status: 'skipped' } }, 0)!.what).toBe('Photographs'); // (guard) none answered
  });
});

describe("the plan's A10: a numbering setting the numbering cannot use is not a scheme", () => {
  it('width 1e9, Infinity, -1, 2.5 or a prefix no plant number holds: the default stands', () => {
    for (const bad of [{ mode: 'year', width: 1e9 }, { mode: 'year', width: Infinity }, { mode: 'year', width: -1 }, { mode: 'year', width: 2.5 }, { mode: 'year', width: NaN }, { mode: 'prefix', prefix: 'X'.repeat(40), width: 4 }, { mode: 'prefix', prefix: 7, width: 4 }]) {
      expect(isScheme(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isScheme({ mode: 'prefix', prefix: 'GH', width: 3 })).toBe(true); // (guard)
    expect(nextAccession(['GH-007'], { mode: 'prefix', prefix: 'GH', width: 3 })).toBe('GH-008'); // (guard)
  });
});

let mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes],
    appendChanges: async (c: Change[]) => { mem.changes.push(...c); return { kept: c, replaced: [] }; },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    deviceId: async () => 'testdevice',
    requestPersistence: async () => true
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  Object.assign(m, { onOtherTabWrite: () => () => {}, readFold: async () => undefined, writeFold: async () => false, foldGen: async () => 0, dropFold: async () => {}, parkStamps: async (st: string[]) => st, lastArrival: async () => 0, arrivalsAfter: async () => ({ changes: [...mem.changes], seq: 0, gen: 0 }), changeKeys: async () => mem.changes.map((c) => c.t), changesByKeys: async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t)), updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; }, changesOf: async (kind: string, id: string) => mem.changes.filter((c) => c.kind === kind && c.id === id), holdVault: async (work: () => Promise<unknown>) => work(), announceSyncForgotten: () => {} });
  return m;
});

describe("the plan's A10, in the collection", () => {
  it('a synced setting of width 1e9 leaves the next plant number the default scheme\'s, not a throw', async () => {
    const { collection, NUMBERING_SETTING } = await import('$lib/db/collection.svelte');
    mem = { changes: [{ t: `${Date.now() - 86_400_000}-0000-dev1`, kind: 'setting', id: NUMBERING_SETTING, field: 'scheme', value: { mode: 'year', width: 1e9 } }], meta: new Map() };
    await collection.load();
    expect(collection.recordCount).toBe(1); // the setting is read (guard: a stamp the log refuses would test nothing)
    expect(collection.scheme).toEqual({ mode: 'year', width: 4 });
    expect(() => collection.nextAccessionNumber()).not.toThrow(); // base: RangeError: Invalid string length
    expect(collection.nextAccessionNumber(undefined, '2026-03-01')).toBe('2026-0001');
  });
});

describe("review W's W9: one name for the hot day, and the rain panel's unit read as a unit", () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 20 + 8 * Math.cos(i / 2), tmin: 5 + 6 * Math.cos(i / 2), precipMm: 40 + i, dli: 20 + i, rh: 60 }));
  const input = { months, p10: months, p90: months, cells: 40, extremes: { minAbs: -24.1, maxP99: 30, years: 44 } };
  it('the drawn label is the legend\'s "1-in-100 hot day" at both widths', () => {
    expect(climograph(input, 268).temp.maxP99!.label).toBe('30.0° 1-in-100 hot day'); // base: "hot day, 1 in 100"
    expect(climograph(input, 940).temp.maxP99!.label).toBe('30.0° 1-in-100 hot day, NASA POWER'); // base: "99th-percentile day, NASA POWER"
  });
  it('the rain panel says "Rain (mm)", which capitals do not turn into "MM RAIN"', async () => {
    const { render } = await import('svelte/server');
    const Climograph = (await import('$lib/ui/Climograph.svelte')).default;
    const body = render(Climograph, { props: { climate: { months, p10: months, p90: months, cells: 40, extremes: { minAbs: -24.1, maxP99: 30, years: 44 } } as never, name: 'Testia' } }).body;
    expect(body).toContain('Rain (mm)');
    expect(body).not.toContain('mm rain'); // base
  });
});

describe("review W's W5 and P's P4: the binomial stays whole and the author wraps", () => {
  it('a plain space before the author, which wraps within itself on the species page', async () => {
    const { render } = await import('svelte/server');
    const SpeciesName = (await import('$lib/ui/SpeciesName.svelte')).default;
    const body = render(SpeciesName, { props: { name: 'Sabdariffa acetosella', authorship: '(Welw. ex Hiern) M.M.Hanes & R.L.Barrett' } }).body;
    expect(body).toMatch(/<\/i>(?:<!--[^>]*-->)* <span class="auth[^"]*">/); // base: "</i>&nbsp;<span" (U+00A0)
    expect(body).not.toContain(' ');
    expect(readFileSync('src/lib/ui/theme.css', 'utf8')).not.toMatch(/h1\.sci \.auth \{[^}]*white-space: nowrap/); // base: kept whole, out of the card at 320 px
  });
});

describe("review W's W11: the hero's date is the observation's, said so", () => {
  it('"observed" before the day, apart from the credits\' "as read" day', async () => {
    const { render } = await import('svelte/server');
    const Photos = (await import('$lib/ui/Photos.svelte')).default;
    const hero = { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg', src: 'inat', licence: 'by', attribution: '(c) Jane Doe, some rights reserved (CC BY)', captive: true, observedOn: '2022-04-06', page: 'https://www.inaturalist.org/observations/1', read: '2026-11-04' };
    const body = render(Photos, { props: { photos: [hero], name: 'Echeveria elegans', upstream: {} } as never }).body;
    expect(body).toContain('observed 2022-04-06'); // base: "· 2022-04-06"
  });
});

describe("review W's W15 and P's P8: each fold has a name of its own, and a mark that it opens", () => {
  for (const [page, words] of [['how', 'The rules in full'], ['formats', 'The format in full']] as const) {
    it(`/about/${page}: no two folds share a name`, () => {
      const src = readFileSync(`src/routes/about/${page}/+page.svelte`, 'utf8');
      const names = [...src.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
      expect(names.filter((n) => n === words)).toEqual([]); // base: 34 and 13 named alike
      expect(new Set(names).size).toBe(names.length);
      expect(src).toMatch(/> summary::before \{ content: '›'/);
    });
  }
  it('no sentence of the pages runs over sixty words (guard, the pages\' own rule)', () => {
    for (const p of ['how', 'formats'] as const) expect(sentences(p).filter((s) => s.text.split(/\s+/).length > 60).map((s) => s.where)).toEqual([]);
  });
});
