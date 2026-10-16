/**
 * Round 71, B (self-review 70 S-B2; triage-70 "species on a homonym key"): the reference holds Rubus parviflorus by
 * GBIF's key 7872219, "Rubus parviflorus Kük.", an orphan usage with no synonym and no common name; the thimbleberry is
 * GBIF's "Rubus parviflorus Nutt." (2989557), filed under Rubus nutkanus. The page showed Kükenthal's author, no common
 * name, and "thimbleberry" found other plants. The keys stay; the page cites Kew's author and reads synonyms and common
 * names from GBIF's usage by Kew's author, saying so. GBIF's answers of 2026-10-15 (fixtures/r71b-homonym-keys.json).
 * Each case FAILED on r71base (where `kewName` did not exist, and the build cited the backbone's author) unless it says
 * "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kewName, buildDossier } from '$dossier/build';
import { referenceOf } from '$dossier/reference';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const A: Record<string, unknown> = JSON.parse(readFileSync('tests/unit/fixtures/r71b-homonym-keys.json', 'utf8'));
const f = (async (url: string) => (url in A ? { status: 'ok', data: A[url] } : { status: 'refused', detail: `no fixture: ${url}` })) as unknown as JsonFetcher;
const ref = referenceOf([{ key: 7872219, name: 'Rubus parviflorus', family: 'Rosaceae' }, { key: 8397184, name: 'Ranunculus ficaria', family: 'Ranunculaceae' }, { key: 8038589, name: 'Myrica cerifera', family: 'Myricaceae' }, { key: 8357296, name: 'Adenia gummifera', family: 'Passifloraceae' }, { key: 5527841, name: 'Adenia cissampeloides', family: 'Passifloraceae' }]);

describe('a species on a homonym key cites Kew\'s author, and borrows from GBIF\'s usage by it', () => {
  it.each([
    [7872219, 'Rubus parviflorus', 'Kük.', 'Rosaceae', 'Nutt.', 2989557, 2994229],
    [8397184, 'Ranunculus ficaria', 'Walter', 'Ranunculaceae', 'L.', 3033351, 7277276],
    [8038589, 'Myrica cerifera', 'Bigelow', 'Myricaceae', 'L.', 5414216, 3168995]
  ])('%s %s %s: Kew\'s %s', async (key, scientific, authorship, family, kewAuthor, usage, target) => {
    const n = await kewName(f, { key, scientific, authorship, family, reference: ref });
    expect(n).toMatchObject({ authorship: kewAuthor, borrow: { usage, target } });
    expect(n!.note).toMatch(new RegExp(`GBIF's key ${key} is ${scientific} ${authorship.replace('.', '\\.')}; Kew accepts ${scientific} ${kewAuthor.replace('.', '\\.')}, and the name is cited as Kew accepts it`));
  });
  it('Adenia gummifera BurttDavy: GBIF files Harms\'s name under Adenia cissampeloides, a page here, so nothing is borrowed', async () => {
    const n = await kewName(f, { key: 8357296, scientific: 'Adenia gummifera', authorship: 'BurttDavy', family: 'Passifloraceae', reference: ref });
    expect(n).toMatchObject({ authorship: '(Harv.) Harms' });
    expect(n!.borrow).toBeUndefined();
    expect(n!.note).toMatch(/another species of this reference, so nothing is read from it/);
  });
  it('a backbone author Kew agrees with changes nothing (guard)', async () => {
    expect(await kewName(f, { key: 2989557, scientific: 'Rubus parviflorus', authorship: 'Nutt.', family: 'Rosaceae', reference: ref })).toBeNull();
  });
  it('Kew not answering changes nothing (guard)', async () => {
    const none = (async () => ({ status: 'refused', detail: 'api.gbif.org 429' })) as unknown as JsonFetcher;
    expect(await kewName(none, { key: 7872219, scientific: 'Rubus parviflorus', authorship: 'Kük.', family: 'Rosaceae' })).toBeNull();
  });
});

describe('the build of a species on a homonym key', () => {
  const GBIF = 'https://api.gbif.org/v1';
  function world(orphan = true): JsonFetcher {
    const t = copiapoa() as Record<string, unknown>;
    t[`${GBIF}/species/5384013`] = { ...(t[`${GBIF}/species/5384013`] as object), scientificName: 'Copiapoa cinerea Kük.', authorship: 'Kük.' };
    t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    if (orphan) t[`${GBIF}/species/5384013/synonyms`] = { results: [] };
    t[`${GBIF}/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=Copiapoa%20cinerea`] = { results: [{ key: 1, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', canonicalName: 'Copiapoa cinerea', authorship: '(Phil.) Britton & Rose', taxonomicStatus: 'ACCEPTED', family: 'Cactaceae', taxonID: '42', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1-1' }] };
    t[`${GBIF}/species?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&name=Copiapoa%20cinerea`] = { results: [{ key: 5384013, scientificName: 'Copiapoa cinerea Kük.', canonicalName: 'Copiapoa cinerea', authorship: 'Kük.', taxonomicStatus: 'ACCEPTED', rank: 'SPECIES' }, { key: 777, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', canonicalName: 'Copiapoa cinerea', authorship: '(Phil.) Britton & Rose', taxonomicStatus: 'HETEROTYPIC_SYNONYM', acceptedKey: 888, accepted: 'Copiapoa grisea Hort.', rank: 'SPECIES' }] };
    t[`${GBIF}/species/888/synonyms`] = { results: [{ key: 777, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', canonicalName: 'Copiapoa cinerea', rank: 'SPECIES' }, { key: 779, scientificName: 'Echinocactus griseus Phil.', canonicalName: 'Echinocactus griseus', rank: 'SPECIES' }] };
    t[`${GBIF}/species/888/vernacularNames`] = { results: [] };
    t[`${GBIF}/species/777/vernacularNames`] = { results: [{ vernacularName: 'Grey copiapoa', language: 'eng', source: 'X' }] };
    t[`${GBIF}/species/888`] = { key: 888, scientificName: 'Copiapoa grisea Hort.', canonicalName: 'Copiapoa grisea', authorship: 'Hort.', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED' };
    return fixtureFetcher(t);
  }
  it('cites Kew\'s author, takes the borrowed names, and says so', async () => {
    const r = await buildDossier('Copiapoa cinerea', { fetcher: world(), builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'] });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.name.authorship).toBe('(Phil.) Britton & Rose'); // r71base: 'Kük.'
    expect(r.dossier.name.synonyms).toEqual(['Copiapoa grisea Hort.', 'Echinocactus griseus Phil.']);
    expect(r.dossier.name.synonyms).not.toContain('Copiapoa cinerea (Phil.) Britton & Rose');
    expect(r.dossier.name.vernacular.map((v) => v.name)).toContain('Grey copiapoa');
    expect(r.dossier.upstream['gbif.species'].detail).toMatch(/GBIF's key 5384013 is Copiapoa cinerea Kük\.; Kew accepts Copiapoa cinerea \(Phil\.\) Britton & Rose, and the name is cited as Kew accepts it; its synonyms and common names are read from GBIF's Copiapoa cinerea \(Phil\.\) Britton & Rose \(777\), which GBIF files under Copiapoa grisea Hort\. \(888\) too/);
    expect(r.dossier.upstream['gbif.vernacular'].detail).toMatch(/1 read from GBIF's/);
    expect(r.dossier.name.cited).toEqual({ gbif: 'Kük.', kew: '42' }); // round 72, A: the homonym key's fields too
  });
  it('a key with synonyms of its own is no orphan and borrows nothing, but cites the name it links (round 72, A: Diospyros kaki linked Kew\'s Thunb. and cited L.f.)', async () => {
    const r = await buildDossier('Copiapoa cinerea', { fetcher: world(false), builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'] });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.name.authorship).toBe('(Phil.) Britton & Rose'); // r72base: 'Kük.', beside a link to Kew's 1-1
    expect(r.dossier.ids.powo).toBe('urn:lsid:ipni.org:names:1-1');
    expect(r.dossier.name.vernacular.map((v) => v.name)).not.toContain('Grey copiapoa');
    expect(r.dossier.upstream['gbif.species'].detail).toMatch(/GBIF's key 5384013 is Copiapoa cinerea Kük\.; the page links Kew's Copiapoa cinerea \(Phil\.\) Britton & Rose, and the name is cited as Kew cites it/);
    expect(r.dossier.name.cited).toEqual({ gbif: 'Kük.', kew: '42' }); // r72base: no field
  });
});

describe('mutation survivors of the Kew reading (S-B11; guards: they pass on r71base and kill the mutations)', () => {
  it('Kew\'s hybrid "Rubus ×parviflorus Sudre" is not a row of Rubus parviflorus\'s words, so its number is no homonym\'s', async () => {
    const { kewIpni } = await import('$dossier/sources/gbif');
    const r = await kewIpni(f, 'Rubus parviflorus', 'Nutt.', 'Rosaceae');
    expect(r.status === 'ok' && r.data.ids).toEqual(['298093-2']);
    expect(r.status === 'ok' && (r.data.others ?? []).map((o) => o.id)).not.toContain('738961-1');
  });
  it('"A ex B" cited by A alone is the one name, not another author\'s (Mammillaria pennispinosa Krainz ex Shurly)', async () => {
    const { plainlyAnother } = await import('$dossier/authors');
    expect(plainlyAnother('Krainz ex Shurly', 'Krainz')).toBe(false);
    expect(plainlyAnother('Krainz', 'Krainz ex Shurly')).toBe(false);
    expect(plainlyAnother('Kük.', 'Nutt.')).toBe(true); // guard
  });
});

describe('what is not a homonym key (S-B2 guards)', () => {
  it('a backbone author Kew agrees with, though GBIF holds the words by it elsewhere', async () => {
    expect(await kewName(f, { key: 7872219, scientific: 'Rubus parviflorus', authorship: 'Nutt.', family: 'Rosaceae', reference: ref })).toBeNull();
  });
  it('Kew citing the author otherwise, with no usage by Kew\'s citation elsewhere at GBIF (Drosera montana St.Hil., Kew\'s A.St.-Hil.)', async () => {
    const g = (async (url: string) => {
      if (url.includes('f382f0ce')) return { status: 'ok', data: { results: [{ key: 1, scientificName: 'Drosera montana A.St.-Hil.', canonicalName: 'Drosera montana', authorship: 'A.St.-Hil.', taxonomicStatus: 'ACCEPTED', family: 'Droseraceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1-1' }] } };
      if (url.includes('d7dddbf4')) return { status: 'ok', data: { results: [{ key: 3191221, scientificName: 'Drosera montana St.Hil.', canonicalName: 'Drosera montana', authorship: 'St.Hil.', taxonomicStatus: 'ACCEPTED', rank: 'SPECIES' }] } };
      return { status: 'none' };
    }) as unknown as JsonFetcher;
    expect(await kewName(g, { key: 3191221, scientific: 'Drosera montana', authorship: 'St.Hil.', family: 'Droseraceae' })).toBeNull();
  });
  it('--list-rebuild lists an orphan key only', async () => {
    const { kewRebuildList } = await import('$dossier/corpus-fills');
    const { WcvpIndex, parseWcvpName } = await import('$dossier/bulk');
    const H = 'plant_name_id|taxon_status|family|taxon_name|taxon_authors|accepted_plant_name_id|taxon_rank'.split('|');
    const w = new WcvpIndex();
    w.addName(parseWcvpName(H, '1|Accepted|Rosaceae|Rubus parviflorus|Nutt.|1|Species'), () => true);
    const doc = (synonyms: string[]) => ({ key: 7872219, name: { scientific: 'Rubus parviflorus', authorship: 'Kük.', family: 'Rosaceae', synonyms } });
    const list = (d: unknown) => kewRebuildList({ files: () => ['a'], read: <T,>() => structuredClone(d) as T, write: () => {} }, w);
    expect(list(doc([]))).toEqual(["7872219 Rubus parviflorus\ton a homonym key not yet read: the backbone's Kük. is not Kew's Nutt."]);
    expect(list(doc(['Rubus nutkanus Moc. ex Ser.']))).toEqual([]);
  });
});
