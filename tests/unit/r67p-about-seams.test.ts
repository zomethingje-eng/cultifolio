/**
 * The about pages' seams the earlier seam tests did not check (round sixty-seven; triage-66 P4, S-F6, S-F7, S-F8, R45-13).
 * Whole sentences and clauses, compared exactly, each beside the code that makes it true: a substring passed with the
 * sentence around it gone or changed.
 *
 * - the cookies, both ways, and that the server sets none;
 * - the framework's own session keys, which no `getItem`/`setItem` of the app's names;
 * - the browser's HTTP cache of this site's answers (a search kept a day under its URL);
 * - hover preloading, off on a private page everywhere, the tray outside <main> included;
 * - the reload under a new version;
 * - the "keep data" question's month;
 * - the sources: Natural Earth and Wikidata, which the footer and every species page credit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EARLY_MS } from '$lib/ui/take-over';
import { ASK_EVERY_MS } from '$lib/ui/keep-ask';

const raw = (f: string) => readFileSync(f, 'utf8');
const text = (f: string) => raw(f).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js|html)$/.test(f)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const source = walk('src').filter((f) => !f.includes('/about/'));

/** The text from `start` to the end of the sentence it begins (its full stop and a space, or the end). */
function sentence(t: string, start: string): string {
  const a = t.indexOf(start);
  expect(a, start).toBeGreaterThan(-1);
  expect(t.indexOf(start, a + 1), `"${start}" said once`).toBe(-1);
  const b = t.indexOf('. ', a);
  return t.slice(a, b < 0 ? undefined : b + 1);
}
/** The text from `start` up to (not including) `end`. */
function clause(t: string, start: string, end: string): string {
  const a = t.indexOf(start);
  expect(a, start).toBeGreaterThan(-1);
  const b = t.indexOf(end, a + start.length);
  expect(b, end).toBeGreaterThan(a);
  return t.slice(a, b);
}

