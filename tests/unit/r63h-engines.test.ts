/**
 * Round sixty-three, the harness (H2 and H3): the browser projects in playwright.config.ts, the engines a run names, the
 * Chromium-only tests kept out of WebKit and Firefox, and the server the run waits for.
 *
 * - H3: the run waited for wrangler dev's port, which opens before the Worker can answer, so the first page of a spec with
 *   no warm-up of its own paid the server's start inside its 30 s (r61a a11y-perf 2, flaky on the PC). The config now
 *   waits for the front page's answer (`webServer.url`).
 * - H2: a phone project at Safari's page size by default; WebKit, the iPhone in WebKit and Firefox only when named; the
 *   Chromium binary given by PW_CHROMIUM to the Chromium projects only; and every test that uses a Chromium-only feature
 *   listed or tagged, so the other engines skip it rather than fail on it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { enginesNamed, CHROMIUM_ONLY, CHROMIUM_ONLY_TITLES } from '../e2e/helpers/engines';

const root = resolve(__dirname, '../..');
type Project = { name: string; grep?: RegExp | RegExp[]; grepInvert?: RegExp | RegExp[]; use?: Record<string, unknown> };
type Config = { projects: Project[]; webServer: { url?: string; port?: number; timeout?: number }; use: Record<string, unknown> };

const saved = { PW_BROWSERS: process.env.PW_BROWSERS, PW_CHROMIUM: process.env.PW_CHROMIUM };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
async function config(env: { PW_BROWSERS?: string; PW_CHROMIUM?: string }): Promise<Config> {
  for (const k of ['PW_BROWSERS', 'PW_CHROMIUM'] as const) if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
  vi.resetModules();
  return (await import('../../playwright.config')).default as unknown as Config;
}
const list = (r: RegExp | RegExp[] | undefined) => (r === undefined ? [] : Array.isArray(r) ? r : [r]);
/** What Playwright matches `grep` against: "project file title tags". */
const runs = (p: Project, line: string) => list(p.grep).every((r) => r.test(line)) && !list(p.grepInvert).some((r) => r.test(line));

