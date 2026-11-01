/**
 * Round eighty-five (N): Kew is the authority for names everywhere (the owner's decision 6; review-d D1, D5, D6, D7,
 * outside review A9a, A9b, A11, A23).
 *
 * 1. A name Kew's file accepts, or files under another accepted taxon, is not a name of a page it does not lead to
 *    (`kewPlace`, `name.kew.elsewhere`, `keptNames`): "Echinopsis pachanoi" and "Trichocereus pachanoi" leave Echinopsis
 *    macrogona; "Dypsis lutescens" leaves Hyophorbe indica; "Aloe vera Mill." stays on Aloe succotrina by its author.
 * 2. The names GBIF files under a species' varieties are held only as binomials (A11): "Trichocereus pachanoi f.
 *    peruvianus" no longer hides "Trichocereus pachanoi".
 * 3. A species is headed by its species entry (D7, A9b): Stapelia hirsuta var. hirsuta is Stapelia hirsuta's page; and
 *    the parent species is never an older name of its own subspecies (Conophytum calculus subsp. vanzylii).
 * 4. A g page whose range note names a Kew entry by a spelling reads that entry (D6): Tylecodon cacaliodes is Kew's T.
 *    cacalioides.
 * 5. Kew's family heads a k page (A9a), GBIF's given back with GBIF's name; a misread genus is the name's (D13).
 * 6. A page no longer headed by Kew's name is said (A23); the former heading stays an address (D5).
 * 7. The build asks by Kew's name first (D3): `kewHeadingOf`, `renamedLines`.
 *
 * FAILS on r85base: `kewPlace`, `plantOf` of kew-names, `speciesEntry`, `viaEntry`, `keptNames`, `formerHeadings`,
 * `kewHeadingOf` and `renamedLines` do not exist there; `InfraNames.of` drops "Trichocereus pachanoi"; `kewNames` lists
 * Conophytum calculus among its subspecies' names; `headWithKew` keeps GBIF's family. Checked by running this file on
 * a checkout of r85base (every test fails at its import).
 */
import { describe, it, expect } from 'vitest';
import { KewNamesIndex, kewNames, kewPlace, plantOf, speciesEntry, nameWithAuthor, fillKewNames, type KewRow } from '$dossier/kew-names';
import { headWithKew, kewHeadingOf, renamedLines, formerHeadings, kewAskedWords, type Headed } from '$dossier/kew-heading';
import { InfraNames } from '$dossier/infra-names';
import { keptNames } from '$dossier/index-entry';

