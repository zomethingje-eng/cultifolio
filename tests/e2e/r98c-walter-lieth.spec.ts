/**
 * Round ninety-eight (docs/PLAN-98.md, 3): the Walter–Lieth diagram on the species page, under the reading it draws, on
 * the fixture corpus. Copiapoa cinerea's fixture year (synthetic Atacama-coast normals) is arid in every month by the
 * reading, so the diagram's arid area spans the year and it has no humid one; its description says the same months as
 * the reading; it fits its section at 320 px with no horizontal scroll; and its two curves are drawn in the page's own
 * colours, in light and dark.
 *
 * On 8335b5e: no #walter-lieth on the page (the reading alone); every case FAILED.
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

test('r98c 1: the diagram under the reading, its arid months the reading\'s @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const sec = page.locator('section#climate-class');
  const fig = sec.locator('figure#walter-lieth');
  await expect(fig).toHaveCount(1);
  const reading = (await sec.locator('p.wl').textContent()) ?? '';
  const desc = (await fig.locator('desc').textContent()) ?? '';
  const m = /arid in (.+?), where/.exec(reading);
  if (m) expect(desc).toContain(`Arid, the rain curve under the temperature curve, in ${m[1]}.`);
  else expect(desc).toContain('No arid month');
  // Its two curves, and an area for each run of arid months.
  await expect(fig.locator('polyline')).toHaveCount(2);
  expect(await fig.locator('polygon[fill="url(#wl-dots)"]').count()).toBeGreaterThan(0);
  await expect(fig.locator('figcaption')).toContainText('10 °C to 20 mm');
});

test('r98c 2: the diagram fits its section, no horizontal scroll at 320 px @phone-only', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const fig = page.locator('figure#walter-lieth');
  await fig.scrollIntoViewIfNeeded();
  const [f, s] = await Promise.all([fig.boundingBox(), page.locator('section#climate-class').boundingBox()]);
  expect(f!.x).toBeGreaterThanOrEqual(s!.x - 0.5);
  expect(f!.x + f!.width).toBeLessThanOrEqual(s!.x + s!.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`r98c 3: the curves in the page's own colours (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    const c = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const probe = (v: string) => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const [t, r] = [...document.querySelectorAll('#walter-lieth polyline')].map((p) => getComputedStyle(p).stroke);
      return { rain: t, temp: r, warm: probe('--warm'), cool: probe('--cool'), bg: css.backgroundColor };
    });
    expect(c.temp).toBe(c.warm);
    expect(c.rain).toBe(c.cool);
  });
}
