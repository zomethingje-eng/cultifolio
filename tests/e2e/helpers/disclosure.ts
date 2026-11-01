import { expect, test, type Page } from '@playwright/test';
import { pressKind, retriesLostRelease, type PressKind } from './press-kind';

/**
 * What one press on a disclosure's summary did, as the page saw it (round sixty-seven; triage-66 H5, R45-27 and IND's
 * single-click note): where the summary was when the pointer went down and when it came up (a press whose release lands
 * after the page moved under it is the suspected cause of the missed taps), whether a click and a toggle followed, what
 * had the focus after, and whether the page scrolled.
 */
export type Press = {
  details: string;
  opened: boolean;
  downTop: number | null;
  upTop: number | null;
  /** Releases (`pointerup`) and cancels that reached the window after the finger went down on the summary, wherever they
   *  landed, and the summary's top once the press was over: what tells a release the engine lost from a missed tap
   *  (round eighty-five; helpers/press-kind.ts). */
  ups: number;
  cancels: number;
  endTop: number | null;
  clicks: number;
  toggles: number;
  focus: string;
  scrollBefore: number;
  scrollAfter: number;
  /** What the press was (helpers/press-kind.ts). */
  kind: PressKind;
  /** A first press whose release the engine lost, pressed again (WebKit on Windows only): what it did. */
  lostRelease?: Omit<Press, 'lostRelease'>;
};

/** Watch the next press on `details`' summary (in the page), so `pressRecord` can read what it did. */
async function watch(page: Page, details: string): Promise<void> {
  await page.locator(details).evaluate((d) => {
    const s = d.querySelector(':scope > summary') as HTMLElement;
    const rec = { downTop: null as number | null, upTop: null as number | null, ups: 0, cancels: 0, clicks: 0, toggles: 0, scrollBefore: Math.round(scrollY) };
    (d as unknown as { __press: typeof rec }).__press = rec;
    const top = () => Math.round(s.getBoundingClientRect().top);
    s.addEventListener('pointerdown', () => { rec.downTop = top(); }, { capture: true });
    s.addEventListener('pointerup', () => { rec.upTop = top(); }, { capture: true });
    // Any release or cancel the page received once the finger was down on the summary, wherever it landed.
    addEventListener('pointerup', () => { if (rec.downTop !== null) rec.ups++; }, { capture: true });
    addEventListener('pointercancel', () => { if (rec.downTop !== null) rec.cancels++; }, { capture: true });
    s.addEventListener('click', () => { rec.clicks++; }, { capture: true });
    d.addEventListener('toggle', () => { rec.toggles++; });
  });
}

