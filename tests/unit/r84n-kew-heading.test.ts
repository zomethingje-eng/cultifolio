/**
 * Round eighty-four (N): Kew's accepted name heads every `k` page (the owner's decision 1; review-d D3, D5, outside
 * review A6c).
 *
 * 1. A page whose id is `k<entry>` is headed by Kew's accepted name and authors for the entry (`headWithKew`); GBIF's name
 *    for the key, where it is other words, becomes an older name of the page, so the index lists it among the older names
 *    and its old address moves to the page; a GBIF name Kew's file holds under another plant does not (k3313620).
 * 2. A heading is never malformed: an author cut to its bracketed basionym author ("(Peckover) ") is not shown, and a
 *    name below species carries its rank word ("Conophytum calculus subsp. vanzylii"), on `g` pages too.
 * 3. The heading follows the id: `--fill kew-names` stores Kew's row and heads the page; the rekey heads a page that becomes
 *    `k<entry>` and gives GBIF's name back to one that does not; a build derives under GBIF's name and heads the page at its
 *    end. A second run of each changes nothing, byte for byte.
 * 4. A `k` page links its Kew entry's POWO and IPNI pages (D5): Mentha × suavis, which linked neither, and Hoodia alstonii,
 *    which linked IPNI's record of GBIF's name.
 * 5. Kew's row stored on every page moves no page's day (`substanceOf`).
 *
 * FAILS on r84base: `$dossier/kew-heading` does not exist; `fillKewNames` stores no `accepted` and never changes a heading
 * or a link; the rekey never changes a name. Checked by running this file on a checkout of r84base.
 */
