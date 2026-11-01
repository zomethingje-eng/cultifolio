/**
 * The about pages' search examples, tested against the reference they describe (round eighty-five; the reviews' S4, A21).
 *
 * /about/how and /about/formats quote what the search answers ("snake plant" is Dracaena trifasciata), each example marked
 * in the page's source: `<span class="ex" data-q="snake plant" data-order="Dracaena trifasciata" data-first>`. A unit
 * test runs every marked example through the search route. Round eighty-four ran them over a fixture of the index of
 * 29 October 2026, which the walk of 30 and 31 October made stale: the test passed while the live site answered otherwise.
 *
 * This script makes that fixture again from an index, the one the build has just written (`--index` calls it) or one
 * named on the command line, so the examples are tested against the reference that goes live with it:
 *
 *   npx tsx scripts/about-examples.ts <index.json>          (writes tests/unit/fixtures/about-search-examples.json)
 *   npx tsx scripts/about-examples.ts <index.json> --check  (writes nothing; says which examples the index answers otherwise)
 *
 * The fixture holds, for each example, every entry the whole index ranks at or above the furthest name the example
 * names, and twenty more, so the search over the fixture puts them in the order the whole index does. Beside it the script
 * writes the index's three counts and its day (`src/lib/ui/about-counts-on.json`), which /about/how's prerendered text
 * says, as of that day, until `/api/counts` answers.
 *
 * The answer here is the search route's for an index with no search files: the query as written, then its retry on its
 * first two words, then its shorter readings (`$core/search`). The unit test asks the route itself.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, search, relaxedQuery, shorterReadings, type Prepared } from '../src/lib/core/search';
import type { IndexEntry } from '../src/lib/dossier/index-entry';
import { genusOf } from '../src/lib/core/names';
import { writeAtomic } from './write-atomic';

export interface Example { page: 'how' | 'formats'; q: string; order: string[]; first: boolean; said: string }
export interface ExamplesFixture {
  /** The day the index was read (YYYY-MM-DD, UTC), and its three counts, as `/api/counts` gives them. */
  made: string;
  counts: { species: number; genera: number; withClimate: number; gPages: number };
  /** Every query the pages marked when the fixture was made: an example added since is said as not in it. */
  queries: string[];
  entries: IndexEntry[];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PAGES = { how: 'src/routes/about/how/+page.svelte', formats: 'src/routes/about/formats/+page.svelte' } as const;