const row = (id: string, name: string, authors: string, status: string, accepted: string, rank = 'Species', parent = '', family = 'Cactaceae'): KewRow => ({ id, name, authors, status, rank, accepted, parent, powo: '', family });
/** Kew's own rows of 2026-06-04 for the names these tests read (wcvp_names.csv). */
const ROWS: KewRow[] = [
  row('2783547', 'Echinopsis pachanoi', '(Britton & Rose) H.Friedrich & G.D.Rowley', 'Accepted', '2783547'),
  row('2432509', 'Trichocereus pachanoi', 'Britton & Rose', 'Synonym', '2783547'),
  row('2783497', 'Echinopsis macrogona', '(Salm-Dyck) H.Friedrich & G.D.Rowley', 'Accepted', '2783497'),
  row('9000001', 'Trichocereus peruvianus', 'Britton & Rose', 'Synonym', '2783497'),
  row('298116', 'Aloe vera', '(L.) Burm.f.', 'Accepted', '298116', 'Species', '', 'Asphodelaceae'),
  row('298117', 'Aloe vera', 'Mill.', 'Illegitimate', '298036', 'Species', '', 'Asphodelaceae'),
  row('298036', 'Aloe succotrina', 'Weston', 'Accepted', '298036', 'Species', '', 'Asphodelaceae'),
  row('65478', 'Dypsis lutescens', '(H.Wendl.) Beentje & J.Dransf.', 'Synonym', '39866', 'Species', '', 'Arecaceae'),
  row('39866', 'Chrysalidocarpus lutescens', 'H.Wendl.', 'Accepted', '39866', 'Species', '', 'Arecaceae'),
  row('101290', 'Hyophorbe indica', 'Gaertn.', 'Accepted', '101290', 'Species', '', 'Arecaceae'),
  row('512033', 'Stapelia hirsuta', 'L.', 'Accepted', '512033', 'Species', '', 'Apocynaceae'),
  row('512041', 'Stapelia hirsuta var. hirsuta', '', 'Accepted', '512041', 'Variety', '512033', 'Apocynaceae'),
  row('512050', 'Ceropegia pulvinata', '(Masson) Bruyns', 'Synonym', '512041', 'Species', '', 'Apocynaceae'),
  row('2734812', 'Conophytum calculus', '(A.Berger) N.E.Br.', 'Accepted', '2734812', 'Species', '', 'Aizoaceae'),
  row('2734813', 'Conophytum calculus subsp. vanzylii', '(Lavis) S.A.Hammer', 'Accepted', '2734813', 'Subspecies', '2734812', 'Aizoaceae'),
  row('2734900', 'Conophytum vanzylii', 'Lavis', 'Synonym', '2734813', 'Species', '', 'Aizoaceae'),
  row('2734901', 'Conophytum calculus subsp. calculus', '', 'Accepted', '2734901', 'Subspecies', '2734812', 'Aizoaceae'),
  row('2434528', 'Tylecodon cacalioides', '(L.f.) Toelken', 'Accepted', '2434528', 'Species', '', 'Crassulaceae'),
  row('2434529', 'Cotyledon cacalioides', 'L.f.', 'Synonym', '2434528', 'Species', '', 'Crassulaceae'),
  row('2589000', 'Talinum aurantiacum', 'Engelm.', 'Accepted', '2589000', 'Species', '', 'Talinaceae')
];
const index = () => { const i = new KewNamesIndex(); for (const r of ROWS) i.add(r); return i; };
const page = (key: string | number, scientific: string, authorship: string, synonyms: string[], extra: Record<string, unknown> = {}) => ({ key, slug: scientific.toLowerCase().replace(/ /g, '-'), name: { scientific, authorship, rank: 'SPECIES', synonyms, vernacular: [], ...extra }, ids: {}, ...('distribution' in extra ? { distribution: extra.distribution } : {}) });

describe("where Kew's file places a name (decision 6, D1)", () => {
  it("Kew's San Pedro and its synonym are not Echinopsis macrogona's names; its own synonyms are", () => {
    const idx = index();
    const plant = plantOf('2783497', idx);
    expect(kewPlace('Echinopsis pachanoi', plant, idx)).toBe('elsewhere');
    expect(kewPlace('Trichocereus pachanoi Britton & Rose', plant, idx)).toBe('elsewhere');
    expect(kewPlace('Trichocereus peruvianus Britton & Rose', plant, idx)).toBe('here');
    expect(kewPlace('Trichocereus macrogonus var. nonexistent', plant, idx)).toBe('unread');
    const k = kewNames(page(3952140, 'Trichocereus macrogonus', '(Salm-Dyck) Riccob.', ['Trichocereus peruvianus Britton & Rose', 'Trichocereus pachanoi Britton & Rose'], { infra: ['Echinopsis pachanoi', 'Cereus pachanoi'] }) as never, idx, '2026-06-04');
    expect(k.entry).toBe('');
    // Read through its linked number as the corpus does: Kew's entry 2783497.
    const linked = kewNames({ ...page(3952140, 'Echinopsis macrogona', '(Salm-Dyck) H.Friedrich & G.D.Rowley', ['Trichocereus peruvianus Britton & Rose', 'Trichocereus pachanoi Britton & Rose'], { infra: ['Echinopsis pachanoi', 'Cereus pachanoi'] }) } as never, idx, '2026-06-04');
    expect(linked.entry).toBe('2783497');
    expect(linked.elsewhere).toEqual(['Trichocereus pachanoi Britton & Rose', 'Echinopsis pachanoi']);
    // The index keeps the rest: the infra name Kew holds no row of stays, GBIF's to file.
    const kept = keptNames({ synonyms: ['Trichocereus peruvianus Britton & Rose', 'Trichocereus pachanoi Britton & Rose'], infra: ['Echinopsis pachanoi', 'Cereus pachanoi'], kew: { elsewhere: linked.elsewhere } });
    expect(kept.own).toEqual(['Trichocereus peruvianus Britton & Rose']);
    expect(kept.infra).toEqual(['Cereus pachanoi']);
  });
  it('Dypsis lutescens is Chrysalidocarpus lutescens alone; Aloe vera Mill. is Aloe succotrina by its author', () => {
    const idx = index();
    expect(kewPlace('Dypsis lutescens (H.Wendl.) Beentje & J.Dransf.', plantOf('101290', idx), idx)).toBe('elsewhere');
    expect(kewPlace('Dypsis lutescens (H.Wendl.) Beentje & J.Dransf.', plantOf('39866', idx), idx)).toBe('here');
    expect(kewPlace('Aloe vera Mill.', plantOf('298036', idx), idx)).toBe('here');
    expect(kewPlace('Aloe vera', plantOf('298036', idx), idx)).toBe('here');
    expect(kewPlace('Aloe vera (L.) Burm.f.', plantOf('298036', idx), idx)).toBe('elsewhere');
    // A page Kew gives no entry is judged by nothing.
    expect(kewPlace('Aloe vera', new Set(), idx)).toBe('unread');
  });
  it('reads names below species with their rank word, and no hybrid formula as a name', () => {
    expect(nameWithAuthor('Trichocereus pachanoi f. peruvianus (Britton & Rose) F.Ritter')).toEqual({ name: 'Trichocereus pachanoi f. peruvianus', author: '(Britton & Rose) F.Ritter', infra: true });
    expect(nameWithAuthor('Echinopsis peruviana ssp. puquiensis Ostolaza')?.name).toBe('Echinopsis peruviana subsp. puquiensis');
    expect(nameWithAuthor('Mentha aquatica x spicata')).toBeNull();
    expect(nameWithAuthor('Mentha xpiperita L.')).toEqual({ name: 'Mentha piperita', author: 'L.', infra: false });
  });
});