import { describe, it, expect } from 'vitest';
import { headWithKew, unhead, gbifView, wholeAuthor, withRankWord, type Headed } from '$dossier/kew-heading';
import { fillKewNames, KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { rekey, type RekeyStore } from '$dossier/rekey';
import { olderNamesOf, type IndexEntry } from '$dossier/index-entry';
import { indexMaps } from '$dossier/lookups';
import { substanceHash } from '$dossier/changed';
import { slugify } from '$core/names';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const kew = (entry: string, accepted?: { name: string; authors: string; rank: string; other?: string }) => ({ entry, synonyms: [] as string[], acceptedElsewhere: [] as string[], file: '2026-06-04', ...(accepted ? { accepted } : {}) });

/** k506502 as the live corpus holds it (29 October 2026): GBIF's name, Kew's entry Hoodia alstonii. */
const alstonii = () => ({
  key: 'k506502',
  slug: 'ceropegia-alstonii',
  name: {
    scientific: 'Ceropegia alstonii',
    authorship: '(N.E.Br.) Bruyns',
    rank: 'SPECIES',
    status: 'accepted',
    family: 'Apocynaceae',
    genus: 'Ceropegia',
    synonyms: ['Trichocaulon alstonii N.E.Br.', 'Hoodia alstonii (N.E.Br.) Plowes'],
    vernacular: [] as Array<{ name: string; lang?: string }>,
    kew: kew('506502', { name: 'Hoodia alstonii', authors: '(N.E.Br.) Plowes', rank: 'Species' })
  }
});

describe('Kew heads a k page (decision 1)', () => {
  it("Kew's accepted name and authors head the page, GBIF's name is an older name, and the slug follows", () => {
    const d = alstonii();
    expect(headWithKew(d as Headed, 'k506502')).toBe(true);
    expect(d.name.scientific).toBe('Hoodia alstonii');
    expect(d.name.authorship).toBe('(N.E.Br.) Plowes');
    expect(d.name.genus).toBe('Hoodia');
    expect(d.slug).toBe('hoodia-alstonii');
    // GBIF's name with its author, once, after the record's own older names.
    expect(d.name.synonyms).toEqual(['Trichocaulon alstonii N.E.Br.', 'Hoodia alstonii (N.E.Br.) Plowes', 'Ceropegia alstonii (N.E.Br.) Bruyns']);
    expect((d.name as Headed['name']).gbif).toMatchObject({ scientific: 'Ceropegia alstonii', authorship: '(N.E.Br.) Bruyns', genus: 'Ceropegia', slug: 'ceropegia-alstonii', added: 'Ceropegia alstonii (N.E.Br.) Bruyns' });
    // The index's older names hold GBIF's name, and its old address moves to the page.
    const { syn } = olderNamesOf(d.name.scientific, d.name.synonyms);
    expect(syn).toContain('Ceropegia alstonii');
    const entry = { key: 'k506502', slug: d.slug, name: d.name.scientific, photos: 0, open: 0, climate: 'ok', syn } as IndexEntry;
    const m = indexMaps([entry, { key: 'k1', slug: 'hoodia-gordonii', name: 'Hoodia gordonii', photos: 0, open: 0, climate: 'ok' } as IndexEntry]);
    expect(m.bySynonym.get('ceropegia-alstonii')?.entry.key).toBe('k506502');
  });

  it('a second heading changes nothing, and taking it off gives GBIF back byte for byte', () => {
    const d = alstonii();
    const raw = JSON.stringify(d);
    headWithKew(d as Headed, 'k506502');
    const once = JSON.stringify(d);
    expect(headWithKew(d as Headed, 'k506502')).toBe(false);
    expect(JSON.stringify(d)).toBe(once);
    expect(unhead(d as Headed)).toBe(true);
    expect(JSON.stringify(d)).toBe(raw);
    // The derivation's view is GBIF's, without changing the page.
    headWithKew(d as Headed, 'k506502');
    const v = gbifView(d.name as Headed['name']);
    expect(v.scientific).toBe('Ceropegia alstonii');
    expect(v.synonyms).toEqual(['Trichocaulon alstonii N.E.Br.', 'Hoodia alstonii (N.E.Br.) Plowes']);
    expect(d.name.scientific).toBe('Hoodia alstonii');
  });

  it('only under its own k id: a g id, or another entry, gives GBIF its name back', () => {
    const d = alstonii();
    headWithKew(d as Headed, 'k506502');
    expect(headWithKew(d as Headed, 'g9269454')).toBe(true);
    expect(d.name.scientific).toBe('Ceropegia alstonii');
    expect(d.slug).toBe('ceropegia-alstonii');
    expect((d.name as Headed['name']).gbif).toBeUndefined();
    expect(headWithKew(alstonii() as Headed, 'k1')).toBe(false);
    // No row stored (a dossier before the fill): nothing changes.
    const bare = alstonii();
    delete (bare.name.kew as { accepted?: unknown }).accepted;
    expect(headWithKew(bare as Headed, 'k506502')).toBe(false);
  });

  it("a GBIF name Kew's file holds under another plant is not made an older name (k3313620)", () => {
    const d = { key: 'k3313620', slug: 'ceropegia-tanzaniensis', name: { scientific: 'Ceropegia tanzaniensis', authorship: '(Peckover) ', rank: 'SPECIES', synonyms: ['Brachystelma tanzaniensis Peckover'], kew: kew('3313620', { name: 'Ceropegia dodomaensis', authors: 'Heiduk & D.Styles', rank: 'Species', other: 'Ceropegia cordiloba' }) } };
    headWithKew(d as Headed, 'k3313620');
    expect(d.name.scientific).toBe('Ceropegia dodomaensis');
    expect(d.name.authorship).toBe('Heiduk & D.Styles');
    expect(d.name.synonyms).toEqual(['Brachystelma tanzaniensis Peckover']);
    expect(d.slug).toBe('ceropegia-dodomaensis');
  });

  it("an infraspecific entry is headed with its rank word, and Kew's sign is not stored (the page shows it)", () => {
    const d = { key: 'k2734813', slug: 'conophytum-calculus-vanzylii', name: { scientific: 'Conophytum calculus vanzylii', authorship: '(Lavis) S.A.Hammer', rank: 'SUBSPECIES', synonyms: ['Conophytum vanzylii Lavis'], kew: kew('2734813', { name: 'Conophytum calculus subsp. vanzylii', authors: '(Lavis) S.A.Hammer', rank: 'Subspecies' }) } };
    headWithKew(d as Headed, 'k2734813');
    expect(d.name.scientific).toBe('Conophytum calculus subsp. vanzylii');
    expect(d.slug).toBe('conophytum-calculus-subsp-vanzylii');
    // GBIF's three words are the same name: no older name is added.
    expect(d.name.synonyms).toEqual(['Conophytum vanzylii Lavis']);
    const h = { key: 'k2948609', slug: 'fragaria-ananassa', name: { scientific: 'Fragaria ananassa', authorship: 'Duchesne ex Rozier', rank: 'SPECIES', synonyms: [], kew: kew('2948609', { name: 'Fragaria × ananassa', authors: '(Duchesne ex Weston) Duchesne ex Rozier', rank: 'Species' }) } };
    headWithKew(h as Headed, 'k2948609');
    expect(h.name.scientific).toBe('Fragaria ananassa');
    expect(h.name.authorship).toBe('(Duchesne ex Weston) Duchesne ex Rozier');
    expect(h.name.synonyms).toEqual([]);
  });
});

describe('no malformed heading, on any page (decision 1, its last sentence)', () => {
  it('an author is whole: brackets closed, a combining author after a bracketed one, no trailing joiner', () => {
    for (const a of ['', 'L.', '(Haw.) Webb & Berthel.', '(Thunb.) ined.', 'Duchesne ex Rozier', '(Monv. ex Lem.) Miq. ex Lem.']) expect(wholeAuthor(a), a).toBe(true);
    for (const a of ['(Peckover) ', '(Peckover)', '(Haw. Webb', 'Haw.)', 'Webb &', 'Mart. ex']) expect(wholeAuthor(a), a).toBe(false);
  });
  it('a g page with an author cut short shows none, and a name below species its rank word', () => {
    const g = { key: 'g11309917', slug: 'ceropegia-tanzaniensis', name: { scientific: 'Ceropegia tanzaniensis', authorship: '(Peckover) ', rank: 'SPECIES', synonyms: [] as string[] } };
    expect(headWithKew(g as Headed, 'g11309917')).toBe(true);
    expect(g.name.authorship).toBeUndefined();
    expect(g.name.scientific).toBe('Ceropegia tanzaniensis');
    expect(withRankWord('Conophytum calculus vanzylii', 'SUBSPECIES')).toBe('Conophytum calculus subsp. vanzylii');
    expect(withRankWord('Stapelia hirsuta hirsuta', 'VARIETY')).toBe('Stapelia hirsuta var. hirsuta');
    expect(withRankWord('Lithops lesliei subsp. burchellii', 'SUBSPECIES')).toBe('Lithops lesliei subsp. burchellii');
    expect(withRankWord('Aloe vera', 'SPECIES')).toBe('Aloe vera');
  });
});

/** Kew's rows for the fill, as `scripts/kew-names-load.ts` reads them. */
const row = (id: string, name: string, authors: string, status: string, accepted: string, powo: string, rank = 'Species', ipni?: string): KewRow => ({ id, name, authors, status, rank, accepted, parent: '', powo, ...(ipni ? { ipni } : {}) });
function store(docs: Record<string, unknown>) {
  const files = new Map(Object.entries(docs).map(([k, v]) => [`${k}.json`, JSON.stringify(v)]));
  return {
    files: () => [...files.keys()],
    read: <T>(f: string) => JSON.parse(files.get(f)!) as T,
    write: (f: string, d: unknown) => void files.set(f, JSON.stringify(d)),
    remove: (f: string) => void files.delete(f),
    raw: (f: string) => files.get(f)!
  };
}

describe('--fill kew-names stores Kew\'s row, heads the page and links the entry (decision 1, D5)', () => {
  const idx = () => {
    const i = new KewNamesIndex();
    i.add(row('506502', 'Hoodia alstonii', '(N.E.Br.) Plowes', 'Accepted', '506502', '964729-1'));
    i.add(row('3412', 'Ceropegia alstonii', '(N.E.Br.) Bruyns', 'Synonym', '506502', '77166268-1'));
    i.add(row('125451', 'Mentha × suavis', 'Guss.', 'Accepted', '125451', '451192-1'));
    return i;
  };
  const pages = () => ({
    k506502: { key: 'k506502', slug: 'ceropegia-alstonii', name: { scientific: 'Ceropegia alstonii', authorship: '(N.E.Br.) Bruyns', rank: 'SPECIES', synonyms: ['Trichocaulon alstonii N.E.Br.'], vernacular: [] }, ids: { gbif: 9269454, powo: 'urn:lsid:ipni.org:names:77166268-1', ipni: '77166268-1' }, links: { gbif: 'https://www.gbif.org/species/9269454', powo: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77166268-1', ipni: 'https://www.ipni.org/n/77166268-1', wikidata: 'https://www.wikidata.org/wiki/Q42559312' }, upstream: {} },
    k125451: { key: 'k125451', slug: 'mentha-suavis', name: { scientific: 'Mentha suavis', authorship: 'Guss.', rank: 'SPECIES', synonyms: [], vernacular: [] }, ids: { gbif: 7858518, wikidata: 'Q133674340' }, links: { gbif: 'https://www.gbif.org/species/7858518', wikidata: 'https://www.wikidata.org/wiki/Q133674340' }, upstream: {} }
  });

  it('heads the stapeliad by Hoodia, links Kew\'s entry, says so in the record, and a second run changes nothing', () => {
    const s = store(pages());
    const c = fillKewNames(s, idx(), '2026-06-04');
    expect(c.changed).toBe(2);
    const d = s.read<ReturnType<typeof pages>['k506502'] & { name: Headed['name'] & { kew: { accepted: unknown } }; upstream: Record<string, { status: string; detail?: string }> }>('k506502.json');
    expect(d.name.scientific).toBe('Hoodia alstonii');
    expect(d.slug).toBe('hoodia-alstonii');
    expect(d.name.kew.accepted).toEqual({ name: 'Hoodia alstonii', authors: '(N.E.Br.) Plowes', rank: 'Species' });
    expect(d.name.synonyms).toContain('Ceropegia alstonii (N.E.Br.) Bruyns');
    expect(d.ids).toMatchObject({ powo: 'urn:lsid:ipni.org:names:964729-1', ipni: '964729-1' });
    expect(Object.keys(d.links)).toEqual(['gbif', 'powo', 'ipni', 'wikidata']);
    expect(d.upstream['kew.names'].detail).toMatch(/^this page is Kew's entry 506502, Hoodia alstonii \(N\.E\.Br\.\) Plowes, Kew's accepted name, which heads it; GBIF names its key Ceropegia alstonii \(N\.E\.Br\.\) Bruyns, an older name of the page here$/);
    const bytes = s.files().map((f) => s.raw(f));
    expect(fillKewNames(s, idx(), '2026-06-04').changed).toBe(0);
    expect(s.files().map((f) => s.raw(f))).toEqual(bytes);
  });

  it('a hybrid that linked neither POWO nor IPNI links its Kew entry; its stored name keeps no sign (D5)', () => {
    const s = store(pages());
    fillKewNames(s, idx(), '2026-06-04');
    const m = s.read<{ name: { scientific: string }; ids: Record<string, unknown>; links: Record<string, string> }>('k125451.json');
    expect(m.name.scientific).toBe('Mentha suavis');
    expect(m.ids).toMatchObject({ powo: 'urn:lsid:ipni.org:names:451192-1', ipni: '451192-1' });
    expect(Object.keys(m.links)).toEqual(['gbif', 'powo', 'ipni', 'wikidata']);
  });

  it("Kew's stored row moves no page's day", () => {
    const before = pages().k125451;
    const s = store(pages());
    fillKewNames(s, idx(), '2026-06-04');
    const after = s.read<typeof before & { name: { kew?: unknown } }>('k125451.json');
    const k = clone(after);
    const noLinks = { ...clone(after), ids: before.ids, links: before.links } as typeof after;
    delete (noLinks.name as { kew?: unknown }).kew;
    expect(substanceHash(noLinks)).toBe(substanceHash(before));
    expect(substanceHash(k)).toBe(substanceHash({ ...k, name: { ...k.name, kew: { ...(k.name.kew as object), accepted: { name: 'X y', authors: '', rank: 'Species' } } } }));
  });
});

describe('the rekey heads a page by the id it gives (decision 1)', () => {
  it('a page given k<entry> is headed; a page two pages share the entry of keeps GBIF\'s name', () => {
    const page = (gbif: number, name: string, entry: string, acc: string) => ({ v: 3, key: `g${gbif}`, slug: slugify(name), ids: { gbif }, name: { scientific: name, authorship: 'A.', rank: 'SPECIES', synonyms: [], kew: kew(entry, { name: acc, authors: 'B.', rank: 'Species' }) }, photos: [] });
    const s = store({ g1: page(1, 'Agave maculata', '281400', 'Manfreda maculosa'), g2: page(2, 'Agave alpha', '777', 'Manfreda alpha'), g3: page(3, 'Agave beta', '777', 'Manfreda alpha') });
    const r = rekey({ to: s as unknown as RekeyStore });
    expect(r.kew).toBe(1);
    const k = s.read<{ slug: string; name: { scientific: string; synonyms: string[] } }>('k281400.json');
    expect(k.name.scientific).toBe('Manfreda maculosa');
    expect(k.slug).toBe('manfreda-maculosa');
    expect(k.name.synonyms).toEqual(['Agave maculata A.']);
    // The shared entry decides no page's id, so neither is headed by it.
    expect(s.read<{ name: { scientific: string } }>('g2.json').name.scientific).toBe('Agave alpha');
    expect(s.read<{ name: { scientific: string } }>('g3.json').name.scientific).toBe('Agave beta');
    const bytes = s.files().map((f) => s.raw(f));
    const again = rekey({ to: s as unknown as RekeyStore });
    expect(again.renamed + again.followed).toBe(0);
    expect(s.files().map((f) => s.raw(f))).toEqual(bytes);
  });
});

describe('a build derives under GBIF\'s name and heads the page at its end (decision 2: one pass is enough)', () => {
  it("a carried taxon headed by Kew is derived as GBIF's and headed again, the same bytes", async () => {
    const table = copiapoa();
    const opts = { fetcher: fixtureFetcher(table), builtBy: 'node' as const, quick: true, now: () => new Date('2026-10-30T12:00:00Z') };
    const first = await buildDossier('Copiapoa cinerea', opts);
    if (!first.ok) throw new Error(first.reason);
    const prev = clone(first.dossier);
    const key = prev.ids.gbif!;
    prev.name.kew = { ...kew('2735888', { name: 'Copiapoa cinereoides', authors: 'Kew', rank: 'Species' }) };
    headWithKew(prev as unknown as Headed, 'k2735888');
    expect(prev.name.scientific).toBe('Copiapoa cinereoides');
    const again = await buildDossier(key, { ...opts, pageIdOf: () => 'k2735888', taxon: { key, name: prev.name, accepted: prev.upstream['gbif.accepted'], builtOn: prev.built } });
    if (!again.ok) throw new Error(again.reason);
    expect(again.dossier.name.scientific).toBe('Copiapoa cinereoides');
    expect(again.dossier.slug).toBe('copiapoa-cinereoides');
    expect(again.dossier.name.synonyms.filter((s) => s.startsWith('Copiapoa cinerea '))).toEqual(['Copiapoa cinerea (Phil.) Britton & Rose']);
    expect(again.dossier.name.gbif).toEqual(prev.name.gbif);
    // Under a g id the same carried taxon is GBIF's name again.
    const g = await buildDossier(key, { ...opts, taxon: { key, name: prev.name, accepted: prev.upstream['gbif.accepted'], builtOn: prev.built } });
    if (!g.ok) throw new Error(g.reason);
    expect(g.dossier.name.scientific).toBe('Copiapoa cinerea');
    expect(g.dossier.name.gbif).toBeUndefined();
  });
});

describe('the Worker over the live corpus: a hybrid that links IPNI alone links POWO too (D5, step 1)', () => {
  it('Aesculus × woerlitzensis and Rhododendron × sochadzeae, as the live dossiers hold them (29 October 2026)', async () => {
    const { withKewLinks } = await import('$core/hybrids');
    for (const [key, ipni] of [['k2624603', '430902-1'], ['k2427157', '333372-1']] as const) {
      const w = withKewLinks(key, { gbif: 1, ipni }, { gbif: 'https://www.gbif.org/species/1', ipni: `https://www.ipni.org/n/${ipni}`, wikidata: 'https://www.wikidata.org/wiki/Q1' });
      expect(w.kew).toBe(true);
      expect(w.links.powo).toBe(`https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${ipni}`);
      expect(Object.keys(w.links)).toEqual(['gbif', 'powo', 'ipni', 'wikidata']);
    }
  });
});
