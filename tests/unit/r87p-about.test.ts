/**
 * Round eighty-seven (pages): /about in the owner's words (plan D5), the about pages' row of links, and the sentences
 * this round's work touched on /about/how and /about/formats.
 *
 * 1. /about is a page, no longer a redirect, holding the owner's paragraph (#who) and the five sections the plan names.
 * 2. Its list of sources is /about/how's table of sources, row for row (`SOURCES`).
 * 3. It states no count of tests that could go stale: "thousands", and a link to them.
 * 4. What a visitor reads on /about, /about/data and /changes: no em dash, no emoji, no round number, no sentence over
 *    sixty words; every link to an about page's part names a part that is there.
 * 5. The row of links reaches every about page, each of which exists and draws it.
 * 6. /about/how says what the not-found page asks and loads, and what a plant's record keeps of its name's kind.
 *
 * On the base (r85m head): /about redirected to /about/how, and none of the files below existed.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { SOURCES } from '../../src/routes/about/sources';

const raw = (f: string) => readFileSync(f, 'utf8');
const ABOUT = 'src/routes/about/+page.svelte';
const HOW = 'src/routes/about/how/+page.svelte';
/** What a visitor reads: the markup without script, style, comments and tags, string literals in braces kept. */
const visible = (f: string) => visibleOf(raw(f));
const visibleOf = (src: string) => src
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\{[#/:@][^}]*\}/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

describe('r87p about 1: /about is the owner\'s page', () => {
  it('a page, not a redirect', () => {
    const ts = raw('src/routes/about/+page.ts');
    expect(ts).not.toMatch(/redirect\(/);
    expect(ts).toMatch(/prerender = true/);
    expect(existsSync(ABOUT)).toBe(true);
  });
  it('the owner\'s paragraph, his line said whole but for its last clause', () => {
    const src = raw(ABOUT);
    const who = /<section aria-labelledby="who">[\s\S]*?<p class="owner">([\s\S]*?)<\/p>/.exec(src);
    expect(who).not.toBeNull();
    expect(who![1]).toContain('Made by Jonathan, who grows cacti, succulents and rare bulbs and got tired of care advice that never said where it came from.');
    expect(who![1]).toContain('Built with Claude;');
    // No biography beyond the line: no place, no job, no year.
    expect(who![1]).not.toMatch(/\b(?:lives|works|born|in [A-Z][a-z]+,|\d{4})\b/);
  });
  it('the five sections: who and why, the reference, AI, cost and keeping, the tests', () => {
    const ids = [...raw(ABOUT).matchAll(/<h2 id="([\w-]+)">/g)].map((m) => m[1]);
    for (const id of ['who', 'what', 'ai', 'cost', 'tests', 'source']) expect(ids).toContain(id);
  });
  it('the AI section says no species text is generated, and links who writes the words', () => {
    const ai = /<section aria-labelledby="ai">([\s\S]*?)<\/section>/.exec(raw(ABOUT))![1];
    expect(ai).toContain('No text about a species is generated.');
    expect(ai).toContain('href="/about/how#written"');
    expect(ai).toContain('{list(SOURCES)}');
  });
  it('the cost section: free, no account, no tracking, no advertising; plants on the device unless synced, encrypted', () => {
    const t = visible(ABOUT);
    expect(t).toContain('It is free. There is no account, no tracking, no analytics and no advertising.');
    expect(t).toMatch(/Your plants stay on your device unless you turn on sync, which encrypts them on the device/);
  });
});

describe('r87p about 2: the sources are /about/how\'s table, row for row', () => {
  const rows = [...raw(HOW).matchAll(/<tr><th scope="row">([^<]+)<\/th>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  /** The table's rows a name of the list stands for. */
  const KEYS: Record<(typeof SOURCES)[number], RegExp> = {
    GBIF: /^GBIF |^National checklists, through GBIF$/,
    "Kew's World Checklist of Vascular Plants": /^World Checklist of Vascular Plants/,
    CHELSA: /^CHELSA/,
    ETOPO: /^ETOPO/,
    'NASA POWER': /^NASA POWER$/,
    'Natural Earth': /^Natural Earth$/,
    iNaturalist: /^iNaturalist$/,
    'Wikimedia Commons': /^Wikimedia Commons$/,
    Wikidata: /^Wikidata$/,
    Wikipedia: /^Wikipedia$/,
    // Round eighty-seven, stage 2 (the integration): the sources the stage-2 agents added to the table.
    "Kew's extinction risk predictions": /^Kew's extinction risk predictions/,
    'CITES Appendices': /^CITES Appendices$/,
    ChromoDB: /^ChromoDB/,
    'WFO Plant List': /^WFO Plant List$/,
    'Biodiversity Heritage Library': /^Biodiversity Heritage Library$/
  };
  it('the table has its rows', () => expect(rows.length).toBeGreaterThanOrEqual(11));
  it('every name of the list is a row of the table', () => {
    for (const s of SOURCES) expect(rows.some((r) => KEYS[s].test(r)), s).toBe(true);
  });
  it('every row of the table is a name of the list', () => {
    for (const r of rows) expect(SOURCES.some((s) => KEYS[s].test(r)), r).toBe(true);
  });
  it('and the footer names each', () => {
    const foot = /<footer class="credits">[\s\S]*?<p>Sources: ([^<]+)<\/p>/.exec(raw('src/routes/+layout.svelte'))?.[1] ?? '';
    for (const s of SOURCES) expect(foot, s).toContain(s === "Kew's World Checklist of Vascular Plants" ? 'WCVP (RBG Kew)' : s);
  });
});

describe('r87p about 3: no count of tests to go stale', () => {
  it('says thousands, and links the tests in the source', () => {
    const tests = /<section aria-labelledby="tests">([\s\S]*?)<\/section>/.exec(raw(ABOUT))![1];
    expect(tests).toContain('thousands of unit tests and browser tests');
    expect(tests).not.toMatch(/\d[\d,]*\s+(?:unit |browser )?tests/);
    expect(tests).toContain('/tree/main/tests');
  });
  it('and thousands is true: more than two thousand unit tests in the source', () => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const n = readdirSync('tests/unit').filter((f: string) => f.endsWith('.test.ts')).reduce((s: number, f: string) => s + (raw(`tests/unit/${f}`).match(/^\s*(?:it|test)(?:\.each\([^)]*\))?\(/gm)?.length ?? 0), 0);
    expect(n).toBeGreaterThan(2000);
  });
  it('the release script runs them before it says a version may be deployed', () => {
    const s = raw('scripts/predeploy.mjs');
    expect(s).toMatch(/the unit tests/);
    expect(s).toMatch(/the browser suite/);
  });
});

describe('r87p about 4: what a visitor reads', () => {
  const FILES = [ABOUT, 'src/routes/about/data/+page.svelte', 'src/routes/changes/+page.svelte', 'src/routes/about/AboutNav.svelte'];
  for (const f of FILES) {
    it(`${f}: no em dash, no emoji, no round spelt out, no sentence over sixty words`, () => {
      const t = visible(f);
      expect(t).not.toMatch(/—|\p{Extended_Pictographic}/u);
      // A table's cells and a list's items are no sentence: each is read on its own.
      const prose = raw(f).replace(/<table[\s\S]*?<\/table>/g, ' ').replace(/<\/(?:li|h2|td|th)>/g, '. ');
      expect(t).not.toMatch(/round (?:eighty|seventy|sixty)/i);
      const long = visibleOf(prose).split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 60);
      expect(long).toEqual([]);
    });
  }
  it('every link to a part of an about page names a part that is there', () => {
    const ids = (f: string) => new Set([...raw(f).matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
    const PAGE: Record<string, string> = { how: HOW, formats: 'src/routes/about/formats/+page.svelte' };
    const missing: string[] = [];
    for (const f of [...FILES, 'src/routes/+error.svelte']) for (const m of raw(f).matchAll(/\/about\/(how|formats)#([\w-]+)/g)) if (!ids(PAGE[m[1]]).has(m[2])) missing.push(`${f}: ${m[0]}`);
    expect(missing).toEqual([]);
  });
});

describe('r87p about 5: the row of links', () => {
  const nav = raw('src/routes/about/AboutNav.svelte');
  it('reaches every about page, each of which exists', () => {
    for (const [href, file] of [['/about', ABOUT], ['/about/how', HOW], ['/about/formats', 'src/routes/about/formats/+page.svelte'], ['/about/data', 'src/routes/about/data/+page.svelte'], ['/changes', 'src/routes/changes/+page.svelte']]) {
      expect(nav).toContain(href);
      expect(existsSync(file), file).toBe(true);
    }
  });
  it('the old pill of two is gone from both pages', () => {
    for (const f of [HOW, 'src/routes/about/formats/+page.svelte']) expect(raw(f)).not.toContain('class="seg topseg" aria-label="About"');
  });
});

describe('r87p about 6: /about/how says what this round\'s code does', () => {
  const t = visible(HOW);
  it('the not-found page\'s photograph and its one request', () => {
    // The browse pages named among them since the review of stage 1 (S3): their tiles load from the same hosts.
    expect(t).toMatch(/Species pages, the front page, the browse pages \(\s*\/browse\s* and the pages of a region, a genus and a family\), the compare page and the not-found page load photographs from iNaturalist/);
    expect(t).toMatch(/The not-found page asks once for the species of the day \(\s*\/about\/data\/today\s*\)/);
    expect(t).toContain('The not-found page of an address that is neither a species address nor a page of your own collection shows the first species of the day\'s strip');
  });
  it('the record of the name\'s kind, and what the plant\'s page does with it', () => {
    expect(t).toContain('The add form and an import record with the plant which of the two they found the name to be.');
    expect(t).toContain('says what the record holds only where the reference is not reached');
  });
  it('GBIF\'s name is listed as GBIF\'s name, not as an older name (round 86\'s correction holds)', () => {
    expect(t).toContain("GBIF's name for the same plant, where it differs, is listed under Names & registers as GBIF's name");
    expect(t).not.toMatch(/GBIF's name for the same plant, where it differs, is listed as an older name/);
  });
});