describe("the names GBIF files under a species' varieties (A11)", () => {
  it('a name below species does not hide its binomial', () => {
    const n = new InfraNames(new Set([3952140]));
    n.first({ key: 1, parent: 3952140, synonym: false, rank: 'VARIETY', canonical: 'Trichocereus macrogonus pachanoi' });
    n.second({ key: 2, parent: 1, synonym: true, rank: 'SPECIES', canonical: 'Trichocereus pachanoi' });
    n.second({ key: 3, parent: 1, synonym: true, rank: 'SPECIES', canonical: 'Echinopsis pachanoi' });
    expect(n.of(3952140, { scientific: 'Trichocereus macrogonus', synonyms: ['Trichocereus pachanoi f. peruvianus (Britton & Rose) F.Ritter'] })).toEqual(['Echinopsis pachanoi', 'Trichocereus pachanoi']);
    // A binomial the record holds is held, as before.
    expect(n.of(3952140, { scientific: 'Trichocereus macrogonus', synonyms: ['Echinopsis pachanoi (Britton & Rose) H.Friedrich & G.D.Rowley'] })).toEqual(['Trichocereus pachanoi']);
  });
});

describe('a species is headed by its species entry (D7, A9b); a subspecies has no parent among its names', () => {
  it("an autonym's entry is its species'", () => {
    const idx = index();
    expect(speciesEntry('512041', idx)).toBe('512033');
    expect(speciesEntry('2734813', idx)).toBe('2734813');
    const k = kewNames({ ...page('k512041', 'Ceropegia pulvinata', '(Masson) Bruyns', []), ids: { powo: null, ipni: null } } as never, idx, '2026-06-04');
    expect(k.entry).toBe('512033');
    expect(k.accepted?.name).toBe('Stapelia hirsuta');
    // GBIF's name, filed under the autonym, is the species' own older name, not another plant's.
    expect(k.accepted?.other).toBeUndefined();
  });
  it("Conophytum calculus is not an older name of its subspecies vanzylii; the subspecies' own synonym is", () => {
    const idx = index();
    const k = kewNames({ ...page('k2734813', 'Conophytum calculus vanzylii', '(Lavis) S.A.Hammer', []), name: { ...page('k2734813', 'Conophytum calculus vanzylii', '(Lavis) S.A.Hammer', []).name, rank: 'SUBSPECIES' } } as never, idx, '2026-06-04');
    expect(k.entry).toBe('');
    const plant = plantOf('2734813', idx);
    expect([...plant]).toEqual(['2734813']);
    expect(kewPlace('Conophytum calculus', plant, idx)).toBe('elsewhere');
    expect(kewPlace('Conophytum vanzylii Lavis', plant, idx)).toBe('here');
    // An autonym's plant is its species with every accepted part.
    expect([...plantOf('2734901', idx)].sort()).toEqual(['2734812', '2734813', '2734901']);
  });
});

