/**
 * Round eighty-five, agent A: /about/how, /about/formats and NOTICE true of the code as the round leaves it, read by a
 * grower as summaries with the rules one tap away, and their quoted examples tested against the index that goes live.
 *
 * 1. (S4, A21) The examples' fixture is made from an index by `scripts/about-examples.ts`, which `--index` runs: every
 *    example each page marks is in it, each is answered as the page says over it through the search route, and a page
 *    renamed or a name gone makes the example fail. The counts the prerendered page says are that index's, of its day.
 * 2. (S11, A22) Each section and subsection opens with a plain summary a grower can stop at; every list of rules is folded
 *    under it, one tap away; the visible text of /about/how is under 6,000 words and of /about/formats under 1,500. A link
 *    to a folded rule opens it, and print opens every one (`$lib/ui/about-fold`).
 * 3. (A22) No repository path, build flag or "built before" hedge in the text a visitor reads.
 * 4. (A22, S9) The glossary defines every word of art the reviews named, and "not checked" and "not asked" as the pages use
 *    them.
 * 5. (A22) The buffer and the coast reach are said in kilometres as the code's degrees are.
 * 6. (S10) The merged pages listed are those of the list file, Rebutia fidana among them.
 * 7. (A22) NOTICE names every source the build reads: the national checklists, iNaturalist's counts and Natural Earth's
 *    minor islands among them, and no source no page uses (OpenAlex).
 *
 * FAILS on r85base: 1 (no script, no fixture; "Trichocereus pachanoi" answered Echinopsis macrogona on the live index; the
 * counts were 29 October's), 2 (no folded lists but four; 14,880 words visible; no about-fold), 3 (sixteen paths and
 * flags, six "built before" sentences), 4 (no Backbone, Epithet, Basionym and the rest), 5 ("about 5 km", "about 17 km"),
 * 6 (Rebutia fidana and Coryphantha macromeris left out), 7 (no checklists, counts or islands; OpenAlex listed).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { aboutText, type AboutPage } from '../about-pages';
import { COUNTS_ON } from '$lib/ui/about-counts';
import { revealHash, printOpens } from '$lib/ui/about-fold';
import { SHAPE_BUFFER_DEG, COAST_DEG } from '$dossier/tdwg-shapes';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { allExamples, makeFixture, wrongness, placeOf, writeExamplesFixture, dayWords, FIXTURE, type Example, type ExamplesFixture } from '../../scripts/about-examples';

const raw = (f: string) => readFileSync(f, 'utf8');
const FILE: Record<AboutPage, string> = { how: 'src/routes/about/how/+page.svelte', formats: 'src/routes/about/formats/+page.svelte' };
const FX = JSON.parse(raw(FIXTURE)) as ExamplesFixture;
const EXAMPLES = allExamples();

/** The route's answer over an index, paged as a reader pages it, until it holds every name sought. */
async function routeAnswer(idx: IndexEntry[], q: string, sought: (hits: string[]) => boolean): Promise<string[]> {
  const m = new Map([['s/v3/index.json', JSON.stringify(idx)]]);
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  const platform = { env: { STORE: { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) } } } as unknown as App.Platform;
  const out: string[] = [];
  for (let at = 0; at < 400; at += 100) {
    resetRateLimits();
    const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&n=100&shape=2${at ? `&at=${at}` : ''}`);
    const r = await searchGet({ params: {}, platform, fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch, url, request: new Request(url), getClientAddress: () => '192.0.2.85', setHeaders: () => {} } as never);
    const hits = ((await r.json()) as { hits: IndexEntry[] }).hits.map((h) => h.name);
    out.push(...hits);
    if (hits.length < 100 || sought(out)) break;
  }
  return out;
}
const allPlaced = (e: Example) => (hs: string[]) => e.order.every((n) => placeOf(hs, n) >= 0);

describe('1. the examples, tested against the index that goes live (S4, A21)', () => {
  beforeEach(() => { _forgetIndex(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());
  it('every example either page marks is in the fixture: one added since says to make it again', () => {
    expect(EXAMPLES.length).toBeGreaterThan(15);
    const missing = EXAMPLES.filter((e) => !FX.queries.includes(e.q)).map((e) => `/about/${e.page} "${e.q}": run npx tsx scripts/about-examples.ts <index.json>`);
    expect(missing).toEqual([]);
  });
  it('each is answered over the fixture, through the search route, as the page says', async () => {
    const wrong: string[] = [];
    for (const e of EXAMPLES) {
      _forgetIndex();
      const why = wrongness(e, await routeAnswer(FX.entries, e.q, allPlaced(e)));
      if (why) wrong.push(`/about/${e.page} "${e.q}": ${why}`);
    }
    expect(wrong).toEqual([]);
  }, 120_000);
  it('a page renamed fails its example: Dracaena trifasciata headed otherwise is no longer "snake plant"', async () => {
    const e = EXAMPLES.find((x) => x.q === 'snake plant')!;
    expect(e.order).toEqual(['Dracaena trifasciata']);
    const renamed = FX.entries.map((x) => (x.name === 'Dracaena trifasciata' ? { ...x, name: 'Sansevieria trifasciata', slug: 'sansevieria-trifasciata' } : x));
    _forgetIndex();
    expect(wrongness(e, await routeAnswer(renamed, e.q, allPlaced(e)))).toMatch(/Dracaena trifasciata not answered/);
  });
  it('the script keeps every entry ranked at or above the furthest name an example names, and says an example the index answers otherwise', () => {
    const entry = (name: string, common?: string, photos = 1): IndexEntry => ({ key: `k${name.length}${name.charCodeAt(1)}${photos}` as IndexEntry['key'], slug: name.toLowerCase().replace(/ /g, '-'), name, photos, open: 1, climate: 'ok', ...(common ? { common } : {}) });
    const idx = [entry('Aloe vera', 'Barbados aloe', 50), entry('Aloe ferox', 'Cape aloe', 40), entry('Aloe arborescens', 'Krantz aloe', 30), entry('Crassula ovata', 'Jade plant', 9)];
    const ex: Example[] = [{ page: 'how', q: 'aloe', order: ['Aloe'], first: true, said: '"aloe" is Aloe' }, { page: 'how', q: 'jade plant', order: ['Crassula arborescens'], first: true, said: '"jade plant" is Crassula arborescens' }];
    const { fixture, wrong } = makeFixture(idx, ex, '2026-10-31');
    expect(fixture.entries.map((x) => x.name).sort()).toEqual(['Aloe arborescens', 'Aloe ferox', 'Aloe vera', 'Crassula ovata']);
    expect(fixture.counts).toEqual({ species: 4, genera: 2, withClimate: 4, gPages: 0 });
    expect(fixture.queries).toEqual(['aloe', 'jade plant']);
    expect(wrong).toEqual(['/about/how "jade plant": Crassula arborescens not answered (Crassula ovata)']);
  });
  it('at --index it writes the fixture and the counts of that day, and never stops the index when it cannot', () => {
    const root = mkdtempSync(join(tmpdir(), 'r85a-'));
    try {
      for (const p of Object.values(FILE)) { mkdirSync(join(root, p, '..'), { recursive: true }); cpSync(p, join(root, p)); }
      mkdirSync(join(root, 'tests/unit/fixtures'), { recursive: true });
      mkdirSync(join(root, 'src/lib/ui'), { recursive: true });
      const said: string[] = [];
      const wrong = writeExamplesFixture(FX.entries, root, '2026-11-02', (s) => said.push(s));
      expect(wrong).toEqual([]);
      expect(JSON.parse(raw(join(root, 'src/lib/ui/about-counts-on.json')))).toEqual({ ...FX.counts, species: FX.entries.length, genera: expect.any(Number), withClimate: expect.any(Number), gPages: expect.any(Number), on: '2 November 2026' });
      expect((JSON.parse(raw(join(root, FIXTURE))) as ExamplesFixture).queries).toEqual(FX.queries);
      expect(said[0]).toMatch(/search examples: \d+ queries, \d+ entries written/);
      // A tree with no about pages (a test's scratch directory): said, and nothing written or thrown.
      const out: string[] = [];
      expect(writeExamplesFixture(FX.entries, join(root, 'no/such/place'), '2026-11-02', (s) => out.push(s))).toEqual([]);
      expect(out.join(' ')).toMatch(/no about pages under .*, so their fixture is not made here/);
      // A tree it cannot write to: said, the files left as they were, and nothing thrown.
      rmSync(join(root, 'src/lib/ui'), { recursive: true, force: true });
      const out2: string[] = [];
      expect(writeExamplesFixture(FX.entries, root, '2026-11-03', (s) => out2.push(s))).toEqual([]);
      expect(out2.join(' ')).toMatch(/were not tested against this index .*left as they were/);
      expect((JSON.parse(raw(join(root, FIXTURE))) as ExamplesFixture).made).toBe('2026-11-02');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('the counts the prerendered page says are the fixture\'s index\'s, as of its day', () => {
    expect({ species: COUNTS_ON.species, genera: COUNTS_ON.genera, withClimate: COUNTS_ON.withClimate, gPages: COUNTS_ON.gPages }).toEqual(FX.counts);
    expect(COUNTS_ON.on).toBe(dayWords(FX.made));
    expect(dayWords('2026-10-31')).toBe('31 October 2026');
  });
});

/** The page's markup with every folded list taken out but its summary line: what a reader sees before a tap. */
function unfolded(src: string): string {
  let s = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
  for (let m = /<details\b[^>]*>((?:(?!<details\b)[\s\S])*?)<\/details>/.exec(s); m; m = /<details\b[^>]*>((?:(?!<details\b)[\s\S])*?)<\/details>/.exec(s)) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(m[0])?.[1] ?? '';
    s = s.slice(0, m.index) + ` <i>${summary}</i> ` + s.slice(m.index + m[0].length);
  }
  return s;
}
const visibleWords = (src: string) => unfolded(src).replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' x ').split(/\s+/).filter(Boolean).length;

describe('2. summaries first, the rules one tap away (S11, A22)', () => {
  it('/about/how: every heading opens with a plain summary, and every list of rules is folded', () => {
    const src = raw(FILE.how);
    const heads = [...src.matchAll(/<h([23]) id="([\w-]+)">[^<]*<\/h\1>\s*(<[a-z]+[^>]*>)/g)].filter((m) => m[2] !== 'brief-h');
    expect(heads.length).toBeGreaterThan(35);
    expect(heads.filter((m) => !m[3].startsWith('<p class="sum">')).map((m) => `#${m[2]}: ${m[3]}`)).toEqual([]);
    expect(unfolded(src)).not.toContain('<ul class="rules"'); // base: 30 lists of rules shown whole
    expect(visibleWords(src)).toBeLessThan(6000); // base: 14,880
  });
  it('/about/formats: each section is its summary, the format in full one tap away', () => {
    const src = raw(FILE.formats);
    expect([...src.matchAll(/<summary>The format in full(?:<span class="sr">[^<]*<\/span>)?<\/summary>/g)].length).toBeGreaterThan(12); // round eighty-six (W15): each named by its section for a screen reader
    expect(visibleWords(src)).toBeLessThan(1500); // base: 20,000
  });
  /** A small document of nested lists, enough for the two behaviours. */
  function page(hash: string) {
    type El = { id?: string; open?: boolean; parentElement: El | null; tag: string; closest: (s: string) => El | null; scrollIntoView: () => void; scrolled?: number };
    const mk = (tag: string, parent: El | null, id?: string, open = false): El => {
      const el: El = { tag, id, open, parentElement: parent, scrolled: 0, scrollIntoView: () => { el.scrolled!++; }, closest: (s) => { for (let e: El | null = el; e; e = e.parentElement) if (e.tag === s) return e; return null; } };
      return el;
    };
    const article = mk('article', null);
    const outer = mk('details', article), inner = mk('details', outer), shut = mk('details', article), opened = mk('details', article, undefined, true);
    const rule = mk('li', inner, 'set-aside'), top = mk('h2', article, 'records');
    const els = [outer, inner, shut, opened, rule, top];
    const listeners = new Map<string, Set<() => void>>();
    const win = { location: { hash }, addEventListener: (t: string, f: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(f); }, removeEventListener: (t: string, f: () => void) => listeners.get(t)?.delete(f), fire: (t: string) => listeners.get(t)?.forEach((f) => f()), listeners };
    const doc = { getElementById: (id: string) => els.find((e) => e.id === id) ?? null, querySelectorAll: () => els.filter((e) => e.tag === 'details' && !e.open) };
    return { win, doc: doc as unknown as Document, w: win as unknown as Window, outer, inner, shut, opened, rule, top };
  }
  it('a link to a folded rule opens every list around it and brings it into view, on load and when the address changes', () => {
    const p = page('#set-aside');
    const undo = revealHash(p.doc, p.w);
    expect([p.outer.open, p.inner.open, p.shut.open]).toEqual([true, true, false]);
    expect(p.rule.scrolled).toBe(1);
    p.outer.open = p.inner.open = false;
    p.win.location.hash = '#records'; p.win.fire('hashchange');
    expect([p.outer.open, p.top.scrolled]).toEqual([false, 0]); // a heading not folded: left to the browser
    p.win.location.hash = '#set-aside'; p.win.fire('hashchange');
    expect([p.outer.open, p.inner.open]).toEqual([true, true]);
    undo();
    expect(p.win.listeners.get('hashchange')?.size).toBe(0);
  });
  it('print opens every folded list, and closes again only those the reader had closed', () => {
    const p = page('');
    p.outer.open = true;
    printOpens(p.doc, p.w);
    p.win.fire('beforeprint');
    expect([p.outer.open, p.inner.open, p.shut.open, p.opened.open]).toEqual([true, true, true, true]);
    p.win.fire('afterprint');
    expect([p.outer.open, p.inner.open, p.shut.open, p.opened.open]).toEqual([true, false, false, true]);
  });
});

