/**
 * Round 111 (docs/PLAN-109.md, "Round 111"): the pages ask the site's own copies of the reference's photographs.
 *
 * 1. `imgUrl`, `imgSrcset` and `imgHosts`: a source's address becomes its copy's on img.cultifolio.com; a srcset keeps
 *    its widths; the preconnect names the copies' host once, for a source or a copy alike.
 * 2. Every place in src/ that asks `photoAt`, `photoOf` or `srcsetOf` for a page to load hands the answer to `imgUrl` or
 *    `imgSrcset` (the functions stay the sources', which the copy step reads, `img-wanted.ts`); `shownAt` only for the
 *    species page's `heroSrc`, which feeds `srcsetOf` and `imgHosts`.
 * 3. Every `<img src>` in a page is a copy's address (`imgUrl`), or the grower's own (a blob, `PhotoImg`, the walk's
 *    preview) or the site's own file.
 * 4. The image policy names img.cultifolio.com and no photograph host besides.
 * 5. The upload waits for the copy where the copy has run (bulk/img/done.txt): no record, a run that did not ask every
 *    copy, or an index written after the run (`imgGuard`); and the daily plan asks the copy after its review and before its upload.
 *
 * On 1764df3: 1 (no imgSrcset, no imgHosts), 2 and 3 (every page asked the source), 4 (the four hosts) and 5 (no guard,
 * no step) FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { imgUrl, imgSrcset, imgHosts, IMG_ORIGIN } from '../../src/lib/core/img';
import { imgGuard, parsePlan } from '../../scripts/corpus-step.mjs';

const INAT = 'https://inaturalist-open-data.s3.amazonaws.com/photos/900/medium.jpg';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte)$/.test(f)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const files = walk('src').filter((f) => !/photo-size\.ts$|img-wanted\.ts$/.test(f));

describe('r111a the copy\'s address', () => {
  it('imgUrl, imgSrcset and imgHosts', () => {
    expect(imgUrl(INAT)).toBe(`${IMG_ORIGIN}/inat/900/medium.jpg`);
    expect(imgSrcset(`${INAT} 500w, https://inaturalist-open-data.s3.amazonaws.com/photos/900/large.jpg 1024w`)).toBe(`${IMG_ORIGIN}/inat/900/medium.jpg 500w, ${IMG_ORIGIN}/inat/900/large.jpg 1024w`);
    expect(imgSrcset(undefined)).toBeUndefined();
    expect(imgHosts([INAT, null])).toEqual([IMG_ORIGIN]);
    expect(imgHosts([`${IMG_ORIGIN}/inat/900/medium.jpg`])).toEqual([IMG_ORIGIN]);
    expect(imgHosts(['/app/og.png', undefined])).toEqual([]);
    // Commons is not served from its copies yet (`SERVED`): its address stays the source's, and no preconnect to the copies.
    const C = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/500px-F.jpg';
    expect(imgUrl(C)).toBe(C);
    expect(imgHosts([C])).toEqual([]);
    expect(imgUrl('https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/1234/media/0123456789abcdef0123456789abcdef')).toMatch(/^https:\/\/img\.cultifolio\.com\/gbif\//);
  });
});

describe('r111a every page asks the copy', () => {
  it('each photoAt, photoOf and srcsetOf a page loads goes through imgUrl or imgSrcset', () => {
    const bare: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\b(photoAt|photoOf|srcsetOf)\(/g)) {
        const before = s.slice(Math.max(0, m.index! - 12), m.index!);
        if (!/(imgUrl|imgSrcset)\($/.test(before)) bare.push(`${f}: ${s.slice(m.index!, m.index! + 50)}`);
      }
      for (const m of s.matchAll(/\bshownAt\(/g)) if (!/const heroSrc = \$derived\(hero \? $/.test(s.slice(Math.max(0, m.index! - 40), m.index!))) bare.push(`${f}: shownAt`);
    }
    expect(bare).toEqual([]);
  });
  it('each <img src> is a copy, the grower\'s own, or the site\'s', () => {
    const odd: string[] = [];
    for (const f of files.filter((x) => x.endsWith('.svelte'))) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/<img\b[^>]*?\ssrc=(\{[^}]*\}|"[^"]*")/g)) {
        const v = m[1];
        if (/^\{(stripGo \? )?imgUrl\(/.test(v) || /^\{(preview|url|src|objectUrl|blobUrl)\}$/.test(v) || /^"\//.test(v)) continue;
        // Converted where they are made: the front page's lead (lead-figure.ts) and the not-found page's species of the day
        // (about/data/today.server.ts), each `imgUrl(photo…)`, which the first test reads.
        if (v === '{lead.photo.src}' || v === '{plant.photo.src}') continue;
        odd.push(`${f}: ${v}`);
      }
    }
    expect(odd).toEqual([]);
  });
  it('the image policy names the copies\' host and no photograph host besides', () => {
    const cfg = readFileSync('svelte.config.js', 'utf8');
    const line = /'img-src':\s*\[([^\]]*)\]/.exec(cfg)![1];
    expect([...line.matchAll(/https:\/\/([^'"]+)/g)].map((m) => m[1])).toEqual(['img.cultifolio.com', 'upload.wikimedia.org']); // Commons' until its copy is complete
  });
});

describe('r111a the upload waits for the copy', () => {
  const root = () => {
    const r = mkdtempSync(join(tmpdir(), 'r111a-'));
    mkdirSync(join(r, 'static/s/v3'), { recursive: true });
    mkdirSync(join(r, 'bulk/img'), { recursive: true });
    writeFileSync(join(r, 'bulk/img/done.txt'), '');
    writeFileSync(join(r, 'static/s/v3/index.json'), '[]');
    return r;
  };
  const record = (r: string, o: Record<string, unknown>) => writeFileSync(join(r, 'bulk/img/last-run.json'), JSON.stringify({ at: '2026-11-24T01:00:00Z', code: 0, left: 0, indexMtimeMs: statSync(join(r, 'static/s/v3/index.json')).mtimeMs, ...o }));
  it('waits with no record, after a run that left copies unasked, and after an index written since', () => {
    const r = root();
    expect(imgGuard(r)).toMatch(/no run of the photograph copy is recorded/);
    record(r, { code: 3, left: 12 });
    expect(imgGuard(r)).toMatch(/did not ask for every copy \(12 left\)/);
    record(r, {});
    expect(imgGuard(r)).toBeNull();
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(r, 'static/s/v3/index.json'), later, later);
    expect(imgGuard(r)).toMatch(/index was written after the last run/);
  });
  it('the daily plan asks the copy after its review and before its upload', () => {
    const steps = (parsePlan(readFileSync('scripts/corpus-plan-daily.txt', 'utf8')) as Array<{ line: string }>).map((s) => s.line);
    const img = steps.findIndex((l: string) => /^img --asked-once/.test(l));
    expect(img).toBeGreaterThan(steps.findIndex((l: string) => /^review /.test(l)));
    expect(img).toBe(steps.indexOf('upload') - 1);
  });
});
