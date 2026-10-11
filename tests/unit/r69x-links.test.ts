/**
 * Round sixty-nine, agent X: what the pages say and offer inside the example, read from their source.
 * - triage-68 X7 (S-C4, R46-27): every link to an add form leads out of the example first (`addLeavesExample`): the
 *   species page's "Sow seed", Wanted's "Got it", a place's "Add a plant here" and "Start a batch here", Labels, Today's
 *   "Add one", search's and the error page's "add it as a plant". They opened the form inside the example, and what was
 *   added there was the example's.
 * - triage-68 X8 (R46-26): an "Example" chip in the top bar, shown before the first paint by `html[data-demo]`.
 * - triage-68 X9 (S-C5): a refused write on a closed example page never says "Free space", and My plants' storage
 *   notice ("Back up now") is not shown in the example.
 * Some of these files are P's or nobody's: the changes are needs in docs/review-69/X.md, and this test checks the merge.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(f, 'utf8');
/** Every link to the plant or batch add form in `file`, as written. */
const addLinks = (file: string) => [...read(file).matchAll(/<a\b(?:=>|[^>])*?\bhref=(?:"\/(?:plants|propagation)\/new[^"]*"|\{gotIt\()(?:=>|[^>])*>/g)].map((m) => m[0]);

describe('every add link leads out of the example first (X7)', () => {
  const files = [
    'src/routes/species/[slug]/+page.svelte',
    'src/lib/ui/grow/PlantsFoot.svelte',
    'src/routes/places/[id]/+page.svelte',
    'src/routes/labels/+page.svelte',
    'src/routes/today/+page.svelte',
    'src/routes/+page.svelte',
    'src/routes/+error.svelte'
  ];
  for (const f of files) {
    it(f, () => {
      const links = addLinks(f);
      expect(links.length).toBeGreaterThan(0);
      expect(links.filter((a) => !/onclick=\{\(e\) => addLeavesExample\(e, /.test(a))).toEqual([]); // base: plain links into the example's own form
    });
  }
});

describe('the "Example" chip in the top bar (X8)', () => {
  it('is in the top bar, and shown only while the page is in the example, before the first paint', () => {
    const layout = read('src/routes/+layout.svelte');
    const header = layout.slice(layout.indexOf('<header id="topbar"'), layout.indexOf('</header>'));
    expect(header).toContain('<ExampleChip />'); // base: nothing below the scrolled-away bar said it was the example
    const chip = read('src/lib/ui/grow/ExampleChip.svelte');
    expect(chip).toMatch(/:global\(html:not\(\[data-demo\]\)\) \.examplechip \{ display: none; \}/);
    expect(chip).toMatch(/>Example<\/a>/);
    expect(chip).not.toMatch(/<script[^>]*>[\s\S]*\bimport\b/); // nothing of the example's code in every page's bundle
  });
});

describe('the closed state\'s words (X9; S-C5)', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.svelte')) out.push(p); }
    return out;
  }
  it('every "Free space or back up now" after a refused write leaves it out when the example closed in another tab', () => {
    const bad = walk('src/routes').filter((f) => read(f).includes('Free space or') && !/lastWriteError (!==|===) CLOSED_WORDS/.test(read(f)));
    expect(bad).toEqual([]); // base: My plants, a plant's page and a batch's page
  });
  it('My plants does not say "Back up now" in the example, where Backup is shut', () => {
    expect(read('src/routes/plants/+page.svelte')).toMatch(/\{#if opened && storageLow && !storageNoticeHidden && !PAGE_IN_DEMO\}/);
  });
});
