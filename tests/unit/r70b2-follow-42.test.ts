/**
 * Round seventy, the owner's run (2026-10-13): `--fill inat-ids` refused 42 iNaturalist taxa on his corpus, about 35 of
 * them this plant under iNaturalist's genus or spelling (Sprekelia formosissima as Zephyranthes formosissima, Psidium
 * cattleianum as P. cattleyanum). The rule is now R47's: a taxon whose name is not one of the species' own is matched to
 * GBIF; refused when GBIF, or Kew, holds it as another species of this reference; taken when GBIF holds it as this
 * species, or Kew holds it and this species as one; otherwise taken only as this species' epithet in a genus outside
 * the reference, which no other species of the family here has.
 *
 * Every case is the owner's: his dossiers as the run found them (an earlier follow, or an id carried), and the same
 * dossiers as the run left them (the taxon refused by the first rule's words), with GBIF's, Kew's and iNaturalist's
 * answers as they were on 2026-10-13 (fixtures/r70b-follow-42.json, trimmed to the fields read). An answer the fixture
 * does not hold is a refusal, so a rule that asks something else stops. Each case FAILED on m70 unless it says "guard".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fillInatIds, type InatIdCounts } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';

type Case = { name: string; key: number; family: string; taxon: number; taxonName: string; carried: boolean };
const W: { cases: Case[]; reference: Array<{ key: number; name: string; family: string }>; answers: Record<string, unknown> } = JSON.parse(readFileSync('tests/unit/fixtures/r70b-follow-42.json', 'utf8'));
/** iNaturalist's taxa by id, from every batch recorded: a batch of other ids is answered from them. */
const TAXA = new Map<number, unknown>();
for (const [url, a] of Object.entries(W.answers)) if (/\/v1\/taxa\/[\d,]+/.test(url)) for (const t of (a as { data: { results: Array<{ id: number }> } }).data.results) TAXA.set(t.id, t);
const fetcher = (async (url: string) => {
  if (url in W.answers) return W.answers[url];
  const ids = /\/v1\/taxa\/([\d,]+)$/.exec(url)?.[1].split(',').map(Number);
  if (ids?.every((id) => TAXA.has(id))) return { status: 'ok', data: { results: ids.map((id) => TAXA.get(id)) } };
  return { status: 'refused', detail: `no fixture: ${url}` };
}) as unknown as JsonFetcher;