describe("a g page reads the Kew entry its range note names (D6)", () => {
  it('Tylecodon cacaliodes is Kew\'s Tylecodon cacalioides', () => {
    const idx = index();
    const k = kewNames(page(7876017, 'Tylecodon cacaliodes', '(L.fil.) Toelken', ['Cotyledon cacalioides L.f.'], { distribution: { via: { kind: 'spelling', entry: 'Tylecodon cacalioides (L.f.) Toelken', name: 'Tylecodon cacalioides' } } }) as never, idx, '2026-06-04');
    expect(k.entry).toBe('2434528');
    expect(k.elsewhere).toBeUndefined();
    // Any other kind of note names no entry.
    expect(kewNames(page(7876017, 'Tylecodon cacaliodes', '(L.fil.) Toelken', [], { distribution: { via: { kind: 'older-name', entry: 'Tylecodon cacalioides (L.f.) Toelken', name: 'Tylecodon cacalioides' } } }) as never, idx, '2026-06-04').entry).toBe('');
  });
});

describe("Kew's family, the name's genus, former headings and the un-heading said (A9a, D13, D5, A23)", () => {
  const talinum = () => ({ key: 'k2589000', slug: 'talinum-aurantiacum', name: { scientific: 'Talinum aurantiacum', authorship: 'Engelm.', rank: 'SPECIES', family: 'Montiaceae', genus: 'Talinum', synonyms: [] as string[], kew: { entry: '2589000', accepted: { name: 'Talinum aurantiacum', authors: 'Engelm.', rank: 'Species', family: 'Talinaceae' } } } });
  it("Kew's family heads the page and GBIF's comes back with GBIF's name", () => {
    const d = talinum();
    expect(headWithKew(d as unknown as Headed, 'k2589000')).toBe(true);
    expect(d.name.family).toBe('Talinaceae');
    expect((d.name as { gbif?: { family?: string } }).gbif?.family).toBe('Montiaceae');
    // Under another id GBIF's name and family come back, and a second heading changes nothing.
    expect(headWithKew(d as unknown as Headed, 'g1')).toBe(true);
    expect(d.name.family).toBe('Montiaceae');
    const again = talinum();
    headWithKew(again as unknown as Headed, 'k2589000');
    const before = JSON.stringify(again);
    expect(headWithKew(again as unknown as Headed, 'k2589000')).toBe(false);
    expect(JSON.stringify(again)).toBe(before);
  });
  it("a genus read as the author is the name's own", () => {
    const d = { key: 'k2409103', slug: 'hereroa-incurva', name: { scientific: 'Hereroa incurva', authorship: 'L.Bolus', rank: 'SPECIES', status: 'accepted', genus: 'Schwantes', synonyms: [] as string[], vernacular: [] }, ids: {} };
    const files = new Map([['k2409103.json', d as unknown]]);
    fillKewNames({ files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f, x) => { files.set(f, x); } }, index(), '2026-06-04');
    expect((files.get('k2409103.json') as typeof d).name.genus).toBe('Hereroa');
  });
  it('a heading the page loses is kept as a former heading, whose address the index keeps', () => {
    // k512041 as the live corpus holds it: headed by Kew's autonym, GBIF's name Ceropegia pulvinata.
    const d = { key: 'k512041', slug: 'stapelia-hirsuta-var-hirsuta', name: { scientific: 'Stapelia hirsuta var. hirsuta', rank: 'VARIETY', genus: 'Stapelia', synonyms: [] as string[], vernacular: [], gbif: { scientific: 'Ceropegia pulvinata', authorship: '(Masson) Bruyns', rank: 'SPECIES', genus: 'Ceropegia', slug: 'ceropegia-pulvinata' }, kew: { entry: '512041', synonyms: [], acceptedElsewhere: [], file: '2026-06-04', accepted: { name: 'Stapelia hirsuta var. hirsuta', authors: '', rank: 'Variety' } } }, ids: {} };
    const files = new Map([['k512041.json', d as unknown]]);
    const c = fillKewNames({ files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f, x) => { files.set(f, x); } }, index(), '2026-06-04');
    const after = files.get('k512041.json') as typeof d & { name: { formerly?: string[] } };
    // Kew's entry is now the species'; until the index gives the page its id, GBIF's name heads it, and that is said.
    expect(after.name.kew.entry).toBe('512033');
    expect(after.name.formerly).toEqual(['Stapelia hirsuta var. hirsuta']);
    expect(c.unheaded).toBe(1);
    // The rekey gives it the species' id, and Kew's name heads it; the former heading stays.
    headWithKew(after as unknown as Headed, 'k512033');
    expect(after.name.scientific).toBe('Stapelia hirsuta');
    expect(formerHeadings(after as never)).toEqual({ here: ['Ceropegia pulvinata', 'Stapelia hirsuta var. hirsuta'], away: [] });
  });
  it("GBIF's heading of a key Kew holds for another plant goes to that plant (ceropegia-tanzaniensis)", () => {
    expect(formerHeadings({ slug: 'ceropegia-dodomaensis', name: { scientific: 'Ceropegia dodomaensis', gbif: { scientific: 'Ceropegia tanzaniensis' }, kew: { accepted: { other: 'Ceropegia cordiloba' } } } })).toEqual({ here: [], away: ['Ceropegia tanzaniensis'] });
    // GBIF's name that differs only by the rank word is an address too (conophytum-calculus-vanzylii).
    expect(formerHeadings({ slug: 'conophytum-calculus-subsp-vanzylii', name: { scientific: 'Conophytum calculus subsp. vanzylii', gbif: { scientific: 'Conophytum calculus vanzylii' } } }).here).toEqual(['Conophytum calculus vanzylii']);
  });
  it('a page Kew headed and no longer heads is said by the fill', () => {
    const idx = new KewNamesIndex();
    const d = { key: 'k2589000', slug: 'talinum-aurantiacum', name: { scientific: 'Talinum aurantiacum', authorship: 'Engelm.', rank: 'SPECIES', family: 'Talinaceae', genus: 'Talinum', synonyms: [] as string[], vernacular: [], gbif: { scientific: 'Talinum aurantiacum', authorship: 'Engelm.', family: 'Montiaceae' }, kew: { entry: '2589000', synonyms: [], acceptedElsewhere: [], file: '2026-06-04', accepted: { name: 'Talinum aurantiacum', authors: 'Engelm.', rank: 'Species', family: 'Talinaceae' } } }, ids: {} };
    const files = new Map([['k2589000.json', d]]);
    const c = fillKewNames({ files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f, x) => { files.set(f, x as typeof d); } }, idx, '2026-06-04');
    expect(c.unheaded).toBe(1);
    expect(c.unheadedLines?.[0]).toMatch(/no longer headed by Kew's name/);
  });
});

