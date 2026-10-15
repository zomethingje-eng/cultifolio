/**
 * Round 71, B (self-review 70): Kew's own wcvp_names.csv (2026-06-04) files a synonym or invalid name under the family of its own
 * genus, not of its accepted entry. GBIF's copy of WCVP (which the r70c test copied) gives the accepted entry's family.
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, parseWcvpName, parseWcvpDist } from '$dossier/bulk';

const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const D = 'plant_name_id|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
// Verbatim from Kew's wcvp_names.csv, June 2026.
const IXORA = [
  '103357|77242561-1|Species|Illegitimate|Rubiaceae||Ixora||coccinea||||Curtis||Bot. Mag.| 5: t. 169|(1791)|, nom. illeg. homonym. post.||||Ixora coccinea|Curtis|103348|||||77242561-1||Y',
  '103356|753844-1|Species|Accepted|Rubiaceae||Ixora||coccinea||||L.||Sp. Pl.|: 110|(1753)||W. & S. India, Sri Lanka, Bangladesh to Indo-China|shrub|wet tropical|Ixora coccinea|L.|103356||||103177|753844-1||Y',
  '103355|753843-1|Species|Invalid|Rubiaceae||Ixora||coccinea||||Comm. ex Lam.||Encycl.| 2: 355|(1786)|, not validly publ.||||Ixora coccinea|Comm. ex Lam.|2788267|||||753843-1||Y',
  '2788267|703489-1|Species|Accepted|Proteaceae||Embothrium||coccineum||||J.R.Forst. & G.Forst.||Char. Gen. Pl., ed. 2.|: 16|(1776)||C. & S. Chile to S. Argentina|shrub or tree|temperate|Embothrium coccineum|J.R.Forst. & G.Forst.|2788267||||2788257|703489-1||N'
];
describe('Kew\'s real rows: Ixora coccinea', () => {
  it('the range is Ixora coccinea L.\'s, not Embothrium coccineum\'s', () => {
    const w = new WcvpIndex();
    for (const l of IXORA) w.addName(parseWcvpName(H, l), (n) => /^(Ixora|Embothrium) /.test(n));
    w.addDist(parseWcvpDist(D, '2788267|CLS|Chile South|0|0|0'));
    w.addDist(parseWcvpDist(D, '103356|IND|India|0|0|0'));
    const got = w.distributions('Ixora coccinea', 'Comm. ex Lam.', 'Rubiaceae');
    expect(got && got !== 'ambiguous' && got.rows.map((r) => r.locality)).toEqual(['India']);
    expect(got && got !== 'ambiguous' && got.kew).toEqual({ lifeform: 'shrub', climate: 'wet tropical' });
  });
});

const FRAGARIA = [
  '3265893|77231464-1|Subspecies|Accepted|Rosaceae||Fragaria||virginiana|subsp.|virginiana||||Unknown||||E. Canada to N. & E. U.S.A. and N. Mexico|perennial|temperate|Fragaria virginiana subsp. virginiana||3265893||||2949067|77231464-1||N',
  '2949067|318974-2|Species|Accepted|Rosaceae||Fragaria||virginiana||||Mill.||Gard. Dict., ed. 8.|: Fragaria n.° 2|(1768)||E. Canada to N. & E. U.S.A. and N. Mexico|perennial|temperate|Fragaria virginiana|Mill.|2949067||||2948599|318974-2||N',
  '2949066|725144-1|Species|Invalid|Rosaceae||Fragaria||virginiana||||Duchesne||Hist. Nat. Frais.|: 204|(1766)|, not validly publ.||||Fragaria virginiana|Duchesne|3265893|||||725144-1||N'
];
describe('Kew\'s real rows: Fragaria virginiana Duchesne', () => {
  it('the range is the species\' (Miller\'s), not its type subspecies\'', () => {
    const w = new WcvpIndex();
    for (const l of FRAGARIA) w.addName(parseWcvpName(H, l), (n) => /^Fragaria /.test(n));
    w.addDist(parseWcvpDist(D, '3265893|ONT|Ontario|0|0|0'));
    w.addDist(parseWcvpDist(D, '2949067|ONT|Ontario|0|0|0'));
    w.addDist(parseWcvpDist(D, '2949067|WAS|Washington|0|0|0'));
    const got = w.distributions('Fragaria virginiana', 'Duchesne', 'Rosaceae');
    expect(got && got !== 'ambiguous' && got.rows.map((r) => r.locality)).toEqual(['Ontario', 'Washington']);
  });
});

// Verbatim from Kew's wcvp_names.csv, June 2026.
const MIXTA = [
  '509402|99924-1|Species|Accepted|Apocynaceae||Orbea||variegata|||L.|Haw.||Syn. Pl. Succ.|: 40|(1812)||SW. & S. Cape Prov.|succulent subshrub|subtropical|Orbea variegata|(L.) Haw.|509402|512291|||509289|99924-1||Y',
  '524950|77167004-1|Species|Synonym|Apocynaceae||Ceropegia||mixta|||Masson|Bruyns||S. African J. Bot.| 112: 427|(2017)|||||Ceropegia mixta|(Masson) Bruyns|509402|512117||||77167004-1||Y'
];
const mixta = () => {
  const w = new WcvpIndex();
  for (const l of MIXTA) w.addName(parseWcvpName(H, l), (n) => /^(Ceropegia|Orbea) /.test(n));
  w.addDist(parseWcvpDist(D, '509402|CPP|Cape Provinces|0|0|0'));
  return w;
};
describe('a range Kew gives through a synonym row says whose entry it is (S-B4)', () => {
  it('Ceropegia mixta: "Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw."', () => {
    const got = mixta().distributions('Ceropegia mixta', '(Masson) Bruyns', 'Apocynaceae');
    expect(got && got !== 'ambiguous' && got.synonymOf).toEqual({ row: 'Ceropegia mixta (Masson) Bruyns', status: 'Synonym', entry: 'Orbea variegata (L.) Haw.', entryName: 'Orbea variegata' });
  });
  it('the bulk fetcher passes it on, and the page\'s range source says it', async () => {
    const { bulkFetcher } = await import('$dossier/bulk');
    const { distributions } = await import('$dossier/sources/gbif');
    const { rangeSource } = await import('$dossier/build');
    const base = (async (url: string) => (/\/species\/9534856$/.test(url) ? { status: 'ok', data: { canonicalName: 'Ceropegia mixta', authorship: '(Masson) Bruyns', family: 'Apocynaceae' } } : { status: 'none' })) as never;
    const d = await distributions(bulkFetcher(base, { wcvp: mixta() }), 9534856);
    expect(rangeSource(d)).toBe("WCVP (Govaerts, RBG Kew): Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's"); // r71base: "WCVP (Govaerts, RBG Kew) via GBIF"
  });
  it('--fill range-source says it on a stored page whose range is Kew\'s, and lists one whose range is not', async () => {
    const { fillRangeSource } = await import('$dossier/corpus-fills');
    const doc = (native: string[]) => ({ key: 9534856, name: { scientific: 'Ceropegia mixta', authorship: '(Masson) Bruyns', family: 'Apocynaceae' }, distribution: { native: native.map((code) => ({ code })), source: 'WCVP (Govaerts, RBG Kew) via GBIF' }, upstream: { 'wcvp.distribution': { status: 'ok', at: 'x' } } });
    const docs: Record<string, any> = { a: doc(['CPP']), b: { ...doc(['NAM']), key: 2 } };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } };
    const c = fillRangeSource(store, mixta());
    expect(c).toMatchObject({ said: 1, before: 0 });
    expect(c.differs).toEqual([expect.stringMatching(/^2 Ceropegia mixta\t/)]);
    expect(docs.a.distribution.source).toMatch(/as a synonym of Orbea variegata \(L\.\) Haw\./);
    expect(docs.a.upstream['wcvp.distribution'].detail).toBe("Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's");
    expect(fillRangeSource(store, mixta())).toMatchObject({ said: 0, before: 1 });
  });
  it('a species\' own accepted entry says nothing more (guard)', () => {
    const got = mixta().distributions('Orbea variegata', '(L.) Haw.', 'Apocynaceae');
    expect(got && got !== 'ambiguous' && got.synonymOf).toBeUndefined();
  });
});

describe('--list-rebuild reads the stored range against Kew\'s (S-B8)', () => {
  it('Ixora coccinea, read the same way by both rules on r71base, is listed by its stored range', async () => {
    const { kewRebuildList } = await import('$dossier/corpus-fills');
    const w = new WcvpIndex();
    for (const l of IXORA) w.addName(parseWcvpName(H, l), (n) => /^(Ixora|Embothrium) /.test(n));
    w.addDist(parseWcvpDist(D, '2788267|CLS|Chile South|0|0|0'));
    w.addDist(parseWcvpDist(D, '103356|IND|India|0|0|0'));
    const docs = { a: { key: 8793122, name: { scientific: 'Ixora coccinea', authorship: 'Comm. ex Lam.', family: 'Rubiaceae' }, distribution: { native: [{ code: 'CLS' }] } } };
    const store = { files: () => ['a'], read: <T,>() => structuredClone(docs.a) as T, write: () => {} };
    expect(kewRebuildList(store, w)).toEqual([expect.stringMatching(/^8793122 Ixora coccinea\t/)]); // r71base: []
  });
  it('a stored range that is Kew\'s is not listed (guard)', async () => {
    const { kewRebuildList } = await import('$dossier/corpus-fills');
    const docs = { a: { key: 9534856, name: { scientific: 'Ceropegia mixta', authorship: '(Masson) Bruyns', family: 'Apocynaceae' }, distribution: { native: [{ code: 'CPP' }] } } };
    expect(kewRebuildList({ files: () => ['a'], read: <T,>() => structuredClone(docs.a) as T, write: () => {} }, mixta())).toEqual([]);
  });
});
describe('--list-rebuild, more', () => {
  it('a stored range the rule no longer gives is listed, whatever rule made it', async () => {
    const { kewRebuildList } = await import('$dossier/corpus-fills');
    const docs = { a: { key: 9534856, name: { scientific: 'Ceropegia mixta', authorship: '(Masson) Bruyns', family: 'Apocynaceae' }, distribution: { native: [{ code: 'NAM' }] } } };
    expect(kewRebuildList({ files: () => ['a'], read: <T,>() => structuredClone(docs.a) as T, write: () => {} }, mixta())).toEqual(["9534856 Ceropegia mixta\tthe stored native range is not Kew's for Orbea variegata (L.) Haw. (NAM stored, CPP now)"]);
  });
  it('a species on a homonym key is listed (S-B2)', async () => {
    const { kewRebuildList } = await import('$dossier/corpus-fills');
    const docs = { a: { key: 1, name: { scientific: 'Orbea variegata', authorship: 'Kük.', family: 'Apocynaceae' }, distribution: { native: [{ code: 'CPP' }] } } };
    expect(kewRebuildList({ files: () => ['a'], read: <T,>() => structuredClone(docs.a) as T, write: () => {} }, mixta())).toEqual(["1 Orbea variegata\ton a homonym key: the backbone's Kük. is not Kew's (L.) Haw."]);
  });
});