/** The seven right refusals: another species of this reference, by name, by GBIF or by Kew. */
const REFUSED: Record<string, string> = {
  'Drimia filifolia': 'Drimia exuviata is another species of this reference',
  'Nepenthes angasanensis': 'Nepenthes mikei is another species of this reference',
  'Pinguicula chilensis': 'Pinguicula antarctica is another species of this reference',
  'Ceropegia monteiroae': 'Ceropegia sandersonii is another species of this reference',
  'Cotyledon flanaganii': 'GBIF holds Cotyledon orbiculata orbiculata as Cotyledon orbiculata, another species of this reference',
  'Drimia oliverorum': 'GBIF holds Drimia physodes as Fusifilum physodes, another species of this reference',
  'Stenocactus boedekerianus': 'Kew holds Echinofossulocactus ochoterenanus as a synonym of Stenocactus ochoterenanus, another species of this reference'
};
/** What the name search then finds for a refused one (iNaturalist's own answer): Cotyledon orbiculata var. flanaganii is GBIF's synonym of Cotyledon flanaganii. */
const BY_NAME: Record<string, number> = { 'Drimia oliverorum': 868348, 'Cotyledon flanaganii': 598424 };
/** Why each of the other 35 is taken. */
const TAKEN: Record<string, string> = {
  'Austronea hispidoplicata': 'Kew holds Austronea hispidoplicata as a synonym of Drimia hispidoplicata',
  'Austronea densiflora': 'Kew holds Austronea densiflora as a synonym of Drimia densiflora',
  'Austronea pinguis': 'Kew holds Austronea pinguis as a synonym of Drimia pinguis',
  'Philodendron bipinnatifidum': 'Kew holds Thaumatophyllum bipinnatifidum as a synonym of Philodendron bipinnatifidum',
  'Tricyrtis formosana': 'Tricyrtis formosana formosana is Tricyrtis formosana itself, at a lower rank',
  'Agave albopilosa': 'Kew holds Agave albopilosa as a synonym of Echinoagave albopilosa',
  'Furcraea selloa': "this species' epithet in another genus or spelling",
  'Sprekelia formosissima': 'Kew holds Sprekelia formosissima as a synonym of Zephyranthes formosissima',
  'Sechium edule': 'GBIF holds Sicyos edulis as this species',
  'Sclerocactus johnsonii': 'GBIF holds Echinomastus johnsonii as this species',
  'Sclerocactus brevihamatus': 'GBIF holds Ancistrocactus brevihamatus as this species',
  'Kalimeris indica': 'GBIF holds Aster indicus as this species',
  'Othonna lineariifolia': 'GBIF holds Othonna linearifolia as this species',
  'Coreopsis verticillata': 'Kew holds Coreopsis verticillata as a synonym of Anacis verticillata',
  'Hibiscus sabdariffa': 'Kew holds Hibiscus sabdariffa as a synonym of Sabdariffa gossypiifolia',
  'Dodecatheon meadia': 'GBIF holds Primula meadia as this species',
  'Callistemon viminalis': 'GBIF holds Melaleuca viminalis as this species',
  'Callistemon lanceolatus': 'Kew holds Callistemon lanceolatus as a synonym of Melaleuca citrina',
  'Leptospermum laevigatum': 'Kew holds Leptospermum laevigatum as a synonym of Gaudium laevigatum',
  'Albuca toxicaria': 'Kew holds Albuca toxicaria as a synonym of Drimia toxicaria',
  'Parodia erinacea': "Parodia erinaceus is one of this species' names",
  'Stenocactus ochoterenanus': 'Kew holds Echinofossulocactus ochoterenanus as a synonym of Stenocactus ochoterenanus',
  'Erythrina caffra': "Erythrina afra is one of this species' names",
  'Psidium cattleianum': 'GBIF holds Psidium cattleyanum as this species',
  'Avonia recurvata': 'GBIF holds Anacampseros recurvata as this species',
  'Mammillaria karwinskiana': 'GBIF holds Mammillaria geminata as this species',
  'Talinella grevei': 'GBIF holds Talinum grevei as this species',
  'Avonia lavbleckiana': 'GBIF holds Anacampseros lavbleckiana as this species',
  'Hibiscus acetosella': 'Kew holds Hibiscus acetosella as a synonym of Sabdariffa acetosella',
  'Rebutia fidana': 'Kew holds Rebutia fidana as a synonym of Weingartia fidana',
  'Myrica cerifera': 'Kew holds Morella cerifera as a synonym of Myrica cerifera',
  'Papaver nudicaule': 'GBIF holds Oreomecon nudicaulis as this species',
  'Myrica rubra': 'Kew holds Morella rubra as a synonym of Myrica rubra',
  'Ranunculus ficaria': 'Kew holds Ficaria verna as a synonym of Ranunculus ficaria',
  'Antimima intervallaris': 'Kew holds Mossia intervallaris as a synonym of Antimima intervallaris'
};

type D = { key: number; name: { scientific: string; family?: string }; ids: { gbif?: number; inat?: number }; links: Record<string, string>; photos: Array<{ src: string }>; upstream: Record<string, { status: string; at?: string; detail?: string }> };
const inatPhotos = (n: number) => Array.from({ length: n }, (_, i) => ({ src: 'inat', id: String(i), url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${i}/large.jpg`, thumb: '', licence: 'by', attribution: 'a' }));

/** The corpus: the reference's species these cases touch, and the 42 as the run found them, or as it left them. */
function corpus(mode: 'found' | 'left'): Record<string, D> {
  const docs: Record<string, D> = {};
  for (const e of W.reference) docs[`${e.key}.json`] = { key: e.key, name: { scientific: e.name, family: e.family }, ids: { gbif: e.key }, links: {}, photos: [], upstream: {} };
  for (const c of W.cases) {
    const d = docs[`${c.key}.json`];
    if (mode === 'found') {
      d.ids.inat = c.taxon;
      d.links.inat = `https://www.inaturalist.org/taxa/${c.taxon}`;
      d.photos = inatPhotos(3);
      d.upstream['inat.taxon'] = { status: 'ok', at: 'x', detail: c.carried ? 'carried from build of 2026-09-20 (rederive)' : `iNaturalist's taxon 1 (${c.name}) is inactive; followed to its current taxon ${c.taxon}` };
    } else if (!(c.name in BY_NAME) && c.name !== 'Tricyrtis formosana') {
      // As m70 left it: the id, its link and photographs gone, the record in the first rule's words.
      d.upstream['inat.taxon'] = { status: 'none', at: 'x', detail: `iNaturalist's taxon 1 (${c.name}) is inactive; followed to its current taxon ${c.taxon}; read again 2026-10-13: ${c.taxon} (${c.taxonName}) is ${c.name in REFUSED ? 'another species of this reference' : "not one of this species' names"}: not taken, and its 3 photographs removed (2026-10-13); asked by name: no iNaturalist taxon of this name` };
      d.upstream['inat.photos.wild'] = { status: 'none', at: 'x', detail: 'no iNaturalist taxon is taken for this species (2026-10-13); see its taxon row' };
    }
  }
  return docs;
}
const store = (docs: Record<string, D>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d as D; } });
const at = () => '2026-10-14T00:00:00Z';

