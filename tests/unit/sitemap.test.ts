import { describe, it, expect } from 'vitest';
import { sitemapUrls, sitemapIndex, sitemapChunk, SITEMAP_CHUNK } from '$lib/server/sitemap';
import type { IndexEntry } from '$lib/server/dossiers';

const entry = (i: number): IndexEntry => ({ key: i, slug: `genus${i % 7}-species${i}`, name: `Genus${i % 7} species${i}`, photos: 0, open: 0, climate: 'ok' });

describe('the sitemap is an index of files under the protocol cap (round forty, own)', () => {
  it('one file for the present corpus, with the species first; a corpus past the chunk gets a second file', () => {
    const small = sitemapUrls(Array.from({ length: 100 }, (_, i) => entry(i)));
    expect(small.slice(0, 4)).toEqual(['/', '/about/how', '/about/formats', '/species/genus0-species0']);
    expect(small.filter((u) => u.startsWith('/?by=genus&open='))).toHaveLength(7);
    expect(sitemapIndex(small)).toContain('https://cultifolio.com/sitemap-1.xml');
    expect(sitemapIndex(small)).not.toContain('sitemap-2.xml');
    expect(sitemapChunk(small, 1)).toContain('<loc>https://cultifolio.com/species/genus0-species0</loc>');
    expect(sitemapChunk(small, 1)).toContain('&amp;open=');
    const big = Array.from({ length: SITEMAP_CHUNK + 5 }, (_, i) => `/species/s${i}`);
    expect(sitemapIndex(big)).toContain('sitemap-2.xml');
    expect(sitemapChunk(big, 2).match(/<url>/g)).toHaveLength(5);
    expect(sitemapChunk(big, 1).match(/<url>/g)).toHaveLength(SITEMAP_CHUNK);
  });
});
