import { test, type Page } from '@playwright/test';

/**
 * The browser's own text size, made sure of (round sixty-three; the harness brief H4, from round sixty-two's PC run).
 *
 * The 200%-text tests launch a Chromium whose profile sets the text size (`Default/Preferences`, `default_font_size`).
 * Playwright's bundled Chromium on Windows does not read that profile: on the owner's PC two such tests were skipped
 * ("preference not applied by this browser") and r61a a11y-perf 7, which never checked, passed at 16 px, testing nothing.
 * The DevTools protocol sets the same preference (`Page.setFontSizes`, which r62a and r62ba already use), and it lasts
 * for the page's later navigations. So: read the root's size; if the profile did not take, set it through the protocol
 * and reload; return what the page then has, for the caller to skip on (with the reason) if neither took.
 */
export async function textSize(page: Page, px: number): Promise<string> {
  const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  let text = await size();
  if (text !== `${px}px`) {
    const cdp = await page.context().newCDPSession(page).catch(() => null);
    await cdp?.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: Math.round(px * 0.8125) } }).catch(() => undefined);
    await page.reload();
    await page.locator('html[data-ready]').waitFor({ state: 'attached' }); // drawn again before the caller goes on
    text = await size();
  }
  return text;
}

/**
 * The text size checked again on a page the test is about to measure, after a navigation (round sixty-three; the server
 * review of the round, R3 5): `textSize` made sure of it on the first page only, and a size that did not last a
 * navigation (the protocol's override on Windows, never run where the suite is written) would have had the later pages
 * measured at 16 px, passing on nothing. Skips the test, with the page and the size, if it did not hold.
 */
export async function textSizeHeld(page: Page, px: number, where: string): Promise<void> {
  const text = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  test.skip(text !== `${px}px`, `the text size did not hold on ${where} (its text is ${text}, not ${px}px), so its layout at 200% was not measured`);
}

/**
 * 200% text in every engine (round sixty-seven; triage-66 H3, S-E11, R45-28). The browser's own text size is a Chrome
 * profile setting or a DevTools call, Chromium's alone, so the 200% tests were left out of Safari's engine, and Safari had
 * no large-text test at all. Here the root's font size is set to `percent` from the document's start (an `!important`
 * rule on `html`, in an adopted sheet): every size the site gives in rem and em follows it, as it follows the browser's own
 * setting. What does not follow: a media query in em still reads the browser's default (16 px), where the real setting
 * moves it too; so this checks the layout at the larger text, not which layout a media query picks for it.
 */
export async function rootText(target: import('@playwright/test').BrowserContext | Page, percent: number): Promise<void> {
  await target.addInitScript((p: number) => {
    // An adopted sheet: there from the document's start, whatever the parser has made yet, in every engine.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`html { font-size: ${p}% !important; }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, percent);
}
