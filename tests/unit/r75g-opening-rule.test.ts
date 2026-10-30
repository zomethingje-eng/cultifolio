/**
 * Round seventy-five, agent G (the owner's decisions): the catalogue is the same on every device, and "Most grown" is a
 * chip, off by default, that shows the species of the most-grown genera; the rule on the real file
 * `scripts/most-grown-genera.txt`, the chip's catalogue, and /about/how true of both. The collector genera are retired
 * from the front page: `scripts/specialist-genera.txt` is read only where it describes how today's species list was
 * derived (the species page's 404, and the about page's derivation). On r75base the file and the rule do not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMostGrown, openingGenera, SHARE } from '$lib/ui/ref/most-grown-rule';
import { grownGenera, grownChip, MOST_GROWN } from '$lib/ui/ref/most-grown';
import { catalogueOf, chipOf, rowItems, CHIPS, type Item } from '$dossier/catalogue';
import { rowItemsUnder } from '$lib/server/catalogue';
import type { IndexEntry } from '$dossier/index-entry';

const text = readFileSync('scripts/most-grown-genera.txt', 'utf8');
const m = parseMostGrown(text);
const counted = [...m.counts.entries()].map(([g, c]) => ({ g, n: c.n })).sort((a, b) => b.n - a.n || a.g.localeCompare(b.g));
/** The genera the reference held when the file was written: every genus line and every refused one. */
const held = [...m.counts.keys(), ...m.notChecked, ...m.refused.keys()];
const about = readFileSync('src/routes/about/how/+page.svelte', 'utf8').replace(/\s+/g, ' ');
const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

