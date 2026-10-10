import { expect, test, type Page } from '@playwright/test';

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
  clicks: number;
  toggles: number;
  focus: string;
  scrollBefore: number;
  scrollAfter: number;
};

/** Watch the next press on `details`' summary (in the page), so `pressRecord` can read what it did. */
async function watch(page: Page, details: string): Promise<void> {
  await page.locator(details).evaluate((d) => {
    const s = d.querySelector(':scope > summary') as HTMLElement;
    const rec = { downTop: null as number | null, upTop: null as number | null, clicks: 0, toggles: 0, scrollBefore: Math.round(scrollY) };
    (d as unknown as { __press: typeof rec }).__press = rec;
    const top = () => Math.round(s.getBoundingClientRect().top);
    s.addEventListener('pointerdown', () => { rec.downTop = top(); }, { capture: true });
    s.addEventListener('pointerup', () => { rec.upTop = top(); }, { capture: true });
    s.addEventListener('click', () => { rec.clicks++; }, { capture: true });
    d.addEventListener('toggle', () => { rec.toggles++; });
  });
}

async function pressRecord(page: Page, details: string): Promise<Press> {
  return page.locator(details).evaluate((d, sel) => {
    const rec = (d as unknown as { __press: { downTop: number | null; upTop: number | null; clicks: number; toggles: number; scrollBefore: number } }).__press;
    const a = document.activeElement;
    const focus = a ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''} ${(a.textContent ?? '').trim().slice(0, 40)}`.trim() : 'none';
    return { details: sel, opened: (d as HTMLDetailsElement).open, ...rec, focus, scrollAfter: Math.round(scrollY) };
  }, details);
}

/**
 * One press on a disclosure's summary, as a person makes it, and what it did: no second press, ever. The single-click
 * check (tests/e2e/r67h-disclosure.spec.ts) asserts on this; `openDisclosure` uses it for its first press.
 */
export async function pressOnce(page: Page, details: string): Promise<Press> {
  await watch(page, details);
  await page.locator(details).locator(':scope > summary').click();
  // The toggle event is queued after the click: wait for it, briefly, so the record holds it.
  await expect.poll(() => page.locator(details).evaluate((e) => (e as unknown as { __press: { toggles: number } }).__press.toggles), { timeout: 1_000 }).toBeGreaterThan(0).catch(() => {});
  return pressRecord(page, details);
}

/**
 * Open a `<details>` by its summary, as a person does, and wait until it is open. In Safari's engine on the owner's PC the
 * tap on the summary sometimes took focus and did not open it (smoke 901 and r62bg 5: the summary "[active]", the box
 * inside never visible for 30 and 180 s), most likely a press whose release landed after the page moved under it. The
 * summary is pressed again only while the disclosure is still shut, so a press that did open it is never undone; one that
 * never opens it fails here, saying so, rather than as a box that is not visible (round sixty-five; the all-engines rerun).
 *
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
  const line = `${details}: the first press did not open it (${JSON.stringify(first)}); pressed again`;
  test.info().annotations.push({ type: 'second-press', description: line });
  console.warn(`second press: ${test.info().titlePath.slice(1).join(' > ')}: ${line}`);
  await expect(async () => {
    if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), `${details} opened by its summary`).toBe(true);
  }).toPass({ timeout: 15_000 });
}
