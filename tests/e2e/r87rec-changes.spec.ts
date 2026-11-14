/**
 * Round eighty-seven (the record), in the browser: round eighty-seven on /changes and in the front page's "Changed
 * lately" lists its live stages' lines alone (`R87_LIVE_STAGE`), since neither page knows of stages and each reads
 * `ROUNDS`. The data's rules are tests/unit/r87rec-changes.test.ts.
 *
 * On the base (r87final, dd20377) /changes has no round 87, and the module exports no staged lines: both fail.
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';
import { R87_LINES, R87_LIVE_STAGE } from '../../src/lib/changes/rounds';

const live = R87_LINES.filter((l) => l.stage <= R87_LIVE_STAGE).map((l) => l.text);
const later = R87_LINES.filter((l) => l.stage > R87_LIVE_STAGE).map((l) => l.text);

// Round ninety-one: round 91 (the icon) is newer; round 87 keeps its lines and its date after it.
test('r87rec 1: /changes lists round 87, dated, with its live stages\' lines and no later stage\'s @phone', async ({ page }) => {
  await page.goto('/changes');
  await ready(page);
  const head = page.locator('#round-87 h2');
  await expect(head).toContainText('Round 87');
  await expect(head).toContainText('9 November 2026');
  await expect(page.locator('#round-87 li')).toHaveText(live);
  await expect(page.locator('#round-87 a[href$="docs/REVIEW-ROUND-87.md"]')).toHaveCount(1);
  const all = await page.locator('article.changes li').allInnerTexts();
  for (const t of later) expect(all, t).not.toContain(t);
});

// Round ninety-one: "Changed lately" opens on round 91's lines; round 87's first live line follows them.
test('r87rec 2: the front page\'s "Changed lately" holds round 87\'s first live line and says no later stage\'s', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const lines = page.locator('.lateline');
  await expect(lines.filter({ hasText: live[0] })).toHaveCount(1);
  const all = (await lines.allInnerTexts()).join('\n');
  for (const t of later) expect(all, t).not.toContain(t);
});
