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
    expect(d.centroid?.how).toMatch(/of the 352 in-range records/);
    expect(d.occurrences.restrictedShiftKm).toBeGreaterThan(300);
    expect(d.occurrences.restrictedShiftKm).toBeLessThan(500);
    expect(d.occurrences.datasets.find((x) => x.licence === 'nc')?.n).toBe(300);
  });

  it('a name the backbone holds as a synonym is followed to the species it accepts, and the page says so', async () => {
    // Asked for Echinocactus cinereus: the backbone places it (a synonym, key 999) and points at Copiapoa cinerea.
    const fx = copiapoa();
    const GBIF = 'https://api.gbif.org/v1';
    fx[`${GBIF}/species/match?strict=false&name=Echinocactus%20cinereus`] = { usageKey: 999, scientificName: 'Echinocactus cinereus Phil.', canonicalName: 'Echinocactus cinereus', matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', acceptedUsageKey: 5384013 };
    fx[`${GBIF}/species/999`] = { key: 999, scientificName: 'Echinocactus cinereus Phil.', canonicalName: 'Echinocactus cinereus', rank: 'SPECIES', taxonomicStatus: 'SYNONYM', acceptedKey: 5384013, family: 'Cactaceae', genus: 'Echinocactus' };
    const r = await buildDossier('Echinocactus cinereus', opts(fx));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.key).toBe(5384013);
    expect(r.dossier.name.scientific).toBe('Copiapoa cinerea');
    expect(r.dossier.name.status).toBe('accepted');
    expect(r.dossier.upstream['gbif.accepted']?.detail).toMatch(/followed from Echinocactus cinereus/);
    expect(r.dossier.occurrences.nOpenInRange).toBe(52); // the accepted taxon's records, not the synonym's
  });

  it('an accepted subspecies reached through a synonym is taken up to its species', async () => {
    const fx = copiapoa();
    const GBIF = 'https://api.gbif.org/v1';
    fx[`${GBIF}/species/match?strict=false&name=Copiapoa%20columna-alba`] = { usageKey: 998, scientificName: 'Copiapoa columna-alba Ritter', canonicalName: 'Copiapoa columna-alba', matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', acceptedUsageKey: 997 };
    fx[`${GBIF}/species/998`] = { key: 998, scientificName: 'Copiapoa columna-alba Ritter', canonicalName: 'Copiapoa columna-alba', rank: 'SPECIES', taxonomicStatus: 'SYNONYM', acceptedKey: 997 };
    fx[`${GBIF}/species/997`] = { key: 997, scientificName: 'Copiapoa cinerea subsp. columna-alba (Ritter) D.R.Hunt', canonicalName: 'Copiapoa cinerea columna-alba', rank: 'SUBSPECIES', taxonomicStatus: 'ACCEPTED', speciesKey: 5384013, species: 'Copiapoa cinerea' };
    const r = await buildDossier('Copiapoa columna-alba', opts(fx));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.key).toBe(5384013);
    expect(r.dossier.name.scientific).toBe('Copiapoa cinerea');
    expect(r.dossier.upstream['gbif.accepted']?.detail).toMatch(/followed from Copiapoa columna-alba, which the backbone holds as a synonym, a synonym of Copiapoa cinerea columna-alba/);
  });

  it('a range that is only reported, never stated native, gets a map but no habitat climate', async () => {
    // The Haworthia limifolia case from the review: national checklists list presence with no native status.
    const fx = copiapoa();
    const key = 5384013;
    fx[`https://api.gbif.org/v1/species/${key}/distributions`] = { results: [{ country: 'CL', locality: 'Chile', source: 'Checklist of the plants of Chile' }, { country: 'TW', locality: 'Taiwan', establishmentMeans: 'INTRODUCED', source: 'Checklist of Taiwan' }] };
    const r = await buildDossier('Copiapoa cinerea', opts(fx));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.dossier;
    expect(d.distribution.native).toHaveLength(0); // an unmarked checklist row is not promoted to native
    expect(d.distribution.reported?.map((x) => x.name)).toEqual(['Chile']);
    expect(d.distribution.introduced.map((x) => x.name)).toEqual(['Taiwan']);
    expect(d.distribution.verified).toBe(false);
    expect(d.centroid).toBeUndefined();
    expect(d.climate.status).toBe('none');
    expect('detail' in d.climate && d.climate.detail).toMatch(/native range not verified/);
    expect(d.occurrences.open.length).toBeGreaterThan(0); // the map still has its points
  });
  it('the published centre is an openly licensed record or a grid point, never a restricted coordinate', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    if (!r.ok) throw new Error('build failed');
    const d = r.dossier;
    // The densest cluster is the 300 restricted records; no open record lies in it, so the centre is a grid point.
    expect(d.centroid?.how).toMatch(/tenth-degree cell/);
    expect(Math.round(Math.abs(d.centroid!.lat) * 100) % 10).toBe(5); // a cell centre, x.x5
    expect(d.occurrences.open.some((p) => p[0] === d.centroid!.lat && p[1] === d.centroid!.lon)).toBe(false);
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

describe('photographs from the download', () => {
  it('replace the previous GBIF set and keep iNaturalist and Commons in front; an empty set changes nothing', async () => {
    const { photosFromMedia, mergeGbifPhotos } = await import('$dossier/build');
    const fresh = photosFromMedia([
      { id: '1:0', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/99/original.jpg', licence: 'by', creator: 'A', page: 'https://www.inaturalist.org/observations/1' },
      { id: '2:0', url: 'https://example.org/p.jpg', licence: 'cc0', page: 'https://www.gbif.org/occurrence/2' }
    ]);
    expect(fresh[0].thumb).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/99/medium.jpg');
    expect(fresh[0].attribution).toBe('A, CC BY, iNaturalist via GBIF');
    expect(fresh[1].thumb).toMatch(/^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/400x\//);
    const prev = [{ src: 'inat', id: 'i' }, { src: 'commons', id: 'c' }, { src: 'gbif', id: 'old' }] as never[];
    const merged = mergeGbifPhotos(prev, fresh);
    expect(merged.map((p) => p.id)).toEqual(['i', 'c', '1:0', '2:0']);
    expect(mergeGbifPhotos(prev, [])).toBe(prev);
  });
});

describe('round five: deduplication keeps the precise record', () => {
  it('at one coordinate, the same licence class, the lower uncertainty wins; an open record still beats a restricted one', async () => {
    const { copiapoa } = await import('../../fixtures/upstream');
    const { buildDossier } = await import('$dossier/build');
    const { fixtureFetcher } = await import('$dossier/fetch');
    const table = copiapoa();
    const occUrl = Object.keys(table).find((k) => k.includes("occurrence/search") && k.includes("hasCoordinate"))!;
    const page = table[occUrl] as { results: Array<Record<string, unknown>> };
    const base = page.results[0];
    page.results = [
      { ...base, key: 9001, decimalLatitude: -25.3, decimalLongitude: -70.5, coordinateUncertaintyInMeters: 100000, license: 'http://creativecommons.org/licenses/by/4.0/legalcode' },
      { ...base, key: 9002, decimalLatitude: -25.3, decimalLongitude: -70.5, coordinateUncertaintyInMeters: 1000, license: 'http://creativecommons.org/licenses/by/4.0/legalcode' },
      { ...base, key: 9003, decimalLatitude: -25.31, decimalLongitude: -70.51, coordinateUncertaintyInMeters: 10, license: 'http://creativecommons.org/licenses/by-nc/4.0/legalcode' },
      { ...base, key: 9004, decimalLatitude: -25.31, decimalLongitude: -70.51, coordinateUncertaintyInMeters: 50000, license: 'http://creativecommons.org/licenses/by/4.0/legalcode' }
    ];
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(table), builtBy: 'node', quick: true });
    if (!r.ok) throw new Error(r.reason);
    // Two open points survive, one per coordinate: the 1 km one at the first, the open one at the second.
    const open = r.dossier.occurrences.open.map((p) => `${p[0]},${p[1]}`);
    expect(open).toEqual(['-25.3,-70.5', '-25.31,-70.51']);
    expect(r.dossier.occurrences.nOpenInRange).toBe(2);
    expect(r.dossier.occurrences.nRestrictedInRange).toBe(0); // the restricted 10 m record lost to the open one at its coordinate
    expect(r.dossier.occurrences.nVague).toBe(1); // 9004 at 50 km stays on the map and off the climate; 9002 at 1 km does not
  });
});
