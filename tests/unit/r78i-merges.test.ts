/**
 * Round seventy-eight (I): the owner merges the seven pairs of pages that held one Kew entry (ids-gbif.txt), the page under
 * Kew's accepted name kept. The merges are listed for round seventy-nine's full build (scripts/merged-pages-79.txt), which
 * derives every page again; no build reads them before then, so this round's corpus is the pages as they were. Six of the
 * seven are Kew's heterotypic synonyms of the entry, which round seventy-three's rule refuses as another page's key: the
 * owner's merge is that claim made, so the key of a page merged into this one is now read whatever its type. Kew's rows
 * below are the real ones (wcvp_names.csv of 2026-06-04). Each case FAILED on the base unless marked a guard (no list, no
 * page ids, and a merged heterotypic key refused); scripts/dev/scale/results/r78i-merges.txt runs the nine merges on the
 * real dossiers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, parseMerges, mergedToPrune, type Usage, type Backbone } from '$dossier/extra-keys';
import { pageIds } from '$dossier/page-ids';
import { slugify } from '$core/names';

const PENDING = parseMerges(readFileSync('scripts/merged-pages-79.txt', 'utf8'));
/** Each pair: the page that leaves, the page kept (Kew's accepted name), Kew's entry. */
const PAIRS: Array<[number, string, number, string, string]> = [
  [7530398, 'Echeveria peacockii', 2985894, 'Dudleya pulverulenta', '2778991'],
  [3947359, 'Weingartia pulchra', 3948341, 'Weingartia canigueralii', '2465834'],
  [3190985, 'Drosera parvula', 3190812, 'Drosera paleacea', '64497'],
  [9592399, 'Ceropegia nubica', 9574874, 'Ceropegia cereiformis', '505095'],
  [3574291, 'Ceropegia melanops', 3574112, 'Ceropegia nigra', '502875'],
  [3959296, 'Copiapoa boliviana', 7284393, 'Copiapoa calderana', '2735922'],
  [7334118, 'Echeveria sessiliflora', 4199517, 'Echeveria pinetorum', '2781299']
];