describe('the owner\'s 42, as the run found them: the seven refused, the 35 taken', () => {
  const docs = corpus('found');
  let c: InatIdCounts;
  beforeAll(async () => { c = await fillInatIds(store(docs), fetcher, at); });
  it('the fill runs to the end on the answers of the day', () => {
    expect(c.failed).toBeUndefined(); // m70: stopped, asking GBIF what this rule does not
    expect(c).toMatchObject({ checked: 42, refused: 7, kept: 34, followed: 1 }); // m70: refused 42
  });
  it('there are 42 cases, 7 refused and 35 taken (guard)', () => {
    expect(W.cases).toHaveLength(42);
    expect(Object.keys(REFUSED).length + Object.keys(TAKEN).length).toBe(42);
    expect(W.cases.every((x) => x.name in REFUSED || x.name in TAKEN)).toBe(true);
  });
  it.each(Object.entries(REFUSED))('%s: refused, %s', (name, why) => {
    const x = W.cases.find((k) => k.name === name)!;
    const d = docs[`${x.key}.json`];
    expect(d.ids.inat).toBe(BY_NAME[name]);
    expect(d.photos.filter((p) => p.src === 'inat')).toEqual([]);
    expect(c.lines.find((l) => l.startsWith(`${name} [`))).toContain(`refused, ${why}`);
  });
  it.each(Object.entries(TAKEN))('%s: taken, %s', (name, why) => {
    const x = W.cases.find((k) => k.name === name)!;
    const d = docs[`${x.key}.json`];
    expect(d.ids.inat).toBe(name === 'Tricyrtis formosana' ? 452309 : x.taxon); // m70: none
    expect(d.upstream['inat.taxon'].detail).toContain(why);
  });
  it('Mammillaria karwinskiana keeps Mammillaria geminata: GBIF holds M. geminata as a synonym of M. karwinskiana, and the photographs stay', () => {
    const d = docs['7279748.json'];
    expect(d.ids.inat).toBe(1555516);
    expect(d.photos).toHaveLength(3);
    expect((W.answers['https://api.gbif.org/v1/species/match?verbose=true&kingdom=Plantae&name=Mammillaria%20geminata'] as { data: unknown }).data).toMatchObject({ matchType: 'EXACT', status: 'SYNONYM', speciesKey: 7279748 });
  });
  it('Tricyrtis formosana goes from var. formosana to the species\' own taxon, by name', () => {
    const d = docs['2752120.json'];
    expect(d.ids.inat).toBe(452309);
    expect(d.upstream['inat.taxon'].detail).toMatch(/iNaturalist's own taxon of the species, 452309, taken for its variety's$/);
    expect(d.upstream['inat.photos.wild'].status).toBe('skipped'); // the species' photographs asked for by --fill inat
  });
});

describe('the owner\'s 42, as the run left them: the 35 taken back', () => {
  const docs = corpus('left');
  let c: InatIdCounts;
  beforeAll(async () => { c = await fillInatIds(store(docs), fetcher, at); });
  it('35 ids are given back, and the seven right refusals are left as they were', () => {
    expect(c.failed).toBeUndefined();
    expect(c.followed).toBe(34 + 0); // Tricyrtis formosana found its own taxon by name in the run, and is not among them
    expect(c.refused).toBe(0);
  });
  it.each(Object.keys(TAKEN).filter((n) => n !== 'Tricyrtis formosana'))('%s: its id given back, its photographs asked for again', (name) => {
    const x = W.cases.find((k) => k.name === name)!;
    const d = docs[`${x.key}.json`];
    expect(d.ids.inat).toBe(x.taxon); // m70: none, the refusal stood
    expect(d.links.inat).toBe(`https://www.inaturalist.org/taxa/${x.taxon}`);
    expect(d.upstream['inat.photos.wild'].status).toBe('skipped');
    expect(d.upstream['inat.taxon'].detail).toMatch(/; taken back$/);
  });
  it.each(Object.keys(REFUSED).filter((n) => !(n in BY_NAME)))('%s: left as the run left it (guard)', (name) => {
    const x = W.cases.find((k) => k.name === name)!;
    const before = corpus('left')[`${x.key}.json`];
    expect(docs[`${x.key}.json`]).toEqual(before);
  });
});
