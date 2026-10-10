/**
 * Round sixty-seven, the corpus builder and what it writes (triage-66 N4, N10, N11, N12): an offline re-derivation
 * writes "not asked", never "refused"; the download's silence about a species it never held keeps no photograph from
 * it; "already from the GBIF download" is never carried without those photographs; a rebuild that loses photographs or
 * turns a source refused fails; a carried status is left out of the sitemap's fingerprint; the median year's rain is
 * named as that; the genera file says Ceropegia is taken whole. Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { bulkFetcher } from '$dossier/bulk';
import { offlineFetcher, carryRederivedRows } from '$dossier/rederive';
import { dropsBetween, indexDrops } from '$dossier/drops';
import { substanceHash, restamp, stampOnBuild } from '$dossier/changed';
import { copiapoa } from '../../fixtures/upstream';
import { cultivationSheet } from '$core/sheet';

const opts = (fetcher: JsonFetcher) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-10T12:00:00Z') });

describe('N4: an offline re-derivation writes "not asked"', () => {
  const net = (async () => ({ status: 'ok', data: {} })) as unknown as JsonFetcher;
  it('the offline fetcher answers what it does not ask as skipped, with the host named', async () => {
    const f = offlineFetcher(net, () => null);
    const r = await f('https://api.gbif.org/v1/species/9476326/distributions?limit=100');
    expect(r).toEqual({ status: 'skipped', detail: 'api.gbif.org not asked: offline re-derivation' }); // base: refused
    // guard: POWER and the API path's occurrence search are still asked, and /species/{key} answered from the last build
    expect((await f('https://power.larc.nasa.gov/api/x')).status).toBe('ok');
    expect((await f('https://api.gbif.org/v1/occurrence/search?taxonKey=1&hasCoordinate=true&limit=300')).status).toBe('ok');
    const named = offlineFetcher(net, (k) => ({ key: k, scientific: 'Aeonium tabulaeforme', authorship: 'Webb & Berthel.' }));
    expect(await named('https://api.gbif.org/v1/species/9476326')).toMatchObject({ status: 'ok', data: { canonicalName: 'Aeonium tabulaeforme' } });
  });
  it('a distribution not asked leaves the climate pending, not refused, and the row skipped', async () => {
    const table = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(table)) if (/\/species\/\d+\/distributions$/.test(k)) table[k] = { __status: 'skipped', status: 'skipped', detail: 'api.gbif.org not asked: offline re-derivation' };
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.upstream['wcvp.distribution']).toMatchObject({ status: 'skipped', detail: 'api.gbif.org not asked: offline re-derivation' });
    expect(r.dossier.climate).toEqual({ status: 'pending', detail: 'the distribution source was not asked when this page was built, so the range could not be verified' });
    expect(r.dossier.upstream.climate.status).toBe('skipped');
    expect(JSON.stringify(r.dossier)).not.toMatch(/refused/);
  });
  it('the download\'s media answer for a species it left to the API path goes through to the source', async () => {
    const seen: string[] = [];
    const base = (async (url: string) => { seen.push(url); return { status: 'skipped', detail: 'api.gbif.org not asked: offline re-derivation' }; }) as unknown as JsonFetcher;
    const media = { page: () => null } as never;
    const url = (k: number) => `https://api.gbif.org/v1/occurrence/search?taxonKey=${k}&mediaType=StillImage&limit=300`;
    const f = bulkFetcher(base, { media, apiPath: new Set([9476326]) });
    expect((await f(url(9476326))).status).toBe('skipped'); // base: "ok" with no photograph, and the old set was dropped
    expect(seen).toHaveLength(1);
    expect(await f(url(1))).toMatchObject({ status: 'ok' }); // guard: a species the download holds is answered from it
    expect(seen).toHaveLength(1);
  });
});

describe('N4: "already from the GBIF download" is never carried without those photographs', () => {
  const claim = { status: 'skipped', at: '2026-09-25T00:00:00Z', detail: 'carried from build of 2026-09-20 (rederive); that build: not asked: 84 wild photographs already from the GBIF download' };
  const carried = (u: { detail?: string }) => `carried (rederive); that build: ${u.detail}`;
  it('without them the row says the source is to be asked again, and fill inat will', () => {
    const d = { upstream: { 'inat.photos.wild': { status: 'skipped' } } as Record<string, { status: string; detail?: string }>, photos: [] as Array<{ src: string; captive?: boolean }> };
    carryRederivedRows({ upstream: { 'inat.photos.wild': claim } }, d, carried, '2026-10-10T00:00:00Z');
    expect(d.upstream['inat.photos.wild'].status).toBe('skipped');
    expect(d.upstream['inat.photos.wild'].detail).not.toMatch(/already from the GBIF download/);
    expect(d.upstream['inat.photos.wild'].detail).not.toMatch(/^not asked/); // so `--fill inat` asks it
  });
  it('guard: with them, carried as before', () => {
    const d = { upstream: { 'inat.photos.wild': { status: 'skipped' } } as Record<string, { status: string; detail?: string }>, photos: [{ src: 'gbif' }] };
    carryRederivedRows({ upstream: { 'inat.photos.wild': claim } }, d, carried);
    expect(d.upstream['inat.photos.wild'].detail).toMatch(/already from the GBIF download/);
  });
  it('the rows of the one derivation are never carried one by one', () => {
    const d = { upstream: { 'wcvp.distribution': { status: 'skipped', detail: 'api.gbif.org not asked: offline re-derivation' }, climate: { status: 'skipped' } } as Record<string, { status: string; detail?: string }>, photos: [] };
    carryRederivedRows({ upstream: { 'wcvp.distribution': { status: 'ok' }, climate: { status: 'ok' } } }, d, carried);
    expect(d.upstream['wcvp.distribution'].status).toBe('skipped');
    expect(d.upstream.climate.status).toBe('skipped');
  });
});

describe('N4: the audit fails on a drop to no photographs or a turn to refused', () => {
  it('between two dossiers', () => {
    expect(dropsBetween({ photos: [1, 2, 3, 4, 5, 6], climate: { status: 'ok' }, upstream: { 'wcvp.distribution': { status: 'ok' } } }, { photos: [], climate: { status: 'refused' }, upstream: { 'wcvp.distribution': { status: 'refused' } } }))
      .toEqual(['photographs dropped to none (6 before)', 'climate turned refused (ok before)', 'wcvp.distribution turned refused (ok before)']);
    expect(dropsBetween({ photos: [1], climate: { status: 'ok' } }, { photos: [1], climate: { status: 'pending' }, upstream: { 'wcvp.distribution': { status: 'skipped' } } })).toEqual([]); // guard
  });
  it('between two indexes', () => {
    const before = [{ key: 1, name: 'Sprekelia formosissima', photos: 84, climate: 'ok' }, { key: 2, name: 'Aeonium tabulaeforme', photos: 6, climate: 'ok' }];
    const after = [{ key: 1, name: 'Sprekelia formosissima', photos: 0, climate: 'ok' }, { key: 2, name: 'Aeonium tabulaeforme', photos: 6, climate: 'refused' }];
    expect(indexDrops(before, after)).toEqual(['Sprekelia formosissima: photographs dropped to none (84 before)', 'Aeonium tabulaeforme: climate turned refused (ok before)']);
  });
  it('the builder offers --keys and fails its run on a loss', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(src).toMatch(/args\.indexOf\('--keys'\)/);
    expect(src).toMatch(/dropsBetween\(prevFile, d\)/);
    expect(src).toMatch(/process\.exitCode = 1/);
  });
});

describe('N10: an offline re-derivation no longer moves a page\'s day', () => {
  const base = { key: 1, built: '2026-10-09T00:00:00Z', climate: { status: 'ok' }, photos: [], changed: { on: '2026-09-20', h: '' } };
  const prev = { ...base, upstream: { 'wcvp.distribution': { status: 'ok', detail: 'WCVP' }, 'gbif.media': { status: 'ok' } } };
  prev.changed.h = substanceHash(prev);
  it('rows it carries keep their status, and the day stays (guard: the rule of round sixty-three)', () => {
    const next = { ...prev, built: '2026-10-12T00:00:00Z', upstream: { 'wcvp.distribution': { status: 'ok', detail: 'carried from build of 2026-09-20 as one snapshot; this build: wcvp.distribution skipped' }, 'gbif.media': { status: 'ok', detail: 'carried from build of 2026-09-20 (rederive)' } } };
    expect(stampOnBuild(next, prev).on).toBe('2026-09-20');
    expect(restamp({ ...next, changed: prev.changed }, '2026-10-12')).toBeNull();
  });
  it('the flip came from "refused" written for a source not asked, which the offline fetcher no longer writes', async () => {
    const refusedThen = { ...prev, built: '2026-10-12T00:00:00Z', upstream: { ...prev.upstream, 'wcvp.distribution': { status: 'refused', detail: 'api.gbif.org not asked: offline re-derivation' } } };
    expect(stampOnBuild(refusedThen, prev).on).toBe('2026-10-12'); // what the base's offline run did to a page's day
    const f = offlineFetcher((async () => ({ status: 'ok', data: {} })) as unknown as JsonFetcher, () => null);
    expect((await f('https://api.gbif.org/v1/species/1/distributions')).status).toBe('skipped');
  });
});

describe('N11: the median year\'s rain is named as that', () => {
  it('the season reading\'s long sentence beside the glance card (Aloidendron dichotomum: 133 mm at the top, 114 here)', () => {
    const dry = Array.from({ length: 12 }, (_, i) => ({ tmax: 30 - (i % 6), tmin: 12 + (i % 5), tmean: 21, precipMm: [5, 8, 14, 12, 10, 9, 8, 9, 10, 12, 9, 8][i] }));
    const { rows } = cultivationSheet({ scientific: 'Aloidendron dichotomum', family: 'Asphodelaceae', months: dry, lat: -28, annualP50: 133 } as Parameters<typeof cultivationSheet>[0]);
    const s = rows.find((r) => r.k === 'Its year')!.s;
    expect(s).toMatch(/^Rain at the habitat is 114 mm in the median year \(across the grid cells of the range, CHELSA\)\./); // base: "114 mm a year"
    expect(s).not.toMatch(/ a year/);
  });
  it('in the sheet\'s long sentence, the climograph\'s description and the glance and share card\'s month count', () => {
    const sheet = readFileSync('src/lib/core/sheet.ts', 'utf8');
    expect(sheet).not.toMatch(/Rain at the habitat is \$\{RAIN\(year\.annualMm\)\} a year/);
    expect(sheet).not.toMatch(/70% of the year's rain/);
    expect(readFileSync('src/lib/climate/climograph.ts', 'utf8')).toContain('of rain in the median year (the twelve monthly medians added)');
    expect(readFileSync('src/lib/ui/Climograph.svelte', 'utf8')).toContain('of rain in the median year (the twelve monthly medians added)');
    expect(readFileSync('src/lib/ui/ref/Glance.svelte', 'utf8')).toMatch(/or more`\} in the median year <span class="src">CHELSA/);
    expect(readFileSync('src/lib/share/card.ts', 'utf8')).toContain('or more in the median year · CHELSA');
  });
});

describe('N12: the genera file says Ceropegia is taken whole', () => {
  it('its header no longer lists Ceropegia among the genera not taken whole', () => {
    const head = readFileSync('scripts/specialist-genera.txt', 'utf8').split('\n').filter((l) => l.startsWith('#')).join('\n');
    expect(head).not.toMatch(/Very large genera \([^)]*Ceropegia/);
    expect(head).toMatch(/Ceropegia is here and taken whole/);
  });
});
