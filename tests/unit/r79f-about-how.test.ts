/**
 * Round seventy-nine (F): round seventy-eight's pending /about/how paragraph on the species list
 * (docs/PENDING-ABOUT-HOW-R79.md), ready for the merge to put live with the figures the build reached, and never with a
 * figure it did not: `scripts/about-how-r79.mjs` reads the list's header and the corpus's index, and refuses without an
 * index of this list, or with fewer species than the list and no reason given. The page itself is left as it is.
 *
 * FAILED on the base: no `scripts/about-how-r79.mjs`; and the pending text gave Aloe "199 of the 593" and Euphorbia
 * "401 of 2,077", the list's counts with nothospecies against Kew's without.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paragraph, readList, applyTo, run, FROM, PAGE, LIST } from '../../scripts/about-how-r79.mjs';

const listText = readFileSync(LIST, 'utf8');
const list = readList(listText);
const indexOf = (species: typeof list) => species.map((s) => ({ key: s.kew !== '-' ? `k${s.kew}` : `g${s.gbif}`, gbif: s.gbif }));
const pending = /```html\n(.*)\n```/s.exec(readFileSync('docs/PENDING-ABOUT-HOW-R79.md', 'utf8'))![1];
const page = readFileSync(PAGE, 'utf8');

describe('the paragraph, from the list and the build', () => {
  it('with every species of the list built, it is the pending text, word for word', () => {
    const r = paragraph(listText, indexOf(list));
    expect(r.html).toBe(pending);
    expect(r.figures).toMatchObject({ listed: 48357, held: 48357, missing: 0, aloe: 199, euphorbia: 401, genera: 173, alone: 26, unplaced: 15 });
    expect(r.html).toContain('Aloe has 199 of the 611 species Kew accepts, Euphorbia 401 of 2,118.');
  });
  it('with fewer built, it refuses without the reason, and with it says how many are here and why the rest are not', () => {
    const some = list.filter((s, i) => i % 10 !== 0);
    expect(() => paragraph(listText, indexOf(some))).toThrow(/the reference holds 43,521 of the list's 48,357 species: give --why/);
    const r = paragraph(listText, indexOf(some), 'the build stopped before them.');
    expect(r.html).toContain('so that no page falls out: 48,357 species. The reference holds 43,521 of them; the other 4,836 are not here yet: the build stopped before them. Each page');
    expect(r.figures.aloe).toBeLessThan(199);
    expect(r.html).toContain(`Aloe has ${r.figures.aloe} of the 611 species Kew accepts`);
  });
  it('a line with no Kew id is held by its GBIF key, whatever id its page has', () => {
    const r = paragraph(listText, list.map((s) => ({ key: s.kew !== '-' ? `k${s.kew}` : 'k1', gbif: s.gbif })));
    expect(r.figures.missing).toBe(0);
  });
  it('refuses an index of another corpus (the fixture\'s) and a list of another day of Kew\'s file', () => {
    expect(() => paragraph(listText, [{ key: 'g999', gbif: 999 }])).toThrow(/holds none of the list's species/);
    // the fixture's corpus holds four of the list's species (three, and K's Hesperocyparis lusitanica without a GBIF key, since the merge): a reason is asked for the rest
    expect(() => paragraph(listText, JSON.parse(readFileSync('fixtures/dossiers/index.json', 'utf8')))).toThrow(/holds 4 of the list's 48,357 species: give --why/);
    expect(() => paragraph(listText.replace('wcvp_names.csv of 2026-06-04', 'wcvp_names.csv of 2027-01-01'), indexOf(list))).toThrow(/Kew's file of 2027-01-01/);
  });
});

describe('the page', () => {
  it('holds round seventy-seven\'s paragraph (this round), or one the script wrote from a build (after it)', () => {
    if (!page.includes('scripts/species-list.txt')) {
      expect(page).toContain('Aloe (9 species, of the several hundred WCVP accepts)');
      return;
    }
    // Written by the script: the pending text but for the figures the build reached.
    const at = page.indexOf(FROM);
    const live = page.slice(at, page.indexOf('</p>', at) + 4)
      .replace(/ The reference holds [\d,]+ of them; the other [\d,]+ are not here yet: [^]*?\. Each page/, ' Each page')
      .replace(/Aloe has [\d,]+ of the 611/, 'Aloe has 199 of the 611').replace(/Euphorbia [\d,]+ of 2,118/, 'Euphorbia 401 of 2,118');
    expect(live).toBe(pending);
  });
  // Once the merge has written the paragraph, the page holds no round seventy-seven paragraph to apply it to.
  const applied = page.includes('scripts/species-list.txt');
  it.skipIf(applied)('applied, the list part is a paragraph of its own and the "Most grown" part opens the next, as it was', () => {
    const out = applyTo(page, pending);
    const at = out.indexOf(FROM);
    expect(out.slice(at, at + pending.length)).toBe(pending);
    const kept = page.slice(page.indexOf(" The front page's catalogue") + 1, page.indexOf('</p>', page.indexOf(FROM)) + 4);
    expect(out.slice(at + pending.length)).toMatch(/^\n  <p>The front page's catalogue is the same on every device/);
    expect(out).toContain(`\n  <p>${kept}`);
    expect(out).not.toContain('Ceropegia is taken whole');
    // nothing else on the page moves
    expect(out.slice(0, at)).toBe(page.slice(0, at));
    expect(out.slice(out.indexOf(kept) + kept.length)).toBe(page.slice(page.indexOf(kept) + kept.length));
  });
  it.skipIf(applied)('the script writes nothing without an index, and writes the page with --write', () => {
    const root = mkdtempSync(join(tmpdir(), 'r79f-about-'));
    for (const f of [LIST, PAGE, 'src/lib/dossier/schema.ts']) { mkdirSync(join(root, f, '..'), { recursive: true }); cpSync(f, join(root, f)); }
    let said = '';
    expect(run(['--write'], root, (s: string) => { said += s; })).toBe(2);
    expect(said).toMatch(/no .*static[\\/]s[\\/]v3[\\/]index\.json: build the corpus first; nothing written/); // a Windows path says it with backslashes (the owner's run, 2026-10-20)
    expect(readFileSync(join(root, PAGE), 'utf8')).toBe(page);
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify(indexOf(list)));
    said = '';
    expect(run([], root, (s: string) => { said += s; })).toBe(0);
    expect(said).toContain('Nothing written');
    expect(readFileSync(join(root, PAGE), 'utf8')).toBe(page);
    expect(run(['--write'], root, () => {})).toBe(0);
    expect(readFileSync(join(root, PAGE), 'utf8')).toContain(pending);
  });
});