async function pressRecord(page: Page, details: string): Promise<Press> {
  const seen = await page.locator(details).evaluate((d, sel) => {
    const rec = (d as unknown as { __press: { downTop: number | null; upTop: number | null; ups: number; cancels: number; clicks: number; toggles: number; scrollBefore: number } }).__press;
    const a = document.activeElement;
    const focus = a ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''} ${(a.textContent ?? '').trim().slice(0, 40)}`.trim() : 'none';
    const s = d.querySelector(':scope > summary');
    return { details: sel, opened: (d as HTMLDetailsElement).open, ...rec, endTop: s ? Math.round(s.getBoundingClientRect().top) : null, focus, scrollAfter: Math.round(scrollY) };
  }, details);
  return { ...seen, kind: pressKind(seen) };
}

async function pressNow(page: Page, details: string): Promise<Press> {
  await watch(page, details);
  await page.locator(details).locator(':scope > summary').click();
  // The toggle event is queued after the click: wait for it, briefly, so the record holds it.
  await expect.poll(() => page.locator(details).evaluate((e) => (e as unknown as { __press: { toggles: number } }).__press.toggles), { timeout: 1_000 }).toBeGreaterThan(0).catch(() => {});
  return pressRecord(page, details);
}

/**
 * One press on a disclosure's summary, as a person makes it, and what it did. The single-press checks
 * (r67h-disclosure, r69p-disclosure) assert on this (`expectOneTap`); `openDisclosure` uses it for its first press.
 *
 * No second press, with one exception (round eighty-five; helpers/press-kind.ts): in WebKit on Windows, a press whose
 * release the engine never delivered to the page (`lost-release`: the finger went down on the summary, no `pointerup`
 * or `pointercancel` reached the window, nothing followed and the summary did not move) is made once more, and only
 * once. The first is recorded in the result (`lostRelease`), as a `lost-release` annotation on the test and as a line in
 * the log, so each is counted. A missed tap of any other kind is never pressed again here: it is the app's, and the
 * check fails on it. `retryLost` overrides the engine's rule (a test of this helper simulates the loss in Chromium).
 */
export async function pressOnce(page: Page, details: string, opts: { retryLost?: boolean } = {}): Promise<Press> {
  const first = await pressNow(page, details);
  if (first.kind.kind === 'one-tap' && first.kind.releaseLost) {
    // It worked, and the engine skipped the release: said, so the count of the quirk is whole.
    test.info().annotations.push({ type: 'release-not-delivered', description: `${details}: opened by its click; no pointerup reached the page (${JSON.stringify(first)})` });
  }
  const retry = opts.retryLost ?? retriesLostRelease(test.info().project.use.browserName, process.platform);
  if (first.kind.kind !== 'lost-release' || !retry) return first;
  const line = `${details}: the engine did not deliver the release of the first press (${JSON.stringify(first)}); pressed once more`;
  test.info().annotations.push({ type: 'lost-release', description: line });
  console.warn(`lost release: ${test.info().titlePath.slice(1).join(' > ')}: ${line}`);
  return { ...(await pressNow(page, details)), lostRelease: first };
}

/** The single-press check: one press opened it, with one click and one toggle, and the summary held still. */
export function expectOneTap(r: Press): void {
  expect({ kind: r.kind.kind, opened: r.opened, clicks: r.clicks, toggles: r.toggles }, JSON.stringify(r)).toEqual({ kind: 'one-tap', opened: true, clicks: 1, toggles: 1 });
}

/**
 * Open a `<details>` by its summary, as a person does, and wait until it is open. In Safari's engine on the owner's PC the
 * tap on the summary sometimes took focus and did not open it (smoke 901 and r62bg 5: the summary "[active]", the box
 * inside never visible for 30 and 180 s), most likely a press whose release landed after the page moved under it. The
 * summary is pressed again only while the disclosure is still shut, so a press that did open it is never undone; one that
 * never opens it fails here, saying so, rather than as a box that is not visible (round sixty-five; the all-engines rerun).
 *
 * A release the engine lost is pressed again inside `pressOnce` (WebKit on Windows only, recorded as `lost-release`);
 * any other miss is pressed again here, recorded with what kind of miss it was (helpers/press-kind.ts), because the
 * disclosure is this helper's means and not its test: the single-press checks fail on the same miss.
 * Every second press is recorded (round sixty-seven; triage-66 H5, R45-27): the test gets a `second-press` annotation,
 * which the run's report shows, with what the first press did (where the summary was at the press and at the release,
 * the clicks and toggles that followed, the focus and the scroll), and the line is printed, so a missed tap is counted and
 * read rather than passed over. The single-click check itself is r67h-disclosure.spec.ts.
 */
export async function openDisclosure(page: Page, details: string): Promise<void> {
  const d = page.locator(details);
  if (await d.evaluate((e) => (e as HTMLDetailsElement).open)) return;
  const first = await pressOnce(page, details);
  if (first.opened) return;
  const why = first.kind.kind === 'missed' ? first.kind.why : first.kind.kind;
  const line = `${details}: the first press did not open it (${why}; ${JSON.stringify(first)}); pressed again`;
  test.info().annotations.push({ type: 'second-press', description: line });
  console.warn(`second press: ${test.info().titlePath.slice(1).join(' > ')}: ${line}`);
  await expect(async () => {
    if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), `${details} opened by its summary`).toBe(true);
  }).toPass({ timeout: 15_000 });
}
