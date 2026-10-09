/**
 * Round sixty-three, C2 (REVIEW-TRIAGE-61's deferred list): each species page's sitemap date is the day its dossier last
 * changed in substance, carried in the index as a day number; a rebuild that changes nothing keeps the day, and an
 * entry without one falls back to the corpus's build day.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sitemapUrls, sitemapChunk, sitemapDays } from '$lib/server/sitemap';
import { stampOnBuild, restamp, substanceHash, lastReading, dayNumber, dayIso } from '$dossier/changed';
import { parseDossier } from '$dossier/schema';
import type { IndexEntry } from '$lib/server/dossiers';

const fixture = () => JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8')) as Record<string, unknown> & { built: string; upstream: Record<string, { status: string; at?: string; detail?: string }>; photos: unknown[] };
const e = (key: number, slug: string, name: string, changed?: number): IndexEntry => ({ key, slug, name, photos: 0, open: 0, climate: 'ok', ...(changed ? { changed } : {}) });

describe('the sitemap gives each species its own day', () => {
  it('a species with a day gets it, one without the build day; the fixed pages none; a genus row its latest species\' day', () => {
    const idx = [e(1, 'aloe-a', 'Aloe a', dayNumber('2026-03-01')), e(2, 'aloe-b', 'Aloe b', dayNumber('2026-05-07')), e(3, 'haworthia-c', 'Haworthia c')];
    const urls = sitemapUrls(idx);
    const xml = sitemapChunk(urls, 1, '2026-10-01', sitemapDays(idx));
    expect(xml).toContain('<loc>https://cultifolio.com/species/aloe-a</loc><lastmod>2026-03-01</lastmod>'); // base: 2026-10-01
    expect(xml).toContain('<loc>https://cultifolio.com/species/aloe-b</loc><lastmod>2026-05-07</lastmod>');
    expect(xml).toContain('<loc>https://cultifolio.com/species/haworthia-c</loc><lastmod>2026-10-01</lastmod>');
    expect(xml).toContain('<loc>https://cultifolio.com/?by=genus&amp;open=aloe</loc><lastmod>2026-05-07</lastmod>');
    expect(xml).toContain('<loc>https://cultifolio.com/?by=genus&amp;open=haworthia</loc><lastmod>2026-10-01</lastmod>');
    expect(xml).toContain('<url><loc>https://cultifolio.com/</loc></url>');
    // without the days (a route not passing them) every corpus page has the build day, as before
    expect(sitemapChunk(urls, 1, '2026-10-01')).toContain('<loc>https://cultifolio.com/species/aloe-a</loc><lastmod>2026-10-01</lastmod>');
  });
  it('the route passes the index\'s days', () => {
    expect(readFileSync('src/routes/sitemap-[n].xml/+server.ts', 'utf8')).toContain('sitemapDays(c.idx)');
  });
  it('day numbers are five digits and round-trip', () => {
    expect(dayNumber('2026-10-09')).toBe(20735);
    expect(dayIso(20735)).toBe('2026-10-09');
    expect(dayIso(undefined)).toBeNull();
    expect(dayNumber('2026-10-09T13:00:00Z')).toBe(20735);
  });
});

describe('the day a dossier last changed in substance', () => {
  it('a rebuild that changes only its dates and notes keeps the day', () => {
    const prev = { ...fixture(), changed: { on: '2026-02-03', h: '' } };
    prev.changed.h = substanceHash(prev);
    const next = structuredClone(prev) as typeof prev;
    next.built = '2026-10-09T10:00:00.000Z';
    for (const u of Object.values(next.upstream)) { u.at = '2026-10-09T10:00:00.000Z'; u.detail = 'carried from build of 2026-02-03 (rederive)'; }
    expect(stampOnBuild(next, prev)).toEqual({ on: '2026-02-03', h: prev.changed.h });
  });
  it('a rebuild that changes what the page shows moves it to the build day', () => {
    const prev = { ...fixture(), changed: { on: '2026-02-03', h: '' } };
    prev.changed.h = substanceHash(prev);
    const next = structuredClone(prev) as typeof prev;
    next.built = '2026-10-09T10:00:00.000Z';
    next.photos = next.photos.slice(1);
    expect(stampOnBuild(next, prev).on).toBe('2026-10-09');
    // a source that now answers is a change too
    const n2 = structuredClone(prev) as typeof prev;
    n2.built = '2026-10-09T10:00:00.000Z';
    n2.upstream.openalex = { status: 'refused', at: n2.built };
    expect(stampOnBuild(n2, prev).on).toBe('2026-10-09');
  });
  it('a previous file never stamped: its last reading, when nothing changed', () => {
    const prev = fixture();
    const next = structuredClone(prev);
    next.built = '2026-10-09T10:00:00.000Z';
    expect(stampOnBuild(next, prev).on).toBe(lastReading(prev));
    expect(lastReading(prev)).toBe(String(prev.built).slice(0, 10));
  });
  it('when the index is written: a stamp that holds is left, a changed file is stamped today, an unstamped one with its last reading', () => {
    const d = fixture();
    expect(restamp(d, '2026-10-09')).toEqual({ on: lastReading(d), h: substanceHash(d) });
    const stamped = { ...d, changed: { on: '2026-04-04', h: substanceHash(d) } };
    expect(restamp(stamped, '2026-10-09')).toBeNull();
    const filled = { ...stamped, photos: [] };
    expect(restamp(filled, '2026-10-09')).toEqual({ on: '2026-10-09', h: substanceHash(filled) });
  });
  it('the dossier schema keeps the stamp, and the index entry carries its day', () => {
    const p = parseDossier({ ...fixture(), changed: { on: '2026-04-04', h: 'abc' } });
    expect(p.changed).toEqual({ on: '2026-04-04', h: 'abc' });
    const s = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(s).toContain('d.changed = stampOnBuild(d, prevFile, sha1);');
    expect(s).toContain('const changed = dayNumber(d.changed?.on);');
    expect(s).toMatch(/function writeIndexFromDisk\(\): void \{\n {2}const index = uniqueSlugs\(scanDossiers\(true\)/);
  });
});
