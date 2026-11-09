/**
 * Round eighty-seven, stage 2 (the integration): what the integration added between the four agents' work, held here.
 *
 * 1. A hybrid's parents are read on the server, each from its own page (`parentPages`, the species page's load), and a
 *    parent whose page could not be read is null, which the Parents section says as "not checked", never as a parent
 *    with no page here (rule 2). The section is mounted on the page under Names and registers, with each parent's
 *    figures and their sources. No fixture page is a hybrid, so the hybrid here is the fixture's Copiapoa cinerea given
 *    Kew's formula of two parents, one of them Copiapoa humilis's page.
 * 2. Kew's authors of each older name (`name.kew.by`) do not move a page's day: no page shows them (the derived agent's
 *    report, checked). An older name itself still does.
 * 3. BHL's host is asked once a second at most, by the fetcher's own pacing, whatever the fill's.
 * 4. The CITES line's day is the Appendices' edition's, not the day the plant was listed.
 * 5. The two stage-2 plans parse as corpus-step reads them, in the order the integration gives: the fills that need the
 *    walk's pages after it, the index after every fill that changes pages, the checks after the index.
 *
 * FAILS on the merge before the integration (933ead6): the load returned no `parentPages`, the page mounted no Parents
 * section, an unread parent said "its page could not be read just now", `name.kew.by` moved the fingerprint, BHL was
 * paced at the default 0.1 s, the CITES line said "(in force from …)", and neither plan existed.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import type { Route } from '@playwright/test';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { _forgetIndex } from '$lib/server/dossiers';
import { substanceHash } from '$dossier/changed';
import { makeFetcher, resetPacing } from '$dossier/fetch';
import { citesWords } from '$lib/ui/ref/source-words';
import { parsePlan } from '../../scripts/corpus-step.mjs';
import { mount, stopMounting } from './helpers/mount';

afterAll(stopMounting);
const SLOW = 240_000;

const FIXTURE = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
/** Kew's formula for the fixture's Copiapoa cinerea, as a hybrid: one parent with a page here, one whose page is not read just now, one Kew's words do not match. */
const PARENTS = {
  formula: 'Copiapoa humilis × Copiapoa unread × Copiapoa nomatch',
  row: '2735933',
  file: '2026-06-04',
  of: [
    { name: 'Copiapoa humilis', row: '2735990', entry: '2735990', page: 'k2735990' },
    { name: 'Copiapoa unread', row: '9999901', entry: '9999901', page: 'k9999901' },
    { name: 'Copiapoa nomatch', why: "Kew's words name no row of its file" }
  ]
};
const HYBRID = { ...FIXTURE, parents: PARENTS };

/** The fixture corpus as the server reads it, the hybrid's dossier in place of Copiapoa cinerea's, and k9999901 not answered. */
const corpus = (async (u: string | URL) => {
  const p = new URL(String(u), 'http://x').pathname;
  if (p === '/s/v3/k2735933.json') return new Response(JSON.stringify(HYBRID), { headers: { 'content-type': 'application/json' } });
  if (p === '/s/v3/k9999901.json') return new Response('busy', { status: 503 });
  const f = p === '/s/v3/index.json' ? 'fixtures/dossiers/index.json' : p.startsWith('/s/v3/') ? `fixtures/dossiers${p}` : '';
  return f && existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
}) as typeof fetch;

