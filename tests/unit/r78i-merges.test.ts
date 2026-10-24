/**
 * Round seventy-eight (I): the owner merges the seven pairs of pages that held one Kew entry (ids-gbif.txt), the page under
 * Kew's accepted name kept. Listed in round seventy-eight for round seventy-nine's full build, which derives every page
 * again; round seventy-nine's first change moved them into scripts/merged-pages.txt, which the builder reads. Six of the
 * seven are Kew's heterotypic synonyms of the entry, which round seventy-three's rule refuses as another page's key: the
 * owner's merge is that claim made, so the key of a page merged into this one is now read whatever its type. Kew's rows
 * below are the real ones (wcvp_names.csv of 2026-06-04). Each case FAILED on the base unless marked a guard (no list, no
 * page ids, and a merged heterotypic key refused); scripts/dev/scale/results/r78i-merges.txt runs the nine merges on the
 * real dossiers.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, parseMerges, mergedToPrune, type Usage, type Backbone } from '$dossier/extra-keys';
import { pageIds } from '$dossier/page-ids';
import { slugify } from '$core/names';

// Round seventy-nine (D): its first change moved the seven lines into scripts/merged-pages.txt, after round seventy-three's two.
const ALL = parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8'));
// Round eighty (A): Ceropegia nubica now joins Echidnopsis cereiformis (k505095, no GBIF key), with Ceropegia cereiformis,
// by the owner's decision; the pairs between GBIF keys are the other six. Round eighty-two (F): Echeveria peacockii now
// joins Echeveria desmetiana (k2781125, no GBIF key), by the owner's decision on review 1's 4; the pairs between GBIF keys
// are the other five. At the merge of round eighty-two (M), Bisnaga hamatacantha joins Ferocactus hamatacanthus
// (k2808164, no GBIF key), by the owner's decision of 2026-10-23.
const PENDING = ALL.slice(2).filter((m) => !m.intoPage);
/** Each pair: the page that leaves, the page kept (Kew's accepted name), Kew's entry. */
const PAIRS: Array<[number, string, number, string, string]> = [
  [3947359, 'Weingartia pulchra', 3948341, 'Weingartia canigueralii', '2465834'],
  [3190985, 'Drosera parvula', 3190812, 'Drosera paleacea', '64497'],
  [3574291, 'Ceropegia melanops', 3574112, 'Ceropegia nigra', '502875'],
  [3959296, 'Copiapoa boliviana', 7284393, 'Copiapoa calderana', '2735922'],
  [7334118, 'Echeveria sessiliflora', 4199517, 'Echeveria pinetorum', '2781299']
];

describe('the seven merges, applied from round seventy-nine', () => {
  it('scripts/merged-pages.txt names each pair after round seventy-three\'s two, the page under Kew\'s accepted name kept', () => {
    expect(ALL.slice(0, 2).map((m) => m.from)).toEqual([3084426, 7906297]);
    expect(PENDING.map((m) => [m.from, m.name, m.into])).toEqual(PAIRS.map(([from, name, into]) => [from, name, into]));
    expect(ALL.filter((m) => m.intoPage).map((m) => [m.from, m.intoPage])).toEqual([[7530398, 'k2781125'], [9592399, 'k505095'], [9574874, 'k505095'], [7281739, 'k2808164']]);
  });
  it('the builder reads that one file, and merged-pages-79.txt is gone (round seventy-nine D; failed on r79base, where the file held two)', () => {
    expect(existsSync('scripts/merged-pages-79.txt')).toBe(false);
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
    // Round eighty (A): the page joined by its GBIF key, or by its id where it has none (`mergeTarget`).
    expect(readFileSync('scripts/extra-keys-list.ts', 'utf8')).toMatch(/const into = new Map\(o\.merges\.map\(\(m\) => \[m\.from, mergeTarget\(m\)\]\)\);[\s\S]*extraKeysFor\([^\n]*holders, merged, into\)\)/);
  });
});