describe('3. no repository path, build flag or hedge in what a visitor reads (A22, S4)', () => {
  for (const p of ['how', 'formats'] as AboutPage[]) {
    it(`/about/${p}`, () => {
      const t = aboutText(p);
      expect(t.match(/\b(?:scripts|src)\/[\w./-]+/g) ?? []).toEqual([]); // base: how 16, formats 2
      expect(t.match(/(?<![\w-])--[a-z][\w-]*/g) ?? []).toEqual([]); // base: --names, --fill, --check-ranges, --index
      expect(t.match(/\bnpm run\b/g) ?? []).toEqual([]);
      expect(t.match(/[^.]*\b(?:built before|may still|reach a page when it is next)\b[^.]*\./g) ?? []).toEqual([]); // base: six on how
    });
  }
});

describe('4. the glossary (A22, S9)', () => {
  const src = raw(FILE.how);
  const terms = new Map([...src.matchAll(/<dt>([^<]+)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]));
  it('defines every word of art the reviews found undefined', () => {
    for (const t of ['Backbone', 'Epithet', 'Basionym', 'Homotypic', 'Autonym', 'Pro parte', 'Buffer', 'Coast reach', 'KV', '/24, /48, /64']) expect([...terms.keys()], t).toContain(t);
  });
  it('and each such word the pages use is one it defines', () => {
    const both = aboutText('how') + ' ' + aboutText('formats');
    const USED: Array<[RegExp, string]> = [[/\bbackbone\b/i, 'Backbone'], [/\bepithets?\b/i, 'Epithet'], [/\bbasionyms?\b/i, 'Basionym'], [/\bhomotypic\b/i, 'Homotypic'], [/\bautonyms?\b/i, 'Autonym'], [/\bpro parte\b/i, 'Pro parte'], [/\bbuffer\b/i, 'Buffer'], [/\bcoast reach\b/i, 'Coast reach'], [/\bKV\b/, 'KV'], [/\/(?:24|48|64)\b/, '/24, /48, /64']];
    for (const [re, t] of USED) if (re.test(both)) expect([...terms.keys()], `${re}`).toContain(t);
  });
  it('"not checked" for a source that did not answer, "not asked" for one not asked, as the pages use them (S9)', () => {
    expect(terms.get('Not checked')).toMatch(/did not answer .*refused or failed/);
    expect(terms.get('Not asked')).toMatch(/A source the build did not ask, such as GBIF's records for a page with no GBIF key/);
    // The no-key page's records: "not asked", as the glossary says (base: "each says \"not checked\"").
    expect(aboutText('how')).toContain('A page Kew\'s synonymy gives no such key has its GBIF records not asked.');
    expect(aboutText('how')).toContain('and each says "not asked", with why, never "none".');
    expect(aboutText('how')).not.toMatch(/records not asked[^.]*each says "not checked"/);
  });
});

describe('5. the distances said as the code measures them (A22)', () => {
  const km = (deg: number) => (deg * 111.195).toFixed(1); // a degree of latitude; the tests measure longitude scaled to it
  it('the buffer and the coast reach', () => {
    const how = aboutText('how');
    expect(km(SHAPE_BUFFER_DEG)).toBe('5.6');
    expect(how).toContain(`within the buffer of ${SHAPE_BUFFER_DEG}° beyond its edge (about ${km(SHAPE_BUFFER_DEG)} km)`);
    expect(how).toContain(`The coast reach is ${COAST_DEG}° (about ${km(COAST_DEG)} km).`);
    expect(how).not.toMatch(/about 5 km|about 17 km/); // base: both
  });
});

describe('6. the merged pages (S10)', () => {
  it('every name of the list file is said merged, Rebutia fidana among them', () => {
    const names = raw('scripts/merged-pages.txt').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t')[2]);
    expect(names.length).toBe(11);
    const how = aboutText('how');
    const from = how.indexOf("They are also pages merged by the reference's own decision");
    const merged = how.slice(from, how.indexOf("whose name Kew's file does not hold", from));
    expect(names.filter((n) => !merged.includes(n))).toEqual([]); // base: Rebutia fidana, Coryphantha macromeris
    expect(merged).toContain('eleven names');
  });
});

describe('7. NOTICE names every source the build reads, and none it does not (A22)', () => {
  const notice = raw('NOTICE');
  it('the national checklists, iNaturalist\'s counts and Natural Earth\'s minor islands', () => {
    expect(notice).toMatch(/National checklists, as GBIF publishes them/);
    expect(notice).toMatch(/iNaturalist's counts of observations marked\s+[^\n]*\n\s+captive or cultivated/);
    expect(notice).toMatch(/its minor islands/);
    expect(notice).toMatch(/IPNI's records of names/);
    expect(notice).toContain('No other data is used.');
  });
  it('no OpenAlex, which no page now lists, and the page says no page lists papers', () => {
    expect(notice).not.toMatch(/OpenAlex/);
    expect(aboutText('how')).toContain('No page lists papers.');
  });
  it('/about/how\'s table names the checklists and the islands too', () => {
    const table = raw(FILE.how).slice(raw(FILE.how).indexOf('<table class="src">'), raw(FILE.how).indexOf('</table>'));
    expect(table).toMatch(/National checklists, through GBIF/);
    expect(table).toMatch(/minor islands too small to draw/);
  });
});

beforeAll(() => _forgetIndex());
