import { test, expect } from '@playwright/test';

/** Round seventy-two, reviewer F: the 404 for an address that is not a name (triage F12), and the whole-genus clause. */
test('an address that is not shaped as a name says no genus: "not-a-plant-zzz" is not "The reference has no Not"', async ({ page }) => {
  const res = await page.goto('/species/not-a-plant-zzz');
  expect(res?.status()).toBe(404);
  await expect(page.locator('.err')).toContainText('No species page for “not-a-plant-zzz”');
  await expect(page.locator('.err')).not.toContainText('The reference has no Not');
  // A name-shaped address keeps its genus line, said of the list and not of Kew's checklist.
  await page.goto('/species/copiapoa-fakeii');
  await expect(page.locator('.err')).toContainText('a genus the list takes whole');
  await expect(page.locator('.err')).not.toContainText("as Kew's WCVP lists");
});
