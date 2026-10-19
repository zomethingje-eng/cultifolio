/**
 * The about pages' seams round sixty-nine adds (triage-68 P3, P5; R46-31 and S-E's seven sentences). Each sentence is
 * read whole beside the code that makes it true, or the code is read for what the sentence claims:
 *
 * - the photographs' addresses, as the pages load them, against the image policy (the CSP's img-src), not only that each
 *   policy host is named on the page;
 * - the Commons sizes /about/how names, against the widths the code asks Commons for;
 * - the Worker's own cache keys, which must carry the app's version, as /about/how now says they do;
 * - no `persist()` call outside the keep-data gate (`keep-ask.ts`);
 * - the browser's year-long cache of the sealed batches and photographs, the cached 404 and 302, the photograph sweep's
 *   listing and its seventh night, the example's one commit, and Workers Logs.
 *
 * Failed on the base: every sentence below was absent or said otherwise there, and the base's sizes sentence, cache keys
 * and the vault's own `persist()` call were what R46-31 and S-E found.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseDossier } from '$lib/dossier/schema';
import { photoAt, srcsetOf, shownAt, type PhotoSize } from '$lib/dossier/photo-size';
import { GEN_LIST_PAGES } from '$lib/server/photogen';
import { MARK_FAULT_NIGHTS } from '$lib/server/counters';
import { said, claim, numberWord, spanWords } from '../about-pages';

const raw = (f: string) => readFileSync(f, 'utf8');
const text = (f: string) => raw(f).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js)$/.test(f)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
/** The text from `start` up to (not including) `end`. */
function clause(t: string, start: string, end: string): string {
  const a = t.indexOf(start);
  expect(a, start).toBeGreaterThan(-1);
  const b = t.indexOf(end, a + start.length);
  expect(b, end).toBeGreaterThan(a);
  return t.slice(a, b);
}

