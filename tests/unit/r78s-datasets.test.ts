/**
 * Round seventy-eight, agent S: the dataset rule (the owner's decision 1: genebank and germplasm datasets are not
 * counted), on recorded metadata of real GBIF datasets holding living-specimen records of plants (dataset/<key> and the
 * publisher's organization/<key>, read 2026-10-19). On the base the module is missing and every test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyDataset, plain, DATASET_RULE, type DatasetFacts } from '../../scripts/select-species-lib';

const recorded = JSON.parse(readFileSync('tests/unit/fixtures/r78s/gbif-datasets.json', 'utf8')) as { datasets: Array<DatasetFacts & { records: number }> };
const byTitle = (t: string) => {
  const d = recorded.datasets.find((x) => x.title.startsWith(t));
  if (!d) throw new Error(`no recorded dataset "${t}"`);
  return classifyDataset(d);
};

describe('the dataset rule', () => {
  it('excludes a genebank by a word of its own title, keywords, publisher or description', () => {
    expect(byTitle('Svalbard Global Seed Vault')).toEqual({ side: 'excluded', reason: 'title has "seed vault" (seed bank)' });
    expect(byTitle('Bioversity Collecting Mission')).toEqual({ side: 'excluded', reason: 'keywords has "germplasm" (germplasm)' });
    expect(byTitle('CZE National PGR Inventory')).toEqual({ side: 'excluded', reason: 'title has "pgr" (genetic resources)' });
    // A botanic garden's seed bank is a seed bank: the genebank words are read first, and in the description too.
    expect(byTitle('Records of the WA Seed Technology Centre')).toEqual({ side: 'excluded', reason: 'description has "seed bank" (seed bank)' });
    expect(byTitle('Museu de Ciències Naturals de Barcelona: BGJBB')).toEqual({ side: 'excluded', reason: 'keywords has "germoplasma" (germplasm)' });
    // A field genebank of clones grown outdoors is a genebank (FAO's field genebank).
    expect(byTitle('Clonal Citrus trees collection').side).toBe('excluded');
  });
  it('counts a living collection named in the title, keywords or publisher', () => {
    expect(byTitle('Royal Botanic Garden Edinburgh Living')).toEqual({ side: 'counted', reason: 'title has "botanic garden" (botanic garden)' });
    expect(byTitle('Colección Viva del Jardín Botánico de Bogotá')).toEqual({ side: 'counted', reason: 'title has "jardin botanico" (botanic garden)' });
    expect(byTitle('SBT-Living')).toEqual({ side: 'counted', reason: 'publisher has "botanic garden" (botanic garden)' });
    expect(byTitle('Images and observations of mostly edible plants in Stephen Barstow')).toEqual({ side: 'counted', reason: 'title has "garden" (garden)' });
  });
  it('leaves undecided, and so uncounted, what names neither: a street-tree register, a vegetation survey', () => {
    expect(byTitle('Straßen- und Anlagenbaumbestand Berlin').side).toBe('not decided');
    expect(byTitle('Vegetation Records for Forest GPs').side).toBe('not decided');
  });
  it('decides the borderline cases by the words, as the report lists them', () => {
    // A survey of the soil's seed bank is excluded on the word; it would not be counted either way.
    expect(byTitle('Seed bank and bryophyte propagule content').side).toBe('excluded');
    // A herbarium under a garden's name is counted (two records in all).
    expect(byTitle('Desert Botanical Garden Herbarium').side).toBe('counted');
  });
  it('reads whole words, accents and markup aside, and never a word inside another', () => {
    expect(plain('<p>Banco de Germoplasma &amp; Jardín Botánico</p>')).toBe('banco de germoplasma jardin botanico');
    const d = (title: string, description = ''): DatasetFacts => ({ key: 'k', title, description, type: 'OCCURRENCE', publisher: '', keywords: [] });
    expect(classifyDataset(d('Regardens of Kew')).side).toBe('not decided'); // "gardens" inside a word
    expect(classifyDataset(d('Arboretum Trompenburg')).side).toBe('counted');
    expect(classifyDataset(d('The garden', 'a seedbank of local varieties')).side).toBe('excluded');
    expect(classifyDataset(d('Hortus botanicus Leiden')).side).toBe('counted');
    expect(classifyDataset(d('Gene bank of the institute')).side).toBe('excluded');
  });
  it('is one sentence, and names its sources', () => {
    expect(DATASET_RULE.split(/\.\s/).length).toBe(1);
    expect(DATASET_RULE).toMatch(/FAO Genebank Standards 2014/);
    expect(DATASET_RULE).toMatch(/BGCI/);
  });
});