describe("the build asks by Kew's name (D3)", () => {
  it("gives Kew's heading of a k page and lists the pages not yet asked so", () => {
    const d = { key: 'k506502', ids: { gbif: 9269454 }, name: { scientific: 'Hoodia alstonii', authorship: '(N.E.Br.) Plowes', gbif: { scientific: 'Ceropegia alstonii', authorship: '(N.E.Br.) Bruyns' }, kew: { entry: '506502', accepted: { name: 'Hoodia alstonii', authors: '(N.E.Br.) Plowes', rank: 'Species', family: 'Apocynaceae' } } }, upstream: {} as Record<string, { detail?: string }> };
    expect(kewHeadingOf(d)).toEqual({ scientific: 'Hoodia alstonii', authorship: '(N.E.Br.) Plowes', family: 'Apocynaceae' });
    expect(kewHeadingOf({ ...d, key: 'g9269454' })).toBeUndefined();
    expect(renamedLines([d])).toEqual({ lines: ['9269454\tHoodia alstonii (GBIF: Ceropegia alstonii)'], done: 0 });
    d.upstream.wikipedia = { detail: kewAskedWords('Hoodia alstonii', 'Ceropegia alstonii') };
    expect(renamedLines([d])).toEqual({ lines: [], done: 1 });
  });
});
