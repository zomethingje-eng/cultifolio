/**
 * Round seventy-eight, the merge (M): a plant page's verb bar stays where it is when the species' sheet answers. The
 * owner's strict run (2026-10-19) lost a press of "Record…" in Firefox: the sheet answered between the press's mouse down
 * and its mouse up, the reference-photograph line arrived above the bar and moved it, and a click whose down and up land
 * on different elements is no click. A grower's tap meets the same. The line's room is now kept while the sheet is asked.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

// No service worker: it answers /api/sheets itself, and in WebKit and Firefox a page's route does not see the worker's
// requests, so the sheet was not held and the test measured nothing (the owner's run, 2026-10-19).
test.use({ serviceWorkers: 'block' });

async function barTop(page: Page): Promise<number> {
  return (await page.locator('.quickbar').boundingBox())!.y;
}

for (const size of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`${size.name}: the verb bar does not move when the species' sheet answers`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/plants/new?species=Copiapoa%20cinerea'); await ready(page);
    await addPlant(page);
    const at = page.url();
    // Hold the sheet back until the bar has been measured without it.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/sheets**', async (route) => { await held; await route.continue(); });
    await page.goto(at);
    await expect(page.locator('.quickbar')).toBeVisible();
    await expect(page.locator('.acts .skelbtn')).toBeAttached(); // still asking
    await expect(page.locator('.rpo.hold')).toBeAttached(); // the line's room, unseen
    await expect(page.locator('.rpo.hold')).toBeHidden();
    await expect(page.locator('.rpo.hold')).toHaveAttribute('aria-hidden', 'true');
    const before = await barTop(page);
    release();
    await expect(page.locator('#species-link')).toBeVisible();
    await expect(page.locator('.rpo.link')).toBeVisible(); // the line that arrived
    await expect(page.locator('.rpo.hold')).toHaveCount(0);
    expect(await barTop(page)).toBe(before); // r78base: 8.4 px lower on a desktop, 46.5 px on a phone
  });
}
