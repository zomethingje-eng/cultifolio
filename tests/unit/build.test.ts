import { describe, it, expect } from 'vitest';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { welwitschia, copiapoa, refused } from '../../fixtures/upstream';

const opts = (table: Record<string, unknown>) => ({ fetcher: fixtureFetcher(table), builtBy: 'node' as const, now: () => new Date('2026-09-14T12:00:00Z') });

describe('dossier builder', () => {
  it('builds Welwitschia with licence-filtered evidence and photos', async () => {
    const r = await buildDossier('Welwitschia', opts(welwitschia()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.dossier;
    expect(d.slug).toBe('welwitschia-mirabilis');
    expect(d.name.family).toBe('Welwitschiaceae');
    expect(d.distribution.native.map((n) => n.code)).toEqual(['NAM', 'ANG']);
    // 210 open records in range, 80 restricted in range, 10 open outside (Cape Town)
    expect(d.occurrences.nOpenInRange).toBe(210);
    expect(d.occurrences.nRestrictedInRange).toBe(80);
    expect(d.occurrences.nOutsideRange).toBe(10);
    expect(d.occurrences.open.every((p) => p[5] === 'by' || p[5] === 'cc0')).toBe(true);
    expect(d.centroid?.lat).toBeCloseTo(-21.5, 0);
    expect(d.climate.status).toBe('pending'); // no provider in M1
    expect(d.photos.length).toBe(12); // 9 wild + 3 cultivated; Commons only consulted below 12
    expect(d.photos.every((p) => ['cc0', 'by', 'by-sa'].includes(p.licence))).toBe(true);
    expect(d.photos.filter((p) => p.captive).length).toBe(3);
    expect(d.summary?.licence).toBe('CC BY-SA 4.0');
    expect(d.links.powo).toContain('powo.science.kew.org');
    expect(d.literature.length).toBe(1);
    expect(d.upstream['gbif.occurrences'].status).toBe('ok');
  });

  it('Copiapoa: every in-range coordinate informs the centre; the open-only shift is measured', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.dossier;
    expect(d.occurrences.nOpenInRange).toBe(52);
    expect(d.occurrences.nRestrictedInRange).toBe(300);
    expect(d.centroid?.lat).toBeCloseTo(-28.6, 0); // the 300 restricted records outweigh the 52 open ones
    expect(d.centroid?.n).toBeGreaterThan(52);
    expect(d.centroid?.how).toMatch(/all 352 in-range records/);
    expect(d.occurrences.restrictedShiftKm).toBeGreaterThan(300);
    expect(d.occurrences.restrictedShiftKm).toBeLessThan(500);
    expect(d.occurrences.datasets.find((x) => x.licence === 'nc')?.n).toBe(300);
  });

  it('a refusal is not an absence', async () => {
    const r = await buildDossier('Refusia testii', opts(refused()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.dossier;
    expect(d.upstream['gbif.occurrences'].status).toBe('refused');
    expect(d.climate.status).toBe('refused');
    expect(d.occurrences.nOpenInRange).toBe(0);
    expect(d.upstream['wikipedia'].status).toBe('none');
    expect(d.centroid).toBeUndefined();
  });

  it('refuses to build when the backbone refuses', async () => {
    const r = await buildDossier('Anything', { fetcher: fixtureFetcher({}), builtBy: 'node' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('backbone-refused');
  });

  it('reports an unresolved name as such', async () => {
    const r = await buildDossier('Nonsensia', { fetcher: fixtureFetcher({ 'https://api.gbif.org/v1/species/match': { matchType: 'NONE' } }), builtBy: 'node' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('name-unresolved');
  });

  it('refuses a subspecies that the backbone only matched to its species', async () => {
    const table = copiapoa();
    table['https://api.gbif.org/v1/species/match?strict=false&name=Copiapoa%20cinerea%20subsp.%20alboviridis'] = { usageKey: 5384013, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', canonicalName: 'Copiapoa cinerea', rank: 'SPECIES', matchType: 'FUZZY' };
    const r = await buildDossier('Copiapoa cinerea subsp. alboviridis', opts(table));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('higher-rank-only');
  });
});