describe('round seventy-five: the most-grown genera, the rule on the real file', () => {
  it('the file is sourced and whole: a day, the queries, the terms, and every line a genus with an id and a count, or refused with a reason', () => {
    expect(m.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text).toMatch(/^query\thttps:\/\/api\.inaturalist\.org\/v1\/observations\/taxonomy\?captive=true&taxon_id=47126 /m);
    expect(text).toMatch(/^terms\t.*iNaturalist's Terms of Use/m);
    expect(m.counts.size).toBeGreaterThan(1000);
    for (const [g, c] of m.counts) { expect(c.id, g).toBeGreaterThan(0); expect(Number.isSafeInteger(c.n), g).toBe(true); }
    for (const [g, why] of m.refused) expect(why, g).toMatch(/^(homonym: |no active genus in Plantae is named )/);
    // A genus is in one place only.
    expect(new Set(held).size).toBe(held.length);
    // Every line is read: the counted, the not checked and the refused add up to the lines.
    expect(text.split('\n').filter((l) => /^(genus|refused)\t/.test(l)).length).toBe(held.length);
  });

  it('the set is the fewest genera, most observed first, that hold half of the counted genera\'s observations', () => {
    const r = openingGenera(m, held);
    const total = counted.reduce((s, x) => s + x.n, 0);
    expect(r.observations).toBe(total);
    expect(r.genera).toEqual(counted.slice(0, r.genera.length).map((x) => x.g));
    expect(r.covered).toBeGreaterThanOrEqual(SHARE * total);
    expect(r.covered - counted[r.genera.length - 1].n).toBeLessThan(SHARE * total); // one fewer is not enough
    // What it gives today (22 October 2026, over the full list's 6,529 genera): 118 genera; 95 on 17 October over 1,321. A phone-sized set, and not the collector genera.
    expect(r.genera.length).toBeGreaterThan(40);
    expect(r.genera.length).toBeLessThan(200);
    expect(r.genera).toContain('Rosa');
    expect(r.genera).not.toContain('Copiapoa');
    for (const g of [...m.refused.keys(), ...m.notChecked]) expect(r.genera).not.toContain(g);
  });

  it('the rule as the app runs it: an index in, the chip\'s genera and counts out; a genus not counted is never in; none counted is no chip', () => {
    const idx = (names: string[]) => names.map((name, i) => ({ key: i + 1, slug: name.toLowerCase().replace(' ', '-'), name, open: 0, origin: [], climate: 'ok' }) as unknown as IndexEntry);
    expect(MOST_GROWN.counts.get('Welwitschia')!.n).toBeGreaterThan(MOST_GROWN.counts.get('Copiapoa')!.n);
    const four = idx(['Rosa canina', 'Rosa rugosa', 'Rosa gallica', 'Welwitschia mirabilis', 'Copiapoa cinerea', 'Copiapoa humilis', 'Refusia testii']);
    expect([...grownGenera(four)]).toEqual(['Rosa']); // Rosa alone holds over half of the three counted
    expect(grownChip(four)).toEqual({ genera: 1, species: 3 });
    const fixture = idx(['Copiapoa cinerea', 'Copiapoa humilis', 'Refusia testii', 'Welwitschia mirabilis']); // the e2e fixture's genera
    expect(grownChip(fixture)).toEqual({ genera: 1, species: 1 });
    expect(grownChip(idx(['Refusia testii']))).toBeNull();
    // A made-up file: a tie is broken by name, a "not checked" genus is not counted, and a refused one is not either.
    const made = parseMostGrown('day\t2026-01-01\ngenus\tB\t2\t10\ngenus\tA\t1\t10\ngenus\tC\t3\tnot checked\tthe count did not answer\nrefused\tD\thomonym\n');
    expect(openingGenera(made, ['A', 'B', 'C', 'D'])).toEqual({ genera: ['A'], counted: 2, observations: 20, covered: 10 });
    expect(made.notChecked.has('C')).toBe(true);
    expect(made.counts.has('C')).toBe(false);
  });

  it('the chip "grown" filters the catalogue in every grouping, keeps the whole counts beside it, and is derived, not a built file', () => {
    const idx = ['Copiapoa cinerea', 'Copiapoa humilis', 'Refusia testii', 'Welwitschia mirabilis'].map((name, i) => ({ key: i + 1, slug: name.toLowerCase().replace(' ', '-'), name, family: name.startsWith('W') ? 'Welwitschiaceae' : 'Cactaceae', open: 0, origin: ['Namibia'], climate: i % 2 ? 'ok' : 'pending' }) as unknown as IndexEntry);
    expect(chipOf('grown')).toBe('grown');
    expect(chipOf('collector')).toBe('all');
    expect(CHIPS).not.toContain('grown'); // the build writes no file for it
    const set = grownGenera(idx);
    const g = catalogueOf(idx, 'genus', 'grown', set);
    expect(g.rows.map((r) => r.label)).toEqual(['Welwitschia']);
    expect(g.total).toBe(4); // "All" still counts every species
    expect(catalogueOf(idx, 'family', 'grown', set).rows.map((r) => [r.label, r.count])).toEqual([['Welwitschiaceae', 1]]);
    expect(catalogueOf(idx, 'genus', 'all').rows.map((r) => r.label)).toEqual(['Copiapoa', 'Refusia', 'Welwitschia']);
    expect(rowItemsUnder(idx, 'genus', 'grown', 'welwitschia')!.map((c: Item) => c.name)).toEqual(['Welwitschia mirabilis']);
    expect(rowItemsUnder(idx, 'genus', 'grown', 'copiapoa')).toBeUndefined();
    expect(rowItems(idx, 'genus', 'grown', 'welwitschia')).toBeUndefined(); // no set given, nothing shown under the chip
  });

  it('/about/how says the source, the day and the rule, true of the code and the file', () => {
    expect(SHARE).toBe(0.5);
    // Round eighty-four: the rule in a list of short sentences, each read here.
    expect(about).toContain("The front page's catalogue is the same on every device: every genus and every species.");
    expect(about).toContain('Its chip "Popular genera", off until chosen, narrows it to the popular genera. These are the fewest genera that, taken from the most observed down, hold half of iNaturalist\'s observations of plants marked captive or cultivated, across the reference\'s genera that were counted.');
    expect(about).toContain('It is a measure of genera, not of species or of growers. Each genus is counted with every taxon under it.');
    // Round eighty (review-w 1): the count is the full list's, and the page says over which genera it was made.
    // Asked with the live index's names and the species list's (scripts/species-list.txt), whose genera differ by a few.
    const [, genera, nCounted] = /^index\t\d+ species in (\d+) genera; (\d+) counted/m.exec(text)!;
    const n = (x: string) => Number(x).toLocaleString('en-GB');
    expect(about).toContain(`The count was made on ${longDay(m.day)}, over the ${n(genera)} genera the reference and its species list then held; ${n(nCounted)} of them were counted. <code>scripts/most-grown-genera.txt</code> holds every count, the query and iNaturalist's terms.`);
    expect(about).toContain('or one whose count did not answer, is not counted and is not under the chip, and nor is a genus that joins the reference after the count, until it is made again.');
    expect(about).toContain('The rows under "Popular genera" are worked out by the server from the genus rows\' files and the counts\' file, once for each reference.'); // round seventy-six: no longer from the index
    expect(about).not.toMatch(/On a phone the front page's catalogue opens|opens on the most-grown|opens on the genera of that list/);
    // The examples it names are refused in the file, as old names iNaturalist holds only inactive.
    expect(about).toContain('One it holds only as an old name, such as Callistemon or Mahonia');
    for (const g of ['Callistemon', 'Mahonia']) expect(m.refused.get(g)).toMatch(/only as an inactive taxon/);
    // The derivation still names the collector genera: true until the corpus is rebuilt.
    expect(about).toContain('of 173 collector genera');
  });

  it('the collector genera and the phone-only view are gone: the same rows on every device, "Most grown" a chip like the others', () => {
    const server = readFileSync('src/routes/+page.server.ts', 'utf8');
    const page = readFileSync('src/routes/+page.svelte', 'utf8');
    expect(server).not.toMatch(/collector|whole-genera|specialist-genera|opening/);
    expect(page).not.toMatch(/Collector genera|collector genera|data\.collector|data\.opening|cgonly|phoneonly"|wideonly=\{!!data/);
    expect(page).toContain('href="?by={data.by}&chip=grown"');
    expect(page).toContain('>Popular genera<span class="sep0">'); // "Most grown" until round eighty-two (the second review's 3)
    expect(readFileSync('src/routes/species/[slug]/+page.server.ts', 'utf8')).toContain("import { WHOLE_GENERA } from '$lib/ui/ref/whole-genera';");
  });
});
