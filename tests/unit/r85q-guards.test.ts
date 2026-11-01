/**
 * Round eighty-five, Q (outside review A23): four fixes of round eighty-four that only a browser spec guarded, which
 * needs the whole app built and served, now guarded here, on the components themselves, in a real page
 * (tests/unit/helpers/mount.ts: Chromium, no server, no build):
 *
 * 1. Print opens what a reader would want on paper (round eighty-four, E's W10 and A's S5): the species page's care
 *    sections and its figures by month, and /about/how's lists of rules, on `beforeprint`; `afterprint` closes again only
 *    what print opened.
 * 2. Each map is tied to its caption (B8): every `aria-describedby` on the species page names an element that is there,
 *    and the two maps name their captions, drawn in the browser and drawn by the server.
 * 3. The footer is held until the page's own content is drawn (P2, A12, B4): `frame`'s holds are tokens, My plants
 *    releases it only with its list drawn, and Today only once the species sheets have answered.
 * 4. Today's line reads a backup's instant on the reader's own calendar (A14): the backup at 9 pm in Pittsburgh is
 *    "today" until midnight there and "1 d ago" the next morning. The caller that cut the instant's first ten
 *    characters (`split('T')[0]`) said "today" the next morning, and only the browser spec's evening case was guarded,
 *    which that caller also passes (outside review A23).
 *
 * How each was checked to fail: 1, with the two `beforeprint` listeners taken out; 2, with `describedBy` returning the
 * map unchanged; 3, with the two `releaseFooter()` calls made at once (and `frame.hold` returning a release that releases
 * every hold); 4, with Today's `ago` put back to `daysBetween(iso.split('T')[0], day.current)`. Each fails here.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { _forgetIndex } from '$lib/server/dossiers';
import { mount, stopMounting, inPage, untilInPage } from './helpers/mount';
import { inject, type Row } from '../e2e/helpers/inject';

afterAll(stopMounting);
const SLOW = 240_000; // the first mount of a file pays for the browser and the transform (35 s on a cold Windows run)

/** The fixture corpus as the server reads it, from fixtures/dossiers. */
const fixtures = (async (u: string | URL) => {
  const p = new URL(String(u), 'http://x').pathname;
  const f = p === '/s/v3/index.json' ? 'fixtures/dossiers/index.json' : p.startsWith('/s/v3/') ? `fixtures/dossiers${p}` : '';
  return f && existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
}) as typeof fetch;
/** The species page's data, by the page's own load over the fixture corpus: as a navigation in the app (`isDataRequest`), or as the server's first page. */
async function speciesData(slug: string, isDataRequest: boolean, locals: { drawn?: Map<string, string> } = {}): Promise<Record<string, unknown>> {
  _forgetIndex();
  const url = new URL(`http://x/species/${slug}`);
  const data = await load({ params: { slug }, platform: undefined, fetch: fixtures, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.1', locals, isDataRequest } as never);
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}
const nothing = (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
const openState = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll<HTMLDetailsElement>(s)].map((d) => d.open), sel);
const FRAME = '/src/lib/ui/frame.svelte.ts', COLLECTION = '/src/lib/db/collection.svelte.ts';
const opened = (page: Page) => untilInPage(page, COLLECTION, '({ collection }) => collection.ready');
const holding = (page: Page) => inPage<boolean>(page, FRAME, '({ frame }) => frame.holding');
const fire = (page: Page, type: 'beforeprint' | 'afterprint') => page.evaluate((t) => { dispatchEvent(new Event(t)); (window as unknown as { __flush: () => void }).__flush(); }, type);

describe('1. print opens what a reader wants on paper, and closes only what it opened', () => {
  it('the species page: its care sections and figures by month open on beforeprint; afterprint closes them, and one the reader opened stays open', async () => {
    const m = await mount('src/routes/species/[slug]/+page.svelte', { data: await speciesData('copiapoa-cinerea', true) }, { answer: nothing });
    try {
      const SHEETS = 'article.species details.acc, article.species details.figures';
      const before = await openState(m.page, SHEETS);
      expect(before.length).toBeGreaterThanOrEqual(2);
      expect(before.every((o) => !o)).toBe(true);
      // The reader opens the first one themselves.
      await m.page.locator('article.species details.acc').first().evaluate((d) => { (d as HTMLDetailsElement).open = true; });
      await fire(m.page, 'beforeprint');
      expect(await openState(m.page, SHEETS)).toEqual(before.map(() => true)); // fails without the page's listener
      // "How this section is made" is not for paper: print leaves it as it was.
      expect(await openState(m.page, 'article.species details.howmade')).toEqual([false]);
      await fire(m.page, 'afterprint');
      expect(await openState(m.page, SHEETS)).toEqual(before.map((_, i) => i === 0));
    } finally {
      await m.close();
    }
  }, SLOW);

  it('/about/how: every list of rules opens on beforeprint, and afterprint closes them again', async () => {
    const m = await mount('src/routes/about/how/+page.svelte', {}, { answer: nothing });
    try {
      const LISTS = 'article.prose details';
      const before = await openState(m.page, LISTS);
      expect(before.length).toBeGreaterThanOrEqual(10); // four of the sources' rules, six of the privacy section's
      await fire(m.page, 'beforeprint');
      expect((await openState(m.page, LISTS)).every(Boolean)).toBe(true);
      await fire(m.page, 'afterprint');
      expect(await openState(m.page, LISTS)).toEqual(before);
    } finally {
      await m.close();
    }
  }, SLOW);
});

describe('2. each map is tied to its caption', () => {
  /** Every `aria-describedby` on the page, each id with whether the page holds it. */
  const described = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[aria-describedby]')].flatMap((el) => el.getAttribute('aria-describedby')!.split(/\s+/).filter(Boolean).map((id) => ({ on: `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}`, id, there: !!document.getElementById(id) }))));
  const mapsTo = (page: Page) => page.evaluate(() => [...document.querySelectorAll('svg.map')].map((s) => [s.getAttribute('class'), s.getAttribute('aria-describedby'), document.getElementById(s.getAttribute('aria-describedby') ?? '')?.textContent?.trim().slice(0, 30) ?? null]));
  for (const [how, isDataRequest] of [['drawn in the browser (a move inside the app)', true], ['drawn by the server (the first page)', false]] as const) {
    it(`the range map and the records map name their captions, ${how}; no description names an element that is not there`, async () => {
      const locals: { drawn?: Map<string, string> } = {};
      const data = await speciesData('copiapoa-cinerea', isDataRequest, locals);
      expect(isDataRequest ? 'points' in data : typeof data.regionMark === 'string').toBe(true);
      const m = await mount('src/routes/species/[slug]/+page.svelte', { data }, { answer: nothing });
      try {
        // The server's first page: its hook puts the markup the load kept in its mark's place (src/lib/server/drawn.ts).
        if (!isDataRequest) {
          const drawn = [...(locals.drawn ?? new Map<string, string>())].map(([mark, html]) => [/data-drawn="([^"]+)"/.exec(mark)![1], html]);
          expect(drawn.map(([name]) => name)).toEqual(['region-map']);
          await m.page.evaluate((d) => { for (const [name, html] of d) document.querySelector(`[data-drawn="${name}"]`)!.outerHTML = html; }, drawn);
        }
        const maps = await mapsTo(m.page);
        expect(maps.map(([, id]) => id)).toEqual(['range-caption', 'records-caption']);
        for (const [cls, , caption] of maps) expect(caption, String(cls)).toBeTruthy();
        expect((await described(m.page)).filter((d) => !d.there)).toEqual([]);
      } finally {
        await m.close();
      }
    }, SLOW);
  }
});

describe('3. the footer is held until the page\'s own content is drawn', () => {
  it('frame: each hold is a token; one released twice releases nothing else', async () => {
    const m = await mount('tests/unit/helpers/Nothing.svelte', {}, { answer: nothing });
    try {
      // The page left calls its release again on destroy: a second call releases nothing else.
      const r = await inPage<boolean[]>(m.page, FRAME, `({ frame }) => { const seen = [frame.holding]; const a = frame.hold(), b = frame.hold(); seen.push(frame.holding); a(); a(); seen.push(frame.holding); b(); seen.push(frame.holding); return seen; }`);
      expect(r).toEqual([false, true, true, false]);
    } finally {
      await m.close();
    }
  }, SLOW);

  /** Every frame from the module's first run: whether the footer is held, and how many of the page's rows are drawn. */
  const watch = (rows: string) => `
    const { frame } = await import('/src/lib/ui/frame.svelte.ts');
    const { collection } = await import('/src/lib/db/collection.svelte.ts');
    window.__frames = [];
    (function tick() { window.__frames.push([frame.holding, document.querySelectorAll(${JSON.stringify(rows)}).length]); requestAnimationFrame(tick); })();
    void collection.load();`;
  const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Array<[boolean, number]> }).__frames);
  const plants = (n: number): Row[] => Array.from({ length: n }, (_, i) => [['accession', `f${i}`, 'acc', `2026-${String(i + 1).padStart(4, '0')}`], ['accession', `f${i}`, 'taxonName', 'Copiapoa cinerea'], ['accession', `f${i}`, 'status', 'growing'], ['accession', `f${i}`, 'nameKind', 'species']] as Row[]).flat();

  it('My plants: never released while the list is not drawn, and released once it is', async () => {
    const empty = await mount('tests/unit/helpers/Nothing.svelte', {}, { answer: nothing, setup: watch('a.accrow') });
    try {
      await opened(empty.page);
      await inject(empty.page, plants(40), Date.now() - 86_400_000);
      const m = await mount('src/routes/plants/+page.svelte', {}, { answer: nothing, setup: watch('a.accrow'), into: empty.page });
      await m.page.waitForFunction(() => document.querySelectorAll('a.accrow').length === 40, undefined, { timeout: 30_000 });
      await untilInPage(m.page, FRAME, '({ frame }) => !frame.holding');
      // From the page's first frame (the first held one; before it the page's module had not run): never released over
      // an empty list.
      const f = await frames(m.page);
      const from = f.findIndex(([held]) => held);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(f.slice(from).filter(([held, rows]) => !held && rows === 0)).toEqual([]);
    } finally {
      await empty.close();
    }
  }, SLOW);

  it('Today: held while the species sheets are out, released when they answer', async () => {
    let answerSheets: () => void = () => {};
    const sheetsBack = new Promise<void>((r) => (answerSheets = r));
    let asked = 0;
    const answer = async (r: Route, url: URL) => {
      if (url.pathname.startsWith('/api/sheets')) { asked++; await sheetsBack; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
      return nothing(r);
    };
    const empty = await mount('tests/unit/helpers/Nothing.svelte', {}, { answer, setup: watch('.today a') });
    try {
      await opened(empty.page);
      await inject(empty.page, plants(3), Date.now() - 40 * 86_400_000);
      const m = await mount('src/routes/today/+page.svelte', {}, { answer, setup: watch('.today a'), into: empty.page });
      await expect.poll(() => asked, { timeout: 30_000 }).toBeGreaterThan(0);
      // The collection is open and the sheets are out: still held.
      await opened(m.page);
      expect(await holding(m.page)).toBe(true);
      answerSheets();
      await untilInPage(m.page, FRAME, '({ frame }) => !frame.holding');
    } finally {
      answerSheets();
      await empty.close();
    }
  }, SLOW);
});

