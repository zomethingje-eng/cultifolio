/**
 * Synthetic upstream responses shaped like the real APIs, for tests and for the
 * dev server when no R2 bucket is bound. Coordinates and counts are invented
 * to be plausible; nothing here is a fact about the species.
 */
import { GBIF } from '../src/lib/dossier/sources/gbif';
import { INAT } from '../src/lib/dossier/sources/inat';

function pts(n: number, lat: number, lon: number, spread: number, licence: string, seed: number) {
  const out = [];
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
  for (let i = 0; i < n; i++)
    out.push({
      key: seed * 1000 + i,
      decimalLatitude: lat + rnd() * spread,
      decimalLongitude: lon + rnd() * spread,
      year: 1990 + ((i * 7) % 35),
      countryCode: lat < -20 ? 'CL' : 'NA',
      basisOfRecord: licence.includes('by-nc') ? 'HUMAN_OBSERVATION' : 'PRESERVED_SPECIMEN',
      license: licence,
      datasetKey: licence.includes('by-nc') ? '50c9509d-22c7-4a22-a47d-8c48425ef4a7' : 'herb-' + seed,
      datasetName: licence.includes('by-nc') ? 'iNaturalist Research-grade Observations' : 'A herbarium'
    });
  return out;
}

const BY = 'http://creativecommons.org/licenses/by/4.0/legalcode';
const NC = 'http://creativecommons.org/licenses/by-nc/4.0/legalcode';
const CC0 = 'http://creativecommons.org/publicdomain/zero/1.0/legalcode';

