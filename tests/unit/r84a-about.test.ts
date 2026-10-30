/**
 * Round eighty-four, agent A: /about/how and /about/formats for a grower, and true of the code (the reviews' S4, S5, S6,
 * D6, A15, A18, A19, A20; decisions 5 and 7).
 *
 * 1. The pages read at once: no sentence over sixty words, a plain summary of three sentences at most at the head of each
 *    section, no "round eighty-three" in what a visitor reads, no em dash, and every word of art in the glossary.
 * 2. Every key and name the code keeps on the device is on /about/how, hyphens included (A15: `cultifolio.offline-tried`).
 * 3. Every link into the about pages lands on an id the page has.
 * 4. Every search example the pages quote is what the search answers, run through the search route over a fixture of the
 *    live index's entries (S4: four of the examples were no longer true).
 * 5. The counts are the live reference's, through `/api/counts`, or the dated ones (S4, A18).
 * 6. /about/formats states the key files' doc and answers as the code types them, and the file counts by their rule (S6).
 * 7. The stale sentences are gone (S4, D6), the hybrid sentence is true (S4's 3), and NOTICE names every source (A20).
 *
 * FAILS on r84base: 1 (sentences of 769 words, "round eighty-three", no summaries), 2 (cultifolio.offline-tried), 4 (no
 * examples marked, and "cop", "hens and chicks" and "Tecoma speciosa" said wrongly), 5 (no route), 6 (the doc's eight
 * fields, `{ a, b?, t?, x? }`, "sixty-four at the present size"), 7 (each sentence, and NOTICE without ETOPO and Wikidata).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sentences, aboutText, type AboutPage } from '../about-pages';
import { countsOf, liveCounts, COUNTS_ON } from '$lib/ui/about-counts';
import { searchDirsFor } from '$core/search-files';
import { cardFilesFor, olderFilesFor, rowFilesFor } from '$dossier/lookups';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { GET as countsGet } from '../../src/routes/api/counts/+server';

const raw = (f: string) => readFileSync(f, 'utf8');
const FILE: Record<AboutPage, string> = { how: 'src/routes/about/how/+page.svelte', formats: 'src/routes/about/formats/+page.svelte' };
const PAGES: AboutPage[] = ['how', 'formats'];
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js|html)$/.test(f)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const source = walk('src').filter((f) => !f.includes('/routes/about/'));

describe('1. the pages read at once (S5, A19)', () => {
  for (const p of PAGES) {
    it(`/about/${p}: no sentence over sixty words`, () => {
      const long = sentences(p).filter((s) => words(s.text) > 60).map((s) => `${s.where} (${words(s.text)}): ${s.text.slice(0, 90)}…`);
      expect(long).toEqual([]); // base: 769 words in one
    });
    it(`/about/${p}: each section opens with a plain summary of three sentences at most`, () => {
      const src = raw(FILE[p]);
      const sections = [...src.matchAll(/<section aria-labelledby="([\w-]+)">\s*<h2 id="\1">[^<]*<\/h2>\s*([\s\S]*?)(?=<\/section>)/g)];
      expect(sections.length).toBeGreaterThan(p === 'how' ? 18 : 12);
      for (const [, id, body] of sections) {
        const sum = /^<p class="sum">([\s\S]*?)<\/p>/.exec(body.trim());
        expect(sum, `#${id}`).not.toBeNull();
        const text = sum![1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        expect(text.split(/(?<=[.!?])\s+(?=[A-Z"“])/).length, `#${id}: ${text}`).toBeLessThanOrEqual(3);
        expect(words(text), `#${id}`).toBeLessThanOrEqual(60);
      }
      // Every h2 but the brief's is a section's head (none left outside one).
      expect([...src.matchAll(/<h2 id="([\w-]+)"/g)].map((m) => m[1]).filter((id) => id !== 'brief-h').sort()).toEqual(sections.map((m) => m[1]).sort());
    });
    it(`/about/${p}: no round number, and no em dash, in what a visitor reads`, () => {
      const t = aboutText(p);
      expect(t.match(/\bround (?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|[a-z]+ty(?:-[a-z]+)?|\d+)\b/gi) ?? []).toEqual([]); // base: "round eighty-three" and the like, 26 times
      expect(t).not.toContain('—');
    });
  }
  it('every word of art either page uses is in the glossary (A19: "fold" 29 times, undefined)', () => {
    const terms = [...raw(FILE.how).matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
    const both = PAGES.map(aboutText).join(' ');
    const USED: Array<[RegExp, string]> = [
      [/\bfold(?:s|ed|ing)?\b/i, 'Reading the log'],
      [/\bdefault points?\b/i, 'Default point'],
      [/\bboxe?s?\b/i, 'Box'],
      [/\bhash groups?\b/i, 'Hash group'],
      [/\bcells?\b/i, 'Cell'],
      [/\bolder names?\b/i, 'Older name'],
      [/\bheld\b/i, 'Held'],
      [/\bparked\b/i, 'Parked'],
      [/\btypical spot\b/i, 'A typical spot in the range'],
      [/\bacross the range\b/i, 'Across the range'],
      [/\bDLI\b/, 'DLI']
    ];
    for (const [re, term] of USED) if (re.test(both)) expect(terms, `${re}`).toContain(term);
    // "hash bucket" and "hash group" were one thing under two names: the pages now say one.
    expect(both).not.toMatch(/hash bucket/);
  });
});

describe('2. every key and name the code keeps on the device is on /about/how (A15)', () => {
  // Each literal the code writes: a storage key or a cookie (`cultifolio.` and a name, hyphens included), and the
  // IndexedDB, cache, lock and channel names (`cultifolio-`). A prefix the code completes ("cultifolio.demo.", the cache's
  // "cultifolio-" and its version) is named as the page names it.
  const keys = new Set<string>(), names = new Set<string>();
  for (const f of source) {
    for (const m of raw(f).matchAll(/['"`](cultifolio\.[A-Za-z][\w.-]*?)(?:=)?['"`$]/g)) keys.add(m[1]);
    for (const m of raw(f).matchAll(/['"`](cultifolio-[a-z][\w-]*:?|cultifolio-)['"`$]/g)) names.add(m[1]);
  }
  const how = aboutText('how');
  const pages = PAGES.map(aboutText).join(' ');
  const whole = (t: string, k: string) => new RegExp(`(?<![\\w.-])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-]|\\.\\w)`).test(t);
  it('the walk found the code', () => {
    expect(keys.size).toBeGreaterThan(30);
    expect(keys).toContain('cultifolio.offline-tried');
    expect(names.size).toBeGreaterThan(8);
  });
  it('every cultifolio.* key, hyphens and all, is named whole on /about/how', () => {
    expect([...keys].filter((k) => !whole(how, k)).sort()).toEqual([]); // base: ['cultifolio.offline-tried']
  });
  it('every cultifolio-* name is on the pages (the format and salt names on /about/formats)', () => {
    expect([...names].filter((n) => !whole(pages, n)).sort()).toEqual([]);
  });
  it('the cookies are named by their names', () => {
    for (const c of ['cultifolio.units', 'cultifolio.hemi']) expect(how).toContain(c);
  });
});

describe('3. every link into the about pages lands on an id', () => {
  const ids = (p: AboutPage) => new Set([...raw(FILE[p]).matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  it('from the app, from the pages themselves, and from one page to the other', () => {
    const missing: string[] = [];
    const files = [...source, FILE.how, FILE.formats];
    for (const f of files) {
      for (const m of raw(f).matchAll(/\/about\/(how|formats)#([\w-]+)/g)) if (!ids(m[1] as AboutPage).has(m[2])) missing.push(`${f}: /about/${m[1]}#${m[2]}`);
    }
    for (const p of PAGES) for (const m of raw(FILE[p]).matchAll(/href="#([\w-]+)"/g)) if (!ids(p).has(m[1])) missing.push(`/about/${p}: #${m[1]}`);
    expect(missing).toEqual([]);
  });
});

describe('4. every search example the pages quote is what the search answers (S4)', () => {
  /** The live index's entries for every example, as read on 2026-10-29 (`/api/index`), the names a typed query reaches. */
  const IDX = JSON.parse(raw('tests/unit/fixtures/r84a-search-examples.json')) as IndexEntry[];
  const examples = PAGES.flatMap((p) => [...raw(FILE[p]).matchAll(/<span class="ex" data-q="([^"]+)" data-order="([^"]+)"( data-first)?>([^<]*)<\/span>/g)].map((m) => ({ p, q: m[1], order: m[2].split(' | '), first: !!m[3], said: m[4] })));
  function bucket(m: Map<string, string>) {
    const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
    return { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
  }
  const platform = { env: { STORE: bucket(new Map([['s/v3/index.json', JSON.stringify(IDX)]])) } } as unknown as App.Platform;
  const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
  /** The answer as a reader pages through it, a hundred at a time as "Show more" asks, until it holds every name sought. */
  async function ask(q: string, sought: (hits: string[]) => boolean): Promise<string[]> {
    resetRateLimits();
    const out: string[] = [];
    for (let at = 0; at < 400; at += 100) {
      const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&n=100&shape=2${at ? `&at=${at}` : ''}`);
      const r = await searchGet({ params: {}, platform, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.84', setHeaders: () => {} } as never);
      const hits = ((await r.json()) as { hits: IndexEntry[] }).hits.map((h) => h.name);
      out.push(...hits);
      if (hits.length < 100 || sought(out)) break;
      resetRateLimits();
    }
    return out;
  }
  beforeAll(() => _forgetIndex());
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());
  it('the pages mark their examples, and each says what it is marked with', () => {
    expect(examples.length).toBeGreaterThan(15);
    for (const e of examples) {
      expect(e.said, e.q).toContain(`"${e.q}"`);
      // A genus said as "the Copiapoas", "the roses", "Aloe": the species named whole, the genus by its stem.
      for (const n of e.order) expect(e.said.toLowerCase(), `${e.q}: ${n}`).toContain(n.split(' ').length > 1 ? n.toLowerCase() : n.toLowerCase().replace(/a$/, ''));
    }
  });
  it('each is answered as the page says, in the order it says', async () => {
    const wrong: string[] = [];
    for (const e of examples) {
      // A one-word name is a genus: the place of its first species; a name of two words or more, that species.
      const place = (hs: string[], n: string) => hs.findIndex((h) => (n.includes(' ') ? h === n : h.split(' ')[0] === n));
      const hits = await ask(e.q, (hs) => e.order.every((n) => place(hs, n) >= 0));
      const at = (n: string) => place(hits, n);
      const places = e.order.map(at);
      if (places.some((x) => x < 0)) wrong.push(`/about/${e.p} "${e.q}": ${e.order.filter((_, i) => places[i] < 0).join(', ')} not answered (${hits.slice(0, 5).join(', ')})`);
      else if (places.some((x, i) => i > 0 && x < places[i - 1])) wrong.push(`/about/${e.p} "${e.q}": not in the order ${e.order.join(' > ')} (${hits.slice(0, 8).join(', ')})`);
      else if (e.first && places[0] !== 0) wrong.push(`/about/${e.p} "${e.q}": ${e.order[0]} is not first (${hits.slice(0, 5).join(', ')})`);
    }
    expect(wrong).toEqual([]);
  }, 120_000);
  it('the examples the live site no longer gave are gone (S4)', () => {
    const how = aboutText('how'), formats = aboutText('formats');
    expect(how).not.toMatch(/"cop" is Copiapoa/);
    expect(how).not.toMatch(/"Echinocactus chrys", or|after any species whose own name it is/);
    expect(formats).not.toMatch(/"Tecoma speciosa" is Campsis radicans before Tecomanthe speciosa/);
  });
});

describe('5. the counts: the live reference, or a named day (S4, A18)', () => {
  it('countsOf takes three whole counts in order, and nothing else', () => {
    expect(countsOf({ species: 48_357, genera: 6_529, withClimate: 37_727 })).toEqual({ species: 48_357, genera: 6_529, withClimate: 37_727 });
    for (const bad of [null, {}, { species: 0, genera: 0, withClimate: 0 }, { species: 10, genera: 11, withClimate: 1 }, { species: 10, genera: 1, withClimate: 11 }, { species: '10', genera: 1, withClimate: 1 }, { species: 1.5, genera: 1, withClimate: 1 }]) expect(countsOf(bad), JSON.stringify(bad)).toBeNull();
  });
  it('liveCounts asks /api/counts, and says nothing when it does not answer', async () => {
    const asked: string[] = [];
    const ok = (async (u: string) => { asked.push(u); return new Response(JSON.stringify({ corpus: 'x', species: 3, genera: 2, withClimate: 1 })); }) as unknown as typeof fetch;
    expect(await liveCounts(ok)).toEqual({ species: 3, genera: 2, withClimate: 1 });
    expect(asked).toEqual(['/api/counts']);
    expect(await liveCounts((async () => new Response('', { status: 503 })) as unknown as typeof fetch)).toBeNull();
    expect(await liveCounts((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toBeNull();
  });
  it('/api/counts counts the catalogue the front page reads: species, genera, and those with a climate', async () => {
    const rows = (n: number, climate: string) => Array.from({ length: n }, (_, i) => ({ key: `g${n}${i}`, gbif: i + 1, slug: `genus${n}-sp${i}`, name: `Genus${n} sp${String.fromCharCode(97 + i)}`, family: 'Cactaceae', origin: ['Chile North'], photos: 1, open: 1, climate }));
    const idx = [...rows(3, 'ok'), ...rows(2, 'none')].sort((a, b) => a.name.localeCompare(b.name));
    const m = new Map([['s/v3/index.json', JSON.stringify(idx)]]);
    const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}"`, body: m.get(k)! });
    const platform = { env: { STORE: { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}"` } : null) } } } as unknown as App.Platform;
    _forgetIndex();
    const r = await countsGet({ platform, fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch, url: new URL('https://cultifolio.com/api/counts') } as never);
    expect(r.headers.get('cache-control')).toBe('public, max-age=300');
    expect(countsOf(await r.json())).toEqual({ species: 5, genera: 2, withClimate: 3 });
  });
  it('the page says the day of the counts it carries, and the counts it carries are that day\'s index', () => {
    expect(raw(FILE.how)).toContain('<p class="counts" id="counts">');
    expect(COUNTS_ON.on).toBe('29 October 2026');
    // The live index of 29 October 2026, as the reviews read it (/tmp/claude-0/rev84r/inputs/index.json): 48,357 pages, 6,529 genera, 37,727 with a climate.
    expect([COUNTS_ON.species, COUNTS_ON.genera, COUNTS_ON.withClimate]).toEqual([48_357, 6_529, 37_727]);
    // And the few-records count, which the index does not hold, is said as of that day.
    expect(aboutText('how')).toContain('On the reference of 29 October 2026, 4,839 of the 37,727 pages with a climate were marked so');
  });
});

