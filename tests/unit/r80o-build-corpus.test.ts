/**
 * Round eighty, agent O (review C, the owner's PC): every `npm run build` copied the corpus under static/s/ (4.5 GB,
 * 145,812 files on the owner's PC) twice, into .svelte-kit/output/client and .svelte-kit/cloudflare, for files
 * `.assetsignore` then kept out of the deploy; builds took minutes and the browser suite's server start ran out of time.
 * Now the app's own files are in static/app/ (`kit.files.assets`), the corpus stays where every script writes it, and
 * `vite dev` serves it at /s/ itself.
 *
 * On r80f: `files.assets` is unset (SvelteKit's `static`, which holds the corpus), vite.config.ts exports no
 * `corpusOnDisk`, and the server's own /s/ requests are not sent to the dev server.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import config from '../../svelte.config.js';

const kit = (config as { kit: Record<string, any> }).kit; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('the build copies the app\'s own files and not the corpus (round eighty; review C)', () => {
  it('the assets folder is static/app, and the corpus the scripts write (static/s/v3) is outside it', () => {
    expect(kit.files?.assets).toBe('static/app');
    const assets = resolve(kit.files.assets) + sep;
    for (const corpus of ['static/s/v3', 'static/s/v2']) expect(resolve(corpus).startsWith(assets)).toBe(false);
    // The scripts still write the corpus under static/s/ (the running plan's steps and the upload read it there).
    expect(readFileSync('scripts/build-dossiers.ts', 'utf8')).toMatch(/const outDir = fixtures \? 'fixtures\/dossiers' : 'static';/);
    expect(readFileSync('scripts/corpus-step.mjs', 'utf8')).toMatch(/const CORPUS = `static\/s\/v\$\{VERSION\}`;/);
  });

  it('the app\'s own files are all there, and .assetsignore still keeps s/ out of the deploy', () => {
    for (const f of ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest', 'og.png', 'maps/land110.svg', 'maps/land50.svg']) expect(existsSync(join('static/app', f)), f).toBe(true);
    expect(readFileSync('static/app/.assetsignore', 'utf8').split(/\r?\n/)).toContain('s/');
    // Nothing of the app's is left in static/ itself, which now holds only the corpus folder (gitignored) and app/.
    expect(readdirSync('static').filter((f) => f !== 's' && f !== 'app')).toEqual([]);
  });

  it('vite dev serves the corpus on disk at /s/, read-only and inside static/s/ alone', async () => {
    const { corpusOnDisk } = await import('../../vite.config');
    const root = mkdtempSync(join(tmpdir(), 'r80o-corpus-'));
    mkdirSync(join(root, 'v3'), { recursive: true });
    writeFileSync(join(root, 'v3', 'manifest.json'), '{"v":3}');
    writeFileSync(join(root, '..', `${root.split(sep).pop()}-secret.txt`), 'not the corpus');
    const plugin = corpusOnDisk(root);
    expect(plugin.apply).toBe('serve');
    let handler!: (req: { url?: string; method?: string }, res: unknown, next: () => void) => void;
    (plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (at: string, h: typeof handler) => { expect(at).toBe('/s'); handler = h; } } });
    const ask = (url: string) =>
      new Promise<{ status: 'next' | 'served'; body?: string; headers: Record<string, string> }>((done) => {
        const headers: Record<string, string> = {};
        const chunks: Buffer[] = [];
        const res = Object.assign(new Writable({ write(c: Buffer, _e: string, cb: () => void) { chunks.push(c); cb(); } }), { setHeader: (k: string, v: string) => (headers[k] = v) });
        res.on('finish', () => done({ status: 'served', body: Buffer.concat(chunks).toString(), headers }));
        handler({ url, method: 'GET' }, res, () => done({ status: 'next', headers }));
      });
    const got = await ask('/v3/manifest.json?c=x');
    expect(got).toMatchObject({ status: 'served', body: '{"v":3}' });
    expect(got.headers['content-type']).toBe('application/json');
    expect((await ask('/v3/k1.json')).status).toBe('next');
    expect((await ask('/v3')).status).toBe('next');
    expect((await ask(`/../${root.split(sep).pop()}-secret.txt`)).status).toBe('next');
    expect((await ask('/%2e%2e/etc/passwd')).status).toBe('next');
    expect((await ask('/%E0%A4%A')).status).toBe('next');
  });
});

describe("the server's own requests for /s/ under vite dev (round eighty)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it('go to the dev server, not to the app\'s router; anything else goes on as before', async () => {
    const { handleFetch } = await import('../../src/hooks.server');
    const network = vi.fn(async () => new Response('{"v":3}'));
    vi.stubGlobal('fetch', network);
    const own = vi.fn(async () => new Response('own'));
    const event = { url: new URL('http://localhost:5173/species/aloe-vera'), platform: undefined } as never;
    expect(import.meta.env.DEV).toBe(true);
    expect(await (await handleFetch({ event, request: new Request('http://localhost:5173/s/v3/manifest.json'), fetch: own as never })).text()).toBe('{"v":3}');
    expect(network).toHaveBeenCalledTimes(1);
    expect(await (await handleFetch({ event, request: new Request('http://localhost:5173/api/corpus'), fetch: own as never })).text()).toBe('own');
    expect(await (await handleFetch({ event, request: new Request('https://example.org/s/v3/manifest.json'), fetch: own as never })).text()).toBe('own');
    expect(network).toHaveBeenCalledTimes(1);
    // and in a build the branch is not there at all
    expect(readFileSync('src/hooks.server.ts', 'utf8')).toMatch(/if \(import\.meta\.env\.DEV && url\.origin === event\.url\.origin && url\.pathname\.startsWith\('\/s\/'\)\) return globalThis\.fetch\(request\);/);
  });
});
