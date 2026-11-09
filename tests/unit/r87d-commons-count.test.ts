/**
 * Round eighty-seven, the data agent: item 1. At round eighty-six's --keys stop (8 November) Ceropegia elegans [k502679]
 * lost its Commons files: the build asks Commons only while it holds fewer than twelve photographs, and it counted its 11
 * iNaturalist photographs with the same photographs again through GBIF, before `dedupePhotos` takes each once. Now the
 * count is of the photographs the page will show (`ownShown`): one copy of each, as `shownPhotos` reads them, and none the
 * last `--index` marked as held by another page too (`shared`). Ceropegia elegans is in scripts/rebuild-r87.txt.
 *
 * On r86 (db5a68d) the build test FAILED: twelve stored photographs, six of them shown, and Commons was not asked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDossier, ownShown, sharedOf, COMMONS_BELOW } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { photoIdentity } from '$dossier/photo-kind';
import type { Photo } from '$dossier/schema';
import { copiapoa } from '../../fixtures/upstream';

const inat = (id: number, src: 'inat' | 'gbif' = 'inat'): Photo => ({ src, id: `${src}:${id}`, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/original.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by', attribution: `(c) Observer ${id}, CC BY, iNaturalist` });

describe('ownShown: the photographs a page will show, before Commons is asked', () => {
  it("Ceropegia elegans's case: 11 iNaturalist photographs and the same 11 through GBIF are 11, not 22", () => {
    const photos = [...Array.from({ length: 11 }, (_, i) => inat(1000 + i)), ...Array.from({ length: 11 }, (_, i) => inat(1000 + i, 'gbif'))];
    expect(photos.length).toBeGreaterThanOrEqual(COMMONS_BELOW); // what r86 counted
    expect(ownShown(photos, null)).toBe(11);
    expect(ownShown(photos, null) < COMMONS_BELOW).toBe(true);
  });
  it("a photograph the last --index marked shared with another page is not counted: no page shows it", () => {
    const photos = Array.from({ length: 13 }, (_, i) => inat(2000 + i));
    const onDisk = { photos: photos.map((p, i) => (i < 2 ? { ...p, shared: ['k1' as const] } : p)) };
    const shared = sharedOf(onDisk);
    expect([...shared]).toEqual([photoIdentity(photos[0]), photoIdentity(photos[1])]);
    expect(ownShown(photos, null)).toBe(13);
    expect(ownShown(photos, null, shared)).toBe(11);
    expect(sharedOf(null).size).toBe(0);
  });
  it('a GBIF herbarium sheet is not counted, as the page does not show it', () => {
    const sheet: Photo = { src: 'gbif', id: 'g:1', url: 'https://specimens.kew.org/1.jpg', thumb: 'https://specimens.kew.org/1t.jpg', licence: 'by', attribution: 'Kew, CC BY, via GBIF', specimen: true };
    expect(ownShown([sheet, inat(3000)], null)).toBe(1);
  });
});

describe("the build asks Commons by the photographs it will show", () => {
  // Six iNaturalist photographs that GBIF's records carry twice each (two records of one observation): twelve rows, six photographs.
  const world = () => {
    const t = copiapoa() as Record<string, unknown>;
    const k = Object.keys(t).find((x) => x.includes('/occurrence/search') && x.includes('mediaType'))!;
    const media = (id: number) => [{ type: 'StillImage', identifier: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/original.jpg`, license: 'http://creativecommons.org/licenses/by/4.0/', creator: `Observer ${id}` }];
    t[k] = { count: 12, endOfRecords: true, results: Array.from({ length: 12 }, (_, i) => ({ key: 500 + i, basisOfRecord: 'HUMAN_OBSERVATION', datasetKey: 'd', media: media(7000 + (i % 6)) })) };
    return t;
  };
  it('twelve rows of six photographs: Commons is asked (r86: not asked)', async () => {
    const asked: string[] = [];
    const base = fixtureFetcher(world());
    const f: JsonFetcher = (async (url: string, o?: never) => { if (url.includes('commons.wikimedia.org')) { asked.push(url); return { status: 'none' }; } return base(url, o); }) as JsonFetcher;
    const r = await buildDossier('Copiapoa cinerea', { fetcher: f, builtBy: 'node', mediaFirst: true, skip: ['inat', 'wikipedia', 'openalex'], now: () => new Date('2026-11-08T12:00:00Z') });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.photos.filter((p) => p.src === 'gbif')).toHaveLength(6);
    expect(asked.length).toBeGreaterThan(0); // r86: 0
    expect(r.dossier.upstream.commons?.status).toBe('none');
  });
});

describe('scripts/rebuild-r87.txt', () => {
  it('lists Ceropegia elegans and the four pages put right by hand, one id a line as --keys reads it', () => {
    const lines = readFileSync('scripts/rebuild-r87.txt', 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const ids = lines.map((l) => l.split(/\s/)[0]);
    for (const id of ['k502679', 'k125305', 'k2920560', 'k362335', 'k2941308']) expect(ids).toContain(id);
    for (const l of lines) expect(l).toMatch(/^[kg][1-9]\d*(\s|$)/);
  });
});
