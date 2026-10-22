#!/usr/bin/env node
/**
 * The /about/how paragraph on the species list (round seventy-nine; docs/PENDING-ABOUT-HOW-R79.md), put live with the
 * figures the build reached, never the list's alone. Plain Node, no dependencies, offline.
 *
 *   node scripts/about-how-r79.mjs                 says what it would write, from the list and the corpus on disk, and
 *                                                  changes nothing
 *   node scripts/about-how-r79.mjs --write         writes it into src/routes/about/how/+page.svelte
 *   node scripts/about-how-r79.mjs --write --why "<words>"
 *                                                  the same where the corpus holds fewer species than the list: the
 *                                                  words say why the rest are not there yet, as the build's own line says
 *
 * Every figure is read: the list's day, its collector genera, its species, the species that are here only because they
 * were in the reference and those with no Kew id, and the genebanks' records, from the header of
 * `scripts/species-list.txt`; how many of the list's species the reference holds, and of them how many Aloe and
 * Euphorbia, from `static/s/v<N>/index.json` (a species is held when a page has its Kew id, `k<plant_name_id>`, or, for a
 * line with no Kew id, its GBIF key). Kew's own totals for the two genera (611 and 2,118 accepted species, nothospecies
 * among them, as the list counts its own) are of wcvp_names.csv of 2026-06-04: the script refuses a list read from
 * another day of Kew's file, since those totals would then be another file's.
 *
 * It refuses, and writes nothing, when the corpus has no index, when the index holds none of the list's species, when the
 * reference holds fewer species than the list and no `--why` is given, when a header line it reads is missing, or when
 * the page no longer holds the paragraph it replaces.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGE = 'src/routes/about/how/+page.svelte';
export const LIST = 'scripts/species-list.txt';
/** The day of Kew's file whose totals the paragraph gives (`KEW_TOTALS`). */
export const KEW_DAY = '2026-06-04';
/** Kew's accepted species of the two genera the paragraph names, in wcvp_names.csv of KEW_DAY (rank Species, status Accepted, nothospecies counted). */
export const KEW_TOTALS = { Aloe: 611, Euphorbia: 2118 };
/** The paragraph's first words, and the words that end the part it replaces (the "Most grown" part after them stays). */
export const FROM = '<p>The species list was derived, not chosen by hand';
export const TO = ' So a species that is not here is not a statement about the species, only about the list, and the list can be extended by rebuilding with more names (the README says how).';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const n = (x) => x.toLocaleString('en-GB');
const num = (s) => Number(s.replace(/,/g, ''));

/**
 * What the header of the list says, each figure by its own line; throws naming the line it could not read.
 * @param {string} text
 */
