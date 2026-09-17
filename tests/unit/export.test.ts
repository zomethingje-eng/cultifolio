import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBundle, type Corpus } from '../../scripts/export-corpus-lib';

function fixtures(): Corpus {
  const index = JSON.parse(readFileSync('fixtures/dossiers/index.json', 'utf8'));
  const dossiers = new Map<number, Record<string, unknown>>();
  for (const r of index) dossiers.set(r.key, JSON.parse(readFileSync(`fixtures/dossiers/s/v1/${r.key}.json`, 'utf8')));
  return { index, dossiers, report: 'fixture report' };
}

describe('dataset bundle', () => {
  const b = buildBundle(fixtures(), { version: '2026.09', homepage: 'https://example.test', repo: 'https://example.test/repo', today: '2026-09-17' });

  it('carries every species as built, plus the flat files and the terms', () => {
    expect(b.species).toBe(3);
    expect(b.withClimate).toBe(1);
    expect(Object.keys(b.files).sort()).toEqual(['LICENSE.md', 'README.md', 'build-report.txt', 'climate.csv', 'index.json', 'species.csv', 'species/copiapoa-cinerea.json', 'species/refusia-testii.json', 'species/welwitschia-mirabilis.json']);
    expect(JSON.parse(b.files['species/copiapoa-cinerea.json']).name.scientific).toBe('Copiapoa cinerea');
  });

  it('species.csv has one row per species with derived columns filled only where derivable', () => {
    const lines = b.files['species.csv'].replace(/^﻿/, '').trim().split('\n');
    expect(lines).toHaveLength(4);
    const head = lines[0].split(',');
    const cop = Object.fromEntries(lines.find((l) => l.includes('Copiapoa cinerea'))!.split(',').map((v, i) => [head[i], v]));
    expect(cop.habitat_lat).toBe('-28.588');
    expect(cop.growing_season).toBe('winter');
    expect(cop.climate_status).toBe('ok');
    const ref = Object.fromEntries(lines.find((l) => l.includes('Refusia testii'))!.split(',').map((v, i) => [head[i], v]));
    expect(ref.climate_status).toBe('refused');
    expect(ref.growing_season).toBe('');
    expect(ref.annual_precip_mm).toBe('');
  });

  it('climate.csv has twelve rows per species with climate', () => {
    const lines = b.files['climate.csv'].replace(/^﻿/, '').trim().split('\n');
    expect(lines).toHaveLength(1 + 12 * 1);
    expect(lines[1].split(',').slice(0, 3)).toEqual(['5384013', 'Copiapoa cinerea', '1']);
  });

  it('README states the counts and the terms name every source', () => {
    expect(b.files['README.md']).toContain('3 species, 1 with a habitat climate');
    expect(b.files['README.md']).toContain('2026.09');
    for (const s of ['GBIF', 'World Checklist', 'CHELSA', 'NASA POWER', 'Wikipedia', 'iNaturalist', 'OpenAlex', 'CC BY-SA']) expect(b.files['LICENSE.md']).toContain(s);
  });
});
