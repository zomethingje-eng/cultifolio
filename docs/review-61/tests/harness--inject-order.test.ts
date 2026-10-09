/**
 * Harness review of round sixty-one: an e2e helper that writes changes straight into the page's IndexedDB must give them
 * an arrival too (a row in the `order` store, in the same transaction), as `tests/e2e/r61l-records.spec.ts` does.
 *
 * Why: the fold snapshot's tail is read from the arrival order (`arrivalsAfter(f.seq)`, src/lib/db/vault.ts). A row put
 * only into `changes` is invisible to every load that starts from a snapshot. The helpers delete the snapshot after
 * writing, but the page's own first load can save its (empty) snapshot after that delete, and the rows are then lost
 * to the test. r61a-a11y.spec.ts works round it with a second delete after a fixed 500 ms, which is a pause, not a
 * wait: under load the page's save can land after it too. Writing the arrival removes the race at its cause.
 *
 * FAILS on f4ab4f8: smoke.spec.ts (the `inject` helper and the round fifty-six test's inline write), r61a-a11y.spec.ts and
 * r61w-pages.spec.ts write `changes` without `order`.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--inject-order.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const dir = 'tests/e2e';
const specs = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

describe('e2e helpers that write the log also write its arrival order', () => {
  it('every transaction that puts into `changes` also adds to `order`', () => {
    const bad: string[] = [];
    for (const f of specs) {
      const text = fs.readFileSync(`${dir}/${f}`, 'utf8');
      // Each `db.transaction([...], 'readwrite')` opened over `changes`: the store list must name `order`, and the body
      // up to the transaction's completion must add to it.
      const re = /\.transaction\(\[([^\]]*)\],\s*'readwrite'\)/g;
      for (const m of text.matchAll(re)) {
        if (!/'changes'/.test(m[1])) continue;
        const body = text.slice(m.index!, text.indexOf('oncomplete', m.index!));
        if (!/objectStore\('changes'\)\.put/.test(body)) continue;
        if (!/'order'/.test(m[1]) || !/objectStore\('order'\)\.(add|put)/.test(body)) bad.push(`${f}:${text.slice(0, m.index!).split('\n').length}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
