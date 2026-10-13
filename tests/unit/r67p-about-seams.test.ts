/**
 * The about pages' seams the earlier seam tests did not check (round sixty-seven; triage-66 P4, S-F6, S-F7, S-F8, R45-13).
 * Whole sentences and clauses, compared exactly, each beside the code that makes it true: a substring passed with the
 * sentence around it gone or changed.
 *
 * - the cookies, both ways, and that the server sets none;
 * - the framework's own session keys, which no `getItem`/`setItem` of the app's names;
 * - the browser's HTTP cache of this site's answers (a search kept a day under its URL);
 * - hover preloading, off on a private page everywhere, the tray outside <main> included;
 * - the reload under a new version;
 * - the "keep data" question's month;
 * - the sources: Natural Earth and Wikidata, which the footer and every species page credit.
 *
 * Round seventy (triage-69 P2): the cookies, the framework's session keys, the HTTP cache, hover preloading, the reload
 * under a new version, the failed move's requests, the "keep data" month, Natural Earth and the labels page's picks are
 * read by the new method in r70p-about-seams.test.ts, and left this file. What stays is the sources' two lists and the
 * Wikidata sentence, which B changes this round; its test is replaced at the merge's second pass.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const raw = (f: string) => readFileSync(f, 'utf8');
const text = (f: string) => raw(f).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');


describe('the sources, both ways', () => {
  const footer = /<p>Sources: ([^;]+);/.exec(raw('src/routes/+layout.svelte'))![1].split(', ').map((s) => s.trim());
  /** The footer's names as the brief writes them. */
  const BRIEF: Record<string, string> = { 'GBIF Backbone': 'GBIF', 'WCVP (RBG Kew)': "Kew's WCVP" };
  it('the brief names every source the footer credits, and no other', () => {
    const brief = /built ahead of time from public data \(([^)]+)\)/.exec(how)![1].split(', ').map((s) => s.trim());
    expect(brief.sort()).toEqual(footer.map((f) => BRIEF[f] ?? f).sort());
    expect(brief).toContain('Natural Earth');
    expect(brief).toContain('Wikidata');
  });
  // The Wikidata sentence, pinned whole with the code's shape until round seventy, is read for its claims and driven with
  // its cases in r70p-about-rules.test.ts (triage-69 P2; B2 changed the rule it pinned).

});
