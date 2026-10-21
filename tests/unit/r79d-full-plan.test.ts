/**
 * Round seventy-nine (D): the full build's plan for the list's 48,368 species, as corpus-step runs it. FAILED on r79base:
 * the base plan had no open-data pass of iNaturalist's (agent P's `--fill inat --wild`) before the budgeted fill, and
 * still sent the owner to scripts/merged-pages-79.txt. At the merge (M) the plan uploads after the wild pass, before the
 * budgeted fill's six days, and its stops read K's, Q's and F's parts; the merge's case failed on the plan as D left it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlan } from '../../scripts/corpus-step.mjs';

const text = readFileSync('scripts/corpus-plan-full.txt', 'utf8');
const plan = parsePlan(text) as Array<{ kind: string; args: string[] }>;
const line = (s: { kind: string; args: string[] }) => `${s.kind} ${s.args.join(' ')}`.trim();

describe('the full build\'s plan', () => {
  it('every step in order, from the extra keys to the live check, with its review stops', () => {
    expect(plan.map((s) => (s.kind === 'review' ? 'review' : line(s)))).toEqual([
      'backup',
      // Round eighty (X): over the species list, not only the pages on disk.
      'dossier --list-extra-keys scripts/species-list.txt --bulk bulk --backbone bulk/backbone/simple.txt.gz',
      // Round eighty (X): round seventy-eight's pages are built again too.
      'dossier scripts/species-list.txt --grid climate --bulk bulk --skip inat --renew',
      'review',
      'dossier --prune-followed',
      'dossier --fill inat --wild --bulk bulk',
      'dossier --index',
      'review',
      'upload',
      'live-check',
      // Round seventy-nine's merge: the corpus goes live after the wild pass, and the budgeted fill's six days follow it.
      'dossier --fill inat --bulk bulk',
      'dossier --index',
      'review',
      'upload',
      'live-check'
    ]);
  });
  it('names the download of either route before it, the merges where they now are, and no file that is gone', () => {
    for (const c of ['npm run bulk -- gbif-count scripts/species-list.txt', 'npm run bulk -- gbif-sql scripts/species-list.txt --wait', 'npm run bulk -- gbif-media scripts/species-list.txt --wait', 'npm run bulk -- gbif scripts/species-list.txt --wait', 'scripts/inat-open-load.ts', 'scripts/merged-pages.txt']) expect(text).toContain(c);
    expect(text).not.toContain('merged-pages-79');
  });
  it('the first review reads which download the build read and where its photographs came from', () => {
    const first = plan.find((s) => s.kind === 'review')!.args[0];
    expect(first).toMatch(/GBIF occurrences from bulk\/occurrence\.zip/);
    expect(first).toMatch(/media\.zip/);
    expect(first).toMatch(/--fill gbif --bulk bulk/);
    // the merge: K's species without a GBIF key and Q's institution rule are read at the same stop
    expect(first).toMatch(/2335 species without a GBIF key read from Kew's file/); // round eighty (X)
    // the owner's decision on K's offer: the keys Kew's synonymy gives them are in the download, and the stop reads the count
    expect(text).toContain('Every GBIF request above asks too for the 1,956 keys of scripts/extra-keys-kew.txt');
    expect(first).toMatch(/1415 of them read GBIF's records under 1956 keys Kew's synonymy gives them/);
    expect(first).toMatch(/Institution rule \(Wikidata's 6656 botanic gardens, herbaria and zoos, 1 km\)/);
  });
  it('the merge: this round\'s Worker is deployed before the plan, and the review before the upload runs F\'s paragraph script', () => {
    expect(text).toContain('node scripts/predeploy.mjs --tier=app, then node scripts/corpus-ready.mjs && npm run deploy');
    const second = plan.filter((s) => s.kind === 'review')[1].args[0];
    expect(second).toContain('node scripts/about-how-r79.mjs');
    expect(second).toMatch(/only once the live Worker is this round's/);
    expect(plan.findIndex((s) => s.kind === 'upload')).toBeLessThan(plan.findIndex((s) => line(s) === 'dossier --fill inat --bulk bulk'));
  });
});