describe("4. Today's line reads a backup's instant on the reader's calendar (A14, A23)", () => {
  /** Today's "Kept on this device" line in Pittsburgh at the given instant, with a backup taken at 21:00 there on 29 October 2026. */
  async function lineAt(now: string): Promise<string> {
    const m = await mount('tests/unit/helpers/Nothing.svelte', {}, { answer: nothing, timezoneId: 'America/New_York', before: (p) => p.clock.setFixedTime(new Date(now)), setup: `void (await import('/src/lib/db/collection.svelte.ts')).collection.load();` });
    try {
      await opened(m.page);
      await inject(m.page, [['accession', 'b1', 'acc', '2026-0001'], ['accession', 'b1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'b1', 'status', 'growing'], ['accession', 'b1', 'nameKind', 'species']], Date.parse('2026-10-20T12:00:00Z'));
      // 21:00 on 29 October in Pittsburgh is 01:00 on the 30th in UTC.
      await inPage(m.page, '/src/lib/db/vault.ts', "({ setMeta }) => setMeta('lastBackup', '2026-10-30T01:00:00.000Z')");
      const t = await mount('src/lib/ui/Today.svelte', { where: 'today' }, { answer: nothing, into: m.page, setup: `void (await import('/src/lib/db/collection.svelte.ts')).collection.load();` });
      const line = t.page.locator('.today .line', { hasText: 'Kept on this device' });
      await line.waitFor({ timeout: 30_000 });
      return (await line.innerText()).replace(/\s+/g, ' ');
    } finally {
      await m.close();
    }
  }
  it('at 9.30 pm the same evening: "backup today"', async () => {
    expect(await lineAt('2026-10-30T01:30:00Z')).toContain('Kept on this device: backup today');
  }, SLOW);
  it('at 10 am the next morning: "backup 1 d ago", where the instant\'s UTC date said "today"', async () => {
    expect(await lineAt('2026-10-30T14:00:00Z')).toContain('Kept on this device: backup 1 d ago');
  }, SLOW);
});
