/**
 * Round ninety-five, 2 (docs/PLAN-95.md): the names GBIF files under a key merged into a page are judged as the merge is.
 * Round ninety-four held its line for Ceropegia nubica (9592399) on k505095, Echidnopsis cereiformis: the rule's own line
 * listed Echidnopsis nubica (3577904), Kew's 505128, as not read, because the type rule judged it heterotypic to the
 * entry, though the merged key itself is read whatever its type (round seventy-eight) and Echidnopsis nubica is of its type.
 * `mergedExcept`, for a merge the rule gives no line, leaves out only another plant's names (Echidnopsis uraiqatiana,
 * 3577721, which Kew accepts) and pro parte synonyms. Now `extraKeysFor` judges a merged key's names as `mergedExcept`
 * does. The rows and usages below are the case's shape, cut to what the rule reads (authors stand in for Kew's).
 *
 * The merge's own `except:` (scripts/merged-pages.txt) is joined to any line of its key (`withMergeExcept`, PLAN-95 3): the
 * export does not file Echidnopsis uraiqatiana under 9592399, GBIF's API does, and a list line takes the place of the line
 * the build makes from the merge, so a list line made without it read what the owner left out.
 *
 * On 7b73054: the merged key's except was [3577721, 3577904], not [3577721]: FAILED; withMergeExcept did not exist:
 * FAILED. The guard (a key not merged is judged by the type rule, and refused) passed before and after.
 */
import { describe, it, expect } from 'vitest';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, mergedExcept, withMergeExcept, type Usage, type Backbone, type ExtraKey } from '$dossier/extra-keys';

const K = (id: string, name: string, authors: string, status: string, accepted: string, homotypic = false): KewRow => ({ id, name, authors, status, rank: 'Species', accepted, parent: '', powo: '', ...(homotypic ? { homotypic } : {}) });
const idx = new KewNamesIndex();
for (const r of [
  K('505095', 'Echidnopsis cereiformis', 'Hook.f.', 'Accepted', '505095'),
  // Kew holds both as heterotypic synonyms of the entry, one type between them (Echidnopsis nubica the basionym).
  K('524981', 'Ceropegia nubica', '(N.E.Br.) Bruyns', 'Synonym', '505095'),
  K('505128', 'Echidnopsis nubica', 'N.E.Br.', 'Synonym', '505095'),
  // Another plant, with a page of its own (k505156).
  K('505156', 'Echidnopsis uraiqatiana', 'Al-Gifri & Thulin', 'Accepted', '505156')
]) idx.add(r);

const U = (key: number, label: string, canonical: string, author: string, status: string, parent?: number): Usage => ({ key, parent, status, rank: 'SPECIES', canonical, author, label });
const nubica = U(9592399, 'Ceropegia nubica (N.E.Br.) Bruyns', 'Ceropegia nubica', '(N.E.Br.) Bruyns', 'ACCEPTED');
const basionym = U(3577904, 'Echidnopsis nubica N.E.Br.', 'Echidnopsis nubica', 'N.E.Br.', 'SYNONYM', 9592399);
const other = U(3577721, 'Echidnopsis uraiqatiana Al-Gifri & Thulin', 'Echidnopsis uraiqatiana', 'Al-Gifri & Thulin', 'SYNONYM', 9592399);
const all = [nubica, basionym, other];
const byKey = new Map(all.map((u) => [u.key, u]));
const bb: Backbone = {
  usagesOf: (w) => all.filter((u) => u.canonical.toLowerCase() === w),
  usage: (k) => byKey.get(k),
  lineage: (k) => { const u = byKey.get(k); return u?.parent ? [k, u.parent] : [k]; },
  under: (k) => all.filter((u) => u.parent === k)
};
const page = { key: null, entry: '505095', id: 'k505095' };
const reference = new Set<number>([1, 2]);
const holders = new Map<number, number[]>();

describe('r95b: a merged key\'s names', () => {
  it('Ceropegia nubica merged into Echidnopsis cereiformis reads its basionym; another plant\'s name stays left out', () => {
    const r = extraKeysFor(page, idx, bb, reference, holders, new Map([[9592399, 'ceropegia-nubica']]), new Map([[9592399, 'k505095']]));
    expect(r.keys).toEqual([expect.objectContaining({ pageId: 'k505095', key: 9592399, merged: 'ceropegia-nubica', except: [3577721] })]);
    // The basionym is not a key of its own: it is refused by the type rule on its own, and read inside the merged key.
    expect(r.keys.map((k) => k.key)).not.toContain(3577904);
  });
  it('the rule\'s line and mergedExcept leave out the same', () => {
    const r = extraKeysFor(page, idx, bb, reference, holders, new Map([[9592399, 'ceropegia-nubica']]), new Map([[9592399, 'k505095']]));
    expect(r.keys[0].except).toEqual(mergedExcept(9592399, '505095', idx, bb));
  });
  it('a key not merged is judged by the type rule, and a heterotypic one refused (guard)', () => {
    const r = extraKeysFor(page, idx, bb, reference, holders);
    expect(r.keys).toEqual([]);
    expect(r.refused).toEqual(expect.arrayContaining([expect.objectContaining({ key: 9592399, why: expect.stringMatching(/^heterotypic/) })]));
  });
  it("a list line for a merged key takes the merge's own exceptions; another page's line or key is left as it is", () => {
    const line: ExtraKey = { page: 0, pageId: 'k505095', key: 9592399, label: 'Ceropegia nubica', status: 'ACCEPTED', kew: '524981', kewLabel: 'x', how: 'filed', merged: 'ceropegia-nubica' };
    const merges = [{ from: 9592399, into: 0, intoPage: 'k505095', name: 'Ceropegia nubica', except: [3577721] }];
    expect(withMergeExcept([line], merges)[0].except).toEqual([3577721]);
    expect(withMergeExcept([{ ...line, except: [5] }], merges)[0].except).toEqual([5, 3577721]);
    expect(withMergeExcept([{ ...line, pageId: 'k1' }], merges)[0].except).toBeUndefined();
    expect(withMergeExcept([{ ...line, key: 1 }], merges)[0].except).toBeUndefined();
  });
});
