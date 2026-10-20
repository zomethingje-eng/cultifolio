/**
 * Round seventy, agent P (triage-69 P2, S-F9): the about pages' seams, by the method that replaces round sixty-seven's
 * and sixty-nine's verbatim sentences (tests/about-pages.ts). Each test finds its sentence by its opening words, reads
 * the claim out of it (the figure, the example, the list), and drives the code with that case, so a change of either
 * side fails here and a rewording that keeps the claim does not.
 *
 * Converted here, from r67p-about-seams and r62w-about-seams, are the sentences no agent of round seventy changes: the
 * cookies, the framework's session keys, the browser's HTTP cache of this site's answers, the reload under a new version,
 * the "keep data" question's month, Natural Earth, the labels page's picks, the front page's photographs, the plant
 * number a restored plant yields and the 173 collector genera. Each is a guard (it passes on the base as on this round)
 * unless its comment says it failed on the base. The sentences that change this round keep their old tests until the
 * second pass (docs/review-70/P.md lists them).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { said, part, claim, numberWord, spanWords, aboutText } from '../about-pages';
import { EARLY_MS, onTakeOver, onArrival } from '$lib/ui/take-over';
import { climateDistance } from '$core/near';
import { habitatCentre, type Cluster } from '$core/geo';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const raw = (f: string) => readFileSync(f, 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js)$/.test(f)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const source = walk('src').filter((f) => !f.includes('/about/'));

/* ---- the browser, as far as these stores touch it ---- */
const GLOBALS = ['document', 'localStorage', 'sessionStorage', 'navigator'] as const;
const had = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
/** Every cookie written, as written. */
const cookies: string[] = [];
let persistCalls = 0;
beforeAll(() => {
  def('document', { set cookie(v: string) { cookies.push(v); }, get cookie() { return ''; } });
  def('localStorage', store());
  def('sessionStorage', store());
  def('navigator', { language: 'en-GB', storage: { persist: () => { persistCalls++; return Promise.resolve(true); } } });
});
afterAll(() => {
  for (const k of GLOBALS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

describe('the method (tests/about-pages.ts)', () => {
  it('finds a sentence by its opening words, whole, with its line', () => {
    const s = said('how', 'Two small cookies');
    expect(s.text).toMatch(/^Two small cookies.*\.$/);
    expect(s.line).toBeGreaterThan(80);
    expect(raw('src/routes/about/how/+page.svelte').split('\n')[s.line - 1]).toContain('Two small cookies');
  });
  it('refuses an opening that is absent or opens two sentences, so a test never reads the wrong one', () => {
    expect(() => said('how', 'No such sentence opens this page')).toThrow(/no sentence opens/);
    expect(() => said('how', 'The ')).toThrow(/more than one/);
  });
  it('does not end a sentence at an abbreviation, and reads the numbers and spans the pages write', () => {
    expect(said('formats', 'A query is read as a botanical name where').text).toMatch(/and said\.$/);
    expect([numberWord('Two'), numberWord('four'), numberWord('1,200'), numberWord('a')]).toEqual([2, 4, 1200, 1]);
    expect([spanWords('a month'), spanWords('four seconds'), spanWords('half an hour'), spanWords('a day')]).toEqual([30 * 86_400_000, 4000, 1_800_000, 86_400_000]);
  });
});

describe('the cookies (H204; the cookie clause of the full detail)', () => {
  it('as many cookies as the sentence counts, each named by what it holds, and written by the code with no other', async () => {
    const s = said('how', 'Two small cookies');
    const n = numberWord(claim(s, /^(\w+) small cookies/));
    const { units } = await import('$lib/ui/units.svelte');
    const { site } = await import('$lib/ui/site.svelte');
    cookies.length = 0;
    units.set('us');
    site.set({ lat: -33.9, lon: 18.4 });
    site.set(null);
    const names = [...new Set(cookies.map((c) => c.split('=')[0]))].sort();
    expect(names.length, s.where).toBe(n);
    expect(names).toEqual(['cultifolio.hemi', 'cultifolio.units']);
    // "your units", "its hemisphere": each cookie's value is what the sentence says it holds.
    expect(s.text).toMatch(/your units/);
    expect(s.text).toMatch(/once a site is set, its hemisphere/);
    expect(cookies).toContain('cultifolio.units=us; path=/; max-age=31536000; samesite=lax');
    expect(cookies.filter((c) => c.startsWith('cultifolio.hemi=s;')).length).toBeGreaterThan(0); // a southern site, one letter
    expect(cookies.filter((c) => c.startsWith('cultifolio.hemi=;') && /max-age=0/.test(c)).length).toBeGreaterThan(0); // no site, no hemisphere
    // Every cookie the code writes is written by these two stores (a third writer would be a third cookie).
    expect(source.filter((f) => /document\.cookie\s*=/.test(raw(f))).sort()).toEqual(['src/lib/ui/site.svelte.ts', 'src/lib/ui/units.svelte.ts']);
  });
  it('the hemisphere goes only with the pages the full detail names, and the units with every page', () => {
    const detail = said('how', 'What the pages about your own plants do send');
    const clause = part(detail, 'two small cookies', ';');
    const pages = claim({ ...detail, text: clause }, /goes only with ([a-z]+(?: and [a-z]+)*) pages/).split(' and ').map((w) => `/${w}`).sort();
    const paths = (name: string) => [...new Set(cookies.filter((c) => c.startsWith(`${name}=`)).map((c) => /path=([^;]+)/.exec(c)![1]))].sort();
    expect(paths('cultifolio.hemi'), detail.where).toEqual(pages);
    expect(paths('cultifolio.units')).toEqual(['/']);
  });
  it('no cookie is written from the example collection', () => {
    expect(said('formats', 'Its settings are its own').text).toMatch(/no cookie is written from it/);
    expect(raw('src/lib/ui/units.svelte.ts')).toMatch(/if \(sampleTab\(\)\) \{ writeSetting/);
    expect(raw('src/lib/ui/site.svelte.ts')).toMatch(/if \(sampleTab\(\)\) return;/);
  });
});

describe("the framework's session keys (the session storage part of the key list)", () => {
  const kit = raw('node_modules/@sveltejs/kit/src/runtime/client/constants.js');
  const client = raw('node_modules/@sveltejs/kit/src/runtime/client/client.js');
  it('the keys the list names are the ones the framework writes, and it writes no other', () => {
    const list = said('how', 'What the device keeps outside the collection, every key');
    const clause = part(list, 'and two the framework', '; in IndexedDB');
    const n = numberWord(claim({ ...list, text: clause }, /and (\w+) the framework/));
    const named = [...clause.matchAll(/\b(sveltekit:[a-z]+)\b/g)].map((m) => m[1]).sort();
    const written = [...client.matchAll(/storage\.set\((\w+)/g)].map((m) => new RegExp(`export const ${m[1]} = '([^']+)'`).exec(kit)?.[1]).sort();
    expect(named.length, list.where).toBe(n);
    expect(named).toEqual(written);
  });
  it('"no page of this site asks it to keep anything": no page exports a snapshot', () => {
    const list = said('how', 'What the device keeps outside the collection, every key');
    expect(list.text).toMatch(/no page of this site asks it to keep anything/);
    expect(source.filter((f) => /export const snapshot\b/.test(raw(f)))).toEqual([]);
  });
});

describe("the browser's HTTP cache of this site's answers (the key list)", () => {
  /** Each answer the clause names, the route that gives it, and the lifetime the route gives the browser, in seconds. */
  const life = (f: string): number[] => [...raw(f).matchAll(/(?:public|private), max-age=(\$\{CACHE_S\}|\$\{PAGE_CACHE_S\}|\d+)/g)].map((m) => (m[1].startsWith('${') ? Number(new RegExp(`const ${m[1].slice(2, -1)} = ([\\d_]+)`).exec(raw(f))![1].replace(/_/g, '')) : Number(m[1])));
  const ROUTES: Array<[RegExp, string[]]> = [
    [/^a catalogue search$/, ['src/routes/api/search/+server.ts']],
    [/^the name you typed into the species picker/, ['src/routes/api/names/+server.ts']],
    [/^a hash group's entries and figure sheets$/, ['src/routes/api/entries/+server.ts', 'src/routes/api/sheets/+server.ts']],
    [/^(?:and )?a window of the catalogue's rows$/, ['src/routes/api/rows/+server.ts']],
    [/^each sealed batch of your log and each sealed photograph/, ['src/routes/api/sync/log/[key]/+server.ts', 'src/routes/api/sync/photo/[id]/+server.ts']]
  ];
  it("every lifetime the clause gives is the route's own, and every route it names says no other to the browser", () => {
    const list = said('how', 'What the device keeps outside the collection, every key');
    const clause = part(list, "in the browser's own HTTP cache", '; and, while a page is open');
    // "a, b, c and d for a day": the items before a lifetime share it.
    const body = clause.replace(/^.*?for as long as each answer says: /, '').replace(/\(all of them are cleared[^)]*\)/, '');
    const pairs: Array<[string, number]> = [];
    let pending: string[] = [];
    for (const piece of body.split(/, (?![^()]*\))/).map((x) => x.replace(/^and /, '').trim())) {
      // Joining words and the clauses that qualify a lifetime ("or five minutes when…", "since…") name no answer.
      if (/^(?:and|with sync on|or .*|since .*|)$/.test(piece)) continue;
      const m = /^(.*?)\s*\bfor (a minute|five minutes|an hour|half an hour|a day|a year)\b/.exec(piece);
      if (!m) { pending.push(piece); continue; }
      for (const p of [...pending, m[1]].filter(Boolean)) pairs.push([p.replace(/ \(encrypted, as the server holds them\)$/, ''), spanWords(m[2]) / 1000]);
      pending = [];
    }
    expect(pending, `${list.where}: answers named with no lifetime`).toEqual([]);
    const routed = pairs.filter(([item]) => ROUTES.some(([re]) => re.test(item)));
    expect(routed.length, list.where).toBe(ROUTES.length);
    for (const [item, secs] of routed) {
      const files = ROUTES.find(([re]) => re.test(item))![1];
      for (const f of files) expect(new Set(life(f)), `${item}: ${f}`).toEqual(new Set([secs]));
    }
    // The forecast: an hour, or five minutes when the alerts were refused or not answered; a page as rendered, a minute.
    const forecast = raw('src/routes/api/forecast/+server.ts');
    const fc = pairs.filter(([item]) => /^a forecast for a rounded site$/.test(item));
    expect(fc.map(([, s]) => s), list.where).toEqual([3600]);
    expect(clause).toMatch(/for an hour, or five minutes when the National Weather Service refused or did not answer for its alerts/);
    expect(/const TTL_S = ([\d_]+)/.exec(forecast)?.[1].replace(/_/g, '')).toBe('3600');
    expect(/const REFUSED_TTL_S = ([\d_]+)/.exec(forecast)?.[1].replace(/_/g, '')).toBe('300');
    expect(forecast).toMatch(/const ttlOf = \(status: string \| undefined\) => \(status === 'refused' \|\| status === 'unanswered' \? REFUSED_TTL_S : TTL_S\)/);
    const pagePair = pairs.find(([item]) => /^a page as rendered$/.test(item));
    expect(pagePair?.[1]).toBe(life('src/hooks.server.ts')[0]);
    // "since a sealed object never changes under its name": the routes say so to the browser.
    for (const f of ROUTES[4][1]) expect(raw(f)).toMatch(/max-age=31536000, immutable/);
  });
});

describe('the reload under a new version (the full detail; H225)', () => {
  const detail = said('how', 'What the pages about your own plants do send');
  const early = spanWords(claim(detail, /reloaded at once only in its first (\w+ seconds?)/));
  const base = { servedByOld: true, askedSkip: true, build: 'new', version: 'old', sinceStart: 0, typed: false, writing: 0 };
  it('at once only in the first seconds the sentence gives, with nothing typed and nothing being written', () => {
    expect(EARLY_MS, detail.where).toBe(early);
    expect(onTakeOver({ ...base, sinceStart: early - 1 })).toBe('reload');
    expect(onTakeOver({ ...base, sinceStart: early })).toBe('next');
    expect(onTakeOver({ ...base, sinceStart: 1, typed: true })).toBe('next'); // "with nothing typed, ticked or chosen on it"
    expect(onTakeOver({ ...base, sinceStart: 1, writing: 1 })).toBe('next'); // "and nothing being written to your collection"
  });
  it('never for a first visit, a second copy of the same version, or a worker that does not say', () => {
    expect(detail.text).toMatch(/so a first visit, a second copy of the same version and a worker that does not say are never reloaded under you/);
    expect(onTakeOver({ ...base, servedByOld: false })).toBe('none');
    expect(onTakeOver({ ...base, build: 'old' })).toBe('none');
    expect(onTakeOver({ ...base, build: null })).toBe('none');
  });
  it('otherwise once the next move has finished, the page it reaches reloading when nothing is typed on it and nothing is being written', () => {
    expect(detail.text).toMatch(/the page it reaches reloading when nothing is typed on it and nothing is being written/);
    expect(onArrival({ pending: true, typed: false, writing: 0 })).toBe('reload');
    expect(onArrival({ pending: true, typed: true, writing: 0 })).toBe('none');
    expect(onArrival({ pending: true, typed: false, writing: 2 })).toBe('wait');
    expect(onArrival({ pending: false, typed: false, writing: 0 })).toBe('none');
  });
});

describe('"keep data", asked at most once a month (the key list, cultifolio.persistAskedAt)', () => {
  it('every ask waits the span the sentence gives from the last, and a page asks once at most', async () => {
    const list = said('how', 'What the device keeps outside the collection, every key');
    const span = spanWords(claim(list, /waits (a month|\w+ weeks?|\w+ days?) from the last/));
    const keep = await import('$lib/ui/keep-ask');
    expect(keep.ASK_EVERY_MS, list.where).toBe(span);
    const now = Date.UTC(2026, 9, 12);
    const spy = vi.spyOn(Date, 'now');
    try {
      localStorage.setItem(keep.PERSIST_ASKED, String(now - span + 1000));
      keep.forgetPageAsk();
      spy.mockReturnValue(now);
      persistCalls = 0;
      expect(await keep.askToKeep('load')).toBeNull(); // a month not yet over
      expect(persistCalls).toBe(0);
      spy.mockReturnValue(now + 1000);
      expect(await keep.askToKeep('first')).toBe(true); // over: asked, whichever reason
      expect(persistCalls).toBe(1);
      expect(localStorage.getItem(keep.PERSIST_ASKED)).toBe(String(now + 1000)); // written before it asks
      localStorage.removeItem(keep.PERSIST_ASKED);
      expect(await keep.askToKeep('load')).toBeNull(); // "a page asks once at most", even with the time gone
      expect(persistCalls).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
  it('"only once there is something of yours to keep, never for a visitor or in the example collection"', () => {
    const list = said('how', 'What the device keeps outside the collection, every key');
    expect(list.text).toMatch(/only once there is something of yours to keep, never for a visitor or in the example collection/);
    // The two callers: a load with something in the collection, and the first plant; the example refuses inside the gate.
    expect(raw('src/lib/db/collection.svelte.ts')).toMatch(/if \(this\.state\.size > 0\) void askToKeep\('load'\)/);
    expect(raw('src/lib/ui/keep-ask.ts')).toMatch(/if \(PAGE_IN_DEMO\) return Promise\.resolve\(null\);/);
    expect(source.filter((f) => /askToKeep\(/.test(raw(f)) && !f.endsWith('keep-ask.ts')).sort()).toEqual(['src/lib/db/collection.svelte.ts', 'src/lib/ui/grow/GrowLayer.svelte']);
  });
});

describe('Natural Earth (H64)', () => {
  it("the maps' coastlines are Natural Earth's, public domain, from files this site serves", () => {
    const s = said('how', 'The coastlines of the maps');
    expect(claim(s, /are (Natural Earth)'s/)).toBe('Natural Earth');
    expect(claim(s, /\((public domain)\)/)).toBe('public domain');
    const still = raw('src/lib/map/still.ts');
    expect(still).toMatch(/Natural Earth\s*\n?\s*\*?\s*coastlines \(public domain\)/);
    // "drawn from files this site serves itself": the map reads its own /maps/ files, and asks no tile server.
    expect(readdirSync('static/maps').length).toBeGreaterThan(0);
    expect(still).not.toMatch(/https?:\/\//);
  });
});

describe("the labels page's picks (the key list, cultifolio.labelsPicked)", () => {
  it('read back only on a reload or a return through history', () => {
    const list = said('how', 'What the device keeps outside the collection, every key');
    const clause = part(list, 'cultifolio.labelsPicked (', ')');
    expect(clause).toMatch(/read back only when that page is reloaded or brought back through the browser's history/);
    const labels = raw('src/routes/labels/+page.svelte');
    const read = /const reloaded = \(([^)]*)\)/.exec(labels)![1];
    expect(read.match(/'(reload|back_forward)'/g)!.sort()).toEqual(["'back_forward'", "'reload'"]);
  });
});

describe("the front page's photographs (H72)", () => {
  it('the pool, the photographs a species needs and the day\'s share are the figures the sentence gives', () => {
    const s = said('how', "The front page's photographs");
    const genera = numberWord(claim(s, /of the (\d+) genera with the most species/));
    const photos = numberWord(claim(s, /that have (\w+) photographs or more/));
    const perDay = numberWord(claim(s, /(\w+) of those \d+ are shown a day/));
    const page = raw('src/routes/+page.server.ts');
    // The pool's rule, which the build writes as `featured.json` since round seventy-six (`featuredPoolOf`)
    const rule = raw('src/lib/dossier/catalogue.ts').split('export function featuredPoolOf')[1];
    expect(Number(/genera\.slice\(0, (\d+)\)/.exec(rule)![1]), s.where).toBe(genera);
    expect(Number(/\(c\.photos \?\? 0\) >= (\d+)/.exec(rule)![1])).toBe(photos);
    expect(Number(/Math\.min\((\d+), pool\.length\)/.exec(page)![1])).toBe(perDay);
    expect(rule).toMatch(/c\.climate === 'ok'/); // "and a habitat climate"
    expect(rule).toMatch(/sort\(\(a, b\) => b\.open - a\.open\)\[0\]/); // "the species of each with the most openly licensed records"
  });
});

describe('the collector genera (H67)', () => {
  it('the count the sentence gives is the list file\'s', () => {
    // Round seventy-nine's paragraph (docs/PENDING-ABOUT-HOW-R79.md) says it in its second sentence.
    const first = said('how', 'The species list was derived, not chosen by hand');
    const s = /collector genera/.test(first.text) ? first : said('how', 'It is the file scripts/species-list.txt');
    const n = Number(claim(s, /of (\d+) collector genera/));
    const file = new Set(raw('scripts/specialist-genera.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))).size;
    expect(file, s.where).toBe(n);
    expect(claim(s, /the list is (scripts\/specialist-genera\.txt) in the source/)).toBe('scripts/specialist-genera.txt');
  });
});

describe('the page text the tests read', () => {
  it('is the text a visitor reads: no markup, entities read', () => {
    const how = aboutText('how');
    expect(how).not.toMatch(/\b(?:class|href|aria-[a-z]+)=/);
    expect(how).toContain('Britton & Rose');
  });
});

describe('hover preloading on the pages about your own plants (the full detail)', () => {
  const detail = said('how', 'What the pages about your own plants do send');
  const clause = part(detail, 'links on these pages are not preloaded on hover', ')');
  const layout = raw('src/routes/+layout.svelte');
  it('off on the whole page, the body included, which holds the top bar and the footer, and on the compare tray', () => {
    const places = claim({ ...detail, text: clause }, /anywhere on the page, (.*) included/).split(/, | and /).map((w) => w.replace(/^the /, '')).sort();
    expect(places, detail.where).toEqual(['compare tray', 'footer', 'top bar']);
    // The body's attribute is the router's last word for every link outside <main>: the top bar and the footer.
    expect(layout).toMatch(/document\.body\.setAttribute\('data-sveltekit-preload-data', privateRoute \? 'off' : 'hover'\)/);
    expect(layout.indexOf('<header id="topbar"')).toBeLessThan(layout.indexOf('<main class="wrap"'));
    expect(layout.indexOf('<footer')).toBeGreaterThan(layout.indexOf('</main>'));
    // The tray sits outside <main> too, and carries the page's setting on both its parts.
    expect(layout).toMatch(/<CompareBar low=\{tabAway\} preload=\{privateRoute \? 'off' : 'hover'\} \/>/);
    expect([...raw('src/lib/ui/CompareBar.svelte').matchAll(/<div class="(tray|cmppill)"[^>]*data-sveltekit-preload-data=\{preload\}/g)].length).toBe(2);
  });
  it('"these pages" are the pages about your own plants: every route that shows the collection is private', () => {
    const priv = new RegExp(/const privateRoute = \$derived\((\/.*\/)\.test\(page\.url\.pathname\)\)/.exec(layout)![1].slice(1, -1));
    for (const p of ['/plants', '/plants/2026-0001', '/propagation', '/places', '/labels', '/backup', '/sync', '/settings', '/today', '/frost']) expect(priv.test(p), p).toBe(true);
    for (const p of ['/', '/species/copiapoa-cinerea', '/compare', '/about/how']) expect(priv.test(p), p).toBe(false);
  });
});

describe('a move between pages that fails (H206)', () => {
  it('the framework asks for the version file once, and only when a new version is out does the app ask for the worker', () => {
    const s = said('how', 'When a move between pages fails or ends on an error page');
    expect(claim(s, /asks once for (\/_app\/version\.json)/)).toBe('/_app/version.json');
    expect(claim(s, /asks once more for (\/service-worker\.js)/)).toBe('/service-worker.js');
    expect(raw('svelte.config.js')).toMatch(/pollInterval: 0/); // the framework's own poll is off: only a failed move asks
    expect(raw('node_modules/@sveltejs/kit/src/runtime/client/client.js')).toMatch(/updated\.check\(\)/);
    // The app asks the worker only once `updated` says a new version is out, and lets a waiting one take over first.
    expect(raw('src/routes/+layout.svelte')).toMatch(/if \(!updated\.current[^\n]*\n\s*navigator\.serviceWorker\.getRegistration\(\)\.then\(async \(reg\) => \{\n\s*if \(!reg\) return;\n\s*if \(reg\.waiting\) return skipTo\(reg\.waiting\);\n\s*await reg\.update\(\)/);
  });
});

/*
 * Two sentences the audit of round seventy found the code does not keep (docs/review-70/P.md, the audit), in no other
 * agent's area, so corrected in this pass. Both failed on the base: the base's sentences did not say what is read here.
 */

describe('Related: the distance in rain (H173)', () => {
  // The base said "the difference in rain on a log scale weighted so that a factor of 2.7 in a month's rain counts as
  // three degrees". The log is of the month's rain plus 1 mm (`Math.log1p`), so a factor of 2.7 counts three degrees only
  // in a wet month: 1 mm against 2.7 mm counted 1.85.
  const s = said('how', 'The distance is one number');
  const flat = (rain: number) => Array.from({ length: 12 }, () => ({ tmax: 25, tmin: 10, precipMm: rain }));
  it('the log is of the rain plus the millimetre the sentence names, at the weight it gives', () => {
    const plus = numberWord(claim(s, /each month's rain plus (\w+) mm/));
    const factor = Number(claim(s, /a factor of ([\d.]+) in that figure/));
    const degrees = numberWord(claim(s, /counts as (\w+) degrees/));
    // A factor in "rain plus 1 mm", every month: exactly the degrees the sentence gives.
    const a = 100, b = (a + plus) * factor - plus;
    expect(climateDistance(flat(a), flat(b)), s.where).toBeCloseTo(degrees, 1);
  });
  it('and its two cases: a wet month and a dry one', () => {
    const wet = /in a month of (\d+) mm against one of (\d+) mm, (\w+) degrees/.exec(s.text);
    const dry = /in a month of ([\d.]+) mm against one of ([\d.]+) mm, under (\w+)/.exec(s.text);
    expect(wet, s.where).not.toBeNull();
    expect(dry, s.where).not.toBeNull();
    expect(Math.round(climateDistance(flat(Number(wet![1])), flat(Number(wet![2]))))).toBe(numberWord(wet![3]));
    expect(climateDistance(flat(Number(dry![1])), flat(Number(dry![2])))).toBeLessThan(numberWord(dry![3]));
  });
});

describe('the map marker with no open record (H115)', () => {
  // The base said "the centre of the nearest tenth-of-a-degree cell". The cell is the one that holds the population's
  // middle, and when a restricted record lies exactly on its centre the marker moves a hundredth of a degree north, so
  // that record's position is still not published (`habitatCentre`).
  const s = said('how', 'When no openly licensed record lies in the population');
  const cluster = (points: Array<[number, number]>): Cluster => ({ lat: -24.83, lon: 18.47, n: points.length, share: 1, dominant: true, cell: 1, points });
  it('the centre of the tenth-of-a-degree cell that holds the middle', () => {
    expect(s.text, s.where).toMatch(/the centre of the tenth-of-a-degree cell that holds the population's middle/);
    const at = habitatCentre(cluster([[-24.83, 18.47], [-24.81, 18.49], [-24.9, 18.4]]), []);
    expect(at.snapped).toBe('cell-centre');
    expect([at.lat, at.lon]).toEqual([-24.85, 18.45]);
  });
  it('moved by the distance and the way the sentence gives when a restricted record lies on that centre', () => {
    const step = claim(s, /moved (a hundredth|a tenth|\w+ hundredths) of a degree (north|south|east|west)/);
    const dir = claim(s, /of a degree (north|south|east|west) when a restricted record lies exactly there/);
    const by = step === 'a hundredth' ? 0.01 : NaN;
    const at = habitatCentre(cluster([[-24.83, 18.47], [-24.85, 18.45], [-24.9, 18.4]]), []);
    expect(at.lon, s.where).toBe(18.45);
    expect(+(at.lat - -24.85).toFixed(3)).toBe(dir === 'north' ? by : -by);
  });
});
