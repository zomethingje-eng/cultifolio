/**
 * A Svelte component mounted in a real browser page, without the app's server or build (round eighty-five, Q; outside
 * review A23: the picker's behaviours, print's `beforeprint`, the maps' `aria-describedby` and the footer hold were each
 * guarded by a browser spec alone, which needs the whole app built and served).
 *
 * Vite serves the component and its imports straight from `src/` (the Svelte plugin, the app's aliases, and a stand-in
 * for `$app/environment` that says "browser"); Playwright's Chromium opens a page at an address that only exists inside
 * the browser, and every request the page makes is either a module (answered by Vite) or one the test answers itself
 * (`answer`). Nothing listens on a port the outside can reach, nothing is built, and a test runs in about a second once
 * the first has paid for the browser and the transform.
 *
 * Chromium is Playwright's own (`npx playwright install chromium`, which the browser suite needs anyway) or the one
 * PW_CHROMIUM names. Without it the test fails and says so: a guard that skips itself guards nothing.
 */
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, type Browser, type Page, type Route } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { get } from 'node:http';

/** A module from Vite, straight to its port (never through a proxy the environment names for `fetch`). */
function local(url: string): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise((res, rej) => {
    get(url, (r) => {
      const parts: Buffer[] = [];
      r.on('data', (b: Buffer) => parts.push(b));
      r.on('end', () => res({ status: r.statusCode ?? 500, headers: Object.fromEntries(Object.entries(r.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>, body: Buffer.concat(parts) }));
      r.on('error', rej);
    }).on('error', rej);
  });
}

const root = resolve(__dirname, '../../..');
const ORIGIN = 'http://component.test';

let server: ViteDevServer | null = null;
let browser: Browser | null = null;
let base = '';

async function start(): Promise<void> {
  if (server) return;
  const stubs = resolve(tmpdir(), `cultifolio-mount-${process.pid}`);
  mkdirSync(stubs, { recursive: true });
  // `$app/environment` as a page of the app sees it; `$app/navigation` and `$app/state` as quiet stand-ins.
  writeFileSync(resolve(stubs, 'environment.js'), "export const browser = true, dev = true, building = false, version = 'component-test';\n");
  writeFileSync(resolve(stubs, 'navigation.js'), 'export const goto = async () => {}, invalidate = async () => {}, invalidateAll = async () => {}, beforeNavigate = () => {}, afterNavigate = () => {}, onNavigate = () => {}, pushState = () => {}, replaceState = () => {}, preloadData = async () => ({}), preloadCode = async () => {};\n');
  // A page's route parameters are the test's (`window.__params`, set in `setup`).
  writeFileSync(resolve(stubs, 'state.js'), "export const page = { get url() { return new URL(location.href); }, get params() { return globalThis.__params ?? {}; }, route: { id: null }, data: {}, state: {}, status: 200, error: null, form: null };\nexport const navigating = { current: null };\nexport const updated = { current: false, check: async () => false };\n");
  writeFileSync(resolve(stubs, 'paths.js'), "export const base = '', assets = '';\nexport const resolve = (p) => p;\n");
  server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    clearScreen: false,
    plugins: [svelte({ compilerOptions: { dev: false } })],
    resolve: {
      alias: [
        { find: /^\$app\/(environment|navigation|state|paths)$/, replacement: `${stubs}/$1.js` },
        { find: /^\$lib\//, replacement: `${root}/src/lib/` },
        { find: /^\$core\//, replacement: `${root}/src/lib/core/` },
        { find: /^\$dossier\//, replacement: `${root}/src/lib/dossier/` },
        { find: /^\$db\//, replacement: `${root}/src/lib/db/` },
        { find: /^\$climate\//, replacement: `${root}/src/lib/climate/` }
      ],
      conditions: ['svelte', 'browser', 'module', 'import', 'default']
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { strict: false } },
    appType: 'custom'
  });
  await server.listen();
  const addr = server.httpServer!.address();
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
  try {
    browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  } catch (e) {
    throw new Error(`these tests mount components in Chromium, which did not start: install it with \`npx playwright install chromium\` (the browser suite needs it too), or name one in PW_CHROMIUM. ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}

/** Close the browser and the server: each file that mounts calls this in `afterAll`. */
export async function stopMounting(): Promise<void> {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  browser = null;
  server = null;
}

export type Answer = (route: Route, url: URL) => Promise<void> | void;
export type Mounted = { page: Page; close: () => Promise<void> };

/**
 * Mount `component` (a path under src/, as `src/lib/ui/SpeciesPicker.svelte`) with `props` in a new page.
 * `answer` handles every request that is not a module (`/api/...`); without it such a request fails, as offline.
 * `html` is put in the page's body before the component (a form around it, a stylesheet); the component mounts into
 * `#target`. `setup` runs in the page before the component's module is imported (a stub, an event watcher).
 * The component's instance is `window.__c`, its props object `window.__props` (a `$state` proxy: writing to it updates
 * the component, as a parent's binding does). `window.__import(path)` imports one of the app's modules in the page (the
 * same instance the component holds), for a test's `page.evaluate`, whose own `import()` the test runner rewrites;
 * `inPage` is that, typed.
 */
export type MountOptions = {
  answer?: Answer;
  html?: string;
  setup?: string;
  viewport?: { width: number; height: number };
  hasTouch?: boolean;
  isMobile?: boolean;
  timezoneId?: string;
  /** Run on the page before it is opened: a clock installed (`page.clock.install`), an init script. */
  before?: (page: Page) => Promise<void>;
  /** An existing page (of an earlier mount) to mount in again, keeping its origin's storage: a reload. */
  into?: Page;
};

export async function mount(component: string, props: Record<string, unknown> = {}, opts: MountOptions = {}): Promise<Mounted> {
  await start();
  const context = opts.into ? opts.into.context() : await browser!.newContext({ viewport: opts.viewport ?? { width: 1000, height: 800 }, hasTouch: opts.hasTouch, isMobile: opts.isMobile, locale: 'en-GB', timezoneId: opts.timezoneId });
  const page = opts.into ?? (await context.newPage());
  if (opts.into) await page.unroute(`${ORIGIN}/**`);
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: page_(component, props, opts) });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/') || url.pathname.startsWith('/maps/')) {
      if (opts.answer) return opts.answer(route, url);
      return route.abort('internetdisconnected');
    }
    const r = await local(base + url.pathname + url.search);
    return route.fulfill({ status: r.status, headers: r.headers, body: r.body });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await opts.before?.(page);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => (window as unknown as { __mounted?: boolean; __error?: string }).__mounted || (window as unknown as { __error?: string }).__error, undefined, { timeout: 150_000 }); // a cold transform of the page's modules on a slow disk
  const err = await page.evaluate(() => (window as unknown as { __error?: string }).__error);
  if (err || errors.length) throw new Error(`the component did not mount: ${err ?? errors.join('; ')}`);
  return { page, close: () => context.close() };
}

function page_(component: string, props: Record<string, unknown>, opts: MountOptions): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>${opts.html ?? ''}<div id="target"></div>
<script type="module">
window.__import = (p) => import(p);
${opts.setup ?? ''}
try {
  const { start } = await import('/tests/unit/helpers/mount-entry.svelte.ts');
  const C = (await import('/${component}')).default;
  start(C, ${JSON.stringify(props)});
  window.__mounted = true;
} catch (e) { window.__error = String(e && e.stack || e); }
</script></body></html>`;
}

/** One of the app's modules, as the mounted page holds it, by its path under the root (`/src/lib/ui/frame.svelte.ts`). */
export function inPage<T>(page: Page, path: string, read: string): Promise<T> {
  return page.evaluate(`(async () => { const m = await window.__import(${JSON.stringify(path)}); return (${read})(m); })()`) as Promise<T>;
}
/** Wait until `read` (a function of the module, as source) is true in the page. */
export async function untilInPage(page: Page, path: string, read: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(`(async () => { const m = await window.__import(${JSON.stringify(path)}); return !!(${read})(m); })()`, undefined, { timeout });
}
