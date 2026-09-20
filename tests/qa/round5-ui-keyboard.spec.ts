/** Keyboard-only add-plant form, and the Species tab switch timing after the first plant. */
import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
const OUT = '/tmp/r5';
const log: string[] = [];
const note = (s: string) => { log.push(s); console.log(s); };
test.afterAll(() => fs.appendFileSync(`${OUT}/keyboard.log`, log.join('\n') + '\n'));
const active = (page: Page) => page.evaluate(() => { const e = document.activeElement as HTMLElement; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}#${e.id}.${(e.className || '').toString().split(' ')[0]} "${(e.textContent || (e as HTMLInputElement).placeholder || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)} outline=${cs.outlineStyle}/${cs.outlineWidth}/${cs.outlineColor}`; });

test('keyboard tab order on /plants/new', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants/new');
  await page.waitForTimeout(800);
  await page.mouse.click(5, 400); // give the document focus like a real user would
  for (let i = 0; i < 22; i++) { await page.keyboard.press('Tab'); note(`tab ${i}: ${await active(page)}`); }
  await page.screenshot({ path: `${OUT}/flow-kb-focus.png` });
  await page.locator('#species-name').focus();
  await page.keyboard.type('Copiapoa cin');
  await page.waitForTimeout(700);
  note(`picker: ${await page.locator('.picker').innerText().catch(() => '(none)')}`);
  await page.keyboard.press('ArrowDown');
  note(`after ArrowDown: ${await active(page)} aria-activedescendant=${await page.locator('#species-name').getAttribute('aria-activedescendant')} sel=${await page.locator('.picker [aria-selected=true], .picker .sel, .picker .on').count()}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  note(`after Enter: value=${await page.locator('#species-name').inputValue()} url=${page.url()} picker=${await page.locator('.picker').innerText().catch(() => '(none)')}`);
  await page.locator('#species-name').focus();
  await page.keyboard.press('Tab');
  note(`after Tab from name: ${await active(page)} picker visible=${await page.locator('.picker').isVisible().catch(() => false)}`);
  await page.locator('#f-field').focus();
  await page.keyboard.type('KK 1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  note(`Enter in field submits: url=${page.url()}`);
});

test('species tab after first plant, with a wait', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await page.waitForURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  const t0 = Date.now();
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) { seen.push(`${Date.now() - t0}ms: ${await page.locator('.seccount').first().innerText().catch(() => '?')} | ${(await page.locator('h2').allInnerTexts()).join('/')}`); await page.waitForTimeout(250); }
  note(`SWITCH timing:\n${seen.join('\n')}`);
  await page.screenshot({ path: `${OUT}/flow-home-mine-1000.png`, fullPage: true });
  await page.goto('/sowings');
  await page.waitForTimeout(800);
  note(`SOWINGS list text: ${await page.locator('main').innerText().catch(() => '(no main)')}`);
});