describe('cookies, both ways', () => {
  /** Each cookie the code writes, with the paths it is written under. */
  const written = new Map<string, Set<string>>();
  for (const f of source) {
    for (const m of raw(f).matchAll(/document\.cookie\s*=\s*([^;\n]+(?:;[^\n]*)?)/g)) {
      for (const c of m[1].matchAll(/`(cultifolio\.[a-z]+)=[^`]*?path=([^;`]+)/g)) {
        const paths = written.get(c[1]) ?? new Set<string>();
        // A template path is the loop's: read the loop's literal list.
        if (c[2].startsWith('${')) for (const p of /for \(const path of \[([^\]]+)\]\)/.exec(raw(f))?.[1].matchAll(/'([^']+)'/g) ?? []) paths.add(p[1]);
        else paths.add(c[2]);
        written.set(c[1], paths);
      }
    }
  }
  it('the code writes exactly two cookies, the units for every page and the hemisphere for species and compare pages only', () => {
    expect([...written.keys()].sort()).toEqual(['cultifolio.hemi', 'cultifolio.units']);
    expect([...written.get('cultifolio.units')!]).toEqual(['/']);
    expect([...written.get('cultifolio.hemi')!].sort()).toEqual(['/compare', '/species']);
  });
  it('the short list and the full detail say them, whole', () => {
    expect(sentence(how, 'Two small cookies')).toBe('Two small cookies: your units, and once a site is set, its hemisphere.');
    expect(clause(how, 'two small cookies, your units', ';')).toBe('two small cookies, your units and, once a site is set, one letter for which hemisphere it is in, which goes only with species and compare pages so they render your months the right way up before any script runs');
  });
  it('the server sets no cookie, so the two are all there are', () => {
    const server = source.filter((f) => /\/server\/|\+server\.ts$|hooks\.server\.ts|\+page\.server\.ts|\+layout\.server\.ts/.test(f));
    expect(server.filter((f) => /cookies\.set\(|headers\.(set|append)\(\s*['"]set-cookie/i.test(raw(f)))).toEqual([]);
  });
});

describe("the framework's own session keys", () => {
  const kit = raw('node_modules/@sveltejs/kit/src/runtime/client/constants.js');
  const client = raw('node_modules/@sveltejs/kit/src/runtime/client/client.js');
  const keyOf = (name: string) => new RegExp(`export const ${name} = '([^']+)'`).exec(kit)?.[1];
  it('the framework writes these two to session storage, and no other', () => {
    expect([keyOf('SCROLL_KEY'), keyOf('SNAPSHOT_KEY')]).toEqual(['sveltekit:scroll', 'sveltekit:snapshot']);
    expect([...client.matchAll(/storage\.set\((\w+)/g)].map((m) => m[1]).sort()).toEqual(['SCROLL_KEY', 'SNAPSHOT_KEY']);
    expect(raw('node_modules/@sveltejs/kit/src/runtime/client/session-storage.js')).toMatch(/sessionStorage\[key\] = data/);
  });
  it('/about/how lists both under session storage, saying what each holds', () => {
    // In the session storage part of the list, which runs from its heading to "in IndexedDB".
    const session = how.slice(how.indexOf("in this tab's session storage"), how.indexOf('; in IndexedDB,') + '; in IndexedDB'.length);
    expect(clause(session, 'and two the framework the site is built with writes in every tab', ';')).toBe(
      "and two the framework the site is built with writes in every tab, sveltekit:scroll (how far each page of the tab's history was scrolled, so Back returns there) and sveltekit:snapshot (what a page asks to keep for Back and Forward"
    );
    expect(clause(session, 'no page of this site asks it to keep anything', '; in IndexedDB')).toBe('no page of this site asks it to keep anything, so it holds nothing of yours)');
    expect(source.filter((f) => /export const snapshot\b/.test(raw(f)))).toEqual([]); // "no page of this site asks it to keep anything"
  });
});

describe("the browser's HTTP cache of this site's answers", () => {
  /** Each route's public lifetime to the browser, from its own code. */
  const life = (f: string) => [...raw(f).matchAll(/public, max-age=(\$\{CACHE_S\}|\d+)/g)].map((m) => (m[1] === '${CACHE_S}' ? Number(/const CACHE_S = ([\d_]+)/.exec(raw(f))![1].replace(/_/g, '')) : Number(m[1])));
  it('each answer the clause names is kept by the browser for as long as it says', () => {
    for (const f of ['src/routes/api/search/+server.ts', 'src/routes/api/names/+server.ts', 'src/routes/api/entries/+server.ts', 'src/routes/api/sheets/+server.ts', 'src/routes/api/rows/+server.ts']) expect(new Set(life(f)), f).toEqual(new Set([86_400]));
    expect(raw('src/routes/api/forecast/+server.ts')).toMatch(/withRisk\(raw, `public, max-age=\$\{ttlOf\(alertsStatus\)\}`\)/);
    expect(raw('src/hooks.server.ts')).toMatch(/r\.headers\.set\('cache-control', `private, max-age=\$\{PAGE_CACHE_S\}`\)/);
    expect(raw('src/hooks.server.ts')).toMatch(/const PAGE_CACHE_S = 60\b/);
  });
  it('/about/how says it, whole', () => {
    expect(clause(how, "in the browser's own HTTP cache", '; and, while a page is open')).toBe(
      "in the browser's own HTTP cache, as for any site, this site's answers under their addresses for as long as each answer says: a catalogue search, the name you typed into the species picker as typed and its species part, a hash group's entries and figure sheets, and a window of the catalogue's rows for a day, a forecast for a rounded site for an hour, or five minutes when the National Weather Service did not answer for its alerts, and a page as rendered for a minute (they are cleared with the browser's own history and cache controls)"
    );
  });
});

describe('hover preloading on a private page', () => {
  const layout = raw('src/routes/+layout.svelte');
  it('is off on the whole page, the body included, and on the compare tray, which sits outside <main>', () => {
    expect(layout).toMatch(/document\.body\.setAttribute\('data-sveltekit-preload-data', privateRoute \? 'off' : 'hover'\)/);
    expect(layout).toMatch(/<CompareBar low=\{tabAway\} preload=\{privateRoute \? 'off' : 'hover'\} \/>/);
    const bar = raw('src/lib/ui/CompareBar.svelte');
    expect([...bar.matchAll(/<div class="(tray|cmppill)"[^>]*data-sveltekit-preload-data=\{preload\}/g)].length).toBe(2);
  });
  it('/about/how says so, whole', () => {
    expect(clause(how, 'and, when you follow a link to a species page', ' No page address')).toBe(
      'and, when you follow a link to a species page, that species, since you opened it (links on these pages are not preloaded on hover, anywhere on the page, the compare tray, the top bar and the footer included, so a name goes only when you click).'
    );
  });
});

describe('the reload under a new version', () => {
  it('the rule is the code\'s: four seconds, nothing typed, nothing being written, else the next move', () => {
    expect(EARLY_MS).toBe(4000);
    expect(clause(how, 'a page is reloaded under a new version', ');')).toBe(
      'a page is reloaded under a new version only when an older version was serving it and the version taking over says it is another, which the page asks the worker itself, inside the browser, so a first visit, a second copy of the same version and a worker that does not say are never reloaded under you; and it is reloaded at once only in its first four seconds, with nothing typed, ticked or chosen on it and nothing being written to your collection, and otherwise at your next move to another page, so nothing you have typed is lost to it'
    );
  });
  it('the requests a failed move makes: the version file, then the worker', () => {
    expect(sentence(how, 'When a move between pages fails or ends on an error page')).toBe(
      'When a move between pages fails or ends on an error page, the framework asks once for /_app/version.json, to learn whether a new version is out, and when one is, the app asks once more for /service-worker.js, so the new version\'s worker is fetched.'
    );
    expect(raw('src/routes/+layout.svelte')).toMatch(/if \(!updated\.current[^\n]*\n\s*navigator\.serviceWorker\.getRegistration\(\)\.then\(async \(reg\) => \{\n\s*if \(!reg\) return;\n\s*if \(reg\.waiting\) return skipTo\(reg\.waiting\);\n\s*await reg\.update\(\)/);
  });
});

describe('"keep data", asked at most once a month', () => {
  it('the month is the gate\'s, and the sentence is whole', () => {
    expect(ASK_EVERY_MS).toBe(30 * 86_400_000);
    expect(clause(how, 'cultifolio.persistAfterFirst (', ', and cultifolio.clockOffsetMs')).toBe(
      "cultifolio.persistAfterFirst (that the browser's answer to the question asked after your first plant, whether it will keep this site's storage, was said) and cultifolio.persistAskedAt (when a page last asked the browser that question, written before it asks; every ask, the one after your first plant included, waits a month from the last, a page asks once at most, and only once there is something of yours to keep, never for a visitor or in the example collection; Safari and Chrome answer by themselves, Firefox asks you, and no page waits for your answer)"
    );
  });
});

describe('the sources, both ways', () => {
  const footer = /<p>Sources: ([^;]+);/.exec(raw('src/routes/+layout.svelte'))![1].split(', ').map((s) => s.trim());
  /** The footer's names as the brief writes them. */
  const BRIEF: Record<string, string> = { 'GBIF Backbone': 'GBIF', 'WCVP (RBG Kew)': "Kew's WCVP" };
  it('the brief names every source the footer credits, and no other', () => {
    const brief = /built ahead of time from public data \(([^)]+)\)/.exec(how)![1].split(', ').map((s) => s.trim());
    expect(brief.sort()).toEqual(footer.map((f) => BRIEF[f] ?? f).sort());
    expect(brief).toContain('Natural Earth');
    expect(brief).toContain('Wikidata');
  });
  it('"What comes from where" says what Wikidata and Natural Earth supply, whole', () => {
    const where = how.slice(how.indexOf('What comes from where'), how.indexOf('Which species are here'));
    expect(sentence(where, "The species' identifiers in other databases")).toBe(
      "The species' identifiers in other databases (POWO, IPNI, World Flora Online and iNaturalist), the links to them, and the title of its English Wikipedia article come from Wikidata, from the item that carries the species' GBIF key, or, when no item does, the one whose label is the name exactly."
    );
    expect(sentence(where, 'The coastlines of the maps')).toBe("The coastlines of the maps on a species page are Natural Earth's (public domain), drawn from files this site serves itself.");
    // What the build does: the item by the GBIF key (P846) first, an exact label only when the key finds none.
    const wm = raw('src/lib/dossier/sources/wikimedia.ts');
    expect(wm).toMatch(/haswbstatement:P846=/);
    expect(wm).toMatch(/x\.label\.toLowerCase\(\) === scientificName\.toLowerCase\(\)/);
    expect(raw('src/lib/map/still.ts')).toMatch(/Natural Earth\s*\n?\s*\*?\s*coastlines \(public domain\)/);
  });
});

describe('the labels page brings its picks back on a reload or a return through history', () => {
  it('the code reads both, and the page says both', () => {
    expect(raw('src/routes/labels/+page.svelte')).toMatch(/\(nav\?\.type === 'reload' \|\| nav\?\.type === 'back_forward'\)/);
    expect(clause(how, 'cultifolio.labelsPicked (', '), cultifolio.sampleLeft')).toBe(
      "cultifolio.labelsPicked (the plants picked on the labels page, written when the page is hidden or left, forgotten when you move to another page of the app, and read back only when that page is reloaded or brought back through the browser's history, so a reload, or a phone bringing back a tab it had put away, keeps them"
    );
  });
});