async function speciesData(slug: string): Promise<Record<string, unknown>> {
  _forgetIndex();
  const url = new URL(`http://x/species/${slug}`);
  const data = await load({ params: { slug }, platform: undefined, fetch: corpus, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.1', locals: {}, isDataRequest: true } as never);
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}
const nothing = (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });

describe("1. a hybrid's parents, each read from its own page; one not read is not checked", () => {
  it('the load reads each linked parent once, and gives null for the one it could not read', async () => {
    const data = await speciesData('copiapoa-cinerea');
    const pages = data.parentPages as Record<string, { slug: string; name: string; figures: { coldLow: number | null; normals: string | null } } | null>;
    expect(Object.keys(pages).sort()).toEqual(['k2735990', 'k9999901']);
    expect(pages.k2735990?.slug).toBe('copiapoa-humilis');
    expect(pages.k2735990?.figures.coldLow).toEqual(expect.any(Number));
    expect(pages.k9999901).toBeNull();
  });

  it('the page mounts the section under Names and registers: the parent linked with its figures, the unread one not checked, the unmatched one why', async () => {
    const m = await mount('src/routes/species/[slug]/+page.svelte', { data: await speciesData('copiapoa-cinerea') }, { answer: nothing });
    try {
      const sec = m.page.locator('section#parents');
      await sec.waitFor();
      // After the registers' links (Names and registers), not elsewhere.
      expect(await sec.evaluate((s) => !!(document.querySelector('#s-registers')!.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(s.compareDocumentPosition(document.querySelector('#s-facts')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
      const rows = sec.locator('tbody > tr:not(.note)');
      await expect.poll(() => rows.count()).toBe(3);
      expect(await rows.nth(0).locator('a').getAttribute('href')).toBe('/species/copiapoa-humilis');
      expect(await rows.nth(0).innerText()).toMatch(/°C/);
      const unread = await rows.nth(1).innerText();
      expect(unread).toContain('not checked: its page could not be read just now');
      expect(unread).not.toContain('no page here'); // base: "no figures: no page here to read them from."
      expect(await rows.nth(2).innerText()).toContain("Kew's words name no row of its file");
      expect(await sec.innerText()).toContain('(WCVP, RBG Kew, file of 2026-06-04)');
    } finally {
      await m.close();
    }
  }, SLOW);
});

describe("2. Kew's authors of older names do not move a page's day", () => {
  it('name.kew.by is left out of the fingerprint; an older name of Kew\'s is not', () => {
    const d = { ...FIXTURE, name: { ...FIXTURE.name, kew: { ...FIXTURE.name.kew, synonyms: ['Echinocactus cinereus'] } } };
    const withBy = { ...d, name: { ...d.name, kew: { ...d.name.kew, by: [['Phil.']] } } };
    expect(substanceHash(withBy)).toBe(substanceHash(d)); // base: a new hash on every page with Kew's names
    const another = { ...d, name: { ...d.name, kew: { ...d.name.kew, synonyms: ['Echinocactus cinereus', 'Copiapoa cinerascens'] } } };
    expect(substanceHash(another)).not.toBe(substanceHash(d));
  });
});

describe("3. BHL's host is asked once a second at most", () => {
  beforeEach(() => resetPacing());
  it('two requests to www.biodiversitylibrary.org are a second apart', async () => {
    const at: number[] = [];
    const impl = (async () => { at.push(Date.now()); return new Response('{"Status":"ok","Results":[]}', { headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
    const f = makeFetcher(impl);
    await f('https://www.biodiversitylibrary.org/openurl?title=Cactaceae&volume=3&spage=86&date=1922&format=json');
    await f('https://www.biodiversitylibrary.org/openurl?title=Cactaceae&volume=3&spage=87&date=1922&format=json');
    expect(at).toHaveLength(2);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(990); // base: 100 ms, the default
  }, 20_000);
});

describe("4. the CITES line's day is the Appendices' edition's", () => {
  it('"the Appendices in force from", never "in force from" alone after the listing', () => {
    const w = citesWords({ status: 'ok', read: '2026-11-09', validFrom: '2026-03-05', appendix: 'II', level: 'family', listed: 'CACTACEAE spp.', annotation: '#4' });
    expect(w.body).toContain('Listed in Appendix II of CITES (the Appendices in force from 5 March 2026).');
    expect(w.body).not.toMatch(/CITES \(in force from/);
    // Until the owner's check, not asked: never "not listed".
    const na = citesWords({ status: 'skipped', read: '2026-11-09', detail: 'not asked: the table of the Appendices (src/lib/dossier/cites-appendices.tsv) has not yet been checked against the edition in force' });
    expect(na.body).toMatch(/^not asked: /);
    expect(na.body).not.toMatch(/not listed|Not in the CITES/);
  });
});

describe('5. the stage-2 plans, in order', () => {
  const lines = (f: string) => (parsePlan(readFileSync(f, 'utf8')) as Array<{ line: string; kind: string }>).map((s) => s.line);
  it('the main plan: backup first; the fills that need the walk after it; the index after every fill; the checks after the index; upload and live check last', () => {
    const l = lines('scripts/corpus-plan-r87s2.txt');
    const at = (s: string) => { const i = l.findIndex((x) => x === s || x.startsWith(`${s} `)); expect(i, s).toBeGreaterThanOrEqual(0); return i; };
    expect(l[0]).toBe('backup');
    const walk = at('dossier --walk --offline --grid climate --bulk bulk');
    expect(at('dossier --dry-run --offline --grid climate --bulk bulk')).toBeLessThan(walk);
    const index = at('dossier --index');
    for (const s of ['dossier --list-offline', 'dossier --keys rebuild-offline.txt,rebuild-summaries-left.txt,scripts/rebuild-r87.txt', 'dossier --fill kew-published --bulk bulk', 'dossier --fill sources --bulk bulk', 'dossier --fill summaries', 'dossier --fill elsewhere']) {
      expect(at(s), s).toBeGreaterThan(walk);
      expect(at(s), s).toBeLessThan(index);
    }
    expect(at('dossier --list-offline')).toBeLessThan(at('dossier --keys rebuild-offline.txt,rebuild-summaries-left.txt,scripts/rebuild-r87.txt'));
    for (const s of ['dossier --check-summaries', 'dossier --check-ranges', 'dossier --list-derived']) expect(at(s), s).toBeGreaterThan(index);
    expect(l.slice(-2)).toEqual(['upload', 'live-check']);
    // The fills that run for days are not in it.
    expect(l.some((x) => /--fill (flowering|bhl)\b/.test(x))).toBe(false);
    // Each review says what to stop on.
    for (const r of l.filter((x) => x.startsWith('review '))) expect(r, r.slice(0, 60)).toMatch(/\bStop\b/);
  });
  it('the daily plan: the two fills, the index, a review, the upload and the live check', () => {
    expect(lines('scripts/corpus-plan-r87-daily.txt').map((x) => x.split(/\s+/).slice(0, 3).join(' '))).toEqual(['dossier --fill flowering', 'dossier --fill bhl', 'dossier --index', 'review Read the', 'upload', 'live-check']);
  });
});
