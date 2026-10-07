/** Round sixty-one (the corpus review, 15): the front page and the about pages carry no `lastmod`; the pages the corpus makes carry its build day. */
import { describe, it, expect } from 'vitest';
import { sitemapChunk, sitemapUrls } from '$lib/server/sitemap';

describe('the sitemap\'s lastmod', () => {
  it('is not given to the pages that change with a deploy, and is given to species and genus rows', () => {
    const urls = sitemapUrls([{ key: 1, slug: 'aloe-vera', name: 'Aloe vera', photos: 0, open: 0, climate: 'ok' }]);
    expect(urls).toEqual(['/', '/about/how', '/about/formats', '/species/aloe-vera', '/?by=genus&open=aloe']);
    const xml = sitemapChunk(urls, 1, '2026-10-01');
    for (const u of ['/', '/about/how', '/about/formats']) expect(xml).toContain(`<url><loc>https://cultifolio.com${u}</loc></url>`); // base: each had <lastmod>2026-10-01</lastmod>
    expect(xml).toContain('<url><loc>https://cultifolio.com/species/aloe-vera</loc><lastmod>2026-10-01</lastmod></url>');
    expect(xml).toContain('<url><loc>https://cultifolio.com/?by=genus&amp;open=aloe</loc><lastmod>2026-10-01</lastmod></url>');
  });
});