export const FIXTURE = 'tests/unit/fixtures/about-search-examples.json';
/** The counts the about page's prerendered text says, as of the day the index was read, until `/api/counts` answers. */
export const COUNTS_FILE = 'src/lib/ui/about-counts-on.json';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 2026-10-31 as the pages write a day: 31 October 2026. */
export const dayWords = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const EX = /<span class="ex" data-q="([^"]+)" data-order="([^"]+)"( data-first)?>([^<]*)<\/span>/g;
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** The examples a page's source marks, in the order it gives them. */
export function examplesIn(page: Example['page'], source: string): Example[] {
  return [...source.matchAll(EX)].map((m) => ({ page, q: unescape(m[1]), order: unescape(m[2]).split(' | '), first: !!m[3], said: unescape(m[4]) }));
}
export function allExamples(root = ROOT): Example[] {
  return (Object.keys(PAGES) as Example['page'][]).flatMap((p) => examplesIn(p, readFileSync(join(root, PAGES[p]), 'utf8')));
}

/** A name of the example's order found in a list of hits: a name of two words or more is that species, one word a genus (its first species). */
export const placeOf = (hits: readonly string[], n: string) => hits.findIndex((h) => (n.includes(' ') ? h === n : h.split(' ')[0] === n));

/** What the search route answers an index with no search files: as written, then the retry, then the shorter readings. */
export function answer<T extends IndexEntry>(prepared: Prepared<T>[], q: string): T[] {
  const first = search(prepared, q);
  if (first.length) return first;
  const relaxed = relaxedQuery(q);
  if (relaxed) {
    const again = search(prepared, relaxed);
    if (again.length) return again;
  }
  for (const r of shorterReadings(q)) {
    const s = search(prepared, r);
    if (s.length) return s;
  }
  return [];
}

/** Why the answer is not what the example says, or null when it is. */
export function wrongness(e: Example, hits: readonly string[]): string | null {
  const places = e.order.map((n) => placeOf(hits, n));
  if (places.some((x) => x < 0)) return `${e.order.filter((_, i) => places[i] < 0).join(', ')} not answered (${hits.slice(0, 5).join(', ')})`;
  if (places.some((x, i) => i > 0 && x < places[i - 1])) return `not in the order ${e.order.join(' > ')} (${hits.slice(0, 8).join(', ')})`;
  if (e.first && places[0] !== 0) return `${e.order[0]} is not first (${hits.slice(0, 5).join(', ')})`;
  return null;
}

/** The fixture for these examples from a whole index, and the examples the index answers otherwise than the page says. */
export function makeFixture(index: IndexEntry[], examples: Example[], made: string): { fixture: ExamplesFixture; wrong: string[] } {
  const prepared = prepare(index);
  const keep = new Set<IndexEntry>();
  const wrong: string[] = [];
  for (const e of examples) {
    const hits = answer(prepared, e.q);
    const names = hits.map((h) => h.name);
    const why = wrongness(e, names);
    if (why) wrong.push(`/about/${e.page} "${e.q}": ${why}`);
    const deepest = Math.max(0, ...e.order.map((n) => placeOf(names, n)));
    for (const h of hits.slice(0, deepest + 21)) keep.add(h);
  }
  // Counted as the catalogue's genus rows count them (`/api/counts`): a hybrid genus's sign is no genus.
  const genera = new Set(index.map((x) => genusOf(x.name)));
  const fixture: ExamplesFixture = {
    made,
    counts: { species: index.length, genera: genera.size, withClimate: index.filter((x) => x.climate === 'ok').length, gPages: index.filter((x) => x.key.startsWith('g')).length },
    queries: [...new Set(examples.map((e) => e.q))],
    // What the search reads of an entry, and its name: the tile's photograph, its credit, the nearest climates and the
    // day it changed are no part of an answer's order.
    entries: index.filter((x) => keep.has(x)).map(({ thumb: _t, credit: _c, near: _n, changed: _d, ...rest }) => rest as IndexEntry)
  };
  return { fixture, wrong };
}

/** The fixture as written: one entry a line, so a new index's change to it reads as a short diff. */
export const fixtureText = (f: ExamplesFixture) =>
  `{"made":${JSON.stringify(f.made)},"counts":${JSON.stringify(f.counts)},\n"queries":${JSON.stringify(f.queries)},\n"entries":[\n${f.entries.map((e) => JSON.stringify(e)).join(',\n')}\n]}\n`;

/**
 * Called by the build's `--index` once the index is written: the fixture made again from it, and the examples it answers
 * otherwise said, so the owner sees at once which sentence of the about pages the new reference made untrue. A failure
 * here never stops the index; it is said, and the fixture is left as it was.
 */
export function writeExamplesFixture(index: IndexEntry[], root = ROOT, made = new Date().toISOString().slice(0, 10), log: (s: string) => void = console.log): string[] {
  if (!existsSync(join(root, PAGES.how)) || !existsSync(join(root, 'tests/unit/fixtures'))) {
    log(`  the about pages' search examples: no about pages under ${root}, so their fixture is not made here`);
    return [];
  }
  try {
    const { fixture, wrong } = makeFixture(index, allExamples(root), made);
    // Both or neither: each file's folder is there before either is written.
    for (const f of [FIXTURE, COUNTS_FILE]) if (!existsSync(dirname(join(root, f)))) throw new Error(`no folder for ${f}`);
    writeAtomic(join(root, FIXTURE), fixtureText(fixture));
    writeAtomic(join(root, COUNTS_FILE), JSON.stringify({ ...fixture.counts, on: dayWords(made) }) + '\n');
    log(`  the about pages' search examples: ${fixture.queries.length} queries, ${fixture.entries.length} entries written to ${FIXTURE}, and the counts of this index (${fixture.counts.species} species) to ${COUNTS_FILE}`);
    for (const w of wrong) log(`  NOT TRUE of this index: ${w}`);
    if (wrong.length) log(`  ${wrong.length} example${wrong.length === 1 ? '' : 's'} of the about pages ${wrong.length === 1 ? 'needs' : 'need'} rewording before the next deploy; the unit test r85a-about fails until then`);
    return wrong;
  } catch (e) {
    log(`  the about pages' search examples were not tested against this index (${String((e as Error).message).split('\n')[0]}); the fixture and the counts are left as they were`);
    return [];
  }
}

/** Run as a command, not imported by the build (Windows compares paths without regard to case). */
const same = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(fileURLToPath(import.meta.url), resolve(process.argv[1]))) {
  const [path, ...flags] = process.argv.slice(2);
  if (!path || !existsSync(path)) {
    console.error('usage: npx tsx scripts/about-examples.ts <index.json> [--check]');
    process.exit(2);
  }
  const index = JSON.parse(readFileSync(path, 'utf8')) as IndexEntry[];
  if (flags.includes('--check')) {
    const { fixture, wrong } = makeFixture(index, allExamples(), new Date().toISOString().slice(0, 10));
    console.log(`${fixture.queries.length} queries, ${fixture.entries.length} entries; counts ${JSON.stringify(fixture.counts)}`);
    for (const w of wrong) console.log(`NOT TRUE: ${w}`);
    process.exit(wrong.length ? 1 : 0);
  }
  const wrong = writeExamplesFixture(index);
  process.exit(wrong.length ? 1 : 0);
}