function inatObs(taxon: number, n: number, seed: number, captive: boolean) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const id = seed * 100 + i;
    results.push({
      id,
      observed_on: `20${10 + (i % 15)}-0${1 + (i % 9)}-1${i % 9}`,
      place_guess: captive ? 'Greenhouse' : 'Habitat',
      captive,
      quality_grade: 'research',
      photos: [
        {
          id,
          license_code: ['cc-by', 'cc0', 'cc-by-sa'][i % 3],
          url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`,
          attribution: `(c) grower${i}, some rights reserved (CC BY)`,
          original_dimensions: { width: 2048, height: 1536 }
        }
      ]
    });
  }
  return { results };
}

export function welwitschia(): Record<string, unknown> {
  const key = 5411106;
  return {
    [`${GBIF}/species/match?strict=false&name=Welwitschia`]: { usageKey: key, scientificName: 'Welwitschia mirabilis Hook.f.', matchType: 'EXACT', rank: 'SPECIES', status: 'ACCEPTED' },
    [`${GBIF}/species/${key}/synonyms`]: { results: [{ scientificName: 'Tumboa bainesii Hook.f.' }] },
    [`${GBIF}/species/${key}/vernacularNames`]: { results: [{ vernacularName: 'Welwitschia', language: 'eng' }, { vernacularName: 'tweeblaarkanniedood', language: 'afr' }] },
    [`${GBIF}/species/${key}/distributions`]: {
      results: [
        { locationId: 'TDWG:NAM', locality: 'Namibia', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants' },
        { locationId: 'TDWG:ANG', locality: 'Angola', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants' }
      ]
    },
    [`${GBIF}/species/${key}`]: { key, scientificName: 'Welwitschia mirabilis Hook.f.', canonicalName: 'Welwitschia mirabilis', authorship: 'Hook.f.', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', phylum: 'Tracheophyta', class: 'Gnetopsida', order: 'Welwitschiales', family: 'Welwitschiaceae', genus: 'Welwitschia', familyKey: 2403, genusKey: 2683215 },
    [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=${key}&hasCoordinate`]: {
      count: 300,
      endOfRecords: true,
      results: [...pts(180, -21.5, 14.6, 1.2, BY, 11), ...pts(30, -16.2, 12.3, 0.6, CC0, 12), ...pts(80, -22.6, 17.1, 0.3, NC, 13), ...pts(10, -33.9, 18.4, 0.1, BY, 14)]
    },
    [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=${key}&mediaType`]: { count: 0, endOfRecords: true, results: [] },
    'https://www.wikidata.org/w/api.php?action=query&format=json&list=search': { query: { search: [{ title: 'Q159760' }] } }, // found by GBIF key (P846)
    'https://www.wikidata.org/w/api.php?action=wbsearchentities': { search: [{ id: 'Q159760', label: 'Welwitschia mirabilis' }] },
    'https://www.wikidata.org/w/api.php?action=wbgetentities': {
      entities: { Q159760: { claims: { P5037: [{ mainsnak: { datavalue: { value: 'urn:lsid:ipni.org:names:30001306-2' } } }], P3151: [{ mainsnak: { datavalue: { value: '75434' } } }], P373: [{ mainsnak: { datavalue: { value: 'Welwitschia mirabilis' } } }] }, sitelinks: { enwiki: { title: 'Welwitschia' } } } }
    },
    'https://en.wikipedia.org/api/rest_v1/page/summary/Welwitschia': { title: 'Welwitschia', type: 'standard', extract: 'Welwitschia is a monotypic genus of gymnosperms, the sole described species being the distinctive Welwitschia mirabilis, endemic to the Namib desert within Namibia and Angola. (Fixture text standing in for the CC BY-SA extract.)', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Welwitschia' } } },
    [`${INAT}/observations?taxon_id=75434&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false`]: inatObs(75434, 9, 7, false),
    [`${INAT}/observations?taxon_id=75434&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=true`]: inatObs(75434, 3, 8, true),
    'https://commons.wikimedia.org/w/api.php': { query: { pages: { '1': { title: 'File:Welwitschia mirabilis fixture.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/Welwitschia_fixture.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/xx/Welwitschia_fixture.jpg/800px-Welwitschia_fixture.jpg', width: 3000, height: 2000, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Welwitschia_mirabilis_fixture.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' }, Artist: { value: '<a href="#">Fixture Photographer</a>' } } }] } } } },
    'https://api.openalex.org/works': { results: [{ title: 'The biology of Welwitschia mirabilis (fixture)', publication_year: 2001, doi: 'https://doi.org/10.0000/fixture.1', authorships: [{ author: { display_name: 'A. Botanist' } }], primary_location: { source: { display_name: 'Fixture Journal of Botany' } } }] }
  };
}

export function copiapoa(): Record<string, unknown> {
  const key = 5384013;
  return {
    [`${GBIF}/species/match?strict=false&name=Copiapoa%20cinerea`]: { usageKey: key, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', matchType: 'EXACT' },
    [`${GBIF}/species/${key}/synonyms`]: { results: [{ scientificName: 'Echinocactus cinereus Phil.' }] },
    [`${GBIF}/species/${key}/vernacularNames`]: { results: [] },
    [`${GBIF}/species/${key}/distributions`]: { results: [{ locationId: 'TDWG:CLN', locality: 'Chile North', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants' }] },
    [`${GBIF}/species/${key}`]: { key, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', canonicalName: 'Copiapoa cinerea', authorship: '(Phil.) Britton & Rose', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', phylum: 'Tracheophyta', class: 'Magnoliopsida', order: 'Caryophyllales', family: 'Cactaceae', genus: 'Copiapoa' },
    // 52 open records in habitat, 300 restricted records 400 km south (roadsides, gardens) — the README's clean case.
    [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=${key}&hasCoordinate`]: { count: 352, endOfRecords: true, results: [...pts(52, -24.9, -70.4, 0.4, BY, 21), ...pts(300, -28.6, -70.8, 0.5, NC, 22)] },
    [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=${key}&mediaType`]: { count: 0, endOfRecords: true, results: [] },
    'https://www.wikidata.org/w/api.php?action=query&format=json&list=search': { query: { search: [{ title: 'Q5168360' }] } },
    'https://www.wikidata.org/w/api.php?action=wbsearchentities': { search: [{ id: 'Q5168360', label: 'Copiapoa cinerea' }] },
    'https://www.wikidata.org/w/api.php?action=wbgetentities': { entities: { Q5168360: { claims: { P3151: [{ mainsnak: { datavalue: { value: '135254' } } }] }, sitelinks: { enwiki: { title: 'Copiapoa cinerea' } } } } },
    'https://en.wikipedia.org/api/rest_v1/page/summary/Copiapoa_cinerea': { title: 'Copiapoa cinerea', type: 'standard', extract: 'Copiapoa cinerea is a species of cactus from northern Chile. (Fixture text.)', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Copiapoa_cinerea' } } },
    [`${INAT}/observations?taxon_id=135254&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false`]: inatObs(135254, 14, 9, false),
    [`${INAT}/observations?taxon_id=135254&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=true`]: inatObs(135254, 6, 10, true),
    'https://api.openalex.org/works': { results: [] }
  };
}

/** A species whose occurrence source refuses: the page must say "could not check", never "none". */
export function refused(): Record<string, unknown> {
  const key = 999;
  return {
    [`${GBIF}/species/match?strict=false&name=Refusia%20testii`]: { usageKey: key, scientificName: 'Refusia testii', matchType: 'EXACT' },
    [`${GBIF}/species/${key}/synonyms`]: { results: [] },
    [`${GBIF}/species/${key}/vernacularNames`]: { results: [] },
    [`${GBIF}/species/${key}/distributions`]: { results: [{ locationId: 'TDWG:NAM', locality: 'Namibia', establishmentMeans: 'NATIVE', source: 'WCVP' }] },
    [`${GBIF}/species/${key}`]: { key, scientificName: 'Refusia testii', canonicalName: 'Refusia testii', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', family: 'Testaceae', genus: 'Refusia' },
    [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search`]: { __status: 'refused', status: 'refused', detail: 'api.gbif.org 429' },
    'https://www.wikidata.org/w/api.php?action=query&format=json&list=search': { query: { search: [] } },
    'https://www.wikidata.org/w/api.php?action=wbsearchentities': { search: [] },
    'https://en.wikipedia.org/api/rest_v1/page/summary/Refusia_testii': null,
    [`${INAT}/taxa?q=Refusia%20testii`]: { results: [] },
    'https://commons.wikimedia.org/w/api.php': null,
    'https://api.openalex.org/works': null
  };
}
