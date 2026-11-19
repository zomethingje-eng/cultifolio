/**
 * Round eighty-seven (the record), in the browser: round eighty-seven on /changes and in the front page's "Changed
 * lately" lists its live stages' lines alone (`R87_LIVE_STAGE`), since neither page knows of stages and each reads
 * `ROUNDS`. The data's rules are tests/unit/r87rec-changes.test.ts.
 *
 * On the base (r87final, dd20377) /changes has no round 87, and the module exports no staged lines: both fail.
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';
import { R87_LINES, R87_LIVE_STAGE, changedLately } from '../../src/lib/changes/rounds';

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

// Round ninety-two: "Changed lately" holds the four newest lines, round 92's two then round 91's two, so round 87's first
// live line, which round ninety-one's version of this test found under round 91's, has passed off the front page (it is
// on /changes, r87rec 1). The test now holds the box to `changedLately(4)`, which the front page reads, line for line,
// rather than to whichever round's line is fourth this week; and still to no later stage's line of round 87.
// On b9963f7 plus round 92's /changes line: FAILED, round 87's line looked for and not there.
// Round ninety-three: the four are round 93's two, then round 92's two.
// Round ninety-five: the four are round 95's two, then round 93's two (round 94 has no entry).
test('r87rec 2: the front page\'s "Changed lately" holds the newest lines in order and says no later stage\'s of round 87', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const lines = page.locator('.lateline');
  const newest = changedLately(4);
  expect(newest.map((l) => l.round)).toEqual([95, 95, 93, 93]);
  await expect(lines).toHaveCount(4);
  for (const [i, l] of newest.entries()) await expect(lines.nth(i)).toContainText(l.text);
  const all = (await lines.allInnerTexts()).join('\n');
  for (const t of later) expect(all, t).not.toContain(t);
});
