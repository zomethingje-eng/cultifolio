/**
 * Round eighty-seven, the owner's predeploy (WebKit, Firefox and Windows' fonts): the fixes that can be read without a
 * browser.
 *
 * 1. The Georgia faces (r63u U1 on Windows, Chromium and Firefox): set the site's sentences at 102.7% and 103.1% of the
 *    web font's width at the test's 20 px, where Times New Roman's faces measured 102.1%, which is the serif's optical
 *    size at 20 px and not an error (Liberation Serif, Times's metric twin, 100.2% at 18 px and 102.1% at 20 here). The
 *    averages are measured: 931 x 102.7/102.1 and 1082 x 103.1/102.1, and the ascent and descent are 1.036 and 0.335 of
 *    the web font over the new size, as every face's are.
 * 2. The install list (r80u offline 2, WebKit: 201 files against a ceiling of 158): the front page and the layout ask
 *    `import.meta.glob` whether the browse pages, /changes and /about/data are in the build, and the build lists each
 *    glob as a dynamic import of that page's component. `offlineBuild` followed them into 21 files of pages that need the
 *    network; now another page's component (a node's `_page` chunk) is not followed from an offline page.
 *
 * 3. The map files kept for offline (r80u offline 3, the WebKit phone, the owner's second predeploy): a species page hands
 *    the worker its maps' files when the browser is idle, and Safari, with no idle callback, waited two seconds; a page
 *    left sooner handed over nothing. Now they are handed over as the page is left, once.
 *
 * On r87final (b0c34d3): 1 FAILED (93.7108% and 83.8506%); 2 FAILED (the browse page's component listed); 3 FAILED
 * (nothing handed over on leaving).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { offlineBuild } from '../../scripts/offline-files.mjs';
import { keepForOffline } from '../../src/lib/map/near';

const css = readFileSync('src/lib/ui/theme.css', 'utf8');
const face = (fam: string, w: string) => css.split('\n').find((l) => l.startsWith(`@font-face { font-family: '${fam}'; font-style: italic; font-weight: ${w};`)) ?? '';
const num = (line: string, prop: string) => Number((new RegExp(`${prop}: ([\\d.]+)%`).exec(line) ?? [])[1]);

describe('r87pd 1: the Georgia faces, measured', () => {
  it('Georgia italic is scaled by its own error at 20 px, the optical size left as Times shows it', () => {
    const g = face('Source Serif 4 Fallback Georgia', '100 500'), b = face('Source Serif 4 Fallback Georgia', '600 900');
    expect(num(g, 'size-adjust')).toBeCloseTo((93.7108 * 102.1) / 102.7, 1);
    expect(num(b, 'size-adjust')).toBeCloseTo((83.8506 * 102.1) / 103.1, 1);
  });
  it('their ascent and descent are the web font\'s 1.036 and 0.335 over the new size, as every serif face\'s are', () => {
    for (const fam of ['Georgia', 'Times', 'Noto', 'Liberation', 'DejaVu']) for (const w of ['100 500', '600 900']) {
      const l = face(`Source Serif 4 Fallback ${fam}`, w);
      const s = num(l, 'size-adjust') / 100;
      expect((num(l, 'ascent-override') / 100) * s, `${fam} ${w}`).toBeCloseTo(1.036, 3);
      expect((num(l, 'descent-override') / 100) * s, `${fam} ${w}`).toBeCloseTo(0.335, 3);
    }
  });
  it('the Times faces, which the run measured at 102.1%, are as they were', () => {
    expect(num(face('Source Serif 4 Fallback Times', '100 500'), 'size-adjust')).toBe(104.3598);
    expect(num(face('Source Serif 4 Fallback Times', '600 900'), 'size-adjust')).toBe(105.8651);
  });
});

describe('r87pd 2: the install list leaves out other pages asked about by a glob', () => {
  const G = '.svelte-kit/generated/client-optimized';
  const manifest = {
    [`${G}/app.js`]: { file: '_app/immutable/entry/app.A.js', isEntry: true, imports: ['_shared.js'], dynamicImports: [`${G}/nodes/0.js`, `${G}/nodes/1.js`, `${G}/nodes/2.js`] },
    '_shared.js': { file: '_app/immutable/chunks/shared.C.js' },
    // The front page: its own component, and the browse page's, which its glob names.
    [`${G}/nodes/0.js`]: { file: '_app/immutable/nodes/0.D.js', isEntry: true, imports: ['_shared.js', '_front.js'], dynamicImports: ['_browse.js', 'src/lib/export/sheet.ts'] },
    '_front.js': { file: '_app/immutable/chunks/front.E.js', name: '_page' },
    // The browse page: its node imports its component, which imports the browse view and its stylesheet.
    [`${G}/nodes/1.js`]: { file: '_app/immutable/nodes/1.F.js', isEntry: true, imports: ['_shared.js', '_browse.js'] },
    '_browse.js': { file: '_app/immutable/chunks/browse.G.js', name: '_page', imports: ['_view.js'], css: ['_app/immutable/assets/BrowseView.H.css'] },
    '_view.js': { file: '_app/immutable/chunks/view.I.js', name: 'BrowseView' },
    // A plant page, offline, which takes the export's writer on demand as well.
    [`${G}/nodes/2.js`]: { file: '_app/immutable/nodes/2.J.js', isEntry: true, imports: ['_shared.js'], dynamicImports: ['src/lib/export/sheet.ts'] },
    'src/lib/export/sheet.ts': { file: '_app/immutable/chunks/sheet.K.js', isDynamicEntry: true }
  };
  const routes: Record<string, string> = {
    [`${G}/nodes/0.js`]: 'src/routes/+page.svelte',
    [`${G}/nodes/1.js`]: 'src/routes/browse/+page.svelte',
    [`${G}/nodes/2.js`]: 'src/routes/plants/+page.svelte'
  };
  const list = offlineBuild(manifest, (k) => routes[k] ?? null);
  it('the front page and its own component are installed; the browse page\'s component, its view and its sheet are not', () => {
    expect(list).toContain('_app/immutable/nodes/0.D.js');
    expect(list).toContain('_app/immutable/chunks/front.E.js');
    for (const f of ['chunks/browse.G.js', 'chunks/view.I.js', 'assets/BrowseView.H.css', 'nodes/1.F.js']) expect(list).not.toContain(`_app/immutable/${f}`);
  });
  it('an on-demand import that is no page\'s component is still followed (the export\'s writer)', () => {
    expect(list).toContain('_app/immutable/chunks/sheet.K.js');
  });
});

describe('r87pd 3: a species page hands over its map files as it is left, once', () => {
  // A window as Safari's engine has it: a worker in control, the page loaded, no requestIdleCallback.
  function safari() {
    const posted: unknown[] = [];
    const on = new Map<string, () => void>();
    const timers: Array<() => void> = [];
    const win = {
      navigator: { serviceWorker: { controller: { postMessage: (m: unknown) => posted.push(m) } } },
      document: { readyState: 'complete' },
      addEventListener: (t: string, f: () => void) => on.set(t, f),
      removeEventListener: (t: string) => on.delete(t),
      setTimeout: (f: () => void) => (timers.push(f), timers.length),
      clearTimeout: () => {}
    } as unknown as Window & typeof globalThis;
    const use = (h: string) => ({ getAttribute: (a: string) => (a === 'data-href' ? h : null) });
    const root = { querySelectorAll: () => [use('/maps/land50.svg#land'), use('/maps/w/w-CLN.svg#r'), use('/maps/r/r-CLN.svg#r')] } as unknown as Element;
    return { win, root, posted, on, timers };
  }
  const files = ['/maps/land50.svg', '/maps/w/w-CLN.svg', '/maps/r/r-CLN.svg'];

  it('left out of the page before the two seconds: handed over on pagehide, and not again when the timer comes', () => {
    const { win, root, posted, on, timers } = safari();
    keepForOffline(root, win);
    expect(posted).toEqual([]);
    on.get('pagehide')?.();
    expect(posted).toEqual([{ type: 'keep-maps', files }]);
    for (const t of timers) t();
    expect(posted).toHaveLength(1);
  });
  it('left by a link inside the app (the undo) before the two seconds: handed over then', () => {
    const { win, root, posted } = safari();
    const undo = keepForOffline(root, win);
    undo();
    expect(posted).toEqual([{ type: 'keep-maps', files }]);
  });
  it('stayed on: handed over once, by the timer, and leaving after does not send them again', () => {
    const { win, root, posted, timers } = safari();
    const undo = keepForOffline(root, win);
    for (const t of timers) t();
    undo();
    expect(posted).toEqual([{ type: 'keep-maps', files }]);
  });
});
