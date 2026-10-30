/**
 * Round eighty, agent A: the duplicate pages. The owner decided "each into the page under Kew's accepted name": Ceropegia
 * cereiformis (g9574874) and Ceropegia nubica (g9592399) into Echidnopsis cereiformis (k505095, which has no GBIF key), and
 * Echeveria peacockii (g7530398) into Dudleya pulverulenta (k2778991). A merge could join only a GBIF key, and one the extra
 * keys' rule gave no line (Echeveria peacockii: GBIF's author "Croucher", Kew's "Croucher ex T.Moore & Mast.") was never
 * read by its kept page, so `--prune-followed` waited for ever (agent X's need). Now a merge may join a page by its id, the
 * build reads every merge's key on the page it joins whatever the rule makes of it (`mergeKeys`), with the keys Kew holds as
 * other plants left out (`except:`), and the leaving page goes once the kept page records it. FAILED on r80f: the
 * k505095 lines were not read, no `mergeKeys`, and no line for 7530398.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMerges, mergeKeys, mergedToPrune, mergeTarget, extraWhy, type ExtraKey } from '../../src/lib/dossier/extra-keys';
import { pageIds } from '../../src/lib/dossier/page-ids';
import { slugify } from '../../src/lib/core/names';

const merges = parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8'));

describe('the owner\'s merges of the duplicate pages', () => {
  it('scripts/merged-pages.txt joins the two Ceropegias to k505095, each with what is left out', () => {
    expect(merges.find((m) => m.from === 9574874)).toMatchObject({ into: 0, intoPage: 'k505095', name: 'Ceropegia cereiformis' });
    expect(merges.find((m) => m.from === 9592399)).toMatchObject({ intoPage: 'k505095', except: [3577721] });
    // Echeveria peacockii: re-pointed in round eighty-two (tests/unit/r82f-peacockii.test.ts).
  });
  it('a merge the rule gave no line is read by the page it joins, and one it gave a line is not given two', () => {
    const have: ExtraKey[] = [{ page: 0, pageId: 'k505095', key: 9574874, label: 'Ceropegia cereiformis (Hook.fil.) Bruyns', status: 'ACCEPTED', kew: '525085', kewLabel: 'x', how: 'filed' }];
    const lines = mergeKeys(merges, have, slugify);
    const peacockii = lines.find((k) => k.key === 7530398)!;
    expect(peacockii).toMatchObject({ page: 0, pageId: 'k2781125', how: 'merged', merged: 'echeveria-peacockii', except: [5690759] });
    expect(lines.find((k) => k.key === 9592399)).toMatchObject({ page: 0, pageId: 'k505095', merged: 'ceropegia-nubica', except: [3577721] });
    expect(lines.some((k) => k.key === 9574874)).toBe(false);
    expect(extraWhy(peacockii)).toBe('the key of a page merged into this one'); // round eighty-four: no repository path on a page (A6e)
  });
  it('--prune-followed finds a kept page without a GBIF key by its id', () => {
    const pages = [
      { key: 9574874, id: 'g9574874' },
      { key: 9592399, id: 'g9592399' },
      { key: null, id: 'k505095', occurrences: { keys: [{ key: 9574874, slug: 'ceropegia-cereiformis' }] } }
    ];
    const m = mergedToPrune(pages, merges);
    expect(m.prune).toEqual([9574874]);
    expect(m.waiting).toEqual(['Ceropegia nubica [9592399] into k505095']);
  });
  it('the page left keeps its GBIF id, and the page joined takes its Kew id', () => {
    const ids = pageIds([{ gbif: 9574874, entry: '505095' }, { entry: '505095' }, { gbif: 9592399, entry: '505095' }], merges);
    expect(ids.map((a) => [a.id, a.why])).toEqual([['g9574874', 'merged-away'], ['k505095', 'kew'], ['g9592399', 'merged-away']]);
  });
});