/* ---- the photographs' addresses ---- */
const policy = new Set([...(/'img-src':\s*\[([^\]]*)\]/.exec(raw('svelte.config.js'))![1].matchAll(/https:\/\/([^'"]+)/g))].map((m) => m[1]));
const base = JSON.parse(raw('fixtures/dossiers/s/v3/k2735933.json'));
const C = 'https://upload.wikimedia.org/wikipedia/commons';
/** One photograph of each shape a dossier stores, each as its source gives it. */
const photos = [
  // iNaturalist: the large and the medium of its fixed sizes.
  { src: 'inat', id: '900', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/900/large.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/900/medium.jpg', width: 2048, licence: 'by', attribution: '(c) grower0, some rights reserved (CC BY)' },
  { src: 'inat', id: '901', url: 'https://static.inaturalist.org/photos/901/large.jpeg', thumb: 'https://static.inaturalist.org/photos/901/medium.jpeg', width: 1024, licence: 'cc0', attribution: 'grower1, no rights reserved (CC0)' },
  // GBIF from another dataset: that dataset's own address, shown from GBIF's image cache. (Round seventy-one, merge, C's
  // need: the host is not a herbarium's, since a GBIF photograph on a herbarium's host is no longer shown, S-C4.)
  { src: 'gbif', id: '1234:0', url: 'https://images.example-dataset.org/full/abc.jpg', thumb: 'https://api.gbif.org/v1/image/cache/fit-in/500x/occurrence/1234/media/0123456789abcdef0123456789abcdef', width: 1600, licence: 'by', attribution: 'A. Collector' },
  // Commons: a wide file at its 960-pixel thumbnail and its 500-pixel tile, and a narrow one at its own size.
  // Each in the form the build writes (its file title as the id, "<author>, <short licence>, via Wikimedia Commons"): since
  // the merge of round sixty-nine the read checks a Commons file's title and credit (triage-68 K1, K2), and drops one in no
  // form the build writes, so "c1" and a bare author left the page no Commons photograph to measure.
  { src: 'commons', id: 'File:Copiapoa cinerea in habitat.jpg', url: `${C}/thumb/a/ab/Copiapoa_cinerea_in_habitat.jpg/960px-Copiapoa_cinerea_in_habitat.jpg`, thumb: `${C}/thumb/a/ab/Copiapoa_cinerea_in_habitat.jpg/500px-Copiapoa_cinerea_in_habitat.jpg`, width: 3000, licence: 'by-sa', attribution: 'A. Photographer, CC BY-SA 4.0, via Wikimedia Commons' },
  { src: 'commons', id: 'File:Copiapoa cinerea plant.jpg', url: `${C}/c/cd/Copiapoa_cinerea_plant.jpg`, thumb: `${C}/c/cd/Copiapoa_cinerea_plant.jpg`, width: 420, licence: 'by', attribution: 'B. Photographer, CC BY 4.0, via Wikimedia Commons' }
];
const SIZES: PhotoSize[] = ['square', 'small', 'medium', 'large'];
/** Every address a page can load for a photograph: the shown one, its tile, each size of either, and the srcsets. */
function addresses(p: { url: string; thumb: string }): string[] {
  const out = new Set<string>([shownAt(p), p.thumb]);
  for (const u of [shownAt(p), p.thumb]) {
    for (const s of SIZES) out.add(photoAt(u, s));
    for (const part of (srcsetOf(u, SIZES) ?? '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean)) out.add(part);
  }
  return [...out];
}
const read = parseDossier({ ...base, photos });

describe('the photographs a page loads are on the image policy (R46-31)', () => {
  it('every address, of every shape, is on a host the CSP lets images come from', () => {
    expect(policy.size).toBe(4);
    expect(read.photos.length).toBeGreaterThan(0);
    const off = read.photos.flatMap(addresses).filter((u) => !policy.has(new URL(u).host));
    expect(off).toEqual([]);
  });
  it("another dataset's own address is never what a page loads", () => {
    const g = read.photos.find((p) => p.src === 'gbif')!;
    expect(addresses(g).some((u) => u.includes('example-dataset'))).toBe(false);
  });
});

// The Commons sizes, slot by slot, and an original's own width: read by the new method in r70p-about-rules.test.ts
// (round seventy; triage-69 P2, R47-13). C7 gave a small original a thumbnail, so this file's "own size" case no longer exists.

describe("the Worker's own cache keys carry the app's version, as /about/how says (S-E 2, R46-8; with W3)", () => {
  /** The five copies the Worker keeps under keys of its own, and where each key is made. */
  const FILES = ['src/routes/api/search/+server.ts', 'src/routes/api/sheets/+server.ts', 'src/routes/api/names/+server.ts', 'src/routes/api/forecast/+server.ts', 'src/lib/server/synonyms.ts'];
  it('every key names the build: through the one key maker, or in its own address', () => {
    const maker = (() => { try { return raw('src/lib/server/worker-cache.ts'); } catch { return ''; } })();
    const makerVersioned = /\$\{CACHE_HOST\}\/\$\{name\}\?v=\$\{encodeURIComponent\(version\)\}/.test(maker);
    for (const f of FILES) {
      const src = raw(f);
      const viaMaker = makerVersioned && /workerKey\(/.test(src);
      const own = [...src.matchAll(/new Request\(`https:\/\/cache\.cultifolio\/[^`]*`\)/g)].map((m) => m[0]);
      expect(viaMaker || (own.length > 0 && own.every((k) => /version/.test(k))), f).toBe(true);
    }
  });
  // Read for what it says, not word for word: W's own sentences for these lists are applied at the merge.
  it('the page says so in both lists', () => {
    expect([...how.matchAll(/server(?:'s| keeps its) own copies[^.;:]*?(?:under the app's version|name the app's version)/g)].length).toBeGreaterThanOrEqual(2);
    expect([...how.matchAll(/a new version is never answered from an old one's copies/g)].length).toBe(2);
  });
});

describe('the cached 404 and 302 of a species address (R46-8)', () => {
  const server = raw('src/routes/species/[slug]/+page.server.ts');
  it("the code's lifetimes", () => {
    expect(server).toMatch(/setHeaders\(\{ 'cache-control': 'public, max-age=86400' \}\);\n\s*redirect\(302, `\/species\/\$\{syn\.slug\}/);
    expect(server).toMatch(/setHeaders\(\{ 'cache-control': unchecked \? 'no-store' : 'public, max-age=300' \}\);/);
  });
  it('both lists say them, each with its lifetime (read by the method of round seventy, tests/about-pages.ts)', () => {
    const short = said('how', 'It keeps a forecast for a rounded site for an hour');
    expect(spanWords(claim(short, /a species address the reference does not hold, answered "not found", for (five minutes|an hour|a day)/)), short.where).toBe(300_000);
    expect(spanWords(claim(short, /the redirect from an older name to its species' page for (a day|an hour)/))).toBe(86_400_000);
    expect(short.text).toMatch(/not at all when GBIF could not be asked or a species' record could not be read/);
    const full = said('how', "Cloudflare's edge, in front of the server, keeps copies of public answers");
    expect(claim(full, /for five minutes \((public, max-age=\d+)/)).toBe('public, max-age=300');
    expect(claim(full, /older name to its species' page for a day \((public, max-age=\d+)\)/), full.where).toBe('public, max-age=86400');
    expect(full.text).toMatch(/not kept when GBIF could not be asked or a species' record could not be read/);
    expect(raw('src/routes/species/[slug]/+page.server.ts')).toMatch(/setHeaders\(\{ 'cache-control': records\.every\(Boolean\) \? 'public, max-age=300' : 'no-store' \}\);/);
  });
});

describe('the keep-data question is asked through the gate alone (R46-31)', () => {
  it('no persist() call anywhere but keep-ask.ts', () => {
    const calls = walk('src').filter((f) => /\.persist\(\)/.test(raw(f)));
    expect(calls).toEqual(['src/lib/ui/keep-ask.ts']);
  });
});

describe("the browser's year-long cache of the sealed batches and photographs (S-E 4)", () => {
  it('the routes say a year, privately and immutable', () => {
    for (const f of ['src/routes/api/sync/log/[key]/+server.ts', 'src/routes/api/sync/photo/[id]/+server.ts']) expect(raw(f), f).toMatch(/'cache-control': 'private, max-age=31536000, immutable'/);
  });
  it('/about/how lists them under the browser\'s HTTP cache', () => {
    expect(clause(how, "in the browser's own HTTP cache", '; and, while a page is open')).toMatch(/each sealed batch of your log and each sealed photograph this browser fetched from the vault \(encrypted, as the server holds them\), for a year/);
  });
});

describe("/about/formats on the server's sweep and listings, and the example (S-E 5 to 7, R46-10)", () => {
  it('the generations are listed five pages of a thousand at one look', () => {
    const s = said('formats', 'The generations are listed a thousand at a time');
    expect(numberWord(claim(s, /at most (\w+) thousand at one look/)), s.where).toBe(GEN_LIST_PAGES);
    expect(s.text).toMatch(/the mark stays until a listing that reached the end finds nothing unnamed/);
  });
  it('the seventh night is counted as a fault, and no log keeps it', () => {
    const s = said('formats', 'A photograph the sweep cannot read');
    expect(numberWord(claim(s, /after (\w+) such nights its mark is dropped/)), s.where).toBe(MARK_FAULT_NIGHTS);
    expect(raw('src/lib/server/counters.ts')).toMatch(/await this\.faultThere\('sweep', now\);/);
    expect(raw('wrangler.jsonc')).toMatch(/"observability"\s*:\s*\{\s*"enabled"\s*:\s*false\s*\}/);
    expect(s.text).toMatch(/by kind alone \(Cloudflare's request logs are off, so no log keeps its name\)/);
    expect(said('how', "The server's faults").text).toMatch(/Cloudflare's own request logs \(Workers Logs\) are off\./);
  });
  it('the example is set out in one commit, refused over anything of yours', () => {
    const s = said('formats', 'It is set out in one commit');
    expect(claim(s, /^It is set out in (one commit) \(one transaction of the database/), s.where).toBe('one commit');
    expect(s.text).toMatch(/when its log already holds anything of yours \(read in that same transaction\)/);
    const seed = raw('src/lib/ui/grow/demo-seed.ts');
    expect(seed).toMatch(/requireEmpty/);
  });
});
