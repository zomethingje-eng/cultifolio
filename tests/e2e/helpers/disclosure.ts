import { expect, type Page } from '@playwright/test';

/**
 * Open a `<details>` by its summary, as a person does, and wait until it is open. In Safari's engine on the owner's PC the
 * tap on the summary sometimes took focus and did not open it (smoke 901 and r62bg 5: the summary "[active]", the box
 * inside never visible for 30 and 180 s), most likely a press whose release landed after the page moved under it. The
 * summary is pressed again only while the disclosure is still shut, so a press that did open it is never undone; one that
 * never opens it fails here, saying so, rather than as a box that is not visible (round sixty-five; the all-engines rerun).
 */
export async function openDisclosure(page: Page, details: string): Promise<void> {
  const d = page.locator(details);
  await expect(async () => {
    if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), `${details} opened by its summary`).toBe(true);
  }).toPass({ timeout: 15_000 });
}