describe('the run waits for an answer, not an open port (H3)', () => {
  it('webServer names the front page by url, with no port, and allows the slow start its three minutes', async () => {
    const c = await config({});
    expect(c.webServer.port).toBeUndefined();
    expect(c.webServer.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(c.webServer.timeout).toBeGreaterThanOrEqual(180_000);
  });
});

describe('the projects (H2)', () => {
  it('by default: Chromium, and the Chromium phone at Safari\'s page on an iPhone (390 x 664, touch, mobile, its user agent)', async () => {
    const c = await config({});
    expect(c.projects.map((p) => p.name)).toEqual(['chromium', 'phone']);
    const phone = c.projects[1].use!;
    expect(phone.browserName).toBe('chromium');
    expect(phone.viewport).toEqual({ width: 390, height: 664 });
    expect(phone.isMobile).toBe(true);
    expect(phone.hasTouch).toBe(true);
    expect(String(phone.userAgent)).toMatch(/iPhone.*Safari/);
  });

  it('a test tagged @phone runs on the desktop and the phone; @phone-only on the phone alone; an untagged one on the desktop alone', async () => {
    const [desk, phone] = (await config({})).projects;
    expect([runs(desk, 'chromium a.spec.ts t @phone'), runs(phone, 'phone a.spec.ts t @phone')]).toEqual([true, true]);
    expect([runs(desk, 'chromium a.spec.ts t @phone-only'), runs(phone, 'phone a.spec.ts t @phone-only')]).toEqual([false, true]);
    expect([runs(desk, 'chromium a.spec.ts t'), runs(phone, 'phone a.spec.ts t')]).toEqual([true, false]);
  });

  it('PW_BROWSERS=webkit,firefox adds WebKit, the iPhone in WebKit and Firefox; the iPhone runs the phone tests only, and no engine runs a Chromium-only test', async () => {
    const c = await config({ PW_BROWSERS: 'webkit,firefox' });
    expect(c.projects.map((p) => p.name)).toEqual(['chromium', 'phone', 'webkit', 'phone-webkit', 'firefox']);
    const by = Object.fromEntries(c.projects.map((p) => [p.name, p]));
    expect(by['phone-webkit'].use!.browserName ?? by['phone-webkit'].use!.defaultBrowserType).toBe('webkit');
    expect(by['phone-webkit'].use!.viewport).toEqual({ width: 390, height: 664 });
    expect(runs(by['phone-webkit'], 'phone-webkit a.spec.ts t @phone')).toBe(true);
    expect(runs(by['phone-webkit'], 'phone-webkit a.spec.ts t')).toBe(false);
    const cdp = 'webkit r62a-interface.spec.ts r62a a11y-perf 61-5: a returning grower\'s front page';
    for (const name of ['webkit', 'firefox']) {
      expect(runs(by[name], `${name} a.spec.ts an ordinary test`)).toBe(true);
      expect(runs(by[name], cdp)).toBe(false);
      expect(runs(by[name], `${name} a.spec.ts a new pdf test @chromium`)).toBe(false);
      expect(runs(by[name], `${name} a.spec.ts t @phone-only`)).toBe(false);
    }
    expect(runs(by.chromium, cdp)).toBe(true);
  });

  it('PW_CHROMIUM goes to the Chromium projects only: WebKit and Firefox launch their own builds', async () => {
    const c = await config({ PW_BROWSERS: 'all', PW_CHROMIUM: '/opt/some/chrome' });
    expect(c.use.launchOptions).toBeUndefined();
    for (const p of c.projects) {
      const exe = (p.use!.launchOptions as { executablePath?: string } | undefined)?.executablePath;
      expect([p.name, exe]).toEqual([p.name, p.name === 'chromium' || p.name === 'phone' ? '/opt/some/chrome' : undefined]);
    }
  });
});

describe('the engines a run names (tests/e2e/helpers/engines.ts)', () => {
  it('reads PW_BROWSERS and --project, ignores words that are not an engine, and brings the iPhone in WebKit with WebKit', () => {
    expect([...enginesNamed(undefined)]).toEqual([]);
    expect([...enginesNamed('')]).toEqual([]);
    expect([...enginesNamed('firefox')]).toEqual(['firefox']);
    expect([...enginesNamed(' WebKit , firefox ')].sort()).toEqual(['firefox', 'phone-webkit', 'webkit']);
    expect([...enginesNamed('all')].sort()).toEqual(['firefox', 'phone-webkit', 'webkit']);
    expect([...enginesNamed('chromium,safari')]).toEqual([]);
    expect([...enginesNamed(undefined, ['node', 'cli', 'test', '--project=phone-webkit'])]).toEqual(['phone-webkit']);
    expect([...enginesNamed(undefined, ['node', 'cli', 'test', '--project', 'firefox', 'tests/e2e/smoke.spec.ts', '-g', 'x'])]).toEqual(['firefox']);
    expect([...enginesNamed(undefined, ['node', 'cli', 'test', '--project', 'chromium'])]).toEqual([]);
  });
});

/**
 * Every use of a Chromium-only feature in the browser specs, with the title of the test it is in (a helper's uses are
 * charged to every test that calls the helper). Line-based, as the specs are written: a test starts at `test(` with its
 * title on the same line.
 */
function chromiumUses(): Array<{ file: string; line: number; title: string; tagged: boolean }> {
  const FEATURE = /newCDPSession|launchPersistentContext|['"]layout-shift['"]|\.pdf\(|\btextSize\(/; // textSize: helpers/text-size.ts, CDP
  const TEST = /^\s*test(?:\.(?:only|skip|fixme|fail))?\(\s*(['"`])((?:\\.|(?!\1).)*)/;
  const FN = /^(?:export )?(?:async )?function (\w+)|^(?:export )?const (\w+) = (?:async )?\(/;
  const dir = join(root, 'tests', 'e2e');
  const out: Array<{ file: string; line: number; title: string; tagged: boolean }> = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.spec.ts'))) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n');
    const enclosing = (from: number, seen = new Set<string>()): Array<{ i: number }> => {
      for (let i = from; i >= 0; i--) {
        if (TEST.test(lines[i])) return [{ i }];
        const fn = FN.exec(lines[i]);
        if (fn) {
          const name = fn[1] ?? fn[2];
          if (seen.has(name)) return [];
          seen.add(name);
          const calls = lines.flatMap((l, j) => (j !== i && new RegExp(`\\b${name}\\(`).test(l) ? [j] : []));
          return calls.flatMap((j) => enclosing(j, seen));
        }
        if (/^test\.(?:beforeEach|beforeAll|afterEach|afterAll)\(/.test(lines[i])) return [{ i: -1 }]; // a hook: every test of the file
      }
      return [{ i: -1 }];
    };
    lines.forEach((l, n) => {
      if (!FEATURE.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
      for (const { i } of enclosing(n)) {
        if (i < 0) { out.push({ file, line: n + 1, title: '(outside any test)', tagged: false }); continue; }
        const m = TEST.exec(lines[i])!;
        const raw = m[1] === '`' ? m[2].split('${')[0] : m[2];
        out.push({ file, line: n + 1, title: raw.replace(/\\(.)/g, '$1'), tagged: /@chromium\b/.test(lines[i]) });
      }
    });
  }
  return out;
}

describe('Chromium-only tests are kept out of the other engines (H2)', () => {
  const uses = chromiumUses();
  it('finds the uses (the reader works)', () => {
    expect(uses.length).toBeGreaterThan(10);
  });
  it('every test that uses a Chromium-only feature is listed in CHROMIUM_ONLY_TITLES or tagged @chromium', () => {
    const loose = uses.filter((u) => !u.tagged && !CHROMIUM_ONLY_TITLES.some(([t]) => u.title.startsWith(t) || (t.startsWith(u.title) && u.title.length > 12)));
    expect(loose.map((u) => `${u.file}:${u.line} ${u.title}`)).toEqual([]);
  });
  it('every listed title is a test that exists (a renamed test is not silently run on WebKit)', () => {
    const titles = new Set(uses.map((u) => u.title));
    const stale = CHROMIUM_ONLY_TITLES.filter(([t]) => ![...titles].some((u) => u.startsWith(t) || t.startsWith(u)));
    expect(stale.map(([t]) => t)).toEqual([]);
  });
  it('the pattern matches each listed title as Playwright presents it, and not an ordinary title', () => {
    for (const [t] of CHROMIUM_ONLY_TITLES) expect(CHROMIUM_ONLY.test(`webkit some.spec.ts ${t} and the rest`)).toBe(true);
    expect(CHROMIUM_ONLY.test('webkit smoke.spec.ts round sixty: the front page opens')).toBe(false);
  });
});

describe('scripts/predeploy.mjs names the engines (H2)', () => {
  const require = createRequire(import.meta.url);
  const webkitHere = (() => { try { return existsSync(require('@playwright/test').webkit.executablePath()); } catch { return false; } })();
  it.skipIf(webkitHere)('an engine named but not installed stops the run before the build, with the line that installs it', () => {
    // ['--browsers=webkit', 'firefox'] is what PowerShell makes of `--browsers=webkit,firefox`.
    for (const args of [['--browsers=webkit'], ['--project=phone-webkit'], ['--browsers=webkit', 'firefox']]) {
      const r = spawnSync(process.execPath, ['scripts/predeploy.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, PW_BROWSERS: '' }, timeout: 60_000 });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('npx playwright install webkit firefox');
      expect(r.stdout).not.toContain('the browser suite, strict');
      if (args[1] === 'firefox') expect(r.stderr).toContain('webkit and firefox');
    }
  }, 70_000);
});
