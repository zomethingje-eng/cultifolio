/**
 * Reviewer "words", round sixty-two verification (`/tmp/r62rev/out/tests/words--pages-true.test.ts`), adopted by agent
 * W in the second pass: the corpus cache sentence failed on the second pass's base and passes now. DEPLOY.md's
 * SYNC_OPEN (the words review's 9) is the lead's. The two seam-test checks (26a, 26b) are made exact in
 * r62w-about-seams.test.ts itself, where each now fails on the case it missed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const raw = (f: string) => readFileSync(f, 'utf8');
const text = (f: string) => raw(f).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');

describe('the corpus cache holds what the page says', () => {
  it('no species page data is kept in cultifolio-corpus: /api/dossier is no-store, and the service worker keeps no no-store answer', () => {
    expect(raw('src/routes/api/dossier/[key]/+server.ts')).toMatch(/return json\(d, \{ headers: \{ 'cache-control': 'no-store' \} \}\)/);
    expect(raw('src/service-worker.ts')).toMatch(/!\/no-store\/\.test\(r\.headers\.get\('cache-control'\)/);
    expect(formats).toContain('answered no-store and kept by no cache');
    // …and yet /about/how lists it in the corpus cache:
    expect(how).not.toContain("a species page's data and the hash groups' entries and sheets");
  });
});
