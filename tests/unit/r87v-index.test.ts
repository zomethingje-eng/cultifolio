/**
 * Round eighty-seven (derived agent; the plan's C5 and the older data items):
 *
 *   - the index's `low` (the record low as the page shows it, one decimal) and `first` (the earliest day the dossier
 *     records, or an earlier index's, as a day number), and the browse table's two columns of them;
 *   - review D's D13: an older name GBIF writes by another page's own author, which Kew's rows file in this plant by
 *     another author, is a homonym said by Kew's author (`name.kew.by`, written by `--fill kew-names`);
 *   - the plan's B17: every shown older name sorted by kind against Kew's names (a report);
 *   - the browse pages' country table held to the shapes file it is read from.
 *
 * FAILS on the base: no `low`, `first`, `firstSeen`, `kewAuthorsOf`, `name.kew.by`, `older-kinds.ts` or `table-countries.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('index: low and first', () => {
  it('the record low as the page shows it, one decimal; none without shown extremes', async () => {
    const { recordLowOf } = await import('$dossier/index-entry');
    const { setAsideExtremes } = await import('$dossier/schema');
    expect(recordLowOf({ status: 'ok', extremes: { minAbs: -12.345 } })).toBe(-12.3);
    expect(recordLowOf({ status: 'ok', extremes: null })).toBeUndefined();
    expect(recordLowOf({ status: 'none' })).toBeUndefined();
    // Extremes read at a cell mostly sea are set aside: no low in the index either.
    const sea = setAsideExtremes({ status: 'ok', landFraction: 0.3, extremes: { years: 44, minAbs: 4, minP01: 6, maxP99: 30, frostDaysPerYear: 0, lapseAppliedM: 0 }, months: [] } as never);
    expect(recordLowOf(sea as never)).toBeUndefined();
  });
  it('first: the earliest day the dossier records, never an observation’s; an earlier index’s day kept', async () => {
    const { earliestDay, firstSeen, firstsOf } = await import('$dossier/index-entry');
    const d = {
      built: '2026-11-08T10:00:00Z',
      changed: { on: '2026-10-20' },
      upstream: { wikidata: { at: '2026-10-02T00:00:00Z', detail: 'carried from build of 2026-09-29 (rederive); that build: ok' }, climate: { at: '2026-11-08T10:00:00Z' } },
      photos: [{ read: '2026-11-02', observedOn: '2019-04-01' }],
      summary: { read: '2026-11-03' }
    };
    expect(earliestDay(d)).toBe('2026-09-29');
    const n = Math.round(Date.parse('2026-09-29T00:00:00Z') / 86_400_000);
    expect(firstSeen(undefined, d)).toBe(n);
    expect(firstSeen(n - 30, d)).toBe(n - 30);
    expect(firstSeen(n + 30, d)).toBe(n);
    expect(firstSeen(undefined, {})).toBeUndefined();
    expect(firstSeen(20000, {})).toBe(20000);
    expect([...firstsOf([{ key: 'k1', first: 20000 }, { key: 'k2' }, { key: 'k3', first: 'x' }])]).toEqual([['k1', 20000]]);
    expect(firstsOf(null).size).toBe(0);
  });
  // Round eighty-seven's review of stage 2: the table carries the record low, not the first day (read by nothing there).
  it('the browse table carries the record low, null for none, and not the first day; a table written before is still a table', async () => {
    const { browseTableOf, isBrowseTable, lowAt } = await import('$lib/browse/table');
    const e = (key: string, o: object = {}) => ({ key, slug: key, name: `Aloe ${key}`, origin: [], climate: 'ok', ...o }) as never;
    const t = browseTableOf([e('k1', { low: -3.04, first: 20500 }), e('k2')]);
    expect(t.low).toEqual([-3, null]);
    expect('first' in t).toBe(false);
    expect(lowAt(t, 0)).toBe(-3);
    expect(lowAt(t, 1)).toBeNull();
    expect(isBrowseTable(JSON.parse(JSON.stringify(t)), 2)).toBe(true);
    expect(isBrowseTable({ ...t, first: [20500, 0] }, 2)).toBe(true);
    const { low: _l, ...before } = t;
    expect(isBrowseTable(before, 2)).toBe(true);
    expect(lowAt(before as never, 0)).toBeNull();
    expect(isBrowseTable({ ...t, low: [1] }, 2)).toBe(false);
  });
});

describe('D13: homonyms said by Kew’s authors', () => {
  const page = (key: string, name: string, o: object = {}) => ({ key, slug: key, name, origin: [], photos: 0, open: 0, climate: 'ok', ...o });
  it('GBIF writes the other page’s author; Kew files the name here by another: moved, said by Kew’s author', async () => {
    const { homonymEntries } = await import('$dossier/index-entry');
    const idx = [page('k1', 'Bourreria succulenta', { syn: ['Cordia collococca'] }), page('k2', 'Cordia collococca')];
    const rec = new Map<string, object>([
      ['k1', { authorship: 'Jacq.', synonyms: ['Cordia collococca L.'], kew: { synonyms: ['Cordia collococca', 'Ehretia bourreria'], by: [['Sw.'], ['L.']] } }],
      ['k2', { authorship: 'L.', synonyms: [] }]
    ]);
    const h = homonymEntries(idx as never, (k) => rec.get(k) as never);
    const e = h.index.find((x) => x.key === 'k1')!;
    expect(e.syn).toBeUndefined();
    expect(e.hom).toEqual(['Cordia collococca']);
    expect(e.homBy).toEqual([['Sw.']]);
    expect(h.byKew).toBe(1);
    expect(h.kept).toBe(0);
    // Without Kew's authors (a record filled before), kept as before.
    const before = new Map(rec);
    before.set('k1', { authorship: 'Jacq.', synonyms: ['Cordia collococca L.'], kew: { synonyms: ['Cordia collococca'] } });
    const b = homonymEntries(idx as never, (k) => before.get(k) as never);
    expect(b.index.find((x) => x.key === 'k1')!.syn).toEqual(['Cordia collococca']);
    expect(b.kept).toBe(1);
  });
  it('Kew’s own older names spelt as another heading: said by Kew’s authors where read', async () => {
    const { homonymEntries } = await import('$dossier/index-entry');
    const idx = [page('k1', 'Acacia linearifolia', { kew: ['Acacia adunca'] }), page('k2', 'Acacia adunca')];
    const rec = new Map<string, object>([['k1', { authorship: 'Maiden & Betche', synonyms: [], kew: { synonyms: ['Acacia adunca'], by: [['Maiden']] } }], ['k2', { authorship: 'A.Cunn. ex G.Don', synonyms: [] }]]);
    const e = homonymEntries(idx as never, (k) => rec.get(k) as never).index.find((x) => x.key === 'k1')!;
    expect(e.hom).toEqual(['Acacia adunca']);
    expect(e.homBy).toEqual([['Maiden']]);
  });
  it('--fill kew-names writes each name’s authors beside it', async () => {
    const { KewNamesIndex, kewNames } = await import('$dossier/kew-names');
    const idx = new KewNamesIndex();
    const row = (id: string, name: string, authors: string, status: string, accepted: string) => ({ id, name, authors, status, rank: 'Species', accepted, parent: '', powo: `${id}-1` });
    idx.add(row('1', 'Bourreria succulenta', 'Jacq.', 'Accepted', '1'));
    idx.add(row('2', 'Cordia collococca', 'Sw.', 'Synonym', '1'));
    idx.add(row('3', 'Ehretia bourreria', 'L.', 'Synonym', '1'));
    idx.add(row('4', 'Cordia collococca', 'L.', 'Accepted', '4'));
    const k = kewNames({ key: 'k1', name: { scientific: 'Bourreria succulenta', authorship: 'Jacq.', synonyms: [] }, ids: { powo: '1-1' }, upstream: {} } as never, idx, '2026-10-01');
    expect(k.synonyms).toEqual(['Cordia collococca', 'Ehretia bourreria']);
    expect(k.by).toEqual([['Sw.'], ['L.']]);
  });
});

describe('B17: the kinds of the shown older names', () => {
  it('direct, citation form, descendant, other, and unread', async () => {
    const { olderKinds, olderKind, olderKindsLine } = await import('$dossier/older-kinds');
    const kew = { entry: '1', synonyms: ['Aloe barbadensis', 'Aloe ×nobilis'], acceptedElsewhere: [], file: 'x', accepted: { name: 'Aloe vera' } };
    const p = { key: 'k1', name: { scientific: 'Aloe vera', synonyms: ['Aloe barbadensis Mill.', 'aloe Barbadensis', 'Aloe x nobilis Haw.', 'Aloe vera var. chinensis (Haw.) A.Berger', 'Aloe barbadensis ssp. x Baker', 'Aloe perfoliata var. vera L.', 'Aloe elsewhere L.'], kew: { ...kew, elsewhere: ['Aloe elsewhere L.'] } } };
    expect(olderKind('Aloe barbadensis Mill.', p)).toBe('direct');
    expect(olderKind('aloe Barbadensis', p)).toBe('citation');
    expect(olderKind('Aloe x nobilis Haw.', p)).toBe('citation');
    expect(olderKind('Aloe vera var. chinensis (Haw.) A.Berger', p)).toBe('descendant');
    expect(olderKind('Aloe barbadensis ssp. x Baker', p)).toBe('descendant');
    expect(olderKind('Aloe perfoliata var. vera L.', p)).toBe('other');
    expect(olderKind('Aloe barbadensis', { name: { scientific: 'Aloe vera' } })).toBe('unread');
    const r = olderKinds([p, { key: 'k2', name: { scientific: 'Aloe x', synonyms: ['Aloe y L.'] } }]);
    // The name Kew places only in another plant is not shown, so not counted.
    expect(r.counts).toEqual({ direct: 1, citation: 2, descendant: 2, other: 1, unread: 1 });
    expect(r.others).toEqual(['Aloe vera [k1]\tAloe perfoliata var. vera L.']);
    expect(olderKindsLine(r)).toMatch(/^2 pages, 7 shown older names: 1 one of Kew's names/);
  });
});

describe('C5: the country table', () => {
  it('the browse pages’ committed table is the shapes file’s, by the one rule', async () => {
    const { countryTableOf } = await import('$lib/browse/table-countries');
    const shapes = JSON.parse(readFileSync('scripts/tdwg3-shapes.json', 'utf8'));
    const levels = JSON.parse(readFileSync('src/lib/browse/tdwg-levels.json', 'utf8')) as { countries: Record<string, { own: string[]; main: string[]; also: string[] }> };
    const committed = Object.fromEntries(Object.entries(levels.countries).map(([k, c]) => [k, { own: c.own, main: c.main, also: c.also }]));
    expect(countryTableOf(shapes)).toEqual(committed);
    expect(countryTableOf({ countries: { CPP: ['ZA'], BOT: ['BW', 'ZA'] }, places: { BOT: ['A|BW', 'B|BW', 'C|ZA'] } })).toEqual({ BW: { own: [], main: ['BOT'], also: [] }, ZA: { own: ['CPP'], main: [], also: ['BOT'] } });
  });
});
