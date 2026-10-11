/**
 * Round sixty-nine, triage-68 K1: Commons files that are not photographs of the species. The titles are real ones from
 * the owner's corpus (R46-1, S-B1, IND-1). Each case FAILED on the base (1609c19) unless it says "guard": there the
 * build took every file of the category, and the read showed every stored one.
 */
import { describe, it, expect } from 'vitest';
import { commonsPhotos } from '$dossier/sources/commons';
import { fixtureFetcher } from '$dossier/fetch';
import { safeUrls } from '$dossier/schema';

const answer = (files: Array<{ title: string; cats?: string; width?: number }>) => ({
  query: {
    pages: Object.fromEntries(
      files.map((x, i) => {
        const name = x.title.replace(/^File:/, '').replace(/ /g, '_');
        const path = `wikipedia/commons/a/ab/${encodeURIComponent(name)}`;
        return [String(i + 1), { title: x.title, imageinfo: [{ url: `https://upload.wikimedia.org/${path}`, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(name)}/960px-${encodeURIComponent(name)}`, width: x.width ?? 3000, height: 2000, descriptionurl: `https://commons.wikimedia.org/wiki/${x.title}`, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'A. Grower' }, ...(x.cats ? { Categories: { value: x.cats } } : {}) } }] }];
      })
    )
  }
});
const ask = async (files: Array<{ title: string; cats?: string }>, scientific: string, synonyms: string[] = []) => {
  const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': answer(files) }), scientific, 12, { scientific, synonyms });
  return r.status === 'ok' ? r.data.map((p) => p.id) : [];
};
/** A dossier as stored, read as the Worker reads it. */
const read = (scientific: string, ids: string[], synonyms: string[] = []) =>
  safeUrls({ name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: ids.map((id) => ({ src: 'commons', id, url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/960px-${encodeURIComponent(id)}`, thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/500px-x.jpg', width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons' })) } as never).photos.map((p) => p.id);

/** Each case: the species, its older names, the title. */
const BAD: Array<[string, string, string[]?]> = [
  ['Nepenthes platychila', 'File:Nepenthes platychila distribution.png'],
  ['Nepenthes platychila', 'File:Nepenthes platychila distribution.jpg'],
  ['Heliamphora hispida', 'File:The range of Heliamphora hispida.png'],
  ['Heliamphora hispida', 'File:The range of Heliamphora hispida.jpg'],
  ['Crassula alcicornis', 'File:Crassula alcicornis specimen.jpg'],
  ['Stephania bancroftii', 'File:Stephania bancroftii herbarium specimen AQ658209.jpg'],
  ['Agave spicata', "File:Curtis's botanical magazine (Tab. 5213) (9441929159).jpg"],
  ['Aloe juvenna', 'File:Starr 070906-9053 Unknown asphodelaceae.jpg'],
  ['Crassula socialis', 'File:Unidentified flowers in Eswatini 01.jpg'],
  ['Commiphora zanzibarica', 'File:Commiphora zanzibarica - seed (8667179039).jpg'],
  ['Anacampseros pisina', 'File:Anacampseros piscina seeds, by Omar Hoftun.jpg'],
  ['Adenia tisserantii', 'File:COI00012345 Adenia tisserantii holotype.jpg'],
  ['Adenia tisserantii', 'File:COI00012345.jpg'],
  ['Colchicum ritchii', 'File:Colchicum ritchii (GBIF 3).jpg'],
  ['Nepenthes dubia', 'File:Nepenthes tenuis1.jpg'],
  ['Nepenthes singalana', 'File:Nepenthes junghuhnii distribution.png'],
  ['Nepenthes singalana', 'File:Nepenthes junghuhnii.jpg'],
  ['Uebelmannia buiningii', 'File:Uebelmannia pectinifera Donald.jpg'],
  ['Agave jaliscana', 'File:Manfreda aff. jaliscana - Flickr - Dick Culbert.JPG', ['Manfreda jaliscana (Rose) Rose']],
  ['Heliamphora minor', 'File:Heliamphora minor x heterodoxa 1.jpg'],
  ['Heliamphora minor', 'File:Heliamphora minor × heterodoxa.jpg'],
  ['Franklinia alatamaha', 'File:Botanical Congress Franklinia 6c 1969 issue U.S. stamp.jpg'],
  // An "unknown plant" in a garden may be the plant (R46's note), but the title says its photographer did not know it, and
  // only a later editor's filing says it is: under rule 3 a match is taken only when it is unambiguous, so it is not shown.
  ['Crassula socialis', "File:Bahá'í Terraces unknown plant 1 - Sarah Stierch.jpg"],
  ['Gymnocalycium baldianum', 'File:Gymnocalycium baldianum plant drawing.webp']
];
const GOOD: Array<[string, string, string[]?]> = [
  ['Crassula socialis', 'File:Crassula socialis - Botanical Garden in Kaisaniemi, Helsinki - DSC03713.JPG'],
  ['Uncarina roeoesliana', 'File:Uncarina roeoesliana - Botanischer Garten der Universität Würzburg.JPG'],
  ['Crassula socialis', 'File:DSC_1234.JPG'],
  ['Crassula socialis', 'File:IMG_20190501.jpg'],
  ['Echeveria stolonifera', 'File:Flickr - brewbooks - Echeveria stolonifera.jpg'],
  ['Ceropegia attenuatula', 'File:Brachystelma attenuatum 2.jpg', ['Brachystelma attenuatum N.E.Br.']],
  ['Lantana ×strigocamara', 'File:Lantana × strigocamara flowers.jpg'],
  ['Aloe xerophila', 'File:Aloe xerophila in habitat.jpg'],
  ['Gymnocalycium mihanovichii', 'File:Gymnocalycium mihanovichi.webp'],
  ['Crassula socialis', 'File:Crassula in flower, Kew.jpg'],
  ['Nepenthes dubia', 'File:Nepenthes dubia, Sumatra.jpg']
];

describe('a Commons answer: only photographs of the species are taken', () => {
  for (const [sp, title, syn] of BAD) it(`leaves out ${title} under ${sp}`, async () => expect(await ask([{ title }], sp, syn)).toEqual([]));
  for (const [sp, title, syn] of GOOD) it(`takes ${title} under ${sp} (guard)`, async () => expect(await ask([{ title }], sp, syn)).toEqual([title]));
  it('reads Commons\' categories, which the same request now returns, and not "Pages with maps", which every geotagged file is under', async () => {
    expect(await ask([{ title: 'File:Agave spicata 01.jpg', cats: "Agave spicata|Curtis's Botanical Magazine|Pages with maps" }], 'Agave spicata')).toEqual([]);
    expect(await ask([{ title: 'File:Gasteria glomerata 2.jpg', cats: 'Herbarium specimens of Gasteria' }], 'Gasteria glomerata')).toEqual([]);
    expect(await ask([{ title: 'File:Gasteria glomerata 3.jpg', cats: 'Media from GBIF' }], 'Gasteria glomerata')).toEqual([]);
    expect(await ask([{ title: 'File:Agave spicata 02.jpg', cats: 'Agave spicata|Pages with maps|Taken with Canon EOS 5D' }], 'Agave spicata')).toEqual(['File:Agave spicata 02.jpg']); // guard
  });
  it('puts titles holding the species\' epithet first, so a camera\'s name does not lead, and reads fifty files to keep twelve', async () => {
    const files = [{ title: 'File:DSC_0001.JPG' }, { title: 'File:1 Gasteria species - Distribution map.png' }, { title: 'File:Gasteria glomerata, Kirstenbosch.jpg' }];
    expect(await ask(files, 'Gasteria glomerata')).toEqual(['File:Gasteria glomerata, Kirstenbosch.jpg', 'File:DSC_0001.JPG']);
    let url = '';
    await commonsPhotos(async (u) => ((url = u), { status: 'none' }), 'Gasteria glomerata');
    expect(url).toMatch(/gcmlimit=50&/);
    expect(url).toMatch(/iiextmetadatafilter=[^&]*Categories/);
    expect(url).toMatch(/iiurlwidth=960&/); // guard, and R46-31's green revert of COMMONS_SHOWN: 800 answers 400
  });
});

describe('a stored dossier read by the Worker: the same test, from the title alone', () => {
  for (const [sp, title, syn] of BAD) it(`does not show ${title} under ${sp}`, () => expect(read(sp, [title], syn)).toEqual([]));
  for (const [sp, title, syn] of GOOD) it(`shows ${title} under ${sp} (guard)`, () => expect(read(sp, [title], syn)).toEqual([title]));
  it('Nepenthes dubia keeps its own files and loses the five named N. tenuis', () => {
    const ids = ['File:Nepenthes tenuis1.jpg', 'File:Nepenthes tenuis2.jpg', 'File:Nepenthes dubia 1.jpg', 'File:Nepenthes tenuis3.jpg', 'File:Nepenthes dubia 2.jpg'];
    expect(read('Nepenthes dubia', ids)).toEqual(['File:Nepenthes dubia 1.jpg', 'File:Nepenthes dubia 2.jpg']);
  });
});

describe('--fill commons reads the species\' older names', () => {
  it('a file named under an older name is the species, and one naming another species of that older genus is not', async () => {
    const { fillCommons } = await import('$dossier/commons-fill');
    const d = { key: 1, name: { scientific: 'Ceropegia attenuatula', synonyms: ['Brachystelma attenuatum N.E.Br.'] }, photos: [] as Array<{ id: string }>, upstream: {} as Record<string, unknown> };
    await fillCommons(d as never, fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': answer([{ title: 'File:Brachystelma foetidum 1.jpg' }, { title: 'File:Brachystelma attenuatum 2.jpg' }]) }), () => 'now');
    expect(d.photos.map((p) => p.id)).toEqual(['File:Brachystelma attenuatum 2.jpg']);
  });
});
