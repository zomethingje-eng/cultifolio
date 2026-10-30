/**
 * Round eighty, agent O: the about pages' general sentences that review C found untrue (3, 4, 5), and the sitemap's
 * lifetimes after review C 2, held to the code.
 *
 * On r80f: both pages say 32 hash groups (the live corpus has 256), /about/how says the edge keeps "not found" and the
 * old-name redirect, and it names no error report though Cloudflare's NEL headers are on every answer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BUCKETS, PER_BUCKET, bucketsFor } from '$core/bucket';
import { SITEMAP_INDEX_CACHE, SITEMAP_FILE_CACHE } from '$lib/server/sitemap';

const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('the hash groups are told by their rule, not by one size\'s count (review C 3)', () => {
  it('no page, nor the README, gives 32 as the present count', () => {
    for (const [name, t] of [['how', how], ['formats', formats], ['README', readFileSync('README.md', 'utf8')]] as const) {
      expect(t, name).not.toMatch(/32 groups at its present size|32 at the catalogue's present size|one of 32 at the present size|roughly three hundred species/);
    }
  });
  it('the bounds the pages give are the rule\'s, and the rule gives 256 groups of about 189 at the live 48,361', () => {
    expect(how).toContain(`groups of at most ${PER_BUCKET} species, and of at least about ${PER_BUCKET / 2} once it holds more than ${((BUCKETS * PER_BUCKET) / 2).toLocaleString('en-GB')}`);
    expect(formats).toContain(`a power of two from ${BUCKETS}, the smallest that keeps a group at ${PER_BUCKET} species or fewer`);
    expect(bucketsFor(48_361)).toBe(256);
    expect(Math.round(48_361 / 256)).toBe(189);
  });
});

describe('what the edge keeps (review C 2 and 4)', () => {
  it('the sitemap: the index five minutes, its files a day under the corpus\'s address', () => {
    expect(SITEMAP_INDEX_CACHE).toBe('public, max-age=300');
    expect(SITEMAP_FILE_CACHE).toBe('public, max-age=86400');
    expect(how).toContain("the sitemap's index for five minutes, and each of its files for a day under an address that names the reference's version");
    expect(how).not.toMatch(/the sitemaps, robots\.txt and the two world maps for a day/);
  });
  it('no sentence says the edge keeps a "not found" or an old name\'s redirect', () => {
    expect(how).not.toMatch(/answered "not found" from the edge's copy/);
    expect(how).not.toMatch(/except (the )?two answers to a species address/);
    expect(how).toContain('The edge keeps no error answer and no redirect to another page');
  });
});

describe("Cloudflare's network error logging (review C 5)", () => {
  it('the page names it, its host and what it reports, and that it is Cloudflare\'s setting, not the code\'s', () => {
    expect(how).toMatch(/Report-To and NEL/);
    expect(how).toContain('a.nel.cloudflare.com');
    expect(how).toContain("The site's code cannot remove these headers");
  });
  it('the code sets neither header anywhere, so the page is right to call them Cloudflare\'s', () => {
    for (const f of [...walk('src').filter((f) => /\.(ts|svelte|js)$/.test(f)), '_headers']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"](report-to|nel)['"]\s*[,:]|^\s*(Report-To|NEL):/im);
  });
});