describe('6. /about/formats states the key files as the code types them (S6)', () => {
  const formats = aboutText('formats');
  const typed = (file: string, re: RegExp) => re.exec(raw(file))![1];
  it("a key file's doc: the eleven fields of `Doc`, in order", () => {
    const doc = [...typed('src/lib/core/search-files.ts', /export type Doc = \[(.*)\];/).matchAll(/(\w+)\??:/g)].map((m) => m[1]);
    expect(formats).toContain(`The doc is [${doc.join(', ')}].`); // base: eight
  });
  it('the answers: the fields of `Answers`', () => {
    const fields = typed('src/lib/core/search-files.ts', /export interface Answers \{([^}]+)\}/).split(';').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/:.*$/, ''));
    expect(formats).toContain(`Answers are { ${fields.join(', ')} }`); // base: { a, b?, t?, x? }
  });
  it('the index entry: every field the type has is named', () => {
    const fields = [...typed('src/lib/dossier/index-entry.ts', /export interface IndexEntry \{([\s\S]*?)\n\}/).matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
    const entry = raw(FILE.formats).slice(raw(FILE.formats).indexOf('<h3 id="entry">'), raw(FILE.formats).indexOf('<h3 id="export">'));
    expect(fields.filter((f) => !entry.includes(`<code>${f}</code>`))).toEqual([]); // base: hom and homBy
  });
  it('the file counts by their rule, and at the live size', () => {
    expect(searchDirsFor(48_357)).toBe(512);
    expect(cardFilesFor(48_357)).toBe(1024);
    expect(olderFilesFor(48_357)).toBe(512);
    expect([rowFilesFor('genus', 48_357), rowFilesFor('family', 48_357)]).toEqual([512, 128]);
    expect(formats).toContain('512 at 48,357 species'); // the search's directories and the files of names
    expect(formats).toContain('1,024 at 48,357 species');
    expect(formats).toContain('At 48,357 species: 512 for genera, 128 for the others.');
    expect(formats).not.toMatch(/at the present size/); // base: 256, 128 and sixty-four "at the present size", round seventy-seven's
  });
});

