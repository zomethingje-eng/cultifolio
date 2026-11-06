/**
 * Round eighty-five, agent E: the species page and its words. Each block names the findings it guards; every one fails on
 * r85base (the new modules are imported inside each test, so each fails alone, and the changed ones read differently).
 *
 * 1. W1, P1, C1, A1: the `?was=` line says whose verdict a name is, Kew's or GBIF's, and never that GBIF's backbone accepts
 *    the heading; GBIF's own name is said apart, not listed among its synonyms. Over the 77 renamed pages among the live
 *    dossiers the reviewers saved (31 October 2026; `fixtures/r85e-renamed.json`).
 * 2. D2, A2: the range note names the name the range was reached by, and is none where the entry is the heading's own.
 * 3. A8, S8: NASA POWER's extremes read and set aside are "answered" in the record of sources, never "nothing to report".
 * 4. D10, A9f, A16d, A22, W13: a reader's words for the shapes' source, a kept row, a build flag, OpenAlex and two items.
 * 5. P8, W12: the elevation cause in one unit system, once.
 * 6. A9g, A16c, W6: the lead states a size at the floor; an observation's first photograph first.
 * 7. Decisions 7 and 8, A9h: the credits' days, the summary's revision and day, the route of a quoted article.
 * 8. P4, B4, A16g, W12: the phone's habitat line links its few records; one word for one state; the rain bar's round end.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rangeNote } from '$lib/ui/ref/notes';
import { readerWords } from '$lib/ui/ref/words';
import * as upstream from '$lib/ui/ref/upstream';
import { lapseSetAside } from '$core/lapse';
import { heroOf } from '$dossier/dedupe';
import { canonicalSynonym } from '$core/names';

type Renamed = { heading: string; authorship?: string; gbif: { scientific: string; authorship?: string }; synonyms: string[]; kewSynonyms?: string[] | null; via?: { kind: string; entry: string; row?: string } | null; native: number };
const RENAMED = JSON.parse(readFileSync('tests/unit/fixtures/r85e-renamed.json', 'utf8')) as Record<string, Renamed>;
const text = (parts: Array<{ t: string }>) => parts.map((p) => p.t).join('');

describe("1. the ?was= line says whose verdict it is (W1, P1, C1, A1)", () => {
  it('on every renamed page, GBIF\'s own name is said as GBIF\'s, with Kew\'s verdict on the heading, never "the GBIF backbone accepts this species as"', async () => {
    const { wasLine } = await import('$lib/ui/ref/was-words');
    expect(Object.keys(RENAMED).length).toBeGreaterThanOrEqual(70);
    for (const [key, r] of Object.entries(RENAMED)) {
      const t = text(wasLine({ was: r.gbif.scientific, heading: r.heading, gbifName: r.gbif.scientific, viaKind: r.via?.kind ?? null, gbifSynonyms: r.synonyms.map((x) => canonicalSynonym(x) ?? x), kewSynonyms: r.kewSynonyms ?? null }));
      expect(t, key).not.toMatch(/backbone accepts (this species as|it under)/);
      expect(t, key).toMatch(/^is (GBIF's (name|spelling)|this plant's name written without its rank)/);
      expect(t, key).toContain(`Kew's World Checklist`);
      expect(t, key).toContain(r.heading);
    }
  });
  it('Hoodia alstonii reached as Ceropegia alstonii, Aeonium tabuliforme as Aeonium tabulaeforme, and a name of Kew\'s or GBIF\'s alone', async () => {
    const { wasLine } = await import('$lib/ui/ref/was-words');
    const h = RENAMED.k506502;
    const base = { heading: h.heading, gbifName: h.gbif.scientific, viaKind: 'synonym-of', gbifSynonyms: h.synonyms.map((x) => canonicalSynonym(x) ?? x), kewSynonyms: h.kewSynonyms };
    expect(text(wasLine({ ...base, was: 'Ceropegia alstonii' }))).toBe("is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist holds it as a synonym of Hoodia alstonii, which heads this page: the reference takes its names from Kew.");
    expect(text(wasLine({ ...base, was: 'Trichocaulon alstonii' }))).toBe("is an older name of this species. Kew's World Checklist holds it as a synonym of Hoodia alstonii, which heads this page; GBIF's backbone lists it as an older name too.");
    expect(text(wasLine({ ...base, was: 'Hoodia gbifonly', gbifSynonyms: [...base.gbifSynonyms, 'Hoodia gbifonly'] }))).toBe("is an older name of this species in GBIF's backbone, which files it under Ceropegia alstonii, GBIF's name for this plant. Kew's World Checklist accepts the plant as Hoodia alstonii, which heads this page, and does not list this name among its synonyms.");
    expect(text(wasLine({ was: 'Aeonium tabulaeforme', heading: 'Aeonium tabuliforme', gbifName: 'Aeonium tabulaeforme', viaKind: 'spelling', gbifSynonyms: [], kewSynonyms: [] }))).toBe("is GBIF's spelling of this plant's name. Kew's World Checklist spells it Aeonium tabuliforme, which heads this page.");
    // A page GBIF's name heads: GBIF's verdict, about GBIF's own name, never "accepts this species as".
    expect(text(wasLine({ was: 'Mammillaria old', heading: 'Mammillaria new', gbifSynonyms: ['Mammillaria old'], kewSynonyms: null }))).toBe("is an older name of this species in GBIF's backbone, which files it under Mammillaria new.");
    // The parts keep the heading in italics.
    expect(wasLine({ ...base, was: 'Ceropegia alstonii' }).filter((p) => p.i).map((p) => p.t)).toEqual(['Hoodia alstonii']);
  });
  it("GBIF's own name is a line of its own under Names, not a GBIF synonym", async () => {
    const { gbifNameLine } = await import('$lib/ui/ref/was-words');
    expect(text(gbifNameLine('Hoodia alstonii', { scientific: 'Ceropegia alstonii', authorship: '(N.E.Br.) Bruyns' }, 'synonym-of')!)).toBe("Ceropegia alstonii (N.E.Br.) Bruyns: the name GBIF's backbone accepts for this plant; Kew's World Checklist holds it as a synonym of Hoodia alstonii.");
    expect(gbifNameLine('Aloe vera', undefined)).toBeNull();
  });
});

describe('2. the range note by the name it was reached by (D2, A2)', () => {
  it('no renamed page says Kew holds its heading as a synonym of itself', () => {
    let notes = 0;
    for (const [key, r] of Object.entries(RENAMED)) {
      if (!r.via || !r.native) continue;
      const n = rangeNote({ native: Array(r.native).fill(0), source: '', via: r.via as never }, { scientific: r.heading, authorship: r.authorship, gbif: r.gbif });
      if (n) notes++;
      expect(`${n?.text ?? ''} ${n?.clause ?? ''}`, key).not.toContain(`Kew holds ${r.heading} as a synonym of ${r.heading}`);
      expect(n?.clause ?? '', key).not.toMatch(/Kew spells this name otherwise|by another author than the one this page cites/);
    }
    expect(notes).toBe(0); // each renamed page's range is its heading's own Kew entry
  });
  it('a page GBIF\'s name heads keeps its note, naming the name the range was reached by', () => {
    const n = rangeNote({ native: [1], source: '', via: { kind: 'synonym-of', entry: 'Hoodia alstonii (N.E.Br.) Plowes', row: 'Ceropegia alstonii (N.E.Br.) Bruyns' } as never }, { scientific: 'Ceropegia alstonii' });
    expect(n?.clause).toBe("Kew holds Ceropegia alstonii (N.E.Br.) Bruyns as a synonym of Hoodia alstonii (N.E.Br.) Plowes; the range is that entry's");
    expect(rangeNote({ native: [1], source: '', via: { kind: 'kew-entry', entry: 'Aloe x Haw.' } as never }, { scientific: 'Aloe x', authorship: 'L.' })?.clause).toContain('by another author');
    expect(rangeNote({ native: [1], source: '', via: { kind: 'kew-entry', entry: 'Aloe x L.' } as never }, { scientific: 'Aloe x', authorship: 'L.' })).toBeNull();
  });
});

describe('3. the register: extremes read and set aside are answered (A8, S8)', () => {
  it('a build\'s "nothing to report" for extremes it set aside is shown as answered, with what was done', () => {
    const registerRow = (upstream as Record<string, unknown>).registerRow as (s: string, u: { status: string; detail?: string }, d: unknown) => { status: string; detail?: string };
    expect(typeof registerRow).toBe('function');
    const clim = { status: 'ok', extremesStatus: 'lapse', months: [{ tmin: -3.0 }], extremesLapse: { minAbs: -6, minP01: -1.1 } }; // a gap of 1.9 °C, past G's 1.5 °C margin (the merge: 0.7 °C now stands)
    const row = registerRow('climate.extremes', { status: 'none', detail: 'NASA POWER daily 1981–2024; not used: the 1-in-100 night …' }, { climate: clim });
    expect(row.status).toBe('ok');
    expect(row.detail).toBe('NASA POWER daily 1981–2024');
    expect(upstream.foundNotShown('climate.extremes', row, { climate: clim })).toMatch(/^read, and set aside, so no cold floor is shown: the 1-in-100 night/);
    expect(registerRow('climate.extremes', { status: 'none' }, { climate: { status: 'ok' } }).status).toBe('none'); // none read: an absence
  });
});

describe('4. a reader\'s words (D10, A9f, A16d, A22, W13)', () => {
  it('the shapes\' source, a kept row, a build flag, OpenAlex and two Wikidata items', () => {
    const shapes = "records tested against the native regions' shapes, openly licensed and restricted alike (Natural Earth 1:10m admin 1 states and provinces (public domain, naturalearthdata.com), assigned to TDWG's level-3 regions by TDWG's tblLevel3.txt, tblLevel4.txt and tblGazetteer.txt (WGSRPD second edition); Douglas-Peucker 0.02 degrees; coordinates in thousandths of a degree, [lon, lat]; shapes rule r84)";
    expect(readerWords(shapes)).toBe("records tested against the native regions' shapes, openly licensed and restricted alike (Natural Earth's provinces, placed in TDWG's regions; shapes rule r84)");
    expect(readerWords('carried from build of 2026-10-22 (rederive); that build: not asked: this build left iNaturalist to the daily fill (--fill inat), which asks for the photographs')).toBe("not asked: this build left iNaturalist to the daily fill, which asks for the photographs (kept from this page's build of 2026-10-22)");
    expect(readerWords('carried from build of 2026-10-22; this build: skipped')).toBe("kept from this page's build of 2026-10-22; not asked again");
    expect(readerWords("not yet asked for this reference; a later fill takes the papers from OpenAlex's snapshot")).toBe('the reference does not ask OpenAlex for papers');
    expect(readerWords("not taken: two items carry Kew's IPNI identifier 676585-1, POWO 676585-1 (Q14952100, Q95967444)")).toBe("not taken: two Wikidata items carry Kew's identifier for this plant (Q14952100, Q95967444)");
  });
  it("Abies marocana's English names: what happened, in one word, with no build log", () => {
    const n = upstream.namesSource({ ids: {}, name: { vernacular: [] }, upstream: { 'wikidata.names': { status: 'skipped', detail: "carried from build of 2026-10-22 (rederive); that build: not asked: two items carry Kew's IPNI identifier 676585-1, POWO 676585-1 (Q14952100, Q95967444), so no item was taken" } } });
    expect(n).toEqual({ word: 'not taken', unchecked: "two Wikidata items carry Kew's identifier for this plant (Q14952100, Q95967444), so neither was taken (kept from this page's build of 2026-10-22)" });
  });
});

describe('5. the elevation cause in one unit system (P8, W12)', () => {
  const thelegona = { months: [{ tmin: 2 }], extremes: { minAbs: -3, minP01: -1, lapseAppliedM: -1257 } };
  it('in °F, feet alone, once; in °C, metres alone, once', () => {
    expect(lapseSetAside(thelegona, 'us')).toBe("the weather cell's ground is 4,124 ft higher than the typical spot's, more than the 3,281 ft (1,000 m) over which a correction for height is applied, so the cell stands for other terrain");
    expect(lapseSetAside(thelegona)).toBe("the weather cell's ground is 1,257 m higher than the typical spot's, more than the 1,000 m over which a correction for height is applied, so the cell stands for other terrain");
  });
});

describe('6. the lead photograph (A9g, A16c, W6)', () => {
  const p = (id: string, o: Record<string, unknown> = {}) => ({ id, url: `https://example.org/${id}.jpg`, src: 'inat', ...o });
  it('a GBIF file with no stated size leads only where no photograph states one at the floor', () => {
    expect(heroOf([p('gbif', { src: 'gbif' }), p('commons', { src: 'commons', width: 1024, height: 768 })])!.id).toBe('commons');
    expect(heroOf([p('gbif', { src: 'gbif' }), p('commons-small', { src: 'commons', width: 400, height: 300 })])!.id).toBe('gbif');
  });
  it("an observation's first photograph before its later ones: Echeveria elegans no longer leads with a hand holding a label", () => {
    const ph = JSON.parse(readFileSync('tests/unit/fixtures/r85e-photos.json', 'utf8'))['echeveria-elegans'] as Array<{ id: string; url: string; src: string; width?: number; height?: number; captive?: boolean; page?: string }>;
    expect(heroOf(ph)!.id).toBe('186526029'); // r85base: 186525690, the seventh of pmallard's eight
  });
  it('an upright lead is known by its loaded shape', async () => {
    const { isUpright } = await import('$lib/ui/ref/lead-shape');
    expect(isUpright(319, 480)).toBe(true);
    expect(isUpright(500, 375)).toBe(false);
  });
});

describe("7. the credits' days, the summary's revision and route (decisions 7, 8; A9h)", () => {
  it('each source\'s day, a photograph\'s own day first', async () => {
    const { creditDays } = await import('$lib/ui/ref/credit-days');
    const up = { 'inat.photos.cultivated': { status: 'ok', at: '2026-10-27T02:00:00Z' }, commons: { status: 'ok', at: '2026-10-22T10:00:00Z' }, 'gbif.media': { status: 'skipped', at: '2026-10-22T10:00:00Z' } };
    expect(creditDays([{ src: 'inat', captive: true }, { src: 'commons' }, { src: 'gbif' }], up)).toBe('Credits as read from iNaturalist on 2026-10-27, from Wikimedia Commons on 2026-10-22 and from GBIF on a day not recorded');
    expect(creditDays([{ src: 'gbif', read: '2026-11-02' }], up)).toBe('Credits as read from GBIF on 2026-11-02');
  });
  // Round eighty-six (outside review B's 2): a failed, refused, empty, ambiguous or skipped row lends no day; a photograph's
  // own day still stands after a failed refresh.
  it.each(['error', 'refused', 'none', 'ambiguous', 'skipped'])('a row that says %s is not a read day', async (status) => {
    const { creditDays } = await import('$lib/ui/ref/credit-days');
    const up = { 'gbif.media': { status, at: '2026-11-05T00:00:00Z' } };
    expect(creditDays([{ src: 'gbif' }], up)).toBe('Credits as read from GBIF on a day not recorded');
    expect(creditDays([{ src: 'gbif', read: '2026-11-02' }], up)).toBe('Credits as read from GBIF on 2026-11-02');
    expect(creditDays([{ src: 'gbif', read: '2026-11-02' }, { src: 'gbif' }], up)).toBe("Credits as read from GBIF on 2026-11-02 (one photograph's day not recorded)");
  });
  it('the revision linked, the day read; and the route of an article under another title', async () => {
    const { summaryRevision, summaryRoute } = await import('$lib/ui/ref/credit-days');
    expect(summaryRevision({ url: 'https://en.wikipedia.org/wiki/Strawberry', revision: 1254300000, read: '2026-11-01' })).toEqual({ rev: '1254300000', href: 'https://en.wikipedia.org/w/index.php?oldid=1254300000', day: '2026-11-01' });
    expect(summaryRevision({ url: 'https://en.wikipedia.org/wiki/Aloe_vera' }, { status: 'ok', at: '2026-10-28T22:02:34Z' })).toEqual({ rev: null, href: null, day: '2026-10-28' });
    expect(summaryRoute('Strawberry', 'Fragaria × ananassa', false, { detail: 'carried from build of 2026-10-28; this build: skipped' })).toEqual({ route: null });
    expect(summaryRoute('Strawberry', 'Fragaria × ananassa', false, { detail: 'Wikipedia redirects Fragaria × ananassa to Strawberry, a product of this species' })).toEqual({ route: 'Wikipedia redirects Fragaria × ananassa to Strawberry, a product of this species' });
    expect(summaryRoute('Aloe vera', 'Aloe vera', false, null)).toBeNull();
  });
});

describe('8. the phone\'s line, one word, the rain bar (P4, B4, A16g, W12)', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 25, tmin: 5 + i, tmean: 15, precipMm: 100, dli: 30 }));
  it('the few-records mark on the phone\'s line is a link to the climate\'s notice', async () => {
    const { render } = await import('svelte/server');
    const HabitatLine = (await import('$lib/ui/ref/HabitatLine.svelte')).default;
    const body = render(HabitatLine, { props: { months, units: 'metric', few: { records: 3, cells: 3 }, fewHref: '#few-records' } as never }).body;
    expect(body).toMatch(/<a class="few[^"]*" id="few-records-line" href="#few-records">from 3 records<\/a>/);
    expect(body).toMatch(/<a class="figs[^"]*" href="#s-glance">Figures ›<\/a>/);
  });
  it('"Photographs not asked" on the mark and in the section alike', async () => {
    const { render } = await import('svelte/server');
    const NotChecked = (await import('$lib/ui/NotChecked.svelte')).default;
    expect(render(NotChecked, { props: { what: 'Photographs', why: 'x.', word: 'not asked' } as never }).body).toContain('Photographs not asked');
  });
  it('the rain bar ends at a round figure in inches', async () => {
    const { render } = await import('svelte/server');
    const Glance = (await import('$lib/ui/ref/Glance.svelte')).default;
    const { units } = await import('$lib/ui/units.svelte');
    units.set('us');
    try {
      const body = render(Glance, { props: { months, annualRain: { p50: 1100 } } as never }).body;
      expect(body).toContain('bar 0 to 48 in');
      expect(body).not.toContain('47.2');
    } finally {
      units.set('metric');
    }
  });
});
