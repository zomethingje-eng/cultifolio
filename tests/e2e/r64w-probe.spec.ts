import { test, expect, type Page } from '@playwright/test';

/**
 * Round sixty-four, agent W: a probe for the two WebKit hangs the first all-engines run left unexplained, run by hand on
 * the PC (it is skipped otherwise, so it never fails a strict run):
 *
 *   PW_PROBE=1 npx playwright test tests/e2e/r64w-probe.spec.ts --project webkit --retries 0
 *
 * - The example collection never set out in Safari's engine ("Setting it out…" for 20 s), with the collection open and the
 *   service worker blocked (r63v-visitor), in 19 of 20 attempts; Firefox's same failure was its storage question.
 * - A second import on a new page stayed at "Adding 5 plants…" (r63l), and a 300-line import stopped at 150 (r61g 4).
 *
 * Each step waits longer than the suite does and then prints what the browser holds: the Web Locks held and waiting
 * (`navigator.locks.query()`), the databases, and whether a read of the example's database answers within 3 s (a write
 * left open elsewhere would hold it). The printout says which of the three it is: a lock never granted, a transaction
 * that never ends, or only slowness.
 */
test.skip(!process.env.PW_PROBE, 'run by hand: PW_PROBE=1');
test.use({ serviceWorkers: 'block' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
async function held(p: Page, db: string) {
  return p.evaluate(async (name) => {
    const locks = 'locks' in navigator ? await navigator.locks.query().catch((e) => String(e)) : 'no navigator.locks';
    const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases().catch((e) => String(e)) : 'no databases()';
    const read = await Promise.race([
      new Promise<string>((res) => {
        const r = indexedDB.open(name);
        r.onerror = () => res(`open failed: ${r.error}`);
        r.onblocked = () => res('open blocked');
        r.onsuccess = () => {
          const d = r.result;
          try {
            const tx = d.transaction(['changes', 'meta'], 'readonly');
            const c = tx.objectStore('changes').count();
            const m = tx.objectStore('meta').get('demoSeeded');
            tx.oncomplete = () => { res(`read answered: ${c.result} changes, demoSeeded ${String(m.result)}`); d.close(); };
            tx.onerror = () => res(`read failed: ${tx.error}`);
          } catch (e) { res(`read threw: ${e}`); d.close(); }
        };
      }),
      new Promise<string>((res) => setTimeout(() => res('read did not answer in 3 s'), 3000))
    ]);
    return { locks, dbs, read, status: [...document.querySelectorAll('[role=status]')].map((s) => s.textContent?.trim()).filter(Boolean) };
  }, db);
}

test('probe 1: the example collection set out', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/plants');
  await ready(page);
  await page.click('#try-sample');
  const t0 = Date.now();
  const rows = page.locator('.rows > *');
  const done = await expect(rows).toHaveCount(12, { timeout: 60_000 }).then(() => true, () => false);
  const out = { setOut: done, ms: Date.now() - t0, ...(await held(page, 'cultifolio-demo')) };
  console.log(`r64w probe 1: ${JSON.stringify(out, null, 1)}`);
  await info.attach('probe 1', { body: JSON.stringify(out, null, 1), contentType: 'application/json' });
});

test('probe 2: a second import on a new page', async ({ page }, info) => {
  test.setTimeout(150_000);
  const add = async (text: string) => {
    await page.goto('/plants/import');
    await ready(page);
    await page.fill('#imp-text', text);
    await page.click('#imp-check');
    await page.locator('#imp-review-h').waitFor({ timeout: 30_000 });
    const t0 = Date.now();
    await page.click('#imp-add');
    const done = await page.locator('#imp-done').waitFor({ timeout: 60_000 }).then(() => true, () => false);
    return { done, ms: Date.now() - t0, ...(await held(page, 'cultifolio')) };
  };
  const one = await add('Copiapoa cinerea; ; 0001\nCopiapoa humilis; ; 0002\nLithops lesliei; ; 0003');
  const two = await add('Aloe vera; ; A9\nAloe ferox; ; A95\nAloe arborescens; ; A77\nAloe striata; ; 2014-0001\nAloe marlothii; ; A10');
  const out = { first: one, second: two };
  console.log(`r64w probe 2: ${JSON.stringify(out, null, 1)}`);
  await info.attach('probe 2', { body: JSON.stringify(out, null, 1), contentType: 'application/json' });
});
