/**
 * Round eighty-five, Q (outside review A23): source-text tests that guarded behaviour, made behavioural. Each of these
 * read a component's source for a line of code; a rewrite that kept the behaviour failed them, and one that kept the
 * line and broke the behaviour passed. Now each mounts the component (tests/unit/helpers/mount.ts) or renders it, and
 * reads what it does.
 *
 * 1. The climate chart is drawn at the width it is shown at, from 260 px up to 960, and before that width is known (the
 *    server's drawing) twice, at 340 for a phone and 720 for wider, CSS showing one (round eighty-five, E's A20): was `r84e-species-words.test.ts:115`, the source's `shown === 0 ? 720 : Math.max(260,
 *    Math.min(shown - 20, 960))`. Checked to fail with the clamp taken out (`shown - 20` alone) and with the width fixed
 *    at 720.
 * 2. A plant page sends the plant's name to the catalogue's search only when "Is it an older name?" is pressed, never as
 *    it opens: was `r84m-merge.test.ts:52-54`, the button's markup and a count of the handler's name in the source. The
 *    sentence /about/how promises stays a source-text test there, as a written promise. Checked to fail with the
 *    lookup run as the page opens (an `$effect` calling `lookOlder`).
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { Route } from '@playwright/test';
import { mount, stopMounting, untilInPage } from './helpers/mount';
import { inject } from '../e2e/helpers/inject';

afterAll(stopMounting);
const SLOW = 240_000; // the first mount of a file pays for the browser and the transform (35 s on a cold Windows run)

describe('1. the climate chart is drawn at the width it is shown at', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 20 + 8 * Math.cos(i / 2), tmin: 5 + 6 * Math.cos(i / 2), tmean: 12, precipMm: 40 + i, dli: 20 + i, rh: 60 }));
  const climate = { months, p10: months, p90: months, cells: 40, extremes: { minAbs: -24.1, maxP99: 30, years: 44 } };
  /** The drawing's own width, from its viewBox. */
  const drawnWidth = (html: string) => Number(/<svg[^>]*viewBox="0 0 ([\d.]+) /.exec(html)?.[1]);
  it('before the width is known (the server\'s page, a reader without scripts): 340 for a phone and 720 for wider', async () => {
    const { render } = await import('svelte/server');
    const { default: Climograph } = await import('$lib/ui/Climograph.svelte');
    const body = render(Climograph, { props: { climate: climate as never } }).body;
    expect([...body.matchAll(/<svg[^>]*viewBox="0 0 ([\d.]+) /g)].map((m) => Number(m[1]))).toEqual([340, 720]);
  });
  it('in the browser: the width it is shown at less its margins, never under 260 px nor over 960', async () => {
    const m = await mount('src/lib/ui/Climograph.svelte', { climate }, { html: '<style>#target { width: var(--w); }</style>', setup: "document.documentElement.style.setProperty('--w', '420px');" });
    try {
      const at = async (w: number) => {
        await m.page.evaluate((px) => document.documentElement.style.setProperty('--w', `${px}px`), w);
        await m.page.waitForFunction((want) => { const s = document.querySelector('svg[viewBox]'); return !!s && Math.abs(Number(s.getAttribute('viewBox')!.split(' ')[2]) - want) < 1; }, Math.max(260, Math.min(w - 20, 960)), { timeout: 10_000 }).catch(() => {});
        return drawnWidth(await m.page.locator('#target').innerHTML());
      };
      expect(await at(420)).toBe(400); // a phone's column
      expect(await at(300)).toBe(280);
      expect(await at(200)).toBe(260); // narrower than the labels allow: kept at 260 and scrolled
      expect(await at(1400)).toBe(960); // a wide screen: no wider than 960
    } finally {
      await m.close();
    }
  }, SLOW);
});

describe('2. a plant page asks the catalogue\'s search by name only when "Is it an older name?" is pressed', () => {
  it('opened, it asks for its hash group alone; pressed, it sends the name once', async () => {
    const searches: string[] = [];
    const answer = async (r: Route, url: URL) => {
      if (url.pathname === '/api/corpus') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r85q', buckets: 1 }) });
      // The plant's hash group holds no page under its name: "No species page under this name".
      if (url.pathname === '/api/sheets') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (url.pathname === '/api/search') { searches.push(url.searchParams.get('q') ?? ''); return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
      return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    };
    const load = `void (await import('/src/lib/db/collection.svelte.ts')).collection.load();`;
    const first = await mount('tests/unit/helpers/Nothing.svelte', {}, { answer, setup: load });
    try {
      await untilInPage(first.page, '/src/lib/db/collection.svelte.ts', '({ collection }) => collection.ready');
      await inject(first.page, [['accession', 'p1', 'acc', '2026-0001'], ['accession', 'p1', 'taxonName', 'Aloe aristata'], ['accession', 'p1', 'status', 'growing'], ['accession', 'p1', 'nameKind', 'species']], Date.now() - 86_400_000);
      const m = await mount('src/routes/plants/[acc]/+page.svelte', {}, { answer, into: first.page, setup: `window.__params = { acc: 'p1' }; ${load}` });
      // The page has read its hash group: no page under this name.
      await m.page.locator('#name-not-in-reference').waitFor({ timeout: 30_000 });
      expect(searches).toEqual([]); // opened: the name went nowhere (reverted: ['Aloe aristata'])
      const press = m.page.locator('#look-older');
      await press.waitFor({ timeout: 10_000 });
      await press.click();
      await expect.poll(() => m.page.locator('#older-name-none').count(), { timeout: 15_000 }).toBe(1);
      expect(searches).toEqual(['Aloe aristata']);
    } finally {
      await first.close();
    }
  }, SLOW);
});