describe('the seven merges, listed for round seventy-nine', () => {
  it('scripts/merged-pages-79.txt names each pair, the page under Kew\'s accepted name kept', () => {
    expect(PENDING.map((m) => [m.from, m.name, m.into])).toEqual(PAIRS.map(([from, name, into]) => [from, name, into]));
  });
  it('no build reads them this round: merged-pages.txt holds round seventy-three\'s two only, and the builder reads that file alone (guard)', () => {
    expect(parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8')).map((m) => m.from)).toEqual([3084426, 7906297]);
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(src).toContain("const MERGES = 'scripts/merged-pages.txt';");
    expect(src).not.toContain('merged-pages-79');
  });
  it('the ids: without the merges both pages of a pair keep their GBIF key; with them the kept page takes the entry\'s Kew id', () => {
    const pages = PAIRS.flatMap(([from, , into, , entry]) => [{ gbif: from, entry }, { gbif: into, entry }]);
    expect(pageIds(pages, []).map((a) => a.id)).toEqual(PAIRS.flatMap(([from, , into]) => [`g${from}`, `g${into}`]));
    expect(pageIds(pages, PENDING).map((a) => a.id)).toEqual(PAIRS.flatMap(([from, , into, , entry]) => [`g${from}`, `k${entry}`]));
  });
  it('the prune waits for each kept page to read the key with its old address, then takes the page that leaves', () => {
    const before = PAIRS.flatMap(([from, , into]) => [{ key: from }, { key: into }]);
    expect(mergedToPrune(before, PENDING)).toEqual({ prune: [], waiting: PAIRS.map(([from, name, into]) => `${name} [${from}] into ${into}`) });
    const after = PAIRS.flatMap(([from, name, into]) => [{ key: from }, { key: into, occurrences: { keys: [{ key: from, slug: slugify(name) }] } }]);
    expect(mergedToPrune(after, PENDING)).toEqual({ prune: PAIRS.map(([from]) => from), waiting: [] });
  });
});

describe('the key of a page merged here is read whatever its type', () => {
  const K = (id: string, name: string, authors: string, status: string, accepted: string, homotypic = false): KewRow => ({ id, name, authors, status, rank: 'Species', accepted, parent: '', powo: '', ...(homotypic ? { homotypic } : {}) });
  const idx = new KewNamesIndex();
  for (const r of [
    K('502875', 'Ceropegia nigra', 'N.E.Br.', 'Accepted', '502875'),
    K('502840', 'Ceropegia melanops', 'H.Huber', 'Synonym', '502875'),
    K('505095', 'Echidnopsis cereiformis', 'Hook.f.', 'Accepted', '505095'),
    K('525085', 'Ceropegia cereiformis', '(Hook.f.) Bruyns', 'Synonym', '505095', true),
    K('524981', 'Ceropegia nubica', '(N.E.Br.) Bruyns', 'Synonym', '505095'),
    K('505128', 'Echidnopsis nubica', 'N.E.Br.', 'Synonym', '505095')
  ]) idx.add(r);
  const U = (key: number, canonical: string, author: string): Usage => ({ key, parent: 1, status: 'ACCEPTED', rank: 'SPECIES', canonical, author, label: `${canonical} ${author}` });
  const usages = [U(3574112, 'Ceropegia nigra', 'N.E.Br.'), U(3574291, 'Ceropegia melanops', 'H.Huber'), U(9574874, 'Ceropegia cereiformis', '(Hook.f.) Bruyns'), U(9592399, 'Ceropegia nubica', '(N.E.Br.) Bruyns')];
  const bb: Backbone = { usagesOf: (w) => usages.filter((u) => u.canonical.toLowerCase() === w), usage: (k) => usages.find((u) => u.key === k), lineage: (k) => [k], under: () => [] };
  const all = new Set(usages.map((u) => u.key));
  const kept = new Set([3574112, 9574874]);
  const merged = new Map([[3574291, 'ceropegia-melanops'], [9592399, 'ceropegia-nubica']]);
  const into = new Map([[3574291, 3574112], [9592399, 9574874]]);
  const run = (key: number, entry: string, ref: Set<number>, m = merged, i = into) => extraKeysFor({ key, entry }, idx, bb, ref, new Map(), m, i);
  it('Ceropegia melanops on Ceropegia nigra, and Ceropegia nubica on Ceropegia cereiformis (Kew\'s Echidnopsis cereiformis): read, with the old address', () => {
    expect(run(3574112, '502875', kept).keys).toEqual([expect.objectContaining({ key: 3574291, kew: '502840', merged: 'ceropegia-melanops' })]);
    expect(run(9574874, '505095', kept).keys).toEqual([expect.objectContaining({ key: 9592399, kew: '524981', merged: 'ceropegia-nubica' })]);
  });
  it('while both pages are in the reference, neither reads the other (guard)', () => {
    expect(run(3574112, '502875', all).refused).toEqual([expect.objectContaining({ key: 3574291, why: 'it is another page of this reference' })]);
  });
  it('a heterotypic synonym no merge brings here is refused as before: the type rule stands for every other key (guard)', () => {
    expect(run(3574112, '502875', kept, new Map(), new Map()).refused).toEqual([expect.objectContaining({ key: 3574291, why: expect.stringMatching(/^heterotypic: the owner's decision/) })]);
    expect(run(3574112, '502875', kept, merged, new Map([[3574291, 9574874]])).refused).toEqual([expect.objectContaining({ key: 3574291, why: expect.stringMatching(/^heterotypic/) })]);
  });
  it('--list-extra-keys passes each merge\'s kept page to the rule', () => {
    expect(readFileSync('scripts/extra-keys-list.ts', 'utf8')).toMatch(/const into = new Map\(o\.merges\.map\(\(m\) => \[m\.from, m\.into\]\)\);[\s\S]*extraKeysFor\([^\n]*holders, merged, into\)\)/);
  });
});