describe('7. the sentences the reviews found stale, and NOTICE (S4, D6, A18, A20; decisions 5 and 7)', () => {
  const how = aboutText('how');
  it('no promise of an upload, no "until then", no 23 October counts', () => {
    expect(how).not.toMatch(/due at the end of October|until that upload|reach a page when it is next derived|corpus of 23 October|37,788|48,361 pages|6,539 genera,/);
  });
  it('a hybrid has a climate where its records allow one; a cross with no page has no habitat (S4\'s 3)', () => {
    expect(how).not.toMatch(/a hybrid gets none at all/);
    expect(how).toContain('It has a habitat climate when its wild records allow one.');
    expect(how).toContain('A cross you record from two parents, with no page of its own, has no habitat of its own, and its plant page says so.');
  });
  it('a default point at a named place is left out, and the page says so (decision 5)', () => {
    expect(how).toContain('A record at a default point that names a place but states no accuracy is left out.');
  });
  it('the extremes check is a check that two sources disagree, not a proof (decision 7)', () => {
    expect(how).toContain("so this is a check that the weather cell's nights and the habitat's months disagree");
    expect(how).toContain('Neither of these two checks proves that either source is wrong.');
  });
  it('the 14 pages under GBIF\'s keys are said as of their day (A18: "15 pages")', () => {
    expect(how).toContain("Pages whose names Kew's checklist does not place keep GBIF's key (14 on 29 October 2026).");
  });
  it('NOTICE names every source the pages name, with its licence and a link to each licence\'s text (A20)', () => {
    const notice = raw('NOTICE');
    for (const s of ['GBIF Backbone Taxonomy', 'World Checklist of Vascular Plants', 'CHELSA', 'ETOPO 2022', 'NASA POWER', 'Natural Earth', 'Wikidata', 'iNaturalist', 'Wikimedia Commons', 'Wikipedia', 'OpenAlex', 'TDWG', 'MET Norway', 'National Weather Service']) expect(notice, s).toContain(s);
    for (const l of ['https://creativecommons.org/licenses/by/4.0/', 'https://creativecommons.org/licenses/by-sa/4.0/', 'https://creativecommons.org/publicdomain/zero/1.0/']) expect(notice).toContain(l);
    expect(notice).toMatch(/CC BY-NC records are read for derived\s+figures/);
    // The sources' table on /about/how links each Creative Commons licence it names (CC BY-NC aside: nothing is published under it).
    const table = raw(FILE.how).slice(raw(FILE.how).indexOf('<table class="src">'), raw(FILE.how).indexOf('</table>'));
    const unlinked = table.replace(/<a [^>]*>[^<]*<\/a>/g, '').replace(/<[^>]+>/g, ' ');
    expect(unlinked.match(/\bCC(?:0|\s?BY(?!-NC)(?:-SA)?)\b/g) ?? []).toEqual([]);
    expect([...table.matchAll(/href="https:\/\/creativecommons\.org\//g)].length).toBeGreaterThan(10);
  });
});
