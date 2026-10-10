/**
 * Which browser engines a run uses, and which tests are Chromium's alone (round sixty-three; the harness brief H2).
 *
 * The default run is Chromium at the desktop size plus the tests tagged `@phone` on a Chromium phone. WebKit (Safari's
 * engine, also as the real iPhone profile, `phone-webkit`) and Firefox run only when named, because only Chromium is
 * installed where the suite is written and the owner installs the others on his PC (`npx playwright install webkit firefox`).
 *
 * This file is read by playwright.config.ts, in the runner and again in every worker, and by a unit test; it imports
 * nothing from Playwright, so it stays cheap to load.
 */

/** The projects that run only when named. `webkit` brings `phone-webkit` with it: the phone tests in Safari's engine are
 *  the reason to install it (round sixty-two's first screen held in Chromium and failed in Safari). */
export const NAMED_ENGINES = ['webkit', 'phone-webkit', 'firefox'] as const;

/**
 * The engines asked for, from PW_BROWSERS (comma or space separated; `all` for every one) and from `--project` on the
 * command line (`--project webkit`, `--project=webkit`, `--project webkit firefox`). A word that is not one of
 * NAMED_ENGINES is left to Playwright (`chromium`, `phone`, a spec path after `--project`'s values).
 */
export function enginesNamed(setting: string | undefined, argv: readonly string[] = []): Set<string> {
  const words = (setting ?? '').split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--project=')) words.push(...a.slice('--project='.length).split(',').map((w) => w.toLowerCase()));
    else if (a === '--project') for (let j = i + 1; j < argv.length && !argv[j].startsWith('-'); j++) words.push(...argv[j].split(',').map((w) => w.toLowerCase()));
  }
  const out = new Set<string>();
  for (const w of words) {
    if (w === 'all') NAMED_ENGINES.forEach((e) => out.add(e));
    else if ((NAMED_ENGINES as readonly string[]).includes(w)) out.add(w);
  }
  if (out.has('webkit')) out.add('phone-webkit');
  return out;
}

/**
 * Tests that use what only Chromium has, by the start of their title, each with its reason. They are left out of the
 * WebKit and Firefox projects (their `grepInvert`); a new test of this kind tags itself `@chromium` instead of being
 * listed (`test('…', { tag: '@chromium' }, …)`). tests/unit/r63h-engines.test.ts reads every spec for these features and
 * fails when a test that uses one is neither listed nor tagged, so the list cannot fall behind the specs.
 *
 * - A Chrome profile (`chromium.launchPersistentContext` with a `Preferences` file): the 200% text size is Chrome's own
 *   setting, and the test launches Chromium whatever the project; in another project it would test Chromium again.
 * - A CDP session (`newCDPSession`): CPU throttling, `Page.setFontSizes`, the accessibility tree; Chromium's protocol only.
 * - A layout-shift reading (`PerformanceObserver` of `layout-shift`): the Layout Instability API is Chromium's; WebKit and
 *   Firefox report no entries, so a shift check there reads 0 and proves nothing.
 * - `page.pdf()`: Chromium only.
 *
 * Each kind has a form every engine runs (round sixty-seven; triage-66 H3, R45-28), in tests/e2e/r67h-engines.spec.ts: the
 * accessibility tree by `toMatchAriaSnapshot`, 200% text by the root's font size (helpers/text-size.ts `rootText`), layout
 * shift by element positions read every frame (helpers/positions.ts), the dark theme on paper by `emulateMedia` alone; and
 * the CPU-throttled numbering race by the collection opened late (smoke's "with the collection slow to open"). Offline
 * in Safari's engine is r67h-offline.spec.ts. The tests below stay Chromium's, reading what only Chromium can.
 */
export const CHROMIUM_ONLY_TITLES: ReadonlyArray<readonly [title: string, reason: string]> = [
  ['r61a a11y-perf 5:', 'a CDP CPU throttle and a layout-shift reading'],
  ['r61a a11y-perf 7:', 'a Chrome profile for the 200% text size'],
  ['r61g 6:', 'a layout-shift reading'],
  ['at 320 px with 200% text, the refusal pills wrap', 'a Chrome profile for the 200% text size'],
  ['r62a a11y-perf 61-2:', 'a Chrome profile for the 200% text size'],
  ["r62a a11y P3: Today's done-row chips wrap at 320 px with 200% text", 'a Chrome profile for the 200% text size'],
  ['r62a A11: at 320 px with 200% text', 'a Chrome profile for the 200% text size'],
  ['r62a a11y-perf 61-5:', 'a CDP CPU throttle and a layout-shift reading'],
  ['r62a a11y-perf 61-8 (guard):', "the accessibility tree through CDP"],
  ['r62ba grower 1: at 200% text', 'the 200% text size through CDP'],
  ['r62ba N10: at 390 px', 'a layout-shift reading'],
  ['r62ba N10: at 320 px with 200% text', 'the 200% text size through CDP'],
  ["round sixty: at 320 px with the browser's text at 200%", 'a Chrome profile for the 200% text size'],
  ['round sixty: a numbering choice made before the collection opens is kept, at a 6x CPU throttle', 'a CDP CPU throttle']
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Playwright matches `grepInvert` against "project file describe title tags"; a title's start follows a space. */
export const CHROMIUM_ONLY = new RegExp(`(?:^|\\s)(?:${CHROMIUM_ONLY_TITLES.map(([t]) => escape(t)).join('|')})|@chromium\\b`);