export function readHeader(text) {
  const h = text.split(/\r?\n/).filter((l) => l.startsWith('#')).join('\n');
  const need = (re, what) => { const m = re.exec(h); if (!m) throw new Error(`${LIST}: no ${what} in its header`); return m; };
  return {
    written: need(/Written by scripts\/select-species\.ts on (\d{4}-\d{2}-\d{2})/, 'day it was written')[1],
    genera: num(need(/accepted species of the ([\d,]+) collector genera/, 'count of collector genera')[1]),
    selected: num(need(/# Selected: ([\d,]+) species/, '"Selected:" line')[1]),
    alone: num(need(/([\d,]+) only because they are already in the reference \(([\d,]+) of them with no Kew id\)/, 'species there only because they were in the reference')[1]),
    unplaced: num(need(/only because they are already in the reference \(([\d,]+) of them with no Kew id\)/, 'species with no Kew id')[1]),
    genebank: num(need(/excluded: [\d,]+, ([\d,]+)/, 'records of the excluded datasets')[1]),
    kewDay: need(/wcvp_names\.csv of (\d{4}-\d{2}-\d{2})/, "day of Kew's file")[1]
  };
}

/**
 * The list's species: each line's Kew id ('-' for none), name and GBIF key (null for none).
 * @param {string} text
 * @returns {Array<{ kew: string, name: string, gbif: number | null }>}
 */
export function readList(text) {
  return text.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => {
    const c = l.split('\t');
    return { kew: c[0], name: c[1], gbif: c[5] && c[5] !== '-' ? Number(c[5]) : null };
  });
}

/**
 * Of the list's species, those the index holds a page for.
 * @param {Array<{ kew: string, name: string, gbif: number | null }>} list
 * @param {Array<{ key?: string, gbif?: number | null }>} index
 */
export function held(list, index) {
  const keys = new Set(index.map((e) => e.key));
  const gbifs = new Set(index.map((e) => e.gbif).filter((g) => typeof g === 'number'));
  // A species with a Kew id is held by its page under that id, or, where Kew's file did not settle which taxon the page is
  // and the page keeps GBIF's key (ids-gbif.txt), by its page under that key (round eighty: the owner's build held eight
  // listed species so, Crocus nudiflorus among them, and the paragraph said they were not there).
  return list.filter((s) => (s.kew !== '-' && keys.has(`k${s.kew}`)) || (s.gbif != null && (keys.has(`g${s.gbif}`) || gbifs.has(s.gbif))));
}

/**
 * The paragraph, from the header, the list and the index; `why` is required when the reference holds fewer of the
 * list's species than the list. Returns `{ html, figures }`; throws with the reason it refuses.
 * @param {string} listText
 * @param {Array<{ key?: string, gbif?: number | null }>} index
 * @param {string} [why]
 */
export function paragraph(listText, index, why) {
  const h = readHeader(listText);
  const list = readList(listText);
  if (h.kewDay !== KEW_DAY) throw new Error(`the list was selected from Kew's file of ${h.kewDay}, and Kew's totals here are of ${KEW_DAY}: count Aloe's and Euphorbia's accepted species in that file and put them in KEW_TOTALS first`);
  if (list.length !== h.selected) throw new Error(`${LIST} has ${list.length} species lines, and its header says ${h.selected}`);
  const here = held(list, index);
  if (!here.length) throw new Error('the corpus on disk holds none of the list\'s species: it is not the build of this list');
  const missing = list.length - here.length;
  if (missing && !(why ?? '').trim()) throw new Error(`the reference holds ${n(here.length)} of the list's ${n(list.length)} species: give --why "<words>", the reason the other ${n(missing)} are not there yet, as the build says it`);
  const genus = (g) => here.filter((s) => s.name.split(' ')[0] === g).length;
  const figures = { listed: list.length, held: here.length, missing, index: index.length, aloe: genus('Aloe'), euphorbia: genus('Euphorbia'), ...h };
  const heldSentence = missing ? ` The reference holds ${n(here.length)} of them; the other ${n(missing)} are not here yet: ${why.trim().replace(/\.$/, '')}.` : '';
  const millions = (h.genebank / 1e6).toFixed(1);
  const html = `<p>The species list was derived, not chosen by hand. It is the file <code>scripts/species-list.txt</code> in the source, written by <code>scripts/select-species.ts</code> on ${day(h.written)}, and it holds every species Kew's World Checklist of Vascular Plants accepts with at least three records of cultivated plants, plus every species Kew accepts of ${n(h.genera)} collector genera taken whole (the cacti, the mesembs, the stapeliads and caudiciforms, the winter-growing bulbs and their like, less their hybrids; the list is <code>scripts/specialist-genera.txt</code> in the source), plus every species that was already in the reference, so that no page falls out: ${n(list.length)} species.${heldSentence} Each page of the reference is the species of the Kew entry it cites, or of its name where Kew holds that name for one species alone; ${n(h.alone)} species are here for that reason alone, and ${n(h.unplaced)} pages whose names Kew's checklist does not place stay as they were, under their own names and GBIF's keys. The records are iNaturalist's observations marked captive or cultivated and GBIF's living-specimen records from living collections, counted together. GBIF's are counted only from datasets that a stated rule on each dataset's own description finds to be living collections: a dataset whose title, keywords, publisher or description names a genebank (a genebank, germplasm, a seed bank or seed collection, plant genetic resources or passport data, in the words of FAO's genebank standards) is left out; one whose title, keywords or publisher names a botanic garden, an arboretum, a garden or a living collection is counted; and any other, such as a register of street trees or a field survey, is not counted. The three lists are <code>scripts/counted-datasets.txt</code>, <code>scripts/excluded-datasets.txt</code> and <code>scripts/undecided-datasets.txt</code>. So the genebanks' ${millions} million records, most of them wheat, rice, barley and the other crops, count for nothing, and a crop is here by its growers' own records. No family is left out. Each name is matched to a species Kew accepts only where the match is unambiguous: every name of Kew's of those words leads to the same species; or GBIF's name and author lead to one; or, for iNaturalist, whose names of vascular plants follow Kew's Plants of the World Online, Kew accepts exactly one species of those words. iNaturalist lists where its names depart from Kew's, but that list could not be read, so those departures are not applied. Every name refused, and why, is in <code>scripts/species-refused.txt</code>, and each species' line in the list says why it is there: its two counts, or its collector genus. The very large genera are not taken whole, and their species are here by their own records: Aloe has ${n(figures.aloe)} of the ${n(KEW_TOTALS.Aloe)} species Kew accepts, Euphorbia ${n(figures.euphorbia)} of ${n(KEW_TOTALS.Euphorbia)}. So a species that is not here is not a statement about the species, only about the list.</p>`;
  return { html, figures };
}

/**
 * The page with the paragraph's list part replaced, and the "Most grown" part kept as a paragraph of its own; throws when the page no longer holds it.
 * @param {string} page
 * @param {string} html
 */
export function applyTo(page, html) {
  const a = page.indexOf(FROM);
  if (a < 0) throw new Error(`${PAGE} holds no paragraph beginning "${FROM.slice(3)}"`);
  const b = page.indexOf(TO, a);
  const end = page.indexOf('</p>', a);
  if (b < 0 || b > end) throw new Error(`${PAGE}: the paragraph no longer ends its list part with "${TO.trim()}": it was changed since round seventy-eight; apply the text by hand`);
  // The list's paragraph is a paragraph of its own; the part kept ("The front page's catalogue …") opens the next.
  return page.slice(0, a) + html + '\n  <p>' + page.slice(b + TO.length).replace(/^ /, '');
}

/**
 * @param {string[]} argv
 * @param {string} [root]
 * @param {(s: string) => void} [say]
 */
export function run(argv, root = '.', say = (s) => { process.stdout.write(s); }) {
  const write = argv.includes('--write');
  const w = argv.indexOf('--why');
  const why = w >= 0 ? argv[w + 1] : undefined;
  const version = Number(/export const DOSSIER_V = (\d+) as const/.exec(readFileSync(join(root, 'src/lib/dossier/schema.ts'), 'utf8'))?.[1]);
  const indexPath = join(root, `static/s/v${version}/index.json`);
  if (!existsSync(indexPath)) { say(`about-how: no ${indexPath}: build the corpus first; nothing written.\n`); return 2; }
  let r, page;
  try {
    r = paragraph(readFileSync(join(root, LIST), 'utf8'), JSON.parse(readFileSync(indexPath, 'utf8')), why);
    page = applyTo(readFileSync(join(root, PAGE), 'utf8'), r.html);
  } catch (e) { say(`about-how: ${e.message}; nothing written.\n`); return 2; }
  const f = r.figures;
  say(`about-how: the list holds ${n(f.listed)} species; the reference (${indexPath}, ${n(f.index)} pages) holds ${n(f.held)} of them${f.missing ? `, ${n(f.missing)} not` : ', every one'}; Aloe ${f.aloe} of ${KEW_TOTALS.Aloe}, Euphorbia ${f.euphorbia} of ${KEW_TOTALS.Euphorbia}.\n`);
  if (!write) { say(`${r.html}\n\nNothing written: run again with --write to put it in ${PAGE}.\n`); return 0; }
  writeFileSync(join(root, PAGE), page);
  say(`  written into ${PAGE}.\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = run(process.argv.slice(2));
