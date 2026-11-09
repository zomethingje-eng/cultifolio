/**
 * Round eighty-seven, stage 2 (links agent), item 3 and the citation of item 2: Kew's file read for each page's entry
 * (`kew-published.ts`): where the name was published, and a named hybrid's parents as Kew states them, matched by Kew's
 * exact words and ids to their pages here; the Parents section shows each parent's own habitat figures side by side,
 * read from its own dossier, never blended. The build carries all three fields (`links-carry.ts`). Each test fails on the
 * base, where none of it exists.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { fillKewPublished, formulaParts, partName, parentOf, kewPublishedLine, type KewRowLite } from '$dossier/kew-published';
import { carryLinks } from '$dossier/links-carry';
import { parentPage, parentKeys, parentRows, type ParentPage } from '$lib/ui/ref/links-words';
import type { PageId } from '$core/page-id';
import Parents from '$lib/ui/ref/Parents.svelte';

const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const row = (o: Record<string, string>) => H.split('|').map((k) => o[k] ?? '').join('|');
// Alnus × pubescens and its parents as Kew's file of 2026-06-04 holds them (the ids are Kew's), with a homonym of one
// parent's words by another author, held as a synonym of another plant, and a parent whose words name two accepted rows.
const FILE = [
  H,
  row({ plant_name_id: '6572', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Alnus', species_hybrid: '×', species: 'pubescens', taxon_name: 'Alnus × pubescens', place_of_publication: 'Fl. Ross. (Ledeb.)', volume_and_page: ' 3: 657', first_published: '(1851)', hybrid_formula: 'A. glutinosa × A. incana' }),
  row({ plant_name_id: '6449', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Alnus', species: 'glutinosa', taxon_name: 'Alnus glutinosa', place_of_publication: 'Ann. Bot. Fenn.', volume_and_page: ' 2: 1', first_published: '(1790)' }),
  row({ plant_name_id: '6450', taxon_rank: 'Species', taxon_status: 'Synonym', genus: 'Alnus', species: 'glutinosa', taxon_name: 'Alnus glutinosa', accepted_plant_name_id: '9999' }),
  row({ plant_name_id: '6501', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Alnus', species: 'incana', taxon_name: 'Alnus incana' }),
  row({ plant_name_id: '700', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Betula', species_hybrid: '×', species: 'x', taxon_name: 'Betula × x', hybrid_formula: 'B. nana × B. two × A. glutinosa × Betula' }),
  row({ plant_name_id: '701', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Betula', species: 'nana', taxon_name: 'Betula nana' }),
  row({ plant_name_id: '702', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Betula', species: 'two', taxon_name: 'Betula two' }),
  row({ plant_name_id: '703', taxon_rank: 'Species', taxon_status: 'Accepted', genus: 'Betula', species: 'two', taxon_name: 'Betula two' })
];
async function* lines() { for (const l of FILE) yield l; }
const memStore = (pages: Record<string, unknown>) => {
  const m = new Map(Object.entries(pages).map(([k, d]) => [k, structuredClone(d)]));
  return { m, files: () => [...m.keys()], read: <T,>(f: string) => structuredClone(m.get(f)) as T, write: (f: string, d: unknown) => void m.set(f, structuredClone(d)) };
};

describe("a hybrid's parents as Kew's formula states them, matched by Kew's exact words and ids", () => {
  it("writes out only the hybrid's own genus's initial, and names a genus or an unknown parent as that", () => {
    expect(formulaParts('A. glutinosa × A. incana')).toEqual(['A. glutinosa', 'A. incana']);
    expect(partName('A. glutinosa', 'Alnus')).toEqual({ name: 'Alnus glutinosa' });
    expect(partName('Astroloba corrugata', 'Astrolista')).toEqual({ name: 'Astroloba corrugata' });
    expect(partName('A. glutinosa', 'Betula').why).toMatch(/not the hybrid's own genus/);
    expect(partName('Betula', 'Betula').why).toBe('a genus, not one species');
    expect(partName('?', 'Haworthiopsis').why).toMatch(/not known to Kew/);
  });
  it('one plant taken; the one accepted row of words that also name another author\'s name, with how many; two accepted, none', () => {
    const rows: KewRowLite[] = FILE.slice(1).map((l) => { const c = l.split('|'); const h = H.split('|'); const r = Object.fromEntries(h.map((k, i) => [k, c[i]])); return { id: r.plant_name_id, name: r.taxon_name, genus: r.genus, status: r.taxon_status, accepted: r.accepted_plant_name_id, place: '', volPage: '', year: '', formula: r.hybrid_formula }; });
    const pageOf = (e: string) => (e === '6449' ? ('k6449' as PageId) : undefined);
    expect(parentOf('Alnus glutinosa', rows, pageOf)).toEqual({ name: 'Alnus glutinosa', row: '6449', entry: '6449', page: 'k6449', others: 1 });
    expect(parentOf('Alnus incana', rows, pageOf)).toEqual({ name: 'Alnus incana', row: '6501', entry: '6501' });
    expect(parentOf('Betula two', rows, pageOf).why).toMatch(/2 names of these words, for 2 plants, more than one of them accepted: none taken/);
    expect(parentOf('Betula three', rows, pageOf).why).toBe("Kew's file holds no name of exactly these words");
  });
  it('the step: the citation and the parents for each page\'s entry, twice the same; its line', async () => {
    const s = memStore({ 'k6572.json': { key: 'k6572', name: { scientific: 'Alnus pubescens' } }, 'k6449.json': { key: 'k6449', name: { scientific: 'Alnus glutinosa' } }, 'k700.json': { key: 'k700', name: { scientific: 'Betula x' } } });
    const pageOf = (e: string) => (['6572', '6449', '700'].includes(e) ? (`k${e}` as PageId) : undefined);
    const c = await fillKewPublished(s, lines, pageOf, '2026-06-04');
    expect(s.m.get('k6572.json')).toMatchObject({
      elsewhere: { published: { place: 'Fl. Ross. (Ledeb.)', volPage: ' 3: 657', year: '(1851)', row: '6572', file: '2026-06-04' } },
      parents: { formula: 'A. glutinosa × A. incana', row: '6572', file: '2026-06-04', of: [{ name: 'Alnus glutinosa', row: '6449', entry: '6449', page: 'k6449', others: 1 }, { name: 'Alnus incana', row: '6501', entry: '6501' }] }
    });
    expect((s.m.get('k6449.json') as { parents?: unknown }).parents).toBeUndefined();
    expect((s.m.get('k700.json') as { parents: { of: Array<{ name: string; why?: string }> } }).parents.of.map((p) => p.why ?? 'ok')).toEqual(['ok', expect.stringMatching(/none taken/), expect.stringMatching(/not the hybrid's own genus/), 'a genus, not one species']);
    expect(kewPublishedLine(c, '2026-06-04').split('\n')[0]).toBe("  Kew's file of 2026-06-04: 3 pages read, 3 Kew entries; 2 pages say where their name was published; 2 hybrids list 6 parents as Kew states them: 1 linked to their pages here, 2 Kew entries with no page here, 3 not matched (said why); 3 pages written:");
    const again = await fillKewPublished(s, lines, pageOf, '2026-06-04');
    expect(again.changed).toBe(0);
  });
  it('a BHL answer stays with its citation, and goes when Kew\'s citation changes', async () => {
    const s = memStore({ 'k6572.json': { key: 'k6572', name: { scientific: 'Alnus pubescens' }, elsewhere: { published: { place: 'Fl. Ross. (Ledeb.)', volPage: ' 3: 657', year: '(1851)', row: '6572', bhl: { page: 1, read: 'x' } } } }, 'k6449.json': { key: 'k6449', name: { scientific: 'Alnus glutinosa' }, elsewhere: { published: { place: 'Other', row: '6449', bhl: { page: 2, read: 'x' } } } } });
    await fillKewPublished(s, lines, () => undefined, '2026-06-04');
    expect((s.m.get('k6572.json') as { elsewhere: { published: { bhl?: unknown } } }).elsewhere.published.bhl).toEqual({ page: 1, read: 'x' });
    expect((s.m.get('k6449.json') as { elsewhere: { published: { bhl?: unknown; place: string } } }).elsewhere.published).toMatchObject({ place: 'Ann. Bot. Fenn.' });
    expect((s.m.get('k6449.json') as { elsewhere: { published: { bhl?: unknown } } }).elsewhere.published.bhl).toBeUndefined();
  });
});

describe('the build carries the fills\' fields, never another taxon\'s or item\'s', () => {
  it('flowering while the taxon is the same, the item\'s identifiers while the item is, Kew\'s fields as they were', () => {
    const prev = { ids: { inat: 5, wikidata: 'Q1' }, flowering: { taxon: 5, months: Array(12).fill(1), read: 'x' }, elsewhere: { wikidata: { item: 'Q1', read: 'x', ids: [] }, published: { place: 'P', row: '1' } }, parents: { formula: 'f', row: '1', of: [] } };
    const same = { ids: { inat: 5, wikidata: 'Q1' } } as never as Parameters<typeof carryLinks>[1];
    carryLinks(prev as never, same);
    expect(same).toMatchObject({ flowering: prev.flowering, elsewhere: prev.elsewhere, parents: prev.parents });
    const other = { ids: { inat: 6, wikidata: 'Q2' } } as never as Parameters<typeof carryLinks>[1];
    carryLinks(prev as never, other);
    expect(other.flowering).toBeUndefined();
    expect(other.elsewhere).toEqual({ published: prev.elsewhere.published });
  });
});

describe('the Parents section: each parent\'s own figures, side by side, each with its source', () => {
  const months = (lo: number, hi: number, mm: number) => Array.from({ length: 12 }, (_, i) => ({ tmin: lo + i, tmax: hi - i, tmean: 0, precipMm: mm }));
  const dossier = (key: string, name: string, lo: number, hi: number, extremes = true) => ({ key, slug: name.toLowerCase().replace(' ', '-'), name: { scientific: name }, upstream: { climate: { status: 'ok', at: '2026-11-01T10:00:00Z' } }, climate: { status: 'ok', records: 40, cells: 20, cell: 'c', at: { lat: 50, lon: 10 }, months: months(lo, hi, 50), p10: months(lo, hi, 50), p90: months(lo, hi, 50), annualRain: { p10: 1, p90: 2, p50: 640 }, ...(extremes ? { extremes: { years: 44, minAbs: -31.2, minP01: -20, maxP99: 30, frostDaysPerYear: 100, lapseAppliedM: 0 } } : {}), src: { normals: 'CHELSA V2.1 1981–2010 climatology, 0.05° cells', envelope: 'x', extremes: 'NASA POWER (MERRA-2) daily 1981–2024, cell 1_1, lapse-corrected 0 m' } } });
  it('reads the four figures from the parent\'s dossier, with its sources and day', () => {
    expect(parentPage(dossier('k6449', 'Alnus glutinosa', -6, 24) as never).figures).toEqual({ coldLow: -6, warmHigh: 24, rainMm: 640, rainCells: true, recordLow: -31.2, years: 44, normals: 'CHELSA V2.1 1981–2010', extremes: 'NASA POWER (MERRA-2) daily 1981–2024', day: '2026-11-01', few: false });
    expect(parentPage({ ...dossier('k1', 'X y', 0, 0), climate: { status: 'none' } } as never).figures.none).toBe('its page has no habitat climate');
  });
  it('the pages to read are the parents linked, once each', () => {
    expect(parentKeys({ formula: 'f', row: '1', of: [{ name: 'a', page: 'k1' }, { name: 'b' }, { name: 'c', page: 'k1' }] } as never)).toEqual(['k1']);
    expect(parentKeys(undefined)).toEqual([]);
  });
  it('a row per parent, its figures and sources, no "ancestry" figure, and why where there is none', () => {
    const parents = { formula: 'A. glutinosa × A. incana', row: '6572', file: '2026-06-04', of: [{ name: 'Alnus glutinosa', row: '6449', entry: '6449', page: 'k6449', others: 1 }, { name: 'Alnus incana', row: '6501', entry: '6501' }] } as never;
    const pages: Record<string, ParentPage> = { k6449: parentPage(dossier('k6449', 'Alnus glutinosa', -6, 24) as never) };
    expect(parentRows(parents, pages).map((r) => r.why)).toEqual([null, "Kew's entry 6501 has no page in this reference"]);
    const h = render(Parents, { props: { parents, pages, units: 'metric' } }).body.replace(/<!--[^]*?-->/g, '').replace(/\s+/g, ' ');
    expect(h).toContain("Kew's World Checklist gives this hybrid's parents as “A. glutinosa × A. incana”");
    expect(h).toContain('(WCVP, RBG Kew, file of 2026-06-04)');
    expect(h).toContain('href="/species/alnus-glutinosa"');
    expect(h).toContain('-6.0');
    expect(h).toContain('24.0');
    expect(h).toContain('-31.2');
    expect(h).toContain('in 44 years, NASA POWER (MERRA-2) daily 1981–2024');
    expect(h).toContain('CHELSA V2.1 1981–2010');
    expect(h).toContain("Kew's file holds 1 other name of these words, by other authors; the parent is the one Kew accepts.");
    expect(h).toContain("Kew's entry 6501 has no page in this reference");
    expect(h).toContain('not combined');
    expect(h).not.toMatch(/ancestr|average|blend/i);
    // A parent whose page could not be read just now says so, not that it has no page.
    expect(parentRows(parents, {})[0].why).toBe('not checked: its page could not be read just now'); // round eighty-seven, the integration: "not checked" (rule 2)
  });
});
