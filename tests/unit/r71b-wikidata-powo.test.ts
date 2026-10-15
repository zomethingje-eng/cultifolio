/**
 * Round 71, B (self-review 70): the six refusals "on another author's name" (and Peperomia monticola, Othonna rosea) are each the
 * species' own item: its POWO identifier is Kew's for the name by the backbone's author; the stray record is its IPNI
 * and GBIF key. Items' statements are Wikidata's of 2026-10-15; Kew's rows GBIF's copy of WCVP, cut to the fields read.
 */
import { describe, it, expect } from 'vitest';
import { crossIds } from '$dossier/sources/wikimedia';
import type { JsonFetcher } from '$dossier/fetch';

const KEW = 'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2';
const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
const CASES = [
  { name: 'Gunnera manicata', key: 8078925, author: 'Linden', q: 'Q1634712', ipni: '77079969-1', gbif: 3723643, gbifSci: 'Gunnera manicata Delchev.', powo: '324610-2', kew: [{ authorship: 'Linden ex André', status: 'ACCEPTED', ipni: '324610-2' }] },
  { name: 'Peperomia monticola', key: 7555524, author: 'Miq.', q: 'Q15605262', ipni: '679160-1', gbif: 4183999, gbifSci: 'Peperomia monticola Miq.', powo: '679159-1', kew: [{ authorship: 'Miq.', status: 'ACCEPTED', ipni: '679159-1' }, { authorship: 'Hook.f.', status: 'SYNONYM', ipni: '679160-1' }] }
];
function world(c: (typeof CASES)[number]): JsonFetcher {
  return (async (url: string) => {
    const ok = (data: unknown) => ({ status: 'ok', data });
    if (url.startsWith(KEW)) return ok({ results: c.kew.map((r, i) => ({ key: i + 1, scientificName: `${c.name} ${r.authorship}`, canonicalName: c.name, authorship: r.authorship, taxonomicStatus: r.status, family: 'X', references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${r.ipni}` })) });
    if (url.includes('haswbstatement')) return ok({ query: { search: [] } });
    if (url.includes('action=wbsearchentities')) return ok({ search: [{ id: c.q, label: c.name }] });
    if (url.includes('action=wbgetentities')) return ok({ entities: { [c.q]: { claims: { P31: [claim({ id: 'Q16521' })], P225: [claim(c.name)], P961: [claim(c.ipni)], P846: [claim(String(c.gbif))], P5037: [claim(`urn:lsid:ipni.org:names:${c.powo}`)] } } } });
    if (url.endsWith(`/species/${c.gbif}`)) return ok({ key: c.gbif, scientificName: c.gbifSci, canonicalName: c.name, authorship: c.gbifSci.slice(c.name.length + 1), rank: 'SPECIES', kingdom: 'Plantae', taxonomicStatus: 'DOUBTFUL' });
    if (url.includes('ipni.org')) return ok({});
    return { status: 'none' };
  }) as unknown as JsonFetcher;
}
describe('an item whose POWO identifier is Kew\'s for this name and author is the species\'', () => {
  for (const c of CASES)
    it(`${c.name} ${c.author}: ${c.q}, linking Kew's IPNI ${c.powo}`, async () => {
      const r = await crossIds(world(c), c.name, c.key, [], { authorship: c.author, family: 'X' });
      expect(r).toMatchObject({ status: 'ok', data: { wikidata: c.q, ipni: c.powo } });
    });
});

describe('the true homonym\'s item stays refused (guard)', () => {
  it('Albuca longifolia Fisch. ex Steud.: Q15516807 carries POWO 527398-1, Kew\'s for Baker\'s name', async () => {
    const c = { name: 'Albuca longifolia', key: 7570556, author: 'Fisch. ex Steud.', q: 'Q15516807', ipni: '527398-1', gbif: 2772455, gbifSci: 'Albuca longifolia Baker', powo: '527398-1', kew: [{ authorship: 'Fisch. ex F.Dietr.', status: 'DOUBTFUL', ipni: '77235994-1' }, { authorship: 'Baker', status: 'SYNONYM', ipni: '527398-1' }] };
    const r = await crossIds(world(c), c.name, c.key, [], { authorship: c.author, family: 'X' });
    expect(r.status).toBe('none');
    expect('detail' in r && r.detail).toMatch(/carries IPNI 527398-1, Kew's for Albuca longifolia Baker, another author's name/);
  });
});

describe('the stem rule joins genitives only (S-B12)', () => {
  it('Parodia ritteriana and Syzygium formosum are not Parodia ritteri and Syzygium formosanum; burbidgeae is burbidgei', async () => {
    const { genitivesAgree, epithetsAgree } = await import('$dossier/own-names');
    expect(genitivesAgree('ritteriana', 'ritteri')).toBe(false); // r71base (epithetsAgree): true
    expect(genitivesAgree('formosum', 'formosanum')).toBe(false);
    expect(genitivesAgree('burbidgeae', 'burbidgei')).toBe(true); // guard
    expect(epithetsAgree('selloana', 'selloa')).toBe(true); // guard: iNaturalist keeps the adjective, Kew decides
  });
  it('an item labelled "Parodia ritteriana" is not taken for Parodia ritteri (guard: on r71base its record\'s author refuses it too)', async () => {
    const asked: string[] = [];
    const g = (async (url: string) => {
      asked.push(url);
      if (url.includes('haswbstatement')) return { status: 'ok', data: { query: { search: [] } } };
      if (url.includes('action=wbsearchentities')) return { status: 'ok', data: { search: [{ id: 'Q9', label: 'Parodia ritteriana' }] } };
      if (url.includes('action=wbgetentities')) return { status: 'ok', data: { entities: { Q9: { claims: { P31: [claim({ id: 'Q16521' })], P225: [claim('Parodia ritteriana')], P846: [claim('123')] } } } } };
      if (url.endsWith('/species/123')) return { status: 'ok', data: { key: 123, scientificName: 'Parodia ritteriana (Lisal & Kolařík) A.S.Oliveira & R.Pontes', canonicalName: 'Parodia ritteriana', rank: 'SPECIES', kingdom: 'Plantae', taxonomicStatus: 'ACCEPTED' } };
      return { status: 'ok', data: { results: [] } };
    }) as unknown as JsonFetcher;
    const r = await crossIds(g, 'Parodia ritteri', 3947849, [], { authorship: 'Buining', family: 'Cactaceae' });
    expect(r.status).not.toBe('ok'); // r71base: Q9, "found by its label, the epithet spelt otherwise"
  });
});
